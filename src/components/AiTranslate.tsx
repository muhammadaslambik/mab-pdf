import { useRef, useState } from 'react';
import type { CustomProps } from '../tools/types';
import { NO_TEXT, extractDoc } from '../lib/pdfText';
import { LANGS, LATIN, chromeDetect, chromeTranslator, chunkText, guessLang, hasChromeTranslator, hasWebGPU, llm, loadWebLLM } from '../lib/ai';
import { blocksToPdf, type Block } from '../lib/layout';
import { baseName } from '../lib/util';

type Para = { text: string; kind: string; pageBreak: boolean };

export default function AiTranslate({ files, onDone, onError }: CustomProps) {
  const file = files[0];
  const [source, setSource] = useState('auto');
  const [target, setTarget] = useState('en');
  const [engine, setEngine] = useState<'auto' | 'chrome' | 'webllm'>('auto');
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState({ p: 0, l: '' });
  const [preview, setPreview] = useState('');
  const stop = useRef(false);

  const run = async () => {
    stop.current = false; setBusy(true); setPreview('');
    const P = (p: number, l: string) => setProg({ p: Math.round(p * 100), l });
    try {
      const d = await extractDoc(file, (p, l) => P((p / 100) * 0.15, l), () => { if (stop.current) throw new Error('Dibatalkan.'); });
      if (!d.hasText) throw new Error(NO_TEXT);
      const paras: Para[] = [];
      d.pages.forEach((pg, pi) => pg.paras.forEach((x, i) => paras.push({ text: x.text, kind: x.kind, pageBreak: pi > 0 && i === 0 })));
      const sample = paras.slice(0, 20).map((p) => p.text).join(' ');
      let src = source;
      if (src === 'auto') { const g = guessLang(sample); src = (await chromeDetect(sample)) ?? (g === 'other' ? 'auto' : g); }
      if (src === target) throw new Error('Bahasa sumber dan tujuan sama.');

      // pilih mesin
      let translate: (t: string) => Promise<string>;
      let used = '';
      const wantChrome = engine !== 'webllm' && hasChromeTranslator() && src !== 'auto';
      const tr = wantChrome ? await chromeTranslator(src, target, (f, l) => P(0.15 + f * 0.1, l)).catch(() => null) : null;
      if (tr) { translate = (t) => tr.translate(t); used = 'Penerjemah bawaan Chrome'; }
      else {
        if (engine === 'chrome') throw new Error('Penerjemah Chrome tidak tersedia untuk pasangan bahasa ini di perangkat Anda.');
        const e = await loadWebLLM((f, l) => P(0.15 + f * 0.2, l));
        const from = src === 'auto' ? 'the source language (auto-detect)' : LANGS[src] ?? src;
        const sys = `You are a professional translator. Translate the user's text from ${from} into ${LANGS[target] ?? target}. Output ONLY the translation, no notes.`;
        translate = (t) => llm(e, sys, t, Math.min(1400, Math.ceil(t.length * 1.2) + 64));
        used = 'Model AI lokal (WebGPU)';
      }

      const out: Para[] = [];
      let done = 0;
      const totalChars = paras.reduce((s, p) => s + p.text.length, 0) || 1;
      for (const p of paras) {
        if (stop.current) break;
        const pieces = p.text.length > 1200 ? chunkText(p.text, 1000) : [p.text];
        const res: string[] = [];
        for (const piece of pieces) res.push(await translate(piece));
        const t = res.join(' ').trim();
        out.push({ ...p, text: t });
        done += p.text.length;
        setPreview(t);
        P(0.35 + (done / totalChars) * 0.6, `Menerjemahkan… ${Math.round((done / totalChars) * 100)}%`);
      }
      if (!out.length) throw new Error('Dibatalkan.');
      const outFiles: { name: string; blob: Blob }[] = [];
      let note = `${used}. ${stop.current ? 'Dihentikan: hanya bagian awal yang diterjemahkan. ' : ''}`;
      if (LATIN.has(target)) {
        const blocks: Block[] = [];
        for (const p of out) {
          if (p.pageBreak) blocks.push({ type: 'pagebreak' });
          const h = p.kind === 'h1' ? 1 : p.kind === 'h2' ? 2 : p.kind === 'h3' ? 3 : undefined;
          blocks.push({ type: 'p', heading: h, runs: [{ text: p.kind === 'li' ? `• ${p.text}` : p.text }] });
        }
        const r = await blocksToPdf(blocks, { title: baseName(file.name), footerNumbers: true });
        outFiles.push({ name: `${baseName(file.name)}-${target}.pdf`, blob: new Blob([r.bytes as BlobPart], { type: 'application/pdf' }) });
        if (r.unsupported) note += `${r.unsupported} karakter di PDF diganti "?" (cek berkas teks). `;
      } else note += 'Bahasa tujuan memakai aksara non-Latin, jadi hasil diberikan sebagai berkas teks. ';
      outFiles.push({ name: `${baseName(file.name)}-${target}.txt`, blob: new Blob([out.map((p) => p.text).join('\n\n')], { type: 'text/plain;charset=utf-8' }) });
      onDone({ files: outFiles, note: note + 'Tata letak asli tidak dipertahankan. Periksa hasil terjemahan sebelum dipakai.' });
    } catch (e: any) { onError(e.message); } finally { setBusy(false); }
  };

  const opts = Object.entries(LANGS);
  return (
    <div className="fields">
      <div className="field"><label htmlFor="src">Bahasa asal</label>
        <select id="src" value={source} onChange={(e) => setSource(e.target.value)}><option value="auto">Deteksi otomatis</option>{opts.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      <div className="field"><label htmlFor="tgt">Terjemahkan ke</label>
        <select id="tgt" value={target} onChange={(e) => setTarget(e.target.value)}>{opts.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      <div className="field"><label htmlFor="teng">Mesin</label>
        <select id="teng" value={engine} onChange={(e) => setEngine(e.target.value as any)}>
          <option value="auto">Otomatis (Chrome bila ada, lalu AI lokal)</option>
          {hasChromeTranslator() && <option value="chrome">Penerjemah bawaan Chrome</option>}
          {hasWebGPU() && <option value="webllm">AI lokal WebGPU (unduhan ±1 GB sekali)</option>}
        </select>
        {!hasChromeTranslator() && !hasWebGPU() && <small className="hint">Browser ini belum punya penerjemah bawaan maupun WebGPU. Gunakan Chrome atau Edge terbaru di laptop/desktop.</small>}
      </div>
      {busy ? (
        <div className="progress" role="status"><progress value={prog.p} max={100} /><span>{prog.l} · {prog.p}%</span>
          <button className="btn-quiet" onClick={() => (stop.current = true)}>Hentikan & simpan yang sudah jadi</button></div>
      ) : <button className="btn-primary" onClick={run}>Terjemahkan</button>}
      {preview && busy && <p className="hint ai-prev">{preview.slice(0, 300)}</p>}
    </div>
  );
}
