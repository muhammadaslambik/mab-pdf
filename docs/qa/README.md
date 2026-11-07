# Harness QA (di luar CI)

Pengujian dijalankan di sandbox Claude: esbuild membundel `src/` menjadi satu aplikasi, lalu Playwright (Chromium) menjalankan alur nyata dengan file nyata dan hasilnya diverifikasi dengan qpdf, pikepdf, pdfplumber, pdftotext, python-docx/openpyxl/python-pptx, dan LibreOffice.

Berkas di sini **tidak ikut build** dan memakai jalur `/home/claude/t` yang perlu disesuaikan:

| Berkas | Fungsi |
|---|---|
| `build-app.mjs` | membundel seluruh aplikasi ke `out/app/` (alias `fflate` ke `shims/fflate.js`, stub `virtual:pwa-register`) |
| `build.mjs`, `t2.ts`, `run.mjs` | harness fungsi alat: `RunFn` dijalankan di browser lalu hasil unduhan ditulis ke `out/` |
| `lib-test.mjs` | peluncur Playwright + server statis bersama |
| `app-test.mjs` | regresi 26 skenario: semua halaman alat terbuka + alur utama |
| `ui-test.mjs` | 28 skenario: bilah menempel, pencarian mini, kategori, desktop dan HP |
| `feat1-test.mjs` | tema, pemilih tindakan, seret-lepas, tempel (1 "FAIL" = pemeriksaan sinkron, lihat HANDOFF) |
| `feat2-test.mjs` | Tanya Dokumen, metadata, kompres, ekstrak gambar, dll (13) |
| `feat3-test.mjs` | editor: geser, ubah ukuran, edit teks asli, tanda tangan (2 "FAIL" = cara ekstraksi teks, lihat HANDOFF) |
| `make-data.py` | membuat semua file uji di folder `data/` |

Catatan: sandbox memakai pdfjs-dist v5 sedangkan proyek v4.10; `app-test.mjs` menyuntikkan polyfill `Map.getOrInsertComputed` hanya untuk pengujian.
