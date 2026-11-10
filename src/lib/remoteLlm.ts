// Klien AI server (API kompatibel OpenAI: Ollama, vLLM, llama.cpp, dll). Opt-in: teks dokumen dikirim ke server ini.
export interface RemoteCfg { url: string; key: string; model: string }
const KEY = 'mab-ai-remote';
export const DEFAULT_REMOTE: RemoteCfg = { url: '', key: '', model: 'qwen2.5:7b' };

export function loadRemoteCfg(): RemoteCfg {
  try { return { ...DEFAULT_REMOTE, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULT_REMOTE }; }
}
export function saveRemoteCfg(c: RemoteCfg) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* abaikan */ } }

/** https://host, https://host/, https://host/v1, https://host/v1/chat/completions -> https://host/v1 */
export function normalizeBase(u: string): string {
  let x = u.trim().replace(/\/+$/, '').replace(/\/chat\/completions$/, '').replace(/\/v1$/, '');
  if (x && !/^https?:\/\//i.test(x)) x = 'https://' + x;
  return x ? x + '/v1' : '';
}

const hdr = (c: RemoteCfg): Record<string, string> => ({ 'Content-Type': 'application/json', ...(c.key ? { Authorization: `Bearer ${c.key}` } : {}) });

async function call(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try { return await fetch(url, { ...init, signal: ac.signal }); }
  catch (e: any) {
    if (e?.name === 'AbortError') throw new Error('Server AI tidak menjawab (waktu habis). Cek bahwa notebook Colab masih berjalan.');
    throw new Error('Tidak bisa terhubung ke server AI. Periksa alamatnya, pastikan server masih menyala, dan izin akses (CORS) aktif.');
  } finally { clearTimeout(t); }
}

async function fail(r: Response): Promise<never> {
  let d = ''; try { d = (await r.text()).slice(0, 160); } catch { /* abaikan */ }
  if (r.status === 401 || r.status === 403) throw new Error('Server AI menolak kunci akses (401/403). Periksa kunci API.');
  if (r.status === 404) throw new Error(`Server AI tidak menemukan model atau alamat (404). ${d}`);
  throw new Error(`Server AI membalas galat ${r.status}. ${d}`);
}

export async function pingRemote(c: RemoteCfg): Promise<string[]> {
  const base = normalizeBase(c.url);
  if (!base) throw new Error('Isi alamat server AI dulu.');
  const r = await call(`${base}/models`, { headers: hdr(c) }, 15000);
  if (!r.ok) await fail(r);
  const j: any = await r.json().catch(() => ({}));
  return (j.data ?? []).map((m: any) => String(m.id)).filter(Boolean);
}

export async function remoteAsk(c: RemoteCfg, system: string, user: string, maxTokens: number, timeoutMs = 180000): Promise<string> {
  const base = normalizeBase(c.url);
  if (!base) throw new Error('Isi alamat server AI dulu.');
  const body = JSON.stringify({ model: c.model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature: 0.2, max_tokens: maxTokens, stream: false });
  const r = await call(`${base}/chat/completions`, { method: 'POST', headers: hdr(c), body }, timeoutMs);
  if (!r.ok) await fail(r);
  const j: any = await r.json().catch(() => null);
  const out = String(j?.choices?.[0]?.message?.content ?? '').trim();
  if (!out) throw new Error('Server AI mengirim jawaban kosong.');
  return out;
}
