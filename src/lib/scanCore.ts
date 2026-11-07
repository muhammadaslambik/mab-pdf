/* Inti pemrosesan pindaian: murni (tanpa DOM) agar bisa jalan di Web Worker. */
export type Pt = { x: number; y: number };
export type Filter = 'auto' | 'orig' | 'doc' | 'bw' | 'gray';
export interface Img { w: number; h: number; d: Uint8ClampedArray }

/** Perkecil dengan rata-rata kotak (kualitas baik, satu lintasan). */
export function downscale(img: Img, maxSide: number): Img {
  const s = Math.min(1, maxSide / Math.max(img.w, img.h));
  if (s >= 1) return img;
  const ow = Math.max(1, Math.round(img.w * s)), oh = Math.max(1, Math.round(img.h * s)), out = new Uint8ClampedArray(ow * oh * 4), d = img.d;
  for (let y = 0; y < oh; y++) {
    const y0 = Math.floor((y * img.h) / oh), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * img.h) / oh));
    for (let x = 0; x < ow; x++) {
      const x0 = Math.floor((x * img.w) / ow), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * img.w) / ow));
      let r = 0, g = 0, b = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const o = (yy * img.w + xx) * 4; r += d[o]; g += d[o + 1]; b += d[o + 2]; n++; }
      const o = (y * ow + x) * 4; out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255;
    }
  }
  return { w: ow, h: oh, d: out };
}

export const defaultCorners = (): Pt[] => [{ x: .06, y: .06 }, { x: .94, y: .06 }, { x: .94, y: .94 }, { x: .06, y: .94 }];

/** Deteksi dokumen: ambang Otsu, komponen terang terbesar, 4 titik ekstrem. Hasil 0..1 (TL, TR, BR, BL). */
export function detectCorners(img: Img): Pt[] {
  const t = downscale(img, 320), w = t.w, h = t.h, d = t.d, g = new Uint8Array(w * h);
  for (let i = 0; i < g.length; i++) g[i] = (d[i * 4] * 77 + d[i * 4 + 1] * 150 + d[i * 4 + 2] * 29) >> 8;
  const hist = new Array(256).fill(0); g.forEach((v) => hist[v]++);
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let wB = 0, sB = 0, best = 0, th = 128;
  for (let i = 0; i < 256; i++) {
    wB += hist[i]; if (!wB) continue;
    const wF = g.length - wB; if (!wF) break;
    sB += i * hist[i];
    const v = wB * wF * (sB / wB - (sum - sB) / wF) ** 2;
    if (v > best) { best = v; th = i; }
  }
  let mask: Uint8Array = new Uint8Array(w * h), on = 0;
  for (let i = 0; i < mask.length; i++) if (g[i] > th) { mask[i] = 1; on++; }
  if (on / mask.length > 0.7) mask = Uint8Array.from(mask, (v) => 1 - v);
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
  const P = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];
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

function homography(ow: number, oh: number, q: Pt[]): number[] {
  const dst = [[0, 0], [ow, 0], [ow, oh], [0, oh]], A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const [u, v] = dst[i], { x, y } = q[i];
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x, x]); A.push([0, 0, 0, u, v, 1, -u * y, -v * y, y]);
  }
  for (let c = 0; c < 8; c++) {
    let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < 8; r++) { if (r === c) continue; const f = A[r][c] / A[c][c]; for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k]; }
  }
  return A.map((r, i) => r[8] / r[i]);
}

