# HANDOFF: MAB-PDF (serah-terima antar sesi Claude)

Dokumen ini ringkasan agar sesi berikutnya bisa melanjutkan **cepat, tepat, dan fokus**. Baca bagian 1 sampai 3 dulu, lalu kerjakan bagian 5 dari atas.

## 1. Konteks proyek

- **Produk:** MAB-PDF, utilitas PDF gratis (setara iLovePDF) yang **diproses 100% di browser pengguna**. Tanpa server pemrosesan, tanpa unggah file, biaya infrastruktur Rp 0, bisa dipasang sebagai PWA.
- **Pemilik:** `muhammadaslambik`. Repo: https://github.com/muhammadaslambik/mab-pdf (branch `main`). Lingkungan pemilik: Windows, VS Code, PowerShell, browser Edge. Bahasa komunikasi dan UI: **Indonesia**.
- **Kebutuhan bisnis:** gratis total, tanpa registrasi, menyala 24/7 walau laptop mati (static hosting), ringan di HP, hasil berkualitas yang menyaingi fitur berbayar.
- **Rencana domain:** MAB-PDF akan hidup di `mab-pdf.pages.dev` (Cloudflare Pages) lalu dihubungkan ke `mab-app.eu.org/mab-pdf`. Domain induk `mab-app.eu.org` adalah rumah semua aplikasi riset/laboratorium pemilik. **Sesi lain sedang mengerjakan URL ini; jangan kerjakan di sini kecuali diminta.**
- **Cara kerja yang disukai pemilik:** berikan paket siap pasang (ZIP dengan nama berkas **unik**, mis. `mab-pdf-v5.zip`, karena nama sama membuat Windows menyimpan sebagai `(1)` dan perintah ekstrak mengambil versi lama), sertakan perintah PowerShell, jawab ringkas. Sesi chat lama sering terlalu panjang: kerjakan bertahap dan serahkan hasil lebih awal.

## 2. Menjalankan dan struktur

```
npm install     # ikut menyalin qpdf-wasm opsional ke public/wasm (scripts/setup-wasm.mjs, tidak pernah menggagalkan install)
npm run dev     # http://localhost:5173
npm run build   # WAJIB dicek di mesin pemilik (lihat 5.P0)
```

Stack: Vite 5 + React 18 + TypeScript, **routing hash** (`#/tool/<id>`), `base: './'`, vite-plugin-pwa. Library utama: `pdf-lib` 1.17.1, `pdfjs-dist` **4.10.38** (jangan naikkan tanpa menguji `render({canvas})`), `fflate`, `pptxgenjs` 4.0.1, `tesseract.js` 5.1.1. Pustaka AI (WebLLM) dimuat **dari CDN saat dibutuhkan**, bukan dependensi npm.

```
src/
  App.tsx                 shell: header, tema, seret-lepas/tempel global, pemilih tindakan, toast offline
  components/
    Home.tsx              hero, bilah kategori sticky, pencarian mini (ikon di kanan), grid alat
    ToolPage.tsx          halaman alat generik (dropzone, opsi dari ToolDef, progres, hasil)
    Chooser.tsx           dialog "Apa yang ingin Anda lakukan?" untuk file yang dilepas/ditempel
    Annotator.tsx         editor SVG: dipakai Edit PDF, Samarkan, Tanda Tangan (prop mode)
    SignatureMaker.tsx    gambar/ketik/unggah tanda tangan, disimpan di localStorage
    AiSummarize/AiAsk/AiTranslate.tsx, Compare.tsx, MetaEditor.tsx, FormFiller.tsx, Organizer.tsx
    icons.tsx             SEMUA ikon (SVG garis); tambah alat baru = tambah ikon di sini
  lib/
    layout.ts             mesin teks->PDF (Word/Excel/HTML/terjemahan/laporan); font standar PDF saja
    nlp.ts                deteksi bahasa, stem Indonesia/Inggris, TextRank+MMR, BM25, kata kunci (offline)
    ai.ts                 Chrome built-in AI, WebLLM bertingkat (ringan/seimbang/pintar) + streaming
    pdfImages.ts          baca gambar tertanam PDF (DCT + Flate/prediktor + rantai ASCII85)
    pdfCrypt.ts           enkripsi AES-128 PDF buatan sendiri (MD5, RC4, WebCrypto)
    pdfText.ts            ekstraksi baris/paragraf/judul/tabel dari pdf.js (dipakai banyak alat)
    docxBlocks/xlsxRead/ooxmlWrite/pptxRender/htmlBlocks   Office tanpa library berat
    handoff.ts            serah-terima file antar halaman + saran alat; theme.ts; qpdf.ts; compare.ts; diff.ts
  tools/
    types.ts              kontrak ToolDef, FieldDef, kategori
    registry.ts           SUMBER TUNGGAL daftar alat (menu dibuat otomatis dari sini)
    impl/                 pages, stamp, convert, toPdf, fromPdf, secure, extra (dimuat malas per alat)
docs/qa/                  harness QA (lihat docs/qa/README.md)
```

