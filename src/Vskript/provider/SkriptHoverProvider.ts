import { Hover, HoverProvider, MarkdownString, Position, Range, TextDocument } from 'vscode';
import * as fs from 'fs';
import * as Skript from "../Skript";

/**
 * [2단계 Step 8] 호버(Hover) 안내 기능 제공자 (마크다운 가독성 개량 버전)
 */
export class SkriptHoverProvider implements HoverProvider {

    public provideHover(document: TextDocument, position: Position) {
        console.log(`=== 🟢 [vskript 호버] 마우스 호버 감지 시작! (라인: ${position.line}, 칸: ${position.character}) ===`);

        const currentLineText = document.lineAt(position.line).text;
        const charIdx = position.character;
        const isWordChar = (ch: string) => /[a-zA-Z0-9_]/.test(ch);

        if (charIdx < 0 || charIdx > currentLineText.length) return null;

        // 수동 단어 추출
        let start = charIdx;
        if (start > 0 && !isWordChar(currentLineText[start]) && isWordChar(currentLineText[start - 1])) {
            start--;
        }
        while (start > 0 && isWordChar(currentLineText[start - 1])) {
            start--;
        }
        let end = charIdx;
        while (end < currentLineText.length && isWordChar(currentLineText[end])) {
            end++;
        }

        const word = currentLineText.substring(start, end).trim();
        console.log(`🔍 [vskript 호버] 추출된 타겟 단어: [ ${word} ]`);

        if (!word) return null;

        const hoverRange = new Range(new Position(position.line, start), new Position(position.line, end));

        // [케이스 A] 옵션 변수 호버 처리
        const isOptionCall = currentLineText.substring(Math.max(0, start - 2), start) === '{@';
        if (isOptionCall || currentLineText.includes(`{@${word}}`)) {
            const fileLineCount = document.lineCount;
            for (let i = 0; i < fileLineCount; i++) {
                const text = document.lineAt(i).text.trim();
                if (text.startsWith(`${word}:`) || text.replace(/\s+/g, '').startsWith(`${word}:`)) {
                    const optionValue = text.substring(text.indexOf(':') + 1).trim();
                    
                    const md = new MarkdownString();
                    md.appendMarkdown(`**💡 Vskript Option 정보**\n\n`);
                    md.appendCodeblock(optionValue, 'vskript');
                    return new Hover(md, hoverRange);
                }
            }
        }

        // [케이스 B] 함수(Function) 호버 처리
        const fileLineCount = document.lineCount;
        for (let i = 0; i < fileLineCount; i++) {
            const text = document.lineAt(i).text;
            const functionRegex = new RegExp(`^\\s*function\\s+${this.escapeRegExp(word)}\\b`, 'i');

            if (functionRegex.test(text)) {
                return this._buildFunctionHover(text, i, document, hoverRange);
            }
        }

        // 전역 캐시 배열 스캔 (외부 파일 함수 발견 시)
        try {
            const allDocs = Skript.DOCUMENTS;
            if (allDocs && Array.isArray(allDocs)) {
                for (const skDoc of allDocs) {
                    if (!skDoc || !skDoc.skPath) continue;
                    const fsPath = skDoc.skPath.fsPath;
                    if (!fsPath || !fs.existsSync(fsPath)) continue;

                    const content = fs.readFileSync(fsPath, { encoding: 'utf-8' });
                    const lines = content.split(/\r?\n/);

                    for (let i = 0; i < lines.length; i++) {
                        const functionRegex = new RegExp(`^\\s*function\\s+${this.escapeRegExp(word)}\\b`, 'i');
                        if (functionRegex.test(lines[i])) {
                            const md = new MarkdownString();
                            md.appendCodeblock(lines[i].trim(), 'vskript');
                            md.appendMarkdown(`\n---\n`);

                            let commentContent = '';
                            let nextLineIdx = i + 1;
                            while (nextLineIdx < lines.length) {
                                const nextLineText = lines[nextLineIdx].trim();
                                if (nextLineText.startsWith('#>')) {
                                    // ⭐ 마크다운 문법상 줄 끝에 공백 2칸('  \n')이 있어야 강제 줄바꿈이 일어납니다!
                                    commentContent += nextLineText.substring(2).trim() + '  \n';
                                    nextLineIdx++;
                                } else if (nextLineText === '' || nextLineText.startsWith('#')) {
                                    nextLineIdx++;
                                } else {
                                    break;
                                }
                            }
                            md.appendMarkdown(commentContent || `*작성된 Hover 가이드 문서가 없습니다.*`);
                            return new Hover(md, hoverRange);
                        }
                    }
                }
            }
        } catch (error) {
            console.error("🚨 [SkriptHoverProvider] 예외 발생:", error);
        }

        return null;
    }

    /**
     * 함수 설명 주석 수집 및 호버 객체 빌드
     */
    private _buildFunctionHover(headerLine: string, lineIdx: number, document: TextDocument, range: Range): Hover {
        const md = new MarkdownString();
        md.appendCodeblock(headerLine.trim(), 'vskript');
        md.appendMarkdown(`\n---\n`);

        let commentContent = '';
        let nextLineIdx = lineIdx + 1;
        const totalLines = document.lineCount;

        while (nextLineIdx < totalLines) {
            const nextLineText = document.lineAt(nextLineIdx).text.trim();
            if (nextLineText.startsWith('#>')) {
                // ⭐ 개별 가이드라인 끝에 스페이스바 2칸('  \n')을 확보하여 가독성을 높입니다.
                commentContent += nextLineText.substring(2).trim() + '  \n';
                nextLineIdx++;
            } else if (nextLineText === '' || nextLineText.startsWith('#')) {
                nextLineIdx++;
            } else {
                break;
            }
        }

        md.appendMarkdown(commentContent || `*작성된 Hover 가이드 문서가 없습니다.*`);
        return new Hover(md, range);
    }

    private escapeRegExp(string: string): string {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}