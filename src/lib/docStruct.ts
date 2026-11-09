// Struktur dokumen untuk perangkum: urutan baca (dua kolom), buang header/footer/catatan kaki, paragraf, judul bagian.
// Murni (tanpa DOM): bisa diuji di Node.
import type { TItem, TLine } from './pdfText';

export interface PageLike { width: number; height: number; lines: TLine[] }
export interface Para { text: string; kind: 'h' | 'p' | 'li'; page: number }
export interface Sec { title: string; page: number; text: string }
export interface Struct { title: string; abstract: string; keywordLine: string; sections: Sec[]; pre: string; twoColumn: boolean }

interface OLine { text: string; size: number; y: number; x0: number; x1: number; page: number; colL: number; colR: number }

const SECTION_RE = /^(\d+[.)]?\s*)?(abstrak|abstract|ringkasan|summary|pendahuluan|latar belakang|tinjauan pustaka|kajian (pustaka|teori)|landasan teori|metode( penelitian)?|metodologi|hasil( dan pembahasan| penelitian)?|pembahasan|analisis|kesimpulan( dan saran)?|simpulan|penutup|saran|daftar pustaka|referensi|daftar rujukan|bibliography|references?|introduction|background|literature review|methods?|methodology|results?( and discussion)?|discussion|conclusions?)\s*:?\s*$/i;
export const REFS_RE = /^(\d+[.)]?\s*)?(daftar pustaka|referensi|daftar rujukan|bibliography|references?)\s*$/i;
export const ABS_RE = /^(\d+[.)]?\s*)?(abstrak|abstract|ringkasan|summary)\s*:?\s*$/i;
export const CONC_RE = /(kesimpulan|simpulan|penutup|conclusion|closing)/i;
const KEY_RE = /^(kata kunci|keywords?|key words)\s*[:.\-–]\s*/i;
const BULLET = /^[\u2022\u25cf\u25aa\u00b7\uf0b7\uf0a7\uf0d8\uf0fc\-\u2013*]\s*(?=\S)/;
const NUMLI = /^(\d{1,2}|[a-zA-Z])[.)]\s+\S/;
const TERM = /[.!?:…”"')]$/;
const SMALL = new Set('dan di ke dari yang untuk pada dalam dengan atau oleh sebagai terhadap serta antara of the and in on for to a an'.split(' '));

const joinItems = (items: TItem[], size: number) => {
  let t = '', end = -Infinity;
  for (const p of [...items].sort((a, b) => a.x - b.x)) {
    if (p.sup && /^\s*\d{1,3}\s*$/.test(p.s)) continue; // penanda catatan kaki
    if (t && p.x - end > size * 0.15 && !t.endsWith(' ') && !p.s.startsWith(' ')) t += ' ';
    t += p.s; end = p.x + p.w;
  }
  return t.trim();
};

export function bodySize(pages: PageLike[]): number {
  const c = new Map<number, number>();
  for (const pg of pages) for (const l of pg.lines) c.set(l.size, (c.get(l.size) ?? 0) + l.text.length);
  let body = 11, best = -1;
  c.forEach((n, s) => { if (n > best) { best = n; body = s; } });
  return body;
}

const key = (s: string) => s.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();

/** Buang header/footer berulang, nomor halaman, dan catatan kaki (huruf kecil di dasar halaman). */
function keepLines(pages: PageLike[], body: number): TLine[][] {
  const seen = new Map<string, Set<number>>();
  const inMargin = (l: TLine, pg: PageLike) => l.y > pg.height * 0.9 || l.y < pg.height * 0.08;
  pages.forEach((pg, pi) => pg.lines.forEach((l) => { if (inMargin(l, pg)) { const k = key(l.text); (seen.get(k) ?? seen.set(k, new Set()).get(k)!).add(pi); } }));
  const need = Math.max(2, Math.ceil(pages.length * 0.3));
  return pages.map((pg) => pg.lines.filter((l) => {
    if (!l.text.trim()) return false;
    if (/^\d{1,3}$/.test(l.text.trim()) && l.size < body * 0.85) return false;
    if (inMargin(l, pg)) {
      if ((seen.get(key(l.text))?.size ?? 0) >= need) return false;
      if (/^([ivxlc]{1,5}|\d{1,4})$/i.test(l.text.trim()) || /^(hal|hlm|page)\.?\s*\d+$/i.test(l.text.trim())) return false;
    }
    if (l.size < body * 0.9 && l.y < pg.height * 0.4) return false; // catatan kaki
    return true;
  }));
}

/** Cari celah vertikal (antar kolom). Mengembalikan x tengah celah, atau null untuk satu kolom. */
function gutterOf(lines: TLine[], width: number): number | null {
  if (lines.length < 12) return null;
  const R = 2, n = Math.ceil(width / R), cov = new Uint16Array(n);
  let items = 0;
  for (const l of lines) for (const it of l.items) {
    items++;
    for (let i = Math.max(0, Math.floor(it.x / R)); i <= Math.min(n - 1, Math.floor((it.x + it.w) / R)); i++) cov[i]++;
  }
  const tol = Math.floor(lines.length * 0.06);
  let bestA = -1, bestB = -1, a = -1;
  for (let i = Math.floor(n * 0.3); i <= Math.floor(n * 0.7) + 1; i++) {
    if (i <= Math.floor(n * 0.7) && cov[i] <= tol) { if (a < 0) a = i; }
    else if (a >= 0) { if (i - a > bestB - bestA) { bestA = a; bestB = i; } a = -1; }
  }
  if (bestA < 0 || (bestB - bestA) * R < 9) return null;
  const gx = ((bestA + bestB) / 2) * R;
  let left = 0, right = 0;
  for (const l of lines) for (const it of l.items) (it.x + it.w / 2 < gx ? left++ : right++);
  return left > items * 0.2 && right > items * 0.2 ? gx : null;
}

const medianPitch = (lines: OLine[]) => {
  const d: number[] = [];
  for (let i = 1; i < lines.length; i++) { const g = lines[i - 1].y - lines[i].y; if (g > 0 && g < lines[i].size * 2.2) d.push(g); }
  d.sort((x, y) => x - y);
  return d.length ? d[Math.floor(d.length / 2)] : 0;
};

/** Berapa baris judul bermula di indeks i (0 = bukan judul). Judul bisa membungkus sampai 3 baris. */
function headSpan(s: OLine[], i: number, body: number, pitch: number, prevHead: boolean): number {
  const l = s[i], prev = s[i - 1], t = l.text, words = t.split(/\s+/).length;
  if (t.length < 3 || t.length > 110 || words > 14 || KEY_RE.test(t)) return 0;
  if (SECTION_RE.test(t)) return 1;
  if (/[.,;!?)…-]$/.test(t) || !/^[\p{Lu}\d]/u.test(t) || /[.!?]\s+\p{Lu}/u.test(t)) return 0;
  const next = s[i + 1];
  if (/^\d{1,2}(\.\d{1,2}){0,2}[.)]?\s+\p{Lu}/u.test(t) && words <= 12 && !(next && NUMLI.test(next.text))) return 1;
  if (l.size >= body * 1.12) return 1;
  const prevEnds = !prev || TERM.test(prev.text) || prevHead;
  if (!prevEnds || l.x0 >= l.colL + 10) return 0;
  const width = l.colR - l.colL;
  const short = l.x1 - l.x0 < width * 0.72;
  const gapAbove = prev ? prev.y - l.y : 0;
  const spaced = !!prev && pitch > 0 && gapAbove >= pitch * 1.3;
  // judul bertingkat: berhenti pada baris yang diikuti baris paragraf menjorok
  for (let k = 0; k < 3 && i + k < s.length; k++) {
    const cur = s[i + k];
    if (k > 0 && (/[.,;!?)…-]$/.test(cur.text) || /[,]|[.!?]\s+\p{Lu}/u.test(cur.text) || cur.text.split(/\s+/).length > 14)) break;
    const nx = s[i + k + 1];
    if (nx && nx.x0 >= l.colL + 14 && cur.x0 < l.colL + 10 && (spaced || short || k > 0)) return k + 1;
  }
  const sig = t.split(/\s+/).filter((x) => x.length > 3 && !SMALL.has(x.toLowerCase()));
  const tc = sig.length ? sig.filter((x) => /^\p{Lu}/u.test(x)).length / sig.length : 0;
  if (spaced && short) return 1;
  if (short && words >= 2 && tc >= 0.8 && (spaced || !prev)) return 1;
  return 0;
}

