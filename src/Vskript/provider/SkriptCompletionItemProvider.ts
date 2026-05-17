import * as vscode from 'vscode';
import * as fs from 'fs';
import * as Skript from '../Skript';

/**
 * [2단계 Step 9] 자동 완성(Completion Item) 제공자 (필터 우회 최종판)
 */
export class SkriptCompletionItemProvider implements vscode.CompletionItemProvider {
    
    public provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
        
        console.log(`=== 🔵 [vskript 자동완성] 작동 개시! 트리거 사유 유형: ${context.triggerKind} (입력 캐릭터: ${context.triggerCharacter}) ===`);

        const completionItems: vscode.CompletionItem[] = [];
        const currentLineText = document.lineAt(position.line).text;
        const linePrefix = currentLineText.substring(0, position.character);
        const fileLineCount = document.lineCount;

        // 1. 수동 단어 범위 계산
        const isWordChar = (ch: string) => /[a-zA-Z0-9_]/.test(ch);
        let wordStart = position.character;
        while (wordStart > 0 && isWordChar(currentLineText[wordStart - 1])) {
            wordStart--;
        }

        let keywordRange = new vscode.Range(position.line, wordStart, position.line, position.character);
        if (wordStart >= 3 && currentLineText.substring(wordStart - 3, wordStart).toLowerCase() === 'on ') {
            keywordRange = new vscode.Range(position.line, wordStart - 3, position.line, position.character);
        } else if (wordStart >= 8 && currentLineText.substring(wordStart - 8, wordStart).toLowerCase() === 'command ') {
            keywordRange = new vscode.Range(position.line, wordStart - 8, position.line, position.character);
        }

        const coreKeywords = [
            { label: 'on load:', detail: '이벤트: 스크립트가 로드될 때 실행' },
            { label: 'on join:', detail: '이벤트: 플레이어가 서버에 접속할 때 실행' },
            { label: 'command /', detail: '명령어: 새로운 명령어 정의 블록 생성' },
            { label: 'trigger:', detail: '구문: 명령어 실행부 블록 시작' },
            { label: 'broadcast ', detail: '이펙트: 서버 전체에 메시지 공지' },
            { label: 'send ', detail: '이펙트: 특정 대상에게 메시지 전송' },
            { label: 'cancel event', detail: '이펙트: 현재 이벤트 발생을 취소' },
            { label: 'stop', detail: '구문: 코드 실행을 즉시 중단' }
        ];

        coreKeywords.forEach(kw => {
            const item = new vscode.CompletionItem(kw.label, vscode.CompletionItemKind.Keyword);
            item.detail = kw.detail;
            item.range = keywordRange;
            completionItems.push(item);
        });


        // 2. [옵션 영역] VS Code 필터 강제 우회 및 자동 닫힘 괄호 파괴 알고리즘
        const optionMatch = linePrefix.match(/\{@([a-zA-Z0-9_]*)$/i);
        console.log(`🔍 [vskript 자동완성] 현재 라인 문자열: "${linePrefix}" | 옵션 매칭 성공 여부: ${!!optionMatch}`);

        const foundOptions: { key: string, value: string }[] = [];
        for (let i = 0; i < fileLineCount; i++) {
            const text = document.lineAt(i).text.trim();
            if (text.startsWith('#')) continue;

            if (text.includes(':') && !text.startsWith('function') && !text.startsWith('on ') && !text.startsWith('command') && !text.endsWith(':')) {
                const parts = text.split(':');
                const key = parts[0].trim();
                if (key && /^[a-zA-Z0-9_]+$/.test(key)) {
                    const val = parts.slice(1).join(':').trim();
                    foundOptions.push({ key, value: val });
                }
            }
        }
        
        console.log(`⚙️ [vskript 자동완성] 현재 스크립트 파일 안에서 추출해낸 총 옵션 변수 개수: ${foundOptions.length}개`);

        if (optionMatch) {
            const typedText = optionMatch[1];
            const startChar = position.character - typedText.length - 2; 
            
            let endChar = position.character;
            if (endChar < currentLineText.length && currentLineText[endChar] === '}') {
                endChar++; 
            }

            const optionRange = new vscode.Range(position.line, startChar, position.line, endChar);

            foundOptions.forEach(opt => {
                const item = new vscode.CompletionItem(`{@${opt.key}}`, vscode.CompletionItemKind.Variable);
                item.detail = `Option 변수 값: ${opt.value}`;
                item.documentation = new vscode.MarkdownString(`현재 파일의 \`options:\` 세션 값인 \`${opt.value}\`을 불러옵니다.`);
                
                item.range = optionRange; 
                item.insertText = `{@${opt.key}}`;
                
                // ⭐ [핵심 치트키] VS Code가 특수문자 기호 때문에 목록을 숨기지 못하도록 필터 텍스트를 강제 수동 동기화합니다!
                item.filterText = `{@${opt.key}`; 
                
                completionItems.push(item);
            });
        } else {
            foundOptions.forEach(opt => {
                const item = new vscode.CompletionItem(`{@${opt.key}}`, vscode.CompletionItemKind.Variable);
                item.detail = `Option 변수 값: ${opt.value}`;
                completionItems.push(item);
            });
        }


        // 3. [함수 영역] 전역 함수 수집 및 추천
        try {
            const allDocs = Skript.DOCUMENTS;
            if (allDocs && Array.isArray(allDocs)) {
                const uniqueFunctions = new Set<string>();
                for (const skDoc of allDocs) {
                    if (!skDoc || !skDoc.skPath) continue;
                    const fsPath = skDoc.skPath.fsPath;
                    if (!fsPath || !fs.existsSync(fsPath)) continue;

                    const content = fs.readFileSync(fsPath, { encoding: 'utf-8' });
                    const lines = content.split(/\r?\n/);
                    for (const line of lines) {
                        const match = line.match(/^\s*function\s+([a-zA-Z0-9_]+)\b/i);
                        if (match && match[1]) {
                            uniqueFunctions.add(match[1]);
                        }
                    }
                }
                uniqueFunctions.forEach(funcName => {
                    const item = new vscode.CompletionItem(`${funcName}`, vscode.CompletionItemKind.Function);
                    item.detail = `vskript 프로젝트 정의 함수`;
                    item.insertText = new vscode.SnippetString(`${funcName}(\${1})`);
                    completionItems.push(item);
                });
            }
        } catch (error) {
            console.error("🚨 [SkriptCompletionItemProvider] 전역 함수 수집 오류:", error);
        }

        console.log(`🚀 [vskript 자동완성] 최종 반환할 총 리스트 개수: ${completionItems.length}개`);
        return completionItems;
    }
}