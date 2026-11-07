import { PDFDict, PDFDocument, PDFName, PDFRef, rgb } from 'pdf-lib';
import type { RunFn } from '../types';
import { canvasToBlob, loadPdf, openPdfJs, releaseCanvas, renderPage } from '../../lib/pdf';
import { NO_TEXT, extractDoc } from '../../lib/pdfText';
import { imageEntries, readImage } from '../../lib/pdfImages';
import { baseName, pdfResult, tick, zipResult } from '../../lib/util';

const SIZES: Record<string, [number, number]> = { a4: [595.28, 841.89], a3: [841.89, 1190.55], a5: [419.53, 595.28], letter: [612, 792], legal: [612, 1008] };

/* ---------- PDF -> teks ---------- */
export const pdfToText: RunFn = async ([file], o, ctx) => {
  const { pages, hasText } = await extractDoc(file, ctx.progress, ctx.check);
  if (!hasText) throw new Error(NO_TEXT);
  const txt = pages.map((pg, i) => (o.marker === 'yes' ? `===== Halaman ${i + 1} =====\n\n` : '') +
    pg.paras.map((p) => (p.kind === 'li' ? `\u2022 ${p.text}` : p.kind === 'row' ? (p.cells ?? [p.text]).join('\t') : p.text)).join('\n\n')).join('\n\n');
  return { files: [{ name: `${baseName(file.name)}.txt`, blob: new Blob([txt + '\n'], { type: 'text/plain;charset=utf-8' }) }], note: `${txt.split(/\s+/).filter(Boolean).length.toLocaleString('id-ID')} kata diekstrak.` };
};

/* ---------- Hapus halaman kosong ---------- */
export const blankPages: RunFn = async ([file], o, ctx) => {
  const thr = ({ strict: 0.0004, normal: 0.003, loose: 0.012 } as Record<string, number>)[String(o.sensitivity || 'normal')];
  const doc = await openPdfJs(file);
  const blank: number[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    ctx.check(); ctx.progress(((n - 1) / doc.numPages) * 90, `Memeriksa halaman ${n}/${doc.numPages}`);
    const page = await doc.getPage(n);
    const c = await renderPage(page, 0.5, 600_000);
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let ink = 0;
    for (let p = 0; p < d.length; p += 4) if ((d[p] * 299 + d[p + 1] * 587 + d[p + 2] * 114) / 1000 < 200) ink++;
    if (ink / (c.width * c.height) < thr) blank.push(n - 1);
    releaseCanvas(c); page.cleanup(); await tick();
  }
  const total = doc.numPages;
  await doc.destroy();
  if (!blank.length) return { files: [{ name: file.name, blob: file }], note: 'Tidak ditemukan halaman kosong. Coba sensitivitas "Longgar" bila halaman hasil scan masih punya bercak.' };
  if (blank.length >= total) throw new Error('Semua halaman terdeteksi kosong. Coba sensitivitas "Ketat".');
  const pdf = await loadPdf(file);
  [...blank].reverse().forEach((i) => pdf.removePage(i));
  return pdfResult(await pdf.save(), `${baseName(file.name)}-tanpa-kosong.pdf`, `${blank.length} halaman kosong dihapus: ${blank.map((i) => i + 1).join(', ')}.`);
};

/* ---------- Ubah ukuran halaman ---------- */
export const resizePages: RunFn = async ([file], o, ctx) => {
  const src = await loadPdf(file);
  const out = await PDFDocument.create();
  const emb = await out.embedPdf(src, src.getPageIndices());
  const base = SIZES[String(o.size || 'a4')] ?? SIZES.a4, m = Number(o.margin) || 0, orient = String(o.orient || 'auto');
  emb.forEach((ep, i) => {
    ctx.progress((i / emb.length) * 95, `Halaman ${i + 1}/${emb.length}`);
    const land = orient === 'landscape' || (orient === 'auto' && ep.width > ep.height);
    const [W, H] = land ? [base[1], base[0]] : base;
    const k = Math.min((W - 2 * m) / ep.width, (H - 2 * m) / ep.height);
    const w = ep.width * k, h = ep.height * k;
    out.addPage([W, H]).drawPage(ep, { x: (W - w) / 2, y: (H - h) / 2, width: w, height: h });
  });
  out.setProducer('MAB-PDF');
  return pdfResult(await out.save(), `${baseName(file.name)}-${String(o.size || 'a4')}.pdf`, 'Isi halaman diskalakan agar muat tanpa terpotong. Halaman yang diputar lewat atribut rotasi bisa tampak berbeda.');
};

