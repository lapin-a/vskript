import * as crypto from 'crypto';
import * as fs from 'fs';
import * as http from 'http';
import * as zlib from 'zlib';

// 테스트 공용 도우미 (테스트 파일이 아니므로 *.test.ts가 아님)

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
export function writeJar(file: string, entryName: string, content: string) {
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
    central.writeUInt32LE(0, 42);

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

/** plugin.yml을 담은 플러그인 jar */
export function writePluginJar(file: string, name: string, version: string) {
    writeJar(file, 'plugin.yml', `name: ${name}\nversion: ${version}\nmain: test.Main\n`);
}

/** 임시 폴더 삭제 (Windows에서 파일 감시 등으로 잠겨 있으면 재시도 후 무시) */
export function removeTempDir(dir: string) {
    try {
        fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
        // 임시 폴더이므로 남아도 무방
    }
}

export const sha256 = (text: string) => `sha256:${crypto.createHash('sha256').update(text, 'utf8').digest('hex')}`;

/** DataPack `*_parsed` 버전 필드 */
export function parsedVersion(v: string) {
    return { since: v, since_parts: v.split('.').map(n => parseInt(n, 10)), since_pre: null, qualifier: null, since_note: null, changes: [], parse_status: 'ok', leftover: null };
}

/** 가짜 vskript-database (schema 2): 파일을 바꿀 수 있고, 받은 요청 경로를 기록한다 */
export class FakeDatabase {
    readonly files = new Map<string, string>();
    readonly requests: string[] = [];
    corruptPack: string | null = null;
    private server: http.Server | null = null;
    port = 0;

    setPack(slug: string, name: string, syntaxes: object[]) {
        const text = JSON.stringify({ schema_version: 2, addon_slug: slug, item_count: syntaxes.length, syntaxes });
        this.files.set(`by-addon/${slug}.json`, text);
        const index = this.files.has('index.json') ? JSON.parse(this.files.get('index.json')!) : { schema_version: 2, generated_at: 'test', addons: {} };
        index.addons[slug] = { name, path: `by-addon/${slug}.json`, item_count: syntaxes.length, content_hash: sha256(text) };
        this.files.set('index.json', JSON.stringify(index));
    }

    async start() {
        this.server = http.createServer((req, res) => {
            const p = (req.url || '/').replace(/^\//, '');
            this.requests.push(p);
            const body = this.files.get(p);
            if (body === undefined) { res.writeHead(404); res.end(); return; }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(p === this.corruptPack ? body + ' ' : body);
        });
        await new Promise<void>(r => this.server!.listen(0, '127.0.0.1', () => r()));
        this.port = (this.server.address() as { port: number }).port;
    }

    async stop() {
        await new Promise<void>(r => this.server ? this.server.close(() => r()) : r());
        this.server = null;
    }

    get url() { return `http://127.0.0.1:${this.port}/`; }
}

/** 조건이 참이 될 때까지 기다린다 (최대 timeoutMs) */
export async function waitFor<T>(fn: () => T | Promise<T>, timeoutMs = 5000, intervalMs = 50): Promise<T> {
    const start = Date.now();
    let last: T = await fn();
    while (!last && Date.now() - start < timeoutMs) {
        await new Promise(r => setTimeout(r, intervalMs));
        last = await fn();
    }
    return last;
}
