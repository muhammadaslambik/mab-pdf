import { start, D } from './lib-test.mjs';
import fs from 'fs'; import { execSync } from 'child_process';
const T = await start(8133, { viewport: { width: 1280, height: 1600 } });
const page = await T.newPage();
const go = async (id) => { await page.goto(T.base); await page.evaluate((i) => { location.hash = '#/tool/' + i; }, id); await page.waitForSelector('main.tool'); };
const upload = (f) => page.locator('input[type=file]').first().setInputFiles(f.map(D));
const dl = async (btn) => { const [d] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), btn.click()]); const p = '/home/claude/t/out/dl3_' + d.suggestedFilename(); await d.saveAs(p); return p; };
const stage = async () => { await page.evaluate(() => document.querySelector('.ann-stage').scrollIntoView()); await page.waitForTimeout(150); return page.locator('.ann-stage svg').boundingBox(); };
const tool = (name) => page.locator('.ann-bar button', { hasText: name }).first().click();
const py = (code) => execSync(`python3 -c "${code}"`).toString().trim();
const words = (f, w) => execSync(`python3 /home/claude/t/pw.py ${f} '${JSON.stringify(w)}'`).toString().trim();
const save = async (label = 'Simpan PDF') => { await page.getByRole('button', { name: label }).click(); const b = page.locator('.done .btn-primary').first(); await b.waitFor({ timeout: 40000 }); return dl(b); };

// ===== 1. teks, geser, ubah ukuran =====
await go('edit-pdf'); await upload(['doc.pdf']); await page.waitForSelector('.ann-stage img'); await page.waitForTimeout(500);
let st = await stage();
await page.mouse.click(st.x + 150, st.y + 300);
await page.locator('.ann-text').fill('GESER'); await page.keyboard.press('Enter');
await tool('Pilih & geser');
const t0 = await page.locator('text[data-id]').first().boundingBox();
await page.mouse.move(t0.x + t0.width / 2, t0.y + t0.height / 2); await page.mouse.down(); await page.mouse.move(t0.x + t0.width / 2 + 120, t0.y + t0.height / 2 + 90, { steps: 6 }); await page.mouse.up();
const t1 = await page.locator('text[data-id]').first().boundingBox();
T.ok('objek bisa digeser', Math.abs(t1.x - t0.x - 120) < 6 && Math.abs(t1.y - t0.y - 90) < 6, `dx=${Math.round(t1.x - t0.x)} dy=${Math.round(t1.y - t0.y)}`);
const h = page.locator('.handle').first(); const hb = await h.boundingBox();
await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await page.mouse.down(); await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2 + 40, { steps: 5 }); await page.mouse.up();
const t2 = await page.locator('text[data-id]').first().boundingBox();
T.ok('ukuran bisa diubah dengan pegangan', t2.height > t1.height * 1.3, `${Math.round(t1.height)} -> ${Math.round(t2.height)}`);
// gaya tebal + warna
await page.locator('.ann-bar button[aria-label=Tebal]').click();
T.ok('gaya tebal diterapkan ke objek terpilih', (await page.locator('text[data-id]').first().getAttribute('font-weight')) === '700');
// elips + panah
await tool('Elips'); st = await stage(); await page.mouse.move(st.x + 60, st.y + 60); await page.mouse.down(); await page.mouse.move(st.x + 200, st.y + 130, { steps: 4 }); await page.mouse.up();
await tool('Panah'); st = await stage(); await page.mouse.move(st.x + 300, st.y + 80); await page.mouse.down(); await page.mouse.move(st.x + 420, st.y + 160, { steps: 4 }); await page.mouse.up();
T.ok('3 objek tercatat', /3 objek/.test(await page.locator('.ann-nav span').innerText()));
// hapus lewat keyboard
await tool('Pilih & geser'); const el = await page.locator('ellipse[data-id]').first().boundingBox();
await page.mouse.click(el.x + el.width / 2, el.y + 2); await page.keyboard.press('Delete');
T.ok('Delete menghapus objek terpilih', /2 objek/.test(await page.locator('.ann-nav span').innerText()));
let f = await save();
T.ok('PDF hasil edit valid', py(`import pikepdf;print(len(pikepdf.open('${f}').pages))`) === '1');
T.ok('teks GESER ada di PDF', /GESER/.test(py(`import pdfplumber;print(pdfplumber.open('${f}').pages[0].extract_text())`)));

