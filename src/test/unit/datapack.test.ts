import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DataPackClient } from '../../Vskript/env/DataPackClient';
import { mismatchSignature, parseAddonSetting, resolveEnvironment } from '../../Vskript/env/Environment';
import { FakeDatabase } from '../helpers';

// 릴리스 노트 v0.1.1 "구문 데이터 자동 다운로드 (바뀐 것만, 오프라인이면 캐시)"와 "설정이 감지보다 우선"을 확인한다.

suite('릴리스 노트: DataPack 다운로드 / 캐시', () => {
    let db: FakeDatabase;
    let cacheRoot: string;

    setup(async () => {
        db = new FakeDatabase();
        db.setPack('skript', 'Skript', [{ id: 1, title: 'Broadcast' }]);
        db.setPack('skbee', 'SkBee', [{ id: 2, title: 'NBT' }]);
        await db.start();
        cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vskript-cache-'));
    });
    teardown(async () => {
        await db.stop();
        fs.rmSync(cacheRoot, { recursive: true, force: true });
    });

    test('처음에는 내려받고, 다음에는 바뀌지 않았으면 캐시를 쓴다', async () => {
        const client = new DataPackClient(cacheRoot, db.url);
        const first = await client.sync(['Skript', 'skbee']);
        assert.deepStrictEqual(first.loaded.map(p => [p.slug, p.from]), [['skript', 'downloaded'], ['skbee', 'downloaded']]);

        db.requests.length = 0;
        const second = await client.sync(['Skript', 'SkBee']);
        assert.deepStrictEqual(second.loaded.map(p => p.from), ['cache', 'cache']);
        assert.deepStrictEqual(db.requests, ['index.json'], '캐시가 맞으면 index.json만 받아야 함');
    });

    test('content_hash가 바뀐 애드온만 다시 받는다', async () => {
        const client = new DataPackClient(cacheRoot, db.url);
        await client.sync(['Skript', 'SkBee']);
        db.setPack('skbee', 'SkBee', [{ id: 2, title: 'NBT' }, { id: 3, title: 'New' }]);
        db.requests.length = 0;
        const report = await client.sync(['Skript', 'SkBee']);
        assert.deepStrictEqual(report.loaded.map(p => [p.slug, p.from]), [['skript', 'cache'], ['skbee', 'downloaded']]);
        assert.deepStrictEqual(db.requests, ['index.json', 'by-addon/skbee.json']);
        assert.strictEqual(report.loaded[1].pack.item_count, 2);
    });

    test('오프라인이면 캐시로 동작한다', async () => {
        await new DataPackClient(cacheRoot, db.url).sync(['Skript']);
        const url = db.url;
        await db.stop();
        const report = await new DataPackClient(cacheRoot, url).sync(['Skript']);
        assert.strictEqual(report.online, false);
        assert.deepStrictEqual(report.loaded.map(p => [p.slug, p.from]), [['skript', 'cache']]);
    });

    test('내려받은 파일의 해시가 index와 다르면 쓰지 않는다', async () => {
        db.corruptPack = 'by-addon/skript.json';
        const report = await new DataPackClient(cacheRoot, db.url).sync(['Skript']);
        assert.strictEqual(report.loaded.length, 0);
        assert.match(report.errors[0].message, /해시/);
    });

    test('데이터베이스에 없는 애드온은 unknown으로 보고한다', async () => {
        const report = await new DataPackClient(cacheRoot, db.url).sync(['Skript', 'NoSuchAddon']);
        assert.deepStrictEqual(report.unknown, ['NoSuchAddon']);
    });
});

suite('릴리스 노트: 설정이 감지 결과보다 우선', () => {
    test('vskript.addons 항목 "이름@버전" 해석', () => {
        assert.deepStrictEqual(parseAddonSetting('SkBee@3.5.0'), { name: 'SkBee', version: '3.5.0' });
        assert.deepStrictEqual(parseAddonSetting('skript-reflect'), { name: 'skript-reflect', version: null });
    });

    test('설정 버전이 감지 버전을 덮어쓰고, 다르면 불일치로 보고한다', () => {
        const r = resolveEnvironment({
            detected: [{ name: 'Skript', version: '2.10.0' }, { name: 'SkBee', version: '3.4.0' }],
            settingSkriptVersion: '2.9',
            settingAddons: ['SkBee@3.5.0', 'Extra@1.0'],
        });
        assert.strictEqual(r.skriptVersion, '2.9');
        assert.strictEqual(r.addons.find(a => a.name === 'SkBee')?.version, '3.5.0');
        assert.ok(r.addons.some(a => a.name === 'Extra'));
        assert.deepStrictEqual(r.mismatches.map(m => [m.name, m.kind]).sort(), [['Extra', 'not-detected'], ['SkBee', 'version'], ['Skript', 'version']]);
    });

    test('감지 결과와 설정이 같으면 불일치가 없다 (2.10 == 2.10.0)', () => {
        const r = resolveEnvironment({ detected: [{ name: 'Skript', version: '2.10.0' }], settingSkriptVersion: '2.10', settingAddons: [] });
        assert.strictEqual(r.mismatches.length, 0);
    });

    test('같은 불일치는 같은 서명 (알림을 한 번만 띄우는 근거)', () => {
        const a = mismatchSignature([{ name: 'SkBee', kind: 'version', setting: '3.5', detected: '3.4' }, { name: 'Skript', kind: 'version', setting: '2.9', detected: '2.10' }]);
        const b = mismatchSignature([{ name: 'Skript', kind: 'version', setting: '2.9', detected: '2.10' }, { name: 'skbee', kind: 'version', setting: '3.5', detected: '3.4' }]);
        assert.strictEqual(a, b);
        assert.notStrictEqual(a, mismatchSignature([{ name: 'Skript', kind: 'version', setting: '2.8', detected: '2.10' }]));
    });
});
