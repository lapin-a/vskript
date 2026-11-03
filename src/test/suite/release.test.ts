import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import type { VSkriptApi } from '../../extension';
import { FakeDatabase, parsedVersion, removeTempDir, waitFor, writePluginJar } from '../helpers';

// RELEASE_KR.md의 기능을 하나씩 확인한다 (구문 강조·다운로드 클라이언트 단위 확인은 test/unit).
// 작업 공간: src/test/fixtures/workspace (lib.sk, main.sk), 구문 데이터: 로컬 가짜 vskript-database

const EXTENSION_ID = 'Vhone.vskript';
const config = () => vscode.workspace.getConfiguration('vskript');
const SETTINGS = ['serverPath', 'skriptVersion', 'addons', 'language', 'hoverContentMode', 'database.url', 'database.autoDownload', 'diagnostics.versionCheck'];

const workspaceRoot = () => vscode.workspace.workspaceFolders![0].uri.fsPath;
const fixtureUri = (name: string) => vscode.Uri.file(path.join(workspaceRoot(), name));
const lineOf = (file: string, needle: string) => fs.readFileSync(path.join(workspaceRoot(), file), 'utf8').split(/\r?\n/).findIndex(l => l.includes(needle));

async function untitled(content: string) {
    const doc = await vscode.workspace.openTextDocument({ language: 'vskript', content });
    await vscode.window.showTextDocument(doc);
    return doc;
}

async function hoverText(uri: vscode.Uri, position: vscode.Position): Promise<string> {
    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>('vscode.executeHoverProvider', uri, position) || [];
    return hovers.flatMap(h => h.contents.map(c => (typeof c === 'string' ? c : c.value))).join('\n');
}

async function completionLabels(content: string): Promise<string[]> {
    const doc = await vscode.workspace.openTextDocument({ language: 'vskript', content });
    const list = await vscode.commands.executeCommand<vscode.CompletionList>('vscode.executeCompletionItemProvider', doc.uri, new vscode.Position(doc.lineCount - 1, 0));
    return list.items.map(i => (typeof i.label === 'string' ? i.label : i.label.label));
}

const versionWarnings = (uri: vscode.Uri) => vscode.languages.getDiagnostics(uri).filter(d => d.code === 'vskript-version-mismatch');

