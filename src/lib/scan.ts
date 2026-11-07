import { PDFDocument } from 'pdf-lib';

export type Pt = { x: number; y: number };
export type Filter = 'orig' | 'doc' | 'bw' | 'gray';

const mk = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
};

/** Muat gambar ke canvas (orientasi EXIF dihormati), sisi terpanjang dibatasi. */
export async function toCanvas(src: Blob | HTMLVideoElement, max = 2400): Promise<HTMLCanvasElement> {
  let w: number, h: number, draw: CanvasImageSource, close = () => {};
  if (src instanceof HTMLVideoElement) {
    w = src.videoWidth; h = src.videoHeight; draw = src;
  } else {
    try {
      const b = await createImageBitmap(src, { imageOrientation: 'from-image' } as any);
      w = b.width; h = b.height; draw = b; close = () => b.close();
    } catch {
      const url = URL.createObjectURL(src);
      const img = new Image();
      await new Promise<void>((ok, no) => { img.onload = () => ok(); img.onerror = () => no(new Error('Gambar tidak bisa dibaca.')); img.src = url; });
      w = img.naturalWidth; h = img.naturalHeight; draw = img; close = () => URL.revokeObjectURL(url);
    }
  }
  const s = Math.min(1, max / Math.max(w, h));
  const c = mk(w * s, h * s);
  c.getContext('2d')!.drawImage(draw, 0, 0, c.width, c.height);
  close();
  return c;
}

export const defaultCorners = (): Pt[] => [{ x: .06, y: .06 }, { x: .94, y: .06 }, { x: .94, y: .94 }, { x: .06, y: .94 }];

/** Deteksi dokumen: ambang Otsu, komponen terang terbesar, lalu 4 titik ekstrem. Hasil dinormalkan 0..1 (TL, TR, BR, BL). */
export function detectCorners(c: HTMLCanvasElement): Pt[] {
  const w = 320, h = Math.max(8, Math.round((c.height * w) / c.width));
  const t = mk(w, h);
  const cx = t.getContext('2d', { willReadFrequently: true })!;
  cx.drawImage(c, 0, 0, w, h);
  const d = cx.getImageData(0, 0, w, h).data;
  const g = new Uint8Array(w * h);
  for (let i = 0; i < g.length; i++) g[i] = (d[i * 4] * 77 + d[i * 4 + 1] * 150 + d[i * 4 + 2] * 29) >> 8;
  const hist = new Array(256).fill(0);
  g.forEach((v) => hist[v]++);
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let wB = 0, sB = 0, best = 0, th = 128;
  for (let i = 0; i < 256; i++) {
    wB += hist[i]; if (!wB) continue;
    const wF = g.length - wB; if (!wF) break;
    sB += i * hist[i];
    const v = wB * wF * (sB / wB - (sum - sB) / wF) ** 2;
    if (v > best) { best = v; th = i; }
  }
  let mask: Uint8Array = new Uint8Array(w * h);
  let on = 0;
  for (let i = 0; i < mask.length; i++) if (g[i] > th) { mask[i] = 1; on++; }
  if (on / mask.length > 0.7) { mask = Uint8Array.from(mask, (v) => 1 - v); }
  // komponen terhubung terbesar
  const seen = new Uint8Array(w * h), q = new Int32Array(w * h);
  let bestComp: number[] = [];
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || seen[s]) continue;
    let head = 0, tail = 0; q[tail++] = s; seen[s] = 1;
    while (head < tail) {
      const p = q[head++], x = p % w, y = (p / w) | 0;
      if (x > 0 && mask[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; q[tail++] = p - 1; }
      if (x < w - 1 && mask[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; q[tail++] = p + 1; }
      if (y > 0 && mask[p - w] && !seen[p - w]) { seen[p - w] = 1; q[tail++] = p - w; }
      if (y < h - 1 && mask[p + w] && !seen[p + w]) { seen[p + w] = 1; q[tail++] = p + w; }
    }
    if (tail > bestComp.length) bestComp = Array.from(q.subarray(0, tail));
  }
  if (bestComp.length < w * h * 0.1) return defaultCorners();
  let tl = Infinity, br = -Infinity, tr = -Infinity, bl = Infinity;
  let P = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];
  for (const p of bestComp) {
    const x = p % w, y = (p / w) | 0, a = x + y, b = x - y;
    if (a < tl) { tl = a; P[0] = { x, y }; }
    if (b > tr) { tr = b; P[1] = { x, y }; }
    if (a > br) { br = a; P[2] = { x, y }; }
    if (b < bl) { bl = b; P[3] = { x, y }; }
  }
  let area = 0;
  for (let i = 0; i < 4; i++) { const a = P[i], b = P[(i + 1) % 4]; area += a.x * b.y - b.x * a.y; }
  area = Math.abs(area) / 2;
  if (area < w * h * 0.12 || area > w * h * 0.985) return defaultCorners();
  return P.map((p) => ({ x: Math.min(1, Math.max(0, p.x / (w - 1))), y: Math.min(1, Math.max(0, p.y / (h - 1))) }));
}

/** Homografi dari persegi tujuan (0,0)-(ow,oh) ke segiempat sumber. */
function homography(ow: number, oh: number, q: Pt[]): number[] {
  const dst = [[0, 0], [ow, 0], [ow, oh], [0, oh]];
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const [u, v] = dst[i], { x, y } = q[i];
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x, x]);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y, y]);
  }
  for (let c = 0; c < 8; c++) {
    let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k];
    }
  }
  return A.map((r, i) => r[8] / r[i]);
}

