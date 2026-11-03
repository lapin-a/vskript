import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { normalizeName } from './Environment';

// ============================================================
// vskript-database DataPack 다운로드/캐시 클라이언트.
//   1) index.json을 받는다
//   2) 필요한 애드온을 name으로 찾는다
//   3) 캐시의 content_hash와 다른 애드온만 내려받고, 받은 내용의 해시를 검증한다
//   4) 네트워크가 안 되면 캐시로 동작한다
// vscode API에 의존하지 않는다 (캐시 경로는 호출 측이 globalStorageUri로 넘김).
// ============================================================

export const DEFAULT_DATABASE_URL =
    'https://raw.githubusercontent.com/lapin-a/vskript-database/main/datapacks/skripthub-net/';

const SUPPORTED_SCHEMA = 2;
const FETCH_TIMEOUT_MS = 20000;

export interface IndexEntry {
    name: string;
    names?: string[];
    path: string;
    item_count: number;
    content_hash: string;
    size_bytes?: number;
}

export interface DataPackIndex {
    schema_version: number;
    generated_at: string;
    addons: { [slug: string]: IndexEntry };
}

export interface DataPack {
    schema_version: number;
    addon_slug: string;
    item_count: number;
    syntaxes: any[];
}

export interface LoadedPack {
    slug: string;
    name: string;
    contentHash: string;
    pack: DataPack;
    /** 'downloaded' = 이번에 새로 받음, 'cache' = 캐시 사용 */
    from: 'downloaded' | 'cache';
}

export interface SyncReport {
    online: boolean;
    indexError: string | null;
    loaded: LoadedPack[];
    /** 요청했지만 데이터베이스에 없는 애드온 이름 */
    unknown: string[];
    errors: { name: string; message: string }[];
}

const sha256 = (text: string) => `sha256:${crypto.createHash('sha256').update(text, 'utf8').digest('hex')}`;

async function fetchText(url: string): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) {throw new Error(`HTTP ${res.status} (${url})`);}
        return await res.text();
    } finally {
        clearTimeout(timer);
    }
}

export class DataPackClient {
    private readonly cacheDir: string;
    private readonly baseUrl: string;

    constructor(cacheRoot: string, baseUrl: string = DEFAULT_DATABASE_URL) {
        this.baseUrl = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
        // 데이터베이스 주소별로 캐시를 분리 (주소를 바꿔도 섞이지 않게)
        const key = crypto.createHash('sha1').update(this.baseUrl).digest('hex').slice(0, 12);
        this.cacheDir = path.join(cacheRoot, 'datapacks', key);
    }

    private indexCachePath() { return path.join(this.cacheDir, 'index.json'); }
    private packCachePath(slug: string) { return path.join(this.cacheDir, 'by-addon', `${slug}.json`); }

    private readCachedIndex(): DataPackIndex | null {
        try {
            return JSON.parse(fs.readFileSync(this.indexCachePath(), 'utf-8'));
        } catch {
            return null;
        }
    }

    private readCachedPack(slug: string, expectedHash: string | null): { text: string; pack: DataPack } | null {
        try {
            const text = fs.readFileSync(this.packCachePath(slug), 'utf-8');
            if (expectedHash && sha256(text) !== expectedHash) {return null;} // 캐시가 오래됐거나 손상
            return { text, pack: JSON.parse(text) };
        } catch {
            return null;
        }
    }

    private writeCache(filePath: string, text: string) {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        const tmp = `${filePath}.tmp`;
        fs.writeFileSync(tmp, text, 'utf-8');
        fs.renameSync(tmp, filePath); // 중간에 끊겨도 반쯤 쓴 파일이 남지 않게
    }

    /** 이름 → slug 매핑 (name, names, slug 모두 대소문자/공백 무시로 비교) */
    static findSlug(index: DataPackIndex, name: string): string | null {
        const want = normalizeName(name);
        for (const [slug, entry] of Object.entries(index.addons)) {
            const candidates = [slug, entry.name, ...(entry.names || [])].map(normalizeName);
            if (candidates.includes(want)) {return slug;}
        }
        return null;
    }

    /**
     * 필요한 애드온(이름 목록)의 DataPack을 최신 상태로 맞추고 불러온다.
     * 네트워크 실패 시 캐시된 index/DataPack으로 동작한다.
     */
    async sync(addonNames: string[]): Promise<SyncReport> {
        const report: SyncReport = { online: true, indexError: null, loaded: [], unknown: [], errors: [] };

        let index: DataPackIndex | null = null;
        let indexText: string | null = null;
        try {
            indexText = await fetchText(this.baseUrl + 'index.json');
            index = JSON.parse(indexText);
            if (!index || typeof index.addons !== 'object') {throw new Error('index.json 형식이 올바르지 않음');}
            if (index.schema_version !== SUPPORTED_SCHEMA) {
                throw new Error(`지원하지 않는 DataPack 형식 (schema_version ${index.schema_version}, 지원: ${SUPPORTED_SCHEMA}) — 확장을 업데이트하세요`);
            }
        } catch (err: any) {
            report.online = false;
            report.indexError = String(err?.message || err);
            index = this.readCachedIndex();
            indexText = null;
            if (!index) {return report;} // 온라인도 캐시도 없음
        }

        const seen = new Set<string>();
        for (const name of addonNames) {
            const slug = DataPackClient.findSlug(index, name);
            if (!slug) { report.unknown.push(name); continue; }
            if (seen.has(slug)) {continue;}
            seen.add(slug);

            const entry = index.addons[slug];
            const cached = this.readCachedPack(slug, entry.content_hash);
            if (cached) {
                report.loaded.push({ slug, name: entry.name, contentHash: entry.content_hash, pack: cached.pack, from: 'cache' });
                continue;
            }
            if (!report.online) {
                // 오프라인 + 해시 맞는 캐시 없음 → 해시 검증 없이라도 남은 캐시를 쓴다
                const stale = this.readCachedPack(slug, null);
                if (stale) {report.loaded.push({ slug, name: entry.name, contentHash: sha256(stale.text), pack: stale.pack, from: 'cache' });}
                else {report.errors.push({ name: entry.name, message: '오프라인이며 캐시 없음' });}
                continue;
            }

            try {
                const text = await fetchText(this.baseUrl + entry.path);
                const hash = sha256(text);
                if (hash !== entry.content_hash) {throw new Error('내려받은 파일의 해시가 index.json과 다름 (데이터베이스 갱신 중일 수 있음)');}
                const pack: DataPack = JSON.parse(text);
                this.writeCache(this.packCachePath(slug), text);
                report.loaded.push({ slug, name: entry.name, contentHash: hash, pack, from: 'downloaded' });
            } catch (err: any) {
                report.errors.push({ name: entry.name, message: String(err?.message || err) });
                const stale = this.readCachedPack(slug, null);
                if (stale) {report.loaded.push({ slug, name: entry.name, contentHash: sha256(stale.text), pack: stale.pack, from: 'cache' });}
            }
        }

        // 받은 index는 모든 애드온 처리 후 저장 (index만 새것이고 pack은 옛것인 상태를 줄이기 위해)
        if (indexText) {this.writeCache(this.indexCachePath(), indexText);}
        return report;
    }
}
