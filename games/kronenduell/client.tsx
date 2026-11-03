import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { ControllerViewProps, GameClientModule, HostViewProps, PlayerInfo, Translate } from '@up/sdk';
import { Avatar, Confetti, HostHeader, PhoneWait, sfx, useServerNow, vibrate } from '@up/ui';
import { keepCount, preview, stats, type Card, type Part, type Suit, type Zone, type Zones } from './rules';

/* ================= Gemeinsame Bausteine ================= */

const GOLD = '#FFD447';
const INK = '#110D24';
const SURF = '#1C1738';
const SURF2 = '#262048';
const SUIT: Record<Suit, { c: string; d: string }> = {
  sw: { c: '#FF9F43', d: '#D9741A' },
  sh: { c: '#36D6F5', d: '#1A97B0' },
  po: { c: '#E8336F', d: '#C21F55' },
  cr: { c: '#9B7BFF', d: '#6B4FD1' },
};
const ZONE_COLOR: Record<Zone, string> = { atk: '#FF9F43', def: '#36D6F5', spell: '#C4B2FF', corr: '#B8B2D9' };
const PHASES = ['reveal', 'fight', 'spells', 'cleanup'] as const;

/** Was macht eine Farbe in welcher Zone? (Schlüssel für den Spickzettel) */
const ROLE: Record<Suit, Record<Zone, string>> = {
  sw: { atk: 'weapon', def: 'useless', spell: 'allOutAtk', corr: 'corr' },
  sh: { atk: 'useless', def: 'armour', spell: 'allOutDef', corr: 'corr' },
  po: { atk: 'ignite', def: 'ward', spell: 'siphon', corr: 'corr' },
  cr: { atk: 'crit', def: 'counter', spell: 'shatter', corr: 'corr' },
};

const PATHS: Record<string, ReactNode> = {
  sw: <path d="M14.5 17.5L3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />,
  sh: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />,
  po: <path d="M9 3h6M10 3v6.5L5.5 17a2.5 2.5 0 0 0 2.2 3.8h8.6a2.5 2.5 0 0 0 2.2-3.8L14 9.5V3M7.5 14h9" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />,
  cr: <path d="M6 3h12l4 6-10 12L2 9zM2 9h20M12 21L8 9l4-6 4 6z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />,
  spell: <path d="M12 2l2.2 6.8L21 11l-6.8 2.2L12 20l-2.2-6.8L3 11l6.8-2.2z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />,
  corr: <path d="M12 12a1.5 1.5 0 1 1 1.5 1.5A3.5 3.5 0 1 1 15.5 9 6 6 0 1 1 7 16.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />,
  heart: <path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.2 0 3.6 1.2 5.3 3.1 1.7-1.9 3.1-3.1 5.3-3.1 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z" fill="currentColor" />,
  jester: (
    <>
      <path d="M5 19h14M6 19c.5-4-.5-8-3.5-10.5C6 8 8.5 10 9.5 13 10 8.5 11 5.5 12 3c1 2.5 2 5.5 2.5 10 1-3 3.5-5 7-4.5C18.5 11 17.5 15 18 19" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="2.5" cy="8.5" r="1.7" fill="currentColor" /><circle cx="12" cy="2.6" r="1.7" fill="currentColor" /><circle cx="21.5" cy="8.5" r="1.7" fill="currentColor" />
    </>
  ),
};
PATHS.atk = PATHS.sw;
PATHS.def = PATHS.sh;

function Icon({ k, size = 18, color, style }: { k: string; size?: number; color?: string; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ color, flex: 'none', ...style }}>{PATHS[k]}</svg>;
}

/** Krone je Figur: Bube schmaler Reif, Dame Krone, König große Krone */
function CrownIcon({ royal, size = 28, style }: { royal: number; size?: number; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={style}>
      {royal === 0 && <path d="M5 18h14l-1-5-3 2.5L12 10l-3 5.5L6 13z" fill="#D9DDE8" stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />}
      {royal === 1 && (
        <>
          <path d="M4 18h16l-1.5-8-4 3.5L12 6l-2.5 7.5-4-3.5z" fill={GOLD} stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
          <circle cx="12" cy="5" r="1.6" fill={GOLD} stroke={INK} strokeWidth="1.2" />
        </>
      )}
      {royal >= 2 && (
        <>
          <path d="M3 19h18l-1.5-11-4.5 4L12 4l-3 8-4.5-4z" fill={GOLD} stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M3 19h18v2.5H3z" fill={GOLD} stroke={INK} strokeWidth="1.6" />
          <circle cx="12" cy="15" r="1.4" fill="#E8336F" />
        </>
      )}
    </svg>
  );
}

/** Gekröntes Tier */
function Crowned({ player, royal, size = 56, fallen }: { player?: PlayerInfo; royal: number; size?: number; fallen?: boolean }) {
  const c = Math.round(size * (royal === 0 ? 0.42 : royal === 1 ? 0.5 : 0.56));
  return (
    <span style={{ position: 'relative', width: size, height: size + c * 0.45, flex: 'none', display: 'inline-block' }}>
      <span style={{ position: 'absolute', left: 0, bottom: 0, filter: fallen ? 'grayscale(1)' : undefined, opacity: fallen ? 0.6 : 1 }}><Avatar player={player} size={size} flat /></span>
      <CrownIcon royal={royal} size={c} style={{ position: 'absolute', left: (size - c) / 2, top: 0, zIndex: 1, transform: fallen ? 'rotate(-30deg) translate(-20%, 10%)' : undefined, transition: 'transform .4s' }} />
    </span>
  );
}

/** Der Narr (entscheidet bei Gleichstand, wer anfängt) */
function Jester({ size = 24 }: { size?: number }) {
  return <span role="img" aria-hidden="true" style={{ fontSize: size, lineHeight: 1 }}>🃏</span>;
}

function Hearts({ hp, vit, size = 18 }: { hp: number; vit: number; size?: number }) {
  return (
    <span style={{ display: 'flex', gap: 2 }} aria-label={`${hp}/${vit}`}>
      {Array.from({ length: vit }, (_, i) => <Icon key={i} k="heart" size={size} color={i < hp ? '#E8336F' : '#3A3366'} />)}
    </span>
  );
}

type AnyCard = { id?: number; s?: Suit; n?: number; hidden?: boolean };

function CardFace({ c, w = 50, planned, selected, mark, onClick, style }: {
  c: AnyCard; w?: number; planned?: boolean; selected?: boolean; mark?: boolean; onClick?: () => void; style?: CSSProperties;
}) {
  if (!c.s) return <CardBack w={w} style={style} />;
  const h = Math.round(w * 1.4);
  const col = SUIT[c.s];
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} aria-label={`${c.n} ${c.s}`}
      style={{
        width: w, height: h, borderRadius: Math.max(6, w * 0.16), background: '#FFFDF7', boxSizing: 'border-box', padding: `${w * 0.07}px ${w * 0.1}px`,
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flex: 'none', border: 0, position: 'relative',
        boxShadow: selected ? `0 0 0 3px ${GOLD}, 0 6px 0 rgba(0,0,0,.45)` : planned ? `0 0 0 2px ${INK}, 0 0 0 4px ${GOLD}` : '0 3px 0 rgba(0,0,0,.4)',
        transform: selected ? 'translateY(-8px)' : undefined, transition: 'transform .15s', cursor: onClick ? 'pointer' : undefined, touchAction: 'manipulation', ...style,
      }}>
      <span className="display" style={{ fontSize: w * 0.42, fontWeight: 800, lineHeight: 1, color: col.d, textAlign: 'left' }}>{c.n}</span>
      <Icon k={c.s} size={w * 0.4} color={col.d} style={{ alignSelf: 'flex-end' }} />
      {mark && <span style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', background: 'repeating-linear-gradient(45deg, rgba(43,34,96,.18) 0 4px, transparent 4px 8px)' }} />}
    </Tag>
  );
}

function CardBack({ w = 50, style }: { w?: number; style?: CSSProperties }) {
  return (
    <div style={{
      width: w, height: Math.round(w * 1.4), borderRadius: Math.max(6, w * 0.16), boxSizing: 'border-box', border: '2px solid #7B6CF0', flex: 'none',
      backgroundColor: '#2B2260', backgroundImage: 'repeating-linear-gradient(45deg,rgba(255,255,255,.07) 0 5px,transparent 5px 10px)', boxShadow: '0 3px 0 rgba(0,0,0,.4)', ...style,
    }} />
  );
}

/** Welche Karten wurden schon gezeigt? (key → war sie offen?) – für Einflug- und Umdreh-Animationen */
const seen = new Map<string, boolean>();

function AnimCard({ k, face, children }: { k: string; face: boolean; children: ReactNode }) {
  const [anim] = useState(() => {
    if (!seen.has(k)) return 'kdIn .55s cubic-bezier(.2,.9,.3,1.25) both';
    if (!seen.get(k) && face) return 'kdFlip .5s ease-out both';
    return undefined;
  });
  useEffect(() => {
    seen.set(k, face);
  }, [k, face]);
  return <div style={{ animation: anim }}>{children}</div>;
}

