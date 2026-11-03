import { PDFDocument } from 'pdf-lib';
import type { RunFn } from '../types';
import { canvasToBlob, loadPdf, openPdfJs, releaseCanvas, renderPage } from '../../lib/pdf';
import { baseName, pdfResult, tick } from '../../lib/util';

/** Render semua halaman menjadi PDF berisi gambar (dipakai sebagai cadangan). */
async function rasterize(file: File, password: string | undefined, scale: number, ctx: Parameters<RunFn>[2], label: string) {
  const doc = await openPdfJs(file, password);
  const out = await PDFDocument.create();
  for (let n = 1; n <= doc.numPages; n++) {
    ctx.check(); ctx.progress(((n - 1) / doc.numPages) * 95, `${label} ${n}/${doc.numPages}`);
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const canvas = await renderPage(page, scale);
    const img = await out.embedJpg(new Uint8Array(await (await canvasToBlob(canvas, 'image/jpeg', 0.9)).arrayBuffer()));
    out.addPage([base.width, base.height]).drawImage(img, { x: 0, y: 0, width: base.width, height: base.height });
    releaseCanvas(canvas); page.cleanup(); await tick();
  }
  await doc.destroy();
  out.setProducer('MAB-PDF');
  return out.save();
}

/* ---------- Proteksi ---------- */
export const protect: RunFn = async ([file], o) => {
  const user = String(o.user ?? ''), owner = String(o.owner ?? '');
  if (!user) throw new Error('Isi password untuk membuka dokumen.');
  if (/[^\u0000-\u00ff]/.test(user + owner)) throw new Error('Gunakan huruf, angka, dan simbol biasa pada password (karakter khusus non-Latin belum didukung).');
  const { encryptPdf } = await import('../../lib/pdfCrypt');
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    const out = await encryptPdf(bytes, user, owner, { print: o.print !== 'no', copy: o.copy !== 'no', modify: o.modify !== 'no' });
    return pdfResult(out, `${baseName(file.name)}-terkunci.pdf`, 'Dienkripsi AES-128. Simpan password dengan baik: PDF yang lupa passwordnya tidak bisa dipulihkan.');
  } catch (e: any) {
    if (/encrypt/i.test(e?.message ?? '')) throw new Error('File ini sudah terkunci password. Buka kuncinya dulu dengan alat "Buka PDF terkunci".');
    throw new Error(`"${file.name}" tidak bisa diproses (rusak?). Coba alat Perbaiki PDF dulu.`);
  }
};

/* ---------- Buka kunci ---------- */
export const unlock: RunFn = async ([file], o, ctx) => {
  const pw = String(o.password ?? '');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { qpdfAvailable, runQpdf } = await import('../../lib/qpdf');
  if (await qpdfAvailable()) {
    ctx.progress(30, 'Membuka kunci');
    const out = await runQpdf([`--password=${pw}`, '--decrypt'], bytes);
    return pdfResult(out, `${baseName(file.name)}-terbuka.pdf`, 'Password dihapus dan isi dokumen tetap utuh (teks masih bisa diseleksi).');
  }
  const out = await rasterize(file, pw, 2.2, ctx, 'Halaman');
  return pdfResult(out, `${baseName(file.name)}-terbuka.pdf`, 'Mode cadangan: setiap halaman dijadikan gambar, jadi teks tidak bisa diseleksi lagi (jalankan OCR bila perlu). Pasang engine qpdf (npm install) untuk hasil yang utuh.');
};

/* ---------- Perbaiki ---------- */
export const repair: RunFn = async ([file], _o, ctx) => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { qpdfAvailable, runQpdf } = await import('../../lib/qpdf');
  if (await qpdfAvailable()) {
    try {
      ctx.progress(30, 'Membangun ulang struktur');
      return pdfResult(await runQpdf([], bytes), `${baseName(file.name)}-diperbaiki.pdf`, 'Struktur PDF dibangun ulang dengan qpdf.');
    } catch { /* lanjut ke cara lain */ }
  }
  ctx.progress(30, 'Membangun ulang struktur');
  try {
    const src = await PDFDocument.load(bytes, { throwOnInvalidObject: false, updateMetadata: false });
    const out = await PDFDocument.create();
    const idx = src.getPageIndices();
    if (!idx.length) throw new Error('kosong');
    (await out.copyPages(src, idx)).forEach((p) => out.addPage(p));
    out.setProducer('MAB-PDF');
    return pdfResult(await out.save(), `${baseName(file.name)}-diperbaiki.pdf`, 'Halaman disalin ke dokumen baru yang bersih. Formulir, bookmark, dan lampiran tidak ikut dibawa.');
  } catch { /* cadangan terakhir */ }
  try {
    const out = await rasterize(file, undefined, 2, ctx, 'Pemulihan halaman');
    return pdfResult(out, `${baseName(file.name)}-diperbaiki.pdf`, 'Mode darurat: halaman dibaca lewat mesin pemulih pdf.js lalu dijadikan gambar. Teks tidak bisa diseleksi.');
  } catch {
    throw new Error('File ini rusak terlalu parah untuk diperbaiki di browser.');
  }
};

