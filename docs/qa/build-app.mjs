import { build } from '/home/claude/.npm-global/lib/node_modules/tsx/node_modules/esbuild/lib/main.js';
import fs from 'fs'; import path from 'path';
const G = '/home/claude/.npm-global/lib/node_modules';
const outdir = '/home/claude/t/out/app';
const plugin = { name: 'x', setup(b) {
  b.onResolve({ filter: /^virtual:pwa-register$/ }, () => ({ path: 'pwa', namespace: 'stub' }));
  b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const registerSW=()=>{}', loader: 'js' }));
  b.onResolve({ filter: /\?url$/ }, (a) => ({ path: path.join(G, a.path.replace(/\?url$/, '')), namespace: 'urlns' }));
  b.onLoad({ filter: /.*/, namespace: 'urlns' }, (a) => { fs.copyFileSync(a.path, path.join(outdir, path.basename(a.path))); return { contents: `export default "./${path.basename(a.path)}"`, loader: 'js' }; });
}};
await build({
  entryPoints: ['/home/claude/mab-pdf/src/main.tsx'], outdir, bundle: true, platform: 'browser', format: 'esm', splitting: true, jsx: 'automatic',
  nodePaths: [G, path.join(G, 'pptxgenjs/node_modules'), path.join(G, 'docx/node_modules'), path.join(G, 'pdf-lib/node_modules')],
  alias: { fflate: '/home/claude/t/shims/fflate.js' }, plugins: [plugin], logLevel: 'error',
  define: { 'import.meta.env.BASE_URL': '"./"' }, external: ['tesseract.js'], loader: { '.png': 'dataurl' }
});
fs.writeFileSync(path.join(outdir, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="./main.css"></head><body><div id="root"></div><script type="module" src="./main.js"></script></body></html>');
console.log('app built');
