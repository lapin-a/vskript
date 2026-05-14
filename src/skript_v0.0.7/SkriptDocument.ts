import { Position, Range } from "vscode";
import { SkriptComponent, SkriptToolTip } from "./SkriptComponent";
import * as Path from 'path';
import { Class } from "../Java";

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

    constructor (skPath: SkriptPath, document: string) {
        this._skPath = skPath;
        this._document = document;
        this._update();
    }
    
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
        if (!range) return this._document;
        let start = this.offsetAt(range.start);
        let end = this.offsetAt(range.end);
        return this._document.substring(start, end);
    }

// 1. getRange 함수를 아래와 같이 수정 (검색 시작 위치 추가)
// fromIndex: number = 0 를 추가하여 중복 구문 검색 지원
    public getRange(text: string, fromIndex: number = 0): Range | undefined {
        let index = this._document.indexOf(text, fromIndex); // indexOf에 시작 위치 전달
        if (index < 0)
            return
        
        let start = this.positionAt(index);
        let end = this.positionAt(index + text.length);
        if (start && end)
            return new Range(start, end);
        else
            return;
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
        for (const value of this._components) if (value instanceof clazz) {
            array.push(value);
        }
        return array;
    }

    public update(document:string) {
        this._document = document;
        this._update();
    }

    private _update() {
        this._updateSkriptLine();
        this._updateSkriptParagraph();
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
            if (document.length <= 0) break;
        }
    }

    private _updateSkriptParagraph() {
        this._components.length = 0;
        let document = this._document;
        
        // [완전 보강 버전]
        // 1. 줄 시작 부분에 options, aliases, on, function, command 등이 오는지 확인
        // 2. 다음 "들여쓰기 없는 새로운 구문"이 나오기 전까지의 모든 줄(주석, 빈줄 포함)을 한 덩어리로 묶음
        const paragraphRegex = /(?<=^|\r\n|\r|\n)(?<comment>(\t|\s)*\#.*((\r\n|\r|\n)(\t|\s)+\#.*)*(\r\n|\r|\n)?)?(?<paragraph>[a-zA-Z0-9].*(\r\n|\r|\n|(?:\r\n|\r|\n)(?:[\t\s]+|\#.*|$))+)/g;

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
                            if (tooltip) skParagraph.setToolTip(new SkriptToolTip(skParagraph, tooltip));
                        }
                    }
                }
            }
            // 검색 인덱스 꼬임 방지
            if (paragraphRegex.lastIndex <= match.index) {
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
        if (lines.length === 0) return "";
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
            if (copy.length <= 0) break;
        }
        return lines;
    }
}