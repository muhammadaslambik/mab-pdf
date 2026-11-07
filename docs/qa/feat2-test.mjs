import { start, D } from './lib-test.mjs';
import fs from 'fs';
const T = await start(8132);
const page = await T.newPage();
const go = async (id) => { await page.goto(T.base); await page.evaluate((i) => { location.hash = '#/tool/' + i; }, id); await page.waitForSelector('main.tool'); };
const upload = (f) => page.locator('input[type=file]').first().setInputFiles(f.map(D));
const dl = async (btn) => { const [d] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), btn.click()]); const p = '/home/claude/t/out/dl2_' + d.suggestedFilename(); await d.saveAs(p); return p; };

// Tanya Dokumen
await go('ask'); await upload(['doc.pdf']); await page.waitForSelector('input[aria-label=Pertanyaan]', { timeout: 20000 });
await page.fill('input[aria-label=Pertanyaan]', 'berapa harga pensil?'); await page.keyboard.press('Enter');
await page.waitForSelector('.qa-quick li, .qa .hint', { timeout: 10000 });
const ans = await page.locator('.qa').first().innerText();
T.ok('Tanya Dokumen menemukan bagian relevan', /hlm\. 1/.test(ans) && /Pensil|Harga|2\.500/i.test(ans), ans.replace(/\n/g, ' ').slice(0, 100));
T.ok('istilah disorot', (await page.locator('.qa mark').count()) > 0);

// Metadata
await go('metadata'); await upload(['doc.pdf']); await page.waitForSelector('.meta-grid');
T.ok('Info PDF tampil', /halaman/i.test(await page.locator('.meta-grid').innerText()));
await page.fill('#m-title', 'Judul Baru MAB'); await page.fill('#m-author', 'Budi');
await page.getByRole('button', { name: 'Simpan metadata' }).click();
let btn = page.locator('.done .btn-primary').first(); await btn.waitFor(); let f = await dl(btn);
const meta = (await import('child_process')).execSync(`python3 -c "import pikepdf;p=pikepdf.open('${f}');print(p.docinfo.get('/Title'),'|',p.docinfo.get('/Author'))"`).toString().trim();
T.ok('metadata tersimpan', meta === 'Judul Baru MAB | Budi', meta);
await go('metadata'); await upload(['doc.pdf']); await page.waitForSelector('.meta-grid');
await page.getByRole('button', { name: /Hapus semua metadata/ }).click(); btn = page.locator('.done .btn-primary').first(); await btn.waitFor(); f = await dl(btn);
const clean = (await import('child_process')).execSync(`python3 -c "import pikepdf;p=pikepdf.open('${f}');print(len(p.docinfo.keys()), '/Metadata' in p.Root)"`).toString().trim();
T.ok('metadata dibersihkan total', clean === '0 False', clean);

// alat generik baru lewat UI
const generic = [['blank-pages', 'blank.pdf', 'Hapus halaman kosong'], ['resize', 'doc.pdf', 'Ubah ukuran'], ['nup', 'eight.pdf', 'Susun lembar'], ['extract-images', 'photos.pdf', 'Ekstrak gambar'], ['pdf-to-text', 'doc.pdf', 'Ekstrak teks'], ['compress', 'photos.pdf', 'Kompres']];
for (const [id, file, label] of generic) {
  await go(id); await upload([file]); await page.getByRole('button', { name: label, exact: true }).click();
  btn = page.locator('.done .btn-primary').first(); await btn.waitFor({ timeout: 60000 }); f = await dl(btn);
  const note = await page.locator('.done .hint').first().innerText().catch(() => '');
  T.ok(id, fs.statSync(f).size > 200, note.slice(0, 70));
}
// kompres: ringkasan ukuran
T.ok('Kompres menampilkan hemat ukuran', /→/.test(await page.locator('.sizes').innerText().catch(() => '')) );
// split chunk & pdf->gambar png
await go('split'); await upload(['eight.pdf']); await page.selectOption('#f-mode', 'chunk'); await page.fill('#f-n', '3'); await page.getByRole('button', { name: 'Pisahkan' }).click();
btn = page.locator('.done .btn-primary').first(); await btn.waitFor(); f = await dl(btn); T.ok('Pisahkan per N halaman', /pisah\.zip$/.test(f));
await T.done();
