import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { parse as parseJsonc, ParseError } from 'jsonc-parser';
import * as onig from 'vscode-oniguruma';
import * as vsctm from 'vscode-textmate';

// 릴리스 노트 v0.0.6 ~ v0.0.9의 구문 강조 항목을 실제 TextMate 엔진으로 확인한다.

const ROOT = path.join(__dirname, '..', '..', '..');
const readJsonc = (rel: string) => {
    const errors: ParseError[] = [];
    const value = parseJsonc(fs.readFileSync(path.join(ROOT, rel), 'utf8'), errors, { allowTrailingComma: true });
    assert.deepStrictEqual(errors, [], `${rel} JSONC 파싱 오류`);
    return value;
};

let grammarPromise: Promise<vsctm.IGrammar> | null = null;
function loadGrammar(): Promise<vsctm.IGrammar> {
    if (!grammarPromise) {
        grammarPromise = (async () => {
            const wasm = fs.readFileSync(require.resolve('vscode-oniguruma/release/onig.wasm'));
            await onig.loadWASM(wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength));
            const registry = new vsctm.Registry({
                onigLib: Promise.resolve({
                    createOnigScanner: (patterns: string[]) => new onig.OnigScanner(patterns),
                    createOnigString: (s: string) => new onig.OnigString(s),
                }),
                loadGrammar: async () => vsctm.parseRawGrammar(
                    fs.readFileSync(path.join(ROOT, 'themes', 'vskript.tmLanguage.json'), 'utf8'), 'vskript.tmLanguage.json'),
            });
            const grammar = await registry.loadGrammar('source.sk');
            assert.ok(grammar, '문법을 불러오지 못함');
            return grammar;
        })();
    }
    return grammarPromise;
}

/** 스크립트를 토큰으로 나눠 [텍스트, scope 목록] 배열로 돌려준다 */
async function tokenize(script: string): Promise<{ text: string; scopes: string[] }[]> {
    const grammar = await loadGrammar();
    const out: { text: string; scopes: string[] }[] = [];
    let stack = vsctm.INITIAL;
    for (const line of script.split('\n')) {
        const r = grammar.tokenizeLine(line, stack);
        stack = r.ruleStack;
        for (const t of r.tokens) {out.push({ text: line.slice(t.startIndex, t.endIndex), scopes: t.scopes });}
    }
    return out;
}

/** text 토큰이 scope를 갖는지 */
async function expectScope(script: string, text: string, scope: string) {
    const tokens = await tokenize(script);
    const hit = tokens.filter(t => t.text.trim() === text);
    assert.ok(hit.length, `토큰 ${JSON.stringify(text)} 없음`);
    assert.ok(hit.some(t => t.scopes.includes(scope)), `${JSON.stringify(text)}에 ${scope} 없음: ${JSON.stringify(hit.map(t => t.scopes))}`);
}

suite('릴리스 노트: 구문 강조 (TextMate)', () => {
    test('v0.0.7 문자열 색상 코드 &7, §7, <grey>', async () => {
        const s = 'on load:\n\tsend "&7a §7b <grey>c" to player';
        for (const code of ['&7', '§7', '<grey>']) {await expectScope(s, code, 'vskript.color.7');}
    });
    test('v0.0.6 문자열 컬러 코드 &[0-9a-f]', async () => {
        await expectScope('on load:\n\tsend "&ahello" to player', '&a', 'vskript.color.a');
    });
    test('v0.0.7 문자열 안 {@option} 강조', async () => {
        await expectScope('on load:\n\tsend "{@prefix} hi" to player', 'prefix', 'vskript.options.variable');
    });
    test('v0.0.7 Option 값 영역 강조 (표현식)', async () => {
        await expectScope('options:\n\tcount: 5', '5', 'vskript.expr.number');
    });
    test('v0.0.7 exit / continue 제어문 스타일', async () => {
        const s = 'on load:\n\tloop 3 times:\n\t\texit 1 loop\n\t\tcontinue';
        await expectScope(s, 'exit 1 loop', 'vskript.grammar');
        await expectScope(s, 'continue', 'vskript.grammar');
    });
    test('v0.0.7 boolean은 숫자 스타일', async () => {
        await expectScope('on load:\n\tset {_b} to true', 'true', 'vskript.expr.number');
    });
    test("v0.0.7 'parse if', 'do while' 문법 스타일", async () => {
        const s = 'on load:\n\tparse if player is alive:\n\t\tbroadcast "a"\n\tdo while {_x} < 5:\n\t\tadd 1 to {_x}';
        await expectScope(s, 'parse if', 'vskript.grammar');
        await expectScope(s, 'do while', 'vskript.grammar');
    });
    test("v0.0.7 함수 매개변수 타입 'string' 강조", async () => {
        await expectScope('function f(name: string):\n\tbroadcast "a"', 'string', 'vskript.type.text');
    });
    test('v0.0.6 변수·문자열의 중첩 표현식', async () => {
        const tokens = await tokenize('on load:\n\tset {_v::%player%} to "%{_a::%{_b}%}%"');
        // 문자열 안 %...% 안의 변수 {_b}까지 변수 scope로 분석
        assert.ok(tokens.some(t => t.text === 'b' && t.scopes.includes('vskript.expr.text') && t.scopes.includes('vskript.variable.local')));
        assert.ok(tokens.some(t => t.text === 'player' && t.scopes.includes('vskript.variable.local') && t.scopes.includes('vskript.default')));
    });
    test('v0.0.6 Periodical Event', async () => {
        await expectScope('every 5 minutes:\n\tbroadcast "x"', 'every', 'vskript.event');
    });
    test('v0.0.8 skript-reflect 패턴 (import, 사용자 정의 effect)', async () => {
        await expectScope('import:\n\torg.bukkit.Bukkit', 'import', 'vskript.reflect.import');
        await expectScope('import:\n\torg.bukkit.Bukkit', 'Bukkit', 'vskript.reflect.import.class');
        await expectScope('effect test:\n\ttrigger:\n\t\tbroadcast "x"', 'effect', 'vskript.reflect.effect');
    });
});