/** Kartenreihe, überlappend wenn es eng wird. scope = Animationen für neue/umgedrehte Karten */
function Row({ cards, w, max, justify = 'center', render, scope }: { cards: AnyCard[]; w: number; max: number; justify?: CSSProperties['justifyContent']; render?: (c: AnyCard, i: number) => ReactNode; scope?: string }) {
  const overlap = cards.length > 1 ? Math.max(0, Math.min(w * 0.45, (cards.length * w - max) / (cards.length - 1))) : 0;
  return (
    <div style={{ display: 'flex', justifyContent: justify, alignItems: 'center', flex: 1, minHeight: Math.round(w * 1.4) }}>
      {cards.map((c, i) => {
        const inner = render ? render(c, i) : <CardFace c={c} w={w} />;
        return (
          <div key={`${c.id ?? 'h' + i}-${c.s ? 'f' : 'b'}`} style={{ marginLeft: i ? -overlap : 0, zIndex: i }}>
            {scope ? <AnimCard k={`${scope}:${c.id ?? i}`} face={!!c.s}>{inner}</AnimCard> : inner}
          </div>
        );
      })}
    </div>
  );
}

/** Keyframes für Kronenduell */
function KdStyles() {
  return (
    <style>{`
@keyframes kdIn { 0% { transform: translateY(-46px) scale(1.3) rotate(-10deg); opacity: 0; } 60% { transform: translateY(4px) scale(.96) rotate(1deg); opacity: 1; } 100% { transform: none; opacity: 1; } }
@keyframes kdFlip { 0% { transform: perspective(400px) rotateY(90deg) scale(1.15); } 70% { transform: perspective(400px) rotateY(-8deg) scale(1.05); } 100% { transform: none; } }
@keyframes kdOut { 0% { opacity: 1; transform: none; } 25% { opacity: 1; transform: translateY(-10px) rotate(-6deg) scale(1.08); } 100% { opacity: 0; transform: translate(40px, -70px) rotate(35deg) scale(.5); } }
@keyframes kdShatter { 0% { opacity: 1; transform: none; filter: none; } 25% { transform: scale(1.18) rotate(-5deg); filter: brightness(1.8) saturate(2); } 45% { transform: scale(1.1) rotate(4deg); } 100% { opacity: 0; transform: scale(1.8) rotate(14deg); filter: blur(6px) brightness(2.5); } }
@keyframes kdShake { 0%,100% { transform: none; } 12% { transform: translateX(-12px) rotate(-3deg); } 26% { transform: translateX(10px) rotate(2deg); } 40% { transform: translateX(-8px) rotate(-1deg); } 55% { transform: translateX(6px); } 70% { transform: translateX(-3px); } 85% { transform: translateX(2px); } }
@keyframes kdBubble { 0% { opacity: 0; transform: translate(-50%, 14px) scale(.4); } 14% { opacity: 1; transform: translate(-50%, -8px) scale(1.18); } 24% { transform: translate(-50%, -6px) scale(1); } 78% { opacity: 1; transform: translate(-50%, -14px); } 100% { opacity: 0; transform: translate(-50%, -38px); } }
@keyframes kdBanner { 0% { opacity: 0; transform: translate(-50%, -50%) scale(.5) rotate(-4deg); } 22% { opacity: 1; transform: translate(-50%, -50%) scale(1.1) rotate(1deg); } 34% { transform: translate(-50%, -50%) scale(1) rotate(0); } 78% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -50%) scale(1.06); } }
@keyframes kdGlow { 0%,100% { box-shadow: 0 0 0 0 transparent; } 40% { box-shadow: 0 0 34px 8px var(--kd-glow); } }
@keyframes kdTurn { 0%,100% { opacity: 1; } 50% { opacity: .55; } }
@keyframes kdLunge { 0% { transform: none; } 30% { transform: translateY(calc(var(--d) * -22px)) scale(.97); } 55% { transform: translateY(calc(var(--d) * 208px)) scale(1.07); } 64% { transform: translateY(calc(var(--d) * 190px)) scale(1.03); } 100% { transform: none; } }
@keyframes kdRecoil { 0%, 54% { transform: none; filter: none; } 60% { transform: translateY(calc(var(--d) * -30px)) rotate(-2.5deg); filter: drop-shadow(0 0 22px #FF3B4E) brightness(1.4); } 70% { transform: translate(9px, calc(var(--d) * -12px)) rotate(1.5deg); } 80% { transform: translateX(-6px); filter: drop-shadow(0 0 10px #FF3B4E); } 90% { transform: translateX(3px); } 100% { transform: none; filter: none; } }
@keyframes kdClash { 0% { transform: none; } 45% { transform: translateY(calc(var(--d) * 104px)) scale(1.04); filter: drop-shadow(0 0 18px #fff); } 53% { transform: translateY(calc(var(--d) * 88px)); filter: none; } 62% { transform: translateY(calc(var(--d) * 100px)); } 100% { transform: none; } }
@keyframes kdPop { 0% { transform: scale(.3); } 60% { transform: scale(1.35); } 100% { transform: scale(1); } }
@keyframes kdRoyal { 0% { transform: scale(.2) rotate(-25deg); opacity: 0; } 65% { transform: scale(1.2) rotate(6deg); opacity: 1; } 100% { transform: none; } }
@keyframes kdFlash { 0% { box-shadow: inset 0 0 0 3px var(--kd-glow), 0 0 0 0 var(--kd-glow); } 30% { box-shadow: inset 0 0 0 3px var(--kd-glow), 0 0 30px 6px var(--kd-glow); } 100% { box-shadow: inset 0 0 0 3px var(--kd-glow), 0 0 0 0 transparent; } }
`}</style>
  );
}

/* ---------- Klänge (nur TV) ---------- */

type Synth = Parameters<Parameters<typeof sfx.custom>[0]>[0];
const snap = (s: Synth, at = 0, vol = 0.18) => s.noise(0.05, { filter: 3200, type: 'bandpass', vol, at });

/** Eigener Klang je Zone beim Legen */
const ZONE_SFX: Record<Zone, (s: Synth) => void> = {
  // Klinge: helles Schleifen
  atk: (s) => { snap(s); s.noise(0.28, { filter: 3500, type: 'highpass', sweepTo: 9000, vol: 0.16, at: 0.04 }); s.tone(1500, 0.3, { type: 'triangle', vol: 0.07, to: 2300, at: 0.05 }); },
  // Schild: dumpfes Holz
  def: (s) => { snap(s); s.tone(160, 0.2, { vol: 0.35, to: 70, at: 0.03 }); s.noise(0.1, { filter: 900, type: 'lowpass', vol: 0.25, at: 0.03 }); },
  // Zauber: Glitzern
  spell: (s) => { snap(s); [988, 1319, 1760, 2349].forEach((f, i) => s.tone(f, 0.25, { type: 'triangle', vol: 0.06, at: 0.04 + i * 0.05 })); },
  // Korruption: dunkles Saugen
  corr: (s) => { snap(s); s.tone(240, 0.55, { type: 'sawtooth', vol: 0.05, to: 60, at: 0.03 }); s.noise(0.5, { filter: 500, type: 'lowpass', sweepTo: 120, vol: 0.16, at: 0.03 }); },
};

