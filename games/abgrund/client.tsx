import { createContext, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { ControllerViewProps, GameClientModule, HostViewProps, PlayerInfo, Translate } from '@up/sdk';
import { HostTimer, PhoneTimer, sfx, useServerNow, vibrate, type MusicTrack } from '@up/ui';

/* ================= Stil ================= */

const IMG = (name: string) => `/game/abgrund/bilder/${name}.webp`;
const C = {
  ground: '#0f0b08', paper: '#e9dbb8', paper2: '#e3d3ad', ink: '#1c140d', muted: '#b7a888', blood: '#a3171c', bright: '#c4161c',
  wax: '#8e1a17', bronze: '#8a6440', gold: '#b8893c', green: '#4f6b2a', blue: '#3e6fb0', purple: '#7a4fb0',
};
/** Seltenheit als kleiner Edelstein unten auf der Karte (Basis: keiner) */
const RARITY: Record<string, string> = { common: '#8a8172', uncommon: '#c9d2d8', rare: C.gold, legendary: '#e0702a' };
/** Kartenrahmen nach Seltenheit: Basis dunkel, gewöhnlich eisengrau, ungewöhnlich blau, selten lila, legendär gold */
const FRAME: Record<string, string> = { basis: '#4a3b29', common: '#8a8172', uncommon: '#4f86c6', rare: '#9a63d1', legendary: '#e0b040' };
const frameOf = (r?: string) => FRAME[r ?? 'basis'] ?? FRAME.basis;
const frameGlow = (r?: string) => (r === 'legendary' ? '0 0 16px 3px rgba(224,176,64,.75), ' : r === 'rare' ? '0 0 12px 2px rgba(154,99,209,.6), ' : r === 'uncommon' ? '0 0 8px 1px rgba(79,134,198,.45), ' : '');

/** Glitzernde Funken am Kartenrand (ungewöhnlich wenig, selten mehr, legendär viele) */
const SPARK_SPOTS = [[6, -3], [94, 8], [-3, 38], [103, 55], [30, 101], [78, 99], [-2, 82], [101, 24], [50, -3], [12, 60], [88, 78], [60, 102]];
function Sparkles({ r, size = 1 }: { r?: string; size?: number }) {
  const n = r === 'legendary' ? 12 : r === 'rare' ? 7 : r === 'uncommon' ? 3 : 0;
  if (!n) return null;
  const col = r === 'legendary' ? '#fff1b8' : r === 'rare' ? '#e6d2ff' : '#d6e8ff';
  return (
    <span aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2 }}>
      {SPARK_SPOTS.slice(0, n).map(([x, y], i) => (
        <svg key={i} width={9 * size} height={9 * size} viewBox="0 0 10 10" style={{ position: 'absolute', left: `${x}%`, top: `${y}%`, marginLeft: -4.5 * size, marginTop: -4.5 * size, animation: `abSparkle ${1.6 + (i % 4) * 0.45}s ease-in-out ${(i * 0.37) % 2}s infinite`, filter: `drop-shadow(0 0 3px ${col})` }}>
          <path d="M5 0 L6 4 L10 5 L6 6 L5 10 L4 6 L0 5 L4 4 Z" fill={col} />
        </svg>
      ))}
    </span>
  );
}
const RARITY_NAME: Record<string, string> = { common: 'gewöhnlich', uncommon: 'ungewöhnlich', rare: 'selten', legendary: 'legendär' };
/** Klassenfarben (Stahlblau, Nachtviolett, Moosgrün) */
const CLASS_COLOR: Record<string, string> = { schildwacht: '#3A5A78', klingenlaeufer: '#5B3A6E', kraeuterkundige: '#4F6B35' };
const classColor = (cls?: string) => (cls && CLASS_COLOR[cls]) || '#6b5236';
/** dunklere Variante (Rahmen außen, Siegel) */
const darker = (hex: string, f = 0.7) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = (x: number) => Math.round(x * f).toString(16).padStart(2, '0');
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
};
/** (früher: Edelstein für die Seltenheit – jetzt zeigt der Rahmen sie) */
function RarityGem({ r, size = 10 }: { r?: string; size?: number }) {
  if (!r || !RARITY[r]) return null;
  return <span role="img" aria-label={RARITY_NAME[r]} style={{ width: size, height: size, transform: 'rotate(45deg)', background: RARITY[r], boxShadow: '0 0 0 1.5px rgba(28,20,13,.75), inset -2px -2px 0 rgba(0,0,0,.2)', flexShrink: 0 }} />;
}
/** Fehlt ein Bild (z. B. noch nicht erzeugt): Ersatzbild oder ausblenden */
const fallbackTo = (name?: string) => (ev: { currentTarget: HTMLImageElement }) => {
  const t = ev.currentTarget;
  if (name && !t.dataset.fb) { t.dataset.fb = '1'; t.src = IMG(name); } else t.style.visibility = 'hidden';
};
const DISPLAY = "'IM Fell English SC', 'IM Fell English', 'Palatino Linotype', 'Book Antiqua', Georgia, serif";
const FELL = "'IM Fell English', 'Palatino Linotype', 'Book Antiqua', Georgia, serif";
const BODY = "'Crimson Pro', 'Palatino Linotype', 'Book Antiqua', Georgia, serif";

/** Schriften: von Google Fonts, wenn Internet da ist – sonst ähnliche Systemschriften */
function useFonts() {
  useEffect(() => {
    if (document.getElementById('abgrund-fonts')) return;
    const l = document.createElement('link');
    l.id = 'abgrund-fonts';
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=IM+Fell+English:ital@0;1&family=IM+Fell+English+SC&family=Crimson+Pro:wght@400;600;700&display=swap';
    document.head.appendChild(l);
  }, []);
}

const TORN = 'polygon(0 6%,4% 0,30% 5%,55% 0,80% 6%,100% 2%,98% 50%,100% 96%,70% 100%,40% 95%,12% 100%,0 94%,3% 50%)';
const TORN2 = 'polygon(0 8%,10% 0,45% 6%,75% 0,100% 7%,99% 55%,100% 100%,60% 94%,25% 100%,0 92%,2% 45%)';

function Styles() {
  return (
    <style>{`
.ab-sc{font-family:${DISPLAY}}
.ab-fell{font-family:${FELL}}
.ab-fig{position:absolute;filter:drop-shadow(0 14px 12px rgba(0,0,0,.65))}
@keyframes abSway{0%,100%{transform:rotate(-1.2deg)}50%{transform:rotate(1.2deg) translateY(-2px)}}
@keyframes abPop{0%{transform:scale(.3);opacity:0}60%{transform:scale(1.25);opacity:1}100%{transform:scale(1)}}
@keyframes abShake{0%,100%{transform:translateX(0)}15%{transform:translateX(-12px) rotate(-3deg)}35%{transform:translateX(10px) rotate(3deg)}55%{transform:translateX(-7px)}75%{transform:translateX(4px)}}
@keyframes abLungeUp{0%,100%{transform:translateY(0)}35%{transform:translateY(-70px) rotate(-6deg) scale(1.06)}55%{transform:translateY(-55px)}}
@keyframes abLungeDown{0%,100%{transform:translateY(0)}35%{transform:translateY(80px) scale(1.06)}55%{transform:translateY(64px)}}
@keyframes abFloat{0%{transform:translate(-50%,0) scale(.5);opacity:0}15%{transform:translate(-50%,-10px) scale(1.15);opacity:1}75%{opacity:1}100%{transform:translate(-50%,-70px);opacity:0}}
@keyframes abBanner{0%{opacity:0;transform:translate(-50%,-50%) scale(.5) rotate(-4deg)}22%{opacity:1;transform:translate(-50%,-50%) scale(1.08)}35%{transform:translate(-50%,-50%) scale(1)}80%{opacity:1}100%{opacity:0}}
@keyframes abTearL{0%{transform:none;opacity:1}100%{transform:translate(-60px,40px) rotate(-25deg);opacity:0}}
@keyframes abTearR{0%{transform:none;opacity:1}100%{transform:translate(60px,40px) rotate(25deg);opacity:0}}
@keyframes abInk{0%{transform:scale(.2);opacity:0}25%{transform:scale(1.1);opacity:.9}100%{transform:scale(1);opacity:0}}
@keyframes abGlow{0%,100%{box-shadow:0 0 0 0 transparent}40%{box-shadow:0 0 28px 6px var(--ab-glow)}}
@keyframes abCandle{0%,100%{transform:scaleY(1)}50%{transform:scaleY(1.12) translateY(-1px)}}
@keyframes abFade{from{opacity:0}to{opacity:1}}
@keyframes abSparkle{0%,100%{opacity:0;transform:scale(.3) rotate(0deg)}45%{opacity:1;transform:scale(1) rotate(45deg)}70%{opacity:.6;transform:scale(.7) rotate(90deg)}}
@keyframes abRise{0%{transform:translateY(420px);opacity:0}30%{opacity:1}100%{transform:translateY(0)}}
`}</style>
  );
}

/* ================= Klänge ================= */

type Synth = Parameters<Parameters<typeof sfx.custom>[0]>[0];
const SFX: Record<string, (s: Synth, n?: number) => void> = {
  paper: (s) => s.noise(0.18, { filter: 2400, type: 'bandpass', sweepTo: 900, vol: 0.12 }),
  tier: (s) => { s.tone(196, 0.5, { type: 'triangle', vol: 0.09 }); s.tone(294, 0.6, { type: 'triangle', vol: 0.07, at: 0.12 }); s.noise(0.3, { filter: 1500, type: 'bandpass', vol: 0.06 }); },
  hit: (s, n = 1) => {
    for (let i = 0; i < Math.min(6, n); i++) { s.noise(0.12, { filter: 1200, type: 'lowpass', vol: 0.3, at: i * 0.12 }); s.tone(140, 0.15, { vol: 0.25, to: 60, at: i * 0.12 }); }
    s.noise(0.35, { filter: 700, type: 'lowpass', vol: 0.45, at: Math.min(6, n) * 0.12 + 0.1 });
    s.tone(90, 0.4, { vol: 0.4, to: 35, at: Math.min(6, n) * 0.12 + 0.1 });
  },
  ink: (s) => { s.noise(0.25, { filter: 900, type: 'bandpass', sweepTo: 300, vol: 0.2 }); },
  tear: (s) => { s.noise(0.45, { filter: 2500, type: 'bandpass', sweepTo: 5000, vol: 0.3 }); },
  block: (s) => { s.tone(150, 0.2, { vol: 0.3, to: 80 }); s.noise(0.1, { filter: 800, type: 'lowpass', vol: 0.2 }); },
  heal: (s) => [523, 659, 784].forEach((f, i) => s.tone(f, 0.3, { type: 'triangle', vol: 0.06, at: i * 0.08 })),
  enemy: (s) => { s.tone(70, 0.5, { type: 'sawtooth', vol: 0.12, to: 45 }); s.noise(0.4, { filter: 500, type: 'lowpass', vol: 0.35, at: 0.3 }); s.tone(110, 0.35, { vol: 0.35, to: 40, at: 0.3 }); },
  blocked: (s) => { s.tone(1760, 0.4, { type: 'square', vol: 0.04, at: 0.3 }); s.noise(0.08, { filter: 5000, type: 'highpass', vol: 0.15, at: 0.3 }); },
  poison: (s) => { for (let i = 0; i < 4; i++) s.tone(300 - i * 30, 0.2, { vol: 0.06, at: i * 0.1, to: 200 - i * 20 }); },
  win: (s) => [262, 330, 392, 523].forEach((f, i) => s.tone(f, 0.6, { type: 'triangle', vol: 0.1, at: i * 0.18 })),
  lose: (s) => [330, 311, 294, 220].forEach((f, i) => s.tone(f, 0.7, { type: 'sawtooth', vol: 0.06, at: i * 0.35 })),
  ready: (s) => s.tone(880, 0.12, { type: 'triangle', vol: 0.05 }),
  stun: (s) => [1200, 900, 1200].forEach((f, i) => s.tone(f, 0.1, { type: 'triangle', vol: 0.05, at: i * 0.1 })),
};
const play = (k: keyof typeof SFX, n?: number) => sfx.custom((s) => SFX[k](s, n));

/** Düsteres, ruhiges Brummen mit gelegentlichen tiefen Glocken */
const DRONE: MusicTrack = {
  bpm: () => 56,
  step(s, i) {
    if (i % 16 === 0) { s.tone(55, 3.8, { type: 'sawtooth', vol: 0.035, attack: 1.2 }); s.tone(82.4, 3.8, { type: 'sine', vol: 0.05, attack: 1.2 }); }
    if (i % 32 === 8) s.tone(i % 64 === 8 ? 220 : 196, 2.5, { type: 'triangle', vol: 0.03, attack: 0.02 });
    if (i % 8 === 4) s.noise(1.5, { filter: 300, type: 'lowpass', vol: 0.02 });
  },
};

/* ================= Gemeinsame Bausteine ================= */

interface St { poison: number; weak: number; vuln: number; mark: number; stun: number }

function Seals({ st, size = 28 }: { st: St; size?: number }) {
  const items: [string, number, string][] = [];
  if (st.poison) items.push(['Gift', st.poison, C.green]);
  if (st.weak) items.push(['Schwächung', st.weak, '#6b5d45']);
  if (st.vuln) items.push(['Verwundbar', st.vuln, '#8a1a1a']);
  if (st.mark) items.push(['Markiert', st.mark, C.gold]);
  if (st.stun) items.push(['Betäubt', st.stun, C.purple]);
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {items.map(([name, n, col]) => (
        <span key={name} title={`${name} ${n}`} aria-label={`${name} ${n}`} style={{
          width: size, height: size, borderRadius: '50%', background: col, color: '#f3e6c8', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: BODY, fontWeight: 700, fontSize: size * 0.5, boxShadow: 'inset 0 0 0 3px rgba(0,0,0,.25), 0 2px 4px rgba(0,0,0,.5)', animation: 'abPop .4s ease-out',
        }}>{name[0]}{n > 1 ? n : ''}</span>
      ))}
    </div>
  );
}

