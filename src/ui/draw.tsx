import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react';

/** Ein Strich: Farbe, Stärke und Punkte (x,y abwechselnd, 0–1000). */
export interface Stroke {
  c: number;
  w: number;
  p: number[];
}

/** Farben (die Reihenfolge nicht ändern – gespeicherte Zeichnungen nutzen die Nummer). Letzte = Radierer. */
export const DRAW_COLORS = [
  '#110D24', '#E8336F', '#1A97B0', '#E8A400', '#FF3B4E', '#FF9F43', '#2EB872', '#5B8CFF',
  '#9B7BFF', '#8A5A2B', '#F2B48A', '#8F88B8', '#FFFDF7',
];
export const ERASER = DRAW_COLORS.length - 1;
/** Strichstärken (Index im Strich). Kritzelei nutzt 0–1, Montagsmaler 0–2. */
export const DRAW_WIDTHS = [7, 18, 38];

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
export function DrawCanvas({ onChange, labels }: {
  /** Wird bei jeder Änderung aufgerufen – während eines Strichs auch mit dem halb fertigen Strich */
  onChange: (strokes: Stroke[]) => void;
  labels: { undo: string; thin: string; thick: string; clear: string; clearConfirm: string; eraser: string };
}) {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [color, setColor] = useState(0);
  const [width, setWidth] = useState(0);
  const current = useRef<Stroke | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [, force] = useState(0);

  useEffect(() => {
    onChange(strokes);
  }, [strokes, onChange]);

  // iPhone/iPad: Scrollen und Zoomen auf der Zeichenfläche komplett verhindern,
  // sonst scrollt die Seite bei Strichen nach oben/unten mit.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const stop = (e: TouchEvent) => e.preventDefault();
    el.addEventListener('touchstart', stop, { passive: false });
    el.addEventListener('touchmove', stop, { passive: false });
    return () => {
      el.removeEventListener('touchstart', stop);
      el.removeEventListener('touchmove', stop);
    };
  }, []);

  const point = (e: RPointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    return [Math.round(((e.clientX - r.left) / r.width) * 1000), Math.round(((e.clientY - r.top) / r.height) * 1000)];
  };
  const down = (e: RPointerEvent) => {
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    current.current = { c: color, w: color === ERASER ? 1 : width, p: point(e) };
    force((n) => n + 1);
  };
  const move = (e: RPointerEvent) => {
    const s = current.current;
    if (!s) return;
    e.preventDefault();
    const [x, y] = point(e);
    const lx = s.p[s.p.length - 2], ly = s.p[s.p.length - 1];
    if (Math.hypot(x - lx, y - ly) < 6) return;
    s.p.push(Math.max(0, Math.min(1000, x)), Math.max(0, Math.min(1000, y)));
    if (s.p.length > 1200) return up();
    force((n) => n + 1);
    // Auch den Strich, der gerade gezeichnet wird, melden – falls die Zeit mittendrin abläuft
    if (s.p.length % 8 === 0) onChange([...strokes, { ...s, p: [...s.p] }]);
  };
  const up = () => {
    const s = current.current;
    current.current = null;
    if (s && strokes.length < 400) setStrokes((list) => [...list, s]);
  };
  const clear = () => {
    if (strokes.length && window.confirm(labels.clearConfirm)) setStrokes([]);
  };

  const all = current.current ? [...strokes, current.current] : strokes;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <svg ref={svgRef} viewBox="0 0 1000 1000"
        style={{ width: 'min(100%, calc(100dvh - 360px))', minWidth: 220, alignSelf: 'center', aspectRatio: '1', background: '#FFFDF7', borderRadius: 22, touchAction: 'none', display: 'block', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' } as CSSProperties}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} aria-label="Zeichenfläche">
        {all.map((s, i) => (
          <path key={i} d={strokePath(s)} fill="none" stroke={DRAW_COLORS[s.c]} strokeWidth={DRAW_WIDTHS[s.w]} strokeLinecap="round" strokeLinejoin="round" />
        ))}
      </svg>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {DRAW_COLORS.map((c, i) => (
          <button key={c} type="button" aria-label={i === ERASER ? labels.eraser : `Farbe ${i + 1}`} title={i === ERASER ? labels.eraser : undefined}
            aria-pressed={color === i} onClick={() => setColor(i)}
            style={{
              width: 38, height: 38, borderRadius: '50%', background: c, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: color === i ? '4px solid #fff' : '4px solid transparent', boxShadow: color === i ? '0 0 0 2px #110D24 inset' : '0 3px 0 #0A0716',
              transform: color === i ? 'scale(1.1)' : undefined, transition: 'transform .1s',
            }}>
            {i === ERASER && (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#110D24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 20H9L4 15a2 2 0 0 1 0-3l9-9a2 2 0 0 1 3 0l5 5a2 2 0 0 1 0 3l-8 8" /><path d="M6 11l7 7" />
              </svg>
            )}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="up-btn ghost small" style={{ flex: 1 }} aria-pressed={width === 1} onClick={() => setWidth(width ? 0 : 1)}>
          {width ? labels.thick : labels.thin}
        </button>
        <button type="button" className="up-btn ghost small" style={{ flex: 1 }} disabled={!strokes.length} onClick={() => setStrokes((l) => l.slice(0, -1))}>
          {labels.undo}
        </button>
        <button type="button" className="up-btn ghost small" style={{ flex: 1 }} disabled={!strokes.length} onClick={clear}>
          {labels.clear}
        </button>
      </div>
    </div>
  );
}