const STEP_SFX: Record<string, (s: Synth, v: any) => void> = {
  phase: (s) => { s.tone(523, 0.14, { type: 'triangle', vol: 0.09 }); s.tone(784, 0.22, { type: 'triangle', vol: 0.09, at: 0.1 }); },
  reveal: (s) => { for (let i = 0; i < 7; i++) snap(s, i * 0.07, 0.2); s.tone(660, 0.3, { type: 'triangle', vol: 0.06, at: 0.5 }); },
  higherSw: (s) => { s.noise(0.4, { filter: 1400, type: 'bandpass', sweepTo: 300, vol: 0.2 }); s.tone(520, 0.35, { type: 'square', vol: 0.035, to: 160 }); },
  wrongZone: (s) => { s.tone(300, 0.15, { type: 'square', vol: 0.05 }); s.tone(220, 0.25, { type: 'square', vol: 0.05, at: 0.14 }); s.noise(0.4, { filter: 1400, type: 'bandpass', sweepTo: 300, vol: 0.18, at: 0.2 }); },
  spellCancel: (s) => { s.noise(0.55, { filter: 6000, type: 'highpass', sweepTo: 1500, vol: 0.13 }); s.tone(900, 0.45, { vol: 0.08, to: 180 }); },
  strength: (s) => { s.noise(0.2, { filter: 4000, type: 'highpass', sweepTo: 9000, vol: 0.14 }); s.tone(1200, 0.22, { type: 'triangle', vol: 0.06, to: 1900 }); },
  block: (s) => { s.tone(140, 0.22, { vol: 0.32, to: 75 }); s.noise(0.09, { filter: 700, type: 'lowpass', vol: 0.22 }); },
  allOutAtk: (s) => [392, 523, 659, 784].forEach((f, i) => s.tone(f, 0.18, { type: 'sawtooth', vol: 0.06, at: i * 0.08 })),
  allOutDef: (s) => [196, 262, 330, 392].forEach((f, i) => s.tone(f, 0.22, { type: 'square', vol: 0.06, at: i * 0.09 })),
  facePlant: (s) => [392, 370, 349, 311].forEach((f, i) => s.tone(f, 0.32, { type: 'square', vol: 0.06, at: i * 0.26, to: f * 0.96 })),
  // Angriff rauscht heran (0–0,5 s), dann schwerer Einschlag; jeder weitere Schadenspunkt ein Nachschlag
  hit: (s, v) => {
    s.noise(0.45, { filter: 800, type: 'bandpass', sweepTo: 3000, vol: 0.14 });
    const at = CLASH.hitAt;
    s.noise(0.4, { filter: 650, type: 'lowpass', vol: 0.6, at });
    s.tone(120, 0.45, { vol: 0.5, to: 38, at });
    s.tone(60, 0.5, { type: 'sawtooth', vol: 0.12, to: 30, at });
    for (let i = 1; i < Math.min(5, v?.dmg ?? 1); i++) { s.noise(0.16, { filter: 900, type: 'lowpass', vol: 0.35, at: at + i * 0.22 }); s.tone(150, 0.2, { vol: 0.3, to: 60, at: at + i * 0.22 }); }
  },
  // beide bewegen sich aufeinander zu und prallen ab: metallisches Klirren
  miss: (s) => {
    s.noise(0.35, { filter: 900, type: 'bandpass', sweepTo: 2500, vol: 0.1 });
    const at = CLASH.blockAt;
    s.noise(0.12, { filter: 4500, type: 'highpass', vol: 0.3, at });
    s.tone(1760, 0.6, { type: 'square', vol: 0.05, at });
    s.tone(2637, 0.5, { type: 'square', vol: 0.035, at: at + 0.005 });
    s.tone(220, 0.25, { vol: 0.3, to: 120, at });
  },
  counter: (s, v) => { for (let i = 0; i < Math.min(5, v?.n ?? 1); i++) snap(s, i * 0.1); s.tone(880, 0.15, { type: 'triangle', vol: 0.06, at: 0.05 }); },
  draw: (s, v) => { for (let i = 0; i < Math.min(6, v?.n ?? 1); i++) snap(s, i * 0.09, 0.14); },
  siphon: (s) => { s.tone(320, 0.7, { vol: 0.12, to: 80 }); s.noise(0.65, { filter: 900, type: 'bandpass', sweepTo: 180, vol: 0.13 }); },
  shatter: (s) => { for (let i = 0; i < 9; i++) s.tone(1800 + Math.random() * 3200, 0.12, { type: 'triangle', vol: 0.055, at: i * 0.03 }); s.noise(0.45, { filter: 5000, type: 'highpass', vol: 0.25 }); },
  shatterNone: (s) => s.tone(620, 0.35, { type: 'triangle', vol: 0.06, to: 380 }),
  noSpells: (s) => s.tone(440, 0.12, { vol: 0.05 }),
  cleanup: (s) => { s.noise(0.7, { filter: 2600, type: 'bandpass', sweepTo: 700, vol: 0.11 }); },
  royalFalls: (s) => {
    [523, 440, 349, 262].forEach((f, i) => s.tone(f, 0.26, { type: 'triangle', vol: 0.1, at: i * 0.15 }));
    s.tone(85, 0.5, { vol: 0.42, to: 40, at: 0.65 });
    [523, 659, 784, 1047].forEach((f, i) => s.tone(f, 0.25, { type: 'triangle', vol: 0.08, at: 1.3 + i * 0.09 }));
  },
  kingFalls: (s) => { [523, 440, 349, 262, 196].forEach((f, i) => s.tone(f, 0.3, { type: 'sawtooth', vol: 0.07, at: i * 0.22 })); s.noise(1.1, { filter: 300, type: 'lowpass', vol: 0.45, at: 1.1 }); s.tone(70, 1, { vol: 0.4, to: 30, at: 1.1 }); },
  corrupt: (s) => { for (let i = 0; i < 5; i++) s.tone(i % 2 ? 233 : 220, 0.3, { type: 'sawtooth', vol: 0.05, at: i * 0.14 }); s.tone(110, 1.1, { vol: 0.16, to: 52 }); },
  pure: (s) => [784, 988, 1175, 1568].forEach((f, i) => s.tone(f, 0.2, { type: 'triangle', vol: 0.06, at: i * 0.06 })),
};
STEP_SFX.higherSh = STEP_SFX.higherSw;

/** Zusammenprall Angriff ↔ Verteidigung: Dauer und Zeitpunkt des Aufpralls (Sekunden) */
const CLASH = { dur: 0.95, hitAt: 0.95 * 0.55, blockAt: 0.95 * 0.45 };

/* ---------- Effekte je Schritt ---------- */

interface Fx { key: string; bubble?: { text: string; color: string }; shake?: boolean; glow?: string; dur: number }

function stepFx(step: StepT | undefined, idx: number, t: Translate): Record<string, Fx> {
  if (!step) return {};
  const v = step.v ?? {};
  const out: Record<string, Fx> = {};
  const set = (id: string | undefined, f: Omit<Fx, 'key' | 'dur'>) => { if (id) out[id] = { key: String(idx), dur: step.d ?? 1.5, ...f }; };
  switch (step.k) {
    case 'hit': set(v.t, { shake: true, glow: '#FF3B4E', bubble: { text: `−${v.dmg} ♥`, color: '#FF5D6E' } }); break;
    case 'miss': set(v.t, { bubble: { text: t('fx.blocked'), color: SUIT.sh.c } }); break;
    case 'counter': case 'draw': set(v.p, { bubble: { text: t('fx.cards', { n: v.n }), color: '#fff' } }); break;
    case 'siphon': set(v.p, { glow: '#9B7BFF', bubble: { text: t('fx.siphon', { n: v.n }), color: '#C4B2FF' } }); break;
    case 'shatter': set(v.t, { shake: true, bubble: { text: t('fx.shatter'), color: SUIT.cr.c } }); break;
    case 'corrupt': set(v.p, { glow: '#9B7BFF', bubble: { text: t('fx.corrupt'), color: '#C4B2FF' } }); break;
    case 'pure': set(v.p, { bubble: { text: '✨', color: GOLD } }); break;
    case 'royalFalls': set(v.p, { glow: GOLD, bubble: { text: t('royal.' + v.royal) + '!', color: GOLD } }); break;
    case 'kingFalls': set(v.p, { shake: true, glow: '#FF3B4E', bubble: { text: '💀', color: '#fff' } }); break;
    case 'allOutAtk': set(v.p, { glow: SUIT.sw.c, bubble: { text: t('rules.allOutAtk') + '!', color: SUIT.sw.c } }); break;
    case 'allOutDef': set(v.p, { glow: SUIT.sh.c, bubble: { text: t('rules.allOutDef') + '!', color: SUIT.sh.c } }); break;
    case 'facePlant': set(v.p, { shake: true, bubble: { text: '😵', color: '#fff' } }); break;
    case 'strength': set(v.p, { bubble: { text: t('str', { n: v.value }), color: SUIT.sw.c } }); break;
    case 'block': set(v.p, { bubble: { text: t('blk', { n: v.value }), color: SUIT.sh.c } }); break;
    default:
  }
  return out;
}

function Bubble({ fx }: { fx?: Fx }) {
  if (!fx?.bubble) return null;
  return (
    <span key={fx.key} className="display" style={{
      position: 'absolute', left: '50%', top: -18, zIndex: 5, whiteSpace: 'nowrap', pointerEvents: 'none',
      background: INK, color: fx.bubble.color, border: `2px solid ${fx.bubble.color}`, borderRadius: 999, padding: '3px 12px', fontSize: 18, fontWeight: 800,
      boxShadow: '0 6px 18px rgba(0,0,0,.5)', animation: `kdBubble ${Math.max(1, fx.dur)}s ease-out forwards`,
    }}>{fx.bubble.text}</span>
  );
}

const cardName = (c: AnyCard, t: Translate) => (c.s ? `${t('suit.' + c.s)} ${c.n}` : '?');
const cardsText = (cs: AnyCard[], t: Translate) => cs.map((c) => cardName(c, t)).join(', ');

function partsText(parts: Part[], t: Translate) {
  if (!parts?.length) return t('part.none');
  return parts.map((p) => t('part.' + p.k, { v: p.v }) + (p.extra ? ' ' + t('part.extra', { n: p.extra }) : '')).join(' + ');
}

interface StepT { k: string; v?: any; b: any[]; hl?: { p: string; z: string }[]; ph: string; at: number; d: number }

function stepText(s: StepT, t: Translate, name: (id: string) => string) {
  const v = s.v ?? {};
  const vars: Record<string, string | number> = { ...v, name: v.p ? name(v.p) : '', target: v.t ? name(v.t) : '' };
  if (v.cards) vars.cards = cardsText(v.cards, t);
  if (s.k === 'royalFalls') vars.royal = t('royal.' + v.royal);
  if (s.k === 'hit' && v.fallen) return t('step.hitFallen', vars);
  let txt = t('step.' + s.k, vars);
  if (s.k === 'strength' || s.k === 'block') txt += ` (${partsText(v.parts, t)})`;
  if (s.k === 'hit' && (v.crit || v.match)) txt += ` (${t('dmg.parts', { crit: v.crit, match: v.match })})`;
  return txt;
}

