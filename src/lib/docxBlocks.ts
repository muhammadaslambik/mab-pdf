/** Pembaca DOCX ringan: document.xml -> blok untuk mesin tata letak (tanpa library tambahan). */
import { strFromU8, unzipSync } from 'fflate';
import type { Align, Block, Cell, Para, RGB, Run } from './layout';
import { mimeFromName, toEmbeddable } from './imageUtil';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const kids = (n: Element | null | undefined, name: string) => (n ? Array.from(n.children).filter((c) => c.localName === name) : []);
const kid = (n: Element | null | undefined, name: string) => kids(n, name)[0] ?? null;
const wval = (n: Element | null | undefined, a = 'val') => n?.getAttributeNS(W, a) ?? n?.getAttribute('w:' + a) ?? null;
const on = (n: Element | null) => !!n && !['0', 'false', 'off'].includes((wval(n) ?? '').toLowerCase());
const parseXml = (u: Uint8Array | undefined) => (u ? new DOMParser().parseFromString(strFromU8(u), 'application/xml') : null);

interface Ctx {
  files: Record<string, Uint8Array>;
  rels: Record<string, string>;
  styles: Record<string, { name: string; bold?: boolean; size?: number }>;
  nums: Record<string, Record<string, boolean>>; // numId -> ilvl -> ordered
}

function loadNumbering(doc: Document | null) {
  const abs: Record<string, Record<string, boolean>> = {};
  const nums: Record<string, Record<string, boolean>> = {};
  if (!doc) return nums;
  for (const a of Array.from(doc.getElementsByTagNameNS(W, 'abstractNum'))) {
    const id = wval(a, 'abstractNumId') ?? '';
    abs[id] = {};
    for (const l of kids(a, 'lvl')) abs[id][wval(l, 'ilvl') ?? '0'] = !['bullet', 'none'].includes(wval(kid(l, 'numFmt')) ?? '');
  }
  for (const n of Array.from(doc.getElementsByTagNameNS(W, 'num'))) nums[wval(n, 'numId') ?? ''] = abs[wval(kid(n, 'abstractNumId')) ?? ''] ?? {};
  return nums;
}

function loadStyles(doc: Document | null) {
  const out: Ctx['styles'] = {};
  if (!doc) return out;
  for (const s of Array.from(doc.getElementsByTagNameNS(W, 'style'))) {
    const id = wval(s, 'styleId');
    if (!id) continue;
    const rPr = kid(s, 'rPr');
    const sz = wval(kid(rPr, 'sz'));
    out[id] = { name: (wval(kid(s, 'name')) ?? '').toLowerCase(), bold: rPr ? on(kid(rPr, 'b')) : undefined, size: sz ? +sz / 2 : undefined };
  }
  return out;
}

function headingLevel(styleId: string | null, ctx: Ctx): number | undefined {
  if (!styleId) return undefined;
  const name = ctx.styles[styleId]?.name ?? styleId.toLowerCase();
  const m = name.match(/^(?:heading|judul)\s*(\d)/) ?? styleId.toLowerCase().match(/^heading(\d)/);
  if (m) return Math.min(6, +m[1]);
  if (name === 'title') return 1;
  if (name === 'subtitle') return 2;
  return undefined;
}

async function drawingImage(dr: Element, ctx: Ctx): Promise<Block | null> {
  const blip = dr.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'blip')[0];
  const rid = blip?.getAttributeNS(R, 'embed') ?? blip?.getAttribute('r:embed');
  const target = rid ? ctx.rels[rid] : null;
  if (!target) return null;
  const path = target.startsWith('/') ? target.slice(1) : 'word/' + target.replace(/^\.\//, '');
  const bytes = ctx.files[path];
  if (!bytes) return null;
  const e = await toEmbeddable(bytes, mimeFromName(path));
  if (!e) return null;
  const ext = dr.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing', 'extent')[0];
  const cx = +(ext?.getAttribute('cx') ?? 0), cy = +(ext?.getAttribute('cy') ?? 0);
  return { type: 'img', ...e, ...(cx && cy ? { w: cx / 12700, h: cy / 12700 } : {}) };
}

