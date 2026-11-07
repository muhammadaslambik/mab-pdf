export type ThemePref = 'auto' | 'light' | 'dark' | 'comfort';
const KEY = 'mab-theme';
const BAR: Record<string, string> = { light: '#f1eee6', dark: '#0d1320', comfort: '#e8dcc0' };

export function getPref(): ThemePref {
  try { const v = localStorage.getItem(KEY); if (v === 'light' || v === 'dark' || v === 'comfort') return v; } catch { /* penyimpanan diblokir */ }
  return 'auto';
}
export const resolveTheme = (p: ThemePref): 'light' | 'dark' | 'comfort' =>
  p === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : p;

export function applyTheme(p: ThemePref) {
  const t = resolveTheme(p);
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR[t]);
}
export function setPref(p: ThemePref) {
  try { p === 'auto' ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, p); } catch { /* abaikan */ }
  applyTheme(p);
}
