import { zipSync } from 'fflate';
import type { OutFile, ToolResult } from '../tools/types';

/** Beri napas ke UI thread di sela loop panjang. */
export const tick = () => new Promise<void>((r) => setTimeout(r, 0));

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1048576).toFixed(1).replace('.', ',')} MB`;
}

export const baseName = (name: string) => name.replace(/\.[^.]+$/, '');

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15_000);
}

export const pdfResult = (bytes: Uint8Array, name: string, note?: string): ToolResult => ({
  files: [{ name, blob: new Blob([bytes], { type: 'application/pdf' }) }],
  note
});

export function zipFiles(files: { name: string; data: Uint8Array }[]): Blob {
  const map: Record<string, Uint8Array> = {};
  for (const f of files) map[f.name] = f.data;
  return new Blob([zipSync(map, { level: 0 })], { type: 'application/zip' });
}

export const zipResult = (files: { name: string; data: Uint8Array }[], zipName: string): ToolResult => ({
  files: [{ name: zipName, blob: zipFiles(files) } as OutFile]
});

/**
 * Parser rentang halaman. Contoh: "1-3,5,8-" atau "all". Hasil: indeks 0-based, terurut, unik.
 */
export function parseRanges(input: string, total: number): number[] {
  const s = (input ?? '').trim().toLowerCase();
  if (!s || s === 'all' || s === 'semua') return Array.from({ length: total }, (_, i) => i);
  const set = new Set<number>();
  const bad = (p: string) =>
    new Error(`Rentang halaman "${p}" tidak valid. Dokumen ini punya ${total} halaman.`);
  for (const raw of s.split(',')) {
    const p = raw.trim();
    if (!p) continue;
    const m = p.match(/^(\d*)\s*-\s*(\d*)$/);
    if (m) {
      const a = m[1] ? parseInt(m[1], 10) : 1;
      const b = m[2] ? parseInt(m[2], 10) : total;
      if (a < 1 || b < a || b > total) throw bad(p);
      for (let i = a; i <= b; i++) set.add(i - 1);
    } else if (/^\d+$/.test(p)) {
      const n = parseInt(p, 10);
      if (n < 1 || n > total) throw bad(p);
      set.add(n - 1);
    } else {
      throw bad(p);
    }
  }
  return [...set].sort((x, y) => x - y);
}

/** "1-3,4-6" => [[0,1,2],[3,4,5]] (tiap koma = satu file hasil). */
export function parseGroups(input: string, total: number): number[][] {
  const groups = (input ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => parseRanges(p, total));
  if (!groups.length) throw new Error('Isi rentang halaman dulu, misalnya 1-3,4-6.');
  return groups;
}
