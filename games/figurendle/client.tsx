/** Figurendle – Ansichten für TV und Handy im Look einer Piraten-Seekarte (Pergament, Steckbriefe). */

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { ControllerViewProps, GameClientModule, HostViewProps, PlayerInfo } from '@up/sdk';
import { Avatar, Confetti, Podium, Scoreboard, sfx, vibrate } from '@up/ui';

/* ================= Look ================= */

const INK = '#2b1d0e';
const MUTED = '#5a4320';
const RUST = '#6e2a12';
const CARD = '#f6ecd2';
const EDGE = '#8a6a3a';
const POSTER = '#e9d29f';
const C = { g: '#3e7b3a', o: '#e0962e', r: '#9e3426' } as const;
const FG = { g: '#ffffff', o: INK, r: '#ffffff' } as const;
const FONT = "'Alegreya Sans', system-ui, sans-serif";
const DISPLAY = "'Pirata One', Georgia, serif";
const PAPER = `radial-gradient(ellipse at 50% 40%, rgba(255,248,225,.7), rgba(150,110,60,.25) 100%), repeating-linear-gradient(0deg, rgba(90,60,25,.09) 0 1px, transparent 1px 80px), repeating-linear-gradient(90deg, rgba(90,60,25,.09) 0 1px, transparent 1px 80px), #ecdcb6`;
const PAPER_PHONE = `repeating-linear-gradient(0deg, rgba(90,60,25,.08) 0 1px, transparent 1px 48px), repeating-linear-gradient(90deg, rgba(90,60,25,.08) 0 1px, transparent 1px 48px), #ecdcb6`;
const ARROW = { u: '↑', d: '↓' } as const;
/** Hinweisfelder einer neuen Zeile ploppen nacheinander von links nach rechts auf */
const STEP = 0.28;
const KEYFRAMES = '@keyframes fdPop { 0% { transform: scale(.2) rotateX(85deg); opacity: 0 } 65% { transform: scale(1.12); opacity: 1 } 100% { transform: none; opacity: 1 } }';
const pop = (k: number, on: boolean): CSSProperties => (on ? { animation: `fdPop .38s ease-out ${(k * STEP).toFixed(2)}s both` } : {});

type Color = 'g' | 'o' | 'r';
interface Cell { t: string; c: Color; a?: 'u' | 'd' }
interface FigEntry { id: string; n: string; a: string[]; s: string; img: string | null }

function useFonts() {
  useEffect(() => {
    if (document.getElementById('figurendle-fonts')) return;
    const l = document.createElement('link');
    l.id = 'figurendle-fonts';
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Pirata+One&family=Alegreya+Sans:wght@400;500;700;800&display=swap';
    document.head.appendChild(l);
  }, []);
}

function Compass() {
  return (
    <svg aria-hidden="true" width={300} height={300} viewBox="0 0 100 100" style={{ position: 'absolute', right: -60, bottom: -70, opacity: 0.12, pointerEvents: 'none' }}>
      <circle cx={50} cy={50} r={46} fill="none" stroke={INK} strokeWidth={1.2} />
      <circle cx={50} cy={50} r={36} fill="none" stroke={INK} strokeWidth={0.6} />
      <path d="M50 2 L56 50 L50 98 L44 50 Z" fill={INK} />
      <path d="M2 50 L50 44 L98 50 L50 56 Z" fill={INK} />
    </svg>
  );
}

function Frame({ children, pad = '28px 40px 24px', gap = 18 }: { children: ReactNode; pad?: string; gap?: number }) {
  useFonts();
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: PAPER, color: INK, fontFamily: FONT, display: 'flex', flexDirection: 'column', padding: pad, gap }}>
      <Compass />
      <style>{KEYFRAMES}</style>
      {children}
    </div>
  );
}

function Title({ size = 64 }: { size?: number }) {
  return <span style={{ fontFamily: DISPLAY, fontSize: size, lineHeight: 1, color: RUST, letterSpacing: 1 }}>Figurendle</span>;
}

function Chip({ children, dark }: { children: ReactNode; dark?: boolean }) {
  return (
    <span style={{ padding: '7px 16px', borderRadius: 999, fontSize: 18, fontWeight: 800, whiteSpace: 'nowrap', ...(dark ? { background: INK, color: '#f3e6c4' } : { border: `2px solid ${RUST}`, color: RUST, textTransform: 'uppercase', letterSpacing: 1 }) }}>{children}</span>
  );
}

function Header({ view, t }: { view: any; t: HostViewProps['t'] }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flex: 'none', paddingLeft: 36 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 18 }}>
        <Title />
        <span style={{ fontSize: 22, fontWeight: 700, color: MUTED }}>{t('round', { n: view.round, total: view.total })}{view.mult > 1 ? ` · ${t('double')}` : ''}</span>
      </div>
      <Chip>{t(`mode.${view.mode}`)}</Chip>
    </div>
  );
}

