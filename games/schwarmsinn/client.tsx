import { memo, useEffect, useMemo, useRef, type CSSProperties, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import type { ControllerViewProps, GameClientModule, HostViewProps, PlayerInfo, Translate } from '@up/sdk';
import { Avatar, Confetti, HostHeader, HostTimer, PhoneTimer, PhoneWait, sfx, useServerNow, vibrate, type MusicTrack, type SynthApi } from '@up/ui';
import type { Dir, GameEvent, Level } from './rules';

const LIME = '#B6F23C';
const LIME_D = '#7DAA1C';
export const COLORS = ['#FF5A5F', '#4D8DFF', '#FFD447', '#3DDC84'];
const DARK = ['#B8323A', '#2A5BC0', '#C79E1A', '#1E9E5A'];
const DIRS: Dir[] = ['up', 'right', 'down', 'left'];
const ARROW: Record<Dir, string> = { up: '↑', right: '→', down: '↓', left: '←' };
const ROT: Record<Dir, number> = { up: -90, right: 0, down: 90, left: 180 };
const ONE_WAY: Record<string, Dir> = { u: 'up', r: 'right', d: 'down', l: 'left' };

interface St {
  pos: [number, number][]; home: boolean[]; open: boolean[]; latched: boolean[]; revealed: boolean[];
  itemTaken: boolean[]; chaosUsed: boolean[]; ghost: boolean[]; keys: number[][];
}

/* ================= Grafik-Bausteine ================= */

/** Form der Figur: 0 Kreis, 1 Quadrat, 2 Dreieck, 3 Raute (auch ohne Farbsehen unterscheidbar) */
function shapePath(f: number) {
  return [
    'M12 1.5a10.5 10.5 0 1 1 0 21a10.5 10.5 0 1 1 0-21z',
    'M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5z',
    'M12 1.5 L23 21.5 H1 Z',
    'M12 1 L23 12 L12 23 L1 12 Z',
  ][f];
}

export function Shape({ f, size = 24, opacity = 1, style }: { f: number; size?: number; opacity?: number; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={`${f}`} style={style}>
      <path d={shapePath(f)} fill={COLORS[f]} opacity={opacity} strokeLinejoin="round" />
    </svg>
  );
}

/** Figur mit Augen; look = Blickrichtung */
function FigureGlyph({ f, look }: { f: number; look: Dir }) {
  const [lx, ly] = { up: [0, -1.1], right: [1.1, 0], down: [0, 1.1], left: [-1.1, 0] }[look];
  const ey = f === 2 ? 14 : 11;
  const ex = f === 2 ? [9.5, 14.5] : [9, 15];
  return (
    <g>
      <path d={shapePath(f)} fill={COLORS[f]} />
      {ex.map((x) => (
        <g key={x}>
          <circle cx={x} cy={ey} r={2.7} fill="#fff" />
          <circle cx={x + lx} cy={ey + ly} r={1.35} fill="#110D24" />
        </g>
      ))}
    </g>
  );
}

const ICON: Record<string, ReactNode> = {
  lantern: <><path d="M9 3h6" /><path d="M12 3v2" /><rect x="7" y="5" width="10" height="14" rx="3" /><path d="M12 10v4" /><path d="M9 21h6" /></>,
  ghost: <><path d="M5 20V10a7 7 0 0 1 14 0v10l-2.5-2-2.3 2-2.2-2-2.2 2-2.3-2z" /><path d="M9.5 10h.01" /><path d="M14.5 10h.01" /></>,
  swap: <><path d="M4 8h14" /><path d="M15 5l3 3-3 3" /><path d="M20 16H6" /><path d="M9 13l-3 3 3 3" /></>,
  key: <><circle cx="8" cy="12" r="4" /><path d="M12 12h9" /><path d="M18 12v3" /><path d="M21 12v2" /></>,
  chaos: <><path d="M3 7h3a4 4 0 0 1 3.4 1.9l5.2 8.2A4 4 0 0 0 18 19h3" /><path d="M3 17h3a4 4 0 0 0 3.4-1.9" /><path d="M14.6 6.9A4 4 0 0 1 18 5h3" /><path d="M19 3l2 2-2 2" /><path d="M19 17l2 2-2 2" /></>,
  toggle: <><rect x="3" y="8" width="18" height="8" rx="4" /><circle cx="16" cy="12" r="2" /></>,
};
const ITEM_COLOR: Record<string, [string, string]> = {
  lantern: ['#FFD447', '#3A2F12'], ghost: ['#E2D4FF', '#2C2350'], swap: ['#4BE3A1', '#123A33'], key: ['#FF5A5F', '#3A1518'], chaos: ['#FF8FC8', '#3B1530'],
};

function ItemTile({ kind, color, cs }: { kind: string; color?: number; cs: number }) {
  const [fg, bg] = ITEM_COLOR[kind];
  const stroke = (kind === 'key' || kind === 'swap') && color != null ? COLORS[color] : fg;
  return (
    <g>
      <rect x={cs * 0.08} y={cs * 0.08} width={cs * 0.84} height={cs * 0.84} rx={cs * 0.25} fill={bg} style={{ filter: `drop-shadow(0 0 ${cs * 0.3}px ${stroke}aa)` }} />
      <g transform={`translate(${cs * 0.2} ${cs * 0.2}) scale(${(cs * 0.6) / 24})`} fill="none" stroke={stroke} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">{ICON[kind]}</g>
    </g>
  );
}

/* ================= Karte ================= */

const Board = memo(function Board({ L, st, cs, dim, flashes, player }: { L: Level; st: St; cs: number; dim?: boolean; flashes?: { p: string; a: string; at: number }[]; player: HostViewProps['player'] }) {
  const W = L.w * cs, H = L.h * cs;
  const visible = (x: number, y: number) => {
    const r = L.roomOf[y * L.w + x];
    return r < 0 || st.revealed[r];
  };

  // Blickrichtung und Animation der Figuren (nur neu berechnen, wenn sich Positionen ändern)
  const prev = useRef<[number, number][]>(st.pos);
  const look = useRef<Dir[]>(st.pos.map(() => 'down'));
  const posKey = JSON.stringify(st.pos);
  const jump = useMemo(() => {
    const out = st.pos.map((p, f) => {
      const q = prev.current[f] ?? p;
      const dx = p[0] - q[0], dy = p[1] - q[1];
      if (dx || dy) look.current[f] = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
      return Math.abs(dx) + Math.abs(dy);
    });
    prev.current = st.pos;
    return out;
  }, [posKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const statics = useMemo(() => {
    const out: ReactNode[] = [];
    // Gänge (über den Raumwänden, damit Öffnungen sichtbar sind)
    for (let y = 0; y < L.h; y++) {
      for (let x = 0; x < L.w; x++) {
        const c = L.grid[y][x];
        if (c !== ' ' && c !== '#' && L.roomOf[y * L.w + x] < 0) out.push(<rect key={`c${x}-${y}`} x={x * cs} y={y * cs} width={cs} height={cs} fill="#1B1640" />);
      }
    }
    return out;
  }, [L.seed, L.n, cs]); // eslint-disable-line react-hooks/exhaustive-deps

  const roomContent = (rid: number) => {
    const rm = L.rooms[rid];
    const out: ReactNode[] = [];
    for (let y = rm.y + 1; y < rm.y + rm.h - 1; y++) {
      for (let x = rm.x + 1; x < rm.x + rm.w - 1; x++) {
        const c = L.grid[y][x];
        const k = `${x}-${y}`;
        if (c === '#') {
          out.push(
            <g key={`w${k}`}>
              <rect x={x * cs + 1} y={y * cs + 1} width={cs - 2} height={cs - 2} rx={cs * 0.18} fill="#5A4FC4" />
              <rect x={x * cs + 1} y={y * cs + cs * 0.72} width={cs - 2} height={cs * 0.26} rx={cs * 0.12} fill="#3A3290" />
            </g>,
          );
        } else if (c === 'I') {
          out.push(<rect key={`i${k}`} x={x * cs + 1} y={y * cs + 1} width={cs - 2} height={cs - 2} rx={cs * 0.15} fill="url(#up-ice)" opacity={0.85} />);
        } else if (c === 'L') {
          out.push(<rect key={`l${k}`} x={x * cs + 1} y={y * cs + 1} width={cs - 2} height={cs - 2} rx={cs * 0.2} fill="url(#up-lava)" style={{ filter: `drop-shadow(0 0 ${cs * 0.35}px #FF5A1F)` }} />);
        } else if (ONE_WAY[c]) {
          out.push(
            <g key={`o${k}`} transform={`translate(${(x + 0.5) * cs} ${(y + 0.5) * cs}) rotate(${ROT[ONE_WAY[c]]})`}>
              <rect x={-cs / 2 + 1} y={-cs / 2 + 1} width={cs - 2} height={cs - 2} rx={cs * 0.18} fill="#2A2350" />
              <path d={`M${-cs * 0.28} ${-cs * 0.22} l${cs * 0.22} ${cs * 0.22} l${-cs * 0.22} ${cs * 0.22} M${cs * 0.0} ${-cs * 0.22} l${cs * 0.22} ${cs * 0.22} l${-cs * 0.22} ${cs * 0.22}`} fill="none" stroke="#B8B2D9" strokeWidth={cs * 0.11} strokeLinecap="round" strokeLinejoin="round" />
            </g>,
          );
        }
      }
    }
    return out;
  };

  const occupied = (x: number, y: number) => st.pos.some((p) => p[0] === x && p[1] === y);

  return (
    <div style={{ position: 'relative', width: W, height: H, opacity: dim ? 0.45 : 1, transition: 'opacity .4s' }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-label="Spielfeld" style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <pattern id="up-grid" width={cs} height={cs} patternUnits="userSpaceOnUse">
            <rect width={cs} height={cs} fill="#1B1640" />
            <path d={`M${cs} 0V${cs}H0`} fill="none" stroke="rgba(255,255,255,.045)" strokeWidth={1} />
          </pattern>
          <pattern id="up-hatch" width={12} height={12} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width={12} height={12} fill="#120E27" />
            <rect width={6} height={12} fill="#17122F" />
          </pattern>
          <linearGradient id="up-ice" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#BDF3FF" /><stop offset=".45" stopColor="#7FDDF5" /><stop offset=".5" stopColor="#E9FBFF" /><stop offset=".56" stopColor="#7FDDF5" /><stop offset="1" stopColor="#5CC8EA" />
          </linearGradient>
          <radialGradient id="up-lava" cx=".3" cy=".3" r=".9">
            <stop offset="0" stopColor="#FFB347" /><stop offset=".55" stopColor="#FF5A1F" /><stop offset="1" stopColor="#C22A0B" />
          </radialGradient>
        </defs>

        {/* Räume */}
        {L.rooms.map((rm) => {
          const lit = st.revealed[rm.id];
          return (
            <rect key={rm.id} x={(rm.x + 0.5) * cs} y={(rm.y + 0.5) * cs} width={(rm.w - 1) * cs} height={(rm.h - 1) * cs} rx={cs * 0.25}
              fill={lit ? 'url(#up-grid)' : 'url(#up-hatch)'} stroke={lit ? '#8A7CFF' : '#4A4378'} strokeWidth={lit ? cs * 0.22 : cs * 0.14}
              strokeDasharray={lit ? undefined : `${cs * 0.4} ${cs * 0.3}`}
              style={lit ? { filter: `drop-shadow(0 0 ${cs * 0.35}px rgba(138,124,255,.6))` } : undefined} />
          );
        })}
        {statics}
        {L.rooms.map((rm) => (st.revealed[rm.id] ? <g key={`rc${rm.id}`}>{roomContent(rm.id)}</g> : null))}

        {/* Platten */}
        {L.plates.map((p) => {
          if (!visible(p.x, p.y)) return null;
          const d = L.doors[p.door];
          const on = occupied(p.x, p.y) || (d.kind === 'switch' && st.latched[d.id]);
          const col = p.color == null ? '#8F88B8' : COLORS[p.color];
          return (
            <g key={`p${p.id}`} transform={`translate(${p.x * cs} ${p.y * cs})`}>
              <rect x={cs * 0.06} y={cs * 0.06} width={cs * 0.88} height={cs * 0.88} rx={cs * 0.2} fill={on ? `${col}55` : '#2E2858'} stroke={col} strokeWidth={cs * 0.09} />
              {d.kind === 'hold'
                ? <circle cx={cs / 2} cy={cs / 2} r={cs * 0.17} fill={on ? col : 'none'} stroke={col} strokeWidth={cs * 0.07} />
                : p.color != null
                  ? <g transform={`translate(${cs * 0.3} ${cs * 0.3}) scale(${(cs * 0.4) / 24})`}><path d={shapePath(p.color)} fill={col} /></g>
                  : <g transform={`translate(${cs * 0.2} ${cs * 0.2}) scale(${(cs * 0.6) / 24})`} fill="none" stroke={col} strokeWidth={2.5} strokeLinecap="round">{ICON.toggle}</g>}
            </g>
          );
        })}

        {/* Teleporter */}
        {L.teleports.flatMap((t, i) => [t.a, t.b].map((c, j) => (visible(c[0], c[1]) ? (
          <g key={`t${i}-${j}`} transform={`translate(${(c[0] + 0.5) * cs} ${(c[1] + 0.5) * cs})`} style={{ filter: `drop-shadow(0 0 ${cs * 0.3}px #B07CFF)` }}>
            <circle r={cs * 0.42} fill="#3B2470" />
            <circle r={cs * 0.32} fill="none" stroke="#B07CFF" strokeWidth={cs * 0.08} />
            <circle r={cs * 0.15} fill="none" stroke="#B07CFF" strokeWidth={cs * 0.07} />
            <text y={cs * 0.12} textAnchor="middle" fontSize={cs * 0.32} fontWeight={800} fill="#E2D4FF" fontFamily="DM Sans, sans-serif">{String.fromCharCode(65 + i)}</text>
          </g>
        ) : null)))}

        {/* Powerups und Chaos */}
        {L.items.map((it, i) => (!st.itemTaken[i] && visible(it.x, it.y) ? (
          <g key={`it${i}`} transform={`translate(${it.x * cs} ${it.y * cs})`}><ItemTile kind={it.kind} color={it.color} cs={cs} /></g>
        ) : null))}
        {L.chaos.map((c, i) => (!st.chaosUsed[i] && visible(c.x, c.y) ? (
          <g key={`ch${i}`} transform={`translate(${c.x * cs} ${c.y * cs})`}><ItemTile kind="chaos" cs={cs} /></g>
        ) : null))}

        {/* Türen (immer sichtbar) */}
        {L.doors.map((d) => {
          const open = st.open[d.id];
          const col = d.color == null ? '#8F88B8' : COLORS[d.color];
          const bw = cs * 0.3, bl = cs * 1.0;
          const [w, h] = d.vertical ? [bw, bl] : [bl, bw];
          return (
            <rect key={`d${d.id}`} x={(d.x + 0.5) * cs - w / 2} y={(d.y + 0.5) * cs - h / 2} width={w} height={h} rx={cs * 0.1}
              fill={open ? 'none' : col} stroke={open ? col : 'none'} strokeWidth={cs * 0.07} strokeDasharray={open ? `${cs * 0.15} ${cs * 0.12}` : undefined}
              opacity={open ? 0.65 : 1} style={open ? undefined : { filter: `drop-shadow(0 0 ${cs * 0.3}px ${col})` }} />
          );
        })}

        {/* Ausgänge (immer sichtbar) */}
        {L.exits.map(([x, y], f) => (
          <g key={`e${f}`} transform={`translate(${(x + 0.5) * cs} ${(y + 0.5) * cs})`} style={{ filter: `drop-shadow(0 0 ${cs * 0.4}px ${COLORS[f]})` }}>
            <circle r={cs * 0.42} fill={st.home[f] ? COLORS[f] : '#110D24'} stroke={COLORS[f]} strokeWidth={cs * 0.11} />
            {!st.home[f] && <g transform={`translate(${-cs * 0.16} ${-cs * 0.16}) scale(${(cs * 0.32) / 24})`}><path d={shapePath(f)} fill={COLORS[f]} /></g>}
          </g>
        ))}

        {/* Figuren */}
        {st.pos.map(([x, y], f) => (st.home[f] ? null : (
          <g key={`f${f}`} style={{ transform: `translate(${x * cs}px, ${y * cs}px)`, transition: jump[f] > 6 ? 'none' : jump[f] > 1 ? 'transform .28s ease-out' : 'transform .11s ease-out', filter: `drop-shadow(0 0 ${cs * 0.25}px ${COLORS[f]})` }}>
            <g transform={`translate(${cs * 0.05} ${cs * 0.05}) scale(${(cs * 0.9) / 24})`}><FigureGlyph f={f} look={look.current[f]} /></g>
            {st.ghost[f] && <circle cx={cs * 0.88} cy={cs * 0.12} r={cs * 0.16} fill="#E2D4FF" />}
            {st.keys[f]?.length > 0 && <circle cx={cs * 0.12} cy={cs * 0.12} r={cs * 0.16} fill={COLORS[st.keys[f][0]]} stroke="#110D24" strokeWidth={1.5} />}
          </g>
        )))}
      </svg>

      <FlashLayer st={st} cs={cs} flashes={flashes ?? []} player={player} />
    </div>
  );
});

/** Wer hat gerade gedrückt? Kleine Blase über der Figur */
function FlashLayer({ st, cs, flashes, player }: { st: St; cs: number; flashes: { p: string; a: string; at: number }[]; player: HostViewProps['player'] }) {
  const now = useServerNow(80);
  return (
    <>
      {st.pos.map(([x, y], f) => {
        const fl = flashes.filter((x) => x.a.startsWith(`${f}:`) && now - x.at < 650).at(-1);
        const p = fl && player(fl.p);
        if (!fl || !p || st.home[f]) return null;
        return (
          <div key={`fl${f}-${fl.at}`} style={{ position: 'absolute', left: x * cs + cs / 2, top: y * cs - cs * 0.15, transform: 'translate(-50%, -100%)', display: 'flex', alignItems: 'center', gap: 3, background: COLORS[f], color: '#110D24', borderRadius: 999, padding: '2px 7px 2px 2px', fontSize: 12, fontWeight: 800, animation: 'upPop .25s ease-out both', pointerEvents: 'none', zIndex: 5, boxShadow: `0 0 10px ${COLORS[f]}` }}>
            <Avatar player={p} size={18} flat />{ARROW[fl.a.split(':')[1] as Dir]}
          </div>
        );
      })}
    </>
  );
}

/* ================= Sound ================= */

const STEP_HZ = [196, 247, 294, 370];
function playEvent(e: GameEvent) {
  sfx.custom((s: SynthApi) => {
    switch (e.k) {
      case 'step': s.tone(STEP_HZ[e.f], 0.07, { type: 'triangle', vol: 0.18, to: STEP_HZ[e.f] * 0.8 }); break;
      case 'bump': s.tone(110, 0.12, { type: 'square', vol: 0.12, to: 60 }); s.noise(0.06, { filter: 300, type: 'lowpass', vol: 0.2 }); break;
      case 'slide': s.noise(0.35, { filter: 3000, sweepTo: 7000, type: 'highpass', vol: 0.08 }); break;
      case 'lava': s.noise(0.45, { filter: 600, type: 'lowpass', vol: 0.25 }); s.tone(700, 0.5, { type: 'sawtooth', vol: 0.08, to: 90, at: 0.1 }); break;
      case 'teleport': s.tone(300, 0.28, { type: 'sine', vol: 0.22, to: 1400 }); s.tone(600, 0.28, { type: 'triangle', vol: 0.08, to: 2400, at: 0.05 }); break;
      case 'ghost': s.tone(520, 0.4, { type: 'sine', vol: 0.18, to: 260 }); s.tone(780, 0.4, { type: 'sine', vol: 0.06, to: 390 }); break;
      case 'pickup': [659, 784, 1047].forEach((f, i) => s.tone(f, 0.12, { type: 'square', vol: 0.07, at: i * 0.06 })); break;
      case 'swap': s.tone(400, 0.25, { type: 'triangle', vol: 0.15, to: 800 }); s.tone(800, 0.25, { type: 'triangle', vol: 0.15, to: 400 }); break;
      case 'chaos': for (let i = 0; i < 12; i++) s.tone(300 + Math.random() * 900, 0.05, { type: 'square', vol: 0.06, at: i * 0.045 }); break;
      case 'home': s.tone([261.63, 329.63, 392, 523.25][e.f], 0.9, { type: 'triangle', vol: 0.25 }); s.tone([261.63, 329.63, 392, 523.25][e.f] * 2, 0.6, { type: 'sine', vol: 0.06 }); break;
      case 'reveal': s.noise(0.5, { filter: 500, sweepTo: 5000, vol: 0.09 }); [1568, 2093, 2637].forEach((f, i) => s.tone(f, 0.15, { type: 'sine', vol: 0.04, at: 0.2 + i * 0.07 })); break;
      case 'door': s.noise(0.25, { filter: e.open ? 400 : 2500, sweepTo: e.open ? 2500 : 400, type: 'bandpass', vol: 0.14 }); s.tone(e.open ? 220 : 160, 0.08, { type: 'square', vol: 0.05 }); break;
      case 'unlock': [1200, 1500].forEach((f, i) => s.tone(f, 0.08, { type: 'square', vol: 0.06, at: i * 0.08 })); break;
    }
  });
}

/** Hintergrund: pulsierender Dungeon-Loop, wird bei Zeitdruck schneller */
function dungeonTrack(urgent: { current: boolean }): MusicTrack {
  const chords = [[110, 130.81, 164.81], [87.31, 110, 130.81], [130.81, 164.81, 196], [98, 123.47, 146.83]];
  return {
    bpm: () => (urgent.current ? 150 : 104),
    step(s, i) {
      const bar = Math.floor(i / 8) % 4;
      const k = i % 8;
      const ch = chords[bar];
      if (k % 2 === 0) s.tone(ch[0] / 2, 0.22, { type: 'triangle', vol: 0.3 });
      if (k === 0 || k === 4) s.tone(70, 0.14, { type: 'sine', vol: 0.4, to: 40 });
      if (k % 2 === 1) s.noise(0.04, { filter: 7000, type: 'highpass', vol: 0.05 });
      s.tone(ch[k % 3] * 4, 0.1, { type: 'square', vol: 0.02 });
    },
  };
}

/* ================= TV ================= */

function levelInfo(view: any, t: Translate) {
  const lvl = view.n > 20 ? `${t('endless')} · ${t('level', { n: view.n })}` : t('level', { n: view.n });
  const count = view.level?.figures ?? view.figures;
  const figs = count ? (count === 1 ? t('figures1') : t('figuresN', { n: count })) : '';
  return figs ? `${lvl} · ${figs}` : lvl;
}

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

/** Hintergrundmusik während des Spielens; bei weniger als 30 s schneller */
function Music({ deadline }: { deadline: number | null }) {
  const urgent = useRef(false);
  const track = useMemo(() => dungeonTrack(urgent), []);
  const now = useServerNow(500);
  urgent.current = !!deadline && deadline - now < 30_000;
  useEffect(() => {
    const id = setTimeout(() => sfx.startMusic(track), 300);
    return () => {
      clearTimeout(id);
      sfx.stopMusic();
    };
  }, [track]);
  return null;
}

function Host(props: HostViewProps) {
  const { view } = props;
  const lastEv = useRef(0);
  useEffect(() => {
    const evs = (view.events ?? []) as (GameEvent & { id: number })[];
    const fresh = evs.filter((e) => e.id > lastEv.current);
    if (fresh.length) lastEv.current = fresh[fresh.length - 1].id;
    if (fresh.length > 8) return; // nach Neuladen nicht alles auf einmal abspielen
    fresh.forEach(playEvent);
  }, [view.events]);
  useEffect(() => {
    if (view.screen === 'won') setTimeout(() => sfx.play('fanfare', { always: true }), 200);
    if (view.screen === 'lost') sfx.play('timeUp', { always: true });
  }, [view.screen]);

  switch (view.screen) {
    case 'intro': return <HostIntro {...props} />;
    case 'explain': return <HostExplain {...props} />;
    case 'play': return <><Music deadline={view.deadline} /><HostPlay {...props} /></>;
    case 'lost': return <HostLost {...props} />;
    case 'won': return <HostWon {...props} />;
    case 'pick': return <HostPick {...props} />;
    case 'end': return <HostEnd {...props} />;
  }
  return null;
}

function Tag({ children, size = 76 }: { children: ReactNode; size?: number }) {
  return <span className="up-tag anim-pop" style={{ background: LIME, color: '#110D24', boxShadow: `0 8px 0 ${LIME_D}`, fontSize: size, padding: '12px 40px', borderRadius: 26, transform: 'rotate(-3deg)' }}>{children}</span>;
}

function HostIntro({ t }: HostViewProps) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 30, textAlign: 'center' }}>
      <Tag>{t('title')}</Tag>
      <div className="anim-up" style={{ display: 'flex', gap: 22, animationDelay: '.3s' }}>
        {[0, 1, 2, 3].map((f) => (
          <svg key={f} width={70} height={70} viewBox="0 0 24 24" aria-hidden="true" style={{ filter: `drop-shadow(0 0 12px ${COLORS[f]})`, animation: `upFloat 2.4s ease-in-out ${-f * 0.5}s infinite` }}><FigureGlyph f={f} look="down" /></svg>
        ))}
      </div>
      <p className="anim-up" style={{ fontSize: 28, maxWidth: 920, lineHeight: 1.35, animationDelay: '.5s' }}>{t('intro.text')}</p>
      <p className="muted anim-up" style={{ fontSize: 22, animationDelay: '.8s' }}>{t('intro.hint')}</p>
    </div>
  );
}

