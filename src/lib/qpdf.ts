/**
 * Pemuat qpdf (WebAssembly) opsional. File qpdf.js dan qpdf.wasm disalin ke public/wasm/ oleh
 * scripts/setup-wasm.mjs saat `npm install` (dari paket @neslinesli93/qpdf-wasm).
 * Bila tidak tersedia, alat memakai metode cadangan.
 */
let factory: Promise<any | null> | null = null;

const base = () => new URL(`${import.meta.env.BASE_URL}wasm/`, location.href).href;

async function load(): Promise<any | null> {
  const url = base() + 'qpdf.js';
  try {
    const head = await fetch(url, { method: 'HEAD' });
    if (!head.ok) return null;
  } catch { return null; }
  try {
    const m: any = await import(/* @vite-ignore */ url);
    const f = m.default ?? m.createModule ?? m;
    if (typeof f === 'function') return f;
  } catch { /* coba cara klasik */ }
  try {
    await new Promise<void>((res, rej) => {
      const s = document.createElement('script');
      s.src = url; s.onload = () => res(); s.onerror = () => rej(new Error('x'));
      document.head.appendChild(s);
    });
    const g: any = window;
    const f = g.createModule ?? g.Module;
    return typeof f === 'function' ? f : null;
  } catch { return null; }
}

export const qpdfAvailable = async () => !!(await (factory ??= load()));

export async function runQpdf(args: string[], input: Uint8Array): Promise<Uint8Array> {
  const f = await (factory ??= load());
  if (!f) throw new Error('Mesin qpdf belum terpasang.');
  const errs: string[] = [];
  const mod = await f({
    noInitialRun: true,
    locateFile: (p: string) => (p.endsWith('.wasm') ? base() + 'qpdf.wasm' : p),
    print: () => {}, printErr: (t: string) => errs.push(String(t))
  });
  mod.FS.writeFile('/in.pdf', input);
  try { mod.callMain([...args, '/in.pdf', '/out.pdf']); } catch { /* status keluar dilaporkan lewat exception */ }
  let out: Uint8Array;
  try { out = mod.FS.readFile('/out.pdf'); } catch {
    const msg = errs.join(' ');
    if (/invalid password/i.test(msg)) throw new Error('Password salah. Coba lagi.');
    throw new Error(msg || 'qpdf gagal memproses file.');
  }
  return out;
}
