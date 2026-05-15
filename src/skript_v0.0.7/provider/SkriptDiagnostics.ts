import * as vscode from 'vscode';

/**
 * vskript의 구문 오류(Diagnostics)를 관리하는 컬렉션입니다.
 * 이 객체가 빨간 줄이나 노란 줄을 에디터에 그리는 역할을 합니다.
 */
export const skriptDiagnostics = vscode.languages.createDiagnosticCollection('vskript');

/**
 * 문서의 내용을 분석하여 구문 오류가 있는지 검사합니다.
 */
export function refreshDiagnostics(document: vscode.TextDocument): void {
	const diagnostics: vscode.Diagnostic[] = [];
	console.log(`[진단 시작] 라인 수: ${document.lineCount}`); // 추가

	for (let i = 0; i < document.lineCount; i++) {
		const line = document.lineAt(i);
		const text = line.text.trim();

		if (text.length === 0 || text.startsWith('#')) continue;

		const sectionKeywords = /^(command|trigger|function|if|else|on)/i;
		
		if (sectionKeywords.test(text)) {
			if (!text.endsWith(':')) {
				console.log(`[오류 발견] ${i+1}행: ${text}`); // 추가
				const range = new vscode.Range(i, 0, i, line.text.length);
				const diagnostic = new vscode.Diagnostic(
					range,
					"섹션의 끝에 콜론(':')이 누락되었습니다.",
					vscode.DiagnosticSeverity.Error
				);
				diagnostics.push(diagnostic);
			}
		}
	}

	console.log(`[진단 완료] 발견된 오류 개수: ${diagnostics.length}`); // 추가
	skriptDiagnostics.set(document.uri, diagnostics);
}
