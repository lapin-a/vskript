import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * [Step 9 무결점 고도화] 엄격모드 규격 반영 자동완성 엔진
 */
export class SkriptCompletionItemProvider implements vscode.CompletionItemProvider {
    
    public provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken,  // 🌟 [Strict 방어] 사용하지 않는 매개변수 접두사(_) 처리
        _context: vscode.CompletionContext // 🌟 [Strict 방어] 사용하지 않는 매개변수 접두사(_) 처리
    ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
        
        const completionItems: vscode.CompletionItem[] = [];
        const currentLineText = document.lineAt(position.line).text;
        const linePrefix = currentLineText.substring(0, position.character);

        // VS Code 설정에서 언어 가져오기
        const userLanguage = vscode.workspace.getConfiguration('vskript').get<string>('language') || 'en';

        // 스크립트 버전 파싱
        const currentScriptVersion = this.parseScriptVersion(document);

        // 중복 입력 방지 범위 계산
        const isWordChar = (ch: string) => /[a-zA-Z0-9_]/.test(ch);
        let wordStart = position.character;
        while (wordStart > 0 && isWordChar(currentLineText[wordStart - 1])) {
            wordStart--;
        }
        const keywordRange = new vscode.Range(position.line, wordStart, position.line, position.character);

        // 기본 내장 키워드 주입
        const coreKeywords = [
            { label: 'on load:', detail: '이벤트: 스크립트 로드 시 실행' },
            { label: 'command /', detail: '명령어: 신규 커맨드 정의' },
            { label: 'trigger:', detail: '구문: 명령어 실행 블록 시작' }
        ];
        coreKeywords.forEach(kw => {
            const item = new vscode.CompletionItem(kw.label, vscode.CompletionItemKind.Keyword);
            item.detail = kw.detail;
            item.range = keywordRange;
            completionItems.push(item);
        });

        // core_syntax.json 공식 구문 처리
        try {
            // 🌟 [소문자 ID 및 다중 경로 추적] 컴파일 깊이와 관계없이 데이터를 완벽히 추적합니다.
            const extension = vscode.extensions.getExtension('vhone.vskript');
            const rootPath = extension ? extension.extensionPath : '';
            
            let syntaxPath = path.join(rootPath, 'core_syntax.json');
            let koDictPath = path.join(rootPath, 'assets', 'ko_dict.json');
            
            if (!rootPath || !fs.existsSync(syntaxPath)) {
                syntaxPath = path.join(__dirname, '..', '..', '..', 'core_syntax.json');
                koDictPath = path.join(__dirname, '..', '..', '..', 'assets', 'ko_dict.json');
            }
            if (!fs.existsSync(syntaxPath)) {
                syntaxPath = path.join(__dirname, '..', '..', 'core_syntax.json');
                koDictPath = path.join(__dirname, '..', '..', 'assets', 'ko_dict.json');
            }

            if (fs.existsSync(syntaxPath)) {
                const syntaxDb = JSON.parse(fs.readFileSync(syntaxPath, 'utf-8')) as Record<string, any>;
                
                let koDict: Record<string, string> = {};
                if (fs.existsSync(koDictPath)) {
                    koDict = JSON.parse(fs.readFileSync(koDictPath, 'utf-8')) as Record<string, string>;
                }

                for (const key in syntaxDb) {
                    const syntax = syntaxDb[key];
                    if (!syntax || !syntax.patterns) continue;

                    // 버전 필터링 대조
                    const requiredVersion = (syntax.added && syntax.added[0]) ? String(syntax.added[0]) : "1.0";
                    if (!this.isVersionCompatible(currentScriptVersion, requiredVersion)) {
                        continue; 
                    }

                    syntax.patterns.forEach((pattern: string) => {
                        const cleanLabel = pattern.replace(/[\[\]\^]/g, '').replace(/\(.+?\)/g, '').replace(/<.+?>/g, '...');
                        const item = new vscode.CompletionItem(cleanLabel, this.getKindByType(String(syntax.type)));
                        
                        item.detail = `[${String(syntax.type).toUpperCase()}] v${requiredVersion}+`;
                        
                        // 다국어 폴백 매트릭스 툴팁 빌드
                        const md = new vscode.MarkdownString();
                        md.appendMarkdown(`### 🛠️ Skript Core Syntax\n\n`);
                        md.appendMarkdown(`- **Name:** \`${String(syntax.name)}\`\n`);
                        md.appendMarkdown(`- **Addon:** \`${String(syntax.addon)}\`\n\n`);
                        md.appendMarkdown(`---\n\n`);

                        let descriptionText = "";

                        if (userLanguage === 'ko') {
                            if (koDict[syntax.name]) {
                                descriptionText = koDict[syntax.name]; 
                            } else if (syntax.description && syntax.description.ko) {
                                descriptionText = String(syntax.description.ko); 
                            } else if (syntax.description && syntax.description.en) {
                                descriptionText = Array.isArray(syntax.description.en) ? syntax.description.en.join('\n') : String(syntax.description.en); 
                            }
                        } else {
                            if (syntax.description && syntax.description.en) {
                                descriptionText = Array.isArray(syntax.description.en) ? syntax.description.en.join('\n') : String(syntax.description.en);
                            }
                        }

                        md.appendMarkdown(`**📢 Description:**\n${descriptionText}\n`);
                        item.documentation = md;
                        completionItems.push(item);
                    });
                }
            }
        } catch (error) {
            console.error("🚨 [SkriptCompletionItemProvider] 에러:", error);
        }

