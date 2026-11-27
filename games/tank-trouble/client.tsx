import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { ControllerViewProps, GameClientModule, HostViewProps, PlayerInfo } from '@up/sdk';
import { Avatar, Confetti, Crown, Joystick, PhoneWait, Podium, Scoreboard, sfx, useServerNow, useStream, vibrate } from '@up/ui';
import { COLS, ROWS } from './levels';
import { BARREL, CELL, H, POWERUPS, W, traceShot } from './engine';
import { battleTrack, play, type MusicState } from './sound';

const BG = '#070B18';
const FLOOR = '#0C1226';
const GRIDC = '#16203D';
const WALL = '#38E1FF';
const SOFT = '#FF4FD8';
const TEXT = '#E8F0FF';
const MUTED = '#9FB0D6';
const CARD = '#0D1430';
const DISPLAY = '"Chakra Petch", var(--display), sans-serif';

const ENEMY_COLOR: Record<string, string> = {
  braun: '#C8874A', grau: '#B9C2D4', tuerkis: '#2FD9C9', gelb: '#FFD23F', rot: '#FF4B4B', gruen: '#5BE36B', lila: '#B06BFF', weiss: '#F4F7FF', schwarz: '#8A93A8', cpu: '#8A93A8',
};
const POWER_COLOR: Record<string, string> = { schild: '#9FF3FF', rakete: '#FF9F1C', abprall: '#B07CFF', turbo: '#7CFF6B', mine: '#FFD23F' };

/** [x, y, Wanne×100, Turm×100, Flags] */
type TFrame = [number, number, number, number, number];
interface Frame { k: number; t: number; tk: TFrame[]; b: number[][]; m: number[][]; p: number[][]; e: (string | number)[][] }
interface TankInfo { i: number; kind: 'player' | 'enemy'; pid: string | null; etype: string | null; color: string }
const F = { alive: 1, shield: 2, invisible: 4, turbo: 8, aiming: 16, moving: 32 };

const S = 0.95; // Maßstab Arena → TV
const PAD = 8;
const CW = Math.round(W * S + PAD * 2), CH = Math.round(H * S + PAD * 2);

/* ================= kleine Bausteine ================= */

function TankIcon({ color, size = 64, angle = -30 }: { color: string; size?: number; angle?: number }) {
  return (
    <svg width={size} height={size} viewBox="-24 -24 48 48" aria-hidden="true" style={{ flex: 'none', filter: `drop-shadow(0 0 4px ${color})` }}>
      <rect x="-16" y="-15" width="32" height="7" rx="3" fill="#0A0F1E" stroke={color} strokeWidth="1.5" />
      <rect x="-16" y="8" width="32" height="7" rx="3" fill="#0A0F1E" stroke={color} strokeWidth="1.5" />
      <rect x="-13" y="-10" width="26" height="20" rx="4" fill={color} fillOpacity="0.28" stroke={color} strokeWidth="2" />
      <g transform={`rotate(${angle})`}>
        <rect x="2" y="-3" width="20" height="6" rx="2" fill={color} />
        <circle r="8" fill="#0A0F1E" stroke={color} strokeWidth="2.5" />
      </g>
    </svg>
  );
}

function LifeIcons({ n, total = 3, color }: { n: number; total?: number; color: string }) {
  const shown = Math.max(total, n);
  return (
    <span style={{ display: 'inline-flex', gap: 3 }} aria-label={`${n}`}>
      {Array.from({ length: shown }, (_, i) => (
        <svg key={i} width="18" height="14" viewBox="0 0 18 14" aria-hidden="true" style={{ opacity: i < n ? 1 : 0.25 }}>
          <rect x="1" y="1" width="16" height="4" rx="2" fill="none" stroke={color} strokeWidth="1.5" />
          <rect x="1" y="9" width="16" height="4" rx="2" fill="none" stroke={color} strokeWidth="1.5" />
          <rect x="4" y="4" width="10" height="6" rx="1.5" fill={i < n ? color : 'none'} stroke={color} strokeWidth="1" />
        </svg>
      ))}
    </span>
  );
}

function PowerIcon({ kind, size = 16, color }: { kind: string; size?: number; color?: string }) {
  const c = color ?? POWER_COLOR[kind] ?? '#fff';
  const p: Record<string, ReactNode> = {
    schild: <path d="M0 -8 L7 -5 L6 3 L0 8 L-6 3 L-7 -5 Z" fill="none" stroke={c} strokeWidth="2" />,
    rakete: <path d="M-7 0 L4 -4 L8 0 L4 4 Z M-7 -4 L-4 0 L-7 4" fill="none" stroke={c} strokeWidth="2" strokeLinejoin="round" />,
    abprall: <path d="M-8 6 L-2 -6 L3 4 L8 -6" fill="none" stroke={c} strokeWidth="2" strokeLinejoin="round" />,
    turbo: <path d="M-6 -6 L0 0 L-6 6 M1 -6 L7 0 L1 6" fill="none" stroke={c} strokeWidth="2" />,
    mine: <g><circle r="5" fill="none" stroke={c} strokeWidth="2" /><circle r="1.5" fill={c} /></g>,
  };
  return <svg width={size} height={size} viewBox="-10 -10 20 20" aria-hidden="true" style={{ flex: 'none' }}>{p[kind]}</svg>;
}

/* ================= TV ================= */

