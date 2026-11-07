/**
 * NLP ringan yang berjalan offline di browser: deteksi bahasa, stemmer ringan (Indonesia/Inggris),
 * ringkasan TextRank + MMR, kata kunci, dan pencarian BM25. Tanpa model, tanpa unduhan.
 */

/* ---------- Bahasa ---------- */
const FW: Record<string, string> = {
  id: 'yang dan di untuk dengan pada adalah dari ini itu tidak akan dalam juga atau oleh sebagai dapat telah karena mereka kami kita anda ada lebih sudah saya bisa para serta antara',
  ms: 'yang dan di untuk dengan pada adalah dari ini itu tidak akan dalam juga atau oleh sebagai boleh telah kerana mereka kami kita anda ada lebih sudah saya para serta antara',
  en: 'the of and to in is that for it as with was on be by this are or from at an have not but we our you your they their which has will can more also all been would there what',
  es: 'el la de que y en los las del se por un una con para es no al lo como más pero sus le ya o este sí porque esta entre cuando muy sin sobre también',
  fr: 'le la les de des du et en un une que qui dans pour pas sur est au avec ce il elle nous vous ils sont par plus se ne mais ou comme cette ces leur',
  de: 'der die das und ist in den von zu mit sich des auf für nicht ein eine als auch es an werden aus er hat dass sie nach wird bei einer um am sind noch wie',
  pt: 'o a os as de do da dos das e em um uma que para com não se por mais como mas foi ao ele ela são também seu sua ou ser quando muito há nos já está',
  it: 'il lo la i gli le di del della e che un una per con non è sono si da in come più ma anche suo sua al alla nel nella ha hanno questo questa',
  nl: 'de het een van en in is dat op te zijn voor met niet aan er ook als bij maar om uit door over ze dit nog naar worden heeft wordt',
  tr: 'bir ve bu da de için ile olarak çok daha gibi kadar ama en ne var olan sonra her ya mi mı ben sen biz siz onlar değil'
};
const FWSET: Record<string, Set<string>> = Object.fromEntries(Object.entries(FW).map(([k, v]) => [k, new Set(v.split(' '))]));
const STOP = new Set(Object.values(FW).flatMap((v) => v.split(' ')).concat('yg dgn utk dr sbg tsb pd dlm krn hal ada'.split(' ')));

export const LANG_NAMES: Record<string, string> = { id: 'Indonesia', ms: 'Melayu', en: 'Inggris', es: 'Spanyol', fr: 'Prancis', de: 'Jerman', pt: 'Portugis', it: 'Italia', nl: 'Belanda', tr: 'Turki', zh: 'Mandarin', ja: 'Jepang', ko: 'Korea', ar: 'Arab', ru: 'Rusia', hi: 'Hindi' };

export function detectLang(text: string): string {
  const s = text.slice(0, 6000);
  const cnt = (re: RegExp) => (s.match(re) ?? []).length;
  const han = cnt(/[\u4e00-\u9fff]/g), kana = cnt(/[\u3040-\u30ff]/g), hangul = cnt(/[\uac00-\ud7af]/g), arab = cnt(/[\u0600-\u06ff]/g),
    cyr = cnt(/[\u0400-\u04ff]/g), deva = cnt(/[\u0900-\u097f]/g), latin = cnt(/[a-zA-Z\u00c0-\u024f]/g);
  const max = Math.max(han + kana, hangul, arab, cyr, deva, latin);
  if (max < 8) return 'other';
  if (max === kana + han && (kana || han)) return kana > han * 0.1 ? 'ja' : 'zh';
  if (max === hangul) return 'ko'; if (max === arab) return 'ar'; if (max === cyr) return 'ru'; if (max === deva) return 'hi';
  const words = s.toLowerCase().match(/[a-z\u00c0-\u024f]+/g) ?? [];
  if (words.length < 12) return 'other';
  let best = 'other', bestScore = 0;
  for (const [l, set] of Object.entries(FWSET)) {
    const score = words.filter((w) => set.has(w)).length / words.length;
    const adj = l === 'ms' ? score * 0.97 : score; // id dan ms mirip; utamakan id bila seri
    if (adj > bestScore) { bestScore = adj; best = l; }
  }
  return bestScore < 0.05 ? 'other' : best;
}

