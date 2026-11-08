# HANDOFF v2: MAB-PDF (serah-terima antar sesi Claude)

Lanjutan dari `HANDOFF.md` (v1). Baca bagian 1 sampai 3 dulu, lalu kerjakan bagian 5 dari atas. Untuk konteks produk, struktur proyek, dan pelajaran teknis lama, tetap rujuk `HANDOFF.md` di repo; dokumen ini hanya mencatat **apa yang berubah** dan **apa yang tersisa**.

## 1. Konteks singkat (tidak berubah)

- **Produk:** MAB-PDF, utilitas PDF gratis, diproses 100% di browser pengguna (tanpa server pemroses, bisa PWA). Repo: https://github.com/muhammadaslambik/mab-pdf (branch `main`). Lingkungan pemilik: Windows, VS Code, PowerShell, Edge. Bahasa komunikasi dan UI: **Indonesia**.
- **Cara kerja pemilik:** paket siap pasang berupa ZIP bernama **unik** (`mab-pdf-vNN.zip`, versi berikutnya: **v13**), sertakan perintah PowerShell, jawab ringkas, kerjakan bertahap, serahkan hasil lebih awal. Sesi chat sering terlalu panjang dan token habis, jadi hindari penjelasan panjang.
- **Tujuan baru yang ditegaskan pemilik:** biaya server tetap nol saat dikomersialkan, ringan di semua perangkat, kualitas tidak boleh turun, dan **model/berkas AI tidak boleh diunduh berulang** (membebani disk C).
- **Hosting:** situs sudah bisa dibuka di `https://mab-app.eu.org/mab-pdf/`. Proyek Cloudflare Pages `mab-pdf` (`mab-pdf.pages.dev`) sedang disiapkan (Framework preset Vite, build `npm run build`, output `dist`, env `NODE_VERSION=20`). **URL/deploy ditangani sesi lain; jangan dikerjakan di sini kecuali diminta.**

## 2. Kontrak kerja dengan sandbox (penting)

- Sandbox **tanpa internet dan tanpa React/Vite/pdf-lib**. Yang bisa diuji: cek tipe dengan `tsc --noEmit --skipLibCheck` pada berkas murni, dan uji logika dengan `node --experimental-strip-types` (inti pemrosesan dibuat **tanpa DOM** agar bisa diuji di Node dengan data sintetis).
- Verifikasi akhir selalu di mesin pemilik: `npm run build` lalu `npm run dev`. Build terakhir (v12) **lolos**: 337 modul, precache PWA **1.246 KiB** (turun dari 2.948 KiB).
- `Compress-Archive` PowerShell **meratakan struktur folder** dan **gagal total jika satu nama berkas salah**. ZIP dari pemilik berisi berkas datar; pasang kembali ke path aslinya.
- Peringatan `pdf-lib dynamically imported ... also statically imported` di log build tidak berbahaya (diabaikan). Peringatan LF/CRLF juga tidak berbahaya (`core.safecrlf false` sudah diset).

## 3. Yang selesai di sesi ini

### 3.1 Commit ke GitHub
- `51ab1c1`: v4 (redesain, alat baru, editor, AI offline, build produksi terverifikasi). Workflow Actions hijau.
- `9be794f`: penyimpanan AI efisien + precache dirampingkan + panel penyimpanan (paket v12). Scan Studio (v5 sampai v11) tampaknya sudah ter-commit lebih dulu karena commit ini hanya memuat 9 berkas AI. **Verifikasi dengan `git log --oneline -8`**.

### 3.2 Scan Studio (alat `scan`, kategori Atur PDF, status beta)
Ditulis dari nol dan **dipakai nyata oleh pemilik** (foto surat kusut, 3 halaman, PDF 1,8 MB terbentuk dan terbuka).

