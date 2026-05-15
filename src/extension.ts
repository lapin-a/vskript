import * as vscode from 'vscode';
import { ExtensionContext, IndentAction, languages, workspace } from 'vscode';
import * as Skript from './skript_v0.0.7/Skript';
import * as Provider from './skript_v0.0.7/provider/Provider';
import TextDocumentChangeEvent from './skript_v0.0.7/event/TextDocumentChangeEvent';
import { LEGEND } from './skript_v0.0.7/provider/SkriptDocumentSemanticTokensProvider';
import { refreshDiagnostics } from './skript_v0.0.7/provider/SkriptDiagnostics';

/**
 * 확장 프로그램 활성화 시 호출되는 함수
 */
export async function activate(context: ExtensionContext) {
    console.log("--- vskript 확장 활성화 시작 ---");

    // 1. 초기 언어 구성 설정 (들여쓰기 및 주석 규칙)
    languages.setLanguageConfiguration('vskript', {
        onEnterRules: [{
            action: { indentAction: IndentAction.Indent },
            beforeText: /\:((\s\t)*?\#.*?)?$/i
        }],
        brackets: [['(', ')'], ['[', ']'], ['{', '}']],
        comments: { lineComment: '#' }
    });

    // 2. 초기 워크스페이스 스캔 실행
    await Skript.onSkriptEnable();
    console.log("--- 초기 스캔 완료 ---");

    // 3. 현재 열려있는 에디터가 있다면 즉시 진단 및 개요 호출
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && activeEditor.document.languageId === 'vskript') {
        refreshDiagnostics(activeEditor.document);
        vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', activeEditor.document.uri);
    }

    // 4. 이벤트 리스너 등록
    context.subscriptions.push(
        // [파일 오픈 이벤트] 신규 파일 등록 및 초기화
        workspace.onDidOpenTextDocument(async (document) => {
            if (document.languageId === 'vskript') {
                const fsPath = vscode.Uri.file(document.uri.fsPath).fsPath;
                let skDocument = Skript.find(fsPath);

                // 모델에 없는 파일(새로 만든 파일 등)이면 재스캔
                if (!skDocument) {
                    console.log(`[신규 등록] ${document.fileName} 즉시 스캔 중...`);
                    // ★ 방금 만든 함수를 사용하여 해당 파일만 즉시 등록합니다.
                    skDocument = Skript.scanSingleFile(document.uri); 
                }

                refreshDiagnostics(document);
                // 개요 창 갱신을 위해 약간의 지연 후 명령 실행
                setTimeout(() => {
                    vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', document.uri);
                }, 150);
            }
        }),

        // [수정 이벤트] 실시간 데이터 업데이트 및 진단
        workspace.onDidChangeTextDocument((event) => {
            TextDocumentChangeEvent(event);
        }),

        // [설정 변경 이벤트] 진단 설정 실시간 반영
        workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('vskript')) {
                const editor = vscode.window.activeTextEditor;
                if (editor && editor.document.languageId === 'vskript') {
                    refreshDiagnostics(editor.document);
                }
            }
        })
    );

    // 5. 파일 감시자 등록 (파일 생성/삭제 시 스캔 갱신)
    const watcher = workspace.createFileSystemWatcher('**/*.sk');
    watcher.onDidCreate(() => Skript.onSkriptEnable());
    watcher.onDidDelete(() => Skript.onSkriptEnable());
    context.subscriptions.push(watcher);

    // 6. 모든 언어 Provider 등록
    context.subscriptions.push(
        languages.registerDocumentSymbolProvider('vskript', new Provider.SkriptDocumentSymbolProvider()),
        languages.registerWorkspaceSymbolProvider(new Provider.SkriptWorkspaceSymbolProvider()),
        languages.registerHoverProvider('vskript', new Provider.SkriptHoverProvider()),
        languages.registerDefinitionProvider('vskript', new Provider.SkriptDefinitionProvider()),
        languages.registerCompletionItemProvider('vskript', new Provider.SkriptCompletionItemProvider()),
        languages.registerDocumentSemanticTokensProvider('vskript', new Provider.SkriptDocumentSemanticTokensProvider(), LEGEND),
        languages.registerColorProvider('vskript', new Provider.SkriptDocumentColorProvider())
    );
}

/**
 * 확장 프로그램 비활성화 시 호출되는 함수
 */
export function deactivate() {}