/* ---------- Token & stem ---------- */
const PRE = ['meng', 'meny', 'peng', 'peny', 'men', 'mem', 'pen', 'pem', 'ber', 'ter', 'per', 'me', 'pe', 'di', 'ke', 'se'];
const SUF = ['nya', 'kan', 'lah', 'kah', 'pun', 'an', 'i'];
export function stem(w: string): string {
  if (w.length < 5) return w;
  let x = w;
  for (const s of ['ing', 'edly', 'ed', 'ly', 'es', 's']) if (x.length > 5 && x.endsWith(s) && /[a-z]/.test(x[x.length - s.length - 1])) { x = x.slice(0, -s.length); break; }
  for (const s of SUF) if (x.length > (s.length === 1 ? 6 : 5) && x.endsWith(s)) { x = x.slice(0, -s.length); break; }
  for (const p of PRE) if (x.length > p.length + (p.length === 2 && 'di,ke,se'.includes(p) ? 5 : 3) && x.startsWith(p)) { x = x.slice(p.length); break; }
  return x;
}
export const tokens = (t: string, doStem = true) =>
  (t.toLowerCase().normalize('NFC').match(/[\p{L}\p{N}]{2,}/gu) ?? []).filter((w) => !STOP.has(w) && !/^\d+$/.test(w) || /^\d{4}$/.test(w)).map((w) => (doStem ? stem(w) : w));

/* ---------- Kalimat ---------- */
const ABBR = /\b(dr|drs|prof|ir|no|nr|hlm|dll|dsb|dst|yg|dgn|tgl|mis|rp|jl|sdr|bpk|ibu|st|vs|mr|mrs|ms|inc|ltd|co|fig|al|etc|e\.g|i\.e)\./gi;
export function sentences(text: string): string[] {
  const masked = text.replace(/\s+/g, ' ').replace(ABBR, (m) => m.replace(/\./g, '\u0001')).replace(/(\d)\.(\d)/g, '$1\u0001$2').replace(/\b([A-Z])\./g, '$1\u0001');
  return masked.split(/(?<=[.!?…])["'”’)\]]*\s+(?=["'“‘(]?[\p{Lu}\p{N}])/u).map((s) => s.replace(/\u0001/g, '.').trim()).filter((s) => s.length > 0);
}

/* ---------- Kata kunci ---------- */
export function keywords(text: string, n = 10): string[] {
  const freq = new Map<string, { c: number; forms: Map<string, number> }>();
  const words = text.match(/[\p{L}][\p{L}\p{N}-]{2,}/gu) ?? [];
  for (const raw of words) {
    const lw = raw.toLowerCase();
    if (STOP.has(lw)) continue;
    const st = stem(lw);
    const e = freq.get(st) ?? { c: 0, forms: new Map() };
    e.c += /^\p{Lu}/u.test(raw) ? 1.3 : 1; // huruf kapital cenderung nama/istilah penting
    e.forms.set(lw, (e.forms.get(lw) ?? 0) + 1);
    freq.set(st, e);
  }
  const total = [...freq.values()].reduce((s, v) => s + v.c, 0) || 1;
  return [...freq.entries()].filter(([, v]) => v.c >= 2).map(([k, v]) => ({ form: [...v.forms.entries()].sort((a, b) => b[1] - a[1])[0][0], score: v.c * Math.log(1 + total / v.c) }))
    .sort((a, b) => b.score - a.score).slice(0, n).map((x) => x.form);
}

/* ---------- TextRank + MMR ---------- */
function vectors(sents: string[]) {
  const docs = sents.map((s) => tokens(s));
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
  const N = sents.length;
  return docs.map((d) => {
    const tf = new Map<string, number>();
    for (const t of d) tf.set(t, (tf.get(t) ?? 0) + 1);
    const v = new Map<string, number>(); let norm = 0;
    for (const [t, c] of tf) { const w = (1 + Math.log(c)) * Math.log(1 + N / (df.get(t) ?? 1)); v.set(t, w); norm += w * w; }
    return { v, norm: Math.sqrt(norm) || 1, len: d.length };
  });
}
const cosine = (a: { v: Map<string, number>; norm: number }, b: { v: Map<string, number>; norm: number }) => {
  let dot = 0; const [s, l] = a.v.size < b.v.size ? [a, b] : [b, a];
  for (const [t, w] of s.v) { const x = l.v.get(t); if (x) dot += w * x; }
  return dot / (a.norm * b.norm);
};

export function rankSentences(sents: string[]): number[] {
  const V = vectors(sents), n = sents.length;
  const sim: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const c = cosine(V[i], V[j]); sim[i][j] = sim[j][i] = c > 0.04 ? c : 0; }
  const out = sim.map((r) => r.reduce((a, b) => a + b, 0));
  let score = new Array(n).fill(1 / n);
  for (let it = 0; it < 40; it++) {
    const next = new Array(n).fill(0.15 / n);
    for (let i = 0; i < n; i++) if (out[i]) for (let j = 0; j < n; j++) if (sim[i][j]) next[j] += 0.85 * score[i] * (sim[i][j] / out[i]);
    score = next;
  }
  const mx = Math.max(...score) || 1;
  return score.map((s, i) => {
    const len = V[i].len, lenF = len < 6 ? 0.55 : len > 45 ? 0.8 : 1;
    const pos = i < Math.max(2, n * 0.1) ? 1.12 : 1;
    return (s / mx) * lenF * pos;
  });
}

/** Pilih kalimat penting tanpa redundansi (MMR), dikembalikan sesuai urutan asli. */
export function summarize(text: string, count = 6): string[] {
  const sents = sentences(text).filter((s) => s.length >= 35 && s.length <= 700 && /\p{L}{3}/u.test(s));
  if (sents.length <= count) return sents;
  const score = rankSentences(sents), V = vectors(sents);
  const picked: number[] = [];
  while (picked.length < count) {
    let best = -1, bv = -Infinity;
    for (let i = 0; i < sents.length; i++) {
      if (picked.includes(i)) continue;
      const red = picked.length ? Math.max(...picked.map((p) => cosine(V[i], V[p]))) : 0;
      const val = 0.72 * score[i] - 0.28 * red;
      if (val > bv) { bv = val; best = i; }
    }
    picked.push(best);
  }
  return picked.sort((a, b) => a - b).map((i) => sents[i]);
}

/* ---------- BM25 ---------- */
export interface Passage { text: string; page: number }
export class Bm25 {
  private tf: Map<string, number>[]; private len: number[]; private df = new Map<string, number>(); private avg: number;
  constructor(public passages: Passage[]) {
    this.tf = passages.map((p) => { const m = new Map<string, number>(); for (const t of tokens(p.text)) m.set(t, (m.get(t) ?? 0) + 1); return m; });
    this.len = this.tf.map((m) => [...m.values()].reduce((a, b) => a + b, 0));
    for (const m of this.tf) for (const t of m.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
    this.avg = this.len.reduce((a, b) => a + b, 0) / Math.max(1, this.len.length) || 1;
  }
  search(query: string, k = 5): { passage: Passage; score: number; terms: string[] }[] {
    const q = [...new Set(tokens(query))];
    const N = this.passages.length, k1 = 1.4, b = 0.75;
    return this.passages.map((passage, i) => {
      let score = 0; const hit: string[] = [];
      for (const t of q) {
        const f = this.tf[i].get(t); if (!f) continue;
        const idf = Math.log(1 + (N - (this.df.get(t) ?? 0) + 0.5) / ((this.df.get(t) ?? 0) + 0.5));
        score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * this.len[i]) / this.avg)));
        hit.push(t);
      }
      return { passage, score, terms: hit };
    }).filter((r) => r.score > 0).sort((a, b) => b.score - a.score).slice(0, k);
  }
}