function Host(props: HostViewProps) {
  const { view, t, player } = props;
  switch (view.screen) {
    case 'intro':
      return (
        <Screen>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, textAlign: 'center', padding: 40 }}>
            <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
              <TankIcon color="#3EC8FF" size={92} angle={-20} />
              <span className="anim-pop" style={{ fontFamily: DISPLAY, fontSize: 104, fontWeight: 700, letterSpacing: 6, color: WALL, textShadow: `0 0 28px ${WALL}99` }}>TANK TROUBLE</span>
              <TankIcon color="#FF9F1C" size={92} angle={200} />
            </div>
            <span style={{ fontFamily: DISPLAY, fontSize: 26, letterSpacing: 4, color: MUTED }}>{t(`mode.${view.mode}`).toUpperCase()}</span>
            <p className="anim-up" style={{ fontSize: 28, maxWidth: 980, lineHeight: 1.35, animationDelay: '.3s' }}>{view.mode === 'duell' ? t('intro.duell', { n: view.total }) : t('intro.kampagne', { n: view.missions, lives: view.lives ?? 3 })}</p>
            {view.teams && <p className="anim-up" style={{ fontSize: 24, color: '#FFD23F', animationDelay: '.6s' }}>{t('intro.teams')}</p>}
            <p className="anim-up" style={{ fontSize: 22, maxWidth: 980, lineHeight: 1.35, color: '#9FF3FF', animationDelay: '.6s' }}>{t('intro.rules')}</p>
            <p className="anim-up" style={{ fontSize: 21, color: MUTED, animationDelay: '.9s' }}>{t('intro.controls')}</p>
            <p className="anim-up" style={{ fontSize: 20, color: '#FFD23F', animationDelay: '1.2s' }}>{t(`intro.points.${view.mode}`)}</p>
          </div>
        </Screen>
      );
    case 'mission':
      return <MissionCard {...props} />;
    case 'arena':
      return <HostArena {...props} />;
    case 'scores': {
      const rows = Object.keys(view.after).map((id) => ({ player: player(id)!, before: view.before[id] ?? 0, after: view.after[id] })).filter((r) => r.player);
      return (
        <Screen>
          <Header left="TANK TROUBLE" mid={t('round', { n: view.round, total: view.total })} right="" />
          <div style={{ padding: '20px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h1 style={{ fontSize: 36, fontFamily: DISPLAY }}>{t('scores.title')}</h1>
            <Scoreboard rows={rows} />
          </div>
        </Screen>
      );
    }
    case 'final':
      return (
        <Screen>
          <Header left="TANK TROUBLE" mid={t('final.title')} right="" />
          <div style={{ padding: '16px 40px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
            {view.mode === 'kampagne' && (
              <h1 style={{ fontFamily: DISPLAY, fontSize: 40, textAlign: 'center', color: view.victory ? '#7CFF6B' : TEXT }}>
                {view.victory ? t('final.victory') : t('final.over', { n: view.mission })}
              </h1>
            )}
            {view.victory && <Confetti />}
            <Podium ranking={view.ranking} player={player} pointsLabel={t('common.points')} />
          </div>
        </Screen>
      );
  }
  return null;
}

function Screen({ children }: { children: ReactNode }) {
  return <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(circle at 50% 40%, #12204A 0%, ${BG} 65%)`, color: TEXT, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>{children}</div>;
}

function Header({ left, mid, right }: { left: string; mid: string; right: ReactNode }) {
  return (
    <div style={{ height: 52, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', borderBottom: '1px solid #1A2547', position: 'relative' }}>
      <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 22, letterSpacing: 2, color: WALL }}>{left}</div>
      <div style={{ position: 'absolute', left: 0, right: 0, textAlign: 'center', fontFamily: DISPLAY, fontWeight: 700, fontSize: 19, letterSpacing: 1, pointerEvents: 'none' }}>{mid}</div>
      <div style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: 16, color: MUTED }}>{right}</div>
    </div>
  );
}

function MissionCard({ view, t, player, room }: HostViewProps) {
  const enemies = view.enemies as { type: string; count: number; isNew: boolean }[];
  const total = enemies.reduce((s, e) => s + e.count, 0);
  const ids = room.players.filter((p) => p.role === 'player').map((p) => p.id);
  useEffect(() => {
    play.missionIntro();
  }, [view.mission]);
  return (
    <Screen>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 30 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <div style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: 18, letterSpacing: 4, color: MUTED }}>TANK TROUBLE · {t('mode.kampagne').toUpperCase()}</div>
          <div className="anim-pop" style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 76, letterSpacing: 4, color: WALL, textShadow: `0 0 24px ${WALL}88` }}>{t('mission', { n: view.mission }).toUpperCase()}</div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{t('enemiesCount', { n: total })}</div>
          {view.extraLife && <div className="anim-pop" style={{ fontFamily: DISPLAY, fontSize: 22, color: '#7CFF6B' }}>{t('extraLife')}</div>}
        </div>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 1200 }}>
          {enemies.map((e, i) => {
            const c = ENEMY_COLOR[e.type];
            return (
              <div key={e.type} className="anim-up" style={{ position: 'relative', width: 190, padding: '20px 14px 16px', borderRadius: 16, background: CARD, border: `2px solid ${c}`, boxShadow: `0 0 24px ${c}33`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, animationDelay: `${0.15 * i}s` }}>
                {e.isNew && <div style={{ position: 'absolute', top: -12, right: -10, padding: '4px 10px', borderRadius: 999, background: c, color: '#0A0F1E', fontFamily: DISPLAY, fontWeight: 700, fontSize: 12, letterSpacing: 1 }}>{t('new')}</div>}
                <TankIcon color={c} size={88} />
                <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 22, color: c }}>{e.count} ×</div>
                <div style={{ fontSize: 17, fontWeight: 600 }}>{t(`e.${e.type}`)}</div>
                <div style={{ fontSize: 14, color: MUTED, textAlign: 'center' }}>{t(`ed.${e.type}`)}</div>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          {ids.map((id) => {
            const p = player(id);
            if (!p) return null;
            const n = view.lives[id] ?? 0;
            return (
              <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px 6px 6px', borderRadius: 999, background: CARD, border: `1px solid ${p.color}66`, opacity: n > 0 ? 1 : 0.4 }}>
                <Avatar player={p} size={30} />
                <span style={{ fontSize: 15, fontWeight: 600 }}>{p.name}</span>
                <LifeIcons n={n} color={p.color} />
              </div>
            );
          })}
        </div>
        <div style={{ fontFamily: DISPLAY, fontSize: 15, color: MUTED, letterSpacing: 2 }}>{t('startIn').toUpperCase()}</div>
      </div>
    </Screen>
  );
}

interface Fx { kind: string; x: number; y: number; at: number; v: number; color?: string; text?: string }

