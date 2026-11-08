// Pakai: node scripts/check-licenses.mjs  (butuh internet untuk npx pertama kali)
import { execSync } from 'node:child_process';
const raw = execSync('npx --yes license-checker --production --excludePrivatePackages --json', { encoding: 'utf8', maxBuffer: 1 << 26 });
const data = JSON.parse(raw);
const by = {};
for (const [name, v] of Object.entries(data)) (by[String(v.licenses)] ||= []).push(name);
for (const [lic, names] of Object.entries(by).sort((a, b) => b[1].length - a[1].length))
  console.log(lic.padEnd(32), names.length);
const risky = Object.entries(by).filter(([l]) => /UNLICENSED|UNKNOWN|GPL|AGPL|SSPL|CC-BY-NC/i.test(l) && !/^\(MIT OR GPL/i.test(l));
console.log('\nPerlu dicek manual:');
for (const [l, n] of risky) console.log(' ', l, '->', n.join(', '));
if (!risky.length) console.log('  (tidak ada)');
console.log('\nCatatan: (MIT OR GPL-3.0-or-later) boleh dipakai di bawah MIT. Lisensi model AI (Qwen2.5, Llama-3.2) cek manual di kartu model masing-masing.');
