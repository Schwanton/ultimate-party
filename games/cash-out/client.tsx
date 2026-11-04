import { useEffect, useMemo, useRef, useState } from 'react';
import type { ControllerViewProps, GameClientModule, HostViewProps, PlayerInfo, Translate } from '@up/sdk';
import { Avatar, Confetti, HostHeader, PhoneWait, sfx, useServerNow, vibrate } from '@up/ui';
import { STEP, fallAt, floor2, multAt } from './curve';
import { allBusted, arrivalAt, flowFraction, tallyAt, totalAt, type TallyData, type TallyRound } from './tally';

const PINK = '#FF4F7B';
const PINK_D = '#B8274E';

const fmt = (m: number, lang: string) => `${floor2(m).toLocaleString(lang === 'de' ? 'de-DE' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`;
const multColor = (m: number) => (m < 1 ? '#FF8A8E' : m < 1.5 ? '#FFFFFF' : m < 3 ? '#FFD447' : m < 8 ? '#FF9F43' : '#FF4F7B');
const FALL = '#FF3B4E';
/** Zahlenformat (wird beim Rendern aus der Raumsprache gesetzt) */
let LOCALE = 'de-DE';
/** Farbe zwischen a und b mischen (f = 0…1) */
function mix(a: string, b: string, f: number) {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * f)).join(',')})`;
}

function info(view: any, t: Translate) {
  return `${t('round', { n: view.round, total: view.total })}${view.mult > 1 ? ' · ' + t('double') : ''}`;
}

/* ================= TV ================= */

function Host(props: HostViewProps) {
  const { view, t } = props;
  LOCALE = props.room.lang === 'de' ? 'de-DE' : 'en-US';
  switch (view.screen) {
    case 'intro':
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28, textAlign: 'center' }}>
          <span className="up-tag anim-pop" style={{ background: PINK, color: '#fff', boxShadow: `0 8px 0 ${PINK_D}`, fontSize: 90, padding: '12px 46px', borderRadius: 26, transform: 'rotate(-3deg)' }}>{t('title')}</span>
          <p className="anim-up" style={{ fontSize: 28, maxWidth: 900, lineHeight: 1.35, animationDelay: '.4s' }}>{t('intro.text')}</p>
          <p className="muted anim-up" style={{ fontSize: 22, animationDelay: '.8s' }}>{t('intro.points')}</p>
          {view.lastMan && <p className="anim-up" style={{ fontSize: 22, fontWeight: 700, color: 'var(--yellow)', animationDelay: '1.2s' }}>{t('intro.last')}</p>}
        </div>
      );
    case 'ready':
      return <HostReady {...props} />;
    case 'run':
    case 'crash':
      return <HostGraph {...props} />;
    case 'tally':
      return <HostTally {...props} />;
  }
  return null;
}

function HostReady({ view, t, player }: HostViewProps) {
  const now = useServerNow(100);
  const s = Math.max(0, Math.ceil((view.startAt - now) / 1000));
  const waiting = (view.waiting ?? []) as string[];
  const total = ((view.players ?? []) as string[]).length;
  useEffect(() => {
    if (s > 0) sfx.play('beep', { always: true });
  }, [s]);
  return (
    <>
      <HostHeader title={t('title')} color={PINK} info={info(view, t)} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        {view.mult > 1 && <span className="up-tag anim-pop" style={{ background: 'var(--yellow)', color: '#110D24', fontSize: 28 }}>{t('double')}</span>}
        <span key={s} className="display anim-pop" style={{ fontSize: 150, fontWeight: 800, lineHeight: 1 }}>{s || '…'}</span>
        {!view.canBet ? (
          <p className="muted" style={{ fontSize: 26 }}>{t('ready.text')}</p>
        ) : waiting.length > 0 ? (
          <>
            <span className="display" style={{ fontSize: 54, fontWeight: 800, color: 'var(--yellow)', textShadow: '0 0 30px rgba(255,212,71,.55)', animation: 'upBeat 1s ease-in-out infinite' }}>{t('ready.betBig')}</span>
            {total > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 1000 }}>
                <span className="muted" style={{ fontSize: 20, fontWeight: 700 }}>{t('ready.waiting')}</span>
                {waiting.slice(0, 24).map((id) => {
                  const p = player(id);
                  return p ? <span key={id} className="anim-pop" style={{ animation: 'upFloat 1.2s ease-in-out infinite' }}><Avatar player={p} size={44} /></span> : null;
                })}
                {waiting.length > 24 && <b>+{waiting.length - 24}</b>}
              </div>
            )}
          </>
        ) : (
          <span key="all" className="display anim-pop" style={{ fontSize: 44, fontWeight: 800, color: 'var(--green)' }}>{t('ready.allSet')}</span>
        )}
      </div>
    </>
  );
}

function HostGraph({ view, t, player, room }: HostViewProps) {
  const lang = room.lang;
  const crashed = view.screen === 'crash';
  const boom = crashed && !view.allOut;
  const now = useServerNow(40);
  const seed: number = view.seed;
  const cashed = view.cashed as { id: string; m: number; t: number }[];
  const lastT = view.lastT ?? Math.max(0, ...cashed.map((c) => c.t));
  // tNow: bis wohin die Linie durchgezogen ist
  const tNow = !crashed ? Math.max(0, (now - view.startAt) / 1000) : view.allOut ? lastT : view.crashTime;
  const tEnd = crashed ? view.crashTime : tNow;
  const m = multAt(seed, tNow);
  const fall = crashed ? 0 : fallAt(seed, tNow);

  // Skalen: x = Zeit, y = Kurs ab 0 (beim Crash fällt die Linie auf 0)
  const samples = (to: number, from = 0) => {
    const out: [number, number][] = [];
    for (let s = from; s < to; s += STEP) out.push([s, multAt(seed, s)]);
    out.push([to, multAt(seed, to)]);
    return out;
  };
  const shown = samples(tEnd);
  const maxVal = Math.max(...shown.map((p) => p[1]));
  const tMax = Math.max(10, tEnd * 1.12);
  const yMax = Math.max(2, maxVal * 1.18);
  const W = 860, H = 470, PAD = 48;
  const X = (sec: number) => PAD + (sec / tMax) * (W - PAD - 24);
  const Y = (x: number) => H - PAD - (x / yMax) * (H - PAD - 24);
  const line = (pts: [number, number][]) => pts.map(([sec, v], i) => `${i ? 'L' : 'M'}${X(sec).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
  const solid = samples(tNow);
  const ticks = [0.5, 1, 2, 3, 5, 10, 20, 50, 100].filter((v) => v < yMax * 0.97);
  const sorted = [...cashed].sort((a, b) => b.m - a.m);
  const inIds = (view.players as string[]).filter((id) => !cashed.some((c) => c.id === id));
  const many = view.players.length > 12;
  const color = boom ? FALL : mix(multColor(m).startsWith('#') ? multColor(m) : '#FFFFFF', FALL, Math.min(1, fall * 1.4));

  // Klänge: Spannung, die immer weiter steigt – Herzschlag wird schneller, nach und nach kommen
  // Hi-Hat, Bass und eine hohe Melodie dazu. Fällt der Kurs: tiefes, schiefes Dröhnen.
  const lastBeat = useRef(0);
  const beat = useRef(0);
  useEffect(() => {
    if (crashed) return;
    const sec = tNow;
    const tension = Math.min(1, sec / 20); // 0 … 1 nach 20 s
    const gap = Math.max(115, 540 - sec * 20) * (fall > 0.2 ? 0.75 : 1);
    if (now - lastBeat.current < gap) return;
    lastBeat.current = now;
    const n = beat.current++;
    sfx.custom((s) => {
      // Herzschlag (doppelt: bumm-bumm)
      s.tone(70 + tension * 30, 0.12, { type: 'sine', vol: 0.22 + tension * 0.1, to: 40 });
      if (n % 2 === 0) s.tone(62 + tension * 25, 0.1, { type: 'sine', vol: 0.14 + tension * 0.08, to: 38, at: 0.11 });
      // ab 3 s: Hi-Hat
      if (sec > 3) s.noise(0.035, { filter: 7500, type: 'highpass', vol: 0.03 + tension * 0.05 });
      // ab 6 s: Bass, der langsam höher steigt
      if (sec > 6 && n % 2 === 0) s.tone(55 * Math.pow(2, Math.min(1, (sec - 6) / 20)), 0.22, { type: 'sawtooth', vol: 0.05 + tension * 0.05 });
      // ab 11 s: hohe Melodie im Wechsel, immer höher
      if (sec > 11) {
        const steps = [0, 3, 7, 12, 7, 3];
        const f = 440 * Math.pow(2, (steps[n % steps.length] + Math.min(12, (sec - 11) * 0.6)) / 12);
        s.tone(f, 0.08, { type: 'square', vol: 0.03 + tension * 0.03 });
      }
      // Kurs fällt: dissonantes Dröhnen, umso lauter, je heftiger
      if (fall > 0.2) {
        s.tone(110 - fall * 40, 0.25, { type: 'sawtooth', vol: 0.05 + fall * 0.1, to: 55 });
        s.tone(116 - fall * 40, 0.25, { type: 'sawtooth', vol: 0.04 + fall * 0.08, to: 58 });
      }
    });
  }, [now, crashed, tNow, fall]);
  const lastCount = useRef(cashed.length);
  useEffect(() => {
    if (cashed.length > lastCount.current) sfx.custom((s) => [1319, 1760].forEach((f, i) => s.tone(f, 0.12, { type: 'triangle', vol: 0.12, at: i * 0.06 })));
    lastCount.current = cashed.length;
  }, [cashed.length]);
  useEffect(() => {
    if (!crashed) return;
    if (view.allOut) sfx.play('reveal', { always: true });
    else sfx.custom((s) => {
      s.noise(0.9, { filter: 500, type: 'lowpass', vol: 0.5 });
      s.tone(220, 0.9, { type: 'sawtooth', vol: 0.25, to: 25 });
    });
  }, [crashed, view.allOut]);

  // Zittern beim Fallen (stärker, je heftiger)
  const jitter = fall > 0.15 ? `translate(${(Math.sin(now / 23) * fall * 7).toFixed(1)}px, ${(Math.cos(now / 31) * fall * 5).toFixed(1)}px)` : undefined;
  const tipX = X(tNow), tipY = Y(m);
  // Höchststand bis jetzt (am Ende: bis zum Absturz, auch auf dem grauen Teil)
  const peak = (() => {
    const to = crashed ? view.crashTime : tNow;
    let best = { t: 0, m: multAt(seed, 0) };
    for (let s = 0; s <= to; s += STEP) {
      const v = multAt(seed, s);
      if (v > best.m) best = { t: s, m: v };
    }
    const e = multAt(seed, to);
    return e > best.m ? { t: to, m: e } : best;
  })();
  const lastIds = (view.last ?? []) as string[];
  return (
    <>
      {crashed && view.allOut && <Confetti silent />}
      <HostHeader title={t('title')} color={PINK} info={info(view, t)} />
      <div style={{ flex: 1, display: 'flex', gap: 20, minHeight: 0, animation: boom ? 'upShake .6s ease-out' : undefined }}>
        <div style={{ position: 'relative', width: W, height: H, background: '#15102E', borderRadius: 26, overflow: 'hidden', transform: jitter }}>
          {/* rotes Pulsieren beim Fallen */}
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', boxShadow: `inset 0 0 ${60 + fall * 80}px ${fall * 30}px rgba(255,59,78,${(fall * 0.75).toFixed(2)})`, transition: 'box-shadow .2s' }} />
          <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }} aria-hidden="true">
            <defs>
              <linearGradient id="cr-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".35" /><stop offset="1" stopColor="#15102E" stopOpacity="0" /></linearGradient>
            </defs>
            {ticks.map((v) => (
              <g key={v}>
                <line x1={PAD} x2={W - 24} y1={Y(v)} y2={Y(v)} stroke={v === 1 ? '#4A4378' : '#262048'} strokeDasharray={v === 1 ? '6 6' : undefined} strokeWidth={v === 1 ? 2 : 1} />
                <text x={PAD - 8} y={Y(v) + 5} textAnchor="end" fontSize={14} fontWeight={700} fill="#8F88B8" fontFamily="DM Sans, sans-serif">{String(v).replace('.', lang === 'de' ? ',' : '.')}×</text>
              </g>
            ))}
            <path d={`${line(solid)} L${tipX} ${H - PAD} L${X(0)} ${H - PAD} Z`} fill="url(#cr-fill)" />
            {/* Höchststand: gestrichelte Linie mit Wert */}
            {peak.m > 1.005 && (
              <g opacity={0.9}>
                <line x1={PAD} x2={W - 24} y1={Y(peak.m)} y2={Y(peak.m)} stroke="#FFD447" strokeWidth={2} strokeDasharray="8 7" />
                <circle cx={X(peak.t)} cy={Y(peak.m)} r={6} fill="#FFD447" />
                <text x={W - 30} y={Y(peak.m) - 8} textAnchor="end" fontSize={17} fontWeight={800} fill="#FFD447" stroke="#15102E" strokeWidth={6} paintOrder="stroke" fontFamily="DM Sans, sans-serif">{t('graph.peak', { m: fmt(peak.m, lang) })}</text>
              </g>
            )}
            <path d={line(solid)} fill="none" stroke={color} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 ${8 + fall * 10}px ${color})` }} />
            {crashed && view.allOut && (
              <>
                <path d={line(samples(view.crashTime, tNow))} fill="none" stroke="#8F88B8" strokeWidth={4} strokeDasharray="8 8" />
                <line x1={X(view.crashTime)} x2={X(view.crashTime)} y1={Y(view.crashAt)} y2={Y(0)} stroke="#8F88B8" strokeWidth={4} strokeDasharray="8 8" />
              </>
            )}
            {boom ? (
              <>
                {/* Absturz: senkrecht auf 0 */}
                <line x1={tipX} x2={tipX} y1={tipY} y2={Y(0)} stroke={FALL} strokeWidth={6} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 14px ${FALL})`, strokeDasharray: 600, animation: 'crDrop .35s ease-in both' }} />
                <g transform={`translate(${tipX} ${Y(0) - 6})`}>
                  <polygon points="0,-44 12,-14 42,-20 20,4 34,34 4,20 -18,42 -16,10 -44,0 -14,-12" fill="#FF9F43" style={{ filter: 'drop-shadow(0 0 20px #FF3B4E)', animation: 'upPop .4s ease-out .3s both' }} />
                  <circle r={14} fill="#FFD447" style={{ animation: 'upPop .4s ease-out .3s both' }} />
                </g>
              </>
            ) : !crashed ? (
              <circle cx={tipX} cy={tipY} r={11} fill="#fff" style={{ filter: `drop-shadow(0 0 14px ${color})` }} />
            ) : (
              <circle cx={X(view.crashTime)} cy={Y(0)} r={9} fill="#8F88B8" />
            )}
          </svg>
          {/* Ausgestiegene auf der Kurve */}
          {!many && cashed.map((c) => {
            const p = player(c.id);
            if (!p) return null;
            return (
              <div key={c.id} className="anim-pop" style={{ position: 'absolute', left: X(c.t), top: Y(c.m), transform: 'translate(-50%, -115%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <Avatar player={p} size={36} />
                <span style={{ background: '#110D24', borderRadius: 8, padding: '0 6px', fontSize: 13, fontWeight: 800, color: multColor(c.m) }}>{fmt(c.m, lang)}</span>
              </div>
            );
          })}
          <div style={{ position: 'absolute', left: PAD + 16, top: 18, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="display" style={{ fontSize: 84 + fall * 14, fontWeight: 800, lineHeight: 1, color: boom ? FALL : color, fontVariantNumeric: 'tabular-nums', textShadow: '0 6px 0 rgba(0,0,0,.35)', display: 'flex', alignItems: 'center', gap: 10 }}>
              {boom ? t('crash.at', { m: fmt(view.crashAt, lang) }) : fmt(m, lang)}
              {!crashed && fall > 0.2 && <span style={{ fontSize: 54, animation: 'upBeat .4s ease-in-out infinite' }}>▼</span>}
            </span>
            {!crashed && <span className="muted" style={{ fontSize: 20, fontWeight: 700 }}>{t('run.points', { n: Math.floor(100 * m * view.mult) })}</span>}
            {crashed && view.allOut && <span style={{ fontSize: 22, fontWeight: 700 }}>{t('crash.allOut', { m: fmt(view.crashAt, lang) })}</span>}
            {crashed && lastIds.length > 0 && (
              <span className="anim-pop" style={{ alignSelf: 'flex-start', marginTop: 6, background: 'var(--yellow)', color: '#110D24', fontWeight: 800, fontSize: 20, padding: '6px 14px', borderRadius: 14, boxShadow: '0 4px 0 #C79E1A', animationDelay: '.5s' }}>
                {t('crash.last', { name: lastIds.map((id) => player(id)?.name ?? '?').join(' & '), n: view.lastBonus })}
              </span>
            )}
          </div>
        </div>

        {view.mode !== 'open' ? <AnonSide view={view} t={t} crashed={crashed} fall={fall} /> : (
        <aside style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <section className="up-card" style={{ padding: 14, borderRadius: 22 }}>
            <h2 style={{ fontSize: 18, marginBottom: 8 }}>{crashed ? t('side.busted', { n: view.busted.length }) : t('side.in', { n: inIds.length })}</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {(crashed ? (view.busted as string[]) : inIds).slice(0, 30).map((id) => {
                const p = player(id);
                return p ? <span key={id} style={{ position: 'relative', filter: crashed ? 'grayscale(1)' : undefined, opacity: crashed ? 0.6 : 1, animation: crashed ? undefined : `upFloat ${fall > 0.2 ? '.5s' : '1.6s'} ease-in-out infinite` }}><Avatar player={p} size={many ? 28 : 40} />{crashed && <span style={{ position: 'absolute', right: -4, bottom: -4, fontSize: 16, color: '#FF3B4E', fontWeight: 900 }}>✖</span>}</span> : null;
              })}
              {(crashed ? view.busted.length : inIds.length) > 30 && <b>+{(crashed ? view.busted.length : inIds.length) - 30}</b>}
            </div>
          </section>
          <section className="up-card" style={{ padding: 14, borderRadius: 22, flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <h2 style={{ fontSize: 18, marginBottom: 8 }}>{t('side.out')}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {sorted.slice(0, 8).map((c) => {
                const p: PlayerInfo | undefined = player(c.id);
                return p ? (
                  <div key={c.id} className="anim-up" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Avatar player={p} size={30} />
                    <b style={{ flex: 1, fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</b>
                    <b className="display" style={{ fontSize: 17, color: multColor(c.m) }}>{fmt(c.m, lang)}</b>
                  </div>
                ) : null;
              })}
              {sorted.length > 8 && <span className="faint">+{sorted.length - 8}</span>}
            </div>
          </section>
        </aside>
        )}
      </div>
    </>
  );
}

/** Halbgeheim: nur Anzahlen; geheim: gar nichts */
function AnonSide({ view, t, crashed, fall }: { view: any; t: Translate; crashed: boolean; fall: number }) {
  const half = view.mode === 'half';
  const [ping, setPing] = useState(0);
  const lastOut = useRef(view.outCount ?? 0);
  useEffect(() => {
    if (!half || crashed) return;
    if ((view.outCount ?? 0) > lastOut.current) {
      setPing((n) => n + 1);
      sfx.custom((s) => [1319, 1760].forEach((f, i) => s.tone(f, 0.12, { type: 'triangle', vol: 0.12, at: i * 0.06 })));
    }
    lastOut.current = view.outCount ?? 0;
  }, [view.outCount, half, crashed]);
  const total = (view.players as string[]).length;
  return (
    <aside style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <section className="up-card" style={{ padding: 18, borderRadius: 22, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center' }}>
        {half ? (
          crashed ? (
            <>
              <span className="display" style={{ fontSize: 80, fontWeight: 800, lineHeight: 1, color: view.bustedCount ? '#FF3B4E' : 'var(--green)' }}>{view.bustedCount}</span>
              <b style={{ fontSize: 20 }}>{t('anon.busted', { n: view.bustedCount, total })}</b>
              <span className="muted" style={{ fontSize: 16 }}>{t('anon.who')}</span>
            </>
          ) : (
            <>
              <span className="muted" style={{ fontSize: 18, fontWeight: 700 }}>{t('anon.in')}</span>
              <span key={view.inCount} className="display" style={{ fontSize: 96, fontWeight: 800, lineHeight: 1, animation: `upPop .4s ease-out, upFloat ${fall > 0.2 ? '.5s' : '1.6s'} ease-in-out .4s infinite` }}>{view.inCount}</span>
              <span className="muted" style={{ fontSize: 16 }}>{t('anon.of', { total })}</span>
            </>
          )
        ) : (
          <>
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#8F88B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3.2 3.9M6.6 6.6C3.8 8.3 2 12 2 12s3.5 6 10 6c1.7 0 3.2-.4 4.5-1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
            <b style={{ fontSize: 22 }}>{t('anon.secret')}</b>
            <span className="muted" style={{ fontSize: 16 }}>{t('anon.secretText')}</span>
          </>
        )}
      </section>
      {half && !crashed && ping > 0 && (
        <div key={ping} role="status" className="display" style={{ alignSelf: 'center', background: 'var(--green)', color: '#110D24', fontWeight: 800, fontSize: 22, padding: '10px 18px', borderRadius: 16, boxShadow: '0 5px 0 var(--green-d)', animation: 'upPop .4s ease-out both, upFade 1s ease-in 2.2s reverse forwards' }}>
          {t('anon.someone')}
        </div>
      )}
    </aside>
  );
}

/* ---------------- Auszählung am Ende ---------------- */

/** Farbzonen nach Kurs (wie die Farben während der Runde): Grenzen × 100 × Rundenmultiplikator */
const ZONES: { to: number; c: string }[] = [
  { to: 1, c: '#7E6FE8' },
  { to: 1.5, c: '#FFFFFF' },
  { to: 3, c: '#FFD447' },
  { to: 8, c: '#FF9F43' },
  { to: Infinity, c: PINK },
];

/**
 * Skalenstriche in Stufen (… 10, 50, 100, 500, 1.000 …). Grobe Stufen zuerst; feine blenden aus,
 * sobald sie zu eng werden – so rücken die Striche sichtbar zusammen, wenn die Werte wachsen.
 */
function scaleTicks(top: number, px: number) {
  const steps: number[] = [];
  for (let e = 7; e >= 0; e--) steps.push(5 * 10 ** e, 10 ** e);
  const out: { v: number; op: number; labelOp: number }[] = [];
  const seen = new Set<number>();
  for (const s of steps) {
    const gap = (s / top) * px;
    if (gap < 14) break;
    const op = Math.min(1, (gap - 14) / 26);
    const labelOp = Math.max(0, Math.min(1, (gap - 46) / 22));
    for (let v = s; v <= top + 1e-6; v += s) {
      if (seen.has(v)) continue;
      seen.add(v);
      out.push({ v, op, labelOp });
    }
  }
  return out;
}

function HostTally({ view, t, player, room }: HostViewProps) {
  const data = view.tally as TallyData;
  const now = useServerNow(40);
  const sec = Math.max(0, (now - view.startAt) / 1000);
  const at = tallyAt(data, sec);
  const ids = view.players as string[];
  const totals = Object.fromEntries(ids.map((id) => [id, totalAt(data, id, at)]));
  const order = [...ids].sort((a, b) => totals[b] - totals[a] || ids.indexOf(a) - ids.indexOf(b));
  const winner = order[0];
  const r = at.stage === 'fill' || at.stage === 'extra' || at.stage === 'hold' ? data.rounds[at.round] : null;
  const dead = r ? allBusted(r) : false;
  const flow = (id: string) => (r && at.stage === 'hold' ? flowFraction(r, id, at.holdSec) : 0);

  // Sounds
  const last = useRef({ round: -1, stage: '', tick: 0, arrived: 0 });
  useEffect(() => {
    const L = last.current;
    if (r && at.round !== L.round) {
      L.round = at.round;
      if (dead) sfx.play('wrong');
      else sfx.play('whoosh');
    }
    // Plopp, wenn ein Betrag links ankommt
    if (r && at.stage === 'hold') {
      const arrived = ids.filter((id) => flow(id) >= 1).length;
      if (arrived > L.arrived) sfx.custom((s) => s.tone(700 + arrived * 60, 0.06, { type: 'triangle', vol: 0.08 }));
      L.arrived = arrived;
    } else L.arrived = 0;
    // Hochzählen: Tick wird beim Füllen höher, beim Bonus noch höher
    if ((at.stage === 'fill' || at.stage === 'extra') && at.progress < 1 && now - L.tick > 110) {
      L.tick = now;
      const f = at.stage === 'fill' ? 300 + at.progress * 600 : 900 + at.progress * 500;
      sfx.custom((s) => s.tone(f, 0.05, { type: 'square', vol: 0.04 }));
    }
    if (at.stage !== L.stage) {
      if (at.stage === 'extra' && r && ids.some((id) => (r.extra[id] ?? 0) !== 0)) sfx.custom((s) => [523, 659, 784, 1047].forEach((f, i) => s.tone(f, 0.12, { type: 'triangle', vol: 0.1, at: i * 0.07 })));
      if (at.stage === 'done') sfx.play('fanfare');
      L.stage = at.stage;
    }
  }, [at.stage, at.round, now]);

  return (
    <>
      {at.stage === 'done' && <Confetti />}
      <HostHeader title={t('title')} color={PINK} info={t('tally.title')} />
      <div style={{ flex: 1, display: 'flex', gap: 28, minHeight: 0 }}>
        <TallyBars data={data} at={at} ids={ids} order={order} totals={totals} winner={winner} player={player} flow={flow} />

        {/* rechts: aktuelle Runde */}
        <section style={{ width: 460, display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0 }}>
          {at.stage === 'intro' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12, textAlign: 'center' }}>
              <h1 className="anim-pop" style={{ fontSize: 46 }}>{t('tally.title')}</h1>
              <p className="muted" style={{ fontSize: 20 }}>{t('tally.intro')}</p>
            </div>
          )}
          {r && (
            <>
              <h2 style={{ fontSize: 28 }}>{t('round', { n: at.round + 1, total: data.rounds.length })}</h2>
              <span className="muted" style={{ fontSize: 17, fontWeight: 700 }}>
                {t('tally.crashAt', { m: fmt(r.crashAt, room.lang) })}{r.mult > 1 ? ` · ${t('double')}` : ''}
                {at.stage !== 'fill' && ids.some((id) => (r.extra[id] ?? 0) !== 0) && <b style={{ color: 'var(--yellow)', marginLeft: 8 }}>{t('tally.plusBets')}</b>}
              </span>
              <RoundColumn r={r} at={at} ids={ids} dead={dead} player={player} t={t} lang={room.lang} flow={flow} />
            </>
          )}
          {at.stage === 'done' && player(winner) && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 10, animation: 'upPop .5s ease-out both', textAlign: 'center' }}>
              <Avatar player={player(winner)!} size={140} />
              <h1 style={{ fontSize: 42, color: 'var(--yellow)' }}>{t('tally.winner', { name: player(winner)!.name })}</h1>
              <span className="display" style={{ fontSize: 34, fontWeight: 800 }}>{totals[winner].toLocaleString(LOCALE)}</span>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

/**
 * Links: Balken pro Spieler. Gemessen am aktuell Führenden (der steht bei ca. 85 %), damit die Balken
 * von Anfang an gut gefüllt sind. Hilfslinien mit Zahlen rücken zusammen, wenn alle wachsen.
 * Der frisch dazugekommene Betrag leuchtet kurz am Balkenende.
 */
function TallyBars({ data, at, ids, order, totals, winner, player, flow }: {
  data: TallyData; at: ReturnType<typeof tallyAt>; ids: string[]; order: string[]; totals: Record<string, number>; winner: string;
  player: HostViewProps['player']; flow: (id: string) => number;
}) {
  const shownRows = order.slice(0, 12);
  const rowH = Math.min(62, Math.floor(520 / Math.max(1, shownRows.length)) - 6);
  const av = Math.min(48, rowH - 6);
  const lead = Math.max(0, ...ids.map((id) => totals[id]));
  const scale = Math.max(150, lead / 0.85);
  const trackLeft = 26 + 10 + av + 10;
  const trackRight = 96 + 10;
  const TRACK_PX = 540;
  const ticks = scaleTicks(scale, TRACK_PX);
  const r = at.stage === 'hold' ? data.rounds[at.round] : null;
  // Stand vor dieser Runde (für das leuchtende Stück)
  const before = (id: string) => data.rounds.slice(0, Math.max(0, at.round)).reduce((a, x) => a + (x.base[id] ?? 0) + (x.extra[id] ?? 0), 0);
  const listH = shownRows.length * (rowH + 6);
  return (
    <section style={{ flex: 1, position: 'relative', minWidth: 0 }}>
      {shownRows.map((id, i) => {
        const p = player(id);
        if (!p) return null;
        const v = totals[id];
        const w = (x: number) => `${Math.max(0, Math.min(100, (x / scale) * 100))}%`;
        // frischer Betrag: leuchtet, solange er ankommt, und verblasst kurz danach
        let fresh: { from: number; to: number; glow: number; neg: boolean } | null = null;
        if (r) {
          const add = (r.base[id] ?? 0) + (r.extra[id] ?? 0);
          const f = flow(id);
          const b0 = before(id);
          if (add !== 0 && f > 0) {
            const glow = f < 1 ? 1 : Math.max(0, 1 - (at.holdSec - arrivalAt(r, id)) / 0.7);
            fresh = add > 0 ? { from: b0, to: v, glow, neg: false } : { from: v, to: b0, glow, neg: true };
          }
        }
        return (
          <div key={id} style={{ position: 'absolute', left: 0, right: 0, top: i * (rowH + 6), height: rowH, display: 'flex', alignItems: 'center', gap: 10, transition: 'top .6s cubic-bezier(.3,1.3,.5,1)' }}>
            <span className="display" style={{ width: 26, textAlign: 'right', fontWeight: 800, color: 'var(--faint)' }}>{i + 1}</span>
            <Avatar player={p} size={av} />
            <div style={{ flex: 1, height: rowH - 10, borderRadius: 12, background: 'var(--surface)', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: w(v), background: at.stage === 'done' && id === winner ? 'var(--yellow)' : p.color, borderRadius: 12 }} />
              {fresh && fresh.glow > 0 && (
                <div style={{
                  position: 'absolute', top: 0, bottom: 0, left: w(fresh.from), width: `calc(${w(fresh.to)} - ${w(fresh.from)})`, borderRadius: 12,
                  background: fresh.neg ? '#FF3B4E' : '#FFD447', opacity: fresh.neg ? 0.75 * fresh.glow : fresh.glow,
                  boxShadow: fresh.neg ? undefined : `0 0 ${18 * fresh.glow}px ${6 * fresh.glow}px rgba(255,212,71,.75)`,
                }} />
              )}
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontWeight: 800, fontSize: rowH > 50 ? 19 : 17, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,.9), 0 0 8px rgba(0,0,0,.5)', whiteSpace: 'nowrap' }}>{p.name}</span>
            </div>
            <span className="display" style={{ width: 96, textAlign: 'right', fontWeight: 800, fontSize: 22, fontVariantNumeric: 'tabular-nums', color: fresh && !fresh.neg && fresh.glow > 0.3 ? '#FFE680' : undefined, transition: 'color .3s' }}>{v.toLocaleString(LOCALE)}</span>
            {r && (() => {
              const add = (r.base[id] ?? 0) + (r.extra[id] ?? 0);
              const f = flow(id);
              if (!add || f <= 0) return null;
              return (
                <span className="display" style={{
                  position: 'absolute', right: -6, top: '50%', fontWeight: 800, fontSize: 18, padding: '2px 8px', borderRadius: 10, pointerEvents: 'none', zIndex: 3,
                  background: add > 0 ? 'var(--green)' : '#FF3B4E', color: add > 0 ? '#110D24' : '#fff',
                  transform: `translate(${(1 - f) * 260}px, ${-50 - f * 70}%) scale(${1.2 - f * 0.3})`, opacity: f < 1 ? 1 : 0, transition: 'opacity .4s',
                }}>{add > 0 ? '+' : '−'}{Math.abs(add).toLocaleString(LOCALE)}</span>
              );
            })()}
          </div>
        );
      })}
      {/* Hilfslinien mit Zahlen über alle Balken */}
      <div aria-hidden="true" style={{ position: 'absolute', left: trackLeft, right: trackRight, top: -4, height: listH + 26, pointerEvents: 'none' }}>
        {ticks.map(({ v, op, labelOp }) => (
          <div key={v} style={{ position: 'absolute', left: `${(v / scale) * 100}%`, top: 0, bottom: 22, width: 2, marginLeft: -1, background: `rgba(255,255,255,${(0.13 * op).toFixed(3)})` }}>
            {labelOp > 0 && <span style={{ position: 'absolute', top: '100%', left: 0, transform: 'translateX(-50%)', paddingTop: 4, fontSize: 13, fontWeight: 700, color: '#8F88B8', opacity: labelOp, whiteSpace: 'nowrap' }}>{v.toLocaleString(LOCALE)}</span>}
          </div>
        ))}
      </div>
      {order.length > 12 && <span className="faint" style={{ position: 'absolute', top: listH + 26, left: 36 }}>+{order.length - 12}</span>}
    </section>
  );
}

/**
 * Rechts: Säule der aktuellen Runde auf einer linearen Skala mit festen Farbzonen (nach Kurs).
 * 1. Füllen bis zum besten 100er-Gewinn – die Skala wächst so mit, dass die Spitze bei ca. 65 % bleibt.
 * 2. Einsätze: Die Skala bleibt stehen, Säule und Marker steigen in den freien Platz darüber
 *    (erst ab 92 % wächst sie wieder). So sieht man, dass es mehr wird.
 */
function RoundColumn({ r, at, ids, dead, player, t, lang, flow }: {
  r: TallyRound; at: ReturnType<typeof tallyAt>; ids: string[]; dead: boolean; player: HostViewProps['player']; t: Translate; lang: string; flow: (id: string) => number;
}) {
  const W = 460, H = 452, bottom = H - 16, topY = 18, colX = 72, colW = 46;
  const px = bottom - topY;
  const unit = 100 * r.mult;
  const minTop = unit * 1.5;
  const b = (id: string) => r.base[id] ?? 0;
  const e = (id: string) => r.extra[id] ?? 0;
  const baseMax = Math.max(0, ...ids.map(b));
  const finalMax = Math.max(0, ...ids.map((id) => b(id) + e(id)));
  const topBase = Math.max(minTop, baseMax / 0.65);
  const topFinal = Math.max(topBase, finalMax / 0.92);
  const ef = at.stage === 'extra' ? easeOut(Math.min(1, at.progress * 1.25)) : at.stage === 'hold' ? 1 : 0;
  const valOf = (id: string) => Math.max(0, b(id) + e(id) * ef);
  const colVal = dead ? 0 : at.stage === 'fill' ? baseMax * easeOut(at.progress) : Math.max(0, ...ids.map(valOf));
  const top = dead ? minTop : at.stage === 'fill' ? Math.max(minTop, colVal / 0.65) : Math.max(topBase, colVal / 0.92);
  const y = (v: number, tp = top) => bottom - (Math.max(0, v) / tp) * px;
  const ticks = scaleTicks(top, px);
  const headY = y(colVal);

  // Marker in Spalten verteilen, damit sich nichts überlappt (geprüft vorher und nachher)
  const crowd = ids.length > 10;
  const gap = crowd ? 34 : 50, cols = crowd ? 8 : 3, colStep = crowd ? 38 : 110, mX = colX + colW + 20;
  const placement = useMemo(() => {
    const map = new Map<string, number>();
    const used: { yb: number; yf: number }[][] = Array.from({ length: cols }, () => []);
    const list = ids.filter((id) => b(id) > 0 || e(id) !== 0).sort((x, z) => b(x) + e(x) - (b(z) + e(z)));
    list.forEach((id, k) => {
      const yb = y(b(id), topBase), yf = y(b(id) + e(id), topFinal);
      const dist = (c: { yb: number; yf: number }[]) => Math.min(Infinity, ...c.map((o) => Math.min(Math.abs(o.yb - yb), Math.abs(o.yf - yf))));
      let col = used.findIndex((c) => dist(c) >= gap);
      // kein Platz: die Spalte, in der am meisten Abstand bleibt
      if (col < 0) col = used.reduce((best, c, i) => (dist(c) > dist(used[best]) ? i : best), k % cols);
      used[col].push({ yb, yf });
      map.set(id, col);
    });
    return map;
  }, [r]); // eslint-disable-line react-hooks/exhaustive-deps

  const zoneRects = (opacity: number) => ZONES.map((z, i) => {
    const from = i ? ZONES[i - 1].to * unit : 0;
    const to = Math.min(z.to * unit, top * 1.2);
    if (from >= top) return null;
    return <rect key={i} x={colX} width={colW} y={y(to)} height={Math.max(0, y(from) - y(to))} fill={z.c} opacity={opacity} />;
  });
  const bustedIds = ids.filter((id) => !(b(id) > 0) && !(e(id) < 0 && ef > 0));

  return (
    <div style={{ position: 'relative', width: W, height: H, flexShrink: 0, animation: dead ? 'upShake .5s ease-out' : undefined }}>
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0, overflow: 'visible' }} aria-hidden="true">
        <defs>
          <clipPath id="cr-col"><rect x={colX} y={topY} width={colW} height={px} rx={colW / 2} /></clipPath>
          <clipPath id="cr-fill"><rect x={colX - 2} y={headY} width={colW + 4} height={Math.max(0, bottom - headY)} /></clipPath>
        </defs>
        {ticks.map(({ v, op, labelOp }) => {
          const ty = y(v);
          const fade = Math.max(0, Math.min(1, (ty - topY) / 40));
          return (
            <g key={v} opacity={fade}>
              <line x1={colX - 6} x2={W} y1={ty} y2={ty} stroke="#262048" strokeWidth={1} opacity={op} />
              {labelOp > 0 && <text x={colX - 12} y={ty + 5} textAnchor="end" fontSize={14} fontWeight={700} fill="#8F88B8" opacity={labelOp} fontFamily="DM Sans, sans-serif">{v.toLocaleString(LOCALE)}</text>}
            </g>
          );
        })}
        <g clipPath="url(#cr-col)">
          <rect x={colX} y={topY} width={colW} height={px} fill={dead ? '#2A2640' : '#1C1738'} />
          {!dead && zoneRects(0.16)}
          {!dead && <g clipPath="url(#cr-fill)">{zoneRects(1)}</g>}
          {!dead && colVal > 0 && <rect x={colX} y={headY - 2} width={colW} height={4} fill="#fff" opacity={0.9} />}
        </g>
        {dead && (
          <text x={colX + colW / 2} y={(topY + bottom) / 2} textAnchor="middle" fontSize={40} fontWeight={900} fill="#6E66A0" letterSpacing="3" transform={`rotate(-90 ${colX + colW / 2} ${(topY + bottom) / 2})`} dominantBaseline="middle" fontFamily="Bricolage Grotesque, sans-serif">{t('tally.allBusted')}</text>
        )}
        {/* Wo der 100er-Topf aufgehört hat */}
        {!dead && ef > 0 && Math.abs(colVal - baseMax) > 1 && (
          <line x1={colX - 4} x2={colX + colW + 4} y1={y(baseMax)} y2={y(baseMax)} stroke="#15102E" strokeWidth={3} strokeDasharray="6 4" />
        )}
        {/* Spuren der Einsätze: grün nach oben, rot nach unten */}
        {ef > 0 && ids.map((id) => {
          const col = placement.get(id);
          if (col == null || e(id) === 0) return null;
          const cx = mX + col * colStep + 17;
          return <line key={id} x1={cx} x2={cx} y1={y(b(id))} y2={y(valOf(id))} stroke={e(id) > 0 ? '#3DDC84' : '#FF3B4E'} strokeWidth={3} strokeDasharray="5 4" opacity={1 - flow(id) * 0.85} />;
        })}
        {!dead && colVal > 0 && (
          <text x={colX + colW / 2} y={headY - 14} textAnchor="middle" fontSize={24} fontWeight={800} fill="#fff" stroke="#110D24" strokeWidth={7} paintOrder="stroke" fontFamily="Bricolage Grotesque, sans-serif">{Math.round(colVal).toLocaleString(LOCALE)}</text>
        )}
      </svg>

      {/* Marker der Spieler */}
      {ids.map((id) => {
        const p = player(id);
        const col = placement.get(id);
        if (!p || col == null) return null;
        if (at.stage === 'fill' && (b(id) <= 0 || b(id) > colVal + 0.5)) return null;
        if (b(id) <= 0 && ef === 0) return null;
        const v = valOf(id);
        const ex = e(id);
        const isLast = r.last?.includes(id);
        const betExtra = ex - (isLast ? r.lastBonus ?? 0 : 0);
        return (
          <div key={id} style={{
            position: 'absolute', left: mX + col * colStep, top: y(v) - 17, display: 'flex', alignItems: 'flex-start', gap: 6, zIndex: 2,
            animation: 'upPop .35s ease-out both', opacity: (b(id) + ex <= 0 && ef === 1 ? 0.6 : 1) * (1 - flow(id) * 0.85), transform: `translateX(${-flow(id) * 40}px)`,
          }}>
            <Avatar player={p} size={34} />
            {!crowd && (
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.05, gap: 2 }}>
                <b className="display" style={{ fontSize: 16, background: '#110D24', padding: '2px 7px', borderRadius: 8, fontVariantNumeric: 'tabular-nums' }}>{Math.round(b(id) + ex * ef).toLocaleString(LOCALE)}</b>
                {ex !== 0 && ef > 0 && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, animation: 'upPop .35s ease-out both', background: '#110D24', borderRadius: 8, paddingRight: 5 }}>
                    <b style={{ fontSize: 13, padding: '1px 6px', borderRadius: 8, background: ex > 0 ? 'var(--green)' : '#FF3B4E', color: ex > 0 ? '#110D24' : '#fff' }}>{ex > 0 ? '+' : '−'}{Math.abs(ex).toLocaleString(LOCALE)}</b>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                      {[betExtra !== 0 ? `${r.pct?.[id] ?? 0} %` : null, isLast ? t('tally.last') : null].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                )}
              </span>
            )}
          </div>
        );
      })}
      {at.progress >= 1 && bustedIds.length > 0 && !dead && (
        <div style={{ position: 'absolute', left: mX, top: H + 2, display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', animation: 'upFade .4s both' }}>
          {bustedIds.slice(0, 10).map((id) => {
            const p = player(id);
            return p ? <span key={id} style={{ filter: 'grayscale(1)', opacity: 0.6 }}><Avatar player={p} size={26} /></span> : null;
          })}
          <span style={{ fontSize: 14, fontWeight: 800, color: '#FF3B4E' }}>{t('tally.busted')}</span>
        </div>
      )}
    </div>
  );
}

const easeOut = (x: number) => 1 - Math.pow(1 - x, 2.2);

/* ================= Handy ================= */

/** Kurs fällt stark: Handy brummt kurz */
function FallBuzz({ fall }: { fall: number }) {
  const last = useRef(0);
  useEffect(() => {
    if (fall < 0.55 || Date.now() - last.current < 700) return;
    last.current = Date.now();
    vibrate(Math.round(30 + fall * 60));
  }, [fall]);
  return null;
}

/** Einsatz wählen: drei schmale Knöpfe oben, „+0 %“ breit darunter */
function BetPicker({ view, t, send, now }: { view: any; t: Translate; send: (a: any) => void; now: number }) {
  const s = Math.max(0, Math.ceil((view.startAt - now) / 1000));
  const opts = view.options as { pct: number; amount: number }[];
  const btn = (o: { pct: number; amount: number }, wide = false) => {
    const sel = view.bet === o.pct;
    const disabled = o.pct > 0 && o.amount <= 0;
    return (
      <button key={o.pct} type="button" disabled={disabled} aria-pressed={sel} onClick={() => send({ type: 'bet', pct: o.pct })}
        style={{
          gridColumn: wide ? '1 / 4' : undefined, minHeight: wide ? 76 : 96, border: 0, borderRadius: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
          background: sel ? (o.pct ? '#FFD447' : '#fff') : 'var(--surface-2)', color: sel ? '#110D24' : '#fff', opacity: disabled ? 0.4 : 1,
          boxShadow: sel ? `0 0 0 3px #fff, 0 6px 0 ${o.pct ? '#C79E1A' : '#8F88B8'}` : '0 5px 0 #0A0716', transition: 'transform .1s', transform: sel ? 'translateY(-2px)' : undefined,
        }}>
        <span className="display" style={{ fontSize: wide ? 30 : o.pct >= 100 ? 23 : 27, fontWeight: 800, whiteSpace: 'nowrap' }}>+{o.pct}&nbsp;%</span>
        <span style={{ fontSize: 14, fontWeight: 700, opacity: 0.85 }}>{o.pct ? `${o.amount.toLocaleString(LOCALE)}` : t('bet.free')}</span>
      </button>
    );
  };
  const chosen = opts.find((o) => o.pct === view.bet) ?? opts[0];
  const remind = !view.picked;
  useEffect(() => {
    if (remind) vibrate([60, 80, 60]);
  }, [view.round]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {remind && <div aria-hidden="true" style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 50, boxShadow: 'inset 0 0 0 7px #FFD447, inset 0 0 50px 14px rgba(255,212,71,.55)', animation: 'upVignette 1s ease-in-out infinite' }} />}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <span className="muted" style={{ fontSize: 14, fontWeight: 700 }}>{t('bet.money')}</span>
          <div className="display" style={{ fontSize: 30, fontWeight: 800 }}>{view.money.toLocaleString(LOCALE)}</div>
        </div>
        <span key={s} className="display anim-pop" style={{ fontSize: 56, fontWeight: 800, color: s <= 2 ? '#FF3B4E' : '#fff' }}>{s || '…'}</span>
      </div>
      {view.mult > 1 && <span className="up-tag" style={{ alignSelf: 'flex-start', background: 'var(--yellow)', color: '#110D24' }}>{t('double')}</span>}
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h2 style={{ fontSize: 24, color: remind ? 'var(--yellow)' : undefined }}>{remind ? t('bet.pickNow') : t('bet.title')}</h2>
        <p className="muted" style={{ fontSize: 15 }}>{t('bet.text')}</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
        {opts.filter((o) => o.pct > 0).map((o) => btn(o))}
        {btn(opts[0], true)}
      </div>
      <p style={{ textAlign: 'center', fontWeight: 700 }}>{t('bet.pot', { pot: (100 + chosen.amount).toLocaleString(LOCALE) })}</p>
    </div>
  );
}

