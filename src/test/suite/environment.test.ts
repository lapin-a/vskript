import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as zlib from 'zlib';
import * as vscode from 'vscode';
import { DEFAULT_DATABASE_URL } from '../../Vskript/env/DataPackClient';

// 실제 사용 흐름 검증 (TODO H3):
//   서버 폴더(plugins/Skript.jar) 감지 → GitHub에서 DataPack 다운로드 → 감지 버전으로 자동완성 필터 → 한국어 호버
// 네트워크가 없으면 건너뛴다.

const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;}
        t[n] = c >>> 0;
    }
    return t;
})();

function crc32(buf: Buffer): number {
    let c = 0xffffffff;
    for (const b of buf) {c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);}
    return (c ^ 0xffffffff) >>> 0;
}

/** 항목 하나(deflate)짜리 zip(jar)을 만든다 */
function writeJar(file: string, entryName: string, content: string) {
    const name = Buffer.from(entryName, 'utf8');
    const raw = Buffer.from(content, 'utf8');
    const data = zlib.deflateRawSync(raw);
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(0, 42); // local header offset

    const cdOffset = local.length + name.length + data.length;
    const cdSize = central.length + name.length;
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(1, 8);
    eocd.writeUInt16LE(1, 10);
    eocd.writeUInt32LE(cdSize, 12);
    eocd.writeUInt32LE(cdOffset, 16);

    fs.writeFileSync(file, Buffer.concat([local, name, data, central, name, eocd]));
}

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
        if (serverDir) {fs.rmSync(serverDir, { recursive: true, force: true });}
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
