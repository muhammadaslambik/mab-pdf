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

## 40 alat

Daftar lengkap, tingkat kematangan (Stabil/Beta), dan apa yang belum dikerjakan ada di **[HANDOFF.md](HANDOFF.md)**.

Ringkas: Atur (gabung, pisah, hapus, ekstrak, atur visual, halaman kosong, ukuran halaman, pindai), Optimalkan (kompres cerdas, perbaiki, OCR), ke PDF (gambar, Word, Excel, PowerPoint, HTML), dari PDF (gambar, teks, Markdown, Word, Excel, PowerPoint, PDF/A, ekstrak gambar), Edit (putar, nomor/header, watermark, potong, formulir, edit PDF, N-up/booklet, metadata), Keamanan (proteksi, buka kunci, tanda tangan, samarkan, bandingkan), AI (perangkum, penerjemah, tanya dokumen).

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
