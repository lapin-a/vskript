import { DocumentSymbol, DocumentSymbolProvider, SymbolKind, TextDocument, Range, Position } from 'vscode';
import * as Skript from '../Skript';
import { SkriptVariable, SkriptVariableKind } from '../language/SkriptExpressions';
import { SkriptAliases, SkriptOptions, SkriptCommand, SkriptEvent, SkriptFunction } from '../SkriptComponent';

// 파일별 심볼 캐시 저장소
export const SYMBOLS_MAP = new Map<string, DocumentSymbol[]>();

export class SkriptDocumentSymbolProvider implements DocumentSymbolProvider {
	public provideDocumentSymbols(document: TextDocument): DocumentSymbol[] {
        console.log("--- 개요(Symbol) 함수 호출됨 ---");
		let fsPath = document.uri.fsPath;
		const cached = SYMBOLS_MAP.get(fsPath);

		// 1. 캐시가 없거나, 캐시가 비어있거나(스캔 지연), 문서가 수정 중이면 새로 생성
		if (!cached || cached.length === 0 || document.isDirty) {
			let symbols: DocumentSymbol[] = [];
			let skDocument = Skript.find(fsPath);
            console.log(`[데이터 모델 확인] 찾은 컴포넌트 개수: ${skDocument?.components.length ?? "없음"}`);
			
			// 아직 스캔 중이라 문서를 못 찾았다면 캐시에 저장하지 않고 빈 배열 리턴 (재시도 유도)
			if (!skDocument) {
                console.log(`[주의] ${fsPath}에 대한 데이터 모델을 찾지 못해 기존 캐시를 반환합니다.`);
                return cached || []; // 모델이 없으면 옛날 개요라도 보여줍니다.
            }

			// --- 1. Aliases ---
			for (const skAliases of skDocument.getComponents(SkriptAliases)) {
				let aliasesSymbol = new DocumentSymbol('Aliases', '', SymbolKind.Struct, skAliases.range, skAliases.range);
				symbols.push(aliasesSymbol);

				for (const aliases of skAliases.aliases) {
					let value = aliases.value.join(', ').replace(/minecraft:/g, '');
					aliasesSymbol.children.push(new DocumentSymbol(aliases.key, value, SymbolKind.EnumMember, aliases.range, aliases.range));
				}
			}

			// --- 2. Options ---
			for (const skOptions of skDocument.getComponents(SkriptOptions)) {
				let optionsSymbol = new DocumentSymbol('Options', '', SymbolKind.Interface, skOptions.range, skOptions.range);
				symbols.push(optionsSymbol);

				for (const option of skOptions.options) {
					optionsSymbol.children.push(new DocumentSymbol(option.key, option.value, SymbolKind.Constant, option.range, option.range));
				}
			}

			// --- 3. Command ---
			for (const skCommand of skDocument.getComponents(SkriptCommand)) {
				let title = skCommand.title.startsWith('/') ? skCommand.title : `/${skCommand.title}`;
				let commandSymbol = new DocumentSymbol(title, 'Command', SymbolKind.Class, skCommand.range, skCommand.range);
				symbols.push(commandSymbol);

				if (skCommand.options) {
					for (const option of skCommand.options) {
						let kind = option.key === 'trigger' ? SymbolKind.Method : SymbolKind.Property;
						let optionSymbol = new DocumentSymbol(option.key, option.value, kind, option.range, option.range);
						commandSymbol.children.push(optionSymbol);

						if (option.key === 'trigger' && skCommand.paragraph) {
							optionSymbol.children.push(...this._createVariableSymbols(skCommand.paragraph.variables));
						}
					}
				}
			}

			// --- 4. Event ---
			for (const skEvent of skDocument.getComponents(SkriptEvent)) {
				let eventSymbol = new DocumentSymbol(skEvent.title, 'Event', SymbolKind.Event, skEvent.range, skEvent.range);
				if (skEvent.paragraph) {
					eventSymbol.children.push(...this._createVariableSymbols(skEvent.paragraph.variables));
				}
				symbols.push(eventSymbol);
			}

			// --- 5. Function ---
			for (const skFunction of skDocument.getComponents(SkriptFunction)) {
				// 매개변수 리스트를 문자열로 변환 (예: "arg1: type, arg2: type")
				// SkriptFunction의 속성명은 프로젝트 구조에 따라 다를 수 있으니 
				// skFunction.parameters 혹은 skFunction.arguments를 확인해 보세요.
				let paramsString = "";
				if (skFunction.parameters && Array.isArray(skFunction.parameters)) {
					paramsString = skFunction.parameters
						.map(p => `${p.name}: ${p.type}`)
						.join(', ');
				}

				// 개요에 표시될 최종 텍스트: functionName(arg1: type, ...)
				const fullTitle = `${skFunction.title}(${paramsString})`;

				let functionSymbol = new DocumentSymbol(
					fullTitle, 
					'Function', 
					SymbolKind.Function, 
					skFunction.range, 
					skFunction.range
				);

				if (skFunction.paragraph) {
					functionSymbol.children.push(...this._createVariableSymbols(skFunction.paragraph.variables));
				}
				symbols.push(functionSymbol);
			}

			// --- 6. Variables ---
			const allVariables: SkriptVariable[] = [];
			
			// skDocument.components 내의 모든 요소를 확인합니다.
			for (const component of skDocument.components) {
				// 1. component가 존재하고, 그 안에 paragraph와 variables가 있는지 안전하게 확인합니다.
				// 'as any'를 일시적으로 사용하여 접근하거나, 객체 내부에 해당 속성이 있는지 체크합니다.
				const compWithParagraph = component as { paragraph?: { variables?: SkriptVariable[] } };

				if (compWithParagraph.paragraph && compWithParagraph.paragraph.variables) {
					allVariables.push(...compWithParagraph.paragraph.variables);
				}
			}

			if (allVariables.length > 0) {
				// 부모 심볼의 위치를 문서 첫 줄로 설정
				const rootRange = new Range(new Position(0, 0), new Position(0, 0));
				const variablesRootSymbol = new DocumentSymbol(
					'Variables', 
					'Local Variables', 
					SymbolKind.Interface, 
					rootRange, 
					rootRange
				);

				// 중복 제거 및 심볼 생성 유틸리티 호출
				const variableSymbols = this._createVariableSymbols(allVariables);
				variablesRootSymbol.children.push(...variableSymbols);
				
				symbols.push(variablesRootSymbol);
			}

			// 분석 결과를 캐시에 저장 (결과가 있을 때만)
			if (symbols.length > 0) {
				SYMBOLS_MAP.set(fsPath, symbols);
			}
			return symbols;
		}

		return cached;
	}

	// 로컬 변수 변환 유틸리티
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

export function clearSymbolCache(fsPath: string) {
	SYMBOLS_MAP.delete(fsPath);
}