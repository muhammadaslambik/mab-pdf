// Laporan rangkuman terstruktur: Intisari, ringkasan per bagian, angka penting, kesimpulan.
// Mode offline: semua kalimat dikutip dari dokumen. Mode AI: tiap keluaran diperiksa terhadap angka di teks sumber.
import { LANG_NAMES, detectLang, keywords, sentences, summarize } from './nlp';
import { CONC_RE, type Sec, type Struct } from './docStruct';

export type Len = 'short' | 'medium' | 'long';
const CFG = { short: { pts: 1, facts: 4, abs: 3, conc: 3, bullets: 2 }, medium: { pts: 2, facts: 8, abs: 6, conc: 5, bullets: 3 }, long: { pts: 3, facts: 14, abs: 9, conc: 7, bullets: 5 } };

export interface ReportOpts { name: string; pages: number; len: Len; perSection: boolean }

const fullText = (s: Struct) => [s.abstract, ...s.sections.map((x) => x.text)].join(' ');
const isConc = (s: Sec) => CONC_RE.test(s.title);
const clip = (t: string, n: number) => (t.length <= n ? t : t.slice(0, n).replace(/\s+\S*$/, '') + '…');

/** Kalimat berisi persentase/angka penting (dikutip apa adanya dari dokumen). */
export function numericFacts(secs: Sec[], n: number): { text: string; page: number }[] {
  const out: { text: string; page: number; score: number; i: number }[] = [];
  let i = 0;
  for (const s of secs) for (const t of sentences(s.text)) {
    i++;
    if (t.length < 30 || t.length > 420 || /diakses|https?:|doi\b|\bvol\.|\bno\.\s?\d|jurnal\b/i.test(t)) continue;
    const pct = (t.match(/\d+(?:[.,]\d+)?\s?%/g) ?? []).length;
    const nums = (t.match(/\d[\d.,]*\d|\d/g) ?? []).filter((x) => !/^(19|20)\d{2}$/.test(x) && x.replace(/\D/g, '').length >= 2).length;
    if (!pct && nums < 2) continue;
    out.push({ text: t, page: s.page, score: pct * 3 + nums, i });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, n).sort((a, b) => a.i - b.i).map(({ text, page }) => ({ text, page }));
}

/** Angka (≥2 digit) pada keluaran yang tidak ada di teks sumber. Pemisah titik/koma diabaikan. */
export function unsupportedNumbers(out: string, src: string): string[] {
  const nums = (t: string) => (t.match(/\d[\d.,]*\d|\d/g) ?? []);
  const set = new Set(nums(src).map((x) => x.replace(/[.,]/g, '')));
  const o = out.replace(/^\s*(\d{1,2}[.)])\s/gm, '');
  const bad = new Set<string>();
  for (const x of nums(o)) { const d = x.replace(/[.,]/g, ''); if (d.length >= 2 && !set.has(d)) bad.add(x); }
  return [...bad];
}

const bullets = (t: string) => t.split(/\n+/).map((l) => l.replace(/^\s*(?:[-*•]|\d{1,2}[.)])\s*/, '').trim()).filter((l) => l.length > 15);

function header(st: Struct, o: ReportOpts) {
  const lang = LANG_NAMES[detectLang(fullText(st))] ?? 'tidak diketahui';
  return `# Rangkuman: ${st.title || o.name}\n\n**Berkas:** ${o.name} · ${o.pages} halaman · bahasa ${lang}\n`;
}

function assemble(st: Struct, o: ReportOpts, intisari: string, secPoints: { s: Sec; pts: string[]; verbatim: boolean }[], conc: string[], note: string) {
  const c = CFG[o.len];
  const keys = st.keywordLine || keywords(fullText(st), 8).join(', ');
  let md = header(st, o) + `\n## Intisari\n\n${intisari}\n` + (keys ? `\n**Kata kunci:** ${keys}\n` : '');
  if (o.perSection && secPoints.length) {
    md += `\n## Isi per bagian\n`;
    secPoints.forEach(({ s, pts, verbatim }, i) => { md += `\n### ${i + 1}. ${s.title} (hlm. ${s.page})\n\n` + pts.map((p) => `- ${p}`).join('\n') + (verbatim ? '\n' : '\n'); });
  }
  const facts = numericFacts(st.sections.filter((s) => !isConc(s)), c.facts);
  if (facts.length) md += `\n## Data dan angka penting\n\n` + facts.map((f) => `- ${f.text} (hlm. ${f.page})`).join('\n') + '\n';
  if (conc.length) md += `\n## Kesimpulan\n\n` + conc.map((p, i) => `${i + 1}. ${p}`).join('\n') + '\n';
  return md + `\n---\n*${note}*\n`;
}

