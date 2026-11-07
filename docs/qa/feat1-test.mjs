import { start, b64, D } from './lib-test.mjs';
const T = await start(8130);
const page = await T.newPage();
await page.goto(T.base); await page.waitForSelector('.tile');
// 1. tema
const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
T.ok('tema awal terpasang', ['light', 'dark'].includes(await theme()));
await page.click('.theme .icon-btn'); await page.click('text=Nyaman (sepia)');
T.ok('tema Nyaman', (await theme()) === 'comfort');
T.ok('tema tersimpan', (await page.evaluate(() => localStorage.getItem('mab-theme'))) === 'comfort');
await page.reload(); await page.waitForSelector('.tile'); T.ok('tema bertahan setelah reload', (await theme()) === 'comfort');
const bg = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--paper').trim());
T.ok('warna Nyaman bukan putih murni', bg === '#e8dcc0', bg);
await page.click('.theme .icon-btn'); await page.click('text=Gelap'); T.ok('tema Gelap', (await theme()) === 'dark');
await page.click('.theme .icon-btn'); await page.click('text=Otomatis'); T.ok('kembali Otomatis', (await page.evaluate(() => localStorage.getItem('mab-theme'))) === null);

// 2. pemilih tindakan lewat file
const mk = (name, b, type) => page.evaluate(([n, b, t]) => { const bin = atob(b); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); window.__f = new File([u], n, { type: t }); }, [name, b, type]);
await mk('laporan.pdf', b64('doc.pdf'), 'application/pdf');
await page.evaluate(() => window.dispatchEvent(new CustomEvent('mab:files', { detail: [window.__f] })));
await page.waitForSelector('.modal');
const names = await page.locator('.choose b').allInnerTexts();
T.ok('pemilih tindakan untuk PDF', names.includes('Kompres PDF') && names.includes('Pisahkan PDF') && !names.includes('JPG ke PDF'), names.slice(0, 5).join(', '));
T.ok('Gabungkan tidak ditawarkan untuk 1 file', !names.includes('Gabungkan PDF'));
await page.click('.choose:has-text("Kompres PDF")');
await page.waitForSelector('main.tool .files');
T.ok('file otomatis terpasang di alat', (await page.locator('.files .fname').innerText()) === 'laporan.pdf');
// 3. seret-lepas ke jendela (beranda)
await page.goto(T.base); await page.waitForSelector('.tile');
await page.evaluate(() => { const f = window.__f ?? null; });
await mk('a.docx', b64('t.docx'), '');
await page.evaluate(() => { const dt = new DataTransfer(); dt.items.add(window.__f); const ev = (t) => new DragEvent(t, { dataTransfer: dt, bubbles: true, cancelable: true }); window.dispatchEvent(ev('dragenter')); window.dispatchEvent(ev('dragover')); window.__veil = !!document.querySelector('.drop-veil'); window.dispatchEvent(ev('drop')); });
await page.waitForSelector('.modal');
T.ok('overlay seret muncul saat menyeret', await page.evaluate(() => window.__veil));
T.ok('docx ditawarkan WORD ke PDF', (await page.locator('.choose b').allInnerTexts()).includes('WORD ke PDF'));
await page.keyboard.press('Escape'); T.ok('Esc menutup pemilih', (await page.locator('.modal').count()) === 0);
// 4. tempel gambar
await mk('foto.png', b64('img.png'), 'image/png');
await page.evaluate(() => { const dt = new DataTransfer(); dt.items.add(window.__f); const e = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }); document.body.dispatchEvent(e); });
await page.waitForSelector('.modal'); T.ok('tempel gambar menawarkan JPG ke PDF', (await page.locator('.choose b').allInnerTexts()).includes('JPG ke PDF'));
await T.done();
