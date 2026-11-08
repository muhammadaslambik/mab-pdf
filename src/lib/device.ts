// Profil perangkat: hanya membatasi konkurensi. TIDAK menurunkan kualitas hasil.
export type Tier = 'low' | 'mid' | 'high';
export interface DeviceProfile { tier: Tier; concurrency: number; memGB: number; cores: number }

export function getProfile(nav: any = (globalThis as any).navigator): DeviceProfile {
  const mem = Number(nav?.deviceMemory) || 4;
  const cores = Number(nav?.hardwareConcurrency) || 4;
  const tier: Tier = mem <= 2 || cores <= 2 ? 'low' : mem >= 8 && cores >= 8 ? 'high' : 'mid';
  const concurrency = tier === 'low' ? 1 : tier === 'mid' ? 2 : Math.min(4, Math.max(2, cores >> 1));
  return { tier, concurrency, memGB: mem, cores };
}

/** Jalankan fn untuk tiap item dengan batas paralel; hasil tetap berurutan. check() dipanggil sebelum tiap item (untuk Batalkan). */
export async function mapLimit<T, R>(
  items: T[], limit: number, fn: (x: T, i: number) => Promise<R>, check?: () => void,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      check?.();
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}
