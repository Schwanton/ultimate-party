import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react';
import type { ControllerViewProps, GameClientModule, HostViewProps, PlayerInfo } from '@up/sdk';
import { Avatar, Confetti, Crown, HostHeader, HostTimer, PhoneTimer, PhoneWait, Podium, Scoreboard, sfx, useServerNow, useStream, vibrate } from '@up/ui';
import { ICON, WEAPON_COLOR, walkable } from './arena';
import { POWERUP, PRICE, RARITY_COLOR, REROLL_PRICE } from './powerups';

const PINK = '#FF4FB8';
const INK = '#07051A';
const FLAG = { air: 1, roll: 2, invuln: 4, gone: 8, out: 16, charge: 32, stun: 64 };

/** [x, y, Winkel°, Flags, Schaden, Leben, Ladung%] */
type PFrame = [number, number, number, number, number, number, number];
interface Frame { round: number; t: number; fire: number | null; p: PFrame[]; s: [number, number, number][]; e: (string | number)[][] }
interface ArenaView { cols: number; rows: number; grid: string[]; walls?: [number, number, number, number][]; bumpers: { x: number; y: number }[]; ring: number[]; ringMax: number; center: { x: number; y: number }; seed: number }

const heat = (d: number) => (d >= 100 ? '#FF3B4E' : d >= 60 ? '#FF9F43' : d >= 30 ? '#FFD447' : '#FFFFFF');

function WeaponIcon({ weapon, size = 24, color, style }: { weapon: string; size?: number; color?: string; style?: CSSProperties }) {
  const c = color ?? WEAPON_COLOR[weapon as keyof typeof WEAPON_COLOR] ?? '#FFFFFF';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ flex: 'none', ...style }}>
      <path d={ICON[weapon] ?? ICON.alle} fill="none" stroke={c} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/* ================= TV ================= */

function Host(props: HostViewProps) {
  const { view, t, player } = props;
  switch (view.screen) {
    case 'intro':
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 26, textAlign: 'center' }}>
          <span className="display anim-pop" style={{ fontSize: 150, fontWeight: 800, color: '#FFD447', transform: 'rotate(-4deg)', textShadow: '0 0 30px #FFD447, 0 0 60px #FF4FB8' }}>{t('title')}</span>
          <p className="anim-up" style={{ fontSize: 27, maxWidth: 980, lineHeight: 1.35, animationDelay: '.4s' }}>{t('intro.text')}</p>
          <p className="anim-up" style={{ fontSize: 21, color: '#36D6F5', animationDelay: '.7s' }}>{t('intro.controls', { alt: t(view.controls === 'gesten' ? 'intro.altGesture' : 'intro.altButton') })}</p>
          <p className="muted anim-up" style={{ fontSize: 20, animationDelay: '1s' }}>{t('intro.points')}</p>
        </div>
      );
    case 'weapon': {
      const ids = view.ids as string[];
      return (
        <>
          <HostHeader title={t('title')} color={PINK} right={<HostTimer deadline={view.deadline} duration={view.duration} />} />
          <h1 style={{ fontSize: 44, textAlign: 'center' }}>{t('weapon.title')}</h1>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(6, ids.length)}, minmax(0, 1fr))`, gap: 18, marginTop: 20 }}>
            {ids.map((id) => {
              const p = player(id);
              const w = view.chosen[id] as string | null;
              if (!p) return null;
              return (
                <div key={id} className="anim-pop" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: 16, borderRadius: 22, background: '#110D24', border: `3px solid ${w ? WEAPON_COLOR[w as 'hammer'] : '#2A2463'}`, boxShadow: w ? `0 0 18px ${WEAPON_COLOR[w as 'hammer']}66` : undefined }}>
                  <Avatar player={p} size={72} />
                  <b style={{ fontSize: 18 }}>{p.name}</b>
                  {w ? <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: WEAPON_COLOR[w as 'hammer'], fontWeight: 700 }}><WeaponIcon weapon={w} size={30} />{t(`w.${w}`)}</span>
                    : <span className="muted">{t('weapon.waiting')}</span>}
                </div>
              );
            })}
          </div>
        </>
      );
    }
    case 'arena':
      return <HostArena {...props} />;
    case 'pick': {
      const ids = view.ids as string[];
      const rows = ids.map((id) => ({ player: player(id)!, before: view.before[id] ?? 0, after: view.after[id] ?? 0 })).filter((r) => r.player);
      return (
        <>
          <HostHeader title={t('title')} color={PINK} info={view.start ? undefined : t('round', { n: view.round, total: view.total })} right={<HostTimer deadline={view.deadline} duration={view.duration} />} />
          {view.start ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, textAlign: 'center' }}>
              <h1 style={{ fontSize: 50 }}>{t('pick.startTitle')}</h1>
              <p className="muted" style={{ fontSize: 22 }}>{t('pick.startText')}</p>
            </div>
          ) : (
            <>
              <h1 style={{ fontSize: 32 }}>{t('scores.title')}</h1>
              <Scoreboard rows={rows} max={6} />
            </>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 'none', marginLeft: 40 }}>
            <b className="display" style={{ fontSize: 22 }}>{t('pick.waiting')}</b>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {ids.map((id) => {
                const p = player(id);
                return p ? <span key={id} style={{ opacity: view.chosen[id] ? 1 : 0.3, transition: 'opacity .3s', borderRadius: '50%', boxShadow: view.chosen[id] ? `0 0 0 3px ${p.color}, 0 0 14px ${p.color}` : undefined }}><Avatar player={p} size={44} /></span> : null;
              })}
            </div>
          </div>
        </>
      );
    }
    case 'shop': {
      const ids = view.ids as string[];
      return (
        <>
          <HostHeader title={t('title')} color={PINK} info={t('round', { n: view.round, total: view.total })} right={<HostTimer deadline={view.deadline} duration={view.duration} />} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <h1 className="display" style={{ fontSize: 64, color: '#FFD447', textShadow: '0 0 24px #FFD447' }}>{t('shop.title')}</h1>
            <p className="muted" style={{ fontSize: 22 }}>{t('shop.tv')}</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(6, ids.length)}, minmax(0, 1fr))`, gap: 14, marginTop: 10 }}>
            {ids.map((id) => {
              const p = player(id);
              if (!p) return null;
              const done = view.done[id];
              return (
                <div key={id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 14, borderRadius: 20, background: '#110D24', border: `3px solid ${done ? '#4BE3A1' : '#2A2463'}` }}>
                  <Avatar player={p} size={60} />
                  <b style={{ fontSize: 16 }}>{p.name}</b>
                  <span className="muted" style={{ fontSize: 14 }}>{done ? t('shop.ready') : t('shop.shopping')}{view.bought[id] ? ` · ${t('shop.boughtN', { n: view.bought[id] })}` : ''}</span>
                </div>
              );
            })}
          </div>
        </>
      );
    }
    case 'scores': {
      const rows = Object.keys(view.after).map((id) => ({ player: player(id)!, before: view.before[id] ?? 0, after: view.after[id] })).filter((r) => r.player);
      return (
        <>
          <HostHeader title={t('title')} color={PINK} info={t('round', { n: view.round, total: view.total })} />
          <h1 style={{ fontSize: 36 }}>{t('scores.title')}</h1>
          <Scoreboard rows={rows} />
        </>
      );
    }
    case 'final':
      return (
        <>
          <HostHeader title={t('title')} color={PINK} info={t('final.title')} />
          <Podium ranking={view.ranking} player={player} pointsLabel={t('common.points')} />
        </>
      );
  }
  return null;
}

