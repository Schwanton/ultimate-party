/** Tick Tack Boom – TV (Host) und Handy (Controller) im Agentenfilm-Look der 60er. */

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { ControllerViewProps, GameClientModule, HostViewProps, PlayerInfo } from '@up/sdk';
import { Avatar, sfx, useServerNow, vibrate } from '@up/ui';
import { MAZE_SIZE, clockText, kindTitle, type Block, type Chapter, type Kind, type Lang } from './engine';

const BG = '#1b1712';
const CARD = '#2a241c';
const PANEL = '#3b3d35';
const BRASS = '#c9a24a';
const BRASS_L = '#e6c46a';
const PAPER = '#efe6d0';
const INK = '#2a2620';
const RED = '#ff3b2f';
const GREEN = '#4fbf6a';
const MUTED = '#bfb39a';
const DIM = '#5a524a';
const STAMP = '#b3261e';
const WOOD = 'repeating-linear-gradient(90deg, #6b3f22 0px, #7a4828 14px, #6b3f22 30px, #5f371d 44px)';
const HEAD = 'Oswald, "Arial Narrow", sans-serif';
const TYPE = '"Special Elite", "Courier New", monospace';
const DIGI = '"Share Tech Mono", "Courier New", monospace';

const WIRE: Record<string, string> = { rot: '#d9362b', blau: '#2f6fb0', gelb: '#ffd34d', weiss: '#efe6d0', schwarz: '#141210' };
const BTN: Record<string, [string, string]> = { rot: ['#b3261e', PAPER], blau: ['#234870', PAPER], gelb: ['#d9b13a', INK], weiss: ['#e8e0cc', INK] };
const STRIP: Record<string, string> = { rot: '#ff4a3d', blau: '#4f8fe0', gelb: '#ffd34d', weiss: '#ffffff' };
const BLINK: Record<string, [string, string]> = { rot: ['#7a2620', '#ff4a3d'], blau: ['#22476e', '#5aa0ff'], gruen: ['#2f5e35', '#62e070'], gelb: ['#86702a', '#ffe066'] };

function useFonts() {
  useEffect(() => {
    if (document.getElementById('ttb-fonts')) return;
    const l = document.createElement('link');
    l.id = 'ttb-fonts';
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Oswald:wght@400;600;700&family=Special+Elite&family=Share+Tech+Mono&display=swap';
    document.head.appendChild(l);
  }, []);
}

const KEYFRAMES = `
@keyframes ttb-shake { 0%,100%{transform:translate(0,0)} 20%{transform:translate(-14px,8px)} 40%{transform:translate(12px,-10px)} 60%{transform:translate(-8px,6px)} 80%{transform:translate(6px,-4px)} }
@keyframes ttb-flash { 0%{opacity:.9} 100%{opacity:0} }
@keyframes ttb-pop { 0%{transform:scale(.6);opacity:0} 70%{transform:scale(1.08);opacity:1} 100%{transform:scale(1)} }
@keyframes ttb-pulse { 0%,100%{opacity:1} 50%{opacity:.45} }
`;

/* ---------- Uhr und Sounds ---------- */

interface Clock { at: number; rem: number; rate: number }
function useBombMs(clock: Clock, running: boolean) {
  const now = useServerNow(100);
  if (!clock) return 0;
  return running ? Math.max(0, clock.rem - (now - clock.at) * clock.rate) : clock.rem;
}

function Timer({ clock, running, size }: { clock: Clock; running: boolean; size: number }) {
  const ms = useBombMs(clock, running);
  const low = running && ms < 30000;
  return (
    <div style={{ background: '#120d0b', borderRadius: 6, padding: `${size * 0.06}px ${size * 0.18}px`, fontFamily: DIGI, fontSize: size, lineHeight: 1, color: RED, textShadow: '0 0 18px rgba(255,59,47,0.7)', animation: low ? 'ttb-pulse 1s infinite' : undefined }}>
      {clockText(ms)}
    </div>
  );
}

function Strikes({ n, max, size = 26 }: { n: number; max: number; size?: number }) {
  return (
    <div style={{ display: 'flex', gap: size * 0.4 }}>
      {Array.from({ length: max }, (_, i) => (
        <div key={i} style={{ width: size, height: size, borderRadius: '50%', border: `${Math.max(2, size / 9)}px solid ${BRASS}`, background: i < n ? RED : '#2a1a17', boxShadow: i < n ? `0 0 12px ${RED}` : undefined }} />
      ))}
    </div>
  );
}

const boom = () => sfx.custom((s) => {
  s.noise(1.8, { filter: 900, type: 'lowpass', vol: 0.55, sweepTo: 120 });
  s.tone(70, 1.2, { type: 'sine', vol: 0.6, to: 30 });
  s.tone(45, 1.6, { type: 'triangle', vol: 0.4, to: 25, at: 0.05 });
});
const buzz = () => sfx.custom((s) => { s.tone(110, 0.35, { type: 'sawtooth', vol: 0.25 }); s.tone(116, 0.35, { type: 'square', vol: 0.12 }); });
const tick = (hi: boolean) => sfx.custom((s) => s.tone(hi ? 1700 : 1250, 0.035, { type: 'square', vol: 0.05 }));
const snip = () => sfx.custom((s) => s.noise(0.06, { filter: 4000, type: 'highpass', vol: 0.25 }));

function useOnChange(value: number, fn: () => void) {
  const prev = useRef(value);
  useEffect(() => {
    if (value && value !== prev.current) fn();
    prev.current = value;
  }, [value]);
}

/* ---------- Kleine Bausteine ---------- */

function Lamp({ on, color = GREEN, size = 16 }: { on: boolean; color?: string; size?: number }) {
  return <span style={{ display: 'inline-block', width: size, height: size, borderRadius: '50%', background: on ? color : DIM, boxShadow: on ? `0 0 10px ${color}` : undefined, flex: 'none' }} />;
}

function Name({ p, size = 16 }: { p?: PlayerInfo; size?: number }) {
  if (!p) return null;
  return <span style={{ background: p.color, color: INK, borderRadius: 20, padding: '1px 10px', fontSize: size, fontWeight: 600, fontFamily: HEAD, whiteSpace: 'nowrap' }}>{p.name}</span>;
}

const btnBase: CSSProperties = { border: `2px solid ${BRASS}`, background: '#1f211c', color: BRASS_L, fontFamily: HEAD, borderRadius: 8, cursor: 'pointer', touchAction: 'manipulation' };