/** Visible stats (nur aufgedeckte Karten) */
function visibleStats(z: any) {
  const f = (cs: AnyCard[]) => cs.filter((c) => c.s && !c.hidden) as Card[];
  return stats({ atk: f(z.atk), def: f(z.def), spell: f(z.spell), corr: [] } as Zones);
}

/* ================= TV ================= */

function Host(props: HostViewProps) {
  return <><KdStyles /><HostScreen {...props} /></>;
}

function HostScreen(props: HostViewProps) {
  const { view } = props;
  switch (view.screen) {
    case 'intro':
      return <HostIntro {...props} />;
    case 'plan':
      return <HostPlan {...props} />;
    case 'resolve':
      return <HostResolve {...props} />;
    case 'end':
      return <HostEnd {...props} />;
    default:
      return null;
  }
}

function Pill({ color, children }: { color: string; children: ReactNode }) {
  return <span className="display anim-pop" style={{ fontSize: 22, fontWeight: 800, background: color, color: INK, padding: '6px 18px', borderRadius: 999, boxShadow: '0 4px 0 rgba(0,0,0,.35)' }}>{children}</span>;
}

/* ---------- Spickzettel ---------- */

function RulesGrid({ t, compact }: { t: Translate; compact?: boolean }) {
  const fs = compact ? 13 : 14;
  const cell = (key: string, bad: boolean) => (
    <div key={key} style={{ background: bad ? '#15102E' : SURF, borderRadius: 12, padding: '7px 10px', fontSize: fs, lineHeight: 1.28, color: bad ? '#8F88B8' : '#E6E2FF' }}>
      <b className="display" style={{ display: 'block', fontSize: fs + 3, color: bad ? '#8F88B8' : '#fff', marginBottom: 1 }}>{t('rules.' + key)}</b>
      {t(`rules.${key}.t`)}
    </div>
  );
  const zones: Zone[] = ['atk', 'def', 'spell'];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '150px repeat(3, 1fr)', gap: 7 }}>
      {!compact && <span />}
      {!compact && zones.map((z) => (
        <span key={z} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: ZONE_COLOR[z] }}>
          <Icon k={z === 'spell' ? 'spell' : z} size={16} />{t('zone.' + z)}
        </span>
      ))}
      {(['sw', 'sh', 'po', 'cr'] as Suit[]).map((s) => (
        compact ? (
          <div key={s} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span className="display" style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 18, color: SUIT[s].c }}><Icon k={s} size={20} />{t('suit.' + s)}</span>
            {zones.map((z) => (
              <div key={z} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                <span style={{ width: 84, flex: 'none', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: ZONE_COLOR[z] }}>{t('zone.' + z)}</span>
                <span style={{ fontSize: 13, color: ROLE[s][z] === 'useless' ? '#8F88B8' : '#E6E2FF' }}><b>{t('rules.' + ROLE[s][z])}</b> – {t(`rules.${ROLE[s][z]}.t`)}</span>
              </div>
            ))}
          </div>
        ) : (
          [
            <span key={s} className="display" style={{ background: SUIT[s].c, color: INK, borderRadius: 12, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 19 }}>
              <Icon k={s} size={22} />{t('suit.' + s)}
            </span>,
            ...zones.map((z) => cell(ROLE[s][z], ROLE[s][z] === 'useless')),
          ]
        )
      ))}
    </div>
  );
}

function HostIntro({ view, t, player }: HostViewProps) {
  useEffect(() => sfx.play('fanfare'), []);
  const cell = (key: string) => (
    <div key={key} style={{ background: SURF2, borderRadius: 12, padding: '7px 10px', fontSize: 13, lineHeight: 1.28, color: '#E6E2FF' }}>
      <b className="display" style={{ display: 'block', fontSize: 16, color: '#fff' }}>{t('rules.' + key)}</b>{t(`rules.${key}.t`)}
    </div>
  );
  return (
    <>
      <HostHeader title={t('title')} color={GOLD} info={t('intro.sub')} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0, marginTop: -10 }}>
        <RulesGrid t={t} />
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr', gap: 7 }}>
          {cell('turns')}{cell('hit')}{cell('corr')}{cell('royals')}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 2 }}>
          <span className="muted" style={{ fontSize: 17 }}>{t('intro.ready')}</span>
          {view.players.map((id: string) => (
            <span key={id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, opacity: view.ready.includes(id) ? 1 : 0.55 }}>
              <Avatar player={player(id)} size={30} flat />{view.ready.includes(id) ? '✓' : '…'}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}

/* ---------- Spielfeld ---------- */

interface Ghosts { key: string; cards: AnyCard[]; kind: 'out' | 'shatter' }

/** Die zählende (höchste) offene Waffe bzw. Rüstung einer Zone */
function topCardId(cards: AnyCard[], zone: Zone) {
  const suit = zone === 'atk' ? 'sw' : zone === 'def' ? 'sh' : null;
  let best: AnyCard | null = null;
  for (const c of cards) if (c.s === suit && !c.hidden && (!best || (c.n ?? 0) > (best.n ?? 0))) best = c;
  return best?.id ?? null;
}

/** Angriff/Verteidigung auf dem TV: großes Symbol + großer Wert statt Überschrift */
function StatZone({ zone, cards, w, hl, value, cardMax, scope, ghosts, flash, statRight }: {
  zone: 'atk' | 'def'; cards: AnyCard[]; w: number; hl?: boolean; value: number; cardMax: number; scope?: string; ghosts?: Ghosts; flash?: string; statRight?: boolean;
}) {
  const col = ZONE_COLOR[zone];
  const stat = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0, width: 78, flex: 'none', color: col }}>
      <Icon k={zone} size={34} />
      <span key={value} className="display" style={{ fontSize: 46, fontWeight: 800, lineHeight: 1, color: value ? '#fff' : '#6F68A0', animation: 'kdPop .45s ease-out' }}>{value}</span>
    </div>
  );
  return (
    <div key={flash} style={{
      position: 'relative', borderRadius: 14, background: SURF, padding: '6px 8px', display: 'flex', flexDirection: statRight ? 'row-reverse' : 'row', alignItems: 'center', gap: 4,
      boxSizing: 'border-box', minWidth: 0, boxShadow: hl ? `inset 0 0 0 3px ${GOLD}, 0 0 24px rgba(255,212,71,.35)` : `inset 0 0 0 2px ${col}22`, transition: 'box-shadow .3s',
      ...(flash ? { ['--kd-glow' as any]: col, animation: 'kdFlash 1.2s ease-out both' } : {}),
    }}>
      {stat}
      <Row cards={cards} w={w} max={cardMax} scope={scope} render={(c) => <CardFace c={c} w={c.id != null && c.id === topCardId(cards, zone) ? Math.round(w * 1.28) : w} />} />
      {ghosts && ghosts.cards.length > 0 && (
        <div key={ghosts.key} style={{ position: 'absolute', left: 0, right: 0, bottom: 6, display: 'flex', justifyContent: 'center', gap: 6, pointerEvents: 'none', zIndex: 4 }}>
          {ghosts.cards.map((c, i) => (
            <div key={c.id ?? i} style={{ animation: `${ghosts.kind === 'shatter' ? 'kdShatter 1s' : 'kdOut .95s'} ease-in ${i * 0.08}s forwards` }}><CardFace c={c} w={w} /></div>
          ))}
        </div>
      )}
    </div>
  );
}

function ZoneBox({ zone, cards, t, w, hl, value, locked, extra, style, cardMax, scope, ghosts, flash }: {
  zone: Zone; cards: AnyCard[]; t: Translate; w: number; hl?: boolean; value?: number; locked?: boolean; extra?: ReactNode; style?: CSSProperties; cardMax: number;
  scope?: string; ghosts?: Ghosts; flash?: string;
}) {
  return (
    <div key={flash} style={{
      position: 'relative', borderRadius: 14, background: SURF, padding: '5px 10px', display: 'flex', flexDirection: 'column', gap: 3, boxSizing: 'border-box', minWidth: 0,
      boxShadow: hl ? `inset 0 0 0 3px ${GOLD}, 0 0 24px rgba(255,212,71,.35)` : undefined, opacity: locked ? 0.55 : 1, transition: 'box-shadow .3s',
      ...(flash ? { ['--kd-glow' as any]: ZONE_COLOR[zone], animation: 'kdFlash 1.2s ease-out both' } : {}), ...style,
    }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: ZONE_COLOR[zone] }}>
        <Icon k={zone === 'spell' ? 'spell' : zone} size={15} />
        {locked ? t('zone.corrLocked') : t('zone.' + zone)}
        {value != null && <span key={value} className="display" style={{ marginLeft: 'auto', fontSize: 18, color: '#fff', letterSpacing: 0, animation: 'kdPop .45s ease-out' }}>{value}</span>}
        {extra}
      </span>
      <Row cards={cards} w={w} max={cardMax} scope={scope} />
      {ghosts && ghosts.cards.length > 0 && (
        <div key={ghosts.key} style={{ position: 'absolute', left: 0, right: 0, bottom: 6, display: 'flex', justifyContent: 'center', gap: 6, pointerEvents: 'none', zIndex: 4 }}>
          {ghosts.cards.map((c, i) => (
            <div key={c.id ?? i} style={{ animation: `${ghosts.kind === 'shatter' ? 'kdShatter 1s' : 'kdOut .95s'} ease-in ${i * 0.08}s forwards` }}><CardFace c={c} w={w} /></div>
          ))}
        </div>
      )}
    </div>
  );
}