// ===== 2. edit teks yang sudah ada =====
await go('edit-pdf'); await upload(['doc.pdf']); await page.waitForSelector('.ann-stage img'); await page.waitForTimeout(500);
await tool('Edit teks PDF'); await stage();
const nBoxes = await page.locator('.tbox').count(); T.ok('kotak teks terdeteksi di halaman', nBoxes >= 5, `${nBoxes} baris`);
const first = page.locator('.tbox').first(); const fb = await first.boundingBox(); await page.mouse.click(fb.x + fb.width / 2, fb.y + fb.height / 2);
const prefill = await page.locator('.ann-text').inputValue(); T.ok('input terisi teks asli', /Laporan Keuangan/.test(prefill), prefill);
await page.locator('.ann-text').fill('Laporan ANGGARAN Q4'); await page.keyboard.press('Enter');
T.ok('penutup + teks baru tercatat', /2 objek/.test(await page.locator('.ann-nav span').innerText()));
f = await save();
const note = await page.locator('.done .hint').first().innerText();
T.ok('peringatan privasi tampil', /Samarkan/.test(note));
T.ok('teks baru ada di PDF', /ANGGARAN/.test(py(`import pdfplumber;print(pdfplumber.open('${f}').pages[0].extract_text())`)));
await page.screenshot({ path: '/home/claude/t/out/edit_text.png' });
execSync(`pdftoppm -r 60 -png -f 1 -l 1 ${f} /home/claude/t/out/edited`);

// ===== 3. tanda tangan =====
await go('sign'); await upload(['doc.pdf']); await page.waitForSelector('.sigmaker'); await page.waitForSelector('.ann-stage img');
await page.getByRole('tab', { name: 'Ketik' }).click(); await page.fill('input[aria-label="Nama untuk tanda tangan"]', 'Budi Santoso');
await page.waitForSelector('.sig-prev'); await page.getByRole('button', { name: 'Pakai tanda tangan ini' }).click();
await page.waitForTimeout(300); st = await stage();
await page.mouse.click(st.x + st.width * 0.65, st.y + st.height * 0.8);
T.ok('tanda tangan ditempatkan & terpilih', /1 objek/.test(await page.locator('.ann-nav span').innerText()) && (await page.locator('.handle').count()) === 1);
await page.getByRole('button', { name: 'Sisipkan tanggal' }).click(); st = await stage(); await page.mouse.click(st.x + st.width * 0.65, st.y + st.height * 0.9);
T.ok('tanggal disisipkan', /2 objek/.test(await page.locator('.ann-nav span').innerText()));
T.ok('tanda tangan tersimpan di perangkat', (await page.evaluate(() => JSON.parse(localStorage.getItem('mab-signatures') ?? '[]').length)) === 1);
f = await save('Simpan PDF bertanda tangan');
T.ok('PDF berisi gambar tanda tangan + tanggal', py(`import pikepdf;p=pikepdf.open('${f}');print(len(list(p.pages[0].images.keys())))`) === '1' && /2026/.test(py(`import pdfplumber;print(pdfplumber.open('${f}').pages[0].extract_text())`)));
// tanda tangan tersimpan terpakai ulang
await go('sign'); await upload(['doc.pdf']); await page.waitForSelector('.sig-saved');
T.ok('tanda tangan tersimpan muncul lagi', (await page.locator('.sig-thumb img').count()) === 1);
await T.done();