function ModFrame({ m, title, children, compact, highlight, foot }: { m: any; title: string; children: ReactNode; compact?: boolean; highlight?: boolean; foot?: ReactNode }) {
  return (
    <div style={{ background: PANEL, border: `3px solid ${highlight ? '#ffd34d' : BRASS}`, borderRadius: 10, padding: compact ? 10 : 14, display: 'flex', flexDirection: 'column', gap: compact ? 6 : 10, minHeight: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: compact ? 15 : 19, letterSpacing: 2, textTransform: 'uppercase' }}>{title}</span>
        {m.kind === 'druck' || m.kind === 'frage' ? <span style={{ color: '#ff8a5c', fontFamily: DIGI }}>∞</span> : <Lamp on={m.solved} size={compact ? 14 : 18} />}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 0 }}>{children}</div>
      {foot}
    </div>
  );
}

/* ---------- Module ---------- */

interface ModProps { m: any; send?: (a: any) => void; me?: string; t: (k: string, v?: any) => string; lang: Lang; player: (id: string) => PlayerInfo | undefined; compact?: boolean }

function Kabel({ m, send, compact }: ModProps) {
  const h = compact ? 9 : 16;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 8 : 6 }}>
      {m.colors.map((c: string, k: number) => {
        const wire = (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
            {!compact && <div style={{ width: 14, height: 26, background: BRASS, borderRadius: 3 }} />}
            <div style={{ flex: 1, display: 'flex', gap: m.cut[k] ? 18 : 0 }}>
              <div style={{ flex: 1, height: h, background: WIRE[c], borderRadius: h / 2, border: c === 'schwarz' ? '2px solid #8a8070' : undefined }} />
              {m.cut[k] && <div style={{ flex: 1, height: h, background: WIRE[c], borderRadius: h / 2, border: c === 'schwarz' ? '2px solid #8a8070' : undefined }} />}
            </div>
            {!compact && <div style={{ width: 14, height: 26, background: BRASS, borderRadius: 3 }} />}
          </div>
        );
        return send && !m.cut[k] && !m.solved
          ? <button key={k} type="button" onClick={() => send({ w: k })} style={{ background: 'none', border: 0, padding: '10px 0', cursor: 'pointer', touchAction: 'manipulation' }}>{wire}</button>
          : <div key={k} style={{ padding: compact ? 0 : '10px 0' }}>{wire}</div>;
      })}
    </div>
  );
}

function Hold({ onPress, onRelease, children, style, label }: { onPress: () => void; onRelease: () => void; children: ReactNode; style: CSSProperties; label: string }) {
  const down = useRef(false);
  const up = () => { if (down.current) { down.current = false; onRelease(); } };
  return (
    <button type="button" aria-label={label} style={{ ...style, touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
      onPointerDown={(e) => { e.preventDefault(); (e.target as HTMLElement).setPointerCapture?.(e.pointerId); if (!down.current) { down.current = true; onPress(); } }}
      onPointerUp={up} onPointerCancel={up} onContextMenu={(e) => e.preventDefault()}>
      {children}
    </button>
  );
}

function Knopf({ m, send, compact, t }: ModProps) {
  const size = compact ? 96 : 170;
  const [bg, fg] = BTN[m.color];
  const face: CSSProperties = { width: size, height: size, borderRadius: '50%', background: bg, color: fg, border: `${compact ? 5 : 8}px solid #1b1712`, fontFamily: HEAD, fontSize: compact ? 20 : 34, fontWeight: 700, boxShadow: m.held ? 'inset 0 6px 0 rgba(0,0,0,0.4)' : '0 6px 0 rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 14 : 22 }}>
        {send && !m.solved
          ? <Hold label={m.label} style={face} onPress={() => send({ press: true })} onRelease={() => send({ release: true })}>{m.label}</Hold>
          : <div style={face}>{m.label}</div>}
        <div style={{ width: compact ? 12 : 22, height: size * 0.85, borderRadius: 5, background: m.strip ? STRIP[m.strip] : '#4a4d43', boxShadow: m.strip ? `0 0 14px ${STRIP[m.strip]}` : undefined }} />
      </div>
      {send && !m.solved && <div style={{ fontFamily: TYPE, fontSize: 14, color: '#d8cfb8', textAlign: 'center' }}>{m.held ? t('knopf.holding') : t('knopf.hint')}</div>}
    </div>
  );
}

function Zeichen({ m, send, compact }: ModProps) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
      {m.symbols.map((s: string, k: number) => {
        const st: CSSProperties = { background: '#d8cfb8', color: INK, borderRadius: 6, height: compact ? 54 : 84, fontSize: compact ? 30 : 46, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', border: 0, fontFamily: 'serif' };
        const dot = m.pressed[k] && <span style={{ position: 'absolute', top: 6, right: 6 }}><Lamp on size={12} /></span>;
        return send && !m.pressed[k] && !m.solved
          ? <button key={k} type="button" style={{ ...st, cursor: 'pointer', touchAction: 'manipulation' }} onClick={() => send({ s })}>{s}{dot}</button>
          : <div key={k} style={st}>{s}{dot}</div>;
      })}
    </div>
  );
}

function useSequence(steps: [string | null, number][], active: boolean, key: string) {
  const [cur, setCur] = useState<string | null>(null);
  useEffect(() => {
    if (!active || !steps.length) { setCur(null); return; }
    let i = 0;
    let id: ReturnType<typeof setTimeout>;
    const run = () => {
      const [v, ms] = steps[i];
      setCur(v);
      i = (i + 1) % steps.length;
      id = setTimeout(run, ms);
    };
    id = setTimeout(run, 400);
    return () => clearTimeout(id);
  }, [key, active]);
  return cur;
}

function Blink({ m, send, compact, t }: ModProps) {
  const steps: [string | null, number][] = [];
  for (const c of m.show ?? []) { steps.push([c, 550]); steps.push([null, 300]); }
  if (steps.length) steps[steps.length - 1] = [null, 1900];
  const lit = useSequence(steps, !m.solved, (m.show ?? []).join(',') + m.solved);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, flex: 1 }}>
        {(['rot', 'blau', 'gruen', 'gelb'] as const).map((c) => {
          const on = lit === c;
          const st: CSSProperties = { background: on ? BLINK[c][1] : BLINK[c][0], boxShadow: on ? `0 0 22px ${BLINK[c][1]}` : undefined, borderRadius: 8, minHeight: compact ? 40 : 90, border: 0 };
          return send && !m.solved
            ? <button key={c} type="button" aria-label={c} style={{ ...st, cursor: 'pointer', touchAction: 'manipulation' }} onClick={() => send({ c })} />
            : <div key={c} style={st} />;
        })}
      </div>
      {!compact && !m.solved && <div style={{ fontFamily: TYPE, fontSize: 14, color: '#d8cfb8', textAlign: 'center' }}>{t('blink.stage', { n: m.stage, total: m.total, i: m.input })}</div>}
    </div>
  );
}