**Menambah alat:** tulis `RunFn` di `tools/impl/*` (atau komponen React untuk alat interaktif), daftarkan di `registry.ts`, tambah ikon di `icons.tsx`. Selesai.

## 3. Status 40 alat

**Stabil (andal, sudah diuji dengan file nyata):** Gabungkan, Pisahkan (rentang / tiap N halaman / per ukuran), Hapus halaman, Ekstrak halaman, Atur PDF (urut/putar/hapus/balik/ganjil-genap), JPG ke PDF, PDF ke Gambar (JPG/PNG/WebP), Putar, Nomor halaman + header/footer, Watermark, Potong, Formulir PDF, Proteksi (AES-128), Samarkan (redaksi sejati), **Kompres cerdas** (teks tetap vektor; 9,6 MB menjadi 0,3 sampai 1,6 MB pada uji), Hapus halaman kosong, Ubah ukuran halaman, Cetak ringkas N-up + booklet, Ekstrak gambar, PDF ke Teks, PDF ke Markdown (judul/daftar/tabel), Info & metadata, Tanya Dokumen (BM25, offline), Perangkum (TextRank), **Edit PDF** (pilih/geser/ubah ukuran, edit teks asli, elips/garis/panah, gaya teks), **Tanda tangan** (gambar/ketik/unggah, tempatkan dan atur).

**Beta (berfungsi, ada keterbatasan):** Pindai ke PDF (hanya unggah foto, belum ada pemotongan otomatis), Perbaiki PDF, OCR, Word/Excel/HTML/PowerPoint ke PDF (mesin ringan sendiri: font Helvetica, huruf Latin saja), PDF ke Word/Excel/PowerPoint (rekonstruksi dari posisi teks), PDF ke PDF/A (versi gambar, belum divalidasi veraPDF), Buka PDF terkunci (utuh hanya jika qpdf-wasm terpasang, selain itu mode gambar), Bandingkan PDF (teks Myers + visual piksel), Penerjemah.

## 4. Selesai di sesi terakhir

