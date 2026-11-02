import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react';

/** Ein Strich: Farbe, Stärke und Punkte (x,y abwechselnd, 0–1000). */
export interface Stroke {
  c: number;
  w: number;
  p: number[];
}

export const DRAW_COLORS = ['#110D24', '#E8336F', '#1A97B0', '#E8A400'];
export const DRAW_WIDTHS = [7, 18];

function strokePath(s: Stroke): string {
  const p = s.p;
  if (p.length < 2) return '';
  if (p.length === 2) return `M${p[0]} ${p[1]}l0.1 0`;
  let d = `M${p[0]} ${p[1]}`;
  for (let i = 2; i < p.length; i += 2) d += `L${p[i]} ${p[i + 1]}`;
  return d;
}

/** Zeichnung anzeigen (TV oder Handy) */
export function Drawing({ strokes, size = 360, style }: { strokes: Stroke[]; size?: number; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 1000 1000" role="img" aria-label="Zeichnung"
      style={{ background: '#FFFDF7', borderRadius: 24, flex: 'none', ...style }}>
      {strokes.map((s, i) => (
        <path key={i} d={strokePath(s)} fill="none" stroke={DRAW_COLORS[s.c] ?? DRAW_COLORS[0]} strokeWidth={DRAW_WIDTHS[s.w] ?? DRAW_WIDTHS[0]} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}

/** Zeichenfläche fürs Handy */
export function DrawCanvas({ onChange, labels }: { onChange: (strokes: Stroke[]) => void; labels: { undo: string; thin: string; thick: string } }) {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [color, setColor] = useState(0);
  const [width, setWidth] = useState(0);
  const current = useRef<Stroke | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [, force] = useState(0);

  useEffect(() => {
    onChange(strokes);
  }, [strokes, onChange]);

  const point = (e: RPointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    return [Math.round(((e.clientX - r.left) / r.width) * 1000), Math.round(((e.clientY - r.top) / r.height) * 1000)];
  };
  const down = (e: RPointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    current.current = { c: color, w: width, p: point(e) };
    force((n) => n + 1);
  };
  const move = (e: RPointerEvent) => {
    const s = current.current;
    if (!s) return;
    const [x, y] = point(e);
    const lx = s.p[s.p.length - 2], ly = s.p[s.p.length - 1];
    if (Math.hypot(x - lx, y - ly) < 6) return;
    s.p.push(Math.max(0, Math.min(1000, x)), Math.max(0, Math.min(1000, y)));
    if (s.p.length > 1200) return up();
    force((n) => n + 1);
  };
  const up = () => {
    const s = current.current;
    current.current = null;
    if (s && strokes.length < 400) setStrokes((list) => [...list, s]);
  };

  const all = current.current ? [...strokes, current.current] : strokes;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <svg ref={svgRef} viewBox="0 0 1000 1000" style={{ width: '100%', aspectRatio: '1', background: '#FFFDF7', borderRadius: 22, touchAction: 'none', display: 'block' }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up} aria-label="Zeichenfläche">
        {all.map((s, i) => (
          <path key={i} d={strokePath(s)} fill="none" stroke={DRAW_COLORS[s.c]} strokeWidth={DRAW_WIDTHS[s.w]} strokeLinecap="round" strokeLinejoin="round" />
        ))}
      </svg>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {DRAW_COLORS.map((c, i) => (
          <button key={c} type="button" aria-label={`Farbe ${i + 1}`} aria-pressed={color === i} onClick={() => setColor(i)}
            style={{ width: 44, height: 44, borderRadius: '50%', background: c, border: color === i ? '4px solid #fff' : '4px solid transparent', boxShadow: '0 3px 0 #0A0716' }} />
        ))}
        <span style={{ flex: 1 }} />
        <button type="button" className="up-btn ghost small" aria-pressed={width === 1} onClick={() => setWidth(width ? 0 : 1)}>
          {width ? labels.thick : labels.thin}
        </button>
        <button type="button" className="up-btn ghost small" disabled={!strokes.length} onClick={() => setStrokes((l) => l.slice(0, -1))}>
          {labels.undo}
        </button>
      </div>
    </div>
  );
}
