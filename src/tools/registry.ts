import type { Category, FieldDef, RunFn, ToolDef } from './types';

/** Impor impl secara malas: tiap alat jadi chunk terpisah, pengguna hanya mengunduh yang dipakai. */
const lazy =
  <T extends Record<string, any>>(loader: () => Promise<T>, name: keyof T): RunFn =>
  async (f, o, c) =>
    (await loader())[name](f, o, c);

const pages = () => import('./impl/pages');
const stamp = () => import('./impl/stamp');
const convert = () => import('./impl/convert');
const toPdf = () => import('./impl/toPdf');
const fromPdf = () => import('./impl/fromPdf');
const secure = () => import('./impl/secure');

const PAGES: FieldDef = {
  type: 'text', key: 'pages', label: 'Halaman', default: 'all', placeholder: 'all',
  hint: 'Contoh: 1-3,5,8-  (ketik "all" untuk semua halaman)'
};

export const TOOLS: ToolDef[] = [
  /* ===== Atur PDF ===== */
  {
    id: 'merge', category: 'organize', title: 'Gabungkan PDF', icon: '🧩',
    desc: 'Satukan beberapa PDF menjadi satu dokumen.', keywords: ['gabung', 'merge', 'combine', 'join'],
    accept: 'pdf', multiple: true, minFiles: 2, status: 'ready', actionLabel: 'Gabungkan', run: lazy(pages, 'merge')
  },
  {
    id: 'split', category: 'organize', title: 'Pisahkan PDF', icon: '✂️',
    desc: 'Pecah PDF per halaman atau per rentang.', keywords: ['pisah', 'split', 'bagi'],
    accept: 'pdf', multiple: false, status: 'ready', actionLabel: 'Pisahkan', run: lazy(pages, 'split'),
    fields: [
      { type: 'select', key: 'mode', label: 'Cara memisah', default: 'each', options: [
        { value: 'each', label: 'Setiap halaman jadi satu file' },
        { value: 'ranges', label: 'Berdasarkan rentang' }] },
      { type: 'text', key: 'ranges', label: 'Rentang (jika memilih rentang)', placeholder: '1-3,4-6',
        hint: 'Tiap tanda koma menjadi satu file hasil.' }
    ]
  },
  {
    id: 'remove', category: 'organize', title: 'Hapus halaman', icon: '🗑️',
    desc: 'Buang halaman yang tidak diperlukan.', keywords: ['hapus', 'delete', 'remove', 'buang'],
    accept: 'pdf', multiple: false, status: 'ready', actionLabel: 'Hapus halaman', run: lazy(pages, 'removePages'),
    fields: [{ ...(PAGES as any), label: 'Halaman yang dihapus', default: '', placeholder: '2,5-7' }]
  },
  {
    id: 'extract', category: 'organize', title: 'Ekstrak halaman', icon: '📤',
    desc: 'Ambil halaman tertentu menjadi PDF baru.', keywords: ['ekstrak', 'extract', 'ambil'],
    accept: 'pdf', multiple: false, status: 'ready', actionLabel: 'Ekstrak', run: lazy(pages, 'extractPages'),
    fields: [{ ...(PAGES as any), label: 'Halaman yang diambil', default: '', placeholder: '1-3,7' }]
  },
  {
    id: 'organize', category: 'organize', title: 'Atur PDF', icon: '🗂️',
    desc: 'Urutkan, putar, dan hapus halaman secara visual.', keywords: ['atur', 'organize', 'urut', 'reorder', 'susun'],
    accept: 'pdf', multiple: false, status: 'ready', custom: () => import('../components/Organizer')
  },
  {
    id: 'scan', category: 'organize', title: 'Pindai ke PDF', icon: '📷',
    desc: 'Foto dokumen dengan kamera, jadikan PDF.', keywords: ['pindai', 'scan', 'kamera', 'foto'],
    accept: 'image', multiple: true, status: 'beta', capture: true, actionLabel: 'Buat PDF', run: lazy(convert, 'imagesToPdf'),
    fields: [
      { type: 'select', key: 'size', label: 'Ukuran halaman', default: 'a4', options: [
        { value: 'a4', label: 'A4' }, { value: 'letter', label: 'Letter' }, { value: 'fit', label: 'Sesuai gambar' }] },
      { type: 'number', key: 'margin', label: 'Margin (pt)', default: 12, min: 0, max: 100 }
    ]
  },

  /* ===== Optimalkan ===== */
  {
    id: 'compress', category: 'optimize', title: 'Kompres PDF', icon: '🗜️',
    desc: 'Perkecil ukuran file untuk dikirim atau diunggah.', keywords: ['kompres', 'compress', 'perkecil', 'kecil'],
    accept: 'pdf', multiple: false, status: 'beta', actionLabel: 'Kompres', run: lazy(convert, 'compress'),
    fields: [{ type: 'select', key: 'level', label: 'Tingkat kompresi', default: 'recommended', options: [
      { value: 'extreme', label: 'Maksimal (file terkecil, kualitas lebih rendah)' },
      { value: 'recommended', label: 'Disarankan (seimbang)' },
      { value: 'light', label: 'Ringan (kualitas tinggi)' }] }]
  },
  {
    id: 'repair', category: 'optimize', title: 'Perbaiki PDF', icon: '🩹',
    desc: 'Pulihkan PDF yang rusak atau tidak bisa dibuka.', keywords: ['repair', 'rusak', 'corrupt', 'perbaiki'],
    accept: 'pdf', multiple: false, status: 'beta', actionLabel: 'Perbaiki', run: lazy(secure, 'repair')
  },
  {
    id: 'ocr', category: 'optimize', title: 'OCR PDF', icon: '🔎',
    desc: 'Ubah PDF hasil scan menjadi PDF yang teksnya bisa dicari.', keywords: ['ocr', 'teks', 'scan', 'baca'],
    accept: 'pdf', multiple: false, status: 'beta', actionLabel: 'Jalankan OCR', run: lazy(secure, 'ocr'),
    fields: [{ type: 'select', key: 'lang', label: 'Bahasa dokumen', default: 'ind+eng', options: [
      { value: 'ind+eng', label: 'Indonesia + Inggris' }, { value: 'ind', label: 'Indonesia' }, { value: 'eng', label: 'Inggris' },
      { value: 'spa', label: 'Spanyol' }, { value: 'fra', label: 'Prancis' }, { value: 'deu', label: 'Jerman' },
      { value: 'por', label: 'Portugis' }, { value: 'ita', label: 'Italia' }, { value: 'nld', label: 'Belanda' }, { value: 'tur', label: 'Turki' }] }]
  },

  /* ===== Ke PDF ===== */
  {
    id: 'jpg-to-pdf', category: 'to-pdf', title: 'JPG ke PDF', icon: '🖼️',
    desc: 'Ubah gambar (JPG, PNG, WebP) menjadi PDF.', keywords: ['jpg', 'jpeg', 'png', 'gambar', 'image', 'foto'],
    accept: 'image', multiple: true, status: 'ready', actionLabel: 'Ubah ke PDF', run: lazy(convert, 'imagesToPdf'),
    fields: [
      { type: 'select', key: 'size', label: 'Ukuran halaman', default: 'a4', options: [
        { value: 'a4', label: 'A4' }, { value: 'letter', label: 'Letter' }, { value: 'fit', label: 'Sesuai ukuran gambar' }] },
      { type: 'number', key: 'margin', label: 'Margin (pt)', default: 0, min: 0, max: 100 }
    ]
  },
  {
    id: 'word-to-pdf', category: 'to-pdf', title: 'WORD ke PDF', icon: '📘',
    desc: 'Ubah dokumen Word (.docx) menjadi PDF.', keywords: ['docx', 'doc', 'word'],
    accept: 'docx', multiple: false, status: 'beta', actionLabel: 'Ubah ke PDF', run: lazy(toPdf, 'wordToPdf'),
    fields: [{ type: 'select', key: 'size', label: 'Ukuran kertas', default: 'a4', options: [{ value: 'a4', label: 'A4' }, { value: 'letter', label: 'Letter' }] }]
  },
  {
    id: 'ppt-to-pdf', category: 'to-pdf', title: 'POWERPOINT ke PDF', icon: '📙',
    desc: 'Ubah presentasi (.pptx) menjadi PDF.', keywords: ['pptx', 'slide', 'presentasi', 'powerpoint'],
    accept: 'pptx', multiple: false, status: 'beta', actionLabel: 'Ubah ke PDF', run: lazy(toPdf, 'pptToPdf')
  },
  {
    id: 'excel-to-pdf', category: 'to-pdf', title: 'EXCEL ke PDF', icon: '📗',
    desc: 'Ubah spreadsheet (.xlsx atau .csv) menjadi PDF.', keywords: ['xlsx', 'xls', 'csv', 'spreadsheet', 'tabel'],
    accept: 'xlsx', multiple: false, status: 'beta', actionLabel: 'Ubah ke PDF', run: lazy(toPdf, 'excelToPdf'),
    fields: [
      { type: 'select', key: 'orient', label: 'Orientasi', default: 'auto', options: [{ value: 'auto', label: 'Otomatis' }, { value: 'portrait', label: 'Tegak' }, { value: 'landscape', label: 'Mendatar' }] },
      { type: 'select', key: 'header', label: 'Baris pertama', default: 'yes', options: [{ value: 'yes', label: 'Judul kolom (ditebalkan)' }, { value: 'no', label: 'Data biasa' }] },
      { type: 'select', key: 'size', label: 'Ukuran kertas', default: 'a4', options: [{ value: 'a4', label: 'A4' }, { value: 'letter', label: 'Letter' }] }
    ]
  },
  {
    id: 'html-to-pdf', category: 'to-pdf', title: 'HTML ke PDF', icon: '🌐',
    desc: 'Ubah file HTML atau teks yang ditempel menjadi PDF.', keywords: ['web', 'html', 'halaman'],
    accept: 'html', multiple: false, minFiles: 0, status: 'beta', actionLabel: 'Ubah ke PDF', run: lazy(toPdf, 'htmlToPdf'),
    fields: [
      { type: 'textarea', key: 'html', label: 'Atau tempel kode HTML / teks di sini', placeholder: '<h1>Judul</h1><p>Isi dokumen…</p>' },
      { type: 'select', key: 'size', label: 'Ukuran kertas', default: 'a4', options: [{ value: 'a4', label: 'A4' }, { value: 'letter', label: 'Letter' }] }
    ]
  },

  /* ===== Dari PDF ===== */
  {
    id: 'pdf-to-jpg', category: 'from-pdf', title: 'PDF ke JPG', icon: '🏞️',
    desc: 'Ubah setiap halaman PDF menjadi gambar.', keywords: ['jpg', 'gambar', 'image', 'png'],
    accept: 'pdf', multiple: false, status: 'ready', actionLabel: 'Ubah ke JPG', run: lazy(convert, 'pdfToJpg'),
    fields: [{ type: 'select', key: 'scale', label: 'Kualitas gambar', default: '2', options: [
      { value: '1.5', label: 'Standar (~108 dpi)' }, { value: '2', label: 'Tinggi (~144 dpi)' }, { value: '3', label: 'Sangat tinggi (~216 dpi)' }] }]
  },
  {
    id: 'pdf-to-word', category: 'from-pdf', title: 'PDF ke WORD', icon: '📝',
    desc: 'Ubah PDF menjadi dokumen Word (.docx) yang bisa diedit.', keywords: ['docx', 'word', 'edit teks'],
    accept: 'pdf', multiple: false, status: 'beta', actionLabel: 'Ubah ke Word', run: lazy(fromPdf, 'pdfToWord'),
    fields: [{ type: 'select', key: 'pagebreak', label: 'Pemisah halaman', default: 'yes', options: [{ value: 'yes', label: 'Pertahankan (satu halaman PDF = satu halaman Word)' }, { value: 'no', label: 'Teks mengalir tanpa pemisah' }] }]
  },
  {
    id: 'pdf-to-ppt', category: 'from-pdf', title: 'PDF ke POWERPOINT', icon: '📊',
    desc: 'Ubah halaman PDF menjadi slide PowerPoint.', keywords: ['pptx', 'slide', 'presentasi'],
    accept: 'pdf', multiple: false, status: 'beta', actionLabel: 'Ubah ke PowerPoint', run: lazy(fromPdf, 'pdfToPpt'),
    fields: [{ type: 'select', key: 'mode', label: 'Hasil slide', default: 'image', options: [{ value: 'image', label: 'Gambar (tampilan akurat)' }, { value: 'text', label: 'Kotak teks yang bisa diedit' }] }]
  },
  {
    id: 'pdf-to-excel', category: 'from-pdf', title: 'PDF ke EXCEL', icon: '📈',
    desc: 'Ambil tabel dan data dari PDF ke spreadsheet.', keywords: ['xlsx', 'tabel', 'spreadsheet'],
    accept: 'pdf', multiple: false, status: 'beta', actionLabel: 'Ubah ke Excel', run: lazy(fromPdf, 'pdfToExcel'),
    fields: [{ type: 'select', key: 'mode', label: 'Susunan sheet', default: 'sheets', options: [{ value: 'sheets', label: 'Satu sheet per halaman' }, { value: 'one', label: 'Semua dalam satu sheet' }] }]
  },
  {
    id: 'pdf-to-pdfa', category: 'from-pdf', title: 'PDF ke PDF/A', icon: '🏛️',
    desc: 'Format arsip jangka panjang (versi gambar).', keywords: ['arsip', 'pdfa', 'archive'],
    accept: 'pdf', multiple: false, status: 'beta', actionLabel: 'Ubah ke PDF/A', run: lazy(secure, 'toPdfA'),
    fields: [
      { type: 'select', key: 'part', label: 'Standar', default: '2', options: [{ value: '2', label: 'PDF/A-2b (disarankan)' }, { value: '1', label: 'PDF/A-1b' }] },
      { type: 'select', key: 'quality', label: 'Kualitas gambar', default: 'std', options: [{ value: 'std', label: 'Standar' }, { value: 'high', label: 'Tinggi (file lebih besar)' }] }
    ]
  },

  /* ===== Edit ===== */
  {
    id: 'rotate', category: 'edit', title: 'Putar PDF', icon: '🔄',
    desc: 'Putar halaman 90°, 180°, atau 270°.', keywords: ['putar', 'rotate', 'miring'],
    accept: 'pdf', multiple: false, status: 'ready', actionLabel: 'Putar', run: lazy(pages, 'rotate'),
    fields: [
      { type: 'select', key: 'angle', label: 'Arah putar', default: '90', options: [
        { value: '90', label: '90° searah jarum jam' }, { value: '180', label: '180°' }, { value: '270', label: '90° berlawanan jarum jam' }] },
      PAGES
    ]
  },
  {
    id: 'page-numbers', category: 'edit', title: 'Nomor halaman', icon: '🔢',
    desc: 'Tambahkan nomor di setiap halaman.', keywords: ['nomor', 'page number', 'halaman'],
    accept: 'pdf', multiple: false, status: 'ready', actionLabel: 'Tambahkan nomor', run: lazy(stamp, 'pageNumbers'),
    fields: [
      { type: 'select', key: 'position', label: 'Posisi', default: 'bottom-center', options: [
        { value: 'bottom-center', label: 'Bawah tengah' }, { value: 'bottom-right', label: 'Bawah kanan' }, { value: 'bottom-left', label: 'Bawah kiri' },
        { value: 'top-center', label: 'Atas tengah' }, { value: 'top-right', label: 'Atas kanan' }, { value: 'top-left', label: 'Atas kiri' }] },
      { type: 'select', key: 'format', label: 'Format', default: '{n}', options: [
        { value: '{n}', label: '1, 2, 3' }, { value: 'Halaman {n} dari {total}', label: 'Halaman 1 dari 10' }, { value: '{n} / {total}', label: '1 / 10' }] },
      { type: 'number', key: 'start', label: 'Mulai dari nomor', default: 1, min: 0, max: 9999 },
      { type: 'number', key: 'size', label: 'Ukuran huruf', default: 11, min: 6, max: 36 },
      PAGES
    ]
  },
  {
    id: 'watermark', category: 'edit', title: 'Tambahkan watermark', icon: '💧',
    desc: 'Beri tanda air teks di atas halaman.', keywords: ['watermark', 'tanda air', 'cap'],
    accept: 'pdf', multiple: false, status: 'ready', actionLabel: 'Tambahkan watermark', run: lazy(stamp, 'watermark'),
    fields: [
      { type: 'text', key: 'text', label: 'Teks watermark', default: 'RAHASIA', placeholder: 'RAHASIA' },
      { type: 'number', key: 'size', label: 'Ukuran huruf', default: 60, min: 12, max: 200 },
      { type: 'number', key: 'opacity', label: 'Opasitas (%)', default: 25, min: 5, max: 100 },
      { type: 'number', key: 'angle', label: 'Kemiringan (°)', default: 45, min: -90, max: 90 },
      { type: 'select', key: 'color', label: 'Warna', default: 'gray', options: [
        { value: 'gray', label: 'Abu-abu' }, { value: 'red', label: 'Merah' }, { value: 'blue', label: 'Biru' }] },
      PAGES
    ]
  },
  {
    id: 'crop', category: 'edit', title: 'Potong PDF', icon: '📐',
    desc: 'Pangkas tepi halaman dengan margin.', keywords: ['potong', 'crop', 'pangkas', 'margin'],
    accept: 'pdf', multiple: false, status: 'ready', actionLabel: 'Potong', run: lazy(pages, 'crop'),
    fields: [
      { type: 'number', key: 'top', label: 'Atas (mm)', default: 10, min: 0, max: 200 },
      { type: 'number', key: 'right', label: 'Kanan (mm)', default: 10, min: 0, max: 200 },
      { type: 'number', key: 'bottom', label: 'Bawah (mm)', default: 10, min: 0, max: 200 },
      { type: 'number', key: 'left', label: 'Kiri (mm)', default: 10, min: 0, max: 200 },
      PAGES
    ]
  },
  {
    id: 'edit-pdf', category: 'edit', title: 'Edit PDF', icon: '✏️',
    desc: 'Tambahkan teks, kotak, sorotan, gambar, dan coretan.', keywords: ['anotasi', 'teks', 'tulis', 'edit', 'sorot'],
    accept: 'pdf', multiple: false, status: 'beta', custom: () => import('../components/EditPdf')
  },
  {
    id: 'form', category: 'edit', title: 'Formulir PDF', icon: '📋',
    desc: 'Isi kolom formulir PDF interaktif.', keywords: ['form', 'isi', 'formulir'],
    accept: 'pdf', multiple: false, status: 'ready', custom: () => import('../components/FormFiller')
  },

  /* ===== Keamanan ===== */
  {
    id: 'unlock', category: 'security', title: 'Buka PDF terkunci', icon: '🔓',
    desc: 'Hapus password dari PDF (Anda harus tahu password-nya).', keywords: ['password', 'unlock', 'kunci', 'buka'],
    accept: 'pdf', multiple: false, status: 'beta', actionLabel: 'Buka kunci', run: lazy(secure, 'unlock'),
    fields: [{ type: 'password', key: 'password', label: 'Password PDF', hint: 'Alat ini tidak menebak password. Anda harus mengetahuinya.' }]
  },
  {
    id: 'protect', category: 'security', title: 'Proteksi PDF', icon: '🔒',
    desc: 'Kunci PDF dengan password (enkripsi AES-128).', keywords: ['password', 'enkripsi', 'protect', 'kunci'],
    accept: 'pdf', multiple: false, status: 'ready', actionLabel: 'Kunci PDF', run: lazy(secure, 'protect'),
    fields: [
      { type: 'password', key: 'user', label: 'Password untuk membuka', hint: 'Gunakan huruf, angka, dan simbol biasa. Jangan sampai lupa.' },
      { type: 'password', key: 'owner', label: 'Password pemilik (opsional)', hint: 'Dipakai untuk mengubah izin. Kosong = sama dengan password pembuka.' },
      { type: 'select', key: 'print', label: 'Boleh dicetak', default: 'yes', options: [{ value: 'yes', label: 'Ya' }, { value: 'no', label: 'Tidak' }] },
      { type: 'select', key: 'copy', label: 'Boleh menyalin teks', default: 'yes', options: [{ value: 'yes', label: 'Ya' }, { value: 'no', label: 'Tidak' }] },
      { type: 'select', key: 'modify', label: 'Boleh mengubah', default: 'yes', options: [{ value: 'yes', label: 'Ya' }, { value: 'no', label: 'Tidak' }] }
    ]
  },
  {
    id: 'sign', category: 'security', title: 'Tanda tangani PDF', icon: '🖋️',
    desc: 'Bubuhkan tanda tangan gambar ke dokumen.', keywords: ['tanda tangan', 'sign', 'ttd', 'signature'],
    accept: 'pdf', multiple: false, status: 'beta', actionLabel: 'Tanda tangani', run: lazy(stamp, 'sign'),
    fields: [
      { type: 'signature', key: 'signature', label: 'Gambar tanda tangan Anda' },
      { type: 'select', key: 'target', label: 'Halaman', default: 'last', options: [
        { value: 'last', label: 'Halaman terakhir' }, { value: 'first', label: 'Halaman pertama' }, { value: 'all', label: 'Semua halaman' }] },
      { type: 'select', key: 'position', label: 'Posisi', default: 'bottom-right', options: [
        { value: 'bottom-right', label: 'Bawah kanan' }, { value: 'bottom-left', label: 'Bawah kiri' }, { value: 'bottom-center', label: 'Bawah tengah' },
        { value: 'middle-center', label: 'Tengah' }, { value: 'top-right', label: 'Atas kanan' }, { value: 'top-left', label: 'Atas kiri' }] },
      { type: 'number', key: 'width', label: 'Lebar tanda tangan (pt)', default: 150, min: 40, max: 400 }
    ]
  },
  {
    id: 'redact', category: 'security', title: 'Samarkan PDF', icon: '⬛',
    desc: 'Hapus permanen teks atau area sensitif.', keywords: ['redact', 'sensor', 'hitamkan', 'samar', 'rahasia'],
    accept: 'pdf', multiple: false, status: 'ready', custom: () => import('../components/RedactPdf')
  },
  {
    id: 'compare', category: 'security', title: 'Bandingkan PDF', icon: '⚖️',
    desc: 'Lihat perbedaan teks atau tampilan dua PDF.', keywords: ['compare', 'beda', 'revisi', 'banding'],
    accept: 'pdf', multiple: true, minFiles: 2, status: 'beta', custom: () => import('../components/Compare')
  },

  /* ===== AI ===== */
  {
    id: 'summarize', category: 'ai', title: 'Perangkum AI', icon: '✨',
    desc: 'Ringkas isi PDF di perangkat Anda.', keywords: ['ringkas', 'summary', 'rangkum', 'ai'],
    accept: 'pdf', multiple: false, status: 'beta', custom: () => import('../components/AiSummarize')
  },
  {
    id: 'translate', category: 'ai', title: 'Terjemahkan PDF', icon: '🌍',
    desc: 'Terjemahkan teks PDF antar bahasa.', keywords: ['translate', 'bahasa', 'terjemah'],
    accept: 'pdf', multiple: false, status: 'beta', custom: () => import('../components/AiTranslate')
  },
  {
    id: 'pdf-to-markdown', category: 'ai', title: 'PDF ke Markdown', icon: '🧾',
    desc: 'Ekstrak teks PDF menjadi Markdown berstruktur.', keywords: ['markdown', 'md', 'teks', 'ekstrak'],
    accept: 'pdf', multiple: false, status: 'beta', actionLabel: 'Ubah ke Markdown', run: lazy(convert, 'pdfToMarkdown')
  }
];

export const getTool = (id: string) => TOOLS.find((t) => t.id === id);

export function defaultOpts(tool: ToolDef) {
  const o: Record<string, any> = {};
  tool.fields?.forEach((f) => {
    if (f.type === 'signature') o[f.key] = '';
    else o[f.key] = (f as any).default ?? '';
  });
  return o;
}
