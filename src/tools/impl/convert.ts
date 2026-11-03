import { PDFDocument, PDFImage } from 'pdf-lib';
import type { RunFn } from '../types';
import { canvasToBlob, openPdfJs, releaseCanvas, renderPage } from '../../lib/pdf';
import { baseName, pdfResult, tick, zipResult } from '../../lib/util';

/* ---------- Gambar -> PDF (juga dipakai fitur Pindai) ---------- */

const MAX_SIDE = 4000;

async function embedImage(pdf: PDFDocument, file: File): Promise<PDFImage> {
  if (file.type === 'image/png') return pdf.embedPng(new Uint8Array(await file.arrayBuffer()));
  // Lewat canvas: menerapkan rotasi EXIF (foto kamera HP) dan mendukung WebP/GIF/BMP.
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    throw new Error(`"${file.name}" bukan gambar yang bisa dibaca browser ini.`);
  }
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  const blob = await canvasToBlob(c, 'image/jpeg', 0.9);
  releaseCanvas(c);
  return pdf.embedJpg(new Uint8Array(await blob.arrayBuffer()));
}

export const imagesToPdf: RunFn = async (files, o, ctx) => {
  const pdf = await PDFDocument.create();
  const size = String(o.size || 'a4');
  const margin = size === 'fit' ? 0 : Number(o.margin) || 0;
  for (let i = 0; i < files.length; i++) {
    ctx.check();
    ctx.progress((i / files.length) * 95, `Gambar ${i + 1}/${files.length}`);
    const img = await embedImage(pdf, files[i]);
    let pw: number, ph: number;
    if (size === 'fit') {
      pw = img.width * 0.75;
      ph = img.height * 0.75;
    } else {
      [pw, ph] = size === 'letter' ? [612, 792] : [595.28, 841.89];
      if (img.width > img.height) [pw, ph] = [ph, pw];
    }
    const page = pdf.addPage([pw, ph]);
    const s = Math.min((pw - 2 * margin) / img.width, (ph - 2 * margin) / img.height);
    const w = img.width * s;
    const h = img.height * s;
    page.drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
    await tick();
  }
  pdf.setProducer('mab-pdf');
  return pdfResult(await pdf.save(), 'mab-pdf-gambar.pdf');
};

/* ---------- PDF -> JPG ---------- */

export const pdfToJpg: RunFn = async ([file], o, ctx) => {
  const doc = await openPdfJs(file);
  const scale = Number(o.scale) || 2;
  const outs: { name: string; data: Uint8Array }[] = [];
  const pad = String(doc.numPages).length;
  for (let n = 1; n <= doc.numPages; n++) {
    ctx.check();
    ctx.progress(((n - 1) / doc.numPages) * 95, `Halaman ${n}/${doc.numPages}`);
    const page = await doc.getPage(n);
    const canvas = await renderPage(page, scale);
    const blob = await canvasToBlob(canvas, 'image/jpeg', 0.9);
    outs.push({
      name: `${baseName(file.name)}-${String(n).padStart(pad, '0')}.jpg`,
      data: new Uint8Array(await blob.arrayBuffer())
    });
    releaseCanvas(canvas);
    page.cleanup();
    await tick();
  }
  await doc.destroy();
  if (outs.length === 1)
    return { files: [{ name: outs[0].name, blob: new Blob([outs[0].data as BlobPart], { type: 'image/jpeg' }) }] };
  return zipResult(outs, `${baseName(file.name)}-jpg.zip`);
};

/* ---------- Kompres (rasterisasi halaman) ---------- */

const PRESETS: Record<string, { scale: number; quality: number }> = {
  extreme: { scale: 1.0, quality: 0.5 },
  recommended: { scale: 1.5, quality: 0.7 },
  light: { scale: 2.0, quality: 0.85 }
};

