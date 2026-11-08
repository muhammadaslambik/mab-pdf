/** Pembaca gambar yang tertanam di PDF (JPEG/DCT dan Flate 8-bit), dipakai Kompres dan Ekstrak Gambar. */
import { PDFArray, PDFDict, PDFName, PDFNumber, PDFRawStream, PDFRef, decodePDFRawStream, type PDFContext } from 'pdf-lib';

export const numOf = (d: PDFDict, k: string) => { const v = d.lookup(PDFName.of(k)); return v instanceof PDFNumber ? v.asNumber() : undefined; };
const DECODABLE = new Set(['FlateDecode', 'ASCII85Decode', 'ASCIIHexDecode', 'LZWDecode', 'RunLengthDecode']);

export const filtersOf = (d: PDFDict): string[] => {
  const f = d.lookup(PDFName.of('Filter'));
  if (f instanceof PDFName) return [f.decodeText()];
  if (f instanceof PDFArray) return f.asArray().map((x) => (x instanceof PDFName ? x.decodeText() : '?'));
  return [];
};

/** Urungkan prediktor PNG/TIFF (8 bit) pada data hasil Flate. */
export function unpredict(data: Uint8Array, predictor: number, columns: number, colors: number): Uint8Array {
  const bpp = colors, rowLen = columns * colors;
  if (predictor === 2) {
    const out = data.slice();
    for (let r = 0; r * rowLen < out.length; r++) for (let i = bpp; i < rowLen; i++) out[r * rowLen + i] = (out[r * rowLen + i] + out[r * rowLen + i - bpp]) & 255;
    return out;
  }
  const rows = Math.floor(data.length / (rowLen + 1));
  const out = new Uint8Array(rows * rowLen);
  for (let r = 0; r < rows; r++) {
    const ft = data[r * (rowLen + 1)], src = r * (rowLen + 1) + 1, dst = r * rowLen, prev = dst - rowLen;
    for (let i = 0; i < rowLen; i++) {
      const x = data[src + i], a = i >= bpp ? out[dst + i - bpp] : 0, b = r ? out[prev + i] : 0, c = r && i >= bpp ? out[prev + i - bpp] : 0;
      let v = x;
      if (ft === 1) v = x + a; else if (ft === 2) v = x + b; else if (ft === 3) v = x + ((a + b) >> 1);
      else if (ft === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      out[dst + i] = v & 255;
    }
  }
  return out;
}

export const imageEntries = (pc: PDFContext) =>
  pc.enumerateIndirectObjects().filter(([, o]) => o instanceof PDFRawStream && (o as PDFRawStream).dict.lookup(PDFName.of('Subtype')) === PDFName.of('Image')) as [PDFRef, PDFRawStream][];

export interface PdfImage { w: number; h: number; isDct: boolean; jpeg?: Uint8Array; source: ImageBitmap | HTMLCanvasElement | OffscreenCanvas; origSize: number }

/** Dekode satu gambar PDF. Mengembalikan null untuk format yang tidak didukung (mask, CMYK-Flate, Indexed, JPX, dll). */
export async function readImage(pc: PDFContext, obj: PDFRawStream): Promise<PdfImage | null> {
  const d = obj.dict;
  const w = numOf(d, 'Width'), h = numOf(d, 'Height');
  const isMask = d.lookup(PDFName.of('ImageMask'));
  if (!w || !h || (isMask && isMask.toString() === 'true') || d.has(PDFName.of('Mask')) || w * h > 60_000_000) return null;
  const fl = filtersOf(d);
  const isDct = fl[fl.length - 1] === 'DCTDecode';
  const prefix = isDct ? fl.slice(0, -1) : fl;
  if (!prefix.every((f) => DECODABLE.has(f))) return null;
  const origSize = obj.getContentsSize();
  if (isDct) {
    let jpg = obj.getContents();
    if (prefix.length) {
      const td = pc.obj({}) as PDFDict;
      td.set(PDFName.of('Filter'), pc.obj(prefix.map((x) => PDFName.of(x))));
      jpg = decodePDFRawStream(PDFRawStream.of(td, jpg)).decode();
    }
    return { w, h, isDct, jpeg: jpg, origSize, source: await createImageBitmap(new Blob([jpg as BlobPart], { type: 'image/jpeg' })) };
  }
  if (!fl.includes('FlateDecode') || (numOf(d, 'BitsPerComponent') ?? 8) !== 8) return null;
  const cs = d.lookup(PDFName.of('ColorSpace'));
  let colors = 0;
  if (cs === PDFName.of('DeviceRGB')) colors = 3; else if (cs === PDFName.of('DeviceGray')) colors = 1;
  else if (cs instanceof PDFArray && cs.get(0) === PDFName.of('ICCBased')) { const prof = cs.lookup(1); colors = prof instanceof PDFRawStream ? numOf(prof.dict, 'N') ?? 0 : 0; }
  if (colors !== 1 && colors !== 3) return null;
  let raw = decodePDFRawStream(obj).decode();
  const parms = d.lookup(PDFName.of('DecodeParms'));
  const pd = parms instanceof PDFDict ? parms : parms instanceof PDFArray ? (parms.asArray().map((x) => (x instanceof PDFRef ? pc.lookup(x) : x)).find((x) => x instanceof PDFDict) as PDFDict | undefined) ?? null : null;
  const pred = pd ? numOf(pd, 'Predictor') ?? 1 : 1;
  if (pred >= 10 || pred === 2) raw = unpredict(raw, pred, pd ? numOf(pd, 'Columns') ?? w : w, colors);
  if (raw.length < w * h * colors) return null;
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let p = 0, o = 0; p < w * h; p++, o += 4) {
    if (colors === 3) { rgba[o] = raw[p * 3]; rgba[o + 1] = raw[p * 3 + 1]; rgba[o + 2] = raw[p * 3 + 2]; } else { rgba[o] = rgba[o + 1] = rgba[o + 2] = raw[p]; }
    rgba[o + 3] = 255;
  }
  const c: any = typeof document !== 'undefined' ? Object.assign(document.createElement('canvas'), { width: w, height: h }) : new OffscreenCanvas(w, h);
  c.getContext('2d').putImageData(new ImageData(rgba, w, h), 0, 0);
  return { w, h, isDct, origSize, source: c };
}
