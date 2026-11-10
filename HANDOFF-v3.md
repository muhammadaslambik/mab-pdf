# HANDOFF v3: MAB-PDF (serah-terima antar sesi Claude)

Lanjutan dari `HANDOFF.md` (v1) dan `HANDOFF-v2.md`. Baca bagian 1 sampai 4 dulu, lalu kerjakan bagian 6 dari atas. Konteks produk, struktur proyek, dan pelajaran teknis lama tetap di v1/v2; dokumen ini hanya mencatat **apa yang berubah (v13 sampai v19)**, **apa yang terbukti**, dan **apa yang tersisa**.

## 1. Konteks singkat (tidak berubah)

- **Produk:** MAB-PDF, utilitas PDF gratis, diproses 100% di browser pengguna (tanpa server pemroses, bisa PWA). Repo: https://github.com/muhammadaslambik/mab-pdf (branch `main`). Lingkungan pemilik: Windows, VS Code, PowerShell, Edge. Bahasa komunikasi dan UI: **Indonesia**.
- **Cara kerja pemilik:** paket siap pasang berupa ZIP bernama **unik** (`mab-pdf-vNN.zip`, versi berikutnya: **v20**), sertakan perintah PowerShell, jawab ringkas, kerjakan bertahap, serahkan hasil lebih awal. Pemilik menempelkan keluaran terminal dan screenshot; baca keduanya teliti.
- **Hosting/URL:** ditangani sesi lain (Cloudflare Pages `mab-pdf.pages.dev`, lalu `mab-app.eu.org/mab-pdf`). Jangan dikerjakan di sini kecuali diminta.
- **Satu alamat dev saja:** pakai `http://localhost:5173`. Port lain (5174 dst.) punya penyimpanan sendiri sehingga model AI terunduh ulang. Bila "Port 5173 is in use", matikan proses lama:
  `Get-NetTCPConnection -LocalPort 5173 | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force }`

## 2. Kontrak kerja dengan sandbox (penting, ditambah dari v2)

- Sandbox **tanpa internet, tanpa GPU, tanpa React/Vite/pdf-lib/pdf.js**. Yang bisa diuji: cek tipe dengan `tsc` dan uji logika murni di Node.
- **Pola uji yang terbukti:** tulis inti murni (tanpa DOM), kompilasi ke CJS (`tsc --ignoreConfig --module commonjs --moduleResolution node10 --ignoreDeprecations 6.0`), jalankan di Node. Untuk pdf.js dipalsukan lewat **pdfplumber** (tersedia di sandbox): ekstrak kata dengan posisi/ukuran, kelompokkan menjadi `TLine/TItem` (format `pageLines`), simpan ke JSON, lalu panggil `analyzeDoc`. Berkas contoh: `3-2-2023.pdf` (artikel dua kolom, 13 halaman, jurnal Musâwa).
- **Stub untuk cek tipe:** buat `node_modules/pdf-lib` palsu, stub `react`, `storage`, `util`. Galat `TS7006` dari stub (parameter `any`) bisa diabaikan; galat lain nyata.
- Jebakan sandbox: `/bin/sh` tidak mendukung `{a,b}` brace expansion dan `<( )`; pakai `bash -c`. Timer `setTimeout` di `ai.ts` (`touch()`) menahan proses Node: akhiri uji dengan `process.exit(0)`. Heredoc dengan `cd x && ...` bisa membuat perintah berikutnya berjalan di folder yang salah; cek `pwd`.
- Verifikasi akhir selalu di mesin pemilik: `npm run build`, `npm run dev`. `Compress-Archive` meratakan folder; ZIP dari saya dibuat dengan `zipfile` Python (struktur terjaga, pasang dengan `Expand-Archive ... -DestinationPath . -Force`). Hanya sertakan berkas yang berubah.
- Peringatan build `pdf-lib dynamically imported ... also statically imported` dan LF/CRLF **aman diabaikan**.

