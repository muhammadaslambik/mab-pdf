# MAB-PDF

Alat PDF gratis yang **diproses 100% di perangkat pengguna** (client-side). Tidak ada server pemrosesan, tidak ada unggahan file, tidak ada biaya infrastruktur. Bisa di-instal sebagai aplikasi (PWA) di Android, iOS, Windows, macOS, dan Linux.

- Repo: https://github.com/muhammadaslambik/mab-pdf
- Situs (GitHub Pages): https://muhammadaslambik.github.io/mab-pdf/

## Menjalankan lokal

```bash
npm install        # juga menyalin engine qpdf (opsional) ke public/wasm
npm run dev        # http://localhost:5173
npm run build      # hasil statis di folder dist/
npm run preview    # uji hasil build + PWA
npm run typecheck  # pemeriksaan tipe TypeScript
```

Butuh Node.js 20 atau lebih baru.

## 33 alat

Tingkat: **Stabil** = hasil andal. **Beta** = berfungsi, tetapi ada keterbatasan (lihat kolom catatan).

| Kategori | Alat | Tingkat | Catatan |
|---|---|---|---|
| Atur PDF | Gabungkan, Pisahkan, Hapus halaman, Ekstrak halaman, Atur PDF | Stabil | |
| | Pindai ke PDF | Beta | Kamera HP lewat input file |
| Optimalkan | Kompres PDF | Beta | Halaman dijadikan gambar (teks tidak bisa diseleksi) |
| | Perbaiki PDF | Beta | Tiga tahap: qpdf, pdf-lib, lalu pemulihan pdf.js (mode gambar) |
| | OCR PDF | Beta | Tesseract.js; data bahasa diunduh dari CDN saat pertama dipakai |
| Ke PDF | JPG/PNG/WebP ke PDF | Stabil | |
| | Word, Excel/CSV, HTML, PowerPoint ke PDF | Beta | Mesin ringan buatan sendiri: font Helvetica, huruf Latin saja, tata letak rumit tidak dipertahankan |
| Dari PDF | PDF ke JPG | Stabil | |
| | PDF ke Word, Excel, PowerPoint | Beta | Rekonstruksi dari posisi teks; tabel sederhana terdeteksi |
| | PDF ke PDF/A | Beta | Versi gambar + XMP + sRGB OutputIntent. Belum divalidasi dengan veraPDF |
| Edit | Putar, Nomor halaman, Watermark, Potong, Formulir PDF | Stabil | Huruf Latin untuk teks tambahan |
| | Edit PDF | Beta | Anotasi: teks, kotak, sorot, gambar, pena. Bukan mengedit teks asli |
| Keamanan | Proteksi PDF | Stabil | AES-128, diverifikasi dengan qpdf/pikepdf |
| | Buka PDF terkunci | Beta | Utuh bila engine qpdf terpasang; jika tidak, mode cadangan berupa gambar |
| | Samarkan PDF | Stabil | Redaksi sejati: halaman dirender ulang, teks di bawah kotak hitam hilang |
| | Tanda tangani PDF | Beta | Tanda tangan gambar (bukan tanda tangan digital sertifikat) |
| | Bandingkan PDF | Beta | Mode teks (diff Myers) dan visual (selisih piksel) |
| AI | PDF ke Markdown | Beta | Heuristik ukuran font |
| | Perangkum AI, Terjemahkan PDF | Beta | Ekstraktif (semua bahasa), AI bawaan Chrome, atau model lokal WebGPU (opt-in, unduhan ±1 GB) |

## Catatan teknis penting

- **Privasi:** isi file tidak pernah dikirim ke server. Yang diunduh dari internet hanya aset mesin: data bahasa OCR (tessdata), pustaka dan bobot model AI bila Anda memilih AI lokal, dan engine qpdf bila dipakai.
- **qpdf (opsional):** paket `@neslinesli93/qpdf-wasm` ada di `optionalDependencies`. Skrip `scripts/setup-wasm.mjs` menyalin `qpdf.js` dan `qpdf.wasm` ke `public/wasm/` saat `npm install`. Bila gagal, alat Buka Kunci dan Perbaiki memakai cara cadangan.
- **Font:** PDF yang dibuat dari nol memakai font standar PDF (Latin). Aksara non-Latin diganti "?" dan Anda diberi tahu.
- **Memori:** file di atas 300 MB ditolak. Halaman diproses bertahap dan ukuran canvas dibatasi agar aman di iOS Safari.

## Menambah alat baru

1. Tulis fungsi `RunFn` di `src/tools/impl/*.ts` (atau komponen React untuk alat interaktif di `src/components/`).
2. Daftarkan di `src/tools/registry.ts`. Menu beranda dan halaman alat dibuat otomatis.

## Struktur

```
src/
  lib/          layout (mesin teks->PDF), pdfCrypt (AES-128), pdfText, diff, compare, ai,
                docxBlocks/xlsxRead/ooxmlWrite/pptxRender (Office tanpa library berat), pdf.js wrapper
  tools/
    types.ts    kontrak ToolDef
    registry.ts daftar semua alat (sumber tunggal menu)
    impl/       logika pemrosesan per kelompok alat (dimuat malas)
  components/   Home, ToolPage, Organizer, Annotator (Edit/Samarkan), FormFiller, Compare, AI
scripts/        setup-wasm.mjs
public/         ikon PWA
.github/workflows/deploy.yml   deploy otomatis ke GitHub Pages
```

## Deploy gratis 24/7

**GitHub Pages (sudah disiapkan):** Settings, Pages, Source: **GitHub Actions**. Setiap `git push` ke `main` membangun dan menerbitkan situs.

**Alternatif Cloudflare Pages:** Build command `npm install && npm run build`, output `dist`, variabel `NODE_VERSION=20`.

## Lisensi

AGPL-3.0-or-later. Ubah sesuai kebutuhan.
