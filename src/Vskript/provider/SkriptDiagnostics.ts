import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export const skriptDiagnostics = vscode.languages.createDiagnosticCollection("vskript");

let extensionRootPath: string = '';

/**
 * extension.ts에서 활성화 시점에 주입해 주는 전역 확장 프로그램 루트 경로
 */
export function setExtensionRootPath(rootPath: string) {
    extensionRootPath = rootPath;
}

export function checkVersionCompatibility(_skDoc: any, _syncData: any): vscode.Diagnostic[] {
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
 * v1이 v2보다 크거나 같으면 true, 작으면 false 리턴 (호환성 대조용 브릿지)
 */
function isVersionCompatible(current: string, required: string): boolean {
    return compareVersions(current, required) >= 0;
}

function compareVersions(v1: any, v2: any): number {
    const cleanV1 = String(v1 || '2.7').replace(/[^\d.]/g, '');
    const cleanV2 = String(v2 || '1.0').replace(/[^\d.]/g, '');

    const finalV1 = cleanV1 === '' ? '2.7' : cleanV1;
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

/**
 * 핵심 실시간 진단 실행 엔진
 */
export function refreshDiagnostics(document: vscode.TextDocument, hubClient: any) {
    if (!document) return;

    try {
        const entries: vscode.Diagnostic[] = [];
        const lineCount = document.lineCount;

        // 🌟 [버전 객체 트랩 분쇄]
        let currentVersion = '2.7';
        const scriptTopVersion = parseScriptVersionFromText(document);
        
        if (scriptTopVersion) {
            currentVersion = scriptTopVersion;
        } else if (hubClient) {
            try {
                const syncData = hubClient.getSyncData();
                if (syncData && syncData.version) {
                    const rawV = syncData.version;
                    if (typeof rawV === 'object') {
                        currentVersion = rawV.version || rawV.name || (rawV.major !== undefined ? `${rawV.major}.${rawV.minor || 0}` : '2.7');
                    } else {
                        currentVersion = String(rawV);
                    }
                }
            } catch (e) {}
        }

        currentVersion = String(currentVersion).replace(/[^\d.]/g, '');
        if (currentVersion === '' || currentVersion.includes('object')) {
            currentVersion = '2.7';
        }

        // 🌟 [핵심 수술 부위: 절대 경로 락 패치 완료]
        let syntaxPath = path.join(extensionRootPath, 'out', 'resource', 'core_syntax.json');
        
        if (!fs.existsSync(syntaxPath)) {
            syntaxPath = path.join(extensionRootPath, 'src', 'resource', 'core_syntax.json');
        }
        
        const fileExists = fs.existsSync(syntaxPath);
        let syntaxDb: any = null;
        let loadStatusText = '🚨 core_syntax.json 파일 유실됨';

        if (fileExists) {
            try {
                syntaxDb = JSON.parse(fs.readFileSync(syntaxPath, 'utf-8'));
                loadStatusText = '🟢 성공 (자원 바인딩 락 완료)';
            } catch (jsonErr: any) {
                loadStatusText = `❌ JSON 문법 에러: ${jsonErr.message}`;
            }
        }

        console.log(`[Vskript] 진단 데이터 락 경로: ${path.basename(syntaxPath)} | 규격: v${currentVersion} | 결과: ${loadStatusText}`);

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

            // 🌟 [임시 조치 레이어] 애드온 구문 데이터 정밀 수집 전까지 가짜 경고 차단을 위해 'false'로 강제 락 처리 (Bypass)
            const enableSyntaxCheck = false; 
            
            if (enableSyntaxCheck && syntaxDb) {
                for (const key in syntaxDb) {
                    const syntax = syntaxDb[key];
                    if (!syntax || !syntax.name || !syntax.type || !syntax.patterns) continue;

                    const koDesc = syntax.description && syntax.description.ko ? String(syntax.description.ko) : "";
                    const isCore = koDesc.includes("공식 코어 구문") || String(syntax.addon).toLowerCase() === 'skript';
                    
                    let displayAddonName = isCore ? "Skript" : (syntax.addon ? String(syntax.addon) : "외부 애드온");
                    if (!isCore && koDesc.includes(":")) {
                        displayAddonName = koDesc.split("구문입니다")[0].trim();
                    } else if (!isCore) {
                        displayAddonName = String(syntax.name);
                    }

                    let rawAdded = "1.0";
                    if (syntax.added) {
                        rawAdded = Array.isArray(syntax.added) ? String(syntax.added[0] || "1.0") : String(syntax.added);
                    }
                    const versionMatch = rawAdded.match(/([0-9.]+)/);
                    const requiredVersion = versionMatch ? versionMatch[1] : "1.0";

                    const pureKeywords = ["stop", "else", "then", "implicit"];
                    if (pureKeywords.includes(String(syntax.name).toLowerCase().trim())) continue;

                    if (!isVersionCompatible(currentVersion, requiredVersion)) {
                        syntax.patterns.forEach((pattern: string) => {
                            let regexStr = pattern
                                .replace(/[\[\]\^]/g, '')
                                .replace(/\(.+?\)/g, '.*')
                                .replace(/<.+?>/g, '.+')
                                .trim();

                            try {
                                const matchRegex = new RegExp(`\\b${regexStr}\\b`, 'i');
                                if (matchRegex.test(cleanText)) {
                                    let alertMessage = "";
                                    if (isCore) {
                                        alertMessage = `⚠️ [vskript 버전 미달] 이 구문은 Skript 규격 v${requiredVersion} 이상부터 지원됩니다. (현재 파일 설정: v${currentVersion})`;
                                    } else {
                                        alertMessage = `🔌 [vskript 애드온 요구] 과거 버전 환경(v${currentVersion})에서 이 구문을 구동하려면 [${displayAddonName}] 관련 플러그인이 필요합니다. (요구 사양: v${requiredVersion}+)`;
                                    }

                                    const startChar = text.indexOf(text.trim());
                                    const endChar = text.length;
                                    const range = new vscode.Range(i, startChar, i, endChar);

                                    const diagnostic = new vscode.Diagnostic(
                                        range,
                                        alertMessage,
                                        vscode.DiagnosticSeverity.Warning
                                    );
                                    diagnostic.code = 'vskript-version-mismatch';
                                    entries.push(diagnostic);
                                }
                            } catch (e) {}
                        });
                    }
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