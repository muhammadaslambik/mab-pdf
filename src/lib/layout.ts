/**
 * Mesin tata letak teks -> PDF (teks asli, bisa diseleksi/dicari).
 * Dipakai oleh: Word/Excel/HTML ke PDF, Terjemahkan PDF, laporan Bandingkan PDF.
 * Memakai font standar PDF (Helvetica/Courier) sehingga hanya mendukung huruf Latin (WinAnsi).
 */
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';

export type RGB = [number, number, number];
export interface Run {
  text: string; bold?: boolean; italic?: boolean; mono?: boolean;
  size?: number; color?: RGB; underline?: boolean; strike?: boolean;
}
export type Align = 'left' | 'center' | 'right';
export interface Para {
  type: 'p'; runs: Run[]; align?: Align; heading?: number;
  list?: { ordered: boolean; level: number }; quote?: boolean; before?: number; after?: number;
}
export interface Img { type: 'img'; data: Uint8Array; mime: 'image/png' | 'image/jpeg'; w?: number; h?: number; align?: Align }
export interface Cell { runs: Run[]; bold?: boolean; bg?: RGB; align?: Align; colspan?: number }
export interface Table { type: 'table'; rows: Cell[][]; header?: boolean; fontSize?: number }
export type Block = Para | Img | Table | { type: 'hr' } | { type: 'pagebreak' };

export interface LayoutOpts {
  page?: [number, number]; margin?: number; fontSize?: number; title?: string; footerNumbers?: boolean;
}

export const A4: [number, number] = [595.28, 841.89];
export const LETTER: [number, number] = [612, 792];

const HEAD = [0, 24, 19, 16, 13.5, 12, 11];
const REPLACE: Record<string, string> = {
  '\u00a0': ' ', '\u2011': '-', '\u2212': '-', '\u2192': '->', '\u2190': '<-', '\u2264': '<=', '\u2265': '>=',
  '\u2713': 'v', '\u2714': 'v', '\u25cf': '\u2022', '\u25aa': '\u2022', '\u25e6': '-', '\u2023': '-', '\u00b7': '\u2022'
};

export class Fonts {
  regular!: PDFFont; bold!: PDFFont; italic!: PDFFont; boldItalic!: PDFFont; mono!: PDFFont; monoBold!: PDFFont;
  private set = new Set<number>();
  unsupported = 0;

  static async load(pdf: PDFDocument) {
    const f = new Fonts();
    f.regular = await pdf.embedFont(StandardFonts.Helvetica);
    f.bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    f.italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
    f.boldItalic = await pdf.embedFont(StandardFonts.HelveticaBoldOblique);
    f.mono = await pdf.embedFont(StandardFonts.Courier);
    f.monoBold = await pdf.embedFont(StandardFonts.CourierBold);
    f.set = new Set(f.regular.getCharacterSet());
    return f;
  }
  pick(r: Pick<Run, 'bold' | 'italic' | 'mono'>): PDFFont {
    if (r.mono) return r.bold ? this.monoBold : this.mono;
    if (r.bold && r.italic) return this.boldItalic;
    if (r.bold) return this.bold;
    if (r.italic) return this.italic;
    return this.regular;
  }
  /** Ganti karakter yang tidak didukung font standar. */
  safe(text: string): string {
    let out = '';
    for (const ch of text) {
      const cp = ch.codePointAt(0)!;
      const rep = REPLACE[ch];
      if (rep !== undefined) { out += rep; continue; }
      if (this.set.has(cp)) { out += ch; continue; }
      if (cp === 0x200b || cp === 0xfeff || cp === 0xad || cp === 0x200d || cp === 0xfe0f || cp < 32) continue;
      out += '?';
      this.unsupported++;
    }
    return out;
  }
}

interface Seg { text: string; font: PDFFont; size: number; color: RGB; underline?: boolean; strike?: boolean; w: number; space: boolean }
export interface Line { segs: Seg[]; width: number; size: number }

