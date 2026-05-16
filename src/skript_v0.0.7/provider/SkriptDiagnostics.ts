import * as vscode from 'vscode';
import { SkriptDocument } from '../Skript'; 
import { SkriptComponent } from '../SkriptComponent';
import { SkriptHubClient } from '../SkriptHubClient';

/**
 * vskript의 구문 오류(Diagnostics)를 관리하는 컬렉션입니다.
 */
export const skriptDiagnostics = vscode.languages.createDiagnosticCollection('vskript');

/**
 * 문서의 기본적인 구문 오류(들여쓰기, 콜론, 구문 오타)를 검사합니다.
 */
export function refreshDiagnostics(document: vscode.TextDocument, client: SkriptHubClient): void {
    try {
        const diagnostics: vscode.Diagnostic[] = [];

        const config = vscode.workspace.getConfiguration('vskript');
        const isIndentCheckEnabled = config.get<boolean>('analyze.indentation', true);
        const preferSpaces = config.get<boolean>('analyze.preferSpaces', false);
        
        const sectionKeywords = /^(command|trigger|function|if|else|on)/i;

        // 🌟 [밸런스 패치] 무조건 에러로 때리던 방식 대신, 확실한 핵심 기본 명령어들의 오타만 정밀 저격합니다.
        const knownKeywords = ['set', 'loop', 'return', 'send', 'message', 'msg', 'give', 'drop', 'clear', 'delete', 'add', 'remove', 'replace', 'wait', 'stop', 'while', 'if', 'else'];

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

                    if (indent.includes('\t') && indent.includes(' ')) {
                        const range = new vscode.Range(i, 0, i, indent.length);
                        diagnostics.push(new vscode.Diagnostic(
                            range,
                            "들여쓰기에 탭과 공백이 혼용되었습니다.",
                            vscode.DiagnosticSeverity.Warning
                        ));
                    } else {
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
            
            // --- 3. 실시간 구문 오타 정밀 저격 검사 ---
            else {
                const firstWord = trimmedText.split(' ')[0].toLowerCase();
                
                // 유저가 입력한 첫 단어가 우리가 감지할 수 있는 유효 명령어 목록과 엇박자가 나거나,
                // 오타(예: sends, retur, st)로 변질되었을 때만 예리하게 작동합니다!
                if (!knownKeywords.includes(firstWord)) {
                    const matchedSyntax = client.findMatch(trimmedText);
                    
                    if (!matchedSyntax) {
                        const range = new vscode.Range(i, 0, i, originalText.length);
                        diagnostics.push(new vscode.Diagnostic(
                            range,
                            `[VSkript] 알 수 없거나 문법이 올바르지 않은 구문입니다: '${trimmedText}'`,
                            vscode.DiagnosticSeverity.Error
                        ));
                    }
                }
            }
        }

        // 🌟 [진단 보관함 세팅 완료] 최종 방출
        console.log(`📦 [진단 보관함 세팅 완료] 경로: ${document.uri.fsPath} | 빨간줄 개수: ${diagnostics.length}개`);
        skriptDiagnostics.set(document.uri, diagnostics);

    } catch (error) {
        console.error("🚨 refreshDiagnostics 실행 중 치명적 에러 발생:", error);
    }
}

/**
 * 버전 비교를 위한 유틸리티 함수
 */
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

/**
 * 버전 호환성을 체크하여 노란 밑줄(Warning) 진단을 생성합니다.
 */
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