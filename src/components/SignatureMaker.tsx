import { useEffect, useRef, useState } from 'react';
import SignaturePad from './SignaturePad';

const KEY = 'mab-signatures';
const FONTS = [
  '"Segoe Script", "Bradley Hand", "Snell Roundhand", "Brush Script MT", cursive',
  '"Lucida Handwriting", "Apple Chancery", "URW Chancery L", cursive',
  '"Ink Free", "Chalkduster", "Comic Sans MS", cursive',
  '"Palatino Linotype", Georgia, serif'
];
const loadSaved = (): string[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; } };
const store = (a: string[]) => { try { localStorage.setItem(KEY, JSON.stringify(a.slice(0, 4))); } catch { /* penyimpanan penuh/diblokir */ } };

/** Potong area transparan di sekeliling tanda tangan. */
function trim(c: HTMLCanvasElement): string | null {
  const g = c.getContext('2d')!, { width: w, height: h } = c, d = g.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 <= x0 || y1 <= y0) return null;
  const pad = 6, o = document.createElement('canvas');
  o.width = x1 - x0 + 1 + pad * 2; o.height = y1 - y0 + 1 + pad * 2;
  o.getContext('2d')!.drawImage(c, x0, y0, x1 - x0 + 1, y1 - y0 + 1, pad, pad, x1 - x0 + 1, y1 - y0 + 1);
  return o.toDataURL('image/png');
}

export default function SignatureMaker({ onUse }: { onUse: (dataUrl: string, ratio: number) => void }) {
  const [tab, setTab] = useState<'draw' | 'type' | 'upload'>('draw');
  const [saved, setSaved] = useState<string[]>(loadSaved);
  const [drawn, setDrawn] = useState('');
  const [name, setName] = useState('');
  const [font, setFont] = useState(0);
  const [ink, setInk] = useState('#0b1b4d');
  const [typed, setTyped] = useState('');
  const [upl, setUpl] = useState('');
  const [keep, setKeep] = useState(true);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!name.trim()) { setTyped(''); return; }
    const c = document.createElement('canvas'); c.width = 1100; c.height = 260;
    const g = c.getContext('2d')!;
    g.fillStyle = ink; g.textBaseline = 'middle'; g.font = `italic 130px ${FONTS[font]}`;
    g.fillText(name, 30, 135, 1040);
    setTyped(trim(c) ?? '');
  }, [name, font, ink]);

  const use = (data: string) => {
    if (!data) { setErr('Buat tanda tangan dulu.'); return; }
    setErr('');
    const im = new Image();
    im.onload = () => {
      onUse(data, im.width / im.height);
      if (keep && !saved.includes(data)) { const n = [data, ...saved].slice(0, 4); setSaved(n); store(n); }
    };
    im.src = data;
  };
  const remove = (d: string) => { const n = saved.filter((x) => x !== d); setSaved(n); store(n); };

  const upload = async (f?: File) => {
    if (!f) return;
    try {
      const bmp = await createImageBitmap(f);
      const k = Math.min(1, 1000 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      const g = c.getContext('2d')!; g.drawImage(bmp, 0, 0, c.width, c.height); bmp.close();
      const img = g.getImageData(0, 0, c.width, c.height), d = img.data;
      // hapus latar putih/terang: terang jadi transparan, goresan gelap dipertahankan
      for (let p = 0; p < d.length; p += 4) {
        const lum = (d[p] * 299 + d[p + 1] * 587 + d[p + 2] * 114) / 1000;
        const a = lum > 225 ? 0 : lum > 150 ? Math.round(((225 - lum) / 75) * 255) : 255;
        d[p + 3] = Math.min(d[p + 3], a);
      }
      g.putImageData(img, 0, 0);
      const t = trim(c);
      if (!t) setErr('Tanda tangan tidak terdeteksi pada gambar. Gunakan foto dengan tinta gelap di atas kertas putih.'); else { setUpl(t); setErr(''); }
    } catch { setErr('Gambar tidak bisa dibaca.'); }
  };

  const current = tab === 'draw' ? drawn : tab === 'type' ? typed : upl;
  return (
    <div className="sigmaker">
      {saved.length > 0 && (
        <div className="sig-saved"><span>Tersimpan di perangkat ini:</span>
          {saved.map((s) => (
            <span key={s.slice(-24)} className="sig-thumb"><button onClick={() => use(s)} title="Pakai tanda tangan ini"><img src={s} alt="Tanda tangan tersimpan" /></button>
              <button className="x" onClick={() => remove(s)} aria-label="Hapus tanda tangan tersimpan">×</button></span>
          ))}
        </div>
      )}
      <div className="ann-bar" role="tablist">
        {([['draw', 'Gambar'], ['type', 'Ketik'], ['upload', 'Unggah foto']] as const).map(([id, l]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{l}</button>)}
      </div>
      {tab === 'draw' && <SignaturePad onChange={setDrawn} />}
      {tab === 'type' && (
        <div className="fields">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ketik nama Anda" aria-label="Nama untuk tanda tangan" />
          <div className="ann-bar">
            <select value={font} onChange={(e) => setFont(+e.target.value)} aria-label="Gaya tulisan">{['Tulisan tangan 1', 'Tulisan tangan 2', 'Santai', 'Klasik'].map((l, i) => <option key={i} value={i}>{l}</option>)}</select>
            <input type="color" value={ink} onChange={(e) => setInk(e.target.value)} aria-label="Warna tinta" />
          </div>
          {typed && <img className="sig-prev" src={typed} alt="Pratinjau tanda tangan" />}
        </div>
      )}
      {tab === 'upload' && (
        <div className="fields">
          <button className="btn-quiet" onClick={() => fileRef.current?.click()}>Pilih foto tanda tangan</button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} />
          {upl ? <img className="sig-prev" src={upl} alt="Pratinjau tanda tangan" /> : <p className="hint">Foto tanda tangan di kertas putih. Latar putih dihapus otomatis menjadi transparan.</p>}
        </div>
      )}
      <label className="check"><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> Simpan di perangkat ini untuk dipakai lagi</label>
      {err && <p className="error">{err}</p>}
      <button className="btn-primary" onClick={() => use(current)} disabled={!current}>Pakai tanda tangan ini</button>
    </div>
  );
}