const abstractOf = (st: Struct, len: Len) => {
  const c = CFG[len];
  if (st.abstract) return len === 'short' ? sentences(st.abstract).slice(0, c.abs).join(' ') : clip(st.abstract, 1400);
  return summarize(fullText(st), c.abs).join(' ');
};

export function offlineReport(st: Struct, o: ReportOpts): string {
  const c = CFG[o.len];
  const body = st.sections.filter((s) => !isConc(s));
  const concSec = st.sections.find(isConc);
  const secPoints = body.filter((s) => s.text.length > 250).slice(0, 16).map((s) => ({ s, pts: summarize(s.text, c.pts), verbatim: true })).filter((x) => x.pts.length);
  const conc = concSec ? summarize(concSec.text, c.conc) : [];
  return assemble(st, o, abstractOf(st, o.len), secPoints, conc,
    'Semua kalimat di atas dikutip langsung dari dokumen (tanpa model AI), jadi tidak ada fakta karangan. Untuk bahasa yang lebih sederhana, pakai mesin AI generatif. Untuk kutipan akademik, rujuk dokumen asli.');
}

/* ---------- Mode AI (WebLLM) dengan verifikasi angka ---------- */
export type Ask = (system: string, user: string, maxTokens: number) => Promise<string>;
export interface LlmOpts extends ReportOpts { target: 'id' | 'en' | 'same'; ask: Ask; maxChars?: number; chunk?: boolean; where?: 'device' | 'server'; step: (frac: number, label: string) => void; check: () => void }

function condense(text: string, max: number): string {
  if (text.length <= max) return text;
  const n = sentences(text).length;
  return summarize(text, Math.max(3, Math.floor((n * max) / text.length))).join(' ');
}

