import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { ControllerViewProps, GameClientModule, HostViewProps, PlayerInfo, Translate } from '@up/sdk';
import { Avatar, Podium, useServerNow, vibrate } from '@up/ui';
import { heartbeatIfClose, play, startNightAmbience, stopAmbience } from './sounds';

/* ================= Farben, Schrift, Rollen ================= */

const NAVY = '#0d1328';
const NAVY2 = '#151c38';
const CARD = '#1b2341';
const LINE = '#2c3560';
const CREAM = '#f3e7c4';
const MUTED = '#9aa4c4';
const SOFT = '#c9cfe3';
const AMBER = '#e9a94b';
const WOLF = '#e07a6b';
const WOLF_D = '#7a3a35';
const FELL = "'IM Fell English SC', Georgia, serif";
const BODY = "'DM Sans', system-ui, sans-serif";
const NOBODY = 'nobody';

type Player = HostViewProps['player'];
type Role = 'wolf' | 'villager' | 'seer' | 'witch' | 'hunter' | 'cupid' | 'protector';

const ICON: Record<Role | 'mayor', string> = {
  wolf: 'M4 20l3-9 3 3 2-8 2 8 3-3 3 9z',
  seer: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  witch: 'M9 3h6M10 3v5l-5 9a3 3 0 0 0 3 4h8a3 3 0 0 0 3-4l-5-9V3',
  hunter: 'M12 2v20M2 12h20M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z',
  cupid: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z',
  protector: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  villager: 'M3 20V11l9-7 9 7v9zM10 20v-6h4v6',
  mayor: 'M5 20h14M7 20V10M17 20V10M4 10l8-6 8 6z',
};

function RoleIcon({ role, size = 32, color }: { role: Role | 'mayor'; size?: number; color?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color ?? (role === 'wolf' ? WOLF : CREAM)} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d={ICON[role]} />
    </svg>
  );
}

function useFonts() {
  useEffect(() => {
    if (document.getElementById('werwolf-fonts')) return;
    const l = document.createElement('link');
    l.id = 'werwolf-fonts';
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=IM+Fell+English+SC&family=DM+Sans:wght@400;500;700&display=swap';
    document.head.appendChild(l);
  }, []);
}

const KEYFRAMES = `
@keyframes wwTwinkle{0%,100%{opacity:.25;transform:scale(.7)}50%{opacity:1;transform:scale(1.15)}}
@keyframes wwBlink{0%,8%,100%{transform:scaleY(1)}4%{transform:scaleY(.1)}}
@keyframes wwEyes{0%,30%,100%{opacity:0}36%,58%{opacity:1}64%{opacity:0}}
@keyframes wwRun{0%{transform:translateX(-160px)}100%{transform:translateX(1440px)}}
@keyframes wwRise{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
@keyframes wwPop{0%{opacity:0;transform:scale(.6)}60%{opacity:1;transform:scale(1.08)}100%{transform:scale(1)}}
@keyframes wwFlip{0%{transform:rotateY(180deg)}100%{transform:rotateY(0deg)}}
@keyframes wwSpot{0%{opacity:0}100%{opacity:1}}
@keyframes wwCandle{0%,100%{transform:scaleY(1)}50%{transform:scaleY(1.18) translateY(-1px)}}
@keyframes wwFade{from{opacity:0}to{opacity:1}}
`;

/** Erzähltexte haben Varianten, getrennt durch „|“ – gewählt nach Zahl n */
function variant(text: string, n: number) {
  const parts = text.split('|');
  return parts[Math.abs(n) % parts.length];
}

/* ================= Himmel als Spieluhr ================= */

const rgbOf = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
/** Farben mischen (Hex oder [r,g,b]) → [r,g,b] */
function mix(a: string | number[], b: string | number[], f: number): number[] {
  const pa = typeof a === 'string' ? rgbOf(a) : a;
  const pb = typeof b === 'string' ? rgbOf(b) : b;
  return pa.map((v, i) => Math.round(v + (pb[i] - v) * Math.max(0, Math.min(1, f))));
}
const css = (c: number[]) => `rgb(${c.join(',')})`;

const clamp = (v: number) => Math.max(0, Math.min(1, v));

const STARS = (() => {
  let seed = 11;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280), seed / 233280);
  return Array.from({ length: 54 }, () => ({ x: rnd() * 1270, y: rnd() * 420, s: 1.5 + rnd() * 2.5, d: 1.6 + rnd() * 2.6, delay: rnd() * 3 }));
})();

const TOWN = 'M0 300V190l40-10 30 20 40-40v-50l10-30 10 30v50l30 30 50-45 50 45v-20h40l50-60 50 60h30l30-25 40 25v-90l25-60 25 60v90l40-30 60 55 40-35 40 30h50l60-70 60 70 40-20 30 25 50-50 50 50 30-15 60 40 40-30 50 25 40-20 40 20v135z';
const TOWERS = 'M1000 300V150l22-40 22 40v150zM1080 300V170l18-35 18 35v130zM120 300V170l16-32 16 32v130z';
const WINDOWS = [[196, 225], [452, 215], [560, 240], [782, 232], [905, 238], [1180, 245], [330, 238], [640, 230]];
/** Gassen zwischen den Häusern, in denen nachts Augen aufleuchten */
const ALLEYS = [[262, 262], [700, 268], [958, 262]];
const WOLF_RUN = 'M0 18c6-6 14-8 22-6l10-6 4 4-4 4c8 2 14 6 16 12l-6 2-6-6-12 2-6 8-6-2 4-8-10-2-6 6-4-2 4-8z';

function Moon({ size }: { size: number }) {
  const k = size / 150;
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: CREAM, boxShadow: `0 0 ${60 * k}px ${16 * k}px rgba(243,231,196,0.28)`, position: 'relative', overflow: 'hidden' }}>
      {[[34, 30, 34, 0.13], [88, 52, 20, 0.11], [56, 92, 42, 0.09], [108, 98, 14, 0.12], [24, 80, 12, 0.1]].map(([x, y, d, o], i) => (
        <span key={i} style={{ position: 'absolute', left: x * k, top: y * k, width: d * k, height: d * k, borderRadius: '50%', background: `rgba(120,100,70,${o})` }} />
      ))}
    </div>
  );
}

/**
 * Himmel: Tagsüber wandert die Sonne passend zu Diskussion und Abstimmung, kurz vor Schluss Abendröte.
 * Nachts wandert der Mond, gegen Ende Morgenröte. Sterne funkeln, Fenster leuchten, Augen in den Gassen.
 */
function Sky({ sky, eyes }: { sky: { mode: 'dusk' | 'night' | 'day'; from: number; to: number }; eyes?: boolean }) {
  const now = useServerNow(250);
  const span = Math.max(1, sky.to - sky.from);
  const f = sky.mode === 'dusk' ? 0.96 : clamp((now - sky.from) / span);
  const left = sky.to - now;
  const night = sky.mode === 'night';
  // Farben
  let color: number[];
  let dawn = 0;
  let dusk = 0;
  if (night) {
    color = mix(NAVY, '#3a2a48', f < 0.8 ? 0 : (f - 0.8) / 0.2);
    dawn = clamp((f - 0.8) / 0.2);
  } else {
    dusk = Math.max(clamp((f - 0.8) / 0.2), sky.mode === 'day' ? clamp(1 - left / 20000) : 1);
    dawn = sky.mode === 'day' ? clamp(1 - f / 0.08) * (1 - dusk) : 0;
    color = mix(mix('#8fb6cc', '#d98a6a', dawn), '#a8463a', dusk);
  }
  const lights = night || dusk > 0.6 ? 1 : 0;
  const angle = -80 + 160 * f;
  const body = night ? <Moon size={120} /> : <div style={{ width: 110, height: 110, borderRadius: '50%', background: '#ffd27a', boxShadow: '0 0 70px 24px rgba(255,200,110,0.55)' }} />;
  return (
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: css(color), transition: 'background 1.2s linear', zIndex: 0 }}>
      <div style={{ position: 'absolute', inset: 0, opacity: dusk, transition: 'opacity 1s', background: 'linear-gradient(to top, rgba(214,70,48,0.95) 0%, rgba(236,130,70,0.55) 30%, rgba(120,40,60,0) 70%)' }} />
      <div style={{ position: 'absolute', inset: 0, opacity: dawn, transition: 'opacity 1s', background: 'linear-gradient(to top, rgba(246,150,110,0.95) 0%, rgba(250,196,150,0.5) 32%, rgba(200,150,190,0) 72%)' }} />
      <div style={{ position: 'absolute', inset: 0, opacity: night ? 1 - dawn * 0.7 : 0, transition: 'opacity 1.5s' }}>
        {STARS.map((s, i) => (
          <span key={i} style={{ position: 'absolute', left: s.x, top: s.y, width: s.s, height: s.s, borderRadius: '50%', background: '#fff6dc', boxShadow: '0 0 6px rgba(255,246,220,0.8)', animation: `wwTwinkle ${s.d}s ease-in-out ${s.delay}s infinite` }} />
        ))}
      </div>
      <div style={{ position: 'absolute', left: 640, top: 760, width: 0, height: 0, transform: `rotate(${angle}deg)`, transition: 'transform 1s linear' }}>
        <div style={{ position: 'absolute', left: -60, top: -660 }}>{body}</div>
      </div>
      {night && (
        <svg width="160" height="40" viewBox="0 0 60 30" style={{ position: 'absolute', top: 488, left: 0, animation: 'wwRun 3.2s linear 6s infinite', animationDelay: '7s', opacity: 0.95 }}>
          <path d={WOLF_RUN} fill="#05080f" />
        </svg>
      )}
      <svg width="1280" height="300" viewBox="0 0 1280 300" style={{ position: 'absolute', left: 0, bottom: 0 }}>
        <path fill="#070a14" d={TOWN} />
        <path fill="#070a14" d={TOWERS} />
        {WINDOWS.map(([x, y], i) => <rect key={i} x={x} y={y} width="10" height="14" fill={AMBER} style={{ opacity: lights * (i % 3 === 0 ? 0.7 : 1), transition: `opacity 1.5s ${i * 0.2}s` }} />)}
        {eyes && ALLEYS.map(([x, y], i) => (
          <g key={i} style={{ animation: `wwEyes 9s ease-in-out ${i * 2.7}s infinite`, opacity: 0 }}>
            <g style={{ transformOrigin: `${x}px ${y}px`, animation: 'wwBlink 3s infinite' }}>
              <ellipse cx={x - 6} cy={y} rx="3.2" ry="2" fill="#f2c94c" />
              <ellipse cx={x + 6} cy={y} rx="3.2" ry="2" fill="#f2c94c" />
            </g>
          </g>
        ))}
      </svg>
    </div>
  );
}

