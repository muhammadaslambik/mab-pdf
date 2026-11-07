import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { CustomProps, FieldDef, Opts, ToolDef, ToolResult } from '../tools/types';
import { CATEGORIES } from '../tools/types';
import { defaultOpts } from '../tools/registry';
import { downloadBlob, formatBytes } from '../lib/util';
import SignaturePad from './SignaturePad';
import { ToolIcon, UiIcon } from './icons';
import { takePending } from '../lib/handoff';

const MAX_BYTES = 300 * 1024 * 1024;

const ACCEPT: Record<ToolDef['accept'], { exts: string[]; mime: string; label: string; drop: string }> = {
  pdf: { exts: ['.pdf'], mime: 'application/pdf', label: 'PDF', drop: 'Pilih file PDF' },
  image: { exts: [], mime: 'image/*', label: 'gambar (JPG, PNG, WebP)', drop: 'Pilih gambar' },
  docx: { exts: ['.docx'], mime: '', label: 'dokumen Word (.docx)', drop: 'Pilih file Word (.docx)' },
  xlsx: { exts: ['.xlsx', '.xlsm', '.csv'], mime: '', label: 'spreadsheet (.xlsx atau .csv)', drop: 'Pilih file Excel (.xlsx) atau CSV' },
  pptx: { exts: ['.pptx'], mime: '', label: 'presentasi (.pptx)', drop: 'Pilih file PowerPoint (.pptx)' },
  html: { exts: ['.html', '.htm', '.txt'], mime: '', label: 'HTML atau teks', drop: 'Pilih file HTML (opsional)' }
};

