/** Sternenpakt – Ansichten für Fernseher (Sternkarte) und Handy (Kommandopult). */

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { ControllerViewProps, GameClientModule, HostViewProps, Translate } from '@up/sdk';
import { Avatar, Confetti, PhoneWait, sfx, useServerNow, vibrate } from '@up/ui';
import { FLIGHT, PIRATE_RANGE, TECHS, YEAR, buildLinks, findRoute, hopTime, blocked, techCost, type Links, type Nebula, type Tech } from './engine';

/* ---------- Farben ---------- */

const BG = '#070b1a';
const INK = '#e8ecff';
const MUTED = '#9AA3C4';
const FAINT = '#6c769c';
const NEUTRAL = '#7C86A8';
const CYAN = '#3DF5FF';
const LINE = '#26305a';
const PANEL = '#0d1430';
const CARD = '#121a3d';
const KIND_COLOR = { eco: '#FFD23F', ind: '#FF8A5B', sci: '#A98BFF' } as const;
const DISPLAY = "var(--display)";
const HEART = '#FF4FD8';
const SP_COLOR: Record<string, string> = { gold: '#FFD23F', yard: '#FF8A5B', lab: '#A98BFF', fort: '#E8ECFF', heart: HEART };
const WH_COLORS = ['#6BFFE0', '#FF9BF0'];

/* ---------- Typen der Ansichten ---------- */

/** [x, y, Name, Heimat von, besonderer Stern] */
type MapEntry = [number, number, string, number, string];
type Emp = { id: string; n: string; c: string; ai: boolean; p: boolean; o: boolean };
type StarDyn = [number, number | string];
/** [id, Besitzer, Schiffe, x0, y0, Ziel, t0, t1, getarnt(eigene), weitere Stationen (eigene), Wurmloch] */
type FleetT = [number, number, number | string, number, number, number, number, number, number, number[] | 0, number];
/** [id, Besitzer, Schiffe, x, y] */
type ParkT = [number, number, number | string, number, number];
type Clock = { sim: number; at: number; speed: number };
type Fx = { id: number; star: number; k: string; at: number };

interface MapData {
  map: MapEntry[];
  neb?: [number, number, number][];
  wh?: [number, number][];
  emp: Emp[];
  st: StarDyn[];
  fl?: FleetT[];
  pk?: ParkT[];
  fx?: Fx[];
}

const ownerColor = (emp: Emp[], o: number) => (o >= 0 ? emp[o]?.c ?? NEUTRAL : NEUTRAL);
const fmt = (sec: number) => {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const d2 = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
const starName = (map: MapEntry[], i: number, t: Translate) => (map[i]?.[4] === 'heart' ? t('heart') : map[i]?.[2] ?? '');
const nebOf = (v: { neb?: [number, number, number][] }): Nebula[] => (v.neb ?? []).map(([x, y, r]) => ({ x, y, r }));
function useLinks(v: { map: MapEntry[]; neb?: [number, number, number][]; wh?: [number, number][] }): Links {
  return useMemo(() => buildLinks(v.map.map((m) => [m[0], m[1]]), nebOf(v), v.wh ?? []), [v.map, v.neb, v.wh]);
}

/** Aktuelle Spielzeit aus dem letzten Stand hochrechnen */
function useSim(clock: Clock | undefined, interval = 100) {
  const now = useServerNow(interval);
  if (!clock) return { sim: 0, now };
  return { sim: clock.sim + Math.max(0, (now - clock.at) / 1000) * clock.speed, now };
}

function boundsOf(map: MapEntry[]) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of map) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  return { minX, maxX, minY, maxY };
}

/** Ausschnitt [x, y, b, h] in Feldern, passend zum Seitenverhältnis */
function fitBox(minX: number, minY: number, maxX: number, maxY: number, w: number, h: number, margin: number): [number, number, number, number] {
  let bw = maxX - minX + margin * 2, bh = maxY - minY + margin * 2;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  if (bw / bh < w / h) bw = (bh * w) / h;
  else bh = (bw * h) / w;
  return [cx - bw / 2, cy - bh / 2, bw, bh];
}

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

/** Text mit farbig hervorgehobenem Namen ({name}) */
function Rich({ text, name, color }: { text: string; name?: string; color?: string }) {
  const parts = text.split('\u0001');
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>{p}{i < parts.length - 1 && <b style={{ color }}>{name}</b>}</span>
      ))}
    </>
  );
}

/* ================= Sternkarte (TV und Handy) ================= */

interface MapProps {
  v: MapData;
  w: number;
  h: number;
  box: [number, number, number, number];
  sim: number;
  speed: number;
  now: number;
  me?: number;
  tv?: boolean;
  names?: boolean;
  sel?: { star?: number; pk?: ParkT } | null;
  target?: number | null;
  range?: number;
  reach?: Set<number>;
  blink?: number;
  /** Besitzer pro Stern überschreiben (Zeitraffer) */
  owners?: number[];
  /** geplanter Weg ab dem gewählten Stern (Stationen) */
  route?: number[] | null;
  /** markierte eigene Sterne (Schiffe herholen) */
  picks?: Set<number>;
  /** Zielstern-Aufträge [von, nach] */
  rallies?: [number, number][];
  onTap?: (x: number, y: number, u: number) => void;
}

/** Kleines Abzeichen für besondere Sterne */
function SpecialMark({ x, y, sp, u, k }: { x: number; y: number; sp: string; u: number; k: number }) {
  const c = SP_COLOR[sp];
  const r = 13 * u * k;
  if (sp === 'gold') return <circle cx={x} cy={y} r={r} fill="none" stroke={c} strokeWidth={2.2 * u} strokeDasharray={`${2 * u} ${2.2 * u}`} />;
  if (sp === 'yard') return <rect x={x - r} y={y - r} width={2 * r} height={2 * r} rx={2 * u} fill="none" stroke={c} strokeWidth={2 * u} transform={`rotate(45 ${x} ${y})`} />;
  if (sp === 'lab') return <circle cx={x} cy={y} r={r} fill="none" stroke={c} strokeWidth={2.2 * u} strokeDasharray={`${7 * u} ${4 * u}`} />;
  if (sp === 'fort') {
    const pts = Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 3) * i + Math.PI / 6; return `${x + Math.cos(a) * r},${y + Math.sin(a) * r}`; }).join(' ');
    return <polygon points={pts} fill="none" stroke={c} strokeWidth={2.2 * u} />;
  }
  return null;
}