/** Luruskan perspektif. corners dinormalkan (0..1). Sisi terpanjang hasil dibatasi maxSide. */
export function warp(src: HTMLCanvasElement, corners: Pt[], maxSide = 2000): HTMLCanvasElement {
  const q = corners.map((p) => ({ x: p.x * (src.width - 1), y: p.y * (src.height - 1) }));
  const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
  let ow = Math.max(dist(q[0], q[1]), dist(q[3], q[2])), oh = Math.max(dist(q[0], q[3]), dist(q[1], q[2]));
  const s = Math.min(1, maxSide / Math.max(ow, oh, 1));
  ow = Math.max(8, Math.round(ow * s)); oh = Math.max(8, Math.round(oh * s));
  const H = homography(ow, oh, q);
  const sw = src.width, sh = src.height;
  const sd = src.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, sw, sh).data;
  const out = mk(ow, oh), oc = out.getContext('2d')!, img = oc.createImageData(ow, oh), od = img.data;
  for (let v = 0; v < oh; v++) for (let u = 0; u < ow; u++) {
    const z = H[6] * u + H[7] * v + 1;
    let x = (H[0] * u + H[1] * v + H[2]) / z, y = (H[3] * u + H[4] * v + H[5]) / z;
    x = x < 0 ? 0 : x > sw - 1.001 ? sw - 1.001 : x; y = y < 0 ? 0 : y > sh - 1.001 ? sh - 1.001 : y;
    const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4, o = (v * ow + u) * 4;
    for (let k = 0; k < 3; k++) od[o + k] = sd[i00 + k] * (1 - fx) * (1 - fy) + sd[i10 + k] * fx * (1 - fy) + sd[i01 + k] * (1 - fx) * fy + sd[i11 + k] * fx * fy;
    od[o + 3] = 255;
  }
  oc.putImageData(img, 0, 0);
  return out;
}

/** Filter pemindaian (dalam tempat). */
export function applyFilter(c: HTMLCanvasElement, f: Filter): HTMLCanvasElement {
  if (f === 'orig') return c;
  const w = c.width, h = c.height, ctx = c.getContext('2d', { willReadFrequently: true })!;
  const img = ctx.getImageData(0, 0, w, h), d = img.data, n = w * h;
  const L = new Float32Array(n);
  for (let i = 0; i < n; i++) L[i] = d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114;
  if (f === 'gray') {
    for (let i = 0; i < n; i++) { const v = L[i]; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; }
  } else {
    // citra integral untuk rata-rata lokal (estimasi pencahayaan)
    const W = w + 1, I = new Float64Array(W * (h + 1));
    for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += L[y * w + x]; I[(y + 1) * W + x + 1] = I[y * W + x + 1] + row; } }
    const r = Math.max(8, Math.round(Math.max(w, h) / 24));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1), y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
      const m = (I[y1 * W + x1] - I[y0 * W + x1] - I[y1 * W + x0] + I[y0 * W + x0]) / ((x1 - x0) * (y1 - y0));
      const i = y * w + x, o = i * 4;
      if (f === 'bw') { const v = L[i] > m * 0.9 - 2 ? 255 : 0; d[o] = d[o + 1] = d[o + 2] = v; }
      else {
        const g = 238 / Math.max(m, 40);
        for (let k = 0; k < 3; k++) { let v = d[o + k] * g; v = v >= 255 ? 255 : v < 0 ? 0 : v; d[o + k] = 255 * Math.pow(v / 255, 1.5); }
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function rotate(c: HTMLCanvasElement, quarter: number): HTMLCanvasElement {
  const k = ((quarter % 4) + 4) % 4;
  if (!k) return c;
  const o = k % 2 ? mk(c.height, c.width) : mk(c.width, c.height), x = o.getContext('2d')!;
  x.translate(o.width / 2, o.height / 2); x.rotate((k * Math.PI) / 2); x.drawImage(c, -c.width / 2, -c.height / 2);
  return o;
}

const SIZES: Record<string, [number, number]> = { a4: [595.28, 841.89], letter: [612, 792] };

export async function buildPdf(pages: HTMLCanvasElement[], size: string, margin: number, onProgress?: (i: number) => void): Promise<Blob> {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pages.length; i++) {
    const c = pages[i];
    const blob: Blob = await new Promise((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error('Gagal membuat gambar.'))), 'image/jpeg', 0.88));
    const img = await pdf.embedJpg(new Uint8Array(await blob.arrayBuffer()));
    let pw: number, ph: number;
    if (size === 'fit') { pw = c.width * 0.75; ph = c.height * 0.75; }
    else { [pw, ph] = SIZES[size] ?? SIZES.a4; if (c.width > c.height) [pw, ph] = [ph, pw]; }
    const page = pdf.addPage([pw, ph]);
    const m = size === 'fit' ? 0 : margin, s = Math.min((pw - 2 * m) / c.width, (ph - 2 * m) / c.height);
    const dw = c.width * s, dh = c.height * s;
    page.drawImage(img, { x: (pw - dw) / 2, y: (ph - dh) / 2, width: dw, height: dh });
    onProgress?.(i + 1);
    await new Promise((r) => setTimeout(r));
  }
  return new Blob([await pdf.save()], { type: 'application/pdf' });
}