function HostArena({ view, t, player, room }: HostViewProps) {
  const frame = useStream<Frame>();
  const now = useServerNow(200);
  const tanks = view.tanks as TankInfo[];
  const grid = view.grid as string[];
  const fr = frame && frame.k === view.key && frame.tk.length === tanks.length ? frame : null;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const frames = useRef<{ prev: Frame | null; cur: Frame | null; at: number }>({ prev: null, cur: null, at: 0 });
  const fx = useRef<Fx[]>([]);
  const wrecks = useRef<{ x: number; y: number; color: string }[]>([]);
  const lastEv = useRef(0);
  const flash = useRef(new Map<number, number>());
  const keyRef = useRef(-1);
  const sound = useRef({ engine: 0, beep: 0 });
  const paused = useRef(false);
  paused.current = !!room.pause;
  const info = useRef(tanks);
  info.current = tanks;

  const gridRef = useRef<string[][]>([]);
  gridRef.current = useMemo(() => grid.map((r) => r.split('')), [grid.join('')]);
  // Boden und Wände einmal vorzeichnen
  const floor = useMemo(() => drawFloor(grid), [grid.join('')]);
  // Kettenspuren (bleiben bis zur nächsten Runde)
  const trackCanvas = useRef<HTMLCanvasElement | null>(null);
  const trackPos = useRef(new Map<number, [number, number]>());

  if (keyRef.current !== view.key) {
    keyRef.current = view.key;
    fx.current = [];
    wrecks.current = [];
    lastEv.current = 0;
    flash.current = new Map();
    trackPos.current = new Map();
    frames.current = { prev: null, cur: null, at: 0 };
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    trackCanvas.current = c;
  }

  // Neue Server-Bilder: Effekte und Klänge
  useEffect(() => {
    if (!fr) return;
    const f = frames.current;
    if (f.cur !== fr) {
      f.prev = f.cur && f.cur.k === fr.k ? f.cur : fr;
      f.cur = fr;
      f.at = performance.now();
    }
    const n = performance.now();
    const colorOf = (i: number) => info.current[i]?.color ?? '#FFFFFF';
    for (const e of fr.e) {
      const id = e[0] as number;
      if (id <= lastEv.current) continue;
      lastEv.current = id;
      const kind = e[1] as string;
      const x = e[2] as number, y = e[3] as number;
      if (kind === 'shot') {
        const owner = e[4] as number, rocket = e[5] as number;
        fx.current.push({ kind: 'muzzle', x, y, at: n, v: 0, color: colorOf(owner) });
        flash.current.set(owner, n);
        if (rocket) play.rocket(); else play.shot();
      } else if (kind === 'bounce') {
        fx.current.push({ kind: 'spark', x, y, at: n, v: 8, color: '#FFFFFF' });
        play.bounce();
      } else if (kind === 'spark') {
        fx.current.push({ kind: 'spark', x, y, at: n, v: 14, color: '#FFD23F' });
        play.fizzle();
      } else if (kind === 'kill') {
        const i = e[4] as number;
        fx.current.push({ kind: 'blast', x, y, at: n, v: 40, color: colorOf(i) });
        wrecks.current.push({ x, y, color: colorOf(i) });
        play.tankHit();
      } else if (kind === 'boom') {
        fx.current.push({ kind: 'blast', x, y, at: n, v: e[4] as number, color: '#FF9F1C' });
        play.mineBoom();
      } else if (kind === 'block') {
        fx.current.push({ kind: 'ring', x, y, at: n, v: 26, color: SOFT });
        play.block();
      } else if (kind === 'mine') {
        play.minePlace();
      } else if (kind === 'pick') {
        const k = POWERUPS[e[5] as number];
        fx.current.push({ kind: 'ring', x, y, at: n, v: 30, color: POWER_COLOR[k] });
        fx.current.push({ kind: 'text', x, y: y - 26, at: n, v: 0, color: POWER_COLOR[k], text: t(`p.${k}`) });
        play.pickup();
      } else if (kind === 'shield') {
        fx.current.push({ kind: 'ring', x, y, at: n, v: 34, color: '#9FF3FF' });
        play.shieldBreak();
      } else if (kind === 'power') {
        fx.current.push({ kind: 'ring', x, y, at: n, v: 22, color: '#FFFFFF' });
        play.powerSpawn();
      }
    }
  }, [fr]);

  // Zeichnen (60× pro Sekunde)
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      const g = canvas?.getContext('2d');
      if (!canvas || !g) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (canvas.width !== CW * dpr) { canvas.width = CW * dpr; canvas.height = CH * dpr; }
      const n = performance.now();
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, CW, CH);
      g.setTransform(dpr * S, 0, 0, dpr * S, dpr * PAD, dpr * PAD);
      g.drawImage(floor, -PAD / S, -PAD / S, W + (PAD * 2) / S, H + (PAD * 2) / S);
      const { prev, cur, at } = frames.current;
      const tc = trackCanvas.current;
      if (!cur || !prev) return;
      const a = Math.min(1, (n - at) / 34);
      const lerp = (p: number, q: number) => p + (q - p) * a;
      const lerpAng = (p: number, q: number) => { let d = q - p; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return p + d * a; };
      const pos = cur.tk.map((c, i) => {
        const p = prev.tk[i] ?? c;
        return { x: lerp(p[0], c[0]), y: lerp(p[1], c[1]), body: lerpAng(p[2] / 100, c[2] / 100), turret: lerpAng(p[3] / 100, c[3] / 100), f: c[4] };
      });

      // Motorengeräusch und Minen-Piepen
      if (n - sound.current.engine > 110 && !paused.current) {
        sound.current.engine = n;
        const moving = pos.filter((p) => (p.f & F.alive) && (p.f & F.moving)).length;
        if (moving) play.engine(moving);
      }
      if (cur.m.some((m) => m[3]) && n - sound.current.beep > 240 && !paused.current) {
        sound.current.beep = n;
        play.mineBeep();
      }

      // Kettenspuren stempeln
      if (tc) {
        const tg = tc.getContext('2d')!;
        pos.forEach((p, i) => {
          if (!(p.f & F.alive)) return;
          const last = trackPos.current.get(i);
          if (last && Math.hypot(p.x - last[0], p.y - last[1]) < 7) return;
          trackPos.current.set(i, [p.x, p.y]);
          if (!last) return;
          tg.save();
          tg.translate(p.x, p.y);
          tg.rotate(p.body);
          tg.fillStyle = info.current[i]?.color ?? '#fff';
          tg.globalAlpha = 0.16;
          tg.fillRect(-3, -14, 6, 5);
          tg.fillRect(-3, 9, 6, 5);
          tg.restore();
        });
        g.drawImage(tc, 0, 0);
      }

      // Wracks
      for (const w of wrecks.current) {
        g.strokeStyle = '#FF5B5B'; g.lineWidth = 4; g.lineCap = 'round'; g.globalAlpha = 0.65;
        g.beginPath(); g.moveTo(w.x - 11, w.y - 11); g.lineTo(w.x + 11, w.y + 11); g.moveTo(w.x + 11, w.y - 11); g.lineTo(w.x - 11, w.y + 11); g.stroke();
        g.globalAlpha = 1;
      }

      // Powerups
      for (const p of cur.p) {
        const k = POWERUPS[p[2]];
        drawPowerup(g, p[0], p[1], k, n);
      }
      // Minen
      for (const m of cur.m) {
        const c = info.current[m[2]]?.color ?? '#FFD23F';
        const blink = m[3] && Math.floor(n / 120) % 2 === 0;
        glow(g, blink ? '#FF5B5B' : c, 10);
        g.fillStyle = '#1A1405'; g.strokeStyle = blink ? '#FF5B5B' : c; g.lineWidth = 2.5;
        circle(g, m[0], m[1], 9); g.fill(); g.stroke();
        g.fillStyle = blink ? '#FF5B5B' : c; circle(g, m[0], m[1], 3); g.fill();
        if (m[3]) { g.strokeStyle = '#FF5B5B'; g.lineWidth = 2; g.globalAlpha = 0.6; circle(g, m[0], m[1], 15 + (n % 400) / 40); g.stroke(); g.globalAlpha = 1; }
        glow(g);
      }

      // Ziellinien der Spieler
      pos.forEach((p, i) => {
        const ti = info.current[i];
        if (!ti || ti.kind !== 'player' || !(p.f & F.alive) || !(p.f & F.aiming)) return;
        const gr = gridRef.current;
        const sx = p.x + Math.cos(p.turret) * BARREL, sy = p.y + Math.sin(p.turret) * BARREL;
        const pts = traceShot(gr, sx, sy, p.turret, 1, 1400);
        // bis zum ersten Abprall und ein Stück danach
        const path: [number, number][] = [pts[0]];
        if (pts[1]) path.push(pts[1]);
        if (pts[2] && pts[1]) {
          const dx = pts[2][0] - pts[1][0], dy = pts[2][1] - pts[1][1];
          const L = Math.hypot(dx, dy) || 1, cut = Math.min(L, 130);
          path.push([pts[1][0] + (dx / L) * cut, pts[1][1] + (dy / L) * cut]);
        }
        g.strokeStyle = ti.color; g.globalAlpha = 0.7; g.lineWidth = 2; g.setLineDash([6, 6]);
        g.beginPath(); path.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
        g.setLineDash([]);
        if (pts[1]) { circle(g, pts[1][0], pts[1][1], 5); g.stroke(); }
        g.globalAlpha = 1;
      });

      // Kugeln
      for (const b of cur.b) {
        const pb = prev.b.find((q) => Math.abs(q[0] - b[0]) < 40 && Math.abs(q[1] - b[1]) < 40 && q[2] === b[2]);
        const c = info.current[b[2]]?.color ?? '#fff';
        const x = pb ? lerp(pb[0], b[0]) : b[0], y = pb ? lerp(pb[1], b[1]) : b[1];
        if (pb) {
          const dx = b[0] - pb[0], dy = b[1] - pb[1];
          const L = Math.hypot(dx, dy) || 1, len = b[3] ? 28 : 16;
          g.strokeStyle = c; g.globalAlpha = 0.5; g.lineWidth = 3; g.lineCap = 'round';
          g.beginPath(); g.moveTo(x - (dx / L) * len, y - (dy / L) * len); g.lineTo(x, y); g.stroke();
          g.globalAlpha = 1;
        }
        glow(g, c, 10);
        g.fillStyle = '#FFFFFF'; g.strokeStyle = c; g.lineWidth = 2;
        circle(g, x, y, b[3] ? 4.5 : 3.5); g.fill(); g.stroke();
        glow(g);
      }

      // Panzer
      pos.forEach((p, i) => {
        const ti = info.current[i];
        if (!ti || !(p.f & F.alive)) return;
        let alpha = 1;
        if (p.f & F.invisible) {
          const fl = flash.current.get(i);
          alpha = fl && n - fl < 500 ? 1 - (n - fl) / 500 : 0;
          if (alpha <= 0.02) return;
        }
        drawTank(g, p.x, p.y, p.body, p.turret, ti.color, alpha, !!(p.f & F.shield), !!(p.f & F.turbo), n);
      });

      // Effekte
      fx.current = fx.current.filter((e) => drawFx(g, e, n));
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [floor]);

  const startAt = view.startAt as number | undefined;
  const count = view.phase === 'ready' && startAt && now < startAt ? Math.ceil((startAt - now) / 1000) : 0;
  useEffect(() => {
    if (view.phase === 'ready' && count > 0) play.countdown(count);
  }, [count, view.phase]);
  useEffect(() => {
    if (view.phase === 'fight') play.countdown(0);
    else if (view.phase === 'clear') play.clear();
    else if (view.phase === 'fail') play.fail();
    else if (view.phase === 'roundEnd') view.winner ? sfx.play('fanfare', { always: true }) : play.fail();
  }, [view.phase, view.key]);
  // Musik: Marsch-Trommeln, je mehr Gegnerarten (Kampagne) bzw. je enger das Duell, desto mehr Instrumente
  const enemyTypes = Object.values(view.enemies as Record<string, [number, number]>).filter((e) => e[0] > 0).length;
  const aliveCount = (view.alive as string[]).length;
  const musicState = useRef<MusicState>({ layers: 1, urgent: false });
  musicState.current = {
    layers: view.phase !== 'fight' ? 1 : view.mode === 'kampagne' ? Math.min(5, 1 + enemyTypes) : aliveCount <= 2 ? 5 : 4,
    urgent: view.mode === 'kampagne' ? enemyTypes > 0 && Object.values(view.enemies as Record<string, [number, number]>).reduce((a, e) => a + e[0], 0) === 1 : aliveCount <= 2,
  };
  const track = useMemo(() => battleTrack(musicState), []);
  const musicOn = view.phase === 'ready' || view.phase === 'fight';
  useEffect(() => {
    if (!musicOn) { sfx.stopMusic(); return; }
    sfx.startMusic(track);
  }, [musicOn, track]);
  useEffect(() => () => sfx.stopMusic(), []);

  const players = tanks.filter((x) => x.kind === 'player' && x.pid);
  const aliveIds = new Set<string>(view.alive as string[]);
  const campaign = view.mode === 'kampagne';
  const enemies = view.enemies as Record<string, [number, number]>;
  const left = Object.values(enemies).reduce((s, e) => s + e[0], 0), totalE = Object.values(enemies).reduce((s, e) => s + e[1], 0);

  const pc = (id: string, fallback: string) => (view.colors?.[id] as string | undefined) ?? fallback;
  const card = (ti: TankInfo) => {
    const p = player(ti.pid!);
    if (!p) return null;
    const alive = aliveIds.has(p.id);
    return (
      <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 10, background: CARD, border: `1px solid ${pc(p.id, p.color)}55`, opacity: alive ? 1 : 0.45 }}>
        <span style={{ borderRadius: '50%', boxShadow: `0 0 0 2px ${pc(p.id, p.color)}`, flex: 'none' }}><Avatar player={p} size={32} /></span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
          {campaign ? <LifeIcons n={view.lives[p.id] ?? 0} color={p.color} /> : <div style={{ fontFamily: DISPLAY, fontSize: 13, color: MUTED }}>{t('points', { n: view.scores[p.id] ?? 0 })}</div>}
          {!alive && <div style={{ fontFamily: DISPLAY, fontSize: 11, color: '#FF5B5B' }}>{t('destroyed')}</div>}
        </div>
      </div>
    );
  };
  const half = campaign ? players.length : Math.ceil(players.length / 2);
  const leftCards = players.slice(0, half).map(card);
  const rightCards = campaign ? (
    <>
      <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 13, letterSpacing: 1, color: MUTED, paddingLeft: 4 }}>{t('enemies').toUpperCase()}</div>
      {Object.entries(enemies).map(([type, [alive, total]]) => (
        <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, background: CARD, border: `1px solid ${ENEMY_COLOR[type]}44`, opacity: alive ? 1 : 0.4 }}>
          <span style={{ width: 14, height: 14, borderRadius: 4, background: ENEMY_COLOR[type], boxShadow: `0 0 8px ${ENEMY_COLOR[type]}`, flex: 'none' }} />
          <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{t(`e.${type}`)}</span>
          <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 14, color: MUTED }}>{alive}/{total}</span>
        </div>
      ))}
    </>
  ) : players.slice(half).map(card);

  const winner = view.winner ? player(view.winner) : null;
  const teamWinners = ((view.winners ?? []) as string[]).length > 1 ? (view.winners as string[]).map((id) => player(id)).filter(Boolean) as PlayerInfo[] : null;
  const winTeam = view.teams && view.winner ? view.teams[view.winner] : null;
  const mid = campaign ? t('missionOf', { n: view.mission, total: view.missions }).toUpperCase() : `${t('mode.duell').toUpperCase()} · ${t('round', { n: view.round, total: view.total }).toUpperCase()}`;
  const right = campaign ? t('enemiesLeft', { n: left, total: totalE }) : t('inGame', { n: aliveIds.size, total: players.length });

  return (
    <Screen>
      <Header left="TANK TROUBLE" mid={mid} right={right} />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', minHeight: 0 }}>
        <div style={{ width: 186, display: 'flex', flexDirection: 'column', gap: 7 }}>{leftCards}</div>
        <div style={{ position: 'relative', width: CW, height: CH }}>
          <canvas ref={canvasRef} style={{ width: CW, height: CH, display: 'block' }} />
          {count > 0 && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
              <span key={count} className="anim-pop" style={{ fontFamily: DISPLAY, fontSize: 150, fontWeight: 700, color: TEXT, textShadow: `0 0 30px ${WALL}` }}>{count}</span>
            </div>
          )}
          {(view.phase === 'clear' || view.phase === 'fail' || view.phase === 'roundEnd') && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
              <div className="anim-pop" style={{ padding: '24px 40px', borderRadius: 24, background: 'rgba(7,11,24,.88)', border: `2px solid ${view.phase === 'fail' ? '#FF5B5B' : WALL}`, boxShadow: `0 0 40px ${view.phase === 'fail' ? '#FF5B5B' : WALL}55`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                {view.phase === 'clear' && <><Confetti silent /><h1 style={{ fontFamily: DISPLAY, fontSize: 52, color: '#7CFF6B' }}>{t('clear')}</h1>{view.extraLife && <b style={{ fontFamily: DISPLAY, fontSize: 24, color: '#FFD23F' }}>{t('extraLife')}</b>}</>}
                {view.phase === 'fail' && <><h1 style={{ fontFamily: DISPLAY, fontSize: 48, color: '#FF5B5B' }}>{t('fail')}</h1><span style={{ fontSize: 20, color: MUTED }}>{t('failRetry')}</span></>}
                {view.phase === 'roundEnd' && teamWinners && (
                  <>
                    <Confetti silent />
                    <div style={{ display: 'flex', gap: 10 }}>{teamWinners.map((p) => <Avatar key={p.id} player={p} size={64} />)}</div>
                    <h1 style={{ fontFamily: DISPLAY, fontSize: 40, color: winTeam === 1 ? '#FF4B4B' : '#3EC8FF' }}>{t(winTeam === 1 ? 'teamWin1' : 'teamWin2')}</h1>
                    <b style={{ fontFamily: DISPLAY, fontSize: 28, color: '#FFD23F' }}>+300</b>
                  </>
                )}
                {view.phase === 'roundEnd' && !teamWinners && (winner ? (
                  <>
                    <Confetti silent />
                    <span style={{ position: 'relative' }}><Avatar player={winner} size={96} /><Crown size={44} style={{ position: 'absolute', top: -30, left: 26 }} /></span>
                    <h1 style={{ fontFamily: DISPLAY, fontSize: 40 }}>{t('roundWin', { name: winner.name })}</h1>
                    <b style={{ fontFamily: DISPLAY, fontSize: 28, color: '#FFD23F' }}>+300</b>
                  </>
                ) : <h1 style={{ fontFamily: DISPLAY, fontSize: 40 }}>{view.cpuWon ? t('roundCpu') : t('roundDraw')}</h1>)}
              </div>
            </div>
          )}
        </div>
        <div style={{ width: 186, display: 'flex', flexDirection: 'column', gap: 7 }}>{rightCards}</div>
      </div>
    </Screen>
  );
}