function FeatureArt({ k, small }: { k: string; small?: boolean }) {
  const box = (children: ReactNode, bg = '#1B1640') => (
    <div style={{ width: 150, height: 150, flex: 'none', transform: small ? 'scale(.62)' : undefined, margin: small ? -28 : undefined, borderRadius: 30, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxShadow: '0 0 0 4px #8A7CFF, 0 0 30px rgba(138,124,255,.5)' }}>{children}</div>
  );
  const big = (f: number) => <svg width={56} height={56} viewBox="0 0 24 24" aria-hidden="true"><FigureGlyph f={f} look="right" /></svg>;
  const icon = (kind: string, color?: number) => <svg width={110} height={110} viewBox="0 0 40 40" aria-hidden="true"><ItemTile kind={kind} color={color} cs={40} /></svg>;
  switch (k) {
    case 'controls': return box(<><span style={{ width: 60, height: 60, borderRadius: 16, background: COLORS[1], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 38, fontWeight: 800, color: '#110D24', boxShadow: `0 5px 0 ${DARK[1]}` }}>→</span>{big(1)}</>);
    case 'exit': return box(<svg width={90} height={90} viewBox="-12 -12 24 24" aria-hidden="true"><circle r={10} fill="#110D24" stroke={COLORS[0]} strokeWidth={2.6} /><g transform="translate(-4 -4) scale(.33)"><path d={shapePath(0)} fill={COLORS[0]} /></g></svg>);
    case 'fog': return box(<span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '.1em', color: '#6E66A0' }}>?</span>, 'repeating-linear-gradient(45deg,#17122F 0 8px,#120E27 8px 16px)');
    case 'figures': return box(<>{big(0)}{big(1)}</>);
    case 'three': return box(<>{big(0)}{big(1)}{big(2)}</>);
    case 'four': return box(<div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 48px)', gap: 4 }}>{[0, 1, 2, 3].map((f) => <svg key={f} width={46} height={46} viewBox="0 0 24 24" aria-hidden="true"><FigureGlyph f={f} look="down" /></svg>)}</div>);
    case 'hold': return box(<><div style={{ width: 54, height: 54, borderRadius: 12, border: '4px solid #8F88B8', background: '#2E2858', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: 20, height: 20, borderRadius: '50%', border: '4px solid #8F88B8' }} /></div><div style={{ width: 14, height: 80, borderRadius: 5, border: '3px dashed #8F88B8' }} /></>);
    case 'switch': return box(<div style={{ width: 70, height: 70, borderRadius: 14, border: '4px solid #8F88B8', background: '#2E2858', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width={44} height={44} viewBox="0 0 24 24" fill="none" stroke="#B8B2D9" strokeWidth={2.5} aria-hidden="true">{ICON.toggle}</svg></div>);
    case 'color': return box(<><div style={{ width: 60, height: 60, borderRadius: 12, border: `4px solid ${COLORS[2]}`, background: '#3A3212', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Shape f={2} size={26} /></div><div style={{ width: 14, height: 80, borderRadius: 5, background: COLORS[2], boxShadow: `0 0 14px ${COLORS[2]}` }} /></>);
    case 'ice': return box(<div style={{ width: 110, height: 44, borderRadius: 10, background: 'linear-gradient(135deg,#BDF3FF,#7FDDF5 45%,#E9FBFF 50%,#7FDDF5 56%,#5CC8EA)' }} />);
    case 'lava': return box(<div style={{ width: 100, height: 70, borderRadius: 16, background: 'radial-gradient(circle at 30% 30%,#FFB347,#FF5A1F 55%,#C22A0B)', boxShadow: '0 0 24px #FF5A1F' }} />);
    case 'teleport': return box(<>{[0, 1].map((i) => <div key={i} style={{ width: 52, height: 52, borderRadius: '50%', background: 'radial-gradient(circle, #110D24 0 25%, #B07CFF 26% 38%, #3B2470 39% 55%, #B07CFF 56% 68%, transparent 69%)', boxShadow: '0 0 16px #B07CFF' }} />)}</>);
    case 'oneway': return box(<span style={{ fontSize: 70, fontWeight: 800, color: '#B8B2D9' }}>»</span>);
    case 'multistart': return box(<>{big(0)}<span style={{ width: 4, height: 70, background: '#8A7CFF', borderRadius: 2 }} />{big(3)}</>);
    case 'lantern': case 'key': case 'ghost': case 'swap': case 'chaos': return box(icon(k, k === 'key' ? 0 : k === 'swap' ? 1 : undefined));
  }
  return box(null);
}

function HostExplain({ view, t, player }: HostViewProps) {
  const features = view.features as string[];
  const d = player(view.decider);
  return (
    <>
      <HostHeader title={t('title')} color={LIME} info={levelInfo(view, t)} right={<HostTimer deadline={view.deadline} duration={view.duration} />} />
      <div style={{ textAlign: 'center' }}>
        <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: LIME }}>{t('explain.new')}</span>
      </div>
      {features.length <= 2 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 40 }}>
          {features.map((k, i) => (
            <div key={k} className="anim-pop" style={{ display: 'flex', flexDirection: features.length > 1 ? 'column' : 'row', alignItems: 'center', gap: 28, maxWidth: features.length > 1 ? 480 : 980, textAlign: features.length > 1 ? 'center' : 'left', animationDelay: `${i * 0.15}s` }}>
              <FeatureArt k={k} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <h1 style={{ fontSize: features.length > 1 ? 40 : 56, fontWeight: 800, lineHeight: 1.05 }}>{t(`feat.${k}.t`)}</h1>
                <p style={{ fontSize: features.length > 1 ? 21 : 26, color: 'var(--muted)', lineHeight: 1.35 }}>{t(`feat.${k}.d`)}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        // Viele neue Bausteine auf einmal (z. B. Start bei einem späten Level): kompakte Karten
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${features.length > 12 ? 6 : 4}, minmax(0, 1fr))`, gap: 12, alignContent: 'center' }}>
          {features.map((k, i) => (
            features.length > 12 ? (
              // sehr viele: nur Bild und Name
              <div key={k} className="up-card anim-pop" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 6px', borderRadius: 18, textAlign: 'center', animationDelay: `${i * 0.04}s` }}>
                <FeatureArt k={k} small />
                <b className="display" style={{ fontSize: 16 }}>{t(`feat.${k}.t`)}</b>
              </div>
            ) : (
              <div key={k} className="up-card anim-pop" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, borderRadius: 18, animationDelay: `${i * 0.05}s` }}>
                <FeatureArt k={k} small />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                  <b className="display" style={{ fontSize: 17 }}>{t(`feat.${k}.t`)}</b>
                  <span className="muted" style={{ fontSize: features.length > 8 ? 12 : 14, lineHeight: 1.3 }}>{t(`feat.${k}.d`)}</span>
                </div>
              </div>
            )
          ))}
        </div>
      )}
      <footer style={{ display: 'flex', justifyContent: 'center' }}>
        <span className="up-chip" style={{ fontSize: 18 }}>{t('explain.go', { name: d?.name ?? '?' })}</span>
      </footer>
    </>
  );
}

function Countdown({ to, t }: { to: number; t: Translate }) {
  const now = useServerNow(100);
  const s = Math.ceil((to - now) / 1000);
  if (s < 0) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, background: 'rgba(10,7,22,.55)', pointerEvents: 'none' }}>
      <span key={s} className="display anim-pop" style={{ fontSize: 150, fontWeight: 800, color: s <= 0 ? LIME : '#fff', textShadow: '0 8px 0 rgba(0,0,0,.4)' }}>{s <= 0 ? t('countdown.go') : s}</span>
      <span className="display" style={{ fontSize: 30, fontWeight: 800 }}>{t('assign.title')}</span>
    </div>
  );
}

function Sidebar({ view, t, player }: HostViewProps) {
  const L = view.level as Level;
  const F = L.figures;
  const now = useServerNow(80);
  const owners = (f: number, d: Dir) => Object.entries(view.assign as Record<string, string[]>).filter(([, a]) => a.includes(`${f}:${d}`)).map(([id]) => player(id)).filter(Boolean) as PlayerInfo[];
  const flashing = (f: number, d: Dir) => (view.flashes as { a: string; at: number }[]).some((x) => x.a === `${f}:${d}` && now - x.at < 450);
  const avatarSize = F <= 2 ? 34 : 28;
  return (
    <aside style={{ width: 300, flex: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <section className="up-card" style={{ padding: 14, borderRadius: 22 }}>
        <h2 style={{ fontSize: 20, marginBottom: 10 }}>{t('side.who')}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: `30px repeat(4, minmax(0, 1fr))`, gap: 6, alignItems: 'center' }}>
          <span />
          {DIRS.map((d) => <span key={d} style={{ textAlign: 'center', fontSize: 20, fontWeight: 800, color: 'var(--muted)' }}>{ARROW[d]}</span>)}
          {Array.from({ length: F }, (_, f) => (
            <FragmentRow key={f}>
              <Shape f={f} size={26} opacity={view.st.home[f] ? 0.35 : 1} />
              {DIRS.map((d) => {
                const os = owners(f, d);
                const hot = flashing(f, d);
                return (
                  <span key={d} style={{ minHeight: avatarSize + 10, borderRadius: 12, background: hot ? COLORS[f] : '#262048', boxShadow: hot ? `0 0 16px ${COLORS[f]}` : undefined, display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 2, padding: 3, opacity: view.st.home[f] ? 0.35 : 1, transition: 'background .15s' }}>
                    {os.slice(0, os.length > 2 ? 1 : 2).map((p) => <Avatar key={p.id} player={p} size={os.length > 1 ? avatarSize - 8 : avatarSize} />)}
                    {os.length > 2 && <b style={{ fontSize: 12 }}>+{os.length - 1}</b>}
                  </span>
                );
              })}
            </FragmentRow>
          ))}
        </div>
      </section>
      <section className="up-card" style={{ padding: '12px 14px', borderRadius: 22, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="faint" style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>{t('side.home')}</span>
        {Array.from({ length: F }, (_, f) => (
          <span key={f} style={{ width: 38, height: 38, borderRadius: 11, border: view.st.home[f] ? `2px solid ${COLORS[f]}` : '2px dashed #4A4378', background: view.st.home[f] ? `${COLORS[f]}33` : undefined, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Shape f={f} size={20} opacity={view.st.home[f] ? 1 : 0.35} />
          </span>
        ))}
        <b style={{ marginLeft: 'auto', fontSize: 16, whiteSpace: 'nowrap' }}>{view.st.home.slice(0, F).filter(Boolean).length} / {F}</b>
      </section>
      <div className="up-chip" style={{ marginTop: 'auto', justifyContent: 'space-between', display: 'flex', fontSize: 15, padding: '10px 16px' }}>
        <span>{t('side.restart')}</span><b>{view.restart.votes} / {view.restart.need}</b>
      </div>
    </aside>
  );
}

function FragmentRow({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

function StarHint({ view, t }: { view: any; t: Translate }) {
  return (
    <span className="up-chip" style={{ fontSize: 15, display: 'flex', gap: 8 }}>
      <span style={{ color: 'var(--yellow)', letterSpacing: 2 }}>★★★</span>{t('stars.three', { t: mmss(view.limit / 2000) })}
    </span>
  );
}

function HostPlay(props: HostViewProps) {
  const { view, t, player } = props;
  const L = view.level as Level;
  // Feldgröße so wählen, dass die Karte neben die Seitenleiste passt
  const cs = Math.max(14, Math.min(40, Math.floor(Math.min(900 / L.w, 578 / L.h))));
  return (
    <>
      <HostHeader title={t('title')} color={LIME} info={levelInfo(view, t)}
        right={<div style={{ display: 'flex', alignItems: 'center', gap: 14 }}><StarHint view={view} t={t} />{view.deadline ? <HostTimer deadline={view.deadline} duration={view.duration} /> : null}</div>} />
      <main style={{ flex: 1, minHeight: 0, display: 'flex', gap: 20, position: 'relative' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Board L={L} st={view.st} cs={cs} flashes={view.flashes} player={player} />
        </div>
        <Sidebar {...props} />
        {view.countdownTo && <Countdown to={view.countdownTo} t={t} />}
      </main>
    </>
  );
}

function HostLost({ view, t }: HostViewProps) {
  const L = view.level as Level;
  const cs = Math.max(14, Math.min(40, Math.floor(Math.min(1200 / L.w, 578 / L.h))));
  const c = view.counts as Record<string, number>;
  const max = Math.max(1, ...Object.values(c));
  return (
    <>
      <HostHeader title={t('title')} color={LIME} info={levelInfo(view, t)} right={<HostTimer deadline={view.deadline} duration={view.duration} />} />
      <main style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Board L={L} st={view.st} cs={cs} dim player={() => undefined} />
        <div className="up-card anim-pop" style={{ position: 'absolute', padding: '28px 36px', borderRadius: 30, width: 640, display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,.6)' }}>
          <h1 style={{ fontSize: 50 }}>{t('lost.title')}</h1>
          <p className="muted" style={{ fontSize: 22 }}>{t('lost.sub', { n: view.homeCount, total: L.figures })}</p>
          <p style={{ fontSize: 18, fontWeight: 700 }}>{t('lost.vote')}</p>
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(['same', 'new', 'next'] as const).map((k) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 210, textAlign: 'left', fontWeight: 700, fontSize: 18 }}>{t(`choice.${k}`)}</span>
                <div style={{ flex: 1, height: 22, borderRadius: 999, background: '#262048', overflow: 'hidden' }}>
                  <div style={{ width: `${(c[k] / max) * 100}%`, height: '100%', background: LIME, borderRadius: 999, transition: 'width .3s' }} />
                </div>
                <b style={{ width: 24, fontSize: 18 }}>{c[k]}</b>
              </div>
            ))}
          </div>
          <span className="faint" style={{ fontSize: 14 }}>{t('lost.tie')}</span>
        </div>
      </main>
    </>
  );
}

function Stars({ n, size = 76 }: { n: number; size?: number }) {
  return (
    <div style={{ display: 'flex', gap: 14 }} role="img" aria-label={`${n}/3`}>
      {[0, 1, 2].map((i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ animation: i < n ? `upBadge .5s ease-out ${0.3 + i * 0.25}s both` : undefined }}>
          <path d="M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17l-6.1 3.4 1.5-6.8L2.2 9l6.9-.7z" fill={i < n ? '#FFD447' : '#262048'} stroke={i < n ? '#C79E1A' : '#4A4378'} strokeWidth={1} strokeLinejoin="round" />
        </svg>
      ))}
    </div>
  );
}

function Awards({ awards, player, t }: { awards: { kind: string; playerId: string; value: number }[]; player: HostViewProps['player']; t: Translate }) {
  const col: Record<string, string> = { presses: LIME, homes: '#FFD447', bumps: '#7FD3FF', lava: '#FF8A5C', quiet: '#C9A7FF' };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, awards.length)}, minmax(0, 1fr))`, gap: 16 }}>
      {awards.map((a, i) => {
        const p = player(a.playerId);
        return p ? (
          <div key={a.kind} className="up-card anim-up" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center', borderRadius: 22, animationDelay: `${0.8 + i * 0.15}s` }}>
            <Avatar player={p} size={64} />
            <b style={{ fontSize: 20 }}>{p.name}</b>
            <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: col[a.kind] }}>{t(`award.${a.kind}`)}</span>
            <span className="muted" style={{ fontSize: 16 }}>{t(`award.${a.kind}.d`, { n: a.value })}</span>
          </div>
        ) : null;
      })}
    </div>
  );
}

