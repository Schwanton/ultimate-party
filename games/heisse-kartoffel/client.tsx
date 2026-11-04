import { useEffect, useRef, useState } from 'react';
import type { ControllerViewProps, GameClientModule, HostViewProps, Translate } from '@up/sdk';
import { Avatar, Confetti, HostHeader, PhoneWait, Podium, sfx, useServerNow, vibrate } from '@up/ui';

const ORANGE = '#FF8A3D';
const ORANGE_D = '#B85A1C';
const TASK_COLORS = ['#FF5A5F', '#4D8DFF', '#FFD447', '#3DDC84'];
const SHAPES = [
  'M12 2a10 10 0 1 1 0 20a10 10 0 1 1 0-20z',
  'M4 4h16v16H4z',
  'M12 2 L22 21 H2 Z',
  'M12 1.5l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.7-6.2 3.7 1.6-7L2 8.7l7.1-.6z',
];

/** Ticken wird mit der Zeit schneller (ohne die geheime Zündschnur zu verraten) */
const tickInterval = (elapsed: number) => Math.max(0.18, 0.9 - elapsed * 0.025);

function Bomb({ size = 80, elapsed }: { size?: number; elapsed: number }) {
  const beat = tickInterval(elapsed);
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" style={{ animation: `upBeat ${beat}s ease-in-out infinite`, filter: 'drop-shadow(0 0 14px rgba(255,138,61,.8))' }}>
      <circle cx="28" cy="38" r="22" fill="#262048" stroke="#4A4378" strokeWidth="3" />
      <circle cx="20" cy="30" r="6" fill="#4A4378" />
      <rect x="34" y="12" width="10" height="10" rx="2" transform="rotate(35 39 17)" fill="#4A4378" />
      <path d="M42 12 C 48 4, 54 8, 56 4" fill="none" stroke="#B8B2D9" strokeWidth="3" strokeLinecap="round" />
      <circle cx="57" cy="4" r="5" fill="#FFD447" style={{ animation: 'upPulse .25s linear infinite' }} />
      <circle cx="57" cy="4" r="2.5" fill="#FF5A1F" />
    </svg>
  );
}

function Hearts({ n, max }: { n: number; max: number }) {
  if (max <= 1) return null;
  return <span style={{ fontSize: 14, letterSpacing: 1 }}>{Array.from({ length: max }, (_, i) => <span key={i} style={{ color: i < n ? '#FF5A5F' : '#4A4378' }}>♥</span>)}</span>;
}

/* ================= TV ================= */

function Host(props: HostViewProps) {
  const { view, t, player } = props;
  switch (view.screen) {
    case 'intro':
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 26, textAlign: 'center' }}>
          <span className="up-tag anim-pop" style={{ background: ORANGE, color: '#110D24', boxShadow: `0 8px 0 ${ORANGE_D}`, fontSize: 76, padding: '12px 40px', borderRadius: 26, transform: 'rotate(-3deg)' }}>{t('title')}</span>
          <Bomb size={130} elapsed={10} />
          <p className="anim-up" style={{ fontSize: 28, maxWidth: 920, lineHeight: 1.35, animationDelay: '.4s' }}>{t('intro.text')}</p>
          <p className="muted anim-up" style={{ fontSize: 22, animationDelay: '.8s' }}>{t('intro.rules')}</p>
        </div>
      );
    case 'round':
    case 'boom':
      return <HostCircle {...props} />;
    case 'final': {
      const w = view.winner ? player(view.winner) : null;
      return (
        <>
          <HostHeader title={t('title')} color={ORANGE} info={w ? t('final.winner', { name: w.name }) : t('final.title')} />
          <Podium ranking={view.ranking} player={player} pointsLabel={t('common.points')} />
        </>
      );
    }
  }
  return null;
}

