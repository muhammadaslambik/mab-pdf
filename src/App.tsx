import { useEffect, useState } from 'react';
import Home from './components/Home';
import ToolPage from './components/ToolPage';
import { getTool } from './tools/registry';

const route = () => location.hash.replace(/^#\/?/, '');

export default function App() {
  const [r, setR] = useState(route());
  const [installEvt, setInstallEvt] = useState<any>(null);

  useEffect(() => {
    const h = () => { setR(route()); window.scrollTo(0, 0); };
    const b = (e: Event) => { e.preventDefault(); setInstallEvt(e); };
    window.addEventListener('hashchange', h);
    window.addEventListener('beforeinstallprompt', b);
    return () => { window.removeEventListener('hashchange', h); window.removeEventListener('beforeinstallprompt', b); };
  }, []);

  const m = r.match(/^tool\/(.+)$/);
  const tool = m ? getTool(m[1]) : undefined;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches;

  const install = async () => {
    installEvt.prompt();
    await installEvt.userChoice;
    setInstallEvt(null);
  };

  return (
    <>
      <header className="top">
        <a href="#/" className="logo"><img src="./icon.svg" alt="" width={28} height={28} />mab-pdf</a>
        {installEvt && <button className="btn-install" onClick={install}>Pasang aplikasi</button>}
      </header>

      {tool ? <ToolPage key={tool.id} tool={tool} /> : <Home />}

      <footer className="foot">
        <p>mab-pdf berjalan sepenuhnya di browser Anda. Setelah dimuat, banyak alat tetap bisa dipakai tanpa internet.</p>
        {isIOS && !standalone && <p>iPhone/iPad: ketuk Bagikan, lalu “Tambah ke Layar Utama” untuk memasang.</p>}
        <p><a href="https://github.com/muhammadaslambik/mab-pdf" target="_blank" rel="noreferrer">Kode sumber di GitHub</a></p>
      </footer>
    </>
  );
}