function Bar({ v, max, h = 9 }: { v: number; max: number; h?: number }) {
  return (
    <div style={{ height: h, background: '#3a2a1d', border: `1px solid ${C.ink}`, position: 'relative' }}>
      <i style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.max(0, Math.min(100, (v / max) * 100))}%`, background: C.blood, transition: 'width .5s' }} />
    </div>
  );
}

const SwordIcon = ({ size = 22, color = C.ink }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14.5 17.5L3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2" /></svg>
);
const ShieldIcon = ({ size = 18, color = C.ink }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" aria-hidden="true"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /></svg>
);
const SkullIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3a7 7 0 0 0-7 7c0 2.6 1.3 4.2 3 5v3h8v-3c1.7-.8 3-2.4 3-5a7 7 0 0 0-7-7z" /><circle cx="9.5" cy="10.5" r="1.4" /><circle cx="14.5" cy="10.5" r="1.4" /><path d="M10 21h4" /></svg>
);
const SpeedIcon = ({ speed, size = 18 }: { speed: string; size?: number }) => speed === 'fast'
  ? <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="schnell"><path d="M13 2L4 14h7l-1 8 9-12h-7z" fill={C.wax} /></svg>
  : speed === 'slow'
    ? <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth="2" role="img" aria-label="langsam"><path d="M6 3h12M6 21h12M7 3c0 6 10 6 10 9s-10 3-10 9M17 3c0 6-10 6-10 9" /></svg>
    : null;

/** Stärke: angespannter Arm */
const StrengthIcon = ({ size = 18, color = C.ink }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3.5 20.5c-.6-3.6.3-6.6 2.4-8.6l2.6-5.6c.5-1.1 1.6-1.6 2.7-1.2l1.6.6c.7.3.9 1.1.5 1.7l-1.4 2.1 1.1 1.5c2.2-1.6 5.3-1.6 7 .4 1.8 2.1 1.4 5.4-1 7.1-1.9 1.4-4.4 1.6-6.6 1.3-3-.4-6-.4-8.9.7z" fill={color} />
    <path d="M14 12.6c1.3-.5 2.8-.3 3.6.7" fill="none" stroke={color === C.ink ? C.paper : C.ink} strokeWidth="1.3" strokeLinecap="round" opacity=".7" />
  </svg>
);

/** Absicht eines Gegners mit Symbolen: Schwert = Schaden, Schild = Block, Totenkopf = Schwächung, Arm = Stärke */
function IntentIcons({ it, size = 20, font = 22 }: { it: any; size?: number; font?: number }) {
  const seg = (k: string, icon: ReactNode, text: string, color: string = C.ink) => (
    <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(size * 0.15), whiteSpace: 'nowrap' }}>
      {icon}<span className="ab-sc" style={{ fontSize: font, lineHeight: 1, color }}>{text}</span>
    </span>
  );
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(size * 0.45) }}>
      {it.dmg > 0 && seg('d', <SwordIcon size={size} color={C.blood} />, `${it.dmg}${it.hits > 1 ? '×' + it.hits : ''}`, C.blood)}
      {it.block > 0 && seg('b', <ShieldIcon size={size} />, String(it.block))}
      {it.weakAll > 0 && seg('w', <SkullIcon size={size} />, 'Schwäche', C.ink)}
      {it.buff > 0 && seg('s', <StrengthIcon size={size} />, `+${it.buff}`)}
      {it.poison > 0 && seg('p', <MiniSeal l="G" col={C.green} size={size} />, String(it.poison), C.green)}
      {it.vuln > 0 && !it.dmg && seg('v', <MiniSeal l="V" col="#8a1a1a" size={size} />, String(it.vuln), '#8a1a1a')}
      {it.vulnAll > 0 && seg('va', <MiniSeal l="V" col="#8a1a1a" size={size} />, 'alle', '#8a1a1a')}
      {it.healAlly > 0 && seg('h', <HeartIcon size={size} />, `+${it.healAlly}`, C.green)}
      {it.blockAllies > 0 && seg('ba', <ShieldIcon size={size} />, `${it.blockAllies} alle`)}
      {it.spawn > 0 && seg('sp', <SkullIcon size={size} />, `Brut ×${it.spawn}`)}
      {it.charge && seg('c', <FlameIcon size={size} />, 'lädt auf!', C.blood)}
      {it.curse && seg('cu', <MiniSeal l="?" col="#4a2a5a" size={size} />, 'Fluch', '#4a2a5a')}
    </span>
  );
}

/** Erklärungen der Schlüsselwörter (Karten, Zustände, Gegner) */
const KEYWORDS: { key: string; name: string; re: RegExp; text: string }[] = [
  { key: 'fast', name: 'Schnell', re: /^$/, text: 'Wird zuerst ausgeführt – vor allen normalen Karten.' },
  { key: 'slow', name: 'Langsam', re: /^$/, text: 'Wird zuletzt ausgeführt – nach allen normalen Karten, aber noch vor den Gegnern.' },
  { key: 'block', name: 'Block', re: /Block/, text: 'Fängt so viel Schaden ab. Dein Block verfällt am Ende der Runde.' },
  { key: 'poison', name: 'Gift', re: /Gift/, text: 'Am Rundenende verliert das Ziel so viele Leben wie es Gift hat, danach sinkt das Gift um 1.' },
  { key: 'weak', name: 'Schwächung', re: /Schwächung/, text: 'Das Ziel macht 25 % weniger Schaden. Hält so viele Runden, wie die Zahl angibt.' },
  { key: 'vuln', name: 'Verwundbar', re: /verwundbar|Verwundbar/, text: 'Das Ziel erleidet 50 % mehr Schaden. Hält so viele Runden, wie die Zahl angibt.' },
  { key: 'mark', name: 'Markiert', re: /markiert|Markiert/, text: 'Jeder Treffer gegen das Ziel macht so viel Schaden mehr. Gilt bis zum Rundenende.' },
  { key: 'stun', name: 'Betäubt', re: /betäub|Betäub/, text: 'Setzt seine nächste Aktion aus.' },
  { key: 'thorns', name: 'Gegenwehr', re: /Schaden zurück/, text: 'Greift dich ein Gegner diese Runde an, erleidet er diesen Schaden.' },
  { key: 'redirect', name: 'Abfangen', re: /treffen diese Runde dich/, text: 'Angriffe auf den Verbündeten treffen stattdessen dich. Angriffe auf alle sind davon ausgenommen.' },
  { key: 'str', name: 'Stärke', re: /Stärke/, text: 'Jeder Treffer macht so viel Schaden mehr. Hält bis zum Ende des Kampfes.' },
  { key: 'power', name: 'Bis Kampfende', re: /Bis Kampfende/, text: 'Wirkt sofort und dann zu Beginn jeder Runde, bis der Kampf vorbei ist.' },
];
const KW = Object.fromEntries(KEYWORDS.map((k) => [k.key, k]));

function cardKeywords(c: any) {
  const out = [] as typeof KEYWORDS;
  if (c.speed === 'fast') out.push(KW.fast);
  if (c.speed === 'slow') out.push(KW.slow);
  for (const k of KEYWORDS) if (k.re.source !== '^$' && k.re.test(c.text)) out.push(k);
  return out;
}

function KeywordList({ items, dark }: { items: { name: string; text: string }[]; dark?: boolean }) {
  if (!items.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: dark ? '#2a1f16' : C.paper2, color: dark ? C.paper : C.ink, border: dark ? '1px solid #5b452f' : 0, padding: '10px 12px' }}>
      {items.map((k) => (
        <div key={k.name} style={{ fontSize: 15.5, lineHeight: 1.3 }}><b className="ab-sc" style={{ fontSize: 16 }}>{k.name}:</b> {k.text}</div>
      ))}
    </div>
  );
}

/** Text einer Gegnerabsicht */
function intentText(it: any, name: (id: string) => string, short = false) {
  const parts: string[] = [];
  if (it.dmg) parts.push(`${it.dmg}${it.hits > 1 ? '×' + it.hits : ''}`);
  if (it.block) parts.push(`${it.block} Block`);
  if (it.weakAll) parts.push('Schwächung');
  if (it.buff) parts.push(`+${it.buff} Stärke`);
  if (it.poison) parts.push(`${it.poison} Gift`);
  if (it.vulnAll) parts.push('alle verwundbar');
  if (it.healAlly) parts.push(`heilt ${it.healAlly}`);
  if (it.charge) parts.push('lädt auf');
  if (it.curse) parts.push('unbekannter Fluch');
  const everyone = it.all || it.weakAll || it.vulnAll;
  const who = everyone ? 'alle' : it.targets?.length ? name(it.targets[0]) : '';
  return { main: parts.join(' · '), who: short ? who : who ? (everyone ? 'auf alle' : `auf ${who}`) : '' };
}

/* ================= TV ================= */

/** Begleiter (vom Spiel gesteuert) wie Spieler nachschlagen */
function withComps<P extends { view: any; player: (id: string) => PlayerInfo | undefined }>(props: P): P {
  const comps: any[] = props.view?.comps ?? [];
  if (!comps.length) return props;
  return {
    ...props,
    player: (id: string) => props.player(id) ?? (() => {
      const c = comps.find((x) => x.id === id);
      return c ? ({ id: c.id, name: c.name, color: c.color, isBot: true, connected: true, comp: true } as unknown as PlayerInfo) : undefined;
    })(),
  };
}

function Host(props0: HostViewProps) {
  useFonts();
  const props = withComps(props0);
  const { view } = props;
  useEffect(() => {
    sfx.startMusic(DRONE);
    return () => sfx.stopMusic();
  }, []);
  return (
    <div style={{ position: 'absolute', inset: 0, background: C.ground, color: C.paper, fontFamily: BODY, overflow: 'hidden' }}>
      <Styles />
      {view.phase === 'lager' && <HostLager {...props} />}
      {view.phase === 'map' && <HostMap {...props} />}
      {(view.phase === 'plan' || view.phase === 'resolve') && <HostFight {...props} />}
      {view.phase === 'reward' && <HostReward {...props} />}
      {view.phase === 'shop' && <HostShop {...props} />}
      {view.phase === 'camp' && <HostCamp {...props} />}
      {view.phase === 'event' && <HostEvent {...props} />}
      {view.phase === 'treasure' && <HostTreasure {...props} />}
      {view.phase === 'bossIntro' && <HostBossIntro {...props} />}
      {view.phase === 'end' && <HostEnd {...props} />}
    </div>
  );
}

function Backdrop({ img, opacity = 0.5 }: { img: string; opacity?: number }) {
  return (
    <>
      <img src={IMG(img)} alt="" style={{ position: 'absolute', inset: 0, width: 1280, height: 720, objectFit: 'cover', opacity }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 70% 65% at 50% 45%, rgba(15,11,8,0) 0%, rgba(15,11,8,.55) 70%, rgba(15,11,8,.95) 100%)' }} />
    </>
  );
}

const CLASS_NAME: Record<string, string> = { schildwacht: 'Schildwacht', klingenlaeufer: 'Klingenläufer', kraeuterkundige: 'Kräuterkundige' };
const CLASS_IMG: Record<string, string> = { schildwacht: 'held-schildwacht-2', klingenlaeufer: 'held-klingenlaeufer-2', kraeuterkundige: 'held-kraeuterkundige-2' };

function HostLager({ view, player }: HostViewProps) {
  const chosen = view.players.filter((p: any) => p.cls);
  return (
    <>
      <Backdrop img="hintergrund-lager" opacity={0.62} />
      <div style={{ position: 'absolute', left: 60, top: 46, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span className="ab-sc" style={{ fontSize: 96, letterSpacing: 10, lineHeight: 1, textShadow: '0 6px 18px rgba(0,0,0,.8)' }}>Abgrund</span>
        <span className="ab-fell" style={{ fontSize: 24, fontStyle: 'italic', color: '#c8b993' }}>Das Lager am Rand der Tiefe</span>
      </div>
      {/* Figuren am Feuer */}
      {chosen.slice(0, 6).map((p: any, i: number) => (
        <img key={p.id} className="ab-fig" src={IMG(CLASS_IMG[p.cls])} alt={CLASS_NAME[p.cls]}
          style={{ left: 120 + i * 105 + (i % 2) * 20, top: 400 + (i % 2) * 30, height: 200 - (i % 2) * 20, animation: `abSway ${3 + i * 0.4}s ease-in-out infinite`, transformOrigin: 'bottom center' }} />
      ))}
      <section style={{ position: 'absolute', right: 60, top: 60, width: 380, padding: '22px 26px 26px', background: C.paper, color: C.ink, clipPath: TORN, display: 'flex', flexDirection: 'column', gap: 10, boxShadow: '0 8px 18px rgba(0,0,0,.6)' }}>
        <span className="ab-sc" style={{ fontSize: 26 }}>Die Gruppe</span>
        {view.players.map((p: any) => {
          const pl = player(p.id);
          return (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: view.players.length > 9 ? 17 : 19 }}>
              <span className="ab-sc" style={{ color: shadeDark(pl?.color), width: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pl?.name}{(pl as any)?.comp ? <i className="ab-fell" style={{ fontSize: 14, color: '#6b5d45' }}> · Begleiter</i> : null}</span>
              <span className="ab-fell" style={{ flex: 1, fontStyle: 'italic', color: p.cls ? classColor(p.cls) : '#6b5d45', fontWeight: p.cls ? 600 : 400 }}>{p.cls ? CLASS_NAME[p.cls] : 'wählt noch …'}</span>
              {p.ready && <span style={{ width: 26, height: 26, borderRadius: '50%', background: '#7a2416', color: '#f3e6c8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>✓</span>}
            </div>
          );
        })}
        {view.saved && (
          <>
            <div style={{ height: 1, background: '#b39f78', margin: '6px 0' }} />
            <span className="ab-sc" style={{ fontSize: 20 }}>Gespeicherter Run</span>
            <span style={{ fontSize: 17 }}>Akt I · Stufe {view.saved.level} von {view.levels} · {new Date(view.saved.at).toLocaleDateString('de-DE')}</span>
          </>
        )}
      </section>
      <section style={{ position: 'absolute', right: 60, bottom: 50, width: 380, padding: '16px 26px 18px', background: C.paper, color: C.ink, clipPath: TORN, boxShadow: '0 8px 18px rgba(0,0,0,.6)' }}>
        <span className="ab-fell" style={{ fontSize: 19, fontStyle: 'italic' }}>Wählt eure Klasse auf dem Handy.<br />Der VIP holt Begleiter dazu und startet den Run.</span>
      </section>
    </>
  );
}

/** Spielerfarben sind hell (für dunklen Grund) – auf Papier etwas dunkler */
function shadeDark(hex?: string) {
  if (!hex) return C.ink;
  const n = parseInt(hex.slice(1), 16);
  const f = 0.6;
  return `rgb(${Math.round(((n >> 16) & 255) * f)},${Math.round(((n >> 8) & 255) * f)},${Math.round((n & 255) * f)})`;
}

/* ---------- Kampf ---------- */

const TIER_NAME: Record<string, string> = { fast: 'Schnell', normal: 'Normal', slow: 'Langsam', enemies: 'Die Gegner', end: 'Rundenende' };

function useEventIndex(view: any) {
  const now = useServerNow(70);
  const evs: any[] = view.events ?? [];
  if (!evs.length || !view.startAt) return { idx: -1, ev: null as any, started: false, el: 0 };
  const el = (now - view.startAt) / 1000;
  let idx = -1;
  evs.forEach((e, i) => { if (e.at <= el) idx = i; });
  return { idx, ev: idx >= 0 ? evs[idx] : null, started: el >= 0, el };
}

function HostFight({ view, player }: HostViewProps) {
  const name = (id: string) => player(id)?.name ?? '?';
  const resolving = view.phase === 'resolve';
  const { idx, ev } = useEventIndex(view);
  const snap = resolving && ev ? ev.s : null;
  const key = `${view.startAt}-${idx}`;

  // Klänge pro Ereignis
  useEffect(() => {
    if (!ev) return;
    if (ev.k === 'tier') play('tier');
    if (ev.k === 'support') { if (ev.items.some((x: any) => x.heal)) play('heal'); else play('block'); }
    if (ev.k === 'hits') { play('hit', ev.parts.length); if (ev.killed) setTimeout(() => play('tear'), 700); }
    if (ev.k === 'enemy') { play('enemy'); if (ev.results.some((r: any) => r.blocked > 0)) play('blocked'); }
    if (ev.k === 'poison') play('poison');
    if (ev.k === 'stunned') play('stun');
    if (ev.k === 'result') play(ev.result === 'win' ? 'win' : 'lose');
  }, [key]);
  const readyCount = view.heroes.filter((h: any) => h.ready).length;
  useEffect(() => { if (!resolving && readyCount) play('ready'); }, [readyCount]);

  // Gegner-Positionen
  const enemies = view.enemies as any[];
  const living = enemies.map((e, i) => ({ e, i }));
  const n = living.length;
  const scale = n > 5 ? 0.66 : n > 3 ? 0.8 : 1;
  const xs = living.map((_, k) => 640 + (k - (n - 1) / 2) * Math.min(250, 1060 / n));
  const stripE = Math.min(180, Math.min(250, 1060 / n) - 10);

  // Helden-Positionen
  const heroes = view.heroes as any[];
  const hn = heroes.length;
  const slot = Math.min(200, 1180 / hn);
  const hx = heroes.map((_, k) => 640 + (k - (hn - 1) / 2) * slot);
  const figH = hn <= 4 ? 140 : hn <= 8 ? 112 : 88;
  const stripW = Math.min(160, slot - 12);
  const heroX = new Map(heroes.map((h, k) => [h.id, hx[k]]));

  const hpOf = (i: number) => (snap ? snap.e[i] : enemies[i]);
  const heroState = (h: any) => (snap ? { ...h, ...snap.h[h.id] } : h);

  // Welche Effekte gehören zu diesem Ereignis?
  const attackers = new Set<string>(ev?.k === 'hits' ? ev.parts.map((p: any) => p.from) : []);
  const supportFx = new Map<string, any>(ev?.k === 'support' ? ev.items.map((x: any) => [x.to, x]) : []);
  const enemyHitHeroes = new Map<string, any>(ev?.k === 'enemy' ? ev.results.map((r: any) => [r.id, r]) : []);
  const poisonMap = new Map<string, number>();
  const poisonSrc = new Map<string, string>();
  if (ev?.k === 'poison') for (const x of ev.items) { poisonMap.set(x.who, (poisonMap.get(x.who) ?? 0) + x.dmg); if (x.src) poisonSrc.set(x.who, x.src); }

  return (
    <>
      <Backdrop img="hintergrund-kampf-abgrund" opacity={0.5} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 440, bottom: 0, background: 'rgba(12,8,6,.72)' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 438, height: 3, background: C.bronze }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 443, height: 1, background: '#5b3f26' }} />

      <header style={{ position: 'absolute', left: 32, right: 32, top: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 5 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 18 }}>
          <span className="ab-sc" style={{ fontSize: 34, letterSpacing: 4 }}>Abgrund</span>
          <span className="ab-fell" style={{ fontSize: 19, fontStyle: 'italic', color: C.muted }}>Akt I · Stufe {view.node?.lv ?? 1} · {view.boss ? 'Boss' : view.elite ? 'Elite' : 'Kampf'} · Runde {view.round}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {resolving
            ? <span className="ab-sc" style={{ fontSize: 20, color: C.muted }}>Auflösung</span>
            : <span className="ab-sc" style={{ fontSize: 20, background: C.paper, color: C.ink, padding: '4px 14px' }}>{readyCount} von {hn} bereit</span>}
          {!resolving && view.deadline && <HostTimer deadline={view.deadline} duration={view.duration} size={52} />}
        </div>
      </header>

      {/* rote Fäden: Absicht → Ziel (nur beim Planen) */}
      {!resolving && (
        <svg width="1280" height="720" viewBox="0 0 1280 720" aria-hidden="true" style={{ position: 'absolute', inset: 0 }}>
          {living.map(({ e, i }, k) => {
            if (e.dead || !e.intent || e.intent.all || e.intent.weakAll || e.intent.vulnAll || !e.intent.targets?.length) return null;
            const tx = heroX.get(e.intent.targets[0]);
            if (tx == null) return null;
            const sx = xs[k];
            const sy = enemyTop(e, scale) + 30;
            const ty = 486;
            return (
              <g key={i}>
                <path d={`M${sx} ${sy} C ${sx} ${sy + 200}, ${tx} ${ty - 140}, ${tx} ${ty}`} fill="none" stroke={C.bright} strokeWidth="2.5" opacity=".9" />
                <circle cx={tx} cy={ty} r="5" fill={C.bright} />
              </g>
            );
          })}
        </svg>
      )}

      {/* Gegner */}
      {living.map(({ e, i }, k) => {
        const s = hpOf(i);
        if (!s) return null;
        const isHit = ev?.k === 'hits' && ev.enemy === i;
        const acting = ev?.k === 'enemy' && ev.enemy === i;
        const dying = isHit && ev.killed || (ev?.k === 'enemy' && ev.enemy === i && ev.killed) || (ev?.k === 'poison' && ev.items.some((x: any) => x.who === 'e' + i && x.killed));
        const deadBefore = snap ? s.dead && !dying : e.dead;
        if (deadBefore) return null;
        const h = 250 * e.size * scale;
        const top = 418 - h;
        return (
          <div key={e.uid}>
            {isHit && (
              <svg key={'ink' + key} width="300" height="260" viewBox="0 0 300 260" aria-hidden="true" style={{ position: 'absolute', left: xs[k] - 150, top: top + h * 0.2, animation: 'abInk 1.4s ease-out forwards' }}>
                <path d="M150 40c14 22 44 6 47 30s38 15 25 42 22 38-9 48-4 42-34 29-32 29-47 4-45-4-34-32 22-29-10-46 25-19 16-42 25 22 30-17z" fill="#0d0907" />
                <circle cx="70" cy="60" r="7" fill="#0d0907" /><circle cx="240" cy="70" r="5" fill="#0d0907" /><circle cx="250" cy="180" r="8" fill="#0d0907" />
              </svg>
            )}
            <div key={(isHit || acting) ? 'a' + key : 'still'} style={{
              position: 'absolute', left: xs[k] - h * 0.36, top, height: h, transformOrigin: 'bottom center',
              animation: isHit && !dying ? 'abShake .6s ease-out' : acting ? 'abLungeDown .9s ease-in-out' : `abSway ${3.2 + (k % 3) * 0.5}s ease-in-out infinite`,
            }}>
              {dying ? (
                <>
                  <img src={IMG(e.img)} onError={fallbackTo(e.fallback)} alt={e.name} style={{ position: 'absolute', height: h, clipPath: 'polygon(0 0,52% 0,46% 30%,55% 55%,47% 80%,52% 100%,0 100%)', animation: 'abTearL 1.2s .5s ease-in forwards', filter: 'drop-shadow(0 14px 12px rgba(0,0,0,.65))' }} />
                  <img src={IMG(e.img)} onError={fallbackTo(e.fallback)} alt="" style={{ position: 'absolute', height: h, clipPath: 'polygon(52% 0,100% 0,100% 100%,52% 100%,47% 80%,55% 55%,46% 30%)', animation: 'abTearR 1.2s .5s ease-in forwards', filter: 'drop-shadow(0 14px 12px rgba(0,0,0,.65))' }} />
                </>
              ) : (
                <img src={IMG(e.img)} onError={fallbackTo(e.fallback)} alt={e.name} style={{ height: h, filter: 'drop-shadow(0 14px 12px rgba(0,0,0,.65))' }} />
              )}
            </div>
            {/* Absicht */}
            {e.intent && !s.dead && (
              <div style={{ position: 'absolute', left: xs[k], top: Math.max(58, top - 44), transform: 'translateX(-50%)', background: C.paper, color: C.ink, padding: '5px 12px 6px', display: 'flex', alignItems: 'center', gap: 7, clipPath: TORN, boxShadow: '0 6px 14px rgba(0,0,0,.55)', whiteSpace: 'nowrap', opacity: resolving && !acting ? 0.75 : 1 }}>
                <IntentIcons it={e.intent} size={n > 4 ? 19 : 22} font={n > 4 ? 20 : 24} />
                {(n <= 4 || e.intent.all || e.intent.weakAll || e.intent.vulnAll) && <span className="ab-fell" style={{ fontSize: 15, fontStyle: 'italic' }}>{intentText(e.intent, name).who}</span>}
              </div>
            )}
            {/* Leben */}
            <div style={{ position: 'absolute', left: xs[k] - stripE / 2, top: 372, width: stripE, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ background: C.paper2, color: C.ink, padding: '5px 10px 7px', clipPath: TORN2, boxShadow: '0 6px 14px rgba(0,0,0,.55)', opacity: s.dead ? 0.5 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
                  <span className="ab-sc" style={{ fontSize: 16, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</span>
                  <span style={{ fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap', flex: 'none' }}>{s.dead ? 'besiegt' : `${s.hp}/${e.maxHp}`}</span>
                </div>
                <div style={{ marginTop: 4 }}><Bar v={s.hp} max={e.maxHp} /></div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', minHeight: 22 }}>
                {s.block > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontWeight: 700, background: C.paper2, color: C.ink, padding: '1px 6px' }}><ShieldIcon size={15} />{s.block}</span>}
                {s.buff > 0 && <span title={`Stärke +${s.buff}`} style={{ display: 'flex', alignItems: 'center', gap: 3, fontWeight: 700, background: '#5a1d14', color: '#f3e6c8', padding: '1px 6px' }}><StrengthIcon size={16} color="#f3e6c8" />+{s.buff}</span>}
                <Seals st={s.st} size={24} />
              </div>
            </div>
            {/* Treffer-Zahlen */}
            {isHit && (
              <div key={'n' + key} style={{ position: 'absolute', left: xs[k], top: top + 10, transform: 'translateX(-50%)', display: 'flex', alignItems: 'baseline', gap: 8, whiteSpace: 'nowrap', animation: 'abFade .2s', zIndex: 6 }}>
                {ev.parts.length > 1 && <span className="ab-fell" style={{ fontSize: 22, fontStyle: 'italic', color: C.paper, textShadow: '0 2px 6px #000' }}>{ev.parts.map((p: any) => p.dmg).join(' + ')} =</span>}
                <span className="ab-sc" style={{ fontSize: 64, lineHeight: 1, color: '#e23b30', textShadow: '0 4px 0 #3a0a08, 0 0 18px rgba(0,0,0,.8)', animation: 'abPop .5s ease-out' }}>{ev.total}</span>
                {ev.blocked > 0 && <span style={{ fontSize: 18, color: C.paper, textShadow: '0 2px 6px #000' }}>({ev.blocked} geblockt)</span>}
              </div>
            )}
            {acting && ev.block > 0 && <Floater x={xs[k]} y={top} text={<><ShieldIcon size={26} color={C.paper} /> +{ev.block}</>} color={C.paper} k={key} />}
            {acting && ev.buff > 0 && <Floater x={xs[k]} y={top + 30} text={<><StrengthIcon size={26} color="#ff8a70" /> +{ev.buff}</>} color="#ff8a70" k={key + 'b'} />}
            {acting && ev.thorns > 0 && <Floater x={xs[k]} y={top + 60} text={`−${ev.thorns} Gegenwehr`} color="#ff8a70" k={key + 't'} />}
            {ev?.k === 'stunned' && ev.enemy === i && <Floater x={xs[k]} y={top} text="betäubt" color={C.paper} k={key} />}
            {ev?.k === 'enemy' && ev.heal?.enemy === i && ev.heal.amount > 0 && <Floater x={xs[k]} y={top + 20} text={`+${ev.heal.amount}`} color="#9fd36a" k={key + 'hl'} />}
            {ev?.k === 'enemy' && ev.blockAll > 0 && !s.dead && <Floater x={xs[k]} y={top + 50} text={<><ShieldIcon size={24} color={C.paper} /> +{ev.blockAll}</>} color={C.paper} k={key + 'ba'} />}
            {acting && ev.charge && <Floater x={xs[k]} y={top + 10} text="lädt auf …" color="#ff8a50" k={key + 'ch'} big />}
            {acting && ev.spawned > 0 && <Floater x={xs[k]} y={top + 10} text={`Brut ×${ev.spawned}`} color={C.paper} k={key + 'sp'} big />}
            {poisonMap.has('e' + i) && <Floater x={xs[k]} y={top + 40} text={`−${poisonMap.get('e' + i)} Gift`} color="#9fd36a" k={key} />}
          </div>
        );
      })}

      {/* Spieler */}
      {heroes.map((h0: any, k: number) => {
        const h = heroState(h0);
        const pl = player(h.id);
        const lunge = attackers.has(h.id);
        const sup = supportFx.get(h.id);
        const hit = enemyHitHeroes.get(h.id);
        const dead = h.hp <= 0;
        return (
          <div key={h.id}>
            <div key={lunge || hit ? 'a' + key : 'still'} style={{
              position: 'absolute', left: hx[k] - figH * 0.36, top: 610 - figH, height: figH, transformOrigin: 'bottom center',
              animation: lunge ? 'abLungeUp .9s ease-in-out' : hit && hit.loss > 0 ? 'abShake .6s ease-out .3s' : `abSway ${3.4 + (k % 4) * 0.4}s ease-in-out infinite`,
              filter: dead ? 'grayscale(1) brightness(.5)' : undefined,
            }}>
              <img src={IMG(h.img)} alt={CLASS_NAME[h.cls]} style={{ height: figH, filter: 'drop-shadow(0 14px 12px rgba(0,0,0,.65))' }} />
            </div>
            {!resolving && h.ready && (
              <span style={{ position: 'absolute', left: hx[k] + figH * 0.3, top: 610 - figH - 6, width: 36, height: 36, borderRadius: '50%', background: '#7a2416', color: '#f3e6c8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, boxShadow: 'inset 0 0 0 3px rgba(0,0,0,.22), 0 2px 4px rgba(0,0,0,.5)', animation: 'abPop .4s ease-out' }}>✓</span>
            )}
            <div style={{ position: 'absolute', left: hx[k] - stripW / 2, top: 620, width: stripW, background: C.paper2, color: C.ink, padding: '5px 8px 7px', boxSizing: 'border-box', clipPath: TORN2, boxShadow: '0 6px 14px rgba(0,0,0,.55)', ['--ab-glow' as any]: sup?.heal ? '#7fcf6a' : '#c9d6e8', animation: sup ? 'abGlow 1.2s ease-out' : undefined }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 4 }}>
                <span className="ab-sc" style={{ fontSize: hn > 8 ? 14 : 17, color: shadeDark(pl?.color), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pl?.name}</span>
                <span style={{ fontWeight: 700, fontSize: hn > 8 ? 12 : 15, whiteSpace: 'nowrap' }}>{h.hp}/{h.maxHp}</span>
              </div>
              <div style={{ marginTop: 4 }}><Bar v={h.hp} max={h.maxHp} h={hn > 8 ? 7 : 9} /></div>
              <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center', minHeight: 20 }}>
                {h.block > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontWeight: 700, fontSize: 14 }}><ShieldIcon size={15} />{h.block}</span>}
                {h.str > 0 && <span title={`Stärke ${h.str}`} style={{ display: 'flex', alignItems: 'center', gap: 2, fontWeight: 700, fontSize: 14 }}><StrengthIcon size={15} />{h.str}</span>}
                <Seals st={h.st} size={20} />
                {hn <= 6 && !h.block && !h.str && <span className="ab-fell" style={{ fontStyle: 'italic', fontSize: 13, color: classColor(h.cls), fontWeight: 600 }}>{CLASS_NAME[h.cls]}</span>}
              </div>
            </div>
            {sup?.block > 0 && <Floater x={hx[k]} y={560} text={<><ShieldIcon size={24} color="#c9d6e8" /> +{sup.block}</>} color="#c9d6e8" k={key} />}
            {sup?.heal > 0 && <Floater x={hx[k]} y={530} text={`+${sup.heal}`} color="#9fd36a" k={key + 'h'} />}
            {sup?.cover && <Floater x={hx[k]} y={500} text="beschützt" color={C.paper} k={key + 'c'} />}
            {sup?.str > 0 && <Floater x={hx[k]} y={500} text={<><StrengthIcon size={24} color="#f3c06a" /> +{sup.str}</>} color="#f3c06a" k={key + 's'} />}
            {sup?.note && <Floater x={hx[k]} y={470} text={sup.note} color={C.paper} k={key + 'n'} />}
            {hit && hit.dmg > 0 && <Floater x={hx[k]} y={520} text={hit.loss > 0 ? `−${hit.loss}` : 'geblockt'} color={hit.loss > 0 ? '#ff5d4e' : '#c9d6e8'} k={key} big delay={0.3} />}
            {hit && hit.dmg === 0 && <Floater x={hx[k]} y={520} text={ev.curse ? `Fluch: ${ev.curse}` : ev.poison ? `+${ev.poison} Gift` : 'verwundbar'} color={ev.poison && !ev.curse ? '#9fd36a' : '#ff8a70'} k={key} delay={0.3} />}
            {hit?.saved && <Floater x={hx[k]} y={460} text={hit.saved === 'undying' ? 'Unbeugsam!' : 'Wiedergeburt!'} color="#f3c06a" k={key + 'sv'} big delay={0.8} />}
            {hit?.talisman && <Floater x={hx[k]} y={490} text={<><ShieldIcon size={24} color="#c9d6e8" /> +10 Talisman</>} color="#c9d6e8" k={key + 'tl'} delay={0.9} />}
            {ev?.k === 'enemy' && ev.vulnAll > 0 && !dead && <Floater x={hx[k]} y={500} text="verwundbar" color="#ff8a70" k={key + 'va'} delay={0.3} />}
            {poisonMap.has(h.id) && <Floater x={hx[k]} y={540} text={poisonSrc.get(h.id) === 'kerze' ? `−${poisonMap.get(h.id)} Kerze` : `−${poisonMap.get(h.id)} Gift`} color={poisonSrc.get(h.id) === 'kerze' ? '#ff8a70' : '#9fd36a'} k={key} />}
          </div>
        );
      })}

      {/* Stufen-Banner und Ergebnis */}
      {ev?.k === 'tier' && <Banner key={key} text={TIER_NAME[ev.tier]} />}
      {ev?.k === 'result' && <Banner key={key} text={ev.result === 'win' ? 'Sieg!' : 'Niederlage'} big />}
      {ev?.k === 'fizzle' && <Floater x={640} y={300} text={`${player(ev.from)?.name}: Ziel schon besiegt – verpufft`} color={C.paper} k={key} />}
    </>
  );
}

function enemyTop(e: any, scale: number) {
  const h = 250 * e.size * scale;
  return Math.max(58, 418 - h - 44);
}

function Floater({ x, y, text, color, k, big, delay = 0 }: { x: number; y: number; text: ReactNode; color: string; k: string; big?: boolean; delay?: number }) {
  return (
    <span key={k} className="ab-sc" style={{
      position: 'absolute', left: x, top: y, transform: 'translate(-50%,0)', fontSize: big ? 40 : 24, color, whiteSpace: 'nowrap', zIndex: 8, display: 'inline-flex', alignItems: 'center', gap: 4,
      textShadow: '0 3px 0 rgba(0,0,0,.7), 0 0 12px rgba(0,0,0,.8)', animation: `abFloat 1.5s ease-out ${delay}s both`, pointerEvents: 'none',
    }}>{text}</span>
  );
}

function Banner({ text, big }: { text: string; big?: boolean }) {
  return (
    <span className="ab-sc" style={{
      position: 'absolute', left: '50%', top: big ? '42%' : '30%', zIndex: 20, pointerEvents: 'none', fontSize: big ? 110 : 64, color: C.ink, background: C.paper,
      padding: big ? '10px 60px' : '6px 40px', clipPath: TORN, boxShadow: '0 20px 50px rgba(0,0,0,.6)', animation: `abBanner ${big ? 2 : 0.9}s ease-out forwards`, whiteSpace: 'nowrap',
    }}>{text}</span>
  );
}

function HostReward({ view, player }: HostViewProps) {
  return (
    <>
      <Backdrop img="hintergrund-lager" opacity={0.45} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 70, textAlign: 'center' }}>
        <span className="ab-sc" style={{ fontSize: 64, textShadow: '0 6px 18px rgba(0,0,0,.8)' }}>{view.kind === 'boss' ? 'Der Boss ist besiegt!' : view.kind === 'elite' ? 'Elite besiegt' : 'Sieg'}</span>
        <p className="ab-fell" style={{ fontSize: 24, fontStyle: 'italic', color: '#c8b993', margin: '8px 0 0' }}>{view.kind === 'boss' ? 'Jeder wählt eine legendäre Karte.' : 'Jeder wählt auf dem Handy eine neue Karte – oder keine.'}</p>
      </div>
      <div style={{ position: 'absolute', left: 60, right: 60, top: 260, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 22 }}>
        {view.heroes.map((h: any) => {
          const p = view.rewards.find((x: any) => x.id === h.id);
          const pl = player(h.id);
          return (
            <div key={h.id} style={{ width: 170, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <img src={IMG(h.img)} alt="" style={{ height: 150, filter: 'drop-shadow(0 12px 10px rgba(0,0,0,.6))', opacity: p?.done ? 1 : 0.6 }} />
              <span className="ab-sc" style={{ fontSize: 20, color: pl?.color }}>{pl?.name}</span>
              <span className="ab-fell" style={{ fontSize: 16, fontStyle: 'italic', color: C.muted }}>{p?.done ? (p.card ? `nimmt ${p.card}` : 'verzichtet') : 'wählt …'}</span>
              <span style={{ fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>{h.hp}/{h.maxHp} Leben{p?.gold > 0 && <Coin n={`+${p.gold}`} />}</span>
              {p?.relic && <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 15 }}><RelicIcon r={p.relic} size={30} /> {p.relic.name}</span>}
            </div>
          );
        })}
      </div>
    </>
  );
}

function HostEnd({ view, player }: HostViewProps) {
  const win = view.result === 'win';
  useEffect(() => { play(win ? 'win' : 'lose'); }, []);
  return (
    <>
      <Backdrop img={win ? 'hintergrund-lager' : 'hintergrund-kampf-abgrund'} opacity={0.5} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 90, textAlign: 'center', animation: 'abFade 1s' }}>
        <span className="ab-sc" style={{ fontSize: 110, letterSpacing: 6, color: win ? C.paper : '#e23b30', textShadow: '0 8px 24px rgba(0,0,0,.9)' }}>{win ? 'Sieg' : 'Niederlage'}</span>
        <p className="ab-fell" style={{ fontSize: 26, fontStyle: 'italic', color: '#c8b993', margin: 0 }}>
          {win ? 'Der Herr dieser Tiefe ist gefallen – Akt I ist geschafft.' : `Der Abgrund hat euch verschlungen – auf Stufe ${view.level} von ${view.levels}.`}
        </p>
      </div>
      <div style={{ position: 'absolute', left: 60, right: 60, top: 360, display: 'flex', justifyContent: 'center', gap: 26, flexWrap: 'wrap' }}>
        {view.heroes.map((h: any) => (
          <div key={h.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <img src={IMG(h.img)} alt="" style={{ height: 170, filter: `drop-shadow(0 12px 10px rgba(0,0,0,.6))${h.hp <= 0 ? ' grayscale(1) brightness(.5)' : ''}` }} />
            <span className="ab-sc" style={{ fontSize: 20, color: player(h.id)?.color }}>{player(h.id)?.name}</span>
          </div>
        ))}
      </div>
    </>
  );
}

/* ================= Handy ================= */

function Controller(props0: ControllerViewProps) {
  useFonts();
  const props = withComps(props0);
  const { view } = props;
  const [sheet, setSheet] = useState(false);
  useEffect(() => setSheet(false), [view.phase]);
  let inner: ReactNode;
  if (view.phase === 'lager') inner = <PhoneLager {...props} />;
  else if (view.phase === 'plan') inner = <PhonePlan {...props} />;
  else if (view.phase === 'resolve') inner = <PhoneResolve {...props} />;
  else if (view.phase === 'reward') inner = <PhoneReward {...props} />;
  else if (view.phase === 'map') inner = <PhoneMap {...props} />;
  else if (view.phase === 'shop') inner = <PhoneShop {...props} />;
  else if (view.phase === 'camp') inner = <PhoneCamp {...props} />;
  else if (view.phase === 'event') inner = <PhoneEvent {...props} />;
  else if (view.phase === 'treasure') inner = <PhoneTreasure {...props} />;
  else if (view.phase === 'bossIntro') inner = <PhoneCenter title="Achtung!" text="Schau auf den Fernseher." img={view.me?.img} />;
  else if (view.phase === 'end') inner = <PhoneEnd {...props} />;
  else inner = <PhoneCenter title="Schau auf den Fernseher" />;
  if (sheet && view.me && view.phase !== 'lager') inner = <HeroSheet view={view} me={props.me} onClose={() => setSheet(false)} />;
  return (
    <div style={{ position: 'fixed', inset: 0, overflowY: 'auto', background: '#120d09', color: C.paper, fontFamily: BODY }}>
      <Styles />
      <SheetContext.Provider value={setSheet}>
        <div style={{ maxWidth: 520, margin: '0 auto', minHeight: '100%', boxSizing: 'border-box', padding: 'max(14px, env(safe-area-inset-top)) 14px max(18px, env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {inner}
        </div>
      </SheetContext.Provider>
    </div>
  );
}

function PhoneCenter({ title, text, img }: { title: string; text?: string; img?: string }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, textAlign: 'center', minHeight: '80vh' }}>
      {img && <img src={IMG(img)} alt="" style={{ height: 180, filter: 'drop-shadow(0 10px 10px rgba(0,0,0,.6))' }} />}
      <span className="ab-sc" style={{ fontSize: 26 }}>{title}</span>
      {text && <span className="ab-fell" style={{ fontSize: 17, fontStyle: 'italic', color: C.muted }}>{text}</span>}
    </div>
  );
}

const BIG_BTN: CSSProperties = {
  border: 0, cursor: 'pointer', fontFamily: DISPLAY, minHeight: 56, background: C.wax, color: '#f3e6c8', fontSize: 24, letterSpacing: 2,
  boxShadow: 'inset 0 0 0 3px rgba(0,0,0,.25), 0 6px 0 #4a0c0a', clipPath: 'polygon(0 8%,4% 0,50% 4%,96% 0,100% 10%,99% 90%,95% 100%,50% 96%,5% 100%,0 92%)', touchAction: 'manipulation',
};
const SMALL_BTN: CSSProperties = { border: '1px solid #5b452f', background: '#2a1f16', color: C.paper, fontFamily: DISPLAY, fontSize: 15, padding: '8px 12px', cursor: 'pointer', touchAction: 'manipulation' };

function PhoneLager({ view, send }: ControllerViewProps) {
  const [i, setI] = useState(() => Math.max(0, view.classes.findIndex((c: any) => c.id === view.cls)));
  const c = view.classes[i];
  if (view.ready) {
    return (
      <>
        <PhoneCenter title={`Du spielst ${view.classes.find((x: any) => x.id === view.cls)?.name}`} text={view.allChosen ? (view.vip ? 'Alle haben gewählt – du kannst starten.' : 'Warte auf den VIP …') : 'Warte auf die anderen …'} img={view.classes.find((x: any) => x.id === view.cls)?.img} />
        {view.vip && <CompPicker view={view} send={send} />}
        {view.vip && view.allChosen && <button type="button" style={BIG_BTN} onClick={() => send({ type: 'start' })}>Neuer Run</button>}
        {view.vip && view.saved && <button type="button" style={{ ...SMALL_BTN, minHeight: 48 }} onClick={() => send({ type: 'continue' })}>Run fortsetzen (Stufe {view.saved.level}{view.savedComps ? `, ${view.savedComps} Begleiter` : ''})</button>}
        <button type="button" style={SMALL_BTN} onClick={() => send({ type: 'unready' })}>Klasse ändern</button>
      </>
    );
  }
  return (
    <>
      <div style={{ textAlign: 'center' }}>
        <span className="ab-sc" style={{ fontSize: 28, letterSpacing: 5 }}>Abgrund</span>
        <div className="ab-fell" style={{ fontSize: 16, fontStyle: 'italic', color: C.muted }}>Wähle deine Klasse</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button type="button" aria-label="Vorherige Klasse" style={{ ...SMALL_BTN, fontSize: 24, padding: '20px 8px' }} onClick={() => { play('paper'); setI((i + view.classes.length - 1) % view.classes.length); }}>‹</button>
        <article key={c.id} style={{ flex: 1, background: C.paper, color: C.ink, border: `4px solid ${classColor(c.id)}`, borderRadius: 12, padding: '14px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, boxShadow: '0 14px 30px rgba(0,0,0,.7)', animation: 'abFade .3s' }}>
          <span className="ab-fell" style={{ fontSize: 14, fontStyle: 'italic', color: '#6b5d45' }}>{c.role}</span>
          <span className="ab-sc" style={{ fontSize: 28, lineHeight: 1, color: classColor(c.id) }}>{c.name}</span>
          <img src={IMG(c.img)} onError={fallbackTo()} alt="" style={{ height: 230, margin: '4px 0', filter: 'drop-shadow(0 8px 8px rgba(0,0,0,.35))' }} />
          <span style={{ fontSize: 16, fontWeight: 700 }}>{c.hp} Leben · 3 Energie</span>
          <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.3, textAlign: 'center' }}>{c.desc}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, justifyContent: 'center' }}>
            {c.start.map((s: string) => <span key={s} style={{ fontSize: 13, background: '#d8c69c', padding: '2px 7px', borderRadius: 3 }}>{s}</span>)}
          </div>
        </article>
        <button type="button" aria-label="Nächste Klasse" style={{ ...SMALL_BTN, fontSize: 24, padding: '20px 8px' }} onClick={() => { play('paper'); setI((i + 1) % view.classes.length); }}>›</button>
      </div>
      <button type="button" style={{ ...BIG_BTN, background: classColor(c.id) }} onClick={() => { vibrate(20); send({ type: 'class', cls: c.id }); }}>{c.name} wählen</button>
    </>
  );
}

/** VIP: Begleiter (vom Spiel gesteuerte Mitstreiter) dazuholen */
function CompPicker({ view, send }: { view: any; send: (a: any) => void }) {
  const n = view.compCount ?? 0;
  const max = view.compMax ?? 0;
  if (max <= 0) return null;
  const set = (v: number) => { play('paper'); send({ type: 'comps', n: Math.max(0, Math.min(max, v)) }); };
  const btn: CSSProperties = { ...SMALL_BTN, width: 52, height: 52, fontSize: 26, padding: 0 };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#2a1f16', border: '1px solid #5b452f', padding: '10px 12px' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <span className="ab-sc" style={{ fontSize: 18 }}>Begleiter</span>
        <span className="ab-fell" style={{ fontSize: 14, fontStyle: 'italic', color: C.muted }}>vom Spiel gesteuert · bis zu {max}</span>
      </div>
      <button type="button" aria-label="Einen Begleiter weniger" style={btn} disabled={n <= 0} onClick={() => set(n - 1)}>−</button>
      <span className="ab-sc" aria-live="polite" style={{ fontSize: 28, minWidth: 30, textAlign: 'center' }}>{n}</span>
      <button type="button" aria-label="Einen Begleiter mehr" style={btn} disabled={n >= max} onClick={() => set(n + 1)}>+</button>
    </div>
  );
}

function Candles({ total, used }: { total: number; used: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }} aria-label={`${total - used} von ${total} Energie übrig`}>
      {Array.from({ length: total }, (_, k) => {
        const lit = k < total - used;
        return (
          <svg key={k} width="22" height="44" viewBox="0 0 22 44" aria-hidden="true">
            {lit ? (
              <g style={{ transformOrigin: '11px 16px', animation: `abCandle ${1 + k * 0.17}s ease-in-out infinite` }}>
                <path d="M11 2c4 6 5 9 0 14-5-5-4-8 0-14z" fill="#f2a43a" /><path d="M11 7c2 3 2 5 0 7-2-2-2-4 0-7z" fill="#ffe38a" />
              </g>
            ) : <path d="M11 16c-2-3 1-5-1-9" fill="none" stroke="#6f6450" strokeWidth="1.5" />}
            <rect x="5" y="18" width="12" height="24" rx="2" fill={lit ? C.paper : '#6b5d45'} />
          </svg>
        );
      })}
      <span className="ab-fell" style={{ fontSize: 16, fontStyle: 'italic', color: C.muted, paddingBottom: 4 }}>{total - used} von {total} Energie übrig</span>
    </div>
  );
}

function CardFace({ c, w = 112, onClick, dim, sel }: { c: any; w?: number; onClick?: () => void; dim?: boolean; sel?: boolean }) {
  const h = Math.round(w * 1.5);
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} style={{
      position: 'relative', width: w, height: h, boxSizing: 'border-box', background: '#eadcb9', color: C.ink, border: `${Math.max(4, Math.round(w * 0.04))}px solid ${frameOf(c.rarity)}`, outline: `1px solid ${darker(frameOf(c.rarity), 0.5)}`,
      borderRadius: 6, padding: `0 ${w * 0.06}px ${w * 0.05}px`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, cursor: onClick ? 'pointer' : undefined,
      boxShadow: sel ? `0 0 0 3px #f2a43a, 0 6px 12px rgba(0,0,0,.55)` : `${frameGlow(c.rarity)}0 6px 12px rgba(0,0,0,.55)`,
      opacity: dim ? 0.45 : 1, fontFamily: BODY, touchAction: 'manipulation',
    }}>
      <span style={{ position: 'absolute', left: -9, top: -9, zIndex: 1, width: w * 0.25, height: w * 0.25, minWidth: 24, minHeight: 24, borderRadius: '50%', background: darker(classColor(c.cls), 0.8), border: '2px solid #eadcb9', color: '#f3e6c8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: DISPLAY, fontSize: Math.max(15, w * 0.15), boxShadow: 'inset 0 0 0 3px rgba(0,0,0,.25)' }}>{c.cost}</span>
      <Sparkles r={c.rarity} size={Math.max(0.8, w / 140)} />
      <span className="ab-sc" style={{ alignSelf: 'stretch', margin: `0 -${w * 0.06}px`, padding: `${w * 0.035}px ${w * 0.17}px ${w * 0.04}px`, minHeight: Math.round((w < 120 ? 13.5 : Math.max(13, w * 0.13)) * 1.05 * 2 + w * 0.075), boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', background: classColor(c.cls), color: '#f3e6c8', fontSize: w < 120 ? (String(c.name).length > 11 ? 12 : 13.5) : Math.max(13, w * 0.13), lineHeight: 1.05, textAlign: 'center', position: 'relative', overflowWrap: 'anywhere', hyphens: 'auto' }}>
        {c.name}
        {c.speed !== 'normal' && <span style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', display: 'flex', background: '#eadcb9', borderRadius: '50%', padding: 2 }}><SpeedIcon speed={c.speed} size={Math.max(12, w * 0.12)} /></span>}
      </span>
      <img src={IMG(c.img)} onError={fallbackTo()} alt="" style={{ height: h * (String(c.text).length > 44 ? 0.24 : 0.34), margin: '2px 0', objectFit: 'contain', maxWidth: '90%' }} />
      <span style={{ fontSize: Math.max(11.5, w * 0.105), lineHeight: 1.15, textAlign: 'center' }}>{c.speed === 'fast' ? <i>Schnell. </i> : c.speed === 'slow' ? <i>Langsam. </i> : null}{c.text}</span>
    </Tag>
  );
}

function MiniCard({ c, onClick, dim }: { c: any; onClick: () => void; dim?: boolean }) {
  return (
    <button type="button" onClick={onClick} style={{
      position: 'relative', height: 104, boxSizing: 'border-box', background: '#eadcb9', color: C.ink, border: `3px solid ${frameOf(c.rarity)}`, borderRadius: 6, padding: '0 4px 5px', overflow: 'visible',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', boxShadow: `${frameGlow(c.rarity)}0 5px 10px rgba(0,0,0,.5)`, fontFamily: BODY, cursor: 'pointer', opacity: dim ? 0.45 : 1, touchAction: 'manipulation',
    }}>
      <span style={{ position: 'absolute', left: -8, top: -8, zIndex: 1, width: 24, height: 24, borderRadius: '50%', background: darker(classColor(c.cls), 0.8), border: '2px solid #eadcb9', color: '#f3e6c8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: DISPLAY, fontSize: 15 }}>{c.cost}</span>
      <Sparkles r={c.rarity} size={0.75} />
      <span className="ab-sc" style={{ alignSelf: 'stretch', margin: '0 -4px', padding: '3px 14px 3px', minHeight: 34, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', background: classColor(c.cls), color: '#f3e6c8', fontSize: 13, lineHeight: 1.05, textAlign: 'center', position: 'relative' }}>
        {c.name}
        {c.speed !== 'normal' && <span style={{ position: 'absolute', right: 2, top: '50%', transform: 'translateY(-50%)', display: 'flex', background: '#eadcb9', borderRadius: '50%', padding: 1 }}><SpeedIcon speed={c.speed} size={11} /></span>}
      </span>
      <img src={IMG(c.img)} onError={fallbackTo()} alt="" style={{ height: 36 }} />
      <span style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.1, textAlign: 'center' }}>{shortText(c.text)}</span>
    </button>
  );
}
const SPEED_ORDER: Record<string, number> = { fast: 0, normal: 1, slow: 2 };
const shortText = (t: string) => (t.length > 22 ? t.split(/[.,]/)[0] : t);

function PhonePlan({ view, send, me, player }: ControllerViewProps) {
  const [sel, setSel] = useState<string | null>(null);
  const [pile, setPile] = useState<'draw' | 'discard' | null>(null);
  const [peek, setPeek] = useState<any>(null);
  const [foe, setFoe] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const plannedSet = new Set(view.plan.map((p: any) => p.uid));
  const hand = view.hand.filter((c: any) => !plannedSet.has(c.uid));
  const left = view.energy - view.used;
  const card = view.hand.find((c: any) => c.uid === sel);
  const name = (id: string) => (id === me.id ? 'dich' : player(id)?.name ?? '?');
  useEffect(() => { if (view.round) vibrate([40, 40, 40]); }, [view.round]);
  useEffect(() => { if (sel && !view.hand.some((c: any) => c.uid === sel)) setSel(null); }, [view.hand]);

  function choose(target?: string) {
    if (!card) return;
    play('paper');
    vibrate(15);
    send({ type: 'plan', uid: card.uid, target });
    setSel(null);
  }

  if (card) {
    const needs = card.target === 'enemy' || card.target === 'ally';
    const tooExpensive = card.cost > left;
    return (
      <>
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8 }}><CardFace c={card} w={190} sel /></div>
        <KeywordList items={cardKeywords(card)} dark />
        {tooExpensive ? (
          <p className="ab-fell" style={{ textAlign: 'center', fontSize: 18, fontStyle: 'italic', color: '#ff8a70' }}>Nicht genug Energie ({left} übrig).</p>
        ) : needs ? (
          <>
            <span className="ab-sc" style={{ fontSize: 22, textAlign: 'center' }}>Ziel wählen</span>
            {card.target === 'enemy' && view.enemies.filter((e: any) => !e.dead).map((e: any) => (
              <button key={e.uid} type="button" onClick={() => choose(e.uid)} style={{ display: 'flex', alignItems: 'center', gap: 12, background: C.paper2, color: C.ink, padding: '8px 12px', border: 0, textAlign: 'left', cursor: 'pointer', fontFamily: BODY, clipPath: TORN2, minHeight: 70 }}>
                <img src={IMG(e.img)} onError={fallbackTo(e.fallback)} alt="" style={{ height: 60 }} />
                <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span className="ab-sc" style={{ fontSize: 18 }}>{e.name}</span>
                  <Bar v={e.hp} max={e.maxHp} h={8} />
                  <span style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>{e.hp} / {e.maxHp}{e.block ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}><ShieldIcon size={14} />{e.block}</span> : null}</span>
                </span>
                {card.preview?.[e.uid] != null && <span className="ab-sc" style={{ fontSize: 28 }}>{card.preview[e.uid]}</span>}
              </button>
            ))}
            {card.target === 'ally' && view.allies.filter((a: any) => !(card.otherAlly && a.id === me.id)).map((a: any) => (
              <button key={a.id} type="button" onClick={() => choose(a.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, background: C.paper2, color: C.ink, padding: '8px 12px', border: 0, textAlign: 'left', cursor: 'pointer', fontFamily: BODY, clipPath: TORN2, minHeight: 64 }}>
                <img src={IMG(a.img)} alt="" style={{ height: 54 }} />
                <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span className="ab-sc" style={{ fontSize: 18 }}>{a.id === me.id ? 'Du' : player(a.id)?.name}</span>
                  <Bar v={a.hp} max={a.maxHp} h={8} />
                  <span style={{ fontSize: 14 }}>{a.hp} / {a.maxHp}</span>
                </span>
              </button>
            ))}
          </>
        ) : (
          <button type="button" style={BIG_BTN} onClick={() => choose()}>Einplanen</button>
        )}
        <button type="button" style={{ ...SMALL_BTN, minHeight: 48 }} onClick={() => setSel(null)}>Zurück</button>
      </>
    );
  }

  if (peek) {
    return (
      <>
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8 }}><CardFace c={peek} w={190} /></div>
        <KeywordList items={cardKeywords(peek)} dark />
        <button type="button" style={{ ...SMALL_BTN, minHeight: 48 }} onClick={() => setPeek(null)}>Zurück</button>
      </>
    );
  }

  if (sheet) return <HeroSheet view={view} me={me} onClose={() => setSheet(false)} />;

  const foeE = foe ? view.enemies.find((e: any) => e.uid === foe && !e.dead) : null;
  if (foeE) return <EnemyDetail e={foeE} name={name} onClose={() => setFoe(null)} />;

  if (pile) {
    const list = pile === 'draw' ? view.drawPile : view.discardPile;
    return (
      <>
        <span className="ab-sc" style={{ fontSize: 22 }}>{pile === 'draw' ? `Ziehstapel (${list.length})` : `Ablage (${list.length})`}</span>
        {pile === 'draw' && <span className="ab-fell" style={{ fontSize: 14, fontStyle: 'italic', color: C.muted }}>Sortiert nach Name – die Reihenfolge ist geheim.</span>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px 10px', paddingLeft: 6 }}>
          {list.map((c: any) => <MiniCard key={c.uid} c={c} onClick={() => { play('paper'); setPeek(c); }} />)}
        </div>
        {!list.length && <p className="ab-fell" style={{ fontStyle: 'italic', color: C.muted }}>leer</p>}
        <button type="button" style={{ ...SMALL_BTN, minHeight: 48 }} onClick={() => setPile(null)}>Schließen</button>
      </>
    );
  }

  const big = hand.length <= 5;
  return (
    <>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button type="button" aria-label="Mein Held: Details und Relikte" onClick={() => { play('paper'); setSheet(true); }} style={{ border: 0, background: 'transparent', padding: 0, cursor: 'pointer' }}><img src={IMG(view.me.img)} alt="" style={{ height: 50 }} /></button>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span className="ab-sc" style={{ fontSize: 19, color: me.color }}>{me.name}</span>
            <span className="ab-fell" style={{ fontStyle: 'italic', fontSize: 14, color: C.muted }}>{view.me.name}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1 }}><Bar v={view.me.hp} max={view.me.maxHp} h={7} /></div>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{view.me.hp}/{view.me.maxHp}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {view.me.str > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontWeight: 700, fontSize: 13 }}><StrengthIcon size={14} color={C.paper} />{view.me.str}</span>}
            <Seals st={view.me.st} size={20} />
          </div>
        </div>
        <button type="button" style={SMALL_BTN} onClick={() => setPile('draw')}>Deck {view.drawPile.length}</button>
        <button type="button" style={SMALL_BTN} onClick={() => setPile('discard')}>Ablage {view.discardPile.length}</button>
      </header>
      {view.deadline && <PhoneTimer deadline={view.deadline} duration={view.duration} />}

      <section aria-label="Gegner" style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(3, view.enemies.filter((e: any) => !e.dead).length)}, minmax(0, 1fr))`, gap: 8 }}>
        {view.enemies.filter((e: any) => !e.dead).map((e: any) => {
          const meTarget = e.intent?.targets?.includes(me.id) && (e.intent.dmg > 0);
          const it = e.intent ? intentText(e.intent, name, true) : null;
          return (
            <button key={e.uid} type="button" aria-label={`${e.name}: Details`} onClick={() => { play('paper'); setFoe(e.uid); }} style={{ border: 0, cursor: 'pointer', fontFamily: BODY, touchAction: 'manipulation', background: C.paper2, color: C.ink, padding: '6px 6px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, clipPath: TORN2, boxShadow: meTarget ? `inset 0 0 0 3px ${C.bright}` : undefined }}>
              <img src={IMG(e.img)} onError={fallbackTo(e.fallback)} alt="" style={{ height: 54 }} />
              <span className="ab-sc" style={{ fontSize: 13.5, textAlign: 'center', lineHeight: 1.05 }}>{e.name}</span>
              <div style={{ width: '90%' }}><Bar v={e.hp} max={e.maxHp} h={6} /></div>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>
                {e.hp}/{e.maxHp}
                {e.block > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}><ShieldIcon size={13} />{e.block}</span>}
                {e.buff > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}><StrengthIcon size={14} />+{e.buff}</span>}
              </span>
              <Seals st={e.st} size={18} />
              {e.intent && (
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, borderTop: '1px solid #b39f78', paddingTop: 3, width: '92%' }}>
                  <IntentIcons it={e.intent} size={14} font={15} />
                  {it?.who && <span className="ab-fell" style={{ fontSize: 12, fontStyle: 'italic', color: meTarget ? C.blood : C.ink, fontWeight: meTarget ? 700 : 400 }}>{it.who}</span>}
                </span>
              )}
            </button>
          );
        })}
      </section>

      <Candles total={view.energy} used={view.used} />

      {view.plan.length > 0 && (
        <section aria-label="Geplant" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="ab-sc" style={{ fontSize: 15, color: C.muted, letterSpacing: 1 }}>Geplant</span>
          {[...view.plan].sort((a: any, b: any) => SPEED_ORDER[view.hand.find((x: any) => x.uid === a.uid)?.speed] - SPEED_ORDER[view.hand.find((x: any) => x.uid === b.uid)?.speed]).map((p: any) => {
            const c = view.hand.find((x: any) => x.uid === p.uid);
            if (!c) return null;
            const tgt = p.target ? (view.enemies.find((e: any) => e.uid === p.target)?.name ?? (p.target === me.id ? 'dich' : player(p.target)?.name)) : null;
            return (
              <div key={p.uid} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#2a1f16', border: '1px solid #5b452f', padding: '6px 6px 6px 10px', animation: 'abFade .25s' }}>
                <img src={IMG(c.img)} onError={fallbackTo()} alt="" style={{ height: 30 }} />
                <span style={{ flex: 1, fontSize: 16 }}><b>{c.name}</b>{tgt ? ` → ${tgt}` : ''}{c.speed !== 'normal' ? ` · ${c.speed === 'fast' ? 'schnell' : 'langsam'}` : ''}</span>
                {!view.ready && <button type="button" aria-label={`${c.name} zurück auf die Hand`} onClick={() => send({ type: 'unplan', uid: p.uid })} style={{ background: 'transparent', border: 0, color: C.muted, fontSize: 24, width: 40, height: 40, cursor: 'pointer' }}>×</button>}
              </div>
            );
          })}
        </section>
      )}

      <section aria-label="Deine Hand" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span className="ab-sc" style={{ fontSize: 15, color: C.muted, letterSpacing: 1 }}>Deine Hand{hand.length > 5 ? ` · ${hand.length} Karten` : ''}</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: big ? '14px 8px' : '12px 10px', justifyItems: big ? 'center' : 'stretch', paddingLeft: 6 }}>
          {hand.map((c: any) => big
            ? <CardFace key={c.uid} c={c} w={108} dim={view.ready || c.cost > left} onClick={view.ready ? undefined : () => { play('paper'); setSel(c.uid); }} />
            : <MiniCard key={c.uid} c={c} dim={view.ready || c.cost > left} onClick={() => !view.ready && setSel(c.uid)} />)}
        </div>
        {!hand.length && <p className="ab-fell" style={{ fontStyle: 'italic', color: C.muted, margin: 0 }}>Keine Karten mehr auf der Hand.</p>}
      </section>

      <div style={{ flex: 1 }} />
      {view.vip && view.waitingFor.some((id: string) => !player(id)?.connected && !player(id)?.isBot) && (
        <button type="button" style={SMALL_BTN} onClick={() => send({ type: 'skipWait' })}>Nicht auf getrennte Spieler warten</button>
      )}
      <button type="button" style={{ ...BIG_BTN, background: view.ready ? '#3a2a1d' : C.wax }} onClick={() => { vibrate(25); send({ type: 'ready', on: !view.ready }); }}>
        {view.ready ? 'Doch nicht bereit' : 'Bereit'}
      </button>
    </>
  );
}

/** Handy: Detailseite eines Gegners – Werte, Zustände und was sie bewirken, nächste Aktion */
function EnemyDetail({ e, name, onClose }: { e: any; name: (id: string) => string; onClose: () => void }) {
  const it = e.intent;
  const rows: { name: string; icon: ReactNode; text: string }[] = [];
  if (e.block > 0) rows.push({ name: `Block ${e.block}`, icon: <ShieldIcon size={24} />, text: `Fängt die nächsten ${e.block} Schaden ab. Hält bis zu seinem nächsten Zug.` });
  if (e.buff > 0) rows.push({ name: `Stärke +${e.buff}`, icon: <StrengthIcon size={24} />, text: `Jeder seiner Angriffe macht ${e.buff} Schaden mehr. Hält den ganzen Kampf.` });
  const st = e.st ?? {};
  if (st.poison) rows.push({ name: `Gift ${st.poison}`, icon: <Seal l="G" col={C.green} />, text: `Verliert am Rundenende ${st.poison} Leben, danach sinkt das Gift um 1.` });
  if (st.weak) rows.push({ name: `Schwächung ${st.weak}`, icon: <Seal l="S" col="#6b5d45" />, text: `Macht 25 % weniger Schaden. Noch ${st.weak} ${st.weak === 1 ? 'Runde' : 'Runden'}.` });
  if (st.vuln) rows.push({ name: `Verwundbar ${st.vuln}`, icon: <Seal l="V" col="#8a1a1a" />, text: `Erleidet 50 % mehr Schaden. Noch ${st.vuln} ${st.vuln === 1 ? 'Runde' : 'Runden'}.` });
  if (st.mark) rows.push({ name: `Markiert ${st.mark}`, icon: <Seal l="M" col={C.gold} />, text: `Jeder Treffer macht ${st.mark} Schaden mehr. Bis zum Rundenende.` });
  if (st.stun) rows.push({ name: 'Betäubt', icon: <Seal l="B" col={C.purple} />, text: 'Setzt seine nächste Aktion aus.' });

  const plan: string[] = [];
  if (it) {
    const who = it.all || it.weakAll || it.vulnAll ? 'alle Spieler' : it.targets?.length ? name(it.targets[0]) : '';
    const rounds = (n: number) => `${n} ${n === 1 ? 'Runde' : 'Runden'}`;
    if (it.dmg) plan.push(`${it.hits > 1 ? `${it.hits}-mal ${it.dmg}` : it.dmg} Schaden ${it.all ? 'an alle Spieler' : `auf ${who}`}${it.weakest ? ' – er zielt immer auf den Spieler mit den wenigsten Leben' : ''}`);
    if (it.vuln) plan.push(`macht ${who} verwundbar für ${rounds(it.vuln)}: ${who === 'dich' ? 'du erleidest' : 'erleidet'} 50 % mehr Schaden`);
    if (it.vulnAll) plan.push(`macht alle Spieler verwundbar für ${rounds(it.vulnAll)}: alle erleiden 50 % mehr Schaden`);
    if (it.poison) plan.push(`vergiftet ${who} mit ${it.poison} Gift: am Rundenende so viele Leben weniger, danach sinkt das Gift um 1`);
    if (it.curse) plan.push(`belegt ${who} mit einem unbekannten Fluch – Schwächung, Verwundbar oder Gift. Welcher es ist, sieht man erst bei der Auflösung`);
    if (it.block) plan.push(`erhält ${it.block} Block: fängt so viel Schaden ab, bis zu seinem nächsten Zug`);
    if (it.blockAllies) plan.push(`gibt allen Gegnern ${it.blockAllies} Block`);
    if (it.healAlly) plan.push(`heilt den angeschlagensten anderen Gegner um ${it.healAlly}`);
    if (it.weakAll) plan.push(`schwächt alle Spieler für 1 Runde: ihr macht 25 % weniger Schaden`);
    if (it.buff) plan.push(`wird stärker: +${it.buff} Schaden für alle weiteren Angriffe in diesem Kampf`);
    if (it.spawn) plan.push(`ruft ${it.spawn} ${it.spawn === 1 ? 'Brutling' : 'Brutlinge'} herbei`);
    if (it.charge) plan.push('lädt einen gewaltigen Angriff auf – in der nächsten Runde trifft er alle');
    if (!plan.length) plan.push('tut diese Runde nichts');
  }
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, paddingTop: 6 }}>
        <img src={IMG(e.img)} onError={fallbackTo(e.fallback)} alt="" style={{ height: 190, filter: 'drop-shadow(0 10px 10px rgba(0,0,0,.6))' }} />
        <span className="ab-sc" style={{ fontSize: 28 }}>{e.name}</span>
        {e.elite && <span className="ab-fell" style={{ fontSize: 15, fontStyle: 'italic', color: C.gold }}>Elite</span>}
        <div style={{ width: '80%', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1 }}><Bar v={e.hp} max={e.maxHp} h={10} /></div>
          <span style={{ fontWeight: 700, fontSize: 18, whiteSpace: 'nowrap' }}>{e.hp} / {e.maxHp}</span>
        </div>
      </div>
      {it && (
        <section style={{ background: C.paper2, color: C.ink, padding: '10px 12px', clipPath: TORN2, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="ab-fell" style={{ fontSize: 14, fontStyle: 'italic', color: '#6b5d45' }}>Nächste Aktion</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="ab-sc" style={{ fontSize: 20 }}>{it.name}</span>
            <IntentIcons it={it} size={20} font={22} />
          </div>
          {plan.map((x, i) => <span key={i} style={{ fontSize: 16, lineHeight: 1.3 }}>{x[0].toUpperCase() + x.slice(1)}.</span>)}
        </section>
      )}
      <section aria-label="Zustände" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span className="ab-sc" style={{ fontSize: 15, color: C.muted, letterSpacing: 1 }}>Zustände</span>
        {rows.length ? rows.map((r) => (
          <div key={r.name} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: '#2a1f16', border: '1px solid #5b452f', padding: '8px 10px' }}>
            <span style={{ width: 30, height: 30, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.paper2, borderRadius: '50%' }}>{r.icon}</span>
            <span style={{ fontSize: 15.5, lineHeight: 1.3 }}><b className="ab-sc" style={{ fontSize: 17 }}>{r.name}</b><br />{r.text}</span>
          </div>
        )) : <span className="ab-fell" style={{ fontSize: 15, fontStyle: 'italic', color: C.muted }}>Keine Zustände.</span>}
      </section>
      <div style={{ flex: 1 }} />
      <button type="button" style={{ ...SMALL_BTN, minHeight: 48 }} onClick={onClose}>Zurück</button>
    </>
  );
}

function Seal({ l, col }: { l: string; col: string }) {
  return <span style={{ width: 26, height: 26, borderRadius: '50%', background: col, color: '#f3e6c8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, fontFamily: BODY }}>{l}</span>;
}

function PhoneResolve({ view, send }: ControllerViewProps) {
  return (
    <>
      <PhoneCenter title="Schau auf den Fernseher" text={`${view.me.name} · ${view.me.hp}/${view.me.maxHp} Leben`} img={view.me.img} />
      {view.vip && <button type="button" style={SMALL_BTN} onClick={() => send({ type: 'skip' })}>Animation überspringen</button>}
    </>
  );
}

function PhoneReward({ view, send }: ControllerViewProps) {
  if (view.done) return <PhoneCenter title={view.pickedName ? `${view.pickedName} kommt in dein Deck` : 'Du verzichtest'} text="Warte auf die anderen …" img={view.me.img} />;
  return (
    <>
      <MeHeader view={view} />
      {(view.gold > 0 || view.relic || view.healed > 0) && (
        <section style={{ background: C.paper2, color: C.ink, padding: '10px 12px', clipPath: TORN2, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="ab-sc" style={{ fontSize: 18 }}>Beute</span>
          {view.gold > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16 }}><Coin n={`+${view.gold}`} dark /> Gold</span>}
          {view.healed > 0 && <span style={{ fontSize: 16 }}>Blutstein: +{view.healed} Leben</span>}
          {view.relic && <RelicRow r={view.relic} />}
        </section>
      )}
      <div style={{ textAlign: 'center' }}>
        <span className="ab-sc" style={{ fontSize: 26 }}>{view.kind === 'boss' ? 'Legendäre Karte' : 'Neue Karte'}</span>
        <div className="ab-fell" style={{ fontSize: 16, fontStyle: 'italic', color: C.muted }}>Wähle eine Karte für dein Deck – oder keine.</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        {view.offer.map((c: any) => (
          <div key={c.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: '100%' }}>
            <CardFace c={c} w={170} onClick={() => { vibrate(20); play('paper'); send({ type: 'pick', card: c.id }); }} />
            <div style={{ width: '100%' }}><KeywordList items={cardKeywords(c)} dark /></div>
          </div>
        ))}
      </div>
      <button type="button" style={{ ...SMALL_BTN, minHeight: 48 }} onClick={() => send({ type: 'pick', card: null })}>Keine nehmen</button>
    </>
  );
}

function PhoneEnd({ view }: ControllerViewProps) {
  return <PhoneCenter title={view.result === 'win' ? 'Sieg!' : 'Niederlage'} text={view.result === 'win' ? 'Akt I ist geschafft.' : `Der Abgrund hat gewonnen – auf Stufe ${view.level}.`} img={view.me?.img} />;
}

/* ================= Akt I: gemeinsame Bausteine ================= */

const MiniSeal = ({ l, col, size = 18 }: { l: string; col: string; size?: number }) => (
  <span aria-hidden="true" style={{ width: size, height: size, borderRadius: '50%', background: col, color: '#f3e6c8', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: size * 0.55, fontFamily: BODY, flex: 'none' }}>{l}</span>
);
const HeartIcon = ({ size = 18, color = C.green }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.3-9.3C1.4 8.2 3.6 4.5 7.2 4.5c2 0 3.6 1.1 4.8 2.8 1.2-1.7 2.8-2.8 4.8-2.8 3.6 0 5.8 3.7 4.5 7.2C19.5 16.4 12 21 12 21z" fill={color} /></svg>
);
const FlameIcon = ({ size = 18, color = C.blood }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c3 4 7 6.5 7 12a7 7 0 0 1-14 0c0-3.5 2-5.5 3.5-7.5.5 2 1.5 3.5 3 3.5 0-3-1-5.5.5-8z" fill={color} /><path d="M12 12c1.5 2 3 3 3 5a3 3 0 0 1-6 0c0-1.5 1-2.5 1.8-3.5.3.9.8 1.5 1.2 1.5 0-1.2-.3-2 0-3z" fill="#ffd27a" /></svg>
);

/** Goldmünze mit Zahl */
function Coin({ n, dark, size = 18 }: { n: ReactNode; dark?: boolean; size?: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 700, color: dark ? '#6e4f1c' : '#e3b866', whiteSpace: 'nowrap' }}>
      <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="#b8893c" stroke="#6e4f1c" /><circle cx="8" cy="8" r="4" fill="none" stroke="#6e4f1c" /></svg>{n}
    </span>
  );
}

/** Bild mit Ersatz-Darstellung, solange das Bild noch fehlt */
function FigureOr({ name, fallback, alt = '', style, children }: { name: string; fallback?: string; alt?: string; style?: CSSProperties; children?: ReactNode }) {
  const [stage, setStage] = useState(0);
  useEffect(() => setStage(0), [name]);
  if (stage === 0) return <img src={IMG(name)} alt={alt} style={style} onError={() => setStage(fallback ? 1 : 2)} />;
  if (stage === 1 && fallback) return <img src={IMG(fallback)} alt={alt} style={style} onError={() => setStage(2)} />;
  return <>{children ?? null}</>;
}

/** Relikt-Symbol: Bild oder Siegel mit Anfangsbuchstabe; Gruppe = Bronzerand, riskant = roter Rand */
function RelicIcon({ r, size = 34 }: { r: any; size?: number }) {
  const ring = r.risky ? C.bright : r.group ? C.bronze : '#5b452f';
  return (
    <span title={r.name} style={{ width: size, height: size, flex: 'none', borderRadius: '50%', background: '#2a1f16', border: `2px solid ${ring}`, boxShadow: r.group ? `0 0 0 2px #5b452f` : undefined, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <FigureOr name={r.img} style={{ width: size * 0.86, height: size * 0.86, objectFit: 'contain' }}>
        <span className="ab-sc" style={{ fontSize: size * 0.5, color: r.risky ? '#ff8a70' : '#e3b866', lineHeight: 1 }}>{r.letter}</span>
      </FigureOr>
    </span>
  );
}