/* ---------- PDF/A (versi gambar) ---------- */
function srgbIcc(): Uint8Array {
  const fix = (v: number) => Math.round(v * 65536) | 0;
  const tags: { sig: string; data: Uint8Array }[] = [];
  const u32 = (v: number) => Uint8Array.from([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]);
  const ascii = (s: string) => Uint8Array.from([...s].map((c) => c.charCodeAt(0)));
  const cat = (...a: Uint8Array[]) => { const o = new Uint8Array(a.reduce((s, x) => s + x.length, 0)); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; };
  const xyz = (x: number, y: number, z: number) => cat(ascii('XYZ '), u32(0), u32(fix(x)), u32(fix(y)), u32(fix(z)));
  const text = (s: string) => cat(ascii('text'), u32(0), ascii(s), Uint8Array.of(0));
  const desc = (s: string) => cat(ascii('desc'), u32(0), u32(s.length + 1), ascii(s), Uint8Array.of(0), u32(0), u32(0), new Uint8Array(2), Uint8Array.of(0), new Uint8Array(67));
  const curve = new Uint8Array(8 + 4 + 2048);
  curve.set(ascii('curv')); curve.set(u32(1024), 8);
  for (let i = 0; i < 1024; i++) { const x = i / 1023; const l = x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); const v = Math.round(l * 65535); curve[12 + i * 2] = v >> 8; curve[13 + i * 2] = v & 255; }
  tags.push({ sig: 'desc', data: desc('sRGB IEC61966-2.1') }, { sig: 'cprt', data: text('Public Domain') }, { sig: 'wtpt', data: xyz(0.9642, 1.0, 0.8249) },
    { sig: 'rXYZ', data: xyz(0.43607, 0.22249, 0.01392) }, { sig: 'gXYZ', data: xyz(0.38515, 0.71687, 0.09708) }, { sig: 'bXYZ', data: xyz(0.14307, 0.06061, 0.7141) },
    { sig: 'rTRC', data: curve }, { sig: 'gTRC', data: curve }, { sig: 'bTRC', data: curve });
  const tableLen = 4 + tags.length * 12;
  let off = 128 + tableLen;
  const table: Uint8Array[] = [u32(tags.length)];
  const body: Uint8Array[] = [];
  const seen = new Map<Uint8Array, number>();
  for (const t of tags) {
    let o = seen.get(t.data);
    if (o === undefined) { o = off; seen.set(t.data, o); const padded = cat(t.data, new Uint8Array((4 - (t.data.length % 4)) % 4)); body.push(padded); off += padded.length; }
    table.push(cat(ascii(t.sig), u32(o), u32(t.data.length)));
  }
  const header = new Uint8Array(128);
  const total = off;
  header.set(u32(total), 0); header.set(u32(0x02100000), 8);
  header.set(ascii('mntr'), 12); header.set(ascii('RGB '), 16); header.set(ascii('XYZ '), 20);
  header.set([0x07, 0xd0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0], 24); // 2000-01-01
  header.set(ascii('acsp'), 36); header.set(ascii('MSFT'), 40);
  header.set(u32(fix(0.9642)), 68); header.set(u32(fix(1.0)), 72); header.set(u32(fix(0.8249)), 76);
  return cat(header, ...table, ...body);
}

