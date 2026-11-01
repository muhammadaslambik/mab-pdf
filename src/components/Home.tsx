import { useMemo, useState } from 'react';
import { TOOLS } from '../tools/registry';
import { CATEGORIES, type Category } from '../tools/types';

export default function Home() {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<Category | 'all'>('all');

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return TOOLS.filter((t) => {
      if (cat !== 'all' && t.category !== cat) return false;
      if (!s) return true;
      return [t.title, t.desc, ...t.keywords].join(' ').toLowerCase().includes(s);
    });
  }, [q, cat]);

  const grouped = CATEGORIES.map((c) => ({ ...c, tools: list.filter((t) => t.category === c.id) })).filter((g) => g.tools.length);

  return (
    <main className="home">
      <section className="hero">
        <h1>Semua alat PDF.<br />Gratis, dan tetap di perangkat Anda.</h1>
        <p>Tanpa daftar, tanpa unggah ke server. File Anda diproses langsung di browser.</p>
        <input
          className="search" type="search" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Cari alat, misalnya “gabung” atau “kompres”" aria-label="Cari alat"
        />
      </section>

      <nav className="cats" aria-label="Kategori">
        {[{ id: 'all' as const, label: 'Semua' }, ...CATEGORIES].map((c) => (
          <button key={c.id} className={cat === c.id ? 'on' : ''} onClick={() => setCat(c.id)}>{c.label}</button>
        ))}
      </nav>

      {grouped.length === 0 && <p className="empty">Tidak ada alat yang cocok dengan “{q}”. Coba kata lain, misalnya “pisah” atau “putar”.</p>}

      {grouped.map((g) => (
        <section key={g.id} className="group" style={{ ['--c' as any]: g.color }}>
          <h2>{g.label}</h2>
          <div className="grid">
            {g.tools.map((t) => (
              <a key={t.id} href={`#/tool/${t.id}`} className={`tile ${t.status === 'soon' ? 'dim' : ''}`}>
                <span className="tile-icon" aria-hidden>{t.icon}</span>
                <span className="tile-body">
                  <b>{t.title}
                    {t.status === 'beta' && <i className="badge">Beta</i>}
                    {t.status === 'soon' && <i className="badge soon">Segera</i>}
                  </b>
                  <span>{t.desc}</span>
                </span>
              </a>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
