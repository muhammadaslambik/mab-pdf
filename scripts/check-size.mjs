// Pagar ukuran: gagal bila muat awal (JS yang diunduh saat halaman depan dibuka) melebihi anggaran.
// Pakai setelah `npm run build`:  node scripts/check-size.mjs [anggaran-kB-gzip, default 130]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const dist = 'dist', budget = Number(process.argv[2] || 130) * 1024;
if (!fs.existsSync(path.join(dist, 'index.html'))) { console.error('dist/index.html tidak ada. Jalankan npm run build dulu.'); process.exit(2); }
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const gz = (f) => zlib.gzipSync(fs.readFileSync(f), { level: 9 }).length;
const kb = (n) => (n / 1024).toFixed(1).padStart(7) + ' kB';
const initial = new Set();
for (const m of html.matchAll(/(?:src|href)="\.?\/?(assets\/[^"]+\.(?:js|css))"/g)) initial.add(m[1]);
// ikuti impor statis antar-chunk agar chunk bersama ikut terhitung
const queue = [...initial];
while (queue.length) {
  const f = queue.pop(), full = path.join(dist, f);
  if (!f.endsWith('.js') || !fs.existsSync(full)) continue;
  for (const m of fs.readFileSync(full, 'utf8').matchAll(/(?:from|import)\s*["']\.\/([^"']+\.js)["']/g)) {
    const dep = 'assets/' + m[1]; if (!initial.has(dep)) { initial.add(dep); queue.push(dep); }
  }
}
let total = 0;
console.log('Muat awal (gzip):');
for (const f of [...initial].sort()) { const s = gz(path.join(dist, f)); total += s; console.log(' ', kb(s), f); }
console.log('  ------------');
console.log(' ', kb(total), `total  (anggaran ${kb(budget).trim()})`);
const all = fs.readdirSync(path.join(dist, 'assets')).filter((f) => /\.(js|mjs)$/.test(f)).map((f) => [f, gz(path.join(dist, 'assets', f))]).sort((a, b) => b[1] - a[1]).slice(0, 5);
console.log('\nChunk terbesar (dimuat malas, hanya saat alatnya dipakai):');
all.forEach(([f, s]) => console.log(' ', kb(s), f));
if (total > budget) { console.error('\nGAGAL: muat awal melebihi anggaran.'); process.exit(1); }
console.log('\nOK: muat awal dalam anggaran.');
