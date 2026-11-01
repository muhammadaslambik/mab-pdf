import { PDFDocument, degrees } from 'pdf-lib';
import type { RunFn } from '../types';
import { loadPdf } from '../../lib/pdf';
import { baseName, parseGroups, parseRanges, pdfResult, tick, zipResult } from '../../lib/util';

export const merge: RunFn = async (files, _o, ctx) => {
  const out = await PDFDocument.create();
  for (let i = 0; i < files.length; i++) {
    ctx.check();
    ctx.progress((i / files.length) * 95, `Membaca ${files[i].name}`);
    const src = await loadPdf(files[i]);
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
    await tick();
  }
  out.setProducer('mab-pdf');
  ctx.progress(97, 'Menyimpan');
  return pdfResult(await out.save({ useObjectStreams: true }), 'mab-pdf-gabungan.pdf');
};

export const split: RunFn = async ([file], o, ctx) => {
  const src = await loadPdf(file);
  const total = src.getPageCount();
  const groups =
    o.mode === 'ranges'
      ? parseGroups(String(o.ranges ?? ''), total)
      : Array.from({ length: total }, (_, i) => [i]);
  const outs: { name: string; data: Uint8Array }[] = [];
  for (let g = 0; g < groups.length; g++) {
    ctx.check();
    ctx.progress((g / groups.length) * 95, `Membuat file ${g + 1}/${groups.length}`);
    const doc = await PDFDocument.create();
    const pages = await doc.copyPages(src, groups[g]);
    pages.forEach((p) => doc.addPage(p));
    outs.push({ name: `${baseName(file.name)}-${g + 1}.pdf`, data: await doc.save() });
    await tick();
  }
  if (outs.length === 1) return pdfResult(outs[0].data, outs[0].name);
  return zipResult(outs, `${baseName(file.name)}-pisah.zip`);
};

export const removePages: RunFn = async ([file], o) => {
  const pdf = await loadPdf(file);
  const total = pdf.getPageCount();
  const idx = parseRanges(String(o.pages ?? ''), total);
  if (!idx.length) throw new Error('Pilih halaman yang ingin dihapus.');
  if (idx.length >= total) throw new Error('Tidak bisa menghapus semua halaman.');
  [...idx].reverse().forEach((i) => pdf.removePage(i));
  return pdfResult(await pdf.save(), `${baseName(file.name)}-dihapus.pdf`);
};

export const extractPages: RunFn = async ([file], o) => {
  const src = await loadPdf(file);
  const idx = parseRanges(String(o.pages ?? ''), src.getPageCount());
  if (!idx.length) throw new Error('Pilih halaman yang ingin diekstrak.');
  const out = await PDFDocument.create();
  (await out.copyPages(src, idx)).forEach((p) => out.addPage(p));
  return pdfResult(await out.save(), `${baseName(file.name)}-ekstrak.pdf`);
};

export const rotate: RunFn = async ([file], o) => {
  const pdf = await loadPdf(file);
  const pages = pdf.getPages();
  const idx = parseRanges(String(o.pages ?? ''), pages.length);
  const add = parseInt(String(o.angle), 10) || 90;
  for (const i of idx) {
    const cur = pages[i].getRotation().angle;
    pages[i].setRotation(degrees((((cur + add) % 360) + 360) % 360));
  }
  return pdfResult(await pdf.save(), `${baseName(file.name)}-putar.pdf`);
};

const MM = 72 / 25.4;
export const crop: RunFn = async ([file], o) => {
  const pdf = await loadPdf(file);
  const pages = pdf.getPages();
  const idx = parseRanges(String(o.pages ?? ''), pages.length);
  const t = (Number(o.top) || 0) * MM;
  const r = (Number(o.right) || 0) * MM;
  const b = (Number(o.bottom) || 0) * MM;
  const l = (Number(o.left) || 0) * MM;
  for (const i of idx) {
    const box = pages[i].getMediaBox();
    const w = box.width - l - r;
    const h = box.height - t - b;
    if (w < 20 || h < 20) throw new Error('Margin potong terlalu besar untuk ukuran halaman.');
    const x = box.x + l;
    const y = box.y + b;
    pages[i].setCropBox(x, y, w, h);
    pages[i].setMediaBox(x, y, w, h);
  }
  return pdfResult(await pdf.save(), `${baseName(file.name)}-potong.pdf`);
};