/* ================= Bausteine ================= */

const panel: CSSProperties = { background: 'rgba(13,19,40,0.78)', borderRadius: 20, padding: '18px 22px', backdropFilter: 'blur(2px)' };

function TimeBar({ deadline, duration, width = 420 }: { deadline?: number; duration?: number; width?: number }) {
  const now = useServerNow(250);
  if (!deadline || !duration) return null;
  const left = Math.max(0, deadline - now);
  const f = clamp(left / duration);
  const s = Math.ceil(left / 1000);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ width, height: 8, borderRadius: 4, background: 'rgba(35,44,77,0.9)', overflow: 'hidden' }}>
        <div style={{ width: `${f * 100}%`, height: 8, background: s <= 5 ? WOLF : CREAM, transition: 'width .25s linear' }} />
      </div>
      <b style={{ fontSize: 26, color: s <= 5 ? WOLF : CREAM, minWidth: 64 }}>{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</b>
    </div>
  );
}

function Face({ p, size = 56, dead, crown, label = true, ring }: { p?: PlayerInfo; size?: number; dead?: boolean; crown?: boolean; label?: boolean; ring?: string }) {
  if (!p) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, width: size + 26, position: 'relative' }}>
      <span style={{ borderRadius: '50%', boxShadow: `0 0 0 3px ${ring ?? (dead ? '#3a4060' : 'rgba(243,231,196,0.85)')}`, filter: dead ? 'grayscale(1) brightness(.6)' : undefined, display: 'inline-flex' }}>
        <Avatar player={p} size={size} flat />
      </span>
      {crown && <span style={{ position: 'absolute', top: -14 }}><RoleIcon role="mayor" size={22} color={AMBER} /></span>}
      {dead && (
        <span style={{ position: 'absolute', top: size - 18, right: 6, width: 8, height: 18, background: CREAM, borderRadius: 2 }}>
          <span style={{ position: 'absolute', top: -9, left: 1, width: 6, height: 9, borderRadius: '50% 50% 40% 40%', background: AMBER, animation: 'wwCandle 1.2s ease-in-out infinite' }} />
        </span>
      )}
      {label && <b style={{ fontSize: size > 60 ? 16 : 13, color: dead ? MUTED : CREAM, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</b>}
    </div>
  );
}

function Title({ children, size = 52, style }: { children: ReactNode; size?: number; style?: CSSProperties }) {
  return <h1 style={{ fontFamily: FELL, fontWeight: 400, fontSize: size, lineHeight: 1.1, color: CREAM, margin: 0, textShadow: '0 2px 14px rgba(0,0,0,.45)', ...style }}>{children}</h1>;
}

function Kicker({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 17, letterSpacing: 3, textTransform: 'uppercase', color: SOFT, textShadow: '0 1px 8px rgba(0,0,0,.5)' }}>{children}</div>;
}

/** Name einer Rolle oder Seite, je nach Aufdeck-Einstellung */
function RoleLabel({ info, t, size = 22 }: { info: { role: Role | null; side: 'wolves' | 'village' | null }; t: Translate; size?: number }) {
  if (info.role) {
    const wolf = info.role === 'wolf';
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderRadius: 12, background: wolf ? '#3a1d24' : CARD, border: `1px solid ${wolf ? WOLF_D : LINE}`, color: wolf ? WOLF : CREAM, fontSize: size, fontWeight: 700 }}>
        <RoleIcon role={info.role} size={size + 4} />{t(`role.${info.role}`)}
      </span>
    );
  }
  if (info.side) return <span style={{ padding: '6px 16px', borderRadius: 12, background: CARD, color: info.side === 'wolves' ? WOLF : CREAM, fontSize: size, fontWeight: 700 }}>{t(`side.${info.side}`)}</span>;
  return <span style={{ padding: '6px 16px', borderRadius: 12, background: CARD, color: MUTED, fontSize: size }}>{t('role.hidden')}</span>;
}

/* ================= Stimme ================= */

function useVoice(say: { key: string; vars?: Record<string, string>; n: number } | null, t: Translate, lang: string) {
  const last = useRef(0);
  useEffect(() => {
    if (!say || say.n === last.current) return;
    last.current = say.n;
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(variant(t(`say.${say.key}`, say.vars), say.n));
      u.lang = lang === 'de' ? 'de-DE' : 'en-US';
      u.rate = 0.92;
      u.pitch = 0.85;
      synth.speak(u);
    } catch { /* keine Stimme */ }
  }, [say?.n]); // eslint-disable-line react-hooks/exhaustive-deps
}

/* ================= TV ================= */

function Host(props: HostViewProps) {
  const { view, t, room } = props;
  useFonts();
  useVoice(view.say ?? null, t, room.lang);
  useEffect(() => () => stopAmbience(), []);
  // Nachtgeräusche
  useEffect(() => {
    if (view.screen === 'night') startNightAmbience();
    else stopAmbience();
  }, [view.screen]);
  const sky = view.sky ?? { mode: 'dusk', from: 0, to: 1 };
  return (
    <div style={{ position: 'absolute', inset: 0, fontFamily: BODY, color: CREAM, overflow: 'hidden' }}>
      <style>{KEYFRAMES}</style>
      <Sky sky={sky} eyes={view.screen === 'night' && view.section === 'A'} />
      <div style={{ position: 'absolute', inset: 0, zIndex: 1, padding: '40px 56px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <HostScreen {...props} />
      </div>
    </div>
  );
}

function TopLine({ view, t, player, right }: { view: any; t: Translate; player: Player; right?: ReactNode }) {
  const mayor = view.mayor ? player(view.mayor) : null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flex: 'none' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Kicker>{view.night > view.day ? t('nightN', { n: view.night }) : view.day > 0 ? t('dayN', { n: view.day }) : t('title')}</Kicker>
        <div style={{ fontFamily: FELL, fontSize: 30, color: CREAM, textShadow: '0 2px 10px rgba(0,0,0,.5)' }}>{t('title')}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {mayor && <span style={{ ...panel, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 16 }}><RoleIcon role="mayor" size={20} color={AMBER} />{mayor.name}</span>}
        {view.alive && <span style={{ ...panel, padding: '6px 14px', fontSize: 16 }}>{t('aliveN', { n: view.alive.length })}</span>}
        {right}
      </div>
    </div>
  );
}

/** Reihe aller Spieler unten: Lebende, Tote mit Kerze */
function Village({ view, player, size = 52 }: { view: any; player: Player; size?: number }) {
  const dead = new Set((view.dead ?? []).map((d: any) => d.id));
  const all = [...(view.alive ?? []), ...(view.dead ?? []).map((d: any) => d.id)];
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 'auto' }}>
      {all.map((id: string) => <Face key={id} p={player(id)} size={size} dead={dead.has(id)} crown={view.mayor === id} />)}
    </div>
  );
}

