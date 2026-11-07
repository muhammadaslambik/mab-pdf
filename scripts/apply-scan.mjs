// Mengganti entri alat 'scan' di src/tools/registry.ts agar memakai ScanStudio. Aman dijalankan berulang.
import fs from 'node:fs';
const f = 'src/tools/registry.ts';
let s = fs.readFileSync(f, 'utf8');
if (s.includes("components/ScanStudio")) { console.log('[apply-scan] sudah terpasang'); process.exit(0); }
const re = /\{\s*id: 'scan'[\s\S]*?\r?\n  \},/;
if (!re.test(s)) { console.error("[apply-scan] entri 'scan' tidak ditemukan"); process.exit(1); }
const entry = `{
    id: 'scan', category: 'organize', title: 'Pindai ke PDF', icon: '📷',
    desc: 'Foto dokumen, luruskan otomatis, jadikan PDF.', keywords: ['pindai', 'scan', 'kamera', 'foto', 'dokumen'],
    accept: 'image', multiple: true, minFiles: 0, status: 'beta', capture: true, custom: () => import('../components/ScanStudio')
  },`;
s = s.replace(re, entry);
fs.writeFileSync(f, s);
console.log('[apply-scan] registry.ts diperbarui');