function Funk({ m, send, compact, t }: ModProps) {
  const steps: [string | null, number][] = [];
  const letters = String(m.code ?? '').split(' ');
  letters.forEach((l, li) => {
    [...l].forEach((ch, ci) => {
      steps.push(['on', ch === '.' ? 280 : 840]);
      steps.push([null, ci === l.length - 1 ? (li === letters.length - 1 ? 2600 : 850) : 280]);
    });
  });
  const on = useSequence(steps, !m.solved, String(m.code) + m.solved) === 'on';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: compact ? 8 : 14 }}>
      <div style={{ width: compact ? 26 : 44, height: compact ? 26 : 44, borderRadius: '50%', background: on ? '#ffd34d' : '#4a4030', boxShadow: on ? '0 0 22px #ffd34d' : undefined }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {send && !m.solved && <button type="button" aria-label="-" style={{ ...btnBase, width: 52, height: 52, fontSize: 26, borderRadius: '50%' }} onClick={() => send({ tune: -1 })}>‹</button>}
        <div style={{ background: '#120d0b', padding: '6px 14px', borderRadius: 4, fontFamily: DIGI, fontSize: compact ? 22 : 30, color: RED }}>{m.freq} MHz</div>
        {send && !m.solved && <button type="button" aria-label="+" style={{ ...btnBase, width: 52, height: 52, fontSize: 26, borderRadius: '50%' }} onClick={() => send({ tune: 1 })}>›</button>}
      </div>
      {send && !m.solved && <button type="button" style={{ ...btnBase, padding: '10px 28px', fontSize: 20, letterSpacing: 2 }} onClick={() => send({ send: true })}>{t('funk.send')}</button>}
    </div>
  );
}

function Irrgarten({ m, send, compact }: ModProps) {
  const cell = compact ? 22 : 40;
  const N = MAZE_SIZE;
  const isMarker = (x: number, y: number) => (m.markers as [number, number][]).some(([a, b]) => a === x && b === y);
  const arrow = (d: string, label: string) => <button type="button" aria-label={d} style={{ ...btnBase, width: 60, height: 52, fontSize: 24 }} onClick={() => send?.({ d })}>{label}</button>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div style={{ background: '#1f211c', borderRadius: 6, padding: 8, display: 'grid', gridTemplateColumns: `repeat(${N}, ${cell}px)`, gridAutoRows: `${cell}px` }}>
        {Array.from({ length: N * N }, (_, k) => {
          const x = k % N, y = Math.floor(k / N);
          const here = m.pos[0] === x && m.pos[1] === y;
          const goal = m.goal[0] === x && m.goal[1] === y;
          return (
            <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              {isMarker(x, y) && <span style={{ position: 'absolute', width: cell * 0.7, height: cell * 0.7, borderRadius: '50%', border: `2px solid ${GREEN}`, boxSizing: 'border-box' }} />}
              {here ? <span style={{ width: cell * 0.42, height: cell * 0.42, background: PAPER, zIndex: 1 }} />
                : goal ? <span style={{ width: 0, height: 0, borderLeft: `${cell * 0.24}px solid transparent`, borderRight: `${cell * 0.24}px solid transparent`, borderBottom: `${cell * 0.42}px solid ${RED}`, zIndex: 1 }} />
                : <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#6d655a' }} />}
            </div>
          );
        })}
      </div>
      {send && !m.solved && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 60px)', gap: 6 }}>
          <span />{arrow('n', '▲')}<span />
          {arrow('w', '◀')}<span />{arrow('o', '▶')}
          <span />{arrow('s', '▼')}<span />
        </div>
      )}
    </div>
  );
}

function Wort({ m, send, compact, t }: ModProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ background: '#120d0b', borderRadius: 4, padding: compact ? 4 : 10, textAlign: 'center', fontFamily: DIGI, fontSize: compact ? 24 : 34, color: '#8fd9a0' }}>{m.display}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
        {m.buttons.map((w: string) => {
          const st: CSSProperties = { background: '#d8cfb8', color: INK, borderRadius: 4, textAlign: 'center', padding: compact ? 3 : 12, fontFamily: HEAD, fontSize: compact ? 15 : 20, border: 0 };
          return send && !m.solved ? <button key={w} type="button" style={{ ...st, cursor: 'pointer', touchAction: 'manipulation' }} onClick={() => send({ w })}>{w}</button> : <div key={w} style={st}>{w}</div>;
        })}
      </div>
      {!compact && !m.solved && <div style={{ fontFamily: TYPE, fontSize: 14, color: '#d8cfb8', textAlign: 'center' }}>{t('wort.stage', { n: m.stage, total: m.total })}</div>}
    </div>
  );
}

function Schloss({ m, send, compact, t }: ModProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div style={{ display: 'flex', gap: 10 }}>
        {m.wheels.map((d: number, k: number) => (
          <div key={k} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            {send && !m.solved && <button type="button" aria-label="+" style={{ ...btnBase, width: 58, height: 40, fontSize: 18 }} onClick={() => send({ wheel: k, d: 1 })}>▲</button>}
            <div style={{ width: compact ? 46 : 62, height: compact ? 78 : 100, borderRadius: 8, background: 'linear-gradient(#8f7a3e, #e6c46a 50%, #8f7a3e)', color: INK, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: DIGI, fontSize: compact ? 36 : 48 }}>{d}</div>
            {send && !m.solved && <button type="button" aria-label="-" style={{ ...btnBase, width: 58, height: 40, fontSize: 18 }} onClick={() => send({ wheel: k, d: -1 })}>▼</button>}
          </div>
        ))}
      </div>
      {send && !m.solved && <button type="button" style={{ ...btnBase, padding: '10px 28px', fontSize: 20, letterSpacing: 2 }} onClick={() => send({ open: true })}>{t('schloss.open')}</button>}
    </div>
  );
}

function Doppel({ m, send, me, compact, t, player }: ModProps) {
  const mine = me && m.ops.includes(me);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <Lamp on={m.green} size={compact ? 18 : 26} />
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        {m.ops.map((id: string) => {
          const p = player(id);
          const held = !!m.hold?.[id];
          const st: CSSProperties = { width: compact ? 72 : 120, height: compact ? 72 : 120, borderRadius: 16, background: held ? '#3a3020' : '#1f211c', border: `3px solid ${held ? '#ffd34d' : BRASS}`, color: p?.color ?? BRASS, fontFamily: HEAD, fontSize: compact ? 13 : 18, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' };
          return send && mine && id === me && !m.solved
            ? <Hold key={id} label={t('doppel.press')} style={st} onPress={() => send({ press: true })} onRelease={() => send({ release: true })}>{held ? t('doppel.holding') : t('doppel.press')}</Hold>
            : <div key={id} style={st}>{p?.name ?? '?'}</div>;
        })}
      </div>
      {!compact && <div style={{ fontFamily: TYPE, fontSize: 14, color: '#d8cfb8', textAlign: 'center' }}>{m.green ? t('doppel.release') : t('doppel.hint')}</div>}
    </div>
  );
}

