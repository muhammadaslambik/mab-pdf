/**
 * Renderer PPTX -> PDF ringan. Membaca XML slide langsung (tanpa LibreOffice):
 * teks (dengan pewarisan dari layout/master), gambar, bentuk dasar, garis, dan tabel.
 * Tidak mendukung: grafik, SmartArt, animasi, gradien kompleks, font khusus.
 */
import { PDFDocument, PDFPage, degrees, rgb } from 'pdf-lib';
import { strFromU8, unzipSync } from 'fflate';
import { Fonts, drawLine, layoutRuns, type RGB, type Run } from './layout';
import { mimeFromName, toEmbeddable } from './imageUtil';

const EMU = 12700;
const kids = (n: Element | null | undefined, name?: string) => (n ? Array.from(n.children).filter((c) => !name || c.localName === name) : []);
const kid = (n: Element | null | undefined, name: string) => kids(n, name)[0] ?? null;
const path = (n: Element | null | undefined, ...names: string[]) => names.reduce<Element | null>((cur, nm) => kid(cur, nm), n ?? null);
const num = (v: string | null | undefined, d = 0) => (v == null || v === '' || isNaN(+v) ? d : +v);
const xml = (f: Record<string, Uint8Array>, p: string) => (f[p] ? new DOMParser().parseFromString(strFromU8(f[p]), 'application/xml') : null);
const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const rid = (n: Element | null | undefined) => n?.getAttributeNS(RNS, 'embed') ?? n?.getAttribute('r:embed') ?? n?.getAttributeNS(RNS, 'id') ?? n?.getAttribute('r:id') ?? '';

const hex = (s: string): RGB => [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16) / 255) as RGB;
function rgb2hsl([r, g, b]: RGB): [number, number, number] {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function hsl2rgb([h, s, l]: [number, number, number]): RGB {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t: number) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}
const lum = (c: RGB) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];

interface Part { rels: Record<string, string>; doc: Document }
interface Xf { ox: number; oy: number; sx: number; sy: number }
interface Box { x: number; y: number; w: number; h: number } // EMU, origin kiri-atas

