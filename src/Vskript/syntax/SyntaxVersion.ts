// ============================================================
// 구문 유효 버전 판단 (vscode API 비의존).
//   - compareVersions는 vskript-database/version.js의 규칙을 그대로 옮긴 것:
//     숫자 부분 자리별 비교(빈 자리 0) → 같으면 pre 태그가 있는 쪽이 앞섬
//     pre끼리는 dev < snapshot < alpha < b < beta < pre < rc, 그다음 번호순
//   - DataPack의 *_parsed 필드(README "버전 필드 해석")를 입력으로 받는다.
// ============================================================

export interface SimpleVersion {
    parts: number[];
    pre: string | null;
}

/** DataPack `*_parsed` 구조 중 판단에 쓰는 부분 */
export interface ParsedVersionField {
    since: string | null;
    since_parts: number[] | null;
    since_pre: string | null;
    qualifier: 'before' | 'or_earlier' | 'or_later' | 'unknown' | null;
    parse_status: 'ok' | 'approximate' | 'partial' | 'missing' | 'unparsed';
}

const PRE_ORDER = ['dev', 'snapshot', 'alpha', 'b', 'beta', 'pre', 'rc'];

/**
 * 설치된 플러그인 버전 문자열을 해석한다. ("2.10.0-pre1", "v3.5.0", "2.9.0 (build 12)")
 * 숫자를 찾지 못하면 null.
 */
export function parseInstalledVersion(text: string | null | undefined): SimpleVersion | null {
    if (!text) {return null;}
    const m = String(text).toLowerCase().match(/v?(\d+(?:\.\d+)*)(?:[-\s]?(prerelease|snapshot|alpha|beta|pre|dev|rc|b)(?![a-z])[-\s]?(\d+)?)?/);
    if (!m) {return null;}
    let tag = m[2] || null;
    if (tag === 'prerelease') {tag = 'pre';}
    return {
        parts: m[1].split('.').map(n => parseInt(n, 10)),
        pre: tag ? `${tag}${m[3] || ''}` : null,
    };
}

/** a<b → 음수, a==b → 0, a>b → 양수 */
export function compareVersions(a: SimpleVersion, b: SimpleVersion): number {
    const len = Math.max(a.parts.length, b.parts.length);
    for (let i = 0; i < len; i++) {
        const d = (a.parts[i] || 0) - (b.parts[i] || 0);
        if (d !== 0) {return d;}
    }
    if (!a.pre && !b.pre) {return 0;}
    if (!a.pre) {return 1;}
    if (!b.pre) {return -1;}
    const ta = (a.pre.match(/^[a-z]+/) || [''])[0];
    const tb = (b.pre.match(/^[a-z]+/) || [''])[0];
    if (ta !== tb) {return PRE_ORDER.indexOf(ta) - PRE_ORDER.indexOf(tb);}
    return (parseInt(a.pre.slice(ta.length), 10) || 0) - (parseInt(b.pre.slice(tb.length), 10) || 0);
}

function sinceOf(field: ParsedVersionField | null | undefined): SimpleVersion | null {
    if (!field || !Array.isArray(field.since_parts) || field.since_parts.length === 0) {return null;}
    return { parts: field.since_parts, pre: field.since_pre ?? null };
}

/**
 * 설치 버전(installed)에서 이 구문을 쓸 수 있는가.
 * 근거가 부족하면 숨기지 않는다 (허용):
 *   - 설치 버전을 모름
 *   - valid_from 해석값이 없음 / 시작 버전이 정확하지 않음(before, or_earlier, unknown)
 * 그 외에는 installed >= valid_from, 그리고 valid_until이 있으면 installed < valid_until.
 */
export function isAvailableIn(
    installed: SimpleVersion | null,
    validFrom: ParsedVersionField | null | undefined,
    validUntil?: ParsedVersionField | null,
): boolean {
    if (!installed) {return true;}
    const from = sinceOf(validFrom);
    const fromIsExact = validFrom && validFrom.qualifier !== 'before' && validFrom.qualifier !== 'or_earlier' && validFrom.qualifier !== 'unknown';
    if (from && fromIsExact && compareVersions(installed, from) < 0) {return false;}
    const until = sinceOf(validUntil);
    if (until && compareVersions(installed, until) >= 0) {return false;}
    return true;
}

/** 번들 core_syntax.json의 "added" 문자열("2.9.0")을 *_parsed와 같은 모양으로 만든다 */
export function parsedFromLegacy(added: unknown): ParsedVersionField | null {
    const raw = Array.isArray(added) ? added[0] : added;
    const v = parseInstalledVersion(raw == null ? null : String(raw));
    if (!v) {return null;}
    return { since: [v.parts.join('.'), v.pre].filter(Boolean).join('-'), since_parts: v.parts, since_pre: v.pre, qualifier: null, parse_status: 'ok' };
}