function Legend({ t, size = 18 }: { t: HostViewProps['t']; size?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: size, fontWeight: 700 }}>
      {(['g', 'o', 'r'] as const).map((k) => (
        <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: size, height: size, borderRadius: 3, background: C[k] }} />{t(`legend.${k}`)}
        </span>
      ))}
    </div>
  );
}

function Panel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ background: CARD, border: `2px solid ${EDGE}`, borderRadius: 6, boxShadow: '0 6px 14px rgba(70,45,15,.25)', ...style }}>{children}</div>;
}

function Stamp({ children, color = C.g, size = 34, style }: { children: ReactNode; color?: string; size?: number; style?: CSSProperties }) {
  return (
    <span className="anim-pop" style={{ border: `4px solid ${color}`, color, background: 'rgba(246,236,210,.88)', fontFamily: DISPLAY, fontSize: size, lineHeight: 1.1, padding: '2px 14px', borderRadius: 6, whiteSpace: 'nowrap', transform: 'rotate(-12deg)', display: 'inline-block', ...style }}>{children}</span>
  );
}

/* ================= TV ================= */

function HostIntro({ view, t }: HostViewProps) {
  const lines = view.mode === 'brett' ? ['intro.brett1', 'intro.brett2'] : ['intro.solo1'];
  return (
    <Frame pad="48px 72px" gap={22}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <Title size={110} />
        <Chip dark>{t('pack', { name: view.theme })}</Chip>
      </div>
      <Chip>{t(`mode.${view.mode}`)}</Chip>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
        {lines.map((k, i) => <span key={k} className="anim-up" style={{ fontSize: 34, fontWeight: 800, animationDelay: `${0.3 + i * 0.4}s`, animationFillMode: 'both' }}>{t(k)}</span>)}
      </div>
      <Panel style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 12, marginTop: 'auto' }}>
        <div style={{ display: 'flex', gap: 10 }}>
          {[['Nami', 'r'], ['East Blue', 'g'], ['Paramecia', 'o'], ['366 Mio. ↑', 'r']].map(([txt, c]) => (
            <span key={txt} style={{ background: C[c as Color], color: FG[c as Color], padding: '10px 16px', borderRadius: 5, fontWeight: 800, fontSize: 20 }}>{txt}</span>
          ))}
        </div>
        <span style={{ fontSize: 22, fontWeight: 700 }}>{t('intro.colors')}</span>
        <span style={{ fontSize: 20, color: MUTED, fontWeight: 700 }}>{t(view.mode === 'brett' ? 'intro.points.brett' : 'intro.points.solo')}</span>
        <span style={{ fontSize: 20, color: MUTED }}>{t('intro.unlimited')}</span>
      </Panel>
    </Frame>
  );
}