function HostWon({ view, t, player }: HostViewProps) {
  const d = player(view.decider);
  return (
    <>
      <Confetti silent />
      <HostHeader title={t('title')} color={LIME} info={levelInfo(view, t)} right={<HostTimer deadline={view.deadline} duration={view.duration} />} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center' }}>
        <h1 className="anim-pop" style={{ fontSize: 62 }}>{t('won.title')}</h1>
        <div style={{ marginTop: 6 }}><Stars n={view.stars} /></div>
        <p className="muted" style={{ fontSize: 22, marginTop: 6 }}>
          {t('won.sub', { time: mmss(view.seconds), presses: view.presses })} · <b style={{ color: '#fff' }}>{view.stars === 3 ? t('won.perfect') : t('won.three', { t: mmss(view.limit / 2) })}</b>
        </p>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}><div style={{ flex: 1 }}><Awards awards={view.awards} player={player} t={t} /></div></div>
      <footer style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span className="muted" style={{ fontSize: 18, fontWeight: 600 }}>{t('won.decides', { name: d?.name ?? '?' })}</span>
        {(['next', 'same', 'new', 'pick'] as const).map((k, i) => (
          <span key={k} className="up-chip" style={{ fontSize: 17, background: i === 0 ? 'var(--yellow)' : undefined, color: i === 0 ? '#110D24' : undefined, fontWeight: 800 }}>{t(`choice.${k}`)}</span>
        ))}
      </footer>
    </>
  );
}

