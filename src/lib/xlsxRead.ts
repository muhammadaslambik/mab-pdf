/** Pembaca XLSX/CSV ringan (tanpa library tambahan). */
import { strFromU8, unzipSync } from 'fflate';

export interface Sheet { name: string; rows: string[][] }

const parseXml = (u?: Uint8Array) => (u ? new DOMParser().parseFromString(strFromU8(u), 'application/xml') : null);
const colIndex = (ref: string) => { let n = 0; for (const ch of ref.replace(/[^A-Z]/gi, '').toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
const BUILTIN_DATE = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);
const pad = (n: number) => String(n).padStart(2, '0');

function fmtDate(serial: number, withTime: boolean) {
  const d = new Date(Math.round((serial - 25569) * 86400000));
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  return withTime || serial % 1 ? `${date} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`.replace(/ 00:00$/, '') : date;
}

function fmtNumber(v: number, code: string) {
  if (code.includes('%')) return (v * 100).toFixed((code.match(/\.(0+)/)?.[1].length) ?? 0) + '%';
  const dec = code.match(/\.(0+)/)?.[1].length;
  if (dec !== undefined) return v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: code.includes(',') });
  if (code.includes(',') && code !== 'General') return Math.round(v).toLocaleString('en-US');
  return Number.isInteger(v) ? String(v) : String(+v.toPrecision(12));
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  const sep = (text.split('\n')[0].match(/;/g)?.length ?? 0) > (text.split('\n')[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

export function readXlsx(buf: ArrayBuffer): Sheet[] {
  let f: Record<string, Uint8Array>;
  try { f = unzipSync(new Uint8Array(buf)); } catch { throw new Error('File ini bukan spreadsheet .xlsx yang valid. Format .xls lama belum didukung; simpan ulang sebagai .xlsx.'); }
  const wb = parseXml(f['xl/workbook.xml']);
  if (!wb) throw new Error('File ini bukan spreadsheet .xlsx yang valid.');
  const rels: Record<string, string> = {};
  parseXml(f['xl/_rels/workbook.xml.rels'])?.querySelectorAll('Relationship').forEach((r) => { rels[r.getAttribute('Id') ?? ''] = r.getAttribute('Target') ?? ''; });
  const shared: string[] = [];
  parseXml(f['xl/sharedStrings.xml'])?.querySelectorAll('si').forEach((si) => shared.push(Array.from(si.querySelectorAll('t')).map((t) => t.textContent ?? '').join('')));
  // gaya angka
  const fmts: Record<number, string> = {};
  const st = parseXml(f['xl/styles.xml']);
  st?.querySelectorAll('numFmts > numFmt').forEach((n) => { fmts[+(n.getAttribute('numFmtId') ?? 0)] = n.getAttribute('formatCode') ?? ''; });
  const xfs: number[] = [];
  st?.querySelectorAll('cellXfs > xf').forEach((x) => xfs.push(+(x.getAttribute('numFmtId') ?? 0)));

  const out: Sheet[] = [];
  wb.querySelectorAll('sheets > sheet').forEach((sh) => {
    if (sh.getAttribute('state') === 'hidden' || sh.getAttribute('state') === 'veryHidden') return;
    const rid = sh.getAttribute('r:id') ?? sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') ?? '';
    let target = rels[rid] ?? '';
    target = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
    const ws = parseXml(f[target]);
    if (!ws) return;
    const rows: string[][] = [];
    ws.querySelectorAll('sheetData > row').forEach((rowEl, ri) => {
      const rIdx = +(rowEl.getAttribute('r') ?? ri + 1) - 1;
      const arr: string[] = (rows[rIdx] = rows[rIdx] ?? []);
      rowEl.querySelectorAll(':scope > c').forEach((c) => {
        const ci = colIndex(c.getAttribute('r') ?? 'A1');
        const t = c.getAttribute('t');
        const v = c.querySelector(':scope > v')?.textContent ?? '';
        let val = '';
        if (t === 's') val = shared[+v] ?? '';
        else if (t === 'inlineStr') val = Array.from(c.querySelectorAll('is t')).map((x) => x.textContent ?? '').join('');
        else if (t === 'b') val = v === '1' ? 'TRUE' : 'FALSE';
        else if (t === 'str' || t === 'e') val = v;
        else if (v !== '') {
          const num = parseFloat(v);
          const id = xfs[+(c.getAttribute('s') ?? 0)] ?? 0;
          const code = fmts[id] ?? '';
          const isDate = BUILTIN_DATE.has(id) || (!!code && /[ymdhs]/i.test(code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, '')) && !/^general$/i.test(code));
          val = isNaN(num) ? v : isDate ? fmtDate(num, /h|s/i.test(code) && !/m{1,2}\/|d/i.test(code)) : fmtNumber(num, code || (id === 9 ? '0%' : id === 10 ? '0.00%' : id === 2 ? '0.00' : id === 4 ? '#,##0.00' : id === 3 ? '#,##0' : 'General'));
        }
        arr[ci] = val;
      });
    });
    for (let i = 0; i < rows.length; i++) rows[i] = Array.from(rows[i] ?? [], (x) => x ?? '');
    out.push({ name: sh.getAttribute('name') ?? `Sheet${out.length + 1}`, rows });
  });
  return out;
}
