import * as vscode from 'vscode';
import { ExtensionContext, IndentAction, languages, workspace } from 'vscode';
import * as Skript from './Vskript/Skript';
import * as Provider from './Vskript/provider/Provider';
import TextDocumentChangeEvent from './Vskript/event/TextDocumentChangeEvent';
import { LEGEND } from './Vskript/provider/SkriptDocumentSemanticTokensProvider';
import { refreshDiagnostics, checkVersionCompatibility, skriptDiagnostics } from './Vskript/provider/SkriptDiagnostics';
import { SkriptHubClient } from './Vskript/SkriptHubClient';

let hubClient: SkriptHubClient;

/**
 * 진단(Diagnostics)을 통합하여 실행하는 함수
 * [서버 통신 제거] 딜레이를 유발하던 외부 애드온 동기화 통신을 과감히 제거하여 0ms에 수렴하는 성능을 냅니다.
 */
export function updateAllDiagnostics(document: vscode.TextDocument) {
    if (!document) return;

    const isSkFile = document.uri.fsPath.endsWith('.sk');
    const isVSkriptLanguage = document.languageId === 'vskript';
    if (!isSkFile && !isVSkriptLanguage) return;

    try {
        const finalDiagnostics: vscode.Diagnostic[] = [];

        // 1. 구문 오타 / 들여쓰기 / 콜론 누락 검사 초고속 실행
        refreshDiagnostics(document, hubClient);
        const syntaxEntries = skriptDiagnostics.get(document.uri) || [];
        finalDiagnostics.push(...syntaxEntries);
        
        const fsPath = vscode.Uri.file(document.uri.fsPath).fsPath;
        const skDoc = Skript.find(fsPath);
        
        if (skDoc && hubClient) {
            const versionIssues = checkVersionCompatibility(skDoc, hubClient.getSyncData());
            finalDiagnostics.push(...versionIssues);
        }

        skriptDiagnostics.set(document.uri, finalDiagnostics);

    } catch (error) {
        console.error("🚨 [extension.ts] updateAllDiagnostics 실행 중 오류 발생 방어:", error);
    }
}

export async function activate(context: ExtensionContext) {
    console.log("--- vskript 확장 활성화 시작 ---");

    hubClient = new SkriptHubClient(context);
    console.log("🌟 [로컬 모드 선언] 외부 서버 통신이 성공적으로 영구 차단되었습니다.");

    languages.setLanguageConfiguration('vskript', {
        onEnterRules: [{
            action: { indentAction: IndentAction.Indent },
            beforeText: /\:((\s\t)*?\#.*?)?$/i
        }],
        brackets: [['(', ')'], ['[', ']'], ['{', '}']],
        comments: { lineComment: '#' }
    });

    await Skript.onSkriptEnable();
    console.log("--- 초기 스캔 완료 ---");

    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
        updateAllDiagnostics(activeEditor.document);
    }

    context.subscriptions.push(
        workspace.onDidOpenTextDocument(async (document) => {
            if (document.languageId === 'vskript' || document.uri.fsPath.endsWith('.sk')) {
                const fsPath = vscode.Uri.file(document.uri.fsPath).fsPath;
                let skDocument = Skript.find(fsPath);

                if (!skDocument) {
                    skDocument = Skript.scanSingleFile(document.uri);
                }

                updateAllDiagnostics(document);

                setTimeout(() => {
                    vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', document.uri);
                }, 150);
            }
        }),

        workspace.onDidChangeTextDocument(async (event) => {
            // 🌟 [최적화 수정] 실시간 렉을 유발하던 중복 updateAllDiagnostics(event.document) 강제 호출부를 완전히 걷어냅니다!
            // 이제 모든 타이핑 제어권은 디바운스 타이머가 내장된 TextDocumentChangeEvent 단 한 곳에서 통합 관리됩니다.
            TextDocumentChangeEvent(event, hubClient);
        }),

        workspace.onDidChangeConfiguration(async (e) => {
            if (e.affectsConfiguration('vskript')) {
                const editor = vscode.window.activeTextEditor;
                if (editor) {
                    updateAllDiagnostics(editor.document);
                }
            }
        }),

        skriptDiagnostics
    );

    const watcher = workspace.createFileSystemWatcher('**/*.sk');
    watcher.onDidCreate(() => Skript.onSkriptEnable());
    watcher.onDidDelete(() => Skript.onSkriptEnable());
    context.subscriptions.push(watcher);

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

export function deactivate() {}