function HostSolo({ view, t, player }: HostViewProps) {
  const players = view.players as { id: string; rows: string[]; n: number; place: number; gaveUp: boolean }[];
  const guesses = players.reduce((s, p) => s + p.n, 0);
  const prev = useRef({ guesses, solved: view.solved as number });
  useEffect(() => {
    if (view.solved > prev.current.solved) sfx.play('ding');
    else if (guesses > prev.current.guesses) sfx.play('pop');
    prev.current = { guesses, solved: view.solved };
  }, [guesses, view.solved]);
  const cols = Math.min(6, Math.max(3, players.length));
  const twoRows = players.length > 6;
  const maxRows = twoRows ? 6 : 14;
  return (
    <Frame>
      <Header view={view} t={t} />
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridAutoRows: twoRows ? 'minmax(0, 1fr)' : undefined, gap: 14 }}>
        {players.map((p) => {
          const info = player(p.id);
          const shown = p.rows.slice(-maxRows);
          const hidden = p.rows.length - shown.length;
          const status = p.place ? t('solo.solvedAfter', { n: p.n }) : p.gaveUp ? t('solo.gaveUp') : p.n === 1 ? t('solo.try1') : t('solo.tries', { n: p.n });
          return (
            <Panel key={p.id} style={{ position: 'relative', padding: '12px 11px', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0, overflow: 'hidden', opacity: p.gaveUp ? 0.7 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                {info && <Avatar player={info} size={twoRows ? 34 : 42} flat />}
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={{ fontSize: twoRows ? 17 : 20, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{info?.name ?? '?'}</span>
                  <span style={{ fontSize: 14, color: MUTED, fontWeight: 600 }}>{status}</span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {hidden > 0 && <span style={{ fontSize: 13, color: MUTED, fontWeight: 700, textAlign: 'center' }}>{t('solo.more', { n: hidden })}</span>}
                {shown.map((row, i) => (
                  <div key={hidden + i} style={{ display: 'grid', gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))`, gap: 3 }}>
                    {row.split('').map((c, k) => <span key={k} style={{ height: twoRows ? 13 : 18, borderRadius: 3, background: C[c as Color], boxShadow: 'inset 0 -2px 0 rgba(0,0,0,.18)', ...pop(k, i === shown.length - 1) }} />)}
                  </div>
                ))}
              </div>
              {p.place > 0 && <div style={{ position: 'absolute', left: 0, right: 0, top: '48%', display: 'flex', justifyContent: 'center' }}><Stamp size={twoRows ? 26 : 34}>{t('solo.place', { n: p.place })}</Stamp></div>}
              {p.gaveUp && <div style={{ position: 'absolute', left: 0, right: 0, top: '48%', display: 'flex', justifyContent: 'center' }}><Stamp color={C.r} size={twoRows ? 22 : 28}>{t('solo.gaveUp')}</Stamp></div>}
            </Panel>
          );
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flex: 'none', padding: '0 70px 0 96px' }}>
        <Legend t={t} />
        <span style={{ fontSize: 20, fontWeight: 700, color: MUTED }}>{t('solo.footer', { solved: view.solved, total: players.length })}</span>
      </div>
    </Frame>
  );
}

function CellBox({ cell, h = 50, size = 14, anim }: { cell: Cell; h?: number; size?: number; anim?: CSSProperties }) {
  return (
    <div style={{ ...anim, background: C[cell.c], color: FG[cell.c], borderRadius: 4, minHeight: h, padding: 4, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontSize: size, fontWeight: 700, lineHeight: 1.1, boxShadow: 'inset 0 -3px 0 rgba(0,0,0,.18)', overflow: 'hidden', overflowWrap: 'break-word', hyphens: 'auto' }}>
      {cell.t.includes(', ')
        ? <span style={{ fontSize: size - 3, whiteSpace: 'pre-line' }}>{cell.t.split(', ').join('\n')}</span>
        : <span style={{ fontSize: cell.t.length > 18 ? size - 2 : size }}>{cell.t}</span>}
      {cell.a && <span style={{ fontSize: size + 3 }}>{ARROW[cell.a]}</span>}
    </div>
  );
}

function HostBrett({ view, t, player }: HostViewProps) {
  const board = view.board as { name: string; by: string; cells: Cell[]; gain: number; img?: string | null }[];
  const cols = (view.short ?? view.cols) as string[];
  const len = view.misses as number;
  const prev = useRef(len);
  useEffect(() => {
    if (len <= prev.current) { prev.current = len; return; }
    prev.current = len;
    const timers = cols.map((_, k) => setTimeout(() => sfx.play('pop'), (k + 1) * STEP * 1000));
    if (board[0]?.gain) timers.push(setTimeout(() => sfx.play('ding'), (cols.length + 1) * STEP * 1000));
    return () => timers.forEach(clearTimeout);
  }, [len]);
  const grid = `250px repeat(${cols.length}, minmax(0, 1fr))`;
  const left = Math.max(0, view.letterAfter - len);
  return (
    <Frame gap={14}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flex: 'none', paddingLeft: 36 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 18 }}>
          <Title />
          <span style={{ fontSize: 22, fontWeight: 700, color: MUTED }}>{t('round', { n: view.round, total: view.total })}{view.mult > 1 ? ` · ${t('double')}` : ''}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {view.letter
            ? <span className="anim-pop" style={{ background: INK, color: '#f3e6c4', borderRadius: 999, padding: '6px 18px', fontSize: 22, fontWeight: 800 }}>{t('brett.letter')}: <span style={{ fontFamily: DISPLAY, fontSize: 30 }}>{view.letter}</span></span>
            : <span style={{ fontSize: 20, fontWeight: 700, color: MUTED }}>{t('brett.letter')}: {t('brett.letterIn', { n: left })}</span>}
          <Chip>{t(`mode.${view.mode}`)}</Chip>
        </div>
      </div>
      <Panel style={{ flex: 1, minHeight: 0, padding: 14, display: 'flex', flexDirection: 'column', gap: 7, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: grid, gap: 7, fontSize: 18, fontWeight: 800, color: MUTED, textAlign: 'center' }}>
          <span style={{ textAlign: 'left' }}>{t('brett.figure')}</span>
          {cols.map((c) => <span key={c} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c}</span>)}
        </div>
        {board.length === 0 && <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: DISPLAY, fontSize: 48, color: MUTED }}>{t('brett.empty')}</div>}
        {board.slice(0, 6).map((b, i) => {
          const p = player(b.by);
          return (
            <div key={len - i} className={i === 0 ? 'anim-up' : undefined} style={{ display: 'grid', gridTemplateColumns: grid, gap: 7 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                {b.img
                  ? <img src={b.img} alt="" referrerPolicy="no-referrer" style={{ width: 58, height: 70, objectFit: 'cover', objectPosition: 'top', borderRadius: 4, border: `2px solid ${EDGE}`, flex: 'none', background: '#d8bf86' }} />
                  : p && <Avatar player={p} size={46} flat />}
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, lineHeight: 1.12 }}>
                  <span style={{ fontSize: 22, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{b.name}</span>
                  <span style={{ fontSize: 16, color: MUTED, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t('by', { name: p?.name ?? '?' })}{b.gain ? ` · +${b.gain}` : ''}</span>
                </div>
              </div>
              {b.cells.map((c, k) => <CellBox key={k} cell={c} h={74} size={18} anim={pop(k + 1, i === 0)} />)}
            </div>
          );
        })}
      </Panel>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flex: 'none', padding: '0 70px 0 96px' }}>
        <Legend t={t} />
        <span style={{ fontSize: 18, fontWeight: 700, color: MUTED }}>{t('brett.rule')}</span>
      </div>
    </Frame>
  );
}

function Poster({ secret, t }: { secret: { name: string; img: string | null; facts: { label: string; text: string }[] }; t: HostViewProps['t'] }) {
  const bounty = secret.facts.find((f) => /kopfgeld|bounty/i.test(f.label));
  return (
    <div className="anim-pop" style={{ width: 390, flex: 'none', background: POSTER, border: `3px solid #6b4a1e`, boxShadow: '0 10px 24px rgba(70,45,15,.35)', transform: 'rotate(-1.5deg)', padding: '18px 22px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, alignSelf: 'flex-start' }}>
      <span style={{ fontFamily: DISPLAY, fontSize: 72, lineHeight: 0.9, letterSpacing: 2 }}>{t('reveal.wanted')}</span>
      <div style={{ width: 320, height: 290, border: `3px solid ${INK}`, background: '#d8bf86', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {secret.img
          ? <img referrerPolicy="no-referrer" src={secret.img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', filter: 'sepia(.25)' }} />
          : <span style={{ fontFamily: DISPLAY, fontSize: 120, color: '#a88a52' }}>{secret.name.charAt(0)}</span>}
      </div>
      <span style={{ fontFamily: DISPLAY, fontSize: 20, letterSpacing: 3 }}>{t('reveal.deadOrAlive')}</span>
      <span style={{ fontFamily: DISPLAY, fontSize: secret.name.length > 18 ? 34 : 44, lineHeight: 1, color: RUST, textAlign: 'center' }}>{secret.name}</span>
      {bounty && /\d/.test(bounty.text) && <span style={{ fontSize: 28, fontWeight: 800, letterSpacing: 1 }}>฿ {bounty.text}</span>}
    </div>
  );
}

const SHADES = ['#efe2c0', '#e6d3a6', '#d9c088', '#c9a86a', '#b38f52', '#9a7740', '#80612f', '#6b4f24'];

function HostReveal({ view, t, player }: HostViewProps) {
  useEffect(() => {
    sfx.play('reveal');
    const tm = setTimeout(() => sfx.play('fanfare'), 900);
    return () => clearTimeout(tm);
  }, []);
  const secret = view.secret;
  return (
    <Frame pad="30px 40px" gap={0}>
      <div style={{ display: 'flex', gap: 34, flex: 1, minHeight: 0 }}>
        <Poster secret={secret} t={t} />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontFamily: DISPLAY, fontSize: 50, lineHeight: 1, color: RUST }}>{view.mode === 'solo' ? t('reveal.paths') : view.winner ? t('reveal.brettWinner', { name: player(view.winner)?.name ?? '?' }) : t('reveal.brettNobody')}</span>
            <span style={{ fontSize: 20, fontWeight: 700, color: MUTED, whiteSpace: 'nowrap' }}>{t('round', { n: view.round, total: view.total })}</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {secret.facts.map((f: { label: string; text: string }) => (
              <span key={f.label} style={{ padding: '5px 11px', background: C.g, color: '#fff', borderRadius: 4, fontWeight: 700, fontSize: 16 }}><span style={{ fontWeight: 500, opacity: 0.85 }}>{f.label}:</span> {f.text}</span>
            ))}
          </div>
          {view.mode === 'solo' ? <SoloPaths view={view} t={t} player={player} /> : <BrettGains view={view} t={t} player={player} />}
        </div>
      </div>
    </Frame>
  );
}

function SoloPaths({ view, t, player }: { view: any; t: HostViewProps['t']; player: (id: string) => PlayerInfo | undefined }) {
  const paths = view.paths as { id: string; place: number; points: number; gaveUp: boolean; steps: { name: string; greens: number; hit: boolean }[]; hidden: number }[];
  const n = view.cols as number;
  const small = paths.length > 7;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: small ? 5 : 9, minHeight: 0 }}>
      {paths.map((p) => {
        const info = player(p.id);
        return (
          <Panel key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: small ? '4px 10px' : '7px 12px' }}>
            {info && <Avatar player={info} size={small ? 28 : 36} flat />}
            <span style={{ width: 86, fontSize: small ? 16 : 19, fontWeight: 800, flex: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{info?.name ?? '?'}</span>
            <div style={{ display: 'flex', gap: 5, flex: 1, minWidth: 0, overflow: 'hidden' }}>
              {p.hidden > 0 && <span style={{ padding: '3px 8px', fontSize: 13, fontWeight: 700, color: MUTED }}>{t('reveal.hidden', { n: p.hidden })}</span>}
              {p.steps.map((s, i) => {
                const k = Math.round((s.greens / Math.max(1, n)) * 7);
                const bg = s.hit ? C.g : SHADES[Math.min(7, k)];
                const fg = s.hit || k >= 4 ? '#fff' : INK;
                return <span key={i} className="anim-pop" style={{ padding: small ? '2px 8px' : '4px 9px', borderRadius: 999, background: bg, color: fg, fontSize: small ? 12 : 14, fontWeight: 700, whiteSpace: 'nowrap', animationDelay: `${0.6 + i * view.stepDelay}s`, animationFillMode: 'both' }}>{s.name}</span>;
              })}
              {!p.place && <span className="anim-fade" style={{ fontSize: 13, color: C.r, fontWeight: 800, alignSelf: 'center', whiteSpace: 'nowrap', animationDelay: `${0.6 + p.steps.length * view.stepDelay}s`, animationFillMode: 'both' }}>{p.gaveUp ? t('reveal.gaveUp') : t('reveal.notFound')}</span>}
            </div>
            <span style={{ width: 80, textAlign: 'right', fontSize: small ? 17 : 20, fontWeight: 800, color: p.points ? C.g : '#7a6440', flex: 'none' }}>{p.points ? `+${p.points}` : '0'}</span>
          </Panel>
        );
      })}
    </div>
  );
}

function BrettGains({ view, t, player }: { view: any; t: HostViewProps['t']; player: (id: string) => PlayerInfo | undefined }) {
  const gains = view.gains as { id: string; g: number }[];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span style={{ fontSize: 20, fontWeight: 700, color: MUTED }}>{view.tries === 1 ? t('reveal.brettTry1') : t('reveal.brettTries', { n: view.tries })}</span>
      {gains.map((g, i) => {
        const p = player(g.id);
        return (
          <Panel key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px' }}>
            {p && <Avatar player={p} size={40} flat />}
            <span style={{ flex: 1, fontSize: 22, fontWeight: 800 }} className="anim-up">{p?.name ?? '?'}</span>
            {g.id === view.winner && <Stamp size={24} style={{ transform: 'rotate(-6deg)', marginRight: 10 }}>{t('phone.found')}</Stamp>}
            <span className="anim-pop" style={{ width: 90, textAlign: 'right', flex: 'none', fontSize: 24, fontWeight: 800, color: C.g, animationDelay: `${0.3 + i * 0.2}s`, animationFillMode: 'both' }}>+{g.g}</span>
          </Panel>
        );
      })}
    </div>
  );
}

function HostScores({ view, t, player }: HostViewProps) {
  const final = view.screen === 'final';
  const rows = Object.keys(view.after ?? {}).map((id) => ({ player: player(id)!, before: view.before?.[id] ?? 0, after: view.after[id] })).filter((r) => r.player);
  return (
    <Frame>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 18, paddingLeft: 36 }}>
        <Title />
        <span style={{ fontFamily: DISPLAY, fontSize: 40, color: INK }}>{t(final ? 'final.title' : 'scores.title')}</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, background: 'linear-gradient(#3a2716, #22160b)', border: `4px solid #6b4a1e`, borderRadius: 10, padding: '22px 32px', display: 'flex', flexDirection: 'column', boxShadow: 'inset 0 0 40px rgba(0,0,0,.5)' }}>
        {final ? <Podium ranking={view.ranking} player={player} pointsLabel={t('common.points')} /> : <Scoreboard rows={rows} />}
      </div>
    </Frame>
  );
}

function Host(props: HostViewProps) {
  useFonts();
  const { view, t } = props;
  switch (view.screen) {
    case 'intro': return <HostIntro {...props} />;
    case 'guess': return view.mode === 'brett' ? <HostBrett {...props} /> : <HostSolo {...props} />;
    case 'reveal': return <HostReveal {...props} />;
    case 'scores':
    case 'final': return <HostScores {...props} />;
    case 'empty':
      return <Frame><Title /><span style={{ fontSize: 30, fontWeight: 700, marginTop: 40 }}>{t('empty')}</span></Frame>;
    default: return <Frame><Title /></Frame>;
  }
}

/* ================= Handy ================= */

function Phone({ children, gap = 12 }: { children: ReactNode; gap?: number }) {
  useFonts();
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap, fontFamily: FONT, color: INK, background: PAPER_PHONE, margin: '-18px -18px -22px', padding: '18px 16px 22px', minHeight: '100dvh', boxSizing: 'border-box' }}>
      <style>{KEYFRAMES}</style>
      {children}
    </div>
  );
}

