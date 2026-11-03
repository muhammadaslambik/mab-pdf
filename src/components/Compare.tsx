import { useEffect, useRef, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import type { CustomProps } from '../tools/types';
import { compareText, compareVisual, textReportPdf, type TextCompare, type VisualPage } from '../lib/compare';
import { baseName, pdfResult } from '../lib/util';

export default function Compare({ files, onDone, onError }: CustomProps) {
  const [a, b] = files;
  const [swap, setSwap] = useState(false);
  const [mode, setMode] = useState<'text' | 'visual'>('text');
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState({ p: 0, l: '' });
  const [text, setText] = useState<TextCompare | null>(null);
  const [vis, setVis] = useState<VisualPage[] | null>(null);
  const [view, setView] = useState(0);
  const cancel = useRef(false);
  const A = swap ? b : a, B = swap ? a : b;

  useEffect(() => () => vis?.forEach((v) => URL.revokeObjectURL(v.url)), [vis]);

  const run = async () => {
    cancel.current = false; setBusy(true); setText(null); setVis(null); setView(0);
    const check = () => { if (cancel.current) throw new Error('Dibatalkan.'); };
    const progress = (p: number, l: string) => setProg({ p: Math.round(p), l });
    try {
      if (mode === 'text') {
        const t = await compareText(A, B, progress, check);
        setText(t);
        const r = await textReportPdf(t, A.name, B.name);
        onDone(pdfResult(r.bytes, `perbandingan-${baseName(A.name)}-vs-${baseName(B.name)}.pdf`, 'Laporan hanya memuat bagian yang berbeda beserta konteksnya.' + (r.unsupported ? ` ${r.unsupported} karakter non-Latin diganti "?".` : '')));
      } else {
        const v = await compareVisual(A, B, progress, check);
        setVis(v);
        const out = await PDFDocument.create();
        for (const p of v) { const im = await out.embedJpg(new Uint8Array(await p.blob.arrayBuffer())); out.addPage([p.w * 0.6, p.h * 0.6]).drawImage(im, { x: 0, y: 0, width: p.w * 0.6, height: p.h * 0.6 }); }
        out.setProducer('MAB-PDF');
        onDone(pdfResult(await out.save(), `perbandingan-visual.pdf`, 'Piksel merah = bagian yang berbeda antara A dan B.'));
      }
    } catch (e: any) { onError(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="fields">
      <div className="cmp-files">
        <div><b>A (asli)</b><br />{A.name}</div>
        <button className="btn-quiet" onClick={() => setSwap(!swap)} aria-label="Tukar A dan B">⇄ Tukar</button>
        <div><b>B (revisi)</b><br />{B.name}</div>
      </div>
      {files.length > 2 && <p className="hint">Hanya dua file pertama yang dibandingkan.</p>}
      <div className="field">
        <label htmlFor="cmpmode">Mode perbandingan</label>
        <select id="cmpmode" value={mode} onChange={(e) => setMode(e.target.value as any)}>
          <option value="text">Teks (kata yang ditambah/dihapus)</option>
          <option value="visual">Visual (selisih tampilan per halaman)</option>
        </select>
      </div>
      {busy ? (
        <div className="progress" role="status"><progress value={prog.p} max={100} /><span>{prog.l} · {prog.p}%</span><button className="btn-quiet" onClick={() => (cancel.current = true)}>Batalkan</button></div>
      ) : <button className="btn-primary" onClick={run}>Bandingkan</button>}

      {text && (
        <div className="cmp-result">
          <p><b className="add">+{text.added} kata</b> ditambahkan · <b className="del">−{text.removed} kata</b> dihapus · {text.same} kata sama · {text.pagesA} vs {text.pagesB} halaman</p>
          <div className="cmp-text">
            {text.segs.map((s, i) => s.op === 'eq' ? <span key={i}>{s.tokens.length > 60 ? s.tokens.slice(0, 20).join(' ') + ' … ' + s.tokens.slice(-20).join(' ') : s.tokens.join(' ')} </span>
              : s.op === 'ins' ? <ins key={i}>{s.tokens.join(' ')} </ins> : <del key={i}>{s.tokens.join(' ')} </del>)}
          </div>
        </div>
      )}
      {vis && (
        <div className="cmp-result">
          <div className="ann-nav"><button onClick={() => setView((v) => Math.max(0, v - 1))} disabled={view === 0}>◀</button>
            <span>Halaman {vis[view].page} / {vis.length} · {vis[view].percent.toFixed(2)}% berbeda</span>
            <button onClick={() => setView((v) => Math.min(vis.length - 1, v + 1))} disabled={view >= vis.length - 1}>▶</button></div>
          <img className="cmp-img" src={vis[view].url} alt={`Selisih halaman ${vis[view].page}`} />
          <p className="hint">Merah = berbeda. Abu-abu pudar = sama.</p>
        </div>
      )}
    </div>
  );
}
