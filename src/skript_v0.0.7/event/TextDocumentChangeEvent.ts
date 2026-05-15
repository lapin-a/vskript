import * as vscode from 'vscode'; 
import * as Skript from '../Skript';
import { SkriptFunction } from '../SkriptComponent';
import { SYMBOLS_MAP } from '../provider/SkriptDocumentSymbolProvider';
import { refreshDiagnostics } from '../provider/SkriptDiagnostics';

/**
 * 문서 수정 이벤트 핸들러
 */
export default function TextDocumentChangeEvent(event: vscode.TextDocumentChangeEvent) {
    const document = event.document;

    // 1. 언어 ID 확인 (vskript가 아니면 즉시 종료)
    if (document.languageId !== 'vskript') return;

    // 2. 변경 사항이 없으면 종료
    const changes = event.contentChanges;
    if (changes.length === 0) return;

    const fsPath = document.uri.fsPath;

    // 3. Skript 데이터 모델 업데이트
    const skDocument = Skript.find(fsPath);
    if (skDocument) {
        skDocument.update(document.getText());
    }

    // 4. 캐시 갱신 및 실시간 구문 검사(Diagnostics) 실행
    SYMBOLS_MAP.delete(fsPath);
    refreshDiagnostics(document);

    // 5. 부가 기능 (엔터 시 주석 자동 생성 등)
    for (const context of changes) {
        const text = context.text;
        // 개행(\n)이 포함된 입력일 경우에만 실행
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
            // 기존 입력을 지우고 스니펫 삽입
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
            // 다음 줄에 자동으로 '#> ' 추가
            editor.edit(builder => {
                builder.insert(new vscode.Position(i+1, groups!.space.length), '#> ');
            });
        }
    }
}