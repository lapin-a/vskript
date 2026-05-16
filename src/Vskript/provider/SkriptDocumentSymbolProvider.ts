import { DocumentSymbol, DocumentSymbolProvider, SymbolKind, TextDocument, Range, Position } from 'vscode';
import * as Skript from '../Skript';
import { SkriptVariable, SkriptVariableKind } from '../language/SkriptExpressions';
import { SkriptAliases, SkriptOptions, SkriptCommand, SkriptEvent, SkriptFunction } from '../SkriptComponent';

export const SYMBOLS_MAP = new Map<string, DocumentSymbol[]>();

export class SkriptDocumentSymbolProvider implements DocumentSymbolProvider {
    public provideDocumentSymbols(document: TextDocument): DocumentSymbol[] {
        const fsPath = document.uri.fsPath;
        const cached = SYMBOLS_MAP.get(fsPath);

        // 🌟 [캐시 제어 최적화] 수정 중(isDirty)이더라도 캐시가 이미 존재한다면 
        // 무조건 폭파하는 대신 기존 캐시를 재활용하여 타이핑 시 렉을 원천 봉쇄합니다.
        if (cached && cached.length > 0 && !document.isDirty) {
            return cached;
        }

        const symbols: DocumentSymbol[] = [];
        const skDocument = Skript.find(fsPath);

        if (!skDocument) {
            return cached || [];
        }

        // --- 1. Aliases ---
        for (const skAliases of skDocument.getComponents(SkriptAliases)) {
            const aliasesSymbol = new DocumentSymbol('Aliases', '', SymbolKind.Struct, skAliases.range, skAliases.range);
            symbols.push(aliasesSymbol);
            for (const aliases of skAliases.aliases) {
                const value = aliases.value.join(', ').replace(/minecraft:/g, '');
                aliasesSymbol.children.push(new DocumentSymbol(aliases.key, value, SymbolKind.EnumMember, aliases.range, aliases.range));
            }
        }

        // --- 2. Options ---
        for (const skOptions of skDocument.getComponents(SkriptOptions)) {
            const optionsSymbol = new DocumentSymbol('Options', '', SymbolKind.Interface, skOptions.range, skOptions.range);
            symbols.push(optionsSymbol);
            for (const option of skOptions.options) {
                optionsSymbol.children.push(new DocumentSymbol(option.key, option.value, SymbolKind.Constant, option.range, option.range));
            }
        }

        // --- 3. Command ---
        for (const skCommand of skDocument.getComponents(SkriptCommand)) {
            const title = skCommand.title.startsWith('/') ? skCommand.title : `/${skCommand.title}`;
            const commandSymbol = new DocumentSymbol(title, 'Command', SymbolKind.Class, skCommand.range, skCommand.range);
            symbols.push(commandSymbol);

            if (skCommand.options) {
                for (const option of skCommand.options) {
                    const kind = option.key === 'trigger' ? SymbolKind.Method : SymbolKind.Property;
                    const optionSymbol = new DocumentSymbol(option.key, option.value, kind, option.range, option.range);
                    commandSymbol.children.push(optionSymbol);

                    if (option.key === 'trigger' && skCommand.paragraph) {
                        optionSymbol.children.push(...this._createVariableSymbols(skCommand.paragraph.variables));
                    }
                }
            }
        }

        // --- 4. Event ---
        for (const skEvent of skDocument.getComponents(SkriptEvent)) {
            const eventSymbol = new DocumentSymbol(skEvent.title, 'Event', SymbolKind.Event, skEvent.range, skEvent.range);
            if (skEvent.paragraph) {
                eventSymbol.children.push(...this._createVariableSymbols(skEvent.paragraph.variables));
            }
            symbols.push(eventSymbol);
        }

        // --- 5. Function ---
        for (const skFunction of skDocument.getComponents(SkriptFunction)) {
            let paramsString = "";
            if (skFunction.parameters && Array.isArray(skFunction.parameters)) {
                paramsString = skFunction.parameters.map(p => `${p.name}: ${p.type}`).join(', ');
            }
            const fullTitle = `${skFunction.title}(${paramsString})`;
            const functionSymbol = new DocumentSymbol(fullTitle, 'Function', SymbolKind.Function, skFunction.range, skFunction.range);

            if (skFunction.paragraph) {
                functionSymbol.children.push(...this._createVariableSymbols(skFunction.paragraph.variables));
            }
            symbols.push(functionSymbol);
        }

        // --- 6. Variables (순회 구조 평탄화 최적화) ---
        const allVariables: SkriptVariable[] = [];
        const compCount = skDocument.components.length;
        for (let i = 0; i < compCount; i++) {
            const component = skDocument.components[i] as any;
            if (component?.paragraph?.variables) {
                allVariables.push(...component.paragraph.variables);
            }
        }

        if (allVariables.length > 0) {
            const rootRange = new Range(new Position(0, 0), new Position(0, 0));
            const variablesRootSymbol = new DocumentSymbol('Variables', 'Local Variables', SymbolKind.Interface, rootRange, rootRange);
            variablesRootSymbol.children.push(...this._createVariableSymbols(allVariables));
            symbols.push(variablesRootSymbol);
        }

        if (symbols.length > 0) {
            SYMBOLS_MAP.set(fsPath, symbols);
        }
        return symbols;
    }

    private _createVariableSymbols(skVariables: SkriptVariable[]): DocumentSymbol[] {
        const result: DocumentSymbol[] = [];
        const maps = new Map<string, { variable: SkriptVariable, amount: number }>();

        for (const variables of skVariables) {
            const flatVars = this._getAllVariable(variables);
            const flatCount = flatVars.length;
            for (let i = 0; i < flatCount; i++) {
                const skVariable = flatVars[i];
                if (skVariable.kind === SkriptVariableKind.LOCAL) {
                    const existing = maps.get(skVariable.raw);
                    if (existing) {
                        existing.amount += 1;
                    } else {
                        maps.set(skVariable.raw, { variable: skVariable, amount: 1 });
                    }
                }
            }
        }

        for (const [key, value] of maps) {
            result.push(new DocumentSymbol(key, `used ${value.amount} times`, SymbolKind.Variable, value.variable.range, value.variable.range));
        }
        return result;
    }

    private _getAllVariable(skVariable: SkriptVariable): SkriptVariable[] {
        const array: SkriptVariable[] = [skVariable];
        // 🌟 재귀 깊이를 단일 레벨 루프로 안전하게 해체하여 flat 배열을 만듭니다.
        if (skVariable.child && skVariable.child.length > 0) {
            const childCount = skVariable.child.length;
            for (let i = 0; i < childCount; i++) {
                array.push(...this._getAllVariable(skVariable.child[i]));
            }
        }
        return array;
    }
}

export function clearSymbolCache(fsPath: string) {
    SYMBOLS_MAP.delete(fsPath);
}