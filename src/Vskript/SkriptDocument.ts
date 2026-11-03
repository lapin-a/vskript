import { Position, Range } from "vscode";
import { SkriptComponent, SkriptToolTip } from "./SkriptComponent";
import * as Path from 'path';
import { log } from './Logger';

/** 생성자 타입 (getComponents의 클래스 인자용) */
type Class<T> = { new (...args: any[]): T };

export class SkriptPath {
	public readonly fsPath: string;
	constructor(
		public readonly root: string,
		public readonly name: string
	) {
		this.fsPath = Path.join(root, name);
	}
}

export class SkriptDocument {
	private _skPath: SkriptPath;
	private _document: string;
	private _skLines: SkriptLine[] = [];
	private _components: SkriptComponent[] = [];
	private _addons: string[] = []; // [추가]
	// 1. 버전을 저장할 프로퍼티 추가
	private _version: string | undefined;

	constructor (skPath: SkriptPath, document: string) {
		this._skPath = skPath;
		this._document = document;
		this._update();
	}
	// 2. 외부에서 버전을 읽을 수 있는 getter 추가
	public get version() { return this._version; }
	public get components() { return this._components; }
	public get skPath() { return this._skPath; }
	public lineAt(line: number): SkriptLine { return this._skLines[line]; }

	public offsetAt(position: Position): number {
		return this._skLines[position.line].offset + position.character;
	}

	public positionAt(offset: number): Position | undefined {
		for (let i=this._skLines.length-1; i>-1; i--) {
			let skLine = this._skLines[i];
			if (skLine.offset <= offset) {
				return new Position(i, offset - skLine.offset);
			}
		}
		return;
	}

	public getText(range?: Range): string {
		if (!range) {return this._document;}
		let start = this.offsetAt(range.start);
		let end = this.offsetAt(range.end);
		return this._document.substring(start, end);
	}

// 1. getRange 함수를 아래와 같이 수정 (검색 시작 위치 추가)
// fromIndex: number = 0 를 추가하여 중복 구문 검색 지원
	public getRange(text: string, fromIndex: number = 0): Range | undefined {
		let index = this._document.indexOf(text, fromIndex); // indexOf에 시작 위치 전달
		if (index < 0)
			{return;}

		let start = this.positionAt(index);
		let end = this.positionAt(index + text.length);
		if (start && end)
			{return new Range(start, end);}
		else
			{return;}
	}

	/** [추가된 함수] Position에 맞는 요소를 반환 */
	public componentOf(position: Position, options?: { isBefore?: boolean, isAfter?: boolean }): SkriptComponent | undefined {
		for (let i = 0; i < this._components.length; i++) {
			let comp = this._components[i];
			if (comp.range.contains(position)) {
				return comp;
			} else if (position.isBeforeOrEqual(comp.range.start)) {
				if (!options) {
					return;
				} else if (options.isBefore) {
					return this._components[i - 1];
				} else if (options.isAfter) {
					return comp;
				}
			}
		}
		return;
	}

	/** [추가된 함수] Position이 속하거나 가장 가까운 요소를 반환 */
	public lastComponentOf(position: Position): SkriptComponent | undefined {
		for (let i = 0; i < this._components.length; i++) {
			let comp = this._components[i];
			if (comp.range.contains(position)) {
				return comp;
			} else if (position.isBeforeOrEqual(comp.range.start)) {
				return this._components[i - 1];
			}
		}
		return;
	}

	public getComponents<T extends SkriptComponent>(clazz:Class<T>): T[] {
		let array = new Array<T>();
		for (const value of this._components) {if (value instanceof clazz) {
			array.push(value);
		}}
		return array;
	}

	public update(document:string) {
		this._document = document;
		this._update();
	}

	// [추가] 외부에서 읽을 수 있게 getter 선언
    public get addons() { return this._addons; }

	private _update() {
		this._detectVersion();
		this._detectAddons(); // [추가] 애드온 감지 실행
		this._updateSkriptLine();
		this._updateSkriptParagraph();
	}

