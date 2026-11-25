import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import type { ControllerViewProps, GameClientModule, HostViewProps, PlayerInfo, Translate } from '@up/sdk';
import { Confetti, PhoneTimer, PhoneWait, Podium, HostTimer, useServerNow, useStream } from '@up/ui';

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
const DISPLAY = '"Exo 2", "Chakra Petch", var(--display), sans-serif';
const TP = '#2EF2C8';

const TOWER_COLOR: Record<string, string> = { T: '#E8ECFF', L: '#3EF0FF', P: '#FF7A3D', F: '#7FB2FF', K: '#C9A6FF', R: '#FF4FD8', A: '#9CFF6B', Q: '#B8FF3D', V: '#FFD43B' };
const TYPES = ['L', 'P', 'F', 'K', 'R', 'A', 'Q', 'V'];
const MONSTER_KEYS = ['laeufer', 'flitzer', 'panzer', 'schwarm', 'flieger', 'heiler', 'spalter', 'springer', 'schild', 'boss', 'splitter'];
const MONSTER_COLOR = ['#FF7AE6', '#FFD43B', '#B9C2D4', '#FF9F1C', '#9CFF6B', '#2ED47A', '#C9A6FF', '#6BE4FF', '#7FB2FF', '#FF4D4D', '#FFB3E6'];
const ZONE_COLOR: Record<string, string> = { slow: '80,140,255', fast: '255,77,77', dmg: '255,212,59', range: '170,100,255', nobuild: '120,125,150' };

type Pt = [number, number];
interface Zone { k: string; x: number; y: number; w: number; h: number; s: number }
interface MapInfo { w: number; h: number; start: Pt; core: Pt; cps: Pt[]; tps: { i: Pt; o: Pt }[]; zones: Zone[]; maxLimit: number }
interface LegOut { l: number; j: number; p: Pt[] }
interface BoardOut { idx: number; bs: [number, number, number, number, string, number, number, number][]; rocks: Pt[]; legs: LegOut[] }

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
const fmtTime = (s: number) => (s > 0 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '–');

/* ================= Karte (SVG in Feld-Einheiten) ================= */

function arrowsOf(legs: LegOut[], n: number) {
  const out: { x: number; y: number; a: number; c: string }[] = [];
  for (const g of legs) {
    if (g.j) continue;
    let acc = 1.5;
    for (let k = 1; k < g.p.length; k++) {
      const [ax, ay] = g.p[k - 1], [bx, by] = g.p[k];
      const len = Math.hypot(bx - ax, by - ay), a = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
      for (let d = 0; d < len; d += 0.25) {
        acc += 0.25;
        if (acc >= 4) { acc = 0; out.push({ x: ax + ((bx - ax) * d) / len, y: ay + ((by - ay) * d) / len, a, c: legColor(g.l, n) }); }
      }
    }
  }
  return out;
}

