/**
 * Enkripsi PDF standar (Standard Security Handler, V4/R4, AES-128) sepenuhnya di browser.
 * Diterapkan pada PDF hasil pdf-lib: semua string dan stream dienkripsi per objek.
 */
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFObject, PDFRawStream, PDFStream, PDFString } from 'pdf-lib';

/* ---- MD5 ---- */
const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0);
export function md5(data: Uint8Array): Uint8Array {
  const len = data.length;
  const padLen = ((len + 8) >> 6 << 6) + 64;
  const m = new Uint8Array(padLen);
  m.set(data); m[len] = 0x80;
  const dv = new DataView(m.buffer);
  dv.setUint32(padLen - 8, (len << 3) >>> 0, true);
  dv.setUint32(padLen - 4, Math.floor(len / 536870912), true);
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (let off = 0; off < padLen; off += 64) {
    const M = Array.from({ length: 16 }, (_, i) => dv.getUint32(off + i * 4, true));
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F: number, g: number;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      F = (F + A + K[i] + M[g]) >>> 0;
      A = D; D = C; C = B;
      B = (B + ((F << S[i]) | (F >>> (32 - S[i])))) >>> 0;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }
  const out = new Uint8Array(16);
  const ov = new DataView(out.buffer);
  [a0, b0, c0, d0].forEach((v, i) => ov.setUint32(i * 4, v, true));
  return out;
}

/* ---- RC4 ---- */
function rc4(key: Uint8Array, data: Uint8Array): Uint8Array {
  const s = new Uint8Array(256).map((_, i) => i);
  let j = 0;
  for (let i = 0; i < 256; i++) { j = (j + s[i] + key[i % key.length]) & 255; [s[i], s[j]] = [s[j], s[i]]; }
  const out = new Uint8Array(data.length);
  let a = 0, b = 0;
  for (let k = 0; k < data.length; k++) {
    a = (a + 1) & 255; b = (b + s[a]) & 255; [s[a], s[b]] = [s[b], s[a]];
    out[k] = data[k] ^ s[(s[a] + s[b]) & 255];
  }
  return out;
}

const PAD = Uint8Array.from([0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08, 0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a]);
const cat = (...a: Uint8Array[]) => { const o = new Uint8Array(a.reduce((s, x) => s + x.length, 0)); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; };
const padPw = (pw: string) => {
  const b = Uint8Array.from([...pw].map((c) => (c.charCodeAt(0) < 256 ? c.charCodeAt(0) : 63))).slice(0, 32);
  return cat(b, PAD.slice(0, 32 - b.length));
};
const hexOf = (u: Uint8Array) => Array.from(u, (b) => b.toString(16).padStart(2, '0')).join('');

export interface Perms { print: boolean; copy: boolean; modify: boolean }

/** Nilai /P: bit 3 cetak, 4 ubah, 5 salin, 6 anotasi/isi form, 9 isi form, 10 aksesibilitas, 11 susun ulang, 12 cetak kualitas tinggi. */
export function permBits(p: Perms): number {
  let v = 0xfffff0c0 | 0x200;
  if (p.print) v |= 0x4 | 0x800;
  if (p.modify) v |= 0x8 | 0x20 | 0x100 | 0x400;
  if (p.copy) v |= 0x10;
  return v | 0;
}

async function aesCbc(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const k = await crypto.subtle.importKey('raw', key as BufferSource, { name: 'AES-CBC' }, false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, k, data as BufferSource));
  return cat(iv, ct);
}

export async function encryptPdf(bytes: Uint8Array, userPw: string, ownerPw: string, perms: Perms): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(bytes);
  const ctx = pdf.context;

  const id = crypto.getRandomValues(new Uint8Array(16));
  ctx.trailerInfo.ID = ctx.obj([PDFHexString.of(hexOf(id)), PDFHexString.of(hexOf(id))]);

  // Algoritma 3: nilai /O
  let h = md5(padPw(ownerPw || userPw));
  for (let i = 0; i < 50; i++) h = md5(h);
  const ok = h.slice(0, 16);
  let O = rc4(ok, padPw(userPw));
  for (let i = 1; i <= 19; i++) O = rc4(ok.map((b) => b ^ i), O);

  // Algoritma 2: kunci berkas
  const P = permBits(perms);
  const pb = new Uint8Array(4); new DataView(pb.buffer).setInt32(0, P, true);
  let fk = md5(cat(padPw(userPw), O, pb, id));
  for (let i = 0; i < 50; i++) fk = md5(fk.slice(0, 16));
  const fileKey = fk.slice(0, 16);

  // Algoritma 5: nilai /U
  let U = rc4(fileKey, md5(cat(PAD, id)));
  for (let i = 1; i <= 19; i++) U = rc4(fileKey.map((b) => b ^ i), U);
  U = cat(U, new Uint8Array(16));

  const objKey = (num: number, gen: number) =>
    md5(cat(fileKey, Uint8Array.from([num & 255, (num >> 8) & 255, (num >> 16) & 255, gen & 255, (gen >> 8) & 255]), new TextEncoder().encode('sAlT'))).slice(0, 16);

  const encStr = async (s: PDFString | PDFHexString, key: Uint8Array) => PDFHexString.of(hexOf(await aesCbc(key, s.asBytes())));
  const walk = async (o: PDFObject, key: Uint8Array): Promise<void> => {
    if (o instanceof PDFDict) {
      for (const [k, v] of o.entries()) {
        if (v instanceof PDFString || v instanceof PDFHexString) o.set(k, await encStr(v, key));
        else await walk(v, key);
      }
    } else if (o instanceof PDFArray) {
      for (let i = 0; i < o.size(); i++) {
        const v = o.get(i);
        if (v instanceof PDFString || v instanceof PDFHexString) o.set(i, await encStr(v, key));
        else await walk(v, key);
      }
    }
  };

  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    const key = objKey(ref.objectNumber, ref.generationNumber);
    if (obj instanceof PDFStream) {
      if (obj.dict.get(PDFName.of('Type')) === PDFName.of('XRef')) continue;
      await walk(obj.dict, key);
      const enc = await aesCbc(key, obj.getContents());
      ctx.assign(ref, PDFRawStream.of(obj.dict, enc));
    } else await walk(obj, key);
  }

  ctx.trailerInfo.Encrypt = ctx.obj({
    Filter: 'Standard', V: 4, R: 4, Length: 128, P: PDFNumber.of(P),
    O: PDFHexString.of(hexOf(O)), U: PDFHexString.of(hexOf(U)),
    CF: { StdCF: { AuthEvent: 'DocOpen', CFM: 'AESV2', Length: 16 } }, StmF: 'StdCF', StrF: 'StdCF'
  });
  return pdf.save({ useObjectStreams: false, updateFieldAppearances: false });
}