/** Kalimat dalam kumpulan bagian yang paling menjawab pertanyaan. */
export function bestSentences(query: string, passages: Passage[], n = 3): { text: string; page: number }[] {
  const q = new Set(tokens(query));
  if (!q.size) return [];
  const cand: { text: string; page: number; score: number }[] = [];
  for (const p of passages) for (const s of sentences(p.text)) {
    if (s.length < 20) continue;
    const t = tokens(s); if (!t.length) continue;
    const hit = new Set(t.filter((x) => q.has(x)));
    const score = hit.size / q.size + 0.15 * Math.min(1, hit.size / Math.sqrt(t.length));
    if (hit.size) cand.push({ text: s, page: p.page, score });
  }
  return cand.sort((a, b) => b.score - a.score).slice(0, n);
}

/* ---------- Lindungi token saat diterjemahkan ---------- */
export function protect(text: string) {
  const map: string[] = [];
  const out = text.replace(/(https?:\/\/[^\s)]+|www\.[^\s)]+|[\w.+-]+@[\w-]+\.[\w.-]+|\b[A-Z]{2,}[-_]?\d+[\w-]*\b)/g, (m) => { map.push(m); return `⟦${map.length - 1}⟧`; });
  return { out, restore: (t: string) => t.replace(/⟦\s*(\d+)\s*⟧/g, (_, i) => map[+i] ?? '') };
}

/** Kunci pencarian: sorot istilah pada teks (mengembalikan potongan {text, hit}). */
export function highlight(text: string, query: string): { text: string; hit: boolean }[] {
  const q = new Set(tokens(query));
  return text.split(/(\s+)/).map((w) => ({ text: w, hit: !!w.trim() && q.has(tokens(w)[0] ?? '') }));
}
