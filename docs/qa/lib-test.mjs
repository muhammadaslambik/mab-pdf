// pembantu bersama untuk skrip uji
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs'; import http from 'http'; import path from 'path';
export async function start(port, opts = {}) {
  const server = http.createServer((req, res) => { const f = path.join('/home/claude/t', decodeURIComponent(req.url.split('?')[0])); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(f)] ?? 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
  await new Promise((r) => server.listen(port, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: opts.viewport ?? { width: 1280, height: 860 }, colorScheme: opts.colorScheme });
  await ctx.addInitScript(() => { for (const C of [Map, WeakMap]) { C.prototype.getOrInsertComputed ??= function (k, f) { if (!this.has(k)) this.set(k, f(k)); return this.get(k); }; C.prototype.getOrInsert ??= function (k, v) { if (!this.has(k)) this.set(k, v); return this.get(k); }; } });
  const errors = [];
  const newPage = async () => { const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message.slice(0, 200))); p.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load/.test(m.text())) errors.push('CONSOLE ' + m.text().slice(0, 200)); }); return p; };
  const results = [];
  const ok = (n, c, x = '') => { results.push(!!c); console.log(c ? 'PASS' : 'FAIL', n, x); };
  const done = async () => { console.log('Error browser:', errors.length ? '\n' + [...new Set(errors)].join('\n') : 'tidak ada'); console.log(`HASIL: ${results.filter(Boolean).length}/${results.length}`); await browser.close(); server.close(); };
  return { browser, ctx, newPage, ok, done, errors, base: `http://localhost:${port}/out/app/index.html` };
}
export const D = (f) => '/home/claude/t/data/' + f;
export const b64 = (f) => fs.readFileSync(D(f)).toString('base64');
