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

/** Die Kartoffel vom Titelbild (ausgeschnitten), pocht im Takt des Tickens; oben brennt die Zündschnur */
function Potato({ size = 80, elapsed }: { size?: number; elapsed: number }) {
  const beat = tickInterval(elapsed);
  const w = size * 1.15;
  const h = w * (227 / 316);
  return (
    <div aria-hidden="true" style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', animation: `upBeat ${beat}s ease-in-out infinite` }}>
      <div style={{ position: 'relative', width: w, height: h, flex: 'none' }}>
        <img src="/game/heisse-kartoffel/bilder/kartoffel.webp" alt="" draggable={false}
          style={{ width: w, height: h, maxWidth: 'none', display: 'block', pointerEvents: 'none', userSelect: 'none', filter: 'drop-shadow(0 0 14px rgba(255,138,61,.8))' }} />
        {/* Spitze der Zündschnur im Bild: 87,6 % von links, 1,5 % von oben */}
        <FuseFire x={w * 0.876} y={h * 0.015} scale={w / 150} intensity={Math.max(0, Math.min(1, (0.9 - beat) / 0.72))} />
      </div>
    </div>
  );
}

type Spark = { x: number; y: number; px: number; py: number; vx: number; vy: number; life: number; max: number; kind: 0 | 1 | 2 };

/** Brennende Zündschnur: glühender Kern, sprühende Funken, ein Hauch Rauch (Canvas, additiv geblendet) */
function FuseFire({ x, y, scale, intensity }: { x: number; y: number; scale: number; intensity: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const inten = useRef(intensity);
  inten.current = intensity;
  const box = Math.round(110 * scale);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = box * dpr; cv.height = box * dpr;
    ctx.scale(dpr, dpr);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const cx = box / 2, cy = box / 2, s = scale;
    const parts: Spark[] = [];
    let raf = 0, last = performance.now(), carry = 0;
    const spawn = (kind: 0 | 1 | 2) => {
      if (kind === 2) {
        parts.push({ x: cx + (Math.random() - 0.5) * 4 * s, y: cy - 2 * s, px: cx, py: cy, vx: (Math.random() - 0.3) * 8 * s, vy: (-18 - Math.random() * 14) * s, life: 0, max: 0.9 + Math.random() * 0.6, kind });
        return;
      }
      // Funken sprühen vor allem nach oben/außen (Zündschnur zeigt nach rechts oben)
      const ang = -Math.PI / 2 + 0.35 + (Math.random() - 0.5) * (kind === 1 ? 2.4 : 3.6);
      const sp = (kind === 1 ? 55 + Math.random() * 75 : 20 + Math.random() * 40) * s;
      parts.push({ x: cx, y: cy, px: cx, py: cy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 0, max: kind === 1 ? 0.28 + Math.random() * 0.4 : 0.15 + Math.random() * 0.2, kind });
    };
    const frame = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const k = inten.current;
      carry += dt * (reduce ? 25 : 70 + 110 * k);
      while (carry >= 1) { carry -= 1; spawn(Math.random() < 0.55 ? 1 : 0); if (Math.random() < 0.06) spawn(2); }
      ctx.clearRect(0, 0, box, box);
      // Rauch (normal geblendet, unter den Funken)
      ctx.globalCompositeOperation = 'source-over';
      for (const p of parts) {
        if (p.kind !== 2) continue;
        const f = p.life / p.max;
        ctx.fillStyle = `rgba(120,110,140,${(0.22 * (1 - f)).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, (3 + 9 * f) * s, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalCompositeOperation = 'lighter';
      // flackernder Glutkern
      const r = (13 + Math.random() * 4 + 5 * k) * s;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, 'rgba(255,255,235,1)');
      g.addColorStop(0.25, 'rgba(255,220,110,.95)');
      g.addColorStop(0.55, 'rgba(255,130,40,.55)');
      g.addColorStop(1, 'rgba(255,60,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      // Funken als kurze Leuchtstriche
      ctx.lineCap = 'round';
      for (const p of parts) {
        if (p.kind === 2) continue;
        const f = p.life / p.max;
        const hue = 55 - 45 * f; // weißgelb → orange → rot
        const light = 92 - 40 * f;
        ctx.strokeStyle = `hsla(${hue.toFixed(0)},100%,${light.toFixed(0)}%,${(1 - f * f).toFixed(3)})`;
        ctx.lineWidth = (p.kind === 1 ? 1.6 : 2.4) * s * (1 - 0.5 * f);
        ctx.beginPath(); ctx.moveTo(p.px, p.py); ctx.lineTo(p.x, p.y); ctx.stroke();
      }
      // bewegen
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.life += dt;
        if (p.life >= p.max) { parts.splice(i, 1); continue; }
        p.px = p.x - p.vx * dt * 1.6; p.py = p.y - p.vy * dt * 1.6; // Schweif
        if (p.kind === 2) { p.vx *= 0.98; p.vy *= 0.97; }
        else { p.vy += 140 * s * dt; p.vx *= 0.985; }
        p.x += p.vx * dt; p.y += p.vy * dt;
        // gelegentlich zerplatzt ein Funke in kleine
        if (p.kind === 1 && Math.random() < 0.012 && parts.length < 260) {
          for (let j = 0; j < 3; j++) {
            const a2 = Math.random() * Math.PI * 2, sp2 = (20 + Math.random() * 30) * s;
            parts.push({ x: p.x, y: p.y, px: p.x, py: p.y, vx: Math.cos(a2) * sp2, vy: Math.sin(a2) * sp2, life: 0, max: 0.12 + Math.random() * 0.15, kind: 0 });
          }
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [box, scale]);
  return <canvas ref={ref} style={{ position: 'absolute', left: x - box / 2, top: y - box / 2, width: box, height: box, pointerEvents: 'none' }} />;
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
          <Potato size={130} elapsed={10} />
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

        {/* Kartoffel fliegt zum Halter */}
        {!boom && started && (
          <div style={{ position: 'absolute', left: hx + size * 0.55, top: hy - size * 0.55, transform: 'translate(-50%, -50%)', transition: 'left .45s cubic-bezier(.3,1.4,.5,1), top .45s cubic-bezier(.3,1.4,.5,1)', zIndex: 3 }}>
            <Potato size={size * 0.9} elapsed={elapsed} />
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
  // Handy vibriert im Takt der Kartoffel
  useEffect(() => {
    const id = setInterval(() => vibrate(40), tickInterval(elapsed) * 1000);
    return () => clearInterval(id);
  }, [Math.round(elapsed / 3)]); // eslint-disable-line react-hooks/exhaustive-deps
  if (now < view.roundStart) return <PhoneWait title={t('phone.youStart')} text={t('phone.getReady')} emoji={<Potato size={110} elapsed={0} />} />;
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
  } else if (task.kind === 'stroop') {
    prompt = t('task.stroop');
    body = (
      <>
        <p className="display" style={{ fontSize: 64, fontWeight: 800, textAlign: 'center', color: TASK_COLORS[task.ink], letterSpacing: 2 }}>{t(`colorName.${task.word}`).toUpperCase()}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
          {task.options.map((o: number) => <button key={o} type="button" disabled={locked} style={{ ...btn, fontSize: 26 }} onClick={() => (o === task.ink ? solved() : wrong())}>{t(`colorName.${o}`)}</button>)}
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
        <Potato size={64} elapsed={elapsed} />
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
            <Potato size={60} elapsed={Math.max(0, (now - view.roundStart) / 1000)} />
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
