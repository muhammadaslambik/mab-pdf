import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { LineCapStyle, PDFDocument, PDFFont, StandardFonts, degrees, rgb } from 'pdf-lib';
import type { CustomProps } from '../tools/types';
import { canvasToBlob, loadPdf, openPdfJs, releaseCanvas, renderPage } from '../lib/pdf';
import { baseName, pdfResult } from '../lib/util';
import SignatureMaker from './SignatureMaker';
import { UiIcon } from './icons';

type Mode = 'edit' | 'redact' | 'sign';
type Tool = 'move' | 'text' | 'edittext' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'box' | 'hl' | 'pen' | 'image' | 'erase' | 'redact';
type FontKey = 'sans' | 'serif' | 'mono';
type Item = { id: number; page: number } & (
  | { kind: 'text'; x: number; y: number; text: string; size: number; color: string; font: FontKey; bold: boolean; italic: boolean }
  | { kind: 'rect' | 'box' | 'hl' | 'ellipse'; x: number; y: number; w: number; h: number; color: string; cover?: boolean }
  | { kind: 'line'; x: number; y: number; x2: number; y2: number; color: string; arrow: boolean }
  | { kind: 'pen'; pts: [number, number][]; color: string; width: number }
  | { kind: 'img'; x: number; y: number; w: number; h: number; data: string }
  | { kind: 'redact'; x: number; y: number; w: number; h: number }
);
type NewItem = Item extends infer T ? (T extends Item ? Omit<T, 'id' | 'page'> : never) : never;
interface TBox { x: number; y: number; w: number; h: number; str: string; size: number; base: number }

const hexRgb = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const mul = (a: number[], b: number[]) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
const CSS_FONT: Record<FontKey, string> = { sans: 'Helvetica, Arial, sans-serif', serif: '"Times New Roman", Times, serif', mono: '"Courier New", Courier, monospace' };
const STD: Record<FontKey, [StandardFonts, StandardFonts, StandardFonts, StandardFonts]> = {
  sans: [StandardFonts.Helvetica, StandardFonts.HelveticaBold, StandardFonts.HelveticaOblique, StandardFonts.HelveticaBoldOblique],
  serif: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold, StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBoldItalic],
  mono: [StandardFonts.Courier, StandardFonts.CourierBold, StandardFonts.CourierOblique, StandardFonts.CourierBoldOblique]
};
const LABEL: Record<Tool, string> = { move: 'Pilih & geser', text: 'Teks', edittext: 'Edit teks PDF', rect: 'Kotak', ellipse: 'Elips', line: 'Garis', arrow: 'Panah', box: 'Blok warna', hl: 'Sorot', pen: 'Pena', image: 'Gambar', erase: 'Hapus objek', redact: 'Tandai area' };
const TOOLS: Record<Mode, Tool[]> = {
  edit: ['move', 'text', 'edittext', 'rect', 'ellipse', 'line', 'arrow', 'box', 'hl', 'pen', 'image', 'erase'],
  sign: ['move', 'image', 'text', 'erase'],
  redact: ['redact', 'move', 'erase']
};
const SUFFIX: Record<Mode, string> = { edit: 'edit', sign: 'ttd', redact: 'samar' };
const HINT: Partial<Record<Tool, string>> = {
  edittext: 'Klik teks pada halaman untuk menggantinya (teks lama ditutup warna latar). Untuk menghapus data sensitif secara permanen, pakai Samarkan PDF.',
  move: 'Klik objek untuk memilih, seret untuk memindah, tarik titik di pojok untuk mengubah ukuran. Delete menghapus.',
  text: 'Klik di halaman untuk menaruh teks.', line: 'Seret untuk membuat garis.', arrow: 'Seret untuk membuat panah.'
};

