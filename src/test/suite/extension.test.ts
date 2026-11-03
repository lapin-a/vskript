import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { removeTempDir } from '../helpers';

const EXTENSION_ID = 'Vhone.vskript';

async function openSkript(content: string): Promise<vscode.TextDocument> {
    const doc = await vscode.workspace.openTextDocument({ language: 'vskript', content });
    await vscode.window.showTextDocument(doc);
    return doc;
}

async function completionLabels(doc: vscode.TextDocument, position: vscode.Position): Promise<string[]> {
    const list = await vscode.commands.executeCommand<vscode.CompletionList>('vscode.executeCompletionItemProvider', doc.uri, position);
    return list.items.map(i => (typeof i.label === 'string' ? i.label : i.label.label));
}

suite('VSkript 확장', () => {
    suiteSetup(async () => {
        const ext = vscode.extensions.getExtension(EXTENSION_ID);
        assert.ok(ext, `${EXTENSION_ID} 확장을 찾지 못함`);
        await ext.activate();
    });

    test('명령이 등록된다', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes('vskript.showEnvironment'));
        assert.ok(commands.includes('vskript.refreshEnvironment'));
    });

    test('구문 자동완성을 제안하고, Skript 버전에 따라 제안 수가 달라진다', async () => {
        const oldDoc = await openSkript('# version: 2.0\n\n');
        const newDoc = await openSkript('# version: 2.10\n\n');
        const oldLabels = await completionLabels(oldDoc, new vscode.Position(1, 0));
        const newLabels = await completionLabels(newDoc, new vscode.Position(1, 0));
        assert.ok(newLabels.length > 100, `제안 수가 너무 적음: ${newLabels.length}`);
        assert.ok(oldLabels.length < newLabels.length, `2.0(${oldLabels.length}) < 2.10(${newLabels.length}) 이어야 함`);
    });

    test('{@ 입력 시 옵션 변수만 제안한다', async () => {
        const doc = await openSkript('options:\n\tprefix: &a[Test]\n\non load:\n\tbroadcast "{@');
        const labels = await completionLabels(doc, new vscode.Position(4, 14));
        assert.deepStrictEqual(labels, ['{@prefix}']);
    });

    test('아웃라인의 함수에 매개변수 타입이 표시된다', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vskript-outline-'));
        const file = path.join(dir, 'outline.sk');
        fs.writeFileSync(file, 'function greet(name: text, times: number):\n\tbroadcast {_name}\n');
        try {
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
            await vscode.window.showTextDocument(doc);
            let names: string[] = [];
            for (let i = 0; i < 20 && !names.some(n => n.startsWith('greet(')); i++) {
                const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>('vscode.executeDocumentSymbolProvider', doc.uri) || [];
                names = symbols.map(s => s.name);
                if (!names.some(n => n.startsWith('greet('))) {await new Promise(r => setTimeout(r, 100));}
            }
            const fn = names.find(n => n.startsWith('greet('));
            assert.ok(fn, `함수 심볼이 없음: ${JSON.stringify(names)}`);
            assert.doesNotMatch(fn, /object Object/);
            assert.strictEqual(fn, 'greet(name:text, times:number)');
        } finally {
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            removeTempDir(dir);
        }
    });

    test('여러 문서를 연달아 고쳐도 각 문서의 진단이 한 번씩 갱신된다', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vskript-diag-'));
        const fileA = path.join(dir, 'a.sk');
        const fileB = path.join(dir, 'b.sk');
        fs.writeFileSync(fileA, 'on load:\n\tbroadcast "a"\n');
        fs.writeFileSync(fileB, 'on load:\n\tbroadcast "b"\n');
        const colonErrors = (uri: vscode.Uri) => vscode.languages.getDiagnostics(uri).filter(d => d.message.includes("콜론(':')")).length;
        try {
            const docA = await vscode.workspace.openTextDocument(vscode.Uri.file(fileA));
            const docB = await vscode.workspace.openTextDocument(vscode.Uri.file(fileB));
            await new Promise(r => setTimeout(r, 300));
            assert.strictEqual(colonErrors(docA.uri), 0);

            // A의 콜론을 지운 직후(350ms 디바운스 안에) B를 고친다
            const editA = new vscode.WorkspaceEdit();
            editA.delete(docA.uri, new vscode.Range(0, 7, 0, 8));
            await vscode.workspace.applyEdit(editA);
            const editB = new vscode.WorkspaceEdit();
            editB.insert(docB.uri, new vscode.Position(1, 0), '\tbroadcast "b2"\n');
            await vscode.workspace.applyEdit(editB);

            await new Promise(r => setTimeout(r, 800));
            assert.strictEqual(docA.lineAt(0).text, 'on load');
            assert.strictEqual(colonErrors(docA.uri), 1, 'A의 콜론 누락 진단이 정확히 1개여야 함');
            assert.strictEqual(colonErrors(docB.uri), 0);
        } finally {
            await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
            removeTempDir(dir);
        }
    });

    test('현재 버전에서 쓸 수 없는 구문을 경고한다', async () => {
        const body = 'on load:\n\tcatch runtime errors:\n\t\tset {_x} to 5\n\tbroadcast "hi"\n';
        const versionWarnings = async (header: string) => {
            const doc = await openSkript(header + body);
            await new Promise(r => setTimeout(r, 300));
            return vscode.languages.getDiagnostics(doc.uri).filter(d => d.code === 'vskript-version-mismatch');
        };
        // catch runtime errors는 2.12에 추가됨
        const old = await versionWarnings('# version: 2.10\n');
        assert.strictEqual(old.length, 1, JSON.stringify(old.map(d => d.message)));
        assert.strictEqual(old[0].range.start.line, 2);
        assert.match(old[0].message, /2\.12/);
        assert.strictEqual((await versionWarnings('# version: 2.15\n')).length, 0);
        // 버전 주석이 없고 서버 환경도 없으면 검사하지 않는다
        assert.strictEqual((await versionWarnings('')).length, 0);
    });

    test('스니펫: _func/_funcr/_fx/_fxr이 자동완성에 나오고, 파일 이름을 넣어 펼쳐진다', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vskript-snippet-'));
        const file = path.join(dir, 'myscript.sk');
        fs.writeFileSync(file, '\n');
        try {
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
            const editor = await vscode.window.showTextDocument(doc);

            const list = await vscode.commands.executeCommand<vscode.CompletionList>('vscode.executeCompletionItemProvider', doc.uri, new vscode.Position(0, 0));
            const snippetLabels = list.items
                .filter(i => i.kind === vscode.CompletionItemKind.Snippet)
                .map(i => (typeof i.label === 'string' ? i.label : i.label.label));
            for (const prefix of ['_func', '_funcr', '_fx', '_fxr']) {
                assert.ok(snippetLabels.includes(prefix), `스니펫 ${prefix} 없음: ${JSON.stringify(snippetLabels.slice(0, 30))}`);
            }

            // 자동완성 항목이 가진 스니펫 본문을 편집 API로 펼친다
            // ('editor.action.insertSnippet' 명령은 창이 OS 포커스를 가질 때만 동작해 테스트가 간헐적으로 실패했다)
            const expand = async (prefix: string) => {
                const item = list.items.find(i => i.kind === vscode.CompletionItemKind.Snippet && (typeof i.label === 'string' ? i.label : i.label.label) === prefix)!;
                const body = item.insertText instanceof vscode.SnippetString ? item.insertText.value : String(item.insertText);
                await editor.edit(b => b.delete(new vscode.Range(0, 0, doc.lineCount, 0)));
                assert.ok(await editor.insertSnippet(new vscode.SnippetString(body), new vscode.Position(0, 0)), `${prefix} 삽입 실패`);
                // 들여쓰기는 사용자 편집기 설정(탭/공백)을 따르므로 탭으로 맞춰 비교
                return doc.getText().replace(/\r\n/g, '\n').replace(/^(?: {4}|\t)/gm, '\t').trimEnd();
            };
            assert.strictEqual(await expand('_func'), 'function myscript_Name():');
            assert.strictEqual(await expand('_funcr'), 'function myscript_Name() :: return_type:\n\t# code\n\treturn {_return_type}');
            assert.strictEqual(await expand('_fx'), 'function fxmyscriptName():');
        } finally {
            await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
            removeTempDir(dir);
        }
    });

    test('구문 호버를 보여 준다', async () => {
        const doc = await openSkript('on load:\n\tbroadcast "hello"\n');
        const hovers = await vscode.commands.executeCommand<vscode.Hover[]>('vscode.executeHoverProvider', doc.uri, new vscode.Position(1, 3));
        const text = hovers.flatMap(h => h.contents.map(c => (typeof c === 'string' ? c : c.value))).join('\n');
        assert.match(text, /broadcast/i);
    });
});
