import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import type { ControllerViewProps, GameClientModule, HostViewProps, PlayerInfo, Translate } from '@up/sdk';
import { Confetti, PhoneTimer, PhoneWait, Podium, HostTimer, useServerNow, useStream } from '@up/ui';
import { placeProblem, routeFor, type Kind, type Rock, type ZoneKind } from './engine';

/* ================= Farben und Formen ================= */

const BG = '#060918';
const PANEL = 'rgba(20,26,58,.8)';
const LINE = '#2A3470';
const TEXT = '#E8ECFF';
const MUTED = '#A9B1D6';
const DIM = '#8C95C4';
const CYAN = '#3EF0FF';
const YELLOW = '#FFD43B';
const PINK = '#FF7AE6';
const RED = '#FF4D4D';
const GREEN = '#2ED47A';
const DISPLAY = '"Exo 2", "Chakra Petch", var(--display), sans-serif';
const TP = '#2EF2C8';
const CR = '₡';

const TOWER_COLOR: Record<string, string> = { T: '#E8ECFF', L: '#3EF0FF', P: '#FF7A3D', F: '#7FB2FF', K: '#C9A6FF', R: '#FF4FD8', A: '#9CFF6B', Q: '#B8FF3D', V: '#FFD43B' };
const TYPES = ['L', 'P', 'F', 'K', 'R', 'A', 'Q', 'V'];
const MONSTER_KEYS = ['laeufer', 'flitzer', 'panzer', 'schwarm', 'flieger', 'heiler', 'spalter', 'springer', 'schild', 'boss', 'splitter'];
const MONSTER_COLOR = ['#FF7AE6', '#FFD43B', '#B9C2D4', '#FF9F1C', '#9CFF6B', '#2ED47A', '#C9A6FF', '#6BE4FF', '#7FB2FF', '#FF4D4D', '#FFB3E6'];
const mColor = (t: string) => MONSTER_COLOR[MONSTER_KEYS.indexOf(t)] ?? PINK;
const ZONE_COLOR: Record<string, string> = { slow: '80,140,255', fast: '255,77,77', dmg: '255,212,59', range: '170,100,255', nobuild: '120,125,150' };

type Pt = [number, number];
interface Zone { k: ZoneKind; x: number; y: number; w: number; h: number; s: number }
interface Coin { x: number; y: number; m: number }
interface MapInfo { w: number; h: number; start: Pt; core: Pt; cps: Pt[]; tps: { i: Pt; o: Pt }[]; zones: Zone[]; coins: Coin[]; maxLimit: number }
interface LegOut { l: number; j: number; p: Pt[] }
type Bld = [number, number, number, number, string, number, number, number, number?, number?];
interface BoardOut { idx: number; bs: Bld[]; rocks: Rock[]; legs: LegOut[]; cu?: number[] }
interface Draft { kind: Kind; x: number; y: number }
type PendingOut = { k: 'build'; kind: Kind; x: number; y: number } | { k: 'sell'; id: number } | { k: 'blast'; x: number; y: number };