function HostPick({ view, t, player }: HostViewProps) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
      <Tag size={56}>{t('title')}</Tag>
      <h1 style={{ fontSize: 44 }}>{t('pick.title', { name: player(view.decider)?.name ?? '?' })}</h1>
    </div>
  );
}

function HostEnd({ view, t, player }: HostViewProps) {
  const results = view.results as { n: number; stars: number; won: boolean }[];
  return (
    <>
      <Confetti silent />
      <HostHeader title={t('title')} color={LIME} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
        <h1 className="anim-pop" style={{ fontSize: 56 }}>{t('end.title')}</h1>
        <p className="display" style={{ fontSize: 30, fontWeight: 800, color: 'var(--yellow)' }}>★ {t('end.stars', { n: view.totalStars })}</p>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap', maxWidth: 1100, margin: '0 auto' }}>
        {results.map((r, i) => (
          <span key={i} className="up-chip" style={{ fontSize: 15, display: 'flex', gap: 6 }}>
            <b>{t('level', { n: r.n })}</b>
            <span style={{ color: r.won ? 'var(--yellow)' : 'var(--faint)' }}>{r.won ? '★'.repeat(r.stars) : '✗'}</span>
          </span>
        ))}
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}><div style={{ flex: 1 }}><Awards awards={view.awards} player={player} t={t} /></div></div>
    </>
  );
}