Arsitektur (`mab-pdf-v10`):
- `src/lib/scanCore.ts`: **murni, tanpa DOM**. Deteksi tepi (Otsu + komponen terang terbesar + 4 titik ekstrem), homografi + bilinear, peta latar (`bgField`, nilai maks per petak, dihaluskan), filter `auto|orig|doc|bw|gray`, luruskan teks (`estimateSkew`, proyeksi baris), putar, `createEngine()` yang menyimpan sumber per halaman (penuh + salinan pratinjau 1000 px).
- `src/lib/scan.worker.ts`: pembungkus tipis; menerima `{rid, op, args}`, mengembalikan hasil dengan transfer buffer.
- `src/lib/scan.ts`: klien worker (cadangan di thread utama bila Worker tidak ada), `toCanvas`, `buildPdf(count, getPage, size, margin)` yang memproses **satu halaman sekaligus** (memori puncak = satu halaman).
- `src/components/ScanStudio.tsx` + `scan.css`: kamera `getUserMedia`, "Tambah foto", 4 titik sudut yang bisa diseret (pointer events), pratinjau di worker (satu permintaan berjalan, yang terbaru menang), filter **Cerdas** (default), Asli, Dokumen, Hitam-putih (penggeser "Kepekaan tinta"), Abu-abu, putar, geser urutan, hapus, ekspor A4/Letter/sesuai gambar.
- Entri `scan` di `registry.ts` diganti lewat `scripts/apply-scan.mjs` (`custom: () => import('../components/ScanStudio')`, `minFiles: 0`).

Mode **Cerdas** (`smart()` di scanCore): meratakan cahaya per kanal, membaca isi (porsi gelap, warna jenuh), memutihkan kertas dengan kurva halus, mempertahankan warna cap/tinta bila ada, membuat tinta netral bila tidak ada warna, meluruskan teks 0,3 sampai 5 derajat. **Ini algoritma, bukan jaringan saraf.** Hasilnya dinilai pemilik "mantap".

Ukuran di sandbox (foto 4,3 MP sintetis): deteksi ±50 ms, pratinjau Cerdas ±230 ms, ekspor ±0,5 detik/halaman. **Belum diukur di HP.**

### 3.3 Penyimpanan AI dan cache (`mab-pdf-v12`)
- `src/lib/storage.ts` (baru, diimpor di `main.tsx` oleh `scripts/apply-ai.mjs`): `storageInfo`, `ensurePersist`, `cachedModelIds` (membaca cache `webllm/model` tanpa memuat pustaka AI), `removeModels`, `clearOcrData` (IndexedDB `keyval-store`), `pruneLegacyCaches` (menghapus cache sisa versi lama seperti `mab-v4` saat idle).
- `src/lib/ai.ts` (ditulis ulang bagian WebLLM): versi pustaka **dikunci** (di-resolve sekali lewat `data.jsdelivr.com`, disimpan di localStorage `mab-webllm-ver`); varian model dipilih sesuai dukungan `shader-f16` (agar tidak mengunduh bobot yang gagal dimuat); cek ruang kosong sebelum mengunduh; minta penyimpanan permanen; **satu model saja di disk** (model lain dihapus setelah model baru sukses dimuat); pilihan ukuran model **dibagi antar alat** (`localStorage mab-ai-tier`); model dilepas dari RAM/GPU setelah 5 menit idle; progres jujur ("Memuat dari penyimpanan lokal (tanpa unduh)").
- `src/components/AiStorage.tsx` (baru, dipasang di `AiSummarize`, `AiAsk`, `AiTranslate` saat mesin WebLLM dipilih): status penyimpanan permanen, daftar model + tombol Hapus, hapus data bahasa OCR.
- `vite.config.ts`: precache **tidak** lagi memuat `pdf.worker*` dan `pptxgen*` (disimpan saat pertama dipakai, cache `mab-heavy`), `cleanupOutdatedCaches`, cache CDN `mab-cdn` hanya untuk `cdn.jsdelivr.net` (tessdata dikeluarkan agar tidak ganda dengan IndexedDB tesseract; **bobot model tidak boleh di-cache ganda di SW**).

### 3.4 Analisis biaya dan lisensi (jawaban untuk pemilik, belum ada perubahan kode)
- Cloudflare Pages (gratis): bandwidth tak terbatas, penggunaan komersial diizinkan, batas 25 MiB/berkas, 20.000 berkas, 500 build/bulan. Sumber: ringkasan pihak ketiga; **pemilik perlu membaca Cloudflare Terms resmi sebelum menarik pembayaran**.
- **GitHub Pages dan Vercel Hobby tidak boleh untuk komersial.** Jangan menarik pembayaran selagi di sana.
- `license-checker --production --summary`: MIT 35, Apache-2.0 5, ISC 3, 0BSD 1, BSD-2 1, (MIT AND Zlib) 1, (MIT OR GPL-3.0-or-later) 1, **UNLICENSED 1**. Dugaan: UNLICENSED = paket `mab-pdf` sendiri (`private: true`).
- Lisensi kode proyek saat ini **AGPL-3.0-or-later** (`package.json`). Pemilik adalah pemegang hak cipta tunggal sehingga boleh melisensikan ulang, tetapi AGPL membolehkan siapa pun menyalin dan menjalankan versi komersial sendiri. Keputusan lisensi **belum diambil**. Rencana Ghostscript-wasm (AGPL) untuk PDF/A bertentangan dengan rencana kode tertutup.

