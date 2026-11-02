import { useEffect, useState } from 'react';
import type { ControllerViewProps, GameClientModule, HostViewProps, PlayerInfo, Translate } from '@up/sdk';
import { Avatar, Confetti, Crown, HostHeader, HostTimer, PhoneTimer, PhoneWait, Podium, Scoreboard, vibrate } from '@up/ui';

const RED = '#FF5A4E';

function fmt(n: number, lang: string) {
  return new Intl.NumberFormat(lang === 'de' ? 'de-DE' : 'en-US').format(n);
}

/** „1,2 Mio.“ / „1.2M“ */
function short(n: number, lang: string, t: Translate) {
  const nf = (x: number) => new Intl.NumberFormat(lang === 'de' ? 'de-DE' : 'en-US', { maximumFractionDigits: 1 }).format(x);
  if (n >= 1e9) return `${nf(n / 1e9)} ${t('unit.b')}`;
  if (n >= 1e6) return `${nf(n / 1e6)} ${t('unit.m')}`;
  if (n >= 1e4) return `${nf(n / 1e3)} ${t('unit.k')}`;
  return fmt(n, lang);
}

function duration(sec: number) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/** Zählt in ~2,5 s von 0 hoch (logarithmisch, damit kleine und große Zahlen spannend sind). */
function useCountUp(target: number, key: unknown, delay = 600) {
  const [v, setV] = useState(0);
  useEffect(() => {
    setV(0);
    let raf = 0;
    const t0 = performance.now() + delay;
    const tick = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - t0) / 2500));
      const eased = 1 - (1 - p) ** 3;
      setV(p >= 1 ? target : Math.round(Math.expm1(Math.log1p(target) * eased)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return v;
}

/* ================= TV ================= */

function Host(props: HostViewProps) {
  const { view, t, player, room } = props;
  const lang = room.lang;
  switch (view.screen) {
    case 'setup':
      return (
        <>
          <HostHeader title={t('title')} color={RED} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 20, maxWidth: 980 }}>
            <h1 style={{ fontSize: 48 }}>{t('setup.title')}</h1>
            <p style={{ fontSize: 24 }}>{t('setup.text')}</p>
            <ol style={{ fontSize: 22, lineHeight: 1.6, paddingLeft: 28, margin: 0 }}>
              <li>{t('setup.step1')}</li><li>{t('setup.step2')}</li><li>{t('setup.step3')}</li><li>{t('setup.step4')}</li>
            </ol>
          </div>
        </>
      );
    case 'loading':
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
          <span style={{ width: 64, height: 64, borderRadius: '50%', border: '8px solid var(--surface-2)', borderTopColor: RED, animation: 'upSpin 1s linear infinite' }} />
          <p style={{ fontSize: 26 }}>{t('loading')}</p>
        </div>
      );
    case 'error':
      return (
        <>
          <HostHeader title={t('title')} color={RED} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 18 }}>
            <h1 style={{ fontSize: 44 }}>{t('error.title')}</h1>
            <p style={{ fontSize: 22 }}>{view.kind === 'quota' ? t('error.quota') : view.kind === 'key' ? t('error.key') : t('error.text', { msg: view.message })}</p>
          </div>
        </>
      );
    case 'intro':
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28, textAlign: 'center' }}>
          <span className="up-tag anim-pop" style={{ background: RED, color: '#fff', boxShadow: '0 8px 0 #C22E24', fontSize: 72, padding: '12px 36px', borderRadius: 26, transform: 'rotate(-3deg)' }}>{t('title')}</span>
          <p className="anim-up" style={{ fontSize: 28, maxWidth: 900, lineHeight: 1.35, animationDelay: '.4s' }}>{t('intro.text')}</p>
        </div>
      );
    case 'guess': {
      const v = view.video;
      const date = new Date(v.published).toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      return (
        <>
          <HostHeader title={t('title')} color={RED} info={t('video', { n: view.n, total: view.total })} right={<HostTimer deadline={view.deadline} duration={view.duration} />} />
          <div style={{ flex: 1, display: 'flex', gap: 32, alignItems: 'center', minHeight: 0 }}>
            <div style={{ width: 720, aspectRatio: '16 / 9', borderRadius: 24, overflow: 'hidden', background: '#000', boxShadow: '0 10px 0 #0A0716', flex: 'none' }}>
              <iframe key={v.id} title={v.title} width="720" height="405" style={{ border: 0, width: '100%', height: '100%' }} allow="autoplay; encrypted-media"
                src={`https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&mute=1&controls=0&loop=1&playlist=${v.id}&modestbranding=1&rel=0&playsinline=1`} />
            </div>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <h1 style={{ fontSize: 30, lineHeight: 1.2, overflowWrap: 'anywhere' }}>{v.title}</h1>
              <p className="muted" style={{ fontSize: 19 }}>{v.channel}</p>
              <p className="muted" style={{ fontSize: 17 }}>{date} · {duration(v.durationSec)}</p>
              <h2 className="display" style={{ fontSize: 34, color: 'var(--yellow)', marginTop: 20 }}>{t('guess.title')}</h2>
              <span className="up-chip" style={{ alignSelf: 'flex-start', fontSize: 17 }}>{t('guess.count', { n: view.guessed, total: view.players })}</span>
            </div>
          </div>
        </>
      );
    }
    case 'reveal':
      return <HostReveal {...props} />;
    case 'scores': {
      const rows = Object.keys(view.after).map((id) => ({ player: player(id)!, before: view.before[id] ?? 0, after: view.after[id] })).filter((r) => r.player);
      return (
        <>
          <HostHeader title={t('title')} color={RED} info={t('scores.title')} />
          <h1 style={{ fontSize: 36 }}>{t('scores.title')}</h1>
          <Scoreboard rows={rows} max={rows.length > 10 ? 10 : 8} />
        </>
      );
    }
    case 'final':
      return (
        <>
          <HostHeader title={t('title')} color={RED} info={t('final.title')} />
          <Podium ranking={view.ranking} player={player} pointsLabel={t('points')} />
        </>
      );
  }
  return null;
}

