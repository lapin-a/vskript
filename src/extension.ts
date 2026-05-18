import * as vscode from 'vscode';
import { ExtensionContext, IndentAction, languages, workspace } from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as Skript from './Vskript/Skript';
import * as Provider from './Vskript/provider/Provider';
import TextDocumentChangeEvent from './Vskript/event/TextDocumentChangeEvent';
import { LEGEND } from './Vskript/provider/SkriptDocumentSemanticTokensProvider';
import { refreshDiagnostics, checkVersionCompatibility, skriptDiagnostics, setExtensionRootPath } from './Vskript/provider/SkriptDiagnostics';
import { SkriptHubClient } from './Vskript/SkriptHubClient';

let hubClient: SkriptHubClient;

export function updateAllDiagnostics(document: vscode.TextDocument) {
    if (!document) return;
    const isSkFile = document.uri.fsPath.endsWith('.sk');
    const isVSkriptLanguage = document.languageId === 'vskript';
    if (!isSkFile && !isVSkriptLanguage) return;

    try {
        const finalDiagnostics: vscode.Diagnostic[] = [];
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
        console.error("🚨 [extension.ts] updateAllDiagnostics 에러 방어:", error);
    }
}

export async function activate(context: ExtensionContext) {
    // 🌟 [런타임 로그 선점 하이재킹] 
    // 컴파일러의 간섭을 물리적으로 불가능하게 만들기 위해 activate 기동 즉시 순정 콘솔을 후킹합니다.
    const originalLog = console.log;
    const originalInfo = console.info;

    const logInterceptor = function(originalFn: any, ...args: any[]) {
        const fullLogMessage = args.map(a => String(a)).join(' ');
        
        if (fullLogMessage.includes('[즉시 스캔 완료]') || fullLogMessage.includes('[데이터 업데이트]') || fullLogMessage.includes('초고속 최적화 성공')) {
            // 경로 기호(\, /)를 기준으로 문장 맨 끝의 순수 .sk 파일명만 낚아챕니다. (공백 완벽 지원)
            const fileMatch = fullLogMessage.match(/([^\\\/]+\.sk)/i);
            if (fileMatch && fileMatch[1]) {
                const fileName = fileMatch[1].trim();
                if (fileName.startsWith('-')) return; // 하이픈 비활성화 파일 출력 원천 차단
                
                if (fullLogMessage.includes('[즉시 스캔 완료]')) {
                    originalFn(`[즉시 스캔 완료] ${fileName}`);
                } else {
                    originalFn(`[데이터 업데이트] 초고속 최적화 성공: ${fileName}`);
                }
                return;
            }
        }
        originalFn(...args);
    };

    console.log = (...args: any[]) => logInterceptor(originalLog, ...args);
    console.info = (...args: any[]) => logInterceptor(originalInfo, ...args);

    // 진단 원천 절대 경로 주입
    setExtensionRootPath(context.extensionPath);

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

    // 이제 1등으로 주입된 위의 가로채기 엔진이 아래 초기 스캔 로그들을 완벽하게 필터링합니다.
    await Skript.onSkriptEnable();

    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
        const currentUri = activeEditor.document.uri;
        if (currentUri.scheme === 'file') {
            const currentFolderPath = path.dirname(currentUri.fsPath);
            try {
                if (fs.existsSync(currentFolderPath)) {
                    const siblingFiles = fs.readdirSync(currentFolderPath);
                    siblingFiles.forEach(file => {
                        if (file.startsWith('-') || !file.endsWith('.sk')) return;
                        
                        const targetFullPath = path.join(currentFolderPath, file);
                        const targetUri = vscode.Uri.file(targetFullPath);
                        if (!Skript.find(targetFullPath)) {
                            Skript.scanSingleFile(targetUri);
                        }
                    });
                    console.log(`📂 [vskript 디렉토리 스캔] 현재 폴더의 모든 형제 .sk 파일 인덱싱 동기화 완료!`);
                }
            } catch (err) {
                console.error("🚨 주변 파일 자동 스캔 중 실패:", err);
            }
        }
        updateAllDiagnostics(activeEditor.document);
    }

    console.log("--- 초기 스캔 완료 ---");

    context.subscriptions.push(
        workspace.onDidOpenTextDocument(async (document) => {
            if (document.languageId === 'vskript' || document.uri.fsPath.endsWith('.sk')) {
                const fsPath = vscode.Uri.file(document.uri.fsPath).fsPath;
                let skDocument = Skript.find(fsPath);
                if (!skDocument) skDocument = Skript.scanSingleFile(document.uri);
                updateAllDiagnostics(document);
                setTimeout(() => {
                    vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', document.uri);
                }, 150);
            }
        }),
        workspace.onDidChangeTextDocument(async (event) => {
            TextDocumentChangeEvent(event, hubClient);
        }),
        workspace.onDidChangeConfiguration(async (e) => {
            if (e.affectsConfiguration('vskript')) {
                const editor = vscode.window.activeTextEditor;
                if (editor) updateAllDiagnostics(editor.document);
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
        languages.registerCompletionItemProvider('vskript', new Provider.SkriptCompletionItemProvider(), '{', '@'),
        languages.registerDocumentSemanticTokensProvider('vskript', new Provider.SkriptDocumentSemanticTokensProvider(), LEGEND),
        languages.registerColorProvider('vskript', new Provider.SkriptDocumentColorProvider())
    );
}

export function deactivate() {}