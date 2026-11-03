import * as vscode from 'vscode'; 
import * as Skript from '../Skript';
import { SkriptFunction } from '../SkriptComponent';
import { SYMBOLS_MAP } from '../provider/SkriptDocumentSymbolProvider';
import { findOpenDocument, onDocumentClosed, scheduleDiagnostics } from '../provider/SkriptDiagnostics';
import { log } from '../Logger';

// 타이핑 중의 모델 파싱·진단을 문서별로 디바운스한다 (key: uri 문자열).
// 타이머가 하나뿐이면 A를 고친 뒤 350ms 안에 B를 고칠 때 A의 갱신이 취소된다.
const updateTimers = new Map<string, NodeJS.Timeout>();
onDocumentClosed(key => {
    const pending = updateTimers.get(key);
    if (pending) {clearTimeout(pending);}
    updateTimers.delete(key);
});

/**
 * 문서 수정 이벤트 핸들러
 */
export default function onTextDocumentChange(event: vscode.TextDocumentChangeEvent) {
    const document = event.document;
    if (document.languageId !== 'vskript') {return;}

    // URI 형식을 강제로 통일하여 경로 엇박자 오류 방어
    const fsPath = vscode.Uri.file(document.uri.fsPath).fsPath; 

    const changes = event.contentChanges;
    if (changes.length === 0) {return;}

    // 🌟 [최적화 핵심 1] 렉을 유발하던 무거운 데이터 모델 파싱과 진단 작업을 
    // 통째로 디바운싱 타이머 내부로 격리합니다. 유저가 타자를 치는 동안에는 CPU 연산이 완전히 멈추고 쾌적해집니다!
    const timerKey = document.uri.toString();
    const pending = updateTimers.get(timerKey);
    if (pending) {
        clearTimeout(pending);
    }

    // 🌟 350ms 동안 추가 입력이 없을 때 딱 한 번만 완벽하게 동기화 처리
    updateTimers.set(timerKey, setTimeout(() => {
        updateTimers.delete(timerKey);
        // 예약 시점의 문서 객체가 아니라 지금 열려 있는 문서를 쓴다 (닫혔으면 아무것도 하지 않음)
        const current = findOpenDocument(timerKey);
        if (!current) {return;}
        // 1. 텍스트 파싱 업데이트 (타이머 내부로 안전하게 이식)
        const skDocument = Skript.find(fsPath);
        if (skDocument) {
            skDocument.update(current.getText());
            log.debug(`문서 갱신: ${document.fileName}`);
        } else {
            log.debug(`문서 갱신 건너뜀 (스캔되지 않은 문서): ${document.fileName}`);
        }

        // 2. 개요(Outline) 캐시 비우기
        SYMBOLS_MAP.delete(fsPath);
        
        // 3. 진단 (갱신된 모델 기준으로 바로 계산)
        scheduleDiagnostics(current, 0);
    }, 350));

    // 🌟 [최적화 핵심 2] 불필요한 for 루프를 완전히 제거하고, 유저가 방금 입력한 마지막 이벤트(O(1))만 저격하여 
    // 엔터 주석 자동 완성 기능을 초고속으로 작동시킵니다. 반응 속도가 예술이 됩니다.
    const lastChange = changes[changes.length - 1];
    if (lastChange && lastChange.text.match(/^(\r\n|\r|\n)(\t|\s)*$/i)) {
        inputEnter(lastChange, document);
    }
}

/**
 * 엔터 입력 시 주석(#> )을 자동으로 이어주는 기능
 */
function inputEnter(context: vscode.TextDocumentContentChangeEvent, document: vscode.TextDocument) {
    const i = context.range.start.line;
    const line = document.lineAt(i).text;
    const groups = line.match(/^(?<space>(\t|\s)*)(?<prefix>\#\>\>?)(\s)?(.*)?$/i)?.groups;
    
    if (groups) {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {return;}

        const prefix = groups.prefix;
            
        if (prefix === '#>>') {
            editor.edit(builder => { 
                builder.delete(new vscode.Range(document.lineAt(i).range.start, document.lineAt(i+1).range.end));
            });

            const skDocument = Skript.find(document.uri.fsPath);
            if (!skDocument) {return;}

            const skFunction = skDocument.componentOf(context.range.start, {isAfter:true});
            if (!skFunction || !(skFunction instanceof SkriptFunction)) {return;}

            const docs = new Array<string>();
            let j = 1;
            if (skFunction.parameters) {
                for (const param of skFunction.parameters) {
                    docs.push(`#> @param ${param.name} \${${j++}}`);
                }
            }
            if (skFunction.returnType) {docs.push(`#> @return \${${j++}}`);}
            docs.unshift(`#> \${${j}}`);
            
            editor.insertSnippet(new vscode.SnippetString(docs.join('\r\n')), context.range);

        } else if (prefix === '#>') {
            editor.edit(builder => {
                builder.insert(new vscode.Position(i+1, groups!.space.length), '#> ');
            });
        }
    }
}