function RelicRow({ r, dark }: { r: any; dark?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '8px 10px', background: dark ? '#2a1f16' : C.paper2, color: dark ? C.paper : C.ink, border: dark ? '1px solid #5b452f' : 0, boxShadow: r.risky ? `inset 0 0 0 2px ${C.blood}` : r.group ? `inset 0 0 0 2px ${C.bronze}` : undefined }}>
      <RelicIcon r={r} size={44} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <b className="ab-sc" style={{ fontSize: 18 }}>{r.name}{r.group && <i className="ab-fell" style={{ fontSize: 13, color: dark ? C.muted : '#6b5236' }}> für die Gruppe</i>}{r.risky && <i className="ab-fell" style={{ fontSize: 13, color: dark ? '#ff8a70' : C.blood }}> riskant</i>}</b>
        <span style={{ fontSize: 15, lineHeight: 1.25 }}>{r.text}</span>
      </div>
    </div>
  );
}

/** Stationssymbole der Pfadkarte */
function NodeIcon({ type, size = 30, color = C.ink }: { type: string; size?: number; color?: string }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  if (type === 'fight') return <svg {...common}><path d="M4 4l11 11M20 4L9 15M13 17l4 4M11 17l-4 4M6 15l3 3M18 15l-3 3" /></svg>;
  if (type === 'elite') return <svg {...common}><path d="M12 3a7 7 0 0 0-7 7c0 2.5 1.2 4.2 3 5.3V19h8v-3.7c1.8-1.1 3-2.8 3-5.3a7 7 0 0 0-7-7z" /><circle cx="9.3" cy="10.5" r="1.3" /><circle cx="14.7" cy="10.5" r="1.3" /><path d="M10 19v2M14 19v2" /></svg>;
  if (type === 'event') return <svg {...common}><path d="M9 9a3 3 0 1 1 4 2.8c-.8.4-1 .9-1 1.7V15M12 18.5h.01" /></svg>;
  if (type === 'shop') return <svg {...common}><path d="M12 3v18M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0zM8 21h8" /></svg>;
  if (type === 'camp') return <svg {...common}><path d="M12 3c3 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-5 3-7 1 2 2 3 3 3 0-2-1-4 0-7zM4 21l16-3M4 18l16 3" /></svg>;
  if (type === 'treasure') return <svg {...common}><path d="M4 10h16v10H4zM4 10l2-5h12l2 5M12 13v3M10 13h4" /></svg>;
  return <svg {...common}><path d="M4 8l4 3 4-6 4 6 4-3-2 10H6z" /><path d="M6 21h12" /></svg>;
}

