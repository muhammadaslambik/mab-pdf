import { PDFDict, PDFDocument, PDFImage, PDFName, PDFRawStream } from 'pdf-lib';
import { imageEntries, numOf, readImage } from '../../lib/pdfImages';
import type { RunFn } from '../types';
import { canvasToBlob, loadPdf, openPdfJs, releaseCanvas, renderPage } from '../../lib/pdf';
import { baseName, formatBytes, pdfResult, tick, zipResult } from '../../lib/util';

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

const FMT: Record<string, { mime: string; ext: string; q?: number }> = { jpg: { mime: 'image/jpeg', ext: 'jpg', q: 0.9 }, png: { mime: 'image/png', ext: 'png' }, webp: { mime: 'image/webp', ext: 'webp', q: 0.9 } };
export const pdfToJpg: RunFn = async ([file], o, ctx) => {
  const doc = await openPdfJs(file);
  const scale = Number(o.scale) || 2;
  const f = FMT[String(o.format)] ?? FMT.jpg;
  const outs: { name: string; data: Uint8Array }[] = [];
  const pad = String(doc.numPages).length;
  for (let n = 1; n <= doc.numPages; n++) {
    ctx.check();
    ctx.progress(((n - 1) / doc.numPages) * 95, `Halaman ${n}/${doc.numPages}`);
    const page = await doc.getPage(n);
    const canvas = await renderPage(page, scale);
    const blob = await canvasToBlob(canvas, f.mime, f.q);
    outs.push({ name: `${baseName(file.name)}-${String(n).padStart(pad, '0')}.${f.ext}`, data: new Uint8Array(await blob.arrayBuffer()) });
    releaseCanvas(canvas); page.cleanup(); await tick();
  }
  await doc.destroy();
  if (outs.length === 1) return { files: [{ name: outs[0].name, blob: new Blob([outs[0].data as BlobPart], { type: f.mime }) }] };
  return zipResult(outs, `${baseName(file.name)}-${f.ext}.zip`);
};

/* ---------- Kompres cerdas: perkecil gambar di dalam PDF, teks tetap vektor ---------- */

const LEVELS: Record<string, { side: number; q: number }> = {
  extreme: { side: 1000, q: 0.5 }, recommended: { side: 1600, q: 0.68 }, light: { side: 2400, q: 0.82 }
};
const RASTER: Record<string, { scale: number; quality: number }> = { extreme: { scale: 1.0, quality: 0.5 }, recommended: { scale: 1.5, quality: 0.7 }, light: { scale: 2.0, quality: 0.85 } };

async function smartCompress(file: File, level: string, ctx: Parameters<RunFn>[2]) {
  const { side, q } = LEVELS[level] ?? LEVELS.recommended;
  const pdf = await loadPdf(file);
  const pc = pdf.context;
  const entries = imageEntries(pc);
  let changed = 0, saved = 0;
  for (let i = 0; i < entries.length; i++) {
    ctx.check(); ctx.progress((i / Math.max(1, entries.length)) * 90, `Gambar ${i + 1}/${entries.length}`);
    const [ref, obj] = entries[i];
    try {
      const w0 = numOf(obj.dict, 'Width') ?? 0, h0 = numOf(obj.dict, 'Height') ?? 0;
      const k = Math.min(1, side / Math.max(w0, h0, 1));
      if (k === 1 && obj.getContentsSize() < w0 * h0 * 0.12) continue; // sudah ringan
      const img = await readImage(pc, obj);
      if (!img) continue;
      const nw = Math.max(1, Math.round(img.w * k)), nh = Math.max(1, Math.round(img.h * k));
      const out = document.createElement('canvas'); out.width = nw; out.height = nh;
      const g = out.getContext('2d')!; g.imageSmoothingQuality = 'high'; g.fillStyle = '#fff'; g.fillRect(0, 0, nw, nh);
      g.drawImage(img.source, 0, 0, nw, nh);
      if ('close' in img.source) img.source.close();
      const blob = await canvasToBlob(out, 'image/jpeg', q);
      releaseCanvas(out);
      if (blob.size > img.origSize * (img.isDct ? 0.92 : 0.7)) continue; // tidak sepadan
      const nd = pc.obj({ Type: 'XObject', Subtype: 'Image', Width: nw, Height: nh, ColorSpace: 'DeviceRGB', BitsPerComponent: 8, Filter: 'DCTDecode' }) as PDFDict;
      for (const key of ['SMask', 'Intent', 'Interpolate']) { const v = obj.dict.get(PDFName.of(key)); if (v) nd.set(PDFName.of(key), v); }
      pc.assign(ref, PDFRawStream.of(nd, new Uint8Array(await blob.arrayBuffer())));
      changed++; saved += img.origSize - blob.size;
    } catch { continue; }
    await tick();
  }
  pdf.setProducer('MAB-PDF');
  ctx.progress(95, 'Menyimpan');
  return { bytes: await pdf.save({ useObjectStreams: true }), changed, total: entries.length, saved };
}