suite('릴리스 노트: 테마 / 등록 항목', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

    test('v0.0.9 테마(Dark+, White=light+)가 등록되어 있고 파일이 올바르다', () => {
        const themes: { label: string; path: string; uiTheme: string }[] = pkg.contributes.themes;
        assert.ok(themes.some(t => t.uiTheme === 'vs-dark'), '다크 테마 없음');
        assert.ok(themes.some(t => t.uiTheme === 'vs'), '라이트(White) 테마 없음');
        for (const t of themes) {
            const theme = readJsonc(t.path);
            assert.ok(Array.isArray(theme.tokenColors) && theme.tokenColors.length > 0, `${t.path} tokenColors 없음`);
            // v0.0.7: parse if / do while 등 문법 스타일(vskript.grammar)은 굵게
            const grammarRule = theme.tokenColors.find((r: { scope: string | string[] }) => ([] as string[]).concat(r.scope).flatMap(x => x.split(/,\s*/)).includes('vskript.grammar'));
            assert.ok(grammarRule && /bold/.test(grammarRule.settings.fontStyle), `${t.path}: vskript.grammar가 굵게가 아님`);
        }
    });

    test('문법·스니펫 파일이 올바르고 등록되어 있다', () => {
        assert.strictEqual(pkg.contributes.grammars[0].scopeName, 'source.sk');
        readJsonc(pkg.contributes.grammars[0].path);
        const snippets = readJsonc(pkg.contributes.snippets[0].path);
        for (const prefix of ['_func', '_funcr', '_fx', '_fxr']) {
            assert.ok(Object.values(snippets).some((s: any) => [].concat(s.prefix).includes(prefix as never)), `스니펫 ${prefix} 없음`);
        }
    });

    test('v0.1.0 .sk 작업 공간을 열면 활성화 (activationEvents)', () => {
        assert.ok(pkg.activationEvents.includes('workspaceContains:**/*.sk'));
        assert.ok(pkg.activationEvents.includes('onLanguage:vskript'));
    });

    test('릴리스 노트의 설정·명령이 모두 등록되어 있다', () => {
        const props = Object.keys(pkg.contributes.configuration.properties);
        for (const key of ['vskript.language', 'vskript.hoverContentMode', 'vskript.serverPath', 'vskript.skriptVersion', 'vskript.addons',
            'vskript.database.autoDownload', 'vskript.database.url', 'vskript.diagnostics.versionCheck']) {
            assert.ok(props.includes(key), `설정 ${key} 없음`);
        }
        const commands = pkg.contributes.commands.map((c: { command: string }) => c.command);
        assert.ok(commands.includes('vskript.showEnvironment'));
        assert.ok(commands.includes('vskript.refreshEnvironment'));
    });

    test('VS Code 기준 1.120 (engines.vscode와 @types/vscode 일치)', () => {
        assert.strictEqual(pkg.engines.vscode, '^1.120.0');
        assert.strictEqual(pkg.devDependencies['@types/vscode'], '~1.120.0');
    });
});