function RoyalBox({ p, player, t, active, hl, w = 230, fx }: { p: any; player?: PlayerInfo; t: Translate; active?: boolean; hl?: boolean; w?: number; fx?: Fx }) {
  return (
    <div style={{ position: 'relative', width: w }}>
      <Bubble fx={fx} />
      <div key={fx?.shake || fx?.glow ? fx.key : 'calm'} style={{
        width: w, height: '100%', borderRadius: 18, background: SURF2, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', boxSizing: 'border-box',
        boxShadow: hl ? `inset 0 0 0 3px #FF3B4E, 0 0 26px rgba(255,59,78,.45)` : active ? `inset 0 0 0 3px ${player?.color ?? GOLD}, 0 0 26px ${(player?.color ?? GOLD)}55` : undefined,
        transition: 'box-shadow .3s',
        ...(fx?.glow ? { ['--kd-glow' as any]: fx.glow } : {}),
        animation: [fx?.shake && 'kdShake .6s ease-out', fx?.glow && 'kdGlow 1.3s ease-out'].filter(Boolean).join(', ') || undefined,
      }}>
        <span key={p.royal} style={{ display: 'inline-flex', animation: 'kdRoyal .8s ease-out' }}><Crowned player={player} royal={p.royal} size={52} fallen={p.hp <= 0} /></span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <span className="display" style={{ fontSize: 17, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{player?.name}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700 }}>{t('royal.' + p.royal)} <Hearts hp={p.hp} vit={p.vit} size={16} /></span>
          <span style={{ fontSize: 12, fontWeight: 700, color: p.corrupt ? '#C4B2FF' : 'var(--muted)' }}>
            {p.hp <= 0 ? t('fallen') : p.hand ? t('cards', { n: p.hand }) : ''}{p.corrupt ? (p.hand || p.hp <= 0 ? ' · ' : '') + t('corrupt') : ''}
          </span>
        </div>
      </div>
    </div>
  );
}

interface Clash { key: string; kind: 'hit' | 'miss'; a: string; d: string }
interface SideFx { hl?: StepT['hl']; fx?: Fx; prev?: any; ghostKey?: string; ghostKind?: Ghosts['kind']; flash?: { z: Zone; key: string } | null; clash?: Clash | null }

/** Eine Seite des Tisches. top = Gegenüber (gespiegelt wie am echten Tisch) */
function Side({ p, player, t, top, active, values, narrow, sfx: e }: { p: any; player?: PlayerInfo; t: Translate; top?: boolean; active?: boolean; values?: { str: number; blk: number } | null; narrow?: boolean; sfx: SideFx }) {
  const h = (z: string) => !!e.hl?.some((x) => x.p === p.id && x.z === z);
  const w = 44;
  const royalW = narrow ? 210 : 236;
  const sideMax = narrow ? 230 : 330;
  // Karten, die seit dem letzten Schritt verschwunden sind, fliegen sichtbar raus
  const ghosts = (z: Zone): Ghosts | undefined => {
    if (!e.prev || !e.ghostKey) return undefined;
    const gone = (e.prev.zones[z] as AnyCard[]).filter((c) => c.s && !p.zones[z].some((x: AnyCard) => x.id === c.id));
    return gone.length ? { key: e.ghostKey, cards: gone, kind: e.ghostKind ?? 'out' } : undefined;
  };
  const flash = (z: Zone) => (e.flash?.z === z ? e.flash.key : undefined);
  const scope = (z: Zone) => `${p.id}:${z}`;
  const corr = (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <ZoneBox zone="corr" cards={[]} t={t} w={w} hl={h('corr')} locked={p.corrupt} cardMax={0} flash={flash('corr')}
        style={{ width: 330, height: 44, flexDirection: 'row', alignItems: 'center' }}
        extra={!p.corrupt && (
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, letterSpacing: 0 }}>
            <span style={{ display: 'flex' }}>{p.zones.corr.map((c: AnyCard, i: number) => (
              <span key={c.id ?? i} style={{ marginLeft: i ? -6 : 0 }}>
                <AnimCard k={`${scope('corr')}:${c.id ?? i}`} face={false}><span style={{ display: 'block', width: 16, height: 24, borderRadius: 4, background: '#2B2260', border: '2px solid #7B6CF0' }} /></AnimCard>
              </span>
            ))}</span>
            {p.zones.corr.length} / {p.vit}
          </span>
        )} />
    </div>
  );
  const spell = (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <ZoneBox zone="spell" cards={p.zones.spell} t={t} w={w} hl={h('spell')} cardMax={300} style={{ width: 330, height: 92 }} scope={scope('spell')} ghosts={ghosts('spell')} flash={flash('spell')} />
    </div>
  );
  // Werte stehen jeweils außen: unten Verteidigung links/Angriff rechts, oben gespiegelt
  // Zusammenprall: oben bewegt sich nach unten (+1), unten nach oben (−1)
  const clashWrap = (z: 'atk' | 'def', node: ReactNode) => {
    const c = e.clash;
    let anim: string | undefined;
    if (c && z === 'atk' && c.a === p.id) anim = c.kind === 'hit' ? 'kdLunge' : 'kdClash';
    if (c && z === 'def' && c.d === p.id) anim = c.kind === 'hit' ? 'kdRecoil' : 'kdClash';
    return (
      <div key={anim ? `${z}-${c!.key}` : `${z}-still`} style={{ position: 'relative', zIndex: anim ? 6 : undefined, display: 'grid', ['--d' as any]: top ? 1 : -1, animation: anim ? `${anim} ${CLASH.dur}s cubic-bezier(.4,0,.3,1) both` : undefined }}>
        {node}
      </div>
    );
  };
  const atk0 = <StatZone zone="atk" cards={p.zones.atk} w={w} hl={h('atk')} value={values?.str ?? 0} cardMax={sideMax - 80} scope={scope('atk')} ghosts={ghosts('atk')} flash={flash('atk')} statRight={!top} />;
  const def0 = <StatZone zone="def" cards={p.zones.def} w={w} hl={h('def')} value={values?.blk ?? 0} cardMax={sideMax - 80} scope={scope('def')} ghosts={ghosts('def')} flash={flash('def')} statRight={!!top} />;
  const atk = clashWrap('atk', atk0);
  const def = clashWrap('def', def0);
  const mid = (
    <div style={{ display: 'grid', gridTemplateColumns: `1fr ${royalW}px 1fr`, gap: 10, height: 108 }}>
      {top ? atk : def}
      <RoyalBox p={p} player={player} t={t} active={active} hl={h('royal')} w={royalW} fx={e.fx} />
      {top ? def : atk}
    </div>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {top ? <>{corr}{mid}{spell}</> : <>{spell}{mid}{corr}</>}
    </div>
  );
}

function Table({ board, prev, player, t, hl, turn, values, narrow, fx, ghostKey, ghostKind, flash, banner, clash }: {
  board: any[]; prev?: any[]; player: (id: string) => PlayerInfo | undefined; t: Translate; hl?: StepT['hl']; turn?: string; values?: boolean; narrow?: boolean;
  fx?: Record<string, Fx>; ghostKey?: string; ghostKind?: Ghosts['kind']; flash?: { p: string; z: Zone; key: string } | null; banner?: { key: string; text: string } | null;
  clash?: Clash | null;
}) {
  const [bottom, top] = board;
  // liegende (aufgedeckte) Werte immer zeigen; im Kampf inkl. „Alles auf Angriff/Abwehr“
  const v = (p: any) => {
    const st = visibleStats(p.zones);
    return values ? { str: st.str, blk: st.blk } : { str: st.baseStr, blk: st.baseBlk };
  };
  const se = (p: any): SideFx => ({
    hl, fx: fx?.[p.id], prev: prev?.find((x) => x.id === p.id), ghostKey, ghostKind, flash: flash && flash.p === p.id ? flash : null, clash,
  });
  return (
    <main style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, justifyContent: 'center' }}>
      <Side p={top} player={player(top.id)} t={t} top active={turn === top.id} values={v(top)} narrow={narrow} sfx={se(top)} />
      <div style={{ height: 2, background: 'linear-gradient(90deg, transparent, #4A4378, transparent)', margin: '1px 0' }} />
      <Side p={bottom} player={player(bottom.id)} t={t} active={turn === bottom.id} values={v(bottom)} narrow={narrow} sfx={se(bottom)} />
      {banner && (
        <span key={banner.key} className="display" style={{
          position: 'absolute', left: '50%', top: '50%', zIndex: 10, pointerEvents: 'none', fontSize: 64, fontWeight: 800, color: INK, background: GOLD,
          padding: '6px 40px', borderRadius: 22, boxShadow: '0 8px 0 #C79E1A, 0 20px 50px rgba(0,0,0,.6)', animation: 'kdBanner 1.1s ease-out forwards',
        }}>{banner.text}</span>
      )}
    </main>
  );
}