export async function pptxToPdf(buf: ArrayBuffer, progress: (p: number, l: string) => void = () => {}) {
  let f: Record<string, Uint8Array>;
  try { f = unzipSync(new Uint8Array(buf)); } catch { throw new Error('File ini bukan presentasi .pptx yang valid.'); }
  const pres = xml(f, 'ppt/presentation.xml');
  if (!pres) throw new Error('File ini bukan presentasi .pptx yang valid. Format .ppt lama belum didukung; simpan ulang sebagai .pptx.');

  const resolve = (dir: string, target: string) => {
    if (target.startsWith('/')) return target.slice(1);
    const parts = (dir + '/' + target).split('/'); const out: string[] = [];
    for (const p of parts) { if (p === '..') out.pop(); else if (p && p !== '.') out.push(p); }
    return out.join('/');
  };
  const loadPart = (p: string): Part | null => {
    const doc = xml(f, p);
    if (!doc) return null;
    const dir = p.split('/').slice(0, -1).join('/');
    const rels: Record<string, string> = {};
    xml(f, `${dir}/_rels/${p.split('/').pop()}.rels`)?.querySelectorAll('Relationship').forEach((r) => { rels[r.getAttribute('Id') ?? ''] = resolve(dir, r.getAttribute('Target') ?? ''); });
    return { rels, doc };
  };

  // tema
  const theme: Record<string, RGB> = {};
  const themePath = Object.keys(f).find((k) => /^ppt\/theme\/theme\d+\.xml$/.test(k));
  xml(f, themePath ?? '')?.querySelectorAll('clrScheme > *').forEach((c) => {
    const ch = c.firstElementChild; if (!ch) return;
    const v = ch.getAttribute('val') ?? '';
    theme[c.localName] = ch.localName === 'srgbClr' ? hex(v) : ch.getAttribute('lastClr') ? hex(ch.getAttribute('lastClr')!) : v === 'window' ? [1, 1, 1] : [0, 0, 0];
  });
  const MAP: Record<string, string> = { tx1: 'dk1', bg1: 'lt1', tx2: 'dk2', bg2: 'lt2' };

  const colorOf = (holder: Element | null | undefined): RGB | undefined => {
    const c = kids(holder).find((k) => ['srgbClr', 'schemeClr', 'sysClr', 'prstClr'].includes(k.localName));
    if (!c) return undefined;
    const v = c.getAttribute('val') ?? '';
    let col: RGB | undefined =
      c.localName === 'srgbClr' ? hex(v) : c.localName === 'schemeClr' ? theme[MAP[v] ?? v] : c.localName === 'sysClr' ? (c.getAttribute('lastClr') ? hex(c.getAttribute('lastClr')!) : v === 'window' ? [1, 1, 1] : [0, 0, 0]) : v === 'white' ? [1, 1, 1] : v === 'black' ? [0, 0, 0] : undefined;
    if (!col) return undefined;
    for (const m of kids(c)) {
      const val = num(m.getAttribute('val')) / 100000;
      if (m.localName === 'lumMod' || m.localName === 'lumOff') {
        const [h, s, l] = rgb2hsl(col);
        col = hsl2rgb([h, s, m.localName === 'lumMod' ? Math.min(1, l * val) : Math.min(1, l + val)]);
      } else if (m.localName === 'tint') col = col.map((x) => 1 - (1 - x) * val) as RGB;
      else if (m.localName === 'shade') col = col.map((x) => x * val) as RGB;
    }
    return col;
  };
  const fillOf = (spPr: Element | null | undefined): RGB | null | undefined => {
    if (!spPr) return undefined;
    if (kid(spPr, 'noFill')) return null;
    const sf = kid(spPr, 'solidFill'); if (sf) return colorOf(sf);
    const gf = kid(spPr, 'gradFill'); if (gf) return colorOf(gf.querySelector('gsLst > gs'));
    return undefined;
  };

  // ukuran slide & urutan
  const sz = pres.getElementsByTagNameNS('*', 'sldSz')[0];
  const W = num(sz?.getAttribute('cx'), 9144000) / EMU, H = num(sz?.getAttribute('cy'), 6858000) / EMU;
  const presPart = loadPart('ppt/presentation.xml')!;
  const slidePaths = Array.from(pres.getElementsByTagNameNS('*', 'sldId')).map((s) => presPart.rels[rid(s)]).filter(Boolean);
  if (!slidePaths.length) throw new Error('Presentasi ini tidak berisi slide.');

  const pdf = await PDFDocument.create();
  const fonts = await Fonts.load(pdf);
  const imgCache = new Map<string, any>();
  const getImage = async (p: string) => {
    if (imgCache.has(p)) return imgCache.get(p);
    let im: any = null;
    const bytes = f[p];
    if (bytes) {
      const e = await toEmbeddable(bytes, mimeFromName(p));
      try { if (e) im = e.mime === 'image/png' ? await pdf.embedPng(e.data) : await pdf.embedJpg(e.data); } catch { im = null; }
    }
    imgCache.set(p, im); return im;
  };

  const master0 = loadPart(Object.keys(f).find((k) => /^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(k)) ?? '');
  const defaultTextSz = num(pres.querySelector('defaultTextStyle > lvl1pPr > defRPr')?.getAttribute('sz'), 1800) / 100;

  const xfrmOf = (el: Element | null): { b: Box; rot: number; fh: boolean; fv: boolean } | null => {
    const x = el ? (el.localName === 'xfrm' ? el : kid(el, 'xfrm')) : null;
    if (!x) return null;
    const off = kid(x, 'off'), ext = kid(x, 'ext');
    if (!off || !ext) return null;
    return { b: { x: num(off.getAttribute('x')), y: num(off.getAttribute('y')), w: num(ext.getAttribute('cx')), h: num(ext.getAttribute('cy')) }, rot: num(x.getAttribute('rot')) / 60000, fh: x.getAttribute('flipH') === '1', fv: x.getAttribute('flipV') === '1' };
  };
  const phOf = (sp: Element) => { const ph = sp.getElementsByTagNameNS('*', 'ph')[0]; return ph ? { type: ph.getAttribute('type') ?? 'body', idx: ph.getAttribute('idx') } : null; };
  const findPh = (part: Part | null, ph: { type: string; idx: string | null }) => {
    const tree = part?.doc.getElementsByTagNameNS('*', 'spTree')[0];
    const sps = kids(tree, 'sp');
    return sps.find((s) => { const p = phOf(s); return p && ph.idx !== null && p.idx === ph.idx; })
      ?? sps.find((s) => { const p = phOf(s); return p && p.type === ph.type; }) ?? null;
  };
  const bodyLvlSize = (lvl: number, kind: string) => {
    const st = master0?.doc.getElementsByTagNameNS('*', kind)[0];
    return num(kid(st, `lvl${lvl + 1}pPr`)?.querySelector('defRPr')?.getAttribute('sz'), 0) / 100 || 0;
  };

  for (let si = 0; si < slidePaths.length; si++) {
    progress((si / slidePaths.length) * 95, `Slide ${si + 1}/${slidePaths.length}`);
    const slide = loadPart(slidePaths[si]); if (!slide) continue;
    if (slide.doc.documentElement.getAttribute('show') === '0') continue;
    const layoutPath = Object.values(slide.rels).find((p) => p.includes('slideLayouts/'));
    const layout = layoutPath ? loadPart(layoutPath) : null;
    const masterPath = layout ? Object.values(layout.rels).find((p) => p.includes('slideMasters/')) : undefined;
    const master = masterPath ? loadPart(masterPath) : master0;

    const page = pdf.addPage([W, H]);
    // latar belakang
    let bg: RGB = [1, 1, 1];
    for (const part of [slide, layout, master]) {
      const bgPr = part?.doc.getElementsByTagNameNS('*', 'bg')[0];
      if (!bgPr) continue;
      const c = fillOf(kid(bgPr, 'bgPr')) ?? colorOf(kid(bgPr, 'bgRef'));
      if (c) { bg = c; break; }
    }
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(...bg) });
    const dark = lum(bg) < 0.45;
    const defaultColor: RGB = dark ? [1, 1, 1] : theme.dk1 ?? [0, 0, 0];

    const toPdf = (b: Box, xf: Xf): { x: number; y: number; w: number; h: number } => {
      const x = (xf.ox + b.x * xf.sx) / EMU, w = (b.w * xf.sx) / EMU, h = (b.h * xf.sy) / EMU;
      const yTop = (xf.oy + b.y * xf.sy) / EMU;
      return { x, y: H - yTop - h, w, h };
    };
    const rotPos = (r: { x: number; y: number; w: number; h: number }, rot: number) => {
      if (!rot) return { x: r.x, y: r.y };
      const a = (-rot * Math.PI) / 180, cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      return { x: cx - (r.w / 2) * Math.cos(a) + (r.h / 2) * Math.sin(a), y: cy - (r.w / 2) * Math.sin(a) - (r.h / 2) * Math.cos(a) };
    };

    const drawParas = (txBody: Element | null, r: { x: number; y: number; w: number; h: number }, ph: { type: string; idx: string | null } | null, layoutSp: Element | null, insetsOverride?: [number, number, number, number]) => {
      if (!txBody) return;
      const bodyPr = kid(txBody, 'bodyPr');
      const ins = insetsOverride ?? [num(bodyPr?.getAttribute('lIns'), 91440), num(bodyPr?.getAttribute('tIns'), 45720), num(bodyPr?.getAttribute('rIns'), 91440), num(bodyPr?.getAttribute('bIns'), 45720)].map((v) => v / EMU) as [number, number, number, number];
      const anchor = bodyPr?.getAttribute('anchor') ?? (ph && /title/i.test(ph.type) ? 'ctr' : 't');
      const auto = kid(bodyPr, 'normAutofit');
      let scale = auto?.getAttribute('fontScale') ? num(auto.getAttribute('fontScale')) / 100000 : 1;
      const isBody = !!ph && !/title|ctrTitle|subTitle|dt|ftr|sldNum/i.test(ph.type);
      const kind = ph ? (/title/i.test(ph.type) ? 'titleStyle' : 'bodyStyle') : 'otherStyle';

      const build = (sc: number) => {
        const out: { lines: ReturnType<typeof layoutRuns>; align: string; bullet: string; indent: number; before: number; after: number; lnSpc: number }[] = [];
        for (const p of kids(txBody, 'p')) {
          const pPr = kid(p, 'pPr');
          const lvl = num(pPr?.getAttribute('lvl'));
          const layoutLvl = kid(kid(layoutSp && kid(layoutSp, 'txBody'), 'lstStyle'), `lvl${lvl + 1}pPr`);
          const baseSz = num(kid(pPr, 'defRPr')?.getAttribute('sz'), 0) / 100 || num(kid(layoutLvl, 'defRPr')?.getAttribute('sz'), 0) / 100 || bodyLvlSize(lvl, kind) || (ph ? (/ctrTitle/i.test(ph.type) ? 44 : /title/i.test(ph.type) ? 32 : /subTitle/.test(ph.type) ? 24 : /dt|ftr|sldNum/.test(ph.type) ? 12 : 20) : defaultTextSz);
          const runs: Run[] = [];
          for (const c of kids(p)) {
            if (c.localName === 'br') { runs.push({ text: '\n' }); continue; }
            if (c.localName !== 'r' && c.localName !== 'fld') continue;
            const rPr = kid(c, 'rPr');
            const t = c.getAttribute('type') === 'slidenum' ? String(si + 1) : kid(c, 't')?.textContent ?? '';
            const tf = kid(rPr, 'latin')?.getAttribute('typeface') ?? '';
            const rsz = num(rPr?.getAttribute('sz'), 0) / 100 || baseSz;
            runs.push({
              text: t, size: rsz * sc, bold: rPr?.getAttribute('b') === '1', italic: rPr?.getAttribute('i') === '1',
              underline: !!rPr?.getAttribute('u') && rPr.getAttribute('u') !== 'none', strike: !!rPr?.getAttribute('strike') && rPr.getAttribute('strike') !== 'noStrike',
              mono: /courier|consolas|mono/i.test(tf), color: colorOf(kid(rPr, 'solidFill')) ?? defaultColor
            });
          }
          const hasBuChar = !!kid(pPr, 'buChar'), noBu = !!kid(pPr, 'buNone');
          const bullet = noBu ? '' : hasBuChar ? (kid(pPr, 'buChar')!.getAttribute('char') === '\u2013' ? '-' : '\u2022') : kid(pPr, 'buAutoNum') ? '#' : isBody && runs.some((x) => x.text.trim()) ? '\u2022' : '';
          const marL = pPr?.getAttribute('marL') != null ? num(pPr.getAttribute('marL')) / EMU : bullet ? 18 + lvl * 18 : lvl * 18;
          const indent = pPr?.getAttribute('indent') != null ? num(pPr.getAttribute('indent')) / EMU : bullet ? -18 : 0;
          const algn = pPr?.getAttribute('algn') ?? layoutLvl?.getAttribute('algn') ?? kid(master0?.doc.getElementsByTagNameNS('*', kind)[0], `lvl${lvl + 1}pPr`)?.getAttribute('algn') ?? 'l';
          const spc = (n: Element | null) => (kid(n, 'spcPts') ? num(kid(n, 'spcPts')!.getAttribute('val')) / 100 : kid(n, 'spcPct') ? (num(kid(n, 'spcPct')!.getAttribute('val')) / 100000) * baseSz : 0);
          const ln = kid(pPr, 'lnSpc');
          const lines = layoutRuns(fonts, runs.length ? runs : [{ text: ' ', size: baseSz * sc }], Math.max(10, r.w - ins[0] - ins[2] - Math.max(0, marL)), baseSz * sc);
          out.push({ lines, align: algn, bullet, indent: marL, before: spc(kid(pPr, 'spcBef')) * sc, after: spc(kid(pPr, 'spcAft')) * sc, lnSpc: kid(ln, 'spcPct') ? num(kid(ln, 'spcPct')!.getAttribute('val')) / 100000 : 1 });
        }
        return out;
      };
      const heightOf = (ps: ReturnType<typeof build>) => ps.reduce((s, p) => s + p.before + p.after + p.lines.reduce((a, l) => a + l.size * 1.2 * p.lnSpc, 0), 0);
      let paras = build(scale);
      const avail = r.h - ins[1] - ins[3];
      if (auto || (ph && isBody)) { let n = 0; while (heightOf(paras) > avail && n++ < 8 && scale > 0.4) { scale *= 0.9; paras = build(scale); } }
      const total = heightOf(paras);
      let y = anchor === 'ctr' ? r.y + r.h / 2 + total / 2 : anchor === 'b' ? r.y + ins[3] + total : r.y + r.h - ins[1];
      let counter = 0;
      for (const p of paras) {
        y -= p.before;
        let first = true;
        for (const ln of p.lines) {
          const h = ln.size * 1.2 * p.lnSpc;
          const x0 = r.x + ins[0] + Math.max(0, p.indent);
          const width = r.w - ins[0] - ins[2] - Math.max(0, p.indent);
          const baseline = y - ln.size * 0.95 * p.lnSpc;
          if (first && p.bullet && ln.segs.length) {
            const lab = p.bullet === '#' ? `${++counter}.` : p.bullet;
            page.drawText(lab, { x: x0 - 14, y: baseline, size: ln.size, font: fonts.regular, color: rgb(...(ln.segs[0].color)) });
          }
          drawLine(page, ln, x0, baseline, width, p.align === 'ctr' ? 'center' : p.align === 'r' ? 'right' : 'left');
          y -= h; first = false;
        }
        y -= p.after;
      }
    };

    const renderTree = async (tree: Element | null, xf: Xf, skipPh: boolean, part: Part) => {
      for (const el of kids(tree)) {
        const ln = el.localName;
        if (ln === 'grpSp') {
          const gx = path(el, 'grpSpPr', 'xfrm');
          const off = kid(gx, 'off'), ext = kid(gx, 'ext'), cho = kid(gx, 'chOff'), che = kid(gx, 'chExt');
          if (off && ext && cho && che) {
            const sx = num(ext.getAttribute('cx')) / (num(che.getAttribute('cx')) || 1), sy = num(ext.getAttribute('cy')) / (num(che.getAttribute('cy')) || 1);
            await renderTree(el, { ox: xf.ox + (num(off.getAttribute('x')) - num(cho.getAttribute('x')) * sx) * xf.sx, oy: xf.oy + (num(off.getAttribute('y')) - num(cho.getAttribute('y')) * sy) * xf.sy, sx: xf.sx * sx, sy: xf.sy * sy }, skipPh, part);
          } else await renderTree(el, xf, skipPh, part);
          continue;
        }
        if (ln === 'sp' || ln === 'cxnSp' || ln === 'pic') {
          const spPr = kid(el, 'spPr');
          const ph = phOf(el);
          if (skipPh && ph) continue;
          let geo = xfrmOf(spPr);
          let layoutSp: Element | null = null;
          if (ph) {
            layoutSp = findPh(layout, ph);
            const inherit = geo ?? xfrmOf(kid(layoutSp, 'spPr')) ?? xfrmOf(kid(findPh(master, ph), 'spPr'));
            geo = inherit;
          }
          if (!geo) continue;
          const r = toPdf(geo.b, xf);
          if (ln === 'pic') {
            const im = await getImage(part.rels[rid(path(el, 'blipFill', 'blip'))] ?? '');
            if (im) { const p = rotPos(r, geo.rot); page.drawImage(im, { x: p.x, y: p.y, width: r.w, height: r.h, rotate: degrees(-geo.rot) }); }
            continue;
          }
          if (ln === 'cxnSp') {
            const lnEl = kid(spPr, 'ln'); const col = colorOf(kid(lnEl, 'solidFill')) ?? colorOf(path(el, 'style', 'lnRef'));
            if (col) {
              const x1 = geo.fh ? r.x + r.w : r.x, x2 = geo.fh ? r.x : r.x + r.w, y1 = geo.fv ? r.y : r.y + r.h, y2 = geo.fv ? r.y + r.h : r.y;
              page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: Math.max(0.5, num(lnEl?.getAttribute('w'), 12700) / EMU), color: rgb(...col) });
            }
            continue;
          }
          // bentuk
          let fill = fillOf(spPr);
          if (fill === undefined && !ph) { const fr = path(el, 'style', 'fillRef'); fill = num(fr?.getAttribute('idx')) > 0 ? colorOf(fr) : undefined; }
          const lnEl = kid(spPr, 'ln');
          let stroke: RGB | undefined = lnEl && !kid(lnEl, 'noFill') ? colorOf(kid(lnEl, 'solidFill')) : undefined;
          if (!stroke && !lnEl) { const lr = path(el, 'style', 'lnRef'); if (num(lr?.getAttribute('idx')) > 0) stroke = colorOf(lr); }
          const prst = path(spPr, 'prstGeom')?.getAttribute('prst') ?? 'rect';
          if (fill || stroke) {
            const opts = { ...(fill ? { color: rgb(...fill) } : {}), ...(stroke ? { borderColor: rgb(...stroke), borderWidth: Math.max(0.5, num(lnEl?.getAttribute('w'), 12700) / EMU) } : {}) };
            if (prst === 'ellipse') page.drawEllipse({ x: r.x + r.w / 2, y: r.y + r.h / 2, xScale: r.w / 2, yScale: r.h / 2, ...opts });
            else { const p = rotPos(r, geo.rot); page.drawRectangle({ x: p.x, y: p.y, width: r.w, height: r.h, rotate: degrees(-geo.rot), ...opts }); }
          }
          drawParas(kid(el, 'txBody'), r, ph, layoutSp);
          continue;
        }
        if (ln === 'graphicFrame') {
          const geo = xfrmOf(kid(el, 'xfrm')); const tbl = el.getElementsByTagNameNS('*', 'tbl')[0];
          if (!geo || !tbl) continue;
          const r = toPdf(geo.b, xf);
          const cols = kids(kid(tbl, 'tblGrid'), 'gridCol').map((c) => num(c.getAttribute('w')) / EMU);
          const totalW = cols.reduce((a, b) => a + b, 0) || r.w, k = r.w / totalW;
          let y = r.y + r.h;
          kids(tbl, 'tr').forEach((tr, ri) => {
            const rh = (num(tr.getAttribute('h')) / EMU) * (r.h / Math.max(1, kids(tbl, 'tr').reduce((s, t) => s + num(t.getAttribute('h')) / EMU, 0)));
            let x = r.x, ci = 0;
            for (const tc of kids(tr, 'tc')) {
              const span = Math.max(1, num(tc.getAttribute('gridSpan'), 1));
              const w = cols.slice(ci, ci + span).reduce((a, b) => a + b, 0) * k;
              if (tc.getAttribute('hMerge') !== '1' && tc.getAttribute('vMerge') !== '1') {
                const tcPr = kid(tc, 'tcPr');
                const bgc = fillOf(tcPr) ?? (ri === 0 && tbl.querySelector('tblPr')?.getAttribute('firstRow') === '1' ? ([0.85, 0.88, 0.93] as RGB) : undefined);
                page.drawRectangle({ x, y: y - rh, width: w, height: rh, borderColor: rgb(0.7, 0.72, 0.78), borderWidth: 0.5, ...(bgc ? { color: rgb(...bgc) } : {}) });
                drawParas(kid(tc, 'txBody'), { x, y: y - rh, w, h: rh }, null, null, [5, 3, 5, 3]);
              }
              x += w; ci += span;
            }
            y -= rh;
          });
        }
      }
    };

    const full: Xf = { ox: 0, oy: 0, sx: 1, sy: 1 };
    if (slide.doc.documentElement.getAttribute('showMasterSp') !== '0') {
      if (master) await renderTree(master.doc.getElementsByTagNameNS('*', 'spTree')[0] ?? null, full, true, master);
      if (layout && layout.doc.documentElement.getAttribute('showMasterSp') !== '0') await renderTree(layout.doc.getElementsByTagNameNS('*', 'spTree')[0] ?? null, full, true, layout);
    }
    // gambar/bentuk milik layout & master memakai rels masing-masing
    await renderTree(slide.doc.getElementsByTagNameNS('*', 'spTree')[0] ?? null, full, false, slide);
  }
  pdf.setProducer('MAB-PDF');
  return { bytes: await pdf.save(), unsupported: fonts.unsupported, slides: pdf.getPageCount() };
}
