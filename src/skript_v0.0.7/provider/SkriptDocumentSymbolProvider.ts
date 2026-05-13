import { DocumentSymbol, DocumentSymbolProvider, SymbolKind, TextDocument, Range } from 'vscode';
import * as Skript from '../Skript';
import { SkriptVariable, SkriptVariableKind } from '../language/SkriptExpressions';
import { SkriptAliases, SkriptOptions, SkriptCommand, SkriptEvent, SkriptFunction } from '../SkriptComponent';

// 파일별 심볼 캐시 저장소
const SYMBOLS_MAP = new Map<string, DocumentSymbol[]>();

export class SkriptDocumentSymbolProvider implements DocumentSymbolProvider {
    provideDocumentSymbols(document: TextDocument) {
        let fsPath = document.uri.fsPath;

        // 문서가 변경되었거나 캐시가 없으면 새로 생성
        if (!SYMBOLS_MAP.has(fsPath) || document.isDirty) {
            let symbols: DocumentSymbol[] = [];
            let skDocument = Skript.find(fsPath);
            
            if (!skDocument) return [];

            // 1. Aliases (아이콘: Enum/Struct)
            for (const skAliases of skDocument.getComponents(SkriptAliases)) {
                let aliasesSymbol = new DocumentSymbol(skAliases.title || 'Aliases', '', SymbolKind.Struct, skAliases.range, skAliases.range);
                symbols.push(aliasesSymbol);

                for (const aliases of skAliases.aliases) {
                    let value = Object.assign(aliases.value, {}).map(v => v.replace('minecraft:', '')).join(', ');
                    aliasesSymbol.children.push(new DocumentSymbol(aliases.key, value, SymbolKind.EnumMember, aliases.range, aliases.range));
                }
            }

            // 2. Options (아이콘: Interface/Constant)
            for (const skOptions of skDocument.getComponents(SkriptOptions)) {
                let optionsSymbol = new DocumentSymbol(skOptions.title || 'Options', '', SymbolKind.Interface, skOptions.range, skOptions.range);
                symbols.push(optionsSymbol);

                for (const option of skOptions.options) {
                    optionsSymbol.children.push(new DocumentSymbol(option.key, option.value, SymbolKind.Constant, option.range, option.range));
                }
            }

            // 3. Command (아이콘: Function/Event)
            for (const skCommand of skDocument.getComponents(SkriptCommand)) {
                let commandSymbol = new DocumentSymbol(`/${skCommand.title}`, 'Command', SymbolKind.Event, skCommand.range, skCommand.range);
                symbols.push(commandSymbol);

                if (skCommand.options) for (const option of skCommand.options) {
                    let kind = option.key === 'trigger' ? SymbolKind.Method : SymbolKind.Property;
                    let optionSymbol = new DocumentSymbol(option.key, option.value, kind, option.range, option.range);
                    commandSymbol.children.push(optionSymbol);

                    if (option.key === 'trigger' && skCommand.paragraph) {
                        optionSymbol.children.push(...this._createVariableSymbols(skCommand.paragraph.variables));
                    }
                }
            }

            // 4. Event (아이콘: Boolean/Event)
            for (const skEvent of skDocument.getComponents(SkriptEvent)) {
                let eventSymbol = new DocumentSymbol(skEvent.title, 'Event', SymbolKind.Boolean, skEvent.range, skEvent.range);
                if (skEvent.paragraph) {
                    eventSymbol.children.push(...this._createVariableSymbols(skEvent.paragraph.variables));
                }
                symbols.push(eventSymbol);
            }

            // 5. Function (아이콘: Function)
            for (const skFunction of skDocument.getComponents(SkriptFunction)) {
                let functionSymbol = new DocumentSymbol(`${skFunction.title}()`, 'Function', SymbolKind.Function, skFunction.range, skFunction.range);
                if (skFunction.paragraph) {
                    functionSymbol.children.push(...this._createVariableSymbols(skFunction.paragraph.variables));
                }
                symbols.push(functionSymbol);
            }

            SYMBOLS_MAP.set(fsPath, symbols);
            return symbols;
        } else {
            return SYMBOLS_MAP.get(fsPath);
        }
    }

    // 로컬 변수들을 심볼로 변환하는 유틸리티
    private _createVariableSymbols(skVariables: SkriptVariable[]): DocumentSymbol[] {
        let result: DocumentSymbol[] = [];
        let maps = new Map<string, { variable: SkriptVariable, amount: number }>();

        for (const variables of skVariables) {
            for (const skVariable of this._getAllVariable(variables)) {
                if (skVariable.kind === SkriptVariableKind.LOCAL) {
                    let existing = maps.get(skVariable.raw);
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
        if (skVariable.child.length === 0) return [skVariable];
        let array: SkriptVariable[] = [skVariable];
        for (const child of skVariable.child) {
            array.push(...this._getAllVariable(child));
        }
        return array;
    }
}