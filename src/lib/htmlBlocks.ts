import type { Align, Block, Cell, Para, RGB, Run, Table } from './layout';
import { b64ToBytes, toEmbeddable, type Embeddable } from './imageUtil';

const NAMED: Record<string, RGB> = {
  black: [0, 0, 0], white: [1, 1, 1], red: [0.86, 0.1, 0.1], green: [0, 0.5, 0], blue: [0, 0, 1], gray: [0.5, 0.5, 0.5],
  grey: [0.5, 0.5, 0.5], orange: [1, 0.55, 0], purple: [0.5, 0, 0.5], navy: [0, 0, 0.5], teal: [0, 0.5, 0.5], maroon: [0.5, 0, 0]
};

export function parseColor(s?: string | null): RGB | undefined {
  if (!s) return undefined;
  s = s.trim().toLowerCase();
  if (NAMED[s]) return NAMED[s];
  let m = s.match(/^#([0-9a-f]{3})$/);
  if (m) return [...m[1]].map((c) => parseInt(c + c, 16) / 255) as RGB;
  m = s.match(/^#([0-9a-f]{6})/);
  if (m) return [0, 2, 4].map((i) => parseInt(m![1].slice(i, i + 2), 16) / 255) as RGB;
  m = s.match(/^rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/);
  if (m) return [+m[1] / 255, +m[2] / 255, +m[3] / 255];
  return undefined;
}

interface St { bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean; mono?: boolean; color?: RGB; size?: number; pre?: boolean }
const SKIP = new Set(['script', 'style', 'head', 'title', 'noscript', 'template', 'svg', 'iframe', 'canvas', 'video', 'audio', 'button', 'select', 'option']);
const INLINE = new Set(['span', 'a', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'ins', 'code', 'kbd', 'samp', 'tt', 'small', 'big', 'sub', 'sup', 'mark', 'font', 'abbr', 'cite', 'q', 'label', 'time', 'var', 'bdi', 'bdo', 'data', 'dfn']);

function styleOf(el: Element, st: St): St {
  const s = { ...st };
  const t = el.tagName.toLowerCase();
  if (t === 'b' || t === 'strong') s.bold = true;
  if (t === 'i' || t === 'em' || t === 'cite' || t === 'var') s.italic = true;
  if (t === 'u' || t === 'ins') s.underline = true;
  if (t === 's' || t === 'strike' || t === 'del') s.strike = true;
  if (t === 'code' || t === 'kbd' || t === 'samp' || t === 'tt') s.mono = true;
  if (t === 'a') { s.underline = true; s.color = [0.05, 0.27, 0.8]; }
  if (t === 'small') s.size = (s.size ?? 11) * 0.85;
  if (t === 'font') { const c = parseColor(el.getAttribute('color')); if (c) s.color = c; }
  const css = el.getAttribute('style');
  if (css) {
    for (const decl of css.split(';')) {
      const [k, ...rest] = decl.split(':');
      const v = rest.join(':').trim().toLowerCase();
      switch ((k ?? '').trim().toLowerCase()) {
        case 'color': s.color = parseColor(v) ?? s.color; break;
        case 'font-weight': if (v === 'bold' || +v >= 600) s.bold = true; else if (v === 'normal' || +v < 600) s.bold = false; break;
        case 'font-style': s.italic = v === 'italic' || v === 'oblique'; break;
        case 'text-decoration': if (v.includes('underline')) s.underline = true; if (v.includes('line-through')) s.strike = true; break;
        case 'font-family': if (/mono|courier|consolas/.test(v)) s.mono = true; break;
        case 'font-size': { const m = v.match(/^([\d.]+)(px|pt)$/); if (m) s.size = +m[1] * (m[2] === 'px' ? 0.75 : 1); break; }
      }
    }
  }
  return s;
}

function alignOf(el: Element): Align | undefined {
  const css = (el.getAttribute('style') ?? '').toLowerCase();
  const m = css.match(/text-align\s*:\s*(left|center|right)/);
  const a = m?.[1] ?? (el.getAttribute('align') ?? '').toLowerCase();
  return a === 'center' || a === 'right' || a === 'left' ? (a as Align) : undefined;
}

class Conv {
  out: Block[] = [];
  buf: Run[] = [];
  listDepth = 0;
  listStack: boolean[] = [];
  constructor(private imgs: Map<Element, Embeddable>, private base: number) {}

  addText(raw: string, st: St) {
    let t = raw;
    if (!st.pre) {
      t = t.replace(/[ \t\r\n\f]+/g, ' ');
      const last = this.buf[this.buf.length - 1];
      if (!last || last.text.endsWith(' ') || last.text.endsWith('\n')) t = t.replace(/^ /, '');
    }
    if (!t) return;
    this.buf.push({ text: t, bold: st.bold, italic: st.italic, underline: st.underline, strike: st.strike, mono: st.mono, color: st.color, size: st.size });
  }

  flush(props: Partial<Para> = {}) {
    const runs = this.buf; this.buf = [];
    if (!runs.length || !runs.some((r) => r.text.trim())) return;
    const last = runs[runs.length - 1]; last.text = last.text.replace(/ +$/, '');
    this.out.push({ type: 'p', runs, ...props });
  }

  children(el: Element, st: St, props: Partial<Para>) {
    el.childNodes.forEach((n) => {
      if (n.nodeType === 3) this.addText(n.textContent ?? '', st);
      else if (n.nodeType === 1) this.element(n as Element, st, props);
    });
  }

  element(el: Element, st: St, props: Partial<Para>) {
    const t = el.tagName.toLowerCase();
    if (SKIP.has(t) || el.hasAttribute('hidden')) return;
    const s2 = styleOf(el, st);
    if (t === 'br') { this.buf.push({ text: '\n' }); return; }
    if (INLINE.has(t)) { this.children(el, s2, props); return; }
    if (t === 'img') {
      const e = this.imgs.get(el);
      if (e) { this.flush(props); this.out.push({ type: 'img', ...e }); }
      else { const alt = el.getAttribute('alt'); if (alt) this.addText(`[${alt}]`, s2); }
      return;
    }
    if (t === 'hr') { this.flush(props); this.out.push({ type: 'hr' }); return; }
    if (t === 'table') { this.flush(props); const tb = this.table(el, s2); if (tb) this.out.push(tb); return; }
    if (t === 'ul' || t === 'ol') {
      this.flush(props); this.listStack.push(t === 'ol');
      this.children(el, s2, props);
      this.flush({ list: { ordered: t === 'ol', level: this.listStack.length - 1 } });
      this.listStack.pop(); return;
    }
    if (t === 'li') {
      this.flush(props);
      const lp: Partial<Para> = { list: { ordered: this.listStack[this.listStack.length - 1] ?? false, level: Math.max(0, this.listStack.length - 1) }, align: alignOf(el) };
      this.children(el, s2, lp); this.flush(lp); return;
    }
    if (/^h[1-6]$/.test(t)) {
      this.flush(props);
      const hp: Partial<Para> = { heading: +t[1], align: alignOf(el) };
      this.children(el, s2, hp); this.flush(hp); return;
    }
    if (t === 'pre') {
      this.flush(props);
      this.addText(el.textContent?.replace(/\n$/, '') ?? '', { ...s2, mono: true, pre: true });
      this.flush({ before: 4, after: 8 }); return;
    }
    if (t === 'blockquote') {
      this.flush(props);
      const qp: Partial<Para> = { quote: true };
      this.children(el, s2, qp); this.flush(qp); return;
    }
    // elemen blok lain (p, div, section, ...)
    this.flush(props);
    const np: Partial<Para> = { ...props, align: alignOf(el) ?? props.align };
    this.children(el, s2, np); this.flush(np);
  }

  table(el: Element, st: St): Table | null {
    const rowsEl = Array.from((el as HTMLTableElement).rows ?? el.querySelectorAll('tr'));
    const rows: Cell[][] = [];
    let header = false;
    rowsEl.forEach((tr, ri) => {
      const cells: Cell[] = [];
      Array.from((tr as HTMLTableRowElement).cells).forEach((td) => {
        const sub = new Conv(this.imgs, this.base);
        const isTh = td.tagName.toLowerCase() === 'th';
        sub.children(td, styleOf(td, { ...st, bold: st.bold || isTh }), {});
        sub.flush();
        const runs: Run[] = [];
        sub.out.forEach((b, i) => {
          if (i) runs.push({ text: '\n' });
          if (b.type === 'p') runs.push(...b.runs);
          else if (b.type === 'table') b.rows.forEach((r) => r.forEach((c) => runs.push(...c.runs, { text: ' ' })));
        });
        const bg = parseColor((td.getAttribute('style')?.match(/background(?:-color)?\s*:\s*([^;]+)/i) ?? [])[1] ?? td.getAttribute('bgcolor'));
        cells.push({ runs, bg, align: alignOf(td), colspan: Math.max(1, parseInt(td.getAttribute('colspan') ?? '1', 10) || 1) });
        if (ri === 0 && isTh) header = true;
      });
      if (cells.length) rows.push(cells);
    });
    return rows.length ? { type: 'table', rows, header } : null;
  }
}

export interface HtmlResult { blocks: Block[]; title?: string }

export async function htmlToBlocks(html: string, base = 11): Promise<HtmlResult> {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const imgs = new Map<Element, Embeddable>();
  for (const img of Array.from(doc.querySelectorAll('img'))) {
    const m = (img.getAttribute('src') ?? '').match(/^data:([\w/+.-]+);base64,(.*)$/s);
    if (!m) continue;
    try {
      const e = await toEmbeddable(b64ToBytes(m[2].replace(/\s/g, '')), m[1]);
      if (e) imgs.set(img, e);
    } catch { /* abaikan gambar rusak */ }
  }
  const conv = new Conv(imgs, base);
  conv.children(doc.body, {}, {});
  conv.flush();
  return { blocks: conv.out, title: doc.title || undefined };
}

/** Teks polos -> blok paragraf (pisah per baris kosong). */
export function plainToBlocks(text: string): Block[] {
  return text.replace(/\r/g, '').split(/\n{2,}/).map((p) => ({ type: 'p', runs: [{ text: p.trim() }] }) as Block).filter((b) => b.type === 'p' && b.runs[0].text);
}
