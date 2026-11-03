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

/** Kartenreihe, überlappend wenn es eng wird */
function Row({ cards, w, max, justify = 'center', render }: { cards: AnyCard[]; w: number; max: number; justify?: CSSProperties['justifyContent']; render?: (c: AnyCard, i: number) => ReactNode }) {
  const overlap = cards.length > 1 ? Math.max(0, Math.min(w * 0.45, (cards.length * w - max) / (cards.length - 1))) : 0;
  return (
    <div style={{ display: 'flex', justifyContent: justify, alignItems: 'center', flex: 1, minHeight: Math.round(w * 1.4) }}>
      {cards.map((c, i) => (
        <div key={c.id ?? `h${i}`} style={{ marginLeft: i ? -overlap : 0, zIndex: i }}>{render ? render(c, i) : <CardFace c={c} w={w} />}</div>
      ))}
    </div>
  );
}

const cardName = (c: AnyCard, t: Translate) => (c.s ? `${t('suit.' + c.s)} ${c.n}` : '?');
const cardsText = (cs: AnyCard[], t: Translate) => cs.map((c) => cardName(c, t)).join(', ');

function partsText(parts: Part[], t: Translate) {
  if (!parts?.length) return t('part.none');
  return parts.map((p) => t('part.' + p.k, { v: p.v }) + (p.extra ? ' ' + t('part.extra', { n: p.extra }) : '')).join(' + ');
}

interface StepT { k: string; v?: any; b: any[]; hl?: { p: string; z: string }[] }

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

function ZoneBox({ zone, cards, t, w, hl, value, locked, extra, style, cardMax }: {
  zone: Zone; cards: AnyCard[]; t: Translate; w: number; hl?: boolean; value?: ReactNode; locked?: boolean; extra?: ReactNode; style?: CSSProperties; cardMax: number;
}) {
  return (
    <div style={{
      borderRadius: 14, background: SURF, padding: '5px 10px', display: 'flex', flexDirection: 'column', gap: 3, boxSizing: 'border-box', minWidth: 0,
      boxShadow: hl ? `inset 0 0 0 3px ${GOLD}, 0 0 24px rgba(255,212,71,.35)` : undefined, opacity: locked ? 0.55 : 1, transition: 'box-shadow .3s', ...style,
    }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: ZONE_COLOR[zone] }}>
        <Icon k={zone === 'spell' ? 'spell' : zone} size={15} />
        {locked ? t('zone.corrLocked') : t('zone.' + zone)}
        {value != null && <span className="display" style={{ marginLeft: 'auto', fontSize: 18, color: '#fff', letterSpacing: 0 }}>{value}</span>}
        {extra}
      </span>
      <Row cards={cards} w={w} max={cardMax} />
    </div>
  );
}

function RoyalBox({ p, player, t, active, hl, w = 230 }: { p: any; player?: PlayerInfo; t: Translate; active?: boolean; hl?: boolean; w?: number }) {
  return (
    <div style={{
      width: w, borderRadius: 18, background: SURF2, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', boxSizing: 'border-box',
      boxShadow: hl ? `inset 0 0 0 3px #FF3B4E, 0 0 26px rgba(255,59,78,.45)` : active ? `inset 0 0 0 3px ${player?.color ?? GOLD}, 0 0 26px ${(player?.color ?? GOLD)}55` : undefined,
      transition: 'box-shadow .3s',
    }}>
      <Crowned player={player} royal={p.royal} size={52} fallen={p.hp <= 0} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
        <span className="display" style={{ fontSize: 17, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{player?.name}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700 }}>{t('royal.' + p.royal)} <Hearts hp={p.hp} vit={p.vit} size={16} /></span>
        <span style={{ fontSize: 12, fontWeight: 700, color: p.corrupt ? '#C4B2FF' : 'var(--muted)' }}>
          {p.hp <= 0 ? t('fallen') : p.hand ? t('cards', { n: p.hand }) : ''}{p.corrupt ? (p.hand || p.hp <= 0 ? ' · ' : '') + t('corrupt') : ''}
        </span>
      </div>
    </div>
  );
}