function HostScreen(props: HostViewProps) {
  const { view, t, player } = props;
  const say = (key: string, vars?: Record<string, string | number>) => variant(t(`say.${key}`, vars), view.night + view.day);
  switch (view.screen) {
    case 'intro':
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, textAlign: 'center', paddingBottom: 140 }}>
          <Title size={96} style={{ animation: 'wwPop .8s ease-out both' }}>{t('title')}</Title>
          <p style={{ ...panel, fontSize: 25, lineHeight: 1.4, maxWidth: 900, animation: 'wwRise .6s .5s both' }}>{t('intro.text')}</p>
          <div style={{ display: 'flex', gap: 18, animation: 'wwRise .6s 1s both' }}>
            <div style={{ ...panel, maxWidth: 380, textAlign: 'left' }}><b style={{ color: CREAM, fontSize: 20 }}>{t('intro.village')}</b><p style={{ color: SOFT, fontSize: 17, marginTop: 6 }}>{t('intro.villageHow')}</p></div>
            <div style={{ ...panel, maxWidth: 380, textAlign: 'left', border: `1px solid ${WOLF_D}` }}><b style={{ color: WOLF, fontSize: 20 }}>{t('intro.wolves')}</b><p style={{ color: SOFT, fontSize: 17, marginTop: 6 }}>{t('intro.wolvesHow')}</p></div>
          </div>
        </div>
      );
    case 'lobby':
      return <HostLobby {...props} />;
    case 'roles':
      return (
        <>
          <TopLine view={view} t={t} player={player} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 20, maxWidth: 760 }}>
            <Title size={58}>{t('roles.title')}</Title>
            <p style={{ ...panel, fontSize: 23, lineHeight: 1.4 }}>{t('roles.text', { n: view.wolves })}</p>
            <TimeBar deadline={view.deadline} duration={view.duration} />
          </div>
          <Village view={view} player={player} />
        </>
      );
    case 'night':
      return (
        <>
          <TopLine view={view} t={t} player={player} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
           <div style={{ ...panel, background: 'rgba(13,19,40,0.7)', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 760 }}>
            <Title size={48} style={{ animation: 'wwFade 1.2s both' }} key={view.section}>{say(view.section === 'A' ? 'nightA' : 'nightB', { n: view.night })}</Title>
            <p style={{ fontSize: 21, color: SOFT }}>{t(view.section === 'A' ? 'night.hintA' : 'night.hintB')}</p>
            <TimeBar deadline={view.deadline} duration={view.duration} />
           </div>
          </div>
          <Village view={view} player={player} size={46} />
        </>
      );
    case 'morning':
      return <HostMorning {...props} />;
    case 'lastWords': {
      const p = player(view.who);
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 22, position: 'relative' }}>
          <div style={{ position: 'absolute', inset: -60, background: 'radial-gradient(circle at 50% 42%, rgba(255,240,200,.35) 0%, rgba(255,240,200,0) 32%, rgba(5,8,15,.8) 62%)', animation: 'wwSpot 1s both' }} />
          <Kicker>{t('lastWords.kicker')}</Kicker>
          <span style={{ animation: 'wwPop .6s both', position: 'relative' }}><Face p={p} size={170} /></span>
          <Title size={46} style={{ position: 'relative' }}>{t('lastWords.title', { name: p?.name ?? '?' })}</Title>
          <div style={{ position: 'relative' }}><TimeBar deadline={view.deadline} duration={view.duration} width={360} /></div>
        </div>
      );
    }
    case 'flip':
      return <HostFlip {...props} />;
    case 'hunter':
    case 'successor': {
      const p = player(view.who);
      return (
        <>
          <TopLine view={view} t={t} player={player} />
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 36 }}>
            <span style={{ animation: 'wwPop .6s both' }}><Face p={p} size={150} /></span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 720 }}>
              <RoleIcon role={view.screen === 'hunter' ? 'hunter' : 'mayor'} size={56} color={AMBER} />
              <Title size={48}>{t(`${view.screen}.title`, { name: p?.name ?? '?' })}</Title>
              <p style={{ fontSize: 21, color: SOFT }}>{t(`${view.screen}.text`)}</p>
              <TimeBar deadline={view.deadline} duration={view.duration} />
            </div>
          </div>
          <Village view={view} player={player} size={44} />
        </>
      );
    }
    case 'mayorVote':
    case 'mayorResult':
      return <HostMayor {...props} />;
    case 'discuss':
      return <HostDiscuss {...props} />;
    case 'vote':
      return <HostVote {...props} />;
    case 'voteResult':
      return <HostVoteResult {...props} />;
    case 'end':
      return <HostEnd {...props} />;
    case 'recap':
      return <HostRecap {...props} />;
    case 'final':
      return <HostFinal {...props} />;
  }
  return null;
}

