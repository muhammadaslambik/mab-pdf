import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs'; import http from 'http'; import path from 'path';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const f = path.join('/home/claude/t', decodeURIComponent(req.url.split('?')[0]));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] ?? 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(8124, r));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1100, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message.slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push('CONSOLE ' + m.text().slice(0, 200)); });
await page.addInitScript(() => { for (const C of [Map, WeakMap]) { C.prototype.getOrInsertComputed ??= function (k, f) { if (!this.has(k)) this.set(k, f(k)); return this.get(k); }; C.prototype.getOrInsert ??= function (k, v) { if (!this.has(k)) this.set(k, v); return this.get(k); }; } });
const base = 'http://localhost:8124/out/app/index.html';
const D = (f) => '/home/claude/t/data/' + f;
const results = [];
const ok = (name, cond, extra = '') => { results.push(cond); console.log(cond ? 'PASS' : 'FAIL', name, extra); };
const dl = async (btn) => { const [d] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), btn.click()]); const p = '/home/claude/t/out/dl_' + d.suggestedFilename(); await d.saveAs(p); return p; };
const go = async (id) => { await page.goto(base + '#/tool/' + id); await page.waitForSelector('main.tool', { timeout: 10000 }); };
const upload = async (files) => { await page.locator('input[type=file]').first().setInputFiles(files.map(D)); };

// 1. Beranda
await page.goto(base); await page.waitForSelector('.tile');
const tiles = await page.locator('.tile').count();
ok('Beranda: jumlah alat', tiles === 40, `(${tiles})`);
ok('Logo MAB-PDF', (await page.locator('.logo').innerText()).trim() === 'MAB-PDF');
ok('Tidak ada label "Segera"', (await page.locator('.badge.soon').count()) === 0);
await page.fill('.hero-search input', 'gabung'); ok('Pencarian "gabung"', (await page.locator('.tile').count()) === 1);

// 2. Semua halaman alat terbuka tanpa error
const ids = await page.evaluate(async () => [...document.querySelectorAll('.tile')].length);
await page.fill('.hero-search input', '');
const hrefs = await page.locator('.tile').evaluateAll((els) => els.map((e) => e.getAttribute('href').replace('#/tool/', '')));
let opened = 0;
for (const id of hrefs) { await go(id); const h = await page.locator('h1').first().innerText(); if (h.length) opened++; }
ok('Semua halaman alat terbuka', opened === hrefs.length, `(${opened}/${hrefs.length})`);

// 3. Gabungkan
await go('merge'); await upload(['doc.pdf', 'sheet.pdf']);
await page.getByRole('button', { name: 'Gabungkan', exact: true }).click();
let btn = page.locator('.done .btn-primary').first(); await btn.waitFor({ timeout: 30000 });
let f = await dl(btn); ok('Gabungkan PDF', fs.statSync(f).size > 1000, require_pages(f));
function require_pages(f) { return ''; }

// 4. Proteksi
await go('protect'); await upload(['doc.pdf']);
await page.locator('#f-user').fill('rahasia9'); await page.getByRole('button', { name: 'Kunci PDF' }).click();
btn = page.locator('.done .btn-primary').first(); await btn.waitFor({ timeout: 30000 }); f = await dl(btn);
ok('Proteksi PDF', fs.statSync(f).size > 1000);

// 5. Word ke PDF, Excel ke PDF, HTML ke PDF (tempel), PPT ke PDF
for (const [id, file, label] of [['word-to-pdf', 't.docx', 'Ubah ke PDF'], ['excel-to-pdf', 't.xlsx', 'Ubah ke PDF'], ['ppt-to-pdf', 't.pptx', 'Ubah ke PDF']]) {
  await go(id); await upload([file]); await page.getByRole('button', { name: label }).click();
  btn = page.locator('.done .btn-primary').first(); await btn.waitFor({ timeout: 30000 }); f = await dl(btn); ok(id, fs.statSync(f).size > 800);
}
await go('html-to-pdf'); await page.locator('#f-html').fill('<h1>Tempel</h1><p>Isi <b>tebal</b></p>'); await page.getByRole('button', { name: 'Ubah ke PDF' }).click();
btn = page.locator('.done .btn-primary').first(); await btn.waitFor({ timeout: 30000 }); f = await dl(btn); ok('html-to-pdf (tempel)', fs.statSync(f).size > 800);

// 6. PDF ke Word / Excel / PPT / Markdown
for (const [id, file, label] of [['pdf-to-word', 'doc.pdf', 'Ubah ke Word'], ['pdf-to-excel', 'sheet.pdf', 'Ubah ke Excel'], ['pdf-to-ppt', 'doc.pdf', 'Ubah ke PowerPoint'], ['pdf-to-markdown', 'doc.pdf', 'Ubah ke Markdown'], ['repair', 'badxref.pdf', 'Perbaiki'], ['pdf-to-pdfa', 'doc.pdf', 'Ubah ke PDF/A']]) {
  await go(id); await upload([file]); await page.getByRole('button', { name: label }).click();
  btn = page.locator('.done .btn-primary').first(); await btn.waitFor({ timeout: 60000 }); f = await dl(btn); ok(id, fs.statSync(f).size > 500, path.basename(f));
}