function StarMap({ v, w, h, box, sim, speed, now, me = -1, tv, names, sel, target, range, reach, blink, owners, route, picks, rallies, onTap }: MapProps) {
  const uid = useId().replace(/:/g, '');
  const svgRef = useRef<SVGSVGElement>(null);
  const [bx, by, bw, bh] = box;
  const u = 1 / Math.min(w / bw, h / bh);
  const k = tv ? 1 : 0.85;
  const glow = `url(#g${uid})`;
  const own = (i: number) => (owners ? owners[i] : v.st[i]?.[0] ?? -1);
  const tap = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!onTap || !svgRef.current) return;
    const m = svgRef.current.getScreenCTM();
    if (!m) return;
    const pt = svgRef.current.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(m.inverse());
    onTap(p.x, p.y, u);
  };
  const src = sel?.star != null ? { x: v.map[sel.star][0], y: v.map[sel.star][1] } : sel?.pk ? { x: sel.pk[3], y: sel.pk[4] } : null;
  return (
    <svg ref={svgRef} width={w} height={h} viewBox={`${bx} ${by} ${bw} ${bh}`} onPointerUp={tap} style={{ display: 'block', touchAction: 'manipulation' }} role="img" aria-label="Sternkarte">
      <defs>
        <filter id={`g${uid}`} x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation={3.2 * u} result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <radialGradient id={`n${uid}`}>
          <stop offset="0%" stopColor="#7a4fc4" stopOpacity={0.55} />
          <stop offset="70%" stopColor="#4a2d86" stopOpacity={0.4} />
          <stop offset="100%" stopColor="#3a2370" stopOpacity={0} />
        </radialGradient>
      </defs>
      {/* Nebelfelder */}
      {v.neb?.map(([x, y, r], i) => <circle key={`n${i}`} cx={x} cy={y} r={r * 1.18} fill={`url(#n${uid})`} />)}
      {/* Wurmlöcher: schwache Verbindung */}
      {v.wh?.map(([a, b], i) => (
        <line key={`w${i}`} x1={v.map[a][0]} y1={v.map[a][1]} x2={v.map[b][0]} y2={v.map[b][1]} stroke={WH_COLORS[i % 2]} strokeOpacity={0.16} strokeWidth={1.5 * u} strokeDasharray={`${2 * u} ${7 * u}`} />
      ))}
      {/* Zielstern-Aufträge */}
      {rallies?.map(([a, b]) => (
        <line key={`r${a}`} x1={v.map[a][0]} y1={v.map[a][1]} x2={v.map[b][0]} y2={v.map[b][1]} stroke={ownerColor(v.emp, me)} strokeOpacity={0.35} strokeWidth={1.6 * u} strokeDasharray={`${1.5 * u} ${4 * u}`} />
      ))}
      {/* Reichweite */}
      {src && range != null && (
        <circle cx={src.x} cy={src.y} r={range} fill={CYAN} fillOpacity={0.05} stroke={CYAN} strokeOpacity={0.5} strokeWidth={1.2 * u} strokeDasharray={`${4 * u} ${6 * u}`} />
      )}
      {src && target != null && (
        <polyline points={[[src.x, src.y], ...(route ?? [target]).map((i) => [v.map[i][0], v.map[i][1]])].map((p) => p.join(',')).join(' ')} fill="none" stroke={CYAN} strokeWidth={3 * u} strokeDasharray={`${7 * u} ${6 * u}`} strokeLinejoin="round" />
      )}
      {route && route.length > 1 && route.slice(0, -1).map((i) => <circle key={`rt${i}`} cx={v.map[i][0]} cy={v.map[i][1]} r={11 * u} fill="none" stroke={CYAN} strokeWidth={2 * u} />)}
      {/* Flugbahnen */}
      {v.fl?.map((f) => {
        const [id, o, , x0, y0, to, t0, t1, cl, path, whl] = f;
        const [tx, ty] = v.map[to];
        const p = Math.min(1, Math.max(0, (sim - t0) / Math.max(0.01, t1 - t0)));
        const x = x0 + (tx - x0) * p, y = y0 + (ty - y0) * p;
        const pts = [[x, y], [tx, ty], ...(path || []).map((i) => [v.map[i][0], v.map[i][1]])];
        return <polyline key={`l${id}`} points={pts.map((q) => q.join(',')).join(' ')} fill="none" stroke={ownerColor(v.emp, o)} strokeWidth={2 * u * k} strokeDasharray={whl ? `${2 * u} ${4 * u}` : `${6 * u} ${6 * u}`} opacity={cl ? 0.45 : 0.8} />;
      })}
      {/* Sterne */}
      {v.map.map(([x, y, , home, sp], i) => {
        const o = own(i);
        const c = ownerColor(v.emp, o);
        const mine = me >= 0 && o === me;
        const whi = v.wh?.findIndex(([a, b]) => a === i || b === i) ?? -1;
        const extra = (
          <>
            {sp && sp !== 'heart' && <SpecialMark x={x} y={y} sp={sp} u={u} k={k} />}
            {whi >= 0 && (
              <>
                <circle cx={x} cy={y} r={15 * u * k} fill="none" stroke={WH_COLORS[whi % 2]} strokeWidth={2 * u} strokeDasharray={`${9 * u} ${5 * u}`} />
                <circle cx={x} cy={y} r={10 * u * k} fill="none" stroke={WH_COLORS[whi % 2]} strokeOpacity={0.6} strokeWidth={1.4 * u} strokeDasharray={`${4 * u} ${4 * u}`} />
              </>
            )}
            {reach?.has(i) && <circle cx={x} cy={y} r={(sp === 'heart' ? 24 : 15) * u} fill="none" stroke={INK} strokeOpacity={0.55} strokeWidth={1.4 * u} strokeDasharray={`${3 * u} ${3 * u}`} />}
            {picks?.has(i) && <circle cx={x} cy={y} r={19 * u} fill="none" stroke="#FFD23F" strokeWidth={3 * u} />}
          </>
        );
        if (sp === 'heart') {
          const r = 11 * u * k;
          const pts = Array.from({ length: 10 }, (_, q) => { const a = (Math.PI / 5) * q - Math.PI / 2; const rr = q % 2 ? r * 0.5 : r; return `${x + Math.cos(a) * rr},${y + Math.sin(a) * rr}`; }).join(' ');
          return (
            <g key={i}>
              <circle cx={x} cy={y} r={30 * u * k} fill={o >= 0 ? c : HEART} opacity={0.14} />
              <circle cx={x} cy={y} r={19 * u * k} fill="none" stroke={HEART} strokeWidth={2.4 * u} filter={glow} />
              <polygon points={pts} fill={o >= 0 ? c : HEART} filter={glow} />
              {extra}
            </g>
          );
        }
        if (o < 0) {
          return (
            <g key={i}>
              <circle cx={x} cy={y} r={5 * u * k} fill={sp ? SP_COLOR[sp] : NEUTRAL} opacity={sp ? 0.8 : 1} />
              {extra}
            </g>
          );
        }
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={(home >= 0 ? 22 : 18) * u * k} fill={c} opacity={mine ? 0.22 : 0.13} />
            {home >= 0 && <circle cx={x} cy={y} r={12 * u * k} fill="none" stroke={c} strokeWidth={2 * u} />}
            <circle cx={x} cy={y} r={(home >= 0 ? 7 : 6) * u * k} fill={c} filter={glow} />
            {extra}
          </g>
        );
      })}
      {blink != null && v.map[blink] && (
        <circle cx={v.map[blink][0]} cy={v.map[blink][1]} r={20 * u} fill="none" stroke={INK} strokeWidth={3 * u}>
          <animate attributeName="r" values={`${14 * u};${34 * u};${14 * u}`} dur="1.4s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="1;0.2;1" dur="1.4s" repeatCount="indefinite" />
        </circle>
      )}
      {sel?.star != null && <circle cx={v.map[sel.star][0]} cy={v.map[sel.star][1]} r={24 * u} fill="none" stroke={CYAN} strokeWidth={3 * u} />}
      {target != null && <circle cx={v.map[target][0]} cy={v.map[target][1]} r={20 * u} fill="none" stroke={INK} strokeWidth={2.5 * u} />}
      {/* Zahlen und Namen */}
      <g fontFamily={DISPLAY} textAnchor="middle">
        {v.map.map(([x, y, name], i) => {
          const o = own(i);
          const ships = owners ? null : v.st[i]?.[1];
          return (
            <g key={i}>
              {ships != null && (
                <text x={x} y={y + (v.map[i][4] === 'heart' ? 34 : o >= 0 ? 27 : 21) * u * k} fontSize={(o >= 0 ? 15 : 13) * u * k} fontWeight={800} fill={o >= 0 ? ownerColor(v.emp, o) : NEUTRAL}>{ships}</text>
              )}
              {names && <text x={x} y={y - (o >= 0 ? 17 : 11) * u * k} fontSize={11 * u * k} fontFamily="var(--body)" fill={MUTED}>{name}</text>}
            </g>
          );
        })}
      </g>
      {/* Flotten */}
      {v.fl?.map((f) => {
        const [id, o, ships, x0, y0, to, t0, t1, cl] = f;
        const [tx, ty] = v.map[to];
        const p = Math.min(1, Math.max(0, (sim - t0) / Math.max(0.01, t1 - t0)));
        const x = x0 + (tx - x0) * p, y = y0 + (ty - y0) * p;
        const ang = (Math.atan2(ty - y0, tx - x0) * 180) / Math.PI;
        const c = ownerColor(v.emp, o);
        const left = speed > 0 ? fmt((t1 - sim) / speed) : '';
        const label = left ? `${ships} · ${left}` : String(ships);
        const lw = (label.length * 7.4 + 16) * u * k;
        return (
          <g key={`f${id}`} opacity={cl ? 0.55 : 1}>
            <path d={`M${-7 * u * k},${-5 * u * k} L${9 * u * k},0 L${-7 * u * k},${5 * u * k} z`} fill={c} filter={glow} transform={`translate(${x},${y}) rotate(${ang})`} />
            <rect x={x - lw / 2} y={y - 30 * u * k} width={lw} height={21 * u * k} rx={10.5 * u * k} fill="#0b1230" stroke={c} strokeWidth={1.2 * u} strokeDasharray={cl ? `${3 * u} ${3 * u}` : undefined} />
            <text x={x} y={y - 15 * u * k} textAnchor="middle" fontFamily={DISPLAY} fontSize={12.5 * u * k} fontWeight={700} fill={c}>{label}</text>
          </g>
        );
      })}
      {/* Piratenflotten im All */}
      {v.pk?.map(([id, o, ships, x, y]) => {
        const c = ownerColor(v.emp, o);
        const s = 9 * u * k;
        const chosen = sel?.pk?.[0] === id;
        return (
          <g key={`p${id}`}>
            {o === me && !chosen && <circle cx={x} cy={y} r={PIRATE_RANGE} fill="none" stroke={c} strokeOpacity={0.25} strokeWidth={u} strokeDasharray={`${3 * u} ${5 * u}`} />}
            <path d={`M${x},${y - s} L${x + s},${y} L${x},${y + s} L${x - s},${y} z`} fill={BG} stroke={c} strokeWidth={2.4 * u} filter={glow} />
            <text x={x} y={y + 24 * u * k} textAnchor="middle" fontFamily={DISPLAY} fontSize={13 * u * k} fontWeight={800} fill={c}>{ships}</text>
            {chosen && <circle cx={x} cy={y} r={20 * u} fill="none" stroke={CYAN} strokeWidth={3 * u} />}
          </g>
        );
      })}
      {/* Kämpfe */}
      {v.fx?.filter((f) => now - f.at < 2000 && v.map[f.star]).map((f) => {
        const [x, y] = v.map[f.star];
        const c = f.k === 'conquer' ? ownerColor(v.emp, own(f.star)) : '#FF8A5B';
        return (
          <g key={`x${f.id}`}>
            <circle cx={x} cy={y} r={8 * u} fill="none" stroke={c} strokeWidth={3 * u}>
              <animate attributeName="r" from={8 * u} to={46 * u} dur="1.3s" fill="freeze" />
              <animate attributeName="opacity" from="1" to="0" dur="1.3s" fill="freeze" />
            </circle>
            <circle cx={x} cy={y} r={16 * u} fill={c} opacity={0}>
              <animate attributeName="opacity" values="0.75;0" dur="0.6s" fill="freeze" />
            </circle>
          </g>
        );
      })}
    </svg>
  );
}

/* ================= TV ================= */

function messageText(m: any, v: any, t: Translate): { text: string; name?: string; color?: string } {
  const e = m.e != null && m.e >= 0 ? v.emp[m.e] : null;
  const star = m.star != null ? starName(v.map, m.star, t) : '';
  const N = '\u0001';
  switch (m.k) {
    case 'conquer': return { text: t('msg.conquer', { name: N, star }), name: e?.n, color: e?.c };
    case 'hold': return e ? { text: t('msg.hold', { name: N, star }), name: e.n, color: e.c } : { text: t('msg.holdFree', { star }) };
    case 'pirate': return { text: t('msg.pirate', { name: N }), name: e?.n, color: e?.c };
    case 'spawn': return { text: t('msg.spawn', { name: N }), name: e?.n, color: e?.c };
    case 'out': return { text: t('msg.out', { name: N }), name: e?.n, color: e?.c };
    case 'gift': return { text: t('msg.gift') };
    case 'heart': return { text: t('msg.heart', { name: N }), name: e?.n, color: e?.c };
    case 'mission': return { text: t('msg.mission') };
    default: return { text: '' };
  }
}

function useMessageSounds(msgs: any[] | undefined, tvSide: boolean) {
  const last = useRef<number>(msgs?.at(-1)?.id ?? 0);
  useEffect(() => {
    if (!msgs || !tvSide) return;
    for (const m of msgs) {
      if (m.id <= last.current) continue;
      if (m.k === 'conquer') sfx.play('stamp');
      else if (m.k === 'hold') sfx.play('pop');
      else if (m.k === 'gift' || m.k === 'mission') sfx.play('ding');
      else if (m.k === 'pirate' || m.k === 'spawn') sfx.play('sneaky');
    }
    last.current = msgs.at(-1)?.id ?? last.current;
  }, [msgs, tvSide]);
}

function phaseInfo(v: any, sim: number, now: number, t: Translate) {
  if (v.phase === 'plan') {
    const left = (v.deadline - now) / 1000;
    return { label: t('phase.plan'), time: fmt(left), frac: Math.max(0, Math.min(1, left / (v.duration / 1000))), plan: true };
  }
  const yearEnd = v.year * YEAR;
  const left = Math.max(0, yearEnd - sim);
  const speed = v.clock?.speed || 1;
  return { label: v.phase === 'resolve' ? t('phase.resolve') : t('phase.year'), time: fmt(left / speed), frac: 1 - Math.min(1, left / YEAR), plan: false };
}