export function analyzeDoc(pages: PageLike[], body = bodySize(pages)): Struct {
  const kept = keepLines(pages, body);
  // judul: baris terbesar di halaman 1
  let title = '';
  const titleSet = new Set<TLine>();
  if (pages[0]) {
    const cand = kept[0].filter((l) => l.size >= body * 1.15);
    const mx = Math.max(0, ...cand.map((l) => l.size));
    if (mx) { const tl = cand.filter((l) => l.size >= mx * 0.95); tl.forEach((l) => titleSet.add(l)); title = tl.map((l) => l.text).join(' ').replace(/\s+/g, ' ').trim(); }
  }
  const paras: Para[] = [];
  let cur: { kind: 'p' | 'li'; text: string; page: number } | null = null;
  const flush = () => { if (cur && cur.text.trim()) paras.push({ kind: cur.kind, text: cur.text.trim(), page: cur.page }); cur = null; };
  let anyTwo = false, stop = false;

  pages.forEach((pg, pi) => {
    if (stop) return;
    const lines = kept[pi].filter((l) => !titleSet.has(l));
    if (!lines.length) return;
    const gx = gutterOf(lines, pg.width);
    if (gx) anyTwo = true;
    const O = (text: string, l: TLine, x0: number, x1: number): OLine => ({ text, size: l.size, y: l.y, x0, x1, page: pi + 1, colL: 0, colR: 0 });
    const full: OLine[] = [], left: OLine[] = [], right: OLine[] = [];
    type Seg = { side: 'F' | 'L' | 'R'; lines: OLine[] };
    const segs: Seg[] = [];
    let lbuf: OLine[] = [], rbuf: OLine[] = [];
    const flushCols = () => { if (lbuf.length) segs.push({ side: 'L', lines: lbuf }); if (rbuf.length) segs.push({ side: 'R', lines: rbuf }); lbuf = []; rbuf = []; };
    for (const l of lines) {
      if (!gx) { const o = O(joinItems(l.items, l.size) || l.text, l, l.x0, l.x1); full.push(o); if (segs[segs.length - 1]?.side === 'F') segs[segs.length - 1].lines.push(o); else segs.push({ side: 'F', lines: [o] }); continue; }
      const crossing = l.items.some((it) => it.x < gx - 3 && it.x + it.w > gx + 3);
      if (crossing) {
        flushCols();
        const o = O(joinItems(l.items, l.size) || l.text, l, l.x0, l.x1); full.push(o);
        if (segs[segs.length - 1]?.side === 'F') segs[segs.length - 1].lines.push(o); else segs.push({ side: 'F', lines: [o] });
        continue;
      }
      const li = l.items.filter((it) => it.x + it.w / 2 < gx), ri = l.items.filter((it) => it.x + it.w / 2 >= gx);
      if (li.length) { const o = O(joinItems(li, l.size), l, Math.min(...li.map((i) => i.x)), Math.max(...li.map((i) => i.x + i.w))); left.push(o); lbuf.push(o); }
      if (ri.length) { const o = O(joinItems(ri, l.size), l, Math.min(...ri.map((i) => i.x)), Math.max(...ri.map((i) => i.x + i.w))); right.push(o); rbuf.push(o); }
    }
    flushCols();
    const pct = (v: number[], q: number) => { const a = [...v].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(a.length * q))]; };
    const bounds = (arr: OLine[], fallback: [number, number]): [number, number] => {
      const long = arr.filter((o) => o.text.length >= 30);
      return long.length ? [pct(long.map((o) => o.x0), 0.15), pct(long.map((o) => o.x1), 0.9)] : fallback;
    };
    const all = [...full, ...left, ...right];
    const [aL, aR] = bounds(all, [0, pg.width]);
    const bL = bounds(left, [aL, aR]), bR = bounds(right, [aL, aR]), bF = gx ? [aL, aR] as [number, number] : bounds(full, [aL, aR]);
    for (const s of segs) {
      const [cl, cr] = s.side === 'L' ? bL : s.side === 'R' ? bR : bF;
      s.lines.forEach((o) => { o.colL = cl; o.colR = cr; });
    }

    for (const s of segs) {
      if (stop) break;
      const pitch = medianPitch(s.lines);
      let prev: OLine | undefined, prevHead = false;
      for (let i = 0; i < s.lines.length; i++) {
        const L = s.lines[i];
        const span = headSpan(s.lines, i, body, pitch, prevHead);
        if (span > 0) {
          const text = s.lines.slice(i, i + span).map((x) => x.text).join(' ').replace(/\s+/g, ' ').trim();
          if (REFS_RE.test(text)) { flush(); stop = true; break; }
          flush();
          paras.push({ kind: 'h', text, page: L.page });
          prev = s.lines[i + span - 1]; prevHead = true; i += span - 1; continue;
        }
        prevHead = false;
        const width = L.colR - L.colL;
        const bullet = BULLET.test(L.text), numli = NUMLI.test(L.text) && L.text.length < 160 && !/^\d{4}\b/.test(L.text);
        let brk = false;
        if (!cur) brk = true;
        else if (KEY_RE.test(L.text)) brk = true;
        else if (prev) {
          const gap = prev.y - L.y;
          if (gap > L.size * 1.75) brk = true;
          else if (L.x0 >= L.colL + 12 && TERM.test(cur.text)) brk = true;
          else if (prev.x1 < prev.colR - width * 0.3 && TERM.test(prev.text)) brk = true;
        } else if (TERM.test(cur.text) || L.x0 >= L.colL + 12) brk = true;
        if (bullet || numli) brk = true;
        if (brk) { flush(); cur = { kind: bullet || numli ? 'li' : 'p', text: '', page: L.page }; }
        const t = bullet ? L.text.replace(BULLET, '') : L.text;
        const c = cur!;
        c.text += (c.text && !c.text.endsWith('-') ? ' ' : '') + t;
        prev = L;
      }
    }
  });
  flush();
  return { ...buildStruct(paras), title, twoColumn: anyTwo } as Struct;
}

