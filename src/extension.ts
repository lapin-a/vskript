import * as vscode from 'vscode';
import { ExtensionContext, IndentAction, languages, workspace } from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as Skript from './Vskript/Skript';
import * as Provider from './Vskript/provider/Provider';
import onTextDocumentChange from './Vskript/event/TextDocumentChangeEvent';
import { LEGEND } from './Vskript/provider/SkriptDocumentSemanticTokensProvider';
import { refreshDiagnostics, checkVersionCompatibility, skriptDiagnostics } from './Vskript/provider/SkriptDiagnostics';
import { initSyntaxRegistry } from './Vskript/syntax/SyntaxRegistry';
import { ServerEnvironmentManager, getEnvironment } from './Vskript/env/ServerEnvironment';
import { initLogger, log } from './Vskript/Logger';

/**
 * [최적화] 진단 연산을 비동기로 격리하여 메인 UI 스레드 프리징을 원천 차단합니다.
 */
export function updateAllDiagnostics(document: vscode.TextDocument) {
    if (!document) {return;}
    const isSkFile = document.uri.fsPath.endsWith('.sk');
    const isVSkriptLanguage = document.languageId === 'vskript';
    if (!isSkFile && !isVSkriptLanguage) {return;}

    // 🌟 [핵심] 무거운 정규식 진단 연산을 비동기 큐로 빼서 파일 오픈/전환 렉을 완전히 소멸시킵니다.
    setTimeout(() => {
        try {
            const finalDiagnostics: vscode.Diagnostic[] = [];
            refreshDiagnostics(document);
            const syntaxEntries = skriptDiagnostics.get(document.uri) || [];
            finalDiagnostics.push(...syntaxEntries);
            
            const fsPath = vscode.Uri.file(document.uri.fsPath).fsPath;
            const skDoc = Skript.find(fsPath);
            if (skDoc) {
                const versionIssues = checkVersionCompatibility(skDoc);
                finalDiagnostics.push(...versionIssues);
            }
            skriptDiagnostics.set(document.uri, finalDiagnostics);
        } catch (error) {
            log.error('진단 갱신 실패:', error);
        }
    }, 5); // 5ms의 미세 지연을 주어 에디터 화면 렌더링 및 포커스가 먼저 완료되도록 유도
}

export async function activate(context: ExtensionContext) {
    initLogger(context);
    log.info('VSkript 활성화 시작');
    // 구문 저장소(번들 core + DataPack). 서버 환경이 바뀌면 스스로 다시 읽는다.
    const syntaxRegistry = initSyntaxRegistry(context);

    // 서버 환경(Skript 버전/애드온) 감지 + 구문 DataPack 동기화.
    // 네트워크를 쓰므로 활성화를 막지 않도록 기다리지 않는다.
    const environment = new ServerEnvironmentManager(context);
    context.subscriptions.push(
        environment,
        // 환경 변경 → 레지스트리 재로딩 → 진단 갱신
        syntaxRegistry.onDidReload(() => {
            const editor = vscode.window.activeTextEditor;
            if (editor) {updateAllDiagnostics(editor.document);}
        }),
        // plugins 폴더를 아직 못 찾았다면, 다른 .sk 파일을 열 때 다시 찾아본다
        vscode.window.onDidChangeActiveTextEditor(editor => {
            const env = getEnvironment();
            if (editor && editor.document.uri.fsPath.endsWith('.sk') && env && !env.pluginsFolder) {
                environment.scheduleRefresh();
            }
        }),
    );
    environment.refresh().catch(err => log.error('서버 환경 감지 실패:', err));

    languages.setLanguageConfiguration('vskript', {
        onEnterRules: [{
            action: { indentAction: IndentAction.Indent },
            beforeText: /\:((\s\t)*?\#.*?)?$/i
        }],
        brackets: [['(', ')'], ['[', ']'], ['{', '}']],
        comments: { lineComment: '#' }
    });

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
                        if (file.startsWith('-') || !file.endsWith('.sk')) {return;}
                        
                        const targetFullPath = path.join(currentFolderPath, file);
                        const targetUri = vscode.Uri.file(targetFullPath);
                        if (!Skript.find(targetFullPath)) {
                            Skript.scanSingleFile(targetUri);
                        }
                    });
                    log.debug(`현재 폴더의 .sk 파일 스캔 완료: ${currentFolderPath}`);
                }
            } catch (err) {
                log.error('현재 폴더 스캔 실패:', err);
            }
        }
        updateAllDiagnostics(activeEditor.document);
    }

    log.info('초기 스캔 완료');

    context.subscriptions.push(
        workspace.onDidOpenTextDocument(async (document) => {
            if (document.languageId === 'vskript' || document.uri.fsPath.endsWith('.sk')) {
                const fsPath = vscode.Uri.file(document.uri.fsPath).fsPath;
                let skDocument = Skript.find(fsPath);
                // 저장되지 않은 문서(untitled 등)는 디스크에 파일이 없으므로 스캔하지 않는다
                if (!skDocument && document.uri.scheme === 'file') {skDocument = Skript.scanSingleFile(document.uri);}
                
                // 비동기로 격리된 진단 연산 호출
                updateAllDiagnostics(document);
                
                setTimeout(() => {
                    vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', document.uri);
                }, 150);
            }
        }),
        workspace.onDidChangeTextDocument(async (event) => {
            onTextDocumentChange(event);
        }),
        workspace.onDidChangeConfiguration(async (e) => {
            if (e.affectsConfiguration('vskript')) {
                const editor = vscode.window.activeTextEditor;
                if (editor) {updateAllDiagnostics(editor.document);}
            }
        }),
        skriptDiagnostics
    );

    const watcher = workspace.createFileSystemWatcher('**/*.sk');
    watcher.onDidCreate((uri) => Skript.scanSingleFile(uri));
    watcher.onDidDelete((uri) => Skript.removeDocument(uri.fsPath));
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
