import { useRef, useState } from 'react';
import type { CustomProps } from '../tools/types';
import { NO_TEXT, extractDoc } from '../lib/pdfText';
import { chromeSummarize, chunkText, extractiveSummary, hasChromeSummarizer, hasWebGPU, llm, loadWebLLM, type Engine } from '../lib/ai';
import { baseName } from '../lib/util';

export default function AiSummarize({ files, onDone, onError }: CustomProps) {
  const file = files[0];
  const [engine, setEngine] = useState<Engine>('extractive');
  const [length, setLength] = useState<'short' | 'medium' | 'long'>('medium');
  const [lang, setLang] = useState('same');
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState({ p: 0, l: '' });
  const [out, setOut] = useState('');
  const stop = useRef(false);

  const run = async () => {
    stop.current = false; setBusy(true); setOut('');
    const P = (p: number, l: string) => setProg({ p: Math.round(p * 100), l });
    try {
      const d = await extractDoc(file, (p, l) => P(p / 100 * 0.25, l), () => { if (stop.current) throw new Error('Dibatalkan.'); });
      if (!d.hasText) throw new Error(NO_TEXT);
      const text = d.pages.map((pg) => pg.paras.map((x) => x.text).join('\n')).join('\n\n');
      let result = '';
      if (engine === 'extractive') {
        P(0.5, 'Memilih kalimat penting');
        result = extractiveSummary(text, { short: 4, medium: 7, long: 12 }[length]).map((s) => `- ${s}`).join('\n');
        if (!result) throw new Error('Teks terlalu pendek untuk dirangkum.');
      } else if (engine === 'chrome') {
        result = await chromeSummarize(text, length, (f, l) => P(0.25 + f * 0.75, l));
      } else {
        const e = await loadWebLLM((f, l) => P(0.25 + f * 0.35, l));
        const target = lang === 'same' ? 'the same language as the text' : lang === 'id' ? 'Indonesian' : 'English';
        const sys = `You are a precise summarizer. Write in ${target}. Use short bullet points. Do not invent facts.`;
        const words = { short: 80, medium: 160, long: 300 }[length];
        const chunks = chunkText(text, 3500).slice(0, 12);
        const parts: string[] = [];
        for (let i = 0; i < chunks.length; i++) {
          if (stop.current) throw new Error('Dibatalkan.');
          P(0.6 + (i / chunks.length) * 0.35, `Merangkum bagian ${i + 1}/${chunks.length}`);
          parts.push(await llm(e, sys, `Summarize the following text in at most ${Math.round(words / chunks.length) + 40} words:\n\n${chunks[i]}`, 350));
        }
        result = chunks.length > 1 ? await llm(e, sys, `Combine these partial summaries into one coherent summary of about ${words} words:\n\n${parts.join('\n')}`, 500) : parts[0];
        if (chunks.length < chunkText(text, 3500).length) result += '\n\n_(Hanya bagian awal dokumen yang dirangkum.)_';
      }
      setOut(result);
      onDone({ files: [{ name: `${baseName(file.name)}-ringkasan.md`, blob: new Blob([`# Ringkasan: ${file.name}\n\n${result}\n`], { type: 'text/markdown' }) }], note: 'Ringkasan dibuat di perangkat Anda. Periksa kembali sebelum dipakai; AI bisa keliru.' });
    } catch (e: any) { onError(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="fields">
      <div className="field">
        <label htmlFor="eng">Mesin ringkasan</label>
        <select id="eng" value={engine} onChange={(e) => setEngine(e.target.value as Engine)}>
          <option value="extractive">Cepat: ambil kalimat penting (semua bahasa, tanpa unduhan)</option>
          {hasChromeSummarizer() && <option value="chrome">AI bawaan Chrome (output bahasa Inggris)</option>}
          {hasWebGPU() && <option value="webllm">AI lokal WebGPU (mendukung Indonesia, unduhan ±1 GB sekali)</option>}
        </select>
        {!hasWebGPU() && <small className="hint">AI lokal butuh browser dengan WebGPU (Chrome/Edge terbaru di laptop atau desktop).</small>}
      </div>
      <div className="field"><label htmlFor="len">Panjang</label>
        <select id="len" value={length} onChange={(e) => setLength(e.target.value as any)}>
          <option value="short">Singkat</option><option value="medium">Sedang</option><option value="long">Rinci</option>
        </select></div>
      {engine === 'webllm' && (
        <div className="field"><label htmlFor="lng">Bahasa hasil</label>
          <select id="lng" value={lang} onChange={(e) => setLang(e.target.value)}>
            <option value="same">Sama dengan dokumen</option><option value="id">Indonesia</option><option value="en">Inggris</option>
          </select></div>
      )}
      {busy ? (
        <div className="progress" role="status"><progress value={prog.p} max={100} /><span>{prog.l} · {prog.p}%</span><button className="btn-quiet" onClick={() => (stop.current = true)}>Batalkan</button></div>
      ) : <button className="btn-primary" onClick={run}>Rangkum</button>}
      {out && (
        <div className="cmp-result">
          <pre className="ai-out">{out}</pre>
          <button className="btn-quiet" onClick={() => navigator.clipboard?.writeText(out)}>Salin teks</button>
        </div>
      )}
    </div>
  );
}
