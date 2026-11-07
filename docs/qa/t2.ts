for (const C of [Map, WeakMap] as any[]) { C.prototype.getOrInsertComputed ??= function (k: any, f: any) { if (!this.has(k)) this.set(k, f(k)); return this.get(k); }; C.prototype.getOrInsert ??= function (k: any, v: any) { if (!this.has(k)) this.set(k, v); return this.get(k); }; }
import * as toPdf from '/home/claude/mab-pdf/src/tools/impl/toPdf';
import * as fromPdf from '/home/claude/mab-pdf/src/tools/impl/fromPdf';
import * as conv from '/home/claude/mab-pdf/src/tools/impl/convert';
import * as secure from '/home/claude/mab-pdf/src/tools/impl/secure';
import * as extra from '/home/claude/mab-pdf/src/tools/impl/extra';
import * as pages from '/home/claude/mab-pdf/src/tools/impl/pages';
const tools: Record<string, any> = { ...toPdf, ...fromPdf, ...conv, ...pages, ...secure, ...extra };
(window as any).MOD = tools;
(window as any).runTool = async (name: string, files: { name: string; b64: string; type?: string }[], opts: any = {}) => {
  const fs = files.map((f) => { const bin = atob(f.b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new File([u], f.name, { type: f.type ?? (f.name.endsWith('.pdf') ? 'application/pdf' : '') }); });
  const logs: string[] = [];
  const res = await tools[name](fs, opts, { progress: (p: number, l: string) => logs.push(l), check: () => {} });
  const out = [];
  for (const f of res.files) { const buf = new Uint8Array(await f.blob.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 8192) s += String.fromCharCode(...buf.subarray(i, i + 8192)); out.push({ name: f.name, b64: btoa(s) }); }
  return { files: out, note: res.note };
};
(window as any).ready = true;
