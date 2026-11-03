import { useEffect, useRef, useState } from 'react';
import { LineCapStyle, PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import type { CustomProps } from '../tools/types';
import { canvasToBlob, loadPdf, openPdfJs, releaseCanvas, renderPage } from '../lib/pdf';
import { baseName, pdfResult } from '../lib/util';

type Mode = 'edit' | 'redact';
type Tool = 'text' | 'rect' | 'box' | 'hl' | 'pen' | 'image' | 'erase' | 'redact';
type Item = { id: number; page: number } & (
  | { kind: 'text'; x: number; y: number; text: string; size: number; color: string }
  | { kind: 'rect' | 'box' | 'hl'; x: number; y: number; w: number; h: number; color: string }
  | { kind: 'pen'; pts: [number, number][]; color: string; width: number }
  | { kind: 'img'; x: number; y: number; w: number; h: number; data: string }
  | { kind: 'redact'; x: number; y: number; w: number; h: number }
);

const hexRgb = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const mul = (a: number[], b: number[]) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];

const TOOLS: Record<Mode, { id: Tool; label: string }[]> = {
  edit: [
    { id: 'text', label: 'Teks' }, { id: 'rect', label: 'Kotak' }, { id: 'box', label: 'Blok warna' }, { id: 'hl', label: 'Sorot' },
    { id: 'pen', label: 'Pena' }, { id: 'image', label: 'Gambar' }, { id: 'erase', label: 'Hapus objek' }
  ],
  redact: [{ id: 'redact', label: 'Tandai area' }, { id: 'erase', label: 'Hapus tanda' }]
};

