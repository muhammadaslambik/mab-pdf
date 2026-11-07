import { useEffect } from 'react';
import { suggest, setPending } from '../lib/handoff';
import { formatBytes } from '../lib/util';
import { CATEGORIES } from '../tools/types';
import { ToolIcon, UiIcon } from './icons';

export default function Chooser({ files, onClose }: { files: File[]; onClose: () => void }) {
  const { usable, tools, skipped } = suggest(files);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);

  const go = (id: string) => { setPending(usable); onClose(); location.hash = `#/tool/${id}`; };

  return (
    <div className="modal-back" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Pilih tindakan">
        <header>
          <div>
            <h2>Apa yang ingin Anda lakukan?</h2>
            <p>{usable.length ? `${usable.length} file: ${usable.slice(0, 2).map((f) => f.name).join(', ')}${usable.length > 2 ? ` +${usable.length - 2}` : ''} · ${formatBytes(usable.reduce((s, f) => s + f.size, 0))}` : 'Format file ini belum dikenali.'}</p>
          </div>
          <button className="mini-close" onClick={onClose} aria-label="Tutup"><UiIcon name="close" size={18} /></button>
        </header>
        {skipped > 0 && <p className="hint">{skipped} file dengan jenis berbeda dilewati.</p>}
        {!tools.length ? (
          <p className="hint">Didukung: PDF, gambar, Word (.docx), Excel (.xlsx/.csv), PowerPoint (.pptx), dan HTML/teks.</p>
        ) : (
          <div className="choose-grid">
            {tools.map((t) => {
              const c = CATEGORIES.find((x) => x.id === t.category)!;
              return (
                <button key={t.id} className="choose" style={{ ['--c' as any]: c.color }} onClick={() => go(t.id)}>
                  <span className="tile-icon"><ToolIcon id={t.id} size={22} /></span>
                  <span><b>{t.title}</b><small>{t.desc}</small></span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