function priceColor(f: number) {
  const t = Math.max(-1, Math.min(1, Math.log(f) / Math.log(4)));
  const a = [255, 212, 59], b = t < 0 ? [46, 212, 122] : [255, 77, 77], k = Math.abs(t);
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',')})`;
}
const zoneAlpha = (z: Zone) => {
  const k = z.k === 'slow' ? (0.85 - z.s) / 0.45 : z.k === 'fast' ? (z.s - 1.1) / 0.7 : z.k === 'dmg' ? (z.s - 1.1) / 0.9 : z.k === 'range' ? (z.s - 1.1) / 0.7 : 0.6;
  return 0.16 + 0.32 * Math.max(0, Math.min(1, k));
};
const legColor = (l: number, n: number) => `rgba(255,70,70,${(0.35 + 0.65 * (n > 1 ? l / (n - 1) : 1)).toFixed(2)})`;
const planColor = (l: number, n: number) => `rgba(255,212,59,${(0.25 + 0.3 * (n > 1 ? l / (n - 1) : 1)).toFixed(2)})`;
const zoneText = (z: Zone, nobuild: string) => { const p = Math.round(Math.abs(z.s - 1) * 100); return z.k === 'slow' ? `−${p}% SPD` : z.k === 'fast' ? `+${p}% SPD` : z.k === 'dmg' ? `+${p}% ATK` : z.k === 'range' ? `+${p}% RNG` : nobuild; };
const fmtK = (n: number) => (n >= 10000 ? Math.round(n / 1000) + 'k' : n >= 1000 ? (n / 1000).toFixed(1).replace('.', ',') + 'k' : String(n));
const fmtTime = (s: number) => (s > 0 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '–');
const sizeOf = (k: Kind) => (k === 'wall' ? 1 : 2);
const legsToOut = (legs: { pts: Pt[]; leg: number; jump?: boolean }[] | null): LegOut[] | null => legs && legs.map((l) => ({ l: l.leg, j: l.jump ? 1 : 0, p: l.pts }));

/* ================= Karte (SVG in Feld-Einheiten) ================= */

function arrowsOf(legs: LegOut[], color: (l: number) => string) {
  const out: { x: number; y: number; a: number; c: string }[] = [];
  for (const g of legs) {
    if (g.j) continue;
    let acc = 1.5;
    for (let k = 1; k < g.p.length; k++) {
      const [ax, ay] = g.p[k - 1], [bx, by] = g.p[k];
      const len = Math.hypot(bx - ax, by - ay), a = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
      for (let d = 0; d < len; d += 0.25) {
        acc += 0.25;
        if (acc >= 4) { acc = 0; out.push({ x: ax + ((bx - ax) * d) / len, y: ay + ((by - ay) * d) / len, a, c: color(g.l) }); }
      }
    }
  }
  return out;
}

function Route({ legs, color, width, dash }: { legs: LegOut[]; color: (l: number) => string; width: number; dash: string }) {
  const arrows = useMemo(() => arrowsOf(legs, color), [legs, color]);
  return (
    <g pointerEvents="none">
      {legs.map((g, i) => (
        <polyline key={'l' + i} points={g.p.map((p) => p.join(',')).join(' ')} fill="none" stroke={g.j ? 'rgba(46,242,200,.6)' : color(g.l)} strokeWidth={g.j ? 0.12 : width} strokeDasharray={g.j ? '0.3 0.35' : dash} strokeLinejoin="round" strokeLinecap="round" />
      ))}
      {arrows.map((a, i) => <path key={'a' + i} d="M-0.3,-0.33 L0.38,0 L-0.3,0.33 Z" fill={a.c} transform={`translate(${a.x},${a.y}) rotate(${a.a})`} />)}
    </g>
  );
}

function Building({ b, sel, labels, ghost, stats }: { b: Bld; sel?: boolean; labels: boolean; ghost?: string; stats?: boolean }) {
  const [id, kind, x, y, type, level] = b;
  const op = ghost ? 0.55 : 1;
  if (kind === 0) return <rect key={id} x={x + 0.03} y={y + 0.03} width={0.94} height={0.94} rx={0.12} fill="#3B4470" opacity={op} stroke={ghost ?? (sel ? CYAN : '#6A76B0')} strokeWidth={sel || ghost ? 0.16 : 0.07} strokeDasharray={ghost ? '0.25 0.15' : undefined} />;
  if (kind === 2) return (
    <g opacity={op}>
      <rect x={x + 0.1} y={y + 0.1} width={1.8} height={1.8} rx={0.3} fill="#10203A" stroke={ghost ?? (sel ? '#FFFFFF' : CYAN)} strokeWidth={0.14} strokeDasharray={ghost ? '0.3 0.2' : undefined} />
      {labels && <text x={x + 1} y={y + 1.3} fontSize={0.75} textAnchor="middle" fill={CYAN} fontWeight={800}>+10</text>}
    </g>
  );
  const c = TOWER_COLOR[type] ?? TEXT;
  return (
    <g opacity={op}>
      {sel && <rect x={x - 0.05} y={y - 0.05} width={2.1} height={2.1} rx={0.35} fill="none" stroke={CYAN} strokeWidth={0.18} />}
      <rect x={x + 0.16} y={y + 0.16} width={1.68} height={1.68} rx={0.28} fill="#0A0F28" stroke={ghost ?? c} strokeWidth={0.14} strokeDasharray={ghost ? '0.3 0.2' : undefined} />
      {type === 'T' ? <rect x={x + 0.78} y={y + 0.78} width={0.44} height={0.44} rx={0.08} fill={c} /> : labels && <text x={x + 1} y={y + 1.32} fontSize={0.9} textAnchor="middle" fill={c} fontWeight={800}>{type}</text>}
      {level > 1 && <text x={x + 1.75} y={y + 0.55} fontSize={0.55} textAnchor="middle" fill={YELLOW} fontWeight={800}>{'•'.repeat(level - 1)}</text>}
      {stats && !ghost && type !== 'V' && (
        <g pointerEvents="none">
          <rect x={x + 0.05} y={y + 0.2} width={1.9} height={1.6} rx={0.2} fill="rgba(6,9,24,.85)" />
          <text x={x + 1} y={y + 0.9} fontSize={0.55} textAnchor="middle" fill={TEXT} fontWeight={700}>{fmtK(b[8] ?? 0)}</text>
          <text x={x + 1} y={y + 1.55} fontSize={0.55} textAnchor="middle" fill={YELLOW} fontWeight={700}>{fmtK(b[9] ?? 0)}</text>
        </g>
      )}
    </g>
  );
}

const Cross = ({ x, y, w, h }: { x: number; y: number; w: number; h: number }) => (
  <path d={`M${x + 0.2},${y + 0.2} L${x + w - 0.2},${y + h - 0.2} M${x + w - 0.2},${y + 0.2} L${x + 0.2},${y + h - 0.2}`} stroke={YELLOW} strokeWidth={0.16} pointerEvents="none" />
);

interface LayerProps {
  map: MapInfo; rocks: Rock[]; legs: LegOut[]; plan?: LegOut[] | null; bs?: Bld[]; selected?: number | string | null; monsters?: number[];
  labels?: boolean; zones?: boolean; pending?: PendingOut[]; draft?: (Draft & { bad: boolean }) | null; stats?: boolean; coinsUsed?: number[]; nobuild?: string;
}

function MapLayer({ map, rocks, legs, plan, bs, selected, monsters, labels = true, zones = true, pending, draft, stats, coinsUsed, nobuild = '' }: LayerProps) {
  const n = map.cps.length + 1;
  const red = useMemo(() => (l: number) => legColor(l, n), [n]);
  const yel = useMemo(() => (l: number) => planColor(l, n), [n]);
  const sells = new Set(pending?.filter((p) => p.k === 'sell').map((p) => (p as { id: number }).id));
  return (
    <g>
      <rect x={0} y={0} width={map.w} height={map.h} fill="#121839" />
      {zones && map.zones.filter((z) => z.k !== 'nobuild').map((z, i) => (
        <g key={'z' + i}>
          <rect x={z.x} y={z.y} width={z.w} height={z.h} rx={0.6} fill={`rgba(${ZONE_COLOR[z.k]},${zoneAlpha(z).toFixed(2)})`} stroke={`rgba(${ZONE_COLOR[z.k]},.6)`} strokeWidth={0.06} />
          {labels && <text x={z.x + 0.3} y={z.y + 0.8} fontSize={0.6} fill={`rgb(${ZONE_COLOR[z.k]})`} fontWeight={800}>{zoneText(z, nobuild)}</text>}
        </g>
      ))}
      {map.zones.filter((z) => z.k === 'nobuild').map((z, i) => (
        <g key={'nb' + i}>
          <rect x={z.x} y={z.y} width={z.w} height={z.h} rx={0.6} fill="#2B2E42" stroke="rgba(160,165,190,.7)" strokeWidth={0.08} />
          {labels && <text x={z.x + 0.3} y={z.y + 0.8} fontSize={0.6} fill="#B9BED6" fontWeight={800}>{nobuild}</text>}
        </g>
      ))}
      {rocks.map(([x, y, w, h], i) => <rect key={'r' + i} x={x + 0.05} y={y + 0.05} width={w - 0.1} height={h - 0.1} rx={0.7} fill="#4A4658" stroke={selected === `rock:${x},${y}` ? CYAN : '#5E5A70'} strokeWidth={selected === `rock:${x},${y}` ? 0.18 : 0.06} />)}
      {map.coins.map((c, i) => (
        <g key={'c' + i}>
          <circle cx={c.x + 1} cy={c.y + 1} r={0.85} fill={coinsUsed?.includes(i) ? 'rgba(140,145,170,.15)' : 'rgba(255,212,59,.18)'} stroke={coinsUsed?.includes(i) ? '#7C8199' : YELLOW} strokeWidth={0.12} />
          {labels && <>
            <text x={c.x + 1} y={c.y + 1.38} fontSize={1} textAnchor="middle" fill={coinsUsed?.includes(i) ? '#7C8199' : YELLOW} fontWeight={800}>{CR}</text>
            <text x={c.x + 1} y={c.y - 0.15} fontSize={0.6} textAnchor="middle" fill={coinsUsed?.includes(i) ? '#7C8199' : YELLOW} fontWeight={800}>×{String(c.m).replace('.', ',')}</text>
          </>}
        </g>
      ))}
      {map.tps.map((t, i) => (
        <g key={'tp' + i}>
          <circle cx={t.i[0] + 1} cy={t.i[1] + 1} r={0.9} fill="rgba(10,15,40,.7)" stroke={GREEN} strokeWidth={0.14} />
          <circle cx={t.o[0] + 1} cy={t.o[1] + 1} r={0.9} fill="rgba(10,15,40,.7)" stroke={RED} strokeWidth={0.14} strokeDasharray="0.3 0.2" />
          {labels && <>
            <text x={t.i[0] + 1} y={t.i[1] + 0.95} fontSize={0.42} textAnchor="middle" fill={GREEN} fontWeight={800}>TP{i + 1}</text>
            <text x={t.i[0] + 1} y={t.i[1] + 1.45} fontSize={0.42} textAnchor="middle" fill={GREEN} fontWeight={800}>IN</text>
            <text x={t.o[0] + 1} y={t.o[1] + 0.95} fontSize={0.42} textAnchor="middle" fill={RED} fontWeight={800}>TP{i + 1}</text>
            <text x={t.o[0] + 1} y={t.o[1] + 1.45} fontSize={0.42} textAnchor="middle" fill={RED} fontWeight={800}>OUT</text>
          </>}
        </g>
      ))}
      <rect x={map.start[0]} y={map.start[1]} width={2} height={2} rx={0.4} fill="rgba(46,212,122,.35)" stroke={GREEN} strokeWidth={0.12} />
      {labels && <text x={map.start[0] + 1} y={map.start[1] + 1.35} fontSize={1} textAnchor="middle" fill={GREEN} fontWeight={800}>S</text>}
      <circle cx={map.core[0] + 1} cy={map.core[1] + 1} r={1} fill="url(#ctdCore)" />
      {map.cps.map((p, i) => (
        <g key={'cp' + i}>
          <circle cx={p[0] + 1} cy={p[1] + 1} r={0.8} fill="#FFFFFF" />
          {labels && <text x={p[0] + 1} y={p[1] + 1.35} fontSize={1} textAnchor="middle" fill={BG} fontWeight={800}>{i + 1}</text>}
        </g>
      ))}
      {bs?.map((b) => (
        <g key={b[0]}>
          <Building b={b} sel={selected === b[0]} labels={labels} stats={stats} />
          {sells.has(b[0]) && <Cross x={b[2]} y={b[3]} w={sizeOf(b[1] === 0 ? 'wall' : 'tower')} h={sizeOf(b[1] === 0 ? 'wall' : 'tower')} />}
        </g>
      ))}
      {pending?.map((p, i) => {
        if (p.k === 'build') return <Building key={'p' + i} b={[-1 - i, p.kind === 'wall' ? 0 : p.kind === 'tower' ? 1 : 2, p.x, p.y, 'T', 1, 0, 0]} labels={labels} ghost={YELLOW} />;
        if (p.k === 'blast') { const r = rocks.find((q) => q[0] === p.x && q[1] === p.y); return r ? <Cross key={'p' + i} x={r[0]} y={r[1]} w={r[2]} h={r[3]} /> : null; }
        return null;
      })}
      <Route legs={legs} color={red} width={0.2} dash="0.55 0.3" />
      {plan && <Route legs={plan} color={yel} width={0.13} dash="0.4 0.35" />}
      {draft && <Building b={[-999, draft.kind === 'wall' ? 0 : draft.kind === 'tower' ? 1 : 2, draft.x, draft.y, 'T', 1, 0, 0]} labels={labels} ghost={draft.bad ? RED : CYAN} />}
      {monsters && Array.from({ length: Math.floor(monsters.length / 4) }, (_, k) => {
        const x = monsters[k * 4] / 10, y = monsters[k * 4 + 1] / 10, ti = monsters[k * 4 + 2], hp = monsters[k * 4 + 3];
        const c = MONSTER_COLOR[ti] ?? PINK;
        const r = ti === 9 ? 0.6 : ti === 3 || ti === 10 ? 0.28 : 0.38;
        return (
          <g key={'m' + k} style={{ transform: `translate(${x}px,${y}px)`, transition: 'transform 0.2s linear' }} pointerEvents="none">
            <circle r={r} fill={c} />
            {hp < 9 && <rect x={-0.45} y={-r - 0.25} width={0.09 * (hp + 1)} height={0.12} fill={GREEN} />}
          </g>
        );
      })}
    </g>
  );
}

function CoreGradient() {
  return (
    <defs>
      <radialGradient id="ctdCore">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="45%" stopColor={CYAN} />
        <stop offset="100%" stopColor="rgba(62,240,255,0)" />
      </radialGradient>
    </defs>
  );
}

/** feste Vorschau */
function MapPreview({ m, width, height, labels = false }: { m: MapInfo & { rocks: Rock[]; legs: LegOut[] }; width: number; height: number; labels?: boolean }) {
  const s = Math.min(width / m.w, height / m.h);
  return (
    <svg width={m.w * s} height={m.h * s} viewBox={`0 0 ${m.w} ${m.h}`} style={{ display: 'block', borderRadius: 4, border: `1px solid ${LINE}` }} aria-hidden="true">
      <CoreGradient />
      <MapLayer map={m} rocks={m.rocks} legs={m.legs} labels={labels} />
    </svg>
  );
}

/** Karte am Handy: zoomen mit zwei Fingern, schieben, antippen, Entwurf ziehen */
function MapView(props: LayerProps & { height: number; onTap: (x: number, y: number) => void; onDrag?: (x: number, y: number) => void; fitLabel: string; corner?: ReactNode }) {
  const { map, height, onTap, onDrag, fitLabel, draft, corner } = props;
  const box = useRef<HTMLDivElement>(null);
  const [wd, setWd] = useState(360);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWd(el.clientWidth));
    ro.observe(el);
    setWd(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const fit = Math.min(wd / map.w, height / map.h);
  const home = { s: fit, tx: (wd - map.w * fit) / 2, ty: (height - map.h * fit) / 2 };
  const [tf, setTf] = useState<{ s: number; tx: number; ty: number } | null>(null);
  const cur = tf ?? home;
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const gest = useRef<{ tf: typeof cur; p0: Map<number, { x: number; y: number }>; moved: boolean; multi: boolean; drag: boolean } | null>(null);
  const local = (e: RPointerEvent) => { const r = box.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const toMap = (p: { x: number; y: number }) => ({ x: (p.x - cur.tx) / cur.s, y: (p.y - cur.ty) / cur.s });
  const clamp = (t: typeof cur) => {
    const s = Math.max(fit, Math.min(fit * 8, t.s));
    const mw = map.w * s, mh = map.h * s;
    const tx = mw <= wd ? (wd - mw) / 2 : Math.min(40, Math.max(wd - mw - 40, t.tx));
    const ty = mh <= height ? (height - mh) / 2 : Math.min(40, Math.max(height - mh - 40, t.ty));
    return { s, tx, ty };
  };
  return (
    <div ref={box} style={{ position: 'relative', width: '100%', height, overflow: 'hidden', borderRadius: 10, border: `1px solid ${LINE}`, background: '#0A0F28', touchAction: 'none', userSelect: 'none' }}
      onPointerDown={(e) => {
        (e.target as Element).setPointerCapture?.(e.pointerId);
        const p = local(e);
        pts.current.set(e.pointerId, p);
        let drag = false;
        if (draft && onDrag && pts.current.size === 1) {
          const m = toMap(p), n = sizeOf(draft.kind);
          drag = m.x >= draft.x - 0.7 && m.x <= draft.x + n + 0.7 && m.y >= draft.y - 0.7 && m.y <= draft.y + n + 0.7;
        }
        gest.current = { tf: cur, p0: new Map(pts.current), moved: pts.current.size > 1, multi: pts.current.size > 1 || !!gest.current?.multi, drag };
      }}
      onPointerMove={(e) => {
        if (!pts.current.has(e.pointerId) || !gest.current) return;
        const p = local(e);
        pts.current.set(e.pointerId, p);
        const g = gest.current;
        const ids = [...pts.current.keys()];
        if (g.drag && ids.length === 1) { g.moved = true; const m = toMap(p); onDrag!(m.x, m.y); return; }
        if (ids.length >= 2 && g.p0.size >= 2) {
          const [a, b] = ids, a0 = g.p0.get(a), b0 = g.p0.get(b);
          if (!a0 || !b0) return;
          const a1 = pts.current.get(a)!, b1 = pts.current.get(b)!;
          const ratio = Math.hypot(b1.x - a1.x, b1.y - a1.y) / Math.max(1, Math.hypot(b0.x - a0.x, b0.y - a0.y));
          const m0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 }, m1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
          const s = Math.max(fit, Math.min(fit * 8, g.tf.s * ratio)), k = s / g.tf.s;
          g.moved = true;
          setTf(clamp({ s, tx: m1.x - (m0.x - g.tf.tx) * k, ty: m1.y - (m0.y - g.tf.ty) * k }));
        } else if (ids.length === 1) {
          const p0 = g.p0.get(ids[0]);
          if (!p0) return;
          if (Math.hypot(p.x - p0.x, p.y - p0.y) > 8) g.moved = true;
          if (g.moved) setTf(clamp({ s: g.tf.s, tx: g.tf.tx + p.x - p0.x, ty: g.tf.ty + p.y - p0.y }));
        }
      }}
      onPointerUp={(e) => {
        const g = gest.current;
        const p = pts.current.get(e.pointerId);
        pts.current.delete(e.pointerId);
        if (g && p && !g.moved && !g.multi && pts.current.size === 0) { const m = toMap(p); onTap(m.x, m.y); }
        if (pts.current.size === 0) gest.current = null;
        else gest.current = { tf: cur, p0: new Map(pts.current), moved: true, multi: true, drag: false };
      }}
      onPointerCancel={(e) => { pts.current.delete(e.pointerId); if (!pts.current.size) gest.current = null; }}
    >
      <svg width={wd} height={height} style={{ display: 'block' }} aria-label="Karte">
        <CoreGradient />
        <g transform={`translate(${cur.tx},${cur.ty}) scale(${cur.s})`}>
          <defs>
            <pattern id="ctdGrid" width={1} height={1} patternUnits="userSpaceOnUse"><path d="M1 0 L0 0 0 1" fill="none" stroke="rgba(255,255,255,.06)" strokeWidth={0.04} /></pattern>
          </defs>
          <MapLayer {...props} />
          <rect x={0} y={0} width={map.w} height={map.h} fill="url(#ctdGrid)" pointerEvents="none" />
        </g>
      </svg>
      {corner && <div style={{ position: 'absolute', right: 6, top: 6 }} onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>{corner}</div>}
      {tf && tf.s > fit * 1.01 && (
        <button aria-label={fitLabel} onClick={() => setTf(null)} onPointerDown={(e) => e.stopPropagation()} style={{ position: 'absolute', right: 8, bottom: 8, width: 44, height: 44, borderRadius: 10, background: 'rgba(6,9,24,.85)', border: `1px solid ${LINE}`, color: TEXT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
        </button>
      )}
    </div>
  );
}

/* ================= TV ================= */

const panel: CSSProperties = { background: PANEL, border: `1px solid ${LINE}`, borderRadius: 14 };
const label: CSSProperties = { fontSize: 12, fontWeight: 700, letterSpacing: 1, color: DIM, textTransform: 'uppercase' };

function Stage({ children }: { children: ReactNode }) {
  return (
    <div style={{ position: 'absolute', inset: 0, boxSizing: 'border-box', padding: '22px 32px', background: `radial-gradient(circle at 80% 10%, #1a1446 0%, ${BG} 55%)`, color: TEXT, fontFamily: 'Inter, var(--font), sans-serif', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {children}
    </div>
  );
}

