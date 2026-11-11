// Penjaga GPU: deteksi WebGPU sebelum menawarkan AI lokal, dan fallback ramah
// ke mode offline bila GPU gagal (mis. DXGI_ERROR_DEVICE_REMOVED). Murni, tanpa React.

export type GpuStatus = { ok: boolean; reason?: string; f16?: boolean; maxBuffer?: number; name?: string };

const FLAG = 'mab-gpu-bad';
let cached: Promise<GpuStatus> | null = null;

const store = (): Storage | null => {
  try { return typeof sessionStorage !== 'undefined' ? sessionStorage : null; } catch { return null; }
};

/** Galat yang berasal dari GPU/WebGPU (bukan pembatalan oleh pengguna). */
export function isGpuFailure(err: unknown): boolean {
  const m = String((err as any)?.message ?? err ?? '');
  if (/dibatalkan|abort/i.test(m)) return false;
  return /DEVICE_REMOVED|DXGI_ERROR|device (was )?lost|GPUDevice|requestDevice|requestAdapter|WebGPU|no (suitable )?adapter|out of memory|OOM|createShaderModule|shader|createBuffer|mapAsync|ValidationError/i.test(m);
}

export const GPU_FALLBACK_MSG =
  'GPU di perangkat ini bermasalah, jadi dipakai mode offline (tanpa AI). Hasil tetap disusun dari isi dokumen. ' +
  'Bila ingin AI lokal, mulai ulang peramban atau komputer lalu coba lagi.';

export function markGpuBad(): void { try { store()?.setItem(FLAG, '1'); } catch { /* abaikan */ } cached = null; }
export function gpuMarkedBad(): boolean { try { return store()?.getItem(FLAG) === '1'; } catch { return false; } }
export function resetGpuProbe(): void { try { store()?.removeItem(FLAG); } catch { /* abaikan */ } cached = null; }

/** Cek WebGPU nyata: adapter + device uji, lalu dilepas. Hasil di-cache per sesi. */
export function probeWebGpu(nav: any = typeof navigator !== 'undefined' ? navigator : undefined): Promise<GpuStatus> {
  if (cached) return cached;
  cached = (async (): Promise<GpuStatus> => {
    if (gpuMarkedBad()) return { ok: false, reason: 'GPU gagal di sesi ini (mulai ulang peramban untuk mencoba lagi).' };
    const gpu = nav?.gpu;
    if (!gpu) return { ok: false, reason: 'Peramban ini belum mendukung WebGPU.' };
    try {
      const adapter = await gpu.requestAdapter();
      if (!adapter) return { ok: false, reason: 'Tidak ada GPU yang kompatibel dengan WebGPU.' };
      const f16 = !!adapter.features?.has?.('shader-f16');
      const maxBuffer = Number(adapter.limits?.maxBufferSize ?? 0);
      const dev = await adapter.requestDevice();
      try { dev.destroy?.(); } catch { /* abaikan */ }
      const name = String(adapter.info?.description || adapter.info?.vendor || '');
      return { ok: true, f16, maxBuffer, name };
    } catch (e) {
      markGpuBad();
      return { ok: false, reason: 'WebGPU gagal dimulai: ' + String((e as any)?.message ?? e).slice(0, 120) };
    }
  })();
  return cached;
}

/**
 * Jalankan `primary` (AI lokal). Bila gagal karena GPU, beri tahu pengguna lalu jalankan `fallback`
 * (mode offline). Pembatalan dan galat non-GPU dilempar apa adanya.
 */
export async function runWithGpuFallback<T>(
  primary: () => Promise<T>,
  fallback: () => Promise<T> | T,
  notify?: (msg: string) => void,
): Promise<T> {
  try {
    return await primary();
  } catch (e) {
    if (!isGpuFailure(e)) throw e;
    console.warn('[MAB-AI] GPU gagal, beralih ke mode offline:', e);
    markGpuBad();
    notify?.(GPU_FALLBACK_MSG);
    return await fallback();
  }
}
