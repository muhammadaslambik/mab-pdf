import type { RunFn } from '../types';
import { A4, LETTER, blocksToPdf, type Block, type Cell } from '../../lib/layout';
import { docxToBlocks } from '../../lib/docxBlocks';
import { htmlToBlocks, plainToBlocks } from '../../lib/htmlBlocks';
import { parseCsv, readXlsx, type Sheet } from '../../lib/xlsxRead';
import { baseName, pdfResult } from '../../lib/util';

const LIGHT = 'Catatan: konversi memakai mesin ringan di perangkat Anda. Font diganti Helvetica dan tata letak rumit (kolom, kotak teks, header/footer) tidak dipertahankan.';
const unsupportedNote = (n: number) => (n ? ` ${n} karakter non-Latin diganti "?" karena font standar PDF hanya mendukung huruf Latin.` : '');
const pageOf = (o: Record<string, any>) => (o.size === 'letter' ? LETTER : A4);

export const wordToPdf: RunFn = async ([file], o, ctx) => {
  ctx.progress(10, 'Membaca dokumen Word');
  const blocks = await docxToBlocks(await file.arrayBuffer());
  if (!blocks.length) throw new Error('Dokumen ini kosong atau tidak berisi teks yang bisa dibaca.');
  ctx.check(); ctx.progress(55, 'Menyusun PDF');
  const r = await blocksToPdf(blocks, { page: pageOf(o), title: baseName(file.name) });
  return pdfResult(r.bytes, `${baseName(file.name)}.pdf`, LIGHT + unsupportedNote(r.unsupported));
};

export const htmlToPdf: RunFn = async (files, o, ctx) => {
  ctx.progress(10, 'Membaca HTML');
  let blocks: Block[] = [];
  let title: string | undefined;
  const pasted = String(o.html ?? '').trim();
  const name = files[0] ? baseName(files[0].name) : 'halaman';
  const src = files[0] ? await files[0].text() : pasted;
  if (!src.trim()) throw new Error('Pilih file HTML atau tempel kode HTML/teks terlebih dahulu.');
  if (/<\w+[^>]*>/.test(src)) { const r = await htmlToBlocks(src); blocks = r.blocks; title = r.title; }
  else blocks = plainToBlocks(src);
  if (!blocks.length) throw new Error('Tidak ada konten yang bisa dikonversi.');
  ctx.progress(60, 'Menyusun PDF');
  const r = await blocksToPdf(blocks, { page: pageOf(o), title: title ?? name });
  return pdfResult(
    r.bytes, `${name}.pdf`,
    'Catatan: CSS dan gambar dari internet tidak ikut diproses (hanya gaya dasar dan gambar yang tertanam). Untuk halaman web utuh, gunakan Cetak, lalu Simpan sebagai PDF di browser.' + unsupportedNote(r.unsupported)
  );
};

const isNum = (s: string) => /^-?[\d.,]+%?$/.test(s.trim()) && /\d/.test(s);

export const excelToPdf: RunFn = async ([file], o, ctx) => {
  ctx.progress(10, 'Membaca spreadsheet');
  let sheets: Sheet[];
  if (/\.csv$/i.test(file.name)) sheets = [{ name: baseName(file.name), rows: parseCsv(await file.text()) }];
  else sheets = readXlsx(await file.arrayBuffer());
  const blocks: Block[] = [];
  let maxCols = 0;
  for (const sh of sheets) {
    const rows = sh.rows.map((r) => r ?? []).filter((r) => r.some((c) => String(c ?? '').trim()));
    if (!rows.length) continue;
    const cols = Math.max(...rows.map((r) => r.length));
    let last = cols;
    while (last > 0 && rows.every((r) => !String(r[last - 1] ?? '').trim())) last--;
    maxCols = Math.max(maxCols, last);
    const fs = last > 12 ? 6.5 : last > 8 ? 7.5 : last > 5 ? 8.5 : 9.5;
    if (blocks.length) blocks.push({ type: 'pagebreak' });
    if (sheets.length > 1) blocks.push({ type: 'p', heading: 2, runs: [{ text: sh.name }] });
    blocks.push({
      type: 'table', fontSize: fs, header: o.header !== 'no',
      rows: rows.map((r): Cell[] => Array.from({ length: last }, (_, i) => { const v = String(r[i] ?? ''); return { runs: [{ text: v }], align: isNum(v) ? 'right' : 'left' }; }))
    });
  }
  if (!blocks.length) throw new Error('Spreadsheet ini tidak berisi data.');
  ctx.progress(60, 'Menyusun PDF');
  const base = pageOf(o);
  const landscape = o.orient === 'landscape' || (o.orient !== 'portrait' && maxCols > 6);
  const r = await blocksToPdf(blocks, { page: landscape ? [base[1], base[0]] : base, margin: 36, title: baseName(file.name), footerNumbers: true });
  return pdfResult(r.bytes, `${baseName(file.name)}.pdf`, 'Catatan: yang diproses adalah nilai tampilan sel. Grafik, gambar, dan pemformatan warna sel tidak ikut diproses.' + unsupportedNote(r.unsupported));
};

export const pptToPdf: RunFn = async ([file], _o, ctx) => {
  const { pptxToPdf } = await import('../../lib/pptxRender');
  const r = await pptxToPdf(await file.arrayBuffer(), ctx.progress);
  if (!r.slides) throw new Error('Tidak ada slide yang bisa dikonversi.');
  return pdfResult(
    r.bytes, `${baseName(file.name)}.pdf`,
    'Eksperimental: teks, gambar, bentuk dasar, dan tabel dirender. Grafik, SmartArt, animasi, dan font khusus tidak didukung.' + unsupportedNote(r.unsupported)
  );
};