export default function Annotator({ files, onDone, onError, mode }: CustomProps & { mode: Mode }) {
  const file = files[0];
  const [doc, setDoc] = useState<any>(null);
  const [n, setN] = useState(1);
  const [total, setTotal] = useState(0);
  const [bg, setBg] = useState<{ url: string; w: number; h: number } | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [tool, setTool] = useState<Tool>(mode === 'redact' ? 'redact' : 'text');
  const [color, setColor] = useState(mode === 'redact' ? '#000000' : '#d62828');
  const [size, setSize] = useState(16);
  const [draft, setDraft] = useState<Item | null>(null);
  const [textAt, setTextAt] = useState<{ x: number; y: number } | null>(null);
  const [img, setImg] = useState<{ data: string; ratio: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [info, setInfo] = useState('');
  const svg = useRef<SVGSVGElement>(null);
  const start = useRef({ x: 0, y: 0 });
  const nid = useRef(1);
  const imgInput = useRef<HTMLInputElement>(null);
  const textPending = useRef(false);

  useEffect(() => {
    let dead = false, d: any = null;
    setItems([]); setN(1); setDoc(null); setBg(null);
    openPdfJs(file).then((x) => { d = x; if (dead) return x.destroy(); setDoc(x); setTotal(x.numPages); }).catch((e) => onError(e.message));
    return () => { dead = true; d?.destroy?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  useEffect(() => {
    if (!doc) return;
    let dead = false;
    (async () => {
      const page = await doc.getPage(n);
      const vp = page.getViewport({ scale: 1 });
      const c = await renderPage(page, Math.min(2, 1000 / vp.width), 4_000_000);
      const url = c.toDataURL('image/jpeg', 0.85);
      releaseCanvas(c); page.cleanup();
      if (!dead) setBg({ url, w: vp.width, h: vp.height });
    })().catch((e) => onError(e.message));
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, n]);

  const add = (it: Omit<Item, 'id' | 'page'> & Record<string, any>) => setItems((a) => [...a, { ...it, id: nid.current++, page: n } as Item]);
  const pos = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * bg!.w) / r.width, y: ((e.clientY - r.top) * bg!.h) / r.height };
  };

  const down = (e: React.PointerEvent) => {
    if (!bg || tool === 'erase') return;
    const p = pos(e);
    if (tool === 'text') { start.current = p; textPending.current = true; return; }
    if (tool === 'image') {
      if (!img) { setInfo('Pilih gambar dulu.'); imgInput.current?.click(); return; }
      const w = 140, h = w / img.ratio;
      add({ kind: 'img', x: p.x - w / 2, y: p.y - h / 2, w, h, data: img.data }); return;
    }
    svg.current!.setPointerCapture(e.pointerId);
    start.current = p;
    if (tool === 'pen') setDraft({ id: 0, page: n, kind: 'pen', pts: [[p.x, p.y]], color, width: Math.max(1, size / 6) });
    else if (tool === 'redact') setDraft({ id: 0, page: n, kind: 'redact', x: p.x, y: p.y, w: 0, h: 0 });
    else setDraft({ id: 0, page: n, kind: tool as 'rect', x: p.x, y: p.y, w: 0, h: 0, color });
  };
  const move = (e: React.PointerEvent) => {
    if (!draft || !bg) return;
    const p = pos(e);
    if (draft.kind === 'pen') setDraft({ ...draft, pts: [...draft.pts, [p.x, p.y]] });
    else if ('w' in draft) setDraft({ ...draft, x: Math.min(start.current.x, p.x), y: Math.min(start.current.y, p.y), w: Math.abs(p.x - start.current.x), h: Math.abs(p.y - start.current.y) });
  };
  const up = () => {
    // kotak teks dimunculkan saat tombol dilepas, supaya fokus tidak direbut oleh klik
    if (textPending.current) { textPending.current = false; setTextAt({ ...start.current }); return; }
    if (!draft) return;
    const ok = draft.kind === 'pen' ? draft.pts.length > 1 : 'w' in draft && draft.w > 3 && draft.h > 3;
    if (ok) { const { id, page, ...rest } = draft as any; add(rest); }
    setDraft(null);
  };
  const commitText = (value: string) => {
    if (textAt && value.trim()) add({ kind: 'text', x: textAt.x, y: textAt.y, text: value, size, color });
    setTextAt(null);
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
            const m = mul(vp.transform, it.transform);
            const sz = Math.hypot(m[2], m[3]);
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
    if (!items.length) return onError(mode === 'redact' ? 'Tandai dulu area yang ingin disamarkan.' : 'Belum ada perubahan untuk disimpan.');
    setBusy(true);
    try {
      if (mode === 'edit') {
        const pdf = await loadPdf(file);
        const font = await pdf.embedFont(StandardFonts.Helvetica);
        const pages = pdf.getPages();
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
              try { pg.drawText(it.text, { x, y, size: it.size, font, color: hexRgb(it.color), rotate: degrees(R) }); }
              catch { throw new Error('Teks mengandung karakter non-Latin yang belum didukung font standar PDF. Gunakan huruf Latin.'); }
            } else if (it.kind === 'rect') pg.drawRectangle({ ...box(it), borderColor: hexRgb(it.color), borderWidth: 1.5 });
            else if (it.kind === 'box') pg.drawRectangle({ ...box(it), color: hexRgb(it.color) });
            else if (it.kind === 'hl') pg.drawRectangle({ ...box(it), color: hexRgb(it.color), opacity: 0.35 });
            else if (it.kind === 'pen') {
              for (let k = 1; k < it.pts.length; k++) { const a = P(...it.pts[k - 1]), b = P(...it.pts[k]); pg.drawLine({ start: { x: a[0], y: a[1] }, end: { x: b[0], y: b[1] }, thickness: it.width, color: hexRgb(it.color), lineCap: LineCapStyle.Round }); }
            } else if (it.kind === 'img') {
              if (R !== 0) { skippedImg++; continue; }
              const im = await pdf.embedPng(it.data);
              pg.drawImage(im, box(it));
            }
          }
          jp.cleanup();
        }
        pdf.setProducer('MAB-PDF');
        onDone(pdfResult(await pdf.save(), `${baseName(file.name)}-edit.pdf`, skippedImg ? `${skippedImg} gambar pada halaman terotasi dilewati.` : undefined));
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
  const draggable = tool !== 'erase' && tool !== 'text' && tool !== 'image';

  const render = (it: Item, i: number) => {
    const del = tool === 'erase' ? { onPointerDown: (e: React.PointerEvent) => { e.stopPropagation(); setItems((a) => a.filter((x) => x.id !== it.id)); }, style: { cursor: 'pointer' } } : {};
    switch (it.kind) {
      case 'text': return <text key={i} x={it.x} y={it.y + it.size * 0.85} fontSize={it.size} fill={it.color} fontFamily="Helvetica, Arial, sans-serif" {...del}>{it.text}</text>;
      case 'rect': return <rect key={i} x={it.x} y={it.y} width={it.w} height={it.h} fill="none" stroke={it.color} strokeWidth={1.5} {...del} />;
      case 'box': return <rect key={i} x={it.x} y={it.y} width={it.w} height={it.h} fill={it.color} {...del} />;
      case 'hl': return <rect key={i} x={it.x} y={it.y} width={it.w} height={it.h} fill={it.color} fillOpacity={0.35} {...del} />;
      case 'redact': return <rect key={i} x={it.x} y={it.y} width={it.w} height={it.h} fill="#000" fillOpacity={0.88} stroke="#fff" strokeDasharray="3 2" strokeWidth={0.6} {...del} />;
      case 'pen': return <polyline key={i} points={it.pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={it.color} strokeWidth={it.width} strokeLinecap="round" strokeLinejoin="round" {...del} />;
      case 'img': return <image key={i} href={it.data} x={it.x} y={it.y} width={it.w} height={it.h} preserveAspectRatio="none" {...del} />;
    }
  };

  return (
    <div className="ann">
      <div className="ann-bar">
        {TOOLS[mode].map((t) => (
          <button key={t.id} className={tool === t.id ? 'on' : ''} onClick={() => { setTool(t.id); setTextAt(null); if (t.id === 'image') imgInput.current?.click(); }}>{t.label}</button>
        ))}
        {mode === 'edit' && (
          <>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Warna" />
            <select value={size} onChange={(e) => setSize(+e.target.value)} aria-label="Ukuran">
              {[10, 12, 14, 16, 20, 24, 32, 48].map((s) => <option key={s} value={s}>{s} pt</option>)}
            </select>
          </>
        )}
        <button onClick={() => setItems((a) => { const l = [...a].reverse().findIndex((x) => x.page === n); return l < 0 ? a : a.filter((_, i) => i !== a.length - 1 - l); })} disabled={!here.length}>Urungkan</button>
      </div>
      <input ref={imgInput} type="file" accept="image/*" hidden onChange={(e) => { pickImage(e.target.files?.[0]); e.target.value = ''; }} />

      {mode === 'redact' && (
        <div className="ann-search">
          <input type="search" placeholder="Cari kata/angka untuk disamarkan (mis. nomor KTP)" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && markAll()} />
          <button className="btn-quiet" onClick={markAll} disabled={busy || !query.trim()}>Tandai semua</button>
        </div>
      )}
      {info && <p className="hint">{info}</p>}

      <div className="ann-nav">
        <button onClick={() => setN((x) => Math.max(1, x - 1))} disabled={n <= 1}>◀</button>
        <span>Halaman {n} / {total || '…'} {items.length > 0 && `· ${items.length} objek`}</span>
        <button onClick={() => setN((x) => Math.min(total, x + 1))} disabled={n >= total}>▶</button>
      </div>

      <div className="ann-stage" style={bg ? { aspectRatio: `${bg.w} / ${bg.h}` } : { minHeight: 240 }}>
        {bg ? (
          <>
            <img src={bg.url} alt={`Halaman ${n}`} draggable={false} />
            <svg ref={svg} viewBox={`0 0 ${bg.w} ${bg.h}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
              style={{ touchAction: draggable || tool === 'pen' ? 'none' : 'auto', cursor: tool === 'erase' ? 'default' : 'crosshair' }}>
              {view.map(render)}
            </svg>
            {textAt && (
              <input className="ann-text" autoFocus placeholder="Ketik lalu Enter"
                style={{ left: `${(textAt.x / bg.w) * 100}%`, top: `${(textAt.y / bg.h) * 100}%`, color }}
                onKeyDown={(e) => { if (e.key === 'Enter') commitText((e.target as HTMLInputElement).value); if (e.key === 'Escape') setTextAt(null); }}
                onBlur={(e) => commitText(e.target.value)} />
            )}
          </>
        ) : <span className="skeleton" style={{ width: '100%', height: 240 }} />}
      </div>

      <button className="btn-primary" disabled={busy || !items.length} onClick={save}>{busy ? 'Memproses…' : mode === 'redact' ? 'Samarkan permanen & simpan' : 'Simpan PDF'}</button>
    </div>
  );
}