function PhoneTop({ right }: { right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingLeft: 40 }}>
      <Title size={32} />
      <span style={{ fontSize: 15, fontWeight: 700, color: MUTED, textAlign: 'right' }}>{right}</span>
    </div>
  );
}

function PhoneMsg({ title, text, children }: { title: string; text?: string; children?: ReactNode }) {
  return (
    <div className="anim-fade" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, textAlign: 'center', padding: '20px 8px' }}>
      <span style={{ fontFamily: DISPLAY, fontSize: 44, lineHeight: 1.05, color: RUST }}>{title}</span>
      {text && <span style={{ fontSize: 19, fontWeight: 600, color: MUTED }}>{text}</span>}
      {children}
    </div>
  );
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ');

function matches(f: FigEntry, q: string) {
  for (const name of [f.n, ...f.a]) {
    const n = norm(name);
    if (n.startsWith(q) || n.split(/\s+/).some((w) => w.startsWith(q)) || (q.length >= 3 && n.replace(/\s+/g, '').includes(q.replace(/\s+/g, '')))) return true;
  }
  return false;
}

function Search({ figs, tried, disabled, onPick, t, label }: { figs: FigEntry[]; tried: string[]; disabled?: ReactNode; onPick: (id: string) => void; t: ControllerViewProps['t']; label: string }) {
  const [q, setQ] = useState('');
  const done = useMemo(() => new Set(tried), [tried]);
  const query = norm(q).trim();
  const list = query ? figs.filter((f) => matches(f, query)).sort((a, b) => Number(done.has(a.id)) - Number(done.has(b.id))).slice(0, 6) : [];
  return (
    <div>
      <label htmlFor="fd-tipp" style={{ display: 'block', fontSize: 14, fontWeight: 800, color: MUTED, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input id="fd-tipp" value={q} autoComplete="off" autoCorrect="off" spellCheck={false} placeholder={t('phone.placeholder')} onChange={(e) => setQ(e.target.value.slice(0, 40))}
          style={{ flex: 1, minWidth: 0, height: 52, boxSizing: 'border-box', border: '2px solid #6b4a1e', borderRadius: 8, background: '#fffaf0', padding: '0 14px', fontFamily: FONT, fontSize: 20, fontWeight: 700, color: INK }} />
        {disabled}
      </div>
      {query && (
        <div style={{ marginTop: 6, background: '#fffaf0', border: '2px solid #6b4a1e', borderRadius: 8, overflow: 'hidden', boxShadow: '0 8px 18px rgba(70,45,15,.25)' }}>
          {list.length === 0 && <div style={{ padding: '12px 14px', fontSize: 16, color: MUTED }}>{t('phone.noMatch')}</div>}
          {list.map((f) => {
            const off = done.has(f.id) || !!disabled;
            return (
              <button key={f.id} type="button" disabled={off} onClick={() => { onPick(f.id); setQ(''); }}
                style={{ width: '100%', minHeight: 52, display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px', border: 0, borderBottom: '1px solid #e3d3ad', background: 'transparent', fontFamily: FONT, textAlign: 'left', cursor: off ? 'default' : 'pointer', opacity: done.has(f.id) ? 0.45 : 1 }}>
                <span style={{ width: 38, height: 38, borderRadius: 6, background: '#d8bf86', color: MUTED, fontWeight: 800, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', overflow: 'hidden' }}>
                  {f.img ? <img referrerPolicy="no-referrer" src={f.img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} /> : f.n.charAt(0)}
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15, minWidth: 0 }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: INK }}>{f.n}</span>
                  <span style={{ fontSize: 13, color: MUTED }}>{done.has(f.id) ? t('phone.already') : f.s}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Knopf mit Rückfrage (Aufgeben, Auflösen) */
function ConfirmButton({ label, question, yes, no, onYes, color = RUST }: { label: string; question: string; yes: string; no: string; onYes: () => void; color?: string }) {
  const [ask, setAsk] = useState(false);
  if (!ask) return <button type="button" onClick={() => setAsk(true)} style={{ height: 46, border: `2px solid ${color}`, background: 'transparent', color, borderRadius: 8, fontFamily: FONT, fontSize: 17, fontWeight: 800, cursor: 'pointer' }}>{label}</button>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: CARD, border: `2px solid ${color}`, borderRadius: 8, padding: 12 }}>
      <span style={{ fontSize: 16, fontWeight: 700 }}>{question}</span>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => { setAsk(false); onYes(); }} style={{ flex: 1, height: 44, border: 0, background: color, color: '#fff', borderRadius: 8, fontFamily: FONT, fontSize: 16, fontWeight: 800, cursor: 'pointer' }}>{yes}</button>
        <button type="button" onClick={() => setAsk(false)} style={{ flex: 1, height: 44, border: `2px solid ${EDGE}`, background: 'transparent', color: INK, borderRadius: 8, fontFamily: FONT, fontSize: 16, fontWeight: 800, cursor: 'pointer' }}>{no}</button>
      </div>
    </div>
  );
}

function VipResolve({ view, t, send }: { view: any; t: ControllerViewProps['t']; send: ControllerViewProps['send'] }) {
  if (!view.vip) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 800, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('phone.vip')}</span>
      <ConfirmButton label={t('phone.resolve')} question={t('phone.resolveSure')} yes={t('phone.resolveYes')} no={t('phone.no')} onYes={() => send({ type: 'resolve' })} />
    </div>
  );
}

function LetterHint({ view, t }: { view: any; t: ControllerViewProps['t'] }) {
  if (view.letter) return <div className="anim-pop" style={{ background: INK, color: '#f3e6c4', borderRadius: 8, padding: '10px 14px', fontSize: 18, fontWeight: 800 }}>{t('phone.letter', { l: view.letter })}</div>;
  return null;
}

function PhoneSolo({ view, t, send, room }: ControllerViewProps) {
  const cols = (view.short ?? view.cols) as string[];
  const guesses = view.guesses as { name: string; cells: Cell[] }[];
  return (
    <Phone>
      <PhoneTop right={<>{t('round', { n: view.round, total: view.total })}<br />{t('phone.tries', { n: view.misses })}</>} />
      <LetterHint view={view} t={t} />
      <Search figs={view.figs} tried={view.tried} onPick={(id) => send({ type: 'guess', id })} t={t} label={t('phone.who')} />
      {!view.letter && view.misses >= 5 && <span style={{ fontSize: 14, color: MUTED }}>{t('phone.letterIn', { n: view.letterAfter })}</span>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 2 }}>
        {guesses.map((g, i) => (
          <div key={guesses.length - i} className={i === 0 ? 'anim-up' : undefined} style={{ background: CARD, border: `2px solid ${EDGE}`, borderRadius: 8, padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 18, fontWeight: 800 }}>{g.name}</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 4 }}>
              {g.cells.map((c, k) => (
                <div key={k} lang={room.lang} style={{ ...pop(k, i === 0), background: C[c.c], color: FG[c.c], borderRadius: 4, padding: 4, minHeight: 46, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center', lineHeight: 1.1, overflow: 'hidden', overflowWrap: 'break-word' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.9 }}>{cols[k]}</span>
                  <span style={{ fontSize: c.t.length > 16 ? 11 : c.t.length > 9 ? 12.5 : 14, fontWeight: 800, hyphens: 'auto' }}>{c.t}{c.a ? ` ${ARROW[c.a]}` : ''}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 8 }}>
        <ConfirmButton label={t('phone.giveUp')} question={t('phone.giveUpSure')} yes={t('phone.yes')} no={t('phone.no')} color={C.r} onYes={() => send({ type: 'giveUp' })} />
        <VipResolve view={view} t={t} send={send} />
      </div>
    </Phone>
  );
}

function useCooldown(active: boolean, seconds: number) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!active) { setLeft(0); return; }
    const start = Date.now();
    const tick = () => setLeft(Math.max(0, seconds - (Date.now() - start) / 1000));
    tick();
    const iv = setInterval(tick, 100);
    return () => clearInterval(iv);
  }, [active, seconds]);
  return left;
}

function PhoneBrett({ view, t, send }: ControllerViewProps) {
  const left = useCooldown(!!view.cooling, view.cooldown ?? 3);
  const mine = view.mine as { name: string; colors: string }[];
  const frac = view.cooling ? Math.max(0, Math.min(1, left / (view.cooldown ?? 3))) : 0;
  const cool = view.cooling ? (
    <span style={{ width: 92, height: 52, flex: 'none', borderRadius: 8, background: '#b9a57c', color: INK, fontSize: 17, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
      <svg aria-hidden="true" width={22} height={22} viewBox="0 0 24 24"><circle cx={12} cy={12} r={9} fill="none" stroke="rgba(43,29,14,.25)" strokeWidth={3} /><circle cx={12} cy={12} r={9} fill="none" stroke={INK} strokeWidth={3} strokeDasharray={`${56.5 * frac} 56.5`} transform="rotate(-90 12 12)" /></svg>
      {Math.ceil(left)} s
    </span>
  ) : undefined;
  return (
    <Phone gap={14}>
      <PhoneTop right={t('round', { n: view.round, total: view.total })} />
      <div style={{ background: INK, color: '#f3e6c4', borderRadius: 8, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <svg aria-hidden="true" width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="#f3e6c4" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x={2} y={4} width={20} height={13} rx={2} /><path d="M8 21h8M12 17v4" /></svg>
        <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.25 }}>{t('phone.brettInfo')}</span>
      </div>
      <LetterHint view={view} t={t} />
      <Search figs={view.figs} tried={view.tried} disabled={cool} onPick={(id) => send({ type: 'guess', id })} t={t} label={t('phone.yourTip')} />
      <span style={{ fontSize: 14, color: MUTED, marginTop: -8 }}>{t('phone.pause')}</span>
      {mine.length > 0 && (
        <div style={{ background: CARD, border: `2px solid ${EDGE}`, borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: MUTED }}>{t('phone.mine')}</span>
          {mine.map((m, i) => (
            <div key={mine.length - i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 17, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
              <span style={{ display: 'flex', gap: 2, flex: 'none' }}>{m.colors.split('').map((c, k) => <span key={k} style={{ width: 12, height: 18, borderRadius: 2, background: C[c as Color], ...pop(k, i === 0) }} />)}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '0 4px' }}>
        <span style={{ fontSize: 18, fontWeight: 700 }}>{t('phone.gains')}</span>
        <span style={{ fontSize: 26, fontWeight: 800, color: C.g }}>+{view.points}</span>
      </div>
      <div style={{ marginTop: 'auto' }}><VipResolve view={view} t={t} send={send} /></div>
    </Phone>
  );
}

function Waiting({ view, t, player }: { view: any; t: ControllerViewProps['t']; player: ControllerViewProps['player'] }) {
  const waiting = view.waiting as string[];
  return (
    <div style={{ background: CARD, border: `2px solid ${EDGE}`, borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span style={{ fontSize: 16, fontWeight: 800 }}>{waiting.length ? t('phone.waiting', { n: waiting.length }) : t('phone.allDone')}</span>
      {waiting.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{waiting.map((id) => { const p = player(id); return p ? <Avatar key={id} player={p} size={40} flat /> : null; })}</div>}
      <span style={{ fontSize: 14, color: MUTED }}>{t('phone.endRule')}</span>
    </div>
  );
}

function PhoneSolved({ view, t, send, player }: ControllerViewProps) {
  useEffect(() => { vibrate([60, 40, 120]); }, []);
  return (
    <Phone gap={16}>
      <PhoneTop right={t('round', { n: view.round, total: view.total })} />
      {view.place === 1 && <Confetti pieces={14} silent />}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 28 }}><Stamp size={60} style={{ transform: 'rotate(-8deg)', borderWidth: 5 }}>{t('phone.hit')}</Stamp></div>
      <span style={{ fontSize: 22, fontWeight: 800, textAlign: 'center', marginTop: 10 }}>{t('phone.placeTries', { place: view.place, n: view.tries })}</span>
      <div style={{ background: POSTER, border: '3px solid #6b4a1e', borderRadius: 6, padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 14, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: MUTED }}>{t('phone.figure')}</span>
        {view.img && <img referrerPolicy="no-referrer" src={view.img} alt="" style={{ width: 120, height: 120, objectFit: 'cover', objectPosition: 'top', border: `3px solid ${INK}` }} />}
        <span style={{ fontFamily: DISPLAY, fontSize: 38, lineHeight: 1.05, color: RUST, textAlign: 'center' }}>{view.name}</span>
        <span style={{ fontSize: 15, fontWeight: 700, color: C.r }}>{t('phone.secret')}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '0 4px' }}>
        <span style={{ fontSize: 18, fontWeight: 700 }}>{t('phone.points')}</span>
        <span style={{ fontSize: 30, fontWeight: 800, color: C.g }}>+{view.points}</span>
      </div>
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Waiting view={view} t={t} player={player} />
        <VipResolve view={view} t={t} send={send} />
      </div>
    </Phone>
  );
}

function PhoneGaveUp({ view, t, send, player }: ControllerViewProps) {
  return (
    <Phone gap={16}>
      <PhoneTop right={t('round', { n: view.round, total: view.total })} />
      <PhoneMsg title={t('phone.gaveUpTitle')} text={t('lookAtTv')} />
      <Waiting view={view} t={t} player={player} />
      <VipResolve view={view} t={t} send={send} />
    </Phone>
  );
}

function PhoneReveal({ view, t }: ControllerViewProps) {
  return (
    <Phone>
      <PhoneTop />
      <PhoneMsg title={view.place ? t('phone.found') : t('phone.notFound')} text={t('phone.solution')}>
        {view.img && <img referrerPolicy="no-referrer" src={view.img} alt="" style={{ width: 140, height: 140, objectFit: 'cover', objectPosition: 'top', border: `3px solid ${INK}` }} />}
        <span style={{ fontFamily: DISPLAY, fontSize: 40, color: RUST, lineHeight: 1.05 }}>{view.name}</span>
        <span style={{ fontSize: 30, fontWeight: 800, color: view.points ? C.g : MUTED }}>+{view.points}</span>
      </PhoneMsg>
    </Phone>
  );
}

function Controller(props: ControllerViewProps) {
  const { view, t } = props;
  switch (view.screen) {
    case 'intro': return <Phone><PhoneTop /><PhoneMsg title={t(`mode.${view.mode}`)} text={t('phone.intro')} /></Phone>;
    case 'guess': return view.mode === 'brett' ? <PhoneBrett {...props} /> : <PhoneSolo {...props} />;
    case 'solved': return <PhoneSolved {...props} />;
    case 'gaveUp': return <PhoneGaveUp {...props} />;
    case 'reveal': return <PhoneReveal {...props} />;
    case 'scoresMe':
    case 'finalMe':
      return <Phone><PhoneTop /><PhoneMsg title={t('me.place', { place: view.place, of: view.of })} text={t('me.score', { n: view.score })} /></Phone>;
    case 'empty': return <Phone><PhoneTop /><PhoneMsg title={t('title')} text={t('empty')} /></Phone>;
    default: return <Phone><PhoneTop /><PhoneMsg title={t('title')} text={t('lookAtTv')} /></Phone>;
  }
}

export default { Host, Controller } satisfies GameClientModule;