function HostLobby({ view, t, player }: HostViewProps) {
  const s = view.setup;
  const counts: { role: Role; n: number }[] = [{ role: 'wolf', n: s.wolves }, ...s.specials.map((r: Role) => ({ role: r, n: 1 }))];
  const villagers = view.n - s.wolves - s.specials.length;
  if (villagers > 0) counts.push({ role: 'villager', n: villagers });
  const chips = [
    t('set.discuss', { n: s.discuss / 60 }), t(`set.reveal.${s.reveal}`), t(`set.votes.${s.votes}`),
    s.arrows ? t('set.arrowsOn') : t('set.arrowsOff'), s.mayor ? t('set.mayorOn') : t('set.mayorOff'),
    ...(s.lastWords ? [t('set.lastWords')] : []), ...(s.quietFirstNight ? [t('set.quiet')] : []), ...(s.voice ? [t('set.voice')] : []),
  ];
  const vip = player(view.vip);
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div><Kicker>{t('lobby.kicker')}</Kicker><Title size={50}>{t('title')}</Title></div>
        <div style={{ ...panel, padding: '10px 18px', fontSize: 23 }}>
          <b>{t('lobby.sides', { w: s.wolves, v: view.n - s.wolves })}</b> <span style={{ color: MUTED }}>· {t('lobby.players', { n: view.n })}</span>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14 }}>
        {counts.map((c) => (
          <div key={c.role} style={{ ...panel, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6, border: `1px solid ${c.role === 'wolf' ? WOLF_D : LINE}`, animation: 'wwRise .4s both' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <RoleIcon role={c.role} size={34} />
              <b style={{ fontSize: 22, color: c.role === 'wolf' ? WOLF : CREAM }}>×{c.n}</b>
            </div>
            <div style={{ fontFamily: FELL, fontSize: 25 }}>{t(`role.${c.role}`)}</div>
            <div style={{ fontSize: 15, color: SOFT, lineHeight: 1.35 }}>{t(`short.${c.role}`)}</div>
          </div>
        ))}
        {s.mayor && (
          <div style={{ ...panel, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6, border: `1px solid ${LINE}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><RoleIcon role="mayor" size={34} color={AMBER} /><b style={{ fontSize: 18, color: AMBER }}>{t('lobby.day1')}</b></div>
            <div style={{ fontFamily: FELL, fontSize: 25 }}>{t('role.mayor')}</div>
            <div style={{ fontSize: 15, color: SOFT, lineHeight: 1.35 }}>{t('short.mayor')}</div>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {chips.map((c) => <span key={c} style={{ ...panel, padding: '8px 14px', fontSize: 15, color: SOFT }}>{c}</span>)}
        {view.unfair && <span style={{ padding: '8px 14px', borderRadius: 14, background: '#5a4316', color: '#ffd27a', fontSize: 15, fontWeight: 700 }}>{t('lobby.unfair')}</span>}
      </div>
      <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 17, color: SOFT }}>
        <span style={{ textShadow: '0 1px 8px rgba(0,0,0,.6)', paddingLeft: 70 }}>{t('lobby.hint')}</span>
        <span style={{ ...panel, padding: '10px 18px', border: `1px solid ${CREAM}`, color: CREAM }}>{t('lobby.waitVip', { name: vip?.name ?? 'VIP' })}</span>
      </div>
    </>
  );
}

function HostMorning({ view, t, player }: HostViewProps) {
  const died = (view.died as string[]).map((id) => player(id)).filter(Boolean) as PlayerInfo[];
  const gut = view.gut as { id: string; count: number; total: number }[];
  const max = Math.max(1, ...gut.map((g) => g.count));
  useEffect(() => {
    play('rooster');
  }, []);
  return (
    <>
      <TopLine view={view} t={t} player={player} />
      <div style={{ flex: 1, display: 'flex', gap: 40, alignItems: 'flex-start', paddingTop: 10 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 22 }}>
          <Title size={56} style={{ animation: 'wwFade 1s both' }}>{variant(t('say.morning'), view.day)}</Title>
          <div style={{ ...panel, display: 'flex', flexDirection: 'column', gap: 16, animation: 'wwRise .6s 1s both' }}>
            {died.length ? (
              <>
                <div style={{ display: 'flex', gap: 18 }}>{died.map((p) => <Face key={p.id} p={p} size={110} dead />)}</div>
                <div style={{ fontFamily: FELL, fontSize: 34 }}>{t(died.length > 1 ? 'morning.manyDied' : 'morning.oneDied', { names: died.map((p) => p.name).join(` ${t('and')} `) })}</div>
              </>
            ) : <div style={{ fontFamily: FELL, fontSize: 36 }}>{t('morning.none')}</div>}
            {view.lovers && <div style={{ fontSize: 18, color: SOFT, display: 'flex', alignItems: 'center', gap: 8 }}><RoleIcon role="cupid" size={22} />{t('morning.lovers')}</div>}
          </div>
        </div>
        {gut.length > 0 && (
          <div style={{ ...panel, width: 410, display: 'flex', flexDirection: 'column', gap: 12, animation: 'wwRise .6s 1.6s both' }}>
            <div style={{ fontFamily: FELL, fontSize: 28 }}>{t('gut.title')}</div>
            <div style={{ fontSize: 15, color: SOFT }}>{t('gut.text')}</div>
            {gut.map((g) => (
              <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Avatar player={player(g.id)} size={32} flat />
                <span style={{ width: 80, fontSize: 17, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{player(g.id)?.name}</span>
                <div style={{ flex: 1, height: 16, borderRadius: 8, background: '#2a2f48' }}><div style={{ width: `${(g.count / max) * 100}%`, height: 16, borderRadius: 8, background: WOLF }} /></div>
                <b style={{ width: 22, textAlign: 'right' }}>{g.count}</b>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function HostFlip({ view, t, player }: HostViewProps) {
  const p = player(view.who);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpen(false);
    play('drumroll');
    const id = setTimeout(() => {
      setOpen(true);
      play(view.info.side === 'wolves' ? 'howl' : 'bell');
    }, 1600);
    return () => clearTimeout(id);
  }, [view.who]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <TopLine view={view} t={t} player={player} />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 60 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <Face p={p} size={150} dead />
          <Title size={40}>{t(`cause.${view.cause}`, { name: p?.name ?? '?' })}</Title>
        </div>
        <div style={{ width: 260, height: 360, perspective: 900 }}>
          <div style={{ width: '100%', height: '100%', borderRadius: 24, position: 'relative', transformStyle: 'preserve-3d', transition: 'transform .8s cubic-bezier(.3,1.4,.5,1)', transform: open ? 'rotateY(0deg)' : 'rotateY(180deg)' }}>
            <div style={{ position: 'absolute', inset: 0, borderRadius: 24, backfaceVisibility: 'hidden', background: CARD, border: `2px solid ${view.info.side === 'wolves' ? WOLF_D : LINE}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 20, textAlign: 'center' }}>
              {view.info.role ? <RoleIcon role={view.info.role} size={96} /> : <span style={{ fontSize: 64, color: MUTED }}>?</span>}
              <div style={{ fontFamily: FELL, fontSize: 36, color: view.info.side === 'wolves' ? WOLF : CREAM }}>
                {view.info.role ? t(`role.${view.info.role}`) : view.info.side ? t(`side.${view.info.side}`) : t('role.hidden')}
              </div>
            </div>
            <div style={{ position: 'absolute', inset: 0, borderRadius: 24, backfaceVisibility: 'hidden', transform: 'rotateY(180deg)', background: '#10172f', border: `2px solid ${LINE}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Moon size={110} />
            </div>
          </div>
        </div>
      </div>
      <Village view={view} player={player} size={44} />
    </>
  );
}

function Grid({ ids, player, badges, check, highlight, dim, size = 72 }: { ids: string[]; player: Player; badges?: Record<string, number>; check?: string[]; highlight?: string | null; dim?: boolean; size?: number }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '18px 14px', justifyContent: 'center', maxWidth: 1100, margin: '0 auto' }}>
      {ids.map((id) => {
        const b = badges?.[id] ?? 0;
        const hl = highlight === id;
        return (
          <div key={id} style={{ position: 'relative', transform: hl ? 'scale(1.22)' : undefined, opacity: dim && highlight && !hl ? 0.35 : 1, transition: 'transform .4s, opacity .4s' }}>
            <Face p={player(id)} size={size} ring={hl ? WOLF : undefined} />
            {check?.includes(id) && <span style={{ position: 'absolute', right: 6, top: size - 20, width: 24, height: 24, borderRadius: '50%', background: CREAM, color: NAVY, fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</span>}
            {b > 0 && <span key={b} style={{ position: 'absolute', top: -8, right: 4, minWidth: 32, height: 32, padding: '0 8px', borderRadius: 16, background: WOLF, color: '#fff', fontSize: 18, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'wwPop .3s both' }}>{b}</span>}
          </div>
        );
      })}
    </div>
  );
}

function HostMayor({ view, t, player }: HostViewProps) {
  if (view.screen === 'mayorResult') {
    const p = player(view.mayor);
    return (
      <>
        <TopLine view={view} t={t} player={player} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18 }}>
          <RoleIcon role="mayor" size={70} color={AMBER} />
          <span style={{ animation: 'wwPop .6s both' }}><Face p={p} size={150} crown /></span>
          <Title size={48}>{t('mayor.elected', { name: p?.name ?? '?' })}</Title>
          <p style={{ ...panel, fontSize: 19 }}>{t('short.mayor')}</p>
        </div>
      </>
    );
  }
  return (
    <>
      <TopLine view={view} t={t} player={player} right={<TimeBar deadline={view.deadline} duration={view.duration} width={220} />} />
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
        <Title size={48}>{t('mayor.title')}</Title>
        <p style={{ ...panel, padding: '8px 16px', fontSize: 19 }}>{t('mayor.text')}</p>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}><div style={{ flex: 1 }}><Grid ids={view.alive} player={player} /></div></div>
      <div style={{ textAlign: 'center' }}><span style={{ ...panel, padding: '8px 16px' }}>{t('voted', { n: view.voted, total: view.voters })}</span></div>
    </>
  );
}

function circle(ids: string[], cx: number, cy: number, rx: number, ry: number) {
  const pos: Record<string, { x: number; y: number }> = {};
  ids.forEach((id, k) => {
    const a = -Math.PI / 2 + (k * 2 * Math.PI) / ids.length;
    pos[id] = { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) };
  });
  return pos;
}

function Arrows({ arrows, pos, r }: { arrows: { from: string; to: string }[]; pos: Record<string, { x: number; y: number }>; r: number }) {
  return (
    <svg width="1168" height="560" style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}>
      <defs><marker id="wwAh" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill={WOLF} /></marker></defs>
      {arrows.map((a) => {
        const A = pos[a.from];
        const B = pos[a.to];
        if (!A || !B) return null;
        const dx = B.x - A.x;
        const dy = B.y - A.y;
        const d = Math.hypot(dx, dy) || 1;
        return <line key={a.from} x1={A.x + (dx / d) * r} y1={A.y + (dy / d) * r} x2={B.x - (dx / d) * (r + 4)} y2={B.y - (dy / d) * (r + 4)} stroke={WOLF} strokeWidth={3} strokeDasharray="8 6" markerEnd="url(#wwAh)" />;
      })}
    </svg>
  );
}

function Chronicle({ view, t, player }: { view: any; t: Translate; player: Player }) {
  const dead = (view.dead ?? []) as any[];
  if (!dead.length) return <div style={{ ...panel, color: SOFT, fontSize: 16 }}>{t('chronicle.empty')}</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {dead.slice(-6).map((d) => (
        <div key={d.id} style={{ ...panel, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar player={player(d.id)} size={34} flat dim />
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
            <b style={{ fontSize: 16 }}>{player(d.id)?.name}</b>
            <span style={{ fontSize: 13, color: MUTED }}>{t(`chronicle.${d.cause}`, { n: d.day })}</span>
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, color: d.side === 'wolves' ? WOLF : SOFT }}>{d.role ? t(`role.${d.role}`) : d.side ? t(`side.${d.side}`) : '?'}</span>
        </div>
      ))}
    </div>
  );
}

/** Herzschlag kurz vor Ablauf der Zeit */
function useHeartbeat(deadline?: number) {
  const now = useServerNow(250);
  const left = deadline ? deadline - now : 0;
  const beat = left > 0 && left <= 15000 ? Math.floor(left / (left <= 6000 ? 650 : 1000)) : -1;
  useEffect(() => {
    if (beat >= 0) heartbeatIfClose(left);
  }, [beat]); // eslint-disable-line react-hooks/exhaustive-deps
}

function HostDiscuss({ view, t, player }: HostViewProps) {
  useHeartbeat(view.deadline);
  const ids = view.alive as string[];
  const pos = circle(ids, 380, 300, 300, 215);
  const count: Record<string, number> = {};
  for (const a of view.arrows as { to: string }[]) count[a.to] = (count[a.to] ?? 0) + 1;
  const size = ids.length > 12 ? 54 : 66;
  return (
    <>
      <TopLine view={view} t={t} player={player} />
      <div style={{ flex: 1, display: 'flex', gap: 20, minHeight: 0 }}>
        <div style={{ position: 'relative', width: 760, height: 560, flex: 'none' }}>
          {view.arrowsOn && <Arrows arrows={view.arrows} pos={pos} r={size / 2 + 6} />}
          {ids.map((id) => (
            <div key={id} style={{ position: 'absolute', left: pos[id].x - (size + 26) / 2, top: pos[id].y - size / 2 - 4 }}>
              <Face p={player(id)} size={size} crown={view.mayor === id} ring={count[id] ? WOLF : undefined} />
              {count[id] > 0 && <span style={{ position: 'absolute', top: -6, right: 0, minWidth: 26, height: 26, borderRadius: 13, background: WOLF, color: '#fff', fontWeight: 800, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{count[id]}</span>}
            </div>
          ))}
          <div style={{ ...panel, position: 'absolute', left: 290, top: 236, width: 180, padding: '12px 10px', textAlign: 'center' }}>
            <Title size={32}>{t('discuss.title')}</Title>
            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'center' }}><Clock deadline={view.deadline} /></div>
          </div>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <Title size={28}>{t('chronicle.title')}</Title>
          <Chronicle view={view} t={t} player={player} />
          {view.arrowsOn && <p style={{ ...panel, padding: '8px 12px', fontSize: 14, color: SOFT }}>{t('discuss.arrowsHint')}</p>}
        </div>
      </div>
    </>
  );
}

function Clock({ deadline }: { deadline: number }) {
  const now = useServerNow(250);
  const s = Math.max(0, Math.ceil((deadline - now) / 1000));
  return <b style={{ ...panel, padding: '6px 14px', fontSize: 34, color: s <= 20 ? WOLF : CREAM }}>{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</b>;
}

function HostVote({ view, t, player }: HostViewProps) {
  useHeartbeat(view.deadline);
  const prev = useRef(0);
  useEffect(() => {
    if (!prev.current) play('bell');
    prev.current = 1;
  }, []);
  const badges: Record<string, number> = {};
  for (const v of view.live as { to: string }[]) badges[v.to] = (badges[v.to] ?? 0) + 1;
  return (
    <>
      <TopLine view={view} t={t} player={player} right={<TimeBar deadline={view.deadline} duration={view.duration} width={220} />} />
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <Title size={50}>{view.runoff ? t('vote.runoff') : t('vote.title')}</Title>
        <p style={{ ...panel, padding: '8px 16px', fontSize: 19 }}>{view.runoff ? t('vote.runoffText') : t('vote.text')}</p>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}><div style={{ flex: 1 }}><Grid ids={view.candidates} player={player} badges={badges} check={view.voted} /></div></div>
      <div style={{ textAlign: 'center' }}><span style={{ ...panel, padding: '8px 16px' }}>{t('voted', { n: view.voted.length, total: view.voters })}</span></div>
    </>
  );
}

function HostVoteResult({ view, t, player }: HostViewProps) {
  const list = view.list as { from: string; to: string }[];
  const [shown, setShown] = useState(0);
  const [phase, setPhase] = useState<'count' | 'drum' | 'done'>('count');
  useEffect(() => {
    setShown(0);
    setPhase('count');
    const step = list.length ? Math.min(0.45, 4.5 / list.length) : 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    list.forEach((_, i) => timers.push(setTimeout(() => {
      setShown(i + 1);
      play('pop');
    }, 800 + i * step * 1000)));
    const total = 800 + list.length * step * 1000 + 400;
    timers.push(setTimeout(() => {
      setPhase('drum');
      if (view.out) play('drumroll');
    }, total));
    timers.push(setTimeout(() => setPhase('done'), total + 1700));
    return () => timers.forEach(clearTimeout);
  }, [view.out, list.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const badges: Record<string, number> = {};
  if (view.secret) {
    if (phase !== 'count') Object.assign(badges, view.counts);
  } else for (const v of list.slice(0, shown)) badges[v.to] = (badges[v.to] ?? 0) + 1;
  const out = view.out ? player(view.out) : null;
  const msg = phase === 'count' ? t('voteResult.counting') : out ? t('voteResult.out', { name: out.name }) : view.tie ? t('voteResult.tie') : t('voteResult.none');
  const recent = list.slice(Math.max(0, shown - 4), shown);
  return (
    <>
      <TopLine view={view} t={t} player={player} />
      <div style={{ textAlign: 'center', minHeight: 90, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <Title size={48} key={phase} style={{ animation: 'wwPop .5s both' }}>{msg}</Title>
        {phase === 'done' && view.decidedBy === 'mayor' && <span style={{ ...panel, padding: '6px 14px', fontSize: 17 }}>{t('voteResult.byMayor')}</span>}
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}><div style={{ flex: 1 }}><Grid ids={view.candidates} player={player} badges={badges} highlight={phase !== 'count' ? view.out : null} dim /></div></div>
      <div style={{ minHeight: 44, display: 'flex', justifyContent: 'center', gap: 10 }}>
        {!view.secret && phase === 'count' && recent.map((v, i) => (
          <span key={`${v.from}${i}`} style={{ ...panel, padding: '6px 12px', fontSize: 15, display: 'flex', alignItems: 'center', gap: 6, animation: 'wwRise .3s both' }}>
            <Avatar player={player(v.from)} size={24} flat />→ {v.to === NOBODY ? t('nobody') : player(v.to)?.name}
          </span>
        ))}
        {!view.secret && phase !== 'count' && (badges[NOBODY] ?? 0) > 0 && <span style={{ ...panel, padding: '6px 12px' }}>{t('voteResult.skip', { n: badges[NOBODY] })}</span>}
      </div>
    </>
  );
}

function Cast({ cast, t, player, cols = 2 }: { cast: any[]; t: Translate; player: Player; cols?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 8 }}>
      {cast.map((c) => {
        const wolf = c.role === 'wolf';
        return (
          <div key={c.id} style={{ padding: '7px 12px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 10, background: wolf ? 'rgba(58,29,36,.92)' : 'rgba(22,29,58,.9)', border: `1px solid ${wolf ? WOLF_D : LINE}` }}>
            <span style={{ filter: c.alive ? undefined : 'grayscale(1)', display: 'inline-flex' }}><Avatar player={player(c.id)} size={36} flat /></span>
            <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
              <b style={{ fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{player(c.id)?.name}{c.lover ? ' ♥' : ''}</b>
              <span style={{ fontSize: 13, color: wolf ? WOLF : SOFT }}>{t(`role.${c.role}`)}</span>
            </span>
            <span style={{ fontSize: 12, color: MUTED }}>{c.alive ? t('cast.alive') : c.death?.cause === 'vote' ? t('cast.dayOut', { n: c.death.day }) : t('cast.nightOut', { n: c.death?.day ?? '?' })}</span>
          </div>
        );
      })}
    </div>
  );
}

function HostEnd({ view, t, player }: HostViewProps) {
  useEffect(() => {
    play(view.winner === 'wolves' ? 'howl' : 'fanfare');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <TopLine view={view} t={t} player={player} />
      <div style={{ display: 'flex', gap: 36, flex: 1, minHeight: 0 }}>
        <div style={{ width: 440, display: 'flex', flexDirection: 'column', gap: 18, justifyContent: 'center' }}>
          <Kicker>{t('end.kicker')}</Kicker>
          <Title size={64} style={{ animation: 'wwPop .8s both', color: view.winner === 'wolves' ? WOLF : CREAM }}>{t(`end.${view.winner}`)}</Title>
          <p style={{ ...panel, fontSize: 19 }}>{t(`end.${view.winner}Text`)}</p>
        </div>
        <div style={{ flex: 1, alignSelf: 'center' }}><Cast cast={view.cast} t={t} player={player} /></div>
      </div>
    </>
  );
}

function stepText(s: any, t: Translate, player: Player) {
  const n = (id: string | null) => (id ? player(id)?.name ?? '?' : '?');
  const names = (l: string[]) => l.map((x) => n(x)).join(` ${t('and')} `);
  switch (s.kind) {
    case 'wolves':
      return {
        who: t('recap.wolves'), wolf: true,
        text: s.victim ? t('recap.wolvesText', { wolves: names(s.wolves), victim: n(s.victim) }) : t('recap.wolvesNone', { wolves: names(s.wolves) }),
        quote: s.quote ? t('recap.quote', { name: n(s.quote.from), msg: t(`msg.${s.quote.msg}`) }) : null,
      };
    case 'cupid':
      return { who: t('role.cupid'), text: t('recap.cupid', { who: n(s.who), a: n(s.lovers[0]), b: n(s.lovers[1]) }) };
    case 'protector':
      return { who: t('role.protector'), text: s.target ? t(s.saved ? 'recap.protectSaved' : 'recap.protect', { who: n(s.who), target: n(s.target) }) : t('recap.protectNone', { who: n(s.who) }) };
    case 'seer':
      return { who: t('role.seer'), text: t('recap.seer', { who: n(s.who), target: n(s.target), role: t(`role.${s.role}`) }) };
    case 'witch':
      if (s.healed && s.poisoned) return { who: t('role.witch'), text: t('recap.witchBoth', { who: n(s.who), healed: n(s.healed), poisoned: n(s.poisoned) }) };
      if (s.healed) return { who: t('role.witch'), text: t('recap.witchHeal', { who: n(s.who), healed: n(s.healed) }) };
      if (s.poisoned) return { who: t('role.witch'), text: t('recap.witchPoison', { who: n(s.who), poisoned: n(s.poisoned) }) };
      return { who: t('role.witch'), text: s.victim ? t('recap.witchSaw', { who: n(s.who), victim: n(s.victim) }) : t('recap.witchQuiet', { who: n(s.who) }) };
    case 'gut':
      return { who: t('gut.title'), text: t('recap.gut', { count: s.count, total: s.total, target: n(s.target), role: t(`role.${s.role}`) }) };
  }
  return { who: '', text: '' };
}

function HostRecap({ view, t, player }: HostViewProps) {
  const now = useServerNow(200);
  const steps = view.steps as any[];
  const idx = Math.min(steps.length - 1, Math.max(0, Math.floor((now - view.startAt) / (view.step * 1000))));
  const cur = steps[idx];
  useEffect(() => {
    if (cur) play(cur.kind === 'wolves' ? 'howl' : 'page');
  }, [idx]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!cur) return null;
  const shown = steps.slice(Math.max(0, idx - 3), idx + 1).filter((s) => s.night === cur.night);
  return (
    <>
      <TopLine view={view} t={t} player={player} />
      <div style={{ display: 'flex', gap: 40, flex: 1, minHeight: 0 }}>
        <div style={{ width: 520, alignSelf: 'center' }}><Cast cast={view.cast} t={t} player={player} /></div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Title size={36}>{t('recap.title', { n: cur.night })}</Title>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              {steps.map((s, i) => <span key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: i === idx ? CREAM : i < idx ? '#4a5480' : '#2c3560' }} />)}
            </span>
          </div>
          {shown.map((s) => {
            const x = stepText(s, t, player);
            const now2 = s === cur;
            return (
              <div key={steps.indexOf(s)} style={{ ...panel, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 4, border: `1px solid ${now2 ? CREAM : LINE}`, opacity: now2 ? 1 : 0.6, animation: now2 ? 'wwRise .5s both' : undefined }}>
                <span style={{ fontSize: 13, letterSpacing: 2, textTransform: 'uppercase', color: x.wolf ? WOLF : MUTED }}>{x.who}</span>
                <span style={{ fontSize: 20, lineHeight: 1.35 }}>{x.text}</span>
                {x.quote && <span style={{ fontSize: 16, color: SOFT, fontStyle: 'italic' }}>{x.quote}</span>}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function HostFinal({ view, t, player }: HostViewProps) {
  const awards = view.awards as { key: string; id: string; n: number }[];
  return (
    <>
      <TopLine view={view} t={t} player={player} />
      <div style={{ flex: 1, display: 'flex', gap: 24, minHeight: 0 }}>
        <div style={{ flex: 1, ...panel, display: 'flex', flexDirection: 'column' }}>
          <Podium ranking={view.ranking} player={player} pointsLabel={t('points')} />
        </div>
        {awards.length > 0 && (
          <div style={{ width: 320, display: 'flex', flexDirection: 'column', gap: 12, justifyContent: 'center' }}>
            {awards.map((a, i) => (
              <div key={a.key} style={{ ...panel, display: 'flex', alignItems: 'center', gap: 12, animation: `wwRise .5s ${2 + i * 0.5}s both` }}>
                <Avatar player={player(a.id)} size={48} flat />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <b style={{ fontFamily: FELL, fontSize: 22, color: a.key === 'sheep' ? WOLF : CREAM }}>{t(`award.${a.key}`)}</b>
                  <span style={{ fontSize: 14, color: SOFT }}>{player(a.id)?.name} · {t(`award.${a.key}Text`, { n: a.n })}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/* ================= Handy ================= */

/** Dunkler, für alle gleicher Hintergrund */
function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <>
      <style>{KEYFRAMES}</style>
      <div aria-hidden="true" style={{ position: 'fixed', inset: 0, background: NAVY, zIndex: 0 }} />
      <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column', gap: 14, fontFamily: BODY, color: CREAM, paddingTop: 30 }}>{children}</div>
    </>
  );
}

/** Rolle ansehen: nur solange gedrückt */
function RoleHold({ me, t, player, big }: { me: any; t: Translate; player: Player; big?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!me?.role) return null;
  const role = me.role as Role;
  const wolf = role === 'wolf';
  const down = (e: { preventDefault(): void }) => {
    e.preventDefault();
    setOpen(true);
    vibrate(15);
  };
  const up = () => setOpen(false);
  return (
    <>
      <button type="button" onPointerDown={down} onPointerUp={up} onPointerLeave={up} onPointerCancel={up} onContextMenu={(e) => e.preventDefault()}
        style={{ userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'none', border: `1px solid ${LINE}`, borderRadius: big ? 24 : 14, minHeight: big ? 280 : 46, background: big ? CARD : NAVY2, color: MUTED, fontFamily: BODY, fontSize: big ? 19 : 14, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 10 }}>
        {big && <Moon size={90} />}
        {t('phone.hold')}
      </button>
      {open && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18, pointerEvents: 'none' }}>
          <div style={{ width: '100%', maxWidth: 420, minHeight: '70vh', borderRadius: 26, background: CARD, border: `2px solid ${wolf ? WOLF_D : LINE}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, textAlign: 'center' }}>
            <RoleIcon role={role} size={92} />
            <div style={{ fontSize: 14, letterSpacing: 3, textTransform: 'uppercase', color: MUTED }}>{t('phone.youAre')}</div>
            <div style={{ fontFamily: FELL, fontSize: 46, color: wolf ? WOLF : CREAM }}>{t(`role.${role}`)}</div>
            <div style={{ fontSize: 16, lineHeight: 1.45, color: SOFT }}>{t(`long.${role}`)}</div>
            {wolf && (
              <div style={{ padding: '10px 14px', borderRadius: 12, background: '#3a1d24', fontSize: 15 }}>
                {me.mates.length ? t('phone.pack', { names: me.mates.map((id: string) => player(id)?.name ?? '?').join(', ') }) : t('phone.alone')}
              </div>
            )}
            {me.lover && <div style={{ padding: '10px 14px', borderRadius: 12, background: '#3a2340', fontSize: 15 }}>♥ {t('phone.lover', { name: player(me.lover)?.name ?? '?' })}</div>}
            {me.mayor && <div style={{ fontSize: 15, color: AMBER }}>{t('phone.mayor')}</div>}
            {!me.alive && <div style={{ fontSize: 15, color: MUTED }}>{t('phone.ghost')}</div>}
          </div>
        </div>
      )}
    </>
  );
}

