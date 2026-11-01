import { StandardFonts, degrees, rgb } from 'pdf-lib';
import type { RunFn } from '../types';
import { loadPdf } from '../../lib/pdf';
import { baseName, parseRanges, pdfResult } from '../../lib/util';

const NON_LATIN =
  'Teks mengandung karakter di luar Latin dasar (misalnya aksara non-Latin atau emoji). Gunakan huruf Latin dulu pada versi ini.';

export const pageNumbers: RunFn = async ([file], o) => {
  const pdf = await loadPdf(file);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = pdf.getPages();
  const idx = parseRanges(String(o.pages ?? ''), pages.length);
  const start = Number(o.start) || 1;
  const size = Number(o.size) || 11;
  const margin = 28;
  const [v, h] = String(o.position || 'bottom-center').split('-');
  for (const i of idx) {
    const { width, height } = pages[i].getSize();
    const text = String(o.format || '{n}')
      .replace('{n}', String(start + i))
      .replace('{total}', String(pages.length));
    const w = font.widthOfTextAtSize(text, size);
    const x = h === 'left' ? margin : h === 'right' ? width - margin - w : (width - w) / 2;
    const y = v === 'top' ? height - margin - size : margin;
    pages[i].drawText(text, { x, y, size, font, color: rgb(0.2, 0.2, 0.2) });
  }
  return pdfResult(await pdf.save(), `${baseName(file.name)}-nomor.pdf`);
};

const COLORS: Record<string, [number, number, number]> = {
  gray: [0.5, 0.5, 0.5],
  red: [0.8, 0.15, 0.15],
  blue: [0.15, 0.3, 0.8]
};

export const watermark: RunFn = async ([file], o) => {
  const text = String(o.text ?? '').trim();
  if (!text) throw new Error('Isi teks watermark dulu.');
  const pdf = await loadPdf(file);
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pages = pdf.getPages();
  const idx = parseRanges(String(o.pages ?? ''), pages.length);
  const size = Number(o.size) || 60;
  const opacity = Math.min(1, Math.max(0.05, (Number(o.opacity) || 25) / 100));
  const angle = ((Number(o.angle) || 0) * Math.PI) / 180;
  const [cr, cg, cb] = COLORS[String(o.color)] ?? COLORS.gray;
  let w: number;
  try {
    w = font.widthOfTextAtSize(text, size);
  } catch {
    throw new Error(NON_LATIN);
  }
  const hh = size * 0.35;
  for (const i of idx) {
    const { width, height } = pages[i].getSize();
    const cx = width / 2;
    const cy = height / 2;
    const x = cx - (w / 2) * Math.cos(angle) + hh * Math.sin(angle);
    const y = cy - (w / 2) * Math.sin(angle) - hh * Math.cos(angle);
    pages[i].drawText(text, {
      x, y, size, font,
      color: rgb(cr, cg, cb),
      opacity,
      rotate: degrees((angle * 180) / Math.PI)
    });
  }
  return pdfResult(await pdf.save(), `${baseName(file.name)}-watermark.pdf`);
};

export const sign: RunFn = async ([file], o) => {
  const dataUrl = String(o.signature || '');
  if (!dataUrl.startsWith('data:image/png')) throw new Error('Buat tanda tangan dulu di kotak yang tersedia.');
  const pdf = await loadPdf(file);
  const img = await pdf.embedPng(dataUrl);
  const pages = pdf.getPages();
  let idx: number[];
  if (o.target === 'first') idx = [0];
  else if (o.target === 'all') idx = pages.map((_, i) => i);
  else idx = [pages.length - 1];
  const w = Number(o.width) || 150;
  const h = (img.height / img.width) * w;
  const m = 36;
  for (const i of idx) {
    const { width, height } = pages[i].getSize();
    const pos = String(o.position || 'bottom-right');
    const x = pos.endsWith('left') ? m : pos.endsWith('center') ? (width - w) / 2 : width - m - w;
    const y = pos.startsWith('top') ? height - m - h : pos.startsWith('middle') ? (height - h) / 2 : m;
    pages[i].drawImage(img, { x, y, width: w, height: h });
  }
  return pdfResult(await pdf.save(), `${baseName(file.name)}-ttd.pdf`);
};
