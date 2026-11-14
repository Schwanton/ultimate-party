/** Sternenpakt – Ansichten für Fernseher (Sternkarte) und Handy (Kommandopult). */

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { ControllerViewProps, GameClientModule, HostViewProps, Translate } from '@up/sdk';
import { Avatar, Confetti, PhoneWait, sfx, useServerNow, vibrate } from '@up/ui';
import { FLIGHT, PIRATE_RANGE, TECHS, YEAR, techCost, type Tech } from './engine';

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

/* ---------- Typen der Ansichten ---------- */

type MapEntry = [number, number, string, number];
type Emp = { id: string; n: string; c: string; ai: boolean; p: boolean; o: boolean };
type StarDyn = [number, number | string];
/** [id, Besitzer, Schiffe, x0, y0, Ziel, t0, t1, getarnt(eigene)] */
type FleetT = [number, number, number | string, number, number, number, number, number, number];
/** [id, Besitzer, Schiffe, x, y] */
type ParkT = [number, number, number | string, number, number];
type Clock = { sim: number; at: number; speed: number };
type Fx = { id: number; star: number; k: string; at: number };

interface MapData {
  map: MapEntry[];
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
  onTap?: (x: number, y: number, u: number) => void;
}

function StarMap({ v, w, h, box, sim, speed, now, me = -1, tv, names, sel, target, range, reach, blink, owners, onTap }: MapProps) {
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
      </defs>
      {/* Reichweite */}
      {src && range != null && (
        <circle cx={src.x} cy={src.y} r={range} fill={CYAN} fillOpacity={0.05} stroke={CYAN} strokeOpacity={0.5} strokeWidth={1.2 * u} strokeDasharray={`${4 * u} ${6 * u}`} />
      )}
      {src && target != null && (
        <line x1={src.x} y1={src.y} x2={v.map[target][0]} y2={v.map[target][1]} stroke={CYAN} strokeWidth={3 * u} strokeDasharray={`${7 * u} ${6 * u}`} />
      )}
      {/* Flugbahnen */}
      {v.fl?.map((f) => {
        const [id, o, , x0, y0, to, t0, t1, cl] = f;
        const [tx, ty] = v.map[to];
        const p = Math.min(1, Math.max(0, (sim - t0) / Math.max(0.01, t1 - t0)));
        const x = x0 + (tx - x0) * p, y = y0 + (ty - y0) * p;
        return <line key={`l${id}`} x1={x} y1={y} x2={tx} y2={ty} stroke={ownerColor(v.emp, o)} strokeWidth={2 * u * k} strokeDasharray={`${6 * u} ${6 * u}`} opacity={cl ? 0.45 : 0.8} />;
      })}
      {/* Sterne */}
      {v.map.map(([x, y, , home], i) => {
        const o = own(i);
        const c = ownerColor(v.emp, o);
        const mine = me >= 0 && o === me;
        if (o < 0) {
          return (
            <g key={i}>
              <circle cx={x} cy={y} r={5 * u * k} fill={NEUTRAL} />
              {reach?.has(i) && <circle cx={x} cy={y} r={14 * u} fill="none" stroke={INK} strokeOpacity={0.55} strokeWidth={1.4 * u} strokeDasharray={`${3 * u} ${3 * u}`} />}
            </g>
          );
        }
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={(home >= 0 ? 22 : 18) * u * k} fill={c} opacity={mine ? 0.22 : 0.13} />
            {home >= 0 && <circle cx={x} cy={y} r={12 * u * k} fill="none" stroke={c} strokeWidth={2 * u} />}
            <circle cx={x} cy={y} r={(home >= 0 ? 7 : 6) * u * k} fill={c} filter={glow} />
            {reach?.has(i) && <circle cx={x} cy={y} r={15 * u} fill="none" stroke={INK} strokeOpacity={0.55} strokeWidth={1.4 * u} strokeDasharray={`${3 * u} ${3 * u}`} />}
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
                <text x={x} y={y + (o >= 0 ? 27 : 21) * u * k} fontSize={(o >= 0 ? 15 : 13) * u * k} fontWeight={800} fill={o >= 0 ? ownerColor(v.emp, o) : NEUTRAL}>{ships}</text>
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
  const star = m.star != null ? v.map[m.star]?.[2] : '';
  const N = '\u0001';
  switch (m.k) {
    case 'conquer': return { text: t('msg.conquer', { name: N, star }), name: e?.n, color: e?.c };
    case 'hold': return e ? { text: t('msg.hold', { name: N, star }), name: e.n, color: e.c } : { text: t('msg.holdFree', { star }) };
    case 'pirate': return { text: t('msg.pirate', { name: N }), name: e?.n, color: e?.c };
    case 'spawn': return { text: t('msg.spawn', { name: N }), name: e?.n, color: e?.c };
    case 'out': return { text: t('msg.out', { name: N }), name: e?.n, color: e?.c };
    case 'gift': return { text: t('msg.gift') };
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
      else if (m.k === 'gift') sfx.play('ding');
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
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: MUTED }}><span>{t('stars')}</span><span>{t('winAt', { n: v.half })}</span></div>
          {(v.rank as [number, number][]).map(([e, n]) => {
            const emp: Emp = v.emp[e];
            return (
              <div key={e} style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: emp.o ? 0.4 : 1 }}>
                <span style={{ width: 12, height: 12, borderRadius: 6, background: emp.c, boxShadow: `0 0 8px ${emp.c}`, flex: 'none' }} />
                <span style={{ flex: 1, fontWeight: 700, fontSize: many ? 15 : 17, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {emp.n}{emp.ai && <span style={{ color: FAINT, fontWeight: 500, fontSize: 12 }}> · {t('ai')}</span>}{emp.p && <span style={{ color: '#FF8A5B', fontWeight: 700, fontSize: 12 }}> · {t('pirate')}</span>}
                </span>
                <span style={{ fontFamily: DISPLAY, fontSize: many ? 18 : 22, fontWeight: 800 }}>{n}</span>
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
    ['#FF4FD8', t('intro.pacts')],
  ];
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', background: 'radial-gradient(circle at 30% 50%, #111a3a 0%, #070b1a 70%)', color: INK }}>
      <div style={{ width: 560, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <StarMap v={v} w={520} h={600} box={box} sim={sim} speed={0} now={now} tv />
      </div>
      <div style={{ flex: 1, padding: '44px 48px 40px 10px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <span className="anim-pop" style={{ fontFamily: DISPLAY, fontSize: 72, fontWeight: 800, lineHeight: 1, color: CYAN, textShadow: `0 0 24px ${CYAN}88` }}>{t('title')}</span>
        {rules.map(([c, text], i) => (
          <div key={i} className="anim-up" style={{ display: 'flex', gap: 14, alignItems: 'flex-start', animationDelay: `${0.2 + i * 0.25}s` }}>
            <span style={{ width: 14, height: 14, borderRadius: 7, background: c, boxShadow: `0 0 10px ${c}`, marginTop: 7, flex: 'none' }} />
            <span style={{ fontSize: 21, lineHeight: 1.35 }}>{text}</span>
          </div>
        ))}
        <div className="anim-up" style={{ fontSize: 21, lineHeight: 1.35, padding: '12px 16px', borderRadius: 14, background: CARD, border: `1px solid ${LINE}`, animationDelay: '1.3s' }}>
          {t('intro.goal', { n: v.half, years: v.years })}
        </div>
        {v.rounds && <span style={{ fontSize: 18, color: '#FFD23F' }}>{t('intro.rounds')}</span>}
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
  const data: MapData = { map: v.map, emp: v.emp, st: hist[i].map((o) => [o, 0] as StarDyn) };
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

function TvFinal({ v, t, player }: { v: any; t: Translate; player: HostViewProps['player'] }) {
  const res: { e: number; stars: number; ships: number; pts: number }[] = v.result;
  const win = res[0] ? v.emp[res[0].e] as Emp : null;
  useEffect(() => { sfx.play('fanfare'); }, []);
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 30%, #16204a 0%, #070b1a 70%)', color: INK, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '36px 60px', gap: 20 }}>
      <Confetti silent />
      {win && (
        <span className="anim-pop" style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 56, color: win.c, textShadow: `0 0 26px ${win.c}88`, textAlign: 'center' }}>
          {t('final.win', { name: win.n })}
        </span>
      )}
      <div style={{ width: 760, display: 'flex', flexDirection: 'column', gap: res.length > 8 ? 6 : 10 }}>
        <div style={{ display: 'flex', fontSize: 14, color: MUTED, padding: '0 18px' }}>
          <span style={{ flex: 1 }} /><span style={{ width: 110, textAlign: 'right' }}>{t('stars')}</span><span style={{ width: 130, textAlign: 'right' }}>{t('points')}</span>
        </div>
        {res.map((r, i) => {
          const emp: Emp = v.emp[r.e];
          const p = !emp.ai ? player(emp.id) : undefined;
          const small = res.length > 8;
          return (
            <div key={r.e} className="anim-up" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: small ? '5px 18px' : '9px 18px', borderRadius: 14, background: i === 0 ? '#1b2a55' : CARD, border: `1px solid ${i === 0 ? emp.c : LINE}`, animationDelay: `${i * 0.08}s` }}>
              <span style={{ width: 30, fontFamily: DISPLAY, fontWeight: 800, fontSize: small ? 18 : 22, color: MUTED }}>{i + 1}.</span>
              {p ? <Avatar player={p} size={small ? 30 : 40} /> : <span style={{ width: small ? 30 : 40, height: small ? 30 : 40, borderRadius: '50%', border: `2px solid ${emp.c}`, boxSizing: 'border-box' }} />}
              <span style={{ width: 12, height: 12, borderRadius: 6, background: emp.c, boxShadow: `0 0 8px ${emp.c}` }} />
              <b style={{ flex: 1, fontSize: small ? 17 : 20 }}>{emp.n}{emp.ai && <span style={{ color: FAINT, fontWeight: 500, fontSize: 14 }}> · {t('ai')}</span>}</b>
              <span style={{ width: 110, textAlign: 'right', fontFamily: DISPLAY, fontWeight: 800, fontSize: small ? 18 : 22 }}>{r.stars}</span>
              <span style={{ width: 130, textAlign: 'right', fontFamily: DISPLAY, fontWeight: 800, fontSize: small ? 18 : 22, color: '#FFD23F' }}>{emp.ai ? '–' : r.pts}</span>
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

type Tab = 'map' | 'build' | 'research' | 'chat';

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
  const tabs: [Tab, string][] = [['map', t('tab.map')], ['build', t('tab.build')], ['research', t('tab.research')], ['chat', t('tab.chat')]];
  return (
    <PhoneShell vip={vip}>
      <PhoneHeader v={v} t={t} vip={vip} />
      {noteShown === lastNote?.id && lastNote && (
        <div className="anim-pop" style={{ margin: '0 14px 8px', padding: '9px 12px', borderRadius: 12, background: '#1b2a55', border: `1px solid ${CYAN}`, fontSize: 15, fontWeight: 700 }}>
          {lastNote.k === 'tech' ? t('note.tech', { tech: t(`tech.${lastNote.tech}`), n: lastNote.level }) : t('note.spawn', { n: lastNote.ships })}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {tab === 'map' && <MapTab v={v} t={t} send={send} />}
        {tab === 'build' && <BuildTab v={v} t={t} send={send} />}
        {tab === 'research' && <ResearchTab v={v} t={t} send={send} />}
        {tab === 'chat' && <ChatTab v={v} t={t} send={send} />}
      </div>
      <nav aria-label={t('tab.nav')} style={{ display: 'flex', gap: 6, padding: '8px 14px 0' }}>
        {tabs.map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)} style={{ flex: 1, height: 46, borderRadius: 10, border: 'none', background: tab === id ? '#1d2a55' : 'transparent', color: tab === id ? CYAN : MUTED, fontFamily: 'var(--body)', fontWeight: tab === id ? 700 : 500, fontSize: 14, position: 'relative' }}>
            {label}
            {id === 'chat' && unread > 0 && <span style={{ marginLeft: 5, display: 'inline-block', minWidth: 18, height: 18, lineHeight: '18px', borderRadius: 9, background: '#FF4FD8', color: BG, fontSize: 11, fontWeight: 700 }}>{unread}</span>}
          </button>
        ))}
      </nav>
    </PhoneShell>
  );
}

/* ---------- Karte: Flotte schicken ---------- */

function MapTab({ v, t, send }: { v: any; t: Translate; send: (a: any) => void }) {
  const [ref, size] = useSize<HTMLDivElement>();
  const { sim, now } = useSim(v.clock, 150);
  const [src, setSrc] = useState<{ star?: number; pk?: number } | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const [n, setN] = useState(1);
  const [info, setInfo] = useState<number | null>(null);
  const map: MapEntry[] = v.map;
  const st: StarDyn[] = v.st;
  const pk: ParkT[] = v.pk ?? [];
  const me: number = v.me;
  const planned = (from: number) => ((v.orders ?? []) as any[]).filter((o) => o.parked == null && o.from === from).reduce((a, o) => a + o.n, 0);
  const srcPk = src?.pk != null ? pk.find((p) => p[0] === src.pk && p[1] === me) : undefined;
  const srcValid = src?.star != null ? st[src.star]?.[0] === me : !!srcPk;
  const avail = !srcValid ? 0 : src?.star != null ? Math.max(0, Number(st[src.star][1]) - planned(src.star)) : Number(srcPk?.[2] ?? 0);
  const range = srcPk ? PIRATE_RANGE : v.range;
  const origin = src?.star != null ? { x: map[src.star][0], y: map[src.star][1] } : srcPk ? { x: srcPk[3], y: srcPk[4] } : null;
  const reach = useMemo(() => {
    const set = new Set<number>();
    if (!origin || !srcValid) return set;
    map.forEach(([x, y], i) => { if (i !== src?.star && d2(origin.x, origin.y, x, y) <= range + 1e-6) set.add(i); });
    return set;
  }, [origin?.x, origin?.y, range, srcValid, map, src?.star]);
  useEffect(() => {
    if (src && (!srcValid || avail < 1)) { setSrc(null); setTarget(null); }
  }, [srcValid, avail]);
  useEffect(() => { setN((x) => Math.max(1, Math.min(avail, x))); }, [avail]);

  const b = useMemo(() => boundsOf(map), [map]);
  const box = useMemo<[number, number, number, number]>(() => {
    if (!size.w || !size.h) return [0, 0, 1, 1];
    if (origin && srcValid) {
      const r = range + 1.3;
      return fitBox(origin.x - r, origin.y - r, origin.x + r, origin.y + r, size.w, size.h, 0);
    }
    return fitBox(b.minX, b.minY, b.maxX, b.maxY, size.w, size.h, 1);
  }, [size.w, size.h, origin?.x, origin?.y, srcValid, range, b]);

  const onTap = (x: number, y: number, u: number) => {
    const thr = 30 * u;
    let best = -1, bd = Infinity;
    map.forEach(([sx, sy], i) => { const dd = d2(x, y, sx, sy); if (dd < bd) { bd = dd; best = i; } });
    const star = bd <= thr ? best : -1;
    const myPk = pk.filter((p) => p[1] === me).map((p) => ({ p, d: d2(x, y, p[3], p[4]) })).sort((a, b2) => a.d - b2.d)[0];
    const pkHit = myPk && myPk.d <= thr && myPk.d < bd ? myPk.p : null;
    setInfo(null);
    if (src && srcValid) {
      if (star >= 0 && star === src.star) { setSrc(null); setTarget(null); return; }
      if (star >= 0 && reach.has(star) && !pkHit) { setTarget(star); setN(avail); return; }
      if (star >= 0 && st[star][0] === me && Number(st[star][1]) - planned(star) > 0) { setSrc({ star }); setTarget(null); return; }
      if (pkHit) { setSrc({ pk: pkHit[0] }); setTarget(null); return; }
      setTarget(null);
      return;
    }
    if (pkHit) { setSrc({ pk: pkHit[0] }); setTarget(null); return; }
    if (star >= 0 && st[star][0] === me && Number(st[star][1]) - planned(star) > 0) { setSrc({ star }); setTarget(null); return; }
    if (star >= 0) setInfo(star);
  };

  const go = () => {
    if (target == null || !src) return;
    send(src.pk != null ? { type: 'send', parked: src.pk, to: target, n } : { type: 'send', from: src.star, to: target, n });
    vibrate(30);
    sfx.play('whoosh');
    setSrc(null);
    setTarget(null);
  };

  const step = !src ? 1 : target == null ? 2 : 3;
  const srcName = src?.star != null ? map[src.star][2] : t('pirateFleet');
  const flight = origin && target != null ? d2(origin.x, origin.y, map[target][0], map[target][1]) * FLIGHT : 0;
  const tgtOwner = target != null ? st[target][0] : -1;
  const ownerName = (o: number) => (o >= 0 ? v.emp[o].n : '');
  const describe = (i: number) => {
    const [o, ships] = st[i];
    if (o === me) return t('target.own', { star: map[i][2], n: ships });
    if (o < 0) return t('target.free', { star: map[i][2], n: ships });
    return t('target.enemy', { star: map[i][2], name: ownerName(o), n: ships });
  };
  const chips = (
    <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', fontSize: 13 }}>
      {[t('step.start'), t('step.target'), t('step.ships')].map((label, i) => (
        <span key={i} style={{ flex: 1, textAlign: 'center', padding: '6px 0', borderRadius: 8, background: step === i + 1 ? CYAN : '#12304a', color: step === i + 1 ? BG : CYAN, fontWeight: step === i + 1 ? 700 : 500 }}>{i + 1} {label}</span>
      ))}
    </div>
  );

  return (
    <>
      {chips}
      <div ref={ref} style={{ flex: 1, minHeight: 160, position: 'relative', background: 'radial-gradient(circle at 50% 50%, #111a3a 0%, #070b1a 75%)', overflow: 'hidden' }}>
        {size.w > 0 && (
          <StarMap v={v} w={size.w} h={size.h} box={box} sim={sim} speed={v.clock?.speed ?? 0} now={now} me={me} names={!!origin}
            sel={src && srcValid ? { star: src.star, pk: srcPk } : null} target={target} range={origin ? range : undefined} reach={reach} onTap={onTap} />
        )}
        {origin && srcValid && (
          <button type="button" onClick={() => { setSrc(null); setTarget(null); }} style={{ position: 'absolute', right: 10, top: 10, height: 34, padding: '0 12px', borderRadius: 17, border: `1px solid ${LINE}`, background: 'rgba(13,20,48,.85)', color: INK, fontSize: 13 }}>{t('map.whole')}</button>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '16px 16px 4px', background: PANEL, borderTop: `1px solid ${LINE}`, borderRadius: '20px 20px 0 0', marginTop: -14, position: 'relative' }}>
        {v.pirate && !pk.some((p) => p[1] === me) && <span style={{ fontSize: 15, color: '#FF8A5B', fontWeight: 700 }}>{t('pirate.wait')}</span>}
        {step === 1 && (
          <>
            <span style={{ fontSize: 15, color: MUTED }}>{info != null ? describe(info) : v.pirate ? t('map.hintPirate') : t('map.hint')}</span>
            {v.rounds && <PlanBox v={v} t={t} send={send} />}
          </>
        )}
        {step === 2 && (
          <>
            <span style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 800 }}>{srcName} · {t('ships', { n: avail })}</span>
            <span style={{ fontSize: 15, color: MUTED }}>{reach.size ? t('map.pickTarget', { n: range }) : t('map.noTarget')}</span>
          </>
        )}
        {step === 3 && target != null && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontFamily: DISPLAY, fontSize: 21, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{srcName} → {map[target][2]}</span>
              <span style={{ fontSize: 14, color: MUTED, whiteSpace: 'nowrap' }}>{v.rounds ? t('arrive.rounds', { n: Math.max(1, Math.ceil(flight / YEAR)) }) : t('arrive', { time: fmt(flight) })}</span>
            </div>
            <span style={{ fontSize: 14, color: tgtOwner >= 0 && tgtOwner !== me ? v.emp[tgtOwner].c : MUTED }}>{describe(target)}</span>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                <span>{t('shipsLabel')}</span>
                <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 20, color: CYAN }}>{t('nOf', { n, total: avail })}</span>
              </span>
              <input type="range" min={1} max={Math.max(1, avail)} value={n} onChange={(e) => setN(Number(e.target.value))} style={{ width: '100%', height: 28, accentColor: CYAN }} />
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" style={{ ...ghost, flex: 1 }} onClick={() => setN(Math.max(1, Math.ceil(avail / 2)))}>{t('half')}</button>
              <button type="button" style={{ ...ghost, flex: 1 }} onClick={() => setN(avail)}>{t('all')}</button>
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

/* ---------- Ausbau ---------- */

function BuildTab({ v, t, send }: { v: any; t: Translate; send: (a: any) => void }) {
  const my: number[][] = v.my;
  const map: MapEntry[] = v.map;
  const [sel, setSel] = useState<number | null>(null);
  const cur = my.find((m) => m[0] === sel) ?? my[0];
  useEffect(() => { if (cur && cur[0] !== sel) setSel(cur[0]); }, [cur?.[0]]);
  if (!cur) {
    return <div style={{ padding: 20, fontSize: 17, color: MUTED, lineHeight: 1.4 }}>{v.pirate ? t('build.pirate') : t('build.none')}</div>;
  }
  const [i, eco, ind, sci, cEco, cInd, cSci, prod] = cur;
  const rows: { k: 'eco' | 'ind' | 'sci'; lvl: number; cost: number; text: string }[] = [
    { k: 'eco', lvl: eco, cost: cEco, text: t('build.eco', { n: 10 + 3 * v.tech.trade }) },
    { k: 'ind', lvl: ind, cost: cInd, text: t('build.ind', { n: 2 + v.tech.prod }) },
    { k: 'sci', lvl: sci, cost: cSci, text: t('build.sci') },
  ];
  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14, padding: '4px 16px 8px' }}>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, flex: 'none' }}>
        {my.map((m) => (
          <button key={m[0]} type="button" onClick={() => setSel(m[0])} style={{ height: 44, padding: '0 14px', borderRadius: 22, flex: 'none', border: m[0] === i ? 'none' : '1px solid #3a4677', background: m[0] === i ? CYAN : 'transparent', color: m[0] === i ? BG : INK, fontFamily: 'var(--body)', fontWeight: m[0] === i ? 700 : 500, fontSize: 14 }}>{map[m[0]][2]}</button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 16, borderRadius: 18, background: 'radial-gradient(circle at 20% 50%, #13305a 0%, #0d1430 70%)', border: `1px solid ${LINE}`, flex: 'none' }}>
        <svg width="56" height="56" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="22" fill="none" stroke={v.emp[v.me].c} strokeWidth="2.5" /><circle cx="32" cy="32" r="12" fill={v.emp[v.me].c} style={{ filter: `drop-shadow(0 0 6px ${v.emp[v.me].c})` }} /></svg>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <span style={{ fontFamily: DISPLAY, fontSize: 25, fontWeight: 800 }}>{map[i][2]}</span>
          <span style={{ fontSize: 14, color: MUTED }}>{map[i][3] === v.me ? `${t('home')} · ` : ''}{t('ships', { n: v.st[i][1] })} · {t('perYear', { n: prod })}</span>
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
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 12, background: CARD, fontSize: 14, flex: 'none' }}>
        <span style={{ color: MUTED }}>{t('build.income')}</span><span style={{ fontWeight: 700, color: '#FFD23F' }}>+{t('money', { n: v.income })}</span>
      </div>
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
  return (
    <PhoneShell vip={vip}>
      <div style={{ padding: `6px 18px 10px ${vip ? 52 : 18}px`, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 26, color: emp.c }}>{t('phone.youAre', { name: emp.n })}</span>
        <span style={{ fontSize: 15, color: MUTED }}>{t('phone.homeBlinks', { star: v.map[home]?.[2] ?? '' })}</span>
      </div>
      <div ref={ref} style={{ flex: 1, minHeight: 200, background: 'radial-gradient(circle at 50% 50%, #111a3a 0%, #070b1a 75%)' }}>
        {size.w > 0 && <StarMap v={v} w={size.w} h={size.h} box={box} sim={0} speed={0} now={now} me={v.me} blink={home} />}
      </div>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={{ fontSize: 15, lineHeight: 1.4, color: MUTED }}>{t('phone.introText')}</span>
        <button type="button" disabled={v.ready} onClick={() => send({ type: 'ready' })} style={v.ready ? { ...ghost, width: '100%' } : btn(CYAN, BG, { width: '100%', height: 54, fontSize: 19 })}>
          {v.ready ? t('phone.waitStart') : t('phone.ready')}
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
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, textAlign: 'center' }}>
        <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 64, color: emp.c, textShadow: `0 0 20px ${emp.c}88` }}>{t('phone.place', { n: v.place })}</span>
        <span style={{ fontSize: 20 }}>{t('phone.result', { stars: v.stars, pts: v.pts })}</span>
        {win && <span style={{ fontSize: 17, color: MUTED }}>{v.winner === v.me ? t('phone.youWon') : t('final.win', { name: win.n })}</span>}
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