function Stimme({ m, send, me, compact, t }: ModProps) {
  const voted = me && m.voted.includes(me);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        {m.symbols.map((s: string, k: number) => {
          const st: CSSProperties = { background: '#d8cfb8', color: INK, borderRadius: 6, height: compact ? 54 : 80, fontSize: compact ? 30 : 44, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 0, fontFamily: 'serif' };
          return (
            <div key={k} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              {send && !voted && !m.solved ? <button type="button" style={{ ...st, width: '100%', cursor: 'pointer', touchAction: 'manipulation' }} onClick={() => send({ vote: k })}>{s}</button> : <div style={{ ...st, width: '100%' }}>{s}</div>}
              <span style={{ fontFamily: DIGI, fontSize: 15, color: MUTED }}>{'●'.repeat(m.counts[k])}&nbsp;</span>
            </div>
          );
        })}
      </div>
      {!compact && !m.solved && <div style={{ fontFamily: TYPE, fontSize: 14, color: '#d8cfb8', textAlign: 'center' }}>{voted ? t('stimme.voted') : t('stimme.hint')}</div>}
    </div>
  );
}

function Druck({ m, send, compact, t }: ModProps) {
  const now = useServerNow(150);
  const f = Math.min(1, Math.max(0, (now - m.last) / (m.period || 1)));
  const ang = Math.PI * (1 - f);
  const x = 75 + Math.cos(ang) * 55, y = 75 - Math.sin(ang) * 55;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <svg width={compact ? 120 : 170} viewBox="0 0 150 82" aria-hidden="true">
        <path d="M10 75 A65 65 0 0 1 140 75" fill="none" stroke="#4a4d43" strokeWidth={12} />
        <path d="M110 22 A65 65 0 0 1 140 75" fill="none" stroke="#d9362b" strokeWidth={12} />
        <line x1={75} y1={75} x2={x} y2={y} stroke={PAPER} strokeWidth={4} strokeLinecap="round" />
        <circle cx={75} cy={75} r={6} fill={BRASS} />
      </svg>
      {send && <button type="button" style={{ ...btnBase, padding: '10px 24px', fontSize: 18, letterSpacing: 2, borderColor: f > 0.7 ? RED : BRASS }} onClick={() => send({ vent: true })}>{t('druck.vent')}</button>}
    </div>
  );
}

function Frage({ m, send, compact, t }: ModProps) {
  const now = useServerNow(250);
  if (!m.q) return <div style={{ fontFamily: TYPE, fontSize: compact ? 13 : 15, color: MUTED, textAlign: 'center' }}>{t('frage.quiet')}</div>;
  const s = Math.max(0, Math.ceil((m.deadline - now) / 1000));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ background: PAPER, color: INK, borderRadius: 4, padding: '8px 10px', fontFamily: TYPE, fontSize: compact ? 14 : 17, lineHeight: 1.35 }}>{m.q}</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {send && <button type="button" style={{ ...btnBase, flex: 1, background: '#3f7a45', color: PAPER, borderColor: '#3f7a45', padding: 10, fontSize: 20 }} onClick={() => send({ answer: true })}>{t('yes')}</button>}
        {send && <button type="button" style={{ ...btnBase, flex: 1, background: '#8a2a22', color: PAPER, borderColor: '#8a2a22', padding: 10, fontSize: 20 }} onClick={() => send({ answer: false })}>{t('no')}</button>}
        <span style={{ fontFamily: DIGI, color: '#ff8a5c', fontSize: 20, minWidth: 30, textAlign: 'right' }}>{s}</span>
      </div>
    </div>
  );
}

const MODS: Record<Kind, (p: ModProps) => any> = { kabel: Kabel, knopf: Knopf, zeichen: Zeichen, blink: Blink, funk: Funk, irrgarten: Irrgarten, wort: Wort, schloss: Schloss, doppel: Doppel, stimme: Stimme, druck: Druck, frage: Frage };

function Module(p: ModProps & { foot?: ReactNode; highlight?: boolean }) {
  const C = MODS[p.m.kind as Kind];
  return (
    <ModFrame m={p.m} title={kindTitle(p.lang, p.m.kind)} compact={p.compact} foot={p.foot} highlight={p.highlight}>
      {C ? <C {...p} /> : null}
    </ModFrame>
  );
}

/* ---------- Anleitung ---------- */

function MazeMini({ open, markers }: { open: number[]; markers: [number, number][] }) {
  const N = MAZE_SIZE, c = 16, pad = 3;
  const lines: ReactNode[] = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const o = open[y * N + x];
    const X = pad + x * c, Y = pad + y * c;
    if (!(o & 2) && x < N - 1) lines.push(<line key={`e${x}-${y}`} x1={X + c} y1={Y} x2={X + c} y2={Y + c} stroke={INK} strokeWidth={2.2} strokeLinecap="round" />);
    if (!(o & 4) && y < N - 1) lines.push(<line key={`s${x}-${y}`} x1={X} y1={Y + c} x2={X + c} y2={Y + c} stroke={INK} strokeWidth={2.2} strokeLinecap="round" />);
  }
  const W = N * c + pad * 2;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${W}`} role="img" aria-label="Plan">
      <rect x={pad} y={pad} width={N * c} height={N * c} fill="none" stroke={INK} strokeWidth={2.2} />
      {Array.from({ length: N * N }, (_, k) => <circle key={k} cx={pad + (k % N) * c + c / 2} cy={pad + Math.floor(k / N) * c + c / 2} r={1.2} fill="#8a7d66" />)}
      {lines}
      {markers.map(([x, y], k) => <circle key={`m${k}`} cx={pad + x * c + c / 2} cy={pad + y * c + c / 2} r={5.5} fill="none" stroke="#2f7a3a" strokeWidth={2} />)}
    </svg>
  );
}

function BlockView({ b }: { b: Block }) {
  const typ: CSSProperties = { fontFamily: TYPE, fontSize: 15, lineHeight: 1.5, color: '#3a3328', margin: 0 };
  switch (b.type) {
    case 'text': return <p style={typ}>{b.text}</p>;
    case 'rules': return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {b.title && <div style={{ fontFamily: HEAD, fontSize: 19, fontWeight: 600, color: INK }}>{b.title}</div>}
        <ol style={{ ...typ, paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 6 }}>{b.items.map((x, i) => <li key={i}>{x}</li>)}</ol>
      </div>
    );
    case 'table': return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontFamily: TYPE, fontSize: 14, color: INK, width: '100%' }}>
          <thead><tr>{b.head.map((h, i) => <th key={i} style={{ textAlign: 'left', borderBottom: `2px solid ${INK}`, padding: '4px 6px', fontFamily: HEAD, fontWeight: 600 }}>{h}</th>)}</tr></thead>
          <tbody>{b.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} style={{ borderBottom: '1px solid #cfc3a8', padding: '4px 6px', whiteSpace: 'nowrap' }}>{c}</td>)}</tr>)}</tbody>
        </table>
      </div>
    );
    case 'glyphs': return (
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${b.cols.length}, minmax(0, 1fr))`, gap: 5 }}>
        {b.cols.map((col, i) => (
          <div key={i} style={{ border: '1px solid #b8ab8e', borderRadius: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '6px 0', fontSize: 24, fontFamily: 'serif', color: INK }}>
            {col.map((s, j) => <span key={j}>{s}</span>)}
          </div>
        ))}
      </div>
    );
    case 'mazes': return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        {b.mazes.map((mz, i) => <div key={i} style={{ background: '#f7f0de', borderRadius: 4, padding: 2 }}><MazeMini open={mz.open} markers={mz.markers} /></div>)}
      </div>
    );
    case 'words': return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontFamily: TYPE, fontSize: 14, color: INK }}>
        {b.lists.map(([w, list]) => (
          <div key={w} style={{ borderBottom: '1px solid #cfc3a8', paddingBottom: 3 }}>
            <b style={{ fontFamily: HEAD, fontSize: 16 }}>{w}</b> → {list.join(', ')}
          </div>
        ))}
      </div>
    );
    case 'votes': return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {b.rows.map((r, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, fontSize: 28, fontFamily: 'serif', color: INK, borderBottom: '1px solid #cfc3a8', paddingBottom: 4 }}>
            {r.symbols.map((s, j) => <span key={j} style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', border: j === r.correct ? `3px solid ${STAMP}` : '3px solid transparent' }}>{s}</span>)}
          </div>
        ))}
      </div>
    );
  }
}