export function layoutRuns(fonts: Fonts, runs: Run[], maxW: number, base: number): Line[] {
  const toks: (Seg & { br?: boolean })[] = [];
  for (const r of runs) {
    const size = r.size ?? base;
    const font = fonts.pick(r);
    const color = r.color ?? [0, 0, 0];
    const parts = r.text.replace(/\r/g, '').replace(/\t/g, '    ').split('\n');
    parts.forEach((part, i) => {
      if (i > 0) toks.push({ text: '', font, size, color, w: 0, space: false, br: true });
      for (const piece of part.split(/( +)/)) {
        if (!piece) continue;
        const t = fonts.safe(piece);
        toks.push({ text: t, font, size, color, underline: r.underline, strike: r.strike, w: font.widthOfTextAtSize(t, size), space: piece[0] === ' ' });
      }
    });
  }
  const lines: Line[] = [];
  let cur: Seg[] = [];
  let w = 0;
  const finish = () => {
    while (cur.length && cur[cur.length - 1].space) w -= cur.pop()!.w;
    const size = cur.length ? Math.max(...cur.map((s) => s.size)) : base;
    lines.push({ segs: cur, width: Math.max(0, w), size });
    cur = []; w = 0;
  };
  for (const tk of toks) {
    if (tk.br) { finish(); continue; }
    if (tk.space) {
      if (!cur.length) continue;
      cur.push(tk); w += tk.w; continue;
    }
    if (w + tk.w > maxW + 0.01 && cur.some((s) => !s.space)) finish();
    if (tk.w > maxW) {
      // kata lebih panjang dari lebar kolom: pecah per karakter
      let chunk = '';
      for (const ch of tk.text) {
        const cw = tk.font.widthOfTextAtSize(chunk + ch, tk.size);
        if (cw > maxW && chunk) {
          cur.push({ ...tk, text: chunk, w: tk.font.widthOfTextAtSize(chunk, tk.size) });
          w += tk.font.widthOfTextAtSize(chunk, tk.size);
          finish(); chunk = ch;
        } else chunk += ch;
      }
      if (chunk) { const cw = tk.font.widthOfTextAtSize(chunk, tk.size); cur.push({ ...tk, text: chunk, w: cw }); w += cw; }
      continue;
    }
    cur.push(tk); w += tk.w;
  }
  if (cur.length || !lines.length) finish();
  return lines;
}

export function measureRuns(fonts: Fonts, runs: Run[], base: number) {
  let full = 0, longest = 0;
  const lines = layoutRuns(fonts, runs, 1e9, base);
  for (const l of lines) full = Math.max(full, l.width);
  for (const l of lines) for (const s of l.segs) if (!s.space) longest = Math.max(longest, s.w);
  // kata terpanjang: gabungkan segmen berurutan tanpa spasi
  let run = 0;
  for (const l of lines) {
    run = 0;
    for (const s of l.segs) { if (s.space) { longest = Math.max(longest, run); run = 0; } else run += s.w; }
    longest = Math.max(longest, run);
  }
  return { full, longest };
}

/** Gambar satu baris pada posisi (x, baseline). Segmen berurutan bergaya sama digabung. */
export function drawLine(page: PDFPage, line: Line, x0: number, baseline: number, maxW: number, align: Align = 'left') {
  let x = align === 'center' ? x0 + (maxW - line.width) / 2 : align === 'right' ? x0 + maxW - line.width : x0;
  let i = 0;
  while (i < line.segs.length) {
    const s = line.segs[i];
    let text = s.text, w = s.w, j = i + 1;
    while (j < line.segs.length) {
      const n = line.segs[j];
      if (n.font !== s.font || n.size !== s.size || n.underline !== s.underline || n.strike !== s.strike || n.color.join() !== s.color.join()) break;
      text += n.text; w += n.w; j++;
    }
    if (text.trim()) page.drawText(text, { x, y: baseline, size: s.size, font: s.font, color: rgb(...s.color) });
    if (s.underline) page.drawLine({ start: { x, y: baseline - s.size * 0.12 }, end: { x: x + w, y: baseline - s.size * 0.12 }, thickness: Math.max(0.5, s.size * 0.06), color: rgb(...s.color) });
    if (s.strike) page.drawLine({ start: { x, y: baseline + s.size * 0.3 }, end: { x: x + w, y: baseline + s.size * 0.3 }, thickness: Math.max(0.5, s.size * 0.06), color: rgb(...s.color) });
    x += w; i = j;
  }
}

