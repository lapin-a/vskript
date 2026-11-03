import * as fs from 'fs';
import * as zlib from 'zlib';

// ============================================================
// 플러그인 jar(zip)에서 plugin.yml / paper-plugin.yml 의 name, version 을 읽는다.
// 외부 의존성 없이 zip 중앙 디렉터리만 파싱한다 (vscode API에 의존하지 않음 → 단독 테스트 가능).
// ============================================================

export interface PluginDescriptor {
    name: string;
    version: string | null;
    /** 정보를 어디서 얻었는지 */
    source: 'plugin.yml' | 'paper-plugin.yml' | 'filename';
    file: string;
}

const DESCRIPTOR_FILES = ['plugin.yml', 'paper-plugin.yml'] as const;
const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;
const LOC_SIG = 0x04034b50;
const MAX_DESCRIPTOR_BYTES = 1024 * 1024;

/** zip에서 지정한 이름(루트 경로)의 파일 하나를 꺼낸다. 없거나 지원하지 않는 형식이면 null. */
export function readZipEntry(zipPath: string, entryName: string): Buffer | null {
    const fd = fs.openSync(zipPath, 'r');
    try {
        const size = fs.fstatSync(fd).size;
        // EOCD는 파일 끝 22바이트 + 최대 65535바이트 주석 안에 있다
        const tailLen = Math.min(size, 22 + 0xffff);
        const tail = Buffer.alloc(tailLen);
        fs.readSync(fd, tail, 0, tailLen, size - tailLen);

        let eocd = -1;
        for (let i = tailLen - 22; i >= 0; i--) {
            if (tail.readUInt32LE(i) === EOCD_SIG) { eocd = i; break; }
        }
        if (eocd < 0) {return null;}

        const cdSize = tail.readUInt32LE(eocd + 12);
        const cdOffset = tail.readUInt32LE(eocd + 16);
        if (cdOffset === 0xffffffff || cdOffset + cdSize > size) {return null;} // zip64 미지원

        const cd = Buffer.alloc(cdSize);
        fs.readSync(fd, cd, 0, cdSize, cdOffset);

        let p = 0;
        while (p + 46 <= cd.length && cd.readUInt32LE(p) === CEN_SIG) {
            const method = cd.readUInt16LE(p + 10);
            const compSize = cd.readUInt32LE(p + 20);
            const uncompSize = cd.readUInt32LE(p + 24);
            const nameLen = cd.readUInt16LE(p + 28);
            const extraLen = cd.readUInt16LE(p + 30);
            const commentLen = cd.readUInt16LE(p + 32);
            const localOffset = cd.readUInt32LE(p + 42);
            const name = cd.toString('utf8', p + 46, p + 46 + nameLen);
            p += 46 + nameLen + extraLen + commentLen;

            if (name !== entryName) {continue;}
            if (uncompSize > MAX_DESCRIPTOR_BYTES || compSize > MAX_DESCRIPTOR_BYTES) {return null;}

            const local = Buffer.alloc(30);
            fs.readSync(fd, local, 0, 30, localOffset);
            if (local.readUInt32LE(0) !== LOC_SIG) {return null;}
            const dataStart = localOffset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);

            const data = Buffer.alloc(compSize);
            fs.readSync(fd, data, 0, compSize, dataStart);
            if (method === 0) {return data;}
            if (method === 8) {return zlib.inflateRawSync(data);}
            return null; // 그 외 압축 방식 미지원
        }
        return null;
    } finally {
        fs.closeSync(fd);
    }
}

/** plugin.yml에서 최상위 name / version 만 뽑는다 (전체 YAML 파서는 불필요). */
export function parseDescriptorYaml(text: string): { name: string | null; version: string | null } {
    const pick = (key: string): string | null => {
        const m = text.match(new RegExp(`^${key}\\s*:\\s*(.+?)\\s*$`, 'm'));
        if (!m) {return null;}
        let v = m[1].replace(/\s+#.*$/, '').trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {v = v.slice(1, -1);}
        // 빌드 시 치환되지 않은 placeholder(${project.version})는 버전으로 쓰지 않는다
        if (!v || /\$\{[^}]*\}/.test(v)) {return null;}
        return v;
    };
    return { name: pick('name'), version: pick('version') };
}

/** "SkBee-3.5.0.jar" → { name: "SkBee", version: "3.5.0" } (plugin.yml을 못 읽을 때의 추정) */
export function guessFromFilename(fileName: string): { name: string; version: string | null } {
    const base = fileName.replace(/\.jar$/i, '');
    const m = base.match(/^(.*?)[-_ ]v?(\d+(?:\.\d+)*(?:[-.][0-9A-Za-z]+)*)$/);
    if (m && m[1]) {return { name: m[1], version: m[2] };}
    return { name: base, version: null };
}

export function readPluginDescriptor(jarPath: string): PluginDescriptor {
    const fileName = jarPath.split(/[\\/]/).pop() || jarPath;
    try {
        for (const entry of DESCRIPTOR_FILES) {
            const buf = readZipEntry(jarPath, entry);
            if (!buf) {continue;}
            const { name, version } = parseDescriptorYaml(buf.toString('utf8'));
            if (name) {
                // plugin.yml에 버전 placeholder만 있으면 파일명 버전을 보조로 사용
                return { name, version: version ?? guessFromFilename(fileName).version, source: entry, file: jarPath };
            }
        }
    } catch {
        // 손상된 jar 등 — 파일명 추정으로 진행
    }
    const g = guessFromFilename(fileName);
    return { name: g.name, version: g.version, source: 'filename', file: jarPath };
}
