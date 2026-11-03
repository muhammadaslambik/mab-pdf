import { useEffect, useMemo, useRef, useState } from 'react';
import { TOOLS } from '../tools/registry';
import { CATEGORIES, type Category } from '../tools/types';
import { ToolIcon, UiIcon } from './icons';

const POPULAR: [string, string][] = [['merge', 'Gabungkan'], ['compress', 'Kompres'], ['pdf-to-jpg', 'PDF ke JPG'], ['split', 'Pisahkan'], ['sign', 'Tanda tangan'], ['word-to-pdf', 'Word ke PDF']];

export default function Home() {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<Category | 'all'>('all');
  const [mini, setMini] = useState(false);   // kolom pencarian utama sudah tergulung ke atas
  const [open, setOpen] = useState(false);   // pencarian mini sedang terbuka
  const [stuck, setStuck] = useState(false);
  const heroSearch = useRef<HTMLInputElement>(null);
  const heroBox = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const miniInput = useRef<HTMLInputElement>(null);
  const miniBtn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const nav = useRef<HTMLElement>(null);

  // kolom pencarian utama tergulung ke atas -> tampilkan ikon pencarian di bilah kategori
  useEffect(() => {
    const el = heroBox.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setMini(!e.isIntersecting && e.boundingClientRect.top < 120), { rootMargin: '-72px 0px 0px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // bayangan pada bilah saat menempel
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // tutup bila klik di luar atau tekan Esc
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!overlay.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); miniBtn.current?.focus({ preventScroll: true }); } };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    miniInput.current?.focus({ preventScroll: true });
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  // pintasan "/" untuk mencari
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key !== '/' || /input|textarea|select/i.test(t.tagName)) return;
      e.preventDefault();
      if (mini) setOpen(true); else heroSearch.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mini]);

  // posisikan awal daftar tepat di bawah bilah menempel
  const alignList = (smooth: boolean) => {
    const top = list.current?.getBoundingClientRect().top ?? 0;
    if (top < 70) window.scrollTo({ top: window.scrollY + top - 76, behavior: smooth ? 'smooth' : 'auto' });
  };
  const pick = (c: Category | 'all') => {
    setCat(c);
    requestAnimationFrame(() => {
      alignList(true);
      // geser strip tab agar tab aktif terlihat di tengah (penting di layar sempit)
      const n = nav.current, b = n?.querySelector<HTMLElement>('button.on');
      if (n && b) n.scrollTo({ left: b.offsetLeft - n.clientWidth / 2 + b.clientWidth / 2, behavior: 'smooth' });
    });
  };

  // mengetik di pencarian mini: hasil selalu terlihat di bawah bilah, bukan hero yang kembali muncul
  useEffect(() => { if (open && q.trim()) requestAnimationFrame(() => alignList(false)); }, [q, open]);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    return TOOLS.filter((t) => {
      if (cat !== 'all' && t.category !== cat) return false;
      if (!s) return true;
      return [t.title, t.desc, ...t.keywords].join(' ').toLowerCase().includes(s);
    });
  }, [q, cat]);

  const grouped = CATEGORIES.map((c) => ({ ...c, tools: results.filter((t) => t.category === c.id) })).filter((g) => g.tools.length);

  return (
    <div className="home">
      <div className="wrap">
        <section className="hero">
          <div className="hero-glow" aria-hidden />
          <div className="hero-body">
            <span className="eyebrow"><UiIcon name="lock" size={14} /> Privat sepenuhnya · diproses di perangkat Anda</span>
            <h1>Semua alat PDF.<br /><span className="gold">Gratis, dan tetap di perangkat Anda.</span></h1>
            <p>Tanpa daftar, tanpa unggah ke server. Gabungkan, kompres, ubah, tanda tangani, dan amankan dokumen langsung dari browser.</p>
            <div className="hero-search" ref={heroBox}>
              <UiIcon name="search" size={20} />
              <input ref={heroSearch} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari alat, mis. “gabung”" aria-label="Cari alat" />
              <kbd aria-hidden>/</kbd>
            </div>
            <div className="popular" aria-label="Alat populer">
              <span>Populer</span>
              {POPULAR.map(([id, label]) => <a key={id} href={`#/tool/${id}`}>{label}</a>)}
            </div>
          </div>
          <dl className="hero-stats">
            <div><dt>{TOOLS.length}</dt><dd>alat siap pakai</dd></div>
            <div><dt>0 byte</dt><dd>diunggah ke server</dd></div>
            <div><dt>Rp 0</dt><dd>tanpa daftar, tanpa biaya</dd></div>
          </dl>
        </section>
      </div>

      <div ref={sentinel} className="sentinel" aria-hidden />
      <div ref={bar} className={`cat-bar ${stuck ? 'stuck' : ''}`}>
        <div className="wrap cat-inner">
          <nav ref={nav} className="cats" aria-label="Kategori">
            {[{ id: 'all' as const, label: 'Semua' }, ...CATEGORIES].map((c) => (
              <button key={c.id} className={cat === c.id ? 'on' : ''} onClick={() => pick(c.id)} aria-pressed={cat === c.id}>{c.label}</button>
            ))}
          </nav>
          <button ref={miniBtn} className={`mini-btn ${mini && !open ? 'show' : ''}`} onClick={() => setOpen(true)} aria-label="Cari alat" tabIndex={mini ? 0 : -1}>
            <UiIcon name="search" size={19} />
            {q.trim() && <i className="dot" aria-hidden />}
          </button>
          {open && (
            <div ref={overlay} className="mini-search" role="search">
              <UiIcon name="search" size={19} />
              <input ref={miniInput} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari alat…" aria-label="Cari alat" />
              <button className="mini-close" onClick={() => { setOpen(false); miniBtn.current?.focus({ preventScroll: true }); }} aria-label="Tutup pencarian"><UiIcon name="close" size={18} /></button>
            </div>
          )}
        </div>
      </div>

      <main className="wrap list" ref={list}>
        {grouped.length === 0 && (
          <div className="empty">
            <UiIcon name="search" size={28} />
            <p>Tidak ada alat yang cocok dengan “{q}”.</p>
            <small>Coba kata lain, misalnya “pisah”, “putar”, atau “kunci”.</small>
            <button className="btn-quiet" onClick={() => { setQ(''); setCat('all'); }}>Tampilkan semua alat</button>
          </div>
        )}
        {grouped.map((g) => (
          <section key={g.id} className="group" style={{ ['--c' as any]: g.color }}>
            <header className="group-head">
              <h2>{g.label}</h2>
              <span>{g.desc}</span>
            </header>
            <div className="grid">
              {g.tools.map((t) => (
                <a key={t.id} href={`#/tool/${t.id}`} className="tile">
                  <span className="tile-icon"><ToolIcon id={t.id} size={24} /></span>
                  <span className="tile-body">
                    <b>{t.title}{t.status === 'beta' && <i className="badge">Beta</i>}</b>
                    <span>{t.desc}</span>
                  </span>
                  <span className="tile-go" aria-hidden><UiIcon name="arrow" size={18} /></span>
                </a>
              ))}
            </div>
          </section>
        ))}
        <section className="promise">
          <div><UiIcon name="shield" size={22} /><b>Privat</b><span>File tidak pernah meninggalkan perangkat Anda.</span></div>
          <div><UiIcon name="bolt" size={22} /><b>Cepat</b><span>Tanpa antre unggah dan unduh, bahkan bisa offline.</span></div>
          <div><UiIcon name="gift" size={22} /><b>Gratis</b><span>Tanpa registrasi dan tanpa batas harian.</span></div>
        </section>
      </main>
    </div>
  );
}
