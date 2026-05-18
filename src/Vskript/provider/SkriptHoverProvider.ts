import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as Skript from "../Skript";

/**
 * [Step 9 고도화] 옵션 실시간 마크다운 팝업 가이드 및 호버 제공자
 */
export class SkriptHoverProvider implements vscode.HoverProvider {

    public provideHover(document: vscode.TextDocument, position: vscode.Position) {
        const lineText = document.lineAt(position.line).text;

        // 🌟 [엔진 1] 옵션 패턴 정밀 포착: {@이름} 및 {@분류.이름} 형태 추적 (마침표 포함)
        const optionRegex = /\{@([a-zA-Z0-9_\.]+)\}/g;
        let match;
        let targetOptionName: string | undefined = undefined;
        let hoverRange: vscode.Range | undefined = undefined;

        while ((match = optionRegex.exec(lineText)) !== null) {
            const startIdx = match.index;
            const endIdx = optionRegex.lastIndex;
            // 마우스 커서가 {@ ... } 문자열 영역 내부에 머물고 있는지 확인
            if (position.character >= startIdx && position.character <= endIdx) {
                targetOptionName = match[1];
                hoverRange = new vscode.Range(position.line, startIdx, position.line, endIdx);
                break;
            }
        }

        // ==========================================
        // 🎯 [분기 A] 옵션 호버 팝업 출력 로직
        // ==========================================
        if (targetOptionName) {
            // 옵션 정의 검출용 정규식 (ex: 이름: 값)
            const optionDefRegex = new RegExp(`^\\s*${targetOptionName.replace(/\./g, '\\.')}\\s*:\\s*(.*)`, 'i');
            let foundValue: string | undefined = undefined;

            // 1단계: 현재 파일 내부에서 옵션 정의문 우선 서치
            for (let i = 0; i < document.lineCount; i++) {
                const m = document.lineAt(i).text.match(optionDefRegex);
                if (m) {
                    foundValue = m[1].trim();
                    break;
                }
            }

            // 2단계: 파일 내에 없다면 메모리에 상주 중인 다른 .sk 파일 전수조사
            if (!foundValue) {
                for (const openDoc of vscode.workspace.textDocuments) {
                    if (!openDoc.uri.fsPath.endsWith('.sk')) continue;
                    for (let i = 0; i < openDoc.lineCount; i++) {
                        const m = openDoc.lineAt(i).text.match(optionDefRegex);
                        if (m) {
                            foundValue = m[1].trim();
                            break;
                        }
                    }
                    if (foundValue) break;
                }
            }

            // 3단계: 디스크 상의 다른 인덱싱 파일 전수조사 (최후의 보루)
            if (!foundValue) {
                for (const skDoc of Skript.DOCUMENTS) {
                    const fsPath = skDoc.skPath.fsPath;
                    if (!fs.existsSync(fsPath)) continue;
                    const content = fs.readFileSync(fsPath, 'utf-8');
                    const lines = content.split(/\r?\n/);
                    for (const line of lines) {
                        const m = line.match(optionDefRegex);
                        if (m) {
                            foundValue = m[1].trim();
                            break;
                        }
                    }
                    if (foundValue) break;
                }
            }

            // 값을 찾았다면 예쁜 마크다운 팝업 박스 빌드
            if (foundValue) {
                const md = new vscode.MarkdownString();
                md.appendMarkdown(`### Option: **${targetOptionName}**\n`);
                md.appendMarkdown(`---\n`);
                md.appendCodeblock(foundValue, 'vskript');
                return new vscode.Hover(md, hoverRange);
            }
            return null;
        }

        // ==========================================
        // 🎯 [분기 B] 일반 단어 (커스텀 함수) 호버 가이드 로직 (기존 구조 최적화)
        // ==========================================
        const wordRange = document.getWordRangeAtPosition(position, /[a-zA-Z0-9_]+/);
        if (!wordRange) return null;

        const word = document.getText(wordRange).trim();

        // 메모리 상주 파일에서 함수 선언부 매칭
        const functionRegex = new RegExp(`^\\s*function\\s+${this.escapeRegExp(word)}\\b`, 'i');
        
        for (const openDoc of vscode.workspace.textDocuments) {
            if (!openDoc.uri.fsPath.endsWith('.sk')) continue;
            for (let i = 0; i < openDoc.lineCount; i++) {
                const headerLine = openDoc.lineAt(i).text;
                if (functionRegex.test(headerLine)) {
                    return this._buildFunctionHover(headerLine, i, openDoc, wordRange);
                }
            }
        }

        // 디스크 최소화 파일 매칭
        try {
            for (const skDoc of Skript.DOCUMENTS) {
                const fsPath = skDoc.skPath.fsPath;
                if (!fs.existsSync(fsPath)) continue;

                const content = fs.readFileSync(fsPath, { encoding: 'utf-8' });
                const lines = content.split(/\r?\n/);

                for (let i = 0; i < lines.length; i++) {
                    if (functionRegex.test(lines[i])) {
                        const md = new vscode.MarkdownString();
                        md.appendCodeblock(lines[i].trim(), 'vskript');
                        md.appendMarkdown(`\n---\n*원격 인덱스 파일에서 로드됨: ${path.basename(fsPath)}*`);
                        return new vscode.Hover(md, wordRange);
                    }
                }
            }
        } catch (error) {
            console.error("🚨 [SkriptHoverProvider] 예외 발생:", error);
        }

        return null;
    }

    private _buildFunctionHover(headerLine: string, lineIdx: number, document: vscode.TextDocument, range: vscode.Range): vscode.Hover {
        const md = new vscode.MarkdownString();
        md.appendCodeblock(headerLine.trim(), 'vskript');
        md.appendMarkdown(`\n---\n`);

        let commentContent = '';
        let nextLineIdx = lineIdx + 1;
        const totalLines = document.lineCount;

        while (nextLineIdx < totalLines) {
            const nextLineText = document.lineAt(nextLineIdx).text.trim();
            if (nextLineText.startsWith('#>')) {
                commentContent += nextLineText.substring(2).trim() + '  \n';
                nextLineIdx++;
            } else if (nextLineText === '' || nextLineText.startsWith('#')) {
                nextLineIdx++;
            } else {
                break;
            }
        }

        md.appendMarkdown(commentContent || `*작성된 Hover 주석 가이드가 없습니다.*`);
        return new vscode.Hover(md, range);
    }

    private escapeRegExp(string: string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}