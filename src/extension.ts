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
 * [수정] async를 추가하여 애드온 데이터 동기화를 기다릴 수 있게 함
 */
async function updateAllDiagnostics(document: vscode.TextDocument) {
	if (document.languageId !== 'vskript') return;

	// 1. 기본 진단 실행 (들여쓰기, 콜론 등)
	refreshDiagnostics(document, hubClient);
	const skDoc = Skript.find(document.uri.fsPath);
	if (skDoc && hubClient) {
		// [추가] 파일에서 감지된 애드온 목록이 있다면 서버와 동기화 시도
		// skDoc.addons는 SkriptDocument.ts에서 파싱한 결과입니다.
		if (skDoc.addons && skDoc.addons.length > 0) {
			for (const addon of skDoc.addons) {
				await hubClient.syncAddonData(addon);
			}
		}

		// 2. 버전 및 애드온 호환성 진단 추가
		const versionIssues = checkVersionCompatibility(skDoc, hubClient.getSyncData());

		// 기존 진단 리스트와 합쳐서 갱신
		const currentEntries = skriptDiagnostics.get(document.uri) || [];
		skriptDiagnostics.set(document.uri, [...currentEntries, ...versionIssues]);
	}
}

/**
 * 확장 프로그램 활성화 시 호출되는 함수
 */
export async function activate(context: ExtensionContext) {
	console.log("--- vskript 확장 활성화 시작 ---");

	// SkriptHub 엔진 초기화
	hubClient = new SkriptHubClient(context);
	// 기본 코어 데이터만 우선 동기화 (가볍게)
	await hubClient.syncWithServer();

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
	if (activeEditor && activeEditor.document.languageId === 'vskript') {
		await updateAllDiagnostics(activeEditor.document);
	}

	context.subscriptions.push(
		workspace.onDidOpenTextDocument(async (document) => {
			if (document.languageId === 'vskript') {
				const fsPath = vscode.Uri.file(document.uri.fsPath).fsPath;
				let skDocument = Skript.find(fsPath);

				if (!skDocument) {
					skDocument = Skript.scanSingleFile(document.uri);
				}

				// [수정] await 추가
				await updateAllDiagnostics(document);

				setTimeout(() => {
					vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', document.uri);
				}, 150);
			}
		}),

		workspace.onDidChangeTextDocument(async (event) => {
			TextDocumentChangeEvent(event, hubClient);
			// [수정] 타이핑 시 실시간으로 애드온/버전 체크 실행
			await updateAllDiagnostics(event.document);
		}),

		workspace.onDidChangeConfiguration(async (e) => {
			if (e.affectsConfiguration('vskript')) {
				const editor = vscode.window.activeTextEditor;
				if (editor && editor.document.languageId === 'vskript') {
					await updateAllDiagnostics(editor.document);
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