/* ---------- Cetak ringkas (N-up) dan booklet ---------- */
export const nup: RunFn = async ([file], o, ctx) => {
  const src = await loadPdf(file);
  const total = src.getPageCount();
  const out = await PDFDocument.create();
  const emb = await out.embedPdf(src, src.getPageIndices());
  const layout = String(o.layout || '2');
  const grid = ({ '2': { c: 2, r: 1, land: true }, '4': { c: 2, r: 2, land: false }, '6': { c: 3, r: 2, land: true }, '9': { c: 3, r: 3, land: false }, booklet: { c: 2, r: 1, land: true } } as Record<string, { c: number; r: number; land: boolean }>)[layout] ?? { c: 2, r: 1, land: true };
  let sheets: (number | null)[][] = [];
  if (layout === 'booklet') {
    const n = Math.ceil(total / 4) * 4;
    for (let i = 0; i < n / 2; i += 2) { sheets.push([n - 1 - i, i], [i + 1, n - 2 - i]); }
    sheets = sheets.map((s) => s.map((x) => (x! < total ? x : null)));
  } else {
    const per = grid.c * grid.r;
    for (let i = 0; i < total; i += per) sheets.push(Array.from({ length: per }, (_, k) => (i + k < total ? i + k : null)));
  }
  const base = SIZES[String(o.size || 'a4')] ?? SIZES.a4;
  const [W, H] = grid.land ? [base[1], base[0]] : base;
  const mg = 18, gap = 10, cw = (W - 2 * mg - gap * (grid.c - 1)) / grid.c, ch = (H - 2 * mg - gap * (grid.r - 1)) / grid.r;
  sheets.forEach((sh, si) => {
    ctx.progress((si / sheets.length) * 95, `Lembar ${si + 1}/${sheets.length}`);
    const page = out.addPage([W, H]);
    sh.forEach((idx, k) => {
      if (idx === null) return;
      const ep = emb[idx], r = Math.floor(k / grid.c), c = k % grid.c;
      const s = Math.min(cw / ep.width, ch / ep.height), w = ep.width * s, h = ep.height * s;
      const x = mg + c * (cw + gap) + (cw - w) / 2, y = H - mg - (r + 1) * ch - r * gap + (ch - h) / 2;
      page.drawPage(ep, { x, y, width: w, height: h });
      if (o.border !== 'no') page.drawRectangle({ x, y, width: w, height: h, borderWidth: 0.5, borderColor: rgb(0.6, 0.6, 0.6) });
    });
  });
  out.setProducer('MAB-PDF');
  return pdfResult(await out.save(), `${baseName(file.name)}-${layout === 'booklet' ? 'booklet' : layout + 'up'}.pdf`,
    layout === 'booklet' ? 'Cetak dua sisi (flip pada sisi pendek), lalu lipat tengah dan susun menjadi buku kecil.' : undefined);
};

/* ---------- Ekstrak gambar ---------- */
export const extractImages: RunFn = async ([file], o, ctx) => {
  const pdf = await loadPdf(file);
  const pc = pdf.context;
  const pageOf = new Map<string, number>();
  pdf.getPages().forEach((pg, i) => {
    const xo = pg.node.Resources()?.lookup(PDFName.of('XObject'));
    if (xo instanceof PDFDict) for (const [, v] of xo.entries()) if (v instanceof PDFRef && !pageOf.has(v.tag)) pageOf.set(v.tag, i + 1);
  });
  const minSide = Number(o.min) || 64;
  const entries = imageEntries(pc);
  const outs: { name: string; data: Uint8Array }[] = [];
  const perPage = new Map<number, number>();
  for (let i = 0; i < entries.length; i++) {
    ctx.check(); ctx.progress((i / Math.max(1, entries.length)) * 95, `Gambar ${i + 1}/${entries.length}`);
    const [ref, obj] = entries[i];
    try {
      const img = await readImage(pc, obj);
      if (!img || Math.min(img.w, img.h) < minSide) continue;
      const pg = pageOf.get(ref.tag) ?? 0, k = (perPage.get(pg) ?? 0) + 1;
      perPage.set(pg, k);
      const stem = `${pg ? `hal${pg}-` : ''}gambar${k}`;
      if (img.isDct && img.jpeg) outs.push({ name: `${stem}.jpg`, data: img.jpeg });
      else {
        const c = document.createElement('canvas'); c.width = img.w; c.height = img.h;
        c.getContext('2d')!.drawImage(img.source, 0, 0);
        outs.push({ name: `${stem}.png`, data: new Uint8Array(await (await canvasToBlob(c, 'image/png')).arrayBuffer()) });
        releaseCanvas(c);
      }
      if ('close' in img.source) img.source.close();
    } catch { continue; }
    await tick();
  }
  if (!outs.length) throw new Error('Tidak ada gambar yang bisa diekstrak. PDF ini mungkin hanya berisi teks atau grafik vektor. Untuk mengambil tampilan halaman, gunakan "PDF ke gambar".');
  if (outs.length === 1) return { files: [{ name: `${baseName(file.name)}-${outs[0].name}`, blob: new Blob([outs[0].data as BlobPart], { type: outs[0].name.endsWith('png') ? 'image/png' : 'image/jpeg' }) }] };
  return { ...zipResult(outs, `${baseName(file.name)}-gambar.zip`), note: `${outs.length} gambar diekstrak dengan kualitas asli (JPEG disalin apa adanya tanpa kompresi ulang).` };
};