class Writer {
  page!: PDFPage;
  y = 0;
  counters: { ordered: boolean; n: number }[] = [];
  constructor(public pdf: PDFDocument, public fonts: Fonts, public size: [number, number], public margin: number, public base: number) { this.newPage(); }
  get cw() { return this.size[0] - 2 * this.margin; }
  get top() { return this.size[1] - this.margin; }
  newPage() { this.page = this.pdf.addPage(this.size); this.y = this.top; }
  need(h: number) { if (this.y - h < this.margin && this.y < this.top) this.newPage(); }

  para(p: Para) {
    const base = this.base;
    const hsize = p.heading ? (HEAD[Math.min(6, Math.max(1, p.heading))] * base) / 11 : base;
    const runs = p.runs.map((r) => (p.heading ? { ...r, bold: true, size: r.size ?? hsize } : p.quote ? { ...r, italic: true, color: r.color ?? ([0.35, 0.35, 0.35] as RGB) } : r));
    const empty = !runs.some((r) => r.text.trim());
    if (empty) { this.y -= base * 0.9; this.counters = []; return; }

    let indent = 0, label = '';
    if (p.list) {
      const L = p.list.level;
      this.counters.length = L + 1;
      const c = this.counters[L];
      this.counters[L] = !c || c.ordered !== p.list.ordered ? { ordered: p.list.ordered, n: 1 } : { ordered: c.ordered, n: c.n + 1 };
      indent = L * 18 + 18;
      label = p.list.ordered ? `${this.counters[L].n}.` : L === 0 ? '\u2022' : '-';
    } else { this.counters = []; }
    if (p.quote) indent += 16;

    const before = p.before ?? (p.heading ? hsize * 0.7 : 0);
    const after = p.after ?? (p.heading ? hsize * 0.35 : p.list ? base * 0.2 : base * 0.55);
    if (this.y < this.top) this.y -= before;

    const lines = layoutRuns(this.fonts, runs, this.cw - indent, base);
    let first = true;
    for (const ln of lines) {
      const h = ln.size * 1.3;
      this.need(h);
      const baseline = this.y - ln.size * 0.95;
      if (first && label) this.page.drawText(label, { x: this.margin + indent - 14, y: baseline, size: base, font: this.fonts.regular, color: rgb(0.1, 0.1, 0.1) });
      if (p.quote) this.page.drawLine({ start: { x: this.margin + 6, y: this.y }, end: { x: this.margin + 6, y: this.y - h }, thickness: 2, color: rgb(0.75, 0.75, 0.75) });
      drawLine(this.page, ln, this.margin + indent, baseline, this.cw - indent, p.align);
      this.y -= h; first = false;
    }
    this.y -= after;
  }

  hr() { this.need(12); this.y -= 6; this.page.drawLine({ start: { x: this.margin, y: this.y }, end: { x: this.margin + this.cw, y: this.y }, thickness: 0.7, color: rgb(0.7, 0.7, 0.7) }); this.y -= 8; }

  async img(b: Img) {
    let im;
    try { im = b.mime === 'image/png' ? await this.pdf.embedPng(b.data) : await this.pdf.embedJpg(b.data); } catch { return; }
    let w = b.w ?? im.width * 0.75, h = b.h ?? im.height * 0.75;
    const maxH = this.top - this.margin;
    const k = Math.min(1, this.cw / w, maxH / h);
    w *= k; h *= k;
    this.need(h + 6);
    const x = b.align === 'center' ? this.margin + (this.cw - w) / 2 : b.align === 'right' ? this.margin + this.cw - w : this.margin;
    this.page.drawImage(im, { x, y: this.y - h, width: w, height: h });
    this.y -= h + 6;
  }