function JesterAside({ view, t, player }: { view: any; t: Translate; player: (id: string) => PlayerInfo | undefined }) {
  const bottom = view.jester === view.players[0];
  return (
    <aside style={{ width: 84, display: 'flex', flexDirection: 'column', justifyContent: bottom ? 'flex-end' : 'flex-start', alignItems: 'center', gap: 6, padding: bottom ? '0 0 120px' : '120px 0 0', color: GOLD }}>
      <div style={{ width: 58, height: 80, borderRadius: 10, background: '#2B2260', boxShadow: `inset 0 0 0 2px ${GOLD}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Jester size={34} /></div>
      <span style={{ fontSize: 12, fontWeight: 700, textAlign: 'center' }}>{t('jesterAt', { name: player(view.jester)?.name ?? '' })}</span>
    </aside>
  );
}

function DeckAside({ view, t }: { view: any; t: Translate }) {
  return (
    <aside style={{ width: 84, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 18 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <div style={{ position: 'relative', width: 58, height: 82 }}>
          <CardBack w={54} style={{ position: 'absolute', left: 4, top: 4 }} />
          <CardBack w={54} style={{ position: 'absolute', left: 0, top: 0 }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>{t('deck', { n: view.deck })}</span>
      </div>
      {view.discardTop && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <CardFace c={view.discardTop} w={50} style={{ transform: 'rotate(6deg)', opacity: 0.8 }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>{t('discard')}</span>
        </div>
      )}
    </aside>
  );
}

function HostPlan({ view, t, player }: HostViewProps) {
  const pk = view.placed?.k ?? 0;
  useEffect(() => {
    if (view.placed) sfx.custom((s) => ZONE_SFX[view.placed.zone as Zone](s));
  }, [pk]);
  useEffect(() => {
    sfx.custom((s) => s.tone(660, 0.12, { type: 'triangle', vol: 0.05 }));
  }, [view.turn]);
  const turnP = player(view.turn);
  return (
    <>
      <HostHeader title={t('title')} color={GOLD} info={`${t('round', { n: view.round })} · ${t('phase.plan')}`}
        right={turnP && <Pill color={turnP.color}><span key={view.turn} style={{ display: 'inline-block', animation: 'kdPop .4s ease-out' }}>{t('turn', { name: turnP.name })}</span></Pill>} />
      <div style={{ flex: 1, display: 'flex', gap: 14, minHeight: 0, marginTop: -12 }}>
        <JesterAside view={view} t={t} player={player} />
        <Table board={view.board} player={player} t={t} turn={view.turn} flash={view.placed ? { p: view.placed.p, z: view.placed.zone, key: String(pk) } : null}
          banner={view.round && !view.placed ? { key: 'r' + view.round, text: t('round', { n: view.round }) } : null} />
        <DeckAside view={view} t={t} />
      </div>
    </>
  );
}

/** Welcher Schritt der Auflösung ist gerade dran? (Schritte haben eigene Dauern) */
function useStepIndex(view: any) {
  const now = useServerNow(80);
  const steps: StepT[] = view.steps ?? [];
  const el = (now - view.startAt) / 1000;
  let idx = 0;
  steps.forEach((s, i) => {
    if ((s.at ?? 0) <= el) idx = i;
  });
  const last = steps[steps.length - 1];
  const total = last ? (last.at ?? 0) + (last.d ?? 1.5) : 0;
  return { idx, done: el >= total, started: el >= 0 };
}

function PhaseSteps({ phase, t, size = 15, noPlan }: { phase: string; t: Translate; size?: number; noPlan?: boolean }) {
  const cur = PHASES.indexOf(phase as any);
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
      {['plan', ...PHASES].map((p, i) => noPlan && !i ? null : (() => {
        const state = i - 1 < cur ? 'done' : i - 1 === cur ? 'now' : 'next';
        return (
          <span key={p} style={{
            fontSize: size, fontWeight: 700, padding: '4px 10px', borderRadius: 999, transition: 'background .3s, color .3s',
            background: state === 'now' ? GOLD : state === 'done' ? SURF2 : 'transparent', color: state === 'now' ? INK : state === 'done' ? '#E6E2FF' : '#6F68A0',
          }}>{t('phase.' + p)}</span>
        );
      })())}
    </div>
  );
}

/** Liste der Schritte mit Phasen-Zwischentiteln */
function StepList({ steps, idx, started, done, t, name, big }: { steps: StepT[]; idx: number; started: boolean; done: boolean; t: Translate; name: (id: string) => string; big?: boolean }) {
  return (
    <>
      {steps.slice(0, started ? idx + 1 : 0).map((s, i) => {
        if (s.k === 'phase' || i === 0) {
          const head = (
            <span key={'h' + i} className="display anim-up" style={{ fontSize: big ? 15 : 17, fontWeight: 800, color: GOLD, marginTop: i ? 6 : 0, textTransform: 'uppercase', letterSpacing: '.05em' }}>
              {t('phase.' + s.ph)}
            </span>
          );
          if (s.k === 'phase') return head;
          return [head, <StepLine key={i} s={s} cur={i === idx && !done} t={t} name={name} big={big} />];
        }
        return <StepLine key={i} s={s} cur={i === idx && !done} t={t} name={name} big={big} />;
      })}
    </>
  );
}

function StepLine({ s, cur, t, name, big }: { s: StepT; cur: boolean; t: Translate; name: (id: string) => string; big?: boolean }) {
  return (
    <div className="anim-up" style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: cur ? (big ? 18 : 16) : 14, lineHeight: 1.3, color: cur ? '#fff' : 'var(--muted)', fontWeight: cur ? 700 : 400 }}>
      <span style={{ width: 20, height: 20, borderRadius: '50%', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, background: cur ? GOLD : '#4BE3A1', color: INK, marginTop: 1 }}>{cur ? '▶' : '✓'}</span>
      {stepText(s, t, name)}
    </div>
  );
}

function HostResolve({ view, t, player }: HostViewProps) {
  const { idx, done, started } = useStepIndex(view);
  const steps: StepT[] = view.steps;
  const step: StepT | undefined = steps[idx];
  const name = (id: string) => player(id)?.name ?? '?';
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!started || !step) return;
    const fn = STEP_SFX[step.k];
    if (fn) sfx.custom((s) => fn(s, step.v));
  }, [idx, started, view.startAt]);
  useEffect(() => {
    if (done) sfx.custom((s) => [659, 880].forEach((f, i) => s.tone(f, 0.14, { type: 'triangle', vol: 0.07, at: i * 0.1 })));
  }, [done]);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [idx]);
  const board = step?.b ?? [];
  const prev = idx > 0 ? steps[idx - 1].b : undefined;
  const fx = useMemo(() => (started ? stepFx(step, idx, t) : {}), [idx, started, view.startAt]);
  const banner = started && step && (step.k === 'phase' || idx === 0) ? { key: `${view.startAt}-${idx}`, text: t('phase.' + step.ph) } : null;
  return (
    <>
      <HostHeader title={t('title')} color={GOLD} info={t('round', { n: view.round })} right={<PhaseSteps phase={step?.ph ?? 'reveal'} t={t} />} />
      <div style={{ flex: 1, display: 'flex', gap: 16, minHeight: 0, marginTop: -12 }}>
        {board.length === 2 && (
          <Table board={board} prev={started ? prev : undefined} player={player} t={t} hl={started ? step?.hl : undefined} values={step?.ph === 'fight'} narrow
            fx={fx} ghostKey={`${view.startAt}-${idx}`}
            clash={started && step && (step.k === 'hit' || step.k === 'miss') ? { key: `${view.startAt}-${idx}`, kind: step.k, a: step.v.p, d: step.v.t } : null} ghostKind={step?.k === 'shatter' || step?.k === 'spellCancel' ? 'shatter' : 'out'} banner={banner} />
        )}
        <aside style={{ width: 320, flex: 'none', background: SURF, borderRadius: 18, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
          <div ref={listRef} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
            <StepList steps={steps} idx={idx} started={started} done={done} t={t} name={name} />
          </div>
          <div style={{ borderTop: '1px solid #3A3366', paddingTop: 10, opacity: done ? 1 : 0.35, transition: 'opacity .3s' }}>
            <div style={{ fontSize: 14, color: done ? '#fff' : 'var(--muted)', fontWeight: done ? 700 : 400, marginBottom: 6 }}>{view.last ? t('next.tvResult') : t('next.tvEnd')}</div>
            <div style={{ display: 'flex', gap: 14 }}>
              {view.players.map((id: string) => {
                const ok = view.ready.includes(id) || player(id)?.isBot;
                return (
                  <span key={id + (ok ? 'y' : 'n')} style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, opacity: ok ? 1 : 0.6, animation: ok && done ? 'kdPop .4s ease-out' : undefined }}>
                    <Avatar player={player(id)} size={26} flat />{ok ? '✓' : t('next.wait')}
                  </span>
                );
              })}
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

function HostEnd({ view, t, player }: HostViewProps) {
  useEffect(() => sfx.play('fanfare'), []);
  const w = view.winner ? player(view.winner) : undefined;
  const wb = view.board.find((p: any) => p.id === view.winner);
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 22, textAlign: 'center' }}>
      {w && <Confetti pieces={36} silent />}
      {w ? (
        <div className="anim-pop" style={{ filter: 'drop-shadow(0 0 30px rgba(255,212,71,.5))' }}><Crowned player={w} royal={2} size={190} /></div>
      ) : (
        <div style={{ display: 'flex', gap: 40 }}>{view.players.map((id: string) => <Crowned key={id} player={player(id)} royal={2} size={140} fallen />)}</div>
      )}
      <h1 className="display anim-up" style={{ fontSize: 54, fontWeight: 800 }}>{w ? t('end.win', { name: w.name }) : t('end.draw')}</h1>
      <p className="muted" style={{ fontSize: 22 }}>
        {t('end.rounds', { n: view.round })}
        {wb && <> · {t('royal.' + wb.royal)} <Hearts hp={wb.hp} vit={wb.vit} size={20} /></>}
      </p>
    </div>
  );
}

/* ================= Handy ================= */

function Controller(props: ControllerViewProps) {
  return <><KdStyles /><PhoneScreen {...props} /></>;
}

function PhoneScreen(props: ControllerViewProps) {
  const { view, t, me } = props;
  switch (view.screen) {
    case 'intro':
      return <PhoneIntro {...props} />;
    case 'plan':
      return <PhonePlan {...props} />;
    case 'resolve':
      return <PhoneResolve {...props} />;
    case 'end':
      return (
        <div className="anim-fade" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, textAlign: 'center' }}>
          {view.won && <Confetti pieces={14} silent />}
          <Crowned player={me} royal={view.me.royal} size={120} fallen={!view.won && !view.draw} />
          <h1 style={{ fontSize: 34 }}>{view.draw ? t('phone.draw') : view.won ? t('phone.won') : t('phone.lost')}</h1>
        </div>
      );
    default:
      return <PhoneWait title={t('watch')} emoji={<Avatar player={me} size={96} />} />;
  }
}

function RulesOverlay({ t, onClose }: { t: Translate; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(17,13,36,.97)', overflowY: 'auto', padding: '18px 18px 90px' }}>
      <div style={{ maxWidth: 520, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h2 className="display" style={{ fontSize: 26 }}>{t('phone.rules')}</h2>
        <RulesGrid t={t} compact />
        {['turns', 'hit', 'corr', 'royals', 'tips'].map((k) => (
          <div key={k} style={{ background: SURF, borderRadius: 12, padding: '8px 12px', fontSize: 14, lineHeight: 1.35 }}>
            <b className="display" style={{ display: 'block', fontSize: 17 }}>{t('rules.' + k)}</b>{t(`rules.${k}.t`)}
          </div>
        ))}
        <p className="muted" style={{ fontSize: 13 }}>{t('jesterHelp')}</p>
      </div>
      <button type="button" className="up-btn" onClick={onClose} style={{ position: 'fixed', left: 18, right: 18, bottom: 18, maxWidth: 484, margin: '0 auto' }}>{t('phone.close')}</button>
    </div>
  );
}

function RulesButton({ t, onClick }: { t: Translate; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={t('phone.rules')}
      style={{ border: 0, background: SURF2, color: '#fff', borderRadius: 999, height: 34, padding: '0 12px', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }}>
      <span className="display" style={{ width: 20, height: 20, borderRadius: '50%', background: GOLD, color: INK, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800 }}>?</span>
      {t('phone.rules')}
    </button>
  );
}

function PhoneIntro({ view, t, me, send, player, room }: ControllerViewProps) {
  const [rules, setRules] = useState(false);
  const opp = player(view.opp.id) ?? room.players.find((p) => p.id === view.opp.id);
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, textAlign: 'center' }}>
      {rules && <RulesOverlay t={t} onClose={() => setRules(false)} />}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18 }}>
        <Crowned player={me} royal={0} size={84} />
        <span className="display" style={{ fontSize: 26, fontWeight: 800, paddingBottom: 26 }}>vs</span>
        <Crowned player={opp} royal={0} size={84} />
      </div>
      <h1 className="display" style={{ fontSize: 30 }}>{t('title')}</h1>
      <p style={{ maxWidth: 320, lineHeight: 1.4 }}>{t('phone.introText', { royal: t('royal.0'), hp: view.me.vit })}</p>
      <RulesButton t={t} onClick={() => setRules(true)} />
      {view.pressed ? (
        <p className="muted">{t('phone.waitOther', { name: opp?.name ?? '' })}</p>
      ) : (
        <button type="button" className="up-btn" style={{ width: '100%' }} onClick={() => { vibrate(20); send({ type: 'next' }); }}>{t('phone.start')}</button>
      )}
    </div>
  );
}

/** Kleine Übersicht über den Gegner oben auf dem Handy */
function OppStrip({ view, t, opp }: { view: any; t: Translate; opp?: PlayerInfo }) {
  const o = view.opp;
  const vis = (cs: AnyCard[]) => cs.filter((c) => c.s);
  const hid = (cs: AnyCard[]) => cs.filter((c) => !c.s).length;
  const z = o.zones;
  const zoneMini = (k: Zone, cs: AnyCard[]) => (
    <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 13, fontWeight: 700, color: ZONE_COLOR[k] }}>
      <Icon k={k === 'spell' ? 'spell' : k} size={14} />
      {vis(cs).map((c) => c.n).join(' ') || (hid(cs) ? '' : '–')}
      {hid(cs) > 0 && <span style={{ color: '#8F88B8' }}>{vis(cs).length ? ' ' : ''}+{hid(cs)}?</span>}
    </span>
  );
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: SURF, borderRadius: 14, padding: '6px 10px' }}>
      <Crowned player={opp} royal={o.royal} size={34} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 14 }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opp?.name}</span>
          <Hearts hp={o.hp} vit={o.vit} size={13} />
          <span className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{t('cards', { n: o.hand })}</span>
        </span>
        <span style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {zoneMini('atk', z.atk)}{zoneMini('def', z.def)}{zoneMini('spell', z.spell)}
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 13, fontWeight: 700, color: ZONE_COLOR.corr }}><Icon k="corr" size={14} />{o.corrupt ? '🔒' : `${z.corr.length}/${o.vit}`}</span>
        </span>
      </div>
      {view.jester && <Jester size={22} />}
    </div>
  );
}

function PhonePlan({ view, t, me, send, player, room }: ControllerViewProps) {
  const [planned, setPlanned] = useState<Record<number, Zone>>({});
  const [sel, setSel] = useState<number | null>(null);
  const [rules, setRules] = useState(false);
  const opp = player(view.opp.id) ?? room.players.find((p) => p.id === view.opp.id);
  const hand: Card[] = view.hand;
  const inHand = new Set(hand.map((c) => c.id));
  // geplante Karten, die nicht mehr auf der Hand sind (gelegt), vergessen
  const plan = useMemo(() => Object.fromEntries(Object.entries(planned).filter(([id]) => inHand.has(Number(id)))) as Record<number, Zone>, [planned, view.hand]);
  const planList = Object.entries(plan).map(([id, zone]) => ({ card: hand.find((c) => c.id === Number(id))!, zone: zone as Zone }));
  const zones: Zones = view.me.zones;
  const pv = useMemo(() => preview(zones, planList), [view.me, plan]);
  const now = useMemo(() => preview(zones, []), [view.me]);
  const keep = keepCount(view.me.corrupt);
  const toPlace = Math.max(0, hand.length - keep);
  const canConfirm = view.myTurn && view.canPlace && planList.length === 1;
  const selCard = hand.find((c) => c.id === sel) ?? null;

  // Du bist dran: kräftig vibrieren (Android; iPhones erlauben Websites kein Vibrieren)
  useEffect(() => { if (view.myTurn && view.canPlace) vibrate([120, 80, 120]); }, [view.myTurn]);

  function tapCard(c: Card) {
    if (plan[c.id]) {
      // geplante Karte zurück auf die Hand
      const n = { ...plan };
      delete n[c.id];
      setPlanned(n);
      setSel(null);
      return;
    }
    setSel(sel === c.id ? null : c.id);
  }
  function tapZone(z: Zone) {
    if (sel == null) return;
    if (z === 'corr' && view.me.corrupt) return;
    vibrate(15);
    setPlanned({ ...plan, [sel]: z });
    setSel(null);
  }
  function confirm() {
    if (!canConfirm) return;
    const { card, zone } = planList[0];
    vibrate(30);
    send({ type: 'place', card: card.id, zone });
  }

  const zoneTile = (z: Zone, style?: CSSProperties) => {
    const locked = z === 'corr' && view.me.corrupt;
    const existing: AnyCard[] = z === 'corr' ? zones.corr.map((c) => ({ ...c })) : zones[z];
    const plannedHere = planList.filter((p) => p.zone === z).map((p) => p.card);
    const role = selCard && !locked ? ROLE[selCard.s][z] : null;
    const target = sel != null && !locked;
    const all = [...existing, ...plannedHere];
    return (
      <button type="button" onClick={() => tapZone(z)} disabled={locked}
        style={{
          border: 0, borderRadius: 14, background: target ? '#2B2260' : SURF, color: '#fff', padding: '5px 6px', display: 'flex', flexDirection: 'column', gap: 3,
          boxShadow: target ? `inset 0 0 0 2px ${ZONE_COLOR[z]}` : undefined, opacity: locked ? 0.5 : 1, minWidth: 0, minHeight: 108, touchAction: 'manipulation', ...style,
        }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: ZONE_COLOR[z], whiteSpace: 'nowrap' }}>
          <Icon k={z === 'spell' ? 'spell' : z} size={13} />{locked ? t('zone.corrLocked') : t('zone.' + z)}
          {z === 'corr' && !locked && <span style={{ marginLeft: 'auto', color: '#fff' }}>{zones.corr.length + plannedHere.length}/{view.me.vit}</span>}
        </span>
        {role ? (
          <span style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: role === 'useless' ? '#8F88B8' : '#fff', textAlign: 'center', lineHeight: 1.15 }}>
            {t('rules.' + role)}
          </span>
        ) : (
          <Row cards={all} w={40} max={z === 'spell' || z === 'corr' ? 200 : 104} scope={`me:${z}`} render={(c) => {
            const isPlanned = plannedHere.some((p) => p.id === c.id);
            return (
              <span onClick={isPlanned ? (e) => { e.stopPropagation(); tapCard(c as Card); } : undefined} style={{ display: 'block' }}>
                <CardFace c={c} w={!isPlanned && c.id === topCardId(existing, z) ? 48 : 40} planned={isPlanned} mark={!!c.hidden && !isPlanned} />
              </span>
            );
          }} />
        )}
      </button>
    );
  };

  const oppName = opp?.name ?? '';
  let status: string;
  if (!view.canPlace) status = t('phone.done', { name: oppName });
  else if (!view.myTurn) status = planList.length ? t('phone.oppTurn', { name: oppName }) : `${t('phone.oppTurn', { name: oppName })} · ${t('phone.planAhead')}`;
  else if (planList.length === 1) status = t('phone.yourTurn');
  else if (planList.length > 1) status = t('phone.planOne');
  else status = t('phone.planHint');

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rules && <RulesOverlay t={t} onClose={() => setRules(false)} />}
      {view.myTurn && view.canPlace && (
        <div aria-hidden="true" style={{
          position: 'fixed', inset: 0, zIndex: 40, pointerEvents: 'none', border: `7px solid ${GOLD}`, borderRadius: 'max(0px, env(safe-area-inset-top))',
          boxShadow: `inset 0 0 40px rgba(255,212,71,.45)`, animation: 'kdTurn 1.6s ease-in-out infinite',
        }} />
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span className="display" style={{
          fontWeight: 800, fontSize: 17, padding: '5px 12px', borderRadius: 999,
          background: view.myTurn ? me.color : SURF2, color: view.myTurn ? INK : 'var(--muted)',
        }}>{view.myTurn ? t('phone.yourTurn') : t('phone.oppTurn', { name: oppName })}</span>
        <RulesButton t={t} onClick={() => setRules(true)} />
      </div>
      <OppStrip view={view} t={t} opp={opp} />
      {/* eigenes Feld als Kreuz – wie am Tisch: Zauber oben, Verteidigung links, Angriff rechts, Korruption unten */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 86px 1fr', gridTemplateRows: 'auto auto auto', gap: 6 }}>
        {zoneTile('spell', { gridColumn: '1 / 4', justifySelf: 'center', width: '62%' })}
        {zoneTile('def')}
        <div style={{ background: SURF2, borderRadius: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, padding: 4 }}>
          <Crowned player={me} royal={view.me.royal} size={50} />
          <span style={{ fontSize: 11, fontWeight: 700 }}>{t('royal.' + view.me.royal)}</span>
          <Hearts hp={view.me.hp} vit={view.me.vit} size={11} />
          {view.jester && <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700, color: GOLD }}><Jester size={14} />{t('jester')}</span>}
        </div>
        {zoneTile('atk')}
        {zoneTile('corr', { gridColumn: '1 / 4', justifySelf: 'center', width: '62%', minHeight: 80 })}
      </div>
      <div style={{ textAlign: 'center', fontSize: 14, fontWeight: 700 }}>
        <span style={{ color: SUIT.sw.c }}>{t('str', { n: pv.str })}</span>
        <span className="muted"> · </span>
        <span style={{ color: SUIT.sh.c }}>{t('blk', { n: pv.blk })}</span>
        {planList.length > 0 && (pv.str !== now.str || pv.blk !== now.blk) && <span className="muted" style={{ fontWeight: 500 }}> ({t('phone.previewNow', { str: now.str, blk: now.blk })})</span>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--muted)', fontWeight: 700 }}>
        <span>{t('phone.hand')}</span>
        <span>{view.canPlace ? t(keep > 1 ? 'phone.keep2' : 'phone.keep', { n: toPlace, keep }) : ''}</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, justifyContent: 'center', minHeight: 96, paddingTop: 8 }}>
        {hand.filter((c) => !plan[c.id]).sort((a, b) => a.s.localeCompare(b.s) || a.n - b.n).map((c) => (
          <AnimCard key={c.id} k={`hand:${c.id}`} face><CardFace c={c} w={hand.length > 6 ? 52 : 62} selected={sel === c.id} onClick={() => tapCard(c)} /></AnimCard>
        ))}
      </div>
      {view.me.corrupt && <p style={{ fontSize: 12, color: '#C4B2FF', textAlign: 'center' }}>{t('phone.corruptNote')}</p>}
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {planList.length > 0 && <p className="muted" style={{ textAlign: 'center', fontSize: 12 }}>{t('phone.tapBack')}</p>}
        <p style={{ textAlign: 'center', fontSize: 14, fontWeight: 700, minHeight: 18, color: canConfirm ? '#fff' : 'var(--muted)' }}>{status}</p>
        <button type="button" className="up-btn" disabled={!canConfirm} onClick={confirm} style={{ width: '100%', opacity: canConfirm ? 1 : 0.4 }}>
          {view.canPlace && !view.myTurn ? t('phone.oppTurn', { name: oppName }) : t('phone.place')}
        </button>
      </div>
    </div>
  );
}

function PhoneResolve({ view, t, send, player, room }: ControllerViewProps) {
  const { idx, done, started } = useStepIndex(view);
  const name = (id: string) => (player(id) ?? room.players.find((p) => p.id === id))?.name ?? '?';
  const steps: StepT[] = view.steps;
  const step: StepT | undefined = steps[idx];
  const opp = player(view.opp.id) ?? room.players.find((p) => p.id === view.opp.id);
  const meNow = step?.b.find((p: any) => p.id === view.me.id) ?? view.me;
  const oppNow = step?.b.find((p: any) => p.id === view.opp.id) ?? view.opp;
  const fx = useMemo(() => (started ? stepFx(step, idx, t) : {}), [idx, started, view.startAt]);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!started || !step) return;
    const v = step.v ?? {};
    if (step.k === 'hit' && v.t === view.me.id) vibrate([70, 40, 70]);
    else if (step.k === 'hit') vibrate(25);
    else if (step.k === 'royalFalls' || step.k === 'kingFalls') vibrate([40, 30, 40, 30, 120]);
  }, [idx, started]);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [idx]);
  useEffect(() => { if (done) vibrate(30); }, [done]);
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0, maxHeight: 'calc(100dvh - 40px)' }}>
      <PhaseSteps phase={step?.ph ?? 'reveal'} t={t} size={13} noPlan />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, paddingTop: 14 }}>
        {[meNow, oppNow].map((p: any, i: number) => {
          const pl = i ? opp : player(view.me.id);
          const vs = visibleStats(p.zones);
          const f = fx[p.id];
          return (
            <div key={p.id} style={{ position: 'relative' }}>
              <Bubble fx={f} />
              <div key={f?.shake || f?.glow ? f.key : 'calm'} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: SURF, borderRadius: 14, padding: '10px 8px',
                ...(f?.glow ? { ['--kd-glow' as any]: f.glow } : {}),
                animation: [f?.shake && 'kdShake .6s ease-out', f?.glow && 'kdGlow 1.3s ease-out'].filter(Boolean).join(', ') || undefined,
              }}>
                <span key={p.royal} style={{ display: 'inline-flex', animation: 'kdRoyal .8s ease-out' }}><Crowned player={pl} royal={p.royal} size={54} fallen={p.hp <= 0} /></span>
                <span style={{ fontWeight: 700, fontSize: 14, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pl?.name}</span>
                <Hearts hp={p.hp} vit={p.vit} size={15} />
                {step?.ph !== 'reveal' && (
                  <span style={{ fontSize: 12, fontWeight: 700 }}>
                    <span style={{ color: SUIT.sw.c }}>{t('str', { n: vs.str })}</span> · <span style={{ color: SUIT.sh.c }}>{t('blk', { n: vs.blk })}</span>
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div ref={listRef} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', minHeight: 0 }}>
        <StepList steps={steps} idx={idx} started={started} done={done} t={t} name={name} big />
      </div>
      {view.pressed ? (
        <p className="muted" style={{ textAlign: 'center' }}>{t('phone.waitOther', { name: opp?.name ?? '' })}</p>
      ) : (
        <button type="button" className="up-btn" disabled={!done} onClick={() => { vibrate(20); send({ type: 'next' }); }} style={{ width: '100%', opacity: done ? 1 : 0.4, flex: 'none' }}>
          {done ? (view.last ? t('phone.toResult') : t('phone.nextRound')) : t('phone.watching')}
        </button>
      )}
    </div>
  );
}

export default { Host, Controller } satisfies GameClientModule;