function Title({ text }: { text: string }) {
  return <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 28, letterSpacing: 1, color: CYAN, textShadow: '0 0 14px rgba(62,240,255,.6)' }}>{text}</div>;
}

function Chip({ text, f }: { text: string; f: number }) {
  const c = priceColor(f);
  return <span style={{ padding: '2px 7px', borderRadius: 6, background: '#141A3A', border: `1px solid ${c}`, color: c, fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap' }}>{text}</span>;
}

function WaveRow({ sl, t, size = 12 }: { sl: string[]; t: Translate; size?: number }) {
  return (
    <span style={{ fontSize: size }}>
      {sl.map((x, j) => <span key={x}>{j > 0 && '+'}<b style={{ color: mColor(x), fontWeight: 600 }}>{t('m.' + x)}</b></span>)}
    </span>
  );
}

function MapFacts({ m, t, size = 13 }: { m: any; t: Translate; size?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: size, color: MUTED }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '3px 10px' }}>
        <div>{t('vote.cps')} <b style={{ color: TEXT }}>{m.cps.length}</b></div>
        <div>{t('vote.limit')} <b style={{ color: TEXT }}>{m.limit}</b></div>
        <div>{t('vote.money')} <b style={{ color: priceColor(1 / m.moneyF) }}>{CR}{m.money}</b></div>
        <div>{t('vote.blast')} <b style={{ color: priceColor(m.blast.f) }}>{CR}{m.blast.p}</b></div>
        <div>{t('vote.depot')} <b style={{ color: priceColor(m.depot.f) }}>{CR}{m.depot.p}</b></div>
        <div>{t('vote.coins')} <b style={{ color: YELLOW }}>{m.coins.length ? m.coins.map((c: Coin) => '×' + String(c.m).replace('.', ',')).join(' ') : '–'}</b></div>
      </div>
      <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ color: DIM }}>{t('vote.cheap')}</span>
        {m.cheap.map((x: any) => <Chip key={x.t} text={`${t('t.' + x.t)} ${x.p}`} f={x.f} />)}
      </div>
      <div style={{ lineHeight: 1.35 }}>
        <span style={{ color: DIM }}>{t('vote.waves')} </span>
        {m.rot.map((sl: string[], k: number) => <span key={k}>{k > 0 && <span style={{ color: DIM }}> › </span>}<WaveRow sl={sl} t={t} size={size} /></span>)}
      </div>
    </div>
  );
}