/** Zeichenerklärung für besondere Sterne, Herz, Wurmloch und Nebel */
function Legend({ t, size = 13 }: { t: Translate; size?: number }) {
  const icon = (sp: string) => {
    const x = 9, y = 9, u = 0.62;
    if (sp === 'heart') return <polygon points={Array.from({ length: 10 }, (_, q) => { const a = (Math.PI / 5) * q - Math.PI / 2; const rr = q % 2 ? 3.5 : 7; return `${x + Math.cos(a) * rr},${y + Math.sin(a) * rr}`; }).join(' ')} fill={HEART} />;
    if (sp === 'wh') return <circle cx={x} cy={y} r={6.5} fill="none" stroke={WH_COLORS[0]} strokeWidth={1.8} strokeDasharray="5 3" />;
    if (sp === 'neb') return <circle cx={x} cy={y} r={7.5} fill="#5b3a9c" opacity={0.8} />;
    return <><circle cx={x} cy={y} r={2.6} fill={SP_COLOR[sp]} /><SpecialMark x={x} y={y} sp={sp} u={u} k={0.85} /></>;
  };
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: size, color: MUTED }}>
      {['gold', 'yard', 'lab', 'fort', 'heart', 'wh', 'neb'].map((k) => (
        <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <svg width={18} height={18} viewBox="0 0 18 18" aria-hidden="true">{icon(k)}</svg>{t(`sp.${k}`)}
        </span>
      ))}
    </div>
  );
}