interface Effect { kind: string; x: number; y: number; at: number; v: number; color?: string; text?: string }

function HostArena({ view, t, player }: HostViewProps) {
  const frame = useStream<Frame>();
  const now = useServerNow(250);
  const ids = view.ids as string[];
  const arena = view.arena as ArenaView;
  const fr = frame && frame.round === view.round && frame.p.length === ids.length ? frame : null;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const W = 1168, H = 506;

  // Bildfolge für flüssige Bewegung (zwischen den letzten zwei Server-Bildern)
  const frames = useRef<{ prev: Frame | null; cur: Frame | null; at: number }>({ prev: null, cur: null, at: 0 });
  const effects = useRef<Effect[]>([]);
  const shake = useRef({ until: 0, power: 0 });
  const bumpAt = useRef(new Map<string, number>());
  const info = useRef({ ids, colors: [] as string[], names: [] as string[], weapons: [] as string[] });
  info.current = {
    ids,
    colors: ids.map((id) => player(id)?.color ?? '#FFFFFF'),
    names: ids.map((id) => player(id)?.name ?? ''),
    weapons: ids.map((id) => (view.weapons?.[id] as string) ?? 'hammer'),
  };

  // Ansicht: Ausschnitt mit allen begehbaren Feldern
  const layout = useRef({ scale: 1, ox: 0, oy: 0 });
  const floorCanvas = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!arena) return;
    const cell = view.cell as number;
    let minX = arena.cols, minY = arena.rows, maxX = 0, maxY = 0;
    arena.grid.forEach((row, y) => [...row].forEach((c, x) => {
      if (c === '.') return;
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }));
    const bw = (maxX - minX + 2) * cell, bh = (maxY - minY + 2) * cell;
    const scale = Math.min(1.7, W / bw, H / bh);
    layout.current = { scale, ox: (W - (maxX + minX + 1) * cell * scale) / 2, oy: (H - (maxY + minY + 1) * cell * scale) / 2 };
    floorCanvas.current = drawFloor(arena, cell, scale, layout.current.ox, layout.current.oy, W, H);
  }, [arena, view.cell]);

  // Neue Server-Bilder: Effekte und Klänge
  useEffect(() => {
    if (!fr) return;
    const f = frames.current;
    if (f.cur !== fr) {
      f.prev = f.cur && f.cur.round === fr.round ? f.cur : fr;
      f.cur = fr;
      f.at = performance.now();
    }
    const n = performance.now();
    for (const e of fr.e) {
      const [kind] = e;
      if (kind === 'hit') {
        const [, x, y, kb] = e as [string, number, number, number, number];
        effects.current.push({ kind: 'spark', x, y, at: n, v: kb });
        if (kb > 420) {
          effects.current.push({ kind: 'bonk', x, y, at: n, v: kb });
          shake.current = { until: n + 260, power: Math.min(12, kb / 90) };
        }
        const v = Math.min(0.5, 0.12 + kb / 1600);
        sfx.custom((s) => { s.tone(kb > 420 ? 120 : 220, 0.14, { type: 'square', vol: v * 0.5, to: 60 }); s.noise(0.09, { filter: 1400, vol: v * 0.6 }); });
      } else if (kind === 'fall') {
        const [, i, x, y] = e as [string, number, number, number];
        effects.current.push({ kind: 'fall', x, y, at: n, v: i, color: info.current.colors[i] });
        sfx.custom((s) => { s.tone(600, 0.8, { type: 'sine', vol: 0.16, to: 90 }); s.noise(0.3, { filter: 300, type: 'lowpass', vol: 0.25, at: 0.6 }); });
      } else if (kind === 'ko') {
        const [, by] = e as [string, number, number];
        const p = fr.p[by];
        if (p) effects.current.push({ kind: 'text', x: p[0], y: p[1] - 40, at: n, v: 0, text: '+100', color: info.current.colors[by] });
      } else if (kind === 'stomp') {
        const [, x, y, r] = e as [string, number, number, number];
        effects.current.push({ kind: 'ring', x, y, at: n, v: r ?? 78, color: '#FFD447' });
        shake.current = { until: n + 180, power: 5 };
        sfx.custom((s) => { s.tone(90, 0.25, { type: 'sine', vol: 0.4, to: 40 }); s.noise(0.2, { filter: 400, type: 'lowpass', vol: 0.3 }); });
      } else if (kind === 'swing') {
        const [, i, c, whirl] = e as [string, number, number, number];
        const p = fr.p[i];
        if (p) effects.current.push({ kind: whirl ? 'whirl' : 'swoosh', x: p[0], y: p[1], at: n, v: p[2], text: String(c), color: info.current.colors[i] });
        sfx.custom((s) => s.noise(0.16, { filter: 800, sweepTo: 3000, vol: 0.06 + c / 1200 }));
      } else if (kind === 'shot') {
        const [, , big] = e as [string, number, number];
        sfx.custom((s) => s.tone(big ? 500 : 900, big ? 0.15 : 0.06, { type: 'triangle', vol: big ? 0.12 : 0.05, to: big ? 200 : 600 }));
      } else if (kind === 'roll') {
        sfx.custom((s) => s.noise(0.2, { filter: 500, sweepTo: 2500, vol: 0.06 }));
      } else if (kind === 'spawn') {
        const [, i] = e as [string, number];
        const p = fr.p[i];
        if (p) effects.current.push({ kind: 'ring', x: p[0], y: p[1], at: n, v: 40, color: info.current.colors[i] });
      } else if (kind === 'bump') {
        const [, x, y] = e as [string, number, number];
        bumpAt.current.set(`${x},${y}`, n);
        sfx.custom((s) => s.tone(300, 0.15, { type: 'sine', vol: 0.2, to: 700 }));
      } else if (kind === 'wall') {
        const [, x, y] = e as [string, number, number];
        effects.current.push({ kind: 'spark', x, y, at: n, v: 200 });
      }
    }
  }, [fr]);

  // Zeichnen (60× pro Sekunde)
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      const { prev, cur, at } = frames.current;
      if (!canvas || !arena) return;
      const g = canvas.getContext('2d');
      if (!g) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (canvas.width !== W * dpr) { canvas.width = W * dpr; canvas.height = H * dpr; }
      const n = performance.now();
      const { scale, ox, oy } = layout.current;
      const cell = view.cell as number;
      const R = view.radius as number;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      if (n < shake.current.until) {
        const k = shake.current.power * ((shake.current.until - n) / 260);
        g.translate((Math.random() - 0.5) * k, (Math.random() - 0.5) * k);
      }
      if (floorCanvas.current) g.drawImage(floorCanvas.current, 0, 0, W, H);
      g.translate(ox, oy);
      g.scale(scale, scale);

      // Feuer
      const fire = cur?.fire ?? null;
      if (fire !== null) {
        for (let y = 0; y < arena.rows; y++) for (let x = 0; x < arena.cols; x++) {
          const c = arena.grid[y][x];
          if (c === '.') continue;
          const r = arena.ring[y * arena.cols + x];
          if (r > fire) {
            const flick = 0.55 + 0.25 * Math.sin(n / 90 + x * 1.7 + y * 2.3);
            g.fillStyle = `rgba(255,107,44,${flick})`;
            g.fillRect(x * cell, y * cell, cell, cell);
            g.fillStyle = `rgba(255,212,71,${flick * 0.5})`;
            g.fillRect(x * cell + cell * 0.25, y * cell + cell * 0.25, cell * 0.5, cell * 0.5);
          } else if (r > fire - 1.3) {
            g.fillStyle = `rgba(255,159,67,${0.18 + 0.12 * Math.sin(n / 150)})`;
            g.fillRect(x * cell, y * cell, cell, cell);
          }
        }
      }
      // Prallkissen
      for (const b of arena.bumpers) {
        const hitAt = bumpAt.current.get(`${b.x},${b.y}`) ?? 0;
        const k = Math.max(0, 1 - (n - hitAt) / 250);
        glow(g, '#FF7EB6', 12);
        g.strokeStyle = '#FF7EB6';
        g.lineWidth = 4;
        circle(g, b.x, b.y, 20 + 6 * k); g.stroke();
        g.lineWidth = 3;
        circle(g, b.x, b.y, 10 + 3 * k); g.stroke();
        glow(g);
      }
      if (!cur || !prev) return;
      const a = Math.min(1, (n - at) / 34);
      const lerp = (p: number, q: number) => p + (q - p) * a;

      // Geschosse
      for (const s of cur.s) {
        glow(g, '#FF9F43', 10);
        g.fillStyle = s[2] ? '#FFD447' : '#FFFFFF';
        circle(g, s[0], s[1], s[2] ? 9 : 5); g.fill();
      }
      glow(g);

      // Figuren
      const { colors, names, weapons } = info.current;
      cur.p.forEach((p, i) => {
        const q = prev.p[i] ?? p;
        const flags = p[3];
        if (flags & (FLAG.gone | FLAG.out)) return;
        const x = lerp(q[0], p[0]), y = lerp(q[1], p[1]);
        const ang = (p[2] * Math.PI) / 180;
        const color = colors[i];
        if (flags & FLAG.invuln && Math.floor(n / 90) % 2 === 0) g.globalAlpha = 0.35;
        const air = flags & FLAG.air;
        const sc = air ? 1.14 : 1;
        if (air) { g.fillStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.ellipse(x + 6, y + 12, R, R * 0.5, 0, 0, Math.PI * 2); g.fill(); }
        if (flags & FLAG.roll) {
          g.strokeStyle = color + '88'; g.lineWidth = 3;
          for (let k = 1; k <= 3; k++) { g.beginPath(); g.moveTo(x - Math.cos(ang) * (R + k * 8), y - Math.sin(ang) * (R + k * 8) - 6 + k * 3); g.lineTo(x - Math.cos(ang) * (R + k * 8 + 10), y - Math.sin(ang) * (R + k * 8 + 10) - 6 + k * 3); g.stroke(); }
        }
        drawWeapon(g, weapons[i], x, y, ang, R, color, flags & FLAG.charge ? p[6] : -1);
        drawFigure(g, x, y, R * sc, color, ang, !!(flags & FLAG.stun));
        g.globalAlpha = 1;
        if (flags & FLAG.charge) {
          g.strokeStyle = '#FFD447'; g.lineWidth = 4; glow(g, '#FFD447', 10);
          g.beginPath(); g.arc(x, y, R + 9, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * p[6]) / 100); g.stroke(); glow(g);
        }
        g.font = '800 17px "Bricolage Grotesque", sans-serif';
        g.textAlign = 'center';
        g.lineWidth = 5; g.strokeStyle = INK;
        g.strokeText(`${p[4]}%`, x, y - R - 16); g.fillStyle = heat(p[4]); g.fillText(`${p[4]}%`, x, y - R - 16);
        if (ids.length <= 6) {
          g.font = '700 12px "DM Sans", sans-serif';
          g.strokeText(names[i], x, y + R + 18); g.fillStyle = '#E4E0F5'; g.fillText(names[i], x, y + R + 18);
        }
      });

      // Effekte
      effects.current = effects.current.filter((e) => {
        const age = n - e.at;
        if (e.kind === 'spark') {
          if (age > 220) return false;
          const k = age / 220, len = 10 + Math.min(30, e.v / 25);
          g.strokeStyle = `rgba(255,255,255,${1 - k})`; g.lineWidth = 3;
          for (let j = 0; j < 8; j++) {
            const an = (j / 8) * Math.PI * 2;
            g.beginPath(); g.moveTo(e.x + Math.cos(an) * (8 + len * k), e.y + Math.sin(an) * (8 + len * k)); g.lineTo(e.x + Math.cos(an) * (8 + len * k + 8), e.y + Math.sin(an) * (8 + len * k + 8)); g.stroke();
          }
          return true;
        }
        if (e.kind === 'bonk') {
          if (age > 700) return false;
          const k = age / 700, s = 1 + 0.4 * Math.sin(Math.min(1, age / 120) * Math.PI);
          g.save(); g.translate(e.x + 10, e.y - 34 - k * 20); g.rotate(-0.17); g.scale(s, s); g.globalAlpha = 1 - k * k;
          star(g, 0, 8, 30); glow(g, '#FFD447', 16); g.fillStyle = '#FFD447'; g.fill(); glow(g);
          g.font = '800 30px "Bricolage Grotesque", sans-serif'; g.textAlign = 'center'; g.lineWidth = 6; g.strokeStyle = PINK;
          g.strokeText('BONK!', 0, 0); g.fillStyle = '#FFFFFF'; g.fillText('BONK!', 0, 0);
          g.restore();
          return true;
        }
        if (e.kind === 'ring') {
          if (age > 350) return false;
          const k = age / 350;
          g.strokeStyle = e.color ?? '#FFFFFF'; g.globalAlpha = 1 - k; g.lineWidth = 4; glow(g, e.color, 12);
          circle(g, e.x, e.y, 10 + e.v * k); g.stroke(); glow(g); g.globalAlpha = 1;
          return true;
        }
        if (e.kind === 'fall') {
          if (age > 800) return false;
          const k = age / 800;
          g.save(); g.translate(e.x, e.y); g.rotate(k * 5); g.globalAlpha = 1 - k;
          drawFigure(g, 0, 0, R * (1 - k * 0.8), e.color ?? '#FFFFFF', 0, true);
          g.restore();
          return true;
        }
        if (e.kind === 'swoosh') {
          if (age > 180) return false;
          const c = Number(e.text) / 100, ang = (e.v * Math.PI) / 180;
          g.strokeStyle = e.color ?? '#FFFFFF'; g.globalAlpha = 1 - age / 180; g.lineWidth = 5 + 5 * c; glow(g, e.color, 14);
          g.beginPath(); g.arc(e.x, e.y, R + 22 + 10 * c, ang - 0.9, ang + 0.9); g.stroke(); glow(g); g.globalAlpha = 1;
          return true;
        }
        if (e.kind === 'whirl') {
          if (age > 260) return false;
          g.strokeStyle = e.color ?? '#FFFFFF'; g.globalAlpha = 1 - age / 260; g.lineWidth = 8; glow(g, e.color, 16);
          circle(g, e.x, e.y, R + 26 + age / 12); g.stroke(); glow(g); g.globalAlpha = 1;
          return true;
        }
        if (e.kind === 'text') {
          if (age > 1100) return false;
          g.globalAlpha = 1 - age / 1100;
          g.font = '800 22px "Bricolage Grotesque", sans-serif'; g.textAlign = 'center'; g.lineWidth = 5; g.strokeStyle = INK;
          g.strokeText(e.text ?? '', e.x, e.y - age / 30); g.fillStyle = e.color ?? '#FFFFFF'; g.fillText(e.text ?? '', e.x, e.y - age / 30);
          g.globalAlpha = 1;
          return true;
        }
        return false;
      });
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [arena, view.cell, view.radius, ids.length]);

  const startAt = view.startAt as number | undefined;
  const count = startAt && now < startAt ? Math.ceil((startAt - now) / 1000) : 0;
  const ended = view.phase === 'roundEnd';
  const winners = ((view.winners ?? []) as string[]).map((id) => player(id)).filter(Boolean) as PlayerInfo[];
  const gameT = fr?.t ?? 0;
  const fireIn = Math.ceil((view.fireStart as number) - gameT);

  return (
    <>
      <HostHeader title={t('title')} color={PINK} info={t('round', { n: view.round, total: view.total })}
        right={view.phase === 'fight' ? (
          fireIn > 0
            ? <span className="up-chip" style={{ fontSize: 17, opacity: fireIn > 15 ? 0.6 : 1 }}>{t('fire.in', { n: fireIn })}</span>
            : <span className="up-chip" style={{ fontSize: 17, color: '#FF9F43', boxShadow: '0 0 16px #FF6B2C' }}>{t('fire.now')}</span>
        ) : undefined} />
      <div style={{ position: 'relative', width: W, height: H, flex: 'none', borderRadius: 24, overflow: 'hidden', background: 'radial-gradient(ellipse at center, #140F3A, #05030F 75%)' }}>
        <canvas ref={canvasRef} style={{ width: W, height: H, display: 'block' }} />
        {count > 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <span key={count} className="display anim-pop" style={{ fontSize: 160, fontWeight: 800, textShadow: '0 0 30px #FF4FB8' }}>{count}</span>
          </div>
        )}
        {ended && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="up-card anim-pop" style={{ padding: '26px 40px', borderRadius: 30, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, boxShadow: '0 0 40px #FF4FB866' }}>
              <Confetti silent />
              {winners.length === 1 ? (
                <>
                  <span style={{ position: 'relative' }}><Avatar player={winners[0]} size={110} /><Crown size={50} style={{ position: 'absolute', top: -34, left: 30 }} /></span>
                  <h1 style={{ fontSize: 40 }}>{t('win', { name: winners[0].name })}</h1>
                  <b className="display" style={{ fontSize: 30, color: 'var(--yellow)' }}>+300</b>
                </>
              ) : <h1 style={{ fontSize: 40 }}>{t('draw')}</h1>}
            </div>
          </div>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(6, ids.length)}, minmax(0, 1fr))`, gap: 8, flex: 'none', margin: '0 44px 0 40px' }}>
        {ids.map((id, i) => {
          const p = player(id);
          const st = fr?.p[i];
          if (!p) return null;
          const out = st ? st[3] & FLAG.out : 0;
          const lives = st?.[5] ?? 3;
          return (
            <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: ids.length > 6 ? '3px 10px' : '6px 10px', borderRadius: 14, background: '#110D24', border: `2px solid ${p.color}`, boxShadow: `0 0 10px ${p.color}55`, opacity: out ? 0.35 : 1 }}>
              <WeaponIcon weapon={(view.weapons?.[id] as string) ?? 'hammer'} size={ids.length > 6 ? 18 : 24} color={p.color} />
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1, lineHeight: 1.15 }}>
                <b style={{ fontSize: ids.length > 6 ? 12 : 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</b>
                <span style={{ fontSize: 12, color: p.color, letterSpacing: 1 }}>{'♥'.repeat(Math.max(0, lives))}{'♡'.repeat(Math.max(0, 3 - lives))}</span>
              </div>
              <b className="display" style={{ fontSize: ids.length > 6 ? 16 : 20, color: heat(st?.[4] ?? 0) }}>{st?.[4] ?? 0}%</b>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ---------- Zeichenhilfen ---------- */

function glow(g: CanvasRenderingContext2D, color?: string, blur = 0) {
  g.shadowColor = color ?? 'transparent';
  g.shadowBlur = color ? blur : 0;
}
function circle(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath(); g.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
}
function star(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const an = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr);
  }
  g.closePath();
}

function drawFigure(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, ang: number, dizzy: boolean) {
  const ex = Math.cos(ang) * r * 0.18, ey = Math.sin(ang) * r * 0.18;
  glow(g, color, 14);
  g.fillStyle = '#110D24'; g.strokeStyle = color; g.lineWidth = 3;
  for (const s of [-1, 1]) { circle(g, x + s * r * 0.6, y - r * 0.72, r * 0.36); g.fill(); g.stroke(); }
  g.lineWidth = 3.5;
  circle(g, x, y, r); g.fill(); g.stroke();
  glow(g);
  g.fillStyle = color;
  if (dizzy) {
    g.strokeStyle = color; g.lineWidth = 2;
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(x + s * r * 0.35 - 3, y - 3); g.lineTo(x + s * r * 0.35 + 3, y + 3); g.moveTo(x + s * r * 0.35 + 3, y - 3); g.lineTo(x + s * r * 0.35 - 3, y + 3); g.stroke(); }
  } else {
    for (const s of [-1, 1]) { circle(g, x + s * r * 0.35 + ex, y + ey, r * 0.15); g.fill(); }
  }
}

function drawWeapon(g: CanvasRenderingContext2D, weapon: string, x: number, y: number, ang: number, r: number, color: string, charge: number) {
  g.save();
  g.translate(x, y);
  g.rotate(ang + (charge >= 0 ? -1.1 - charge / 120 : 0));
  glow(g, color, 10);
  g.strokeStyle = color; g.fillStyle = '#110D24'; g.lineWidth = 3;
  if (weapon === 'schleuder') {
    g.beginPath(); g.moveTo(r - 2, 0); g.lineTo(r + 10, 0); g.moveTo(r + 10, 0); g.lineTo(r + 18, -7); g.moveTo(r + 10, 0); g.lineTo(r + 18, 7); g.stroke();
  } else {
    g.beginPath(); g.moveTo(r - 4, 0); g.lineTo(r + 16, 0); g.stroke();
    g.beginPath(); g.rect(r + 12, -9, 12, 18); g.fill(); g.stroke();
  }
  glow(g);
  g.restore();
}

/** Boden einmal pro Arena vorzeichnen: Felder, leuchtende Kanten, Säulen, Sterne im Abgrund */
function drawFloor(arena: ArenaView, cell: number, scale: number, ox: number, oy: number, W: number, H: number) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const c = document.createElement('canvas');
  c.width = W * dpr; c.height = H * dpr;
  const g = c.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  // Sterne
  let s = arena.seed || 1;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.fillStyle = '#4A4378';
  for (let i = 0; i < 70; i++) { circle(g, rnd() * W, rnd() * H, rnd() * 1.6 + 0.4); g.fill(); }
  g.translate(ox, oy);
  g.scale(scale, scale);
  const at = (x: number, y: number) => arena.grid[y]?.[x] ?? '.';
  const solid = (ch: string) => walkable(ch) || ch === 'o';
  // Flächen
  for (let y = 0; y < arena.rows; y++) for (let x = 0; x < arena.cols; x++) {
    const ch = at(x, y);
    if (!solid(ch)) continue;
    g.fillStyle = ch === '=' ? '#1A1540' : ch === 'i' ? '#123352' : '#16123A';
    g.fillRect(x * cell, y * cell, cell + 0.5, cell + 0.5);
    g.strokeStyle = ch === '=' ? 'rgba(255,212,71,0.25)' : ch === 'i' ? 'rgba(127,230,255,0.35)' : '#2A2463';
    g.lineWidth = 1.5;
    g.strokeRect(x * cell + 0.75, y * cell + 0.75, cell - 1.5, cell - 1.5);
    if (ch === 'i') { g.beginPath(); g.moveTo(x * cell + 8, y * cell + 28); g.lineTo(x * cell + 20, y * cell + 16); g.stroke(); }
  }
  // Leuchtende Kanten zum Abgrund
  g.lineCap = 'round';
  for (let y = 0; y < arena.rows; y++) for (let x = 0; x < arena.cols; x++) {
    const ch = at(x, y);
    if (!solid(ch)) continue;
    const color = ch === '=' ? '#FFD447' : '#36D6F5';
    glow(g, color, 10);
    g.strokeStyle = color; g.lineWidth = 3;
    const X = x * cell, Y = y * cell;
    g.beginPath();
    if (!solid(at(x, y - 1))) { g.moveTo(X, Y); g.lineTo(X + cell, Y); }
    if (!solid(at(x, y + 1))) { g.moveTo(X, Y + cell); g.lineTo(X + cell, Y + cell); }
    if (!solid(at(x - 1, y))) { g.moveTo(X, Y); g.lineTo(X, Y + cell); }
    if (!solid(at(x + 1, y))) { g.moveTo(X + cell, Y); g.lineTo(X + cell, Y + cell); }
    g.stroke();
  }
  glow(g);
  // Wände
  g.lineCap = 'round';
  for (const [x1, y1, x2, y2] of arena.walls ?? []) {
    glow(g, '#C29BFF', 16);
    g.strokeStyle = '#C29BFF'; g.lineWidth = 9;
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    glow(g);
    g.strokeStyle = '#FFFFFF'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
  }
  // Säulen
  for (let y = 0; y < arena.rows; y++) for (let x = 0; x < arena.cols; x++) {
    if (at(x, y) !== 'o') continue;
    glow(g, '#9B7BFF', 14);
    g.fillStyle = '#110D24'; g.strokeStyle = '#9B7BFF'; g.lineWidth = 4;
    circle(g, (x + 0.5) * cell, (y + 0.5) * cell, 17); g.fill(); g.stroke();
    glow(g);
    g.strokeStyle = 'rgba(155,123,255,0.5)'; g.lineWidth = 2;
    circle(g, (x + 0.5) * cell, (y + 0.5) * cell, 9); g.stroke();
  }
  return c;
}

/* ================= Handy ================= */

function useLandscape() {
  const get = () => typeof window !== 'undefined' && window.innerWidth > window.innerHeight;
  const [land, setLand] = useState(get);
  useEffect(() => {
    const on = () => setLand(get());
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    return () => { window.removeEventListener('resize', on); window.removeEventListener('orientationchange', on); };
  }, []);
  return land;
}

function Joystick({ onMove, color, size }: { onMove: (x: number, y: number) => void; color: string; size: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState<[number, number]>([0, 0]);
  const active = useRef(false);
  const last = useRef({ x: 0, y: 0, at: 0 });
  const send = (x: number, y: number, force = false) => {
    const n = performance.now();
    if (!force && n - last.current.at < 45 && Math.hypot(x - last.current.x, y - last.current.y) < 0.3) return;
    last.current = { x, y, at: n };
    onMove(x, y);
  };
  const update = (e: RPointerEvent) => {
    const rect = ref.current!.getBoundingClientRect();
    const R = rect.width / 2;
    let x = (e.clientX - rect.left - R) / (R * 0.8), y = (e.clientY - rect.top - R) / (R * 0.8);
    const len = Math.hypot(x, y);
    if (len > 1) [x, y] = [x / len, y / len];
    setKnob([x, y]);
    send(Math.round(x * 100) / 100, Math.round(y * 100) / 100);
  };
  const end = () => { active.current = false; setKnob([0, 0]); send(0, 0, true); };
  useEffect(() => {
    const id = setInterval(() => active.current && onMove(last.current.x, last.current.y), 400);
    return () => clearInterval(id);
  }, [onMove]);
  const k = size * 0.4;
  return (
    <div ref={ref} role="application" aria-label="Joystick"
      onPointerDown={(e) => { e.preventDefault(); active.current = true; (e.target as Element).setPointerCapture?.(e.pointerId); update(e); }}
      onPointerMove={(e) => active.current && update(e)} onPointerUp={end} onPointerCancel={end}
      style={{ width: size, height: size, borderRadius: '50%', background: 'radial-gradient(circle, #1C1738 0 60%, #110D24 61%)', boxShadow: `inset 0 0 0 3px ${color}66, 0 0 18px ${color}33`, position: 'relative', touchAction: 'none', flex: 'none' }}>
      <div style={{ position: 'absolute', left: '50%', top: '50%', width: k, height: k, borderRadius: '50%', background: color, boxShadow: `0 0 22px ${color}`, transform: `translate(calc(-50% + ${knob[0] * size * 0.36}px), calc(-50% + ${knob[1] * size * 0.36}px))`, transition: active.current ? undefined : 'transform .15s', pointerEvents: 'none' }} />
    </div>
  );
}

function RoundButton({ size, color, label, sub, icon, onDown, onUp, ready = 1, ariaLabel, style }: {
  size: number; color: string; label?: string; sub?: string; icon?: string; onDown: () => void; onUp?: () => void; ready?: number; ariaLabel: string; style?: CSSProperties;
}) {
  const [pressed, setPressed] = useState(false);
  const off = ready < 1;
  return (
    <button type="button" aria-label={ariaLabel}
      onPointerDown={(e) => { e.preventDefault(); (e.target as Element).setPointerCapture?.(e.pointerId); setPressed(true); onDown(); }}
      onPointerUp={() => { setPressed(false); onUp?.(); }} onPointerCancel={() => { setPressed(false); onUp?.(); }}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        width: size, height: size, borderRadius: '50%', border: `3px solid ${color}`, flex: 'none', position: 'relative', overflow: 'hidden',
        background: pressed ? color : '#110D24', color: pressed ? '#110D24' : color, touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none',
        boxShadow: off ? 'none' : `0 0 ${pressed ? 30 : 16}px ${color}88`, opacity: off ? 0.55 : 1,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, fontFamily: 'var(--display)', fontWeight: 800,
        transform: pressed ? 'scale(.94)' : undefined, transition: 'transform .06s', ...style,
      }}>
      {off && <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${ready * 100}%`, background: `${color}33`, pointerEvents: 'none' }} />}
      {icon && <WeaponIcon weapon={icon} size={size * 0.38} color={pressed ? '#110D24' : color} />}
      {label && <span style={{ fontSize: Math.max(10, Math.min(size * 0.16, (size * 1.45) / label.length)), lineHeight: 1, pointerEvents: 'none' }}>{label}</span>}
      {sub && <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.8, pointerEvents: 'none' }}>{sub}</span>}
    </button>
  );
}