function PhoneBar({ deadline, duration, label }: { deadline?: number; duration?: number; label: string }) {
  const now = useServerNow(250);
  const left = deadline ? Math.max(0, deadline - now) : 0;
  const s = Math.ceil(left / 1000);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, color: MUTED }}>
        <span>{label}</span>
        {deadline ? <b style={{ color: CREAM, fontSize: 17 }}>{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</b> : null}
      </div>
      {deadline && duration ? <div style={{ height: 6, borderRadius: 3, background: '#232c4d' }}><div style={{ width: `${clamp(left / duration) * 100}%`, height: 6, borderRadius: 3, background: CREAM, transition: 'width .25s linear' }} /></div> : null}
    </div>
  );
}

function Tiles({ ids, selected, onPick, player, dots, cols = 3, disabled }: { ids: string[]; selected: string[]; onPick: (id: string) => void; player: Player; dots?: Record<string, number>; cols?: number; disabled?: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 8 }}>
      {ids.map((id) => {
        const p = player(id);
        if (!p) return null;
        const on = selected.includes(id);
        const d = dots?.[id] ?? 0;
        return (
          <button key={id} type="button" aria-pressed={on} disabled={disabled} onClick={() => onPick(id)} style={{
            position: 'relative', minHeight: 86, borderRadius: 14, background: NAVY2, border: `2px solid ${on ? CREAM : 'transparent'}`,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5, color: SOFT, fontFamily: BODY, padding: 4,
          }}>
            <Avatar player={p} size={40} flat />
            <span style={{ fontSize: 13, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
            {d > 0 && <span style={{ position: 'absolute', top: 5, right: 7, fontSize: 10, letterSpacing: 1, color: AMBER }}>{'●'.repeat(Math.min(4, d))}</span>}
          </button>
        );
      })}
    </div>
  );
}

