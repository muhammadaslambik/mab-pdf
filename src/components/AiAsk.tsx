import { useEffect, useRef, useState } from 'react';
import type { CustomProps } from '../tools/types';
import { NO_TEXT, extractDoc } from '../lib/pdfText';
import { defaultTier, hasWebGPU, llm, loadWebLLM, TIERS, type Tier } from '../lib/ai';
import { Bm25, bestSentences, highlight, type Passage } from '../lib/nlp';

interface Answer { q: string; quick: { text: string; page: number }[]; hits: { passage: Passage; terms: string[] }[]; ai?: string }

/** Pecah dokumen jadi bagian ±110 kata, mencatat nomor halaman. */
function chunk(pages: { paras: { text: string }[] }[]): Passage[] {
  const out: Passage[] = [];
  pages.forEach((pg, pi) => {
    let cur = '';
    for (const p of pg.paras) {
      if (cur && (cur + p.text).split(/\s+/).length > 110) { out.push({ text: cur.trim(), page: pi + 1 }); cur = ''; }
      cur += p.text + ' ';
    }
    if (cur.trim()) out.push({ text: cur.trim(), page: pi + 1 });
  });
  return out;
}

export default function AiAsk({ files, onError }: CustomProps) {
  const file = files[0];
  const [index, setIndex] = useState<Bm25 | null>(null);
  const [prog, setProg] = useState('Membaca dokumen…');
  const [q, setQ] = useState('');
  const [mode, setMode] = useState<'search' | 'ai'>('search');
  const [tier, setTier] = useState<Tier>(defaultTier());
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<Answer[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let dead = false;
    setIndex(null); setLog([]);
    extractDoc(file, (p, l) => !dead && setProg(`${l} · ${Math.round(p)}%`), () => { if (dead) throw new Error('x'); })
      .then((d) => { if (dead) return; if (!d.hasText) { onError(NO_TEXT); return; } setIndex(new Bm25(chunk(d.pages))); })
      .catch((e) => { if (!dead) onError(e.message); });
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  const ask = async () => {
    if (!index || !q.trim() || busy) return;
    const question = q.trim(); setQ(''); setBusy(true);
    const hits = index.search(question, 5);
    const a: Answer = { q: question, quick: bestSentences(question, hits.map((h) => h.passage), 3), hits: hits.map((h) => ({ passage: h.passage, terms: h.terms })) };
    setLog((l) => [...l, a]);
    try {
      if (mode === 'ai' && hits.length) {
        const e = await loadWebLLM(tier, (f, l) => setProg(`${l} · ${Math.round(f * 100)}%`));
        const ctx = hits.slice(0, 4).map((h) => `[Halaman ${h.passage.page}]\n${h.passage.text.slice(0, 900)}`).join('\n\n');
        const sys = 'You answer questions about a document using ONLY the provided excerpts. Reply in the same language as the question. Be concise. Cite pages like (hlm. 3). If the answer is not in the excerpts, say you could not find it.';
        const upd = (acc: string) => setLog((l) => l.map((x, i) => (i === l.length - 1 ? { ...x, ai: acc } : x)));
        await llm(e, sys, `Excerpts:\n${ctx}\n\nQuestion: ${question}`, 380, upd);
      }
    } catch (e: any) { onError(e.message); } finally { setBusy(false); setTimeout(() => endRef.current?.scrollIntoView({ block: 'nearest' }), 50); }
  };

  const examples = ['Apa tujuan utama dokumen ini?', 'Berapa jumlah atau nominal yang disebut?', 'Siapa pihak yang disebutkan?', 'Kapan batas waktunya?'];
  if (!index) return <p className="hint" role="status">{prog}</p>;
  return (
    <div className="fields">
      <p className="hint">Dokumen siap ({index.passages.length} bagian terindeks). Tanya apa saja; jawaban diambil dari isi PDF, lengkap dengan nomor halaman.</p>
      <div className="field">
        <label htmlFor="amode">Cara menjawab</label>
        <select id="amode" value={mode} onChange={(e) => setMode(e.target.value as any)}>
          <option value="search">Cari jawaban di dokumen (instan, offline)</option>
          {hasWebGPU() && <option value="ai">Cari + susun jawaban dengan AI lokal (WebGPU)</option>}
        </select>
      </div>
      {mode === 'ai' && <div className="field"><label htmlFor="at">Ukuran model</label><select id="at" value={tier} onChange={(e) => setTier(e.target.value as Tier)}>{(Object.keys(TIERS) as Tier[]).map((t) => <option key={t} value={t}>{TIERS[t].label}</option>)}</select></div>}
      <div className="ann-search">
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ask()} placeholder="Tulis pertanyaan tentang dokumen ini…" aria-label="Pertanyaan" />
        <button className="btn-primary" onClick={ask} disabled={busy || !q.trim()}>{busy ? '…' : 'Tanya'}</button>
      </div>
      {!log.length && <div className="chips">{examples.map((x) => <button key={x} className="chip-btn" onClick={() => setQ(x)}>{x}</button>)}</div>}
      {log.map((a, i) => (
        <div className="qa" key={i}>
          <p className="qa-q">{a.q}</p>
          {a.ai !== undefined && <div className="qa-ai">{a.ai || 'Menyusun jawaban…'}</div>}
          {!a.hits.length ? <p className="hint">Tidak ada bagian yang cocok. Coba kata kunci lain yang muncul di dokumen.</p> : (
            <>
              {a.ai === undefined && a.quick.length > 0 && <ul className="ai-list qa-quick">{a.quick.map((s, k) => <li key={k}>{s.text} <small>(hlm. {s.page})</small></li>)}</ul>}
              <details open={a.ai === undefined}><summary>{a.hits.length} bagian relevan</summary>
                {a.hits.map((h, k) => (
                  <blockquote key={k}><small>Halaman {h.passage.page}</small><p>{highlight(h.passage.text, a.q).map((w, j) => (w.hit ? <mark key={j}>{w.text}</mark> : w.text))}</p></blockquote>
                ))}
              </details>
            </>
          )}
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}
