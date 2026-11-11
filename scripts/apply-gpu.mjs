// Memasang penjaga GPU ke src/lib/ai.ts (idempotent). Jalankan: node scripts/apply-gpu.mjs
import fs from 'node:fs';
const f = 'src/lib/ai.ts';
let s = fs.readFileSync(f, 'utf8');
if (s.includes('./gpuGuard')) { console.log('ai.ts sudah terpasang, dilewati.'); process.exit(0); }
const crlf = s.includes('\r\n');
if (crlf) s = s.replace(/\r\n/g, '\n');
const edits = [
  [`import { cachedModelIds, ensurePersist, removeModels, storageInfo } from './storage';`,
   `import { cachedModelIds, ensurePersist, removeModels, storageInfo } from './storage';
import { isGpuFailure, markGpuBad, probeWebGpu } from './gpuGuard';
export { GPU_FALLBACK_MSG, isGpuFailure, probeWebGpu, runWithGpuFallback } from './gpuGuard';`],
  [`  if (!hasWebGPU()) throw new Error('Browser ini belum mendukung WebGPU. Coba Chrome atau Edge terbaru di laptop/desktop.');`,
   `  if (!hasWebGPU()) throw new Error('Browser ini belum mendukung WebGPU. Coba Chrome atau Edge terbaru di laptop/desktop.');
  const gpu = await probeWebGpu();
  if (!gpu.ok) throw new Error('WebGPU tidak tersedia: ' + (gpu.reason ?? 'GPU bermasalah'));`],
  [`})().catch((e) => { engines.delete(tier); throw e; });`,
   `})().catch((e) => { engines.delete(tier); if (isGpuFailure(e)) markGpuBad(); throw e; });`],
  [`      console.warn('[MAB-AI] kesalahan model:', msg, e);`,
   `      console.warn('[MAB-AI] kesalahan model:', msg, e);
      if (isGpuFailure(e)) markGpuBad();`],
  [`/not loaded|disposed|lost|reload\\(/i.test(msg) && engine?.__tier)`,
   `/not loaded|disposed|lost|reload\\(/i.test(msg) && !/DEVICE_REMOVED|DXGI/i.test(msg) && engine?.__tier)`],
];
for (const [a, b] of edits) {
  if (!s.includes(a)) { console.error('GAGAL: potongan tidak ditemukan:\n' + a.slice(0, 90)); process.exit(1); }
  s = s.replace(a, () => b);
}
if (crlf) s = s.replace(/\n/g, '\r\n');
fs.writeFileSync(f, s);
console.log('ai.ts: penjaga GPU terpasang (5 perubahan).');
