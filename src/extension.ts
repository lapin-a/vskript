import { ExtensionContext, IndentAction, languages, workspace } from 'vscode';
import { onSkriptEnable } from './skript_v0.0.7/Skript';
import * as Provider from './skript_v0.0.7/provider/Provider';
import TextDocumentChangeEvent from './skript_v0.0.7/event/TextDocumentChangeEvent';
import { LEGEND } from './skript_v0.0.7/provider/SkriptDocumentSemanticTokensProvider';

// Options
languages.setLanguageConfiguration('vskript', {
	onEnterRules: [{
		action: {indentAction: IndentAction.Indent},
		beforeText: /\:((\s\t)*?\#.*?)?$/i
	}],
	brackets: [['(', ')'], ['[', ']'], ['{', '}']],
	comments: {lineComment: '#'}
});

export async function activate(context: ExtensionContext) {

    // 1. 처음 켰을 때 워크스페이스 전체 스캔
    await onSkriptEnable();

    // 2. 파일을 새로 열 때마다 해당 파일을 다시 분석해서 등록
    context.subscriptions.push(
        workspace.onDidOpenTextDocument(async (document) => {
            if (document.languageId === 'vskript') {
                // Skript.ts에 이 파일을 업데이트하는 로직이 있다면 호출
                // 예: Skript.updateDocument(document); 
                // 지금은 간단하게 전체 스캔을 다시 호출하거나, 
                // TextDocumentChangeEvent가 처리하도록 유도합니다.
            }
        })
    );

    // 3. 파일이 생성/삭제될 때 알림 및 재스캔
    const watcher = workspace.createFileSystemWatcher('**/*.sk');
    watcher.onDidCreate(() => onSkriptEnable());
    watcher.onDidDelete(() => onSkriptEnable());
    context.subscriptions.push(watcher);

    // --- Provider 등록 (기존 코드) ---
    languages.registerDocumentSymbolProvider('vskript', new Provider.SkriptDocumentSymbolProvider());
    languages.registerWorkspaceSymbolProvider(new Provider.SkriptWorkspaceSymbolProvider());
    languages.registerHoverProvider('vskript', new Provider.SkriptHoverProvider());
    languages.registerDefinitionProvider('vskript', new Provider.SkriptDefinitionProvider());
    languages.registerCompletionItemProvider('vskript', new Provider.SkriptCompletionItemProvider());
    languages.registerDocumentSemanticTokensProvider('vskript', new Provider.SkriptDocumentSemanticTokensProvider(), LEGEND);
    languages.registerColorProvider('vskript', new Provider.SkriptDocumentColorProvider());
    
    // 실시간 수정 반영
    workspace.onDidChangeTextDocument(TextDocumentChangeEvent);
}

export function deactivate() {}