## 3. Yang selesai (v13 sampai v19)

### 3.1 Riwayat commit
`bdba795` v13 (device + lisensi), `f1a78dc` v14 (worker kompres), lalu v15 sampai v18 dipush bersama sebagai `9d4dae5`, dan `01ab6a7` v19 (push terakhir, `9d4dae5..01ab6a7`). Cek dengan `git log --oneline -8`.

### 3.2 v13: profil perangkat dan lisensi
- `src/lib/device.ts`: `getProfile()` (tier low/mid/high dari `deviceMemory`/`hardwareConcurrency`, batas konkurensi 1/2/maks 4, **tidak menurunkan kualitas hasil**), `mapLimit(items, limit, fn, check)` (paralel terbatas, hasil berurutan, `check` untuk Batalkan).
- `scripts/check-licenses.mjs`: hasil dependensi produksi: MIT 35, Apache-2.0 5, ISC 3, (MIT OR GPL-3.0-or-later) 1, (MIT AND Zlib) 1, 0BSD 1, BSD-2 1. **Tidak ada UNLICENSED** (dugaan lama = paket `mab-pdf` sendiri). Dependensi aman untuk komersial.

### 3.3 v14: Kompres cerdas di Web Worker
- Berkas: `compressCore.ts` (inti, `smartCompressCore(name, bytes, level, hooks, limit)`, memakai OffscreenCanvas bila tanpa DOM), `compress.worker.ts`, `compressClient.ts` (`smartCompress(file, level, ctx, spawn?)`), `compressSpawn.ts` (satu baris `new Worker(new URL(...))`), `pdfImages.ts` (canvas aman di worker), `tools/impl/convert.ts` (memanggil klien), `scripts/apply-compress.mjs` (menambah `'**/compress.worker*'` ke `globIgnores` di `vite.config.ts`, idempotent).
- **Batalkan = worker dimatikan** (polling `ctx.check()` tiap 150 ms). Cadangan thread utama bila `Worker`/`OffscreenCanvas` tidak ada atau worker gagal start. Worker sekali pakai (di-terminate setelah selesai).
- Terbukti: build lolos, precache tetap ~1,2 MB (worker dikecualikan). **Belum terbukti:** jalur gambar nyata (pdf-lib, decode, encode) dengan PDF berfoto di browser; hasil byte bisa sedikit beda (urutan nomor objek) tetapi isi sama.
- **Belum dipindah:** Kompres mode gambar (`rasterCompress`), PDF ke Gambar, OCR. Hambatan: pdf.js merender di worker butuh `canvasFactory` khusus (OffscreenCanvas) dan belum bisa diuji di sandbox.

### 3.4 v15: Rangkuman terstruktur (inti fitur)
Tujuan pemilik: keluaran minimal setara rangkuman contoh (Intisari, bagian bernomor, kesimpulan) tetapi **setia pada artikel** (contoh pemilik memuat hal yang tidak ada di artikel dan menghilangkan angka survei).
- `src/lib/docStruct.ts` (murni): `analyzeDoc(pages, body)` menghasilkan `Struct {title, abstract, keywordLine, sections[{title,page,text}], pre, twoColumn}`. Menangani: **urutan baca dua kolom** (`gutterOf`, celah vertikal), buang header/footer berulang, nomor halaman, **catatan kaki** (huruf kecil di dasar halaman), judul bagian lewat `headSpan` (jarak atas, paragraf menjorok, judul membungkus sampai 3 baris, nama bagian umum, ukuran huruf), potong di "Daftar Pustaka", ambil Abstrak/Kata Kunci.
- `src/lib/summaryReport.ts`: `offlineReport` (semua kalimat dikutip dari dokumen: Intisari dari abstrak, poin TextRank per bagian, **Data dan angka penting** = kalimat berpersentase, Kesimpulan), `llmReport` (mode AI, lihat 3.5), `numericFacts`, `unsupportedNumbers` (angka ≥2 digit pada keluaran yang tidak ada di sumber; pemisah titik/koma diabaikan).
- `src/lib/pdfText.ts`: `TItem` kini punya `size?`, `sup?` (superskrip). Tambahan bersifat aditif.
- `src/components/AiSummarize.tsx`: mesin **Pintar offline** (default, laporan terstruktur), AI bawaan Chrome (tidak berubah, Inggris), **AI generatif lokal WebGPU**, **AI server** (v18). Unduhan `.md` memakai laporan bila diawali `# Rangkuman`.
- Terbukti pada `3-2-2023.pdf` (data pdfplumber): 10 dari 11 judul bagian terbaca tanpa judul palsu; judul, abstrak, kata kunci benar; angka survei (45,7%, 77,3%, 87,6%, 54,3%, 50,7%, 69,1%, 84,8%, 63%, 38%/22%/24%, 210 responden) muncul.

