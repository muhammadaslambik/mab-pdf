import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs'; import http from 'http'; import path from 'path';
const server = http.createServer((req, res) => { const f = path.join('/home/claude/t', decodeURIComponent(req.url.split('?')[0])); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' }[path.extname(f)] ?? 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(8126, r));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const errors = [];
const results = [];
const ok = (n, c, x = '') => { results.push(c); console.log(c ? 'PASS' : 'FAIL', n, x); };
const url = 'http://localhost:8126/out/app/index.html';
const shot = (page, n) => page.screenshot({ path: `/home/claude/t/out/ui_${n}.png` });

async function run(name, viewport) {
  const page = await browser.newPage({ viewport });
  page.on('pageerror', (e) => errors.push(name + ' ' + e.message.slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load/.test(m.text())) errors.push(name + ' ' + m.text().slice(0, 200)); });
  await page.addInitScript(() => { for (const C of [Map, WeakMap]) C.prototype.getOrInsertComputed ??= function (k, f) { if (!this.has(k)) this.set(k, f(k)); return this.get(k); }; });
  await page.goto(url); await page.waitForSelector('.tile'); await page.waitForTimeout(300);
  const mini = page.locator('.mini-btn');
  const barTop = () => page.locator('.cat-bar').evaluate((e) => Math.round(e.getBoundingClientRect().top));
  const clickBox = async (page, loc) => { const b = await loc.boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); };
  const hasClass = async (sel, c) => (await page.locator(sel).first().getAttribute('class') ?? '').split(' ').includes(c);

  await shot(page, `${name}_1_top`);
  ok(`${name}: ikon cari tersembunyi di atas`, !(await hasClass('.mini-btn', 'show')));

  await page.evaluate(() => window.scrollTo(0, 1000)); await page.waitForTimeout(500);
  ok(`${name}: bilah menempel di atas (top=0)`, (await barTop()) === 0, `top=${await barTop()}`);
  ok(`${name}: ikon cari muncul setelah pencarian tergulung`, await hasClass('.mini-btn', 'show'));
  const cats = await page.locator('.cats').boundingBox(); const mb = await mini.boundingBox();
  ok(`${name}: ikon di pojok kanan, sejajar tombol`, mb.x > cats.x + cats.width * 0.5 && Math.abs((mb.y + mb.height / 2) - (cats.y + cats.height / 2)) < 12, `ikon y=${Math.round(mb.y + mb.height / 2)} tab y=${Math.round(cats.y + cats.height / 2)}`);
  await shot(page, `${name}_2_scrolled`);

  await clickBox(page, mini); await page.waitForSelector('.mini-search'); await page.waitForTimeout(450);
  const ov = await page.locator('.mini-search').boundingBox(); const bar = await page.locator('.cat-inner').boundingBox();
  ok(`${name}: pencarian terbuka menutupi tab`, ov.x <= cats.x + 30 && ov.x + ov.width >= mb.x + mb.width - 30, `overlay ${Math.round(ov.x)}-${Math.round(ov.x + ov.width)} tab ${Math.round(cats.x)}-${Math.round(cats.x + cats.width)}`);
  ok(`${name}: input terfokus`, await page.evaluate(() => document.activeElement?.closest('.mini-search') !== null));
  await shot(page, `${name}_3_open`);

  await page.locator('.mini-search input').fill('kompres'); await page.waitForTimeout(200);
  ok(`${name}: mengetik menyaring daftar`, (await page.locator('.tile').count()) === 1);
  await clickBox(page, page.locator('.mini-close')); await page.waitForTimeout(400);
  ok(`${name}: tombol X menutup, kembali jadi ikon`, (await page.locator('.mini-search').count()) === 0 && await hasClass('.mini-btn', 'show'));
  ok(`${name}: titik penanda saat ada kata kunci`, (await page.locator('.mini-btn .dot').count()) === 1);

  await clickBox(page, mini); await page.waitForSelector('.mini-search');
  await page.mouse.click(viewport.width / 2, viewport.height - 40); await page.waitForTimeout(400);
  ok(`${name}: klik di luar menutup`, (await page.locator('.mini-search').count()) === 0);

  await clickBox(page, mini); await page.waitForSelector('.mini-search'); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  ok(`${name}: Esc menutup`, (await page.locator('.mini-search').count()) === 0);

  await clickBox(page, page.locator('.mini-btn')); await page.waitForSelector('.mini-search'); await page.locator('.mini-search input').fill(''); await page.waitForTimeout(200); await clickBox(page, page.locator('.mini-close'));
  await page.waitForTimeout(300);
  await page.locator('.cats').evaluate((n) => n.scrollTo({ left: n.scrollWidth })); await page.waitForTimeout(200);
  await clickBox(page, page.locator('.cats button', { hasText: 'Keamanan' })); await page.waitForTimeout(900);
  const firstTop = await page.locator('.group').first().evaluate((e) => Math.round(e.getBoundingClientRect().top));
  ok(`${name}: pindah kategori saat menempel, daftar tidak tertutup bilah`, firstTop >= 60 && firstTop < 200, `group top=${firstTop}`);
  ok(`${name}: tab aktif`, await page.locator('.cats button.on').innerText() === 'Keamanan');
  await shot(page, `${name}_4_category`);

  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(500);
  ok(`${name}: kembali ke atas, ikon cari hilang`, !(await hasClass('.mini-btn', 'show')));
  await page.close();
}
await run('desktop', { width: 1366, height: 768 });
await run('mobile', { width: 390, height: 844 });

// halaman alat
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
await page.addInitScript(() => { for (const C of [Map, WeakMap]) C.prototype.getOrInsertComputed ??= function (k, f) { if (!this.has(k)) this.set(k, f(k)); return this.get(k); }; });
await page.goto(url + '#/tool/merge'); await page.waitForSelector('.drop'); await shot(page, 'tool_empty');
await page.locator('input[type=file]').first().setInputFiles(['/home/claude/t/data/doc.pdf', '/home/claude/t/data/sheet.pdf']); await page.waitForSelector('.panel'); await shot(page, 'tool_files');
console.log('Error browser:', errors.length ? errors.join('\n') : 'tidak ada');
console.log(`HASIL: ${results.filter(Boolean).length}/${results.length}`);
await browser.close(); server.close();