function splitChunks(text: string, max: number): string[] {
  const out: string[] = []; let cur = '';
  for (const t of sentences(text)) { if (cur && cur.length + t.length > max) { out.push(cur.trim()); cur = ''; } cur += t + ' '; }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export async function llmReport(st: Struct, o: LlmOpts): Promise<{ md: string; fallback: number; checked: number }> {
  const c = CFG[o.len];
  const MAXC = o.maxChars ?? 3200;
  const docLang = detectLang(fullText(st));
  const id = o.target === 'id' || (o.target === 'same' && (docLang === 'id' || docLang === 'ms'));
  const tgt = o.target === 'en' ? 'English' : o.target === 'id' ? 'Indonesian' : 'the same language as the text';
  const SYS = id
    ? 'Kamu perangkum dokumen yang teliti. Tulis dalam bahasa Indonesia yang sederhana dan jelas. Jawab hanya berdasarkan teks yang diberikan. Jangan menambah fakta, angka, nama, atau kesimpulan yang tidak ada di teks. Salin angka dan persentase persis seperti di teks.'
    : `You are a careful document summarizer. Write in ${tgt}, in simple clear language. Use only the given text. Never add facts, numbers, names or conclusions that are not in the text. Copy numbers and percentages exactly as written.`;
  let fallback = 0, checked = 0, failed = 0, asked = 0, lastErr = '', firstErr = '';
  const ask = async (sy: string, us: string, mx: number) => {
    asked++;
    try { return await o.ask(sy, us, mx); } catch (e: any) {
      if (/Dibatalkan/i.test(String(e?.message))) throw e;
      failed++; lastErr = String(e?.message || e).slice(0, 120); if (!firstErr) firstErr = lastErr; return '';
    }
  };
  const guard = (out: string, src: string) => { checked++; const bad = unsupportedNumbers(out, src); if (bad.length) { fallback++; return false; } return true; };

  const body = st.sections.filter((s) => !isConc(s) && s.text.length > 300).slice(0, 14);
  const concSec = st.sections.find(isConc);
  const jobs = body.map((s) => ({ s, parts: o.chunk && s.text.length > MAXC ? splitChunks(s.text, MAXC) : [condense(s.text, MAXC)] }));
  const calls = jobs.reduce((n, j) => n + j.parts.length, 0);
  const total = calls + 2;
  let step = 0;
  const secPoints: { s: Sec; pts: string[]; verbatim: boolean }[] = [];
  const RULE = id
    ? 'Perhatikan siapa atau apa yang dimaksud tiap angka dan tulis subjeknya persis seperti di teks (misalnya "sesama santri (38%)", bukan "oknum (38%)"). Jangan membalik atau melembutkan makna.'
    : 'Keep exactly who or what each number refers to, as worded in the text. Never reverse or soften the meaning.';

  if (o.perSection) for (const j of jobs) {
    const pts: string[] = []; let verbatim = false;
    for (const src of j.parts) {
      o.check(); o.step((step++ / total) * 0.9, `Merangkum bagian ${j.s.title.slice(0, 40)} (${step}/${calls})`);
      const n = j.parts.length > 1 ? Math.max(2, Math.ceil((c.bullets * 1.5) / j.parts.length)) : c.bullets;
      const u = id
        ? `Ringkas bagian berikut menjadi ${n} poin singkat. Satu kalimat per poin, awali tiap poin dengan "- ". Salin semua angka, persentase, nama, dan istilah persis seperti di teks. ${RULE} Jangan menambah apa pun di luar teks.\n\nBagian: ${j.s.title}\n\n${src}`
        : `Summarize the following section in ${n} short bullet points, one sentence each, each starting with "- ". Copy all numbers, percentages, names and terms exactly. ${RULE} Add nothing that is not in the text.\n\nSection: ${j.s.title}\n\n${src}`;
      const out = await ask(SYS, u, 280);
      const got = bullets(out).slice(0, n + 1);
      if (got.length && guard(got.join(' '), src)) pts.push(...got);
      else { verbatim = true; pts.push(...summarize(src, 1)); }
    }
    secPoints.push({ s: j.s, pts: pts.slice(0, c.bullets * 2), verbatim });
  }

  o.check(); o.step(0.9, 'Menyusun intisari');
  const absSrc = condense([st.abstract, ...(o.perSection ? [] : body.map((b) => b.text)), concSec?.text ?? ''].filter(Boolean).join('\n\n') || fullText(st), MAXC);
  let intisari = await ask(SYS, id
    ? `Tulis satu paragraf intisari (4 sampai 6 kalimat) dari teks berikut: apa masalahnya, bagaimana metodenya, apa temuan utamanya, dan apa kesimpulannya. Hanya dari teks. Salin angka persis.\n\n${absSrc}`
    : `Write one summary paragraph (4 to 6 sentences) from the text below: the problem, the method, the main findings and the conclusion. Use only the text. Copy numbers exactly.\n\n${absSrc}`, 360);
  intisari = intisari.replace(/^\s*[-*•]\s*/gm, '').replace(/\n+/g, ' ').trim();
  if (!intisari || !guard(intisari, fullText(st))) intisari = abstractOf(st, o.len);

  let conc: string[] = [];
  if (concSec) {
    o.check(); o.step(0.96, 'Menyusun kesimpulan');
    const src = condense(concSec.text, Math.round(MAXC * 0.95));
    const out = await ask(SYS, id
      ? `Tulis ${Math.min(5, c.bullets + 1)} poin kesimpulan dari teks berikut. Satu kalimat per poin, awali dengan "- ". Hanya dari teks, salin angka persis.\n\n${src}`
      : `Write ${Math.min(5, c.bullets + 1)} conclusion bullet points from the text below, one sentence each, each starting with "- ". Use only the text; copy numbers exactly.\n\n${src}`, 320);
    const pts = bullets(out);
    conc = pts.length && guard(pts.join(' '), src) ? pts : summarize(concSec.text, c.conc);
  }
  const fail = failed ? ` ${failed} panggilan model gagal (pertama: ${firstErr}; terakhir: ${lastErr}); bagian itu diganti kutipan langsung dari dokumen.` : '';
  const where = o.where === 'server' ? 'Ditulis ulang oleh model AI di server yang Anda tentukan (teks dokumen dikirim ke sana, bukan file PDF-nya).' : 'Ditulis ulang oleh model AI di perangkat Anda.';
  const note = `${where}${fail} Semua angka diperiksa terhadap teks sumber; ${fallback ? `${fallback} dari ${checked} bagian memuat angka yang tidak ditemukan di teks, sehingga diganti kutipan langsung dari dokumen.` : 'tidak ada angka yang menyimpang.'} Tetap periksa kembali, AI bisa keliru menafsirkan. Untuk kutipan akademik, rujuk dokumen asli.`;
  if (failed > 0 && failed === asked) throw new Error(`Model AI gagal menjawab (pertama: ${firstErr}; terakhir: ${lastErr}). Coba muat ulang halaman atau pilih ukuran model lain.`);
  return { md: assemble(st, o, intisari, secPoints, conc, note), fallback, checked };
}
