import { smartCompressCore } from './compressCore';

const post = (m: any, t?: Transferable[]) => (self as any).postMessage(m, t ?? []);

(self as any).onmessage = async (e: MessageEvent) => {
  const { rid, name, bytes, level, limit } = e.data as { rid: number; name: string; bytes: Uint8Array; level: string; limit: number };
  try {
    const r = await smartCompressCore(name, bytes, level, {
      progress: (p, l) => post({ rid, type: 'progress', p, l }),
      check: () => {} // pembatalan = worker dimatikan oleh klien
    }, limit);
    const b = r.bytes;
    const buf = b.byteOffset === 0 && b.byteLength === b.buffer.byteLength ? b : b.slice();
    post({ rid, type: 'done', result: { ...r, bytes: buf } }, [buf.buffer as ArrayBuffer]);
  } catch (err: any) {
    post({ rid, type: 'error', message: String(err?.message || err) });
  }
};