function TvPlay({ v, t }: { v: any; t: Translate }) {
  const { sim, now } = useSim(v.clock, 100);
  const b = useMemo(() => boundsOf(v.map), [v.map]);
  const box = useMemo(() => fitBox(b.minX, b.minY, b.maxX, b.maxY, 980, 720, 1.5), [b]);
  const ppf = 980 / box[2];
  useMessageSounds(v.msgs, true);
  const bannerOn = v.banner && now - v.banner.at < 2600;
  useEffect(() => {
    if (v.banner && Date.now() - v.banner.at < 1500) sfx.play('beep');
  }, [v.banner?.at]);
  const ph = phaseInfo(v, sim, now, t);
  const endspurt = v.year >= v.years - 1;
  const many = v.rank.length > 8;
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', background: 'radial-gradient(circle at 38% 45%, #111a3a 0%, #070b1a 70%)', color: INK, overflow: 'hidden' }}>
      <div style={{ position: 'relative', width: 980, height: 720 }}>
        <StarMap v={v} w={980} h={720} box={box} sim={sim} speed={v.clock?.speed ?? 0} now={now} tv names={ppf >= 30} />
        <div style={{ position: 'absolute', left: 74, bottom: 12, right: 18, pointerEvents: 'none', opacity: 0.85 }}><Legend t={t} /></div>
        {bannerOn && (
          <div key={v.banner.at} className="anim-pop" style={{ position: 'absolute', left: 0, right: 0, top: 26, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
            <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 64, padding: '6px 34px', borderRadius: 24, background: 'rgba(7,11,26,.82)', border: `2px solid ${CYAN}`, boxShadow: `0 0 30px ${CYAN}66`, color: INK }}>
              {t('year', { n: v.banner.year })}
            </span>
          </div>
        )}
        {ph.plan && (
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 24, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
            <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 30, padding: '8px 26px', borderRadius: 18, background: 'rgba(7,11,26,.85)', border: `2px solid #FFD23F`, color: '#FFD23F' }}>
              {t('tv.plan', { time: ph.time })}
            </span>
          </div>
        )}
      </div>
      <div style={{ width: 300, boxSizing: 'border-box', padding: '26px 22px', display: 'flex', flexDirection: 'column', gap: many ? 14 : 20, background: 'rgba(9,14,36,0.7)', borderLeft: '1px solid #1e2750' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontFamily: DISPLAY, fontSize: 14, fontWeight: 700, letterSpacing: 4, color: CYAN }}>{t('title').toUpperCase()}</span>
          <span style={{ fontFamily: DISPLAY, fontSize: 44, fontWeight: 800, lineHeight: 1 }}>
            {t('year', { n: v.year })} <span style={{ color: FAINT, fontSize: 28 }}>/ {v.years}</span>
          </span>
          {endspurt && <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 16, color: '#FF4FD8', letterSpacing: 2 }}>{t('endspurt').toUpperCase()}</span>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: MUTED }}><span>{ph.label}</span><span style={{ color: INK, fontWeight: 700 }}>{ph.time}</span></div>
          <div style={{ height: 8, borderRadius: 4, background: '#1a2248' }}>
            <div style={{ width: `${Math.round((ph.plan ? ph.frac : ph.frac) * 100)}%`, height: 8, borderRadius: 4, background: ph.plan ? '#FFD23F' : CYAN, boxShadow: `0 0 10px ${ph.plan ? '#FFD23F' : CYAN}`, transition: 'width .2s linear' }} />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: many ? 5 : 9 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: MUTED }}><span>{t('points')}</span><span>{t('winAt', { n: v.half })}</span></div>
          {(v.rank as [number, number, number, number][]).map(([e, n, stars, hy]) => {
            const emp: Emp = v.emp[e];
            return (
              <div key={e} style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: emp.o ? 0.4 : 1 }}>
                <span style={{ width: 12, height: 12, borderRadius: 6, background: emp.c, boxShadow: `0 0 8px ${emp.c}`, flex: 'none' }} />
                <span style={{ flex: 1, fontWeight: 700, fontSize: many ? 15 : 17, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {emp.n}{emp.ai && <span style={{ color: FAINT, fontWeight: 500, fontSize: 12 }}> · {t('ai')}</span>}{emp.p && <span style={{ color: '#FF8A5B', fontWeight: 700, fontSize: 12 }}> · {t('pirate')}</span>}
                </span>
                <span style={{ fontSize: 12, color: FAINT, whiteSpace: 'nowrap' }}>{t('starsShort', { n: stars })}{hy > 0 ? <span style={{ color: HEART }}> ♥{hy}</span> : null}</span>
                <span style={{ fontFamily: DISPLAY, fontSize: many ? 17 : 20, fontWeight: 800, minWidth: 52, textAlign: 'right' }}>{n}</span>
              </div>
            );
          })}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: NEUTRAL }}>
            <span style={{ width: 12, height: 12, borderRadius: 6, border: `2px solid ${NEUTRAL}`, boxSizing: 'border-box' }} />
            <span style={{ flex: 1, fontSize: many ? 14 : 16 }}>{t('free')}</span>
            <span style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 700 }}>{v.st.filter((s: StarDyn) => s[0] < 0).length}</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto', minHeight: 0, overflow: 'hidden' }}>
          {v.msgs.length > 0 && <span style={{ fontSize: 13, color: MUTED }}>{t('messages')}</span>}
          {(v.msgs as any[]).slice(many ? -2 : -3).map((m) => {
            const r = messageText(m, v, t);
            return (
              <div key={m.id} className="anim-up" style={{ fontSize: 14, lineHeight: 1.35, padding: '9px 12px', borderRadius: 10, background: CARD }}>
                <Rich {...r} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TvIntro({ v, t }: { v: any; t: Translate }) {
  const { sim, now } = useSim(v.clock, 250);
  const b = useMemo(() => boundsOf(v.map), [v.map]);
  const box = useMemo(() => fitBox(b.minX, b.minY, b.maxX, b.maxY, 520, 600, 1.2), [b]);
  const left = Math.max(0, (v.deadline - now) / 1000);
  const rules: [string, string][] = [
    [CYAN, t('intro.conquer')],
    ['#FFD23F', t('intro.build')],
    ['#A98BFF', t('intro.research')],
    ['#FFD23F', t('intro.special')],
    [HEART, t('intro.heart')],
    ['#FF4FD8', t('intro.pacts')],
    ['#6BFFE0', t('intro.missions')],
  ];
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', background: 'radial-gradient(circle at 30% 50%, #111a3a 0%, #070b1a 70%)', color: INK }}>
      <div style={{ width: 560, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <StarMap v={v} w={520} h={600} box={box} sim={sim} speed={0} now={now} tv />
      </div>
      <div style={{ flex: 1, padding: '30px 44px 30px 10px', display: 'flex', flexDirection: 'column', gap: 11 }}>
        <span className="anim-pop" style={{ fontFamily: DISPLAY, fontSize: 60, fontWeight: 800, lineHeight: 1, color: CYAN, textShadow: `0 0 24px ${CYAN}88` }}>{t('title')}</span>
        {rules.map(([c, text], i) => (
          <div key={i} className="anim-up" style={{ display: 'flex', gap: 14, alignItems: 'flex-start', animationDelay: `${0.2 + i * 0.25}s` }}>
            <span style={{ width: 14, height: 14, borderRadius: 7, background: c, boxShadow: `0 0 10px ${c}`, marginTop: 7, flex: 'none' }} />
            <span style={{ fontSize: 18, lineHeight: 1.3 }}>{text}</span>
          </div>
        ))}
        <div className="anim-up" style={{ fontSize: 18, lineHeight: 1.3, padding: '10px 14px', borderRadius: 14, background: CARD, border: `1px solid ${LINE}`, animationDelay: '1.3s' }}>
          {t('intro.goal', { n: v.half, years: v.years })}
        </div>
        {v.rounds && <span style={{ fontSize: 16, color: '#FFD23F' }}>{t('intro.rounds')}</span>}
        <Legend t={t} size={14} />
        <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 20, color: MUTED }}>
          <span>{v.total > 0 ? t('intro.ready', { n: v.ready, total: v.total }) : ''}</span>
          <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 30, color: INK }}>{fmt(left)}</span>
        </div>
      </div>
    </div>
  );
}

function TvReplay({ v, t }: { v: any; t: Translate }) {
  const hist: number[][] = v.hist;
  const [i, setI] = useState(0);
  useEffect(() => {
    const step = Math.max(320, Math.min(700, 8500 / hist.length));
    const id = setInterval(() => setI((x) => Math.min(hist.length - 1, x + 1)), step);
    return () => clearInterval(id);
  }, [hist.length]);
  useEffect(() => { sfx.play('pop'); }, [i]);
  const b = useMemo(() => boundsOf(v.map), [v.map]);
  const box = useMemo(() => fitBox(b.minX, b.minY, b.maxX, b.maxY, 980, 640, 1.2), [b]);
  const data: MapData = { map: v.map, neb: v.neb, wh: v.wh, emp: v.emp, st: hist[i].map((o) => [o, 0] as StarDyn) };
  const counts = v.emp.map((_: Emp, e: number) => hist[i].filter((o) => o === e).length);
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 50%, #111a3a 0%, #070b1a 70%)', color: INK }}>
      <div style={{ position: 'absolute', left: 0, top: 70, width: 980, height: 640 }}>
        <StarMap v={data} w={980} h={640} box={box} sim={0} speed={0} now={0} tv owners={hist[i]} />
      </div>
      <div style={{ position: 'absolute', left: 40, top: 24, fontFamily: DISPLAY, fontWeight: 800, fontSize: 40 }}>
        {t('replay')} · <span style={{ color: CYAN }}>{t('year', { n: Math.min(i + 1, v.years) })}</span>
      </div>
      <div style={{ position: 'absolute', right: 30, top: 110, width: 260, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {v.emp.map((emp: Emp, e: number) => ({ emp, e, n: counts[e] })).sort((a: any, b: any) => b.n - a.n).map(({ emp, e, n }: any) => (
          <div key={e} style={{ display: 'flex', alignItems: 'center', gap: 10, transition: 'all .3s' }}>
            <span style={{ width: 12, height: 12, borderRadius: 6, background: emp.c, boxShadow: `0 0 8px ${emp.c}` }} />
            <span style={{ flex: 1, fontWeight: 700, fontSize: 18 }}>{emp.n}</span>
            <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 24 }}>{n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

type MissionV = { k: string; star?: number; target?: number; pts: number; done: boolean; failed: boolean };
function missionText(m: MissionV, map: MapEntry[], emp: Emp[], t: Translate) {
  switch (m.k) {
    case 'hold': return t('mis.hold', { star: m.star != null ? starName(map, m.star, t) : '' });
    case 'conquer': return t('mis.conquer', { name: m.target != null ? emp[m.target]?.n ?? '' : '' });
    default: return t(`mis.${m.k}`);
  }
}

function TvFinal({ v, t, player }: { v: any; t: Translate; player: HostViewProps['player'] }) {
  const res: { e: number; stars: number; ships: number; heart: number; mis: number; pts: number }[] = v.result;
  const win = res[0] ? v.emp[res[0].e] as Emp : null;
  useEffect(() => { sfx.play('fanfare'); }, []);
  const small = res.length > 6;
  const tiny = res.length > 9;
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 30%, #16204a 0%, #070b1a 70%)', color: INK, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '26px 50px', gap: 14 }}>
      <Confetti silent />
      {win && (
        <span className="anim-pop" style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 50, color: win.c, textShadow: `0 0 26px ${win.c}88`, textAlign: 'center' }}>
          {t('final.win', { name: win.n })}
        </span>
      )}
      <div style={{ width: 1100, display: 'flex', flexDirection: 'column', gap: tiny ? 4 : 7 }}>
        <div style={{ display: 'flex', fontSize: 14, color: MUTED, padding: '0 18px' }}>
          <span style={{ flex: 1 }} />
          <span style={{ width: 100, textAlign: 'right' }}>{t('stars')}</span>
          <span style={{ width: 90, textAlign: 'right' }}>{t('final.heart')}</span>
          <span style={{ width: 110, textAlign: 'right' }}>{t('final.missions')}</span>
          <span style={{ width: 110, textAlign: 'right' }}>{t('points')}</span>
        </div>
        {res.map((r, i) => {
          const emp: Emp = v.emp[r.e];
          const p = !emp.ai ? player(emp.id) : undefined;
          const ms: MissionV[] = v.missions?.[r.e] ?? [];
          const num = (n: number | string, w: number, color?: string) => <span style={{ width: w, textAlign: 'right', fontFamily: DISPLAY, fontWeight: 800, fontSize: tiny ? 17 : 21, color }}>{n}</span>;
          return (
            <div key={r.e} className="anim-up" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: tiny ? '3px 18px' : small ? '6px 18px' : '9px 18px', borderRadius: 14, background: i === 0 ? '#1b2a55' : CARD, border: `1px solid ${i === 0 ? emp.c : LINE}`, animationDelay: `${i * 0.08}s` }}>
              <span style={{ width: 30, fontFamily: DISPLAY, fontWeight: 800, fontSize: tiny ? 17 : 21, color: MUTED }}>{i + 1}.</span>
              {p ? <Avatar player={p} size={tiny ? 26 : 36} /> : <span style={{ width: tiny ? 26 : 36, height: tiny ? 26 : 36, borderRadius: '50%', border: `2px solid ${emp.c}`, boxSizing: 'border-box', flex: 'none' }} />}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <b style={{ fontSize: tiny ? 16 : 19, color: emp.c }}>{emp.n}{emp.ai && <span style={{ color: FAINT, fontWeight: 500, fontSize: 13 }}> · {t('ai')}</span>}</b>
                {!tiny && ms.length > 0 && (
                  <span style={{ fontSize: 12.5, color: MUTED, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {ms.map((m, j) => (
                      <span key={j} style={{ marginRight: 14, color: m.done ? '#7CFFB2' : FAINT }}>{m.done ? '✓' : '✗'} {missionText(m, v.map, v.emp, t)}{m.done ? ` +${m.pts}` : ''}</span>
                    ))}
                  </span>
                )}
              </div>
              {num(r.stars, 100)}
              {num(r.heart ? `♥${r.heart}` : '–', 90, r.heart ? HEART : FAINT)}
              {num(tiny ? `${ms.filter((m) => m.done).length}/${ms.length}` : r.mis ? `+${r.mis}` : '–', 110, r.mis ? '#7CFFB2' : FAINT)}
              {num(emp.ai ? `(${r.pts})` : r.pts, 110, '#FFD23F')}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Host({ view, t, player }: HostViewProps) {
  switch (view.screen) {
    case 'intro': return <TvIntro v={view} t={t} />;
    case 'play': return <TvPlay v={view} t={t} />;
    case 'replay': return <TvReplay v={view} t={t} />;
    case 'final': return <TvFinal v={view} t={t} player={player} />;
    default: return null;
  }
}

/* ================= Handy ================= */

const btn = (bg: string, fg: string, extra?: CSSProperties): CSSProperties => ({
  height: 48, borderRadius: 12, border: 'none', background: bg, color: fg, fontFamily: DISPLAY, fontWeight: 800, fontSize: 17, cursor: 'pointer', ...extra,
});
const ghost: CSSProperties = { height: 48, borderRadius: 12, border: '1px solid #3a4677', background: 'transparent', color: INK, fontFamily: 'var(--body)', fontWeight: 700, fontSize: 16, cursor: 'pointer' };

function PhoneShell({ children, vip }: { children: ReactNode; vip: boolean }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 20, background: BG, color: INK, display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 520, display: 'flex', flexDirection: 'column', paddingTop: 'max(10px, env(safe-area-inset-top))', paddingBottom: 'max(10px, env(safe-area-inset-bottom))', paddingLeft: vip ? 0 : 0, minHeight: 0 }}>
        {children}
      </div>
    </div>
  );
}

function PhoneHeader({ v, t, vip }: { v: any; t: Translate; vip: boolean }) {
  const { sim, now } = useSim(v.clock, 250);
  const emp: Emp = v.emp[v.me];
  const ph = phaseInfo(v, sim, now, t);
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `6px 16px 8px ${vip ? 50 : 16}px`, gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
        <span style={{ width: 14, height: 14, borderRadius: 7, background: emp.c, boxShadow: `0 0 10px ${emp.c}`, flex: 'none' }} />
        <span style={{ fontWeight: 700, fontSize: 17, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{emp.n}</span>
        {emp.p && <span style={{ fontSize: 12, fontWeight: 700, color: '#FF8A5B' }}>{t('pirate')}</span>}
      </div>
      <div style={{ display: 'flex', gap: 12, fontSize: 14, color: MUTED, whiteSpace: 'nowrap' }}>
        <span style={{ color: ph.plan ? '#FFD23F' : MUTED }}>{ph.plan ? `${t('phase.plan')} ${ph.time}` : v.phase === 'resolve' ? `${t('phase.resolve')} ${ph.time}` : `${t('year', { n: v.year })} · ${ph.time}`}</span>
        {v.money != null && <span style={{ color: '#FFD23F', fontWeight: 700 }}>{t('money', { n: v.money })}</span>}
      </div>
    </div>
  );
}

type Tab = 'map' | 'build' | 'stars' | 'research' | 'chat';

function PhonePlay({ v, t, send, vip }: { v: any; t: Translate; send: (a: any) => void; vip: boolean }) {
  const [tab, setTab] = useState<Tab>('map');
  const unread = Object.values((v.chat?.un ?? {}) as Record<string, number>).reduce((a, b) => a + b, 0);
  // Vibration, wenn eigene Sterne angegriffen oder verloren werden
  const prevOwners = useRef<number[] | null>(null);
  const seenFx = useRef(new Set<number>());
  useEffect(() => {
    const owners = (v.st as StarDyn[]).map((s) => s[0]);
    if (prevOwners.current && prevOwners.current.some((o, i) => o === v.me && owners[i] !== v.me)) vibrate([200, 80, 200]);
    prevOwners.current = owners;
    for (const f of (v.fx ?? []) as Fx[]) {
      if (seenFx.current.has(f.id)) continue;
      seenFx.current.add(f.id);
      if (f.k === 'fight' && owners[f.star] === v.me) vibrate(90);
    }
  }, [v.st, v.fx, v.me]);
  const lastNote = (v.notes as any[])?.at(-1);
  const [noteShown, setNoteShown] = useState<number | null>(null);
  useEffect(() => {
    if (!lastNote) return;
    setNoteShown(lastNote.id);
    vibrate(40);
    const id = setTimeout(() => setNoteShown(null), 4000);
    return () => clearTimeout(id);
  }, [lastNote?.id]);
  const tabs: [Tab, string][] = [['map', t('tab.map')], ['build', t('tab.build')], ['stars', t('tab.stars')], ['research', t('tab.research')], ['chat', t('tab.chat')]];
  return (
    <PhoneShell vip={vip}>
      <PhoneHeader v={v} t={t} vip={vip} />
      {noteShown === lastNote?.id && lastNote && (
        <div className="anim-pop" style={{ margin: '0 14px 8px', padding: '9px 12px', borderRadius: 12, background: '#1b2a55', border: `1px solid ${CYAN}`, fontSize: 15, fontWeight: 700 }}>
          {lastNote.k === 'tech' ? t('note.tech', { tech: t(`tech.${lastNote.tech}`), n: lastNote.level })
            : lastNote.k === 'rally' ? t('note.rally', { star: starName(v.map, lastNote.star, t) })
            : lastNote.k === 'mission' ? t('note.mission')
            : t('note.spawn', { n: lastNote.ships })}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {tab === 'map' && <MapTab v={v} t={t} send={send} />}
        {tab === 'build' && <BuildTab v={v} t={t} send={send} />}
        {tab === 'stars' && <StarsTab v={v} t={t} send={send} />}
        {tab === 'research' && <ResearchTab v={v} t={t} send={send} />}
        {tab === 'chat' && <ChatTab v={v} t={t} send={send} />}
      </div>
      <nav aria-label={t('tab.nav')} style={{ display: 'flex', gap: 3, padding: '8px 8px 0' }}>
        {tabs.map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)} style={{ flex: 1, minWidth: 0, height: 46, padding: 0, borderRadius: 10, border: 'none', background: tab === id ? '#1d2a55' : 'transparent', color: tab === id ? CYAN : MUTED, fontFamily: 'var(--body)', fontWeight: tab === id ? 700 : 500, fontSize: 13, position: 'relative' }}>
            {label}
            {id === 'chat' && unread > 0 && <span style={{ marginLeft: 5, display: 'inline-block', minWidth: 18, height: 18, lineHeight: '18px', borderRadius: 9, background: '#FF4FD8', color: BG, fontSize: 11, fontWeight: 700 }}>{unread}</span>}
          </button>
        ))}
      </nav>
    </PhoneShell>
  );
}

/* ---------- Karte: Flotte schicken, herholen, Zielstern ---------- */

type Mode = 'send' | 'pull' | 'rally';

function GuardRow({ v, t, send }: { v: any; t: Translate; send: (a: any) => void }) {
  const g: number = v.guard ?? 1;
  const set = (n: number) => send({ type: 'guard', n: Math.max(0, n) });
  const small: CSSProperties = { width: 38, height: 34, borderRadius: 10, border: '1px solid #3a4677', background: 'transparent', color: INK, fontSize: 18, fontWeight: 700 };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
      <span style={{ flex: 1, color: MUTED }}>{t('guard.label')}</span>
      <button type="button" aria-label={t('guard.less')} style={small} onClick={() => set(g - 1)}>−</button>
      <span style={{ minWidth: 30, textAlign: 'center', fontFamily: DISPLAY, fontWeight: 800, fontSize: 18 }}>{g}</span>
      <button type="button" aria-label={t('guard.more')} style={small} onClick={() => set(g + 1)}>+</button>
    </div>
  );
}

function MapTab({ v, t, send }: { v: any; t: Translate; send: (a: any) => void }) {
  const [ref, size] = useSize<HTMLDivElement>();
  const { sim, now } = useSim(v.clock, 150);
  const [src, setSrc] = useState<{ star?: number; pk?: number } | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>('send');
  const [picks, setPicks] = useState<Set<number>>(new Set());
  const [n, setN] = useState(1);
  const [info, setInfo] = useState<number | null>(null);
  const [zoom, setZoom] = useState(false);
  const map: MapEntry[] = v.map;
  const st: StarDyn[] = v.st;
  const pk: ParkT[] = v.pk ?? [];
  const me: number = v.me;
  const guard: number = v.guard ?? 1;
  const links = useLinks(v);
  const neb = useMemo(() => nebOf(v), [v.neb]);
  const owners = useMemo(() => st.map((x) => x[0]), [st]);
  const planned = (from: number) => ((v.orders ?? []) as any[]).filter((o) => o.parked == null && o.from === from).reduce((a, o) => a + o.n, 0);
  const shipsAt = (i: number) => Math.max(0, Number(st[i][1]) - planned(i));
  const srcPk = src?.pk != null ? pk.find((p) => p[0] === src.pk && p[1] === me) : undefined;
  const srcValid = src?.star != null ? st[src.star]?.[0] === me : !!srcPk;
  const avail = !srcValid ? 0 : src?.star != null ? shipsAt(src.star) : Number(srcPk?.[2] ?? 0);
  const range = srcPk ? PIRATE_RANGE : v.range;
  const origin = src?.star != null ? { x: map[src.star][0], y: map[src.star][1] } : srcPk ? { x: srcPk[3], y: srcPk[4] } : null;
  const allN = avail - guard >= 1 ? avail - guard : avail;
  const rallies = useMemo(() => ((v.my ?? []) as number[][]).filter((m) => m[8] >= 0).map((m) => [m[0], m[8]] as [number, number]), [v.my]);
  const rallyOf = src?.star != null ? ((v.my ?? []) as number[][]).find((m) => m[0] === src.star)?.[8] ?? -1 : -1;
  // direkt erreichbare Sterne
  const reach = useMemo(() => {
    const set = new Set<number>();
    if (!origin || !srcValid) return set;
    map.forEach(([x, y], i) => {
      if (i === src?.star) return;
      if (src?.star != null ? hopTime(links, src.star, i, range) != null : d2(origin.x, origin.y, x, y) <= range + 1e-6 && !blocked(neb, origin.x, origin.y, x, y)) set.add(i);
    });
    return set;
  }, [origin?.x, origin?.y, range, srcValid, map, src?.star, links, neb]);
  const routeTo = (to: number): number[] | null => {
    if (src?.star != null) return findRoute(links, owners, me, src.star, to, range);
    return reach.has(to) ? [to] : null;
  };
  const route = target != null && srcValid ? routeTo(target) : null;
  useEffect(() => {
    if (src && (!srcValid || (mode === 'send' && avail < 1 && src.pk != null))) { setSrc(null); setTarget(null); setMode('send'); }
  }, [srcValid, avail]);
  useEffect(() => { setN((x) => Math.max(1, Math.min(avail, x))); }, [avail]);
  useEffect(() => { if (target != null && !route) setTarget(null); }, [route == null]);

  const b = useMemo(() => boundsOf(map), [map]);
  const box = useMemo<[number, number, number, number]>(() => {
    if (!size.w || !size.h) return [0, 0, 1, 1];
    if (origin && srcValid && zoom && mode === 'send') {
      const r = range + 1.3;
      let x0 = origin.x - r, y0 = origin.y - r, x1 = origin.x + r, y1 = origin.y + r;
      for (const i of route ?? []) {
        x0 = Math.min(x0, map[i][0] - 1.2); y0 = Math.min(y0, map[i][1] - 1.2);
        x1 = Math.max(x1, map[i][0] + 1.2); y1 = Math.max(y1, map[i][1] + 1.2);
      }
      return fitBox(x0, y0, x1, y1, size.w, size.h, 0);
    }
    return fitBox(b.minX, b.minY, b.maxX, b.maxY, size.w, size.h, 1);
  }, [size.w, size.h, origin?.x, origin?.y, srcValid, range, b, zoom, mode, route?.join(',')]);

  const reset = () => { setSrc(null); setTarget(null); setMode('send'); setPicks(new Set()); setZoom(false); };

  const onTap = (x: number, y: number, u: number) => {
    const thr = 30 * u;
    let best = -1, bd = Infinity;
    map.forEach(([sx, sy], i) => { const dd = d2(x, y, sx, sy); if (dd < bd) { bd = dd; best = i; } });
    const star = bd <= thr ? best : -1;
    const myPk = pk.filter((p) => p[1] === me).map((p) => ({ p, d: d2(x, y, p[3], p[4]) })).sort((a, b2) => a.d - b2.d)[0];
    const pkHit = myPk && myPk.d <= thr && myPk.d < bd ? myPk.p : null;
    setInfo(null);
    if (src && srcValid && mode === 'pull') {
      if (star >= 0 && star !== src.star && st[star][0] === me) {
        const next = new Set(picks);
        if (next.has(star)) next.delete(star); else next.add(star);
        setPicks(next);
        sfx.play('pop');
      }
      return;
    }
    if (src && srcValid && mode === 'rally') {
      if (star >= 0 && star !== src.star && st[star][0] === me && src.star != null && findRoute(links, owners, me, src.star, star, range)) {
        send({ type: 'rally', star: src.star, target: star });
        sfx.play('ding');
        vibrate(30);
        reset();
      }
      return;
    }
    if (src && srcValid) {
      if (star >= 0 && star === src.star) { reset(); return; }
      if (star >= 0 && !pkHit && avail >= 1 && routeTo(star)) { setTarget(star); setN(allN); return; }
      if (star >= 0 && st[star][0] === me) { setSrc({ star }); setTarget(null); return; }
      if (pkHit) { setSrc({ pk: pkHit[0] }); setTarget(null); return; }
      if (star >= 0) setInfo(star);
      setTarget(null);
      return;
    }
    if (pkHit) { setSrc({ pk: pkHit[0] }); setTarget(null); return; }
    if (star >= 0 && st[star][0] === me) { setSrc({ star }); setTarget(null); return; }
    if (star >= 0) setInfo(star);
  };

  const go = () => {
    if (target == null || !src) return;
    send(src.pk != null ? { type: 'send', parked: src.pk, to: target, n } : { type: 'send', from: src.star, to: target, n });
    vibrate(30);
    sfx.play('whoosh');
    reset();
  };
  const pullable = (i: number) => (src?.star != null && findRoute(links, owners, me, i, src.star, v.range) ? Math.max(0, shipsAt(i) - guard) : 0);
  const pullTotal = [...picks].reduce((a, i) => a + pullable(i), 0);
  const doPull = () => {
    if (src?.star == null || !pullTotal) return;
    send({ type: 'pull', to: src.star, from: [...picks] });
    vibrate(30);
    sfx.play('whoosh');
    reset();
  };

  const step = !src ? 1 : target == null ? 2 : 3;
  const srcName = src?.star != null ? starName(map, src.star, t) : t('pirateFleet');
  const flight = useMemo(() => {
    if (!origin || target == null || !route) return 0;
    let total = 0, from = src?.star ?? -1, ox = origin.x, oy = origin.y;
    for (const i of route) {
      total += from >= 0 && links.wh[from] === i ? FLIGHT : d2(ox, oy, map[i][0], map[i][1]) * FLIGHT;
      from = i; ox = map[i][0]; oy = map[i][1];
    }
    return total;
  }, [origin?.x, origin?.y, target, route?.join(',')]);
  const tgtOwner = target != null ? st[target][0] : -1;
  const ownerName = (o: number) => (o >= 0 ? v.emp[o].n : '');
  const describe = (i: number) => {
    const [o, ships] = st[i];
    const sp = map[i][4];
    const extra = sp ? ` ${t(`spd.${sp}`)}` : links.wh[i] >= 0 ? ` ${t('spd.wh', { star: starName(map, links.wh[i], t) })}` : '';
    const nm = starName(map, i, t);
    if (o === me) return t('target.own', { star: nm, n: ships }) + extra;
    if (o < 0) return t('target.free', { star: nm, n: ships }) + extra;
    return t('target.enemy', { star: nm, name: ownerName(o), n: ships }) + extra;
  };
  const chips = (
    <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', fontSize: 13 }}>
      {[t('step.start'), t('step.target'), t('step.ships')].map((label, i) => (
        <span key={i} style={{ flex: 1, textAlign: 'center', padding: '6px 0', borderRadius: 8, background: step === i + 1 ? CYAN : '#12304a', color: step === i + 1 ? BG : CYAN, fontWeight: step === i + 1 ? 700 : 500 }}>{i + 1} {label}</span>
      ))}
    </div>
  );
  const modeChip = mode !== 'send' && (
    <div style={{ display: 'flex', padding: '0 14px 8px' }}>
      <span style={{ flex: 1, textAlign: 'center', padding: '6px 0', borderRadius: 8, background: '#FFD23F', color: BG, fontWeight: 700, fontSize: 13 }}>{mode === 'pull' ? t('pull.title', { star: srcName }) : t('rally.title', { star: srcName })}</span>
    </div>
  );

  return (
    <>
      {modeChip || chips}
      <div ref={ref} style={{ flex: 1, minHeight: 160, position: 'relative', background: 'radial-gradient(circle at 50% 50%, #111a3a 0%, #070b1a 75%)', overflow: 'hidden' }}>
        {size.w > 0 && (
          <StarMap v={v} w={size.w} h={size.h} box={box} sim={sim} speed={v.clock?.speed ?? 0} now={now} me={me} names={!!origin && zoom && mode === 'send'}
            sel={src && srcValid ? { star: src.star, pk: srcPk } : null} target={mode === 'send' ? target : null} range={origin && mode === 'send' ? range : undefined}
            reach={mode === 'send' ? reach : undefined} route={mode === 'send' ? route : null} picks={mode === 'pull' ? picks : undefined} rallies={rallies} onTap={onTap} />
        )}
        {origin && srcValid && mode === 'send' && (
          <button type="button" onClick={() => setZoom(!zoom)} style={{ position: 'absolute', right: 10, top: 10, height: 34, padding: '0 12px', borderRadius: 17, border: `1px solid ${LINE}`, background: 'rgba(13,20,48,.85)', color: INK, fontSize: 13 }}>{zoom ? t('map.whole') : t('map.zoom')}</button>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '16px 16px 4px', background: PANEL, borderTop: `1px solid ${LINE}`, borderRadius: '20px 20px 0 0', marginTop: -14, position: 'relative' }}>
        {v.pirate && !pk.some((p) => p[1] === me) && <span style={{ fontSize: 15, color: '#FF8A5B', fontWeight: 700 }}>{t('pirate.wait')}</span>}
        {mode === 'pull' && src?.star != null && (
          <>
            <span style={{ fontSize: 15, color: MUTED }}>{t('pull.hint', { n: guard })}</span>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" style={{ ...ghost, flex: 1 }} onClick={() => { setMode('send'); setPicks(new Set()); }}>{t('back')}</button>
              <button type="button" disabled={!pullTotal} style={btn(pullTotal ? CYAN : '#2a3360', pullTotal ? BG : FAINT, { flex: 1.6 })} onClick={doPull}>
                {v.rounds ? t('pull.plan', { n: pullTotal }) : t('pull.go', { n: pullTotal })}
              </button>
            </div>
          </>
        )}
        {mode === 'rally' && src?.star != null && (
          <>
            <span style={{ fontSize: 15, color: MUTED }}>{t('rally.hint', { n: guard })}</span>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" style={{ ...ghost, flex: 1 }} onClick={() => setMode('send')}>{t('back')}</button>
              {rallyOf >= 0 && (
                <button type="button" style={{ ...ghost, flex: 1.4 }} onClick={() => { send({ type: 'rally', star: src.star, target: null }); reset(); }}>{t('rally.clear')}</button>
              )}
            </div>
          </>
        )}
        {mode === 'send' && step === 1 && (
          <>
            <span style={{ fontSize: 15, color: MUTED }}>{info != null ? describe(info) : v.pirate ? t('map.hintPirate') : t('map.hint')}</span>
            {!v.pirate && <GuardRow v={v} t={t} send={send} />}
            {v.rounds && <PlanBox v={v} t={t} send={send} />}
          </>
        )}
        {mode === 'send' && step === 2 && (
          <>
            <span style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 800 }}>{srcName} · {t('ships', { n: avail })}</span>
            <span style={{ fontSize: 15, color: MUTED }}>{info != null ? describe(info) : avail < 1 ? t('map.empty') : t('map.pickTarget', { n: range })}</span>
            {src?.star != null && (
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" style={{ ...ghost, flex: 1, fontSize: 14 }} onClick={() => { setMode('pull'); setPicks(new Set()); setTarget(null); }}>{t('pull.btn')}</button>
                <button type="button" style={{ ...ghost, flex: 1, fontSize: 14, borderColor: rallyOf >= 0 ? '#FFD23F' : '#3a4677' }} onClick={() => { setMode('rally'); setTarget(null); }}>
                  {rallyOf >= 0 ? t('rally.btnSet', { star: starName(map, rallyOf, t) }) : t('rally.btn')}
                </button>
              </div>
            )}
          </>
        )}
        {mode === 'send' && step === 3 && target != null && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontFamily: DISPLAY, fontSize: 21, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{srcName} → {starName(map, target, t)}</span>
              <span style={{ fontSize: 14, color: MUTED, whiteSpace: 'nowrap' }}>{v.rounds ? t('arrive.rounds', { n: Math.max(1, Math.ceil(flight / YEAR)) }) : t('arrive', { time: fmt(flight) })}</span>
            </div>
            <span style={{ fontSize: 14, color: tgtOwner >= 0 && tgtOwner !== me ? v.emp[tgtOwner].c : MUTED }}>
              {describe(target)}{route && route.length > 1 ? ` ${route.length === 2 ? t('route.via1') : t('route.via', { n: route.length - 1 })}` : ''}
            </span>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                <span>{t('shipsLabel')}</span>
                <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 20, color: CYAN }}>{t('nOf', { n, total: avail })}</span>
              </span>
              <input type="range" min={1} max={Math.max(1, avail)} value={n} onChange={(e) => setN(Number(e.target.value))} style={{ width: '100%', height: 28, accentColor: CYAN }} />
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" style={{ ...ghost, flex: 1 }} onClick={() => setN(Math.max(1, Math.ceil(avail / 2)))}>{t('half')}</button>
              <button type="button" style={{ ...ghost, flex: 1 }} onClick={() => setN(allN)}>{src?.pk == null && allN < avail ? t('allGuard', { n: avail - allN }) : t('all')}</button>
              <button type="button" style={btn(CYAN, BG, { flex: 1.4, fontSize: 19, boxShadow: '0 0 18px rgba(61,245,255,0.5)' })} onClick={go}>{v.rounds ? t('plan') : t('go')}</button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function PlanBox({ v, t, send }: { v: any; t: Translate; send: (a: any) => void }) {
  const orders = (v.orders ?? []) as any[];
  const map: MapEntry[] = v.map;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {orders.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 132, overflowY: 'auto' }}>
          {orders.map((o, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 10, background: CARD, fontSize: 14 }}>
              <span style={{ flex: 1 }}>{o.parked != null ? t('pirateFleet') : map[o.from][2]} → {map[o.to][2]} · {o.n}</span>
              <button type="button" aria-label={t('cancel')} onClick={() => send({ type: 'cancel', i })} style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${LINE}`, background: 'transparent', color: MUTED }}>✕</button>
            </div>
          ))}
        </div>
      )}
      {v.phase === 'plan' && (
        <button type="button" onClick={() => send({ type: 'ready', off: v.ready })} style={v.ready ? { ...ghost, width: '100%' } : btn('#FFD23F', BG, { width: '100%' })}>
          {v.ready ? t('plan.waiting') : t('plan.done')}
        </button>
      )}
    </div>
  );
}

/* ---------- Bauen (zentral) ---------- */

function MissionList({ v, t, list }: { v: any; t: Translate; list: MissionV[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {list.map((m, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 12, background: m.done ? '#10301f' : CARD, border: `1px solid ${m.done ? '#3c8f5e' : m.failed ? '#5a2a3a' : LINE}`, fontSize: 14 }}>
          <span style={{ fontSize: 16, width: 18, textAlign: 'center', color: m.done ? '#7CFFB2' : m.failed ? '#FF6B8A' : FAINT }}>{m.done ? '✓' : m.failed ? '✗' : '•'}</span>
          <span style={{ flex: 1, lineHeight: 1.3 }}>{missionText(m, v.map, v.emp, t)}</span>
          <span style={{ fontFamily: DISPLAY, fontWeight: 800, color: '#FFD23F', whiteSpace: 'nowrap' }}>+{m.pts}</span>
        </div>
      ))}
    </div>
  );
}

function BuildTab({ v, t, send }: { v: any; t: Translate; send: (a: any) => void }) {
  const [border, setBorder] = useState(false);
  const map: MapEntry[] = v.map;
  if (!(v.my as number[][]).length) {
    return (
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <span style={{ fontSize: 17, color: MUTED, lineHeight: 1.4 }}>{v.pirate ? t('build.pirate') : t('build.none')}</span>
        {v.missions?.length > 0 && <><span style={{ fontSize: 13, color: MUTED }}>{t('missions.yours')}</span><MissionList v={v} t={t} list={v.missions} /></>}
      </div>
    );
  }
  const rows: { k: 'eco' | 'ind' | 'sci'; best: [number, number] | null; text: string }[] = [
    { k: 'eco', best: v.best?.eco, text: t('build.eco', { n: 15 + 3 * v.tech.trade }) },
    { k: 'ind', best: border ? v.best?.indB : v.best?.ind, text: t('build.ind', { n: 3 + v.tech.prod }) },
    { k: 'sci', best: v.best?.sci, text: t('build.sci') },
  ];
  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 16px 8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 800 }}>{t('tab.build')}</span>
        <span style={{ fontSize: 13, color: MUTED }}>{t('build.cheapest')}</span>
      </div>
      {rows.map((r) => {
        const cost = r.best?.[1] ?? 0;
        const can = !!r.best && v.money >= cost;
        return (
          <div key={r.k} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14, borderRadius: 16, background: PANEL, border: `1px solid ${LINE}`, flex: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                <span style={{ fontWeight: 700, fontSize: 17, color: KIND_COLOR[r.k] }}>{t(`kind.${r.k}`)}</span>
                <span style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.best ? t('build.at', { star: starName(map, r.best[0], t) }) : '–'}</span>
                <span style={{ fontSize: 12, color: MUTED }}>{r.text}</span>
              </div>
              <button type="button" disabled={!can} onClick={() => { send({ type: 'upgradeBest', kind: r.k, border: r.k === 'ind' && border }); sfx.play('pop'); }}
                style={btn(can ? KIND_COLOR[r.k] : '#2a3360', can ? BG : FAINT, { width: 104, height: 52, fontSize: 16, flex: 'none' })}>+1 · {cost}</button>
            </div>
            {r.k === 'ind' && (
              <div style={{ display: 'flex', gap: 6 }}>
                {[false, true].map((bv) => (
                  <button key={String(bv)} type="button" onClick={() => setBorder(bv)} style={{ flex: 1, height: 34, borderRadius: 10, border: border === bv ? 'none' : '1px solid #3a4677', background: border === bv ? '#FF8A5B' : 'transparent', color: border === bv ? BG : INK, fontSize: 13, fontWeight: border === bv ? 700 : 500 }}>
                    {bv ? t('build.border') : t('build.cheap')}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 12, background: CARD, fontSize: 14, flex: 'none' }}>
        <span style={{ color: MUTED }}>{t('build.income')}</span><span style={{ fontWeight: 700, color: '#FFD23F' }}>+{t('money', { n: v.income })}</span>
      </div>
      {v.missions?.length > 0 && (
        <>
          <span style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>{t('missions.yours')}</span>
          <MissionList v={v} t={t} list={v.missions} />
        </>
      )}
    </div>
  );
}

/* ---------- Sterne einzeln ausbauen ---------- */

function StarsTab({ v, t, send }: { v: any; t: Translate; send: (a: any) => void }) {
  const my: number[][] = v.my;
  const map: MapEntry[] = v.map;
  const [sel, setSel] = useState<number | null>(null);
  const cur = my.find((m) => m[0] === sel) ?? my[0];
  useEffect(() => { if (cur && cur[0] !== sel) setSel(cur[0]); }, [cur?.[0]]);
  if (!cur) {
    return <div style={{ padding: 20, fontSize: 17, color: MUTED, lineHeight: 1.4 }}>{v.pirate ? t('build.pirate') : t('build.none')}</div>;
  }
  const [i, eco, ind, sci, cEco, cInd, cSci, prod, rally, inc] = cur;
  const sp = map[i][4];
  const rows: { k: 'eco' | 'ind' | 'sci'; lvl: number; cost: number; text: string }[] = [
    { k: 'eco', lvl: eco, cost: cEco, text: t('build.eco', { n: (15 + 3 * v.tech.trade) * (sp === 'gold' ? 2 : 1) }) },
    { k: 'ind', lvl: ind, cost: cInd, text: t('build.ind', { n: 3 + v.tech.prod }) },
    { k: 'sci', lvl: sci, cost: cSci, text: t('build.sci') },
  ];
  const c = v.emp[v.me].c;
  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14, padding: '4px 16px 8px' }}>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, flex: 'none' }}>
        {my.map((m) => (
          <button key={m[0]} type="button" onClick={() => setSel(m[0])} style={{ height: 44, padding: '0 14px', borderRadius: 22, flex: 'none', border: m[0] === i ? 'none' : `1px solid ${map[m[0]][4] ? SP_COLOR[map[m[0]][4]] : '#3a4677'}`, background: m[0] === i ? CYAN : 'transparent', color: m[0] === i ? BG : INK, fontFamily: 'var(--body)', fontWeight: m[0] === i ? 700 : 500, fontSize: 14 }}>{starName(map, m[0], t)}</button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 16, borderRadius: 18, background: 'radial-gradient(circle at 20% 50%, #13305a 0%, #0d1430 70%)', border: `1px solid ${LINE}`, flex: 'none' }}>
        <svg width="56" height="56" viewBox="0 0 64 64" aria-hidden="true">
          <circle cx="32" cy="32" r="22" fill="none" stroke={sp ? SP_COLOR[sp] : c} strokeWidth="2.5" strokeDasharray={sp === 'gold' || sp === 'lab' ? '5 4' : undefined} />
          <circle cx="32" cy="32" r="12" fill={c} style={{ filter: `drop-shadow(0 0 6px ${c})` }} />
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <span style={{ fontFamily: DISPLAY, fontSize: 25, fontWeight: 800 }}>{starName(map, i, t)}</span>
          <span style={{ fontSize: 14, color: MUTED }}>{map[i][3] === v.me ? `${t('home')} · ` : ''}{t('ships', { n: v.st[i][1] })} · {t('perYear', { n: prod })} · +{t('money', { n: inc })}</span>
          {sp && <span style={{ fontSize: 13, color: SP_COLOR[sp] }}>{t(`spd.${sp}`)}</span>}
          {rally >= 0 && <span style={{ fontSize: 13, color: '#FFD23F' }}>{t('rally.info', { star: starName(map, rally, t) })}</span>}
        </div>
      </div>
      {rows.map((r) => {
        const can = v.money >= r.cost;
        return (
          <div key={r.k} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 14, borderRadius: 16, background: PANEL, border: `1px solid ${LINE}`, flex: 'none' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
              <span style={{ fontWeight: 700, fontSize: 17, color: KIND_COLOR[r.k] }}>{t(`kind.${r.k}`)} · {t('level', { n: r.lvl })}</span>
              <span style={{ fontSize: 13, color: MUTED }}>{r.text}</span>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {Array.from({ length: r.lvl + 1 }, (_, j) => <span key={j} style={{ width: 16, height: 6, borderRadius: 3, background: j < r.lvl ? KIND_COLOR[r.k] : '#2a3360' }} />)}
              </div>
            </div>
            <button type="button" disabled={!can} onClick={() => { send({ type: 'upgrade', star: i, kind: r.k }); sfx.play('pop'); }}
              style={btn(can ? KIND_COLOR[r.k] : '#2a3360', can ? BG : FAINT, { width: 104, height: 52, fontSize: 16 })}>+1 · {r.cost}</button>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Forschung ---------- */

function ResearchTab({ v, t, send }: { v: any; t: Translate; send: (a: any) => void }) {
  const effect = (tech: Tech, lvl: number) => {
    switch (tech) {
      case 'weapons': return t('fx.weapons', { n: lvl });
      case 'range': return t('fx.range', { n: 3 + lvl });
      case 'prod': return t('fx.prod', { n: lvl });
      case 'trade': return t('fx.trade', { n: 3 * lvl });
      case 'cloak': return lvl ? t('fx.cloak', { n: 5 * lvl }) : t('fx.cloak0');
    }
  };
  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 16px 8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 800 }}>{t('tab.research')}</span>
        <span style={{ fontSize: 13, color: MUTED }}>{t('research.rate', { n: v.rate })}</span>
      </div>
      {TECHS.map((tech) => {
        const lvl: number = v.tech[tech];
        const active = v.research === tech;
        const cost = techCost(lvl + 1);
        return (
          <button key={tech} type="button" onClick={() => { if (!active) { send({ type: 'research', tech }); sfx.play('pop'); } }}
            style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', borderRadius: 14, border: active ? `2px solid ${CYAN}` : `1px solid ${LINE}`, background: active ? '#0f2440' : PANEL, color: INK, textAlign: 'left', fontFamily: 'var(--body)', flex: 'none' }}>
            <span style={{ display: 'flex', justifyContent: 'space-between', width: '100%', gap: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 16 }}>{t(`tech.${tech}`)} · {t('level', { n: lvl })}</span>
              <span style={{ fontSize: 13, color: active ? CYAN : MUTED }}>{active ? t('research.active') : effect(tech, lvl)}</span>
            </span>
            {active && (
              <>
                <span style={{ height: 6, width: '100%', borderRadius: 3, background: '#1a2248', display: 'block' }}>
                  <span style={{ display: 'block', width: `${Math.min(100, (v.rp / cost) * 100)}%`, height: 6, borderRadius: 3, background: CYAN }} />
                </span>
                <span style={{ fontSize: 12, color: MUTED }}>{t('research.progress', { a: Math.floor(v.rp), b: cost, n: lvl + 1 })} · {t(`techd.${tech}`)}</span>
              </>
            )}
          </button>
        );
      })}
      <span style={{ fontSize: 13, color: FAINT, lineHeight: 1.4 }}>{t('research.hint')}</span>
    </div>
  );
}

/* ---------- Chat ---------- */

function ChatTab({ v, t, send }: { v: any; t: Translate; send: (a: any) => void }) {
  const peers: number[] = v.chat?.peers ?? [];
  const [peer, setPeer] = useState<number | null>(peers[0] ?? null);
  const [text, setText] = useState('');
  const [amount, setAmount] = useState('');
  const [techOpen, setTechOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const cur = peer != null && peers.includes(peer) ? peer : peers[0] ?? null;
  const msgs: any[] = cur != null ? v.chat.th[cur] ?? [] : [];
  const un = cur != null ? v.chat.un?.[cur] ?? 0 : 0;
  useEffect(() => { if (un) send({ type: 'read', peer: cur }); }, [un, cur]);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [msgs.length, cur]);
  if (cur == null) return <div style={{ padding: 20, fontSize: 17, color: MUTED, lineHeight: 1.4 }}>{t('chat.nobody')}</div>;
  const emp: Emp = v.emp[cur];
  const meEmp: Emp = v.emp[v.me];
  const say = (x: string) => {
    const s = x.trim();
    if (!s) return;
    send({ type: 'chat', to: cur, text: s });
    setText('');
  };
  const quick = [t('quick.deal'), t('quick.pact'), t('quick.no'), t('quick.help')];
  const amt = Math.floor(Number(amount));
  const gifts: [Tech, number, number][] = v.chat.gifts?.[cur] ?? [];
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 16px 6px' }}>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', flex: 'none' }}>
        {peers.map((p) => {
          const e: Emp = v.emp[p];
          const n = v.chat.un?.[p] ?? 0;
          const on = p === cur;
          return (
            <button key={p} type="button" onClick={() => { setPeer(p); setTechOpen(false); }} style={{ flex: '1 0 auto', minWidth: 80, height: 44, padding: '0 10px', borderRadius: 12, border: on ? `2px solid ${e.c}` : '1px solid #3a4677', background: on ? `${e.c}22` : 'transparent', color: e.c, fontFamily: 'var(--body)', fontWeight: on ? 700 : 500, fontSize: 15 }}>
              {e.n}{n > 0 && <span style={{ marginLeft: 5, display: 'inline-block', minWidth: 18, height: 18, lineHeight: '18px', borderRadius: 9, background: '#FF4FD8', color: BG, fontSize: 11 }}>{n}</span>}
            </button>
          );
        })}
      </div>
      <div ref={listRef} style={{ flex: 1, minHeight: 80, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderRadius: 16, background: '#0b1128', border: '1px solid #1e2750' }}>
        <span style={{ alignSelf: 'center', fontSize: 12, color: '#8891b3' }}>{t('chat.private', { name: emp.n })}</span>
        {msgs.map((m) => {
          const mine = m.f === v.me;
          const c = mine ? meEmp.c : emp.c;
          if (m.m != null || m.t != null) {
            const what = m.m != null ? t('money', { n: m.m }) : `${t(`tech.${m.t}`)} ${t('level', { n: m.l })}`;
            return (
              <div key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', padding: '8px 12px', borderRadius: 12, background: '#2b2410', border: '1px solid #6b5a1c', fontSize: 14, color: '#FFD23F' }}>
                {mine ? t('chat.youSent', { name: emp.n, what }) : t('chat.sentYou', { name: emp.n, what })}
              </div>
            );
          }
          return (
            <div key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '80%', padding: '9px 12px', borderRadius: mine ? '14px 14px 4px 14px' : '14px 14px 14px 4px', background: `${c}1f`, border: `1px solid ${c}66`, fontSize: 15, lineHeight: 1.35, overflowWrap: 'anywhere' }}>{m.x}</div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', flex: 'none' }}>
        {quick.map((q) => (
          <button key={q} type="button" onClick={() => say(q)} style={{ height: 36, padding: '0 12px', borderRadius: 18, border: '1px solid #3a4677', background: 'transparent', color: INK, fontSize: 13, whiteSpace: 'nowrap', flex: 'none' }}>{q}</button>
        ))}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); say(text); }} style={{ display: 'flex', gap: 8, flex: 'none' }}>
        <input aria-label={t('chat.placeholder', { name: emp.n })} value={text} maxLength={140} onChange={(e) => setText(e.target.value)} placeholder={t('chat.placeholder', { name: emp.n })}
          style={{ flex: 1, minWidth: 0, height: 46, padding: '0 14px', borderRadius: 12, border: '1px solid #3a4677', background: PANEL, color: INK, fontSize: 16 }} />
        <button type="submit" style={btn(CYAN, BG, { width: 84, height: 46, fontSize: 15 })}>{t('chat.send')}</button>
      </form>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderRadius: 14, background: CARD, flex: 'none' }}>
        <span style={{ fontSize: 13, color: MUTED }}>{t('gift.to', { name: emp.n })}</span>
        {!techOpen ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', height: 46, padding: '0 12px', borderRadius: 12, border: '1px solid #FFD23F', background: PANEL }}>
              <input aria-label={t('gift.amount')} type="number" inputMode="numeric" min={1} max={v.money} value={amount} placeholder="0" onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))}
                style={{ flex: 1, width: 40, border: 'none', background: 'transparent', color: '#FFD23F', fontFamily: DISPLAY, fontWeight: 800, fontSize: 20, outline: 'none' }} />
              <span style={{ fontSize: 14, color: MUTED }}>{t('gift.unit')}</span>
            </div>
            <button type="button" disabled={!(amt >= 1 && amt <= v.money)} onClick={() => { send({ type: 'money', to: cur, amount: amt }); setAmount(''); sfx.play('ding'); }}
              style={btn(amt >= 1 && amt <= v.money ? '#FFD23F' : '#2a3360', amt >= 1 && amt <= v.money ? BG : FAINT, { width: 96, height: 46, fontSize: 15 })}>{t('gift.send')}</button>
            <button type="button" onClick={() => setTechOpen(true)} style={{ ...ghost, width: 84, height: 46, fontSize: 14, fontWeight: 500 }}>{t('gift.tech')}</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {gifts.map(([tech, cost, ok]) => {
              const can = !!ok && v.money >= cost;
              return (
                <button key={tech} type="button" disabled={!can} onClick={() => { send({ type: 'tech', to: cur, tech }); setTechOpen(false); sfx.play('ding'); }}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 42, padding: '0 12px', borderRadius: 10, border: `1px solid ${LINE}`, background: can ? PANEL : 'transparent', color: can ? INK : FAINT, fontSize: 14 }}>
                  <span>{t(`tech.${tech}`)}</span><span>{ok ? t('money', { n: cost }) : t('gift.noLevel')}</span>
                </button>
              );
            })}
            <button type="button" onClick={() => setTechOpen(false)} style={{ ...ghost, height: 40, fontSize: 14 }}>{t('back')}</button>
          </div>
        )}
        <span style={{ fontSize: 12, color: '#8891b3' }}>{t('gift.tvNote')}</span>
      </div>
    </div>
  );
}

/* ---------- Intro und Ende ---------- */

function PhoneIntro({ v, t, send, vip }: { v: any; t: Translate; send: (a: any) => void; vip: boolean }) {
  const [ref, size] = useSize<HTMLDivElement>();
  const now = useServerNow(500);
  const b = useMemo(() => boundsOf(v.map), [v.map]);
  const home = (v.map as MapEntry[]).findIndex((m) => m[3] === v.me);
  const box = useMemo(() => size.w ? fitBox(b.minX, b.minY, b.maxX, b.maxY, size.w, size.h, 1) : [0, 0, 1, 1] as [number, number, number, number], [size.w, size.h, b]);
  const emp: Emp = v.emp[v.me];
  const offer: MissionV[] = v.offer ?? [];
  const need = Math.min(2, offer.length);
  const [pick, setPick] = useState<number[]>([]);
  const toggle = (i: number) => {
    if (v.ready) return;
    setPick((p) => (p.includes(i) ? p.filter((x) => x !== i) : p.length >= need ? [...p.slice(1), i] : [...p, i]));
    sfx.play('pop');
  };
  const ok = pick.length === need;
  return (
    <PhoneShell vip={vip}>
      <div style={{ padding: `6px 18px 8px ${vip ? 52 : 18}px`, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 24, color: emp.c }}>{t('phone.youAre', { name: emp.n })}</span>
        <span style={{ fontSize: 14, color: MUTED }}>{t('phone.homeBlinks', { star: v.map[home]?.[2] ?? '' })}</span>
      </div>
      <div ref={ref} style={{ flex: 1, minHeight: 130, background: 'radial-gradient(circle at 50% 50%, #111a3a 0%, #070b1a 75%)' }}>
        {size.w > 0 && <StarMap v={v} w={size.w} h={size.h} box={box} sim={0} speed={0} now={now} me={v.me} blink={home} />}
      </div>
      <div style={{ padding: '12px 16px 6px', display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', maxHeight: '58%' }}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>{t('missions.pick', { n: need })}</span>
        <span style={{ fontSize: 13, color: MUTED, lineHeight: 1.35 }}>{t('missions.secret')}</span>
        {offer.map((m, i) => {
          const on = pick.includes(i);
          return (
            <button key={i} type="button" onClick={() => toggle(i)} disabled={v.ready}
              style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 50, padding: '8px 12px', borderRadius: 12, border: on ? `2px solid ${CYAN}` : `1px solid ${LINE}`, background: on ? '#0f2440' : PANEL, color: INK, textAlign: 'left', fontFamily: 'var(--body)', fontSize: 14, flex: 'none' }}>
              <span style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${on ? CYAN : '#3a4677'}`, background: on ? CYAN : 'transparent', color: BG, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>{on ? '✓' : ''}</span>
              <span style={{ flex: 1, lineHeight: 1.3 }}>{missionText(m, v.map, v.emp, t)}</span>
              <span style={{ fontFamily: DISPLAY, fontWeight: 800, color: '#FFD23F' }}>+{m.pts}</span>
            </button>
          );
        })}
        <button type="button" disabled={v.ready || !ok} onClick={() => { send({ type: 'missions', pick }); send({ type: 'ready' }); }}
          style={v.ready ? { ...ghost, width: '100%', flex: 'none' } : btn(ok ? CYAN : '#2a3360', ok ? BG : FAINT, { width: '100%', height: 52, fontSize: 18, flex: 'none' })}>
          {v.ready ? t('phone.waitStart') : ok ? t('phone.ready') : t('missions.pickMore', { n: need - pick.length })}
        </button>
      </div>
    </PhoneShell>
  );
}

