import { useCallback, useEffect, useRef, useState } from 'react';
import type { CustomProps } from '../tools/types';
import { applyFilter, buildPdf, defaultCorners, detectCorners, rotate, toCanvas, warp, type Filter, type Pt } from '../lib/scan';
import './scan.css';

interface Page { id: number; src: HTMLCanvasElement; url: string; q: Pt[]; filter: Filter; rot: number }
const FILTERS: [Filter, string][] = [['orig', 'Asli'], ['doc', 'Dokumen'], ['bw', 'Hitam-putih'], ['gray', 'Abu-abu']];
let uid = 1;

const render = (p: Page, maxSide: number) => rotate(applyFilter(warp(p.src, p.q, maxSide), p.filter), p.rot);

export default function ScanStudio({ files, onDone, onError }: CustomProps) {
  const [pages, setPages] = useState<Page[]>([]);
  const [sel, setSel] = useState(0);
  const [cam, setCam] = useState(false);
  const [size, setSize] = useState('a4');
  const [margin, setMargin] = useState(12);
  const [busy, setBusy] = useState('');
  const seen = useRef(new Set<File>());
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const prev = useRef<HTMLCanvasElement>(null);
  const page = pages[sel];

  const addCanvas = useCallback((src: HTMLCanvasElement) => {
    const t = document.createElement('canvas'), s = Math.min(1, 900 / Math.max(src.width, src.height));
    t.width = Math.round(src.width * s); t.height = Math.round(src.height * s);
    t.getContext('2d')!.drawImage(src, 0, 0, t.width, t.height);
    const p: Page = { id: uid++, src, url: t.toDataURL('image/jpeg', 0.8), q: detectCorners(src), filter: 'doc', rot: 0 };
    setPages((a) => { setSel(a.length); return [...a, p]; });
  }, []);

  const addFiles = useCallback(async (list: File[]) => {
    for (const f of list) {
      if (!f.type.startsWith('image/')) continue;
      try { addCanvas(await toCanvas(f)); } catch (e: any) { onError(e?.message || 'Gambar tidak bisa dibaca.'); }
    }
  }, [addCanvas, onError]);

  useEffect(() => { const n = files.filter((f) => !seen.current.has(f)); n.forEach((f) => seen.current.add(f)); if (n.length) addFiles(n); }, [files, addFiles]);

  const stopCam = () => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; setCam(false); };
  useEffect(() => () => { stream.current?.getTracks().forEach((t) => t.stop()); }, []);
  const startCam = async () => {
    if (!navigator.mediaDevices?.getUserMedia) return onError('Kamera tidak tersedia di browser ini. Gunakan tombol "Tambah foto".');
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } }, audio: false });
      setCam(true);
      requestAnimationFrame(() => { if (video.current) { video.current.srcObject = stream.current; video.current.play().catch(() => {}); } });
    } catch { onError('Izin kamera ditolak atau kamera tidak ditemukan. Gunakan tombol "Tambah foto".'); }
  };
  const snap = async () => { if (video.current?.videoWidth) addCanvas(await toCanvas(video.current)); };

  const patch = (fn: (p: Page) => Page) => setPages((a) => a.map((p, i) => (i === sel ? fn(p) : p)));

  // pratinjau hasil (resolusi rendah, ditunda agar seretan tetap lancar)
  useEffect(() => {
    if (!page || !prev.current) return;
    const h = setTimeout(() => {
      const r = render(page, 900), c = prev.current!;
      c.width = r.width; c.height = r.height; c.getContext('2d')!.drawImage(r, 0, 0);
    }, 90);
    return () => clearTimeout(h);
  }, [page]);

  const drag = useRef<{ i: number } | null>(null);
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drag.current) return;
    const r = e.currentTarget.getBoundingClientRect(), i = drag.current.i;
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    patch((p) => ({ ...p, q: p.q.map((c, k) => (k === i ? { x, y } : c)) }));
  };
  const swap = (d: number) => setPages((a) => { const j = sel + d; if (j < 0 || j >= a.length) return a; const b = [...a]; [b[sel], b[j]] = [b[j], b[sel]]; setSel(j); return b; });
  const del = () => setPages((a) => { const b = a.filter((_, i) => i !== sel); setSel(Math.max(0, Math.min(sel, b.length - 1))); return b; });

  const exportPdf = async () => {
    try {
      setBusy('Menyusun halaman 0/' + pages.length);
      await new Promise((r) => setTimeout(r, 30));
      const out: HTMLCanvasElement[] = [];
      for (const p of pages) { out.push(render(p, 2000)); setBusy(`Menyusun halaman ${out.length}/${pages.length}`); await new Promise((r) => setTimeout(r)); }
      const blob = await buildPdf(out, size, margin, (i) => setBusy(`Menulis PDF ${i}/${out.length}`));
      out.forEach((c) => { c.width = 0; c.height = 0; });
      onDone({ files: [{ name: 'pindaian.pdf', blob }], note: `${pages.length} halaman` });
    } catch (e: any) { onError(e?.message || 'Gagal membuat PDF.'); } finally { setBusy(''); }
  };

  return (
    <div className="scan">
      <div className="scan-bar">
        {cam ? <button onClick={stopCam}>Tutup kamera</button> : <button onClick={startCam}>Buka kamera</button>}
        <label className="btn-quiet">Tambah foto
          <input type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(Array.from(e.target.files || [])); e.target.value = ''; }} />
        </label>
      </div>

      {cam && (
        <div className="scan-cam">
          <video ref={video} playsInline muted />
          <button className="btn-primary" onClick={snap}>Ambil halaman</button>
        </div>
      )}

      {pages.length > 0 && (
        <div className="scan-strip">
          {pages.map((p, i) => (
            <button key={p.id} className={'th' + (i === sel ? ' on' : '')} onClick={() => setSel(i)} aria-label={`Halaman ${i + 1}`}>
              <img src={p.url} alt="" /><b>{i + 1}</b>
            </button>
          ))}
        </div>
      )}

      {page && (
        <>
          <div className="scan-edit">
            <div className="scan-box">
              <small>Seret keempat titik emas ke sudut dokumen.</small>
              <div className="scan-corners" style={{ aspectRatio: `${page.src.width} / ${page.src.height}` }}>
                <img src={page.url} alt="" />
                <svg viewBox="0 0 1 1" preserveAspectRatio="none" onPointerMove={move} onPointerUp={() => (drag.current = null)} onPointerCancel={() => (drag.current = null)} style={{ touchAction: 'none' }}>
                  <polygon className="poly" points={page.q.map((c) => `${c.x},${c.y}`).join(' ')} />
                </svg>
                {page.q.map((c, i) => (
                  <div key={i} role="slider" aria-label={`Sudut ${i + 1}`}
                    onPointerDown={(e) => { (e.currentTarget.parentElement!.querySelector('svg') as SVGSVGElement).setPointerCapture(e.pointerId); drag.current = { i }; }}
                    style={{ position: 'absolute', left: `${c.x * 100}%`, top: `${c.y * 100}%`, width: 30, height: 30, margin: -15, borderRadius: '50%', background: '#fff', border: '3px solid #c9a24a', cursor: 'grab', touchAction: 'none' }} />
                ))}
              </div>
              <div className="scan-bar">
                <button onClick={() => patch((p) => ({ ...p, q: detectCorners(p.src) }))}>Deteksi ulang</button>
                <button onClick={() => patch((p) => ({ ...p, q: defaultCorners() }))}>Reset sudut</button>
              </div>
            </div>
            <div className="scan-box">
              <small>Hasil</small>
              <canvas ref={prev} className="scan-result" />
              <div className="scan-bar">
                {FILTERS.map(([k, l]) => <button key={k} className={page.filter === k ? 'on' : ''} onClick={() => patch((p) => ({ ...p, filter: k }))}>{l}</button>)}
              </div>
              <div className="scan-bar">
                <button onClick={() => patch((p) => ({ ...p, rot: p.rot + 3 }))} aria-label="Putar kiri">↺ Putar</button>
                <button onClick={() => patch((p) => ({ ...p, rot: p.rot + 1 }))} aria-label="Putar kanan">↻ Putar</button>
                <button onClick={() => swap(-1)} disabled={sel === 0}>← Geser</button>
                <button onClick={() => swap(1)} disabled={sel === pages.length - 1}>Geser →</button>
                <button onClick={del}>Hapus</button>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="scan-opts">
              <div className="field"><label>Ukuran halaman</label>
                <select value={size} onChange={(e) => setSize(e.target.value)}>
                  <option value="a4">A4</option><option value="letter">Letter</option><option value="fit">Sesuai gambar</option>
                </select></div>
              <div className="field"><label>Margin (pt)</label>
                <input type="number" min={0} max={100} value={margin} disabled={size === 'fit'} onChange={(e) => setMargin(Math.max(0, Math.min(100, +e.target.value || 0)))} /></div>
            </div>
            {busy ? <div className="progress"><progress /><span>{busy}</span></div>
              : <button className="btn-primary" onClick={exportPdf}>Buat PDF ({pages.length} halaman)</button>}
          </div>
        </>
      )}

      {!pages.length && !cam && <p className="hint">Buka kamera atau tambah foto dokumen. Semuanya diproses di perangkat Anda.</p>}
    </div>
  );
}