function Dossier({ c, t, n }: { c: Chapter; t: (k: string, v?: any) => string; n: number }) {
  return (
    <div style={{ background: PAPER, color: INK, borderRadius: 4, padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 12, position: 'relative', boxShadow: '0 10px 24px rgba(0,0,0,0.5)' }}>
      <div style={{ position: 'absolute', top: 14, right: 12, transform: 'rotate(-9deg)', border: `3px solid ${STAMP}`, color: STAMP, padding: '1px 8px', fontFamily: HEAD, fontSize: 14, fontWeight: 700, letterSpacing: 2 }}>{t('secret')}</div>
      <div style={{ fontFamily: TYPE, fontSize: 12, color: '#6d6252' }}>{t('dossier', { n })}</div>
      <div style={{ fontFamily: HEAD, fontSize: 30, fontWeight: 700, lineHeight: 1, paddingRight: 110 }}>{c.title}</div>
      {c.blocks.map((b, i) => <BlockView key={i} b={b} />)}
      <div style={{ fontFamily: TYPE, fontSize: 13, color: '#8a2a22' }}>{t('readAloud')}</div>
    </div>
  );
}

function Manual({ chapters, t }: { chapters: Chapter[]; t: (k: string, v?: any) => string }) {
  const [sel, setSel] = useState(0);
  const i = Math.min(sel, chapters.length - 1);
  if (!chapters.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
        {chapters.map((c, k) => (
          <button key={c.kind} type="button" onClick={() => setSel(k)} style={{ ...btnBase, flex: 'none', padding: '8px 12px', fontSize: 15, background: k === i ? PANEL : CARD, color: k === i ? PAPER : MUTED, borderColor: k === i ? BRASS : '#4a4339' }}>{c.title}</button>
        ))}
      </div>
      <Dossier c={chapters[i]} t={t} n={i + 1} />
    </div>
  );
}

/* ---------- TV ---------- */

function CaseStrip({ c, t, size = 18 }: { c: any; t: (k: string, v?: any) => string; size?: number }) {
  if (!c) return null;
  return (
    <div style={{ display: 'flex', gap: size, alignItems: 'center', flexWrap: 'wrap', fontFamily: DIGI, fontSize: size, color: PAPER }}>
      <span style={{ background: PAPER, color: INK, padding: '3px 10px', borderRadius: 3 }}>{t('serial')} {c.serial}</span>
      <span style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
        {Array.from({ length: c.batteries }, (_, i) => <span key={i} style={{ width: size * 1.8, height: size * 0.85, background: '#2f5d8a', borderRadius: 3, display: 'inline-block' }} />)}
        <span style={{ marginLeft: 4 }}>{t('batteries', { n: c.batteries })}</span>
      </span>
      {c.labels.length === 0 && <span style={{ color: MUTED }}>{t('noLabels')}</span>}
      {c.labels.map((l: any) => (
        <span key={l.text} style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Lamp on={l.lit} color="#ffd34d" size={size * 0.7} />{l.text}</span>
      ))}
    </div>
  );
}

function TvFrame({ children, shake }: { children: ReactNode; shake?: boolean }) {
  useFonts();
  return (
    <div style={{ position: 'absolute', inset: 0, background: BG, color: PAPER, fontFamily: HEAD, display: 'flex', flexDirection: 'column', padding: '28px 48px 92px', gap: 20, overflow: 'hidden', animation: shake ? 'ttb-shake .6s' : undefined }}>
      <style>{KEYFRAMES}</style>
      {children}
    </div>
  );
}

