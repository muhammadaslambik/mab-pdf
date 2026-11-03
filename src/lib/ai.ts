/**
 * Lapisan AI sisi-klien. Tiga mesin:
 *  1. ekstraktif  : selalu tersedia, cepat, semua bahasa, tanpa unduhan
 *  2. chrome      : API bawaan Chrome (Summarizer / Translator), model diunduh Chrome sekali
 *  3. webllm      : model bahasa lokal lewat WebGPU (opt-in, unduhan sekitar 1 GB, di-cache browser)
 * Isi dokumen tidak pernah dikirim ke server. Hanya berkas model yang diunduh.
 */

export type Engine = 'extractive' | 'chrome' | 'webllm';
export type Progress = (fraction: number, label: string) => void;

const g = globalThis as any;
export const hasChromeSummarizer = () => typeof g.Summarizer !== 'undefined';
export const hasChromeTranslator = () => typeof g.Translator !== 'undefined';
export const hasWebGPU = () => typeof navigator !== 'undefined' && !!(navigator as any).gpu;

/* ---------- teks ---------- */
export function chunkText(text: string, size = 3500): string[] {
  const out: string[] = [];
  let cur = '';
  for (const s of text.split(/(?<=[.!?\n])\s+/)) {
    if (cur && cur.length + s.length > size) { out.push(cur); cur = ''; }
    if (s.length > size) { for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size)); continue; }
    cur += (cur ? ' ' : '') + s;
  }
  if (cur) out.push(cur);
  return out;
}

const STOP = new Set(('yang dan di ke dari untuk dengan pada adalah ini itu atau dalam juga akan oleh sebagai tidak ada dapat telah karena saya kami kita mereka anda lebih sudah bisa para serta antara setiap tersebut harus hanya lain jika saat agar bahwa the of and to in a is that for it as with was on be by this are or from at an have not but we our you your they their which has will can more also all').split(' '));

export function guessLang(text: string): 'id' | 'en' | 'other' {
  const w = text.toLowerCase().match(/[a-z]+/g) ?? [];
  if (w.length < 20) return 'other';
  const id = w.filter((x) => ['yang', 'dan', 'di', 'untuk', 'dengan', 'adalah', 'pada', 'dari', 'ini', 'itu', 'tidak', 'akan'].includes(x)).length;
  const en = w.filter((x) => ['the', 'and', 'of', 'to', 'is', 'in', 'that', 'for', 'with', 'this', 'are', 'was'].includes(x)).length;
  if (id + en < w.length * 0.04) return 'other';
  return id >= en ? 'id' : 'en';
}

export function extractiveSummary(text: string, count = 6): string[] {
  const sentences = text.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=[A-Z0-9"'“(])/).map((s) => s.trim()).filter((s) => s.length > 30 && s.length < 600);
  if (sentences.length <= count) return sentences;
  const freq = new Map<string, number>();
  const toks = (s: string) => (s.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []).filter((w) => !STOP.has(w));
  for (const s of sentences) for (const w of toks(s)) freq.set(w, (freq.get(w) ?? 0) + 1);
  const scored = sentences.map((s, i) => {
    const t = toks(s);
    const score = t.reduce((a, w) => a + (freq.get(w) ?? 0), 0) / Math.pow(Math.max(t.length, 6), 0.7);
    return { s, i, score: score * (i < sentences.length * 0.15 ? 1.15 : 1) };
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, count).sort((a, b) => a.i - b.i).map((x) => x.s);
}

/* ---------- Chrome built-in AI ---------- */
export async function chromeSummarize(text: string, length: 'short' | 'medium' | 'long', onProgress: Progress): Promise<string> {
  const S = g.Summarizer;
  const opts = { type: 'key-points', format: 'markdown', length, outputLanguage: 'en', sharedContext: 'Document text' };
  const av = await S.availability(opts);
  if (av === 'unavailable') throw new Error('Perangkum bawaan Chrome tidak tersedia di perangkat ini.');
  const sum = await S.create({ ...opts, monitor: (m: any) => m.addEventListener('downloadprogress', (e: any) => onProgress(e.loaded, 'Mengunduh model Chrome')) });
  const parts: string[] = [];
  const chunks = chunkText(text, 3000).slice(0, 40);
  for (let i = 0; i < chunks.length; i++) { onProgress(i / chunks.length, `Merangkum bagian ${i + 1}/${chunks.length}`); parts.push(await sum.summarize(chunks[i])); }
  sum.destroy?.();
  return parts.join('\n');
}

export async function chromeTranslator(source: string, target: string, onProgress: Progress) {
  const T = g.Translator;
  const av = await T.availability({ sourceLanguage: source, targetLanguage: target });
  if (av === 'unavailable') return null;
  return T.create({ sourceLanguage: source, targetLanguage: target, monitor: (m: any) => m.addEventListener('downloadprogress', (e: any) => onProgress(e.loaded, 'Mengunduh model terjemahan')) });
}

export async function chromeDetect(text: string): Promise<string | null> {
  if (typeof g.LanguageDetector === 'undefined') return null;
  try { const d = await g.LanguageDetector.create(); const r = await d.detect(text.slice(0, 1500)); return r?.[0]?.detectedLanguage ?? null; } catch { return null; }
}

/* ---------- WebLLM (WebGPU) ---------- */
const WEBLLM_URL = 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2/+esm';
const PREFERRED = ['Qwen2.5-1.5B-Instruct-q4f16_1-MLC', 'Qwen2.5-1.5B-Instruct-q4f32_1-MLC', 'Llama-3.2-1B-Instruct-q4f16_1-MLC', 'Qwen2.5-3B-Instruct-q4f16_1-MLC'];
let engineP: Promise<any> | null = null;

export function loadWebLLM(onProgress: Progress): Promise<any> {
  if (!hasWebGPU()) return Promise.reject(new Error('Browser ini belum mendukung WebGPU. Coba Chrome atau Edge terbaru di laptop/desktop.'));
  return (engineP ??= (async () => {
    const lib: any = await import(/* @vite-ignore */ WEBLLM_URL);
    const list: string[] = lib.prebuiltAppConfig.model_list.map((m: any) => m.model_id);
    const id = PREFERRED.find((p) => list.includes(p)) ?? list.find((m) => /(1\.5B|1B).*q4f16/i.test(m)) ?? list[0];
    return lib.CreateMLCEngine(id, { initProgressCallback: (r: any) => onProgress(r.progress ?? 0, r.text ?? 'Memuat model') });
  })().catch((e) => { engineP = null; throw e; }));
}

export async function llm(engine: any, system: string, user: string, maxTokens = 400): Promise<string> {
  const r = await engine.chat.completions.create({ messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature: 0.2, max_tokens: maxTokens });
  return String(r.choices?.[0]?.message?.content ?? '').trim();
}

export const LANGS: Record<string, string> = {
  id: 'Indonesia', en: 'Inggris', es: 'Spanyol', fr: 'Prancis', de: 'Jerman', pt: 'Portugis', it: 'Italia', nl: 'Belanda',
  ru: 'Rusia', ja: 'Jepang', ko: 'Korea', zh: 'Mandarin', ar: 'Arab', hi: 'Hindi', tr: 'Turki', ms: 'Melayu'
};
/** Bahasa yang bisa ditulis ke PDF dengan font standar (huruf Latin). */
export const LATIN = new Set(['id', 'en', 'es', 'fr', 'de', 'pt', 'it', 'nl', 'tr', 'ms']);
