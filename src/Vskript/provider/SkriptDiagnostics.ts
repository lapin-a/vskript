import * as vscode from 'vscode';
import { getSyntaxRegistry } from '../syntax/SyntaxRegistry';

export const skriptDiagnostics = vscode.languages.createDiagnosticCollection("vskript");

export function checkVersionCompatibility(_skDoc: any): vscode.Diagnostic[] {
    return [];
}

/**
 * 들여쓰기 무결점 검사 레이어
 */
function validateIndentation(document: vscode.TextDocument): vscode.Diagnostic[] {
    const diagnostics: vscode.Diagnostic[] = [];
    const lineCount = document.lineCount;
    let expectedIndentLevel = 0;
    let lastSectionLine = -1;

    for (let i = 0; i < lineCount; i++) {
        const line = document.lineAt(i);
        const text = line.text;
        if (text.trim() === '' || text.trim().startsWith('#')) {continue;}

        const indentMatch = text.match(/^[\s\t]*/);
        const indentStr = indentMatch ? indentMatch[0] : '';

        if (indentStr.includes('\t') && indentStr.includes(' ')) {
            const range = new vscode.Range(i, 0, i, indentStr.length);
            diagnostics.push(new vscode.Diagnostic(
                range,
                '⚠️ 들여쓰기에 탭(\\t)과 공백(Space)이 혼용되었습니다. 하나로 통일해 주세요.',
                vscode.DiagnosticSeverity.Warning
            ));
        }

        const tabsCount = (indentStr.match(/\t/g) || []).length;
        const spacesCount = (indentStr.match(/ /g) || []).length;
        const currentIndentLevel = tabsCount + Math.floor(spacesCount / 4);

        if (lastSectionLine !== -1 && currentIndentLevel <= expectedIndentLevel - 1) {
            const range = new vscode.Range(i, 0, i, text.length);
            diagnostics.push(new vscode.Diagnostic(
                range,
                `🚨 섹션 하위 라인의 들여쓰기 깊이가 올바르지 않습니다. (최소 ${expectedIndentLevel}단계 필요)`,
                vscode.DiagnosticSeverity.Error
            ));
        }

        const cleanText = text.replace(/#.*/, '').trim(); 
        if (cleanText.endsWith(':')) {
            expectedIndentLevel = currentIndentLevel + 1;
            lastSectionLine = i;
        } else {
            expectedIndentLevel = currentIndentLevel;
            lastSectionLine = -1;
        }
    }
    return diagnostics;
}

/**
 * 핵심 실시간 진단 실행 엔진
 */
export function refreshDiagnostics(document: vscode.TextDocument) {
    if (!document) {return;}

    try {
        const entries: vscode.Diagnostic[] = [];
        const lineCount = document.lineCount;

        // 버전 검사: 구문 데이터(SyntaxRegistry)와 대조해 현재 버전에서 쓸 수 없는 구문을 경고.
        // 버전 결정 = 파일 주석(# version: / # mc:) > 서버 환경 > 미상(미상이면 검사 안 함).
        // 🌟 [임시 조치] 패턴 매칭 정확도 검증 전까지 가짜 경고를 막기 위해 꺼 둠 (TODO M2)
        const enableSyntaxCheck = false;
        const registry = getSyntaxRegistry();
        const ctx = registry ? registry.contextFor(document) : null;
        const versionCheck = enableSyntaxCheck && registry && ctx && ctx.skript ? { registry, ctx } : null;

        for (let i = 0; i < lineCount; i++) {
            const line = document.lineAt(i);
            const text = line.text;

            const cleanText = text.replace(/#.*/, '').trim();
            if (cleanText === '') {continue;}

            const lowerText = cleanText.toLowerCase();

            // 1️⃣ [콜론 누락 검사]
            if (
                (lowerText.startsWith('on ') || lowerText.startsWith('command ') || lowerText.startsWith('function ') || lowerText.startsWith('options')) &&
                !cleanText.endsWith(':')
            ) {
                const range = new vscode.Range(i, 0, i, text.length);
                entries.push(new vscode.Diagnostic(
                    range,
                    "🚨 구문 끝에 콜론(':')이 누락되었습니다.",
                    vscode.DiagnosticSeverity.Error
                ));
            }

            // 2️⃣ [버전 검사] 현재 버전에서 유효한 구문이 없고, 다른 버전에서는 유효한 구문이 있을 때만 경고
            if (versionCheck && !versionCheck.registry.findMatch(text, versionCheck.ctx)) {
                const entry = versionCheck.registry.findMatch(text, null);
                if (entry) {
                    const installed = entry.addonKey === 'skript' ? versionCheck.ctx.skriptText : null;
                    const message = `⚠️ [vskript] '${entry.title}'(${entry.addon})은 현재 버전${installed ? ` v${installed}` : ''}에서 사용할 수 없습니다.${entry.validFromText ? ` (지원: ${entry.validFromText})` : ''}`;
                    const startChar = text.indexOf(text.trim());
                    const diagnostic = new vscode.Diagnostic(new vscode.Range(i, startChar, i, text.length), message, vscode.DiagnosticSeverity.Warning);
                    diagnostic.code = 'vskript-version-mismatch';
                    entries.push(diagnostic);
                }
            }
        }

        const indentationDiagnostics = validateIndentation(document);
        entries.push(...indentationDiagnostics);

        skriptDiagnostics.set(document.uri, entries);

    } catch (error) {
        console.error("🚨 [SkriptDiagnostics.ts] 최종 예외 방어선 붕괴:", error);
    }
}
