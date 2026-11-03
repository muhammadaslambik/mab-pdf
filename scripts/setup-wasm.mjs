// Menyalin engine qpdf (WebAssembly) dari node_modules ke public/wasm. Tidak pernah menggagalkan npm install.
import fs from 'node:fs';
import path from 'node:path';

try {
  const pkgDir = path.resolve('node_modules/@neslinesli93/qpdf-wasm');
  if (!fs.existsSync(pkgDir)) { console.log('[setup-wasm] qpdf-wasm tidak terpasang, dilewati (fitur memakai metode cadangan).'); process.exit(0); }
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'node_modules' ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]));
  const files = walk(pkgDir);
  const wasm = files.find((f) => f.endsWith('.wasm'));
  const pj = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
  const mainRel = pj.module || pj.main || 'dist/qpdf.js';
  const js = fs.existsSync(path.join(pkgDir, mainRel)) ? path.join(pkgDir, mainRel) : files.find((f) => /qpdf\.js$/.test(f));
  if (!wasm || !js) { console.log('[setup-wasm] berkas qpdf tidak ditemukan, dilewati.'); process.exit(0); }
  fs.mkdirSync('public/wasm', { recursive: true });
  fs.copyFileSync(js, 'public/wasm/qpdf.js');
  fs.copyFileSync(wasm, 'public/wasm/qpdf.wasm');
  console.log('[setup-wasm] qpdf disalin ke public/wasm');
} catch (e) {
  console.log('[setup-wasm] dilewati:', e?.message);
}
process.exit(0);
