// Inti Kompres cerdas: dipakai di Web Worker (OffscreenCanvas) dan sebagai cadangan di thread utama (canvas DOM).
import { PDFDict, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { imageEntries, numOf, readImage } from './pdfImages';
import { mapLimit } from './device';

export const LEVELS: Record<string, { side: number; q: number }> = {
  extreme: { side: 1000, q: 0.5 }, recommended: { side: 1600, q: 0.68 }, light: { side: 2400, q: 0.82 }
};

export interface Hooks { progress: (percent: number, label: string) => void; check: () => void }
export interface SmartResult { bytes: Uint8Array; changed: number; total: number; saved: number }

function makeCanvas(w: number, h: number): any {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  return new OffscreenCanvas(w, h);
}

function toJpeg(c: any, quality: number): Promise<Blob> {
  if (typeof c.convertToBlob === 'function') return c.convertToBlob({ type: 'image/jpeg', quality });
  return new Promise((res, rej) => c.toBlob((b: Blob | null) => (b ? res(b) : rej(new Error('Gagal membuat gambar.'))), 'image/jpeg', quality));
}

export async function smartCompressCore(
  name: string, bytes: Uint8Array, level: string, hooks: Hooks, limit: number,
): Promise<SmartResult> {
  const { side, q } = LEVELS[level] ?? LEVELS.recommended;
  let pdf: PDFDocument;
  try {
    pdf = await PDFDocument.load(bytes);
  } catch {
    throw new Error(`"${name}" tidak bisa dibuka. File mungkin rusak atau terkunci password.`);
  }
  const pc = pdf.context;
  const entries = imageEntries(pc);
  let changed = 0, saved = 0, done = 0;

  await mapLimit(entries, limit, async ([ref, obj]) => {
    try {
      const w0 = numOf(obj.dict, 'Width') ?? 0, h0 = numOf(obj.dict, 'Height') ?? 0;
      const k = Math.min(1, side / Math.max(w0, h0, 1));
      if (k === 1 && obj.getContentsSize() < w0 * h0 * 0.12) return; // sudah ringan
      const img = await readImage(pc, obj);
      if (!img) return;
      const nw = Math.max(1, Math.round(img.w * k)), nh = Math.max(1, Math.round(img.h * k));
      const out = makeCanvas(nw, nh);
      const g = out.getContext('2d');
      g.imageSmoothingQuality = 'high'; g.fillStyle = '#fff'; g.fillRect(0, 0, nw, nh);
      g.drawImage(img.source, 0, 0, nw, nh);
      if ('close' in img.source) (img.source as ImageBitmap).close();
      const blob = await toJpeg(out, q);
      out.width = 0; out.height = 0;
      if (blob.size > img.origSize * (img.isDct ? 0.92 : 0.7)) return; // tidak sepadan
      const nd = pc.obj({ Type: 'XObject', Subtype: 'Image', Width: nw, Height: nh, ColorSpace: 'DeviceRGB', BitsPerComponent: 8, Filter: 'DCTDecode' }) as PDFDict;
      for (const key of ['SMask', 'Intent', 'Interpolate']) { const v = obj.dict.get(PDFName.of(key)); if (v) nd.set(PDFName.of(key), v); }
      pc.assign(ref, PDFRawStream.of(nd, new Uint8Array(await blob.arrayBuffer())));
      changed++; saved += img.origSize - blob.size;
    } catch { /* gambar ini dilewati, yang lain lanjut */ }
    finally {
      done++;
      hooks.progress((done / Math.max(1, entries.length)) * 90, `Gambar ${done}/${entries.length}`);
      await new Promise<void>((r) => setTimeout(r, 0));
    }
  }, hooks.check);

  pdf.setProducer('MAB-PDF');
  hooks.progress(95, 'Menyimpan');
  return { bytes: await pdf.save({ useObjectStreams: true }), changed, total: entries.length, saved };
}