export function buildStruct(paras: Para[]): Omit<Struct, 'title' | 'twoColumn'> {
  let abstract = '', keywordLine = '', mode: 'pre' | 'abs' | 'skip' | 'sec' = 'pre', absSeen = false, pre = '';
  const sections: Sec[] = [];
  let cur: Sec | null = null;
  for (const p of paras) {
    if (p.kind === 'h') {
      if (REFS_RE.test(p.text)) break;
      if (ABS_RE.test(p.text)) { if (!absSeen) { absSeen = true; mode = 'abs'; sections.length = 0; cur = null; } else mode = 'skip'; continue; }
      mode = 'sec'; cur = { title: p.text.replace(/^\d+[.)]?\s*/, '').trim(), page: p.page, text: '' }; sections.push(cur); continue;
    }
    if (KEY_RE.test(p.text)) { if (!keywordLine) keywordLine = p.text.replace(KEY_RE, '').trim(); if (mode === 'abs') mode = 'pre'; continue; }
    if (mode === 'abs') abstract += (abstract ? ' ' : '') + p.text;
    else if (mode === 'sec' && cur) cur.text += p.text + ' ';
    else if (mode === 'pre') pre += p.text + ' ';
  }
  sections.forEach((s) => { s.text = s.text.trim(); });
  const kept = sections.filter((s) => s.text.length > 0);
  if (!kept.length && pre.trim()) kept.push({ title: 'Isi dokumen', page: 1, text: pre.trim() });
  return { abstract: abstract.trim(), keywordLine, sections: kept, pre: pre.trim() };
}