function Chips({ list, value, onPick, t, disabled }: { list: string[]; value: string | null; onPick: (c: string) => void; t: Translate; disabled?: Record<string, boolean> }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {list.map((c) => (
        <button key={c} type="button" disabled={disabled?.[c]} aria-pressed={value === c} onClick={() => onPick(c)} style={{
          minHeight: 44, padding: '0 14px', borderRadius: 22, border: `1px solid ${value === c ? CREAM : '#3a4470'}`,
          background: value === c ? '#2a3360' : NAVY2, color: disabled?.[c] ? '#55607f' : SOFT, fontFamily: BODY, fontWeight: 500, fontSize: 14,
        }}>{t(`chip.${c}`)}</button>
      ))}
    </div>
  );
}

const CHIPS: Record<string, string[]> = {
  wolf: ['take', 'not', 'danger', 'any', 'distract'],
  sure: ['sure', 'maybe', 'clueless'],
  witch: ['heal', 'poison', 'none'],
};

/** Nacht: für alle Rollen derselbe Aufbau */
function PhoneNight({ view, t, send, player }: ControllerViewProps) {
  const q = view.task === 'witch'
    ? (view.victim ? t('q.witch', { name: player(view.victim)?.name ?? '?' }) : t('q.witchNone'))
    : t(`q.${view.task}`);
  let line: string;
  if (view.feed?.length) line = view.feed.map((f: any) => `${player(f.from)?.name}: ${t(`msg.${f.msg}`)}`).join(' · ');
  else if (view.banner?.kind === 'seer') line = t('banner.seer', { name: player(view.banner.target)?.name ?? '?', role: t(`role.${view.banner.role}`) });
  else if (view.banner?.kind === 'wolfTarget') line = view.banner.target ? t('banner.wolfTarget', { name: player(view.banner.target)?.name ?? '?' }) : t('banner.wolfNone');
  else if (view.task === 'witch') line = t('banner.potions', { list: [view.potions.heal && t('chip.heal'), view.potions.poison && t('chip.poison')].filter(Boolean).join(', ') || t('banner.noPotions') });
  else line = view.section === 'B' ? t('banner.quiet') : t('banner.secret');
  const picked = (view.pick as string[]).map((id) => player(id)?.name).filter(Boolean).join(' + ');
  const disabled = view.task === 'witch' ? { heal: !view.potions.heal || !view.victim, poison: !view.potions.poison } : undefined;
  const chipVal = view.task === 'witch' ? (view.heal ? 'heal' : view.chip) : view.chip;
  return (
    <PhoneFrame>
      <PhoneBar deadline={view.deadline} duration={view.duration} label={t('phone.nightLabel', { n: view.night, s: view.section === 'A' ? 1 : 2 })} />
      <div style={{ fontFamily: FELL, fontSize: 26, lineHeight: 1.15, minHeight: 60 }}>{q}</div>
      <div style={{ fontSize: 14, color: AMBER, minHeight: 20 }}>{line}</div>
      <Tiles ids={view.opts} selected={view.pick} player={player} dots={view.dots} onPick={(id) => send({ type: 'pick', target: id })} />
      <Chips list={CHIPS[view.chips] ?? CHIPS.sure} value={chipVal} onPick={(c) => send({ type: 'chip', chip: c })} t={t} disabled={disabled} />
      <div style={{ marginTop: 'auto', minHeight: 52, borderRadius: 16, background: picked ? CREAM : NAVY2, color: picked ? NAVY : MUTED, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 17, padding: '0 12px', textAlign: 'center' }}>
        {picked ? t('phone.picked', { name: picked }) : view.multi > 1 ? t('phone.pickTwo') : t('phone.pickOne')}
      </div>
      <RoleHold me={view.me} t={t} player={player} />
    </PhoneFrame>
  );
}

