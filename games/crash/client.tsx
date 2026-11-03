import { useEffect, useRef } from 'react';
import type { ControllerViewProps, GameClientModule, HostViewProps, PlayerInfo, Translate } from '@up/sdk';
import { Avatar, Confetti, HostHeader, PhoneWait, Podium, sfx, useServerNow, vibrate } from '@up/ui';
import { STEP, fallAt, floor2, multAt } from './curve';

const PINK = '#FF4F7B';
const PINK_D = '#B8274E';

const fmt = (m: number, lang: string) => `${floor2(m).toLocaleString(lang === 'de' ? 'de-DE' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`;
const multColor = (m: number) => (m < 1 ? '#FF8A8E' : m < 1.5 ? '#FFFFFF' : m < 3 ? '#FFD447' : m < 8 ? '#FF9F43' : '#FF4F7B');
const FALL = '#FF3B4E';
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
  const { view, t, player } = props;
  switch (view.screen) {
    case 'intro':
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28, textAlign: 'center' }}>
          <span className="up-tag anim-pop" style={{ background: PINK, color: '#fff', boxShadow: `0 8px 0 ${PINK_D}`, fontSize: 90, padding: '12px 46px', borderRadius: 26, transform: 'rotate(-3deg)' }}>{t('title')}</span>
          <p className="anim-up" style={{ fontSize: 28, maxWidth: 900, lineHeight: 1.35, animationDelay: '.4s' }}>{t('intro.text')}</p>
          <p className="muted anim-up" style={{ fontSize: 22, animationDelay: '.8s' }}>{t('intro.points')}</p>
        </div>
      );
    case 'ready':
      return <HostReady {...props} />;
    case 'run':
    case 'crash':
      return <HostGraph {...props} />;
    case 'final':
      return (
        <>
          <HostHeader title={t('title')} color={PINK} info={t('final.title')} right={view.best ? <span className="up-chip" style={{ fontSize: 16 }}>{t('final.best', { name: player(view.best.id)?.name ?? '?', m: fmt(view.best.m, props.room.lang) })}</span> : null} />
          <Podium ranking={view.ranking} player={player} pointsLabel={t('common.points')} />
        </>
      );
  }
  return null;
}

function HostReady({ view, t }: HostViewProps) {
  const now = useServerNow(100);
  const s = Math.max(0, Math.ceil((view.startAt - now) / 1000));
  useEffect(() => {
    if (s > 0) sfx.play('beep', { always: true });
  }, [s]);
  return (
    <>
      <HostHeader title={t('title')} color={PINK} info={info(view, t)} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        {view.mult > 1 && <span className="up-tag anim-pop" style={{ background: 'var(--yellow)', color: '#110D24', fontSize: 28 }}>{t('double')}</span>}
        <span key={s} className="display anim-pop" style={{ fontSize: 170, fontWeight: 800 }}>{s || '…'}</span>
        <p className="muted" style={{ fontSize: 26 }}>{t('ready.text')}</p>
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
  const lastT = Math.max(0, ...cashed.map((c) => c.t));
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
          </div>
        </div>

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
      </div>
    </>
  );
}

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

function Controller({ view, t, send, me, room }: ControllerViewProps) {
  const now = useServerNow(50);
  const lang = room.lang;
  switch (view.screen) {
    case 'intro':
      return <PhoneWait title={t('title')} text={t('lookAtTv')} emoji={<Avatar player={me} size={96} />} />;
    case 'ready': {
      const s = Math.max(0, Math.ceil((view.startAt - now) / 1000));
      return <PhoneWait title={t('ready.phone')} text={view.mult > 1 ? t('double') : undefined} emoji={<span className="display" style={{ fontSize: 90, fontWeight: 800 }}>{s || '…'}</span>} />;
    }
    case 'run': {
      if (view.cashed != null) {
        return <PhoneWait title={t('phone.cashed', { m: fmt(view.cashed, lang) })} text={`+${Math.round(100 * view.cashed * view.mult)}`} emoji={<Avatar player={me} size={96} />} />;
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
            <span className="display" style={{ fontSize: 28, fontWeight: 800, color: '#FFD447' }}>+{Math.floor(100 * m * view.mult)}</span>
          </button>
          <p className="muted" style={{ textAlign: 'center' }}>{t('phone.hint')}</p>
        </div>
      );
    }
    case 'crashed':
      return (
        <div className="anim-fade" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, textAlign: 'center' }}>
          {view.m != null && <Confetti pieces={12} />}
          <Avatar player={me} size={100} />
          <h1 style={{ fontSize: 30 }}>{view.m != null ? t('phone.safe', { m: fmt(view.m, lang) }) : t('phone.busted', { m: fmt(view.crashAt, lang) })}</h1>
          <span className="display" style={{ fontSize: 56, fontWeight: 800, color: view.m != null ? 'var(--yellow)' : '#FF3B4E' }}>+{view.points}</span>
          <p className="muted">{t('phone.total', { n: view.total })}</p>
        </div>
      );
    case 'finalMe':
      return <PhoneWait title={t('me.place', { place: view.place, of: view.of })} text={t('me.score', { n: view.score })} emoji={<Avatar player={me} size={110} />} />;
    default:
      return <PhoneWait title={t('lookAtTv')} emoji={<Avatar player={me} size={96} />} />;
  }
}

export default { Host, Controller } satisfies GameClientModule;
