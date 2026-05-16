import * as vscode from 'vscode';
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

/**
 * 🌟 [버전 정밀 분석기] 두 버전 문자열을 쪼개어 대조합니다. (예: "2.6.2" vs "2.7")
 * 사용자가 설정한 targetVersion이 구문의 요구 버전(required)보다 크거나 같으면 true, 작으면 false를 반환합니다.
 */
function isSupportedVersion(targetVersion: string, syntaxAddedVersion: any): boolean {
    if (!syntaxAddedVersion) return true; // 추가된 버전 정보가 없으면 기본 허용
    
    const target = String(targetVersion).trim().split('.').map(Number);
    const required = String(syntaxAddedVersion).trim().split('.').map(Number);
    
    for (let i = 0; i < Math.max(target.length, required.length); i++) {
        const targetVal = target[i] || 0;
        const reqVal = required[i] || 0;
        if (targetVal < reqVal) return false; // 타깃 버전이 요구 버전보다 낮으므로 지원 불가!
        if (targetVal > reqVal) return true;  // 타깃 버전이 요구 버전보다 높으므로 지원 가능
    }
    return true;
}

function runHeavyDiagnostics(document: vscode.TextDocument, client: SkriptHubClient): void {
    try {
        const diagnostics: vscode.Diagnostic[] = [];
        const config = vscode.workspace.getConfiguration('vskript');
        
        // 🌟 [과거 버전 역추적 주입] 사용자가 설정창(package.json)에 입력한 타깃 버전을 실시간으로 긁어옵니다. (기본값 "2.6")
        const targetVersion = config.get<string>('analyze.targetVersion', '2.6');
        
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
            // 3. 실시간 구문 오타 저격 및 🌟과거 버전 호환성 실시간 교차 저격 (O(1) 해시 대조)
            else {
                const firstWord = trimmedText.split(' ')[0].toLowerCase();
                if (!knownKeywords.has(firstWord)) {
                    // 내장 DB(core_syntax.json)에서 사용자가 적은 문법이 실재하는지 고속 검색
                    const matchedSyntax = client.findMatch(trimmedText);
                    
                    if (!matchedSyntax) {
                        diagnostics.push(new vscode.Diagnostic(
                            new vscode.Range(i, 0, i, originalText.length),
                            `[VSkript] 알 수 없거나 문법이 올바르지 않은 구문입니다: '${trimmedText}'`,
                            vscode.DiagnosticSeverity.Error
                        ));
                    } else {
                        // 🌟 [수정 핵심] 구문 자체는 정상이나, 구문이 추가된 버전(added)이 사용자의 설정 버전보다 높다면 에러 처리!
                        if (matchedSyntax.added && !isSupportedVersion(targetVersion, matchedSyntax.added)) {
                            diagnostics.push(new vscode.Diagnostic(
                                new vscode.Range(i, 0, i, originalText.length),
                                `[과거 버전 호환성 에러] 이 구문은 Skript v${matchedSyntax.added}부터 지원됩니다. 현재 설정된 서버 버전(v${targetVersion})과 호환되지 않아 구동 중 서버 에러가 발생합니다.`,
                                vscode.DiagnosticSeverity.Error
                            ));
                        }
                    }
                }
            }
        }

        skriptDiagnostics.set(document.uri, diagnostics);

    } catch (error) {
        console.error("🚨 refreshDiagnostics 실행 중 오류 발생:", error);
    }
}

/**
 * 기존 인터페이스 호환성을 유지하기 위한 껍데기 헬퍼 함수 (외부 연동용 라인 유지)
 */
export function checkVersionCompatibility(document: any, versionData: any): vscode.Diagnostic[] {
    return [];
}