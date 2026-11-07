import { build } from '/home/claude/.npm-global/lib/node_modules/tsx/node_modules/esbuild/lib/main.js';
import fs from 'fs'; import path from 'path';
const G = '/home/claude/.npm-global/lib/node_modules';
const [,, entry, outfile, platform = 'browser'] = process.argv;
const urlPlugin = { name: 'url', setup(b) {
  b.onResolve({ filter: /\?url$/ }, (a) => {
    const p = a.path.replace(/\?url$/, '');
    const full = p.startsWith('.') ? path.resolve(a.resolveDir, p) : path.join(G, p);
    return { path: full, namespace: 'urlns' };
  });
  b.onLoad({ filter: /.*/, namespace: 'urlns' }, (a) => {
    const dest = path.join(path.dirname(path.resolve(outfile)), path.basename(a.path));
    fs.copyFileSync(a.path, dest);
    return { contents: `export default "./${path.basename(a.path)}"`, loader: 'js' };
  });
}};
await build({
  entryPoints: [entry], outfile, bundle: true, platform, format: 'esm', jsx: 'automatic', sourcemap: false,
  nodePaths: [G, path.join(G, 'docx/node_modules'), path.join(G, 'pptxgenjs/node_modules'), path.join(G, 'pdf-lib/node_modules')],
  alias: { fflate: '/home/claude/t/shims/fflate.js' },
  plugins: [urlPlugin], logLevel: 'error', define: { 'import.meta.env.BASE_URL': '"./"' },
  external: [...(platform === 'node' ? ['node:*', 'canvas'] : []), 'tesseract.js'], loader: { '.png': 'dataurl' }
});
console.log('built', outfile);
