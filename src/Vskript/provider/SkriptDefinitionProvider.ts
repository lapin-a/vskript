import * as vscode from 'vscode';
import * as fs from 'fs';
import * as Skript from '../Skript';

/**
 * [2단계 Step 7] 정의 이동(Go to Definition) 제공자 (API 의존성 제거 버전)
 */
export class SkriptDefinitionProvider implements vscode.DefinitionProvider {
    public provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Definition | vscode.LocationLink[]> {
        
        // 1. [빨간 줄 원인 차단] VS Code API를 쓰지 않고 현재 줄 텍스트에서 직접 단어를 추출합니다.
        const currentLineText = document.lineAt(position.line).text;
        const charIdx = position.character;
        
        const isWordChar = (ch: string) => /[a-zA-Z0-9_]/.test(ch);

        // 커서 위치가 올바른 글자 범위 내에 있는지 검사
        if (charIdx < 0 || charIdx > currentLineText.length) return null;

        // 마우스 커서 왼쪽 방향으로 단어의 시작 인덱스 추적
        let start = charIdx;
        if (start > 0 && !isWordChar(currentLineText[start]) && isWordChar(currentLineText[start - 1])) {
            start--;
        }
        while (start > 0 && isWordChar(currentLineText[start - 1])) {
            start--;
        }

        // 마우스 커서 오른쪽 방향으로 단어의 끝 인덱스 추적
        let end = charIdx;
        while (end < currentLineText.length && isWordChar(currentLineText[end])) {
            end++;
        }

        const word = currentLineText.substring(start, end).trim();
        if (!word) return null;

        // 2. 현재 파일 내부에서 실시간 라인 단위 검색
        const lineCount = document.lineCount;
        for (let i = 0; i < lineCount; i++) {
            const lineText = document.lineAt(i).text;
            const functionRegex = new RegExp(`^\\s*function\\s+${this.escapeRegExp(word)}\\b`, 'i');
            
            if (functionRegex.test(lineText)) {
                return new vscode.Location(document.uri, new vscode.Range(i, 0, i, lineText.length));
            }
        }

        // 3. [Skript.ts 맞춤] DOCUMENTS 글로벌 배열을 전역 순회하여 검색 (외부 파일 탐색)
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
                            return new vscode.Location(
                                vscode.Uri.file(fsPath),
                                new vscode.Range(i, 0, i, lines[i].length)
                            );
                        }
                    }
                }
            }
        } catch (error) {
            console.error("🚨 [SkriptDefinitionProvider] 전역 탐색 중 예외 발생:", error);
        }

        return null;
    }

    private escapeRegExp(string: string): string {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}