// ============================================================
// 서버 환경(Skript 버전 + 애드온 목록) 결정 로직.
//   effective = 폴더 감지 결과  ← 설정값으로 덮어쓰기/추가
// 감지값과 설정값이 다르면 mismatch로 보고한다.
// vscode API에 의존하지 않는 순수 로직 (단독 테스트 가능).
// ============================================================

export interface AddonSpec {
    name: string;
    version: string | null;
}

export type Origin = 'detected' | 'setting' | 'both';

export interface EffectiveAddon extends AddonSpec {
    origin: Origin;
    detectedVersion: string | null;
}

export interface Mismatch {
    name: string;
    kind: 'version' | 'not-detected';
    setting: string | null;
    detected: string | null;
}

export interface EnvironmentResult {
    skriptVersion: string | null;
    skriptVersionOrigin: Origin | null;
    addons: EffectiveAddon[];          // Skript 본체 제외
    mismatches: Mismatch[];
}

export const SKRIPT_NAME = 'Skript';

export const normalizeName = (name: string) => name.trim().toLowerCase().replace(/[\s_]+/g, '-');

/** 설정 항목 "SkBee@3.5.0" / "skript-reflect" 해석 */
export function parseAddonSetting(entry: string): AddonSpec | null {
    const text = String(entry || '').trim();
    if (!text) {return null;}
    const at = text.lastIndexOf('@');
    if (at > 0) {
        const name = text.slice(0, at).trim();
        const version = text.slice(at + 1).trim();
        return name ? { name, version: version || null } : null;
    }
    return { name: text, version: null };
}

/** 버전 문자열 동등 비교 — 앞의 "v" 제거, 대소문자 무시, 끝의 ".0" 차이 무시 (2.10 == 2.10.0) */
export function sameVersion(a: string | null, b: string | null): boolean {
    if (!a || !b) {return false;}
    const norm = (v: string) => v.trim().toLowerCase().replace(/^v/, '').replace(/(\.0+)+(?=$|[-+])/, '');
    return norm(a) === norm(b);
}

export function resolveEnvironment(input: {
    detected: AddonSpec[] | null;        // null = plugins 폴더를 찾지 못함
    settingSkriptVersion: string | null;
    settingAddons: string[];
}): EnvironmentResult {
    const detectedMap = new Map<string, AddonSpec>();
    for (const d of input.detected || []) {detectedMap.set(normalizeName(d.name), d);}

    const mismatches: Mismatch[] = [];
    const folderFound = input.detected !== null;

    // --- Skript 본체 버전 ---
    const detectedSkript = detectedMap.get(normalizeName(SKRIPT_NAME)) || null;
    const settingSkript = input.settingSkriptVersion ? input.settingSkriptVersion.trim() || null : null;
    let skriptVersion: string | null = null;
    let skriptVersionOrigin: Origin | null = null;

    if (settingSkript) {
        skriptVersion = settingSkript;
        skriptVersionOrigin = detectedSkript && sameVersion(detectedSkript.version, settingSkript) ? 'both' : 'setting';
        if (detectedSkript && detectedSkript.version && !sameVersion(detectedSkript.version, settingSkript)) {
            mismatches.push({ name: SKRIPT_NAME, kind: 'version', setting: settingSkript, detected: detectedSkript.version });
        } else if (folderFound && !detectedSkript) {
            mismatches.push({ name: SKRIPT_NAME, kind: 'not-detected', setting: settingSkript, detected: null });
        }
    } else if (detectedSkript) {
        skriptVersion = detectedSkript.version;
        skriptVersionOrigin = 'detected';
    }

    // --- 애드온 ---
    const result = new Map<string, EffectiveAddon>();
    for (const [key, d] of detectedMap) {
        if (key === normalizeName(SKRIPT_NAME)) {continue;}
        result.set(key, { name: d.name, version: d.version, origin: 'detected', detectedVersion: d.version });
    }

    const seenSetting = new Set<string>();
    for (const raw of input.settingAddons || []) {
        const spec = parseAddonSetting(raw);
        if (!spec) {continue;}
        const key = normalizeName(spec.name);
        if (key === normalizeName(SKRIPT_NAME) || seenSetting.has(key)) {continue;}
        seenSetting.add(key);

        const det = detectedMap.get(key) || null;
        if (det) {
            const version = spec.version ?? det.version;
            result.set(key, {
                name: det.name,
                version,
                origin: !spec.version || sameVersion(spec.version, det.version) ? 'both' : 'setting',
                detectedVersion: det.version,
            });
            if (spec.version && det.version && !sameVersion(spec.version, det.version)) {
                mismatches.push({ name: det.name, kind: 'version', setting: spec.version, detected: det.version });
            }
        } else {
            result.set(key, { name: spec.name, version: spec.version, origin: 'setting', detectedVersion: null });
            if (folderFound) {
                mismatches.push({ name: spec.name, kind: 'not-detected', setting: spec.version, detected: null });
            }
        }
    }

    return {
        skriptVersion,
        skriptVersionOrigin,
        addons: [...result.values()].sort((a, b) => a.name.localeCompare(b.name)),
        mismatches,
    };
}

/** 같은 불일치에 대해 알림을 한 번만 띄우기 위한 서명 */
export function mismatchSignature(mismatches: Mismatch[]): string {
    return mismatches
        .map(m => `${normalizeName(m.name)}|${m.kind}|${m.setting ?? ''}|${m.detected ?? ''}`)
        .sort()
        .join(';');
}
