import { diffWords, type Seg } from './diff';
import { extractDoc } from './pdfText';
import { openPdfJs, releaseCanvas, renderPage, canvasToBlob } from './pdf';
import { blocksToPdf, type Block, type Run } from './layout';
import { tick } from './util';

export interface TextCompare { segs: Seg[]; added: number; removed: number; same: number; pagesA: number; pagesB: number }

const words = (s: string) => s.split(/\s+/).filter(Boolean);

export async function compareText(a: File, b: File, progress: (p: number, l: string) => void, check: () => void): Promise<TextCompare> {
  const textOf = async (f: File, from: number, to: number) => {
    const d = await extractDoc(f, (p, l) => progress(from + (p / 100) * (to - from), l), check);
    return { text: d.pages.map((p) => p.paras.map((x) => x.text).join(' ')).join(' '), n: d.pages.length, has: d.hasText };
  };
  const A = await textOf(a, 0, 40), B = await textOf(b, 40, 80);
  if (!A.has || !B.has) throw new Error('Salah satu PDF tidak berisi teks (mungkin hasil scan). Gunakan mode Visual, atau jalankan OCR dulu.');
  progress(85, 'Menghitung perbedaan');
  await tick();
  const segs = diffWords(words(A.text), words(B.text));
  let added = 0, removed = 0, same = 0;
  for (const s of segs) { if (s.op === 'ins') added += s.tokens.length; else if (s.op === 'del') removed += s.tokens.length; else same += s.tokens.length; }
  return { segs, added, removed, same, pagesA: A.n, pagesB: B.n };
}

const GREEN: [number, number, number] = [0.05, 0.5, 0.2], RED: [number, number, number] = [0.75, 0.1, 0.1], GRAY: [number, number, number] = [0.4, 0.4, 0.4];

export async function textReportPdf(c: TextCompare, nameA: string, nameB: string) {
  const ctxWords = 14;
  const blocks: Block[] = [
    { type: 'p', heading: 1, runs: [{ text: 'Laporan Perbandingan PDF' }] },
    { type: 'p', runs: [{ text: 'Dokumen A (asli): ', bold: true }, { text: nameA }] },
    { type: 'p', runs: [{ text: 'Dokumen B (revisi): ', bold: true }, { text: nameB }] },
    { type: 'p', runs: [{ text: `Ditambahkan: ${c.added} kata   `, color: GREEN, bold: true }, { text: `Dihapus: ${c.removed} kata   `, color: RED, bold: true }, { text: `Sama: ${c.same} kata`, color: GRAY }] },
    { type: 'p', runs: [{ text: 'Hijau bergaris bawah = ditambahkan di B.  Merah dicoret = dihapus dari A.', color: GRAY, size: 9 }] },
    { type: 'hr' }
  ];
  if (!c.added && !c.removed) blocks.push({ type: 'p', runs: [{ text: 'Tidak ada perbedaan teks antara kedua dokumen.' }] });
  let runs: Run[] = [];
  const flush = () => { if (runs.length) blocks.push({ type: 'p', runs, after: 8 }); runs = []; };
  c.segs.forEach((s, i) => {
    const t = s.tokens.join(' ');
    if (s.op === 'eq') {
      const w = s.tokens;
      const first = i === 0, last = i === c.segs.length - 1;
      if (w.length > ctxWords * 2 + 4) {
        if (!first) runs.push({ text: ' ' + w.slice(0, ctxWords).join(' ') + ' ', color: GRAY });
        flush();
        if (!last) runs.push({ text: '… ' + w.slice(-ctxWords).join(' ') + ' ', color: GRAY });
      } else runs.push({ text: ' ' + t + ' ', color: GRAY });
    } else if (s.op === 'ins') runs.push({ text: ' ' + t + ' ', color: GREEN, underline: true, bold: true });
    else runs.push({ text: ' ' + t + ' ', color: RED, strike: true });
  });
  flush();
  return blocksToPdf(blocks, { title: 'Laporan perbandingan', footerNumbers: true });
}

export interface VisualPage { page: number; percent: number; url: string; blob: Blob; w: number; h: number }

export async function compareVisual(a: File, b: File, progress: (p: number, l: string) => void, check: () => void): Promise<VisualPage[]> {
  const da = await openPdfJs(a), db = await openPdfJs(b);
  const n = Math.max(da.numPages, db.numPages);
  const out: VisualPage[] = [];
  for (let i = 1; i <= n; i++) {
    check(); progress(((i - 1) / n) * 100, `Membandingkan halaman ${i}/${n}`);
    const pa = i <= da.numPages ? await da.getPage(i) : null, pb = i <= db.numPages ? await db.getPage(i) : null;
    const ca = pa ? await renderPage(pa, 1.3, 2_500_000) : null;
    const W = ca?.width ?? 600, H = ca?.height ?? 800;
    const cb = document.createElement('canvas'); cb.width = W; cb.height = H;
    const gb = cb.getContext('2d')!; gb.fillStyle = '#fff'; gb.fillRect(0, 0, W, H);
    if (pb) { const t = await renderPage(pb, 1.3, 2_500_000); gb.drawImage(t, 0, 0, W, H); releaseCanvas(t); }
    const base = ca ?? (() => { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); return c; })();
    const ga = base.getContext('2d')!;
    const A = ga.getImageData(0, 0, W, H), B = gb.getImageData(0, 0, W, H);
    let diff = 0;
    const o = ga.createImageData(W, H);
    for (let p = 0; p < A.data.length; p += 4) {
      const d = Math.max(Math.abs(A.data[p] - B.data[p]), Math.abs(A.data[p + 1] - B.data[p + 1]), Math.abs(A.data[p + 2] - B.data[p + 2]));
      if (d > 48) { o.data[p] = 230; o.data[p + 1] = 30; o.data[p + 2] = 60; o.data[p + 3] = 255; diff++; }
      else { const g = 255 - (255 - (A.data[p] + A.data[p + 1] + A.data[p + 2]) / 3) * 0.35; o.data[p] = o.data[p + 1] = o.data[p + 2] = g; o.data[p + 3] = 255; }
    }
    ga.putImageData(o, 0, 0);
    const blob = await canvasToBlob(base, 'image/jpeg', 0.82);
    out.push({ page: i, percent: (diff / (W * H)) * 100, url: URL.createObjectURL(blob), blob, w: W, h: H });
    releaseCanvas(cb); releaseCanvas(base);
    pa?.cleanup(); pb?.cleanup(); await tick();
  }
  await da.destroy(); await db.destroy();
  return out;
}
