// ============================================================
// Skript 구문 패턴 해석 (vscode API 비의존).
//   [x]      선택     → 정규식 (?:x)?        / 레이블에서는 생략
//   (a|b)    택일     → 정규식 (?:a|b)       / 레이블에서는 첫 번째
//   %type%   표현식   → 정규식 .+?           / 레이블에서는 그대로
//   <regex>  정규식   → 정규식 .+?           / 레이블에서는 "..."
//   1¦, tag: 파스 마크 → 무시
//   \x       이스케이프 → 문자 그대로
// ============================================================

type Node =
    | { t: 'lit'; v: string }
    | { t: 'opt'; seq: Node[] }
    | { t: 'choice'; alts: Node[][] }
    | { t: 'expr'; v: string };

class Parser {
    private i = 0;
    constructor(private readonly s: string) {}

    parse(): Node[] {
        const alts = this.alternatives('');
        // 최상위의 "|"는 택일로 취급
        return alts.length === 1 ? alts[0] : [{ t: 'choice', alts }];
    }

    private alternatives(close: string): Node[][] {
        const alts: Node[][] = [];
        let seq: Node[] = [];
        let atStart = true;
        let lit = '';
        const flush = () => { if (lit) { seq.push({ t: 'lit', v: lit }); lit = ''; } };

        while (this.i < this.s.length) {
            const ch = this.s[this.i];
            if (atStart) {
                // 택일/선택 시작 위치의 파스 마크 제거: "1¦", "tag:"
                const mark = this.s.slice(this.i).match(/^(?:\d+¦|[\w-]+:(?!\/))/);
                if (mark) { this.i += mark[0].length; atStart = false; continue; }
                atStart = false;
            }
            if (close && ch === close) { this.i++; flush(); alts.push(seq); return alts; }
            if (ch === '|') { this.i++; flush(); alts.push(seq); seq = []; atStart = true; continue; }
            if (ch === '\\' && this.i + 1 < this.s.length) { lit += this.s[this.i + 1]; this.i += 2; continue; }
            if (ch === '¦') { this.i++; lit = lit.replace(/\d+$/, ''); continue; }
            if (ch === '[') {
                this.i++; flush();
                const inner = this.alternatives(']');
                seq.push({ t: 'opt', seq: inner.length === 1 ? inner[0] : [{ t: 'choice', alts: inner }] });
                continue;
            }
            if (ch === '(') {
                this.i++; flush();
                seq.push({ t: 'choice', alts: this.alternatives(')') });
                continue;
            }
            if (ch === '%' || ch === '<') {
                const end = this.s.indexOf(ch === '%' ? '%' : '>', this.i + 1);
                if (end > this.i) {
                    flush();
                    seq.push({ t: 'expr', v: this.s.slice(this.i, end + 1) });
                    this.i = end + 1;
                    continue;
                }
            }
            lit += ch;
            this.i++;
        }
        flush();
        alts.push(seq);
        return alts;
    }
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function toRegexSource(seq: Node[]): string {
    return seq.map(n => {
        switch (n.t) {
            case 'lit': return escapeRegex(n.v).replace(/\s+/g, '\\s*');
            case 'opt': return `(?:${toRegexSource(n.seq)})?`;
            case 'choice': return `(?:${n.alts.map(toRegexSource).join('|')})`;
            case 'expr': return '.+?';
        }
    }).join('');
}

function toLabel(seq: Node[]): string {
    return seq.map(n => {
        switch (n.t) {
            case 'lit': return n.v;
            case 'opt': return '';
            case 'choice': return n.alts.length ? toLabel(n.alts[0]) : '';
            case 'expr': return n.v.startsWith('%') ? n.v : '...';
        }
    }).join('');
}

function literalLength(seq: Node[]): number {
    return seq.reduce((sum, n) => sum + (
        n.t === 'lit' ? n.v.replace(/\s/g, '').length
            : n.t === 'choice' && n.alts.length ? literalLength(n.alts[0])
                : 0), 0);
}

export interface CompiledPattern {
    raw: string;
    regex: RegExp | null;
    label: string;
    /** 필수 문자 수 — 여러 구문이 매칭될 때 더 구체적인 쪽을 고르는 데 사용 */
    specificity: number;
}

export function compilePattern(raw: string): CompiledPattern {
    let nodes: Node[];
    try {
        nodes = new Parser(raw.trim()).parse();
    } catch {
        return { raw, regex: null, label: raw.trim(), specificity: 0 };
    }
    let regex: RegExp | null = null;
    try {
        regex = new RegExp(`^\\s*${toRegexSource(nodes)}\\s*$`, 'i');
    } catch {
        regex = null;
    }
    const label = toLabel(nodes).replace(/\s+/g, ' ').trim() || raw.trim();
    return { raw, regex, label, specificity: literalLength(nodes) };
}
