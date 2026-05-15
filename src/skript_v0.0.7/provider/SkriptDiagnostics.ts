import * as vscode from 'vscode';

/**
 * vskript의 구문 오류(Diagnostics)를 관리하는 컬렉션입니다.
 */
export const skriptDiagnostics = vscode.languages.createDiagnosticCollection('vskript');

/**
 * 문서의 내용을 분석하여 구문 오류가 있는지 검사합니다.
 */
export function refreshDiagnostics(document: vscode.TextDocument): void {
	const diagnostics: vscode.Diagnostic[] = [];

	const config = vscode.workspace.getConfiguration('vskript');
	const isIndentCheckEnabled = config.get<boolean>('analyze.indentation', true);
	const preferSpaces = config.get<boolean>('analyze.preferSpaces', false);

	console.log(`[설정값 디버깅] 활성화: ${isIndentCheckEnabled}, 공백선호: ${preferSpaces}`);
	for (let i = 0; i < document.lineCount; i++) {
		const line = document.lineAt(i);
		const originalText = line.text;
		const trimmedText = originalText.trim();

		if (trimmedText.length === 0 || trimmedText.startsWith('#')) continue;

		// --- 1. 들여쓰기 검사 ---
		if (isIndentCheckEnabled) {
			const indentMatch = originalText.match(/^\s+/);
			if (indentMatch) {
				const indent = indentMatch[0];

				// 1-1. 혼용 검사
				if (indent.includes('\t') && indent.includes(' ')) {
					const range = new vscode.Range(i, 0, i, indent.length);
					diagnostics.push(new vscode.Diagnostic(
						range,
						"들여쓰기에 탭과 공백이 혼용되었습니다.",
						vscode.DiagnosticSeverity.Warning
					));
				}
				// 1-2. 선호 방식(Tab vs Space) 검사 (새로 추가)
				else {
					if (preferSpaces && indent.includes('\t')) {
						// 공백 선호인데 탭이 들어간 경우
						const range = new vscode.Range(i, 0, i, indent.length);
						diagnostics.push(new vscode.Diagnostic(
							range,
							"설정에서 공백(Space) 들여쓰기를 권장하고 있습니다.",
							vscode.DiagnosticSeverity.Warning
						));
					} else if (!preferSpaces && indent.includes(' ')) {
						// 탭 선호인데 공백이 들어간 경우
						const range = new vscode.Range(i, 0, i, indent.length);
						diagnostics.push(new vscode.Diagnostic(
							range,
							"설정에서 탭(Tab) 들여쓰기를 권장하고 있습니다.",
							vscode.DiagnosticSeverity.Warning
						));
					}
				}
			}
		}

		// --- 2. 콜론(:) 누락 검사 (주석 무시 로직 추가) ---
		const sectionKeywords = /^(command|trigger|function|if|else|on)/i;
		if (sectionKeywords.test(trimmedText)) {
			// 텍스트에서 주석(#) 부분을 완전히 제거한 뒤 공백을 깎아냅니다.
			const textWithoutComment = trimmedText.split('#')[0].trim();

			// 주석을 뺀 순수 텍스트가 콜론(':')으로 끝나지 않는 경우에만 에러!
			if (!textWithoutComment.endsWith(':')) {
				const range = new vscode.Range(i, 0, i, originalText.length);
				diagnostics.push(new vscode.Diagnostic(
					range,
					"섹션의 끝에 콜론(':')이 누락되었습니다.",
					vscode.DiagnosticSeverity.Error
				));
			}
		}
	}

	skriptDiagnostics.set(document.uri, diagnostics);
}