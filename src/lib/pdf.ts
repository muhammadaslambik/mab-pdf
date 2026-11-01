import { PDFDocument } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** Buka dengan pdf-lib (untuk memodifikasi/menyimpan). */
export async function loadPdf(file: File): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(await file.arrayBuffer());
  } catch {
    throw new Error(`"${file.name}" tidak bisa dibuka. File mungkin rusak atau terkunci password.`);
  }
}

/** Buka dengan pdf.js (untuk render / ekstrak teks). */
export async function openPdfJs(file: File) {
  const data = new Uint8Array(await file.arrayBuffer());
  try {
    return await pdfjs.getDocument({ data }).promise;
  } catch (e: any) {
    if (e?.name === 'PasswordException') throw new Error(`"${file.name}" terkunci password.`);
    throw new Error(`"${file.name}" tidak bisa dibaca. File mungkin rusak.`);
  }
}

/** Render satu halaman ke canvas. Skala otomatis diturunkan bila melebihi batas piksel (aman untuk iOS). */
export async function renderPage(page: pdfjs.PDFPageProxy, scale: number, maxPixels = 12_000_000) {
  const base = page.getViewport({ scale: 1 });
  let s = scale;
  const px = base.width * s * base.height * s;
  if (px > maxPixels) s *= Math.sqrt(maxPixels / px);
  const vp = page.getViewport({ scale: s });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(vp.width);
  canvas.height = Math.ceil(vp.height);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  return canvas;
}

export const canvasToBlob = (c: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('Gagal membuat gambar.'))), type, quality)
  );

export const releaseCanvas = (c: HTMLCanvasElement) => {
  c.width = 0;
  c.height = 0;
};