function HostReveal({ view, t, player, room }: HostViewProps) {
  const lang = room.lang;
  const count = useCountUp(view.views, `${view.n}`);
  const done = count === view.views;
  const winners = new Set<string>(view.winners);
  const entries = (view.entries as any[]).filter((e) => player(e.playerId));
  const shown = entries.slice(0, 8);
  return (
    <>
      {done && winners.size > 0 && <Confetti />}
      <HostHeader title={t('title')} color={RED} info={t('video', { n: view.n, total: view.total })} />
      <div style={{ display: 'flex', gap: 28, alignItems: 'center' }}>
        <img src={`https://i.ytimg.com/vi/${view.video.id}/mqdefault.jpg`} alt="" width={256} height={144} style={{ borderRadius: 16, objectFit: 'cover', flex: 'none' }} />
        <div style={{ minWidth: 0 }}>
          <p className="muted" style={{ fontSize: 20, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{view.video.title}</p>
          <p className="display" style={{ fontSize: 84, fontWeight: 800, lineHeight: 1.05, color: done ? 'var(--yellow)' : '#fff', transition: 'color .3s', fontVariantNumeric: 'tabular-nums' }}>{fmt(count, lang)}</p>
          <p className="muted" style={{ fontSize: 20 }}>{t('reveal.views')}</p>
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, opacity: done ? 1 : 0, transition: 'opacity .4s' }}>
        {shown.length === 0 && <p className="muted" style={{ fontSize: 22 }}>{t('reveal.noGuess')}</p>}
        {shown.map((e, i) => {
          const p = player(e.playerId) as PlayerInfo;
          const win = winners.has(e.playerId);
          return (
            <div key={e.playerId} style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '6px 16px', borderRadius: 16, minHeight: 50,
              background: win ? RED : 'var(--surface)', boxShadow: win ? '0 0 0 3px var(--yellow)' : undefined,
              animation: done ? `upSlideUp .4s ease-out ${(i * 0.08).toFixed(2)}s both` : undefined,
            }}>
              {win ? <Crown size={30} /> : <span className="display muted" style={{ width: 30, textAlign: 'center', fontWeight: 800 }}>{i + 1}</span>}
              <Avatar player={p} size={38} flat />
              <b style={{ width: 170, fontSize: 18, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}{!e.player ? ` · ${t('game.audience')}` : ''}</b>
              <span className="display" style={{ flex: 1, fontSize: 24, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{fmt(e.guess, lang)}</span>
              <span style={{ fontSize: 17, color: win ? '#fff' : 'var(--muted)' }}>{e.diff === 0 ? t('reveal.exact') : `${e.guess > view.views ? '+' : '−'}${short(e.diff, lang, t)} ${t('reveal.off')}`}</span>
              {win && <span className="display" style={{ fontSize: 26, fontWeight: 800, color: 'var(--yellow)', width: 50, textAlign: 'right', animation: 'upPop .5s ease-out .4s both' }}>+1</span>}
            </div>
          );
        })}
        {entries.length > shown.length && <p className="faint" style={{ textAlign: 'center' }}>+ {entries.length - shown.length}</p>}
      </div>
    </>
  );
}

/* ================= Handy ================= */

function Keypad({ lang, t, initial, onSubmit, locked }: { lang: string; t: Translate; initial: number | null; onSubmit: (n: number) => void; locked: boolean }) {
  const [digits, setDigits] = useState(initial != null ? String(initial) : '');
  const value = digits ? Number(digits) : 0;
  const press = (d: string) => {
    vibrate(8);
    setDigits((cur) => {
      const next = (cur === '0' ? '' : cur) + d;
      return next.length > 11 ? cur : next.replace(/^0+(?=\d)/, '');
    });
  };
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', '⌫'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="up-card" style={{ textAlign: 'center', padding: '14px 16px' }}>
        <div className="display" style={{ fontSize: digits.length > 9 ? 34 : 42, fontWeight: 800, fontVariantNumeric: 'tabular-nums', minHeight: 50 }}>{digits ? fmt(value, lang) : '0'}</div>
        <div className="muted" style={{ fontSize: 15, minHeight: 20 }}>{value >= 1e4 ? short(value, lang, t) : ' '}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        {keys.map((k) => (
          <button key={k} type="button" className="up-btn ghost" style={{ minHeight: 52, fontSize: 24 }}
            aria-label={k === '⌫' ? 'Löschen' : k}
            onClick={() => (k === '⌫' ? setDigits((c) => c.slice(0, -1)) : press(k))}>{k}</button>
        ))}
      </div>
      <button type="button" className="up-btn big full" disabled={!digits || locked} onClick={() => onSubmit(value)}>{t('guess.send')}</button>
    </div>
  );
}

