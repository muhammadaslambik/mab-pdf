import { createEngine } from './scanCore';
const engine = createEngine() as any;
self.onmessage = (ev: MessageEvent) => {
  const { rid, op, args } = ev.data;
  try {
    const r = engine[op](...args);
    (self as any).postMessage({ rid, r }, r && r.buf ? [r.buf] : []);
  } catch (e: any) { (self as any).postMessage({ rid, err: String(e?.message || e) }); }
};