  table(t: Table) {
    if (!t.rows.length) return;
    const nCols = Math.max(...t.rows.map((r) => r.reduce((s, c) => s + (c.colspan ?? 1), 0)));
    const pad = 4, fs = t.fontSize ?? this.base * 0.9;
    const pref = new Array(nCols).fill(0) as number[], min = new Array(nCols).fill(0) as number[];
    t.rows.forEach((row, ri) => {
      let ci = 0;
      for (const c of row) {
        const span = c.colspan ?? 1;
        const runs = c.runs.map((r) => ({ ...r, bold: r.bold || c.bold || (t.header && ri === 0) }));
        const m = measureRuns(this.fonts, runs, fs);
        for (let k = 0; k < span && ci + k < nCols; k++) {
          pref[ci + k] = Math.max(pref[ci + k], (m.full + 2 * pad) / span);
          min[ci + k] = Math.max(min[ci + k], Math.min(m.longest + 2 * pad, 90) / span);
        }
        ci += span;
      }
    });
    const avail = this.cw;
    const sp = pref.reduce((a, b) => a + b, 0), sm = min.reduce((a, b) => a + b, 0);
    let widths: number[];
    if (sp <= avail) widths = pref.map((p) => (p / sp) * avail);
    else if (sm >= avail) widths = min.map((m) => (m / sm) * avail);
    else {
      const extra = avail - sm, den = sp - sm || 1;
      widths = pref.map((p, i) => min[i] + (extra * (p - min[i])) / den);
    }

    t.rows.forEach((row, ri) => {
      let ci = 0;
      const cells = row.map((c) => {
        const span = c.colspan ?? 1;
        const w = widths.slice(ci, ci + span).reduce((a, b) => a + b, 0);
        const x = ci; ci += span;
        const isHead = !!t.header && ri === 0;
        const runs = c.runs.map((r) => ({ ...r, bold: r.bold || c.bold || isHead }));
        const lines = layoutRuns(this.fonts, runs, Math.max(8, w - 2 * pad), fs);
        const h = lines.reduce((s, l) => s + l.size * 1.3, 0) + 2 * pad;
        return { c, w, x, lines, h, isHead };
      });
      const rowH = Math.max(...cells.map((c) => c.h));
      if (this.y - rowH < this.margin && this.y < this.top) this.newPage();
      const top = this.y;
      for (const cell of cells) {
        const left = this.margin + widths.slice(0, cell.x).reduce((a, b) => a + b, 0);
        const bg = cell.c.bg ?? (cell.isHead ? ([0.92, 0.94, 0.97] as RGB) : undefined);
        this.page.drawRectangle({ x: left, y: top - rowH, width: cell.w, height: rowH, borderColor: rgb(0.7, 0.72, 0.78), borderWidth: 0.5, ...(bg ? { color: rgb(...bg) } : {}) });
        let yy = top - pad;
        for (const ln of cell.lines) {
          drawLine(this.page, ln, left + pad, yy - ln.size * 0.95, cell.w - 2 * pad, cell.c.align);
          yy -= ln.size * 1.3;
        }
      }
      this.y -= rowH;
    });
    this.y -= this.base * 0.6;
  }
}

export async function blocksToPdf(blocks: Block[], opts: LayoutOpts = {}) {
  const pdf = await PDFDocument.create();
  const fonts = await Fonts.load(pdf);
  const w = new Writer(pdf, fonts, opts.page ?? A4, opts.margin ?? 56, opts.fontSize ?? 11);
  for (const b of blocks) {
    if (b.type === 'p') w.para(b);
    else if (b.type === 'hr') w.hr();
    else if (b.type === 'img') await w.img(b);
    else if (b.type === 'table') w.table(b);
    else if (b.type === 'pagebreak') w.newPage();
  }
  if (opts.footerNumbers) {
    const pages = pdf.getPages();
    pages.forEach((p, i) => {
      const t = `${i + 1} / ${pages.length}`;
      const tw = fonts.regular.widthOfTextAtSize(t, 9);
      p.drawText(t, { x: (p.getWidth() - tw) / 2, y: 24, size: 9, font: fonts.regular, color: rgb(0.45, 0.45, 0.45) });
    });
  }
  pdf.setProducer('MAB-PDF');
  if (opts.title) pdf.setTitle(fonts.safe(opts.title));
  const bytes = await pdf.save();
  return { bytes, unsupported: fonts.unsupported, pages: pdf.getPageCount() };
}
