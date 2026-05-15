import * as vscode from 'vscode';
import { SkriptDocument } from '../Skript'; 
import { SkriptComponent } from '../SkriptComponent';

/**
 * vskript의 구문 오류(Diagnostics)를 관리하는 컬렉션입니다.
 */
export const skriptDiagnostics = vscode.languages.createDiagnosticCollection('vskript');

/**
 * 문서의 기본적인 구문 오류(들여쓰기, 콜론)를 검사합니다.
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
                // 1-2. 선호 방식(Tab vs Space) 검사
                else {
                    if (preferSpaces && indent.includes('\t')) {
                        const range = new vscode.Range(i, 0, i, indent.length);
                        diagnostics.push(new vscode.Diagnostic(
                            range,
                            "설정에서 공백(Space) 들여쓰기를 권장하고 있습니다.",
                            vscode.DiagnosticSeverity.Warning
                        ));
                    } else if (!preferSpaces && indent.includes(' ')) {
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

        // --- 2. 콜론(:) 누락 검사 ---
        const sectionKeywords = /^(command|trigger|function|if|else|on)/i;
        if (sectionKeywords.test(trimmedText)) {
            const textWithoutComment = trimmedText.split('#')[0].trim();

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

/**
 * 버전 비교를 위한 유틸리티 함수
 */
function isVersionCompatible(current: string, required: string): boolean {
    const curr = current.split('.').map(Number);
    const req = required.split('.').map(Number);
    
    for (let i = 0; i < Math.max(curr.length, req.length); i++) {
        const currVal = curr[i] || 0;
        const reqVal = req[i] || 0;
        if (currVal < reqVal) return false;
        if (currVal > reqVal) return true;
    }
    return true;
}

/**
 * 버전 호환성을 체크하여 노란 밑줄(Warning) 진단을 생성합니다.
 */
export function checkVersionCompatibility(document: SkriptDocument, versionData: any): vscode.Diagnostic[] {
    const diagnostics: vscode.Diagnostic[] = [];
    const docVersion = document.version || "2.6"; 

    // document.components (getter)를 통해 접근
    document.components.forEach((comp: any) => { 
        // SkriptComponent에 title이 없을 수 있으므로 안전하게 처리
        const syntaxTitle = comp.title || ""; 
        const syntaxInfo = versionData[syntaxTitle]; 
        
        if (syntaxInfo && syntaxInfo.added) {
            if (!isVersionCompatible(docVersion, syntaxInfo.added)) {
                const diagnostic = new vscode.Diagnostic(
                    comp.range,
                    `[호환성 경고] '${syntaxTitle}' 구문은 Skript v${syntaxInfo.added}부터 지원됩니다. 현재 버전(v${docVersion})과 호환되지 않습니다.`,
                    vscode.DiagnosticSeverity.Warning
                );
                diagnostics.push(diagnostic);
            }
        }
    });

    return diagnostics;
}