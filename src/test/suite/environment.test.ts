import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { DEFAULT_DATABASE_URL } from '../../Vskript/env/DataPackClient';
import { removeTempDir, writeJar } from '../helpers';

// 실제 사용 흐름 검증 (TODO H3):
//   서버 폴더(plugins/Skript.jar) 감지 → GitHub에서 DataPack 다운로드 → 감지 버전으로 자동완성 필터 → 한국어 호버
// 네트워크가 없으면 건너뛴다.

async function online(): Promise<boolean> {
    try {
        const res = await fetch(DEFAULT_DATABASE_URL + 'index.json', { signal: AbortSignal.timeout(10000) });
        return res.ok;
    } catch {
        return false;
    }
}

async function completionCount(content: string): Promise<number> {
    const doc = await vscode.workspace.openTextDocument({ language: 'vskript', content });
    const list = await vscode.commands.executeCommand<vscode.CompletionList>(
        'vscode.executeCompletionItemProvider', doc.uri, new vscode.Position(doc.lineCount - 1, 0));
    return list.items.length;
}

suite('실제 사용 흐름: 서버 폴더 → DataPack → 한국어 호버', function () {
    this.timeout(120000);

    const config = () => vscode.workspace.getConfiguration('vskript');
    const keys = ['serverPath', 'language', 'skriptVersion'] as const;
    const saved = new Map<string, unknown>();
    let serverDir = '';

    suiteSetup(async function () {
        if (!(await online())) {this.skip();}

        serverDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vskript-server-'));
        fs.mkdirSync(path.join(serverDir, 'plugins'));
        writeJar(path.join(serverDir, 'plugins', 'Skript.jar'), 'plugin.yml', 'name: Skript\nversion: 2.10.0\nmain: ch.njol.skript.Skript\n');

        for (const k of keys) {saved.set(k, config().inspect(k)?.globalValue);}
        await config().update('serverPath', serverDir, vscode.ConfigurationTarget.Global);
        await config().update('language', 'ko', vscode.ConfigurationTarget.Global);
        await config().update('skriptVersion', undefined, vscode.ConfigurationTarget.Global);

        await vscode.extensions.getExtension('Vhone.vskript')!.activate();
        // 명령은 감지 + 다운로드가 끝날 때까지 기다린다
        await vscode.commands.executeCommand('vskript.refreshEnvironment');
    });

    suiteTeardown(async () => {
        for (const k of keys) {
            if (saved.has(k)) {await config().update(k, saved.get(k), vscode.ConfigurationTarget.Global);}
        }
        if (serverDir) {removeTempDir(serverDir);}
    });

    test('plugins 폴더에서 감지한 Skript 버전으로 자동완성을 거른다', async () => {
        const detected = await completionCount('\n');           // 버전 주석 없음 → 서버 환경(2.10.0)
        const explicit = await completionCount('# version: 2.10.0\n\n');
        const older = await completionCount('# version: 2.0\n\n');
        assert.strictEqual(detected, explicit, `감지 버전(${detected})과 주석 2.10.0(${explicit})의 제안 수가 같아야 함`);
        assert.ok(older < detected, `2.0(${older}) < 2.10.0(${detected})`);
    });

    test('내려받은 DataPack의 한국어 설명을 호버에 보여 준다', async () => {
        const doc = await vscode.workspace.openTextDocument({ language: 'vskript', content: 'on load:\n\tbroadcast "hello"\n' });
        const hovers = await vscode.commands.executeCommand<vscode.Hover[]>('vscode.executeHoverProvider', doc.uri, new vscode.Position(1, 3));
        const text = hovers.flatMap(h => h.contents.map(c => (typeof c === 'string' ? c : c.value))).join('\n');
        assert.match(text, /[가-힣]/, `한국어 설명이 없음:\n${text}`);
        assert.match(text, /번역/, '번역 표시가 없음');
    });
});
