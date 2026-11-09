/** Ekstraksi teks berstruktur dari PDF (pdf.js): baris, paragraf, judul, daftar. Dipakai banyak alat. */
import { openPdfJs } from './pdf';
import { tick } from './util';

export interface TItem { x: number; w: number; s: string; size?: number; sup?: boolean }
export interface TLine { y: number; size: number; text: string; x0: number; x1: number; items: TItem[] }
export interface DocPara { text: string; kind: 'h1' | 'h2' | 'h3' | 'p' | 'li' | 'row'; size: number; cells?: string[] }
export interface PageData { width: number; height: number; lines: TLine[]; paras: DocPara[] }

export function cellsOf(line: TLine) {
  const cells: { x: number; x1: number; text: string }[] = [];
  for (const it of line.items) {
    const last = cells[cells.length - 1];
    if (last && it.x - last.x1 < line.size * 0.5) {
      last.text += (it.x - last.x1 > line.size * 0.15 && !last.text.endsWith(' ') && !it.s.startsWith(' ') ? ' ' : '') + it.s;
      last.x1 = it.x + it.w;
    } else cells.push({ x: it.x, x1: it.x + it.w, text: it.s });
  }
  return cells.map((c) => ({ x: c.x, x1: c.x1, text: c.text.trim() })).filter((c) => c.text);
}

const BULLET = /^[\u2022\u25cf\u25aa\u00b7\uf0b7\uf0a7\uf0d8\uf0fc\-\u2013*]\s*(?=\S)/;
const NUMBERED = /^(\d{1,3}|[a-zA-Z])[.)]\s+\S/;

export async function pageLines(page: any): Promise<TLine[]> {
  const tc = await page.getTextContent();
  const rows: { y: number; size: number; items: TItem[] }[] = [];
  for (const it of tc.items as any[]) {
    if (typeof it.str !== 'string' || !it.str.trim()) continue;
    const size = Math.round(Math.hypot(it.transform[2], it.transform[3])) || 10;
    const y = it.transform[5];
    let row = rows.find((r) => Math.abs(r.y - y) < Math.max(2, size * 0.3));
    if (!row) rows.push((row = { y, size, items: [] }));
    row.size = Math.max(row.size, size);
    row.items.push({ x: it.transform[4], w: it.width ?? 0, s: it.str, size });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map((r) => {
    r.items.sort((a, b) => a.x - b.x);
    for (const it of r.items) it.sup = (it.size ?? r.size) < r.size * 0.8; // superskrip (penanda catatan kaki)
    let text = '', end = -Infinity;
    for (const p of r.items) {
      if (text && p.x - end > r.size * 0.15 && !text.endsWith(' ') && !p.s.startsWith(' ')) text += ' ';
      text += p.s; end = p.x + p.w;
    }
    const last = r.items[r.items.length - 1];
    return { y: r.y, size: r.size, text: text.trim(), x0: r.items[0].x, x1: last.x + last.w, items: r.items };
  });
}

export async function extractDoc(file: File, progress: (p: number, l: string) => void, check: () => void) {
  const doc = await openPdfJs(file);
  const pages: PageData[] = [];
  const sizeCount = new Map<number, number>();
  for (let n = 1; n <= doc.numPages; n++) {
    check(); progress(((n - 1) / doc.numPages) * 85, `Membaca halaman ${n}/${doc.numPages}`);
    const page = await doc.getPage(n);
    const vp = page.getViewport({ scale: 1 });
    const lines = await pageLines(page);
    for (const l of lines) sizeCount.set(l.size, (sizeCount.get(l.size) ?? 0) + l.text.length);
    pages.push({ width: vp.width, height: vp.height, lines, paras: [] });
    page.cleanup(); await tick();
  }
  await doc.destroy();
  let body = 11, best = -1;
  sizeCount.forEach((c, s) => { if (c > best) { best = c; body = s; } });
  for (const pg of pages) {
    let para = '', paraSize = body, prevY: number | null = null;
    const flush = () => { if (para.trim()) pg.paras.push({ text: para.trim(), kind: 'p', size: paraSize }); para = ''; };
    for (const ln of pg.lines) {
      const ratio = ln.size / body;
      const gap = prevY === null ? 0 : prevY - ln.y;
      const cells = cellsOf(ln);
      if (ratio >= 1.1 && ln.text.length < 140) {
        flush();
        pg.paras.push({ text: ln.text, kind: ratio >= 1.5 ? 'h1' : ratio >= 1.25 ? 'h2' : 'h3', size: ln.size });
      } else if (BULLET.test(ln.text)) {
        flush(); pg.paras.push({ text: ln.text.replace(BULLET, ''), kind: 'li', size: ln.size });
      } else if (NUMBERED.test(ln.text) && cells.length < 3) {
        flush(); pg.paras.push({ text: ln.text, kind: 'p', size: ln.size });
      } else if (cells.length >= 2 && cells.length <= 40) {
        flush(); pg.paras.push({ text: cells.map((c) => c.text).join(' '), kind: 'row', size: ln.size, cells: cells.map((c) => c.text) });
      } else {
        if (gap > ln.size * 1.8) flush();
        paraSize = ln.size;
        para += (para && !para.endsWith('-') ? ' ' : '') + ln.text;
      }
      prevY = ln.y;
    }
    flush();
    // baris tunggal bukan tabel: kembalikan jadi paragraf biasa
    pg.paras = pg.paras.map((p, i, a) => (p.kind === 'row' && a[i - 1]?.kind !== 'row' && a[i + 1]?.kind !== 'row' ? { ...p, kind: 'p' as const, cells: undefined } : p));
  }
  const total = pages.reduce((s, p) => s + p.lines.length, 0);
  return { pages, body, hasText: total > 0 };
}

export const NO_TEXT = 'Tidak ada teks yang bisa diekstrak. PDF ini mungkin hasil scan; jalankan OCR PDF dulu.';