function HostVote({ view, t, player }: HostViewProps) {
  const counts: Record<number, string[]> = view.votes ?? {};
  const most = Math.max(0, ...Object.values(counts).map((v) => v.length));
  const rnd = counts[3] ?? [];
  return (
    <Stage>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 18 }}>
          <Title text={t('vote.title')} />
          <span style={{ fontSize: 15, color: MUTED }}>{t('vote.hint')}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 15, color: MUTED }}>{t('vote.random')}: <b style={{ color: TEXT }}>{rnd.length}</b></span>
          <HostTimer deadline={view.deadline} duration={view.duration} size={56} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16, flex: 1, minHeight: 0 }}>
        {view.maps.map((m: any, i: number) => {
          const vs = counts[i] ?? [];
          const lead = vs.length > 0 && vs.length === most;
          return (
            <div key={i} style={{ ...panel, border: `2px solid ${lead ? CYAN : LINE}`, boxShadow: lead ? '0 0 18px rgba(62,240,255,.35)' : 'none', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 22 }}>{t('vote.map', { l: 'ABC'[i] })} <span style={{ fontFamily: 'inherit', fontWeight: 600, fontSize: 14, color: MUTED }}>{t('vote.size', { w: m.w, h: m.h })}</span></div>
                <div style={{ display: 'flex', gap: 3 }}>{vs.map((id) => <span key={id} style={{ width: 14, height: 14, borderRadius: 3, background: player(id)?.color ?? CYAN }} />)}</div>
              </div>
              <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0A0F28', borderRadius: 8 }}>
                <MapPreview m={m} width={366} height={292} labels />
              </div>
              <MapFacts m={m} t={t} />
            </div>
          );
        })}
      </div>
    </Stage>
  );
}