/* ---------- Zeichnen ---------- */

function glow(g: CanvasRenderingContext2D, color?: string, blur = 0) {
  g.shadowColor = color ?? 'transparent';
  g.shadowBlur = color ? blur : 0;
}
function circle(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath();
  g.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
}
function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

function drawFloor(grid: string[]): HTMLCanvasElement {
  const pad = PAD / S;
  const c = document.createElement('canvas');
  c.width = Math.round((W + pad * 2) * 2);
  c.height = Math.round((H + pad * 2) * 2);
  const g = c.getContext('2d')!;
  g.scale(2, 2);
  g.translate(pad, pad);
  g.fillStyle = FLOOR;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = GRIDC;
  g.lineWidth = 1;
  g.beginPath();
  for (let x = 0; x <= COLS; x++) { g.moveTo(x * CELL, 0); g.lineTo(x * CELL, H); }
  for (let y = 0; y <= ROWS; y++) { g.moveTo(0, y * CELL); g.lineTo(W, y * CELL); }
  g.stroke();
  grid.forEach((row, r) => [...row].forEach((ch, col) => {
    const x = col * CELL, y = r * CELL;
    if (ch === '#') {
      glow(g, WALL, 8);
      g.fillStyle = '#0F2A3A'; g.strokeStyle = WALL; g.lineWidth = 2;
      roundRect(g, x + 2, y + 2, CELL - 4, CELL - 4, 4); g.fill(); g.stroke();
    } else if (ch === '+') {
      glow(g, SOFT, 8);
      g.fillStyle = '#2A0F2A'; g.strokeStyle = SOFT; g.lineWidth = 2; g.setLineDash([5, 3]);
      roundRect(g, x + 4, y + 4, CELL - 8, CELL - 8, 3); g.fill(); g.stroke();
      g.setLineDash([]);
    } else if (ch === '~') {
      glow(g);
      g.fillStyle = '#03050C'; g.strokeStyle = '#2A3A66'; g.lineWidth = 2;
      roundRect(g, x + 3, y + 3, CELL - 6, CELL - 6, 10); g.fill(); g.stroke();
    }
  }));
  glow(g, WALL, 14);
  g.strokeStyle = WALL; g.lineWidth = 4;
  roundRect(g, -3, -3, W + 6, H + 6, 8); g.stroke();
  glow(g);
  return c;
}

