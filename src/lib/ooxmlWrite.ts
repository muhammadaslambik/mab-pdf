/** Penulis DOCX dan XLSX minimal (tanpa library tambahan). */
import { strToU8, zipSync } from 'fflate';

const esc = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const u8 = (s: string) => strToU8(XML + s);

/* ---------------- DOCX ---------------- */
export interface DRun { text: string; bold?: boolean; italic?: boolean; size?: number }
export interface DPara { runs: DRun[]; heading?: number; align?: 'left' | 'center' | 'right'; bullet?: boolean; pageBreakBefore?: boolean }

export interface DTable { table: string[][]; pageBreakBefore?: boolean }

export function writeDocx(paras: (DPara | DTable)[], page: [number, number] = [595.28, 841.89]): Uint8Array {
  const body = paras.map((p) => {
    if ('table' in p) {
      const cols = Math.max(...p.table.map((r) => r.length));
      const bd = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((e) => `<w:${e} w:val="single" w:sz="4" w:space="0" w:color="999999"/>`).join('');
      const rows = p.table.map((r) => `<w:tr>${Array.from({ length: cols }, (_, i) => `<w:tc><w:tcPr><w:tcW w:w="${Math.floor(9000 / cols)}" w:type="dxa"/></w:tcPr><w:p><w:r><w:t xml:space="preserve">${esc(r[i] ?? '')}</w:t></w:r></w:p></w:tc>`).join('')}</w:tr>`).join('');
      return `${p.pageBreakBefore ? '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' : ''}<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${bd}</w:tblBorders></w:tblPr>${rows}</w:tbl><w:p/>`;
    }
    const ppr = [
      p.heading ? `<w:pStyle w:val="Heading${Math.min(3, p.heading)}"/>` : '',
      p.pageBreakBefore ? '<w:pageBreakBefore/>' : '',
      p.bullet ? '<w:ind w:left="360" w:hanging="260"/>' : '',
      p.align && p.align !== 'left' ? `<w:jc w:val="${p.align}"/>` : ''
    ].join('');
    const runs = (p.bullet ? [{ text: '\u2022 ' }, ...p.runs] : p.runs).map((r) => {
      const rpr = (r.bold ? '<w:b/>' : '') + (r.italic ? '<w:i/>' : '') + (r.size ? `<w:sz w:val="${Math.round(r.size * 2)}"/>` : '');
      return `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}<w:t xml:space="preserve">${esc(r.text)}</w:t></w:r>`;
    }).join('');
    return `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ''}${runs}</w:p>`;
  }).join('');
  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const sect = `<w:sectPr><w:pgSz w:w="${Math.round(page[0] * 20)}" w:h="${Math.round(page[1] * 20)}"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>`;
  const heading = (n: number, sz: number) => `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="${n - 1}"/></w:pPr><w:rPr><w:b/><w:sz w:val="${sz}"/></w:rPr></w:style>`;
  return zipSync({
    '[Content_Types].xml': u8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>'),
    '_rels/.rels': u8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    'word/_rels/document.xml.rels': u8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'),
    'word/styles.xml': u8(`<w:styles ${NS}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>${heading(1, 36)}${heading(2, 30)}${heading(3, 26)}</w:styles>`),
    'word/document.xml': u8(`<w:document ${NS}><w:body>${body}${sect}</w:body></w:document>`)
  });
}

/* ---------------- XLSX ---------------- */
export interface XSheet { name: string; rows: (string | number)[][] }

const colName = (i: number) => { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };

export function writeXlsx(sheets: XSheet[]): Uint8Array {
  const names = sheets.map((s, i) => {
    let n = s.name.replace(/[\[\]:*?/\\]/g, ' ').trim().slice(0, 31) || `Sheet${i + 1}`;
    return n;
  });
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': u8(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`),
    '_rels/.rels': u8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    'xl/workbook.xml': u8(`<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': u8(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    'xl/styles.xml': u8('<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>')
  };
  sheets.forEach((s, i) => {
    const rows = s.rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => {
      if (v === '' || v === undefined || v === null) return '';
      const ref = colName(ci) + (ri + 1);
      return typeof v === 'number' ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`;
    }).join('')}</row>`).join('');
    files[`xl/worksheets/sheet${i + 1}.xml`] = u8(`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`);
  });
  return zipSync(files);
}