### 3.5 Mode AI generatif: verifikasi angka dan ketahanan
- `llmReport(st, opts)`: per bagian (maks 14) satu/beberapa panggilan model, lalu Intisari dan Kesimpulan. **Setiap keluaran diperiksa** dengan `unsupportedNumbers`; bila ada angka karangan, bagian itu diganti kutipan langsung (diuji dengan model palsu yang sengaja mengarang "99,9%"). Satu panggilan gagal tidak membatalkan laporan (`failed/firstErr/lastErr` masuk catatan); bila **semua** gagal, dilempar galat jelas. Batalkan tetap merambat (`/Dibatalkan/`).
- Opsi `LlmOpts`: `maxChars` (default 3200; server memakai 6000), `chunk` (bagian panjang dipotong beberapa bagian, bukan dipadatkan), `where: 'server'` (catatan akhir menyebut teks dikirim ke server). Aturan prompt: tulis subjek angka persis seperti teks ("sesama santri (38%)", bukan "oknum (38%)").
- **Keterbatasan penting:** pemeriksa hanya menjaga **angka**, bukan makna. Subjek yang salah atau makna yang melunak lolos.

### 3.6 v16/v17: perbaikan `ai.ts` (WebLLM)
- **Bug nyata ditemukan:** cache menyimpan nama model tanpa `-MLC` (`Qwen2.5-1.5B-Instruct-q4f16_1`) sedangkan `model_id` memakai `-MLC`. Akibatnya model dianggap belum ada di cache dan cache model yang sedang dipakai ikut dihapus ("satu model saja di disk"). Diperbaiki dengan normalisasi `norm()` di `createRaw`.
- `loadWebLLM` kini mengembalikan **pembungkus Proxy** (`__cur`, `__id`, `__tier`); `recoverEngine` membongkar dan membuat ulang mesin dari cache lokal; `llm()` mencoba ulang maks 2 kali bila pesan mengandung `not loaded|disposed|lost|reload(`. Semua galat model dicatat `console.warn('[MAB-AI] ...')`.
- **Temuan lapangan:** di laptop pemilik WebGPU gagal dengan `DXGI_ERROR_DEVICE_REMOVED` (GPU/driver dicabut Windows; setelah itu `requestDevice` ditolak sampai browser/OS dimulai ulang). Ini **bukan bug aplikasi**. Pemulihan otomatis tidak bisa mengatasinya. Unduhan-tidak-berulang (pesan "Memuat model dari penyimpanan lokal") **belum terkonfirmasi** karena eksekusi model gagal.

