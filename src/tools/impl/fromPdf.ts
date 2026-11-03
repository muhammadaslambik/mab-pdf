import type { RunFn } from '../types';
import { NO_TEXT, cellsOf, extractDoc, pageLines } from '../../lib/pdfText';
import { canvasToBlob, openPdfJs, releaseCanvas, renderPage } from '../../lib/pdf';
import { writeDocx, writeXlsx, type DPara, type DTable } from '../../lib/ooxmlWrite';
import { baseName, tick } from '../../lib/util';

const blobOf = (u8: Uint8Array, type: string) => new Blob([u8 as BlobPart], { type });
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

/* ---------- PDF -> Word ---------- */
export const pdfToWord: RunFn = async ([file], o, ctx) => {
  const { pages, body, hasText } = await extractDoc(file, ctx.progress, ctx.check);
  if (!hasText) throw new Error(NO_TEXT);
  const out: (DPara | DTable)[] = [];
  pages.forEach((pg, pi) => {
    let first = true;
    let rows: string[][] = [];
    const flushTable = () => {
      if (rows.length) out.push({ table: rows, pageBreakBefore: o.pagebreak !== 'no' && pi > 0 && first });
      if (rows.length) first = false;
      rows = [];
    };
    for (const p of pg.paras) {
      if (p.kind === 'row') { rows.push(p.cells ?? [p.text]); continue; }
      flushTable();
      const h = p.kind === 'h1' ? 1 : p.kind === 'h2' ? 2 : p.kind === 'h3' ? 3 : undefined;
      out.push({
        runs: [{ text: p.text, ...(h ? {} : p.size && Math.abs(p.size - body) > 1 ? { size: Math.round(p.size) } : {}) }],
        heading: h, bullet: p.kind === 'li',
        pageBreakBefore: o.pagebreak !== 'no' && pi > 0 && first
      });
      first = false;
    }
    flushTable();
  });
  ctx.progress(95, 'Menyusun dokumen Word');
  return {
    files: [{ name: `${baseName(file.name)}.docx`, blob: blobOf(writeDocx(out, [pages[0].width, pages[0].height]), DOCX) }],
    note: 'Teks, judul, dan daftar direkonstruksi dari posisi teks. Tabel sederhana terdeteksi, tetapi kolom ganda dan gambar tidak dipertahankan, jadi periksa hasilnya.'
  };
};

/* ---------- PDF -> Excel ---------- */
export const pdfToExcel: RunFn = async ([file], o, ctx) => {
  const doc = await openPdfJs(file);
  const sheets: { name: string; rows: (string | number)[][] }[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    ctx.check(); ctx.progress(((n - 1) / doc.numPages) * 90, `Halaman ${n}/${doc.numPages}`);
    const page = await doc.getPage(n);
    const lines = await pageLines(page);
    page.cleanup();
    const rowsCells = lines.map(cellsOf);
    // pita kolom: gabungkan rentang [x0,x1] sel yang saling tumpang-tindih (aman untuk angka rata kanan)
    const multi = rowsCells.filter((r) => r.length >= 2);
    const all = (multi.length ? multi : rowsCells).flat().sort((a, b) => a.x - b.x);
    const bands: { x0: number; x1: number }[] = [];
    for (const c of all) {
      const last = bands[bands.length - 1];
      if (last && c.x <= last.x1 + 2) last.x1 = Math.max(last.x1, c.x1);
      else bands.push({ x0: c.x, x1: c.x1 });
    }
    const rows = rowsCells.map((cs) => {
      const row: (string | number)[] = [];
      for (const c of cs) {
        let ci = bands.findIndex((b) => c.x1 >= b.x0 - 2 && c.x <= b.x1 + 2);
        if (ci < 0) ci = 0;
        while (row[ci] !== undefined && row[ci] !== '') ci++;
        row[ci] = /^-?\d+(\.\d+)?$/.test(c.text) && c.text.length < 16 ? parseFloat(c.text) : c.text;
      }
      return Array.from(row, (v) => v ?? '');
    });
    if (rows.some((r) => r.length)) sheets.push({ name: `Halaman ${n}`, rows });
    await tick();
  }
  await doc.destroy();
  if (!sheets.length) throw new Error(NO_TEXT);
  const merged = o.mode === 'one' ? [{ name: 'Data', rows: sheets.flatMap((s) => s.rows) }] : sheets;
  return {
    files: [{ name: `${baseName(file.name)}.xlsx`, blob: blobOf(writeXlsx(merged), XLSX) }],
    note: 'Kolom ditebak dari posisi teks. Tabel tanpa garis atau dengan sel bergabung bisa meleset, jadi periksa hasilnya.'
  };
};

/* ---------- PDF -> PowerPoint ---------- */
export const pdfToPpt: RunFn = async ([file], o, ctx) => {
  const mod: any = await import('pptxgenjs');
  const PptxGenJS = mod.default ?? mod;
  const doc = await openPdfJs(file);
  const pres = new PptxGenJS();
  const first = await doc.getPage(1);
  const v1 = first.getViewport({ scale: 1 });
  first.cleanup();
  pres.defineLayout({ name: 'PDFPAGE', width: v1.width / 72, height: v1.height / 72 });
  pres.layout = 'PDFPAGE';
  const mode = String(o.mode || 'image');
  for (let n = 1; n <= doc.numPages; n++) {
    ctx.check(); ctx.progress(((n - 1) / doc.numPages) * 92, `Halaman ${n}/${doc.numPages}`);
    const page = await doc.getPage(n);
    const vp = page.getViewport({ scale: 1 });
    const slide = pres.addSlide();
    if (mode === 'image') {
      const canvas = await renderPage(page, 2);
      const blob = await canvasToBlob(canvas, 'image/jpeg', 0.88);
      const b64 = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result).replace(/^data:/, '')); r.readAsDataURL(blob); });
      releaseCanvas(canvas);
      slide.addImage({ data: b64, x: 0, y: 0, w: vp.width / 72, h: vp.height / 72 });
    } else {
      for (const ln of await pageLines(page)) {
        const w = Math.min(vp.width - ln.x0, (ln.x1 - ln.x0) * 1.12 + 8);
        slide.addText(ln.text, { x: ln.x0 / 72, y: (vp.height - ln.y - ln.size * 0.95) / 72, w: w / 72, h: (ln.size * 1.3) / 72, fontSize: Math.max(4, Math.round(ln.size * 10) / 10), fontFace: 'Arial', margin: 0, valign: 'top', wrap: false, color: '000000' });
      }
    }
    page.cleanup(); await tick();
  }
  await doc.destroy();
  ctx.progress(96, 'Menyusun file PowerPoint');
  const out: Blob = await pres.write({ outputType: 'blob' });
  return {
    files: [{ name: `${baseName(file.name)}.pptx`, blob: new Blob([out], { type: PPTX }) }],
    note: mode === 'image' ? 'Setiap halaman menjadi satu slide berupa gambar (tampilan akurat, tetapi teks tidak bisa diedit).' : 'Teks menjadi kotak teks yang bisa diedit. Gambar dan grafik dari PDF tidak ikut dibawa.'
  };
};