const SheetContext = createContext<(open: boolean) => void>(() => {});

/** Kopf auf dem Handy: ich, Leben, Gold, Relikte – antippen öffnet die Heldenseite */
function MeHeader({ view }: { view: any }) {
  const open = useContext(SheetContext);
  const m = view.me;
  if (!m) return null;
  return (
    <button type="button" aria-label="Mein Held: Details und Relikte" onClick={() => { play('paper'); open(true); }} style={{ border: 0, background: 'transparent', color: 'inherit', padding: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'left', fontFamily: BODY, touchAction: 'manipulation' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
        <img src={IMG(m.img)} alt="" style={{ height: 48 }} />
        <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span className="ab-fell" style={{ fontStyle: 'italic', fontSize: 15, color: C.muted }}>{m.name}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ flex: 1 }}><Bar v={m.hp} max={m.maxHp} h={7} /></span><b style={{ fontSize: 14 }}>{m.hp}/{m.maxHp}</b></span>
        </span>
        <Coin n={m.gold} size={20} />
      </span>
      {m.relics.length > 0 && (
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {m.relics.map((r: any, i: number) => <RelicIcon key={r.id + i} r={r} size={30} />)}
        </span>
      )}
    </button>
  );
}

/** Heldenseite: Werte, Relikte mit Erklärung, Deck */
function HeroSheet({ view, me, onClose }: { view: any; me: PlayerInfo; onClose: () => void }) {
  const [deckOpen, setDeckOpen] = useState(false);
  const [peek, setPeek] = useState<any>(null);
  const m = view.me;
  const deck: any[] = view.deck ?? [];
  if (peek) {
    return (
      <>
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8 }}><CardFace c={peek} w={190} /></div>
        <KeywordList items={cardKeywords(peek)} dark />
        <button type="button" style={{ ...SMALL_BTN, minHeight: 48 }} onClick={() => setPeek(null)}>Zurück</button>
      </>
    );
  }
  return (
    <>
      <header style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <img src={IMG(m.img)} alt="" style={{ height: 110 }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="ab-sc" style={{ fontSize: 26, color: me.color, lineHeight: 1 }}>{me.name}</span>
          <span className="ab-fell" style={{ fontSize: 17, fontStyle: 'italic', color: classColor(m.cls) === '#6b5236' ? C.muted : lighten(classColor(m.cls)) }}>{m.name}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ flex: 1 }}><Bar v={m.hp} max={m.maxHp} h={9} /></div><b>{m.hp}/{m.maxHp}</b></div>
        </div>
      </header>
      <div style={{ display: 'flex', gap: 8 }}>
        {[[<Coin key="g" n={m.gold} size={20} />, 'Gold'], [m.deckSize, 'Karten'], [m.relics.length, 'Relikte']].map(([v, l], i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#2a1f16', border: '1px solid #5b452f', padding: '8px 4px' }}>
            <span style={{ fontSize: 22, fontWeight: 700 }}>{v}</span><span className="ab-fell" style={{ fontSize: 13, fontStyle: 'italic', color: C.muted }}>{l}</span>
          </div>
        ))}
      </div>
      <MyStatus m={m} />
      <span className="ab-sc" style={{ fontSize: 15, color: C.muted, letterSpacing: 1 }}>Relikte</span>
      {m.relics.length ? m.relics.map((r: any, i: number) => <RelicRow key={r.id + i} r={r} />) : <span className="ab-fell" style={{ fontStyle: 'italic', color: C.muted }}>Noch keine Relikte.</span>}
      {deck.length > 0 && <button type="button" style={{ ...SMALL_BTN, minHeight: 48 }} onClick={() => setDeckOpen(!deckOpen)}>{deckOpen ? 'Deck ausblenden' : `Mein Deck ansehen (${deck.length})`}</button>}
      {deckOpen && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px 10px', paddingLeft: 6 }}>
          {deck.map((c) => <MiniCard key={c.uid} c={c} onClick={() => { play('paper'); setPeek(c); }} />)}
        </div>
      )}
      <div style={{ flex: 1 }} />
      <button type="button" style={{ ...SMALL_BTN, minHeight: 48 }} onClick={onClose}>Zurück</button>
    </>
  );
}

