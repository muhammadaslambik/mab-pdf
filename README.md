# mab-pdf

Alat PDF gratis yang **diproses 100% di perangkat pengguna** (client-side). Tidak ada server pemrosesan, tidak ada unggahan file, tidak ada biaya infrastruktur. Bisa di-instal sebagai aplikasi (PWA) di Android, iOS, Windows, macOS, dan Linux.

- Repo: https://github.com/muhammadaslambik/mab-pdf
- Situs (GitHub Pages): https://muhammadaslambik.github.io/mab-pdf/

## Menjalankan lokal

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # hasil statis di folder dist/
npm run preview    # uji hasil build + PWA
```

Butuh Node.js 20 atau lebih baru.

## Fitur yang sudah aktif

| Kategori | Alat |
|---|---|
| Atur PDF | Gabungkan, Pisahkan, Hapus halaman, Ekstrak halaman, Atur PDF (visual), Pindai ke PDF (beta) |
| Optimalkan | Kompres PDF (beta) |
| Ke PDF | JPG/PNG/WebP ke PDF |
| Dari PDF | PDF ke JPG |
| Edit | Putar, Nomor halaman, Watermark, Potong |
| Keamanan | Tanda tangani PDF (beta) |
| AI | PDF ke Markdown (beta) |

Alat lain tampil di menu dengan label "Segera" dan rencana teknisnya ada di `src/tools/registry.ts`.

## Menambah alat baru

1. Tulis fungsi `RunFn` di `src/tools/impl/*.ts`.
2. Daftarkan di `src/tools/registry.ts` (judul, kategori, field opsi). Menu beranda dan halaman alat dibuat otomatis.

## Struktur

```
src/
  lib/          util (zip, rentang halaman, unduh) dan wrapper pdf-lib / pdf.js
  tools/
    types.ts    kontrak ToolDef, kategori
    registry.ts daftar semua alat (sumber tunggal menu)
    impl/       logika pemrosesan per kelompok alat (dimuat malas)
  components/   Home, ToolPage, Organizer, SignaturePad
public/         ikon PWA
.github/workflows/deploy.yml   deploy otomatis ke GitHub Pages
```

## Deploy gratis 24/7

**GitHub Pages (sudah disiapkan):** di repo GitHub buka Settings, Pages, lalu pada Source pilih **GitHub Actions**. Setiap `git push` ke `main` akan membangun dan menerbitkan situs otomatis.

**Alternatif Cloudflare Pages:** Build command `npm install && npm run build`, output directory `dist`, variabel `NODE_VERSION=20`.

## Lisensi

AGPL-3.0-or-later (disiapkan agar kompatibel bila nanti memakai MuPDF/Ghostscript-wasm). Ubah sesuai kebutuhan.
