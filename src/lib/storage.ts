/** Pengelolaan penyimpanan browser: model AI, cache lama, kuota. Tidak memuat pustaka AI apa pun. */
const MODEL_CACHES = ['webllm/model', 'webllm/wasm', 'webllm/config'];

export const fmtBytes = (n: number) => (n >= 1024 ** 3 ? (n / 1024 ** 3).toFixed(2) + ' GB' : n >= 1024 ** 2 ? Math.round(n / 1024 ** 2) + ' MB' : Math.round(n / 1024) + ' KB');

export async function storageInfo() {
  const e = await navigator.storage?.estimate?.().catch(() => null);
  const persisted = await navigator.storage?.persisted?.().catch(() => false);
  return { usage: e?.usage ?? 0, quota: e?.quota ?? 0, persisted: !!persisted };
}

/** Minta agar browser tidak menghapus data situs ini saat ruang menipis. */
export async function ensurePersist(): Promise<boolean> {
  try { if (await navigator.storage?.persisted?.()) return true; return !!(await navigator.storage?.persist?.()); } catch { return false; }
}

const hasCache = async (name: string) => 'caches' in globalThis && (await caches.keys()).includes(name);

/** ID model WebLLM yang sudah ada di cache (dibaca dari alamat berkas, tanpa memuat pustaka AI). */
export async function cachedModelIds(): Promise<string[]> {
  try {
    if (!(await hasCache('webllm/model'))) return [];
    const ids = new Set<string>();
    for (const r of await (await caches.open('webllm/model')).keys()) { const m = /\/([^/]+-MLC)\//.exec(r.url); if (m) ids.add(m[1]); }
    return [...ids];
  } catch { return []; }
}

export const matchesModel = (url: string, id: string) => url.includes(`/${id}/`) || url.includes(`/${id.replace(/-MLC$/, '')}-ctx`);

/** Hapus bobot, konfigurasi, dan wasm milik model tertentu. */
export async function removeModels(ids: string[]) {
  if (!ids.length || !('caches' in globalThis)) return;
  for (const name of MODEL_CACHES) {
    if (!(await hasCache(name))) continue;
    const c = await caches.open(name);
    for (const r of await c.keys()) if (ids.some((id) => matchesModel(r.url, id))) await c.delete(r);
  }
}

/** Data bahasa OCR (tesseract.js menyimpannya di IndexedDB 'keyval-store'). */
export const clearOcrData = () => new Promise<void>((ok) => { try { const r = indexedDB.deleteDatabase('keyval-store'); r.onsuccess = r.onerror = r.onblocked = () => ok(); } catch { ok(); } });

/** Hapus cache sisa versi lama aplikasi (mis. "mab-v4"). Tidak menyentuh cache aktif. */
export async function pruneLegacyCaches() {
  try { for (const k of await caches.keys()) if (/^mab-v\d+$/.test(k)) await caches.delete(k); } catch { /* abaikan */ }
}

if (typeof window !== 'undefined' && 'caches' in window) {
  ((window as any).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 3000)))(() => { pruneLegacyCaches(); });
}
