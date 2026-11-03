import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { EnvironmentState, getEffectiveSkriptVersion, getEnvironment, onDidChangeEnvironment } from '../env/ServerEnvironment';
import { normalizeName, SKRIPT_NAME } from '../env/Environment';
import { compilePattern, CompiledPattern } from './SkriptPattern';
import { isAvailableIn, parsedFromLegacy, parseInstalledVersion, ParsedVersionField, SimpleVersion } from './SyntaxVersion';

// ============================================================
// 단일 구문 저장소.
//   번들 core_syntax.json + 내려받은 DataPack(vskript-database)을 하나로 합친다.
//   자동완성 / 호버 / 진단은 이 모듈만 본다.
//
//   - Skript 본체: DataPack이 있으면 DataPack, 없으면(오프라인+캐시 없음) 번들 core_syntax.json
//   - 애드온: 서버 환경에서 내려받은 DataPack
//   - 서버 환경이 바뀌면(onDidChangeEnvironment) 다시 읽는다
// ============================================================

export type SyntaxSource = 'bundled' | 'datapack';

export interface SyntaxEntry {
    id: string;
    title: string;
    /** 표시용 애드온 이름 ("Skript", "SkBee") */
    addon: string;
    /** 버전 조회 키 (normalizeName) */
    addonKey: string;
    type: string;
    patterns: CompiledPattern[];
    /** 원문(영어) 설명 */
    description: string;
    /** 번역 설명 (guide.description) */
    guide: { lang: string; description: string; stale: boolean } | null;
    returnType: string | null;
    link: string | null;
    validFrom: ParsedVersionField | null;
    validUntil: ParsedVersionField | null;
    /** 원본 버전 문자열 (표시용) */
    validFromText: string | null;
    source: SyntaxSource;
}

/** 구문 유효성 판단에 쓰는 설치 버전들 */
export interface VersionContext {
    skript: SimpleVersion | null;
    /** 원본 Skript 버전 문자열 (표시용) */
    skriptText: string | null;
    addons: ReadonlyMap<string, SimpleVersion | null>;
}

const SKRIPT_KEY = normalizeName(SKRIPT_NAME);

function toText(value: unknown): string {
    if (value == null) {return '';}
    if (Array.isArray(value)) {return value.map(v => String(v)).join('\n');}
    return String(value);
}

function splitPatterns(value: unknown): string[] {
    const list = Array.isArray(value) ? value.map(v => String(v)) : toText(value).split(/\r?\n/);
    return list.map(p => p.trim()).filter(Boolean);
}

/** 번들 core_syntax.json 위치: 배포(out/resource) → 개발(src/resource) */
function findBundledCore(extensionPath: string): string | null {
    const candidates = [
        path.join(extensionPath, 'out', 'resource', 'core_syntax.json'),
        path.join(__dirname, '..', '..', 'resource', 'core_syntax.json'),
        path.join(extensionPath, 'src', 'resource', 'core_syntax.json'),
    ];
    return candidates.find(p => fs.existsSync(p)) ?? null;
}

// ------------------------------------------------------------
// 문서별 Skript 버전: 파일 주석(# version: / # mc:) > 서버 환경 > 미상
// ------------------------------------------------------------

/** 마인크래프트 버전 → 대략적인 Skript 버전 (# mc: 주석용) */
function minecraftToSkript(mc: string): string | null {
    const m = mc.trim().match(/^1\.(\d+)/);
    if (!m) {return null;}
    const minor = parseInt(m[1], 10);
    if (minor <= 12) {return '2.2';}
    if (minor === 13) {return '2.3';}
    if (minor === 14) {return '2.4';}
    if (minor === 15) {return '2.5';}
    if (minor === 16) {return '2.6';}
    if (minor <= 18) {return '2.7';}
    return '2.9';
}

