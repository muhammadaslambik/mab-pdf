/** Diff Myers O(ND) pada deretan token. Mengembalikan null bila perbedaan terlalu besar. */
export type DiffOp = 'eq' | 'ins' | 'del';
export interface Seg { op: DiffOp; tokens: string[] }

function myers(a: number[], b: number[], maxD: number): { op: DiffOp; a?: number; b?: number }[] | null {
  const n = a.length, m = b.length;
  const MAX = Math.min(n + m, maxD), off = MAX + 1;
  const v = new Int32Array(2 * MAX + 3);
  const trace: Int32Array[] = [];
  let D = -1;
  for (let d = 0; d <= MAX && D < 0; d++) {
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; }
      v[off + k] = x;
      if (x >= n && y >= m) { D = d; break; }
    }
    trace.push(v.slice(off - d, off + d + 1));
  }
  if (D < 0) return null;
  const ops: { op: DiffOp; a?: number; b?: number }[] = [];
  let x = n, y = m;
  for (let d = D; d > 0; d--) {
    const vp = trace[d - 1];
    const get = (k: number) => vp[k + d - 1];
    const k = x - y;
    const pk = k === -d || (k !== d && get(k - 1) < get(k + 1)) ? k + 1 : k - 1;
    const px = get(pk), py = px - pk;
    const sx = pk === k + 1 ? px : px + 1;
    while (x > sx) { x--; y--; ops.push({ op: 'eq', a: x, b: y }); }
    if (pk === k + 1) ops.push({ op: 'ins', b: py }); else ops.push({ op: 'del', a: px });
    x = px; y = py;
  }
  while (x > 0 && y > 0) { x--; y--; ops.push({ op: 'eq', a: x, b: y }); }
  return ops.reverse();
}

export function diffWords(A: string[], B: string[], maxD = 2500): Seg[] {
  const ids = new Map<string, number>();
  const id = (t: string) => { let i = ids.get(t); if (i === undefined) { i = ids.size; ids.set(t, i); } return i; };
  const a = A.map(id), b = B.map(id);
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const am = a.slice(pre, a.length - suf), bm = b.slice(pre, b.length - suf);
  const segs: Seg[] = [];
  const push = (op: DiffOp, t: string) => { const l = segs[segs.length - 1]; if (l && l.op === op) l.tokens.push(t); else segs.push({ op, tokens: [t] }); };
  A.slice(0, pre).forEach((t) => push('eq', t));
  const ops = am.length || bm.length ? myers(am, bm, maxD) : [];
  if (ops === null) { A.slice(pre, A.length - suf).forEach((t) => push('del', t)); B.slice(pre, B.length - suf).forEach((t) => push('ins', t)); }
  else for (const o of ops) { if (o.op === 'eq') push('eq', A[pre + o.a!]); else if (o.op === 'del') push('del', A[pre + o.a!]); else push('ins', B[pre + o.b!]); }
  A.slice(A.length - suf).forEach((t) => push('eq', t));
  // urutkan: hapus dulu, baru tambah, dalam satu blok perubahan
  const out: Seg[] = [];
  for (let i = 0; i < segs.length; i++) {
    if (segs[i].op !== 'eq' && segs[i + 1] && segs[i + 1].op !== 'eq' && segs[i].op === 'ins' && segs[i + 1].op === 'del') { out.push(segs[i + 1], segs[i]); i++; }
    else out.push(segs[i]);
  }
  return out;
}
