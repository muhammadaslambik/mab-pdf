import type { ReactNode } from 'react';

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
const doc = <path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v5h5" />;
const image = (<><rect x="3" y="4" width="18" height="16" rx="2.5" /><circle cx="9" cy="10" r="1.6" /><path d="m3.5 17 5-5 4 4 3-3 5 5" /></>);
const present = <path d="M3 4h18M5 4v10h14V4M12 14v5M8 21l4-2 4 2" />;
const table = (<><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M3 10h18M3 15h18M9 4v16" /></>);
const lines = (<>{doc}<path d="M9.5 13h5M9.5 17h3.5" /></>);

const ICONS: Record<string, ReactNode> = {
  merge: <path d="m12 3 9 5-9 5-9-5 9-5zM3 13l9 5 9-5" />,
  split: (<><circle cx="6" cy="6" r="2.6" /><circle cx="6" cy="18" r="2.6" /><path d="M8 7.6 20 18M8 16.4 20 6" /></>),
  remove: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />,
  extract: (<><path d="M6 21V3h8l4 4v5" /><path d="M14 3v4h4M14 18h7M18 15l3 3-3 3" /></>),
  organize: (<><rect x="4" y="4" width="7" height="7" rx="1.8" /><rect x="13" y="4" width="7" height="7" rx="1.8" /><rect x="4" y="13" width="7" height="7" rx="1.8" /><rect x="13" y="13" width="7" height="7" rx="1.8" /></>),
  scan: <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16" />,
  compress: <path d="M4 14h6v6M20 10h-6V4M10 14l-7 7M14 10l7-7" />,
  repair: (<g transform="rotate(-45 12 12)"><rect x="2" y="8.5" width="20" height="7" rx="3.5" /><path d="M10 8.5v7M14 8.5v7" /></g>),
  ocr: (<><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5.5 5.5M8 9.5h5M8 12.5h3" /></>),
  'jpg-to-pdf': image,
  'word-to-pdf': (<>{doc}<path d="m9 12 1.2 5 1.3-4 1.3 4 1.2-5" /></>),
  'ppt-to-pdf': present,
  'excel-to-pdf': table,
  'html-to-pdf': <path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" />,
  'pdf-to-jpg': image,
  'pdf-to-word': lines,
  'pdf-to-ppt': present,
  'pdf-to-excel': table,
  'pdf-to-pdfa': <path d="M3 4h18v4H3zM5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4" />,
  rotate: <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />,
  'page-numbers': <path d="M9 4 7 20M17 4l-2 16M4 9h17M3 15h17" />,
  watermark: <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />,
  crop: <path d="M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14" />,
  'edit-pdf': <path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" />,
  form: (<><rect x="5" y="4" width="14" height="17" rx="2.5" /><path d="M9 2.5h6v3H9zM8.5 12h7M8.5 16h4.5" /></>),
  unlock: (<><rect x="5" y="11" width="14" height="10" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 7.5-2" /></>),
  protect: (<><rect x="5" y="11" width="14" height="10" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3M12 15v2" /></>),
  sign: <path d="M3 16c3 0 4.5-8 6.5-8s0 8 3 8 2.5-5 4.5-5 1.5 3 3.5 3M3 21h18" />,
  redact: (<><rect x="3" y="5" width="18" height="4.5" rx="1.2" fill="currentColor" /><path d="M3 14h10M3 18h15" /></>),
  compare: (<><rect x="3" y="4" width="8" height="16" rx="1.8" /><rect x="13" y="4" width="8" height="16" rx="1.8" /><path d="M6 9h2M16 9h2M16 13h2" /></>),
  summarize: <path d="m12 3 1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7-4.7-1.8 4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />,
  translate: <path d="M4 5h9M8.5 3v2M6 5c.5 4 3 7 6.5 8.5M12 5c-.5 3-3 7-7.5 9.5M13 20l4-9 4 9M14.5 17h5" />,
  'pdf-to-markdown': (<><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M6 15V9l3 3 3-3v6M16 9v6m-2-2 2 2 2-2" /></>)
};

export function ToolIcon({ id, size = 24 }: { id: string; size?: number }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" {...S}>{ICONS[id] ?? doc}</svg>;
}

const UI: Record<string, ReactNode> = {
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  lock: <><rect x="5" y="11" width="14" height="9.5" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
  upload: <path d="M12 16V4m0 0-4.5 4.5M12 4l4.5 4.5M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />,
  back: <path d="M19 12H5m6-6-6 6 6 6" />,
  shield: <path d="M12 3 4.5 6v5.5c0 4.5 3.2 8 7.5 9.5 4.3-1.5 7.5-5 7.5-9.5V6L12 3zm-3 9 2.3 2.3L15.5 10" />,
  bolt: <path d="M13 3 5 14h6l-1 7 8-11h-6l1-7z" />,
  gift: <path d="M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7c-2.5 0-4-1-4-2.5S9 2 10.5 3 12 7 12 7zm0 0c2.5 0 4-1 4-2.5S15 2 13.5 3 12 7 12 7z" />,
  download: <path d="M12 4v12m0 0-4.5-4.5M12 16l4.5-4.5M4 19h16" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />
};
export function UiIcon({ name, size = 20 }: { name: keyof typeof UI; size?: number }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" {...S}>{UI[name]}</svg>;
}