export function documentSkriptVersion(document: vscode.TextDocument): { version: string | null; origin: 'comment' | 'minecraft' | 'environment' | null } {
    const scan = Math.min(document.lineCount, 10);
    let mc: string | null = null;
    for (let i = 0; i < scan; i++) {
        const text = document.lineAt(i).text;
        const v = text.match(/^\s*#\s*(?:version|v)\s*:\s*([0-9][\w.-]*)/i);
        if (v) {return { version: v[1], origin: 'comment' };}
        const m = text.match(/^\s*#\s*(?:mc|minecraft)\s*:\s*([0-9.]+)/i);
        if (m && !mc) {mc = m[1];}
    }
    const fromMc = mc ? minecraftToSkript(mc) : null;
    if (fromMc) {return { version: fromMc, origin: 'minecraft' };}
    const env = getEffectiveSkriptVersion();
    return env ? { version: env, origin: 'environment' } : { version: null, origin: null };
}

// ------------------------------------------------------------

export class SyntaxRegistry implements vscode.Disposable {
    private entries: SyntaxEntry[] = [];
    private addonVersions = new Map<string, SimpleVersion | null>();
    private bundledCache: SyntaxEntry[] | null = null;
    private readonly reloadEmitter = new vscode.EventEmitter<void>();
    private readonly disposables: vscode.Disposable[] = [];
    /** 구문 데이터를 다시 읽은 뒤 발생 */
    readonly onDidReload = this.reloadEmitter.event;

    constructor(private readonly extensionPath: string) {
        this.disposables.push(this.reloadEmitter, onDidChangeEnvironment(env => this.reload(env)));
        this.reload(getEnvironment());
    }

    dispose() {
        this.disposables.forEach(d => d.dispose());
    }

    /** 현재 서버 환경 기준으로 구문 데이터를 다시 구성한다 */
    reload(env: EnvironmentState | null) {
        const packs = env?.packs ?? [];
        const entries: SyntaxEntry[] = [];

        const hasSkriptPack = packs.some(p => normalizeName(p.slug) === SKRIPT_KEY || normalizeName(p.name) === SKRIPT_KEY);
        if (!hasSkriptPack) {entries.push(...this.loadBundled());}

        // 애드온 이름(설정/감지) → 설치 버전. DataPack은 slug 또는 name으로 찾는다.
        const installed = new Map<string, string | null>();
        for (const a of env?.result.addons ?? []) {installed.set(normalizeName(a.name), a.version);}

        const versions = new Map<string, SimpleVersion | null>();
        for (const p of packs) {
            const isSkript = normalizeName(p.slug) === SKRIPT_KEY || normalizeName(p.name) === SKRIPT_KEY;
            const key = isSkript ? SKRIPT_KEY : normalizeName(p.slug);
            if (!isSkript) {
                const version = installed.get(normalizeName(p.name)) ?? installed.get(normalizeName(p.slug)) ?? null;
                versions.set(key, parseInstalledVersion(version));
            }
            for (const s of p.pack.syntaxes || []) {
                const entry = this.fromDataPack(s, isSkript ? SKRIPT_NAME : p.name, key);
                if (entry) {entries.push(entry);}
            }
        }

        this.entries = entries;
        this.addonVersions = versions;
        this.reloadEmitter.fire();
    }

    private fromDataPack(s: any, addon: string, addonKey: string): SyntaxEntry | null {
        const patterns = splitPatterns(s.syntax_pattern);
        if (patterns.length === 0) {return null;}
        const guide = s.guide && s.guide.description
            ? { lang: String(s.guide.lang || 'ko'), description: String(s.guide.description), stale: s.guide.stale === true }
            : null;
        return {
            id: `${addonKey}:${s.id}`,
            title: String(s.title || patterns[0]),
            addon,
            addonKey,
            type: String(s.syntax_type || '').toLowerCase(),
            patterns: patterns.map(compilePattern),
            description: toText(s.description),
            guide,
            returnType: s.return_type ? String(s.return_type) : null,
            link: s.link ? String(s.link) : null,
            validFrom: s.valid_from_addon_version_parsed ?? null,
            validUntil: s.valid_until_addon_version_parsed ?? null,
            validFromText: s.valid_from_addon_version ? String(s.valid_from_addon_version) : null,
            source: 'datapack',
        };
    }

    private loadBundled(): SyntaxEntry[] {
        if (this.bundledCache) {return this.bundledCache;}
        const file = findBundledCore(this.extensionPath);
        const result: SyntaxEntry[] = [];
        if (file) {
            try {
                const db = JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, any>;
                for (const [key, s] of Object.entries(db)) {
                    const patterns = splitPatterns(s?.patterns);
                    if (patterns.length === 0) {continue;}
                    const added = Array.isArray(s.added) ? s.added[0] : s.added;
                    result.push({
                        id: `bundled:${key}`,
                        title: String(s.name || key),
                        addon: SKRIPT_NAME,
                        addonKey: SKRIPT_KEY,
                        type: String(s.type || '').toLowerCase(),
                        patterns: patterns.map(compilePattern),
                        // description.ko는 자리표시 문구뿐이라 쓰지 않는다
                        description: toText(s.description?.en),
                        guide: null,
                        returnType: null,
                        link: null,
                        validFrom: parsedFromLegacy(added),
                        validUntil: null,
                        validFromText: added ? String(added) : null,
                        source: 'bundled',
                    });
                }
            } catch (err) {
                console.error('[vskript] core_syntax.json 읽기 실패:', err);
            }
        }
        this.bundledCache = result;
        return result;
    }

    // --------------------------------------------------------

    get all(): readonly SyntaxEntry[] {
        return this.entries;
    }

    get size(): number {
        return this.entries.length;
    }

    contextFor(document: vscode.TextDocument): VersionContext {
        const { version } = documentSkriptVersion(document);
        return { skript: parseInstalledVersion(version), skriptText: version, addons: this.addonVersions };
    }

    installedVersionOf(entry: SyntaxEntry, ctx: VersionContext): SimpleVersion | null {
        return entry.addonKey === SKRIPT_KEY ? ctx.skript : ctx.addons.get(entry.addonKey) ?? null;
    }

    isAvailable(entry: SyntaxEntry, ctx: VersionContext): boolean {
        return isAvailableIn(this.installedVersionOf(entry, ctx), entry.validFrom, entry.validUntil);
    }

    /** 현재 버전에서 유효한 구문 */
    getAvailable(ctx: VersionContext): SyntaxEntry[] {
        return this.entries.filter(e => this.isAvailable(e, ctx));
    }

    /**
     * 코드 한 줄에 해당하는 구문을 찾는다 (가장 구체적인 패턴 우선).
     * ctx를 주면 그 버전에서 유효한 구문만, null이면 버전과 관계없이 찾는다.
     */
    findMatch(line: string, ctx: VersionContext | null): SyntaxEntry | null {
        let text = line.replace(/(^|\s)#(?!#).*$/, '').trim();
        if (!text || text.length > 300) {return null;}
        text = text.replace(/:$/, '').trim();
        const variants = [text];
        if (/^on\s+/i.test(text)) {variants.push(text.replace(/^on\s+/i, ''));}

        let best: { entry: SyntaxEntry; score: number } | null = null;
        for (const entry of this.entries) {
            if (ctx && !this.isAvailable(entry, ctx)) {continue;}
            for (const p of entry.patterns) {
                if (!p.regex || (best && p.specificity <= best.score)) {continue;}
                if (variants.some(v => p.regex!.test(v))) {best = { entry, score: p.specificity };}
            }
        }
        return best ? best.entry : null;
    }
}

let registry: SyntaxRegistry | null = null;

export function initSyntaxRegistry(context: vscode.ExtensionContext): SyntaxRegistry {
    registry = new SyntaxRegistry(context.extensionPath);
    context.subscriptions.push(registry);
    return registry;
}

export function getSyntaxRegistry(): SyntaxRegistry | null {
    return registry;
}

/** 구문 설명: language가 ko이고 번역이 있으면 guide.description, 아니면 원문 */
export function describe(entry: SyntaxEntry, language: string): { text: string; translated: boolean; stale: boolean } {
    if (entry.guide && language === entry.guide.lang) {
        return { text: entry.guide.description, translated: true, stale: entry.guide.stale };
    }
    return { text: entry.description, translated: false, stale: false };
}

/** 호버/자동완성 문서에 공통으로 쓰는 마크다운 */
export function buildSyntaxMarkdown(entry: SyntaxEntry, language: string, available: boolean | null): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    const desc = describe(entry, language);
    md.appendMarkdown(`**${escapeMd(entry.title)}** — ${escapeMd(entry.addon)} ${entry.type}`);
    if (entry.validFromText) {md.appendMarkdown(` · since ${escapeMd(entry.validFromText)}`);}
    md.appendMarkdown('\n\n');
    if (available === false) {
        md.appendMarkdown(language === 'ko'
            ? `⚠️ 현재 ${escapeMd(entry.addon)} 버전에서는 사용할 수 없는 구문입니다.\n\n`
            : `⚠️ Not available in the current ${escapeMd(entry.addon)} version.\n\n`);
    }
    if (desc.text) {
        md.appendText(desc.text);
        md.appendMarkdown('\n\n');
    }
    if (desc.translated) {
        md.appendMarkdown(desc.stale ? '*(번역 — 원문이 바뀐 뒤 아직 재번역되지 않음)*\n\n' : '*(번역)*\n\n');
    }
    md.appendCodeblock(entry.patterns.map(p => p.raw).join('\n'), 'vskript');
    if (entry.returnType) {md.appendMarkdown(`\nReturn type: \`${entry.returnType.replace(/`/g, '')}\``);}
    if (entry.link && /^https?:\/\//.test(entry.link)) {md.appendMarkdown(`\n\n[skripthub](${entry.link})`);}
    return md;
}

function escapeMd(text: string): string {
    return text.replace(/[\\`*_{}[\]()#+\-.!|<>]/g, '\\$&');
}