1. **Tampilan:** redesain gading + biru malam + emas; 33 ikon SVG; bilah kategori sticky; ikon pencarian mini di kanan saat pencarian hero tergulung (mengembang menutupi tab, tutup dengan x / klik luar / Esc); tema **Otomatis / Terang / Gelap / Nyaman (sepia)** berbasis `data-theme` (skrip inline di `index.html` mencegah kedip), warna tidak putih/hitam murni agar tidak silau.
2. **Performa gulir:** dibuang `background-attachment: fixed`, semua `backdrop-filter`, `mix-blend-mode`; ditambah `content-visibility: auto` pada grup, `contain` pada kartu, bayangan hover lewat pseudo-element beropacity. (**Belum diukur A/B**, lihat 5.P1.)
3. **Pintu masuk universal:** seret file ke mana saja / Ctrl+V / tombol "Pilih file" / buka via aplikasi terpasang (`launchQueue` + `file_handlers`) memunculkan pemilih alat sesuai jenis file; file diteruskan lewat `lib/handoff.ts`. Toast "siap offline".
4. **AI offline lebih pintar:** `lib/nlp.ts` (deteksi 16 bahasa/aksara 9/9 benar pada uji, TextRank+MMR, BM25, kata kunci, singkatan "Dr."/"Rp." tidak memecah kalimat). WebLLM bertingkat dan streaming. Terjemahan melindungi URL/email/kode, mode dwibahasa.
5. **Alat baru:** Hapus halaman kosong, Ubah ukuran halaman, N-up/booklet, Ekstrak gambar, PDF ke Teks, Info & metadata, Tanya Dokumen.
6. **Editor** ditulis ulang (lihat butir 3 di atas), termasuk peringatan privasi: "Edit teks" hanya **menutup** teks lama; penghapusan permanen = Samarkan.

## 5. BELUM dikerjakan / perlu dilanjutkan (urut prioritas)

### P0: lakukan lebih dulu
1. **Verifikasi `npm run build` di mesin pemilik.** Sandbox tidak punya Vite; semua uji memakai esbuild. Dev server sudah berjalan di mesin pemilik untuk versi sebelumnya, tetapi **build produksi Rollup belum pernah dijalankan**. Kemungkinan peringatan: `node:fs`/`node:https` dari pptxgenjs (hanya peringatan), `import(/* @vite-ignore */ ...)` di `qpdf.ts` dan `ai.ts`. Jika ada error, perbaiki dulu sebelum fitur lain.
2. **Deploy/URL (sesi lain):** GitHub Pages sempat **kosong** karena Source diset "Deploy from a branch" (menyajikan `index.html` mentah). Solusi: Settings, Pages, Source = **GitHub Actions**; workflow `.github/workflows/deploy.yml` sudah ada. Target akhir: Cloudflare Pages `mab-pdf.pages.dev`, lalu `mab-app.eu.org/mab-pdf`. Catatan untuk subpath: `base: './'` + hash routing sudah aman di subpath; periksa `scope`/`start_url` manifest dan scope service worker, serta cache lama saat pindah domain.
3. **Jalankan docs/qa di mesin pemilik atau CI jika memungkinkan**, dan uji manual editor di HP (sentuh): geser/ubah ukuran memakai pointer events, belum diuji di perangkat sentuh sungguhan.

### P1
4. **Pindai ke PDF "Scan Studio":** pratinjau kamera `getUserMedia`, deteksi tepi dokumen otomatis (ambang Otsu + titik ekstrem x+y/x-y), 4 titik sudut yang bisa diseret, transformasi perspektif (homografi + bilinear), filter Asli / Dokumen (koreksi pencahayaan) / Hitam-putih adaptif / Abu-abu, putar, urutkan, ekspor A4/Letter/sesuai gambar. Belum ada kode sama sekali.
5. **Ukur performa gulir A/B** (Playwright, hitung frame lambat saat scroll) dan catat angkanya.
6. **Font Unicode:** tambah `@pdf-lib/fontkit` + Noto Sans (subset, dimuat malas) agar teks non-Latin/aksen penuh tidak menjadi "?" di Word/Excel/HTML ke PDF, terjemahan, watermark, nomor halaman, dan editor. Aksara RTL (Arab/Ibrani) butuh pengurutan bidi tambahan. Belum ada uji karena fontkit tidak tersedia di sandbox.
7. **Bandingkan:** tambah mode geser (slider swipe) dan kotak penanda perbedaan.