function Controller({ view, t, send, me, room }: ControllerViewProps) {
  const lang = room.lang;
  switch (view.screen) {
    case 'setup':
      return <PhoneWait title={t('setup.title')} text={t('setup.phone')} />;
    case 'intro':
      return <PhoneWait title={t('title')} text={t('lookAtTv')} emoji={<Avatar player={me} size={96} />} />;
    case 'guess':
      return (
        <>
          <PhoneTimer deadline={view.deadline} duration={view.duration} hurryText={view.guess == null ? t('timer.hurry') : undefined} />
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <img src={`https://i.ytimg.com/vi/${view.videoId}/default.jpg`} alt="" width={96} height={72} style={{ borderRadius: 10, objectFit: 'cover', flex: 'none' }} />
            <p className="display" style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.25, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>{view.title}</p>
          </div>
          <span className="up-label">{t('guess.title')}</span>
          <Keypad key={view.videoId} lang={lang} t={t} initial={view.guess} locked={false} onSubmit={(n) => send({ type: 'guess', value: n })} />
          {view.guess != null && (
            <p role="status" style={{ textAlign: 'center', fontSize: 15 }}>
              <b style={{ color: 'var(--green)' }}>✓ {t('guess.done')}: {fmt(view.guess, lang)}</b><br /><span className="muted">{t('guess.change')}</span>
            </p>
          )}
        </>
      );
    case 'result':
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, textAlign: 'center' }} className="anim-fade">
          {view.won && <Confetti pieces={14} />}
          <div style={{ position: 'relative' }}>
            <Avatar player={me} size={104} />
            {view.won && <Crown size={44} style={{ position: 'absolute', top: -24, left: 30 }} />}
          </div>
          <h1 style={{ fontSize: 28 }}>{view.guess == null ? t('lookAtTv') : view.won ? t('result.won') : t('result.lost')}</h1>
          <p className="muted" style={{ fontSize: 16 }}>{t('reveal.views')}</p>
          <p className="display" style={{ fontSize: 40, fontWeight: 800, color: 'var(--yellow)' }}>{fmt(view.views, lang)}</p>
          {view.guess != null && <p style={{ fontSize: 18 }}>{t('guess.yours')}: <b>{fmt(view.guess, lang)}</b></p>}
          {view.place && <p className="muted">{t('result.place', { n: view.place, of: view.of })}</p>}
        </div>
      );
    case 'audienceWait':
      return <PhoneWait title={t('game.audience')} text={t('audience.wait')} emoji={<Avatar player={me} size={96} />} />;
    case 'scoresMe':
    case 'finalMe':
      return <PhoneWait title={t('me.place', { place: view.place, of: view.of })} text={t('me.score', { n: view.score })} emoji={<Avatar player={me} size={110} />} />;
    default:
      return <PhoneWait title={t('lookAtTv')} emoji={<Avatar player={me} size={96} />} />;
  }
}

export default { Host, Controller } satisfies GameClientModule;
