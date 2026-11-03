import * as assert from 'assert';
import { compareVersions, isAvailableIn, parseInstalledVersion, ParsedVersionField } from '../../Vskript/syntax/SyntaxVersion';
import { compilePattern } from '../../Vskript/syntax/SkriptPattern';

const v = (text: string) => {
    const parsed = parseInstalledVersion(text);
    assert.ok(parsed, `버전 해석 실패: ${text}`);
    return parsed;
};
const field = (since: string, qualifier: ParsedVersionField['qualifier'] = null): ParsedVersionField => ({
    since, since_parts: v(since).parts, since_pre: v(since).pre, qualifier, parse_status: 'ok',
});

suite('SyntaxVersion', () => {
    test('compareVersions는 vskript-database version.js 규칙과 같다', () => {
        assert.ok(compareVersions(v('2.2-dev28'), v('2.2')) < 0);
        assert.ok(compareVersions(v('2.9.9'), v('2.10')) < 0);
        assert.strictEqual(compareVersions(v('2.2'), v('2.2.0')), 0);
        assert.ok(compareVersions(v('2.10.0-pre1'), v('2.10.0-rc1')) < 0);
        assert.ok(compareVersions(v('v3.5.0'), v('3.4.9')) > 0);
    });

    test('isAvailableIn: valid_from / valid_until', () => {
        assert.ok(isAvailableIn(v('2.9.0'), field('2.9.0')));
        assert.ok(!isAvailableIn(v('2.8.0'), field('2.9.0')));
        assert.ok(!isAvailableIn(v('3.0'), field('2.0'), field('3.0')));
    });

    test('isAvailableIn: 근거가 부족하면 숨기지 않는다', () => {
        assert.ok(isAvailableIn(null, field('9.0')));
        assert.ok(isAvailableIn(v('2.8'), null));
        assert.ok(isAvailableIn(v('2.8'), field('2.9', 'before')));
        assert.ok(isAvailableIn(v('2.8'), field('2.9', 'unknown')));
    });
});

suite('SkriptPattern', () => {
    test('선택/택일 → 정규식과 레이블', () => {
        const p = compilePattern('[the] (full|complete|whole) command');
        assert.strictEqual(p.label, 'full command');
        assert.ok(p.regex!.test('the whole command'));
        assert.ok(!p.regex!.test('command'));
    });

    test('표현식 자리와 파스 마크', () => {
        assert.ok(compilePattern('send [the] action[ ]bar %string% to %players%').regex!.test('send action bar "hi" to player'));
        const marked = compilePattern('(1¦add|2¦remove) %number% to %objects%');
        assert.strictEqual(marked.label, 'add %number% to %objects%');
        assert.ok(marked.regex!.test('remove 1 to {x}'));
    });
});