function drawTank(g: CanvasRenderingContext2D, x: number, y: number, body: number, turret: number, color: string, alpha: number, shield: boolean, turbo: boolean, n: number) {
  g.save();
  g.globalAlpha = alpha;
  g.translate(x, y);
  if (shield) {
    g.strokeStyle = '#9FF3FF'; g.lineWidth = 2; g.setLineDash([4, 3]);
    glow(g, '#9FF3FF', 10);
    circle(g, 0, 0, 25 + Math.sin(n / 150) * 1.5); g.stroke();
    g.setLineDash([]);
  }
  if (turbo) {
    g.strokeStyle = '#7CFF6B'; g.globalAlpha = alpha * 0.5; g.lineWidth = 2;
    circle(g, 0, 0, 21); g.stroke(); g.globalAlpha = alpha;
  }
  g.save();
  g.rotate(body);
  glow(g, color, 8);
  g.fillStyle = '#0A0F1E'; g.strokeStyle = color; g.lineWidth = 1.5;
  roundRect(g, -16, -15, 32, 7, 3); g.fill(); g.stroke();
  roundRect(g, -16, 8, 32, 7, 3); g.fill(); g.stroke();
  g.fillStyle = hexA(color, 0.3); g.lineWidth = 2;
  roundRect(g, -13, -10, 26, 20, 4); g.fill(); g.stroke();
  g.restore();
  g.rotate(turret);
  glow(g, color, 10);
  g.fillStyle = color;
  roundRect(g, 2, -3, 20, 6, 2); g.fill();
  g.fillStyle = '#0A0F1E'; g.strokeStyle = color; g.lineWidth = 2.5;
  circle(g, 0, 0, 8); g.fill(); g.stroke();
  glow(g);
  g.restore();
}

