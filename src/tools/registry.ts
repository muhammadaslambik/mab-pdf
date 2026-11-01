import type { Category, FieldDef, RunFn, ToolDef } from './types';

/** Impor impl secara malas: tiap alat jadi chunk terpisah, pengguna hanya mengunduh yang dipakai. */
const lazy =
  <T extends Record<string, any>>(loader: () => Promise<T>, name: keyof T): RunFn =>
  async (f, o, c) =>
    (await loader())[name](f, o, c);

const pages = () => import('./impl/pages');
const stamp = () => import('./impl/stamp');
const convert = () => import('./impl/convert');

const PAGES: FieldDef = {
  type: 'text', key: 'pages', label: 'Halaman', default: 'all', placeholder: 'all',
  hint: 'Contoh: 1-3,5,8-  (ketik "all" untuk semua halaman)'
};

const soon = (
  id: string, category: Category, title: string, desc: string, icon: string,
  accept: 'pdf' | 'image', plan: string, keywords: string[] = []
): ToolDef => ({ id, category, title, desc, icon, accept, keywords, multiple: false, status: 'soon', plan });

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
  soon('repair', 'optimize', 'Perbaiki PDF', 'Pulihkan PDF yang rusak.', '🩹', 'pdf',
    'qpdf-wasm (rebuild xref). Dijadwalkan fase 2.', ['repair', 'rusak']),
  soon('ocr', 'optimize', 'OCR PDF', 'Ubah PDF hasil scan jadi teks yang bisa dicari.', '🔎', 'pdf',
    'tesseract.js (Wasm) + teks tak terlihat via pdf-lib. Dijadwalkan fase 2.', ['ocr', 'teks', 'scan']),

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
  soon('word-to-pdf', 'to-pdf', 'WORD ke PDF', 'Ubah dokumen Word menjadi PDF.', '📘', 'pdf',
    'mammoth (docx→HTML) + render PDF; atau LibreOffice-Wasm untuk fidelity tinggi. Fase 3.', ['docx', 'doc']),
  soon('ppt-to-pdf', 'to-pdf', 'POWERPOINT ke PDF', 'Ubah presentasi menjadi PDF.', '📙', 'pdf',
    'Butuh LibreOffice-Wasm (besar). Eksperimental, fase 4.', ['pptx', 'slide']),
  soon('excel-to-pdf', 'to-pdf', 'EXCEL ke PDF', 'Ubah spreadsheet menjadi PDF.', '📗', 'pdf',
    'SheetJS → tabel HTML → PDF. Fase 3.', ['xlsx', 'xls']),
  soon('html-to-pdf', 'to-pdf', 'HTML ke PDF', 'Ubah halaman HTML menjadi PDF.', '🌐', 'pdf',
    'html2canvas + jsPDF atau window.print. Fase 3.', ['web']),

  /* ===== Dari PDF ===== */
  {
    id: 'pdf-to-jpg', category: 'from-pdf', title: 'PDF ke JPG', icon: '🏞️',
    desc: 'Ubah setiap halaman PDF menjadi gambar.', keywords: ['jpg', 'gambar', 'image', 'png'],
    accept: 'pdf', multiple: false, status: 'ready', actionLabel: 'Ubah ke JPG', run: lazy(convert, 'pdfToJpg'),
    fields: [{ type: 'select', key: 'scale', label: 'Kualitas gambar', default: '2', options: [
      { value: '1.5', label: 'Standar (~108 dpi)' }, { value: '2', label: 'Tinggi (~144 dpi)' }, { value: '3', label: 'Sangat tinggi (~216 dpi)' }] }]
  },
  soon('pdf-to-word', 'from-pdf', 'PDF ke WORD', 'Ubah PDF menjadi dokumen Word.', '📝', 'pdf',
    'pdfjs getTextContent + library docx. Fase 3.', ['docx']),
  soon('pdf-to-ppt', 'from-pdf', 'PDF ke POWERPOINT', 'Ubah PDF menjadi slide.', '📊', 'pdf',
    'pdfjs + pptxgenjs. Fase 3.', ['pptx']),
  soon('pdf-to-excel', 'from-pdf', 'PDF ke EXCEL', 'Ambil tabel dari PDF ke spreadsheet.', '📈', 'pdf',
    'pdfjs + heuristik tabel + SheetJS. Fase 3.', ['xlsx', 'tabel']),
  soon('pdf-to-pdfa', 'from-pdf', 'PDF ke PDF/A', 'Format arsip jangka panjang.', '🏛️', 'pdf',
    'ghostscript-wasm (AGPL). Fase 4.', ['arsip']),

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
  soon('edit-pdf', 'edit', 'Edit PDF', 'Tambah teks, bentuk, dan gambar.', '✏️', 'pdf',
    'Editor overlay (Konva/fabric.js) + pdf-lib. Fase 2.', ['anotasi', 'teks']),
  soon('form', 'edit', 'Formulir PDF', 'Isi formulir PDF interaktif.', '📋', 'pdf',
    'pdf-lib getForm() + flatten. Fase 2.', ['form', 'isi']),

  /* ===== Keamanan ===== */
  soon('unlock', 'security', 'Buka PDF terkunci', 'Hapus password dari PDF (Anda harus tahu password-nya).', '🔓', 'pdf',
    'qpdf-wasm --decrypt. Fase 2.', ['password', 'unlock']),
  soon('protect', 'security', 'Proteksi PDF', 'Kunci PDF dengan password.', '🔒', 'pdf',
    'qpdf-wasm --encrypt 256. Fase 2.', ['password', 'enkripsi']),
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
  soon('redact', 'security', 'Samarkan PDF', 'Hapus permanen teks sensitif.', '⬛', 'pdf',
    'Rasterisasi halaman yang diredaksi (bukan sekadar kotak hitam). Fase 2.', ['redact', 'sensor']),
  soon('compare', 'security', 'Bandingkan PDF', 'Lihat perbedaan dua PDF.', '⚖️', 'pdf',
    'pdfjs + diff-match-patch + pixelmatch. Fase 2.', ['compare', 'beda']),

  /* ===== AI ===== */
  soon('summarize', 'ai', 'Perangkum AI', 'Ringkas isi PDF di perangkat Anda.', '✨', 'pdf',
    'Chrome built-in Summarizer API / WebLLM (WebGPU). Opt-in, fase 4.', ['ringkas', 'summary']),
  soon('translate', 'ai', 'Terjemahkan PDF', 'Terjemahkan teks PDF antar bahasa.', '🌍', 'pdf',
    'Chrome Translator API / Bergamot Wasm. Fase 4.', ['translate', 'bahasa']),
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
