import { useEffect, useState } from 'react';
import { PDFDocument, degrees } from 'pdf-lib';
import type { CustomProps } from '../tools/types';
import { loadPdf, openPdfJs, releaseCanvas, renderPage } from '../lib/pdf';
import { baseName, pdfResult, tick } from '../lib/util';

type Item = { id: number; rot: number };

export default function Organizer({ files, onDone, onError }: CustomProps) {
  const file = files[0];
  const [items, setItems] = useState<Item[]>([]);
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let dead = false;
    setItems([]);
    setThumbs({});
    (async () => {
      try {
        const doc = await openPdfJs(file);
        setItems(Array.from({ length: doc.numPages }, (_, i) => ({ id: i, rot: 0 })));
        for (let n = 1; n <= doc.numPages; n++) {
          if (dead) break;
          const page = await doc.getPage(n);
          const c = await renderPage(page, 0.4, 500_000);
          const url = c.toDataURL('image/jpeg', 0.6);
          releaseCanvas(c);
          page.cleanup();
          setThumbs((t) => ({ ...t, [n - 1]: url }));
          await tick();
        }
        await doc.destroy();
      } catch (e: any) {
        onError(e.message);
      }
    })();
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  const move = (i: number, d: number) =>
    setItems((arr) => {
      const j = i + d;
      if (j < 0 || j >= arr.length) return arr;
      const c = [...arr];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
  const rotate = (i: number) => setItems((a) => a.map((it, k) => (k === i ? { ...it, rot: (it.rot + 90) % 360 } : it)));
  const remove = (i: number) => setItems((a) => a.filter((_, k) => k !== i));

  const save = async () => {
    if (!items.length) return onError('Tidak ada halaman tersisa.');
    setBusy(true);
    try {
      const src: PDFDocument = await loadPdf(file);
      const out = await PDFDocument.create();
      const pages = await out.copyPages(src, items.map((i) => i.id));
      pages.forEach((p, k) => {
        const r = items[k].rot;
        if (r) p.setRotation(degrees((p.getRotation().angle + r) % 360));
        out.addPage(p);
      });
      onDone(pdfResult(await out.save(), `${baseName(file.name)}-diatur.pdf`));
    } catch (e: any) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <p className="hint">Geser urutan dengan tombol panah, putar, atau hapus halaman. Tersisa {items.length} halaman.</p>
      <div className="ann-bar">
        <button onClick={() => setItems((a) => [...a].reverse())}>Balik urutan</button>
        <button onClick={() => setItems((a) => a.map((x) => ({ ...x, rot: (x.rot + 90) % 360 })))}>Putar semua</button>
        <button onClick={() => setItems((a) => a.filter((_, i) => i % 2 === 0))}>Sisakan ganjil</button>
        <button onClick={() => setItems((a) => a.filter((_, i) => i % 2 === 1))}>Sisakan genap</button>
      </div>
      <div className="thumbs">
        {items.map((it, i) => (
          <div className="thumb" key={it.id}>
            <div className="thumb-img">
              {thumbs[it.id] ? (
                <img src={thumbs[it.id]} alt={`Halaman ${it.id + 1}`} style={{ transform: `rotate(${it.rot}deg)` }} />
              ) : (
                <span className="skeleton" />
              )}
            </div>
            <div className="thumb-bar">
              <span>{i + 1}</span>
              <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Geser ke depan">◀</button>
              <button onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Geser ke belakang">▶</button>
              <button onClick={() => rotate(i)} aria-label="Putar">↻</button>
              <button onClick={() => remove(i)} aria-label="Hapus halaman">✕</button>
            </div>
          </div>
        ))}
      </div>
      <button className="btn-primary" disabled={busy || !items.length} onClick={save}>
        {busy ? 'Menyimpan…' : 'Simpan PDF'}
      </button>
    </div>
  );
}
