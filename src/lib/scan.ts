import { PDFDocument } from 'pdf-lib';
import { createEngine, defaultCorners, type Filter, type Pt } from './scanCore';
export { defaultCorners };
export type { Filter, Pt };

export interface Rendered { w: number; h: number; buf: ArrayBuffer; report: string }

/* ---- klien Web Worker (cadangan: jalan di thread utama bila Worker tidak tersedia) ---- */
let worker: Worker | null | undefined;
let direct: ReturnType<typeof createEngine> | null = null;
let seq = 1;
const pending = new Map<number, { ok: (v: any) => void; no: (e: Error) => void }>();

function ensure() {
  if (worker !== undefined) return;
  try {
    const w = new Worker(new URL('./scan.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent) => {
      const p = pending.get(e.data.rid); if (!p) return; pending.delete(e.data.rid);
      e.data.err ? p.no(new Error(e.data.err)) : p.ok(e.data.r);
    };
    w.onerror = () => { pending.forEach((p) => p.no(new Error('Pemroses latar gagal. Muat ulang halaman.'))); pending.clear(); w.terminate(); worker = null; };
    worker = w;
  } catch { worker = null; }
}

function call<T>(op: string, args: any[], transfer: Transferable[] = []): Promise<T> {
  ensure();
  if (!worker) {
    direct ||= createEngine();
    return new Promise((ok, no) => setTimeout(() => { try { ok((direct as any)[op](...args)); } catch (e) { no(e as Error); } }));
  }
  return new Promise((ok, no) => { const rid = seq++; pending.set(rid, { ok, no }); worker!.postMessage({ rid, op, args }, transfer); });
}

export const scan = {
  init: (id: number, img: ImageData) => call<boolean>('init', [id, img.width, img.height, img.data.buffer], [img.data.buffer]),
  detect: (id: number) => call<Pt[]>('detect', [id]),
  render: (id: number, q: Pt[], f: Filter, ink: number, rot: number, maxSide: number, preview: boolean) => call<Rendered>('render', [id, q, f, ink, rot, maxSide, preview]),
  free: (id: number) => call<boolean>('free', [id])
};
export function disposeScan() { worker?.terminate(); worker = undefined; direct = null; pending.clear(); }

export const toCanvasFrom = (r: Rendered) => {
  const c = document.createElement('canvas'); c.width = r.w; c.height = r.h;
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(r.buf), r.w, r.h), 0, 0);
  return c;
};

/** Muat gambar/video ke kanvas (EXIF dihormati), sisi terpanjang dibatasi. */
export async function toCanvas(src: Blob | HTMLVideoElement, max = 2400): Promise<HTMLCanvasElement> {
  let w: number, h: number, draw: CanvasImageSource, close = () => {};
  if (src instanceof HTMLVideoElement) { w = src.videoWidth; h = src.videoHeight; draw = src; }
  else {
    try { const b = await createImageBitmap(src, { imageOrientation: 'from-image' } as any); w = b.width; h = b.height; draw = b; close = () => b.close(); }
    catch {
      const url = URL.createObjectURL(src), img = new Image();
      await new Promise<void>((ok, no) => { img.onload = () => ok(); img.onerror = () => no(new Error('Gambar tidak bisa dibaca.')); img.src = url; });
      w = img.naturalWidth; h = img.naturalHeight; draw = img; close = () => URL.revokeObjectURL(url);
    }
  }
  const s = Math.min(1, max / Math.max(w, h)), c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
  c.getContext('2d', { willReadFrequently: true })!.drawImage(draw, 0, 0, c.width, c.height);
  close();
  return c;
}

const SIZES: Record<string, [number, number]> = { a4: [595.28, 841.89], letter: [612, 792] };

/** Halaman diminta satu per satu dan kanvasnya dilepas segera: memori puncak = satu halaman. */
export async function buildPdf(count: number, getPage: (i: number) => Promise<HTMLCanvasElement>, size: string, margin: number, onProgress?: (i: number) => void): Promise<Blob> {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < count; i++) {
    const c = await getPage(i), cw = c.width, ch = c.height;
    const blob: Blob = await new Promise((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error('Gagal membuat gambar.'))), 'image/jpeg', 0.88));
    c.width = 0; c.height = 0;
    const img = await pdf.embedJpg(new Uint8Array(await blob.arrayBuffer()));
    let pw: number, ph: number;
    if (size === 'fit') { pw = cw * 0.75; ph = ch * 0.75; } else { [pw, ph] = SIZES[size] ?? SIZES.a4; if (cw > ch) [pw, ph] = [ph, pw]; }
    const page = pdf.addPage([pw, ph]), m = size === 'fit' ? 0 : margin, s = Math.min((pw - 2 * m) / cw, (ph - 2 * m) / ch);
    page.drawImage(img, { x: (pw - cw * s) / 2, y: (ph - ch * s) / 2, width: cw * s, height: ch * s });
    onProgress?.(i + 1);
  }
  return new Blob([await pdf.save()], { type: 'application/pdf' });
}
