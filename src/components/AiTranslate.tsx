import { useRef, useState } from 'react';
import type { CustomProps } from '../tools/types';
import { NO_TEXT, extractDoc } from '../lib/pdfText';
import { LANGS, LATIN, chromeDetect, chromeTranslator, chunkText, defaultTier, hasChromeTranslator, hasWebGPU, llm, loadWebLLM, TIERS, type Tier } from '../lib/ai';
import { LANG_NAMES, detectLang, protect } from '../lib/nlp';
import { blocksToPdf, type Block, type Cell } from '../lib/layout';
import { baseName } from '../lib/util';

type Para = { text: string; tr: string; kind: string; pageBreak: boolean };

export default function AiTranslate({ files, onDone, onError }: CustomProps) {
  const file = files[0];
  const [source, setSource] = useState('auto');
  const [target, setTarget] = useState('en');
  const [engine, setEngine] = useState<'auto' | 'chrome' | 'webllm'>('auto');
  const [tier, setTier] = useState<Tier>(defaultTier());
  const [layout, setLayout] = useState<'single' | 'dual'>('single');
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState({ p: 0, l: '' });
  const [preview, setPreview] = useState<{ a: string; b: string } | null>(null);
  const [detected, setDetected] = useState('');
  const stop = useRef(false);

  const run = async () => {
    stop.current = false; setBusy(true); setPreview(null); setDetected('');
    const P = (p: number, l: string) => setProg({ p: Math.round(p * 100), l });
    try {
      const d = await extractDoc(file, (p, l) => P((p / 100) * 0.15, l), () => { if (stop.current) throw new Error('Dibatalkan.'); });
      if (!d.hasText) throw new Error(NO_TEXT);
      const paras: Para[] = [];
      d.pages.forEach((pg, pi) => pg.paras.forEach((x, i) => paras.push({ text: x.kind === 'row' ? (x.cells ?? [x.text]).join(' | ') : x.text, tr: '', kind: x.kind, pageBreak: pi > 0 && i === 0 })));
      const sample = paras.slice(0, 25).map((p) => p.text).join(' ');
      let src = source;
      if (src === 'auto') { const g = detectLang(sample); src = (g !== 'other' ? g : null) ?? (await chromeDetect(sample)) ?? 'auto'; setDetected(LANG_NAMES[src] ?? ''); }
      if (src === target) throw new Error(`Dokumen sudah berbahasa ${LANG_NAMES[target] ?? target}. Pilih bahasa tujuan yang berbeda.`);

      let translate: (t: string) => Promise<string>;
      let used = '';
      const tr = engine !== 'webllm' && hasChromeTranslator() && src !== 'auto' ? await chromeTranslator(src, target, (f, l) => P(0.15 + f * 0.1, l)).catch(() => null) : null;
      if (tr) { translate = (t) => tr.translate(t); used = 'Penerjemah bawaan Chrome'; }
      else {
        if (engine === 'chrome') throw new Error('Penerjemah Chrome tidak tersedia untuk pasangan bahasa ini di perangkat Anda.');
        const e = await loadWebLLM(tier, (f, l) => P(0.15 + f * 0.2, l));
        const from = src === 'auto' ? 'the source language (auto-detect)' : LANGS[src] ?? src;
        const sys = `You are a professional translator. Translate the user's text from ${from} into ${LANGS[target] ?? target}. Keep tokens like ⟦0⟧ and all numbers unchanged. Output ONLY the translation, no notes.`;
        translate = (t) => llm(e, sys, t, Math.min(1400, Math.ceil(t.length * 1.3) + 64));
        used = `Model AI lokal (${tier === 'light' ? 'ringan' : tier === 'smart' ? 'pintar' : 'seimbang'})`;
      }

      let done = 0;
      const total = paras.reduce((s, p) => s + p.text.length, 0) || 1;
      for (const p of paras) {
        if (stop.current) break;
        const pieces = p.text.length > 1200 ? chunkText(p.text, 1000) : [p.text];
        const res: string[] = [];
        for (const piece of pieces) { const pr = protect(piece); res.push(pr.restore(await translate(pr.out))); }
        p.tr = res.join(' ').trim();
        done += p.text.length;
        setPreview({ a: p.text.slice(0, 220), b: p.tr.slice(0, 220) });
        P(0.35 + (done / total) * 0.6, `Menerjemahkan… ${Math.round((done / total) * 100)}%`);
      }
      const out = paras.filter((p) => p.tr);
      if (!out.length) throw new Error('Dibatalkan.');
      const outFiles: { name: string; blob: Blob }[] = [];
      let note = `${used}. ${stop.current ? 'Dihentikan: hanya bagian awal yang diterjemahkan. ' : ''}`;
      const dual = layout === 'dual' && LATIN.has(target) && LATIN.has(src);
      if (LATIN.has(target)) {
        const blocks: Block[] = [];
        if (dual) {
          const rows: Cell[][] = [[{ runs: [{ text: LANG_NAMES[src] ?? 'Asli', bold: true }] }, { runs: [{ text: LANG_NAMES[target] ?? target, bold: true }] }]];
          for (const p of out) rows.push([{ runs: [{ text: p.text }] }, { runs: [{ text: p.tr }] }]);
          blocks.push({ type: 'table', header: true, rows, fontSize: 9.5 });
        } else for (const p of out) {
          if (p.pageBreak) blocks.push({ type: 'pagebreak' });
          const h = p.kind === 'h1' ? 1 : p.kind === 'h2' ? 2 : p.kind === 'h3' ? 3 : undefined;
          blocks.push({ type: 'p', heading: h, runs: [{ text: p.kind === 'li' ? `• ${p.tr}` : p.tr }] });
        }
        const r = await blocksToPdf(blocks, { title: baseName(file.name), footerNumbers: true });
        outFiles.push({ name: `${baseName(file.name)}-${target}${dual ? '-dwibahasa' : ''}.pdf`, blob: new Blob([r.bytes as BlobPart], { type: 'application/pdf' }) });
        if (r.unsupported) note += `${r.unsupported} karakter di PDF diganti "?" (lihat berkas teks). `;
      } else note += 'Bahasa tujuan memakai aksara non-Latin, jadi hasil diberikan sebagai berkas teks. ';
      outFiles.push({ name: `${baseName(file.name)}-${target}.txt`, blob: new Blob([out.map((p) => p.tr).join('\n\n')], { type: 'text/plain;charset=utf-8' }) });
      onDone({ files: outFiles, note: note + 'Angka, tautan, dan email dilindungi agar tidak berubah. Tata letak asli tidak dipertahankan; periksa hasil sebelum dipakai.' });
    } catch (e: any) { onError(e.message); } finally { setBusy(false); }
  };

  const opts = Object.entries(LANGS);
  return (
    <div className="fields">
      <div className="field"><label htmlFor="src">Bahasa asal</label>
        <select id="src" value={source} onChange={(e) => setSource(e.target.value)}><option value="auto">Deteksi otomatis (10+ bahasa dan aksara)</option>{opts.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        {detected && <small className="hint">Terdeteksi: {detected}</small>}</div>
      <div className="field"><label htmlFor="tgt">Terjemahkan ke</label>
        <select id="tgt" value={target} onChange={(e) => setTarget(e.target.value)}>{opts.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      <div className="field"><label htmlFor="lay">Hasil PDF</label>
        <select id="lay" value={layout} onChange={(e) => setLayout(e.target.value as any)}><option value="single">Terjemahan saja</option><option value="dual">Dwibahasa: asli dan terjemahan berdampingan (bahasa Latin)</option></select></div>
      <div className="field"><label htmlFor="teng">Mesin</label>
        <select id="teng" value={engine} onChange={(e) => setEngine(e.target.value as any)}>
          <option value="auto">Otomatis (Chrome bila ada, lalu AI lokal)</option>
          {hasChromeTranslator() && <option value="chrome">Penerjemah bawaan Chrome</option>}
          {hasWebGPU() && <option value="webllm">AI lokal WebGPU</option>}
        </select>
        {!hasChromeTranslator() && !hasWebGPU() && <small className="hint">Browser ini belum punya penerjemah bawaan maupun WebGPU. Gunakan Chrome atau Edge terbaru di laptop/desktop.</small>}</div>
      {engine !== 'chrome' && hasWebGPU() && <div className="field"><label htmlFor="ttier">Ukuran model AI lokal</label><select id="ttier" value={tier} onChange={(e) => setTier(e.target.value as Tier)}>{(Object.keys(TIERS) as Tier[]).map((t) => <option key={t} value={t}>{TIERS[t].label}</option>)}</select></div>}
      {busy ? (
        <div className="progress" role="status"><progress value={prog.p} max={100} /><span>{prog.l} · {prog.p}%</span>
          <button className="btn-quiet" onClick={() => (stop.current = true)}>Hentikan & simpan yang sudah jadi</button></div>
      ) : <button className="btn-primary" onClick={run}>Terjemahkan</button>}
      {preview && busy && <div className="qa"><p className="hint">{preview.a}</p><p className="ai-prev">{preview.b}</p></div>}
    </div>
  );
}