## 4. Hal yang BELUM terverifikasi (jangan dianggap pasti bekerja)

- **Unduhan AI tidak berulang** (inti permintaan pemilik): kode ada dan logika cache lolos simulasi, tetapi **belum dicoba di browser**. Uji: jalankan satu ringkasan model Ringan, tutup tab, ulangi; pesan harus "Memuat dari penyimpanan lokal (tanpa unduh)". Jika masih mengunduh, minta screenshot F12, Application, Cache storage.
- Nama cache WebLLM (`webllm/model`, `webllm/wasm`, `webllm/config`) dan pola alamat berkas `huggingface.co/mlc-ai/<ID>-MLC/resolve/...` **disimpulkan** dari screenshot dan ingatan. Jika tombol Hapus di panel tidak mengurangi ukuran, periksa pola di `matchesModel` (`storage.ts`).
- `webllm@0.2` di-resolve via `data.jsdelivr.com/v1/package/resolve/...` (CORS diasumsikan terbuka). Jika gagal, kode jatuh ke `@0.2` (tidak terkunci).
- `navigator.storage.persist()` mungkin ditolak di `localhost`; di situs terpasang/PWA biasanya diterima.
- Scan Studio: **kamera dan sentuh di HP belum diuji** (kamera butuh HTTPS atau localhost). Apakah `ToolPage` menampilkan alat `custom` dengan `minFiles: 0` tanpa file lebih dulu: **belum dipastikan** (foto yang dijatuhkan di dropzone tetap masuk lewat prop `files`).
- Deteksi sudut gagal pada bayangan yang sama gelapnya dengan latar (kasus ekstrem sintetis); koreksi manual lewat titik sudut.
- Hitam-putih memotong tulisan sangat pudar pada kepekaan tinggi (ada penggeser); filter Cerdas/Dokumen lebih aman untuk kertas kusut.
- Pemrosesan Kompres, PDF ke Gambar, OCR masih di **thread utama** (lihat 5.P1).
- Item lama di `HANDOFF.md` bagian 6 (tesseract.js, qpdf-wasm, WebLLM, PDF/A, tema di Safari/Firefox) tetap belum terverifikasi.

## 5. BELUM dikerjakan (urut prioritas)

### P0
1. **Pemilik menguji unduhan AI tidak berulang** (lihat bagian 4) dan memastikan Cloudflare Pages ter-deploy serta service worker baru aktif (Ctrl+F5 atau F12, Application, Service workers, Update). Cache `mab-v4` harus hilang, ukuran `workbox-precache` sekitar 1,2 MB.
2. **Uji Scan Studio di HP sungguhan** (kamera, seret sudut dengan jari, waktu ekspor per halaman).

### P1
3. **Pindahkan Kompres, PDF ke Gambar, dan OCR ke Web Worker.** Pemilik sudah membuat `mab-src-worker-v1.zip` di `Downloads` (berisi `convert.ts`, `secure.ts`, `types.ts`, `pdf.ts`, `pdfImages.ts`, `util.ts`, `ToolPage.tsx`) tetapi **belum mengunggahnya**. Minta unggah, lalu: pakai pola yang sama dengan Scan Studio (inti murni + worker + klien dengan cadangan di thread utama), pertahankan tombol **Batalkan** (`RunCtx.check`) dan progres (`RunCtx.progress`), hasil harus identik. pdf.js sudah memakai worker sendiri untuk parsing, tetapi `renderPage` dan kompresi gambar berjalan di main thread; pertimbangkan `OffscreenCanvas`. OCR (tesseract.js) sudah memakai worker sendiri; yang membebani adalah render halaman 2,8x, jadi evaluasi dulu sebelum memindahkan.
4. **Mode hemat otomatis** untuk perangkat lemah (`navigator.deviceMemory`, `hardwareConcurrency`): jangan menurunkan kualitas hasil secara diam-diam; cukup batasi konkurensi dan tampilkan progres.
5. **Keputusan lisensi** dan pemeriksaan: jalankan `npx license-checker --production --excludePrivatePackages --summary`; jika UNLICENSED masih ada, `--json` dan cari nama paketnya. Cek lisensi tiap model AI yang ditawarkan (Qwen2.5, Llama-3.2) untuk penggunaan komersial. Sarankan konsultasi hukum singkat.
6. **Font Unicode** (`@pdf-lib/fontkit` + Noto Sans subset, dimuat malas), dari HANDOFF v1 P1.6.
7. **Bandingkan:** mode geser (slider) dan kotak penanda perbedaan (HANDOFF v1 P1.7).
8. Scan Studio tahap B: deteksi tepi untuk latar rumit, penghapus bintik kecil di Hitam-putih, dan poles tampilan HP.

