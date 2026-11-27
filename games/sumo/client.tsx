import { useEffect, useRef, useState, type SVGProps } from 'react';
import type { ControllerViewProps, GameClientModule, HostViewProps, PlayerInfo } from '@up/sdk';
import { Avatar, Confetti, Crown, HostHeader, Joystick, PhoneWait, Podium, Scoreboard, sfx, useServerNow, useStream, vibrate } from '@up/ui';

const MINT = '#36F5C8';
const MINT_D = '#1BA884';

interface Frame { round: number; R: number; t: number; b: [number, number, number][]; hit: number; fell: string[] }

/* ================= TV ================= */

function Host(props: HostViewProps) {
  const { view, t, player } = props;
  switch (view.screen) {
    case 'intro':
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28, textAlign: 'center' }}>
          <span className="up-tag anim-pop" style={{ background: MINT, color: '#110D24', boxShadow: `0 8px 0 ${MINT_D}`, fontSize: 96, padding: '12px 46px', borderRadius: 26, transform: 'rotate(-3deg)' }}>{t('title')}</span>
          <p className="anim-up" style={{ fontSize: 28, maxWidth: 900, lineHeight: 1.35, animationDelay: '.4s' }}>{t('intro.text')}</p>
          <p className="muted anim-up" style={{ fontSize: 22, animationDelay: '.8s' }}>{t('intro.points')}</p>
        </div>
      );
    case 'arena':
    case 'roundEnd':
      return <HostArena {...props} />;
    case 'scores': {
      const rows = Object.keys(view.after).map((id) => ({ player: player(id)!, before: view.before[id] ?? 0, after: view.after[id] })).filter((r) => r.player);
      return (
        <>
          <HostHeader title={t('title')} color={MINT} info={t('round', { n: view.round, total: view.total })} />
          <h1 style={{ fontSize: 36 }}>{t('scores.title')}</h1>
          <Scoreboard rows={rows} />
        </>
      );
    }
    case 'final':
      return (
        <>
          <HostHeader title={t('title')} color={MINT} info={t('final.title')} />
          <Podium ranking={view.ranking} player={player} pointsLabel={t('common.points')} />
        </>
      );
  }
  return null;
}

