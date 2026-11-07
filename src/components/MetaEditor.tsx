import { useEffect, useState } from 'react';
import { PDFDict, PDFName } from 'pdf-lib';
import type { CustomProps } from '../tools/types';
import { loadPdf } from '../lib/pdf';
import { imageEntries } from '../lib/pdfImages';
import { baseName, formatBytes, pdfResult } from '../lib/util';

const KEYS = [['title', 'Title', 'Judul'], ['author', 'Author', 'Penulis'], ['subject', 'Subject', 'Subjek'], ['keywords', 'Keywords', 'Kata kunci (pisahkan dengan koma)'], ['creator', 'Creator', 'Aplikasi pembuat']] as const;
const SIZE = [['A4', 210, 297], ['A3', 297, 420], ['A5', 148, 210], ['Letter', 215.9, 279.4], ['Legal', 215.9, 355.6]] as const;
const fmt = (d?: Date) => (d ? d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

export default function MetaEditor({ files, onDone, onError }: CustomProps) {
  const file = files[0];
  const [v, setV] = useState<Record<string, string>>({});
  const [info, setInfo] = useState<{ k: string; val: string }[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let dead = false;
    setInfo(null);
    (async () => {
      const head = new TextDecoder().decode(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
      const pdf = await (async () => { try { return await loadPdf(file); } catch (e) { throw e; } })();
      if (dead) return;
      const p1 = pdf.getPage(0).getSize();
      const mm = [p1.width, p1.height].map((x) => (x / 72) * 25.4);
      const named = SIZE.find(([, w, h]) => (Math.abs(mm[0] - w) < 3 && Math.abs(mm[1] - h) < 3) || (Math.abs(mm[1] - w) < 3 && Math.abs(mm[0] - h) < 3));
      setV({ title: pdf.getTitle() ?? '', author: pdf.getAuthor() ?? '', subject: pdf.getSubject() ?? '', keywords: pdf.getKeywords() ?? '', creator: pdf.getCreator() ?? '' });
      setInfo([
        { k: 'Halaman', val: String(pdf.getPageCount()) }, { k: 'Ukuran halaman 1', val: `${mm[0].toFixed(0)} × ${mm[1].toFixed(0)} mm${named ? ` (${named[0]})` : ''}` },
        { k: 'Ukuran file', val: formatBytes(file.size) }, { k: 'Versi PDF', val: head.match(/%PDF-(\d\.\d)/)?.[1] ?? '—' },
        { k: 'Gambar tertanam', val: String(imageEntries(pdf.context).length) }, { k: 'Kolom formulir', val: String(pdf.getForm().getFields().length) },
        { k: 'Dibuat', val: fmt(pdf.getCreationDate()) }, { k: 'Diubah', val: fmt(pdf.getModificationDate()) }, { k: 'Pembuat PDF', val: pdf.getProducer() ?? '—' }
      ]);
    })().catch((e) => onError(e.message));
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  const save = async (clean: boolean) => {
    setBusy(true);
    try {
      const pdf = await loadPdf(file);
      const dict = (pdf as any).getInfoDict() as PDFDict;
      if (clean) {
        for (const k of [...dict.keys()]) dict.delete(k);
        pdf.catalog.delete(PDFName.of('Metadata'));
      } else for (const [id, key] of KEYS) {
        const val = (v[id] ?? '').trim();
        if (!val) dict.delete(PDFName.of(key));
      }
      if (!clean) {
        pdf.setTitle(v.title ?? '', { updateMetadata: false } as any);
        for (const [id, key] of KEYS) {
          const val = (v[id] ?? '').trim();
          if (!val) { dict.delete(PDFName.of(key)); continue; }
          if (id === 'title') pdf.setTitle(val); else if (id === 'author') pdf.setAuthor(val); else if (id === 'subject') pdf.setSubject(val);
          else if (id === 'keywords') pdf.setKeywords(val.split(',').map((x) => x.trim()).filter(Boolean)); else pdf.setCreator(val);
        }
      }
      onDone(pdfResult(await pdf.save({ useObjectStreams: false, updateFieldAppearances: false }), `${baseName(file.name)}${clean ? '-bersih' : '-meta'}.pdf`,
        clean ? 'Semua metadata (judul, penulis, aplikasi pembuat, tanggal, dan XMP) dihapus. Cocok sebelum membagikan dokumen.' : 'Metadata diperbarui.'));
    } catch (e: any) { onError(e.message); } finally { setBusy(false); }
  };

  if (!info) return <p className="hint">Membaca dokumen…</p>;
  return (
    <div className="fields">
      <dl className="meta-grid">{info.map((i) => <div key={i.k}><dt>{i.k}</dt><dd>{i.val}</dd></div>)}</dl>
      {KEYS.map(([id, , label]) => (
        <div className="field" key={id}><label htmlFor={`m-${id}`}>{label}</label>
          <input id={`m-${id}`} value={v[id] ?? ''} onChange={(e) => setV({ ...v, [id]: e.target.value })} /></div>
      ))}
      <button className="btn-primary" disabled={busy} onClick={() => save(false)}>Simpan metadata</button>
      <button className="btn-quiet" disabled={busy} onClick={() => save(true)}>Hapus semua metadata (privasi)</button>
    </div>
  );
}