export default function Annotator({ files, onDone, onError, mode }: CustomProps & { mode: Mode }) {
  const file = files[0];
  const [doc, setDoc] = useState<any>(null);
  const [n, setN] = useState(1);
  const [total, setTotal] = useState(0);
  const [bg, setBg] = useState<{ url: string; w: number; h: number } | null>(null);
  const [boxes, setBoxes] = useState<TBox[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [selBox, setSelBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [tool, setTool] = useState<Tool>(mode === 'redact' ? 'redact' : mode === 'sign' ? 'move' : 'text');
  const [color, setColor] = useState(mode === 'redact' ? '#000000' : mode === 'sign' ? '#0b1b4d' : '#d62828');
  const [size, setSize] = useState(16);
  const [font, setFont] = useState<FontKey>('sans');
  const [bold, setBold] = useState(false);
  const [italic, setItalic] = useState(false);
  const [draft, setDraft] = useState<Item | null>(null);
  const [textAt, setTextAt] = useState<{ x: number; y: number; value: string; size: number; cover?: TBox } | null>(null);
  const [preset, setPreset] = useState('');
  const [img, setImg] = useState<{ data: string; ratio: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [info, setInfo] = useState('');
  const svg = useRef<SVGSVGElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const start = useRef({ x: 0, y: 0 });
  const nid = useRef(1);
  const imgInput = useRef<HTMLInputElement>(null);
  const textPending = useRef(false);
  const bgCanvas = useRef<HTMLCanvasElement | null>(null);
  const drag = useRef<{ kind: 'move' | 'size' | 'a' | 'b'; id: number; p: { x: number; y: number }; orig: Item } | null>(null);
  const selItem = items.find((i) => i.id === sel) ?? null;

  useEffect(() => {
    let dead = false, d: any = null;
    setItems([]); setN(1); setDoc(null); setBg(null); setSel(null);
    openPdfJs(file).then((x) => { d = x; if (dead) return x.destroy(); setDoc(x); setTotal(x.numPages); }).catch((e) => onError(e.message));
    return () => { dead = true; d?.destroy?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  useEffect(() => {
    if (!doc) return;
    let dead = false;
    setSel(null); setTextAt(null);
    (async () => {
      const page = await doc.getPage(n);
      const vp = page.getViewport({ scale: 1 });
      const c = await renderPage(page, Math.min(2, 1000 / vp.width), 4_000_000);
      const url = c.toDataURL('image/jpeg', 0.85);
      if (bgCanvas.current) releaseCanvas(bgCanvas.current);
      bgCanvas.current = c;
      // kotak teks untuk fitur "Edit teks PDF" (hanya halaman tidak terotasi)
      const rows: { base: number; size: number; its: { x: number; w: number; s: string }[] }[] = [];
      if (page.rotate % 360 === 0) {
        const tc = await page.getTextContent();
        for (const it of tc.items as any[]) {
          if (typeof it.str !== 'string' || !it.str.trim()) continue;
          const m = mul(vp.transform, it.transform), sz = Math.hypot(m[2], m[3]) || 10;
          let r = rows.find((q) => Math.abs(q.base - m[5]) < sz * 0.3);
          if (!r) rows.push((r = { base: m[5], size: sz, its: [] }));
          r.size = Math.max(r.size, sz); r.its.push({ x: m[4], w: it.width ?? 0, s: it.str });
        }
      }
      const bx: TBox[] = rows.map((r) => {
        r.its.sort((a, b) => a.x - b.x);
        let str = '', end = -Infinity;
        for (const p of r.its) { if (str && p.x - end > r.size * 0.15 && !str.endsWith(' ') && !p.s.startsWith(' ')) str += ' '; str += p.s; end = p.x + p.w; }
        const x0 = r.its[0].x, x1 = Math.max(...r.its.map((p) => p.x + p.w));
        return { x: x0, y: r.base - r.size * 0.9, w: x1 - x0, h: r.size * 1.25, str, size: r.size, base: r.base };
      });
      page.cleanup();
      if (!dead) { setBg({ url, w: vp.width, h: vp.height }); setBoxes(bx); }
    })().catch((e) => onError(e.message));
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, n]);

  const add = (it: NewItem): number => { const id = nid.current++; setItems((a) => [...a, { ...it, id, page: n } as Item]); return id; };
  const update = (id: number, patch: Record<string, any>) => setItems((a) => a.map((x) => (x.id === id ? ({ ...x, ...patch } as Item) : x)));
  const pos = (e: React.PointerEvent | PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * bg!.w) / r.width, y: ((e.clientY - r.top) * bg!.h) / r.height };
  };

  // kotak seleksi mengikuti objek terpilih
  useLayoutEffect(() => {
    if (sel == null) { setSelBox(null); return; }
    const el = svg.current?.querySelector(`[data-id="${sel}"]`) as SVGGraphicsElement | null;
    if (!el) { setSelBox(null); return; }
    const b = el.getBBox();
    setSelBox({ x: b.x, y: b.y, w: b.width, h: b.height });
  }, [sel, items, n, bg]);

  // pintasan papan ketik: hapus, geser halus, batal pilih
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (sel == null || /input|textarea|select/i.test((e.target as HTMLElement).tagName)) return;
      const step = e.shiftKey ? 10 : 1;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); setItems((a) => a.filter((x) => x.id !== sel)); setSel(null); }
      else if (e.key === 'Escape') setSel(null);
      else if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        setItems((a) => a.map((x) => (x.id === sel ? translate(x, dx, dy) : x)));
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [sel]);

  const translate = (it: Item, dx: number, dy: number): Item => {
    if (it.kind === 'pen') return { ...it, pts: it.pts.map(([x, y]) => [x + dx, y + dy] as [number, number]) };
    if (it.kind === 'line') return { ...it, x: it.x + dx, y: it.y + dy, x2: it.x2 + dx, y2: it.y2 + dy };
    return { ...it, x: it.x + dx, y: it.y + dy } as Item;
  };

  const sample = (b: TBox) => {
    const c = bgCanvas.current;
    if (!c || !bg) return { hex: '#ffffff', dark: false };
    const k = c.width / bg.w, g = c.getContext('2d')!;
    const pts = [[b.x - 2, b.y - 2], [b.x + b.w + 2, b.y - 2], [b.x - 2, b.y + b.h + 2], [b.x + b.w + 2, b.y + b.h + 2]];
    let r = 0, gg = 0, bb = 0;
    for (const [px, py] of pts) { const d = g.getImageData(Math.max(0, Math.min(c.width - 1, Math.round(px * k))), Math.max(0, Math.min(c.height - 1, Math.round(py * k))), 1, 1).data; r += d[0]; gg += d[1]; bb += d[2]; }
    r = Math.round(r / 4); gg = Math.round(gg / 4); bb = Math.round(bb / 4);
    const h = (v: number) => v.toString(16).padStart(2, '0');
    return { hex: `#${h(r)}${h(gg)}${h(bb)}`, dark: (r * 299 + gg * 587 + bb * 114) / 1000 < 110 };
  };

  const down = (e: React.PointerEvent) => {
    if (!bg) return;
    const p = pos(e);
    if (tool === 'text') { start.current = p; textPending.current = true; return; }
    if (tool === 'edittext' || tool === 'erase') return;
    if (tool === 'move') { setSel(null); return; }
    if (tool === 'image') {
      if (!img) { setInfo(mode === 'sign' ? 'Buat atau pilih tanda tangan di atas dulu.' : 'Pilih gambar dulu.'); if (mode !== 'sign') imgInput.current?.click(); return; }
      const w = mode === 'sign' ? 150 : 140, h = w / img.ratio;
      const id = add({ kind: 'img', x: p.x - w / 2, y: p.y - h / 2, w, h, data: img.data });
      setSel(id); setTool('move'); setInfo('Seret untuk memindah, tarik titik di pojok untuk mengubah ukuran.'); return;
    }
    svg.current!.setPointerCapture(e.pointerId);
    start.current = p;
    if (tool === 'pen') setDraft({ id: 0, page: n, kind: 'pen', pts: [[p.x, p.y]], color, width: Math.max(1, size / 6) });
    else if (tool === 'redact') setDraft({ id: 0, page: n, kind: 'redact', x: p.x, y: p.y, w: 0, h: 0 });
    else if (tool === 'line' || tool === 'arrow') setDraft({ id: 0, page: n, kind: 'line', x: p.x, y: p.y, x2: p.x, y2: p.y, color, arrow: tool === 'arrow' });
    else setDraft({ id: 0, page: n, kind: tool as 'rect', x: p.x, y: p.y, w: 0, h: 0, color });
  };
  const move = (e: React.PointerEvent) => {
    if (!bg) return;
    const d = drag.current;
    if (d) {
      const p = pos(e), dx = p.x - d.p.x, dy = p.y - d.p.y, o = d.orig;
      setItems((a) => a.map((x) => {
        if (x.id !== d.id) return x;
        if (d.kind === 'move') return translate(o, dx, dy);
        if (o.kind === 'line') return d.kind === 'a' ? { ...o, x: o.x + dx, y: o.y + dy } : { ...o, x2: o.x2 + dx, y2: o.y2 + dy };
        if (o.kind === 'text') return { ...o, size: Math.max(6, o.size + dy * 0.6) };
        if (o.kind === 'img') { const w = Math.max(12, o.w + dx); return { ...o, w, h: w * (o.h / o.w) }; }
        if ('w' in o) return { ...o, w: Math.max(6, o.w + dx), h: Math.max(6, o.h + dy) } as Item;
        return o;
      }));
      return;
    }
    if (!draft) return;
    const p = pos(e);
    if (draft.kind === 'pen') setDraft({ ...draft, pts: [...draft.pts, [p.x, p.y]] });
    else if (draft.kind === 'line') setDraft({ ...draft, x2: p.x, y2: p.y });
    else if ('w' in draft) setDraft({ ...draft, x: Math.min(start.current.x, p.x), y: Math.min(start.current.y, p.y), w: Math.abs(p.x - start.current.x), h: Math.abs(p.y - start.current.y) } as Item);
  };
  const up = () => {
    drag.current = null;
    // kotak teks dimunculkan saat tombol dilepas, supaya fokus tidak direbut oleh klik
    if (textPending.current) {
      textPending.current = false;
      if (preset) { const id = add({ kind: 'text', x: start.current.x, y: start.current.y, text: preset, size, color, font, bold, italic }); setPreset(''); setSel(id); setTool('move'); }
      else setTextAt({ x: start.current.x, y: start.current.y, value: '', size });
      return;
    }
    if (!draft) return;
    const ok = draft.kind === 'pen' ? draft.pts.length > 1 : draft.kind === 'line' ? Math.hypot(draft.x2 - draft.x, draft.y2 - draft.y) > 4 : 'w' in draft && draft.w > 3 && draft.h > 3;
    if (ok) { const { id, page, ...rest } = draft as any; add(rest); }
    setDraft(null);
  };

  const itemDown = (e: React.PointerEvent, it: Item) => {
    if (tool === 'erase') { e.stopPropagation(); setItems((a) => a.filter((x) => x.id !== it.id)); setSel(null); return; }
    if (tool !== 'move') return;
    e.stopPropagation();
    setSel(it.id);
    drag.current = { kind: 'move', id: it.id, p: pos(e), orig: it };
    svg.current!.setPointerCapture(e.pointerId);
  };
  const handleDown = (e: React.PointerEvent, kind: 'size' | 'a' | 'b') => {
    e.stopPropagation();
    if (!selItem) return;
    drag.current = { kind, id: selItem.id, p: pos(e), orig: selItem };
    svg.current!.setPointerCapture(e.pointerId);
  };

  const commitText = (value: string) => {
    const t = textAt;
    if (!t) return;
    setTextAt(null);
    if (t.cover) {
      if (value === t.cover.str) return;
      const c = sample(t.cover), b = t.cover;
      add({ kind: 'box', x: b.x - 1.5, y: b.y - 1, w: b.w + 3, h: b.h + 2, color: c.hex, cover: true });
      if (value.trim()) add({ kind: 'text', x: b.x, y: b.base - b.size * 0.85, text: value, size: b.size, color: c.dark ? '#ffffff' : '#111111', font: 'sans', bold: false, italic: false });
      return;
    }
    if (value.trim()) { const id = add({ kind: 'text', x: t.x, y: t.y, text: value, size, color, font, bold, italic }); setSel(id); }
  };

  const pickImage = async (f: File | undefined) => {
    if (!f) return;
    try {
      const bmp = await createImageBitmap(f);
      const k = Math.min(1, 1200 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
      setImg({ data: c.toDataURL('image/png'), ratio: c.width / c.height }); bmp.close(); setTool('image'); setInfo('Klik di halaman untuk menempatkan gambar.');
    } catch { onError('Gambar tidak bisa dibaca.'); }
  };

  const markAll = async () => {
    const q = query.trim().toLowerCase();
    if (!q || !doc) return;
    setBusy(true); setInfo('Mencari…');
    try {
      const found: Item[] = []; let skipped = 0;
      for (let p = 1; p <= total; p++) {
        const page = await doc.getPage(p);
        if (page.rotate % 360 !== 0) { skipped++; page.cleanup(); continue; }
        const vp = page.getViewport({ scale: 1 });
        const tc = await page.getTextContent();
        for (const it of tc.items as any[]) {
          const s: string = it.str ?? ''; const low = s.toLowerCase();
          let from = 0, idx: number;
          while (s && (idx = low.indexOf(q, from)) >= 0) {
            const m = mul(vp.transform, it.transform), sz = Math.hypot(m[2], m[3]);
            found.push({ id: nid.current++, page: p, kind: 'redact', x: m[4] + (it.width * idx) / s.length - 1, y: m[5] - sz * 0.9, w: (it.width * q.length) / s.length + 2, h: sz * 1.15 });
            from = idx + q.length;
          }
        }
        page.cleanup();
      }
      setItems((a) => [...a, ...found]);
      setInfo(found.length ? `${found.length} kemunculan ditandai.${skipped ? ` ${skipped} halaman terotasi dilewati.` : ''}` : 'Kata tidak ditemukan. PDF hasil scan tidak punya lapisan teks yang bisa dicari.');
    } catch (e: any) { onError(e.message); } finally { setBusy(false); }
  };

  const save = async () => {
    if (!items.length) return onError(mode === 'redact' ? 'Tandai dulu area yang ingin disamarkan.' : mode === 'sign' ? 'Tempatkan tanda tangan dulu.' : 'Belum ada perubahan untuk disimpan.');
    setBusy(true);
    try {
      if (mode !== 'redact') {
        const pdf = await loadPdf(file);
        const pages = pdf.getPages();
        const fontCache: Record<string, PDFFont> = {};
        const getFont = async (it: { font: FontKey; bold: boolean; italic: boolean }) => {
          const key = `${it.font}${it.bold}${it.italic}`;
          return (fontCache[key] ??= await pdf.embedFont(STD[it.font][(it.bold ? 1 : 0) + (it.italic ? 2 : 0) === 3 ? 3 : it.bold ? 1 : it.italic ? 2 : 0]));
        };
        let skippedImg = 0;
        for (const pageNo of new Set(items.map((i) => i.page))) {
          const pg = pages[pageNo - 1];
          const jp = await doc.getPage(pageNo);
          const vp = jp.getViewport({ scale: 1 });
          const R = ((jp.rotate % 360) + 360) % 360;
          const P = (x: number, y: number) => vp.convertToPdfPoint(x, y) as [number, number];
          const box = (it: { x: number; y: number; w: number; h: number }) => {
            const a = P(it.x, it.y), b = P(it.x + it.w, it.y + it.h);
            return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), width: Math.abs(a[0] - b[0]), height: Math.abs(a[1] - b[1]) };
          };
          for (const it of items.filter((i) => i.page === pageNo)) {
            if (it.kind === 'text') {
              const [x, y] = P(it.x, it.y + it.size * 0.85);
              try { pg.drawText(it.text, { x, y, size: it.size, font: await getFont(it), color: hexRgb(it.color), rotate: degrees(R) }); }
              catch { throw new Error('Teks mengandung karakter non-Latin yang belum didukung font standar PDF. Gunakan huruf Latin.'); }
            } else if (it.kind === 'rect') pg.drawRectangle({ ...box(it), borderColor: hexRgb(it.color), borderWidth: 1.5 });
            else if (it.kind === 'box') pg.drawRectangle({ ...box(it), color: hexRgb(it.color) });
            else if (it.kind === 'hl') pg.drawRectangle({ ...box(it), color: hexRgb(it.color), opacity: 0.35 });
            else if (it.kind === 'ellipse') { const b = box(it); pg.drawEllipse({ x: b.x + b.width / 2, y: b.y + b.height / 2, xScale: b.width / 2, yScale: b.height / 2, borderColor: hexRgb(it.color), borderWidth: 1.5 }); }
            else if (it.kind === 'line') {
              const a = P(it.x, it.y), b = P(it.x2, it.y2), col = hexRgb(it.color);
              pg.drawLine({ start: { x: a[0], y: a[1] }, end: { x: b[0], y: b[1] }, thickness: 1.8, color: col, lineCap: LineCapStyle.Round });
              if (it.arrow) {
                const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
                for (const s of [-1, 1]) pg.drawLine({ start: { x: b[0], y: b[1] }, end: { x: b[0] - 11 * Math.cos(ang + s * 0.45), y: b[1] - 11 * Math.sin(ang + s * 0.45) }, thickness: 1.8, color: col, lineCap: LineCapStyle.Round });
              }
            } else if (it.kind === 'pen') {
              for (let k = 1; k < it.pts.length; k++) { const a = P(...it.pts[k - 1]), b = P(...it.pts[k]); pg.drawLine({ start: { x: a[0], y: a[1] }, end: { x: b[0], y: b[1] }, thickness: it.width, color: hexRgb(it.color), lineCap: LineCapStyle.Round }); }
            } else if (it.kind === 'img') {
              if (R !== 0) { skippedImg++; continue; }
              pg.drawImage(await pdf.embedPng(it.data), box(it));
            }
          }
          jp.cleanup();
        }
        pdf.setProducer('MAB-PDF');
        const covered = items.some((i) => i.kind === 'box' && i.cover);
        const notes = [skippedImg ? `${skippedImg} gambar pada halaman terotasi dilewati.` : '', covered ? 'Penting: teks asli yang Anda ganti hanya ditutup kotak berwarna latar dan masih ada di dalam berkas. Untuk menghapus data sensitif secara permanen, gunakan alat "Samarkan PDF".' : ''].filter(Boolean).join(' ');
        onDone(pdfResult(await pdf.save(), `${baseName(file.name)}-${SUFFIX[mode]}.pdf`, notes || undefined));
      } else {
        const src = await loadPdf(file);
        const out = await PDFDocument.create();
        const red = new Set(items.map((i) => i.page));
        for (let p = 1; p <= total; p++) {
          if (!red.has(p)) { const [cp] = await out.copyPages(src, [p - 1]); out.addPage(cp); continue; }
          const jp = await doc.getPage(p);
          const vp = jp.getViewport({ scale: 1 });
          const canvas = await renderPage(jp, 3, 12_000_000);
          const k = canvas.width / vp.width;
          const g = canvas.getContext('2d')!;
          g.fillStyle = '#000';
          for (const it of items) if (it.page === p && it.kind === 'redact') g.fillRect(it.x * k, it.y * k, it.w * k, it.h * k);
          const im = await out.embedJpg(new Uint8Array(await (await canvasToBlob(canvas, 'image/jpeg', 0.92)).arrayBuffer()));
          out.addPage([vp.width, vp.height]).drawImage(im, { x: 0, y: 0, width: vp.width, height: vp.height });
          releaseCanvas(canvas); jp.cleanup();
        }
        out.setProducer('MAB-PDF');
        onDone(pdfResult(await out.save(), `${baseName(file.name)}-samar.pdf`, `Penyamaran permanen: ${red.size} halaman dirender ulang sebagai gambar dengan area hitam, sehingga teks di bawahnya benar-benar hilang. Teks pada halaman tersebut tidak bisa diseleksi lagi.`));
      }
    } catch (e: any) { onError(e.message); } finally { setBusy(false); }
  };

  const here = items.filter((i) => i.page === n);
  const view = draft ? [...here, draft] : here;
  const k = bg && wrap.current ? wrap.current.clientWidth / bg.w : 1;
  const textStyled = mode !== 'redact' && (tool === 'text' || selItem?.kind === 'text');
  const touch = tool !== 'erase' && tool !== 'text' && tool !== 'edittext' && tool !== 'image' && tool !== 'move';

  const setStyle = (patch: { color?: string; size?: number; font?: FontKey; bold?: boolean; italic?: boolean }) => {
    if (patch.color !== undefined) setColor(patch.color);
    if (patch.size !== undefined) setSize(patch.size);
    if (patch.font !== undefined) setFont(patch.font);
    if (patch.bold !== undefined) setBold(patch.bold);
    if (patch.italic !== undefined) setItalic(patch.italic);
    if (selItem && 'color' in selItem && patch.color !== undefined) update(selItem.id, { color: patch.color });
    if (selItem?.kind === 'text') { const { color: _c, ...r } = patch; if (Object.keys(r).length) update(selItem.id, r); }
  };

  const render = (it: Item, i: number) => {
    const common = { 'data-id': it.id || undefined, onPointerDown: it.id ? (e: React.PointerEvent) => itemDown(e, it) : undefined, style: { cursor: tool === 'erase' ? 'pointer' : tool === 'move' ? 'move' : undefined } } as any;
    switch (it.kind) {
      case 'text': return <text key={i} x={it.x} y={it.y + it.size * 0.85} fontSize={it.size} fill={it.color} fontFamily={CSS_FONT[it.font]} fontWeight={it.bold ? 700 : 400} fontStyle={it.italic ? 'italic' : 'normal'} {...common}>{it.text}</text>;
      case 'rect': return <rect key={i} x={it.x} y={it.y} width={it.w} height={it.h} fill="transparent" stroke={it.color} strokeWidth={1.5} {...common} />;
      case 'ellipse': return <ellipse key={i} cx={it.x + it.w / 2} cy={it.y + it.h / 2} rx={it.w / 2} ry={it.h / 2} fill="transparent" stroke={it.color} strokeWidth={1.5} {...common} />;
      case 'box': return <rect key={i} x={it.x} y={it.y} width={it.w} height={it.h} fill={it.color} {...common} />;
      case 'hl': return <rect key={i} x={it.x} y={it.y} width={it.w} height={it.h} fill={it.color} fillOpacity={0.35} {...common} />;
      case 'redact': return <rect key={i} x={it.x} y={it.y} width={it.w} height={it.h} fill="#000" fillOpacity={0.88} stroke="#fff" strokeDasharray="3 2" strokeWidth={0.6} {...common} />;
      case 'line': {
        const ang = Math.atan2(it.y2 - it.y, it.x2 - it.x), hd = (s: number) => `${it.x2 - 11 * Math.cos(ang + s * 0.45)},${it.y2 - 11 * Math.sin(ang + s * 0.45)}`;
        return <g key={i} {...common}><line x1={it.x} y1={it.y} x2={it.x2} y2={it.y2} stroke={it.color} strokeWidth={1.8} strokeLinecap="round" />{it.arrow && <polyline points={`${hd(-1)} ${it.x2},${it.y2} ${hd(1)}`} fill="none" stroke={it.color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />}<line x1={it.x} y1={it.y} x2={it.x2} y2={it.y2} stroke="transparent" strokeWidth={12} /></g>;
      }
      case 'pen': return <polyline key={i} points={it.pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={it.color} strokeWidth={it.width} strokeLinecap="round" strokeLinejoin="round" {...common} />;
      case 'img': return <image key={i} href={it.data} x={it.x} y={it.y} width={it.w} height={it.h} preserveAspectRatio="none" {...common} />;
    }
  };

  return (
    <div className="ann">
      {mode === 'sign' && <SignatureMaker onUse={(data, ratio) => { setImg({ data, ratio }); setTool('image'); setInfo('Klik di halaman untuk menempatkan tanda tangan.'); }} />}
      <div className="ann-bar" role="toolbar" aria-label="Alat">
        {TOOLS[mode].map((t) => (
          <button key={t} className={tool === t ? 'on' : ''} onClick={() => { setTool(t); setTextAt(null); if (t !== 'move') setSel(null); if (t === 'image' && mode !== 'sign') imgInput.current?.click(); }}>
            {t === 'image' && mode === 'sign' ? 'Tempatkan tanda tangan' : t === 'text' && mode === 'sign' ? 'Teks' : LABEL[t]}
          </button>
        ))}
        {mode === 'sign' && <button onClick={() => { setPreset(new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })); setTool('text'); setInfo('Klik di halaman untuk menaruh tanggal hari ini.'); }}>Sisipkan tanggal</button>}
        {mode !== 'redact' && <input type="color" value={selItem && 'color' in selItem ? selItem.color : color} onChange={(e) => setStyle({ color: e.target.value })} aria-label="Warna" />}
        {textStyled && (
          <>
            <select value={selItem?.kind === 'text' ? selItem.size : size} onChange={(e) => setStyle({ size: +e.target.value })} aria-label="Ukuran huruf">
              {[8, 10, 12, 14, 16, 20, 24, 32, 48].map((s) => <option key={s} value={s}>{s} pt</option>)}
            </select>
            <select value={selItem?.kind === 'text' ? selItem.font : font} onChange={(e) => setStyle({ font: e.target.value as FontKey })} aria-label="Jenis huruf">
              <option value="sans">Sans</option><option value="serif">Serif</option><option value="mono">Mono</option>
            </select>
            <button className={(selItem?.kind === 'text' ? selItem.bold : bold) ? 'on' : ''} onClick={() => setStyle({ bold: !(selItem?.kind === 'text' ? selItem.bold : bold) })} aria-label="Tebal"><b>B</b></button>
            <button className={(selItem?.kind === 'text' ? selItem.italic : italic) ? 'on' : ''} onClick={() => setStyle({ italic: !(selItem?.kind === 'text' ? selItem.italic : italic) })} aria-label="Miring"><i>I</i></button>
          </>
        )}
        <button onClick={() => { if (sel != null) { setItems((a) => a.filter((x) => x.id !== sel)); setSel(null); } else setItems((a) => { const l = [...a].reverse().findIndex((x) => x.page === n); return l < 0 ? a : a.filter((_, i) => i !== a.length - 1 - l); }); }} disabled={!here.length}>{sel != null ? 'Hapus terpilih' : 'Urungkan'}</button>
      </div>
      <input ref={imgInput} type="file" accept="image/*" hidden onChange={(e) => { pickImage(e.target.files?.[0]); e.target.value = ''; }} />

      {mode === 'redact' && (
        <div className="ann-search">
          <input type="search" placeholder="Cari kata/angka untuk disamarkan (mis. nomor KTP)" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && markAll()} />
          <button className="btn-quiet" onClick={markAll} disabled={busy || !query.trim()}>Tandai semua</button>
        </div>
      )}
      {(info || HINT[tool]) && <p className="hint">{info || HINT[tool]}</p>}

      <div className="ann-nav">
        <button onClick={() => setN((x) => Math.max(1, x - 1))} disabled={n <= 1} aria-label="Halaman sebelumnya">◀</button>
        <span>Halaman {n} / {total || '…'} {items.length > 0 && `· ${items.length} objek`}</span>
        <button onClick={() => setN((x) => Math.min(total, x + 1))} disabled={n >= total} aria-label="Halaman berikutnya">▶</button>
      </div>

      <div className="ann-stage" ref={wrap} style={bg ? { aspectRatio: `${bg.w} / ${bg.h}` } : { minHeight: 240 }}>
        {bg ? (
          <>
            <img src={bg.url} alt={`Halaman ${n}`} draggable={false} />
            <svg ref={svg} viewBox={`0 0 ${bg.w} ${bg.h}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
              style={{ touchAction: touch || tool === 'pen' || sel != null ? 'none' : 'auto', cursor: tool === 'erase' || tool === 'move' ? 'default' : 'crosshair' }}>
              {tool === 'edittext' && boxes.map((b, i) => (
                <rect key={`t${i}`} className="tbox" x={b.x - 1} y={b.y} width={b.w + 2} height={b.h} onPointerDown={(e) => e.stopPropagation()} onClick={() => setTextAt({ x: b.x, y: b.y, value: b.str, size: b.size, cover: b })} />
              ))}
              {view.map(render)}
              {tool === 'move' && sel != null && selBox && selItem && (
                <g className="selection">
                  <rect x={selBox.x - 2} y={selBox.y - 2} width={selBox.w + 4} height={selBox.h + 4} fill="none" stroke="#c9a24a" strokeWidth={1.2} strokeDasharray="4 3" pointerEvents="none" />
                  {selItem.kind === 'line' ? (
                    <>
                      <circle cx={selItem.x} cy={selItem.y} r={5} className="handle" onPointerDown={(e) => handleDown(e, 'a')} />
                      <circle cx={selItem.x2} cy={selItem.y2} r={5} className="handle" onPointerDown={(e) => handleDown(e, 'b')} />
                    </>
                  ) : selItem.kind !== 'pen' && <circle cx={selBox.x + selBox.w + 2} cy={selBox.y + selBox.h + 2} r={6} className="handle" onPointerDown={(e) => handleDown(e, 'size')} />}
                </g>
              )}
            </svg>
            {textAt && (
              <input className="ann-text" autoFocus placeholder="Ketik lalu Enter" defaultValue={textAt.value}
                style={{ left: `${(textAt.x / bg.w) * 100}%`, top: `${(textAt.y / bg.h) * 100}%`, color: textAt.cover ? '#111' : color, fontSize: Math.max(11, textAt.size * k), minWidth: textAt.cover ? Math.max(120, textAt.cover.w * k + 40) : 160 }}
                onKeyDown={(e) => { if (e.key === 'Enter') commitText((e.target as HTMLInputElement).value); if (e.key === 'Escape') setTextAt(null); }}
                onBlur={(e) => commitText(e.target.value)} />
            )}
          </>
        ) : <span className="skeleton" style={{ width: '100%', height: 240 }} />}
      </div>

      <button className="btn-primary" disabled={busy || !items.length} onClick={save}>{busy ? 'Memproses…' : mode === 'redact' ? 'Samarkan permanen & simpan' : mode === 'sign' ? 'Simpan PDF bertanda tangan' : 'Simpan PDF'}</button>
      {mode === 'sign' && <p className="hint"><UiIcon name="lock" size={14} /> Tanda tangan di sini berupa gambar (tanda tangan visual), bukan tanda tangan digital bersertifikat.</p>}
    </div>
  );
}