### 3.7 v18: mesin "AI server" dan notebook Colab
- `src/lib/remoteLlm.ts`: klien API gaya OpenAI (`normalizeBase`, `pingRemote`, `remoteAsk`, `loadRemoteCfg/saveRemoteCfg` di `localStorage mab-ai-remote`). Galat berbahasa Indonesia (401/403, 404, tidak terhubung/CORS, waktu habis). Diuji dengan server HTTP tiruan di Node.
- UI: pilihan mesin "AI server (eksperimental: teks dokumen dikirim ke server)", isian alamat, nama model (`qwen2.5:7b`), kunci API opsional, **Tes koneksi**, dan **kotak persetujuan wajib** (teks dokumen, bukan file PDF, dikirim).
- `docs/colab/mab-ai-server.ipynb` (6 sel, **output harus tetap kosong**): pasang Ollama, jalankan server (`OLLAMA_ORIGINS=*`, `OLLAMA_CONTEXT_LENGTH=8192`, `OLLAMA_KEEP_ALIVE=-1`), tarik model, uji, buka tunnel `cloudflared` (alamat `https://xxxx.trycloudflare.com`), pantau GPU. **Terbukti di Colab pemilik** (T4, model terisi 5.039 MiB): sel 1 sampai 6 berjalan, tes koneksi dan perangkuman lewat server berhasil.
- Catatan Colab: butuh Runtime T4; "Too many sessions" bisa muncul sesaat (hentikan sesi lain lewat Manage sessions atau tunggu); alamat tunnel **tanpa kata sandi**, anggap rahasia; hentikan runtime bila selesai. Colab gratis bukan server produksi.

### 3.8 v19: perbaikan hasil Colab (push terakhir `01ab6a7`)
- **Penanda catatan kaki** menempel di teks (pdf.js sering menggabungkan superskrip dengan kata sebelahnya, sehingga `sup` berbasis ukuran gagal). `docStruct.ts` kini mengumpulkan **nomor catatan kaki per halaman** (baris angka kecil di dasar halaman, atau item digit pertama tiap kolom) lalu `stripMarkers` membuang token yang cocok secara berurutan (`F`, `m`..`m+2`; token berawalan `.`/`,` yang ada di F dibuang tanpa batas urutan). Terbukti pada data pdfplumber **dengan dan tanpa** flag `sup` (sisa penanda 0). **Perilaku pdf.js asli belum terverifikasi.**
- Pemotongan bagian panjang untuk mode server, aturan subjek angka, dan catatan "di server" (lihat 3.5).

## 4. Hasil build terakhir (mesin pemilik, v19)

| Ukuran | Nilai |
|---|---|
| Modul | 344 |
| Muat awal (JS, gzip) | 70,21 kB (anggaran 130 kB di `scripts/check-size.mjs`) |
| Precache PWA | 1.268,43 KiB, 52 berkas |
| Chunk malas penting | `compress.worker` 432 kB (tidak diprecache), `pdf.worker` 1.376 kB (tidak diprecache), `AiSummarize` 26 kB, `PDFButton` 430 kB, `pptxgen` 372 kB, `pdf` 334 kB |

Workflow GitHub Actions untuk commit `01ab6a7`: **belum dikonfirmasi hijau**; periksa tab Actions.

## 5. Hal yang BELUM terverifikasi (jangan dianggap pasti bekerja)

- **Kualitas rangkuman AI server setelah v19** (potongan bagian, aturan subjek). Hasil Colab sebelum v19 (model `qwen2.5:7b`, panjang Sedang) punya cacat: (a) subjek angka keliru ("Oknum dalam pesantren (38%)" padahal *sesama santri*), (b) beberapa poin melunak/salah ("84,8% ... diterapkan oleh responden", "perintah negatif dianggap positif"), (c) bagian 1 dan 2 miskin cakupan (kasus Bandung/Jombang/Ponorogo, data Komnas tak masuk), (d) judul bagian 2 janggal (sisa catatan kaki) dan "Kepercayaan Publik terhadap Pesantren" menempel ke bagian 8 (judul sebelah kanan terlewat), (e) catatan akhir salah menyebut "di perangkat Anda" (sudah diperbaiki di v19).
- **Waktu total dan pemakaian GPU** perangkuman via Colab: **belum diukur** (pemilik belum melaporkan). Ini angka kunci untuk biaya produksi. Minta: waktu dari klik Rangkum sampai selesai, keluaran sel 6 saat merangkum (`utilization.gpu`, memori).
- **Perilaku pdf.js asli** untuk pembuang penanda catatan kaki dan urutan baca dua kolom pada PDF selain `3-2-2023.pdf`; PDF **satu kolom** dan PDF tanpa judul/bagian (jatuh ke jalur lama) belum diuji.
- **WebLLM di perangkat lain** (WebGPU stabil), unduhan tidak berulang, dan mutu model "Seimbang" (Qwen2.5-1.5B) pada laporan terstruktur. Di laptop pemilik WebGPU rusak (lihat 3.6).
- Scan Studio di HP (kamera, sentuh), alat `custom` dengan `minFiles: 0` tanpa file di `ToolPage`; Kompres jalur gambar nyata di worker; item lama di v1/v2 bagian "belum terverifikasi" (tesseract.js, qpdf-wasm, PDF/A, tema Safari/Firefox).