/* ================= Handy ================= */

function MoveButton({ f, d, onPress, disabled, height, compact }: { f: number; d: Dir; onPress: () => void; disabled: boolean; height: number; compact?: boolean }) {
  const repeat = useRef<{ t?: ReturnType<typeof setTimeout>; i?: ReturnType<typeof setInterval> }>({});
  const stop = () => {
    clearTimeout(repeat.current.t);
    clearInterval(repeat.current.i);
  };
  useEffect(() => stop, []);
  const start = (e: RPointerEvent) => {
    e.preventDefault();
    if (disabled) return;
    onPress();
    stop();
    // Gedrückt halten = weiterlaufen
    repeat.current.t = setTimeout(() => (repeat.current.i = setInterval(onPress, 170)), 330);
  };
  const arrow = { up: 'M12 20V5 M5 11l7-7 7 7', right: 'M4 12h15 M13 5l7 7-7 7', down: 'M12 4v15 M5 13l7 7 7-7', left: 'M20 12H5 M11 5l-7 7 7 7' }[d];
  return (
    <button type="button" aria-label={`${f} ${d}`} disabled={disabled}
      onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop} onContextMenu={(e) => e.preventDefault()}
      style={{
        height, border: 0, borderRadius: 22, background: disabled ? '#262048' : COLORS[f], boxShadow: disabled ? undefined : `0 6px 0 ${DARK[f]}`,
        display: 'flex', alignItems: 'center', justifyContent: compact ? 'center' : 'space-between', padding: compact ? 0 : '0 16px', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', opacity: disabled ? 0.5 : 1,
      } as CSSProperties}>
      {!compact && <svg width={Math.min(44, height * 0.4)} height={Math.min(44, height * 0.4)} viewBox="0 0 24 24" aria-hidden="true"><path d={shapePath(f)} fill={disabled ? COLORS[f] : '#110D24'} opacity={disabled ? 0.6 : 0.45} /></svg>}
      <svg width={Math.min(84, height * 0.7)} height={Math.min(84, height * 0.7)} viewBox="0 0 24 24" fill="none" stroke={disabled ? '#8F88B8' : '#110D24'} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={arrow} /></svg>
    </button>
  );
}

