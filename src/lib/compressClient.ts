// Klien worker Kompres cerdas. Tombol Batalkan = worker dimatikan. Bila Worker/OffscreenCanvas tidak ada atau worker gagal start, jalan di thread utama.
import type { RunCtx } from '../tools/types';
import { getProfile } from './device';
import type { SmartResult } from './compressCore';

export type { SmartResult };
type Spawn = () => Worker;

const canWorker = () =>
  typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap !== 'undefined';

async function onMain(file: File, level: string, ctx: RunCtx, limit: number): Promise<SmartResult> {
  const { smartCompressCore } = await import('./compressCore');
  const bytes = new Uint8Array(await file.arrayBuffer());
  return smartCompressCore(file.name, bytes, level, { progress: ctx.progress, check: ctx.check }, limit);
}

class StartFailed extends Error {}

function viaWorker(spawn: Spawn, file: File, bytes: Uint8Array, level: string, ctx: RunCtx, limit: number): Promise<SmartResult> {
  return new Promise((resolve, reject) => {
    let w: Worker;
    try { w = spawn(); } catch (e: any) { reject(new StartFailed(String(e?.message || e))); return; }
    let finished = false;
    const end = () => { finished = true; clearInterval(poll); w.terminate(); };
    const poll = setInterval(() => {
      try { ctx.check(); } catch (e) { if (!finished) { end(); reject(e); } }
    }, 150);
    w.onmessage = (ev: MessageEvent) => {
      const m = ev.data;
      if (m.type === 'progress') ctx.progress(m.p, m.l);
      else if (m.type === 'done') { end(); resolve(m.result as SmartResult); }
      else if (m.type === 'error') { end(); reject(new Error(m.message)); }
    };
    w.onerror = (ev: any) => { if (!finished) { end(); reject(new StartFailed(String(ev?.message || 'worker error'))); } };
    (w as any).onmessageerror = () => { if (!finished) { end(); reject(new StartFailed('messageerror')); } };
    w.postMessage({ rid: 1, name: file.name, bytes, level, limit }, [bytes.buffer as ArrayBuffer]);
  });
}

export async function smartCompress(file: File, level: string, ctx: RunCtx, spawn?: Spawn): Promise<SmartResult> {
  const prof = getProfile();
  if (canWorker()) {
    try {
      const sp = spawn ?? (await import('./compressSpawn')).spawnCompressWorker;
      const bytes = new Uint8Array(await file.arrayBuffer());
      return await viaWorker(sp, file, bytes, level, ctx, prof.concurrency);
    } catch (e) {
      if (!(e instanceof StartFailed)) throw e;
      ctx.progress(0, 'Memakai mode biasa');
    }
  }
  return onMain(file, level, ctx, Math.min(2, prof.concurrency));
}