/** Eine Seite des Tisches. top = Gegenüber (gespiegelt wie am echten Tisch) */
function Side({ p, player, t, top, hl, active, values, narrow }: { p: any; player?: PlayerInfo; t: Translate; top?: boolean; hl?: StepT['hl']; active?: boolean; values?: { str: number; blk: number } | null; narrow?: boolean }) {
  const h = (z: string) => !!hl?.some((x) => x.p === p.id && x.z === z);
  const w = 44;
  const royalW = narrow ? 210 : 236;
  const sideMax = narrow ? 230 : 330;
  const corr = (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <ZoneBox zone="corr" cards={[]} t={t} w={w} hl={h('corr')} locked={p.corrupt} cardMax={0}
        style={{ width: 330, height: 44, flexDirection: 'row', alignItems: 'center' }}
        extra={!p.corrupt && (
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, letterSpacing: 0 }}>
            <span style={{ display: 'flex' }}>{p.zones.corr.map((_: unknown, i: number) => <span key={i} style={{ width: 16, height: 24, borderRadius: 4, background: '#2B2260', border: '2px solid #4A4378', marginLeft: i ? -6 : 0 }} />)}</span>
            {p.zones.corr.length} / {p.vit}
          </span>
        )} />
    </div>
  );
  const spell = (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <ZoneBox zone="spell" cards={p.zones.spell} t={t} w={w} hl={h('spell')} cardMax={300} style={{ width: 330, height: 92 }} />
    </div>
  );
  const atk = <ZoneBox zone="atk" cards={p.zones.atk} t={t} w={w} hl={h('atk')} value={values ? values.str : undefined} cardMax={sideMax} />;
  const def = <ZoneBox zone="def" cards={p.zones.def} t={t} w={w} hl={h('def')} value={values ? values.blk : undefined} cardMax={sideMax} />;
  const mid = (
    <div style={{ display: 'grid', gridTemplateColumns: `1fr ${royalW}px 1fr`, gap: 10, height: 108 }}>
      {top ? atk : def}
      <RoyalBox p={p} player={player} t={t} active={active} hl={h('royal')} w={royalW} />
      {top ? def : atk}
    </div>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {top ? <>{corr}{mid}{spell}</> : <>{spell}{mid}{corr}</>}
    </div>
  );
}

function Table({ board, player, t, hl, turn, values, narrow }: { board: any[]; player: (id: string) => PlayerInfo | undefined; t: Translate; hl?: StepT['hl']; turn?: string; values?: boolean; narrow?: boolean }) {
  const [bottom, top] = board;
  const v = (p: any) => (values ? visibleStats(p.zones) : null);
  return (
    <main style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, justifyContent: 'center' }}>
      <Side p={top} player={player(top.id)} t={t} top hl={hl} active={turn === top.id} values={v(top)} narrow={narrow} />
      <div style={{ height: 2, background: 'linear-gradient(90deg, transparent, #4A4378, transparent)', margin: '1px 0' }} />
      <Side p={bottom} player={player(bottom.id)} t={t} hl={hl} active={turn === bottom.id} values={v(bottom)} narrow={narrow} />
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
  useEffect(() => sfx.play('select'), [view.turn, view.board?.[0]?.hand, view.board?.[1]?.hand]);
  const turnP = player(view.turn);
  return (
    <>
      <HostHeader title={t('title')} color={GOLD} info={`${t('round', { n: view.round })} · ${t('phase.plan')}`}
        right={turnP && <Pill color={turnP.color}>{t('turn', { name: turnP.name })}</Pill>} />
      <div style={{ flex: 1, display: 'flex', gap: 14, minHeight: 0, marginTop: -12 }}>
        <JesterAside view={view} t={t} player={player} />
        <Table board={view.board} player={player} t={t} turn={view.turn} />
        <DeckAside view={view} t={t} />
      </div>
    </>
  );
}

function useStepIndex(view: any) {
  const now = useServerNow(100);
  const len = view.steps?.length ?? 0;
  const i = Math.floor((now - view.startAt) / (view.step * 1000));
  return { idx: Math.max(0, Math.min(len - 1, i)), done: now >= view.startAt + len * view.step * 1000, started: now >= view.startAt };
}

const STEP_SOUND: Record<string, Parameters<typeof sfx.play>[0]> = {
  reveal: 'reveal', hit: 'stamp', miss: 'wrong', royalFalls: 'drumroll', kingFalls: 'drumroll', shatter: 'whoosh', siphon: 'sneaky',
  counter: 'pop', corrupt: 'sneaky', higherSw: 'whoosh', higherSh: 'whoosh', wrongZone: 'whoosh', spellCancel: 'whoosh', draw: 'pop',
};

function PhaseSteps({ phase, t, size = 15, noPlan }: { phase: string; t: Translate; size?: number; noPlan?: boolean }) {
  const cur = PHASES.indexOf(phase as any);
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
      {['plan', ...PHASES].map((p, i) => noPlan && !i ? null : (() => {
        const state = i - 1 < cur ? 'done' : i - 1 === cur ? 'now' : 'next';
        return (
          <span key={p} style={{
            fontSize: size, fontWeight: 700, padding: '4px 10px', borderRadius: 999,
            background: state === 'now' ? GOLD : state === 'done' ? SURF2 : 'transparent', color: state === 'now' ? INK : state === 'done' ? '#E6E2FF' : '#6F68A0',
          }}>{t('phase.' + p)}</span>
        );
      })())}
    </div>
  );
}

