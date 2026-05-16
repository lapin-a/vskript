import * as vscode from 'vscode';
import { ExtensionContext, IndentAction, languages, workspace } from 'vscode';
import * as Skript from './skript_v0.0.7/Skript';
import * as Provider from './skript_v0.0.7/provider/Provider';
import TextDocumentChangeEvent from './skript_v0.0.7/event/TextDocumentChangeEvent';
import { LEGEND } from './skript_v0.0.7/provider/SkriptDocumentSemanticTokensProvider';
import { refreshDiagnostics, checkVersionCompatibility, skriptDiagnostics } from './skript_v0.0.7/provider/SkriptDiagnostics';
import { SkriptHubClient } from './skript_v0.0.7/SkriptHubClient';

let hubClient: SkriptHubClient;

/**
 * 진단(Diagnostics)을 통합하여 실행하는 함수
 * [서버 통신 제거] 딜레이를 유발하던 외부 애드온 동기화 통신을 과감히 제거하여 0ms에 수렴하는 성능을 냅니다.
 */
function updateAllDiagnostics(document: vscode.TextDocument) {
    if (!document) return;

    // 확장자가 .sk이거나 언어 ID가 vskript일 때 작동
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
        
        // 2. 외부 애드온 데이터 수집용 네트워크 통신부(syncAddonData)를 통째로 걷어내고 순수 내부 검사만 실행합니다.
        if (skDoc && hubClient) {
            const versionIssues = checkVersionCompatibility(skDoc, hubClient.getSyncData());
            finalDiagnostics.push(...versionIssues);
        }

        // 3. 완벽하게 합쳐진 최종 진단 세트를 단 한 번만 화면에 투사
        skriptDiagnostics.set(document.uri, finalDiagnostics);

    } catch (error) {
        console.error("🚨 [extension.ts] updateAllDiagnostics 실행 중 오류 발생 방어:", error);
    }
}

/**
 * 확장 프로그램 활성화 시 호출되는 함수
 */
export async function activate(context: ExtensionContext) {
    console.log("--- vskript 확장 활성화 시작 ---");

    // SkriptHub 엔진 초기화
    hubClient = new SkriptHubClient(context);
    
    // 🌟 [서버 동기화 영구 잠금] 401 에러를 유발하는 외부 통신을 완전히 주석 처리하여 차단합니다.
    // 외부 인터넷 상태와 무관하게 로컬 1056개 core_syntax DB만 가지고 즉시 가동됩니다.
    /*
    await hubClient.syncWithServer().catch(err => {
        console.warn("초기 서버 동기화는 실패했으나 로컬 무적 1056개 데이터로 가동합니다.");
    });
    */
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
            const isSkFile = document.uri.fsPath.endsWith('.sk');
            if (document.languageId === 'vskript' || isSkFile) {
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
            TextDocumentChangeEvent(event, hubClient);
            updateAllDiagnostics(event.document);
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