function useCooldown(seconds: number) {
  const [until, setUntil] = useState(0);
  const [, force] = useState(0);
  useEffect(() => {
    if (Date.now() >= until) return;
    const id = setInterval(() => { force((x) => x + 1); if (Date.now() >= until) clearInterval(id); }, 80);
    return () => clearInterval(id);
  }, [until]);
  const ready = until <= Date.now() ? 1 : 1 - (until - Date.now()) / (seconds * 1000);
  return { ready, start: () => setUntil(Date.now() + seconds * 1000), isReady: () => Date.now() >= until };
}

function PlayController({ view, t, send, me }: ControllerViewProps) {
  const land = useLandscape();
  const now = useServerNow(200);
  const roll = useCooldown(view.rollCd ?? 1.5);
  const altCd = useCooldown(view.altCd ?? 3);
  const multiRoll = (view.rolls ?? 1) > 1;
  const lastUp = useRef(0);
  const altPress = useRef(false);
  const sendRef = useRef(send);
  sendRef.current = send;
  const onMove = useRef((x: number, y: number) => sendRef.current({ type: 'input', x, y })).current;
  const prev = useRef({ dmg: view.dmg as number, lives: view.lives as number });
  useEffect(() => {
    if (view.lives < prev.current.lives) vibrate([90, 50, 90]);
    else if (view.dmg > prev.current.dmg) vibrate(Math.min(80, 20 + (view.dmg - prev.current.dmg) * 4));
    prev.current = { dmg: view.dmg, lives: view.lives };
  }, [view.dmg, view.lives]);

  const live = view.live && view.state === 'alive';
  const color = (view.color as string) ?? me.color;
  const wColor = WEAPON_COLOR[view.weapon as 'hammer'];
  const gesture = view.controls === 'gesten';
  const altName = t(`alt.${view.weapon}`);
  const doAlt = () => { if (!altCd.isReady()) return; altCd.start(); vibrate(30); sendRef.current({ type: 'alt' }); };
  const aDown = () => {
    if (gesture && performance.now() - lastUp.current < 280) { altPress.current = true; doAlt(); return; }
    altPress.current = false;
    vibrate(15);
    sendRef.current({ type: 'a', down: true });
  };
  const aUp = () => {
    if (altPress.current) { altPress.current = false; return; }
    lastUp.current = performance.now();
    sendRef.current({ type: 'a', down: false });
  };
  const doRoll = () => {
    if (!multiRoll) { if (!roll.isReady()) return; roll.start(); }
    vibrate(20);
    sendRef.current({ type: 'roll' });
  };

  const count = view.startAt && now < view.startAt ? Math.ceil((view.startAt - now) / 1000) : 0;
  const backIn = view.respawnAt ? Math.max(0, Math.ceil((view.respawnAt - now) / 1000)) : 0;
  const avail = window.innerWidth - 36;
  const stick = land ? Math.min(window.innerHeight * 0.62, 240) : Math.min(165, avail * 0.42);
  const S = land ? Math.min(window.innerHeight * 0.32, 130) : Math.min(112, (avail - stick - 10) / 2.25);

  const info = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: land ? 4 : 8, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ borderRadius: '50%', boxShadow: `0 0 0 3px ${color}, 0 0 14px ${color}` }}><Avatar player={me} size={land ? 34 : 44} /></span>
        <b style={{ fontSize: land ? 15 : 17 }}>{me.name}</b>
        <span style={{ color, fontSize: land ? 18 : 22, letterSpacing: 2 }} aria-label={`${view.lives}`}>{'♥'.repeat(Math.max(0, view.lives))}{'♡'.repeat(Math.max(0, 3 - view.lives))}</span>
      </div>
      <span className="muted" style={{ fontSize: 13 }}>{t('round', { n: view.round, total: view.total })} · <span style={{ color: wColor }}>{t(`w.${view.weapon}`)}</span></span>
      <span className="display" style={{ fontSize: land ? 54 : 80, fontWeight: 800, lineHeight: 1, color: heat(view.dmg), textShadow: `0 0 18px ${heat(view.dmg)}88` }}>{view.dmg}%</span>
      {count > 0 && <span className="display anim-pop" key={count} style={{ fontSize: 40, fontWeight: 800 }}>{count}</span>}
      {!land && count === 0 && <span className="faint" style={{ fontSize: 13 }}>{t('phone.turn')}</span>}
    </div>
  );

  const buttons = (
    <div style={{ position: 'relative', width: S * 2.25, height: gesture ? S * 1.6 : S * 2.2, flex: 'none' }}>
      <RoundButton size={S} color={wColor} icon={view.weapon} label={view.weapon === 'hammer' ? t('phone.hold') : t('phone.fire')}
        sub={gesture ? t('phone.double', { name: altName }) : undefined}
        ready={gesture ? altCd.ready : 1}
        ariaLabel={`A: ${t(`w.${view.weapon}`)}`} onDown={aDown} onUp={aUp}
        style={{ position: 'absolute', right: 0, bottom: 0 }} />
      <RoundButton size={S * 0.74} color="#4BE3A1" label={t('phone.roll')} ready={roll.ready} ariaLabel={`B: ${t('phone.roll')}`} onDown={doRoll}
        style={{ position: 'absolute', right: S * 1.12, bottom: 0 }} />
      {!gesture && (
        <RoundButton size={S * 0.74} color="#9B7BFF" label={altName} ready={altCd.ready} ariaLabel={`C: ${altName}`} onDown={doAlt}
          style={{ position: 'absolute', right: S * 0.13, bottom: S * 1.16 }} />
      )}
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 20, background: INK, color: '#fff', display: 'flex', flexDirection: land ? 'row' : 'column', alignItems: land ? 'center' : 'stretch', justifyContent: 'space-between', padding: land ? '14px max(24px, env(safe-area-inset-right)) 14px max(24px, env(safe-area-inset-left))' : 'max(20px, env(safe-area-inset-top)) 18px max(26px, env(safe-area-inset-bottom))', gap: 12, touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', opacity: live || count > 0 ? 1 : 0.92 }}>
      {land ? (
        <>
          <Joystick onMove={onMove} color={color} size={stick} />
          {info}
          {buttons}
        </>
      ) : (
        <>
          {info}
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
            <Joystick onMove={onMove} color={color} size={stick} />
            {buttons}
          </div>
        </>
      )}
      {view.state !== 'alive' && (
        <div className="anim-fade" style={{ position: 'absolute', inset: 0, background: 'rgba(7,5,26,.86)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, textAlign: 'center' }}>
          <Avatar player={me} size={90} dim={view.state === 'out'} />
          <h1 style={{ fontSize: 30 }}>{view.state === 'out' ? t('phone.out') : t('phone.fell')}</h1>
          {view.state === 'gone' && <p className="muted" style={{ fontSize: 18 }}>{t('phone.back')} {backIn > 0 ? backIn : ''}</p>}
          {view.state === 'out' && view.place > 0 && <p className="display" style={{ fontSize: 26, fontWeight: 800 }}>{t('phone.place', { n: view.place })}</p>}
        </div>
      )}
    </div>
  );
}

function WeaponPick({ view, t, send }: ControllerViewProps) {
  const chosen = view.chosen as string | null;
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h1 style={{ fontSize: 28 }}>{t('phone.pick')}</h1>
      <PhoneTimer deadline={view.deadline} duration={view.duration} />
      {(view.options as string[]).map((w) => {
        const c = WEAPON_COLOR[w as 'hammer'];
        const sel = chosen === w;
        return (
          <button key={w} type="button" onClick={() => { vibrate(25); send({ type: 'weapon', weapon: w }); }}
            style={{ textAlign: 'left', border: `3px solid ${sel ? c : '#2A2463'}`, borderRadius: 22, padding: 16, background: sel ? '#1C1738' : '#110D24', color: '#fff', display: 'flex', alignItems: 'center', gap: 14, boxShadow: sel ? `0 0 20px ${c}66` : undefined }}>
            <span style={{ width: 60, height: 60, borderRadius: 18, border: `3px solid ${c}`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 12px ${c}`, flex: 'none' }}><WeaponIcon weapon={w} size={36} /></span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <b className="display" style={{ fontSize: 23 }}>{t(`w.${w}`)}</b>
              <span className="muted" style={{ fontSize: 14, lineHeight: 1.35 }}>{t(`wd.${w}`)}</span>
            </span>
          </button>
        );
      })}
      {chosen && <p className="muted" style={{ textAlign: 'center' }}>{t('phone.picked')}</p>}
    </div>
  );
}

function PowerupCard({ id, t, selected, owned, price, disabled, onClick, compact }: {
  compact?: boolean; id: string; t: (k: string, v?: Record<string, string | number>) => string; selected?: boolean; owned?: number; price?: number | string; disabled?: boolean; onClick?: () => void;
}) {
  const def = POWERUP[id];
  if (!def) return null;
  const c = RARITY_COLOR[def.rarity];
  return (
    <button type="button" disabled={disabled} onClick={onClick}
      style={{ textAlign: 'left', border: `3px solid ${c}`, borderRadius: 20, padding: '11px 13px', background: selected ? '#262048' : '#110D24', color: '#fff', display: 'flex', flexDirection: 'column', gap: 6, boxShadow: selected ? `0 0 22px ${c}88` : `0 0 10px ${c}33`, opacity: disabled && !selected ? 0.45 : 1, transform: selected ? 'scale(1.02)' : undefined, transition: 'transform .15s' }}>
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ background: c, color: '#110D24', borderRadius: 999, padding: '2px 9px', fontSize: 11, fontWeight: 700 }}>{t(`rar.${def.rarity}`)}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: WEAPON_COLOR[def.weapon] }}>
          <WeaponIcon weapon={def.weapon} size={20} />{compact ? null : def.weapon === 'alle' ? t('pu.forAll') : t(`w.${def.weapon}`)}
        </span>
      </span>
      <b className="display" style={{ fontSize: compact ? 17 : 20, lineHeight: 1.1 }}>{t(`pu.${id}`)}</b>
      <span style={{ fontSize: 14, color: '#E4E0F5', lineHeight: 1.3 }}>{t(`pud.${id}`)}</span>
      {(owned || price !== undefined) && (
        <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
          <span className="faint">{owned ? t('pu.owned', { n: owned }) : ''}</span>
          {price !== undefined && <b className="display" style={{ fontSize: 17, color: '#FFD447' }}>{price}</b>}
        </span>
      )}
    </button>
  );
}

function Coins({ n }: { n: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#262048', borderRadius: 999, padding: '6px 12px', flex: 'none' }}>
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#FFD447" stroke="#C79E1A" strokeWidth="2.5" /><path d="M12 7v10" stroke="#110D24" strokeWidth="2" strokeLinecap="round" /></svg>
      <b className="display" style={{ fontSize: 19 }}>{n}</b>
    </span>
  );
}

function PickScreen({ view, t, send }: ControllerViewProps) {
  const offers = view.offers as string[];
  const picked = view.picked as string | null;
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <h1 style={{ fontSize: 26 }}>{view.start ? t('pick.startPhone') : t('pick.title')}</h1>
        <Coins n={view.money ?? 0} />
      </div>
      {view.deadline && <PhoneTimer deadline={view.deadline} duration={view.duration} />}
      {offers.map((id) => (
        <PowerupCard key={id} id={id} t={t} selected={picked === id} owned={view.owned?.[id]} disabled={!!picked}
          onClick={() => { if (!picked) { vibrate(30); send({ type: 'pick', id }); } }} />
      ))}
      {picked && <p className="muted" style={{ textAlign: 'center' }}>{t('pick.done')}</p>}
    </div>
  );
}

function ShopScreen({ view, t, send }: ControllerViewProps) {
  const offers = view.offers as string[];
  const bought = view.bought as string[];
  const money = view.money as number;
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <h1 className="display" style={{ fontSize: 32, color: '#FFD447' }}>{t('shop.title')}</h1>
        <Coins n={money} />
      </div>
      <PhoneTimer deadline={view.deadline} duration={view.duration} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 9 }}>
        {offers.map((id) => {
          const def = POWERUP[id];
          const own = bought.includes(id);
          const maxed = def?.max !== undefined && (view.owned?.[id] ?? 0) >= def.max;
          const price = def ? PRICE[def.rarity] : 0;
          return (
            <PowerupCard key={id} id={id} t={t} compact selected={own} owned={view.owned?.[id]} price={own ? t('shop.bought') : maxed ? t('shop.max') : price}
              disabled={view.done || own || maxed || price > money} onClick={() => { vibrate(30); send({ type: 'buy', id }); }} />
          );
        })}
      </div>
      <div style={{ flex: 1 }} />
      {view.done ? <p className="muted" style={{ textAlign: 'center' }}>{t('shop.waiting')}</p> : (
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="up-btn ghost" style={{ flex: 1 }} disabled={money < REROLL_PRICE} onClick={() => send({ type: 'reroll' })}>{t('shop.reroll', { n: REROLL_PRICE })}</button>
          <button type="button" className="up-btn" style={{ flex: 1 }} onClick={() => send({ type: 'shopDone' })}>{t('shop.finish')}</button>
        </div>
      )}
    </div>
  );
}

function Controller(props: ControllerViewProps) {
  const { view, t, me } = props;
  switch (view.screen) {
    case 'intro':
      return <PhoneWait title={t('title')} text={t('lookAtTv')} emoji={<Avatar player={me} size={96} />} />;
    case 'weapon':
      return <WeaponPick {...props} />;
    case 'play':
      return <PlayController {...props} />;
    case 'pick':
      return <PickScreen {...props} />;
    case 'shop':
      return <ShopScreen {...props} />;
    case 'roundEnd':
      return (
        <div className="anim-fade" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, textAlign: 'center' }}>
          {view.won && <Confetti pieces={14} />}
          <Avatar player={me} size={100} />
          <h1 style={{ fontSize: 28 }}>{view.won ? t('phone.won') : t('phone.roundOver')}</h1>
          {view.place > 1 && <p className="display" style={{ fontSize: 22, fontWeight: 800 }}>{t('phone.place', { n: view.place })}</p>}
          {view.kos > 0 && <p style={{ fontSize: 18 }}>{t('phone.kos', { n: view.kos })}</p>}
          {view.gain > 0 && <p style={{ fontSize: 20, color: 'var(--yellow)', fontWeight: 700 }}>{t('phone.gain', { n: view.gain })}</p>}
          <p className="muted">{t('me.score', { n: view.score })}</p>
          {view.money !== undefined && <Coins n={view.money} />}
        </div>
      );
    case 'finalMe':
      return <PhoneWait title={t('me.place', { place: view.place, of: view.of })} text={t('me.score', { n: view.score })} emoji={<Avatar player={me} size={110} />} />;
    default:
      return <PhoneWait title={t('lookAtTv')} emoji={<Avatar player={me} size={96} />} />;
  }
}

export default { Host, Controller } satisfies GameClientModule;
