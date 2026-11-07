import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import http from 'http';
import path from 'path';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const f = path.join('/home/claude/t', decodeURIComponent(req.url.split('?')[0]));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] ?? 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(8123, r));
// uso: node run.mjs <bundle-entry-ready-page> <json-jobs>
const jobs = JSON.parse(process.argv[2]);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[browser]', m.text().slice(0, 300)); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 500)));
await page.goto('http://localhost:8123/out/index.html');
await page.waitForFunction(() => window.ready === true, null, { timeout: 20000 });
for (const j of jobs) {
  const files = j.files.map((f) => ({ name: f, b64: fs.readFileSync('data/' + f).toString('base64') }));
  try {
    const r = await page.evaluate(([n, f, o]) => window.runTool(n, f, o), [j.tool, files, j.opts ?? {}]);
    r.files.forEach((f) => { fs.writeFileSync('out/' + j.out + '_' + f.name, Buffer.from(f.b64, 'base64')); });
    console.log('OK', j.tool, r.files.map((f) => f.name).join(','), '|', (r.note ?? '').slice(0, 120));
  } catch (e) { console.log('FAIL', j.tool, e.message.slice(0, 400)); }
}
await browser.close(); server.close();
