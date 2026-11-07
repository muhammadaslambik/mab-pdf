import { TOOLS } from '../tools/registry';
import type { ToolDef } from '../tools/types';

let pending: File[] = [];
export const setPending = (f: File[]) => { pending = f; };
export const takePending = () => { const f = pending; pending = []; return f; };

export function kindOf(f: File): ToolDef['accept'] | null {
  const n = f.name.toLowerCase();
  if (f.type === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
  if (f.type.startsWith('image/')) return 'image';
  if (n.endsWith('.docx')) return 'docx';
  if (/\.(xlsx|xlsm|csv)$/.test(n)) return 'xlsx';
  if (n.endsWith('.pptx')) return 'pptx';
  if (/\.(html?|txt)$/.test(n)) return 'html';
  return null;
}

const PRIORITY = ['merge', 'compress', 'split', 'jpg-to-pdf', 'pdf-to-word', 'word-to-pdf', 'excel-to-pdf', 'ppt-to-pdf', 'html-to-pdf', 'organize', 'sign', 'edit-pdf',
  'protect', 'unlock', 'ocr', 'ask', 'summarize', 'translate', 'pdf-to-jpg', 'redact', 'rotate', 'watermark', 'page-numbers', 'compare', 'metadata'];

/** Pisahkan file yang dikenali; sisanya diabaikan. Jenis yang dipilih = jenis file pertama. */
export function suggest(files: File[]) {
  const kinds = files.map(kindOf);
  const kind = kinds.find(Boolean) ?? null;
  const usable = files.filter((_, i) => kinds[i] === kind);
  if (!kind) return { kind, usable, tools: [] as ToolDef[], skipped: files.length };
  const tools = TOOLS.filter((t) => t.accept === kind && (usable.length === 1 || t.multiple) && usable.length >= (t.minFiles ?? 1))
    .sort((a, b) => (PRIORITY.indexOf(a.id) + 1 || 99) - (PRIORITY.indexOf(b.id) + 1 || 99));
  return { kind, usable, tools, skipped: files.length - usable.length };
}
