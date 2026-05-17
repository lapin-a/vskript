import * as vscode from 'vscode';
import * as Skript from '../Skript';

export const skriptDiagnostics = vscode.languages.createDiagnosticCollection("vskript");

const compatibilityMap: { [key: string]: { min?: string, max?: string } } = {
    'send': { min: '2.0' },
    'broadcast': { min: '2.0' },
    'damage': { min: '2.1' },
    'heal': { min: '2.1' },
    'kill': { min: '2.0' },
    'teleport': { min: '2.2' },
    'kick': { min: '2.0' },
    'ban': { min: '2.0' },
    'unban': { min: '2.0' },
    'op': { min: '2.0' },
    'deop': { min: '2.0' },
    'enchant': { min: '2.3' },
    'disenchant': { min: '2.3' },
    'give': { min: '2.0' },
    'remove': { min: '2.0' },
    'clear': { min: '2.0' },
    'execute': { min: '2.0' },
    'toggle': { min: '2.4' },
    'log': { min: '2.0' },
    'message': { min: '2.0' }
};

export function checkVersionCompatibility(skDoc: any, syncData: any): vscode.Diagnostic[] {
    const diagnostics: vscode.Diagnostic[] = [];
    if (!skDoc || !skDoc.paragraphs) return diagnostics;

    const currentVersion = (syncData && syncData.version) ? syncData.version : '2.6';

    for (const p of skDoc.paragraphs) {
        if (!p.lines) continue;
        for (const lineObj of p.lines) {
            const text = lineObj.text;
            const lineNum = lineObj.line;
            const trimmed = text.trim();
            const firstWord = trimmed.split(/\s+/)[0].toLowerCase();

            if (compatibilityMap[firstWord]) {
                const rule = compatibilityMap[firstWord];
                if (rule.min && compareVersions(currentVersion, rule.min) < 0) {
                    const range = new vscode.Range(lineNum, 0, lineNum, text.length);
                    diagnostics.push(new vscode.Diagnostic(
                        range,
                        `⚠️ '${firstWord}' 구문은 Skript v${rule.min} 이상이 필요합니다. (현재 로컬 설정: v${currentVersion})`,
                        vscode.DiagnosticSeverity.Warning
                    ));
                }
            }
        }
    }
    return diagnostics;
}

function compareVersions(v1: string, v2: string): number {
    const p1 = v1.split('.').map(Number);
    const p2 = v2.split('.').map(Number);
    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
        const n1 = p1[i] || 0;
        const n2 = p2[i] || 0;
        if (n1 > n2) return 1;
        if (n1 < n2) return -1;
    }
    return 0;
}

function validateIndentation(document: vscode.TextDocument): vscode.Diagnostic[] {
    const diagnostics: vscode.Diagnostic[] = [];
    const lineCount = document.lineCount;

    let expectedIndentLevel = 0;
    let lastSectionLine = -1;

    for (let i = 0; i < lineCount; i++) {
        const line = document.lineAt(i);
        const text = line.text;

        if (text.trim() === '' || text.trim().startsWith('#')) {
            continue;
        }

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

export function refreshDiagnostics(document: vscode.TextDocument, hubClient: any) {
    if (!document) return;

    try {
        const entries: vscode.Diagnostic[] = [];
        const lineCount = document.lineCount;

        for (let i = 0; i < lineCount; i++) {
            const line = document.lineAt(i);
            const text = line.text;
            
            // ⭐ [핵심 버그 수정] 검사 전 후미 주석(#...)을 완전히 제거하여 오탐지를 원천 차단합니다!
            const cleanText = text.replace(/#.*/, '').trim();
            if (cleanText === '') continue;

            const lower = cleanText.toLowerCase();
            if (
                (lower.startsWith('on ') || lower.startsWith('command ') || lower.startsWith('function ') || lower.startsWith('options')) &&
                !cleanText.endsWith(':')
            ) {
                const range = new vscode.Range(i, 0, i, text.length);
                entries.push(new vscode.Diagnostic(
                    range,
                    "🚨 구문 끝에 콜론(':')이 누락되었습니다.",
                    vscode.DiagnosticSeverity.Error
                ));
            }
        }

        const indentationDiagnostics = validateIndentation(document);
        entries.push(...indentationDiagnostics);

        skriptDiagnostics.set(document.uri, entries);

    } catch (error) {
        console.error("🚨 [SkriptDiagnostics.ts] 예외 발생:", error);
    }
}