async function rasterCompress(file: File, level: string, ctx: Parameters<RunFn>[2]) {
  const { scale, quality } = RASTER[level] ?? RASTER.recommended;
  const doc = await openPdfJs(file);
  const out = await PDFDocument.create();
  for (let n = 1; n <= doc.numPages; n++) {
    ctx.check(); ctx.progress(((n - 1) / doc.numPages) * 95, `Halaman ${n}/${doc.numPages}`);
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const canvas = await renderPage(page, scale);
    const img = await out.embedJpg(new Uint8Array(await (await canvasToBlob(canvas, 'image/jpeg', quality)).arrayBuffer()));
    out.addPage([base.width, base.height]).drawImage(img, { x: 0, y: 0, width: base.width, height: base.height });
    releaseCanvas(canvas); page.cleanup(); await tick();
  }
  await doc.destroy();
  out.setProducer('MAB-PDF');
  return out.save({ useObjectStreams: true });
}

export const compress: RunFn = async ([file], o, ctx) => {
  const level = String(o.level || 'recommended');
  const name = `${baseName(file.name)}-kompres.pdf`;
  const keep = (note: string) => ({ files: [{ name: file.name, blob: file }], note });
  if (o.mode === 'raster') {
    const bytes = await rasterCompress(file, level, ctx);
    if (bytes.byteLength >= file.size) return keep('File ini sudah cukup kecil, hasil kompres justru lebih besar, jadi file asli dikembalikan.');
    return pdfResult(bytes, name, 'Mode gambar: semua halaman dijadikan gambar sehingga teks tidak bisa diseleksi. Jalankan OCR sesudahnya bila perlu.');
  }
  const r = await smartCompress(file, level, ctx);
  if (r.bytes.byteLength >= file.size * 0.98) {
    return keep(r.total
      ? 'Gambar di dalam PDF ini sudah efisien, jadi tidak ada yang bisa dihemat tanpa merusak kualitas. Coba tingkat "Maksimal" atau mode "ubah ke gambar".'
      : 'PDF ini tidak berisi gambar besar (isinya teks/vektor), jadi sudah sekecil yang aman. Coba mode "ubah ke gambar" bila perlu lebih kecil.');
  }
  return pdfResult(r.bytes, name, `${r.changed} dari ${r.total} gambar dioptimalkan (hemat ±${formatBytes(r.saved)}). Teks tetap bisa diseleksi dan dicari.`);
};

/* ---------- PDF -> Markdown (judul, daftar, tabel) ---------- */

export const pdfToMarkdown: RunFn = async ([file], o, ctx) => {
  const { extractDoc, NO_TEXT } = await import('../../lib/pdfText');
  const { pages, hasText } = await extractDoc(file, ctx.progress, ctx.check);
  if (!hasText) throw new Error(NO_TEXT);
  const blocks: string[] = [];
  const tableMd = (rows: string[][]) => {
    const n = Math.max(...rows.map((r) => r.length));
    const row = (r: string[]) => '| ' + Array.from({ length: n }, (_, k) => (r[k] ?? '').replace(/\|/g, '\\|')).join(' | ') + ' |';
    return [row(rows[0]), '|' + ' --- |'.repeat(n), ...rows.slice(1).map(row)].join('\n');
  };
  pages.forEach((pg, i) => {
    if (o.marker === 'yes' && i > 0) blocks.push(`<!-- Halaman ${i + 1} -->`);
    let rows: string[][] = [], list: string[] = [];
    const flush = () => { if (rows.length) blocks.push(tableMd(rows)); if (list.length) blocks.push(list.join('\n')); rows = []; list = []; };
    for (const p of pg.paras) {
      if (p.kind === 'row') { if (list.length) flush(); rows.push(p.cells ?? [p.text]); continue; }
      if (p.kind === 'li') { if (rows.length) flush(); list.push(`- ${p.text}`); continue; }
      flush();
      blocks.push(p.kind === 'h1' ? `# ${p.text}` : p.kind === 'h2' ? `## ${p.text}` : p.kind === 'h3' ? `### ${p.text}` : p.text);
    }
    flush();
  });
  return {
    files: [{ name: `${baseName(file.name)}.md`, blob: new Blob([blocks.join('\n\n') + '\n'], { type: 'text/markdown' }) }],
    note: 'Judul, daftar, dan tabel dikenali dari ukuran font serta posisi teks. Kolom ganda dan tabel tanpa garis bisa perlu dirapikan.'
  };
};