/** Eigene Zustände (Buffs und Debuffs) mit Erklärung */
function MyStatus({ m }: { m: any }) {
  const rows: { name: string; icon: ReactNode; text: string; bad?: boolean }[] = [];
  const st = m.st ?? {};
  const rounds = (n: number) => `Noch ${n} ${n === 1 ? 'Runde' : 'Runden'}.`;
  if (m.block > 0) rows.push({ name: `Block ${m.block}`, icon: <ShieldIcon size={22} />, text: `Fängt die nächsten ${m.block} Schaden ab.${m.keepBlock ? ' Verfällt diese Runde nicht.' : ' Verfällt am Ende der Runde.'}` });
  if (m.str > 0) rows.push({ name: `Stärke ${m.str}`, icon: <StrengthIcon size={22} />, text: `Jeder deiner Treffer macht ${m.str} Schaden mehr. Bis Kampfende.` });
  if (m.roundStr > 0) rows.push({ name: `+${m.roundStr} Schaden`, icon: <StrengthIcon size={22} />, text: 'Jeder deiner Treffer macht diese Runde so viel Schaden mehr.' });
  const P: Record<string, (v: number) => [string, string]> = {
    blockRound: (v) => ['Rüstung', `Du erhältst zu Beginn jeder Runde ${v} Block. Bis Kampfende.`],
    blockAllRound: (v) => ['Ägis', `Alle Spieler erhalten zu Beginn jeder Runde ${v} Block. Bis Kampfende.`],
    poisonAllRound: (v) => ['Miasma', `Alle Gegner erhalten zu Beginn jeder Runde ${v} Gift. Bis Kampfende.`],
    healAllRound: (v) => ['Lebensbaum', `Alle Spieler heilen zu Beginn jeder Runde ${v}. Bis Kampfende.`],
    thorns: (v) => ['Eiserne Dornen', `Greift dich ein Gegner an, erleidet er ${v} Schaden. Bis Kampfende.`],
  };
  for (const [k, v] of Object.entries(m.powers ?? {}) as [string, number][]) if (v && P[k]) { const [n, t] = P[k](v); rows.push({ name: n, icon: <FlameIcon size={22} color={C.gold} />, text: t }); }
  if (m.undying) rows.push({ name: 'Unbeugsam', icon: <HeartIcon size={22} color={C.gold} />, text: 'Fällst du in diesem Kampf, bleibst du einmal mit 1 Leben stehen.' });
  if (m.revive) rows.push({ name: 'Wiedergeburt', icon: <HeartIcon size={22} color={C.gold} />, text: 'Fällt in diesem Kampf ein Spieler, steht er einmal mit 30 % Leben wieder auf.' });
  if (st.poison) rows.push({ name: `Gift ${st.poison}`, icon: <Seal l="G" col={C.green} />, text: `Du verlierst am Rundenende ${st.poison} Leben, danach sinkt das Gift um 1.`, bad: true });
  if (st.weak) rows.push({ name: `Schwächung ${st.weak}`, icon: <Seal l="S" col="#6b5d45" />, text: `Du machst 25 % weniger Schaden. ${rounds(st.weak)}`, bad: true });
  if (st.vuln) rows.push({ name: `Verwundbar ${st.vuln}`, icon: <Seal l="V" col="#8a1a1a" />, text: `Du erleidest 50 % mehr Schaden. ${rounds(st.vuln)}`, bad: true });
  if (st.mark) rows.push({ name: `Markiert ${st.mark}`, icon: <Seal l="M" col={C.gold} />, text: `Jeder Treffer gegen dich macht ${st.mark} Schaden mehr. Bis zum Rundenende.`, bad: true });
  if (st.stun) rows.push({ name: 'Betäubt', icon: <Seal l="B" col={C.purple} />, text: 'Du setzt deine nächste Aktion aus.', bad: true });
  return (
    <>
      <span className="ab-sc" style={{ fontSize: 15, color: C.muted, letterSpacing: 1 }}>Zustände</span>
      {rows.length ? rows.map((r) => (
        <div key={r.name} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: '#2a1f16', border: `1px solid ${r.bad ? '#7a2416' : '#5b452f'}`, padding: '8px 10px' }}>
          <span style={{ width: 30, height: 30, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.paper2, borderRadius: '50%' }}>{r.icon}</span>
          <span style={{ fontSize: 15.5, lineHeight: 1.3 }}><b className="ab-sc" style={{ fontSize: 17, color: r.bad ? '#ff8a70' : C.paper }}>{r.name}</b><br />{r.text}</span>
        </div>
      )) : <span className="ab-fell" style={{ fontSize: 15, fontStyle: 'italic', color: C.muted }}>Keine Zustände.</span>}
    </>
  );
}

