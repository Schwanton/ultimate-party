import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { ControllerViewProps, GameClientModule, HostViewProps, PlayerInfo, Translate } from '@up/sdk';
import { HostTimer, PhoneTimer, sfx, useServerNow, vibrate, type MusicTrack } from '@up/ui';

/* ================= Stil ================= */

const IMG = (name: string) => `/game/abgrund/bilder/${name}.webp`;
const C = {
  ground: '#0f0b08', paper: '#e9dbb8', paper2: '#e3d3ad', ink: '#1c140d', muted: '#b7a888', blood: '#a3171c', bright: '#c4161c',
  wax: '#8e1a17', bronze: '#8a6440', gold: '#b8893c', green: '#4f6b2a', blue: '#3e6fb0', purple: '#7a4fb0',
};
const RARITY: Record<string, string> = { basis: '#6b5236', common: '#7d7466', uncommon: C.blue, rare: C.purple, legendary: C.gold };
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
  const who = it.all || it.weakAll ? 'alle' : it.targets?.length ? name(it.targets[0]) : '';
  return { main: parts.join(' · '), who: short ? who : who ? (it.all || it.weakAll ? 'auf alle' : `auf ${who}`) : '' };
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
      {(view.phase === 'plan' || view.phase === 'resolve') && <HostFight {...props} />}
      {view.phase === 'reward' && <HostReward {...props} />}
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
const CLASS_IMG: Record<string, string> = { schildwacht: 'held-schildwacht', klingenlaeufer: 'held-klingenlaeufer', kraeuterkundige: 'held-kraeuterkundige' };

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
              <span className="ab-fell" style={{ flex: 1, fontStyle: 'italic', color: p.cls ? C.ink : '#6b5d45' }}>{p.cls ? CLASS_NAME[p.cls] : 'wählt noch …'}</span>
              {p.ready && <span style={{ width: 26, height: 26, borderRadius: '50%', background: '#7a2416', color: '#f3e6c8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>✓</span>}
            </div>
          );
        })}
        {view.saved && (
          <>
            <div style={{ height: 1, background: '#b39f78', margin: '6px 0' }} />
            <span className="ab-sc" style={{ fontSize: 20 }}>Gespeicherter Run</span>
            <span style={{ fontSize: 17 }}>Kampf {view.saved.fightNo + 1} von {view.fights} · {new Date(view.saved.at).toLocaleDateString('de-DE')}</span>
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
  const poisonMap = new Map<string, number>(ev?.k === 'poison' ? ev.items.map((x: any) => [x.who, x.dmg]) : []);

  return (
    <>
      <Backdrop img="hintergrund-kampf-abgrund" opacity={0.5} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 440, bottom: 0, background: 'rgba(12,8,6,.72)' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 438, height: 3, background: C.bronze }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 443, height: 1, background: '#5b3f26' }} />

      <header style={{ position: 'absolute', left: 32, right: 32, top: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 5 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 18 }}>
          <span className="ab-sc" style={{ fontSize: 34, letterSpacing: 4 }}>Abgrund</span>
          <span className="ab-fell" style={{ fontSize: 19, fontStyle: 'italic', color: C.muted }}>Kampf {view.fightNo + 1} von {view.fights}{view.elite ? ' · Elite' : ''} · Runde {view.round}</span>
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
            if (e.dead || !e.intent || e.intent.all || e.intent.weakAll || !e.intent.targets?.length) return null;
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
                  <img src={IMG(e.img)} alt={e.name} style={{ position: 'absolute', height: h, clipPath: 'polygon(0 0,52% 0,46% 30%,55% 55%,47% 80%,52% 100%,0 100%)', animation: 'abTearL 1.2s .5s ease-in forwards', filter: 'drop-shadow(0 14px 12px rgba(0,0,0,.65))' }} />
                  <img src={IMG(e.img)} alt="" style={{ position: 'absolute', height: h, clipPath: 'polygon(52% 0,100% 0,100% 100%,52% 100%,47% 80%,55% 55%,46% 30%)', animation: 'abTearR 1.2s .5s ease-in forwards', filter: 'drop-shadow(0 14px 12px rgba(0,0,0,.65))' }} />
                </>
              ) : (
                <img src={IMG(e.img)} alt={e.name} style={{ height: h, filter: 'drop-shadow(0 14px 12px rgba(0,0,0,.65))' }} />
              )}
            </div>
            {/* Absicht */}
            {e.intent && !s.dead && (
              <div style={{ position: 'absolute', left: xs[k], top: Math.max(58, top - 44), transform: 'translateX(-50%)', background: C.paper, color: C.ink, padding: '5px 12px 6px', display: 'flex', alignItems: 'center', gap: 7, clipPath: TORN, boxShadow: '0 6px 14px rgba(0,0,0,.55)', whiteSpace: 'nowrap', opacity: resolving && !acting ? 0.75 : 1 }}>
                <IntentIcons it={e.intent} size={n > 4 ? 19 : 22} font={n > 4 ? 20 : 24} />
                {(n <= 4 || e.intent.all || e.intent.weakAll) && <span className="ab-fell" style={{ fontSize: 15, fontStyle: 'italic' }}>{intentText(e.intent, name).who}</span>}
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
                <Seals st={h.st} size={20} />
                {hn <= 6 && !h.block && <span className="ab-fell" style={{ fontStyle: 'italic', fontSize: 13 }}>{CLASS_NAME[h.cls]}</span>}
              </div>
            </div>
            {sup?.block > 0 && <Floater x={hx[k]} y={560} text={<><ShieldIcon size={24} color="#c9d6e8" /> +{sup.block}</>} color="#c9d6e8" k={key} />}
            {sup?.heal > 0 && <Floater x={hx[k]} y={530} text={`+${sup.heal}`} color="#9fd36a" k={key + 'h'} />}
            {sup?.cover && <Floater x={hx[k]} y={500} text="beschützt" color={C.paper} k={key + 'c'} />}
            {hit && <Floater x={hx[k]} y={520} text={hit.loss > 0 ? `−${hit.loss}` : 'geblockt'} color={hit.loss > 0 ? '#ff5d4e' : '#c9d6e8'} k={key} big delay={0.3} />}
            {poisonMap.has(h.id) && <Floater x={hx[k]} y={540} text={`−${poisonMap.get(h.id)} Gift`} color="#9fd36a" k={key} />}
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
        <span className="ab-sc" style={{ fontSize: 64, textShadow: '0 6px 18px rgba(0,0,0,.8)' }}>Kampf {view.fightNo + 1} gewonnen</span>
        <p className="ab-fell" style={{ fontSize: 24, fontStyle: 'italic', color: '#c8b993', margin: '8px 0 0' }}>Jeder wählt auf dem Handy eine neue Karte – oder keine.</p>
      </div>
      <div style={{ position: 'absolute', left: 60, right: 60, top: 260, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 22 }}>
        {view.heroes.map((h: any) => {
          const p = view.picked.find((x: any) => x.id === h.id);
          const pl = player(h.id);
          return (
            <div key={h.id} style={{ width: 170, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <img src={IMG(h.img)} alt="" style={{ height: 150, filter: 'drop-shadow(0 12px 10px rgba(0,0,0,.6))', opacity: p?.done ? 1 : 0.6 }} />
              <span className="ab-sc" style={{ fontSize: 20, color: pl?.color }}>{pl?.name}</span>
              <span className="ab-fell" style={{ fontSize: 16, fontStyle: 'italic', color: C.muted }}>{p?.done ? (p.card ? `nimmt ${p.card}` : 'verzichtet') : 'wählt …'}</span>
              <span style={{ fontSize: 15 }}>{h.hp}/{h.maxHp} Leben</span>
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
          {win ? 'Ihr habt die äußeren Schichten des Abgrunds überstanden.' : `Der Abgrund hat euch verschlungen – in Kampf ${view.fightNo + 1}.`}
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
  let inner: ReactNode;
  if (view.phase === 'lager') inner = <PhoneLager {...props} />;
  else if (view.phase === 'plan') inner = <PhonePlan {...props} />;
  else if (view.phase === 'resolve') inner = <PhoneResolve {...props} />;
  else if (view.phase === 'reward') inner = <PhoneReward {...props} />;
  else if (view.phase === 'end') inner = <PhoneEnd {...props} />;
  else inner = <PhoneCenter title="Schau auf den Fernseher" />;
  return (
    <div style={{ position: 'fixed', inset: 0, overflowY: 'auto', background: '#120d09', color: C.paper, fontFamily: BODY }}>
      <Styles />
      <div style={{ maxWidth: 520, margin: '0 auto', minHeight: '100%', boxSizing: 'border-box', padding: 'max(14px, env(safe-area-inset-top)) 14px max(18px, env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {inner}
      </div>
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
        {view.vip && view.saved && <button type="button" style={{ ...SMALL_BTN, minHeight: 48 }} onClick={() => send({ type: 'continue' })}>Run fortsetzen (Kampf {view.saved.fightNo + 1}{view.savedComps ? `, ${view.savedComps} Begleiter` : ''})</button>}
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
        <article key={c.id} style={{ flex: 1, background: C.paper, color: C.ink, border: '3px solid #6b5236', borderRadius: 12, padding: '14px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, boxShadow: '0 14px 30px rgba(0,0,0,.7)', animation: 'abFade .3s' }}>
          <span className="ab-fell" style={{ fontSize: 14, fontStyle: 'italic', color: '#6b5d45' }}>{c.role}</span>
          <span className="ab-sc" style={{ fontSize: 28, lineHeight: 1 }}>{c.name}</span>
          <img src={IMG(c.img)} alt="" style={{ height: 230, margin: '4px 0', filter: 'drop-shadow(0 8px 8px rgba(0,0,0,.35))' }} />
          <span style={{ fontSize: 16, fontWeight: 700 }}>{c.hp} Leben · 3 Energie</span>
          <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.3, textAlign: 'center' }}>{c.desc}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, justifyContent: 'center' }}>
            {c.start.map((s: string) => <span key={s} style={{ fontSize: 13, background: '#d8c69c', padding: '2px 7px', borderRadius: 3 }}>{s}</span>)}
          </div>
        </article>
        <button type="button" aria-label="Nächste Klasse" style={{ ...SMALL_BTN, fontSize: 24, padding: '20px 8px' }} onClick={() => { play('paper'); setI((i + 1) % view.classes.length); }}>›</button>
      </div>
      <button type="button" style={BIG_BTN} onClick={() => { vibrate(20); send({ type: 'class', cls: c.id }); }}>{c.name} wählen</button>
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
      position: 'relative', width: w, height: h, boxSizing: 'border-box', background: '#eadcb9', color: C.ink, border: `2px solid ${RARITY[c.rarity] ?? '#6b5236'}`,
      borderRadius: 6, padding: `${w * 0.07}px ${w * 0.07}px ${w * 0.06}px`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, cursor: onClick ? 'pointer' : undefined,
      boxShadow: sel ? `0 0 0 3px #f2a43a, 0 6px 12px rgba(0,0,0,.55)` : c.up ? `0 0 0 2px ${C.gold}, 0 6px 12px rgba(0,0,0,.55)` : '0 6px 12px rgba(0,0,0,.55)',
      opacity: dim ? 0.45 : 1, fontFamily: BODY, touchAction: 'manipulation',
    }}>
      <span style={{ position: 'absolute', left: -8, top: -8, width: w * 0.25, height: w * 0.25, minWidth: 24, minHeight: 24, borderRadius: '50%', background: C.wax, color: '#f3e6c8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: DISPLAY, fontSize: Math.max(15, w * 0.15), boxShadow: 'inset 0 0 0 3px rgba(0,0,0,.25)' }}>{c.cost}</span>
      <span style={{ position: 'absolute', right: 5, top: 5 }}><SpeedIcon speed={c.speed} size={Math.max(14, w * 0.15)} /></span>
      <span className="ab-sc" style={{ fontSize: Math.max(13, w * 0.13), lineHeight: 1.05, textAlign: 'center', padding: '0 10px' }}>{c.name}</span>
      <img src={IMG(c.img)} alt="" style={{ height: h * 0.34, margin: '2px 0', objectFit: 'contain', maxWidth: '90%' }} />
      <span style={{ fontSize: Math.max(11.5, w * 0.105), lineHeight: 1.15, textAlign: 'center' }}>{c.speed === 'fast' ? <i>Schnell. </i> : c.speed === 'slow' ? <i>Langsam. </i> : null}{c.text}</span>
    </Tag>
  );
}

function MiniCard({ c, onClick, dim }: { c: any; onClick: () => void; dim?: boolean }) {
  return (
    <button type="button" onClick={onClick} style={{
      position: 'relative', height: 104, boxSizing: 'border-box', background: '#eadcb9', color: C.ink, border: `2px solid ${RARITY[c.rarity] ?? '#6b5236'}`, borderRadius: 6, padding: '6px 4px 5px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 5px 10px rgba(0,0,0,.5)', fontFamily: BODY, cursor: 'pointer', opacity: dim ? 0.45 : 1, touchAction: 'manipulation',
    }}>
      <span style={{ position: 'absolute', left: -7, top: -7, width: 24, height: 24, borderRadius: '50%', background: C.wax, color: '#f3e6c8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: DISPLAY, fontSize: 15 }}>{c.cost}</span>
      <span style={{ position: 'absolute', right: 3, top: 3 }}><SpeedIcon speed={c.speed} size={13} /></span>
      <span className="ab-sc" style={{ fontSize: 13, lineHeight: 1.05, padding: '0 8px', textAlign: 'center' }}>{c.name}</span>
      <img src={IMG(c.img)} alt="" style={{ height: 36 }} />
      <span style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.1, textAlign: 'center' }}>{shortText(c.text)}</span>
    </button>
  );
}
const shortText = (t: string) => (t.length > 22 ? t.split(/[.,]/)[0] : t);

function PhonePlan({ view, send, me, player }: ControllerViewProps) {
  const [sel, setSel] = useState<string | null>(null);
  const [pile, setPile] = useState<'draw' | 'discard' | null>(null);
  const [peek, setPeek] = useState<any>(null);
  const [foe, setFoe] = useState<string | null>(null);
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
                <img src={IMG(e.img)} alt="" style={{ height: 60 }} />
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
        <img src={IMG(view.me.img)} alt="" style={{ height: 50 }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span className="ab-sc" style={{ fontSize: 19, color: me.color }}>{me.name}</span>
            <span className="ab-fell" style={{ fontStyle: 'italic', fontSize: 14, color: C.muted }}>{view.me.name}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1 }}><Bar v={view.me.hp} max={view.me.maxHp} h={7} /></div>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{view.me.hp}/{view.me.maxHp}</span>
          </div>
          <Seals st={view.me.st} size={20} />
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
              <img src={IMG(e.img)} alt="" style={{ height: 54 }} />
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
          {view.plan.map((p: any) => {
            const c = view.hand.find((x: any) => x.uid === p.uid);
            if (!c) return null;
            const tgt = p.target ? (view.enemies.find((e: any) => e.uid === p.target)?.name ?? (p.target === me.id ? 'dich' : player(p.target)?.name)) : null;
            return (
              <div key={p.uid} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#2a1f16', border: '1px solid #5b452f', padding: '6px 6px 6px 10px', animation: 'abFade .25s' }}>
                <img src={IMG(c.img)} alt="" style={{ height: 30 }} />
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
    const who = it.all || it.weakAll ? 'alle Spieler' : it.targets?.length ? name(it.targets[0]) : '';
    if (it.dmg) plan.push(`${it.hits > 1 ? `${it.hits}-mal ${it.dmg}` : it.dmg} Schaden ${it.all ? 'an alle Spieler' : `auf ${who}`}${it.vuln ? `, macht das Ziel verwundbar` : ''}`);
    if (it.block) plan.push(`erhält ${it.block} Block`);
    if (it.weakAll) plan.push(`schwächt alle Spieler (25 % weniger Schaden)`);
    if (it.buff) plan.push(`wird stärker: +${it.buff} Schaden für alle weiteren Angriffe`);
  }
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, paddingTop: 6 }}>
        <img src={IMG(e.img)} alt="" style={{ height: 190, filter: 'drop-shadow(0 10px 10px rgba(0,0,0,.6))' }} />
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
          <span style={{ fontSize: 16, lineHeight: 1.3 }}>{plan.join(', ')}.</span>
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
      <div style={{ textAlign: 'center' }}>
        <span className="ab-sc" style={{ fontSize: 26 }}>Neue Karte</span>
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
  return <PhoneCenter title={view.result === 'win' ? 'Sieg!' : 'Niederlage'} text={view.result === 'win' ? 'Ihr habt alle drei Kämpfe überstanden.' : 'Der Abgrund hat gewonnen – diesmal.'} img={view.me?.img} />;
}

/* Unbenutzte Bausteine vermeiden */
void useMemo; void useRef;

export default { Host, Controller } satisfies GameClientModule;