function MapLayer({ map, rocks, legs, bs, selected, monsters, labels = true }: { map: MapInfo; rocks: Pt[]; legs: LegOut[]; bs?: BoardOut['bs']; selected?: number | string | null; monsters?: number[]; labels?: boolean }) {
  const n = map.cps.length + 1;
  const arrows = useMemo(() => arrowsOf(legs, n), [legs, n]);
  const sq = (p: Pt) => ({ x: p[0], y: p[1] });
  return (
    <g>
      <rect x={0} y={0} width={map.w} height={map.h} fill="#121839" />
      {map.zones.map((z, i) => (
        <rect key={i} x={z.x} y={z.y} width={z.w} height={z.h} rx={0.6} fill={`rgba(${ZONE_COLOR[z.k]},${zoneAlpha(z).toFixed(2)})`} stroke={`rgba(${ZONE_COLOR[z.k]},.6)`} strokeWidth={0.06} />
      ))}
      {rocks.map((p, i) => <rect key={'r' + i} {...sq(p)} width={2} height={2} rx={0.8} fill="#4A4658" stroke={selected === `rock:${p[0]},${p[1]}` ? CYAN : 'none'} strokeWidth={0.15} />)}
      {map.tps.map((t, i) => (
        <g key={'tp' + i}>
          <circle cx={t.i[0] + 1} cy={t.i[1] + 1} r={0.9} fill="rgba(10,15,40,.7)" stroke={TP} strokeWidth={0.12} />
          <circle cx={t.o[0] + 1} cy={t.o[1] + 1} r={0.9} fill="rgba(10,15,40,.7)" stroke={TP} strokeWidth={0.12} strokeDasharray="0.3 0.2" />
          {labels && <>
            <text x={t.i[0] + 1} y={t.i[1] + 0.95} fontSize={0.42} textAnchor="middle" fill={TP} fontWeight={800}>TP{i + 1}</text>
            <text x={t.i[0] + 1} y={t.i[1] + 1.45} fontSize={0.42} textAnchor="middle" fill={TP} fontWeight={800}>IN</text>
            <text x={t.o[0] + 1} y={t.o[1] + 0.95} fontSize={0.42} textAnchor="middle" fill={TP} fontWeight={800}>TP{i + 1}</text>
            <text x={t.o[0] + 1} y={t.o[1] + 1.45} fontSize={0.42} textAnchor="middle" fill={TP} fontWeight={800}>OUT</text>
          </>}
        </g>
      ))}
      <rect x={map.start[0]} y={map.start[1]} width={2} height={2} rx={0.4} fill="rgba(46,212,122,.35)" stroke="#2ED47A" strokeWidth={0.12} />
      {labels && <text x={map.start[0] + 1} y={map.start[1] + 1.35} fontSize={1} textAnchor="middle" fill="#2ED47A" fontWeight={800}>S</text>}
      <circle cx={map.core[0] + 1} cy={map.core[1] + 1} r={1} fill="url(#ctdCore)" />
      {map.cps.map((p, i) => (
        <g key={'cp' + i}>
          <circle cx={p[0] + 1} cy={p[1] + 1} r={0.8} fill="#FFFFFF" />
          {labels && <text x={p[0] + 1} y={p[1] + 1.35} fontSize={1} textAnchor="middle" fill={BG} fontWeight={800}>{i + 1}</text>}
        </g>
      ))}
      {bs?.map(([id, kind, x, y, type, level]) => {
        const sel = selected === id;
        if (kind === 0) return <rect key={id} x={x + 0.03} y={y + 0.03} width={0.94} height={0.94} rx={0.12} fill="#3B4470" stroke={sel ? CYAN : '#6A76B0'} strokeWidth={sel ? 0.16 : 0.07} />;
        if (kind === 2) return (
          <g key={id}>
            <rect x={x + 0.1} y={y + 0.1} width={1.8} height={1.8} rx={0.3} fill="#10203A" stroke={sel ? '#FFFFFF' : CYAN} strokeWidth={0.14} />
            {labels && <text x={x + 1} y={y + 1.3} fontSize={0.75} textAnchor="middle" fill={CYAN} fontWeight={800}>+10</text>}
          </g>
        );
        const c = TOWER_COLOR[type] ?? TEXT;
        return (
          <g key={id}>
            {sel && <circle cx={x + 1} cy={y + 1} r={1.05} fill="none" stroke={CYAN} strokeWidth={0.18} />}
            <circle cx={x + 1} cy={y + 1} r={0.82} fill="#0A0F28" stroke={c} strokeWidth={0.14} />
            {type === 'T' ? <circle cx={x + 1} cy={y + 1} r={0.22} fill={c} /> : labels && <text x={x + 1} y={y + 1.32} fontSize={0.9} textAnchor="middle" fill={c} fontWeight={800}>{type}</text>}
            {level > 1 && <text x={x + 1.75} y={y + 0.55} fontSize={0.55} textAnchor="middle" fill={YELLOW} fontWeight={800}>{'•'.repeat(level - 1)}</text>}
          </g>
        );
      })}
      {legs.map((g, i) => (
        <polyline key={'l' + i} points={g.p.map((p) => p.join(',')).join(' ')} fill="none" stroke={g.j ? 'rgba(46,242,200,.6)' : legColor(g.l, n)} strokeWidth={g.j ? 0.12 : 0.2} strokeDasharray={g.j ? '0.3 0.35' : undefined} strokeLinejoin="round" strokeLinecap="round" />
      ))}
      {arrows.map((a, i) => <path key={'a' + i} d="M-0.3,-0.33 L0.38,0 L-0.3,0.33 Z" fill={a.c} transform={`translate(${a.x},${a.y}) rotate(${a.a})`} />)}
      {monsters && Array.from({ length: Math.floor(monsters.length / 4) }, (_, k) => {
        const x = monsters[k * 4] / 10, y = monsters[k * 4 + 1] / 10, ti = monsters[k * 4 + 2], hp = monsters[k * 4 + 3];
        const c = MONSTER_COLOR[ti] ?? PINK;
        const r = ti === 9 ? 0.6 : ti === 3 || ti === 10 ? 0.28 : 0.38;
        return (
          <g key={'m' + k} style={{ transform: `translate(${x}px,${y}px)`, transition: 'transform 0.2s linear' }}>
            <circle r={r} fill={c} />
            {hp < 9 && <rect x={-0.45} y={-r - 0.25} width={0.09 * (hp + 1)} height={0.12} fill="#2ED47A" />}
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

/** feste Vorschau (TV) */
function MapPreview({ m, width, height }: { m: MapInfo & { rocks: Pt[]; legs: LegOut[] }; width: number; height: number }) {
  const s = Math.min(width / m.w, height / m.h);
  return (
    <svg width={m.w * s} height={m.h * s} viewBox={`0 0 ${m.w} ${m.h}`} style={{ display: 'block', borderRadius: 4, border: `1px solid ${LINE}` }} aria-hidden="true">
      <CoreGradient />
      <MapLayer map={m} rocks={m.rocks} legs={m.legs} labels={false} />
    </svg>
  );
}

/** Karte am Handy: zoomen mit zwei Fingern, schieben, antippen */
function MapView({ map, board, monsters, selected, height, onTap, fitLabel }: { map: MapInfo; board: BoardOut; monsters?: number[]; selected?: number | string | null; height: number; onTap: (x: number, y: number) => void; fitLabel: string }) {
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
  const gest = useRef<{ tf: typeof cur; p0: Map<number, { x: number; y: number }>; moved: boolean; multi: boolean } | null>(null);
  const local = (e: RPointerEvent) => { const r = box.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
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
        pts.current.set(e.pointerId, local(e));
        gest.current = { tf: cur, p0: new Map(pts.current), moved: gest.current?.moved && pts.current.size > 1 ? true : false, multi: pts.current.size > 1 || !!gest.current?.multi };
      }}
      onPointerMove={(e) => {
        if (!pts.current.has(e.pointerId) || !gest.current) return;
        pts.current.set(e.pointerId, local(e));
        const g = gest.current;
        const ids = [...pts.current.keys()];
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
          const p0 = g.p0.get(ids[0]), p1 = pts.current.get(ids[0])!;
          if (!p0) return;
          if (Math.hypot(p1.x - p0.x, p1.y - p0.y) > 8) g.moved = true;
          if (g.moved) setTf(clamp({ s: g.tf.s, tx: g.tf.tx + p1.x - p0.x, ty: g.tf.ty + p1.y - p0.y }));
        }
      }}
      onPointerUp={(e) => {
        const g = gest.current;
        const p = pts.current.get(e.pointerId);
        pts.current.delete(e.pointerId);
        if (g && p && !g.moved && !g.multi && pts.current.size === 0) onTap((p.x - cur.tx) / cur.s, (p.y - cur.ty) / cur.s);
        if (pts.current.size === 0) gest.current = null;
        else gest.current = { tf: cur, p0: new Map(pts.current), moved: true, multi: true };
      }}
      onPointerCancel={(e) => { pts.current.delete(e.pointerId); if (!pts.current.size) gest.current = null; }}
    >
      <svg width={wd} height={height} style={{ display: 'block' }} aria-label="Karte">
        <CoreGradient />
        <g transform={`translate(${cur.tx},${cur.ty}) scale(${cur.s})`}>
          <defs>
            <pattern id="ctdGrid" width={1} height={1} patternUnits="userSpaceOnUse"><path d="M1 0 L0 0 0 1" fill="none" stroke="rgba(255,255,255,.06)" strokeWidth={0.04} /></pattern>
          </defs>
          <MapLayer map={map} rocks={board.rocks} legs={board.legs} bs={board.bs} selected={selected} monsters={monsters} />
          <rect x={0} y={0} width={map.w} height={map.h} fill="url(#ctdGrid)" pointerEvents="none" />
        </g>
      </svg>
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
    <div style={{ position: 'absolute', inset: 0, boxSizing: 'border-box', padding: '24px 32px', background: `radial-gradient(circle at 80% 10%, #1a1446 0%, ${BG} 55%)`, color: TEXT, fontFamily: 'Inter, var(--font), sans-serif', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {children}
    </div>
  );
}

function Title({ text }: { text: string }) {
  return <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 28, letterSpacing: 1, color: CYAN, textShadow: '0 0 14px rgba(62,240,255,.6)' }}>{text}</div>;
}

function Chip({ text, f }: { text: string; f: number }) {
  const c = priceColor(f);
  return <span style={{ padding: '2px 7px', borderRadius: 6, background: '#141A3A', border: `1px solid ${c}`, color: c, fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>{text}</span>;
}

function HostVote({ view, t, player }: HostViewProps) {
  const counts: Record<number, string[]> = view.votes ?? {};
  const most = Math.max(0, ...Object.values(counts).map((v) => v.length));
  return (
    <Stage>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 18 }}>
          <Title text={t('vote.title')} />
          <span style={{ fontSize: 15, color: MUTED }}>{t('vote.hint')}</span>
        </div>
        <HostTimer deadline={view.deadline} duration={view.duration} size={56} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14, flex: 1, minHeight: 0 }}>
        {view.maps.map((m: any, i: number) => {
          const vs = counts[i] ?? [];
          const lead = vs.length > 0 && vs.length === most;
          return (
            <div key={i} style={{ ...panel, border: `2px solid ${lead ? CYAN : LINE}`, boxShadow: lead ? '0 0 18px rgba(62,240,255,.35)' : 'none', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 7, minHeight: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 18 }}>{t('vote.map', { l: 'ABCDEF'[i] })} <span style={{ fontFamily: 'inherit', fontWeight: 600, fontSize: 13, color: MUTED }}>{t('vote.size', { w: m.w, h: m.h })}</span></div>
                <div style={{ display: 'flex', gap: 3 }}>{vs.map((id) => <span key={id} style={{ width: 12, height: 12, borderRadius: 3, background: player(id)?.color ?? CYAN }} />)}</div>
              </div>
              <div style={{ height: 104, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0A0F28', borderRadius: 8 }}>
                <MapPreview m={m} width={360} height={98} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '3px 8px', fontSize: 12, color: MUTED }}>
                <div>{t('vote.cps')} <b style={{ color: TEXT }}>{m.cps.length}</b></div>
                <div>{t('vote.limit')} <b style={{ color: TEXT }}>{m.maxLimit}</b></div>
                <div>{t('vote.money')} <b style={{ color: priceColor(1 / m.moneyF) }}>{m.money}</b></div>
                <div>{t('vote.blast')} <b style={{ color: priceColor(m.blast.f) }}>{m.blast.p}</b></div>
                <div style={{ gridColumn: 'span 2' }}>{t('vote.depot')} <b style={{ color: priceColor(m.depot.f) }}>{m.depot.p}</b></div>
              </div>
              <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ color: DIM, fontSize: 12, width: 46 }}>{t('vote.cheap')}</span>
                {m.cheap.map((x: any) => <Chip key={x.t} text={`${t('t.' + x.t)} ${x.p}`} f={x.f} />)}
              </div>
              <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ color: DIM, fontSize: 12, width: 46 }}>{t('vote.dear')}</span>
                {m.dear.map((x: any) => <Chip key={x.t} text={`${t('t.' + x.t)} ${x.p}`} f={x.f} />)}
              </div>
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
  return (
    <Stage>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Title text="CHAOTIC TOWER DEFENSE" />
        <div style={{ fontSize: 15, color: MUTED }}>{t('game.map', { w: view.map.w, h: view.map.h, c: view.map.cps, l: view.map.maxLimit })} · {t('game.left', { n: left, m: rows.length })}</div>
      </div>
      <div style={{ display: 'flex', gap: 22, flex: 1, minHeight: 0 }}>
        <div style={{ ...panel, flex: 1, padding: '12px 18px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '44px minmax(0,1fr) 80px 250px 120px', gap: 12, ...label, padding: '0 6px 8px', borderBottom: `1px solid ${LINE}` }}>
            <div>{t('game.place')}</div><div>{t('game.player')}</div><div style={{ textAlign: 'right' }}>{t('game.kills')}</div><div>{t('game.lives')}</div>
            <div style={{ textAlign: 'right' }}>{t('game.run', { n: Math.max(1, view.stage === 'wave' ? view.wave - 1 : view.wave - 1) })}</div>
          </div>
          {rows.map((r, i) => {
            const p = player(r.id);
            const lifeC = r.out ? '#59608A' : r.lives > 50 ? CYAN : r.lives >= 20 ? YELLOW : '#FF4D4D';
            const tag = i === 0 && !r.out ? t('game.leads') : r.out ? t('game.outLabel') : r.lives < 10 ? t('game.danger') : '';
            return (
              <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '44px minmax(0,1fr) 80px 250px 120px', gap: 12, alignItems: 'center', height: rowH, padding: '0 6px', fontSize: big ? 16 : 19, borderBottom: '1px solid rgba(42,52,112,.5)', opacity: r.out ? 0.45 : 1 }}>
                <div style={{ fontFamily: DISPLAY, fontWeight: 800, color: i === 0 ? YELLOW : DIM }}>{i + 1}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <span style={{ width: 14, height: 14, borderRadius: 4, flex: 'none', background: p?.color ?? CYAN, boxShadow: `0 0 8px ${p?.color ?? CYAN}` }} />
                  <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p?.name ?? '?'}</span>
                  <span style={{ fontSize: 12, color: DIM, whiteSpace: 'nowrap' }}>{tag}</span>
                  {view.stage === 'build' && !r.out && r.ready && <span style={{ fontSize: 11, color: '#2ED47A', fontWeight: 700 }}>✓</span>}
                </div>
                <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{r.kills}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, height: 10, borderRadius: 5, background: '#1B2250', overflow: 'hidden' }}><div style={{ height: '100%', width: `${(Math.min(150, r.lives) / 150) * 100}%`, background: lifeC, borderRadius: 5, transition: 'width .4s' }} /></div>
                  <div style={{ width: 46, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: lifeC }}>{r.out ? t('game.out') : r.lives}</div>
                </div>
                <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: view.longest?.id === r.id ? CYAN : '#C5CBEA' }}>{r.out ? '–' : fmtTime(r.run)}</div>
              </div>
            );
          })}
          <div style={{ marginTop: 'auto', paddingTop: 8, fontSize: 13, color: DIM }}>{t('game.rule')} {t('game.boostRule')}</div>
        </div>
        <div style={{ width: 370, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ ...panel, border: `1px solid ${view.stage === 'wave' ? CYAN : YELLOW}`, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ ...label, color: view.stage === 'wave' ? CYAN : YELLOW }}>{view.stage === 'wave' ? t('game.current') : t('game.build')}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 34 }}>{view.stage === 'wave' ? t('game.wave', { n: view.wave }) : t('game.next', { n: view.wave })}</div>
              {view.stage === 'build' && view.deadline > 0 && <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 28, color: YELLOW }}>{fmtTime(Math.max(0, Math.ceil((view.deadline - now) / 1000)))}</div>}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: view.type === 'boss' ? '#FF4D4D' : PINK }}>{t('m.' + view.type)}</div>
            <div style={{ fontSize: 14, color: MUTED }}>{t('m.' + view.type + '.d')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, fontSize: 13, color: MUTED }}>
              <div><div style={{ fontSize: 20, fontWeight: 700, color: TEXT }}>{view.count}</div>{t('game.count')}</div>
              <div><div style={{ fontSize: 20, fontWeight: 700, color: TEXT }}>×{view.hpMul}</div>{t('game.hp')}</div>
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: view.stage === 'wave' ? CYAN : YELLOW }}>
              {view.stage === 'wave' ? t('game.running', { n: view.doneCount, m: view.active }) : t('game.ready', { n: view.ready, m: view.active })}
            </div>
          </div>
          <div style={{ ...panel, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 15, color: MUTED }}>
            {view.next.map((ty: string, k: number) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{t('game.then', { n: view.wave + k + 1 })}</span>
                <span style={{ color: ty === 'boss' ? '#FF4D4D' : TEXT, fontWeight: 700 }}>{ty === 'boss' ? t('game.boss') : t('m.' + ty)}</span>
              </div>
            ))}
            {view.longest && (
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${LINE}`, paddingTop: 8, marginTop: 4 }}>
                <span>{t('game.longest')}</span><span style={{ color: CYAN, fontWeight: 700 }}>{player(view.longest.id)?.name} · {fmtTime(view.longest.run)}</span>
              </div>
            )}
          </div>
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

function Stat({ k, v, c }: { k: string; v: ReactNode; c?: string }) {
  return (
    <div style={{ background: '#141A3A', borderRadius: 10, padding: '5px 8px', minWidth: 0 }}>
      <div style={{ fontSize: 10, color: DIM, textTransform: 'uppercase' }}>{k}</div>
      <div style={{ fontWeight: 700, fontSize: 17, color: c ?? TEXT, whiteSpace: 'nowrap' }}>{v}</div>
    </div>
  );
}

function PhoneVote({ view, t, send }: ControllerViewProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, color: TEXT }}>
      <PhoneTimer deadline={view.deadline} duration={view.duration} />
      <h2 style={{ fontFamily: DISPLAY, fontSize: 24, fontWeight: 800, margin: 0, paddingLeft: 40 }}>{t('vote.pick')}</h2>
      {view.maps.map((m: any, i: number) => {
        const mine = view.mine === i;
        return (
          <button key={i} onClick={() => send({ type: 'vote', map: i })} style={{ ...btn, height: 60, display: 'flex', alignItems: 'center', gap: 12, padding: '0 14px', border: `2px solid ${mine ? CYAN : LINE}`, background: mine ? 'rgba(62,240,255,.12)' : '#141A3A' }}>
            <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 24, color: mine ? CYAN : TEXT, width: 26 }}>{m.letter}</span>
            <span style={{ flex: 1, textAlign: 'left', fontSize: 14 }}>{t('vote.size', { w: m.w, h: m.h })} · {m.cps} {t('vote.cps')}</span>
            <span style={{ fontSize: 13, color: DIM }}>{t('vote.votes', { n: m.votes })}</span>
          </button>
        );
      })}
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

function BuildingSheet({ view, t, send, sel, onClose, canEdit }: { view: any; t: Translate; send: (a: any) => void; sel: number | string; onClose: () => void; canEdit: boolean }) {
  const now = useServerNow(500);
  const pr = view.prices as Record<string, [number, number]>;
  if (typeof sel === 'string') {
    const [x, y] = sel.slice(5).split(',').map(Number);
    return (
      <Sheet onClose={onClose} closeLabel={t('p.close')}>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 20 }}>{t('k.rock')}</div>
        <button disabled={!canEdit} onClick={() => { send({ type: 'blast', x, y }); onClose(); }} style={{ ...btn, height: 52, fontSize: 16, fontWeight: 700, opacity: canEdit ? 1 : 0.5 }}>
          {t('p.blast')} · <b style={{ color: priceColor(pr.blast[1]) }}>{pr.blast[0]}</b>
        </button>
      </Sheet>
    );
  }
  const b = (view.me as BoardOut).bs.find((x) => x[0] === sel);
  if (!b) return null;
  const [id, kind, , , type, level, dmgN, spdN] = b;
  const up = view.ups?.[id] as [number, number, number | null, number | null] | undefined;
  const refund = view.refunds[id] as [number, number] | undefined;
  const fullLeft = refund ? Math.max(0, Math.ceil((refund[1] - now) / 1000)) : 0;
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
                <button key={ty} disabled={!canEdit} onClick={() => send({ type: 'upgrade', id, to: ty })} style={{ ...btn, height: 52, display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px', background: '#0E1430', textAlign: 'left', opacity: canEdit ? 1 : 0.5 }}>
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
          <button disabled={!canEdit} onClick={() => send({ type: 'upgrade', id })} style={{ ...btn, height: 52, background: CYAN, color: BG, fontSize: 16, fontWeight: 700, border: 'none', opacity: canEdit ? 1 : 0.5 }}>
            {t('p.levelUp', { n: level + 1 })} · <span style={{ background: BG, color: priceColor(f), padding: '2px 8px', borderRadius: 6 }}>{p}</span>
          </button>
        );
      })() : <div style={{ fontSize: 13, color: MUTED }}>{t('p.maxLevel')}</div>)}
      {up && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 6 }}>
          <button disabled={!canEdit} onClick={() => send({ type: 'towerUp', id, what: 'dmg' })} style={{ ...btn, minHeight: 52, background: '#0E1430', fontSize: 13, opacity: canEdit ? 1 : 0.5 }}>
            <b>{t('p.dmg')}</b> · <b style={{ color: priceColor(up[1]) }}>{up[0]}</b>
            <div style={{ fontSize: 10, color: DIM }}>{t('p.dmgInfo', { n: dmgN, p: Math.round(dmgN * 25) })}</div>
          </button>
          <button disabled={!canEdit || up[2] === null} onClick={() => send({ type: 'towerUp', id, what: 'spd' })} style={{ ...btn, minHeight: 52, background: '#0E1430', fontSize: 13, opacity: canEdit && up[2] !== null ? 1 : 0.5 }}>
            <b>{t('p.spd')}</b>{up[2] !== null && <> · <b style={{ color: priceColor(up[3]!) }}>{up[2]}</b></>}
            <div style={{ fontSize: 10, color: DIM }}>{t('p.spdInfo', { n: spdN })}</div>
          </button>
        </div>
      )}
      {refund && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <button disabled={!canEdit} onClick={() => { send({ type: 'sell', id }); onClose(); }} style={{ ...btn, height: 46, background: 'transparent', border: '1px solid #FF4D4D', color: '#FF8080', fontSize: 14, fontWeight: 700, opacity: canEdit ? 1 : 0.5 }}>{t('p.sell', { n: refund[0] })}</button>
          {fullLeft > 0 && <div style={{ fontSize: 11, color: MUTED }}>{t('p.full', { s: fullLeft })}</div>}
        </div>
      )}
    </Sheet>
  );
}

function ShareMenu({ view, t, send, player, onClose }: { view: any; t: Translate; send: (a: any) => void; player: (id: string) => PlayerInfo | undefined; onClose: () => void }) {
  const on = new Set<string>(view.shareTo);
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 30, background: BG, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', color: TEXT }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button aria-label={t('p.back')} onClick={onClose} style={{ ...btn, width: 44, height: 44, fontSize: 20 }}>‹</button>
        <div><div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 20 }}>{t('p.shareTitle')}</div><div style={{ fontSize: 12, color: MUTED }}>{t('p.shareHint')}</div></div>
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

function PlayScreen({ view, t, send, player, me }: ControllerViewProps) {
  const frame = useStream<{ k: number; b: number[][] }>();
  const [tool, setTool] = useState<'wall' | 'tower' | 'depot' | null>(null);
  const [sel, setSel] = useState<number | string | null>(null);
  const [share, setShare] = useState(false);
  const canBuild = !view.out && view.stage === 'build';
  useEffect(() => { if (!canBuild) setTool(null); }, [canBuild]);
  const watching: BoardOut & { id?: string } = view.watch ?? view.me;
  const ownView = !view.watch;
  const map: MapInfo = view.map;
  const pr = view.prices as Record<string, [number, number]>;
  const monsters = frame?.k === view.wave || frame?.k === view.wave - 1 ? frame?.b?.[watching.idx] : undefined;
  const onTap = (x: number, y: number) => {
    if (!ownView) return;
    if (tool && canBuild) {
      const n = tool === 'wall' ? 1 : 2;
      const bx = n === 1 ? Math.floor(x) : Math.round(x) - 1, by = n === 1 ? Math.floor(y) : Math.round(y) - 1;
      send({ type: 'build', kind: tool, x: bx, y: by });
      return;
    }
    const cx = Math.floor(x), cy = Math.floor(y);
    const b = (view.me as BoardOut).bs.find(([, kind, bx, by]) => { const n = kind === 0 ? 1 : 2; return cx >= bx && cx < bx + n && cy >= by && cy < by + n; });
    if (b) return setSel(b[0]);
    const r = (view.me as BoardOut).rocks.find(([rx, ry]) => cx >= rx && cx < rx + 2 && cy >= ry && cy < ry + 2);
    setSel(r ? `rock:${r[0]},${r[1]}` : null);
  };
  const lifeC = view.lives > 50 ? CYAN : view.lives >= 20 ? YELLOW : '#FF4D4D';
  const toolBtn = (k: 'wall' | 'tower' | 'depot', icon: ReactNode, sub: string) => {
    const [p, f] = pr[k];
    const active = tool === k;
    return (
      <button key={k} disabled={!canBuild} onClick={() => { setSel(null); setTool(active ? null : k); }} style={{ ...btn, height: 58, border: `2px solid ${active ? CYAN : LINE}`, background: active ? 'rgba(62,240,255,.12)' : '#141A3A', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, opacity: canBuild ? 1 : 0.45 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{icon}<span style={{ fontSize: 14, fontWeight: 700 }}>{t('k.' + k)}</span></span>
        <span style={{ fontSize: 10, color: DIM }}>{sub} · <b style={{ fontSize: 13, color: priceColor(f) }}>{p}</b></span>
      </button>
    );
  };
  const err = view.err ? t('err.' + view.err) : '';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, color: TEXT, paddingBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingLeft: 40 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 18 }}>{t('game.wave', { n: view.wave })} · <span style={{ color: view.type === 'boss' ? '#FF4D4D' : PINK }}>{t('m.' + view.type)}</span></div>
          <div style={{ fontSize: 12, color: MUTED }}>{view.boost > 1 && <b style={{ color: '#FF4D4D' }}>{t('p.boost', { n: view.boost })} · </b>}{t('p.nextType', { m: t('m.' + view.nextType) })}{view.run > 0 ? ` · ${t('p.lastRun', { t: fmtTime(view.run) })}` : ''}</div>
        </div>
        {!view.out && (
          <button onClick={() => setShare(true)} style={{ ...btn, height: 40, padding: '0 10px', border: `1px solid ${CYAN}`, color: CYAN, fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
            {t('p.share')} · {view.shareTo.length}
          </button>
        )}
      </div>
      {view.deadline > 0 && <PhoneTimer deadline={view.deadline} duration={view.duration} />}
      {view.out ? (
        <div style={{ background: '#141A3A', borderRadius: 12, padding: '10px 12px' }}>
          <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 18, color: '#FF8080' }}>{t('p.out')}</div>
          <div style={{ fontSize: 12, color: MUTED }}>{t('p.outInfo', { p: view.place, k: view.kills })}</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 6 }}>
          <Stat k={t('p.money')} v={view.money} c={YELLOW} />
          <Stat k={t('p.lives')} v={view.lives} c={lifeC} />
          <Stat k={t('p.rank')} v={`${view.rank}/${view.of}`} />
          <Stat k={t('p.limit')} v={`${view.used}/${view.limit}`} />
        </div>
      )}
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
      {!ownView && <div style={{ fontSize: 12, color: CYAN }}>{t('p.viewOf', { name: player(view.watch.id)?.name ?? '?' })}</div>}
      <MapView key={watching.idx} map={map} board={watching} monsters={monsters} selected={ownView ? sel : null} height={view.out ? 470 : 400} onTap={onTap} fitLabel={t('p.fit')} />
      {err && <div role="status" style={{ background: 'rgba(255,77,77,.15)', border: '1px solid #FF4D4D', borderRadius: 10, padding: '6px 10px', fontSize: 13, color: '#FF9A9A' }}>{err}</div>}
      {!view.out && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: DIM }}>
            <span>{tool ? t('p.tapHint') : t('p.selectHint')}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>{t('vote.cheap')} <span style={{ width: 54, height: 6, borderRadius: 3, background: 'linear-gradient(90deg,#2ED47A,#FFD43B,#FF4D4D)' }} /> {t('vote.dear')}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 6 }}>
            {toolBtn('wall', <span style={{ width: 12, height: 12, background: '#3B4470', border: '1px solid #6A76B0', borderRadius: 2 }} />, '1 × 1')}
            {toolBtn('tower', <span style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${TEXT}`, boxSizing: 'border-box', background: `radial-gradient(circle, ${TEXT} 0 2px, #0A0F28 3px)` }} />, '2 × 2')}
            {toolBtn('depot', <span style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${CYAN}`, boxSizing: 'border-box' }} />, `+10 · max ${view.maxLimit}`)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 6 }}>
            <button disabled={!canBuild} onClick={() => send({ type: 'buy', key: 'income' })} style={{ ...btn, minHeight: 44, border: `1px dashed ${YELLOW}`, fontSize: 12, opacity: canBuild ? 1 : 0.45 }}>{t('p.income')} · <b style={{ color: priceColor(pr.income[1]) }}>{pr.income[0]}</b><div style={{ fontSize: 10, color: DIM }}>{t('p.incomeInfo', { n: view.income })}</div></button>
            <button disabled={!canBuild} onClick={() => send({ type: 'buy', key: 'dmgUp' })} style={{ ...btn, minHeight: 44, border: '1px dashed #FF7A3D', fontSize: 12, opacity: canBuild ? 1 : 0.45 }}>{t('p.dmgUp')} · <b style={{ color: priceColor(pr.dmgUp[1]) }}>{pr.dmgUp[0]}</b>{view.dmgLv > 0 && <div style={{ fontSize: 10, color: DIM }}>+{view.dmgLv}</div>}</button>
          </div>
          {view.stage === 'wave' ? (
            <div style={{ background: '#141A3A', borderRadius: 12, padding: '10px 12px', fontSize: 13, color: MUTED }}>{t('p.waveRun')}</div>
          ) : (
            <button onClick={() => send({ type: 'ready' })} style={{ ...btn, height: 54, fontSize: 17, fontWeight: 800, background: view.ready ? '#2ED47A' : YELLOW, color: BG, border: 'none' }}>{view.ready ? t('p.readyOn') : t('p.ready')}</button>
          )}
          {view.stage === 'build' && view.globalStage === 'wave' && <div style={{ fontSize: 12, color: DIM, textAlign: 'center' }}>{t('p.waitWaves')}</div>}
        </>
      )}
      {sel !== null && ownView && !view.out && <BuildingSheet view={view} t={t} send={send} sel={sel} onClose={() => setSel(null)} canEdit={canBuild} />}
      {share && <ShareMenu view={view} t={t} send={send} player={player} onClose={() => setShare(false)} />}
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
  return <PhoneWait title={t('game.lookAtTv')} />;
}

export default { Host, Controller } satisfies GameClientModule;