function Controller({ view, t, send, me, room }: ControllerViewProps) {
  LOCALE = room.lang === 'de' ? 'de-DE' : 'en-US';
  const now = useServerNow(50);
  const lang = room.lang;
  switch (view.screen) {
    case 'intro':
      return <PhoneWait title={t('title')} text={t('lookAtTv')} emoji={<Avatar player={me} size={96} />} />;
    case 'ready':
      return <BetPicker view={view} t={t} send={send} now={now} />;
    case 'run': {
      if (view.cashed != null) {
        return <PhoneWait title={t('phone.cashed', { m: fmt(view.cashed, lang) })} text={t('phone.cashedPot', { n: Math.round(view.pot * view.cashed * view.mult).toLocaleString(LOCALE) })} emoji={<Avatar player={me} size={96} />} />;
      }
      const sec = (now - view.startAt) / 1000;
      const m = multAt(view.seed, sec);
      const fall = fallAt(view.seed, sec);
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
          <FallBuzz fall={fall} />
          <span className="display" style={{ fontSize: 56 + fall * 10, fontWeight: 800, color: fall > 0.2 ? FALL : multColor(m), fontVariantNumeric: 'tabular-nums', transform: fall > 0.2 ? `translateX(${(Math.sin(now / 20) * fall * 5).toFixed(1)}px)` : undefined }}>{fmt(m, lang)}{fall > 0.2 ? ' ▼' : ''}</span>
          <button type="button" onPointerDown={(e) => { e.preventDefault(); vibrate(30); send({ type: 'cash' }); }}
            style={{ width: 280, height: 280, borderRadius: '50%', border: 0, background: PINK, color: '#fff', boxShadow: `0 10px 0 ${PINK_D}, 0 0 40px ${PINK}88`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, touchAction: 'manipulation' }}>
            <span className="display" style={{ fontSize: 34, fontWeight: 800 }}>{t('phone.cash')}</span>
            <span className="display" style={{ fontSize: 28, fontWeight: 800, color: '#FFD447' }}>+{Math.floor(view.pot * m * view.mult).toLocaleString(LOCALE)}</span>
          </button>
          <p className="muted" style={{ textAlign: 'center' }}>{view.stake > 0 ? t('phone.pot', { pot: view.pot, stake: view.stake }) : t('phone.hint')}</p>
        </div>
      );
    }
    case 'crashed':
      return (
        <div className="anim-fade" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, textAlign: 'center' }}>
          {view.m != null && <Confetti pieces={12} />}
          <Avatar player={me} size={100} />
          <h1 style={{ fontSize: 30 }}>{view.m != null ? t('phone.safe', { m: fmt(view.m, lang) }) : t('phone.busted', { m: fmt(view.crashAt, lang) })}</h1>
          <span className="display" style={{ fontSize: 56, fontWeight: 800, color: view.gain >= 0 ? 'var(--yellow)' : '#FF3B4E' }}>{view.gain >= 0 ? '+' : ''}{view.gain.toLocaleString(LOCALE)}</span>
          {view.bonus > 0 && <span className="up-tag anim-pop" style={{ background: 'var(--yellow)', color: '#110D24', fontSize: 20 }}>{t('phone.lastBonus', { n: view.bonus })}</span>}
          {view.stake > 0 && <p style={{ fontWeight: 700 }}>{view.m != null ? t('phone.potWon', { pot: view.pot }) : t('phone.stakeLost', { stake: view.stake })}</p>}
          <p className="muted">{t('phone.total', { n: view.total.toLocaleString(LOCALE) })}</p>
        </div>
      );
    case 'tallyWait':
      return <PhoneWait title={t('tally.title')} text={t('lookAtTv')} emoji={<Avatar player={me} size={110} />} />;
    case 'finalMe':
      return <PhoneWait title={t('me.place', { place: view.place, of: view.of })} text={`${t('me.score', { n: view.score.toLocaleString(LOCALE) })} · ${t('tally.extraShort', { n: (view.extra >= 0 ? '+' : '') + view.extra.toLocaleString(LOCALE) })}`} emoji={<Avatar player={me} size={110} />} />;
    default:
      return <PhoneWait title={t('lookAtTv')} emoji={<Avatar player={me} size={96} />} />;
  }
}

export default { Host, Controller } satisfies GameClientModule;