function TvHeader({ view, t }: { view: any; t: (k: string, v?: any) => string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: STAMP, border: `3px solid ${BRASS}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 18 }}>TTB</div>
        <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: 4, color: BRASS }}>TICK TACK BOOM</div>
      </div>
      <div style={{ fontFamily: TYPE, fontSize: 21, color: MUTED }}>
        {view.mode === 'b' ? t('modeB') + ' · ' : ''}{t('bombOf', { n: view.bombNo, total: view.bombs })} · {t('stage', { n: view.stage })}
      </div>
    </div>
  );
}

function HostSounds({ view }: { view: any }) {
  const ms = useBombMs(view.clock, view.screen === 'armed');
  const sec = Math.ceil(ms / 1000);
  const last = useRef(sec);
  useEffect(() => {
    if (view.screen === 'armed' && sec !== last.current && sec > 0) tick(sec <= 30);
    last.current = sec;
  }, [sec, view.screen]);
  useOnChange(view.flash?.strikeAt ?? 0, () => buzz());
  useOnChange(view.flash?.solveAt ?? 0, () => { sfx.play('ding', { always: true }); snip(); });
  const endKey = view.screen === 'end' ? view.key : 0;
  useOnChange(endKey, () => (view.defused ? sfx.play('fanfare', { always: true }) : boom()));
  return null;
}

function StrikeFlash({ at }: { at: number }) {
  const now = useServerNow(100);
  if (!at || now - at > 700) return null;
  return <div key={at} style={{ position: 'absolute', inset: 0, background: RED, animation: 'ttb-flash .7s forwards', pointerEvents: 'none' }} />;
}

function Host({ view, t, player, room }: HostViewProps) {
  const lang = (room.lang === 'en' ? 'en' : 'de') as Lang;
  const now = useServerNow(200);
  const shake = view.screen === 'end' && !view.defused;
  return (
    <TvFrame shake={shake}>
      <HostSounds view={view} />
      {view.screen === 'intro' && <HostIntro view={view} t={t} />}
      {(view.screen === 'roles' || view.screen === 'armed') && (view.mode === 'b' ? <HostCrew view={view} t={t} player={player} lang={lang} /> : <HostDefuser view={view} t={t} player={player} lang={lang} />)}
      {view.screen === 'end' && <HostEnd view={view} t={t} />}
      {view.screen === 'final' && <HostFinal view={view} t={t} player={player} />}
      {view.flash?.strikeAt && now - view.flash.strikeAt < 700 ? <StrikeFlash at={view.flash.strikeAt} /> : null}
    </TvFrame>
  );
}

function HostIntro({ view, t }: { view: any; t: (k: string, v?: any) => string }) {
  return (
    <>
      <TvHeader view={view} t={t} />
      <div style={{ flex: 1, display: 'flex', gap: 48, alignItems: 'center' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ fontSize: 56, fontWeight: 700, lineHeight: 1.05, animation: 'ttb-pop .6s' }}>{view.mode === 'b' ? t('intro.titleB') : t('intro.titleA')}</div>
          <div style={{ fontFamily: TYPE, fontSize: 26, lineHeight: 1.45 }}>{view.mode === 'b' ? t('intro.b') : t('intro.a')}</div>
          <div style={{ fontFamily: TYPE, fontSize: 22, color: '#ffb3a8' }}>{t('intro.rules')}</div>
          {view.mixed && <div style={{ fontFamily: TYPE, fontSize: 20, color: BRASS_L }}>{t('intro.mixed')}</div>}
        </div>
        <div style={{ background: WOOD, borderRadius: 18, padding: 22, boxShadow: '0 18px 40px rgba(0,0,0,0.55)' }}>
          <div style={{ background: PANEL, border: `4px solid ${BRASS}`, borderRadius: 10, padding: '26px 36px' }}>
            <div style={{ background: '#120d0b', borderRadius: 6, padding: '8px 24px', fontFamily: DIGI, fontSize: 110, lineHeight: 1, color: RED, textShadow: '0 0 18px rgba(255,59,47,0.7)' }}>5:00</div>
          </div>
        </div>
      </div>
    </>
  );
}

function HostDefuser({ view, t, player, lang }: { view: any; t: (k: string, v?: any) => string; player: (id: string) => PlayerInfo | undefined; lang: Lang }) {
  const d = player(view.defuser);
  const armed = view.screen === 'armed';
  return (
    <>
      <TvHeader view={view} t={t} />
      <div style={{ flex: 1, display: 'flex', gap: 36, minHeight: 0 }}>
        <div style={{ width: 310, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 16, letterSpacing: 3, color: MUTED }}>{t('defuser').toUpperCase()}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, background: CARD, border: `2px solid ${BRASS}`, borderRadius: 10, padding: 14 }}>
            {d && <Avatar player={d} size={68} />}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <div style={{ fontSize: 32, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d?.name}</div>
              <div style={{ fontFamily: TYPE, fontSize: 15, color: MUTED }}>{t('hasBomb')}</div>
            </div>
          </div>
          <div style={{ fontFamily: TYPE, fontSize: 18, lineHeight: 1.45 }}>{t('defuserHint', { name: d?.name ?? '' })}</div>
          <div style={{ marginTop: 'auto', fontSize: 16, letterSpacing: 3, color: MUTED }}>{t('manualHolders').toUpperCase()}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 19 }}>
            {view.readers.filter((r: any) => r.chapters.length).map((r: any) => (
              <div key={r.pid} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ whiteSpace: 'nowrap' }}>{player(r.pid)?.name}</span>
                <span style={{ color: MUTED, textAlign: 'right', fontSize: 16 }}>{r.chapters.join(' · ')}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
          <div style={{ background: WOOD, borderRadius: 18, padding: 22, boxShadow: '0 18px 40px rgba(0,0,0,0.55)' }}>
            <div style={{ background: PANEL, border: `4px solid ${BRASS}`, borderRadius: 10, padding: '24px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
              <Timer clock={view.clock} running={armed} size={140} />
              <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                <div style={{ fontSize: 16, letterSpacing: 3, color: '#d8cfb8' }}>{t('strikes').toUpperCase()}</div>
                <Strikes n={view.strikes} max={view.maxStrikes} size={30} />
              </div>
            </div>
          </div>
          <div style={{ fontFamily: TYPE, fontSize: 20, color: armed ? '#ffb3a8' : BRASS_L, textAlign: 'center' }}>{armed ? t('speedup') : t('getReady')}</div>
        </div>
        <div style={{ width: 300, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 16, letterSpacing: 3, color: MUTED }}>{t('modules').toUpperCase()}</div>
          {view.mods.map((m: any) => (
            <div key={m.i} style={{ display: 'flex', alignItems: 'center', gap: 12, background: CARD, borderRadius: 10, padding: '11px 14px' }}>
              {m.kind === 'druck' || m.kind === 'frage' ? <span style={{ color: '#ff8a5c', fontFamily: DIGI, width: 20, textAlign: 'center' }}>∞</span> : <Lamp on={m.solved} size={20} />}
              <div style={{ fontSize: 22, flex: 1 }}>{kindTitle(lang, m.kind)}</div>
              {m.solved && <div style={{ fontFamily: TYPE, fontSize: 14, color: '#8fd9a0' }}>{t('solved')}</div>}
            </div>
          ))}
          <div style={{ marginTop: 'auto', fontFamily: TYPE, fontSize: 16, lineHeight: 1.4, color: MUTED }}>{t('tvSecret', { name: d?.name ?? '' })}</div>
        </div>
      </div>
    </>
  );
}

function HostCrew({ view, t, player, lang }: { view: any; t: (k: string, v?: any) => string; player: (id: string) => PlayerInfo | undefined; lang: Lang }) {
  const armed = view.screen === 'armed';
  const n = view.mods.length + 1;
  const cols = n <= 4 ? 2 : n <= 6 ? 3 : 4;
  return (
    <>
      <TvHeader view={view} t={t} />
      <div style={{ flex: 1, background: WOOD, borderRadius: 22, padding: 18, display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 18px 40px rgba(0,0,0,0.55)', minHeight: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <CaseStrip c={view.case} t={t} size={18} />
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center', fontSize: 15, letterSpacing: 2 }}>{t('strikes').toUpperCase()}<Strikes n={view.strikes} max={view.maxStrikes} size={20} /></div>
        </div>
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridAutoRows: 'minmax(0, 1fr)', gap: 12, minHeight: 0 }}>
          <div style={{ background: PANEL, border: `3px solid ${BRASS}`, borderRadius: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Timer clock={view.clock} running={armed} size={cols === 4 ? 62 : 84} />
            <div style={{ fontFamily: TYPE, fontSize: 15, color: '#d8cfb8' }}>{armed ? t('modsSolved', { n: view.mods.filter((m: any) => m.solved && m.kind !== 'druck' && m.kind !== 'frage').length, total: view.mods.filter((m: any) => m.kind !== 'druck' && m.kind !== 'frage').length }) : t('getReady')}</div>
          </div>
          {view.mods.map((m: any) => (
            armed
              ? <Module key={m.i} m={m} t={t} lang={lang} player={player} compact foot={<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{m.kind === 'stimme' ? <span style={{ fontFamily: TYPE, fontSize: 13, color: '#d8cfb8' }}>{t('everyone')}</span> : m.ops.map((id: string) => <Name key={id} p={player(id)} size={14} />)}</div>} />
              : (
                <div key={m.i} style={{ background: PANEL, border: `3px solid ${BRASS}`, borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 19, letterSpacing: 2, textTransform: 'uppercase' }}>{kindTitle(lang, m.kind)}</span>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{m.kind === 'stimme' ? <span style={{ fontFamily: TYPE, fontSize: 14 }}>{t('everyone')}</span> : m.ops.map((id: string) => <Name key={id} p={player(id)} size={16} />)}</div>
                </div>
              )
          ))}
        </div>
      </div>
    </>
  );
}

function HostEnd({ view, t }: { view: any; t: (k: string, v?: any) => string }) {
  const last = view.results.at(-1);
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, background: view.defused ? undefined : 'radial-gradient(circle at 50% 50%, #ff8a3c 0%, #b3261e 30%, #1b1712 70%)', margin: '-28px -48px -92px', padding: '28px 48px 92px' }}>
      <div style={{ fontSize: 150, fontWeight: 700, letterSpacing: 8, color: view.defused ? GREEN : PAPER, animation: 'ttb-pop .5s', textShadow: view.defused ? `0 0 30px ${GREEN}` : '0 8px 0 #000' }}>{view.defused ? t('end.defused') : t('end.boom')}</div>
      <div style={{ fontFamily: TYPE, fontSize: 28 }}>{view.defused ? t('end.left', { time: clockText(last?.left ?? 0) }) : t('end.lost')}</div>
    </div>
  );
}

function HostFinal({ view, t, player }: { view: any; t: (k: string, v?: any) => string; player: (id: string) => PlayerInfo | undefined }) {
  const won = view.results.filter((x: any) => x.defused).length;
  const a = view.awards ?? {};
  return (
    <>
      <TvHeader view={view} t={t} />
      <div style={{ flex: 1, display: 'flex', gap: 40, alignItems: 'center' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ fontSize: 60, fontWeight: 700 }}>{t('final.title', { n: won, total: view.results.length })}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {view.results.map((x: any, i: number) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, background: CARD, borderRadius: 10, padding: '12px 18px', fontSize: 24, animation: `ttb-pop .4s ${i * 0.15}s both` }}>
                <Lamp on={x.defused} color={x.defused ? GREEN : RED} size={22} />
                <span style={{ flex: 1 }}>{t('bombOf', { n: i + 1, total: view.results.length })} · {t('stage', { n: x.stage })}</span>
                <span style={{ fontFamily: DIGI, color: x.defused ? '#8fd9a0' : '#ffb3a8' }}>{x.defused ? clockText(x.left) : t('end.boom')}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ width: 380, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {a.solved && <Award title={t('award.solved')} p={player(a.solved.pid)} text={t('award.solvedN', { n: a.solved.n })} />}
          {a.strikes && <Award title={t('award.strikes')} p={player(a.strikes.pid)} text={t('award.strikesN', { n: a.strikes.n })} />}
        </div>
      </div>
    </>
  );
}

function Award({ title, p, text }: { title: string; p?: PlayerInfo; text: string }) {
  return (
    <div style={{ background: PAPER, color: INK, borderRadius: 4, padding: 18, display: 'flex', flexDirection: 'column', gap: 10, transform: 'rotate(-1.5deg)', boxShadow: '0 10px 24px rgba(0,0,0,0.5)' }}>
      <div style={{ fontFamily: HEAD, fontSize: 16, letterSpacing: 3, color: STAMP }}>{title.toUpperCase()}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>{p && <Avatar player={p} size={52} />}<span style={{ fontFamily: HEAD, fontSize: 30, fontWeight: 600 }}>{p?.name}</span></div>
      <div style={{ fontFamily: TYPE, fontSize: 16 }}>{text}</div>
    </div>
  );
}

/* ---------- Handy ---------- */

function PhoneFrame({ children }: { children: ReactNode }) {
  useFonts();
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, background: BG, color: PAPER, fontFamily: HEAD, margin: '-18px -18px -22px', padding: '16px 12px 22px', minHeight: '100dvh', boxSizing: 'border-box' }}>
      <style>{KEYFRAMES}</style>
      {children}
    </div>
  );
}

function PhoneTop({ view, label, title }: { view: any; label: string; title: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, paddingLeft: 38 }}>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ fontSize: 12, letterSpacing: 3, color: MUTED }}>{label.toUpperCase()}</div>
        <div style={{ fontSize: 21, fontWeight: 600, color: BRASS }}>{title}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
        <Timer clock={view.clock} running={view.screen === 'armed'} size={30} />
        <Strikes n={view.strikes} max={view.maxStrikes} size={14} />
      </div>
    </div>
  );
}

function PhoneMsg({ title, text, color = BRASS }: { title: string; text?: string; color?: string }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, textAlign: 'center', padding: 20 }}>
      <div style={{ fontSize: 34, fontWeight: 700, color, animation: 'ttb-pop .5s' }}>{title}</div>
      {text && <div style={{ fontFamily: TYPE, fontSize: 17, lineHeight: 1.45, color: '#d8cfb8' }}>{text}</div>}
    </div>
  );
}

function Controller({ view, t, send, me, player, room }: ControllerViewProps) {
  const lang = (room.lang === 'en' ? 'en' : 'de') as Lang;
  useOnChange(view.flash?.strikeAt ?? 0, () => vibrate(250));
  const endKey = view.screen === 'end' ? view.key : 0;
  useOnChange(endKey, () => vibrate(view.defused ? [60, 60, 60] : [700]));
  const act = (i: number) => (a: any) => send({ type: 'act', key: view.key, i, a });

  if (view.screen === 'audience') return <PhoneFrame><PhoneMsg title="TICK TACK BOOM" text={t('audience')} /></PhoneFrame>;
  if (view.screen === 'intro') return <PhoneFrame><PhoneMsg title="TICK TACK BOOM" text={view.mode === 'b' ? t('intro.b') : t('intro.a')} /></PhoneFrame>;
  if (view.screen === 'end') return <PhoneFrame><PhoneMsg title={view.defused ? t('end.defused') : t('end.boom')} color={view.defused ? GREEN : RED} text={t('nextBomb')} /></PhoneFrame>;
  if (view.screen === 'final') return <PhoneFrame><PhoneMsg title={t('final.short', { n: view.defused, total: view.bombs })} text={t('lookAtTv')} /></PhoneFrame>;

  const armed = view.screen === 'armed';
  const mp = { t, lang, player, me: me.id };
  const extras = (view.mods ?? []).filter((m: any) => m.kind === 'doppel' || m.kind === 'stimme');

  if (view.role === 'defuser') {
    return (
      <PhoneFrame>
        <PhoneTop view={view} label={t('youDefuse')} title={t('describe')} />
        {!armed ? <PhoneMsg title={t('getReady')} text={t('roles.defuser')} /> : <DefuserBomb view={view} mp={mp} act={act} />}
      </PhoneFrame>
    );
  }
  if (view.role === 'reader') {
    return (
      <PhoneFrame>
        <PhoneTop view={view} label={t('yourManual')} title={t('tellDefuser', { name: player(view.defuser)?.name ?? '' })} />
        {armed && extras.filter((m: any) => !m.solved).map((m: any) => <Module key={m.i} {...mp} m={m} send={act(m.i)} highlight />)}
        <Manual chapters={view.chapters} t={t} />
      </PhoneFrame>
    );
  }
  return (
    <PhoneFrame>
      <CrewPhone view={view} mp={mp} act={act} />
    </PhoneFrame>
  );
}

function DefuserBomb({ view, mp, act }: { view: any; mp: any; act: (i: number) => (a: any) => void }) {
  const { t } = mp;
  const mods = view.mods as any[];
  const [sel, setSel] = useState<number | null>(null);
  const [showCase, setShowCase] = useState(false);
  const firstOpen = mods.find((m) => !m.solved && m.kind !== 'druck' && m.kind !== 'frage')?.i ?? mods[0]?.i;
  const cur = mods.find((m) => m.i === sel && !(m.solved && m.kind !== 'druck' && m.kind !== 'frage')) ?? mods.find((m) => m.i === firstOpen);
  const urgent = (m: any) => (m.kind === 'frage' && m.q) || (m.kind === 'druck') || (m.kind === 'doppel' && !m.solved) ;
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(4, mods.length)}, minmax(0, 1fr))`, gap: 6 }}>
        {mods.map((m) => (
          <button key={m.i} type="button" onClick={() => setSel(m.i)} style={{ ...btnBase, height: 50, padding: '2px 4px', fontSize: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, background: cur?.i === m.i ? PANEL : CARD, color: cur?.i === m.i ? PAPER : MUTED, borderColor: cur?.i === m.i ? '#ffd34d' : (m.kind === 'frage' && m.q) ? RED : '#4a4339' }}>
            {m.kind === 'druck' || m.kind === 'frage' ? <span style={{ color: '#ff8a5c', fontFamily: DIGI, lineHeight: 1 }}>∞</span> : <Lamp on={m.solved} size={10} />}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{kindTitle(mp.lang, m.kind)}</span>
          </button>
        ))}
      </div>
      {mods.filter((m) => urgent(m) && m.i !== cur?.i && (m.kind !== 'druck')).map((m) => (
        <Module key={`u${m.i}`} {...mp} m={m} send={act(m.i)} highlight />
      ))}
      {mods.filter((m) => m.kind === 'druck' && m.i !== cur?.i).map((m) => <Module key={`d${m.i}`} {...mp} m={m} send={act(m.i)} compact />)}
      <div style={{ background: WOOD, borderRadius: 14, padding: 10, flex: 1, display: 'flex' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {cur && <Module {...mp} m={cur} send={act(cur.i)} />}
        </div>
      </div>
      <button type="button" onClick={() => setShowCase((x) => !x)} style={{ ...btnBase, padding: 12, fontSize: 17, letterSpacing: 2, background: CARD }}>{showCase ? t('case.hide') : t('case.show')}</button>
      {showCase && <div style={{ background: CARD, borderRadius: 10, padding: 12 }}><CaseStrip c={view.case} t={t} size={16} /></div>}
    </>
  );
}