/** Helle Variante einer Klassenfarbe (Schrift auf dunklem Grund) */
const lighten = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = (x: number) => Math.round(x + (255 - x) * 0.45).toString(16).padStart(2, '0');
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
};

/** Karte aus dem eigenen Deck wählen (entfernen, schmieden, verdoppeln) */
function DeckPicker({ cards, title, hint, confirm, upgrade, onPick, onCancel }: { cards: any[]; title: string; hint?: string; confirm: string; upgrade?: boolean; onPick: (uid: string) => void; onCancel: () => void }) {
  const [sel, setSel] = useState<any>(null);
  if (sel) {
    const after = upgrade ? { ...sel, name: sel.name + '+', text: sel.upText ?? sel.text, cost: sel.upCost ?? sel.cost, up: true } : null;
    return (
      <>
        <span className="ab-sc" style={{ fontSize: 22, textAlign: 'center' }}>{title}</span>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, paddingTop: 8 }}>
          <CardFace c={sel} w={after ? 140 : 190} />
          {after && <span className="ab-sc" style={{ fontSize: 30, color: C.muted }}>→</span>}
          {after && <CardFace c={after} w={140} />}
        </div>
        <KeywordList items={cardKeywords(after ?? sel)} dark />
        <button type="button" style={BIG_BTN} onClick={() => { vibrate(20); play('paper'); onPick(sel.uid); }}>{confirm}</button>
        <button type="button" style={{ ...SMALL_BTN, minHeight: 48 }} onClick={() => setSel(null)}>Andere Karte</button>
      </>
    );
  }
  return (
    <>
      <span className="ab-sc" style={{ fontSize: 22 }}>{title}</span>
      {hint && <span className="ab-fell" style={{ fontSize: 15, fontStyle: 'italic', color: C.muted }}>{hint}</span>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px 10px', paddingLeft: 6 }}>
        {cards.map((c) => <MiniCard key={c.uid} c={c} onClick={() => { play('paper'); setSel(c); }} />)}
      </div>
      {!cards.length && <p className="ab-fell" style={{ fontStyle: 'italic', color: C.muted }}>Keine passende Karte.</p>}
      <button type="button" style={{ ...SMALL_BTN, minHeight: 48 }} onClick={onCancel}>Abbrechen</button>
    </>
  );
}

/** „Warte auf …“ mit Knopf für den VIP, wenn jemand getrennt ist */
function Waiting({ view, send, player, text = 'Warte auf die anderen …' }: { view: any; send: (a: any) => void; player: (id: string) => PlayerInfo | undefined; text?: string }) {
  const names = (view.waitingFor ?? []).map((id: string) => player(id)?.name).filter(Boolean);
  const off = (view.waitingFor ?? []).some((id: string) => !player(id)?.connected && !player(id)?.isBot);
  return (
    <>
      <span className="ab-fell" style={{ fontSize: 16, fontStyle: 'italic', color: C.muted, textAlign: 'center' }}>{names.length ? `Warte auf ${names.join(', ')} …` : text}</span>
      {view.vip && off && <button type="button" style={SMALL_BTN} onClick={() => send({ type: 'skipWait' })}>Nicht auf getrennte Spieler warten</button>}
    </>
  );
}

/** Siegel eines Spielers (Anfangsbuchstabe in Spielerfarbe) */
function VoteSeal({ p, size = 26 }: { p?: PlayerInfo; size?: number }) {
  return (
    <span title={p?.name} style={{ width: size, height: size, borderRadius: '50%', background: shadeDark(p?.color), color: '#f3e6c8', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.5, fontWeight: 700, boxShadow: 'inset 0 0 0 3px rgba(0,0,0,.22), 0 2px 3px rgba(0,0,0,.4)', animation: 'abPop .35s ease-out', flex: 'none' }}>
      {(p?.name ?? '?').slice(0, 1).toUpperCase()}
    </span>
  );
}

/* ================= Akt I: Fernseher ================= */

function TvTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ position: 'absolute', left: 36, top: 22, display: 'flex', alignItems: 'baseline', gap: 16, zIndex: 5 }}>
      <span className="ab-sc" style={{ fontSize: 40, letterSpacing: 6, textShadow: '0 4px 12px rgba(0,0,0,.8)' }}>{title}</span>
      {sub && <span className="ab-fell" style={{ fontSize: 22, fontStyle: 'italic', color: '#c8b993' }}>{sub}</span>}
    </div>
  );
}

const PAPER_BOX: CSSProperties = { background: C.paper, color: C.ink, clipPath: TORN, boxShadow: '0 8px 18px rgba(0,0,0,.6)' };