function drawPowerup(g: CanvasRenderingContext2D, x: number, y: number, kind: string, n: number) {
  const c = POWER_COLOR[kind] ?? '#fff';
  const s = 1 + Math.sin(n / 220) * 0.06;
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  glow(g, c, 12);
  g.fillStyle = '#0A0F1E'; g.strokeStyle = c; g.lineWidth = 2;
  g.beginPath();
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
    k ? g.lineTo(Math.cos(a) * 14, Math.sin(a) * 14) : g.moveTo(Math.cos(a) * 14, Math.sin(a) * 14);
  }
  g.closePath(); g.fill(); g.stroke();
  g.lineWidth = 2; g.lineJoin = 'round';
  g.beginPath();
  if (kind === 'schild') { g.moveTo(0, -8); g.lineTo(7, -5); g.lineTo(6, 3); g.lineTo(0, 8); g.lineTo(-6, 3); g.lineTo(-7, -5); g.closePath(); }
  else if (kind === 'rakete') { g.moveTo(-7, 0); g.lineTo(4, -4); g.lineTo(8, 0); g.lineTo(4, 4); g.closePath(); g.moveTo(-7, -4); g.lineTo(-4, 0); g.lineTo(-7, 4); }
  else if (kind === 'abprall') { g.moveTo(-8, 6); g.lineTo(-2, -6); g.lineTo(3, 4); g.lineTo(8, -6); }
  else if (kind === 'turbo') { g.moveTo(-6, -6); g.lineTo(0, 0); g.lineTo(-6, 6); g.moveTo(1, -6); g.lineTo(7, 0); g.lineTo(1, 6); }
  else { g.arc(0, 0, 5, 0, Math.PI * 2); }
  g.stroke();
  glow(g);
  g.restore();
}