### P2
9. Semua item P2 di `HANDOFF.md` v1 (pra-pemrosesan OCR, PDF ke Word/Excel, PDF/A yang mempertahankan teks, tanda tangan digital bersertifikat, pencarian semantik).
10. Opsi AI neural untuk pindaian (penghilang bayangan/peluruskan lengkungan) sebagai unduhan terpisah yang opt-in; hanya jika Scan Studio sudah stabil di HP.
11. Kebijakan monetisasi tanpa server (Lemon Squeezy/Paddle/Gumroad, domain milik sendiri) bila pemilik memutuskan komersial.

## 6. Pelajaran teknis baru

- Inti pemrosesan piksel ditulis **murni** (`{w, h, d: Uint8ClampedArray}`), lalu dibungkus worker dan, bila perlu, diuji di Node dengan gambar sintetis. Pola ini cepat diverifikasi di sandbox.
- Kirim piksel ke worker dengan **transfer buffer**; lepaskan kanvas setelah `getImageData` (`canvas.width = 0`) untuk menghemat memori di HP.
- Pratinjau interaktif: **satu permintaan berjalan, yang terbaru menang** (flag `busy`/`dirty`), jangan antrikan setiap perubahan.
- `bgField` per baris (tabel `X0/X1/TX` dihitung sekali) jauh lebih cepat daripada closure per piksel; sampling selang-satu pada pembangunan peta latar tidak menurunkan kualitas.
- Ambang tetap (nilai gelap absolut) gagal pada foto nyata; gunakan **estimasi latar lokal + median global** (`floor = max(60, median * 0.6)`).
- Cache API dan origin: `localhost:5173`, `localhost:5174`, `mab-app.eu.org`, dan `pages.dev` masing-masing punya penyimpanan sendiri, sehingga model AI diunduh sekali **per alamat**. Anjurkan pemilik memakai satu alamat untuk pemakaian harian dan menghapus sisanya di `edge://settings/siteData`.
- Jangan menambah alamat Hugging Face ke `runtimeCaching` service worker: bobot model sudah dicache WebLLM, jadi akan tersimpan ganda.
- ZIP tidak boleh menimpa berkas yang tidak diubah; sertakan hanya berkas baru/berubah, dan skrip `apply-*.mjs` yang idempotent untuk mengedit berkas yang tidak dilihat (contoh: `registry.ts`, `main.tsx`).

## 7. Berkas baru/berubah sesi ini (peta cepat)

```
src/lib/scanCore.ts        inti pindaian murni (tanpa DOM)
src/lib/scan.worker.ts     worker
src/lib/scan.ts            klien worker, toCanvas, buildPdf
src/components/ScanStudio.tsx + scan.css
src/lib/storage.ts         penyimpanan/cache browser
src/lib/ai.ts              (WebLLM ditulis ulang)
src/components/AiStorage.tsx
src/components/AiSummarize.tsx, AiAsk.tsx, AiTranslate.tsx   (memasang AiStorage)
src/main.tsx               (import './lib/storage')
vite.config.ts             (workbox: globIgnores, runtimeCaching, cleanupOutdatedCaches)
scripts/apply-scan.mjs, scripts/apply-ai.mjs   pemasang idempotent
```

## 8. Hasil build terakhir (mesin pemilik, v12)

| Ukuran | Nilai |
|---|---|
| Modul | 337 |
| Muat awal (JS, gzip) | 70,2 kB (anggaran 130 kB di `scripts/check-size.mjs`) |
| Precache PWA | 1.245,71 KiB, 50 berkas |
| Chunk terbesar (malas) | `pdf.worker` 1.375 kB, `PDFButton` 430 kB, `pptxgen` 372 kB, `pdf` 334 kB |