async function paragraph(p: Element, ctx: Ctx): Promise<Block[]> {
  const pPr = kid(p, 'pPr');
  const styleId = wval(kid(pPr, 'pStyle'));
  const st = styleId ? ctx.styles[styleId] : undefined;
  const heading = headingLevel(styleId, ctx);
  const jc = wval(kid(pPr, 'jc'));
  const align: Align | undefined = jc === 'center' ? 'center' : jc === 'right' || jc === 'end' ? 'right' : undefined;
  const numPr = kid(pPr, 'numPr');
  const numId = wval(kid(numPr, 'numId'));
  const ilvl = wval(kid(numPr, 'ilvl')) ?? '0';
  const list = numId && numId !== '0' ? { ordered: ctx.nums[numId]?.[ilvl] ?? false, level: Math.min(4, +ilvl || 0) } : (st?.name.startsWith('list') ? { ordered: /number/.test(st.name), level: 0 } : undefined);

  const runs: Run[] = [];
  const after: Block[] = [];
  let pageBreak = false;
  const doRun = async (r: Element, link = false) => {
    const rPr = kid(r, 'rPr');
    const sz = wval(kid(rPr, 'sz'));
    const col = wval(kid(rPr, 'color'));
    const u = kid(rPr, 'u');
    const base: Run = {
      text: '',
      bold: on(kid(rPr, 'b')) || (!!st?.bold && !kid(rPr, 'b')) || undefined,
      italic: on(kid(rPr, 'i')) || undefined,
      underline: (u && wval(u) !== 'none') || link || undefined,
      strike: on(kid(rPr, 'strike')) || undefined,
      size: sz ? +sz / 2 : undefined,
      color: col && col !== 'auto' && /^[0-9a-f]{6}$/i.test(col) ? ([0, 2, 4].map((i) => parseInt(col.slice(i, i + 2), 16) / 255) as RGB) : link ? [0.05, 0.27, 0.8] : undefined
    };
    for (const c of Array.from(r.children)) {
      switch (c.localName) {
        case 't': runs.push({ ...base, text: c.textContent ?? '' }); break;
        case 'tab': runs.push({ ...base, text: '\t' }); break;
        case 'br': if (wval(c, 'type') === 'page') pageBreak = true; else runs.push({ ...base, text: '\n' }); break;
        case 'cr': runs.push({ ...base, text: '\n' }); break;
        case 'drawing': { const im = await drawingImage(c, ctx); if (im) after.push(im); break; }
      }
    }
  };
  const walk = async (n: Element, link = false) => {
    for (const c of Array.from(n.children)) {
      if (c.localName === 'r') await doRun(c, link);
      else if (c.localName === 'hyperlink') await walk(c, true);
      else if (['ins', 'smartTag', 'sdt', 'sdtContent', 'fldSimple', 'customXml'].includes(c.localName)) await walk(c, link);
    }
  };
  await walk(p);
  const out: Block[] = [];
  const para: Para = { type: 'p', runs, align, heading, list };
  out.push(para);
  out.push(...after);
  if (pageBreak) out.push({ type: 'pagebreak' });
  return out;
}

async function table(tbl: Element, ctx: Ctx): Promise<Block | null> {
  const rows: Cell[][] = [];
  let header = false;
  for (const tr of kids(tbl, 'tr')) {
    if (kid(kid(tr, 'trPr'), 'tblHeader')) header = true;
    const cells: Cell[] = [];
    for (const tc of kids(tr, 'tc')) {
      const runs: Run[] = [];
      let first = true;
      const take = async (el: Element) => {
        for (const c of Array.from(el.children)) {
          if (c.localName === 'p') {
            const bs = await paragraph(c, ctx);
            if (!first) runs.push({ text: '\n' });
            first = false;
            for (const b of bs) if (b.type === 'p') runs.push(...b.runs);
          } else if (c.localName === 'tbl') { for (const tr2 of kids(c, 'tr')) for (const tc2 of kids(tr2, 'tc')) await take(tc2); }
          else if (c.localName === 'sdt') { const sc = kid(c, 'sdtContent'); if (sc) await take(sc); }
        }
      };
      await take(tc);
      const tcPr = kid(tc, 'tcPr');
      const fill = wval(kid(tcPr, 'shd'), 'fill');
      cells.push({
        runs,
        colspan: Math.max(1, +(wval(kid(tcPr, 'gridSpan')) ?? 1) || 1),
        bg: fill && /^[0-9a-f]{6}$/i.test(fill) && fill.toLowerCase() !== 'ffffff' ? ([0, 2, 4].map((i) => parseInt(fill.slice(i, i + 2), 16) / 255) as RGB) : undefined
      });
    }
    if (cells.length) rows.push(cells);
  }
  return rows.length ? { type: 'table', rows, header } : null;
}

export async function docxToBlocks(buf: ArrayBuffer): Promise<Block[]> {
  let files: Record<string, Uint8Array>;
  try { files = unzipSync(new Uint8Array(buf)); } catch { throw new Error('File ini bukan dokumen Word (.docx) yang valid.'); }
  const docXml = parseXml(files['word/document.xml']);
  if (!docXml) throw new Error('File ini bukan dokumen Word (.docx) yang valid. Format .doc lama belum didukung; simpan ulang sebagai .docx.');
  const relDoc = parseXml(files['word/_rels/document.xml.rels']);
  const rels: Record<string, string> = {};
  relDoc?.querySelectorAll('Relationship').forEach((r) => { rels[r.getAttribute('Id') ?? ''] = r.getAttribute('Target') ?? ''; });
  const ctx: Ctx = { files, rels, styles: loadStyles(parseXml(files['word/styles.xml'])), nums: loadNumbering(parseXml(files['word/numbering.xml'])) };
  const body = docXml.getElementsByTagNameNS(W, 'body')[0];
  const blocks: Block[] = [];
  const walk = async (el: Element) => {
    for (const c of Array.from(el.children)) {
      if (c.localName === 'p') blocks.push(...(await paragraph(c, ctx)));
      else if (c.localName === 'tbl') { const t = await table(c, ctx); if (t) blocks.push(t); }
      else if (c.localName === 'sdt') { const sc = kid(c, 'sdtContent'); if (sc) await walk(sc); }
    }
  };
  if (body) await walk(body);
  return blocks;
}
