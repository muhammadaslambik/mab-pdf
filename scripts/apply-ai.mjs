// Memastikan src/main.tsx memuat lib/storage (pembersihan cache lama saat aplikasi dibuka). Aman dijalankan berulang.
import fs from 'node:fs';
const f = 'src/main.tsx';
if (!fs.existsSync(f)) { console.error('[apply-ai] src/main.tsx tidak ditemukan'); process.exit(1); }
let s = fs.readFileSync(f, 'utf8');
if (s.includes('lib/storage')) { console.log('[apply-ai] sudah terpasang'); process.exit(0); }
fs.writeFileSync(f, "import './lib/storage';\n" + s);
console.log('[apply-ai] main.tsx diperbarui');