/** Luruskan perspektif (sudut dinormalkan 0..1). Tepi dipangkas 1,5% agar sisa latar hilang. */
export function warpImg(src: Img, corners: Pt[], maxSide: number): Img {
  const cx = corners.reduce((a, p) => a + p.x, 0) / 4, cy = corners.reduce((a, p) => a + p.y, 0) / 4, k = 0.985;
  const sw = src.w, sh = src.h, sd = src.d;
  const q = corners.map((p) => ({ x: (cx + (p.x - cx) * k) * (sw - 1), y: (cy + (p.y - cy) * k) * (sh - 1) }));
  const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
  let ow = Math.max(dist(q[0], q[1]), dist(q[3], q[2])), oh = Math.max(dist(q[0], q[3]), dist(q[1], q[2]));
  const s = Math.min(1, maxSide / Math.max(ow, oh, 1));
  ow = Math.max(8, Math.round(ow * s)); oh = Math.max(8, Math.round(oh * s));
  const H = homography(ow, oh, q), od = new Uint8ClampedArray(ow * oh * 4), mx = sw - 1.001, my = sh - 1.001;
  for (let v = 0; v < oh; v++) {
    const a = H[1] * v + H[2], b = H[4] * v + H[5], c = H[7] * v + 1;
    for (let u = 0; u < ow; u++) {
      const z = H[6] * u + c;
      let x = (H[0] * u + a) / z, y = (H[3] * u + b) / z;
      x = x < 0 ? 0 : x > mx ? mx : x; y = y < 0 ? 0 : y > my ? my : y;
      const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i00 = (y0 * sw + x0) * 4, i01 = i00 + sw * 4, o = (v * ow + u) * 4;
      const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
      od[o] = sd[i00] * w00 + sd[i00 + 4] * w10 + sd[i01] * w01 + sd[i01 + 4] * w11;
      od[o + 1] = sd[i00 + 1] * w00 + sd[i00 + 5] * w10 + sd[i01 + 1] * w01 + sd[i01 + 5] * w11;
      od[o + 2] = sd[i00 + 2] * w00 + sd[i00 + 6] * w10 + sd[i01 + 2] * w01 + sd[i01 + 6] * w11;
      od[o + 3] = 255;
    }
  }
  return { w: ow, h: oh, d: od };
}

/** Peta pencahayaan latar: nilai terbesar per petak (tulisan hilang), diperlebar, dihaluskan; hasil: pengisi baris. */
function bgField(w: number, h: number, val: (i: number) => number) {
  const cell = Math.max(4, Math.round(Math.max(w, h) / 150)), gw = Math.ceil(w / cell), gh = Math.ceil(h / cell);
  let g = new Float32Array(gw * gh);
  for (let y = 0; y < h; y += 2) { const rc = ((y / cell) | 0) * gw; for (let x = 0; x < w; x += 2) { const v = val(y * w + x), c = rc + ((x / cell) | 0); if (v > g[c]) g[c] = v; } }
  const pass = (src: Float32Array, r: number, max: boolean) => {
    const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      let a = 0, n = 0;
      for (let k = Math.max(0, x - r); k <= Math.min(gw - 1, x + r); k++) { const v = src[y * gw + k]; a = max ? Math.max(a, v) : a + v; n++; }
      tmp[y * gw + x] = max ? a : a / n;
    }
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      let a = 0, n = 0;
      for (let k = Math.max(0, y - r); k <= Math.min(gh - 1, y + r); k++) { const v = tmp[k * gw + x]; a = max ? Math.max(a, v) : a + v; n++; }
      out[y * gw + x] = max ? a : a / n;
    }
    return out;
  };
  g = pass(g, 2, true); g = pass(g, 2, false); g = pass(g, 2, false);
  const X0 = new Int32Array(w), X1 = new Int32Array(w), TX = new Float32Array(w);
  for (let x = 0; x < w; x++) { const fx = Math.min(gw - 1, Math.max(0, (x + 0.5) / cell - 0.5)); X0[x] = fx | 0; X1[x] = Math.min(gw - 1, X0[x] + 1); TX[x] = fx - X0[x]; }
  return (y: number, out: Float32Array) => {
    const fy = Math.min(gh - 1, Math.max(0, (y + 0.5) / cell - 0.5)), y0 = fy | 0, y1 = Math.min(gh - 1, y0 + 1), ty = fy - y0, a = y0 * gw, b = y1 * gw;
    for (let x = 0; x < w; x++) { const t = TX[x]; out[x] = (g[a + X0[x]] * (1 - t) + g[a + X1[x]] * t) * (1 - ty) + (g[b + X0[x]] * (1 - t) + g[b + X1[x]] * t) * ty; }
  };
}