function HostMap({ view, player }: HostViewProps) {
  const m = view.map;
  const v = m.vote;
  const names: Record<string, string> = view.nodeNames;
  const nodes: any[] = m.nodes;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const first = Math.max(1, m.level);
  const lastLv = Math.min(m.levels, m.sight);
  const top0 = m.level === 0 ? 170 : 90;
  const y = (lv: number) => top0 + (lv - first) * 140;
  const x = (col: number) => 110 + col * 180;
  const shown = nodes.filter((n) => n.lv >= first && n.lv <= lastLv);
  // erreichbar ab hier
  const reach = new Set<string>();
  const startIds = m.pos ? [m.pos] : nodes.filter((n) => n.lv === 1).map((n) => n.id);
  const queue = [...startIds];
  while (queue.length) { const id = queue.shift()!; if (reach.has(id)) continue; reach.add(id); for (const t of byId.get(id)?.next ?? []) queue.push(t); }
  const onPath = (a: string, b: string) => { const i = m.path.indexOf(a); return i >= 0 && m.path[i + 1] === b; };
  const options: string[] = v?.options ?? [];
  const leader = v ? (v.winner ?? [...options].sort((a, b) => (v.votes[b]?.length ?? 0) - (v.votes[a]?.length ?? 0))[0]) : null;
  const heroes: any[] = view.heroes ?? [];
  const here = m.pos ? byId.get(m.pos) : null;
  const hereX = here ? x(here.col) : 380, hereY = here ? y(here.lv) : 78;
  useEffect(() => { play('paper'); }, [m.pos]);
  const voteCount = Object.values(v?.votes ?? {}).reduce((s: number, a: any) => s + a.length, 0);
  useEffect(() => { if (voteCount) play('ready'); }, [voteCount]);

  return (
    <>
      <Backdrop img="hintergrund-kampf-abgrund" opacity={0.35} />
      <TvTitle title="Abgrund" sub={`Akt I · Stufe ${m.level} von ${m.levels}`} />
      <section aria-label="Pfadkarte" style={{ ...PAPER_BOX, position: 'absolute', left: 60, top: 84, width: 760, height: 700, clipPath: 'polygon(0 3%,6% 0,40% 2%,70% 0,100% 3%,99% 40%,100% 97%,65% 100%,30% 98%,0 100%,1% 60%)' }}>
        <svg width="760" height="700" viewBox="0 0 760 700" aria-hidden="true" style={{ position: 'absolute', inset: 0 }}>
          {m.level === 0 && startIds.map((id) => { const n = byId.get(id)!; return <path key={id} d={`M380 84 C 380 110, ${x(n.col)} ${y(n.lv) - 60}, ${x(n.col)} ${y(n.lv)}`} fill="none" stroke="#3b2c1d" strokeWidth="3" strokeLinecap="round" strokeDasharray="2 9" />; })}
          {shown.flatMap((n) => n.next.map((t: string) => {
            const tn = byId.get(t);
            if (!tn || tn.lv > lastLv) return null;
            const x1 = x(n.col), y1 = y(n.lv), x2 = x(tn.col), y2 = y(tn.lv);
            const red = onPath(n.id, t);
            const live = reach.has(n.id) && reach.has(t);
            return <path key={n.id + t} d={`M${x1} ${y1} C ${x1} ${y1 + 60}, ${x2} ${y2 - 60}, ${x2} ${y2}`} fill="none" stroke={red ? '#7a1012' : '#3b2c1d'} strokeWidth={red ? 5 : 3} strokeLinecap="round" strokeDasharray={red ? undefined : '2 9'} opacity={live || red ? 1 : 0.3} />;
          }))}
        </svg>
        {m.level === 0 && <span className="ab-fell" style={{ position: 'absolute', left: 520, top: 52, fontSize: 20, fontStyle: 'italic', color: '#3b2c1d' }}>Eingang</span>}
        {shown.map((n) => {
          const isOpt = options.includes(n.id);
          const isHere = n.id === m.pos;
          const isBoss = n.type === 'boss';
          const sz = isBoss ? 96 : isOpt ? 70 : 58;
          const faded = !reach.has(n.id) && !isHere;
          const win = v?.winner === n.id;
          return (
            <div key={n.id}>
              <div style={{
                position: 'absolute', left: x(n.col) - sz / 2, top: y(n.lv) - sz / 2, width: sz, height: sz, borderRadius: '50%', boxSizing: 'border-box',
                background: isBoss ? '#2a1414' : '#e3d3ad', border: `${isOpt || isBoss ? 4 : 3}px solid ${isOpt ? '#7a1012' : '#1c140d'}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: faded ? 0.35 : 1, boxShadow: isHere ? '0 0 0 6px rgba(184,137,60,.55)' : win ? '0 0 0 8px rgba(196,22,28,.5)' : '0 3px 0 rgba(28,20,13,.35)', transition: 'box-shadow .3s',
                animation: win ? 'abPop .5s ease-out' : undefined,
              }}>
                <NodeIcon type={n.type} size={sz * 0.55} color={isBoss ? '#e23b30' : n.type === 'elite' ? '#7a1012' : C.ink} />
              </div>
              {(isOpt || isBoss) && <span className="ab-fell" style={{ position: 'absolute', left: x(n.col), top: y(n.lv) + sz / 2 + 2, transform: 'translateX(-50%)', fontSize: 18, fontStyle: 'italic', color: n.type === 'elite' || isBoss ? '#7a1012' : '#3b2c1d', whiteSpace: 'nowrap' }}>{isBoss && m.boss ? m.boss.name : names[n.type]}</span>}
              {isOpt && (v?.votes[n.id]?.length ?? 0) > 0 && (
                <div style={{ position: 'absolute', left: x(n.col) + sz / 2 + 6, top: y(n.lv) - sz / 2, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {v.votes[n.id].map((id: string) => <VoteSeal key={id} p={player(id)} size={24} />)}
                </div>
              )}
            </div>
          );
        })}
        {/* eure Figuren */}
        {heroes.slice(0, 4).map((h, k) => (
          <img key={h.id} src={IMG(h.img)} alt="" style={{ position: 'absolute', left: hereX - 76 + k * 34, top: Math.max(6, hereY - 72) + (k % 2) * 6, height: 62, filter: 'drop-shadow(0 4px 3px rgba(0,0,0,.4))', transition: 'left .8s, top .8s' }} />
        ))}
        {heroes.length > 4 && <span className="ab-sc" style={{ position: 'absolute', left: hereX + 70, top: hereY - 50, fontSize: 18, color: '#3b2c1d' }}>+{heroes.length - 4}</span>}
        {/* Nebel: tiefer sieht man nicht */}
        {lastLv < m.levels && <div style={{ position: 'absolute', left: 0, right: 0, top: y(lastLv) - 40, bottom: 0, background: 'linear-gradient(180deg, rgba(15,11,8,0) 0%, rgba(15,11,8,.6) 45%, rgba(15,11,8,.97) 80%)' }} />}
        {lastLv < m.levels && <span className="ab-fell" style={{ position: 'absolute', left: 0, right: 0, top: Math.min(640, y(lastLv) + 90), textAlign: 'center', fontSize: 20, fontStyle: 'italic', color: '#8f7f60' }}>… die Tiefe ist noch dunkel</span>}
      </section>

      <section style={{ ...PAPER_BOX, position: 'absolute', right: 24, top: 96, width: 330, padding: '20px 22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {v?.winner ? (
          <>
            <span className="ab-fell" style={{ fontSize: 18, fontStyle: 'italic', color: '#4a3b29' }}>Es geht weiter zum</span>
            <span className="ab-sc" style={{ fontSize: 34, display: 'flex', alignItems: 'center', gap: 10, color: ['elite', 'boss'].includes(byId.get(v.winner)?.type) ? '#7a1012' : C.ink }}><NodeIcon type={byId.get(v.winner)?.type} size={34} />{byId.get(v.winner)?.type === 'boss' && m.boss ? m.boss.name : names[byId.get(v.winner)?.type]}</span>
          </>
        ) : (
          <>
            <span className="ab-sc" style={{ fontSize: 30 }}>Wohin?</span>
            <span className="ab-fell" style={{ fontSize: 17, fontStyle: 'italic', color: '#4a3b29' }}>Stimmt auf dem Handy ab.</span>
            {options.map((o) => {
              const n = byId.get(o);
              const cnt = v?.votes[o]?.length ?? 0;
              const tot = Math.max(1, v?.voters?.length ?? 1);
              return (
                <div key={o} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 20 }}>
                    <NodeIcon type={n?.type} size={24} color={n?.type === 'elite' ? '#7a1012' : C.ink} />
                    <span className="ab-sc" style={{ flex: 1, color: n?.type === 'elite' ? '#7a1012' : C.ink }}>{names[n?.type]}</span><b>{cnt}</b>
                  </div>
                  <div style={{ height: 8, background: '#c9b88f' }}><div style={{ width: `${(cnt / tot) * 100}%`, height: 8, background: n?.type === 'elite' ? '#7a1012' : '#3b2c1d', transition: 'width .3s' }} /></div>
                </div>
              );
            })}
            <div style={{ height: 1, background: '#b39f78', margin: '4px 0' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 17, flex: 1 }}>{((ids: string[]) => (ids.length ? `Noch offen: ${ids.map((id) => player(id)?.name).join(', ')}` : 'Alle haben abgestimmt'))((v?.voters ?? []).filter((id: string) => !Object.values(v.votes).some((a: any) => a.includes(id))))}</span>
              {v?.deadline && <HostTimer deadline={v.deadline} duration={v.duration} size={48} />}
            </div>
          </>
        )}
      </section>
      {leader && byId.get(leader) && (
        <section style={{ ...PAPER_BOX, position: 'absolute', right: 24, top: 470, width: 330, padding: '16px 22px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="ab-sc" style={{ fontSize: 20 }}>{byId.get(leader).type === 'boss' && m.boss ? m.boss.name : names[byId.get(leader).type]}</span>
          <span style={{ fontSize: 17, lineHeight: 1.3 }}>{view.nodeDesc[byId.get(leader).type]}</span>
        </section>
      )}
    </>
  );
}

/** Spielerfiguren in einer Reihe (Laden, Lagerfeuer, Schatz) */
function HeroRow({ heroes, player, top = 520, label, mark }: { heroes: any[]; player: (id: string) => PlayerInfo | undefined; top?: number; label: (h: any) => ReactNode; mark?: (h: any) => boolean }) {
  const n = heroes.length;
  const slot = Math.min(190, 1180 / n);
  const figH = n <= 4 ? 120 : n <= 8 ? 96 : 76;
  return (
    <>
      {heroes.map((h, k) => {
        const x = 640 + (k - (n - 1) / 2) * slot;
        const pl = player(h.id);
        return (
          <div key={h.id} style={{ position: 'absolute', left: x - slot / 2, top, width: slot, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{ position: 'relative' }}>
              <img src={IMG(h.img)} alt="" style={{ height: figH, filter: 'drop-shadow(0 10px 8px rgba(0,0,0,.65))', animation: `abSway ${3.2 + (k % 4) * 0.4}s ease-in-out infinite`, transformOrigin: 'bottom center' }} />
              {mark?.(h) && <span style={{ position: 'absolute', right: -14, top: 4, width: 30, height: 30, borderRadius: '50%', background: '#7a2416', color: '#f3e6c8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, boxShadow: 'inset 0 0 0 3px rgba(0,0,0,.22)', animation: 'abPop .4s ease-out' }}>✓</span>}
            </div>
            <div style={{ background: C.paper, color: C.ink, padding: '3px 10px 5px', clipPath: TORN2, display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: slot - 6, boxSizing: 'border-box' }}>
              <span className="ab-sc" style={{ fontSize: n > 8 ? 14 : 17, color: shadeDark(pl?.color), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: slot - 26 }}>{pl?.name}</span>
              <span style={{ fontSize: n > 8 ? 12 : 15, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>{label(h)}</span>
            </div>
          </div>
        );
      })}
    </>
  );
}

function MerchantSilhouette() {
  return (
    <svg width="300" height="330" viewBox="0 0 300 330" aria-hidden="true">
      <path d="M150 20c-40 0-62 34-62 70 0 20 6 34 14 46-30 20-50 70-56 150h208c-6-80-26-130-56-150 8-12 14-26 14-46 0-36-22-70-62-70z" fill="#1c140d" opacity=".85" />
      <circle cx="136" cy="96" r="4" fill="#c4161c" /><circle cx="164" cy="96" r="4" fill="#c4161c" />
    </svg>
  );
}

function HostShop({ view, player }: HostViewProps) {
  const done = new Set<string>(view.done);
  useEffect(() => { if (view.last) play('paper'); }, [view.last?.at]);
  return (
    <>
      <Backdrop img="hintergrund-kampf-abgrund" opacity={0.42} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 45% 60% at 50% 45%, rgba(255,150,60,.16), rgba(15,11,8,.6) 70%)' }} />
      <TvTitle title="Der Händler" sub={`Akt I · Stufe ${view.node?.lv} · Jeder kauft auf dem Handy`} />
      <div style={{ position: 'absolute', left: 490, top: 100, width: 300, height: 330, display: 'flex', justifyContent: 'center', alignItems: 'flex-end' }}>
        <FigureOr name="figur-haendler" style={{ height: 330, filter: 'drop-shadow(0 14px 12px rgba(0,0,0,.65))', animation: 'abSway 5s ease-in-out infinite', transformOrigin: 'bottom center' }}><MerchantSilhouette /></FigureOr>
      </div>
      <svg width="620" height="110" viewBox="0 0 620 110" aria-hidden="true" style={{ position: 'absolute', left: 330, top: 410 }}>
        <path d="M10 20 L610 20 L590 50 L30 50 Z" fill="#3a2718" stroke="#1c140d" strokeWidth="2" />
        <path d="M40 50 L40 110 M580 50 L580 110" stroke="#2a1b10" strokeWidth="10" />
        <ellipse cx="120" cy="16" rx="22" ry="8" fill="#b8893c" /><ellipse cx="128" cy="10" rx="22" ry="8" fill="#d0a24f" />
        <rect x="250" y="-6" width="38" height="24" rx="3" fill="#e3d3ad" stroke="#1c140d" /><rect x="296" y="-10" width="38" height="28" rx="3" fill="#e9dbb8" stroke="#1c140d" />
        <circle cx="470" cy="6" r="12" fill="#7a4fb0" stroke="#1c140d" />
      </svg>
      <HeroRow heroes={view.heroes} player={player} top={500} label={(h) => <Coin n={h.gold} dark />} mark={(h) => done.has(h.id)} />
      {view.last && Date.now() - view.last.at < 4000 && <Floater key={view.last.at} x={640} y={380} text={`${player(view.last.id)?.name ?? ''} ${view.last.text}`} color={C.paper} k={String(view.last.at)} />}
      <section style={{ ...PAPER_BOX, position: 'absolute', right: 40, top: 110, width: 270, padding: '18px 22px 22px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span className="ab-sc" style={{ fontSize: 22 }}>Im Laden</span>
        <span style={{ fontSize: 17, lineHeight: 1.35 }}>Jeder hat sein eigenes Angebot: Karten seiner Klasse, Relikte und „Karte entfernen“.</span>
        <div style={{ height: 1, background: '#b39f78', margin: '4px 0' }} />
        <span style={{ fontSize: 17 }}><b>{done.size} von {view.heroes.length}</b> fertig</span>
      </section>
    </>
  );
}

function Campfire({ size = 1 }: { size?: number }) {
  return (
    <svg width={180 * size} height={200 * size} viewBox="0 0 180 200" aria-hidden="true">
      <g style={{ transformOrigin: '90px 160px', animation: 'abCandle 1.3s ease-in-out infinite' }}>
        <path d="M90 10 C 120 60 150 80 140 130 C 132 170 48 170 40 130 C 32 90 70 70 70 40 C 80 60 85 70 90 70 C 92 50 86 30 90 10 Z" fill="#f2a43a" />
        <path d="M92 70 C 110 100 122 115 116 140 C 110 162 70 162 64 140 C 60 120 78 110 80 92 C 86 104 90 108 92 108 Z" fill="#ffe38a" />
      </g>
      <circle cx="60" cy="40" r="3" fill="#ffb347" /><circle cx="124" cy="24" r="2.5" fill="#ffb347" /><circle cx="104" cy="2" r="2" fill="#ffd27a" />
      <path d="M20 182 L160 160 M20 160 L160 184" stroke="#3a2718" strokeWidth="14" strokeLinecap="round" />
    </svg>
  );
}

function HostCamp({ view, player }: HostViewProps) {
  const chosen = new Set<string>(view.chosen);
  const res = new Map<string, string>((view.result ?? []).map((r: any) => [r.id, r.text]));
  useEffect(() => { if (view.result) play('heal'); }, [!!view.result]);
  useEffect(() => { sfx.custom((s) => s.noise(1.4, { filter: 1800, type: 'bandpass', vol: 0.05 })); }, [chosen.size]);
  return (
    <>
      <Backdrop img="hintergrund-lager" opacity={0.4} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 40% 45% at 50% 62%, rgba(255,140,40,.35), rgba(255,90,20,.06) 55%, rgba(15,11,8,.85) 100%)' }} />
      <TvTitle title="Lagerfeuer" sub={`Akt I · Stufe ${view.node?.lv}${view.node?.lv === 10 ? ' · Ein letzter Halt vor der Tiefe' : ''}`} />
      <div style={{ position: 'absolute', left: 550, top: 250 }}>
        <FigureOr name="figur-lagerfeuer" style={{ height: 210 }}><Campfire /></FigureOr>
      </div>
      <HeroRow heroes={view.heroes} player={player} top={460} label={(h) => (res.get(h.id) ? <i>{res.get(h.id)}</i> : chosen.has(h.id) ? 'hat gewählt' : <i>wählt …</i>)} mark={(h) => chosen.has(h.id) && !view.result} />
      <section style={{ ...PAPER_BOX, position: 'absolute', right: 40, top: 96, width: 300, padding: '18px 22px 22px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span className="ab-sc" style={{ fontSize: 22 }}>Jeder wählt eins</span>
        <span style={{ fontSize: 17, lineHeight: 1.35 }}><b>Rasten</b> · 30 % der Leben heilen</span>
        <span style={{ fontSize: 17, lineHeight: 1.35 }}><b>Schmieden</b> · eine Karte verbessern</span>
        {!view.solo && <span style={{ fontSize: 17, lineHeight: 1.35 }}><b>Wache halten</b> · deine Rast einem Mitspieler schenken</span>}
      </section>
    </>
  );
}

function EventPicture({ img, height }: { img: string; height: number }) {
  return (
    <FigureOr name={img} style={{ width: '100%', height, objectFit: 'cover', filter: 'sepia(.2)' }}>
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(ellipse at 50% 40%, #d8c69c, #b9a57a)', color: '#6b5d45' }}>
        <NodeIcon type="event" size={height * 0.4} color="#6b5d45" />
      </div>
    </FigureOr>
  );
}

function HostEvent({ view, player }: HostViewProps) {
  const e = view.event;
  const v = view.vote;
  if (!e) return null;
  const picked = new Set<string>(e.picked);
  useEffect(() => { play('paper'); }, [e.stage]);
  return (
    <>
      <Backdrop img="hintergrund-kampf-abgrund" opacity={0.25} />
      <section aria-label="Ereignis" style={{ position: 'absolute', left: 70, top: 50, width: 1140, height: 610, display: 'flex', filter: 'drop-shadow(0 20px 30px rgba(0,0,0,.75))' }}>
        <div style={{ flex: 1, background: C.paper2, borderRadius: '8px 0 0 8px', padding: 34, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 14, boxShadow: 'inset -30px 0 40px -20px rgba(60,40,20,.55)', color: C.ink }}>
          <EventPicture img={e.img} height={480} />
          <span className="ab-fell" style={{ fontSize: 18, fontStyle: 'italic', color: '#4a3b29', textAlign: 'center' }}>— Stufe {view.node?.lv} —</span>
        </div>
        <div style={{ flex: 1, background: C.paper, color: C.ink, borderRadius: '0 8px 8px 0', padding: '38px 44px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 14, boxShadow: 'inset 30px 0 40px -20px rgba(60,40,20,.45)' }}>
          <span className="ab-sc" style={{ fontSize: 42, lineHeight: 1 }}>{e.name}</span>
          <p className="ab-fell" style={{ margin: 0, fontSize: 22, lineHeight: 1.4 }}><span className="ab-sc" style={{ fontSize: 44, float: 'left', lineHeight: 0.9, padding: '4px 8px 0 0', color: '#7a1012' }}>{e.text[0]}</span>{e.text.slice(1)}</p>
          <div style={{ flex: 1 }} />
          {e.stage === 'result' ? (
            <>
              <span className="ab-fell" style={{ fontSize: 18, fontStyle: 'italic', color: '#4a3b29' }}>{e.choice ? `Ihr habt gewählt: ${e.options.find((o: any) => o.id === e.choice)?.label}` : 'So ist es ausgegangen:'}</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 230, overflow: 'hidden' }}>
                {e.results.map((r: any) => (
                  <span key={r.id} style={{ fontSize: e.results.length > 6 ? 15 : 18, animation: 'abFade .4s' }}><b className="ab-sc" style={{ color: shadeDark(player(r.id)?.color) }}>{player(r.id)?.name}</b> · {r.text}</span>
                ))}
              </div>
            </>
          ) : (
            <>
              <span className="ab-fell" style={{ fontSize: 18, fontStyle: 'italic', color: '#4a3b29' }}>{e.group ? 'Die Gruppe entscheidet:' : 'Jeder entscheidet auf dem Handy für sich:'}</span>
              {e.options.map((o: any) => {
                const votes: string[] = v?.votes?.[o.id] ?? [];
                const win = v?.winner === o.id;
                return (
                  <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', border: `2px solid ${win ? '#7a1012' : '#3b2c1d'}`, background: C.paper2 }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}><b className="ab-sc" style={{ fontSize: 21 }}>{o.label}</b><span style={{ fontSize: 16 }}>{o.desc}</span></div>
                    {votes.map((id) => <VoteSeal key={id} p={player(id)} />)}
                  </div>
                );
              })}
              {e.group && v && !v.winner && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 17, flex: 1 }}>{((ids: string[]) => (ids.length ? `Noch offen: ${ids.map((id) => player(id)?.name).join(', ')}` : 'Alle haben abgestimmt'))((v.voters ?? []).filter((id: string) => !Object.values(v.votes).some((a: any) => a.includes(id))))}</span>
                  {v.deadline && <HostTimer deadline={v.deadline} duration={v.duration} size={44} />}
                </div>
              )}
              {!e.group && <span style={{ fontSize: 17 }}>{((l: string[]) => (l.length ? `Noch offen: ${l.join(', ')}` : 'Alle haben gewählt'))(view.heroes.filter((h: any) => !picked.has(h.id)).map((h: any) => player(h.id)?.name))}</span>}
            </>
          )}
        </div>
      </section>
    </>
  );
}

function Chest() {
  return (
    <svg width="220" height="170" viewBox="0 0 220 170" aria-hidden="true">
      <path d="M20 70 L200 70 L200 160 L20 160 Z" fill="#5a3a20" stroke="#1c140d" strokeWidth="4" />
      <path d="M20 70 Q110 0 200 70" fill="#6e4a28" stroke="#1c140d" strokeWidth="4" />
      <path d="M20 100 L200 100" stroke="#b8893c" strokeWidth="8" /><rect x="96" y="88" width="28" height="34" rx="4" fill="#b8893c" stroke="#1c140d" strokeWidth="3" />
      <g style={{ animation: 'abCandle 1.6s ease-in-out infinite', transformOrigin: '110px 60px' }}><path d="M70 60 Q110 10 150 60" fill="none" stroke="#ffd27a" strokeWidth="4" opacity=".7" /></g>
    </svg>
  );
}

function HostTreasure({ view, player }: HostViewProps) {
  const done = new Set<string>(view.done);
  useEffect(() => { play('win'); }, []);
  return (
    <>
      <Backdrop img="hintergrund-kampf-abgrund" opacity={0.4} />
      <TvTitle title="Ein Schatz" sub={`Akt I · Stufe ${view.node?.lv} · Ein Relikt für jeden`} />
      <div style={{ position: 'absolute', left: 530, top: 150 }}><Chest /></div>
      <HeroRow heroes={view.heroes} player={player} top={380} mark={(h) => done.has(h.id)} label={(h) => {
        const r = view.relics[h.id];
        return r ? <><RelicIcon r={r} size={28} /> {r.name}</> : <i>nichts Neues</i>;
      }} />
    </>
  );
}

function HostBossIntro({ view }: HostViewProps) {
  useEffect(() => {
    sfx.custom((s) => { s.tone(55, 3.5, { type: 'sawtooth', vol: 0.08, attack: 0.8 }); s.tone(41, 3.5, { vol: 0.12, attack: 1 }); s.noise(3, { filter: 400, type: 'lowpass', vol: 0.15, at: 0.5 }); });
  }, []);
  return (
    <>
      <div style={{ position: 'absolute', inset: 0, background: '#070504' }} />
      <img src={IMG('hintergrund-kampf-abgrund')} alt="" style={{ position: 'absolute', inset: 0, width: 1280, height: 720, objectFit: 'cover', opacity: 0.12 }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 50% 60% at 50% 80%, rgba(196,40,20,.4), rgba(7,5,4,0) 70%)' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: -20, display: 'flex', justifyContent: 'center', animation: 'abRise 3.5s ease-out both' }}>
        <FigureOr name={view.boss.img} fallback={view.boss.fallback} style={{ height: 520, filter: 'drop-shadow(0 0 30px rgba(196,40,20,.5)) drop-shadow(0 14px 12px rgba(0,0,0,.8))' }} />
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 70, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, animation: 'abFade 1.5s .8s both' }}>
        <span className="ab-fell" style={{ fontSize: 26, fontStyle: 'italic', color: '#c8b993', letterSpacing: 2 }}>Aus der Tiefe erhebt sich</span>
        <span className="ab-sc" style={{ fontSize: 104, lineHeight: 1, letterSpacing: 8, color: '#c4161c', textShadow: '0 0 30px rgba(196,22,28,.55), 0 8px 18px rgba(0,0,0,.9)' }}>{view.boss.name}</span>
      </div>
    </>
  );
}

/* ================= Akt I: Handy ================= */

function PhoneMap({ view, send, player, me }: ControllerViewProps) {
  const m = view.map;
  const v = m.vote;
  const names: Record<string, string> = view.nodeNames;
  const byId = new Map<string, any>(m.nodes.map((n: any) => [n.id, n]));
  const opts: string[] = v?.options ?? [];
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => { setSel(view.myVote ?? null); }, [m.pos]);
  const label = (n: any) => (n?.type === 'boss' && m.boss ? m.boss.name : names[n?.type]);
  if (v?.winner) {
    const n = byId.get(v.winner);
    return (
      <>
        <MeHeader view={view} />
        <PhoneCenter title={`Weiter zum ${label(n) ?? ''}`} text={view.nodeDesc[n?.type]} />
      </>
    );
  }
  const selN = sel ? byId.get(sel) : null;
  const mine = view.myVote;
  return (
    <>
      <MeHeader view={view} />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span className="ab-sc" style={{ fontSize: 28 }}>Wohin?</span>
        <span className="ab-fell" style={{ fontSize: 15, fontStyle: 'italic', color: C.muted }}>Tippe ein rot umrandetes Ziel an · die Mehrheit entscheidet</span>
      </div>
      <PhoneMapBoard m={m} names={names} sel={sel} onSel={(o) => { play('paper'); vibrate(10); setSel(o); }} player={player} myVote={mine} meImg={view.me.img} />
      {selN ? (
        <section style={{ background: C.paper2, color: C.ink, padding: '12px 14px', clipPath: TORN2, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 50, height: 50, flex: 'none', borderRadius: '50%', border: `3px solid ${['elite', 'boss'].includes(selN.type) ? '#7a1012' : C.ink}`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.paper }}>
            <NodeIcon type={selN.type} size={28} color={['elite', 'boss'].includes(selN.type) ? '#7a1012' : C.ink} />
          </span>
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <b className="ab-sc" style={{ fontSize: 22, color: ['elite', 'boss'].includes(selN.type) ? '#7a1012' : C.ink }}>{label(selN)}</b>
            <span style={{ fontSize: 15.5, lineHeight: 1.25 }}>{view.nodeDesc[selN.type]}</span>
            <span className="ab-fell" style={{ fontSize: 13.5, fontStyle: 'italic', color: '#6b5d45' }}>{(v.votes[sel!]?.length ?? 0) === 1 ? '1 Stimme' : `${v.votes[sel!]?.length ?? 0} Stimmen`}</span>
          </span>
        </section>
      ) : (
        <span className="ab-fell" style={{ fontSize: 16, fontStyle: 'italic', color: C.muted, textAlign: 'center' }}>Noch kein Ziel angetippt.</span>
      )}
      <div style={{ flex: 1 }} />
      <button type="button" disabled={!sel || sel === mine} style={{ ...BIG_BTN, opacity: !sel || sel === mine ? 0.5 : 1 }} onClick={() => { if (!sel) return; vibrate(25); play('ready'); send({ type: 'vote', option: sel }); }}>
        {sel && sel === mine ? 'Deine Stimme' : mine ? 'Stimme ändern' : 'Bestätigen'}
      </button>
      <span className="ab-fell" style={{ fontSize: 14, fontStyle: 'italic', color: C.muted, textAlign: 'center' }}>Du kannst deine Stimme ändern, bis alle abgestimmt haben.</span>
      <Waiting view={{ ...view, waitingFor: (v?.voters ?? []).filter((id: string) => id !== me.id && !Object.values(v.votes).some((a: any) => a.includes(id))) }} send={send} player={player} text="" />
    </>
  );
}

/** Pfadkarte auf dem Handy: gleiche Anordnung wie auf dem Fernseher, Ziele zum Antippen */
function PhoneMapBoard({ m, names, sel, onSel, player, myVote, meImg }: { m: any; names: Record<string, string>; sel: string | null; onSel: (id: string) => void; player: (id: string) => PlayerInfo | undefined; myVote: string | null; meImg: string }) {
  const v = m.vote;
  const nodes: any[] = m.nodes;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const first = Math.max(1, m.level);
  const lastLv = Math.min(m.levels, m.sight);
  const top0 = m.level === 0 ? 84 : 50;
  const y = (lv: number) => top0 + (lv - first) * 108;
  const x = (col: number) => 14 + col * 24; // Prozent der Breite
  const shown = nodes.filter((n) => n.lv >= first && n.lv <= lastLv);
  const height = y(lastLv) + (lastLv < m.levels ? 76 : 70);
  const options: string[] = v?.options ?? [];
  const reach = new Set<string>();
  const startIds = m.pos ? [m.pos] : nodes.filter((n) => n.lv === 1).map((n) => n.id);
  const queue = [...startIds];
  while (queue.length) { const id = queue.shift()!; if (reach.has(id)) continue; reach.add(id); for (const t of byId.get(id)?.next ?? []) queue.push(t); }
  const here = m.pos ? byId.get(m.pos) : null;
  return (
    <section aria-label="Pfadkarte" style={{ position: 'relative', height, background: C.paper, color: C.ink, clipPath: 'polygon(0 1.5%,6% 0,40% 1%,70% 0,100% 1.5%,99% 40%,100% 99%,65% 100%,30% 99%,0 100%,1% 60%)', overflow: 'hidden' }}>
      <svg width="100%" height={height} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" aria-hidden="true" style={{ position: 'absolute', inset: 0 }}>
        {m.level === 0 && startIds.map((id) => { const n = byId.get(id); return <path key={id} d={`M50 30 C 50 50, ${x(n.col)} ${y(n.lv) - 40}, ${x(n.col)} ${y(n.lv)}`} fill="none" stroke="#3b2c1d" strokeWidth="2.5" strokeDasharray="2 7" vectorEffect="non-scaling-stroke" />; })}
        {shown.flatMap((n) => n.next.map((t: string) => {
          const tn = byId.get(t);
          if (!tn || tn.lv > lastLv) return null;
          const live = reach.has(n.id) && reach.has(t);
          const pick = n.id === m.pos && t === sel;
          return <path key={n.id + t} d={`M${x(n.col)} ${y(n.lv)} C ${x(n.col)} ${y(n.lv) + 45}, ${x(tn.col)} ${y(tn.lv) - 45}, ${x(tn.col)} ${y(tn.lv)}`} fill="none" stroke={pick ? '#7a1012' : '#3b2c1d'} strokeWidth={pick ? 4 : 2.5} strokeDasharray={pick ? undefined : '2 7'} opacity={live ? 1 : 0.28} vectorEffect="non-scaling-stroke" />;
        }))}
      </svg>
      {m.level === 0 && (
        <span style={{ position: 'absolute', left: '50%', top: 6, transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <img src={IMG(meImg)} alt="" style={{ height: 34 }} />
          <span className="ab-fell" style={{ fontSize: 15, fontStyle: 'italic', color: '#3b2c1d' }}>Eingang</span>
        </span>
      )}
      {shown.map((n) => {
        const isOpt = options.includes(n.id);
        const isHere = n.id === m.pos;
        const isBoss = n.type === 'boss';
        const isSel = sel === n.id;
        const sz = isBoss ? 66 : isOpt ? 56 : 42;
        const faded = !reach.has(n.id) && !isHere;
        const voters: string[] = v?.votes?.[n.id] ?? [];
        const Tag: any = isOpt ? 'button' : 'div';
        return (
          <div key={n.id}>
            <Tag type={isOpt ? 'button' : undefined} aria-label={isOpt ? `${names[n.type]} wählen` : undefined} onClick={isOpt ? () => onSel(n.id) : undefined} style={{
              position: 'absolute', left: `calc(${x(n.col)}% - ${sz / 2}px)`, top: y(n.lv) - sz / 2, width: sz, height: sz, padding: 0, borderRadius: '50%', boxSizing: 'border-box', cursor: isOpt ? 'pointer' : 'default',
              background: isBoss ? '#2a1414' : '#e3d3ad', border: `${isOpt ? 4 : 2}px solid ${isOpt ? '#7a1012' : '#1c140d'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: faded ? 0.32 : 1,
              boxShadow: isSel ? '0 0 0 5px #f2a43a' : isHere ? '0 0 0 5px rgba(184,137,60,.55)' : myVote === n.id ? '0 0 0 4px rgba(242,164,58,.5)' : '0 2px 0 rgba(28,20,13,.35)',
              touchAction: 'manipulation', transition: 'box-shadow .2s',
            }}>
              <NodeIcon type={n.type} size={sz * 0.55} color={isBoss ? '#e23b30' : n.type === 'elite' ? '#7a1012' : C.ink} />
            </Tag>
            {isOpt && <span className="ab-fell" style={{ position: 'absolute', left: `${x(n.col)}%`, top: y(n.lv) + sz / 2 + 1, transform: 'translateX(-50%)', fontSize: 13.5, fontStyle: 'italic', whiteSpace: 'nowrap', color: n.type === 'elite' ? '#7a1012' : '#3b2c1d', fontWeight: isSel ? 700 : 400 }}>{names[n.type]}</span>}
            {isBoss && m.boss && <span className="ab-fell" style={{ position: 'absolute', left: `${x(n.col)}%`, top: y(n.lv) + sz / 2 + 1, transform: 'translateX(-50%)', fontSize: 14, fontStyle: 'italic', color: '#7a1012', whiteSpace: 'nowrap' }}>{m.boss.name}</span>}
            {isOpt && voters.length > 0 && (
              <span style={{ position: 'absolute', left: `calc(${x(n.col)}% + ${sz / 2 - 6}px)`, top: y(n.lv) - sz / 2 - 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {voters.slice(0, 4).map((id) => <VoteSeal key={id} p={player(id)} size={18} />)}
              </span>
            )}
            {isHere && <img src={IMG(meImg)} alt="" style={{ position: 'absolute', left: `calc(${x(n.col)}% - 46px)`, top: y(n.lv) - 46, height: 40, filter: 'drop-shadow(0 3px 2px rgba(0,0,0,.4))' }} />}
          </div>
        );
      })}
      {lastLv < m.levels && <div style={{ position: 'absolute', left: 0, right: 0, top: y(lastLv) - 26, bottom: 0, background: 'linear-gradient(180deg, rgba(18,13,9,0) 0%, rgba(18,13,9,.55) 45%, rgba(18,13,9,.95) 85%)', pointerEvents: 'none' }} />}
      {lastLv < m.levels && <span className="ab-fell" style={{ position: 'absolute', left: 0, right: 0, bottom: 8, textAlign: 'center', fontSize: 14, fontStyle: 'italic', color: '#8f7f60' }}>… tiefer ist es dunkel</span>}
    </section>
  );
}

function PhoneShop({ view, send, player }: ControllerViewProps) {
  const [sel, setSel] = useState<number | null>(null);
  const [removing, setRemoving] = useState(false);
  const gold = view.me.gold;
  if (view.done) return (<><MeHeader view={view} /><PhoneCenter title="Fertig eingekauft" /><Waiting view={view} send={send} player={player} /></>);
  if (removing) {
    return <DeckPicker cards={view.deck} title="Karte entfernen" hint={`Kostet ${view.removePrice} Gold. Die Karte verschwindet für den Rest des Runs.`} confirm={`Entfernen für ${view.removePrice} Gold`} onCancel={() => setRemoving(false)} onPick={(uid) => { send({ type: 'remove', uid }); setRemoving(false); }} />;
  }
  if (sel != null && view.cards[sel]) {
    const it = view.cards[sel];
    const can = !it.sold && gold >= it.price;
    return (
      <>
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8 }}><CardFace c={it.card} w={190} /></div>
        <KeywordList items={cardKeywords(it.card)} dark />
        <button type="button" disabled={!can} style={{ ...BIG_BTN, opacity: can ? 1 : 0.5 }} onClick={() => { vibrate(20); play('paper'); send({ type: 'buy', kind: 'card', i: sel }); setSel(null); }}>
          {it.sold ? 'Verkauft' : can ? `Kaufen für ${it.price} Gold` : `Zu teuer (${it.price} Gold)`}
        </button>
        <button type="button" style={{ ...SMALL_BTN, minHeight: 48 }} onClick={() => setSel(null)}>Zurück</button>
      </>
    );
  }
  return (
    <>
      <MeHeader view={view} />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span className="ab-sc" style={{ fontSize: 28 }}>Der Händler</span>
        <span className="ab-fell" style={{ fontSize: 15, fontStyle: 'italic', color: C.muted }}>Tippe eine Ware an, um sie anzusehen und zu kaufen.</span>
      </div>
      <section aria-label="Karten" style={{ background: '#2a1b10', borderTop: '6px solid #3a2718', padding: '16px 8px 12px', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '16px 6px', justifyItems: 'center' }}>
        {view.cards.map((it: any, i: number) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
            <CardFace c={it.card} w={100} dim={it.sold || gold < it.price} onClick={() => { play('paper'); setSel(i); }} />
            <span style={{ fontSize: 16, color: it.sold ? C.muted : gold < it.price ? '#ff8a70' : '#e3b866' }}>{it.sold ? 'verkauft' : <Coin n={it.price} />}</span>
          </div>
        ))}
      </section>
      {view.relics.length > 0 && (
        <section aria-label="Relikte" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="ab-sc" style={{ fontSize: 15, color: C.muted, letterSpacing: 1 }}>Relikte</span>
          {view.relics.map((it: any, i: number) => {
            const can = !it.sold && gold >= it.price;
            return (
              <button key={i} type="button" disabled={!can} onClick={() => { vibrate(20); play('paper'); send({ type: 'buy', kind: 'relic', i }); }} style={{ border: 0, padding: 0, background: 'transparent', cursor: can ? 'pointer' : 'default', textAlign: 'left', opacity: it.sold ? 0.45 : 1, display: 'flex', alignItems: 'stretch', gap: 0, fontFamily: BODY }}>
                <div style={{ flex: 1 }}><RelicRow r={it.relic} dark /></div>
                <span style={{ display: 'flex', alignItems: 'center', padding: '0 10px', background: '#2a1f16', border: '1px solid #5b452f', borderLeft: 0, color: can ? '#e3b866' : '#ff8a70' }}>{it.sold ? 'verkauft' : <Coin n={it.price} />}</span>
              </button>
            );
          })}
        </section>
      )}
      <button type="button" disabled={view.removed || gold < view.removePrice} style={{ ...SMALL_BTN, minHeight: 52, fontSize: 19, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: view.removed || gold < view.removePrice ? 0.5 : 1 }} onClick={() => setRemoving(true)}>
        {view.removed ? 'Karte entfernt' : <>Karte entfernen <Coin n={view.removePrice} /></>}
      </button>
      <div style={{ flex: 1 }} />
      <button type="button" style={BIG_BTN} onClick={() => { vibrate(25); send({ type: 'done' }); }}>Fertig</button>
    </>
  );
}