export const toPdfA: RunFn = async ([file], o, ctx) => {
  const { PDFHexString, PDFName, PDFString } = await import('pdf-lib');
  const part = o.part === '1' ? 1 : 2;
  const scale = o.quality === 'high' ? 3 : 2.2;
  const raster = await rasterize(file, undefined, scale, ctx, 'Halaman');
  ctx.progress(96, 'Menambahkan metadata PDF/A');
  const pdf = await PDFDocument.load(raster);
  const ctxp = pdf.context;
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  const title = baseName(file.name);
  pdf.setTitle(title); pdf.setProducer('MAB-PDF'); pdf.setCreator('MAB-PDF');
  pdf.setCreationDate(now); pdf.setModificationDate(now);
  const iso = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const xmp = `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/" pdfaid:part="${part}" pdfaid:conformance="B"/>
<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title><rdf:Alt><rdf:li xml:lang="x-default">${esc(title)}</rdf:li></rdf:Alt></dc:title></rdf:Description>
<rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/" pdf:Producer="MAB-PDF"/>
<rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmp:CreatorTool="MAB-PDF" xmp:CreateDate="${iso}" xmp:ModifyDate="${iso}"/>
</rdf:RDF></x:xmpmeta>
<?xpacket end="w"?>`;
  const meta = ctxp.stream(new TextEncoder().encode(xmp), { Type: 'Metadata', Subtype: 'XML' });
  const metaRef = ctxp.register(meta);
  const icc = ctxp.flateStream(srgbIcc(), { N: 3 });
  const iccRef = ctxp.register(icc);
  const oi = ctxp.obj({
    Type: 'OutputIntent', S: 'GTS_PDFA1',
    OutputConditionIdentifier: PDFString.of('sRGB IEC61966-2.1'), Info: PDFString.of('sRGB IEC61966-2.1'),
    RegistryName: PDFString.of('http://www.color.org'), DestOutputProfile: iccRef
  });
  pdf.catalog.set(PDFName.of('Metadata'), metaRef);
  pdf.catalog.set(PDFName.of('OutputIntents'), ctxp.obj([oi]));
  const id = crypto.getRandomValues(new Uint8Array(16));
  const hex = Array.from(id, (b) => b.toString(16).padStart(2, '0')).join('');
  ctxp.trailerInfo.ID = ctxp.obj([PDFHexString.of(hex), PDFHexString.of(hex)]);
  const bytes = await pdf.save({ useObjectStreams: false, updateFieldAppearances: false });
  return pdfResult(bytes, `${baseName(file.name)}-pdfa.pdf`, `PDF/A-${part}b versi gambar: halaman dirender menjadi gambar, ditambah metadata XMP, profil warna sRGB, dan OutputIntent. Teks tidak bisa diseleksi. Hasil belum divalidasi dengan veraPDF; bila untuk keperluan resmi, validasi dulu.`);
};

/* ---------- OCR ---------- */
export const ocr: RunFn = async ([file], o, ctx) => {
  const { createWorker } = await import('tesseract.js');
  const { StandardFonts, rgb } = await import('pdf-lib');
  const lang = String(o.lang || 'ind+eng');
  const pdf = await loadPdf(file);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const doc = await openPdfJs(file);
  ctx.progress(2, 'Memuat mesin OCR (unduhan pertama bisa agak lama)');
  let current = 0, total = doc.numPages;
  const worker = await createWorker(lang, 1, {
    logger: (m: any) => {
      if (m.status === 'recognizing text') ctx.progress(((current - 1 + m.progress) / total) * 95, `OCR halaman ${current}/${total}`);
      else if (/loading|initializ/i.test(m.status)) ctx.progress(2, 'Menyiapkan data bahasa');
    }
  });
  let words = 0, skipped = 0;
  try {
    const pages = pdf.getPages();
    for (let n = 1; n <= total; n++) {
      ctx.check(); current = n;
      const page = await doc.getPage(n);
      const vp = page.getViewport({ scale: 1 });
      const canvas = await renderPage(page, 2.8, 10_000_000);
      const k = vp.width / canvas.width;
      const { data } = await worker.recognize(canvas);
      releaseCanvas(canvas); page.cleanup();
      const target = pages[n - 1];
      if (target.getRotation().angle !== 0) { skipped++; continue; }
      const H = target.getHeight();
      for (const w of (data as any).words ?? []) {
        const text = String(w.text ?? '').replace(/[^\u0020-\u007e\u00a0-\u00ff]/g, '');
        if (!text.trim() || (w.confidence ?? 100) < 30) continue;
        const wpt = (w.bbox.x1 - w.bbox.x0) * k, hpt = (w.bbox.y1 - w.bbox.y0) * k;
        const unit = font.widthOfTextAtSize(text, 1) || 1;
        const size = Math.max(3, Math.min(hpt * 0.95, wpt / unit));
        target.drawText(text, { x: w.bbox.x0 * k, y: H - w.bbox.y1 * k + hpt * 0.2, size, font, color: rgb(0, 0, 0), opacity: 0 });
        words++;
      }
      await tick();
    }
  } finally { await worker.terminate(); await doc.destroy(); }
  pdf.setProducer('MAB-PDF');
  if (!words) throw new Error('Tidak ada teks yang terdeteksi. Pastikan bahasa yang dipilih sesuai dan gambar cukup jelas.');
  return pdfResult(await pdf.save(), `${baseName(file.name)}-ocr.pdf`,
    `${words} kata dikenali dan ditambahkan sebagai lapisan teks tak terlihat, sehingga PDF bisa dicari dan diseleksi.` +
    (skipped ? ` ${skipped} halaman terotasi dilewati.` : '') + ' Catatan: data bahasa OCR diunduh dari internet saat pertama dipakai (bukan isi file Anda).');
};