export function estimateSkew(pts: number[], w: number, h: number): number {
  if (pts.length < 800) return 0;
  const size = h + 2 * w + 4, bins = new Float32Array(size);
  const score = (a: number) => {
    bins.fill(0);
    const cs = Math.cos(a), sn = Math.sin(a);
    for (let i = 0; i < pts.length; i += 2) bins[Math.round(pts[i + 1] * cs - pts[i] * sn + w)]++;
    let t = 0; for (let i = 0; i < size; i++) t += bins[i] * bins[i];
    return t;
  };
  const rad = Math.PI / 180;
  let best = 0, bs = -1;
  for (let a = -5; a <= 5.001; a += 0.5) { const v = score(a * rad); if (v > bs) { bs = v; best = a; } }
  const c = best;
  for (let a = c - 0.5; a <= c + 0.501; a += 0.1) { const v = score(a * rad); if (v > bs) { bs = v; best = a; } }
  return -best;
}

export function rotateAngle(img: Img, deg: number): Img {
  const { w, h, d } = img, out = new Uint8ClampedArray(w * h * 4).fill(255), r = (deg * Math.PI) / 180, cs = Math.cos(r), sn = Math.sin(r), cx = w / 2, cy = h / 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = x - cx, dy = y - cy, sx = dx * cs + dy * sn + cx, sy = -dx * sn + dy * cs + cy, o = (y * w + x) * 4;
    if (sx < 0 || sy < 0 || sx > w - 1.001 || sy > h - 1.001) continue;
    const x0 = sx | 0, y0 = sy | 0, fx = sx - x0, fy = sy - y0, i = (y0 * w + x0) * 4, j = i + w * 4;
    for (let k = 0; k < 3; k++) out[o + k] = (d[i + k] * (1 - fx) + d[i + 4 + k] * fx) * (1 - fy) + (d[j + k] * (1 - fx) + d[j + 4 + k] * fx) * fy;
  }
  return { w, h, d: out };
}

export function rotateQuarter(img: Img, quarter: number): Img {
  const k = ((quarter % 4) + 4) % 4;
  if (!k) return img;
  const { w, h, d } = img, ow = k % 2 ? h : w, oh = k % 2 ? w : h, out = new Uint8ClampedArray(ow * oh * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [nx, ny] = k === 1 ? [h - 1 - y, x] : k === 2 ? [w - 1 - x, h - 1 - y] : [y, w - 1 - x];
    const s = (y * w + x) * 4, o = (ny * ow + nx) * 4; out[o] = d[s]; out[o + 1] = d[s + 1]; out[o + 2] = d[s + 2]; out[o + 3] = 255;
  }
  return { w: ow, h: oh, d: out };
}

const medianBg = (row: (y: number, o: Float32Array) => void, w: number, h: number) => {
  const buf = new Float32Array(w), s: number[] = [];
  for (let j = 1; j < 20; j++) { row(Math.min(h - 1, Math.floor((j * h) / 20)), buf); for (let k = 1; k < 20; k++) s.push(buf[Math.min(w - 1, Math.floor((k * w) / 20))]); }
  return s.sort((a, b) => a - b)[s.length >> 1];
};

function smart(img: Img): { img: Img; report: string } {
  const { w, h, d } = img, n = w * h, buf = new Float32Array(w);
  for (let ch = 0; ch < 3; ch++) {
    const row = bgField(w, h, (i) => d[i * 4 + ch]);
    for (let y = 0; y < h; y++) { row(y, buf); for (let x = 0; x < w; x++) { const o = (y * w + x) * 4 + ch; d[o] = Math.min(255, (d[o] * 250) / Math.max(buf[x], 40)); } }
  }
  const hist = new Uint32Array(256); let cnt = 0, colored = 0, dark = 0;
  for (let i = 0; i < n; i += 5) {
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2], l = (r * 0.299 + g * 0.587 + b * 0.114) | 0;
    hist[l]++; cnt++; if (l < 140) dark++;
    if (Math.max(r, g, b) - Math.min(r, g, b) > 55 && l < 215) colored++;
  }
  const pct = (q: number) => { let a = 0; for (let i = 0; i < 256; i++) { a += hist[i]; if (a >= q * cnt) return i; } return 255; };
  const p50 = pct(0.5), lo = Math.min(pct(0.005), 90), photo = dark / cnt > 0.3 || p50 < 150, hasColor = colored / cnt > 0.004;
  const hi = photo ? 255 : Math.max(lo + 40, p50 * 0.94);
  const map = (v: number) => { let t = (v - lo) / (hi - lo); t = t < 0 ? 0 : t > 1 ? 1 : t; if (!photo) t = t * t * (3 - 2 * t); return 255 * t; };
  for (let i = 0; i < n; i++) {
    const o = i * 4; let r = map(d[o]), g = map(d[o + 1]), b = map(d[o + 2]);
    if (!hasColor && !photo) r = g = b = r * 0.299 + g * 0.587 + b * 0.114;
    d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
  }
  let angle = 0;
  if (!photo) {
    const t = downscale(img, 600), pts: number[] = [], mx = t.w * 0.03, my = t.h * 0.03;
    for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) if (x > mx && x < t.w - mx && y > my && y < t.h - my && t.d[(y * t.w + x) * 4 + 1] < 110) pts.push(x, y);
    angle = estimateSkew(pts, t.w, t.h);
  }
  const turn = Math.abs(angle) >= 0.3;
  const report = [photo ? 'Halaman bergambar: pencahayaan diratakan' : 'Dokumen teks: kertas diputihkan', hasColor ? 'warna cap/tinta dipertahankan' : 'tinta dibuat netral', turn ? `teks diluruskan ${Math.abs(angle).toFixed(1)}°` : 'teks sudah lurus'].join(' · ');
  return { img: turn ? rotateAngle(img, angle) : img, report };
}