function CrewPhone({ view, mp, act }: { view: any; mp: any; act: (i: number) => (a: any) => void }) {
  const { t, player } = mp;
  const [tab, setTab] = useState<'mods' | 'manual'>('mods');
  const armed = view.screen === 'armed';
  const mods = (view.mods as any[]);
  const open = mods.filter((m) => !m.solved || m.kind === 'druck' || m.kind === 'frage');
  const title = mods.length ? mods.map((m) => kindTitle(mp.lang, m.kind)).join(' · ') : t('noModule');
  return (
    <>
      <PhoneTop view={view} label={t('youOperate')} title={title} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
        <button type="button" onClick={() => setTab('mods')} style={{ ...btnBase, padding: 10, fontSize: 16, background: tab === 'mods' ? PANEL : CARD, color: tab === 'mods' ? PAPER : MUTED }}>{t('tab.mods')}{open.length ? ` (${open.length})` : ''}</button>
        <button type="button" onClick={() => setTab('manual')} style={{ ...btnBase, padding: 10, fontSize: 16, background: tab === 'manual' ? PANEL : CARD, color: tab === 'manual' ? PAPER : MUTED }}>{t('tab.manual')}</button>
      </div>
      {tab === 'mods' && (
        !armed ? <PhoneMsg title={t('getReady')} text={t('roles.crew')} />
          : open.length === 0 ? <PhoneMsg title={t('allDone')} text={t('helpOthers')} />
          : open.map((m) => (
            <div key={m.i} style={{ background: WOOD, borderRadius: 14, padding: 10 }}>
              <Module {...mp} m={m} send={act(m.i)} />
              {m.kind !== 'stimme' && m.ops.length > 1 && <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>{m.ops.map((id: string) => <Name key={id} p={player(id)} size={13} />)}</div>}
            </div>
          ))
      )}
      {tab === 'manual' && <Manual chapters={view.chapters} t={t} />}
    </>
  );
}

export default { Host, Controller } satisfies GameClientModule;