function PhonePlay({ view, t, send }: ControllerViewProps) {
  const actions = view.actions as { f: number; d: Dir }[];
  const figs = [...new Set(actions.map((a) => a.f))].sort();
  const dirs = DIRS.filter((d) => actions.some((a) => a.d === d));
  const rows = figs.length;
  const cols = dirs.length;
  const pads = figs.every((f) => DIRS.every((d) => actions.some((a) => a.f === f && a.d === d)));
  const others = (view.others as { d: Dir; who: { name: string; figs: number[] }[] }[]).filter((o) => o.who.length);
  const h = cols === 1 ? (rows <= 2 ? 150 : rows === 3 ? 124 : 104) : rows <= 1 ? 140 : rows === 2 ? 118 : rows === 3 ? 98 : 84;
  const now = useServerNow(200);
  const countdown = view.countdownTo ? Math.max(0, Math.ceil((view.countdownTo - now) / 1000)) : 0;
  const press = (f: number, d: Dir) => {
    vibrate(10);
    send({ type: 'move', f, d });
  };
  return (
    <>
      {view.live && view.deadline ? <PhoneTimer deadline={view.deadline} duration={view.duration} /> : null}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="up-label">{t('phone.yours')}</span>
        <span className="faint" style={{ fontSize: 13, fontWeight: 700 }}>{view.n > 20 ? t('phone.endless') : t('level', { n: view.n })}</span>
      </div>
      {!view.live && <p className="display" style={{ textAlign: 'center', fontSize: 22, fontWeight: 800, color: LIME }}>{t('phone.soon')} {countdown > 0 ? countdown : ''}</p>}
      {actions.length === 0 ? <PhoneWait title={t('phone.none')} /> : pads ? (
        // Steuerkreuz pro Figur, wenn man alle vier Richtungen hat (z. B. allein)
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${figs.length > 1 ? 2 : 1}, minmax(0, 1fr))`, gap: 14, justifyItems: 'center' }}>
          {figs.map((f) => {
            const size = figs.length > 1 ? 52 : 92;
            const cell = (d: Dir) => <MoveButton compact f={f} d={d} height={size} disabled={!view.live || view.home[f]} onPress={() => press(f, d)} />;
            return (
              <div key={f} style={{ display: 'grid', gridTemplateColumns: `repeat(3, ${size}px)`, gridTemplateRows: `repeat(3, ${size}px)`, gap: 6 }}>
                <span />{cell('up')}<span />
                {cell('left')}<span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Shape f={f} size={size * 0.6} opacity={view.home[f] ? 0.3 : 1} /></span>{cell('right')}
                <span />{cell('down')}<span />
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 10 }}>
          {figs.flatMap((f) => dirs.map((d) => {
            const has = actions.some((a) => a.f === f && a.d === d);
            if (!has) return <span key={`${f}${d}`} />;
            return <MoveButton key={`${f}${d}`} f={f} d={d} height={h} disabled={!view.live || view.home[f]} onPress={() => press(f, d)} />;
          }))}
        </div>
      )}
      {others.length > 0 && <section className="up-card" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span className="faint" style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase' }}>{t('phone.call')}</span>
        {others.map((o) => (
          <div key={o.d} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 15 }}>
            <b style={{ width: 20, textAlign: 'center', fontSize: 18, color: 'var(--muted)' }}>{ARROW[o.d]}</b>
            <span style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px' }}>
              {o.who.map((w) => (
                <span key={w.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  <b>{w.name}</b>{w.figs.map((f) => <Shape key={f} f={f} size={13} />)}
                </span>
              ))}
            </span>
          </div>
        ))}
      </section>}
      <button type="button" className={`up-btn full ${view.restart.mine ? '' : 'ghost'}`} style={{ marginTop: 'auto', minHeight: 50, fontSize: 16 }}
        disabled={!view.live} onClick={() => send({ type: 'restart' })}>
        {view.restart.mine ? t('phone.restartOn') : t('phone.restart')} · {view.restart.votes} / {view.restart.need}
      </button>
    </>
  );
}

function ChoiceButton({ label, onClick, primary, selected, extra }: { label: string; onClick: () => void; primary?: boolean; selected?: boolean; extra?: string }) {
  return (
    <button type="button" aria-pressed={selected} onClick={onClick} className={`up-btn full${primary || selected ? '' : ' ghost'}`}
      style={{ minHeight: 64, fontSize: 20, display: 'flex', justifyContent: 'space-between', boxShadow: selected ? '0 0 0 3px #fff, 0 6px 0 var(--yellow-d)' : undefined }}>
      <span>{label}</span>{extra && <span style={{ fontSize: 15, opacity: 0.8 }}>{extra}</span>}
    </button>
  );
}

function Controller(props: ControllerViewProps) {
  const { view, t, send, me } = props;
  switch (view.screen) {
    case 'intro':
      return <PhoneWait title={t('title')} text={t('lookAtTv')} emoji={<Avatar player={me} size={96} />} />;
    case 'explain':
      return view.isDecider ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 20, textAlign: 'center' }}>
          <h1 style={{ fontSize: 26 }}>{t('explain.new')}</h1>
          <p className="muted">{t('phone.explainWait')}</p>
          <button type="button" className="up-btn big full" onClick={() => send({ type: 'go' })}>{t('explain.button')}</button>
        </div>
      ) : <PhoneWait title={t('explain.new')} text={t('phone.explainWait')} emoji={<Avatar player={me} size={96} />} />;
    case 'play':
      return <PhonePlay {...props} />;
    case 'vote': {
      const c = view.counts as Record<string, number>;
      return (
        <>
          <PhoneTimer deadline={view.deadline} duration={view.duration} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, textAlign: 'center' }}>
            <h1 style={{ fontSize: 30 }}>{t('lost.title')}</h1>
            <p className="muted">{t('lost.sub', { n: view.homeCount, total: view.figures })}</p>
          </div>
          <span className="up-label">{t('phone.vote')}</span>
          {(['same', 'new', 'next'] as const).map((k) => (
            <ChoiceButton key={k} label={t(`choice.${k}`)} selected={view.mine === k} extra={String(c[k])} onClick={() => send({ type: 'vote', choice: k })} />
          ))}
          <p className="faint" style={{ textAlign: 'center', fontSize: 13 }}>{t('lost.tie')} · {t('phone.change')}</p>
          {view.isDecider && <button type="button" className="up-btn ghost small" onClick={() => send({ type: 'endGame' })}>{t('choice.end')}</button>}
        </>
      );
    }
    case 'decide':
      return (
        <>
          <PhoneTimer deadline={view.deadline} duration={view.duration} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <Stars n={view.stars} size={48} />
            <h1 style={{ fontSize: 26 }}>{t('phone.decide')}</h1>
          </div>
          <ChoiceButton primary label={t('choice.next')} onClick={() => send({ type: 'decide', choice: 'next' })} />
          <ChoiceButton label={t('choice.same')} onClick={() => send({ type: 'decide', choice: 'same' })} />
          <ChoiceButton label={t('choice.new')} onClick={() => send({ type: 'decide', choice: 'new' })} />
          <ChoiceButton label={t('choice.pick')} onClick={() => send({ type: 'decide', choice: 'pick' })} />
          <button type="button" className="up-btn ghost small" onClick={() => send({ type: 'decide', choice: 'end' })}>{t('choice.end')}</button>
        </>
      );
    case 'waitDecide':
      return <PhoneWait title={t('phone.waitDecide', { name: view.decider })} emoji={view.stars ? <Stars n={view.stars} size={44} /> : <Avatar player={me} size={96} />} />;
    case 'pickLevel': {
      const best = view.best as Record<number, number>;
      return (
        <>
          <PhoneTimer deadline={view.deadline} duration={view.duration} />
          <h1 style={{ fontSize: 26 }}>{t('phone.pick')}</h1>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
            {Array.from({ length: view.max + 1 }, (_, i) => i + 1).map((n) => (
              <button key={n} type="button" className={`up-btn ${n === view.current + 1 ? '' : 'ghost'}`} onClick={() => send({ type: 'pickLevel', n })}
                style={{ minHeight: 64, padding: 4, fontSize: n > view.max ? 14 : 20, display: 'flex', flexDirection: 'column', gap: 2, gridColumn: n > view.max ? 'span 4' : undefined }}>
                <span>{n > view.max ? t('phone.endless') : n}</span>
                <span style={{ fontSize: 11, color: 'var(--yellow)', minHeight: 12 }}>{best[n] ? '★'.repeat(best[n]) : ''}</span>
              </button>
            ))}
          </div>
        </>
      );
    }
    case 'end':
      return <PhoneWait title={t('phone.end')} text={`★ ${t('end.stars', { n: view.totalStars })}`} emoji={<Avatar player={me} size={110} />} />;
    default:
      return <PhoneWait title={t('lookAtTv')} emoji={<Avatar player={me} size={96} />} />;
  }
}

export default { Host, Controller } satisfies GameClientModule;