/** Terapkan filter pada hasil warp (mengubah piksel di tempat; bisa mengembalikan citra baru bila diluruskan). */
export function filterImg(img: Img, f: Filter, ink = 0.76): { img: Img; report: string } {
  if (f === 'orig') return { img, report: '' };
  if (f === 'auto') return smart(img);
  const { w, h, d } = img, n = w * h;
  if (f === 'gray') {
    for (let i = 0; i < n; i++) { const o = i * 4, v = d[o] * 0.299 + d[o + 1] * 0.587 + d[o + 2] * 0.114; d[o] = d[o + 1] = d[o + 2] = v; }
  } else if (f === 'bw') {
    const L = new Float32Array(n), T = new Float32Array(n);
    for (let i = 0; i < n; i++) L[i] = d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; T[i] = (L[x > 0 ? i - 1 : i] + L[i] + L[x < w - 1 ? i + 1 : i]) / 3; }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; L[i] = (T[y > 0 ? i - w : i] + T[i] + T[y < h - 1 ? i + w : i]) / 3; }
    const row = bgField(w, h, (i) => L[i]), floor = Math.max(60, medianBg(row, w, h) * 0.6), buf = new Float32Array(w);
    for (let y = 0; y < h; y++) {
      row(y, buf);
      for (let x = 0; x < w; x++) { const i = y * w + x, o = i * 4, v = buf[x] > floor && L[i] < buf[x] * ink ? 0 : 255; d[o] = d[o + 1] = d[o + 2] = v; }
    }
  } else {
    const buf = new Float32Array(w);
    for (let ch = 0; ch < 3; ch++) {
      const row = bgField(w, h, (i) => d[i * 4 + ch]);
      for (let y = 0; y < h; y++) { row(y, buf); for (let x = 0; x < w; x++) { const o = (y * w + x) * 4 + ch, v = Math.min(255, (d[o] * 240) / Math.max(buf[x], 40)); d[o] = 255 * Math.pow(v / 255, 1.5); } }
    }
  }
  return { img, report: '' };
}

/** Mesin: menyimpan sumber per halaman (penuh + salinan pratinjau) dan melayani perintah. */
export function createEngine() {
  const store = new Map<number, { full: Img; prev: Img }>();
  return {
    init(id: number, w: number, h: number, buf: ArrayBuffer) {
      const full = { w, h, d: new Uint8ClampedArray(buf) };
      store.set(id, { full, prev: downscale(full, 1000) });
      return true;
    },
    detect(id: number) { return detectCorners(store.get(id)!.prev); },
    render(id: number, q: Pt[], filter: Filter, ink: number, rot: number, maxSide: number, preview: boolean) {
      const s = store.get(id)!, r = filterImg(warpImg(preview ? s.prev : s.full, q, maxSide), filter, ink), out = rotateQuarter(r.img, rot);
      return { w: out.w, h: out.h, buf: out.d.buffer, report: r.report };
    },
    free(id: number) { store.delete(id); return true; }
  };
}