function HostResolve({ view, t, player }: HostViewProps) {
  const { idx, done, started } = useStepIndex(view);
  const step: StepT | undefined = view.steps[idx];
  const name = (id: string) => player(id)?.name ?? '?';
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!started || !step) return;
    sfx.play(STEP_SOUND[step.k] ?? 'pop');
  }, [idx, started, view.phase]);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [idx]);
  const board = step?.b ?? [];
  const nextName = view.phaseIdx < 3 ? t('phase.' + PHASES[view.phaseIdx + 1]) : null;
  return (
    <>
      <HostHeader title={t('title')} color={GOLD} info={t('round', { n: view.round })} right={<PhaseSteps phase={view.phase} t={t} />} />
      <div style={{ flex: 1, display: 'flex', gap: 16, minHeight: 0, marginTop: -12 }}>
        {board.length === 2 && <Table board={board} player={player} t={t} hl={started ? step?.hl : undefined} values={view.phase === 'fight'} narrow />}
        <aside style={{ width: 320, flex: 'none', background: SURF, borderRadius: 18, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
          <span className="display" style={{ fontSize: 22, fontWeight: 800 }}>{t('phase.' + view.phase)}</span>
          <div ref={listRef} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
            {view.steps.slice(0, started ? idx + 1 : 0).map((s: StepT, i: number) => {
              const cur = i === idx && !done;
              return (
                <div key={i} className="anim-up" style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: cur ? 16 : 14, lineHeight: 1.3, color: cur ? '#fff' : 'var(--muted)', fontWeight: cur ? 700 : 400 }}>
                  <span style={{ width: 20, height: 20, borderRadius: '50%', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, background: cur ? GOLD : '#4BE3A1', color: INK, marginTop: 1 }}>{cur ? '▶' : '✓'}</span>
                  {stepText(s, t, name)}
                </div>
              );
            })}
          </div>
          <div style={{ borderTop: '1px solid #3A3366', paddingTop: 10, opacity: done ? 1 : 0.4, transition: 'opacity .3s' }}>
            <div style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 6 }}>{nextName ? t('next.tv', { phase: nextName }) : t('next.tvEnd')}</div>
            <div style={{ display: 'flex', gap: 14 }}>
              {view.players.map((id: string) => {
                const ok = view.ready.includes(id) || player(id)?.isBot;
                return (
                  <span key={id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, opacity: ok ? 1 : 0.6 }}>
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

  useEffect(() => { if (view.myTurn) vibrate([30, 60, 30]); }, [view.myTurn]);

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
          <Row cards={all} w={40} max={z === 'spell' || z === 'corr' ? 200 : 104} render={(c) => {
            const isPlanned = plannedHere.some((p) => p.id === c.id);
            return (
              <span onClick={isPlanned ? (e) => { e.stopPropagation(); tapCard(c as Card); } : undefined} style={{ display: 'block' }}>
                <CardFace c={c} w={40} planned={isPlanned} mark={!!c.hidden && !isPlanned} />
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
          <CardFace key={c.id} c={c} w={hand.length > 6 ? 52 : 62} selected={sel === c.id} onClick={() => tapCard(c)} />
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
  const name = (id: string) => (id === view.me.id ? (player(id)?.name ?? '?') : (player(id) ?? room.players.find((p) => p.id === id))?.name ?? '?');
  const step: StepT | undefined = view.steps[idx];
  const opp = player(view.opp.id) ?? room.players.find((p) => p.id === view.opp.id);
  const meNow = step?.b.find((p: any) => p.id === view.me.id) ?? view.me;
  const oppNow = step?.b.find((p: any) => p.id === view.opp.id) ?? view.opp;
  useEffect(() => {
    if (!started || !step) return;
    const v = step.v ?? {};
    if (step.k === 'hit' && v.t === view.me.id) vibrate([60, 40, 60]);
  }, [idx, started]);
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PhaseSteps phase={view.phase} t={t} size={13} noPlan />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {[meNow, oppNow].map((p: any, i: number) => {
          const pl = i ? opp : player(view.me.id);
          const vs = visibleStats(p.zones);
          return (
            <div key={p.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: SURF, borderRadius: 14, padding: '10px 8px' }}>
              <Crowned player={pl} royal={p.royal} size={54} fallen={p.hp <= 0} />
              <span style={{ fontWeight: 700, fontSize: 14, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pl?.name}</span>
              <Hearts hp={p.hp} vit={p.vit} size={15} />
              {view.phase !== 'reveal' && (
                <span style={{ fontSize: 12, fontWeight: 700 }}>
                  <span style={{ color: SUIT.sw.c }}>{t('str', { n: vs.str })}</span> · <span style={{ color: SUIT.sh.c }}>{t('blk', { n: vs.blk })}</span>
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', minHeight: 0 }}>
        {view.steps.slice(0, started ? idx + 1 : 0).map((s: StepT, i: number) => {
          const cur = i === idx;
          return (
            <p key={i} className="anim-up" style={{ fontSize: cur ? 18 : 14, fontWeight: cur ? 700 : 400, color: cur ? '#fff' : 'var(--muted)', lineHeight: 1.3 }}>
              {stepText(s, t, name)}
            </p>
          );
        })}
      </div>
      {view.pressed ? (
        <p className="muted" style={{ textAlign: 'center' }}>{t('phone.waitOther', { name: opp?.name ?? '' })}</p>
      ) : (
        <button type="button" className="up-btn" disabled={!done} onClick={() => { vibrate(20); send({ type: 'next' }); }} style={{ width: '100%', opacity: done ? 1 : 0.4 }}>
          {t('phone.next')}
        </button>
      )}
    </div>
  );
}

export default { Host, Controller } satisfies GameClientModule;