function PhoneLobby({ view, t, send, player }: ControllerViewProps) {
  const [info, setInfo] = useState<string | null>(null);
  const s = view.setup;
  const vip = view.isVip;
  const roles: (Role | 'mayor')[] = ['wolf', 'seer', 'witch', 'hunter', 'cupid', 'protector', 'villager', 'mayor'];
  const active = (r: Role | 'mayor') => r === 'wolf' || r === 'villager' || (r === 'mayor' ? s.mayor : s.specials.includes(r));
  const villagers = view.n - s.wolves - s.specials.length;
  if (info) {
    return (
      <PhoneFrame>
        <button type="button" className="up-btn ghost small" onClick={() => setInfo(null)} style={{ alignSelf: 'flex-start' }}>← {t('phone.back')}</button>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center', padding: '10px 6px' }}>
          <RoleIcon role={info as Role} size={84} color={info === 'mayor' ? AMBER : undefined} />
          <div style={{ fontFamily: FELL, fontSize: 40, color: info === 'wolf' ? WOLF : CREAM }}>{t(`role.${info}`)}</div>
          <div style={{ fontSize: 17, lineHeight: 1.5, color: SOFT }}>{t(`long.${info}`)}</div>
          <div style={{ fontSize: 15, color: MUTED }}>{t(`when.${info}`)}</div>
        </div>
      </PhoneFrame>
    );
  }
  const seg = (key: string, values: (string | number)[], cur: string | number, label: (v: any) => string) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 13, color: MUTED }}>{t(`setl.${key}`)}</span>
      <div style={{ display: 'flex', gap: 6 }}>
        {values.map((v) => (
          <button key={String(v)} type="button" disabled={!vip} onClick={() => send({ type: 'set', key, value: v })} style={{ flex: 1, minHeight: 44, borderRadius: 12, border: `1px solid ${cur === v ? CREAM : '#3a4470'}`, background: cur === v ? '#2a3360' : NAVY2, color: cur === v ? CREAM : SOFT, fontFamily: BODY, fontSize: 14 }}>{label(v)}</button>
        ))}
      </div>
    </div>
  );
  const toggle = (key: string) => (
    <button key={key} type="button" disabled={!vip} onClick={() => send({ type: 'set', key, value: !s[key] })} style={{ minHeight: 48, borderRadius: 12, border: 0, background: NAVY2, color: SOFT, fontFamily: BODY, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 14px' }}>
      {t(`setl.${key}`)}<b style={{ color: s[key] ? CREAM : MUTED }}>{s[key] ? t('on') : t('off')}</b>
    </button>
  );
  return (
    <PhoneFrame>
      <div style={{ fontFamily: FELL, fontSize: 30 }}>{t('lobby.kicker')}</div>
      <div style={{ fontSize: 15, color: MUTED }}>{t('lobby.sides', { w: s.wolves, v: view.n - s.wolves })} · {t('lobby.players', { n: view.n })}</div>
      {roles.map((r) => (
        <div key={r} style={{ minHeight: 54, borderRadius: 14, background: CARD, display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', opacity: active(r) ? 1 : 0.55 }}>
          {vip && r !== 'wolf' && r !== 'villager' ? (
            <button type="button" aria-label={t(`role.${r}`)} onClick={() => send(r === 'mayor' ? { type: 'set', key: 'mayor', value: !s.mayor } : { type: 'role', role: r })}
              style={{ width: 32, height: 32, borderRadius: 8, border: active(r) ? 0 : '2px solid #3a4470', background: active(r) ? CREAM : 'transparent', color: NAVY, fontWeight: 800 }}>{active(r) ? '✓' : ''}</button>
          ) : <span style={{ width: 32 }} />}
          <button type="button" onClick={() => setInfo(r)} style={{ flex: 1, minHeight: 44, border: 0, background: 'transparent', color: CREAM, fontFamily: BODY, fontSize: 16, display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', padding: 0 }}>
            <RoleIcon role={r} size={24} color={r === 'mayor' ? AMBER : undefined} />
            <span style={{ flex: 1 }}>{t(`role.${r}`)}</span>
            {r === 'villager' && <b>×{Math.max(0, villagers)}</b>}
            <span style={{ color: MUTED }}>›</span>
          </button>
          {r === 'wolf' && (vip ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button type="button" aria-label="−" onClick={() => send({ type: 'wolves', delta: -1 })} style={{ width: 44, height: 40, borderRadius: 10, border: '1px solid #3a4470', background: NAVY2, color: CREAM, fontSize: 20 }}>−</button>
              <b style={{ width: 20, textAlign: 'center' }}>{s.wolves}</b>
              <button type="button" aria-label="+" onClick={() => send({ type: 'wolves', delta: 1 })} style={{ width: 44, height: 40, borderRadius: 10, border: '1px solid #3a4470', background: NAVY2, color: CREAM, fontSize: 20 }}>+</button>
            </span>
          ) : <b>×{s.wolves}</b>)}
        </div>
      ))}
      {view.unfair && <div style={{ padding: '8px 12px', borderRadius: 12, background: '#5a4316', color: '#ffd27a', fontSize: 14 }}>{t('lobby.unfair')}</div>}
      <div style={{ fontFamily: FELL, fontSize: 22, marginTop: 6 }}>{t('lobby.settings')}</div>
      {seg('discuss', [120, 180, 300], s.discuss, (v) => t('min', { n: v / 60 }))}
      {seg('reveal', ['role', 'side', 'none'], s.reveal, (v) => t(`setv.reveal.${v}`))}
      {seg('votes', ['reveal', 'open', 'secret'], s.votes, (v) => t(`setv.votes.${v}`))}
      {['arrows', 'lastWords', 'quietFirstNight', 'voice'].map(toggle)}
      <div style={{ position: 'sticky', bottom: 0, paddingTop: 8, background: NAVY }}>
        {vip
          ? <button type="button" className="up-btn big full" onClick={() => send({ type: 'begin' })} style={{ background: CREAM, color: NAVY, boxShadow: 'none' }}>{t('lobby.begin')}</button>
          : <div style={{ textAlign: 'center', color: MUTED, fontSize: 15, padding: 12 }}>{t('lobby.phoneWait')}</div>}
      </div>
    </PhoneFrame>
  );
}

function Center({ children }: { children: ReactNode }) {
  return <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, textAlign: 'center', padding: '10px 6px' }}>{children}</div>;
}

function PickScreen({ view, t, send, player, title, text, nobody }: ControllerViewProps & { title: string; text?: string; nobody?: boolean }) {
  const sel = view.pick ? [view.pick] : view.suspect ? [view.suspect] : [];
  return (
    <PhoneFrame>
      <PhoneBar deadline={view.deadline} duration={view.duration} label={title} />
      {text && <div style={{ fontFamily: FELL, fontSize: 25, lineHeight: 1.15 }}>{text}</div>}
      <Tiles ids={view.opts} selected={sel} player={player} onPick={(id) => send({ type: view.screen === 'vote' ? 'vote' : view.screen === 'discuss' ? 'suspect' : 'pick', target: id })} />
      {nobody && (
        <button type="button" aria-pressed={view.pick === NOBODY} onClick={() => send({ type: 'vote', target: NOBODY })} style={{ minHeight: 50, borderRadius: 14, border: `1px dashed ${view.pick === NOBODY ? CREAM : '#3a4470'}`, background: view.pick === NOBODY ? '#2a3360' : NAVY2, color: SOFT, fontFamily: BODY, fontSize: 16 }}>{t('nobody')}</button>
      )}
      <div style={{ marginTop: 'auto' }} />
      <RoleHold me={view.me} t={t} player={player} />
    </PhoneFrame>
  );
}

function Controller(props: ControllerViewProps) {
  const { view, t, me: mePlayer, player, send } = props;
  useFonts();
  const prevScreen = useRef<string>('');
  useEffect(() => {
    if (view.screen !== prevScreen.current && ['night', 'vote', 'hunter', 'successor', 'mayorVote'].includes(view.screen)) vibrate(40);
    prevScreen.current = view.screen;
  }, [view.screen]);
  const me = view.me;
  const tvWait = (title: string, text?: string) => (
    <PhoneFrame>
      <Center>
        <Avatar player={mePlayer} size={96} />
        <div style={{ fontFamily: FELL, fontSize: 30 }}>{title}</div>
        {text && <p style={{ color: SOFT, fontSize: 16 }}>{text}</p>}
      </Center>
      <RoleHold me={me} t={t} player={player} />
    </PhoneFrame>
  );
  switch (view.screen) {
    case 'lobby':
      return <PhoneLobby {...props} />;
    case 'roles':
      return (
        <PhoneFrame>
          <PhoneBar deadline={view.deadline} duration={view.duration} label={t('roles.phoneLabel')} />
          <div style={{ fontFamily: FELL, fontSize: 28, textAlign: 'center' }}>{t('roles.phone')}</div>
          <RoleHold me={me} t={t} player={player} big />
          <p style={{ color: MUTED, fontSize: 14, textAlign: 'center' }}>{t('roles.phoneHint')}</p>
        </PhoneFrame>
      );
    case 'night':
      return <PhoneNight {...props} />;
    case 'morning':
      return view.newLover
        ? tvWait(t('phone.loverNew', { name: player(view.newLover)?.name ?? '?' }), t('phone.loverText'))
        : tvWait(t('lookAtTv'));
    case 'lastWordsMe':
      return tvWait(t('phone.lastWords'), t('phone.lastWordsText'));
    case 'diedMe':
      return tvWait(t('phone.died'), t('phone.diedText'));
    case 'hunter':
      return <PickScreen {...props} title={t('hunter.phoneLabel')} text={t('hunter.phone')} />;
    case 'successor':
      return <PickScreen {...props} title={t('successor.phoneLabel')} text={t('successor.phone')} />;
    case 'mayorVote':
      return <PickScreen {...props} title={t('mayor.phoneLabel')} text={t('mayor.phone')} />;
    case 'discuss':
      return (
        <PhoneFrame>
          <PhoneBar deadline={view.deadline} duration={view.duration} label={t('discuss.phoneLabel')} />
          <div style={{ fontFamily: FELL, fontSize: 25 }}>{view.arrows ? t('discuss.phone') : t('discuss.phoneNoArrows')}</div>
          {view.arrows && <Tiles ids={view.opts} selected={view.suspect ? [view.suspect] : []} player={player} onPick={(id) => send({ type: 'suspect', target: id })} />}
          {view.isVip && <button type="button" className="up-btn full" onClick={() => send({ type: 'skip' })} style={{ marginTop: 'auto', background: CREAM, color: NAVY, boxShadow: 'none' }}>{t('discuss.skip')}</button>}
          <div style={{ marginTop: view.isVip ? 0 : 'auto' }} />
          <RoleHold me={me} t={t} player={player} />
        </PhoneFrame>
      );
    case 'vote':
      return <PickScreen {...props} title={view.runoff ? t('vote.runoff') : t('vote.phoneLabel')} text={t('vote.phone')} nobody />;
    case 'ghostDay':
      return tvWait(t('phone.ghostTitle'), t('phone.ghostDay'));
    case 'end':
      return (
        <PhoneFrame>
          <Center>
            <Avatar player={mePlayer} size={100} />
            <div style={{ fontFamily: FELL, fontSize: 34 }}>{view.won ? t('end.youWon') : view.me.role ? t('end.youLost') : t(`end.${view.winner}`)}</div>
            {view.me.role && <RoleLabel info={{ role: view.me.role, side: null }} t={t} />}
            {view.score !== null && <p style={{ color: SOFT }}>{t('phone.score', { n: view.score })}</p>}
          </Center>
        </PhoneFrame>
      );
    case 'final':
      return (
        <PhoneFrame>
          <Center>
            <Avatar player={mePlayer} size={100} />
            <div style={{ fontFamily: FELL, fontSize: 30 }}>{t('phone.score', { n: view.score })}</div>
            {(view.awards as string[]).map((a) => <span key={a} style={{ padding: '8px 14px', borderRadius: 12, background: CARD, fontFamily: FELL, fontSize: 22 }}>{t(`award.${a}`)}</span>)}
          </Center>
        </PhoneFrame>
      );
    case 'wait':
    case 'tv':
    default:
      return tvWait(t('lookAtTv'));
  }
}

export default { Host, Controller } satisfies GameClientModule;
