import { useEffect, useRef, useState } from 'react';

export default function SignaturePad({ onChange }: { onChange: (dataUrl: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = ref.current!;
    const g = c.getContext('2d')!;
    g.lineWidth = 4;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = '#0b1b4d';
  }, []);

  const pos = (e: React.PointerEvent) => {
    const c = ref.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };

  const down = (e: React.PointerEvent) => {
    drawing.current = true;
    ref.current!.setPointerCapture(e.pointerId);
    const g = ref.current!.getContext('2d')!;
    const p = pos(e);
    g.beginPath();
    g.moveTo(p.x, p.y);
    g.lineTo(p.x + 0.1, p.y + 0.1);
    g.stroke();
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const g = ref.current!.getContext('2d')!;
    const p = pos(e);
    g.lineTo(p.x, p.y);
    g.stroke();
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    setEmpty(false);
    onChange(ref.current!.toDataURL('image/png'));
  };
  const clear = () => {
    const c = ref.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    setEmpty(true);
    onChange('');
  };

  return (
    <div className="sigpad">
      <canvas ref={ref} width={720} height={240} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} />
      {empty && <span className="sigpad-hint">Tanda tangan di sini</span>}
      <button type="button" className="btn-quiet" onClick={clear}>Hapus</button>
    </div>
  );
}
