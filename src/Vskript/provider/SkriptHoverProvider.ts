import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as Skript from "../Skript";

/**
 * [Step 9 고도화] 설정창 분기 연동형 다기능 호버 제공자
 */
export class SkriptHoverProvider implements vscode.HoverProvider {

    public provideHover(document: vscode.TextDocument, position: vscode.Position) {
        const lineText = document.lineAt(position.line).text;

        // 🌟 [엔진 1] 옵션 패턴 정밀 포착: {@이름} 및 {@분류.이름} 형태 추적
        const optionRegex = /\{@([a-zA-Z0-9_\.]+)\}/g;
        let match;
        let targetOptionName: string | undefined = undefined;
        let hoverRange: vscode.Range | undefined = undefined;

        while ((match = optionRegex.exec(lineText)) !== null) {
            const startIdx = match.index;
            const endIdx = optionRegex.lastIndex;
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
            const optionDefRegex = new RegExp(`^\\s*${targetOptionName.replace(/\./g, '\\.')}\\s*:\\s*(.*)`, 'i');
            let foundValue: string | undefined = undefined;

            for (let i = 0; i < document.lineCount; i++) {
                const m = document.lineAt(i).text.match(optionDefRegex);
                if (m) { foundValue = m[1].trim(); break; }
            }

            if (!foundValue) {
                for (const openDoc of vscode.workspace.textDocuments) {
                    if (!openDoc.uri.fsPath.endsWith('.sk')) continue;
                    for (let i = 0; i < openDoc.lineCount; i++) {
                        const m = openDoc.lineAt(i).text.match(optionDefRegex);
                        if (m) { foundValue = m[1].trim(); break; }
                    }
                    if (foundValue) break;
                }
            }

            if (!foundValue) {
                for (const skDoc of Skript.DOCUMENTS) {
                    const fsPath = skDoc.skPath.fsPath;
                    if (!fs.existsSync(fsPath)) continue;
                    const content = fs.readFileSync(fsPath, 'utf-8');
                    const lines = content.split(/\r?\n/);
                    for (const line of lines) {
                        const m = line.match(optionDefRegex);
                        if (m) { foundValue = m[1].trim(); break; }
                    }
                    if (foundValue) break;
                }
            }

            if (foundValue) {
                const md = new vscode.MarkdownString();
                md.appendMarkdown(`### ⚙️ Option: **${targetOptionName}**\n`);
                md.appendMarkdown(`---\n`);
                md.appendCodeblock(foundValue, 'vskript');
                return new vscode.Hover(md, hoverRange);
            }
            return null;
        }

        // ==========================================
        // 🎯 [분기 B] 일반 단어 (커스텀 함수) 호버 가이드 로직
        // ==========================================
        const wordRange = document.getWordRangeAtPosition(position, /[a-zA-Z0-9_]+/);
        if (!wordRange) return null;

        const word = document.getText(wordRange).trim();
        const functionRegex = new RegExp(`^\\s*function\\s+${this.escapeRegExp(word)}\\b`, 'i');
        
        // 🌟 사용자 설정 읽어오기 (기본값: 'description')
        const config = vscode.workspace.getConfiguration('vskript');
        const hoverMode = config.get<string>('hoverContentMode', 'description');

        // 1단계: 메모리 활성 문서 스캔
        for (const openDoc of vscode.workspace.textDocuments) {
            if (!openDoc.uri.fsPath.endsWith('.sk')) continue;
            for (let i = 0; i < openDoc.lineCount; i++) {
                if (functionRegex.test(openDoc.lineAt(i).text)) {
                    return this._buildFunctionHover(openDoc.lineAt(i).text, i, openDoc, wordRange, hoverMode);
                }
            }
        }

        // 2단계: 오프라인 캐시 문서 스캔
        try {
            for (const skDoc of Skript.DOCUMENTS) {
                const fsPath = skDoc.skPath.fsPath;
                if (!fs.existsSync(fsPath)) continue;

                const content = fs.readFileSync(fsPath, { encoding: 'utf-8' });
                const lines = content.split(/\r?\n/);

                for (let i = 0; i < lines.length; i++) {
                    if (functionRegex.test(lines[i])) {
                        const md = new vscode.MarkdownString();
                        
                        if (hoverMode === 'code') {
                            const bodyCode = this._extractCodeBodyFromLines(lines, i);
                            md.appendCodeblock(bodyCode, 'vskript');
                        } else {
                            md.appendCodeblock(lines[i].trim(), 'vskript');
                            md.appendMarkdown(`\n---\n*원격 파일에 상주 중입니다. 본문을 보려면 설정을 code 모드로 변경하세요.*`);
                        }
                        return new vscode.Hover(md, wordRange);
                    }
                }
            }
        } catch (error) {
            console.error("🚨 [SkriptHoverProvider] 캐시 서치 예외 방어:", error);
        }

        return null;
    }

    /**
     * 설정 분기(description vs code)에 따라 마크다운 팝업을 빌드하는 핵심 서브 브릿지
     */
    private _buildFunctionHover(headerLine: string, lineIdx: number, document: vscode.TextDocument, range: vscode.Range, mode: string): vscode.Hover {
        const md = new vscode.MarkdownString();
        
        if (mode === 'code') {
            // 🔥 [실시간 코드 추적] 함수의 선언부부터 하위 코드 블록 끝까지 통째로 긁어옵니다.
            const docLines = [];
            for (let i = 0; i < document.lineCount; i++) {
                docLines.push(document.lineAt(i).text);
            }
            const fullBody = this._extractCodeBodyFromLines(docLines, lineIdx);
            md.appendCodeblock(fullBody, 'vskript');
            md.appendMarkdown(`\n---\n*💡 팁: 설명 주석을 보려면 hoverContentMode 설정을 변경하세요.*`);
        } else {
            // 기존 주석 설명문 모드
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
        }

        return new vscode.Hover(md, range);
    }

    /**
     * 함수의 인덴트 구조를 정밀 연산하여 소스코드 본문 영역만 도려내는 파서
     */
    private _extractCodeBodyFromLines(lines: string[], startIdx: number): string {
        const bodyLines = [lines[startIdx]];
        let nextIdx = startIdx + 1;
        
        while (nextIdx < lines.length) {
            const line = lines[nextIdx];
            // 빈 라인이거나 주석은 무조건 구조에 포함하여 연속성 보장
            if (line.trim() === '' || line.trim().startsWith('#')) {
                bodyLines.push(line);
                nextIdx++;
                continue;
            }

            // 첫 번째 실제 코드가 나왔을 때 들여쓰기가 존재하지 않는다면 함수가 완전히 끝난 것임
            const match = line.match(/^([\s\t]+)/);
            if (!match) break; 

            bodyLines.push(line);
            nextIdx++;
        }
        
        return bodyLines.join('\n');
    }

    private escapeRegExp(string: string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}