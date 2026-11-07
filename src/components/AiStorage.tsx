import { useCallback, useEffect, useState } from 'react';
import { cachedModelIds, clearOcrData, ensurePersist, fmtBytes, removeModels, storageInfo } from '../lib/storage';

/** Panel kecil: apa yang tersimpan di perangkat ini, dan cara menghapusnya. */
export default function AiStorage() {
  const [info, setInfo] = useState({ usage: 0, quota: 0, persisted: false });
  const [models, setModels] = useState<string[]>([]);
  const [msg, setMsg] = useState('');
  const refresh = useCallback(async () => { setInfo(await storageInfo()); setModels(await cachedModelIds()); }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const del = async (ids: string[]) => { await removeModels(ids); setMsg('Model dihapus dari perangkat ini.'); refresh(); };
  const persist = async () => { const ok = await ensurePersist(); setMsg(ok ? 'Penyimpanan permanen aktif: browser tidak akan membuang model saat ruang menipis.' : 'Browser belum memberi izin. Menginstal MAB-PDF sebagai aplikasi biasanya membantu.'); refresh(); };

  return (
    <details className="field">
      <summary>Penyimpanan AI di perangkat ini</summary>
      <p className="hint">Terpakai {fmtBytes(info.usage)} oleh situs ini{info.quota ? ` (jatah ${fmtBytes(info.quota)})` : ''}. Model diunduh sekali, lalu dipakai ulang tanpa unduh. Hanya satu model disimpan; model lain dihapus otomatis saat Anda berganti.</p>
      <div className="chips">
        <span>{info.persisted ? 'Penyimpanan permanen: aktif' : 'Penyimpanan permanen: belum'}</span>
        {!info.persisted && <button className="chip-btn" onClick={persist}>Aktifkan</button>}
      </div>
      {models.length === 0 ? <p className="hint">Belum ada model AI yang tersimpan.</p> : models.map((m) => (
        <div key={m} className="chips"><span>{m.replace(/-MLC$/, '')}</span><button className="chip-btn" onClick={() => del([m])}>Hapus</button></div>
      ))}
      <div className="chips">
        <button className="chip-btn" onClick={async () => { await clearOcrData(); setMsg('Data bahasa OCR dihapus. Diunduh lagi saat OCR dipakai.'); }}>Hapus data bahasa OCR</button>
      </div>
      {msg && <p className="hint" role="status">{msg}</p>}
    </details>
  );
}
