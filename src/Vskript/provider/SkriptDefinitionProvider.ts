import * as vscode from 'vscode';
import * as fs from 'fs';
import * as Skript from '../Skript';

export class SkriptDefinitionProvider implements vscode.DefinitionProvider {
    public async provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Definition | undefined> {
        
        const lineText = document.lineAt(position.line).text;
        
        // 🌟 [트랩 1] 옵션 패턴 정밀 탐색: {@이름} 및 {@분류.이름} 형태 추출 (마침표 포함)
        const optionRegex = /\{@([a-zA-Z0-9_\.]+)\}/g;
        let match;
        let targetOptionName: string | undefined = undefined;

        while ((match = optionRegex.exec(lineText)) !== null) {
            const startIdx = match.index;
            const endIdx = optionRegex.lastIndex;
            // 현재 사용자의 커서가 {@ ... } 문자열 경계 내부에 머물고 있는지 검증
            if (position.character >= startIdx && position.character <= endIdx) {
                targetOptionName = match[1]; // 순수 옵션명 (ex: "이름" 또는 "분류.이름") 추출
                break;
            }
        }

        // ==========================================
        // 🎯 [분기 A] 옵션 정의 이동 매칭 엔진 기동
        // ==========================================
        if (targetOptionName) {
            // 옵션 정의 정규식 구축: 라인 맨 앞에 "옵션명:" 규격이 오는지 체크 (마침표 이스케이프 적용)
            const optionDefRegex = new RegExp(`^\\s*${targetOptionName.replace(/\./g, '\\.')}\\s*:`, 'i');

            // 1단계: 현재 편집 중인 파일 내부 전수 조사 (Skript 옵션은 로컬 스코프가 기본이므로 최우선 서치)
            for (let i = 0; i < document.lineCount; i++) {
                if (optionDefRegex.test(document.lineAt(i).text)) {
                    return new vscode.Location(document.uri, new vscode.Range(i, 0, i, document.lineAt(i).text.length));
                }
            }

            // 2단계: VS Code 메모리에 켜져 있는 다른 .sk 파일들 고속 스캔
            for (const openDoc of vscode.workspace.textDocuments) {
                if (openDoc.uri.toString() === document.uri.toString()) continue;
                if (!openDoc.uri.fsPath.endsWith('.sk')) continue;

                for (let i = 0; i < openDoc.lineCount; i++) {
                    if (optionDefRegex.test(openDoc.lineAt(i).text)) {
                        return new vscode.Location(openDoc.uri, new vscode.Range(i, 0, i, openDoc.lineAt(i).text.length));
                    }
                }
            }

            // 3단계: 아직 열리지 않은 디스크 상의 다른 인덱싱 스크립트 파일 추적 (최후의 보루)
            for (const skDoc of Skript.DOCUMENTS) {
                const fsPath = skDoc.skPath.fsPath;
                if (vscode.workspace.textDocuments.some(d => d.uri.fsPath === fsPath)) continue;
                if (!fs.existsSync(fsPath)) continue;

                const content = fs.readFileSync(fsPath, 'utf-8');
                const lines = content.split(/\r?\n/);

                for (let i = 0; i < lines.length; i++) {
                    if (optionDefRegex.test(lines[i])) {
                        return new vscode.Location(vscode.Uri.file(fsPath), new vscode.Range(i, 0, i, lines[i].length));
                    }
                }
            }

            return undefined;
        }

        // ==========================================
        // 🎯 [분기 B] 커스텀 함수 정의 이동 엔진 기동 (기존 구조)
        // ==========================================
        const wordRange = document.getWordRangeAtPosition(position, /[a-zA-Z0-9_]+/);
        if (!wordRange) return undefined;
        
        const targetFuncName = document.getText(wordRange).trim();

        // [1차 방어선] AST 구조적 인덱스 캐시 검색
        for (const skDoc of Skript.DOCUMENTS) {
            if (!skDoc.components) continue;
            
            for (const comp of skDoc.components) {
                const c = comp as any;
                const isFunction = 
                    comp.constructor.name === 'SkriptFunction' || 
                    c.type === 'Function' || 
                    (c.statement && c.statement.includes('function')) ||
                    (c.name && c.name.startsWith('function'));
                
                if (!isFunction) continue;

                const compName: string = c.name || c.statement || '';
                if (!compName) continue;

                const pureName = compName.replace(/^function\s+/, '').split('(')[0].trim();
                
                if (pureName === targetFuncName) {
                    const targetUri = vscode.Uri.file(skDoc.skPath.fsPath);
                    const startLine = c.range?.start?.line ?? c.line ?? c._skParagraph?.line ?? 0;
                    
                    return new vscode.Location(
                        targetUri, 
                        new vscode.Range(startLine, 0, startLine, compName.length)
                    );
                }
            }
        }

        // [2차 방어선] 메모리 최적화 폴백 - 디스크 최소화 실시간 라인 매칭
        const funcRegex = new RegExp(`^function\\s+${targetFuncName}\\s*\\(`, 'i');

        for (const openDoc of vscode.workspace.textDocuments) {
            if (!openDoc.uri.fsPath.endsWith('.sk')) continue;

            for (let i = 0; i < openDoc.lineCount; i++) {
                if (funcRegex.test(openDoc.lineAt(i).text.trim())) {
                    return new vscode.Location(openDoc.uri, new vscode.Range(i, 0, i, openDoc.lineAt(i).text.length));
                }
            }
        }

        for (const skDoc of Skript.DOCUMENTS) {
            const fsPath = skDoc.skPath.fsPath;
            if (vscode.workspace.textDocuments.some(d => d.uri.fsPath === fsPath)) continue;
            if (!fs.existsSync(fsPath)) continue;

            const content = fs.readFileSync(fsPath, 'utf-8');
            const lines = content.split(/\r?\n/);

            for (let i = 0; i < lines.length; i++) {
                if (funcRegex.test(lines[i].trim())) {
                    return new vscode.Location(vscode.Uri.file(fsPath), new vscode.Range(i, 0, i, lines[i].length));
                }
            }
        }

        return undefined;
    }
}