## 6. BELUM dikerjakan (urut prioritas)

### P0
1. **Pemilik menguji ulang rangkuman dengan v19** (Colab, panjang Sedang dan Rinci) dan mengirim: laporan, waktu total, `nvidia-smi` saat berjalan. Evaluasi terhadap artikel asli (daftar cacat di bagian 5). Pastikan Actions hijau.
2. **Fallback otomatis saat GPU bermasalah:** bila `loadWebLLM`/`requestDevice` gagal (mis. `DEVICE_REMOVED`), jangan tampilkan galat mentah; pindah ke **Pintar offline** dengan pesan ramah ("GPU bermasalah, memakai mode offline"). Deteksi WebGPU+memori sebelum menawarkan mesin generatif lokal.
3. **Perbaikan judul bagian:** sisa catatan kaki yang menjadi judul (bagian 2) dan judul kolom kanan yang terlewat (`Kepercayaan Publik terhadap Pesantren`). Debug dengan data pdfplumber di `test/pages.json` (format `TLine`).

### P1
4. **Mutu AI server:** coba `qwen2.5:14b` di notebook; pertimbangkan verifikasi makna (mis. pemeriksa konteks angka: kata di sekitar angka pada keluaran harus ada di dekat angka yang sama di sumber, atau panggilan kedua "hakim"); prompt bahasa lebih sederhana; ukuran potongan.
5. **Pindahkan ke Web Worker:** Kompres mode gambar, PDF ke Gambar, OCR (butuh `canvasFactory` OffscreenCanvas untuk pdf.js; uji bertahap, pertahankan Batalkan dan progres). Mode hemat otomatis memakai `getProfile()`/`mapLimit` di alat lain.
6. **Server produksi (bila dikomersialkan):** vLLM atau sejenisnya di GPU sewaan, kunci API per pengguna, batas pemakaian, biaya per rangkuman masuk harga paket. **Jangan** memakai Colab/Ollama tanpa kata sandi untuk publik. Pertahankan prinsip: mesin server **opt-in dengan persetujuan eksplisit**; jangan mengubah klaim "100% di browser" untuk mode lain.
7. **Keputusan lisensi dan hukum** (belum diambil): kode proyek AGPL-3.0-or-later (`package.json`); rencana Ghostscript-wasm (AGPL) bertentangan dengan kode tertutup; periksa lisensi model (Qwen2.5, Llama-3.2) untuk komersial; baca Cloudflare Terms; **GitHub Pages dan Vercel Hobby tidak boleh untuk komersial**; sarankan konsultasi hukum singkat.
8. Font Unicode (`@pdf-lib/fontkit` + Noto Sans subset); Bandingkan mode geser dan kotak perbedaan; Scan Studio tahap B (HANDOFF v2 P1.6 sampai P1.8).