suite('릴리스 노트 기능 확인', function () {
    this.timeout(60000);

    let api: VSkriptApi;
    let activeAtStart = false;
    const db = new FakeDatabase();
    const saved = new Map<string, unknown>();
    let serverDir = '';
    let pluginsDir = '';
    let tempDir = '';

    suiteSetup(async () => {
        const ext = vscode.extensions.getExtension<VSkriptApi>(EXTENSION_ID)!;
        activeAtStart = ext.isActive;
        api = await ext.activate();

        db.setPack('skript', 'Skript', [
            { id: 1, title: 'Broadcast', syntax_type: 'effect', syntax_pattern: 'broadcast %objects%', description: 'Broadcasts a message.',
                valid_from_addon_version: '2.0', valid_from_addon_version_parsed: parsedVersion('2.0'),
                guide: { lang: 'ko', description: '메시지를 방송합니다.', stale: false } },
            { id: 2, title: 'Catch Runtime Errors', syntax_type: 'section', syntax_pattern: 'catch [run[ ]time] error[s]', description: 'Catches errors.',
                valid_from_addon_version: '2.12', valid_from_addon_version_parsed: parsedVersion('2.12') },
            { id: 3, title: 'Fancy Effect', syntax_type: 'effect', syntax_pattern: 'make fancy sparkles at %location%', description: 'Since 2.7.',
                valid_from_addon_version: '2.7', valid_from_addon_version_parsed: parsedVersion('2.7') },
        ]);
        db.setPack('testaddon', 'TestAddon', [
            { id: 10, title: 'Zap Entity', syntax_type: 'effect', syntax_pattern: 'zap %entity% with style', description: 'Zaps.',
                valid_from_addon_version: '1.0', valid_from_addon_version_parsed: parsedVersion('1.0') },
            { id: 11, title: 'Turbo Zap', syntax_type: 'effect', syntax_pattern: 'turbo zap %entity% now', description: 'Faster.',
                valid_from_addon_version: '2.0', valid_from_addon_version_parsed: parsedVersion('2.0') },
        ]);
        await db.start();

        serverDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vskript-release-server-'));
        pluginsDir = path.join(serverDir, 'plugins');
        fs.mkdirSync(pluginsDir);
        writePluginJar(path.join(pluginsDir, 'Skript.jar'), 'Skript', '2.10.0');
        writePluginJar(path.join(pluginsDir, 'TestAddon.jar'), 'TestAddon', '1.5');
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vskript-release-'));

        for (const k of SETTINGS) {saved.set(k, config().inspect(k)?.globalValue);}
        await config().update('database.url', db.url, vscode.ConfigurationTarget.Global);
        await config().update('database.autoDownload', true, vscode.ConfigurationTarget.Global);
        await config().update('serverPath', serverDir, vscode.ConfigurationTarget.Global);
        await config().update('skriptVersion', undefined, vscode.ConfigurationTarget.Global);
        await config().update('addons', undefined, vscode.ConfigurationTarget.Global);
        await config().update('language', 'ko', vscode.ConfigurationTarget.Global);
        await config().update('diagnostics.versionCheck', true, vscode.ConfigurationTarget.Global);
        await vscode.commands.executeCommand('vskript.refreshEnvironment');
    });

    suiteTeardown(async () => {
        for (const k of SETTINGS) {await config().update(k, saved.get(k), vscode.ConfigurationTarget.Global);}
        // 다음 테스트 묶음이 가짜 구문 데이터를 보지 않도록 원래 설정으로 다시 감지
        await vscode.commands.executeCommand('vskript.refreshEnvironment');
        await db.stop();
        removeTempDir(serverDir);
        removeTempDir(tempDir);
    });

    // ---------- v0.1.0 / v0.0.6 : 작업 공간 (lib.sk는 아직 열지 않은 상태에서 먼저 확인) ----------

    test('v0.1.0 .sk가 있는 작업 공간에서 확장이 활성화되어 있다', () => {
        assert.ok(activeAtStart, '테스트 시작 시 이미 활성화되어 있어야 함');
    });

    test('v0.1.0 열려 있지 않은 파일의 함수로 F12 이동', async () => {
        assert.ok(!vscode.workspace.textDocuments.some(d => d.uri.fsPath === fixtureUri('lib.sk').fsPath), 'lib.sk가 이미 열려 있음');
        const mainLine = lineOf('main.sk', 'greet(');
        const col = fs.readFileSync(fixtureUri('main.sk').fsPath, 'utf8').split(/\r?\n/)[mainLine].indexOf('greet') + 2;
        await vscode.workspace.openTextDocument(fixtureUri('main.sk'));
        const defs = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>('vscode.executeDefinitionProvider', fixtureUri('main.sk'), new vscode.Position(mainLine, col)) || [];
        const targets = defs.map(d => ('targetUri' in d ? [d.targetUri, d.targetRange] : [d.uri, d.range]) as [vscode.Uri, vscode.Range]);
        assert.ok(targets.some(([u, r]) => path.basename(u.fsPath) === 'lib.sk' && r.start.line === lineOf('lib.sk', 'function greet')), JSON.stringify(targets));
    });

    test('v0.0.6 작업 공간 심볼 검색, @invisible 함수는 제외', async () => {
        const greet = await vscode.commands.executeCommand<vscode.SymbolInformation[]>('vscode.executeWorkspaceSymbolProvider', 'greet') || [];
        assert.ok(greet.some(s => s.name.startsWith('greet(') && path.basename(s.location.uri.fsPath) === 'lib.sk'));
        const hidden = await vscode.commands.executeCommand<vscode.SymbolInformation[]>('vscode.executeWorkspaceSymbolProvider', 'fxHidden') || [];
        assert.strictEqual(hidden.length, 0, '@invisible 함수가 검색됨');
    });

    test('v0.1.0 hoverContentMode: description은 Docs 주석, code는 함수 본문', async () => {
        const mainLine = lineOf('main.sk', 'greet(');
        const col = fs.readFileSync(fixtureUri('main.sk').fsPath, 'utf8').split(/\r?\n/)[mainLine].indexOf('greet') + 2;
        await config().update('hoverContentMode', 'description', vscode.ConfigurationTarget.Global);
        const desc = await hoverText(fixtureUri('main.sk'), new vscode.Position(mainLine, col));
        assert.match(desc, /Greets a player/);
        assert.match(desc, /@param_? ```who```/);
        await config().update('hoverContentMode', 'code', vscode.ConfigurationTarget.Global);
        const code = await hoverText(fixtureUri('main.sk'), new vscode.Position(mainLine, col));
        assert.match(code, /set \{_msg\} to "hi"/);
        assert.doesNotMatch(code, /@invisible/, '다음 함수의 주석이 섞임');
        await config().update('hoverContentMode', undefined, vscode.ConfigurationTarget.Global);
    });

    test('v0.0.6 아웃라인: Options·Aliases·Command 옵션·이벤트·지역 변수(사용 횟수)', async () => {
        const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>('vscode.executeDocumentSymbolProvider', fixtureUri('lib.sk')) || [];
        const byName = (list: vscode.DocumentSymbol[], name: string) => list.find(s => s.name === name);
        assert.deepStrictEqual(byName(symbols, 'Options')?.children.map(c => c.name), ['prefix']);
        assert.deepStrictEqual(byName(symbols, 'Aliases')?.children.map(c => [c.name, c.detail]), [['shiny', 'diamond, emerald']]);
        const command = byName(symbols, '/command /heal [<player>]');
        assert.deepStrictEqual(command?.children.map(c => c.name), ['permission', 'trigger']);
        const trigger = command!.children[1];
        assert.deepStrictEqual(trigger.children.map(c => [c.name, c.detail]), [['{_target}', 'used 2 times']]);
        assert.ok(byName(symbols, 'every 5 minutes'), 'Periodical Event 없음');
        assert.ok(byName(symbols, 'at 12:00'), 'At Time 없음');
        const join = byName(symbols, 'on join');
        assert.deepStrictEqual(join?.children.map(c => [c.name, c.detail]), [['{_name}', 'used 3 times']]);
        assert.strictEqual(join!.children[0].range.start.line, lineOf('lib.sk', 'set {_name}'), '최초 사용 위치가 아님');
        assert.ok(byName(symbols, 'greet(who:player, times:number) :: text'), JSON.stringify(symbols.map(s => s.name)));
    });

    test('v0.0.6 의미 강조: Aliases 사용과 함수 매개변수', async () => {
        const doc = await vscode.workspace.openTextDocument(fixtureUri('lib.sk'));
        const legend = await vscode.commands.executeCommand<vscode.SemanticTokensLegend>('vscode.provideDocumentSemanticTokensLegend', doc.uri);
        const tokens = await vscode.commands.executeCommand<vscode.SemanticTokens>('vscode.provideDocumentSemanticTokens', doc.uri);
        assert.ok(tokens, '의미 토큰 없음');
        const found: string[] = [];
        let line = 0, ch = 0;
        for (let i = 0; i < tokens.data.length; i += 5) {
            line += tokens.data[i];
            ch = tokens.data[i] ? tokens.data[i + 1] : ch + tokens.data[i + 1];
            found.push(`${doc.lineAt(line).text.substr(ch, tokens.data[i + 2])}=${legend.tokenTypes[tokens.data[i + 3]]}`);
        }
        assert.ok(found.includes('shiny=aliases'), JSON.stringify(found));
        assert.ok(found.includes('{_who}=parameter'), JSON.stringify(found));
    });

    test('v0.1.0 {@옵션} 호버에 옵션 값 표시', async () => {
        const line = lineOf('lib.sk', '{@prefix}');
        const col = fs.readFileSync(fixtureUri('lib.sk').fsPath, 'utf8').split(/\r?\n/)[line].indexOf('{@prefix}') + 3;
        assert.match(await hoverText(fixtureUri('lib.sk'), new vscode.Position(line, col)), /&a\[Test\]/);
    });

    test('v0.0.6 Docs 트리거: "#>>" + Enter → @param/@return 주석 생성, "#>" + Enter → 다음 줄도 "#> "', async () => {
        const file = path.join(tempDir, 'docs.sk');
        fs.writeFileSync(file, '#>>\nfunction f(a: text) :: text:\n\treturn {_a}\n');
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
        const editor = await vscode.window.showTextDocument(doc);
        await new Promise(r => setTimeout(r, 300));
        // 'type' 명령은 창이 OS 포커스를 가질 때만 동작하므로, 같은 변경(줄 끝에 줄바꿈)을 편집 API로 넣는다
        await editor.edit(b => b.insert(new vscode.Position(0, 3), '\n'));
        const generated = await waitFor(() => /@param a/.test(doc.getText()) && doc.getText(), 3000);
        assert.ok(generated, `Docs가 생성되지 않음:\n${doc.getText()}`);
        assert.match(doc.getText(), /#> @return/);
        assert.doesNotMatch(doc.getText(), /#>>/);
        await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');

        const file2 = path.join(tempDir, 'docs2.sk');
        fs.writeFileSync(file2, '#> hello\nfunction g():\n\tbroadcast "x"\n');
        const doc2 = await vscode.workspace.openTextDocument(vscode.Uri.file(file2));
        const editor2 = await vscode.window.showTextDocument(doc2);
        await editor2.edit(b => b.insert(new vscode.Position(0, 8), '\n'));
        assert.ok(await waitFor(() => doc2.lineAt(1).text.startsWith('#> '), 3000), JSON.stringify(doc2.getText()));
        await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
    });

    // ---------- v0.1.1 : 서버 환경 / DataPack ----------

    test('v0.1.1 plugins 폴더의 jar(plugin.yml)에서 Skript·애드온 버전 감지', () => {
        const env = api.getEnvironment()!;
        assert.strictEqual(env.pluginsFolder, pluginsDir);
        assert.strictEqual(env.result.skriptVersion, '2.10.0');
        assert.deepStrictEqual(env.result.addons.map(a => [a.name, a.version]), [['TestAddon', '1.5']]);
    });

    test('v0.1.1 구문 데이터 다운로드, 바뀌지 않았으면 다시 받지 않음', async () => {
        const env = api.getEnvironment()!;
        assert.deepStrictEqual(env.packs.map(p => p.name).sort(), ['Skript', 'TestAddon']);
        assert.ok(db.requests.includes('by-addon/testaddon.json'));
        db.requests.length = 0;
        await vscode.commands.executeCommand('vskript.refreshEnvironment');
        assert.deepStrictEqual(db.requests, ['index.json'], '캐시가 맞는데 다시 받음');
        assert.deepStrictEqual(api.getEnvironment()!.packs.map(p => p.from), ['cache', 'cache']);
    });

    test('v0.1.1 상태 표시줄에 Skript 버전·애드온 수', () => {
        assert.match(api.statusBarText(), /Skript 2\.10\.0/);
        assert.match(api.statusBarText(), /애드온 1/);
    });

    test('v0.1.1 명령: 서버 환경 보기', async () => {
        await vscode.commands.executeCommand('vskript.showEnvironment');
    });

    test('v0.1.1 설치한 애드온의 구문을 애드온 버전에 맞게 제안', async () => {
        const labels = await completionLabels('\n');
        assert.ok(labels.includes('zap %entity% with style'), '애드온 구문 없음');
        assert.ok(!labels.includes('turbo zap %entity% now'), 'TestAddon 1.5에서 2.0 구문이 제안됨');
    });

    test('v0.1.1 설정이 감지보다 우선, 불일치 알림은 같은 내용에 한 번 (명령 실행 시는 항상)', async () => {
        const warnings: string[] = [];
        const original = vscode.window.showWarningMessage;
        (vscode.window as { showWarningMessage: unknown }).showWarningMessage = (message: string) => {
            if (String(message).startsWith('VSkript:')) {warnings.push(message);}
            return Promise.resolve(undefined);
        };
        try {
            await config().update('addons', ['TestAddon@2.0'], vscode.ConfigurationTarget.Global);
            await config().update('skriptVersion', '2.9', vscode.ConfigurationTarget.Global);
            // 설정 변경 → 1초 디바운스 후 자동 재감지 (알림 1회)
            assert.ok(await waitFor(() => api.getEnvironment()?.result.skriptVersion === '2.9' && warnings.length === 1, 8000), `자동 재감지/알림 안 됨: ${JSON.stringify(warnings)}`);
            const env = api.getEnvironment()!;
            assert.strictEqual(env.result.addons.find(a => a.name === 'TestAddon')?.version, '2.0');
            assert.ok((await completionLabels('\n')).includes('turbo zap %entity% now'), '설정 버전(2.0) 기준 구문이 없음');

            // jar 변경으로 자동 재감지 → 같은 불일치이므로 알림 없음
            const before = api.getEnvironment()!.updatedAt;
            writePluginJar(path.join(pluginsDir, 'TestAddon.jar'), 'TestAddon', '1.5');
            assert.ok(await waitFor(() => api.getEnvironment()!.updatedAt !== before, 8000), 'jar 변경 후 재감지 안 됨');
            assert.strictEqual(warnings.length, 1, '같은 불일치에 알림이 다시 뜸');

            // 명령으로 직접 실행하면 다시 알림
            await vscode.commands.executeCommand('vskript.refreshEnvironment');
            assert.strictEqual(warnings.length, 2);
        } finally {
            (vscode.window as { showWarningMessage: unknown }).showWarningMessage = original;
            await config().update('addons', undefined, vscode.ConfigurationTarget.Global);
            await config().update('skriptVersion', undefined, vscode.ConfigurationTarget.Global);
            await vscode.commands.executeCommand('vskript.refreshEnvironment');
        }
        assert.strictEqual(api.getEnvironment()!.result.skriptVersion, '2.10.0');
    });

    test('v0.1.1 jar를 추가·삭제하면 자동으로 다시 감지', async () => {
        const jar = path.join(pluginsDir, 'Another.jar');
        writePluginJar(jar, 'Another', '3.0');
        assert.ok(await waitFor(() => api.getEnvironment()!.detected?.some(d => d.name === 'Another'), 8000), '추가 감지 안 됨');
        fs.rmSync(jar);
        assert.ok(await waitFor(() => !api.getEnvironment()!.detected?.some(d => d.name === 'Another'), 8000), '삭제 감지 안 됨');
    });

    test('v0.1.1 오프라인이면 캐시 사용', async () => {
        // 캐시는 데이터베이스 주소별이므로, 같은 주소의 서버를 내려 오프라인을 만든다
        await db.stop();
        try {
            await vscode.commands.executeCommand('vskript.refreshEnvironment');
            const env = api.getEnvironment()!;
            assert.strictEqual(env.sync?.online, false);
            assert.deepStrictEqual(env.packs.map(p => [p.name, p.from]).sort(), [['Skript', 'cache'], ['TestAddon', 'cache']]);
        } finally {
            await db.start(); // 새 포트로 다시 연다
            await config().update('database.url', db.url, vscode.ConfigurationTarget.Global);
            await vscode.commands.executeCommand('vskript.refreshEnvironment');
        }
    });

    test('v0.1.1 database.autoDownload를 끄면 내려받지 않음', async () => {
        await config().update('database.autoDownload', false, vscode.ConfigurationTarget.Global);
        try {
            db.requests.length = 0;
            await vscode.commands.executeCommand('vskript.refreshEnvironment');
            assert.deepStrictEqual(db.requests, []);
        } finally {
            await config().update('database.autoDownload', true, vscode.ConfigurationTarget.Global);
            await vscode.commands.executeCommand('vskript.refreshEnvironment');
        }
    });

    // ---------- v0.1.1 : 자동완성 / 호버 / 진단 ----------

    test('v0.1.1 # mc: 주석으로 Skript 버전 결정 (1.16 → 2.6, 1.20 → 2.9)', async () => {
        assert.ok(!(await completionLabels('# mc: 1.16\n\n')).includes('make fancy sparkles at %location%'), '2.6에서 2.7 구문이 제안됨');
        assert.ok((await completionLabels('# mc: 1.20\n\n')).includes('make fancy sparkles at %location%'), '2.9에서 2.7 구문이 없음');
        assert.ok((await completionLabels('# version: 2.12\n\n')).includes('catch [run[ ]time] error[s]') || (await completionLabels('# version: 2.12\n\n')).some(l => l.startsWith('catch')), '주석 버전 2.12 구문 없음');
    });

    test('v0.1.1 호버: 한국어 설명(ko) / 원문(en), 현재 버전에서 못 쓰는 구문 경고', async () => {
        const doc = await untitled('on load:\n\tbroadcast "x"\n');
        // MarkdownString.appendText는 공백을 &nbsp;로 바꿔 넣는다
        assert.match((await hoverText(doc.uri, new vscode.Position(1, 3))).replace(/&nbsp;/g, ' '), /메시지를 방송합니다\./);
        await config().update('language', 'en', vscode.ConfigurationTarget.Global);
        assert.match((await hoverText(doc.uri, new vscode.Position(1, 3))).replace(/&nbsp;/g, ' '), /Broadcasts a message\./);
        await config().update('language', 'ko', vscode.ConfigurationTarget.Global);

        const old = await untitled('# version: 2.10\non load:\n\tcatch runtime errors:\n\t\tbroadcast "x"\n');
        const text = await hoverText(old.uri, new vscode.Position(2, 3));
        assert.match(text, /사용할 수 없는/);
        assert.match(text, /2\\?\.12/); // 마크다운 이스케이프("2\.12")
    });

    test('v0.1.1 버전 경고 진단, vskript.diagnostics.versionCheck로 끄기', async () => {
        const doc = await untitled('# version: 2.10\non load:\n\tcatch runtime errors:\n\t\tbroadcast "x"\n');
        assert.ok(await waitFor(() => versionWarnings(doc.uri).length === 1, 3000), JSON.stringify(vscode.languages.getDiagnostics(doc.uri).map(d => d.message)));
        await config().update('diagnostics.versionCheck', false, vscode.ConfigurationTarget.Global);
        try {
            assert.ok(await waitFor(() => versionWarnings(doc.uri).length === 0, 3000), '꺼도 경고가 남음');
        } finally {
            await config().update('diagnostics.versionCheck', true, vscode.ConfigurationTarget.Global);
        }
    });

    test('v0.1.1 문서를 닫았다 다시 열어도 진단이 유지된다', async () => {
        const file = path.join(tempDir, 'reopen.sk');
        fs.writeFileSync(file, 'on load\n\tbroadcast "x"\n');
        const uri = vscode.Uri.file(file);
        const colon = () => vscode.languages.getDiagnostics(uri).filter(d => d.message.includes('콜론')).length;
        await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri));
        assert.ok(await waitFor(() => colon() === 1, 3000));
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri));
        await new Promise(r => setTimeout(r, 1000));
        assert.strictEqual(colon(), 1);
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    // ---------- v0.1.0 : 진단 ----------

    test('v0.1.0 콜론 누락, 탭·공백 혼용, 섹션 아래 들여쓰기 깊이 진단', async () => {
        const doc = await untitled('command /x:\n\ttrigger:\n\tbroadcast "a"\non join\n \tbroadcast "b"\n');
        const messages = await waitFor(() => {
            const m = vscode.languages.getDiagnostics(doc.uri).map(d => `${d.range.start.line}:${d.message}`);
            return m.length >= 3 ? m : null;
        }, 3000);
        assert.ok(messages, JSON.stringify(vscode.languages.getDiagnostics(doc.uri).map(d => d.message)));
        assert.ok(messages.some(m => m.startsWith('3:') && m.includes('콜론')), JSON.stringify(messages));
        assert.ok(messages.some(m => m.startsWith('4:') && m.includes('혼용')), JSON.stringify(messages));
        assert.ok(messages.some(m => m.startsWith('2:') && m.includes('들여쓰기 깊이')), JSON.stringify(messages));
    });
});