function Field({ f, value, onChange }: { f: FieldDef; value: any; onChange: (v: any) => void }) {
  const id = `f-${f.key}`;
  return (
    <div className="field">
      <label htmlFor={id}>{f.label}</label>
      {f.type === 'text' && (
        <input id={id} type="text" value={value ?? ''} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
      {f.type === 'password' && (
        <input id={id} type="password" autoComplete="off" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
      )}
      {f.type === 'textarea' && (
        <textarea id={id} rows={5} value={value ?? ''} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
      {f.type === 'number' && (
        <input id={id} type="number" value={value ?? ''} min={f.min} max={f.max} step={f.step ?? 1}
          onChange={(e) => onChange(e.target.value)} />
      )}
      {f.type === 'select' && (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
          {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
      {f.type === 'signature' && <SignaturePad onChange={onChange} />}
      {'hint' in f && f.hint && <small className="hint">{f.hint}</small>}
    </div>
  );
}

export default function ToolPage({ tool }: { tool: ToolDef }) {
  const cat = CATEGORIES.find((c) => c.id === tool.category)!;
  const [files, setFiles] = useState<File[]>([]);
  const [opts, setOpts] = useState<Opts>(() => defaultOpts(tool));
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState({ p: 0, l: '' });
  const [result, setResult] = useState<ToolResult | null>(null);
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);
  const cancelled = useRef(false);
  const Custom = useMemo(() => (tool.custom ? lazy(tool.custom) : null), [tool]);

  const acc = ACCEPT[tool.accept];
  const okType = (f: File) => {
    const name = f.name.toLowerCase();
    if (tool.accept === 'image') return f.type.startsWith('image/');
    return acc.exts.some((e) => name.endsWith(e)) || (!!acc.mime && f.type === acc.mime);
  };

  const addFiles = (list: FileList | File[] | null) => {
    if (!list) return;
    const arr = [...list];
    const valid = arr.filter(okType);
    if (!valid.length) return setError(`File harus berupa ${acc.label}.`);
    if (valid.some((f) => f.size > MAX_BYTES)) return setError('Ukuran file melebihi 300 MB. Coba file yang lebih kecil agar perangkat Anda tidak kehabisan memori.');
    setError(arr.length !== valid.length ? 'Sebagian file dilewati karena formatnya tidak sesuai.' : '');
    setResult(null);
    setFiles((prev) => (tool.multiple ? [...prev, ...valid] : [valid[0]]));
  };

  // file kiriman dari pemilih tindakan di beranda, atau yang dilepas/ditempel di halaman ini
  const addRef = useRef(addFiles);
  addRef.current = addFiles;
  useEffect(() => {
    const p = takePending();
    if (p.length) addRef.current(p);
    const on = (e: Event) => addRef.current((e as CustomEvent<File[]>).detail);
    window.addEventListener('mab:tool-files', on);
    return () => window.removeEventListener('mab:tool-files', on);
  }, []);

  const swap = (i: number, d: number) =>
    setFiles((a) => {
      const j = i + d;
      if (j < 0 || j >= a.length) return a;
      const c = [...a];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });

  const min = tool.minFiles ?? 1;

  const run = async () => {
    if (!tool.run) return;
    cancelled.current = false;
    setBusy(true);
    setError('');
    setResult(null);
    setProg({ p: 0, l: 'Memulai' });
    try {
      const res = await tool.run(files, opts, {
        progress: (p, l) => setProg({ p: Math.round(p), l }),
        check: () => { if (cancelled.current) throw new Error('Dibatalkan.'); }
      });
      setResult(res);
    } catch (e: any) {
      setError(e?.message || 'Terjadi kesalahan saat memproses file.');
    } finally {
      setBusy(false);
    }
  };

  const customProps: CustomProps = {
    files,
    onDone: (r) => { setError(''); setResult(r); },
    onError: (m) => setError(m)
  };

  const inSize = files.reduce((s, f) => s + f.size, 0);
  const outSize = result?.files.reduce((s, f) => s + f.blob.size, 0) ?? 0;

  return (
    <main className="tool" style={{ ['--c' as any]: cat.color }}>
      <a href="#/" className="back"><UiIcon name="back" size={16} /> Semua alat</a>
      <header className="tool-head">
        <span className="tile-icon big" aria-hidden><ToolIcon id={tool.id} size={30} /></span>
        <div>
          <span className="crumb">{cat.label}</span>
          <h1>{tool.title}{tool.status === 'beta' && <span className="badge">Beta</span>}</h1>
          <p>{tool.desc}</p>
        </div>
      </header>

      {tool.status === 'soon' ? (
        <section className="panel soon">
          <h2>Segera hadir</h2>
          <p>Fitur ini sedang disiapkan. Rencana teknis: {tool.plan}</p>
          <a className="btn-primary" href="#/">Lihat alat yang sudah siap</a>
        </section>
      ) : (
        <>
          <p className="privacy"><UiIcon name="lock" size={15} /> File diproses di perangkat Anda dan tidak pernah diunggah ke server.</p>

          {!result && (
            <label
              className={`drop ${drag ? 'over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setDrag(false); addFiles(e.dataTransfer.files); }}
            >
              <input
                type="file" hidden multiple={tool.multiple}
                accept={[acc.mime, ...acc.exts].filter(Boolean).join(',')}
                {...(tool.capture ? { capture: 'environment' as const } : {})}
                onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
              />
              <span className="drop-icon"><UiIcon name="upload" size={26} /></span>
              <strong>{tool.capture ? 'Ambil foto atau pilih gambar' : `${acc.drop}${tool.multiple ? ' (bisa banyak)' : ''}`}</strong>
              <span>atau seret file ke sini · maksimal 300 MB</span>
            </label>
          )}

          {files.length > 0 && !result && (
            <ul className="files">
              {files.map((f, i) => (
                <li key={f.name + i}>
                  <span className="fname">{f.name}</span>
                  <span className="fsize">{formatBytes(f.size)}</span>
                  {tool.multiple && files.length > 1 && (
                    <>
                      <button onClick={() => swap(i, -1)} disabled={i === 0} aria-label="Naikkan">▲</button>
                      <button onClick={() => swap(i, 1)} disabled={i === files.length - 1} aria-label="Turunkan">▼</button>
                    </>
                  )}
                  <button onClick={() => setFiles(files.filter((_, k) => k !== i))} aria-label="Hapus file">✕</button>
                </li>
              ))}
            </ul>
          )}

          {files.length >= min && files.length > 0 && Custom && (
            <section className="panel">
              <Suspense fallback={<p>Memuat…</p>}>
                <Custom {...customProps} />
              </Suspense>
            </section>
          )}

          {files.length >= min && !result && !Custom && (
            <section className="panel">
              {tool.fields && tool.fields.length > 0 && (
                <div className="fields">
                  {tool.fields.map((f) => (
                    <Field key={f.key} f={f} value={opts[f.key]} onChange={(v) => setOpts((o) => ({ ...o, [f.key]: v }))} />
                  ))}
                </div>
              )}
              {busy ? (
                <div className="progress" role="status" aria-live="polite">
                  <progress value={prog.p} max={100} />
                  <span>{prog.l} · {prog.p}%</span>
                  <button className="btn-quiet" onClick={() => (cancelled.current = true)}>Batalkan</button>
                </div>
              ) : (
                <button className="btn-primary" onClick={run}>{tool.actionLabel ?? 'Proses'}</button>
              )}
            </section>
          )}

          {files.length > 0 && files.length < min && !result && (
            <p className="hint">Tambahkan minimal {min} file untuk melanjutkan.</p>
          )}

          {error && <p className="error" role="alert">{error}</p>}

          {result && (
            <section className="panel done">
              <h2>Selesai</h2>
              {result.files.length === 1 && tool.id === 'compress' && (
                <p className="sizes">{formatBytes(inSize)} → <b>{formatBytes(outSize)}</b>
                  {outSize < inSize && ` · hemat ${Math.round((1 - outSize / inSize) * 100)}%`}</p>
              )}
              {result.note && <p className="hint">{result.note}</p>}
              {result.files.map((f) => (
                <button key={f.name} className="btn-primary" onClick={() => downloadBlob(f.blob, f.name)}>
                  Unduh {f.name} <small>({formatBytes(f.blob.size)})</small>
                </button>
              ))}
              <button className="btn-quiet" onClick={() => { setResult(null); setFiles([]); setProg({ p: 0, l: '' }); }}>
                Proses file lain
              </button>
            </section>
          )}
        </>
      )}
    </main>
  );
}