function HostGame({ view, t, player }: HostViewProps) {
  const rows: any[] = view.rows;
  const left = rows.filter((r) => !r.out).length;
  const now = useServerNow(500);
  const big = rows.length > 12;
  const rowH = big ? 31 : 38;
  const cols = '44px minmax(0,1fr) 72px 72px 210px 96px';
  return (
    <Stage>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Title text="CHAOTIC TOWER DEFENSE" />
        <div style={{ fontSize: 15, color: MUTED }}>{t('game.map', { w: view.map.w, h: view.map.h, c: view.map.cps, l: view.map.maxLimit })} · {t('game.left', { n: left, m: rows.length })}</div>
      </div>
      <div style={{ display: 'flex', gap: 20, flex: 1, minHeight: 0 }}>
        <div style={{ ...panel, flex: 1, padding: '12px 16px', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 10, ...label, padding: '0 6px 8px', borderBottom: `1px solid ${LINE}` }}>
            <div>{t('game.place')}</div><div>{t('game.player')}</div><div style={{ textAlign: 'right' }}>{t('game.kills')}</div>
            <div style={{ textAlign: 'right' }}>{view.stage === 'wave' ? t('game.wk') : t('game.wkLast')}</div><div>{t('game.lives')}</div>
            <div style={{ textAlign: 'right' }}>{t('game.runShort')}</div>
          </div>
          {rows.map((r, i) => {
            const p = player(r.id);
            const lifeC = r.out ? '#59608A' : r.lives > 50 ? CYAN : r.lives >= 20 ? YELLOW : RED;
            const tag = i === 0 && !r.out ? t('game.leads') : r.out ? t('game.outLabel') : r.lives < 10 ? t('game.danger') : '';
            return (
              <div key={r.id} style={{ display: 'grid', gridTemplateColumns: cols, gap: 10, alignItems: 'center', height: rowH, padding: '0 6px', fontSize: big ? 16 : 19, borderBottom: '1px solid rgba(42,52,112,.5)', opacity: r.out ? 0.45 : 1 }}>
                <div style={{ fontFamily: DISPLAY, fontWeight: 800, color: i === 0 ? YELLOW : DIM }}>{i + 1}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <span style={{ width: 14, height: 14, borderRadius: 4, flex: 'none', background: p?.color ?? CYAN, boxShadow: `0 0 8px ${p?.color ?? CYAN}` }} />
                  <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p?.name ?? '?'}</span>
                  <span style={{ fontSize: 12, color: DIM, whiteSpace: 'nowrap' }}>{tag}</span>
                  {view.stage === 'build' && !r.out && r.ready && <span style={{ fontSize: 12, color: GREEN, fontWeight: 700 }}>✓</span>}
                </div>
                <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{r.kills}</div>
                <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: r.top ? YELLOW : '#C5CBEA' }}>{r.out ? '–' : r.wk}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, height: 10, borderRadius: 5, background: '#1B2250', overflow: 'hidden' }}><div style={{ height: '100%', width: `${(Math.min(150, r.lives) / 150) * 100}%`, background: lifeC, borderRadius: 5, transition: 'width .4s' }} /></div>
                  <div style={{ width: 44, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: lifeC }}>{r.out ? t('game.out') : r.lives}</div>
                </div>
                <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: view.longest?.id === r.id ? CYAN : '#C5CBEA' }}>{r.out ? '–' : fmtTime(r.run)}</div>
              </div>
            );
          })}
          <div style={{ marginTop: 'auto', paddingTop: 8, fontSize: 13, color: DIM, textAlign: 'right' }}>{t('game.rule')}</div>
        </div>
        <div style={{ width: 400, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
          <div style={{ ...panel, border: `1px solid ${view.stage === 'wave' ? CYAN : YELLOW}`, padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ ...label, color: view.stage === 'wave' ? CYAN : YELLOW }}>{view.stage === 'wave' ? t('game.current') : t('game.build')}</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: MUTED }}>{view.stage === 'wave' ? t('game.running', { n: view.doneCount, m: view.active }) : t('game.ready', { n: view.ready, m: view.active })}</div>
            </div>
            {view.stage === 'build' && view.deadline > 0 && <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 28, color: YELLOW }}>{fmtTime(Math.max(0, Math.ceil((view.deadline - now) / 1000)))}</div>}
          </div>
          {view.rot.map((w: any, k: number) => {
            const isCur = view.stage === 'wave' && k === 0;
            const isNext = view.stage === 'wave' ? k === 1 : k === 0;
            const c = isCur ? CYAN : isNext ? YELLOW : LINE;
            return (
              <div key={w.n} style={{ ...panel, flex: 1, minHeight: 0, maxHeight: 120, border: `${isCur || isNext ? 2 : 1}px solid ${c}`, boxShadow: isCur ? '0 0 16px rgba(62,240,255,.3)' : 'none', padding: '6px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2, opacity: isCur || isNext ? 1 : 0.85 }}>
                <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 15, color: isCur ? CYAN : isNext ? YELLOW : MUTED }}>{t('game.wave', { n: w.n })}{isCur ? ` · ${t('game.now')}` : isNext ? ` · ${t('game.nextShort')}` : ''}</div>
                {w.types.map((x: any) => (
                  <div key={x.t} style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: 16, fontWeight: 700, color: mColor(x.t) }}>{x.n}× {t('m.' + x.t)}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#FF6B8A' }}>♥ {x.hp}</span>
                    </div>
                    <span style={{ fontSize: 12, color: MUTED, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t('m.' + x.t + '.d')}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </Stage>
  );
}

function HostFinal({ view, t, player }: HostViewProps) {
  const rows: any[] = view.rows;
  return (
    <Stage>
      <Confetti />
      <Title text={t('final.winner', { name: player(rows[0]?.id)?.name ?? '?' })} />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Podium ranking={rows.map((r) => ({ playerId: r.id, score: r.kills }))} player={player} pointsLabel={t('game.kills')} />
      </div>
    </Stage>
  );
}

function Host(props: HostViewProps) {
  switch (props.view.screen) {
    case 'vote': return <HostVote {...props} />;
    case 'game': return <HostGame {...props} />;
    case 'final': return <HostFinal {...props} />;
    default: return null;
  }
}

/* ================= Handy ================= */

const btn: CSSProperties = { borderRadius: 12, background: '#141A3A', border: `1px solid ${LINE}`, color: TEXT, fontFamily: 'inherit', cursor: 'pointer' };
const dis = (ok: boolean): CSSProperties => (ok ? {} : { opacity: 0.4, filter: 'grayscale(0.8)' });

function PhoneVote({ view, t, send }: ControllerViewProps) {
  const [open, setOpen] = useState<number | null>(null);
  if (open !== null) {
    const m = view.maps[open];
    const mine = view.mine === open;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, color: TEXT }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 40 }}>
          <button aria-label={t('p.back')} onClick={() => setOpen(null)} style={{ ...btn, width: 44, height: 44, fontSize: 20 }}>‹</button>
          <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 22 }}>{t('vote.map', { l: m.letter })} <span style={{ fontSize: 13, color: MUTED, fontFamily: 'inherit' }}>{t('vote.size', { w: m.w, h: m.h })}</span></div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', background: '#0A0F28', borderRadius: 10, padding: 6 }}>
          <MapPreview m={m} width={340} height={340} labels />
        </div>
        <MapFacts m={m} t={t} size={13} />
        <button onClick={() => { send({ type: 'vote', map: open }); setOpen(null); }} style={{ ...btn, height: 54, fontSize: 17, fontWeight: 800, background: mine ? GREEN : CYAN, color: BG, border: 'none' }}>{mine ? t('vote.yours') : t('vote.confirm')}</button>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, color: TEXT }}>
      <PhoneTimer deadline={view.deadline} duration={view.duration} />
      <h2 style={{ fontFamily: DISPLAY, fontSize: 24, fontWeight: 800, margin: 0, paddingLeft: 40 }}>{t('vote.pick')}</h2>
      {view.maps.map((m: any, i: number) => {
        const mine = view.mine === i;
        return (
          <button key={i} onClick={() => setOpen(i)} style={{ ...btn, display: 'flex', alignItems: 'center', gap: 12, padding: 10, border: `2px solid ${mine ? CYAN : LINE}`, background: mine ? 'rgba(62,240,255,.12)' : '#141A3A', textAlign: 'left' }}>
            <div style={{ width: 120, height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><MapPreview m={m} width={120} height={80} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 20, color: mine ? CYAN : TEXT }}>{t('vote.map', { l: m.letter })}</div>
              <div style={{ fontSize: 12, color: MUTED }}>{t('vote.size', { w: m.w, h: m.h })} · {m.cps.length} {t('vote.cps')}</div>
              <div style={{ fontSize: 12, color: DIM }}>{t('vote.votes', { n: m.votes })}{mine ? ` · ${t('vote.yours')}` : ''}</div>
            </div>
            <span style={{ fontSize: 22, color: DIM }}>›</span>
          </button>
        );
      })}
      <button onClick={() => send({ type: 'vote', map: 3 })} style={{ ...btn, height: 54, fontSize: 15, fontWeight: 700, border: `2px solid ${view.mine === 3 ? CYAN : LINE}`, background: view.mine === 3 ? 'rgba(62,240,255,.12)' : '#141A3A' }}>
        {t('vote.randomPick')} · {t('vote.votes', { n: view.random })}
      </button>
    </div>
  );
}

function Sheet({ children, onClose, closeLabel }: { children: ReactNode; onClose: () => void; closeLabel: string }) {
  return (
    <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 20, background: '#141A3A', borderTop: `2px solid ${CYAN}`, borderRadius: '16px 16px 0 0', padding: '12px 14px 18px', display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '70vh', overflowY: 'auto', color: TEXT, boxShadow: '0 -10px 30px rgba(0,0,0,.6)' }}>
      <button aria-label={closeLabel} onClick={onClose} style={{ ...btn, position: 'absolute', right: 10, top: 10, width: 44, height: 44, fontSize: 20, background: 'transparent' }}>×</button>
      {children}
    </div>
  );
}

