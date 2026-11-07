import { useRef, useState } from 'react';
import type { CustomProps } from '../tools/types';
import { NO_TEXT, extractDoc } from '../lib/pdfText';
import { chromeSummarize, chunkText, defaultTier, hasChromeSummarizer, hasWebGPU, llm, loadWebLLM, TIERS, type Engine, type Tier } from '../lib/ai';
import { LANG_NAMES, detectLang, keywords, summarize } from '../lib/nlp';
import { baseName } from '../lib/util';

interface Section { title: string; page: number; text: string }
interface Result { bullets: string[]; sections: { title: string; page: number; points: string[] }[]; keys: string[]; stats: { words: number; minutes: number; lang: string; pages: number }; llmText?: string }

export default function AiSummarize({ files, onDone, onError }: CustomProps) {
  const file = files[0];
  const [engine, setEngine] = useState<Engine>('extractive');
  const [tier, setTier] = useState<Tier>(defaultTier());
  const [length, setLength] = useState<'short' | 'medium' | 'long'>('medium');
  const [perSection, setPerSection] = useState(true);
  const [lang, setLang] = useState('same');
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState({ p: 0, l: '' });
  const [res, setRes] = useState<Result | null>(null);
  const stop = useRef(false);

  const run = async () => {
    stop.current = false; setBusy(true); setRes(null);
    const P = (p: number, l: string) => setProg({ p: Math.round(p * 100), l });
    const check = () => { if (stop.current) throw new Error('Dibatalkan.'); };
    try {
      const d = await extractDoc(file, (p, l) => P((p / 100) * 0.25, l), check);
      if (!d.hasText) throw new Error(NO_TEXT);
      const text = d.pages.map((pg) => pg.paras.map((x) => x.text).join('\n')).join('\n\n');
      // bagian berdasarkan judul
      const sections: Section[] = [];
      d.pages.forEach((pg, pi) => pg.paras.forEach((x) => {
        if (x.kind === 'h1' || x.kind === 'h2') sections.push({ title: x.text, page: pi + 1, text: '' });
        else if (x.kind !== 'row' && sections.length) sections[sections.length - 1].text += x.text + ' ';
      }));
      const words = text.split(/\s+/).filter(Boolean).length;
      const base: Result = { bullets: [], sections: [], keys: keywords(text, 10), stats: { words, minutes: Math.max(1, Math.round(words / 200)), lang: LANG_NAMES[detectLang(text)] ?? 'tidak diketahui', pages: d.pages.length } };
      const n = { short: 4, medium: 7, long: 12 }[length];
      let md = '';

      if (engine === 'extractive') {
        P(0.5, 'Menilai kalimat penting');
        base.bullets = summarize(text, n);
        if (!base.bullets.length) throw new Error('Teks terlalu pendek untuk dirangkum.');
        if (perSection) base.sections = sections.filter((s) => s.text.length > 200).slice(0, 14).map((s) => ({ title: s.title, page: s.page, points: summarize(s.text, length === 'long' ? 2 : 1) })).filter((s) => s.points.length);
      } else if (engine === 'chrome') {
        base.llmText = await chromeSummarize(text, length, (f, l) => P(0.25 + f * 0.75, l));
      } else {
        const e = await loadWebLLM(tier, (f, l) => P(0.25 + f * 0.3, l));
        const target = lang === 'same' ? 'the same language as the text' : lang === 'id' ? 'Indonesian' : 'English';
        const sys = `You are a precise summarizer. Write in ${target}. Use short bullet points. Never invent facts that are not in the text.`;
        const words2 = { short: 90, medium: 180, long: 320 }[length];
        const units = sections.filter((s) => s.text.length > 300).length >= 2 && perSection ? sections.filter((s) => s.text.length > 300).slice(0, 10).map((s) => `${s.title}\n${s.text.slice(0, 3500)}`) : chunkText(text, 3500).slice(0, 10);
        const parts: string[] = [];
        for (let i = 0; i < units.length; i++) {
          check(); P(0.55 + (i / units.length) * 0.35, `Merangkum bagian ${i + 1}/${units.length}`);
          parts.push(await llm(e, sys, `Summarize in at most ${Math.round(words2 / units.length) + 40} words:\n\n${units[i]}`, 300));
        }
        P(0.92, 'Menyusun ringkasan akhir');
        base.llmText = units.length > 1 ? await llm(e, sys, `Combine these partial summaries into one coherent summary of about ${words2} words, as bullet points:\n\n${parts.join('\n')}`, 520, (acc) => setRes({ ...base, llmText: acc })) : parts[0];
      }
      setRes(base);
      md = `# Ringkasan: ${file.name}\n\n` + (base.llmText ? base.llmText + '\n' : base.bullets.map((b) => `- ${b}`).join('\n') + '\n') +
        (base.sections.length ? `\n## Poin per bagian\n\n` + base.sections.map((s) => `**${s.title}** (hlm. ${s.page})\n` + s.points.map((p) => `- ${p}`).join('\n')).join('\n\n') + '\n' : '') +
        `\n## Kata kunci\n\n${base.keys.join(', ')}\n\n## Statistik\n\n${base.stats.words} kata, ±${base.stats.minutes} menit baca, ${base.stats.pages} halaman, bahasa: ${base.stats.lang}\n`;
      onDone({ files: [{ name: `${baseName(file.name)}-ringkasan.md`, blob: new Blob([md], { type: 'text/markdown' }) }], note: engine === 'extractive' ? 'Ringkasan dipilih dari kalimat asli dokumen (TextRank + penyaring redundansi), jadi tidak ada fakta karangan.' : 'Ringkasan dibuat model AI di perangkat Anda. Periksa kembali sebelum dipakai; AI bisa keliru.' });
    } catch (e: any) { onError(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="fields">
      <div className="field">
        <label htmlFor="eng">Mesin ringkasan</label>
        <select id="eng" value={engine} onChange={(e) => setEngine(e.target.value as Engine)}>
          <option value="extractive">Pintar offline: kalimat penting (semua bahasa, instan, tanpa unduhan)</option>
          {hasChromeSummarizer() && <option value="chrome">AI bawaan Chrome (output bahasa Inggris)</option>}
          {hasWebGPU() && <option value="webllm">AI generatif lokal WebGPU (menulis ulang, mendukung Indonesia)</option>}
        </select>
        {!hasWebGPU() && <small className="hint">AI generatif butuh browser dengan WebGPU (Chrome/Edge terbaru di laptop atau desktop).</small>}
      </div>
      {engine === 'webllm' && (
        <div className="field"><label htmlFor="tier">Ukuran model</label>
          <select id="tier" value={tier} onChange={(e) => setTier(e.target.value as Tier)}>{(Object.keys(TIERS) as Tier[]).map((t) => <option key={t} value={t}>{TIERS[t].label}</option>)}</select>
          <small className="hint">Diunduh sekali lalu tersimpan di browser. File dokumen tidak pernah dikirim ke mana pun.</small></div>
      )}
      <div className="field"><label htmlFor="len">Panjang</label>
        <select id="len" value={length} onChange={(e) => setLength(e.target.value as any)}><option value="short">Singkat</option><option value="medium">Sedang</option><option value="long">Rinci</option></select></div>
      <label className="check"><input type="checkbox" checked={perSection} onChange={(e) => setPerSection(e.target.checked)} /> Ringkas per bagian (memakai judul di dokumen)</label>
      {engine === 'webllm' && (
        <div className="field"><label htmlFor="lng">Bahasa hasil</label>
          <select id="lng" value={lang} onChange={(e) => setLang(e.target.value)}><option value="same">Sama dengan dokumen</option><option value="id">Indonesia</option><option value="en">Inggris</option></select></div>
      )}
      {busy ? (
        <div className="progress" role="status"><progress value={prog.p} max={100} /><span>{prog.l} · {prog.p}%</span><button className="btn-quiet" onClick={() => (stop.current = true)}>Batalkan</button></div>
      ) : <button className="btn-primary" onClick={run}>Rangkum</button>}

      {res && (
        <div className="cmp-result">
          <div className="chips"><span>{res.stats.words.toLocaleString('id-ID')} kata</span><span>±{res.stats.minutes} menit baca</span><span>{res.stats.pages} halaman</span><span>{res.stats.lang}</span></div>
          {res.llmText ? <pre className="ai-out">{res.llmText}</pre> : (
            <>
              <h3 className="sub">Ringkasan</h3>
              <ul className="ai-list">{res.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>
              {res.sections.length > 0 && (<><h3 className="sub">Poin per bagian</h3>
                {res.sections.map((s, i) => <div key={i} className="ai-sec"><b>{s.title}</b><small> hlm. {s.page}</small><ul className="ai-list">{s.points.map((p, k) => <li key={k}>{p}</li>)}</ul></div>)}</>)}
            </>
          )}
          {res.keys.length > 0 && <div className="chips keys">{res.keys.map((k) => <span key={k}>{k}</span>)}</div>}
          <button className="btn-quiet" onClick={() => navigator.clipboard?.writeText(res.llmText ?? res.bullets.join('\n'))}>Salin ringkasan</button>
        </div>
      )}
    </div>
  );
}