function drawFx(g: CanvasRenderingContext2D, e: Fx, n: number): boolean {
  const age = n - e.at;
  if (e.kind === 'muzzle') {
    if (age > 140) return false;
    g.globalAlpha = 1 - age / 140;
    glow(g, e.color, 12); g.fillStyle = '#FFFFFF'; circle(g, e.x, e.y, 6 - age / 30); g.fill(); glow(g);
    g.globalAlpha = 1;
    return true;
  }
  if (e.kind === 'spark') {
    if (age > 220) return false;
    const k = age / 220;
    g.globalAlpha = 1 - k; g.strokeStyle = e.color ?? '#fff'; g.lineWidth = 2;
    for (let j = 0; j < 6; j++) {
      const a = (j / 6) * Math.PI * 2 + e.x;
      g.beginPath(); g.moveTo(e.x + Math.cos(a) * e.v * k * 0.4, e.y + Math.sin(a) * e.v * k * 0.4); g.lineTo(e.x + Math.cos(a) * e.v * (0.4 + k), e.y + Math.sin(a) * e.v * (0.4 + k)); g.stroke();
    }
    g.globalAlpha = 1;
    return true;
  }
  if (e.kind === 'blast') {
    if (age > 520) return false;
    const k = age / 520;
    g.globalAlpha = 1 - k;
    glow(g, e.color, 24);
    g.fillStyle = hexA(e.color ?? '#FF9F1C', 0.3); circle(g, e.x, e.y, e.v * (0.4 + 0.6 * k)); g.fill();
    g.strokeStyle = '#FFD23F'; g.lineWidth = 4; circle(g, e.x, e.y, e.v * (0.5 + 0.5 * k)); g.stroke();
    g.fillStyle = '#FFFFFF'; circle(g, e.x, e.y, 10 * (1 - k)); g.fill();
    glow(g); g.globalAlpha = 1;
    return true;
  }
  if (e.kind === 'ring') {
    if (age > 400) return false;
    const k = age / 400;
    g.globalAlpha = 1 - k; g.strokeStyle = e.color ?? '#fff'; g.lineWidth = 3;
    glow(g, e.color, 10); circle(g, e.x, e.y, e.v * (0.5 + k)); g.stroke(); glow(g);
    g.globalAlpha = 1;
    return true;
  }
  if (e.kind === 'text') {
    if (age > 1100) return false;
    g.globalAlpha = 1 - age / 1100;
    g.font = `700 20px ${DISPLAY}`; g.textAlign = 'center'; g.lineWidth = 5; g.strokeStyle = BG;
    g.strokeText(e.text ?? '', e.x, e.y - age / 30); g.fillStyle = e.color ?? '#fff'; g.fillText(e.text ?? '', e.x, e.y - age / 30);
    g.globalAlpha = 1;
    return true;
  }
  return false;
}