export const compress: RunFn = async ([file], o, ctx) => {
  const { scale, quality } = PRESETS[String(o.level)] ?? PRESETS.recommended;
  const doc = await openPdfJs(file);
  const out = await PDFDocument.create();
  for (let n = 1; n <= doc.numPages; n++) {
    ctx.check();
    ctx.progress(((n - 1) / doc.numPages) * 95, `Halaman ${n}/${doc.numPages}`);
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const canvas = await renderPage(page, scale);
    const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
    const img = await out.embedJpg(new Uint8Array(await blob.arrayBuffer()));
    out.addPage([base.width, base.height]).drawImage(img, {
      x: 0, y: 0, width: base.width, height: base.height
    });
    releaseCanvas(canvas);
    page.cleanup();
    await tick();
  }
  await doc.destroy();
  out.setProducer('mab-pdf');
  const bytes = await out.save({ useObjectStreams: true });
  if (bytes.byteLength >= file.size)
    return {
      files: [{ name: file.name, blob: file }],
      note: 'File ini sudah cukup kecil. Hasil kompres justru lebih besar, jadi file asli dikembalikan.'
    };
  return pdfResult(
    bytes,
    `${baseName(file.name)}-kompres.pdf`,
    'Catatan: semua halaman diubah menjadi gambar, jadi teks tidak bisa diseleksi atau dicari. Jalankan OCR sesudahnya bila perlu.'
  );
};

/* ---------- PDF -> Markdown (heuristik ukuran font) ---------- */

type Line = { y: number; size: number; text: string };

export const pdfToMarkdown: RunFn = async ([file], _o, ctx) => {
  const doc = await openPdfJs(file);
  const pages: Line[][] = [];
  const sizeCount = new Map<number, number>();

  for (let n = 1; n <= doc.numPages; n++) {
    ctx.check();
    ctx.progress(((n - 1) / doc.numPages) * 90, `Membaca halaman ${n}/${doc.numPages}`);
    const page = await doc.getPage(n);
    const tc = await page.getTextContent();
    const rows: { y: number; size: number; parts: { x: number; w: number; s: string }[] }[] = [];
    for (const it of tc.items as any[]) {
      if (typeof it.str !== 'string' || !it.str.trim()) continue;
      const x = it.transform[4];
      const y = it.transform[5];
      const size = Math.round(Math.hypot(it.transform[2], it.transform[3]));
      let row = rows.find((r) => Math.abs(r.y - y) < 2);
      if (!row) rows.push((row = { y, size, parts: [] }));
      row.size = Math.max(row.size, size);
      row.parts.push({ x, w: it.width ?? 0, s: it.str });
      sizeCount.set(size, (sizeCount.get(size) ?? 0) + it.str.length);
    }
    rows.sort((a, b) => b.y - a.y);
    pages.push(
      rows.map((r) => {
        r.parts.sort((a, b) => a.x - b.x);
        let text = '';
        let end = -Infinity;
        for (const p of r.parts) {
          if (text && p.x - end > r.size * 0.15 && !text.endsWith(' ') && !p.s.startsWith(' ')) text += ' ';
          text += p.s;
          end = p.x + p.w;
        }
        return { y: r.y, size: r.size, text: text.trim() };
      })
    );
    page.cleanup();
    await tick();
  }
  await doc.destroy();

  let body = 12;
  let best = -1;
  sizeCount.forEach((c, s) => { if (c > best) { best = c; body = s; } });

  const blocks: string[] = [];
  let para = '';
  const flush = () => { if (para.trim()) blocks.push(para.trim()); para = ''; };

  for (const lines of pages) {
    let prevY: number | null = null;
    for (const ln of lines) {
      const ratio = ln.size / body;
      const gap = prevY === null ? 0 : prevY - ln.y;
      const bullet = /^[•●▪·\-–*]\s+/.test(ln.text);
      if (ratio >= 1.1 && ln.text.length < 140) {
        flush();
        const lvl = ratio >= 1.5 ? '#' : ratio >= 1.25 ? '##' : '###';
        blocks.push(`${lvl} ${ln.text}`);
      } else if (bullet) {
        flush();
        blocks.push(`- ${ln.text.replace(/^[•●▪·\-–*]\s+/, '')}`);
      } else {
        if (gap > ln.size * 1.8) flush();
        para += (para && !para.endsWith('-') ? ' ' : '') + ln.text;
      }
      prevY = ln.y;
    }
    flush();
  }
  const md = blocks.join('\n\n').replace(/\n\n- /g, '\n- ') + '\n';
  if (!md.trim()) throw new Error('Tidak ada teks yang bisa diekstrak. PDF ini mungkin hasil scan (butuh OCR).');
  return {
    files: [{ name: `${baseName(file.name)}.md`, blob: new Blob([md], { type: 'text/markdown' }) }],
    note: 'Hasil berbasis heuristik ukuran font. Tabel dan kolom ganda mungkin perlu dirapikan manual.'
  };
};