// 7. Buka kunci
await go('unlock'); await upload(['enc.pdf']); await page.locator('#f-password').fill('rahasia123'); await page.getByRole('button', { name: 'Buka kunci' }).click();
btn = page.locator('.done .btn-primary').first(); await btn.waitFor({ timeout: 60000 }); f = await dl(btn); ok('unlock', fs.statSync(f).size > 500);

// 8. Edit PDF: tambah teks
await go('edit-pdf'); await upload(['doc.pdf']); await page.waitForSelector('.ann-stage img', { timeout: 20000 });
await page.waitForTimeout(500);
await page.evaluate(() => document.querySelector('.ann-stage').scrollIntoView());
await page.waitForTimeout(200);
const stage = await page.locator('.ann-stage svg').boundingBox();
await page.mouse.click(stage.x + stage.width * 0.3, stage.y + 300);
await page.locator('.ann-text').fill('HALO MAB'); await page.keyboard.press('Enter');
await page.getByRole('button', { name: 'Kotak', exact: true }).click();
await page.evaluate(() => document.querySelector('.ann-stage').scrollIntoView()); await page.waitForTimeout(200);
const st2 = await page.locator('.ann-stage svg').boundingBox();
await page.mouse.move(st2.x + 50, st2.y + 50); await page.mouse.down(); await page.mouse.move(st2.x + 200, st2.y + 120, { steps: 5 }); await page.mouse.up();
ok('Edit: objek tercatat', /2 objek/.test(await page.locator('.ann-nav span').innerText()));
await page.getByRole('button', { name: 'Simpan PDF' }).click();
btn = page.locator('.done .btn-primary').first(); await btn.waitFor({ timeout: 30000 }); f = await dl(btn);
ok('Edit PDF', fs.statSync(f).size > 1000, path.basename(f));

// 9. Samarkan: cari kata
await go('redact'); await upload(['doc.pdf']); await page.waitForSelector('.ann-stage img', { timeout: 20000 });
await page.fill('.ann-search input', 'Laporan'); await page.getByRole('button', { name: 'Tandai semua' }).click();
await page.waitForFunction(() => /kemunculan ditandai|tidak ditemukan/.test(document.querySelector('.hint')?.textContent ?? ''), null, { timeout: 15000 });
console.log('   info:', await page.locator('.ann .hint').first().innerText());
await page.getByRole('button', { name: /Samarkan permanen/ }).click();
btn = page.locator('.done .btn-primary').first(); await btn.waitFor({ timeout: 40000 }); f = await dl(btn); ok('Samarkan PDF', fs.statSync(f).size > 1000, path.basename(f));

// 10. Formulir
await go('form'); await upload(['form.pdf']); await page.waitForSelector('.fields input', { timeout: 15000 });
await page.locator('.field input').first().fill('Budi Santoso');
await page.locator('.check input').first().check();
await page.getByRole('button', { name: 'Simpan PDF' }).click();
btn = page.locator('.done .btn-primary').first(); await btn.waitFor({ timeout: 30000 }); f = await dl(btn); ok('Formulir PDF', fs.statSync(f).size > 500, path.basename(f));

// 11. Bandingkan (teks & visual)
await go('compare'); await upload(['doc.pdf', 'doc2.pdf']);
await page.getByRole('button', { name: 'Bandingkan', exact: true }).click();
await page.waitForSelector('.cmp-text', { timeout: 40000 });
console.log('   ', (await page.locator('.cmp-result p').first().innerText()).slice(0, 120));
ok('Bandingkan teks', (await page.locator('.cmp-text ins, .cmp-text del').count()) > 0);
await page.selectOption('#cmpmode', 'visual'); await page.getByRole('button', { name: 'Bandingkan', exact: true }).click();
await page.waitForSelector('.cmp-img', { timeout: 40000 }); ok('Bandingkan visual', true, await page.locator('.ann-nav span').last().innerText());

// 12. Perangkum (ekstraktif)
await go('summarize'); await upload(['doc.pdf']); await page.getByRole('button', { name: 'Rangkum' }).click();
await page.waitForSelector('.ai-list', { timeout: 30000 }); ok('Perangkum AI (ekstraktif)', (await page.locator('.ai-list li').count()) > 0 && (await page.locator('.chips span').count()) >= 4, (await page.locator('.chips').first().innerText()).replace(/\n/g, ' | '));

// 13. Atur PDF (organizer)
await go('organize'); await upload(['doc.pdf']); await page.waitForSelector('.thumb img', { timeout: 20000 });
await page.getByRole('button', { name: 'Simpan PDF' }).click(); btn = page.locator('.done .btn-primary').first(); await btn.waitFor({ timeout: 30000 }); f = await dl(btn); ok('Atur PDF', fs.statSync(f).size > 500);

await page.screenshot({ path: '/home/claude/t/out/app_last.png' });
console.log('\nError browser:', errors.length ? '\n' + [...new Set(errors)].join('\n') : 'tidak ada');
console.log(`\nHASIL: ${results.filter(Boolean).length}/${results.length} lulus`);
await browser.close(); server.close();
