import { useEffect, useRef } from 'react';
import type { ControllerViewProps, GameClientModule, HostViewProps, PlayerInfo, Translate } from '@up/sdk';
import { Avatar, Confetti, HostHeader, PhoneWait, Podium, Scoreboard, sfx, useServerNow, vibrate } from '@up/ui';
import { floor2, multAt, timeFor } from './curve';

const PINK = '#FF4F7B';
const PINK_D = '#B8274E';

const fmt = (m: number, lang: string) => `${floor2(m).toLocaleString(lang === 'de' ? 'de-DE' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`;
const multColor = (m: number) => (m < 1.5 ? '#FFFFFF' : m < 3 ? '#FFD447' : m < 8 ? '#FF9F43' : '#FF4F7B');

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
    case 'scores': {
      const rows = Object.keys(view.after).map((id) => ({ player: player(id)!, before: view.before[id] ?? 0, after: view.after[id] })).filter((r) => r.player);
      return (
        <>
          <HostHeader title={t('title')} color={PINK} info={t('scores.title')} />
          <h1 style={{ fontSize: 36 }}>{t('scores.title')}</h1>
          <Scoreboard rows={rows} />
        </>
      );
    }
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
  const now = useServerNow(40);
  const tNow = crashed ? timeFor(view.allOut ? lastCash(view) : view.crashAt) : Math.max(0, (now - view.startAt) / 1000);
  const m = crashed ? (view.allOut ? lastCash(view) : view.crashAt) : multAt(tNow);
  const tEnd = crashed && view.allOut ? timeFor(view.crashAt) : tNow;
  const tMax = Math.max(8, tEnd * 1.12);
  const mMax = Math.max(2, (crashed ? view.crashAt : m) * 1.2);
  const W = 860, H = 470, PAD = 48;
  const X = (s: number) => PAD + (s / tMax) * (W - PAD - 20);
  const Y = (x: number) => H - PAD - ((x - 1) / (mMax - 1)) * (H - PAD - 20);
  const path = (to: number, from = 0) => Array.from({ length: 81 }, (_, i) => from + ((to - from) * i) / 80).map((s, i) => `${i ? 'L' : 'M'}${X(s).toFixed(1)} ${Y(multAt(s)).toFixed(1)}`).join(' ');
  const cashed = view.cashed as { id: string; m: number; points?: number }[];
  const sorted = [...cashed].sort((a, b) => b.m - a.m);
  const inIds = (view.players as string[]).filter((id) => !cashed.some((c) => c.id === id));
  const many = view.players.length > 12;

  // Sounds: steigender Puls, Klingeln beim Aussteigen, Knall beim Crash
  const lastBlip = useRef(0);
  useEffect(() => {
    if (crashed || now - lastBlip.current < 260) return;
    lastBlip.current = now;
    sfx.custom((s) => s.tone(200 * Math.sqrt(m), 0.07, { type: 'square', vol: 0.05 }));
  }, [now, crashed, m]);
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
      s.tone(120, 0.8, { type: 'sawtooth', vol: 0.25, to: 30 });
    });
  }, [crashed, view.allOut]);

  const tipX = X(tNow), tipY = Y(m);
  return (
    <>
      {crashed && view.allOut && <Confetti silent />}
      <HostHeader title={t('title')} color={PINK} info={info(view, t)} />
      <div style={{ flex: 1, display: 'flex', gap: 20, minHeight: 0, animation: crashed && !view.allOut ? 'upShake .5s ease-out' : undefined }}>
        <div style={{ position: 'relative', width: W, height: H, background: '#15102E', borderRadius: 26, overflow: 'hidden' }}>
          <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }} aria-hidden="true">
            <defs>
              <linearGradient id="cr-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={crashed && !view.allOut ? '#FF3B4E' : multColor(m)} stopOpacity=".35" /><stop offset="1" stopColor="#15102E" stopOpacity="0" /></linearGradient>
            </defs>
            {[1, 2, 3, 5, 10, 20, 50].filter((v) => v < mMax).map((v) => (
              <g key={v}>
                <line x1={PAD} x2={W - 20} y1={Y(v)} y2={Y(v)} stroke="#262048" />
                <text x={PAD - 8} y={Y(v) + 5} textAnchor="end" fontSize={14} fontWeight={700} fill="#8F88B8" fontFamily="DM Sans, sans-serif">{v}×</text>
              </g>
            ))}
            <path d={`${path(tNow)} L${tipX} ${H - PAD} L${X(0)} ${H - PAD} Z`} fill="url(#cr-fill)" />
            <path d={path(tNow)} fill="none" stroke={crashed && !view.allOut ? '#FF3B4E' : multColor(m)} strokeWidth={6} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 8px ${multColor(m)})` }} />
            {crashed && view.allOut && <path d={path(tEnd, tNow)} fill="none" stroke="#8F88B8" strokeWidth={4} strokeDasharray="8 8" />}
            {crashed && !view.allOut ? (
              <g transform={`translate(${tipX} ${tipY})`}>
                <polygon points="0,-44 12,-14 42,-20 20,4 34,34 4,20 -18,42 -16,10 -44,0 -14,-12" fill="#FF9F43" style={{ filter: 'drop-shadow(0 0 20px #FF3B4E)', animation: 'upPop .4s ease-out both' }} />
                <circle r={14} fill="#FFD447" />
              </g>
            ) : !crashed ? (
              <circle cx={tipX} cy={tipY} r={11} fill="#fff" style={{ filter: `drop-shadow(0 0 14px ${multColor(m)})` }} />
            ) : (
              <circle cx={X(tEnd)} cy={Y(view.crashAt)} r={10} fill="#8F88B8" />
            )}
          </svg>
          {/* Ausgestiegene auf der Kurve */}
          {!many && cashed.map((c) => {
            const p = player(c.id);
            if (!p) return null;
            return (
              <div key={c.id} className="anim-pop" style={{ position: 'absolute', left: X(timeFor(c.m)), top: Y(c.m), transform: 'translate(-50%, -115%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <Avatar player={p} size={36} />
                <span style={{ background: '#110D24', borderRadius: 8, padding: '0 6px', fontSize: 13, fontWeight: 800, color: multColor(c.m) }}>{fmt(c.m, lang)}</span>
              </div>
            );
          })}
          <div style={{ position: 'absolute', left: PAD + 16, top: 18, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="display" style={{ fontSize: 84, fontWeight: 800, lineHeight: 1, color: crashed && !view.allOut ? '#FF3B4E' : multColor(m), fontVariantNumeric: 'tabular-nums', textShadow: '0 6px 0 rgba(0,0,0,.35)' }}>
              {crashed && !view.allOut ? t('crash.at', { m: fmt(view.crashAt, lang) }) : fmt(m, lang)}
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
                return p ? <span key={id} style={{ position: 'relative', filter: crashed ? 'grayscale(1)' : undefined, opacity: crashed ? 0.6 : 1, animation: crashed ? undefined : 'upFloat 1.6s ease-in-out infinite' }}><Avatar player={p} size={many ? 28 : 40} />{crashed && <span style={{ position: 'absolute', right: -4, bottom: -4, fontSize: 16, color: '#FF3B4E', fontWeight: 900 }}>✖</span>}</span> : null;
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
                    {c.points != null && <b style={{ fontSize: 15, color: 'var(--yellow)', width: 56, textAlign: 'right' }}>+{c.points}</b>}
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

function lastCash(view: any) {
  return Math.max(1, ...(view.cashed as { m: number }[]).map((c) => c.m));
}

/* ================= Handy ================= */

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
      const m = multAt((now - view.startAt) / 1000);
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
          <span className="display" style={{ fontSize: 56, fontWeight: 800, color: multColor(m), fontVariantNumeric: 'tabular-nums' }}>{fmt(m, lang)}</span>
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
    case 'scoresMe':
    case 'finalMe':
      return <PhoneWait title={t('me.place', { place: view.place, of: view.of })} text={t('me.score', { n: view.score })} emoji={<Avatar player={me} size={110} />} />;
    default:
      return <PhoneWait title={t('lookAtTv')} emoji={<Avatar player={me} size={96} />} />;
  }
}

export default { Host, Controller } satisfies GameClientModule;
