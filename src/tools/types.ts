import type { ComponentType } from 'react';

export type Category = 'organize' | 'optimize' | 'to-pdf' | 'from-pdf' | 'edit' | 'security' | 'ai';

export type FieldDef =
  | { type: 'text'; key: string; label: string; default?: string; placeholder?: string; hint?: string }
  | { type: 'number'; key: string; label: string; default: number; min?: number; max?: number; step?: number; hint?: string }
  | { type: 'select'; key: string; label: string; default: string; options: { value: string; label: string }[]; hint?: string }
  | { type: 'password'; key: string; label: string; hint?: string }
  | { type: 'textarea'; key: string; label: string; placeholder?: string; hint?: string }
  | { type: 'signature'; key: string; label: string };

export type Opts = Record<string, any>;
export interface OutFile { name: string; blob: Blob }
export interface ToolResult { files: OutFile[]; note?: string }
export interface RunCtx {
  progress: (percent: number, label: string) => void;
  /** Lempar error bila pengguna menekan Batalkan. */
  check: () => void;
}
export type RunFn = (files: File[], opts: Opts, ctx: RunCtx) => Promise<ToolResult>;

export interface CustomProps {
  files: File[];
  onDone: (r: ToolResult) => void;
  onError: (message: string) => void;
}

export interface ToolDef {
  id: string;
  category: Category;
  title: string;
  desc: string;
  icon: string;
  keywords: string[];
  accept: 'pdf' | 'image' | 'docx' | 'xlsx' | 'pptx' | 'html';
  multiple: boolean;
  minFiles?: number;
  status: 'ready' | 'beta' | 'soon';
  /** Catatan teknis untuk fitur yang belum tersedia. */
  plan?: string;
  fields?: FieldDef[];
  actionLabel?: string;
  capture?: boolean;
  run?: RunFn;
  custom?: () => Promise<{ default: ComponentType<CustomProps> }>;
}

export const CATEGORIES: { id: Category; label: string; color: string; desc: string }[] = [
  { id: 'organize', label: 'Atur PDF', color: '#3b5b8a', desc: 'Susun, pisah, dan rapikan halaman' },
  { id: 'optimize', label: 'Optimalkan', color: '#2f8f83', desc: 'Perkecil, pulihkan, dan buat teks bisa dicari' },
  { id: 'to-pdf', label: 'Konversi ke PDF', color: '#c8691a', desc: 'Ubah gambar dan dokumen Office menjadi PDF' },
  { id: 'from-pdf', label: 'Konversi dari PDF', color: '#4a5fc1', desc: 'Ubah PDF menjadi gambar dan dokumen Office' },
  { id: 'edit', label: 'Edit PDF', color: '#7a52b3', desc: 'Putar, beri nomor, watermark, dan anotasi' },
  { id: 'security', label: 'Keamanan', color: '#b23a5a', desc: 'Kunci, tanda tangan, samarkan, dan bandingkan' },
  { id: 'ai', label: 'Cerdas (AI)', color: '#0d8a9a', desc: 'Ringkas, terjemahkan, dan ekstrak teks' }
];