function HostCircle({ view, t, player }: HostViewProps) {
  const ids = view.players as string[];
  const alive = new Set<string>(view.alive);
  const boom = view.screen === 'boom';
  const now = useServerNow(100);
  const started = now >= view.roundStart;
  const elapsed = Math.max(0, (now - view.roundStart) / 1000);
  const n = ids.length;
  const size = n <= 8 ? 96 : n <= 14 ? 76 : 60;
  const cx = 640 - 28, cy = 330, rx = 480, ry = 220;
  const posOf = (id: string) => {
    const i = ids.indexOf(id);
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
  };
  const holder = player(view.holder);
  const [hx, hy] = posOf(view.holder);

  // Ticken
  const lastTick = useRef(0);
  useEffect(() => {
    if (boom || !started) return;
    if (now - lastTick.current < tickInterval(elapsed) * 1000) return;
    lastTick.current = now;
    sfx.custom((s) => s.tone(elapsed > 15 ? 1500 : 1100, 0.04, { type: 'square', vol: 0.08 }));
  }, [now, boom, started, elapsed]);
  // Wurf und Knall
  useEffect(() => {
    if (view.passes > 0 && !boom) sfx.play('whoosh', { always: true });
  }, [view.passes, boom]);
  useEffect(() => {
    if (boom) sfx.custom((s) => {
      s.noise(1.2, { filter: 400, type: 'lowpass', vol: 0.6 });
      s.tone(90, 1, { type: 'sawtooth', vol: 0.3, to: 25 });
    });
  }, [boom]);

  return (
    <>
      <HostHeader title={t('title')} color={ORANGE} info={t('info.alive', { n: alive.size, total: n })}
        right={<span className="up-chip" style={{ fontSize: 16 }}>{t('info.passes', { n: view.passes })}</span>} />
      <div style={{ flex: 1, position: 'relative', animation: boom ? 'upShake .6s ease-out' : undefined }}>
        {ids.map((id) => {
          const p = player(id);
          if (!p) return null;
          const [x, y] = posOf(id);
          const isHolder = id === view.holder;
          const out = !alive.has(id) && !(boom && id === view.victim);
          return (
            <div key={id} style={{ position: 'absolute', left: x, top: y, transform: 'translate(-50%, -50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, opacity: out ? 0.3 : 1, filter: out ? 'grayscale(1)' : undefined, transition: 'opacity .4s' }}>
              <span style={{ borderRadius: '50%', boxShadow: isHolder && !boom ? `0 0 0 5px ${ORANGE}, 0 0 30px ${ORANGE}` : undefined, animation: isHolder && !boom ? 'upJitter .3s linear infinite' : undefined }}>
                <Avatar player={p} size={isHolder ? size * 1.15 : size} />
              </span>
              <b style={{ fontSize: n > 14 ? 13 : 16, maxWidth: size * 1.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</b>
              <Hearts n={view.lives[id] ?? 0} max={view.maxLives} />
            </div>
          );
        })}

        {/* Bombe fliegt zum Halter */}
        {!boom && started && (
          <div style={{ position: 'absolute', left: hx + size * 0.55, top: hy - size * 0.55, transform: 'translate(-50%, -50%)', transition: 'left .45s cubic-bezier(.3,1.4,.5,1), top .45s cubic-bezier(.3,1.4,.5,1)', zIndex: 3 }}>
            <Bomb size={size * 0.9} elapsed={elapsed} />
          </div>
        )}
        {boom && (
          <div style={{ position: 'absolute', left: hx, top: hy, transform: 'translate(-50%, -50%)', zIndex: 4 }}>
            <svg width={320} height={320} viewBox="-100 -100 200 200" aria-hidden="true" style={{ animation: 'upPop .5s ease-out both' }}>
              <polygon points="0,-95 22,-35 85,-55 45,-5 95,30 30,30 40,95 0,45 -40,95 -30,30 -95,30 -45,-5 -85,-55 -22,-35" fill="#FF9F43" />
              <polygon points="0,-60 14,-22 52,-34 28,-2 58,20 18,20 24,58 0,28 -24,58 -18,20 -58,20 -28,-2 -52,-34 -14,-22" fill="#FFD447" />
              <text y="12" textAnchor="middle" fontSize="40" fontWeight="900" fill="#B8202E" fontFamily="Bricolage Grotesque, sans-serif">BOOM</text>
            </svg>
          </div>
        )}

        {/* Mitte */}
        <div style={{ position: 'absolute', left: cx, top: cy, transform: 'translate(-50%, -50%)', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, maxWidth: 560 }}>
          {boom ? (
            <>
              <h1 className="anim-pop" style={{ fontSize: 48 }}>{view.out ? t('boom.out', { name: player(view.victim)?.name ?? '?' }) : t('boom.life', { name: player(view.victim)?.name ?? '?' })}</h1>
              <p className="muted" style={{ fontSize: 20 }}>{t('boom.others')}</p>
            </>
          ) : !started ? (
            <>
              <span className="display" style={{ fontSize: 110, fontWeight: 800 }}>{Math.max(1, Math.ceil((view.roundStart - now) / 1000))}</span>
              <p style={{ fontSize: 24, fontWeight: 700 }}>{t('start.first', { name: holder?.name ?? '?' })}</p>
            </>
          ) : (
            <>
              <h1 style={{ fontSize: 44 }}>{t('holder', { name: holder?.name ?? '?' })}</h1>
              <p className="muted" style={{ fontSize: 22 }}>{view.phase === 'throw' ? t('holder.throw') : t('holder.task')}</p>
            </>
          )}
        </div>
      </div>
    </>
  );
}

/* ================= Handy ================= */

function TaskView({ view, t, send }: ControllerViewProps) {
  const task = view.task;
  const [lockedUntil, setLockedUntil] = useState(0);
  const [shake, setShake] = useState(0);
  const [progress, setProgress] = useState(0);
  const now = useServerNow(150);
  useEffect(() => setProgress(0), [view.taskId]);
  const elapsed = Math.max(0, (now - view.roundStart) / 1000);
  // Handy vibriert im Takt der Bombe
  useEffect(() => {
    const id = setInterval(() => vibrate(40), tickInterval(elapsed) * 1000);
    return () => clearInterval(id);
  }, [Math.round(elapsed / 3)]); // eslint-disable-line react-hooks/exhaustive-deps
  if (now < view.roundStart) return <PhoneWait title={t('phone.youStart')} text={t('phone.getReady')} emoji={<Bomb size={110} elapsed={0} />} />;
  const locked = Date.now() < lockedUntil;
  const wrong = () => {
    vibrate([80, 40, 80]);
    setShake((x) => x + 1);
    setProgress(0);
    setLockedUntil(Date.now() + 1200);
    setTimeout(() => setLockedUntil(0), 1250);
  };
  const solved = () => {
    vibrate(20);
    send({ type: 'solved', taskId: view.taskId });
  };
  const btn = { minHeight: 84, border: 0, borderRadius: 18, background: '#262048', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 800, touchAction: 'manipulation' } as const;

  let body = null;
  let prompt = '';
  if (task.kind === 'shape') {
    prompt = t('task.shape', { color: t(`color.${task.target[1]}`), shape: t(`shape.${task.target[0]}`) });
    body = (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
        {task.options.map(([s, c]: [number, number], i: number) => (
          <button key={i} type="button" disabled={locked} style={btn} onClick={() => (s === task.target[0] && c === task.target[1] ? solved() : wrong())}>
            <svg width={50} height={50} viewBox="0 0 24 24" aria-hidden="true"><path d={SHAPES[s]} fill={TASK_COLORS[c]} /></svg>
          </button>
        ))}
      </div>
    );
  } else if (task.kind === 'order') {
    prompt = t('task.order');
    body = (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
        {task.cells.map((v: number | null, i: number) => (v == null ? <span key={i} /> : (
          <button key={i} type="button" disabled={locked || v <= progress} style={{ ...btn, background: v <= progress ? 'var(--green)' : '#262048', color: v <= progress ? '#110D24' : '#fff' }}
            onClick={() => {
              if (v !== progress + 1) return wrong();
              if (v === 4) return solved();
              setProgress(v);
            }}>{v}</button>
        )))}
      </div>
    );
  } else if (task.kind === 'math') {
    prompt = t('task.math');
    body = (
      <>
        <p className="display" style={{ fontSize: 54, fontWeight: 800, textAlign: 'center' }}>{task.a} + {task.b} = ?</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
          {task.options.map((o: number) => <button key={o} type="button" disabled={locked} style={btn} onClick={() => (o === task.a + task.b ? solved() : wrong())}>{o}</button>)}
        </div>
      </>
    );
  } else {
    prompt = t('task.tap', { n: task.count });
    body = (
      <button type="button" style={{ ...btn, minHeight: 220, borderRadius: 30, background: ORANGE, color: '#110D24', fontSize: 64, boxShadow: `0 8px 0 ${ORANGE_D}` }}
        onPointerDown={(e) => {
          e.preventDefault();
          vibrate(8);
          if (progress + 1 >= task.count) solved();
          else setProgress(progress + 1);
        }}>
        {task.count - progress}
      </button>
    );
  }
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14, margin: -16, padding: 16, background: 'radial-gradient(circle at 50% 0%, #5A1220, #110D24 70%)', animation: `upVignette ${tickInterval(elapsed)}s ease-in-out infinite` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Bomb size={64} elapsed={elapsed} />
        <div>
          <h1 style={{ fontSize: 26, color: ORANGE }}>{t('phone.youHaveIt')}</h1>
          <p style={{ fontSize: 15 }}>{t('phone.solveFirst')}</p>
        </div>
      </div>
      <p className="display" style={{ fontSize: 24, fontWeight: 800 }}>{prompt}</p>
      <div key={shake} style={{ animation: shake ? 'upShake .4s ease-out' : undefined, opacity: locked ? 0.5 : 1 }}>{body}</div>
      {locked && <p style={{ textAlign: 'center', color: '#FF8A8E', fontWeight: 700 }}>{t('phone.wrong')}</p>}
    </div>
  );
}

function Controller(props: ControllerViewProps) {
  const { view, t, send, me, player } = props;
  const now = useServerNow(250);
  switch (view.screen) {
    case 'intro':
      return <PhoneWait title={t('title')} text={t('lookAtTv')} emoji={<Avatar player={me} size={96} />} />;
    case 'task':
      return <TaskView {...props} />;
    case 'throw':
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, margin: -16, padding: 16, background: 'radial-gradient(circle at 50% 0%, #5A1220, #110D24 70%)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Bomb size={60} elapsed={Math.max(0, (now - view.roundStart) / 1000)} />
            <h1 style={{ fontSize: 28, color: ORANGE }}>{t('phone.throw')}</h1>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
            {(view.targets as string[]).map((id) => {
              const p = player(id);
              return p ? (
                <button key={id} type="button" onClick={() => { vibrate(30); send({ type: 'throw', target: id }); }}
                  style={{ minHeight: 76, border: 0, borderRadius: 18, background: '#262048', color: '#fff', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', textAlign: 'left' }}>
                  <Avatar player={p} size={44} />
                  <b style={{ fontSize: 17, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</b>
                </button>
              ) : null;
            })}
          </div>
        </div>
      );
    case 'safe':
      return <PhoneWait title={t('phone.safe', { name: view.holder })} text={view.maxLives > 1 ? t('phone.lives', { n: view.lives }) : t('phone.watch')} emoji={<Avatar player={me} size={96} />} />;
    case 'phew':
      return <PhoneWait title={t('phone.phew')} text={t('phone.victim', { name: view.victim })} emoji={<Avatar player={me} size={96} />} />;
    case 'boom':
      return <PhoneWait title={view.out ? t('phone.boomOut') : t('phone.boomLife')} text={view.out ? t('phone.watchRest') : t('phone.lives', { n: view.lives })} emoji={<span className="display" style={{ fontSize: 72, fontWeight: 900, color: ORANGE }}>BOOM</span>} />;
    case 'out':
      return <PhoneWait title={t('phone.out')} text={t('phone.watchRest')} emoji={<Avatar player={me} size={96} dim />} />;
    case 'finalMe':
      return (
        <div className="anim-fade" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, textAlign: 'center' }}>
          {view.won && <Confetti pieces={16} />}
          <Avatar player={me} size={110} />
          <h1 style={{ fontSize: 30 }}>{view.won ? t('phone.won') : t('me.place', { place: view.place, of: view.of })}</h1>
          <p className="muted">{t('me.score', { n: view.score })}</p>
        </div>
      );
    default:
      return <PhoneWait title={t('lookAtTv')} emoji={<Avatar player={me} size={96} />} />;
  }
}

export default { Host, Controller } satisfies GameClientModule;
