import { CompletionItemProvider, CompletionItem, TextDocument, CompletionItemKind, SnippetString, CancellationToken, CompletionContext, Position } from 'vscode';
import * as Skript from '../Skript';
import { SkriptCommand, SkriptFunction, SkriptParagraphComponent } from '../SkriptComponent';
import { Materials as SkriptMaterials } from '../language/Materials';

/**
 * 1. 기본 키워드 및 최신 이벤트 리스트 업데이트
 */
const Components = (() => {
    let list = new Array<CompletionItem>();
    [   
        // 기존 항목
        {isKeyword: true, name:'aliases', snippet:'aliases:\r\n\t'},
        {isKeyword: true, name:'options', snippet:'options:\r\n\t'},
        {isKeyword: true, name:'command', snippet:'command /${1:label} ${2:arguments}:\r\n\ttrigger:\r\n\t\t'},
        {isKeyword: true, name:'function', snippet:'function ${1:name}(${2:parameters}) :: ${3:return type}:\r\n\t'},
        {isKeyword: false, name:'function void', snippet:'function ${1:name}(${2:parameters}):\r\n\t'},
        // 우리가 추가한 최신 이벤트들
        {isKeyword: true, name:'on portal create', snippet:'on portal create:\r\n\t${1:# code}'},
        {isKeyword: true, name:'on tool change', snippet:'on tool change:\r\n\t${1:# code}'},
        {isKeyword: true, name:'on zap', snippet:'on zap:\r\n\t${1:# code}'}
    ].forEach(value => {
        if (value.isKeyword)
            list.push(new CompletionItem(value.name, CompletionItemKind.Keyword));
        let snippet = new CompletionItem(value.name, CompletionItemKind.Snippet);
        snippet.insertText = new SnippetString(value.snippet);
        list.push(snippet);
    });
    return list;
})();

const CMD_Options = (() =>{
    let list = new Array<CompletionItem>();
    [   {name:'aliases', snippet:'aliases: '},
        {name:'description', snippet:'description: '},
        {name:'usage', snippet:'usage: '},
        {name:'permission', snippet:'permission: '},
        {name:'permission message', snippet:'permission message: '},
        {name:'executable by', snippet:'executable by: '},
        {name:'cooldown', snippet:'cooldown: '},
        {name:'cooldown message', snippet:'cooldown message: '},
        {name:'cooldown bypass', snippet:'cooldown bypass: '},
        {name:'cooldown storage', snippet:'cooldown storage: '},
        {name:'trigger', snippet:'trigger: '}
    ].forEach(value => {
        let snippet = new CompletionItem(value.name, CompletionItemKind.Property);
        snippet.insertText = new SnippetString(value.snippet);
        list.push(snippet);
    })
    return list;
})();

export class SkriptCompletionItemProvider implements CompletionItemProvider<CompletionItem> {
    provideCompletionItems(document: TextDocument, position: Position, _token: CancellationToken, _context: CompletionContext ): CompletionItem[] | undefined {

        let result = new Array<CompletionItem>();
        let line = document.lineAt(position.line);
        let range = document.getWordRangeAtPosition(position);
        let word: string | undefined = (range) ? document.getText(range) : undefined;

        let skDocument = Skript.find(document.uri.fsPath)!;

        // 1. 첫 입력 (Keyword/Events)
        if (!skDocument.componentOf(position) && (line.text === '' || line.text.indexOf(word!) === 0)) {
            return Components;
        }

        // 2. 마인크래프트 아이템/메터리얼 입력
        let matrial_range = document.getWordRangeAtPosition(position, /minecraft:\w*/i);
        let matrial_word: string | undefined = (matrial_range) ? document.getText(matrial_range) : undefined;
        if (matrial_word) {
            for (const mat of SkriptMaterials) {
                result.push(new CompletionItem(mat.toLowerCase(), CompletionItemKind.Enum));
            }
        }

        // 3. 구문 내부(Paragraph) 자동완성 (함수 수집 포함)
        let subText = line.text.substring(0, position.character);
        let skComponent = skDocument.componentOf(position, {isBefore:true});
        if (skComponent) {

            // Command Options
            if (skComponent instanceof SkriptCommand && subText.match(/^(\t|\s{4})($|[^\t\s\:]*$)/)) {
                let items = Object.assign(CMD_Options, {});
                if (skComponent.options) for (const option of skComponent.options) {
                    items = items.filter(v => v.label !== option.key);  
                }
                result.push(...items);
            }

            // 전역 함수 자동완성 (서버 내 모든 로드된 파일 기준)
            if (skComponent instanceof SkriptParagraphComponent && skComponent.paragraph.range.contains(position)) {
                for (const skDocs of Skript.DOCUMENTS) {
                    let isThis = skDocs === skDocument;
                    for (const skFunc of skDocs.getComponents(SkriptFunction)) if (!skFunc.isInvisible || isThis) {
                        let item = new CompletionItem(skFunc.name, CompletionItemKind.Function);
                        item.detail = skDocs.skPath.name;
                        if (skFunc.tooltip) item.documentation = skFunc.tooltip.markdown;

                        let parameters: string[] = [];
                        if (skFunc.parameters) for (const skParam of skFunc.parameters) {
                            let i = parameters.length + 1;
                            if (skParam.type.isList) {
                                parameters.push(`\${${i}:{_${skParam.name}::*\\}}`)
                            } else {
                                parameters.push(`\${${i}:{_${skParam.name}\\}}`)
                            }
                        }
                        item.insertText = new SnippetString(`${skFunc.name}( ${parameters.join(', ')} )`)
                        result.push(item);
                    }
                }
            }
        }
        return result;
    }
}