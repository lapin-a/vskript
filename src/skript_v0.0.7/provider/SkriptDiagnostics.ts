import * as vscode from 'vscode';
import { SkriptDocument } from '../Skript'; 
import { SkriptComponent } from '../SkriptComponent';
import { SkriptHubClient } from '../SkriptHubClient';

export const skriptDiagnostics = vscode.languages.createDiagnosticCollection('vskript');

// 중복 진단 요청을 방어하기 위한 타이머 주머니
let diagnosticTimer: NodeJS.Timeout | undefined;

export function refreshDiagnostics(document: vscode.TextDocument, client: SkriptHubClient): void {
    // 🌟 [디바운싱 탑재] 타이핑 중일 때는 대기하고, 타이핑이 끝나면 350ms 후에 단 한 번만 정밀 진단을 수행합니다.
    if (diagnosticTimer) {
        clearTimeout(diagnosticTimer);
    }

    diagnosticTimer = setTimeout(() => {
        runHeavyDiagnostics(document, client);
    }, 350);
}

function runHeavyDiagnostics(document: vscode.TextDocument, client: SkriptHubClient): void {
    try {
        const diagnostics: vscode.Diagnostic[] = [];
        const config = vscode.workspace.getConfiguration('vskript');
        const isIndentCheckEnabled = config.get<boolean>('analyze.indentation', true);
        const preferSpaces = config.get<boolean>('analyze.preferSpaces', false);
        
        const sectionKeywords = /^(command|trigger|function|if|else|on)/i;
        const knownKeywords = new Set(['set', 'loop', 'return', 'send', 'message', 'msg', 'give', 'drop', 'clear', 'delete', 'add', 'remove', 'replace', 'wait', 'stop', 'while', 'if', 'else']);

        const lineCount = document.lineCount;
        for (let i = 0; i < lineCount; i++) {
            const line = document.lineAt(i);
            const originalText = line.text;
            const trimmedText = originalText.trim();

            if (trimmedText.length === 0 || trimmedText.startsWith('#')) continue;

            // 1. 들여쓰기 검사 최적화
            if (isIndentCheckEnabled) {
                const indentMatch = originalText.match(/^\s+/);
                if (indentMatch) {
                    const indent = indentMatch[0];
                    if (indent.includes('\t') && indent.includes(' ')) {
                        diagnostics.push(new vscode.Diagnostic(
                            new vscode.Range(i, 0, i, indent.length),
                            "들여쓰기에 탭과 공백이 혼용되었습니다.",
                            vscode.DiagnosticSeverity.Warning
                        ));
                    } else {
                        if (preferSpaces && indent.includes('\t')) {
                            diagnostics.push(new vscode.Diagnostic(
                                new vscode.Range(i, 0, i, indent.length),
                                "설정에서 공백(Space) 들여쓰기를 권장하고 있습니다.",
                                vscode.DiagnosticSeverity.Warning
                            ));
                        } else if (!preferSpaces && indent.includes(' ')) {
                            diagnostics.push(new vscode.Diagnostic(
                                new vscode.Range(i, 0, i, indent.length),
                                "설정에서 탭(Tab) 들여쓰기를 권장하고 있습니다.",
                                vscode.DiagnosticSeverity.Warning
                            ));
                        }
                    }
                }
            }

            // 2. 콜론 누락 검사
            if (sectionKeywords.test(trimmedText)) {
                const textWithoutComment = trimmedText.split('#')[0].trim();
                if (!textWithoutComment.endsWith(':')) {
                    diagnostics.push(new vscode.Diagnostic(
                        new vscode.Range(i, 0, i, originalText.length),
                        "섹션의 끝에 콜론(':')이 누락되었습니다.",
                        vscode.DiagnosticSeverity.Error
                    ));
                }
            } 
            // 3. 실시간 구문 오타 저격 (Set 객체를 사용해 O(1) 초고속 조회)
            else {
                const firstWord = trimmedText.split(' ')[0].toLowerCase();
                if (!knownKeywords.has(firstWord)) {
                    const matchedSyntax = client.findMatch(trimmedText);
                    if (!matchedSyntax) {
                        diagnostics.push(new vscode.Diagnostic(
                            new vscode.Range(i, 0, i, originalText.length),
                            `[VSkript] 알 수 없거나 문법이 올바르지 않은 구문입니다: '${trimmedText}'`,
                            vscode.DiagnosticSeverity.Error
                        ));
                    }
                }
            }
        }

        skriptDiagnostics.set(document.uri, diagnostics);

    } catch (error) {
        console.error("🚨 refreshDiagnostics 실행 중 오류 발생:", error);
    }
}

function isVersionCompatible(current: string, required: any): boolean {
    if (!required) return true;
    const reqStr = String(required).trim();
    const currStr = String(current).trim();

    const curr = currStr.split('.').map(Number);
    const req = reqStr.split('.').map(Number);
    
    for (let i = 0; i < Math.max(curr.length, req.length); i++) {
        const currVal = curr[i] || 0;
        const reqVal = req[i] || 0;
        if (currVal < reqVal) return false;
        if (currVal > reqVal) return true;
    }
    return true;
}

export function checkVersionCompatibility(document: SkriptDocument, versionData: any): vscode.Diagnostic[] {
    const diagnostics: vscode.Diagnostic[] = [];
    const docVersion = document.version || "2.6"; 

    if (!document.components) return diagnostics;

    document.components.forEach((comp: any) => { 
        if (!comp) return;
        const syntaxTitle = comp.title || ""; 
        const syntaxInfo = versionData[syntaxTitle]; 
        
        if (syntaxInfo && syntaxInfo.added) {
            if (!isVersionCompatible(docVersion, syntaxInfo.added)) {
                diagnostics.push(new vscode.Diagnostic(
                    comp.range,
                    `[호환성 경고] '${syntaxTitle}' 구문은 Skript v${syntaxInfo.added}부터 지원됩니다. 현재 버전(v${docVersion})과 호환되지 않습니다.`,
                    vscode.DiagnosticSeverity.Warning
                ));
            }
        }
    });

    return diagnostics;
}