### P2
8. OCR: pra-pemrosesan gambar (grayscale/kontras/deskew), pilihan bahasa tambahan, uji nyata.
9. PDF ke Word: sertakan gambar halaman dan deteksi kolom ganda; PDF ke Excel: deteksi tabel berdasarkan garis.
10. Web Worker untuk file besar (kini berjalan di main thread dengan jeda `tick()`).
11. PDF/A yang mempertahankan teks (butuh Ghostscript-wasm, lisensi AGPL) dan validasi veraPDF.
12. Tanda tangan digital bersertifikat (PKCS#7 dengan `pkijs`); kini hanya tanda tangan visual.
13. Pencarian semantik (embedding MiniLM via transformers.js) untuk Tanya Dokumen; saat ini BM25 leksikal.

## 6. Hal yang BELUM terverifikasi (jangan dianggap pasti bekerja)

- `tesseract.js` (OCR): tidak terpasang di sandbox. Kode ditulis mengikuti API v5.1.1, **tidak pernah dijalankan**.
- `@neslinesli93/qpdf-wasm`: nama paket, jalur berkas, dan API `callMain`/`FS` ditulis dari ingatan, **tidak teruji**. Loader (`lib/qpdf.ts`) dibuat gagal-aman: jika tidak ada, Buka Kunci/Perbaiki memakai cara cadangan.
- WebLLM, Chrome Summarizer/Translator/LanguageDetector: butuh WebGPU/Chrome terbaru; jalur ekstraktif/BM25 sudah teruji, jalur generatif **tidak** teruji.
- PDF/A: struktur diverifikasi dengan pikepdf, profil ICC dengan littleCMS; **kepatuhan penuh belum divalidasi veraPDF**.
- Mode gelap/sepia dan Safari/iOS/Firefox: hanya diuji di Chromium.

## 7. Pelajaran teknis (hemat waktu)

- `focus()` pada elemen di dalam bilah **sticky** membuat browser menggulir ke posisi asli bilah: selalu `focus({ preventScroll: true })`.
- Input yang muncul saat `pointerdown` langsung tertutup karena klik merebut fokus: munculkan saat **pointerup/click**.
- Scroll anchoring Chrome menggeser gulir saat daftar menyusut: `overflow-anchor: none` + `min-height` pada daftar.
- Playwright `locator.click()` ikut menggulir elemen sticky ke posisi aslinya; pakai `page.mouse.click` pada bounding box. Elemen di luar viewport tidak menerima klik mouse: pakai viewport cukup tinggi.
- `pdftotext`/`pdfplumber` mengacak teks yang menimpa teks lain; verifikasi dengan `pdftotext -raw`.
- pdf-lib: tidak ada enkripsi bawaan; `decodePDFRawStream` tidak menangani prediktor (ditangani manual di `pdfImages.ts`); simpan dengan `useObjectStreams:false` untuk enkripsi/PDF/A.
- pdfjs v4 `render({canvasContext, viewport})`; v5 butuh `canvas`. Kode meneruskan keduanya.
- `pkill -f` pada pola yang ada di perintah itu sendiri membunuh shell. Jangan.
- Sandbox: tanpa internet; `fflate`, `xlsx`, `diff-match-patch`, `tesseract.js` tidak tersedia, sehingga Office dibaca/ditulis dengan parser sendiri dan `fflate` dialias ke shim saat uji.

## 8. Hasil uji terakhir (sandbox)

| Suite | Hasil |
|---|---|
| `app-test` (regresi + 40 halaman alat) | 26/26 |
| `ui-test` (sticky, pencarian mini, kategori, desktop+HP) | 28/28 |
| `feat2-test` (Tanya Dokumen, metadata, alat baru, kompres) | 13/13 |
| `feat1-test` (tema, pemilih tindakan, seret-lepas, tempel) | 13/14. 1 "FAIL" = tes memeriksa overlay seketika padahal React merendernya sesudahnya; terbukti OK di `feat1b` |
| `feat3-test` (editor, tanda tangan) | 15/17. 2 "FAIL" = ekstraksi `pdfplumber` mengacak teks yang menimpa; terbukti OK dengan `pdftotext -raw` dan render gambar |
