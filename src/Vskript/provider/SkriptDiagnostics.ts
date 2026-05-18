import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export const skriptDiagnostics = vscode.languages.createDiagnosticCollection("vskript");

let extensionRootPath: string = '';

export function setExtensionRootPath(rootPath: string) {
    extensionRootPath = rootPath;
}

export function checkVersionCompatibility(skDoc: any, syncData: any): vscode.Diagnostic[] {
    return []; 
}

function parseScriptVersionFromText(document: vscode.TextDocument): string | null {
    const scanLines = Math.min(document.lineCount, 10);
    for (let i = 0; i < scanLines; i++) {
        const text = document.lineAt(i).text;
        const match = text.match(/^\s*#\s*(?:version|v)\s*:\s*([0-9.]+)/i);
        if (match && match[1]) {
            return match[1].trim();
        }
    }
    return null;
}

/**
 * [철벽 정제형 버전 비교 알고리즘]
 * 문자열 뒤에 붙은 부가 설명문과 대소문자를 싹 다 날려버리고 오직 버전 '숫자'와 '점'만 추출해 정밀 대조합니다.
 */
function compareVersions(v1: any, v2: any): number {
    const cleanV1 = String(v1 || '2.6').replace(/[^\d.]/g, '');
    const cleanV2 = String(v2 || '1.0').replace(/[^\d.]/g, '');

    const finalV1 = cleanV1 === '' ? '2.6' : cleanV1;
    const finalV2 = cleanV2 === '' ? '1.0' : cleanV2;

    const p1 = finalV1.split('.').map(Number);
    const p2 = finalV2.split('.').map(Number);

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
        if (text.trim() === '' || text.trim().startsWith('#')) continue;

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

        // 🌟 [객체 트랩 완벽 분쇄 프로세스]
        let currentVersion = '2.6';
        const scriptTopVersion = parseScriptVersionFromText(document);
        
        if (scriptTopVersion) {
            currentVersion = scriptTopVersion;
        } else if (hubClient) {
            try {
                const syncData = hubClient.getSyncData();
                if (syncData && syncData.version) {
                    // 내부 객체 속성까지 딥 스캔하여 문자열 추출
                    const rawV = syncData.version;
                    if (typeof rawV === 'object') {
                        currentVersion = rawV.version || rawV.name || (rawV.major !== undefined ? `${rawV.major}.${rawV.minor || 0}` : '2.6');
                    } else {
                        currentVersion = String(rawV);
                    }
                }
            } catch (e) {}
        }

        // 혹시 모를 찌꺼기 문자 차단
        currentVersion = String(currentVersion).replace(/[^\d.]/g, '');
        if (currentVersion === '' || currentVersion.includes('object')) {
            currentVersion = '2.6';
        }

        let syntaxPath = path.join(extensionRootPath, 'src', 'resource', 'core_syntax.json');
        if (!fs.existsSync(syntaxPath)) {
             syntaxPath = path.join(__dirname, '..', '..', '..', 'src', 'resource', 'core_syntax.json');
        }
        
        let fileExists = fs.existsSync(syntaxPath);
        let syntaxDb: any = null;
        let loadStatusText = '파일이 존재하지 않음';

        if (fileExists) {
            try {
                syntaxDb = JSON.parse(fs.readFileSync(syntaxPath, 'utf-8'));
                loadStatusText = '성공 (원본 데이터 매칭 준비완료)';
            } catch (jsonErr: any) {
                loadStatusText = `❌ JSON 문법 에러 발생: ${jsonErr.message}`;
            }
        }

        console.log(`🔍 [vskript 디버그] 경로: ${syntaxPath} | 버전규격: v${currentVersion} | 상태: ${loadStatusText}`);

        for (let i = 0; i < lineCount; i++) {
            const line = document.lineAt(i);
            const text = line.text;
            
            const cleanText = text.replace(/#.*/, '').trim();
            if (cleanText === '') continue;

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

            // 2️⃣ [철벽 차단형 버전 호환성 검사]
            if (syntaxDb) {
                for (const key in syntaxDb) {
                    const syntax = syntaxDb[key];
                    if (!syntax || !syntax.name || !syntax.type || !syntax.patterns) continue;

                    // 문자열 찌꺼기가 섞인 버전 텍스트 정제 (ex: "1.0 (simple disconnection)" -> "1.0")
                    const rawAdded = String(syntax.added && syntax.added[0] ? syntax.added[0] : "1.0");
                    const requiredVersion = rawAdded.replace(/[^\d.]/g, '') || "1.0";

                    if (compareVersions(currentVersion, requiredVersion) < 0) {
                        
                        // 🌟 [교차 오탐지 검사선 구축]
                        // 사용자가 적은 라인이 'on '으로 시작하면 'event' 타입 구문만 매칭합니다.
                        // 이 필터 덕분에 "on load"가 엉뚱한 2.7버전의 "load script" 이펙트와 매칭되어 노란줄이 뜨는 참사를 막습니다.
                        const sType = String(syntax.type).toLowerCase();
                        if (sType === 'event' && !lowerText.startsWith('on ')) continue;
                        if (sType === 'command' && !lowerText.startsWith('command ')) continue;

                        const cleanLowerInput = lowerText.replace(/:$/, '').trim();
                        let isMatched = false;
                        
                        // 정밀 정규식 빌드로 매칭 정확도 극대화
                        for (const pattern of syntax.patterns) {
                            if (!pattern) continue;
                            
                            const safeRegexStr = pattern
                                .replace(/[-\/\\^$*+?.{}]/g, '\\$&') // 특수문자 이스케이프
                                .replace(/%[^%]+%/g, '.+?')           // 변수 패턴 와일드카드화
                                .replace(/<[^>]+>/g, '.+?')           // 표현식 패턴 와일드카드화
                                .replace(/\[([^\]]+)\]/g, '(?:$1)?'); // 대괄호 옵션 처리
                            
                            try {
                                const finalRegexStr = sType === 'event' ? `^${safeRegexStr}` : `\\b${safeRegexStr}`;
                                const regex = new RegExp(finalRegexStr, 'i');
                                if (regex.test(cleanLowerInput)) {
                                    isMatched = true;
                                    break;
                                }
                            } catch (e) {}
                        }

                        if (isMatched) {
                            const startChar = text.indexOf(cleanText);
                            const range = new vscode.Range(i, startChar, i, text.length);
                            entries.push(new vscode.Diagnostic(
                                range,
                                `⚠️ [vskript 버전 경고] 현재 파일 설정 버전은 v${currentVersion}이지만, 이 구문은 v${requiredVersion} 이상에서만 지원됩니다.`,
                                vscode.DiagnosticSeverity.Warning
                            ));
                            break;
                        }
                    }
                }
            }
        }

        const indentationDiagnostics = validateIndentation(document);
        entries.push(...indentationDiagnostics);

        skriptDiagnostics.set(document.uri, entries);

    } catch (error) {
        console.error("🚨 [SkriptDiagnostics.ts] 예외 발생:", error);
    }
}