        // 옵션 변수({@옵션}) 추천 영역
        const optionMatch = linePrefix.match(/\{@([a-zA-Z0-9_]*)$/i);
        if (optionMatch) {
            const typedText = optionMatch[1];
            const startChar = position.character - typedText.length - 2;
            let endChar = position.character;
            if (endChar < currentLineText.length && currentLineText[endChar] === '}') endChar++;

            const optionRange = new vscode.Range(position.line, startChar, position.line, endChar);
            
            for (let i = 0; i < document.lineCount; i++) {
                const text = document.lineAt(i).text.trim();
                if (text.includes(':') && !text.startsWith('function') && !text.startsWith('on ') && !text.endsWith(':')) {
                    const parts = text.split(':');
                    const key = parts[0].trim();
                    if (key && /^[a-zA-Z0-9_]+$/.test(key)) {
                        const item = new vscode.CompletionItem(`{@${key}}`, vscode.CompletionItemKind.Variable);
                        item.detail = `Option 변수 값: ${parts.slice(1).join(':').trim()}`;
                        item.range = optionRange;
                        item.insertText = `{@${key}}`;
                        item.filterText = `{@${key}`;
                        completionItems.push(item);
                    }
                }
            }
        }

        return completionItems;
    }

    private parseScriptVersion(document: vscode.TextDocument): string {
        const scanLines = Math.min(document.lineCount, 10);
        for (let i = 0; i < scanLines; i++) {
            const text = document.lineAt(i).text;
            const match = text.match(/^\s*#\s*(?:version|v)\s*:\s*([0-9.]+)/i);
            if (match && match[1]) {
                return match[1].trim();
            }
        }
        return "2.7"; 
    }

    private isVersionCompatible(current: string, required: string): boolean {
        const reqMatch = required.match(/([0-9.]+)/);
        if (!reqMatch) return true;

        const currentParts = current.split('.').map(Number);
        const requiredParts = reqMatch[1].split('.').map(Number);

        for (let i = 0; i < Math.max(currentParts.length, requiredParts.length); i++) {
            const c = currentParts[i] || 0;
            const r = requiredParts[i] || 0;
            if (c > r) return true;
            if (c < r) return false;
        }
        return true;
    }

    private getKindByType(type: string): vscode.CompletionItemKind {
        switch (type?.toLowerCase()) {
            case 'event': return vscode.CompletionItemKind.Event;
            case 'section': return vscode.CompletionItemKind.Struct;
            case 'effect': return vscode.CompletionItemKind.Method;
            case 'condition': return vscode.CompletionItemKind.TypeParameter;
            default: return vscode.CompletionItemKind.Property;
        }
    }
}