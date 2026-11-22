import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react';

/**
 * Mitwandernder Joystick: Der Mittelpunkt liegt dort, wo der Daumen das Feld zuerst berührt.
 * Im Ruhezustand zeigt ein blasser Ring in der Mitte des Feldes, wo man ungefähr hinfassen kann.
 *
 * - `size`: Durchmesser des Rings (px); der Knopf kann sich bis 40 % davon vom Mittelpunkt entfernen.
 * - `zoneStyle`: Größe/Lage des Berührfeldes (Standard: 1,35 × size im Quadrat). Gern größer machen.
 * - `onMove(x, y)`: Werte von -1 bis 1, gedrosselt; während gehalten wird alle 400 ms erneut gesendet.
 * - `onEnd`: wenn der Daumen losgelassen wird (danach kommt noch onMove(0, 0)).
 */
export function Joystick({ onMove, onEnd, color, size, zoneStyle, label, ariaLabel = 'Joystick' }: {
  onMove: (x: number, y: number) => void;
  onEnd?: () => void;
  color: string;
  size: number;
  zoneStyle?: CSSProperties;
  label?: string;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState<[number, number]>([0, 0]);
  const [origin, setOrigin] = useState<[number, number] | null>(null);
  const originRef = useRef<[number, number] | null>(null);
  const pointer = useRef<number | null>(null);
  const last = useRef({ x: 0, y: 0, at: 0 });
  const moveRef = useRef(onMove);
  moveRef.current = onMove;
  const reach = size * 0.4;

  const send = (x: number, y: number, force = false) => {
    const n = performance.now();
    if (!force && n - last.current.at < 45 && Math.hypot(x - last.current.x, y - last.current.y) < 0.3) return;
    last.current = { x, y, at: n };
    moveRef.current(x, y);
  };
  const update = (e: RPointerEvent) => {
    const o = originRef.current;
    if (!o) return;
    let x = (e.clientX - o[0]) / reach, y = (e.clientY - o[1]) / reach;
    const len = Math.hypot(x, y);
    if (len > 1) [x, y] = [x / len, y / len];
    setKnob([x, y]);
    send(Math.round(x * 100) / 100, Math.round(y * 100) / 100);
  };
  const end = (e: RPointerEvent) => {
    if (pointer.current !== e.pointerId) return;
    pointer.current = null;
    originRef.current = null;
    setOrigin(null);
    setKnob([0, 0]);
    send(0, 0, true);
    onEnd?.();
  };
  useEffect(() => {
    const id = setInterval(() => pointer.current !== null && moveRef.current(last.current.x, last.current.y), 400);
    return () => clearInterval(id);
  }, []);

  // Lage des Rings: am Berührpunkt, sonst in der Mitte des Feldes
  const rect = ref.current?.getBoundingClientRect();
  const cx = origin && rect ? origin[0] - rect.left : null;
  const cy = origin && rect ? origin[1] - rect.top : null;
  const k = size * 0.4;
  return (
    <div ref={ref} role="application" aria-label={ariaLabel}
      onPointerDown={(e) => {
        if (pointer.current !== null) return;
        e.preventDefault();
        pointer.current = e.pointerId;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        const o: [number, number] = [e.clientX, e.clientY];
        originRef.current = o;
        setOrigin(o);
        setKnob([0, 0]);
        send(0, 0, true);
      }}
      onPointerMove={(e) => pointer.current === e.pointerId && update(e)}
      onPointerUp={end} onPointerCancel={end}
      onContextMenu={(e) => e.preventDefault()}
      style={{ width: size * 1.35, height: size * 1.35, position: 'relative', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', flex: 'none', ...zoneStyle }}>
      <div style={{
        position: 'absolute', width: size, height: size, borderRadius: '50%', pointerEvents: 'none',
        left: cx ?? '50%', top: cy ?? '50%', transform: 'translate(-50%, -50%)',
        background: 'radial-gradient(circle, rgba(255,255,255,.06) 0 60%, rgba(255,255,255,.02) 61%)',
        boxShadow: origin ? `inset 0 0 0 3px ${color}aa, 0 0 22px ${color}44` : `inset 0 0 0 2px ${color}44`,
        opacity: origin ? 1 : 0.7,
      }}>
        <div style={{
          position: 'absolute', left: '50%', top: '50%', width: k, height: k, borderRadius: '50%', background: color,
          boxShadow: `0 0 ${origin ? 22 : 10}px ${color}`, opacity: origin ? 1 : 0.55,
          transform: `translate(calc(-50% + ${knob[0] * reach}px), calc(-50% + ${knob[1] * reach}px))`,
        }} />
      </div>
      {label && <span style={{ position: 'absolute', left: 0, right: 0, bottom: 4, textAlign: 'center', fontSize: 13, fontWeight: 700, letterSpacing: 2, color: 'rgba(255,255,255,.5)', pointerEvents: 'none' }}>{label}</span>}
    </div>
  );
}