function hexA(hex: string, a: number) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), gg = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${gg},${b},${a})`;
}

/* ================= Handy ================= */

function useLandscape() {
  const get = () => window.innerWidth > window.innerHeight;
  const [land, setLand] = useState(get);
  useEffect(() => {
    const on = () => setLand(get());
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    return () => { window.removeEventListener('resize', on); window.removeEventListener('orientationchange', on); };
  }, []);
  return land;
}

function FireButton({ size, onFire, label, disabled }: { size: number; onFire: () => void; label: string; disabled: boolean }) {
  const [down, setDown] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const fireRef = useRef(onFire);
  fireRef.current = onFire;
  const stop = () => { setDown(false); if (timer.current) clearInterval(timer.current); timer.current = null; };
  useEffect(() => stop, []);
  return (
    <button type="button" aria-label={label}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        setDown(true);
        fireRef.current();
        if (timer.current) clearInterval(timer.current);
        timer.current = setInterval(() => fireRef.current(), 320);
      }}
      onPointerUp={stop} onPointerCancel={stop} onContextMenu={(e) => e.preventDefault()}
      style={{
        width: size, height: size, borderRadius: '50%', border: '3px solid #FF4F7B', flex: 'none',
        background: down ? '#FF4F7B' : 'rgba(255,79,123,.2)', color: down ? '#0A0F1E' : '#fff',
        boxShadow: `0 0 ${down ? 36 : 24}px rgba(255,79,123,.5)`, fontFamily: DISPLAY, fontWeight: 700, fontSize: Math.max(16, size * 0.17), letterSpacing: 2,
        touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', opacity: disabled ? 0.5 : 1, transform: down ? 'scale(.95)' : undefined, transition: 'transform .06s',
      }}>{label}</button>
  );
}

function MineButton({ label, count, onPress, compact }: { label: string; count: number; onPress: () => void; compact?: boolean }) {
  const [down, setDown] = useState(false);
  if (compact) {
    return (
      <button type="button" aria-label={`${label} (${count})`}
        onPointerDown={(e) => { e.preventDefault(); setDown(true); onPress(); }}
        onPointerUp={() => setDown(false)} onPointerCancel={() => setDown(false)} onContextMenu={(e) => e.preventDefault()}
        style={{
          width: 62, height: 62, borderRadius: '50%', border: '2px solid #FFD23F', background: down ? '#FFD23F' : 'rgba(255,210,63,.13)', flex: 'none', alignSelf: 'flex-end', marginBottom: 18,
          color: down ? '#0A0F1E' : '#FFD23F', fontFamily: DISPLAY, fontWeight: 700, fontSize: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
          touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', opacity: count > 0 ? 1 : 0.45, padding: 0,
        }}>
        <PowerIcon kind="mine" size={20} color={down ? '#0A0F1E' : '#FFD23F'} />{count}
      </button>
    );
  }
  return (
    <button type="button" aria-label={label}
      onPointerDown={(e) => { e.preventDefault(); setDown(true); onPress(); }}
      onPointerUp={() => setDown(false)} onPointerCancel={() => setDown(false)} onContextMenu={(e) => e.preventDefault()}
      style={{
        height: 50, padding: '0 22px', borderRadius: 999, border: '2px solid #FFD23F', background: down ? '#FFD23F' : 'rgba(255,210,63,.13)',
        color: down ? '#0A0F1E' : '#FFD23F', fontFamily: DISPLAY, fontWeight: 700, fontSize: 15, letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 8,
        touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', opacity: count > 0 ? 1 : 0.45, flex: 'none',
      }}>
      <PowerIcon kind="mine" color={down ? '#0A0F1E' : '#FFD23F'} />{label} · {count}
    </button>
  );
}

function PlayController({ view, t, send, me }: ControllerViewProps) {
  const land = useLandscape();
  const now = useServerNow(200);
  const sendRef = useRef(send);
  sendRef.current = send;
  const color = (view.color as string) ?? me.color;
  const onMove = useRef((x: number, y: number) => sendRef.current({ type: 'move', x, y })).current;
  const onAim = useRef((x: number, y: number) => {
    if (Math.hypot(x, y) < 0.3) return;
    sendRef.current({ type: 'aim', a: Math.round(Math.atan2(y, x) * 1000) / 1000 });
  }).current;
  const fire = () => { vibrate(12); sendRef.current({ type: 'fire' }); };
  const mine = () => { vibrate(25); sendRef.current({ type: 'mine' }); };
  const count = view.startAt && now < view.startAt ? Math.ceil((view.startAt - now) / 1000) : 0;
  const ammo = view.ammo ? String(view.ammo).split(':') : null;
  const vh = window.innerHeight, vw = window.innerWidth;
  const stick = land ? Math.min(vh * 0.5, 200) : Math.min(vw * 0.36, 160);
  const fireSize = land ? Math.min(vh * 0.6, vw * 0.27, 240) : Math.min(vw * 0.64, vh * 0.33, 280);

  const top = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', paddingLeft: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ borderRadius: '50%', boxShadow: `0 0 0 3px ${color}, 0 0 12px ${color}` }}><Avatar player={me} size={land ? 30 : 38} /></span>
        <b style={{ fontFamily: DISPLAY, fontSize: 17 }}>{me.name}</b>
        {view.mode === 'kampagne' ? <LifeIcons n={view.lives} color={color} /> : <span style={{ fontFamily: DISPLAY, color: MUTED, fontSize: 14 }}>{t('points', { n: view.score })}</span>}
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {view.shield && <Chip color={POWER_COLOR.schild}><PowerIcon kind="schild" />{t('p.schild')}</Chip>}
        {ammo && <Chip color={POWER_COLOR[ammo[0]]}><PowerIcon kind={ammo[0]} />{t(`p.${ammo[0]}`)} ×{ammo[1]}</Chip>}
        {view.turbo && <Chip color={POWER_COLOR.turbo}><PowerIcon kind="turbo" />{t('p.turbo')}</Chip>}
      </div>
      <div style={{ fontFamily: DISPLAY, fontSize: 15, color: MUTED, display: 'flex', alignItems: 'center', gap: 6 }}>
        {t('phone.bullets')}
        <span style={{ display: 'inline-flex', gap: 3 }}>
          {Array.from({ length: view.maxBullets ?? 5 }, (_, i) => <span key={i} style={{ width: 9, height: 9, borderRadius: '50%', background: i < (view.bullets ?? 0) ? color : 'transparent', border: `1.5px solid ${color}` }} />)}
        </span>
      </div>
    </div>
  );
  const center = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
      {count > 0 ? <span key={count} className="anim-pop" style={{ fontFamily: DISPLAY, fontSize: land ? 40 : 56, fontWeight: 700, position: land ? 'absolute' : undefined, top: land ? 52 : undefined }}>{count}</span> : null}
      <FireButton size={fireSize} label={t('phone.fire')} onFire={fire} disabled={!view.live || (view.bullets ?? 0) <= 0} />
      {land && <MineButton label={t('phone.mine')} count={view.mines ?? 0} onPress={mine} />}
    </div>
  );
  const driveStick = <Joystick onMove={onMove} color={color} size={stick} label={t('phone.drive')} ariaLabel={t('phone.drive')} zoneStyle={land ? { flex: 1, height: '100%', width: 'auto' } : { flex: 1, height: stick * 1.5, width: 'auto' }} />;
  const aimStick = <Joystick onMove={onAim} color={color} size={stick} label={t('phone.aim')} ariaLabel={t('phone.aim')} zoneStyle={land ? { flex: 1, height: '100%', width: 'auto' } : { flex: 1, height: stick * 1.5, width: 'auto' }} />;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 20, background: BG, color: TEXT, display: 'flex', flexDirection: 'column', gap: 8, padding: land ? '10px max(18px, env(safe-area-inset-right)) 10px max(18px, env(safe-area-inset-left))' : 'max(16px, env(safe-area-inset-top)) 14px max(20px, env(safe-area-inset-bottom))', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}>
      {top}
      {land ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minHeight: 0 }}>
          {driveStick}
          {center}
          {aimStick}
        </div>
      ) : (
        <>
          <p style={{ textAlign: 'center', color: MUTED, fontSize: 14 }}>{t('phone.rotate')}</p>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{center}</div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'stretch' }}>
            {driveStick}
            <MineButton compact label={t('phone.mine')} count={view.mines ?? 0} onPress={mine} />
            {aimStick}
          </div>
        </>
      )}
    </div>
  );
}

function Chip({ color, children }: { color: string; children: ReactNode }) {
  const style: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, border: `1px solid ${color}88`, background: CARD, color, fontFamily: DISPLAY, fontWeight: 600, fontSize: 12 };
  return <span style={style}>{children}</span>;
}

function Controller(props: ControllerViewProps) {
  const { view, t, me } = props;
  const prevLives = useRef<number | null>(null);
  useEffect(() => {
    if (view.screen === 'down' && prevLives.current !== null) vibrate([120, 60, 120]);
    prevLives.current = view.lives ?? null;
  }, [view.screen]);
  const icon = <TankIcon color={(view.color as string) ?? me.color} size={96} />;
  switch (view.screen) {
    case 'play':
      return <PlayController {...props} />;
    case 'down':
      return view.out
        ? <PhoneWait title={t('phone.out')} text={t('phone.outText')} emoji={<span style={{ opacity: 0.4 }}>{icon}</span>} />
        : <PhoneWait title={t('phone.down')} text={view.mode === 'kampagne' ? t('phone.downLives', { n: view.lives }) : t('phone.wait')} emoji={<span style={{ opacity: 0.5 }}>{icon}</span>} />;
    case 'between': {
      const title = view.phase === 'clear' ? t('phone.clear') : view.phase === 'fail' ? t('phone.fail') : view.won ? t('phone.won') : t('phone.roundOver');
      return (
        <div className="anim-fade" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, textAlign: 'center' }}>
          {(view.won || view.phase === 'clear') && <Confetti pieces={14} />}
          {icon}
          <h1 style={{ fontSize: 28, fontFamily: DISPLAY }}>{title}</h1>
          {view.mode === 'kampagne' ? <LifeIcons n={view.lives} color={view.color} /> : <p className="muted">{t('me.score', { n: view.score })}</p>}
        </div>
      );
    }
    case 'finalMe':
      return <PhoneWait title={t('me.place', { place: view.place, of: view.of })} text={`${t('me.score', { n: view.score })} · ${t('kills', { n: view.kills })}`} emoji={<Avatar player={me} size={100} />} />;
    case 'wait':
    default:
      if (view.phase === 'card') return <PhoneWait title={t('mission', { n: view.mission })} text={t('lives', { n: view.lives })} emoji={icon} />;
      return <PhoneWait title={t('title')} text={t('lookAtTv')} emoji={icon} />;
  }
}

export default { Host, Controller } satisfies GameClientModule;