### P2
9. Semua P2 di `HANDOFF.md`/`HANDOFF-v2.md` (pra-pemrosesan OCR, PDF ke Word/Excel yang lebih baik, PDF/A yang mempertahankan teks, tanda tangan digital bersertifikat, pencarian semantik).
10. Opsi AI neural untuk pindaian sebagai unduhan opt-in (setelah Scan Studio stabil di HP).
11. Kebijakan monetisasi tanpa server (Lemon Squeezy/Paddle/Gumroad, domain sendiri). Arah yang disepakati dalam diskusi: **inti gratis andal** (alat non-AI + ringkasan offline terstruktur), **AI lokal sebagai fitur opsional** hanya di perangkat mampu, **AI server berbayar/BYO key** bila kualitas tinggi dibutuhkan semua perangkat. Pemasaran: privasi dan kecepatan; AI sebagai bonus, bukan janji utama.

## 7. Pelajaran teknis baru

- **Sumber masalah rangkuman buruk = ekstraksi, bukan model:** PDF dua kolom diurutkan per baris sehingga kolom bercampur. Selalu perbaiki urutan baca dulu.
- pdf.js menggabungkan superskrip dengan teks sekitarnya, jadi deteksi berbasis ukuran huruf tidak andal. Pakai nomor catatan kaki di dasar halaman sebagai kunci pencocokan.
- Judul tebal-bertipe-sama tidak terlihat di pdf.js; sinyal yang andal: jarak atas ≥ 1,3x jarak baris, paragraf berikutnya menjorok, tanpa tanda baca akhir, huruf awal kapital, tanpa koma. Batas kolom pakai **persentil** (15%/90%), bukan min/max, agar tidak terganggu baris menyimpang.
- Pemeriksa angka tidak menangkap kesalahan subjek; jangan mengklaim "bebas halusinasi", hanya "angka diperiksa".
- Panggilan model berurutan sudah cukup; Promise cache mesin per tier + Proxy memungkinkan mengganti mesin tanpa mengubah rujukan pemanggil.
- Perintah verifikasi git untuk berkas baru: `git diff` **tidak** memeriksa berkas untracked; pakai `Select-String` langsung. Notebook Colab di repo harus bersih: `(Select-String -Path docs\colab\mab-ai-server.ipynb -Pattern '"outputs": \[\]').Count` = 5 dan tidak ada `"output_type"` maupun alamat `trycloudflare.com` lengkap. **Jangan jalankan notebook dari VS Code** (outputnya ikut tersimpan).
- Peringatan Snyk "token expiration" di VS Code tidak terkait build/push.

## 8. Peta berkas baru/berubah (v13 sampai v19)

```
src/lib/device.ts            profil perangkat, mapLimit
scripts/check-licenses.mjs   pemeriksa lisensi
src/lib/compressCore.ts      inti kompres cerdas (worker/utama)
src/lib/compress.worker.ts   worker
src/lib/compressClient.ts    klien worker + cadangan + Batalkan
src/lib/compressSpawn.ts     pembuat worker
scripts/apply-compress.mjs   globIgnores precache
src/lib/pdfImages.ts         (canvas aman worker)
src/tools/impl/convert.ts    (memanggil klien kompres)
src/lib/pdfText.ts           (TItem size/sup)
src/lib/docStruct.ts         struktur dokumen, dua kolom, catatan kaki, judul
src/lib/summaryReport.ts     laporan offline + AI, pemeriksa angka
src/lib/ai.ts                (WebLLM: normalisasi id, Proxy, pemulihan, log [MAB-AI])
src/lib/remoteLlm.ts         klien AI server
src/components/AiSummarize.tsx  4 mesin, panel server, persetujuan
docs/colab/mab-ai-server.ipynb  server uji Colab T4 (output kosong)
vite.config.ts               (globIgnores + compress.worker)
```

## 9. Perintah rutin

```powershell
npm run build          # wajib sebelum push; cek 'built in', ukuran, precache
npm run dev            # http://localhost:5173 (satu alamat saja)
git status; git add -A; git commit -m "vNN: ..."; git push
```
Setelah push: tab **Actions** di GitHub harus hijau. Paket berikutnya: `mab-pdf-v20.zip`.