function PhoneCamp({ view, send, player, me }: ControllerViewProps) {
  const [mode, setMode] = useState<'forge' | 'watch' | null>(null);
  if (view.result) {
    return (
      <>
        <MeHeader view={view} />
        <span className="ab-sc" style={{ fontSize: 26 }}>Am Feuer</span>
        {view.result.map((r: any) => <span key={r.id} style={{ fontSize: 17 }}><b className="ab-sc" style={{ color: player(r.id)?.color }}>{r.id === me.id ? 'Du' : player(r.id)?.name}</b> · {r.text}</span>)}
      </>
    );
  }
  if (view.chosen) {
    const c = view.chosen;
    const what = c.kind === 'rest' ? 'Du rastest.' : c.kind === 'forge' ? `Du schmiedest ${view.deck.find((x: any) => x.uid === c.uid)?.name ?? ''}.` : `Du hältst Wache für ${player(c.target)?.name}.`;
    return (<><MeHeader view={view} /><PhoneCenter title={what} /><Waiting view={view} send={send} player={player} /></>);
  }
  if (mode === 'forge') {
    return <DeckPicker cards={view.deck.filter((c: any) => !c.up)} title="Schmieden" hint="Wähle eine Karte – sie wird dauerhaft verbessert." confirm="Diese Karte schmieden" upgrade onCancel={() => setMode(null)} onPick={(uid) => { send({ type: 'camp', kind: 'forge', uid }); setMode(null); }} />;
  }
  if (mode === 'watch') {
    return (
      <>
        <span className="ab-sc" style={{ fontSize: 22 }}>Für wen hältst du Wache?</span>
        <span className="ab-fell" style={{ fontSize: 15, fontStyle: 'italic', color: C.muted }}>Diese Person heilt zusätzlich 30 % ihrer Leben. Du selbst rastest nicht.</span>
        {view.allies.map((a: any) => (
          <button key={a.id} type="button" onClick={() => { vibrate(20); send({ type: 'camp', kind: 'watch', target: a.id }); setMode(null); }} style={{ display: 'flex', alignItems: 'center', gap: 12, background: C.paper2, color: C.ink, padding: '8px 12px', border: 0, textAlign: 'left', cursor: 'pointer', fontFamily: BODY, clipPath: TORN2, minHeight: 64 }}>
            <img src={IMG(a.img)} alt="" style={{ height: 54 }} />
            <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span className="ab-sc" style={{ fontSize: 18 }}>{player(a.id)?.name}</span>
              <Bar v={a.hp} max={a.maxHp} h={8} />
              <span style={{ fontSize: 14 }}>{a.hp} / {a.maxHp}</span>
            </span>
          </button>
        ))}
        <button type="button" style={{ ...SMALL_BTN, minHeight: 48 }} onClick={() => setMode(null)}>Zurück</button>
      </>
    );
  }
  const heal30 = Math.min(Math.round(view.me.maxHp * 0.3), view.me.maxHp - view.me.hp);
  const opt = (k: string, icon: ReactNode, title: string, text: string, onClick: () => void, disabled = false) => (
    <button key={k} type="button" disabled={disabled} onClick={onClick} style={{ width: '100%', border: 0, cursor: disabled ? 'default' : 'pointer', textAlign: 'left', background: C.paper2, color: C.ink, padding: 16, display: 'flex', alignItems: 'center', gap: 14, fontFamily: BODY, clipPath: TORN2, opacity: disabled ? 0.5 : 1, touchAction: 'manipulation' }}>
      <span style={{ width: 60, height: 60, flex: 'none', borderRadius: '50%', background: '#2a1f16', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
      <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}><b className="ab-sc" style={{ fontSize: 24 }}>{title}</b><span style={{ fontSize: 16, lineHeight: 1.25 }}>{text}</span></span>
    </button>
  );
  return (
    <>
      <MeHeader view={view} />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span className="ab-sc" style={{ fontSize: 30 }}>Lagerfeuer</span>
        <span className="ab-fell" style={{ fontSize: 16, fontStyle: 'italic', color: C.muted }}>Wähle eins.</span>
      </div>
      {opt('rest', <HeartIcon size={32} color="#f2a43a" />, 'Rasten', `Heile ${heal30} Leben (30 %) → ${view.me.hp + heal30}/${view.me.maxHp}`, () => { vibrate(20); send({ type: 'camp', kind: 'rest' }); })}
      {opt('forge', <NodeIcon type="shop" size={32} color="#f2a43a" />, 'Schmieden', 'Eine Karte dauerhaft verbessern.', () => setMode('forge'), !view.deck.some((c: any) => !c.up))}
      {!view.solo && opt('watch', <FlameIcon size={32} color="#f2a43a" />, 'Wache halten', 'Du rastest nicht – ein Mitspieler heilt deine 30 % zusätzlich.', () => setMode('watch'))}
    </>
  );
}

function PhoneEvent({ view, send, player, me }: ControllerViewProps) {
  const [cardFor, setCardFor] = useState<string | null>(null);
  const e = view.event;
  if (!e) return <PhoneCenter title="Schau auf den Fernseher" />;
  if (cardFor) {
    const opt = e.options.find((o: any) => o.id === cardFor);
    return <DeckPicker cards={view.deck} title={opt?.label ?? ''} hint={opt?.desc} confirm={cardFor === 'remove' ? 'Diese Karte entfernen' : 'Diese Karte verdoppeln'} onCancel={() => setCardFor(null)} onPick={(uid) => { send({ type: 'event', option: cardFor, uid }); setCardFor(null); }} />;
  }
  const v = view.vote;
  const myPick = e.picked.includes(me.id);
  const affordable = (o: any) => !(e.id === 'haendler' && ((o.id === 'remove' && view.me.gold < 40) || (o.id === 'relic' && view.me.gold < 90)));
  return (
    <>
      <MeHeader view={view} />
      <section style={{ background: C.paper, color: C.ink, padding: '16px 16px 18px', display: 'flex', flexDirection: 'column', gap: 10, boxShadow: 'inset 0 0 40px rgba(60,40,20,.35)' }}>
        <EventPicture img={e.img} height={150} />
        <span className="ab-sc" style={{ fontSize: 28, lineHeight: 1 }}>{e.name}</span>
        <p className="ab-fell" style={{ margin: 0, fontSize: 17, lineHeight: 1.4 }}>{e.text}</p>
        <span className="ab-fell" style={{ fontSize: 15, fontStyle: 'italic', color: '#4a3b29' }}>{e.stage === 'result' ? 'So ist es ausgegangen:' : e.group ? 'Die Gruppe stimmt ab.' : 'Du entscheidest für dich.'}</span>
      </section>
      {e.stage === 'result' ? (
        <>
          {e.results.map((r: any) => <span key={r.id} style={{ fontSize: 17 }}><b className="ab-sc" style={{ color: player(r.id)?.color }}>{r.id === me.id ? 'Du' : player(r.id)?.name}</b> · {r.text}</span>)}
          {view.vip && <button type="button" style={{ ...SMALL_BTN, minHeight: 48 }} onClick={() => send({ type: 'next' })}>Weiter</button>}
        </>
      ) : e.group ? (
        <>
          {v?.deadline && !v.winner && <PhoneTimer deadline={v.deadline} duration={v.duration} />}
          {e.options.map((o: any) => {
            const mine = view.myVote === o.id;
            return (
              <button key={o.id} type="button" disabled={!!v?.winner} onClick={() => { vibrate(20); play('paper'); send({ type: 'vote', option: o.id }); }} style={{ width: '100%', border: `2px solid ${mine ? '#f2a43a' : '#3b2c1d'}`, cursor: 'pointer', textAlign: 'left', background: C.paper2, color: C.ink, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, fontFamily: BODY }}>
                <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}><b className="ab-sc" style={{ fontSize: 22 }}>{o.label}</b><span style={{ fontSize: 16 }}>{o.desc}</span></span>
                <b style={{ fontSize: 18 }}>{v?.votes?.[o.id]?.length ?? 0}</b>
              </button>
            );
          })}
        </>
      ) : myPick ? (
        <Waiting view={view} send={send} player={player} />
      ) : (
        e.options.map((o: any) => {
          const ok = affordable(o);
          return (
            <button key={o.id} type="button" disabled={!ok} onClick={() => { vibrate(20); play('paper'); if (o.id === 'remove' || o.id === 'copy') setCardFor(o.id); else send({ type: 'event', option: o.id }); }} style={{ width: '100%', border: '2px solid #3b2c1d', cursor: ok ? 'pointer' : 'default', textAlign: 'left', background: C.paper2, color: C.ink, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 2, fontFamily: BODY, opacity: ok ? 1 : 0.5 }}>
              <b className="ab-sc" style={{ fontSize: 22 }}>{o.label}</b><span style={{ fontSize: 16 }}>{o.desc}{!ok ? ' – zu wenig Gold' : ''}</span>
            </button>
          );
        })
      )}
    </>
  );
}

function PhoneTreasure({ view, send, player }: ControllerViewProps) {
  return (
    <>
      <MeHeader view={view} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, paddingTop: 20 }}>
        <span className="ab-sc" style={{ fontSize: 28 }}>Ein Schatz!</span>
        {view.relic ? <RelicIcon r={view.relic} size={110} /> : null}
      </div>
      {view.relic ? <RelicRow r={view.relic} /> : <span className="ab-fell" style={{ fontStyle: 'italic', color: C.muted, textAlign: 'center' }}>Du hast schon alle Relikte – diesmal nichts Neues.</span>}
      <div style={{ flex: 1 }} />
      {view.done ? <Waiting view={view} send={send} player={player} /> : <button type="button" style={BIG_BTN} onClick={() => { vibrate(20); send({ type: 'done' }); }}>Weiter</button>}
    </>
  );
}

/* Unbenutzte Bausteine vermeiden */
void useMemo; void useRef;

export default { Host, Controller } satisfies GameClientModule;