	private _detectVersion() {
		// 첫 번째 줄을 가져와서 앞뒤 공백 제거
		const firstLine = this._document.split(/\r\n|\r|\n/)[0].trim();

		// 플러그인이 오해하지 않도록 명확한 익스텐션 전용 주석 패턴 사용
		// 예: # [V] version: 2.8 또는 # vskript-version: 2.8
		const match = firstLine.match(/^#\s*(?:\[V\]|vskript-)\s*version\s*:\s*([\d\.]+)/i);

		if (match) {
			this._version = match[1];
			log.debug(`파일 주석 버전: v${this._version}`);
		} else {
			// 파일 내 설정이 없으면 undefined (이후 기본 설정값 사용)
			this._version = undefined;
		}
	}

	private _detectAddons() {
        const lines = this._document.split(/\r\n|\r|\n/).slice(0, 10);
        for (const line of lines) {
            // # [V] addons: SkQuery, TuSKe 형태를 찾습니다.
            const match = line.match(/^#\s*(?:\[V\]|vskript-)\s*addons\s*:\s*(.*)/i);
            if (match) {
                this._addons = match[1].split(',').map(s => s.trim()).filter(s => s.length > 0);
                return;
            }
        }
        this._addons = []; // 못 찾으면 빈 배열
    }

	private _updateSkriptLine() {
		this._skLines.length = 0;
		let document = this._document;
		let offset = 0;
		let match;
		while(match = document.match(/\r\n|\r|\n|$/)) {
			let code = document.substr(0, match.index!);
			this._skLines.push(new SkriptLine(offset, code, match[0]));
			offset += code.length + match[0].length;
			document = document.substring(match.index! + match[0].length);
			if (document.length <= 0) {break;}
		}
	}

	private _updateSkriptParagraph() {
		this._components.length = 0;
		let document = this._document;

		// 덩어리 = (바로 위의 연속된 주석 줄들) + 머리 줄(글자/숫자로 시작) + 이어지는 줄들(빈 줄 또는 들여쓰기·#으로 시작).
		// 50ef177에서 이어지는 줄 규칙이 `[\t\s]+`(공백만)로 바뀌어 들여쓴 줄의 내용이 빠지고, 모든 컴포넌트가
		// 머리 줄 하나만 갖게 되었다(아웃라인 하위 항목·의미 강조·툴팁이 전부 사라짐). 원래 규칙(v0.0.9)으로 되돌린다.
		const paragraphRegex = /(?<=^|\r\n|\r|\n)(?<comment>(?:[\t ]*#.*(?:\r\n|\r|\n))*)(?<paragraph>[a-zA-Z0-9].*(?:(?:\r\n|\r|\n)(?:[^a-zA-Z0-9\r\n].*)?)*)/g;

		let match;
		while ((match = paragraphRegex.exec(document)) !== null) {
			let groups = match.groups;
			if (groups && groups.paragraph) {
				let paragraphText = this._trimParagraph(groups.paragraph);

				// match[0] 내에서 실제 paragraph가 시작되는 지점 계산
				let relativeOffset = match[0].indexOf(groups.paragraph);
				let startOffset = match.index + relativeOffset;

				let startPos = this.positionAt(startOffset);
				let endPos = this.positionAt(startOffset + paragraphText.length);

				if (startPos && endPos) {
					let exactRange = new Range(startPos, endPos);

					// SkriptComponent에 정확한 좌표를 주입
					let skParagraph = SkriptComponent.create(this, paragraphText, exactRange);

					if (skParagraph) {
						this._components.push(skParagraph);
						if (groups.comment) {
							let tooltip = this._trimToolTip(groups.comment);
							if (tooltip) {skParagraph.setToolTip(new SkriptToolTip(skParagraph, tooltip));}
						}
					}
				}
			}
			// 다음 검색은 "끝의 주석·빈 줄을 잘라낸" 덩어리 끝에서 시작한다.
			// 그래야 다음 함수 바로 위의 #> 주석(@invisible 등)이 앞 덩어리에 먹히지 않고 다음 덩어리의 툴팁이 된다.
			if (groups && groups.paragraph) {
				const trimmedEnd = match.index + match[0].indexOf(groups.paragraph) + this._trimParagraph(groups.paragraph).length;
				paragraphRegex.lastIndex = Math.max(trimmedEnd, match.index + 1);
			} else if (paragraphRegex.lastIndex <= match.index) {
				paragraphRegex.lastIndex = match.index + 1;
			}
		}
	}

	private _trimToolTip(comment: string): string[] | undefined {
		let lines = SkriptLine.split(comment);
		let tooltip = new Array<string>();
		for (let i=0; i<lines.length; i++) {
			let line = lines[i];
			let search;
			if (search = line.text.match(/^(?:\t|\s)*(?:\#\>\s?(.*))$/)) {
				tooltip.push(search[1].trim());
			}
		}
		return tooltip.length > 0 ? tooltip : undefined;
	}

	private _trimParagraph(paragraph: string): string {
		let lines = SkriptLine.split(paragraph);
		for (let i=lines.length - 1; i>=0; i--) {
			if (lines[i].text.match(/^((\t|\s)*(\#.*)?)?$/)) {
				lines.splice(i,1);
			} else { break; }
		}
		if (lines.length === 0) {return "";}
		let start = lines[0];
		let end = lines[lines.length - 1];
		return paragraph.substring(start.offset, end.offset + end.text.length);
	}
}

export class SkriptLine {
	constructor(
		public readonly offset: number,
		public readonly text: string,
		public readonly feed: string
	) {}

	public static split(paragraph:string, offset?:number): SkriptLine[] {
		let lines = new Array<SkriptLine>();
		let copy = paragraph;
		let index = (offset) ? offset : 0;
		let search;
		while (search = copy.match(/\r\n|\r|\n|$/)) {
			let line = new SkriptLine(index, copy.substring(0, search.index!), search[0]);
			lines.push(line);
			index += line.text.length + line.feed.length;
			copy = copy.substring(search.index! + line.feed.length);
			if (copy.length <= 0) {break;}
		}
		return lines;
	}
}