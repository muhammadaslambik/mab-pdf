import { useEffect, useState } from 'react';
import { PDFCheckBox, PDFDocument, PDFDropdown, PDFOptionList, PDFRadioGroup, PDFTextField } from 'pdf-lib';
import type { CustomProps } from '../tools/types';
import { loadPdf } from '../lib/pdf';
import { baseName, pdfResult } from '../lib/util';

type F =
  | { kind: 'text'; name: string; value: string; multi: boolean }
  | { kind: 'check'; name: string; value: boolean }
  | { kind: 'choice'; name: string; value: string; options: string[] };

export default function FormFiller({ files, onDone, onError }: CustomProps) {
  const file = files[0];
  const [fields, setFields] = useState<F[] | null>(null);
  const [flatten, setFlatten] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let dead = false;
    setFields(null);
    (async () => {
      const pdf = await loadPdf(file);
      const out: F[] = [];
      for (const f of pdf.getForm().getFields()) {
        const name = f.getName();
        if (f instanceof PDFTextField) out.push({ kind: 'text', name, value: f.getText() ?? '', multi: f.isMultiline() });
        else if (f instanceof PDFCheckBox) out.push({ kind: 'check', name, value: f.isChecked() });
        else if (f instanceof PDFRadioGroup) out.push({ kind: 'choice', name, value: f.getSelected() ?? '', options: f.getOptions() });
        else if (f instanceof PDFDropdown) out.push({ kind: 'choice', name, value: f.getSelected()[0] ?? '', options: f.getOptions() });
        else if (f instanceof PDFOptionList) out.push({ kind: 'choice', name, value: f.getSelected()[0] ?? '', options: f.getOptions() });
      }
      if (!dead) setFields(out);
    })().catch((e) => onError(e.message));
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  const set = (i: number, v: any) => setFields((a) => a!.map((f, k) => (k === i ? ({ ...f, value: v } as F) : f)));

  const save = async () => {
    setBusy(true);
    try {
      const pdf: PDFDocument = await loadPdf(file);
      const form = pdf.getForm();
      for (const f of fields!) {
        const field = form.getField(f.name);
        if (f.kind === 'text' && field instanceof PDFTextField) field.setText(f.value || undefined);
        else if (f.kind === 'check' && field instanceof PDFCheckBox) f.value ? field.check() : field.uncheck();
        else if (f.kind === 'choice' && f.value) {
          if (field instanceof PDFRadioGroup || field instanceof PDFDropdown || field instanceof PDFOptionList) field.select(f.value);
        }
      }
      try { form.updateFieldAppearances(); } catch { throw new Error('Ada isian dengan karakter non-Latin yang belum didukung font standar PDF. Gunakan huruf Latin.'); }
      if (flatten) form.flatten();
      pdf.setProducer('MAB-PDF');
      onDone(pdfResult(await pdf.save({ updateFieldAppearances: false }), `${baseName(file.name)}-terisi.pdf`, flatten ? 'Isian dikunci menjadi bagian dari halaman (tidak bisa diedit lagi).' : undefined));
    } catch (e: any) { onError(e.message); } finally { setBusy(false); }
  };

  if (!fields) return <p>Membaca formulir…</p>;
  if (!fields.length) return <p className="hint">PDF ini tidak punya kolom formulir interaktif. Untuk menulis di atas PDF biasa, gunakan alat <a href="#/tool/edit-pdf">Edit PDF</a>.</p>;
  return (
    <div className="fields">
      <p className="hint">{fields.length} kolom formulir ditemukan.</p>
      {fields.map((f, i) => (
        <div className="field" key={f.name + i}>
          {f.kind === 'check' ? (
            <label className="check"><input type="checkbox" checked={f.value} onChange={(e) => set(i, e.target.checked)} /> {f.name}</label>
          ) : (
            <>
              <label htmlFor={`ff${i}`}>{f.name}</label>
              {f.kind === 'text' && (f.multi ? <textarea id={`ff${i}`} rows={3} value={f.value} onChange={(e) => set(i, e.target.value)} /> : <input id={`ff${i}`} value={f.value} onChange={(e) => set(i, e.target.value)} />)}
              {f.kind === 'choice' && (
                <select id={`ff${i}`} value={f.value} onChange={(e) => set(i, e.target.value)}>
                  <option value="">(kosong)</option>
                  {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              )}
            </>
          )}
        </div>
      ))}
      <label className="check"><input type="checkbox" checked={flatten} onChange={(e) => setFlatten(e.target.checked)} /> Kunci isian (ratakan formulir)</label>
      <button className="btn-primary" disabled={busy} onClick={save}>{busy ? 'Menyimpan…' : 'Simpan PDF'}</button>
    </div>
  );
}