/** Plattform in der passenden Form zeichnen (gleiche Maße wie onPlatform auf dem Server) */
function PlatformShape({ shape, cx, cy, R, ...rest }: { shape: string; cx: number; cy: number; R: number } & SVGProps<SVGPathElement>) {
  let d: string;
  if (shape === 'quadrat') {
    const s = R * 0.886;
    d = `M${cx - s} ${cy - s}H${cx + s}V${cy + s}H${cx - s}Z`;
  } else if (shape === 'raute') {
    const s = R * 1.25;
    d = `M${cx} ${cy - s}L${cx + s} ${cy}L${cx} ${cy + s}L${cx - s} ${cy}Z`;
  } else {
    const circle = (r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
    d = circle(R) + (shape === 'ring' ? circle(R * 0.3) : '');
  }
  return <path d={d} fillRule="evenodd" {...rest} />;
}

function HostArena({ view, t, player }: HostViewProps) {
  const frame = useStream<Frame>();
  const now = useServerNow(200);
  const ids = view.ids as string[];
  const fr = frame && frame.round === view.round && frame.b.length === ids.length ? frame : null;
  // Raute ragt weiter hinaus – etwas kleiner zeichnen
  const scale = Math.min(1.6, 262 / (view.R0 * (view.shape === 'raute' ? 1.25 : 1)));
  const R = (fr?.R ?? view.R0) * scale;
  const size = view.r * 2 * scale;
  const W = 1224, H = 600, cx = W / 2 - 120, cy = 292;

  // Wann ist wer runtergefallen? (für die Fall-Animation)
  const fellAt = useRef(new Map<string, number>());
  const lastDash = useRef<number[]>([]);
  const lastHitSound = useRef(0);
  useEffect(() => {
    if (!fr) return;
    const n = performance.now();
    if (fr.round !== (lastDash.current as any).round) {
      fellAt.current.clear();
      (lastDash.current as any).round = fr.round;
    }
    for (const id of fr.fell) if (!fellAt.current.has(id)) {
      fellAt.current.set(id, n);
      sfx.custom((s) => {
        s.tone(700, 0.7, { type: 'sine', vol: 0.18, to: 120 });
        s.noise(0.2, { filter: 200, type: 'lowpass', vol: 0.3, at: 0.6 });
      });
    }
    if (fr.hit > 220 && n - lastHitSound.current > 70) {
      lastHitSound.current = n;
      const v = Math.min(0.5, fr.hit / 1400);
      sfx.custom((s) => {
        s.tone(160, 0.12, { type: 'sine', vol: v, to: 70 });
        s.noise(0.08, { filter: 900, vol: v * 0.6 });
      });
    }
    fr.b.forEach(([, , f], i) => {
      if (f & 1 && !(lastDash.current[i] & 1)) sfx.custom((s) => s.noise(0.22, { filter: 600, sweepTo: 3000, vol: 0.08 }));
      lastDash.current[i] = f;
    });
  }, [fr]);

  const startAt = view.startAt as number | undefined;
  const count = startAt && now < startAt ? Math.ceil((startAt - now) / 1000) : 0;
  const ended = view.screen === 'roundEnd';
  const winners = ((view.winners ?? []) as string[]).map((id) => player(id)).filter(Boolean) as PlayerInfo[];
  const alive = ids.length - (view.out as string[]).length;

  return (
    <>
      <HostHeader title={t('title')} color={MINT} info={t('round', { n: view.round, total: view.total })}
        right={<span className="up-chip" style={{ fontSize: 17 }}>{t('alive', { n: alive, total: ids.length })}</span>} />
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }} aria-hidden="true">
          <defs>
            <radialGradient id="sumo-floor" cx=".5" cy=".5" r=".5">
              <stop offset="0" stopColor="#2A2160" />
              <stop offset=".85" stopColor="#1C1640" />
              <stop offset="1" stopColor="#3A2F80" />
            </radialGradient>
          </defs>
          <PlatformShape shape={view.shape ?? 'kreis'} cx={cx} cy={cy} R={view.R0 * scale} fill="none" stroke="#2A2350" strokeWidth={3} strokeDasharray="10 10" />
          <PlatformShape shape={view.shape ?? 'kreis'} cx={cx} cy={cy} R={R} fill="url(#sumo-floor)" stroke={MINT} strokeWidth={6} style={{ filter: `drop-shadow(0 0 16px ${MINT})` }} />
          {(view.shape ?? 'kreis') !== 'ring' && <circle cx={cx} cy={cy} r={R * 0.08} fill="none" stroke="#4A4378" strokeWidth={3} />}
        </svg>
        {fr && ids.map((id, i) => {
          const p = player(id);
          if (!p) return null;
          const [x, y, f] = fr.b[i];
          const dashing = f & 1;
          const out = f & 2;
          const fell = fellAt.current.get(id);
          if (out && (!fell || performance.now() - fell > 1000)) return null;
          return (
            <div key={id} style={{
              position: 'absolute', left: 0, top: 0, width: size, height: size, borderRadius: '50%',
              transform: `translate(${cx + x * scale - size / 2}px, ${cy + y * scale - size / 2}px)`,
              transition: out ? 'transform .9s ease-in' : 'transform 34ms linear',
              boxShadow: `0 0 0 ${Math.max(2, size * 0.08)}px ${p.color}${dashing ? `, 0 0 ${size * 0.7}px ${p.color}` : ''}`,
              animation: out ? 'sumoFall .9s ease-in forwards' : undefined, zIndex: out ? 0 : 2,
            }}>
              <Avatar player={p} size={size} />
              {ids.length <= 16 && !out && <span style={{ position: 'absolute', top: size + 2, left: '50%', transform: 'translateX(-50%)', fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap', textShadow: '0 1px 3px #000' }}>{p.name}</span>}
            </div>
          );
        })}
        <style>{'@keyframes sumoFall { to { opacity: 0; scale: .2; rotate: 260deg; } }'}</style>

        {/* Seite: wer ist raus, wer hat geschubst */}
        <aside className="up-card" style={{ position: 'absolute', right: 0, top: 10, width: 230, padding: 14, borderRadius: 22, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <b style={{ fontSize: 16 }}>{t('side.out')}</b>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {(view.out as string[]).slice(-24).map((id) => {
              const p = player(id);
              return p ? <span key={id} style={{ filter: 'grayscale(1)', opacity: 0.6 }}><Avatar player={p} size={30} /></span> : null;
            })}
          </div>
          {Object.keys(view.kos).length > 0 && (
            <>
              <b style={{ fontSize: 16, marginTop: 6 }}>{t('side.kos')}</b>
              {Object.entries(view.kos as Record<string, number>).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, n]) => {
                const p = player(id);
                return p ? <span key={id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Avatar player={p} size={26} /><b style={{ flex: 1, fontSize: 14 }}>{p.name}</b><b style={{ color: MINT }}>{n}×</b></span> : null;
              })}
            </>
          )}
        </aside>

        {count > 0 && (
          <div style={{ position: 'absolute', left: cx, top: cy, transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
            <span key={count} className="display anim-pop" style={{ fontSize: 160, fontWeight: 800, textShadow: '0 8px 0 rgba(0,0,0,.5)' }}>{count}</span>
          </div>
        )}
        {ended && (
          <div className="up-card anim-pop" style={{ position: 'absolute', left: cx, top: cy, transform: 'translate(-50%, -50%)', padding: '26px 36px', borderRadius: 30, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, boxShadow: '0 20px 60px rgba(0,0,0,.6)' }}>
            <Confetti silent />
            {winners.length === 1 ? (
              <>
                <span style={{ position: 'relative' }}><Avatar player={winners[0]} size={110} /><Crown size={50} style={{ position: 'absolute', top: -34, left: 30 }} /></span>
                <h1 style={{ fontSize: 40 }}>{t('win', { name: winners[0].name })}</h1>
                <b className="display" style={{ fontSize: 30, color: 'var(--yellow)' }}>+300</b>
              </>
            ) : (
              <h1 style={{ fontSize: 40 }}>{winners.length ? t('timeUp', { n: winners.length }) : t('nobody')}</h1>
            )}
          </div>
        )}
      </div>
    </>
  );
}

/* ================= Handy ================= */

function Controller({ view, t, send, me }: ControllerViewProps) {
  const now = useServerNow(200);
  const [cooldown, setCooldown] = useState(0);
  const move = useRef((x: number, y: number) => send({ type: 'input', x, y }));
  move.current = (x: number, y: number) => send({ type: 'input', x, y });
  const onMove = useRef((x: number, y: number) => move.current(x, y)).current;
  switch (view.screen) {
    case 'intro':
      return <PhoneWait title={t('title')} text={t('lookAtTv')} emoji={<Avatar player={me} size={96} />} />;
    case 'play': {
      const count = view.startAt && now < view.startAt ? Math.ceil((view.startAt - now) / 1000) : 0;
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ borderRadius: '50%', boxShadow: `0 0 0 4px ${view.color}` }}><Avatar player={me} size={52} /></span>
            <div>
              <b style={{ fontSize: 18 }}>{t('phone.you')}</b>
              <p className="muted" style={{ fontSize: 14 }}>{t('round', { n: view.round, total: view.total })}</p>
            </div>
            {count > 0 && <span className="display" style={{ marginLeft: 'auto', fontSize: 44, fontWeight: 800 }}>{count}</span>}
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 22, opacity: view.live ? 1 : 0.5 }}>
            <Joystick onMove={onMove} color={view.color} size={230} zoneStyle={{ width: '100%', height: 310, alignSelf: 'stretch' }} />
            <button type="button" disabled={!view.live || Date.now() < cooldown}
              onPointerDown={(e) => { e.preventDefault(); vibrate(40); send({ type: 'dash' }); setCooldown(Date.now() + 2200); setTimeout(() => setCooldown(0), 2250); }}
              style={{ minHeight: 96, border: 0, borderRadius: 26, background: Date.now() < cooldown ? '#262048' : MINT, color: '#110D24', fontFamily: 'var(--display)', fontSize: 30, fontWeight: 800, boxShadow: Date.now() < cooldown ? undefined : `0 7px 0 ${MINT_D}`, touchAction: 'manipulation' }}>
              {t('phone.dash')}
            </button>
          </div>
        </div>
      );
    }
    case 'out':
      return <PhoneWait title={t('phone.out')} text={view.by ? t('phone.by', { name: view.by }) : t('phone.place', { n: view.place })} emoji={<Avatar player={me} size={96} dim />} />;
    case 'roundEnd':
      return (
        <div className="anim-fade" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, textAlign: 'center' }}>
          {view.won && <Confetti pieces={14} />}
          <Avatar player={me} size={100} />
          <h1 style={{ fontSize: 28 }}>{view.won ? t('phone.won') : t('phone.roundOver')}</h1>
          {view.kos > 0 && <p style={{ fontSize: 18 }}>{t('phone.kos', { n: view.kos })}</p>}
          <p className="muted">{t('me.score', { n: view.score })}</p>
        </div>
      );
    case 'finalMe':
      return <PhoneWait title={t('me.place', { place: view.place, of: view.of })} text={t('me.score', { n: view.score })} emoji={<Avatar player={me} size={110} />} />;
    default:
      return <PhoneWait title={t('lookAtTv')} emoji={<Avatar player={me} size={96} />} />;
  }
}

export default { Host, Controller } satisfies GameClientModule;
