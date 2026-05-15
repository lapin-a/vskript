import * as vscode from 'vscode'; 
import * as Skript from '../Skript';
import { SkriptFunction } from '../SkriptComponent';
import { SYMBOLS_MAP } from '../provider/SkriptDocumentSymbolProvider';
import { refreshDiagnostics } from '../provider/SkriptDiagnostics';

// 진단 실행 타이머 관리를 위한 변수
let diagnosticTimeout: NodeJS.Timeout | undefined;

/**
 * 문서 수정 이벤트 핸들러
 */
export default function TextDocumentChangeEvent(event: vscode.TextDocumentChangeEvent) {
	const document = event.document;
	if (document.languageId !== 'vskript') return;

	// --- 수정 부분 ---
	// 단순히 fsPath를 가져오는 대신, URI를 통해 경로 형식을 강제로 통일합니다.
	const fsPath = vscode.Uri.file(document.uri.fsPath).fsPath; 
	// ----------------

	const changes = event.contentChanges;
	if (changes.length === 0) return;

	// 데이터 모델 업데이트 시도
	const skDocument = Skript.find(fsPath);
	if (skDocument) {
		skDocument.update(document.getText());
		console.log(`[데이터 업데이트] 성공: ${document.fileName}`);
	} else {
		console.log(`[데이터 업데이트] 실패: 모델을 찾을 수 없음 (${document.fileName})`);
	}

	// 4. 무거운 작업(진단 및 캐시 갱신)은 디바운싱 처리
	// 이전에 예약된 진단 작업이 있다면 취소합니다.
	if (diagnosticTimeout) {
		clearTimeout(diagnosticTimeout);
	}

	// 500ms(0.5초) 동안 추가 입력이 없으면 실행
	diagnosticTimeout = setTimeout(() => {
		// 개요(Outline) 캐시 비우기
		SYMBOLS_MAP.delete(fsPath);
		
		// 구문 검사 실행
		refreshDiagnostics(document);
		
		diagnosticTimeout = undefined;
	}, 500);

	// 5. 부가 기능 (엔터 시 주석 자동 생성 등은 즉각적인 반응을 위해 타이머 밖에서 실행)
	for (const context of changes) {
		const text = context.text;
		if (text.match(/^(\r\n|\r|\n)(\t|\s)*$/i)) {
			inputEnter(context, document);
		}
	}
}

/**
 * 엔터 입력 시 주석(#> )을 자동으로 이어주는 기능
 */
function inputEnter(context: vscode.TextDocumentContentChangeEvent, document: vscode.TextDocument) {
	const i = context.range.start.line;
	const line = document.lineAt(i).text;
	const groups = line.match(/^(?<space>(\t|\s)*)(?<prefix>\#\>\>?)(\s)?(.*)?$/i)?.groups;
	
	if (groups) {
		const editor = vscode.window.activeTextEditor;
		if (!editor) return;

		const prefix = groups.prefix;
			
		if (prefix === '#>>') {
			editor.edit(builder => { 
				builder.delete(new vscode.Range(document.lineAt(i).range.start, document.lineAt(i+1).range.end));
			});

			const skDocument = Skript.find(document.uri.fsPath);
			if (!skDocument) return;

			const skFunction = skDocument.componentOf(context.range.start, {isAfter:true});
			if (!skFunction || !(skFunction instanceof SkriptFunction)) return;

			const docs = new Array<string>();
			let j = 1;
			if (skFunction.parameters) {
				for (const param of skFunction.parameters) {
					docs.push(`#> @param ${param.name} \${${j++}}`);
				}
			}
			if (skFunction.returnType) docs.push(`#> @return \${${j++}}`);
			docs.unshift(`#> \${${j}}`);
			
			editor.insertSnippet(new vscode.SnippetString(docs.join('\r\n')), context.range);

		} else if (prefix === '#>') {
			editor.edit(builder => {
				builder.insert(new vscode.Position(i+1, groups!.space.length), '#> ');
			});
		}
	}
}