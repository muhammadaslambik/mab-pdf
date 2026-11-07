import { useEffect, useRef, useState } from 'react';
import Home from './components/Home';
import ToolPage from './components/ToolPage';
import Chooser from './components/Chooser';
import { UiIcon } from './components/icons';
import { getTool } from './tools/registry';
import { applyTheme, getPref, setPref, type ThemePref } from './lib/theme';

const route = () => location.hash.replace(/^#\/?/, '');
const THEMES: { id: ThemePref; label: string; icon: 'auto' | 'sun' | 'moon' | 'leaf' }[] = [
  { id: 'auto', label: 'Otomatis', icon: 'auto' }, { id: 'light', label: 'Terang', icon: 'sun' },
  { id: 'dark', label: 'Gelap', icon: 'moon' }, { id: 'comfort', label: 'Nyaman (sepia)', icon: 'leaf' }
];

export default function App() {
  const [r, setR] = useState(route());
  const [installEvt, setInstallEvt] = useState<any>(null);
  const [chooser, setChooser] = useState<File[] | null>(null);
  const [drag, setDrag] = useState(false);
  const [toast, setToast] = useState('');
  const [pref, setPrefState] = useState<ThemePref>(getPref());
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const m = r.match(/^tool\/(.+)$/);
  const tool = m ? getTool(m[1]) : undefined;
  const onTool = useRef(false);
  onTool.current = !!tool;

  useEffect(() => {
    const h = () => { setR(route()); window.scrollTo(0, 0); };
    const b = (e: Event) => { e.preventDefault(); setInstallEvt(e); };
    const off = () => setToast('Siap dipakai tanpa internet. Aplikasi sudah tersimpan di perangkat ini.');
    window.addEventListener('hashchange', h);
    window.addEventListener('beforeinstallprompt', b);
    window.addEventListener('mab:offline-ready', off);
    return () => { window.removeEventListener('hashchange', h); window.removeEventListener('beforeinstallprompt', b); window.removeEventListener('mab:offline-ready', off); };
  }, []);

  // file dari seret-lepas, tempel, tombol "Pilih file", atau dibuka lewat aplikasi terpasang
  useEffect(() => {
    const handle = (files: File[]) => {
      if (!files.length) return;
      if (onTool.current) window.dispatchEvent(new CustomEvent('mab:tool-files', { detail: files }));
      else setChooser(files);
    };
    let depth = 0;
    const has = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const enter = (e: DragEvent) => { if (has(e)) { depth++; setDrag(true); } };
    const leave = (e: DragEvent) => { if (has(e) && --depth <= 0) { depth = 0; setDrag(false); } };
    const over = (e: DragEvent) => { if (has(e)) e.preventDefault(); };
    const drop = (e: DragEvent) => { if (!has(e)) return; e.preventDefault(); depth = 0; setDrag(false); handle(Array.from(e.dataTransfer!.files)); };
    const paste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement;
      const fs = Array.from(e.clipboardData?.files ?? []);
      if (fs.length && !/input|textarea/i.test(t.tagName)) { e.preventDefault(); handle(fs); }
    };
    const custom = (e: Event) => handle((e as CustomEvent<File[]>).detail);
    window.addEventListener('dragenter', enter); window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over); window.addEventListener('drop', drop);
    window.addEventListener('paste', paste); window.addEventListener('mab:files', custom);
    (window as any).launchQueue?.setConsumer?.(async (p: any) => {
      if (p?.files?.length) handle(await Promise.all(p.files.map((h: any) => h.getFile())));
    });
    return () => {
      window.removeEventListener('dragenter', enter); window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over); window.removeEventListener('drop', drop);
      window.removeEventListener('paste', paste); window.removeEventListener('mab:files', custom);
    };
  }, []);

  // pantau perubahan tema sistem saat mode Otomatis
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const f = () => pref === 'auto' && applyTheme('auto');
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, [pref]);

  useEffect(() => {
    if (!menu) return;
    const d = (e: PointerEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); };
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    document.addEventListener('pointerdown', d); document.addEventListener('keydown', k);
    return () => { document.removeEventListener('pointerdown', d); document.removeEventListener('keydown', k); };
  }, [menu]);

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 5000); return () => clearTimeout(t); }, [toast]);

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches;
  const install = async () => { installEvt.prompt(); await installEvt.userChoice; setInstallEvt(null); };
  const cur = THEMES.find((t) => t.id === pref)!;

  return (
    <>
      <header className="top wrap">
        <a href="#/" className="logo"><img src="./icon.svg" alt="" width={28} height={28} />MAB-PDF</a>
        <div className="top-actions">
          {installEvt && <button className="btn-install" onClick={install}>Pasang aplikasi</button>}
          <div className="theme" ref={menuRef}>
            <button className="icon-btn" onClick={() => setMenu(!menu)} aria-label={`Tema: ${cur.label}`} aria-expanded={menu} title="Tema tampilan"><UiIcon name={cur.icon} size={19} /></button>
            {menu && (
              <div className="menu" role="menu">
                {THEMES.map((t) => (
                  <button key={t.id} role="menuitemradio" aria-checked={pref === t.id} className={pref === t.id ? 'on' : ''} onClick={() => { setPref(t.id); setPrefState(t.id); setMenu(false); }}>
                    <UiIcon name={t.icon} size={17} /> {t.label} {pref === t.id && <UiIcon name="check" size={16} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      {tool ? <ToolPage key={tool.id} tool={tool} /> : <Home />}

      <footer className="foot">
        <p>MAB-PDF berjalan sepenuhnya di browser Anda. Setelah dimuat, banyak alat tetap bisa dipakai tanpa internet.</p>
        {isIOS && !standalone && <p>iPhone/iPad: ketuk Bagikan, lalu “Tambah ke Layar Utama” untuk memasang.</p>}
        <p><a href="https://github.com/muhammadaslambik/mab-pdf" target="_blank" rel="noreferrer">Kode sumber di GitHub</a></p>
      </footer>

      {chooser && <Chooser files={chooser} onClose={() => setChooser(null)} />}
      {drag && <div className="drop-veil" aria-hidden><div><UiIcon name="upload" size={34} /><b>Lepaskan file di sini</b><span>PDF, gambar, Word, Excel, PowerPoint, atau HTML</span></div></div>}
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
