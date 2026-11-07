import pako from 'pako';
const te = new TextEncoder(), td = new TextDecoder();
export const strToU8 = (s) => te.encode(s);
export const strFromU8 = (u) => td.decode(u);
const T = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (u) => { let c = ~0; for (let i = 0; i < u.length; i++) c = T[(c ^ u[i]) & 255] ^ (c >>> 8); return ~c >>> 0; };
export function zipSync(map) {
  const parts = [], cen = []; let off = 0;
  for (const [name, data] of Object.entries(map)) {
    const nb = te.encode(name), c = crc(data);
    const lh = new DataView(new ArrayBuffer(30)); lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true);
    lh.setUint32(14, c, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nb.length, true);
    parts.push(new Uint8Array(lh.buffer), nb, data);
    const ch = new DataView(new ArrayBuffer(46)); ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
    ch.setUint32(16, c, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, nb.length, true); ch.setUint32(42, off, true);
    cen.push(new Uint8Array(ch.buffer), nb);
    off += 30 + nb.length + data.length;
  }
  const cl = cen.reduce((s, p) => s + p.length, 0);
  const e = new DataView(new ArrayBuffer(22)); e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, Object.keys(map).length, true); e.setUint16(10, Object.keys(map).length, true); e.setUint32(12, cl, true); e.setUint32(16, off, true);
  const all = [...parts, ...cen, new Uint8Array(e.buffer)]; const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0)); let o = 0;
  for (const p of all) { out.set(p, o); o += p.length; } return out;
}
export function unzipSync(u) {
  const dv = new DataView(u.buffer, u.byteOffset, u.byteLength); let e = u.length - 22;
  while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const out = {};
  for (let i = 0; i < n; i++) {
    const m = dv.getUint16(p + 10, true), cs = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    const name = td.decode(u.subarray(p + 46, p + 46 + nl));
    const ls = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true);
    const raw = u.subarray(ls, ls + cs); out[name] = m === 0 ? raw.slice() : pako.inflateRaw(raw);
    p += 46 + nl + xl + cl;
  }
  return out;
}
