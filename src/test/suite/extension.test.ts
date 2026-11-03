import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

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
            assert.match(fn, /name: text/);
        } finally {
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    test('구문 호버를 보여 준다', async () => {
        const doc = await openSkript('on load:\n\tbroadcast "hello"\n');
        const hovers = await vscode.commands.executeCommand<vscode.Hover[]>('vscode.executeHoverProvider', doc.uri, new vscode.Position(1, 3));
        const text = hovers.flatMap(h => h.contents.map(c => (typeof c === 'string' ? c : c.value))).join('\n');
        assert.match(text, /broadcast/i);
    });
});
