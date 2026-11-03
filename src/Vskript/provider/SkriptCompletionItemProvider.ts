import * as vscode from 'vscode';
import { buildSyntaxMarkdown, getSyntaxRegistry, SyntaxEntry } from '../syntax/SyntaxRegistry';

/**
 * 구문 자동완성.
 * 구문 데이터는 SyntaxRegistry(번들 core + 내려받은 DataPack)에서만 가져오며,
 * 현재 Skript/애드온 버전에서 유효한 구문만 제안한다.
 * 설명(문서)은 항목을 선택했을 때 resolveCompletionItem에서 만든다.
 */
export class SkriptCompletionItemProvider implements vscode.CompletionItemProvider {

    private readonly entryOf = new WeakMap<vscode.CompletionItem, SyntaxEntry>();

    public provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken,
        _context: vscode.CompletionContext,
    ): vscode.CompletionItem[] {
        const completionItems: vscode.CompletionItem[] = [];
        const currentLineText = document.lineAt(position.line).text;
        const linePrefix = currentLineText.substring(0, position.character);

        // 옵션 변수({@옵션}) 추천
        const optionMatch = linePrefix.match(/\{@([a-zA-Z0-9_]*)$/i);
        if (optionMatch) {
            return this.optionItems(document, position, currentLineText, optionMatch[1]);
        }

        const isWordChar = (ch: string) => /[a-zA-Z0-9_]/.test(ch);
        let wordStart = position.character;
        while (wordStart > 0 && isWordChar(currentLineText[wordStart - 1])) {
            wordStart--;
        }
        const keywordRange = new vscode.Range(position.line, wordStart, position.line, position.character);

        const coreKeywords = [
            { label: 'on load:', detail: '이벤트: 스크립트 로드 시 실행' },
            { label: 'command /', detail: '명령어: 신규 커맨드 정의' },
            { label: 'trigger:', detail: '구문: 명령어 실행 블록 시작' },
        ];
        for (const kw of coreKeywords) {
            const item = new vscode.CompletionItem(kw.label, vscode.CompletionItemKind.Keyword);
            item.detail = kw.detail;
            item.range = keywordRange;
            completionItems.push(item);
        }

        const registry = getSyntaxRegistry();
        if (!registry) {return completionItems;}

        const ctx = registry.contextFor(document);
        const seen = new Set<string>();
        for (const entry of registry.getAvailable(ctx)) {
            for (const pattern of entry.patterns) {
                const label = pattern.label;
                const dedupeKey = `${entry.addonKey}|${label.toLowerCase()}`;
                if (!label || seen.has(dedupeKey)) {continue;}
                seen.add(dedupeKey);

                const item = new vscode.CompletionItem(
                    { label, description: entry.addon },
                    this.getKindByType(entry.type),
                );
                item.detail = `[${entry.addon} ${entry.type}]${entry.validFromText ? ` since ${entry.validFromText}` : ''}`;
                item.range = keywordRange;
                item.filterText = label;
                item.insertText = label;
                this.entryOf.set(item, entry);
                completionItems.push(item);
            }
        }

        return completionItems;
    }

    public resolveCompletionItem(item: vscode.CompletionItem): vscode.CompletionItem {
        const entry = this.entryOf.get(item);
        if (entry) {
            const language = vscode.workspace.getConfiguration('vskript').get<string>('language') || 'en';
            item.documentation = buildSyntaxMarkdown(entry, language, null);
        }
        return item;
    }

    private optionItems(document: vscode.TextDocument, position: vscode.Position, currentLineText: string, typedText: string): vscode.CompletionItem[] {
        const items: vscode.CompletionItem[] = [];
        const startChar = position.character - typedText.length - 2;
        let endChar = position.character;
        if (endChar < currentLineText.length && currentLineText[endChar] === '}') {endChar++;}
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
                    items.push(item);
                }
            }
        }
        return items;
    }

    private getKindByType(type: string): vscode.CompletionItemKind {
        switch (type) {
            case 'event': return vscode.CompletionItemKind.Event;
            case 'section':
            case 'structure': return vscode.CompletionItemKind.Struct;
            case 'effect': return vscode.CompletionItemKind.Method;
            case 'condition': return vscode.CompletionItemKind.TypeParameter;
            case 'function': return vscode.CompletionItemKind.Function;
            case 'type': return vscode.CompletionItemKind.Class;
            default: return vscode.CompletionItemKind.Property;
        }
    }
}