function BuildingSheet({ view, t, send, sel, onClose }: { view: any; t: Translate; send: (a: any) => void; sel: number | string; onClose: () => void }) {
  const now = useServerNow(500);
  const pr = view.prices as Record<string, [number, number]>;
  const money: number = view.money;
  const live = view.stage === 'wave';
  const pending: PendingOut[] = view.pending;
  const can = (p: number) => money >= p;
  if (typeof sel === 'string') {
    const [x, y] = sel.slice(5).split(',').map(Number);
    const pi = pending.findIndex((p) => p.k === 'blast' && p.x === x && p.y === y);
    return (
      <Sheet onClose={onClose} closeLabel={t('p.close')}>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 20 }}>{t('k.rock')}</div>
        {pi >= 0 ? (
          <button onClick={() => { send({ type: 'cancel', i: pi }); onClose(); }} style={{ ...btn, height: 52, fontSize: 15, fontWeight: 700, border: `1px solid ${YELLOW}`, color: YELLOW }}>{t('p.cancelPending')}</button>
        ) : (
          <button disabled={!can(pr.blast[0])} onClick={() => { send({ type: 'blast', x, y }); onClose(); }} style={{ ...btn, height: 52, fontSize: 16, fontWeight: 700, ...dis(can(pr.blast[0])) }}>
            {live ? t('p.blastLater') : t('p.blast')} · <b style={{ color: priceColor(pr.blast[1]) }}>{CR}{pr.blast[0]}</b>
          </button>
        )}
      </Sheet>
    );
  }
  if (sel < 0) {
    const i = -1 - sel;
    return (
      <Sheet onClose={onClose} closeLabel={t('p.close')}>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 20, color: YELLOW }}>{t('p.pendingTitle')}</div>
        <div style={{ fontSize: 13, color: MUTED }}>{t('p.pendingInfo')}</div>
        <button onClick={() => { send({ type: 'cancel', i }); onClose(); }} style={{ ...btn, height: 52, fontSize: 15, fontWeight: 700, border: `1px solid ${YELLOW}`, color: YELLOW }}>{t('p.cancelPending')}</button>
      </Sheet>
    );
  }
  const b = (view.me as BoardOut).bs.find((x) => x[0] === sel);
  if (!b) return null;
  const [id, kind, , , type, level, dmgN, spdN] = b;
  const refund = view.refunds[id] as [number, number] | undefined;
  const up = view.ups?.[id] as [number, number, number | null, number | null] | undefined;
  const fullLeft = refund ? Math.max(0, Math.ceil((refund[1] - now) / 1000)) : 0;
  const sellPending = pending.findIndex((p) => p.k === 'sell' && p.id === id);
  const name = kind === 0 ? t('k.wall') : kind === 2 ? t('k.depot') : t('t.' + type);
  return (
    <Sheet onClose={onClose} closeLabel={t('p.close')}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingRight: 50 }}>
        {kind === 1 && <span style={{ width: 34, height: 34, borderRadius: '50%', border: `3px solid ${TOWER_COLOR[type]}`, color: TOWER_COLOR[type], fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' }}>{type === 'T' ? '•' : type}</span>}
        <div>
          <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 20 }}>{name}</div>
          <div style={{ fontSize: 12, color: MUTED }}>{kind === 1 ? (type === 'T' ? t('t.T.d') : `${t('t.' + type + '.d')} · ${t('p.level', { n: level })}`) : kind === 2 ? t('p.limitInfo', { n: view.maxLimit }) : ''}</div>
        </div>
      </div>
      {kind === 1 && type === 'T' && (
        <>
          <div style={{ ...label, fontSize: 11 }}>{t('p.upgradeTo')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 6 }}>
            {TYPES.map((ty) => {
              const [p, f] = pr['up_' + ty];
              return (
                <button key={ty} disabled={!can(p)} onClick={() => send({ type: 'upgrade', id, to: ty })} style={{ ...btn, height: 52, display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px', background: '#0E1430', textAlign: 'left', ...dis(can(p)) }}>
                  <span style={{ flex: 'none', width: 24, height: 24, borderRadius: '50%', border: `2px solid ${TOWER_COLOR[ty]}`, color: TOWER_COLOR[ty], fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' }}>{ty}</span>
                  <span style={{ flex: 1, display: 'flex', flexDirection: 'column', lineHeight: 1.15, minWidth: 0 }}><span style={{ fontSize: 13, fontWeight: 700 }}>{t('t.' + ty)}</span><span style={{ fontSize: 10, color: DIM }}>{t('t.' + ty + '.d')}</span></span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: priceColor(f) }}>{p}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
      {kind === 1 && type !== 'T' && (level < 3 ? (() => {
        const [p, f] = pr[`lv${level + 1}_${type}`];
        return (
          <button disabled={!can(p)} onClick={() => send({ type: 'upgrade', id })} style={{ ...btn, height: 52, background: CYAN, color: BG, fontSize: 16, fontWeight: 700, border: 'none', ...dis(can(p)) }}>
            {t('p.levelUp', { n: level + 1 })} · <span style={{ background: BG, color: priceColor(f), padding: '2px 8px', borderRadius: 6 }}>{CR}{p}</span>
          </button>
        );
      })() : <div style={{ fontSize: 13, color: MUTED }}>{t('p.maxLevel')}</div>)}
      {up && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 6 }}>
          <button disabled={!can(up[0])} onClick={() => send({ type: 'towerUp', id, what: 'dmg' })} style={{ ...btn, minHeight: 52, background: '#0E1430', fontSize: 13, ...dis(can(up[0])) }}>
            <b>{t('p.dmg')}</b> · <b style={{ color: priceColor(up[1]) }}>{up[0]}</b>
            <div style={{ fontSize: 10, color: DIM }}>{t('p.dmgInfo', { n: dmgN, p: Math.round(dmgN * 25) })}</div>
          </button>
          <button disabled={up[2] === null || !can(up[2])} onClick={() => send({ type: 'towerUp', id, what: 'spd' })} style={{ ...btn, minHeight: 52, background: '#0E1430', fontSize: 13, ...dis(up[2] !== null && can(up[2])) }}>
            <b>{t('p.spd')}</b>{up[2] !== null && <> · <b style={{ color: priceColor(up[3]!) }}>{up[2]}</b></>}
            <div style={{ fontSize: 10, color: DIM }}>{t('p.spdInfo', { n: spdN })}</div>
          </button>
        </div>
      )}
      {sellPending >= 0 ? (
        <button onClick={() => send({ type: 'cancel', i: sellPending })} style={{ ...btn, height: 46, fontSize: 14, fontWeight: 700, border: `1px solid ${YELLOW}`, color: YELLOW }}>{t('p.cancelSell')}</button>
      ) : refund && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <button onClick={() => { send({ type: 'sell', id }); onClose(); }} style={{ ...btn, height: 46, background: 'transparent', border: `1px solid ${RED}`, color: '#FF8080', fontSize: 14, fontWeight: 700 }}>{live ? t('p.sellLater') : t('p.sell', { n: refund[0] })}</button>
          {fullLeft > 0 && !live && <div style={{ fontSize: 11, color: MUTED }}>{t('p.full', { s: fullLeft })}</div>}
        </div>
      )}
    </Sheet>
  );
}

function SettingsMenu({ view, t, send, player, onClose, zones, setZones }: { view: any; t: Translate; send: (a: any) => void; player: (id: string) => PlayerInfo | undefined; onClose: () => void; zones: boolean; setZones: (v: boolean) => void }) {
  const on = new Set<string>(view.shareTo);
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 30, background: BG, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', color: TEXT }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 40 }}>
        <button aria-label={t('p.back')} onClick={onClose} style={{ ...btn, width: 44, height: 44, fontSize: 20 }}>‹</button>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 20 }}>{t('p.settings')}</div>
      </div>
      <button onClick={() => setZones(!zones)} style={{ ...btn, minHeight: 50, display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px' }}>
        <span style={{ flex: 1, textAlign: 'left', fontSize: 15, fontWeight: 600 }}>{t('p.showZones')}</span>
        <span style={{ width: 46, height: 26, borderRadius: 13, background: zones ? CYAN : '#2A3470', position: 'relative' }}><span style={{ position: 'absolute', top: 3, left: zones ? 23 : 3, width: 20, height: 20, borderRadius: 10, background: zones ? BG : TEXT }} /></span>
      </button>
      <div style={{ marginTop: 6 }}>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 17 }}>{t('p.shareTitle')}</div>
        <div style={{ fontSize: 12, color: MUTED }}>{t('p.shareHint')}</div>
      </div>
      {view.others.map((o: { id: string; out: boolean }) => {
        const p = player(o.id);
        const sel = on.has(o.id);
        return (
          <button key={o.id} onClick={() => send({ type: 'share', id: o.id, on: !sel })} style={{ ...btn, minHeight: 46, display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', background: sel ? 'rgba(62,240,255,.1)' : '#141A3A', border: `1px solid ${sel ? CYAN : LINE}`, opacity: o.out ? 0.45 : 1 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: p?.color ?? CYAN }} />
            <span style={{ flex: 1, textAlign: 'left', fontSize: 15, fontWeight: 600 }}>{p?.name ?? '?'}</span>
            <span style={{ fontSize: 11, color: DIM }}>{o.out ? t('game.outLabel') : sel ? t('p.watching') : ''}</span>
            <span style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${sel ? CYAN : '#59608A'}`, background: sel ? CYAN : 'transparent', boxSizing: 'border-box' }} />
          </button>
        );
      })}
    </div>
  );
}

function useZonesSetting(): [boolean, (v: boolean) => void] {
  const [v, setV] = useState(() => { try { return localStorage.getItem('ctd:zones') !== '0'; } catch { return true; } });
  return [v, (x: boolean) => { setV(x); try { localStorage.setItem('ctd:zones', x ? '1' : '0'); } catch { /* egal */ } }];
}

function PlayScreen({ view, t, send, player }: ControllerViewProps) {
  const frame = useStream<{ k: number; b: number[][] }>();
  const [tool, setTool] = useState<Kind | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [sel, setSel] = useState<number | string | null>(null);
  const [menu, setMenu] = useState(false);
  const [stats, setStats] = useState(false);
  const [zones, setZones] = useZonesSetting();
  const canAct = !view.out;
  const live = view.stage === 'wave';
  const watching: BoardOut & { id?: string } = view.watch ?? view.me;
  const ownView = !view.watch;
  const map: MapInfo = view.map;
  const me: BoardOut = view.me;
  const pr = view.prices as Record<string, [number, number]>;
  const money: number = view.money;
  const pending: PendingOut[] = view.pending ?? [];
  const monsters = frame?.k === view.wave || frame?.k === view.wave - 1 ? frame?.b?.[watching.idx] : undefined;
  useEffect(() => { if (view.out) { setTool(null); setDraft(null); } }, [view.out]);

  // Zustand inklusive Vormerkungen: belegte Rechtecke
  const plannedRects = useMemo(() => {
    const sold = new Set(pending.filter((p) => p.k === 'sell').map((p) => (p as { id: number }).id));
    const blasted = new Set(pending.filter((p) => p.k === 'blast').map((p) => `${(p as any).x},${(p as any).y}`));
    const rects: Rock[] = [];
    for (const b of me.bs) if (!sold.has(b[0])) { const n = b[1] === 0 ? 1 : 2; rects.push([b[2], b[3], n, n]); }
    for (const r of me.rocks) if (!blasted.has(`${r[0]},${r[1]}`)) rects.push(r);
    for (const p of pending) if (p.k === 'build') { const n = sizeOf(p.kind); rects.push([p.x, p.y, n, n]); }
    return rects;
  }, [me, pending]);
  const draftInfo = useMemo(() => {
    if (!draft) return null;
    const problem = placeProblem(map, plannedRects, draft.kind, draft.x, draft.y);
    if (problem) return { problem, legs: null as LegOut[] | null };
    const n = sizeOf(draft.kind);
    const legs = legsToOut(routeFor(map, [...plannedRects, [draft.x, draft.y, n, n]]));
    return { problem: legs ? null : 'blocks', legs };
  }, [draft, plannedRects, map]);
  const pendingPlan: LegOut[] | null = view.plan ?? null;
  // Linien: in der Bauphase zeigt der Entwurf die neue rote Linie, während der Welle gilt gelb für Vorgemerktes
  let redLegs: LegOut[] = watching.legs;
  let yellow: LegOut[] | null = null;
  if (ownView) {
    if (live) yellow = draftInfo?.legs ?? pendingPlan;
    else if (draftInfo?.legs) redLegs = draftInfo.legs;
  }
  const placeAt = (x: number, y: number, kind: Kind) => {
    const n = sizeOf(kind);
    const bx = Math.max(0, Math.min(map.w - n, n === 1 ? Math.floor(x) : Math.round(x) - 1));
    const by = Math.max(0, Math.min(map.h - n, n === 1 ? Math.floor(y) : Math.round(y) - 1));
    setDraft({ kind, x: bx, y: by });
  };
  const onTap = (x: number, y: number) => {
    if (!ownView || !canAct) return;
    const cx = Math.floor(x), cy = Math.floor(y);
    // im Baumodus: tippt man auf etwas Bestehendes, wird es ganz normal ausgewählt
    const hitsSomething = pending.some((p) => p.k === 'build' && cx >= p.x && cx < p.x + sizeOf(p.kind) && cy >= p.y && cy < p.y + sizeOf(p.kind))
      || me.bs.some(([, kind, bx, by]) => { const n = kind === 0 ? 1 : 2; return cx >= bx && cx < bx + n && cy >= by && cy < by + n; })
      || me.rocks.some(([rx, ry, rw, rh]) => cx >= rx && cx < rx + rw && cy >= ry && cy < ry + rh);
    if (tool && !hitsSomething) { placeAt(x, y, tool); return; }
    if (tool) { setTool(null); setDraft(null); }
    const pi = pending.findIndex((p) => p.k === 'build' && cx >= p.x && cx < p.x + sizeOf(p.kind) && cy >= p.y && cy < p.y + sizeOf(p.kind));
    if (pi >= 0) return setSel(-1 - pi);
    const b = me.bs.find(([, kind, bx, by]) => { const n = kind === 0 ? 1 : 2; return cx >= bx && cx < bx + n && cy >= by && cy < by + n; });
    if (b) return setSel(b[0]);
    const r = me.rocks.find(([rx, ry, rw, rh]) => cx >= rx && cx < rx + rw && cy >= ry && cy < ry + rh);
    setSel(r ? `rock:${r[0]},${r[1]}` : null);
  };
  const confirm = () => {
    if (!draft || draftInfo?.problem) return;
    send({ type: 'build', kind: draft.kind, x: draft.x, y: draft.y });
    setDraft(null);
  };
  const lifeC = view.lives > 50 ? CYAN : view.lives >= 20 ? YELLOW : RED;
  const toolBtn = (k: Kind, icon: ReactNode, sub: string) => {
    const [p, f] = pr[k];
    const active = tool === k;
    const ok = money >= p;
    return (
      <button key={k} disabled={!canAct} onClick={() => { setSel(null); setDraft(null); setTool(active ? null : k); }} style={{ ...btn, height: 58, border: `2px solid ${active ? CYAN : LINE}`, background: active ? 'rgba(62,240,255,.12)' : '#141A3A', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, ...dis(ok || active) }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{icon}<span style={{ fontSize: 14, fontWeight: 700 }}>{t('k.' + k)}</span></span>
        <span style={{ fontSize: 10, color: DIM }}>{sub} · <b style={{ fontSize: 13, color: priceColor(f) }}>{CR}{p}</b></span>
      </button>
    );
  };
  const err = view.err ? t('err.' + view.err) : '';
  const draftPrice = draft ? pr[draft.kind][0] : 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, color: TEXT, paddingBottom: 8 }}>
      {view.out ? (
        <div style={{ background: '#141A3A', borderRadius: 12, padding: '10px 12px', marginLeft: 40 }}>
          <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 18, color: '#FF8080' }}>{t('p.out')}</div>
          <div style={{ fontSize: 12, color: MUTED }}>{t('p.outInfo', { p: view.place, k: view.kills })}</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr) minmax(0,1fr) 44px', gap: 6, paddingLeft: 40 }}>
          <div style={{ background: '#141A3A', borderRadius: 10, padding: '5px 8px', display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
            <span style={{ fontWeight: 800, fontSize: 20, color: YELLOW }}>{CR}</span>
            <span style={{ fontWeight: 700, fontSize: 18, color: YELLOW }}>{money}</span>
            <span style={{ fontSize: 11, color: GREEN, fontWeight: 700 }}>+{view.income}</span>
          </div>
          <div style={{ background: '#141A3A', borderRadius: 10, padding: '5px 8px', display: 'flex', alignItems: 'baseline', gap: 5 }}>
            <span style={{ color: '#FF6B8A', fontSize: 15 }}>♥</span><span style={{ fontWeight: 700, fontSize: 18, color: lifeC }}>{view.lives}</span>
          </div>
          <div style={{ background: '#141A3A', borderRadius: 10, padding: '5px 8px', display: 'flex', alignItems: 'baseline', gap: 5 }}>
            <span style={{ fontSize: 10, color: DIM }}>{t('p.limitShort')}</span><span style={{ fontWeight: 700, fontSize: 16 }}>{view.used}/{view.limit}</span>
          </div>
          <button aria-label={t('p.settings')} onClick={() => setMenu(true)} style={{ ...btn, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
            {view.shareTo.length > 0 && <span style={{ position: 'absolute', top: 2, right: 2, minWidth: 16, height: 16, borderRadius: 8, background: CYAN, color: BG, fontSize: 10, fontWeight: 800 }}>{view.shareTo.length}</span>}
          </button>
        </div>
      )}
      {view.deadline > 0 && <PhoneTimer deadline={view.deadline} duration={view.duration} />}
      {(view.watchable.length > 0 || view.out) && (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
          {!view.out && <button onClick={() => send({ type: 'watch', id: null })} style={{ ...btn, flex: 'none', height: 36, padding: '0 10px', borderRadius: 18, fontSize: 12, fontWeight: 600, background: ownView ? CYAN : '#141A3A', color: ownView ? BG : TEXT }}>{t('p.mine')}</button>}
          {view.watchable.map((id: string) => {
            const on = view.watch?.id === id;
            return <button key={id} onClick={() => send({ type: 'watch', id })} style={{ ...btn, flex: 'none', height: 36, padding: '0 10px', borderRadius: 18, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, background: on ? CYAN : '#141A3A', color: on ? BG : TEXT }}><span style={{ width: 10, height: 10, borderRadius: 3, background: player(id)?.color ?? CYAN }} />{player(id)?.name}</button>;
          })}
          {view.out && !view.watchable.length && <span style={{ fontSize: 12, color: DIM }}>{t('p.noWatch')}</span>}
        </div>
      )}
      {(view.coinGain > 0 || view.bonus > 0) && ownView && (
        <div style={{ fontSize: 12, color: YELLOW, fontWeight: 700 }}>
          {view.coinGain > 0 && t('p.coinGain', { n: view.coinGain })}{view.coinGain > 0 && view.bonus > 0 && ' · '}{view.bonus > 0 && t('p.bonus', { n: view.bonus })}
        </div>
      )}
      <MapView map={map} rocks={watching.rocks} legs={redLegs} plan={yellow} bs={watching.bs} monsters={monsters} selected={ownView ? sel : null} zones={zones}
        pending={ownView ? pending : undefined} draft={ownView && draft ? { ...draft, bad: !!draftInfo?.problem } : null}
        stats={stats} coinsUsed={watching.cu} nobuild={t('z.nobuild')}
        corner={<button aria-label={t('p.stats')} aria-pressed={stats} onClick={() => setStats(!stats)} style={{ ...btn, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', background: stats ? CYAN : 'rgba(6,9,24,.85)', color: stats ? BG : TEXT }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg></button>}
        height={view.out ? 500 : 470} onTap={onTap} onDrag={(x, y) => draft && placeAt(x, y, draft.kind)} fitLabel={t('p.fit')} />
      {err && <div role="status" style={{ background: 'rgba(255,77,77,.15)', border: `1px solid ${RED}`, borderRadius: 10, padding: '6px 10px', fontSize: 13, color: '#FF9A9A' }}>{err}</div>}
      {!view.out && (
        <>
          {draft ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 12, color: draftInfo?.problem ? '#FF9A9A' : MUTED }}>{draftInfo?.problem ? t('err.' + draftInfo.problem) : live ? t('p.draftLive') : t('p.draftHint')}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)', gap: 6 }}>
                <button disabled={!!draftInfo?.problem || money < draftPrice} onClick={confirm} style={{ ...btn, height: 54, fontSize: 16, fontWeight: 800, background: live ? YELLOW : CYAN, color: BG, border: 'none', ...dis(!draftInfo?.problem && money >= draftPrice) }}>{live ? t('p.queue') : t('p.place')} · {CR}{draftPrice}</button>
                <button onClick={() => setDraft(null)} style={{ ...btn, height: 54, fontSize: 15, fontWeight: 700 }}>{t('p.discard')}</button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 6 }}>
                {toolBtn('wall', <span style={{ width: 12, height: 12, background: '#3B4470', border: '1px solid #6A76B0', borderRadius: 2 }} />, '1 × 1')}
                {toolBtn('tower', <span style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${TEXT}`, boxSizing: 'border-box', background: `radial-gradient(circle, ${TEXT} 0 2px, #0A0F28 3px)` }} />, '2 × 2')}
                {toolBtn('depot', <span style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${CYAN}`, boxSizing: 'border-box' }} />, `+10 · max ${view.maxLimit}`)}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 6 }}>
                <button disabled={money < pr.income[0]} onClick={() => send({ type: 'buy', key: 'income' })} style={{ ...btn, minHeight: 44, border: `1px dashed ${YELLOW}`, fontSize: 12, ...dis(money >= pr.income[0]) }}>{t('p.income')} · <b style={{ color: priceColor(pr.income[1]) }}>{CR}{pr.income[0]}</b></button>
                <button disabled={money < pr.dmgUp[0]} onClick={() => send({ type: 'buy', key: 'dmgUp' })} style={{ ...btn, minHeight: 44, border: '1px dashed #FF7A3D', fontSize: 12, ...dis(money >= pr.dmgUp[0]) }}>{t('p.dmgUp')} · <b style={{ color: priceColor(pr.dmgUp[1]) }}>{CR}{pr.dmgUp[0]}</b>{view.dmgLv > 0 && <span style={{ fontSize: 10, color: DIM }}> (+{view.dmgLv})</span>}</button>
              </div>
              {live ? (
                <div style={{ background: '#141A3A', borderRadius: 12, padding: '10px 12px', fontSize: 13, color: MUTED }}>{view.boost > 1 && <b style={{ color: RED }}>{t('p.boost', { n: view.boost })} · </b>}{t('p.waveRun')}</div>
              ) : (
                <button onClick={() => send({ type: 'ready' })} style={{ ...btn, height: 54, fontSize: 17, fontWeight: 800, background: view.ready ? GREEN : YELLOW, color: BG, border: 'none' }}>{view.ready ? t('p.readyOn') : t('p.ready')}</button>
              )}
              {!live && view.globalStage === 'wave' && <div style={{ fontSize: 12, color: DIM, textAlign: 'center' }}>{t('p.waitWaves')}</div>}
            </>
          )}
        </>
      )}
      {sel !== null && ownView && !view.out && <BuildingSheet view={view} t={t} send={send} sel={sel} onClose={() => setSel(null)} />}
      {menu && <SettingsMenu view={view} t={t} send={send} player={player} onClose={() => setMenu(false)} zones={zones} setZones={setZones} />}
    </div>
  );
}

function Controller(props: ControllerViewProps) {
  const { view, t } = props;
  if (view.screen === 'vote') return <PhoneVote {...props} />;
  if (view.screen === 'play') return <PlayScreen {...props} />;
  if (view.screen === 'final') {
    return <PhoneWait title={view.won ? t('final.won') : t('final.place', { p: view.place, n: view.of })} text={t('final.kills', { k: view.kills })} />;
  }
  return <PhoneWait title={t('title')} />;
}

export default { Host, Controller } satisfies GameClientModule;