function PhoneEnd({ v, t }: { v: any; t: Translate }) {
  const emp: Emp = v.emp[v.me];
  const win = v.winner != null ? v.emp[v.winner] as Emp : null;
  return (
    <PhoneShell vip={false}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 22, textAlign: 'center', overflowY: 'auto' }}>
        <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 60, color: emp.c, textShadow: `0 0 20px ${emp.c}88` }}>{t('phone.place', { n: v.place })}</span>
        <span style={{ fontSize: 20 }}>{t('phone.result', { pts: v.pts })}</span>
        <span style={{ fontSize: 14, color: MUTED }}>{t('phone.breakdown', { stars: v.stars, heart: v.heart, mis: v.mis })}</span>
        {win && <span style={{ fontSize: 17, color: MUTED }}>{v.winner === v.me ? t('phone.youWon') : t('final.win', { name: win.n })}</span>}
        {v.missions?.length > 0 && <div style={{ width: '100%', maxWidth: 420, textAlign: 'left' }}><MissionList v={v} t={t} list={v.missions} /></div>}
        <span style={{ fontSize: 15, color: FAINT }}>{t('game.lookAtTv')}</span>
      </div>
    </PhoneShell>
  );
}

function Controller({ view, t, send, room, me }: ControllerViewProps) {
  const vip = room.vipId === me.id;
  switch (view.screen) {
    case 'intro': return <PhoneIntro v={view} t={t} send={send} vip={vip} />;
    case 'play': return <PhonePlay v={view} t={t} send={send} vip={vip} />;
    case 'end': return <PhoneEnd v={view} t={t} />;
    default: return <PhoneWait title={t('watch.title')} text={t('game.lookAtTv')} />;
  }
}

export default { Host, Controller } satisfies GameClientModule;
