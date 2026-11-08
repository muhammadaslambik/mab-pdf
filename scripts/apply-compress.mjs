// Idempotent: tambahkan compress.worker ke globIgnores precache agar precache PWA tidak membengkak.
import fs from 'node:fs';
const f = 'vite.config.ts';
let s = fs.readFileSync(f, 'utf8');
if (s.includes('compress.worker')) { console.log('vite.config.ts: sudah ada, dilewati.'); process.exit(0); }
const m = s.match(/globIgnores\s*:\s*\[/);
if (!m) { console.log('PERINGATAN: globIgnores tidak ditemukan di vite.config.ts. Tambahkan manual: \'**/compress.worker*\''); process.exit(0); }
s = s.replace(m[0], m[0] + "'**/compress.worker*', ");
fs.writeFileSync(f, s);
console.log('vite.config.ts: globIgnores diperbarui.');
