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

export { detectLang as guessLang, summarize as extractiveSummary } from './nlp';

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
import { cachedModelIds, ensurePersist, removeModels, storageInfo } from './storage';
import { isGpuFailure, markGpuBad, probeWebGpu } from './gpuGuard';
export { GPU_FALLBACK_MSG, isGpuFailure, probeWebGpu, runWithGpuFallback } from './gpuGuard';

/** Versi pustaka dikunci sekali (disimpan di perangkat) agar alamat berkasnya tetap sama dan cache tidak basi. */
const VER_KEY = 'mab-webllm-ver';
async function webllmUrl() {
  let v = '';
  try { v = localStorage.getItem(VER_KEY) || ''; } catch { /* abaikan */ }
  if (!/^\d+\.\d+\.\d+$/.test(v)) {
    try {
      const r = await fetch('https://data.jsdelivr.com/v1/package/resolve/npm/@mlc-ai/web-llm@0.2');
      v = String((await r.json()).version || '');
      if (/^\d+\.\d+\.\d+$/.test(v)) localStorage.setItem(VER_KEY, v);
    } catch { v = ''; }
  }
  return `https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@${/^\d+\.\d+\.\d+$/.test(v) ? v : '0.2'}/+esm`;
}

export type Tier = 'light' | 'balanced' | 'smart';
export const TIERS: Record<Tier, { label: string; ids: string[] }> = {
  light: { label: 'Ringan (±0,4 GB, cepat, cocok untuk HP/laptop biasa)', ids: ['Qwen2.5-0.5B-Instruct-q4f16_1-MLC'] },
  balanced: { label: 'Seimbang (±1 GB, disarankan)', ids: ['Qwen2.5-1.5B-Instruct-q4f16_1-MLC', 'Llama-3.2-1B-Instruct-q4f16_1-MLC'] },
  smart: { label: 'Pintar (±2 GB, butuh GPU yang memadai)', ids: ['Qwen2.5-3B-Instruct-q4f16_1-MLC', 'Llama-3.2-3B-Instruct-q4f16_1-MLC', 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC'] }
};
export const TIER_GB: Record<Tier, number> = { light: 0.5, balanced: 1.1, smart: 2.2 };
const TIER_KEY = 'mab-ai-tier';
/** Ukuran model dibagi antar semua alat AI: pilihan terakhir diingat, sehingga tidak mengunduh model lain tanpa sengaja. */
export const defaultTier = (): Tier => {
  try { const t = localStorage.getItem(TIER_KEY) as Tier | null; if (t && t in TIERS) return t; } catch { /* abaikan */ }
  return ((navigator as any).deviceMemory ?? 8) >= 8 ? 'balanced' : 'light';
};
/** Pilih varian dtype yang didukung GPU, agar tidak mengunduh bobot yang lalu gagal dimuat. */
export const swapDtype = (id: string, f16: boolean) => (f16 ? id.replace('q4f32_1', 'q4f16_1') : id.replace('q4f16_1', 'q4f32_1'));
async function supportsF16() {
  try { const a = await (navigator as any).gpu.requestAdapter(); return !!a?.features?.has('shader-f16'); } catch { return false; }
}

const engines = new Map<Tier, Promise<any>>();
let idleTimer: any;
/** Lepas model dari RAM/GPU bila tidak dipakai 5 menit (berkas di disk tetap; muat ulang hanya beberapa detik). */
const touch = () => {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => { for (const [t, e] of [...engines]) { engines.delete(t); try { (await e).unload?.(); } catch { /* abaikan */ } } }, 5 * 60_000);
};

async function createRaw(tier: Tier, onProgress: Progress): Promise<{ eng: any; id: string }> {
  const lib: any = await import(/* @vite-ignore */ await webllmUrl());
  const f16 = await supportsF16();
  const list: string[] = lib.prebuiltAppConfig.model_list.map((m: any) => m.model_id);
  const id = TIERS[tier].ids.map((x) => swapDtype(x, f16)).find((x) => list.includes(x))
    ?? list.find((m) => (f16 ? /(1\.5B|1B).*q4f16/i : /(1\.5B|1B).*q4f32/i).test(m)) ?? list[0];
  const norm = (x: string) => x.replace(/-MLC$/, '');
  const have = await cachedModelIds();
  const cached = have.some((x) => norm(x) === norm(id));
  if (!cached) {
    const { usage, quota } = await storageInfo();
    if (quota && quota - usage < TIER_GB[tier] * 1.15 * 1024 ** 3)
      throw new Error(`Ruang penyimpanan browser tidak cukup untuk model ini (butuh ±${TIER_GB[tier]} GB). Pilih ukuran model lebih kecil atau kosongkan disk.`);
    await ensurePersist();
  }
  onProgress(0, cached ? 'Memuat model dari penyimpanan lokal (tanpa unduh)' : `Mengunduh model sekali saja (±${TIER_GB[tier]} GB)`);
  const eng = await lib.CreateMLCEngine(id, { initProgressCallback: (r: any) => onProgress(r.progress ?? 0, cached ? 'Memuat model dari penyimpanan lokal (tanpa unduh)' : r.text ?? 'Mengunduh model') });
  try { localStorage.setItem(TIER_KEY, tier); } catch { /* abaikan */ }
  removeModels(have.filter((x) => norm(x) !== norm(id))).catch(() => {}); // satu model saja di disk (jangan hapus model yang sedang dipakai)
  return { eng, id };
}

/** Pembungkus stabil: bila mesin rusak (model dibuang / GPU di-reset), isinya diganti mesin baru tanpa mengubah rujukan pemanggil. */
export async function loadWebLLM(tier: Tier, onProgress: Progress): Promise<any> {
  if (!hasWebGPU()) throw new Error('Browser ini belum mendukung WebGPU. Coba Chrome atau Edge terbaru di laptop/desktop.');
  const gpu = await probeWebGpu();
  if (!gpu.ok) throw new Error('WebGPU tidak tersedia: ' + (gpu.reason ?? 'GPU bermasalah'));
  let p = engines.get(tier);
  if (p) { touch(); return p; }
  for (const [t, e] of engines) if (t !== tier) { e.then((x) => x.unload?.()).catch(() => {}); engines.delete(t); }
  p = (async () => {
    const { eng, id } = await createRaw(tier, onProgress);
    const w: any = { __cur: eng, __id: id, __tier: tier, unload: () => w.__cur?.unload?.(), chat: { completions: { create: (...a: any[]) => w.__cur.chat.completions.create(...a) } } };
    const proxy: any = new Proxy(w, { get: (t, k) => (k in t ? t[k] : typeof t.__cur?.[k] === 'function' ? t.__cur[k].bind(t.__cur) : t.__cur?.[k]) });
    touch();
    return proxy;
  })().catch((e) => { engines.delete(tier); if (isGpuFailure(e)) markGpuBad(); throw e; });
  engines.set(tier, p);
  return p;
}

async function recoverEngine(w: any): Promise<void> {
  try { await w.__cur?.unload?.(); } catch { /* abaikan */ }
  const { eng } = await createRaw(w.__tier, () => {});
  w.__cur = eng;
}

export async function llm(engine: any, system: string, user: string, maxTokens = 400, onToken?: (acc: string) => void): Promise<string> {
  touch();
  const req = { messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature: 0.2, max_tokens: maxTokens };
  const run = async (): Promise<string> => {
    if (!onToken) { const r = await engine.chat.completions.create(req); return String(r.choices?.[0]?.message?.content ?? '').trim(); }
    let acc = '';
    for await (const chunk of await engine.chat.completions.create({ ...req, stream: true })) { acc += chunk.choices?.[0]?.delta?.content ?? ''; onToken(acc); touch(); }
    return acc.trim();
  };
  for (let attempt = 0; ; attempt++) {
    try { return await run(); } catch (e: any) {
      const msg = String(e?.message || e);
      console.warn('[MAB-AI] kesalahan model:', msg, e);
      if (isGpuFailure(e)) markGpuBad();
      if (attempt < 2 && /not loaded|disposed|lost|reload\(/i.test(msg) && !/DEVICE_REMOVED|DXGI/i.test(msg) && engine?.__tier) { console.warn('[MAB-AI] membuat ulang mesin, percobaan', attempt + 1); await recoverEngine(engine); continue; }
      throw e;
    }
  }
}

export const LANGS: Record<string, string> = {
  id: 'Indonesia', en: 'Inggris', es: 'Spanyol', fr: 'Prancis', de: 'Jerman', pt: 'Portugis', it: 'Italia', nl: 'Belanda',
  ru: 'Rusia', ja: 'Jepang', ko: 'Korea', zh: 'Mandarin', ar: 'Arab', hi: 'Hindi', tr: 'Turki', ms: 'Melayu'
};
/** Bahasa yang bisa ditulis ke PDF dengan font standar (huruf Latin). */
export const LATIN = new Set(['id', 'en', 'es', 'fr', 'de', 'pt', 'it', 'nl', 'tr', 'ms']);
