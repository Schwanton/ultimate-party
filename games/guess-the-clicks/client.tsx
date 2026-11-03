import { useEffect, useMemo, useRef, useState } from 'react';
import type { ControllerViewProps, GameClientModule, HostViewProps, PlayerInfo, Translate } from '@up/sdk';
import { Avatar, Confetti, Crown, HostHeader, HostTimer, PhoneTimer, PhoneWait, Podium, QrCode, Scoreboard, TextAnswer, sfx, useServerNow, vibrate, useDraft } from '@up/ui';
import { START_DELAY, buildTimeline, lg, positionAt, scaleTop, unlg } from './reveal';

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

function Host(props: HostViewProps) {
  const { view, t, player, room } = props;
  const lang = room.lang;
  switch (view.screen) {
    case 'setup':
      return <HostSetup {...props} />;
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
            <VideoPlayer id={v.id} t={t} />
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <h1 style={{ fontSize: 30, lineHeight: 1.2, overflowWrap: 'anywhere' }}>{v.title}</h1>
              <p className="muted" style={{ fontSize: 19 }}>{v.channel}</p>
              <p className="muted" style={{ fontSize: 17 }}>{date} · {duration(v.durationSec)}</p>
              <h2 className="display" style={{ fontSize: 34, color: 'var(--yellow)', marginTop: 20 }}>{t('guess.title')}</h2>
              <span className="up-chip" style={{ alignSelf: 'flex-start', fontSize: 17 }}>{t('guess.count', { n: view.guessed, total: view.players })}</span>
              <span className="up-chip" style={{ alignSelf: 'flex-start', fontSize: 17, background: view.extendVotes ? 'var(--surface-2)' : undefined }}>
                {t('extend.tv', { n: view.extendVotes, need: view.extendNeeded })}
              </span>
              {view.extensions > 0 && (
                <span key={view.extensions} className="up-tag" style={{ alignSelf: 'flex-start', fontSize: 20, background: 'var(--yellow)', color: '#110D24', boxShadow: '0 5px 0 var(--yellow-d)', animation: 'upBadge .5s ease-out both' }}>
                  {t('extend.done', { n: view.extensions })}
                </span>
              )}
            </div>
          </div>
        </>
      );
    }
    case 'countdown':
      return <HostCountdown key={view.key} n={view.n} total={view.total} t={t} />;
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

/** 3 – 2 – 1 vor jeder Runde, mit Piepton (der einzige Sound in diesem Spiel) */
function HostCountdown({ n, total, t }: { n: number; total: number; t: Translate }) {
  const [left, setLeft] = useState(3);
  useEffect(() => {
    sfx.play('beep', { always: true });
    const id = setInterval(() => {
      setLeft((x) => {
        const next = x - 1;
        if (next > 0) sfx.play('beep', { always: true });
        else if (next === 0) sfx.play('go', { always: true });
        return Math.max(0, next);
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <>
      <HostHeader title={t('title')} color={RED} info={t('video', { n, total })} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <p className="muted" style={{ fontSize: 28 }}>{t('video', { n, total })}</p>
        <h1 key={left} style={{ fontSize: 220, lineHeight: 1, color: left === 0 ? 'var(--yellow)' : '#fff', animation: 'upPop .45s ease-out both' }}>{left || '▶'}</h1>
      </div>
    </>
  );
}

const KEY_URL = 'https://console.cloud.google.com/apis/library/youtube.googleapis.com';

function HostSetup({ view, t, setSecret }: HostViewProps) {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    await setSecret('youtubeApiKey', key.trim());
    setBusy(false);
  };
  const error = view.error === 'key' ? t('error.key') : view.error === 'quota' ? t('error.quota') : view.error ? t('error.network') : null;
  return (
    <>
      <HostHeader title={t('title')} color={RED} info={t('setup.title')} />
      <div style={{ flex: 1, display: 'flex', gap: 40, alignItems: 'center' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h1 style={{ fontSize: 40 }}>{t('setup.title')}</h1>
          <p style={{ fontSize: 21 }}>{t('setup.text')}</p>
          <ol style={{ fontSize: 19, lineHeight: 1.55, paddingLeft: 26, margin: 0 }}>
            <li>{t('setup.step1')}</li><li>{t('setup.step2')}</li><li>{t('setup.step3')}</li><li>{t('setup.step4tv')}</li>
          </ol>
          <p className="muted" style={{ fontSize: 16 }}>{t('setup.phoneHint')}</p>
        </div>
        <div className="up-card" style={{ width: 460, padding: 28, display: 'flex', flexDirection: 'column', gap: 14, borderRadius: 28 }}>
          <QrCode text={KEY_URL} size={150} />
          <p className="muted" style={{ fontSize: 15 }}>{t('setup.scan')}</p>
          <form onSubmit={(e) => { e.preventDefault(); if (key.trim()) void save(); }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label className="up-label" htmlFor="ytkey">{t('setup.keyLabel')}</label>
            <input id="ytkey" className="up-input" autoComplete="off" spellCheck={false} placeholder="AIza…" value={key} onChange={(e) => setKey(e.target.value)} style={{ fontSize: 18 }} />
            {error && <p className="up-error" style={{ fontSize: 15 }}>{error}</p>}
            <button className="up-btn" disabled={!key.trim() || busy}>{busy ? '…' : t('setup.save')}</button>
          </form>
        </div>
      </div>
    </>
  );
}

/** YouTube-Player mit Ton. Blockiert der Browser Autoplay mit Ton, läuft das Video stumm und ein Klick schaltet den Ton ein. */
let ytApi: Promise<any> | null = null;
function loadYouTubeApi(): Promise<any> {
  const w = window as any;
  if (w.YT?.Player) return Promise.resolve(w.YT);
  if (!ytApi) {
    ytApi = new Promise((resolve) => {
      const prev = w.onYouTubeIframeAPIReady;
      w.onYouTubeIframeAPIReady = () => { prev?.(); resolve(w.YT); };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(s);
    });
  }
  return ytApi;
}

function VideoPlayer({ id, t }: { id: string; t: Translate }) {
  const box = useRef<HTMLDivElement>(null);
  const player = useRef<any>(null);
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void loadYouTubeApi().then((YT) => {
      if (cancelled || !box.current) return;
      const el = document.createElement('div');
      box.current.innerHTML = '';
      box.current.appendChild(el);
      player.current = new YT.Player(el, {
        videoId: id, width: '100%', height: '100%', host: 'https://www.youtube-nocookie.com',
        playerVars: { autoplay: 1, controls: 0, loop: 1, playlist: id, modestbranding: 1, rel: 0, playsinline: 1, iv_load_policy: 3 },
        events: {
          onReady: (e: any) => {
            e.target.setVolume(70);
            e.target.unMute();
            e.target.playVideo();
            // Prüfen, ob der Browser Ton erlaubt hat – sonst stumm weiterspielen
            setTimeout(() => {
              if (cancelled) return;
              const state = e.target.getPlayerState?.();
              if (state !== 1 || e.target.isMuted?.()) {
                e.target.mute();
                e.target.playVideo();
                setMuted(true);
              }
            }, 1500);
          },
        },
      });
    });
    return () => {
      cancelled = true;
      try { player.current?.destroy?.(); } catch { /* egal */ }
    };
  }, [id]);
  useEffect(() => {
    if (!muted) return;
    const unmute = () => {
      player.current?.unMute?.();
      player.current?.playVideo?.();
      setMuted(false);
    };
    window.addEventListener('pointerdown', unmute, { once: true });
    window.addEventListener('keydown', unmute, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unmute);
      window.removeEventListener('keydown', unmute);
    };
  }, [muted]);
  return (
    <div style={{ position: 'relative', width: 720, aspectRatio: '16 / 9', borderRadius: 24, overflow: 'hidden', background: '#000', boxShadow: '0 10px 0 #0A0716', flex: 'none' }}>
      <div ref={box} style={{ width: '100%', height: '100%' }} />
      {muted && (
        <button onClick={() => { player.current?.unMute?.(); setMuted(false); }} className="up-btn small" style={{ position: 'absolute', left: 16, bottom: 16 }}>
          {t('sound.on')}
        </button>
      )}
    </div>
  );
}

interface Entry { playerId: string; guess: number; diff: number; player: boolean }

/**
 * Auflösung als Zahlenstrahl: Eine Säule fährt auf einer logarithmischen Skala hoch – schnell, solange sie weit
 * von Tipps und Ziel entfernt ist, langsam in deren Nähe. Erreicht sie einen Tipp, erscheint das Bild des Spielers.
 * Die Skala wächst mit (verrät also nichts). Nach der echten Zahl fährt sie weiter bis zu den höheren Tipps.
 */
function HostReveal({ view, t, player, room }: HostViewProps) {
  const lang = room.lang;
  const entries = (view.entries as Entry[]).filter((e) => player(e.playerId));
  const tl = useMemo(() => buildTimeline(view.views, entries.map((e) => e.guess)), [view.startAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const now = useServerNow(33);
  const elapsed = (now - view.startAt) / 1000 - START_DELAY;
  const pos = positionAt(tl, elapsed);
  const target = lg(view.views);
  const hitTarget = elapsed >= tl.targetAt;
  const goingOver = tl.hasOver && elapsed >= tl.overFrom;
  const done = elapsed >= tl.seconds;
  const value = hitTarget ? view.views : Math.round(unlg(pos));
  const winners = new Set<string>(view.winners);

  // Geometrie (Bühnenpixel); die Skala reicht immer etwas über die Säule hinaus
  const H = 560, bottom = H - 24, topY = 24;
  const top = scaleTop(pos);
  const y = (x: number) => bottom - (x / top) * (bottom - topY);
  const axisX = 460, barW = 36;
  const crowd = entries.length > 12;
  const colW = crowd ? 46 : 212, rowGap = crowd ? 40 : 54, maxCols = crowd ? 15 : 3;

  // Spalten so verteilen, dass sich Tipps nicht überlappen – berechnet für die engste (letzte) Skala
  const columns = useMemo(() => {
    const endTop = scaleTop(tl.end);
    const yEnd = (x: number) => bottom - (x / endTop) * (bottom - topY);
    const sorted = [...entries].sort((a, b) => a.guess - b.guess);
    const lastY: number[] = [];
    const map = new Map<string, number>();
    for (const e of sorted) {
      const yy = yEnd(lg(e.guess));
      let col = lastY.findIndex((ly) => Math.abs(ly - yy) >= rowGap);
      if (col < 0) col = lastY.length < maxCols ? lastY.length : lastY.indexOf(Math.min(...lastY));
      lastY[col] = yy;
      map.set(e.playerId, col);
    }
    return map;
  }, [view.startAt]); // eslint-disable-line react-hooks/exhaustive-deps

  // Nur Skalenstriche, die schon sichtbar sind; neue erscheinen oben, während die Skala wächst
  const ticks = Array.from({ length: Math.floor(top) }, (_, i) => i + 1);
  const winnerNames = entries.filter((e) => winners.has(e.playerId)).map((e) => player(e.playerId)!.name);
  const headY = y(pos);
  const targetY = y(target);

  return (
    <>
      {done && winners.size > 0 && <Confetti silent />}
      <HostHeader title={t('title')} color={RED} info={t('video', { n: view.n, total: view.total })} />
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        {/* Links: Video und Zähler */}
        <div style={{ position: 'absolute', left: 0, top: 10, width: 330, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <img src={`https://i.ytimg.com/vi/${view.video.id}/mqdefault.jpg`} alt="" width={320} height={180} style={{ borderRadius: 16, objectFit: 'cover' }} />
          <p className="muted" style={{ fontSize: 17, lineHeight: 1.25, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{view.video.title}</p>
          <p key={hitTarget ? 'hit' : 'run'} className={`display${hitTarget ? ' anim-pop' : ''}`} style={{ fontSize: value >= 1e8 ? 48 : 56, fontWeight: 800, lineHeight: 1, color: hitTarget ? 'var(--yellow)' : '#fff', fontVariantNumeric: 'tabular-nums', transition: 'color .3s' }}>{fmt(value, lang)}</p>
          <p className="muted" style={{ fontSize: 18 }}>{hitTarget ? t('reveal.real') : t('reveal.views')}</p>
          {goingOver && !done && (
            <p className="display anim-pop" style={{ marginTop: 8, fontSize: 26, fontWeight: 800, color: '#B9B2FF' }}>{t('reveal.above')}</p>
          )}
          {done && (
            <div className="anim-pop" style={{ marginTop: 8, background: RED, borderRadius: 18, padding: '12px 16px', boxShadow: '0 5px 0 #C22E24' }}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>{winnerNames.length ? t('reveal.closest') : t('reveal.noGuess')}</span>
              {winnerNames.length > 0 && <p className="display" style={{ fontSize: 26, fontWeight: 800 }}>{winnerNames.join(' & ')} <span style={{ color: 'var(--yellow)' }}>+1</span></p>}
            </div>
          )}
        </div>

        {/* Rechts: Zahlenstrahl */}
        <svg width={1168} height={H} viewBox={`0 0 1168 ${H}`} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }} aria-hidden="true">
          {ticks.map((i) => {
            const ty = y(lg(10 ** i));
            // oben langsam einblenden, damit neue Striche nicht aufploppen
            const fade = Math.max(0, Math.min(1, (ty - topY) / 50));
            return (
              <g key={i} opacity={fade}>
                <line x1={axisX - 8} x2={1168} y1={ty} y2={ty} stroke="#262048" strokeWidth={1} />
                <text x={axisX - 16} y={ty + 6} textAnchor="end" fontSize={16} fontWeight={700} fill="#8F88B8" fontFamily="DM Sans, sans-serif">{short(10 ** i, lang, t)}</text>
              </g>
            );
          })}
          <rect x={axisX} y={topY} width={barW} height={bottom - topY} rx={barW / 2} fill="#1C1738" />
          {/* Teil über der echten Zahl in anderer Farbe */}
          {pos > target && <rect x={axisX} y={headY} width={barW} height={Math.max(0, targetY - headY + barW / 2)} rx={barW / 2} fill="#6B5CE7" />}
          <rect x={axisX} y={Math.max(headY, targetY)} width={barW} height={Math.max(barW, bottom - Math.max(headY, targetY))} rx={barW / 2} fill={RED} />
          {hitTarget && (
            <g>
              <line x1={axisX - 10} x2={1168} y1={targetY} y2={targetY} stroke="#FFD447" strokeWidth={4} strokeDasharray="10 8" />
            </g>
          )}
          {!done && <circle cx={axisX + barW / 2} cy={headY} r={barW / 2 + 6} fill="none" stroke="#fff" strokeWidth={3} opacity={0.8} />}
          {goingOver && !done && (
            <text x={axisX - 16} y={headY + 6} textAnchor="end" fontSize={18} fontWeight={800} fill="#B9B2FF" stroke="#110D24" strokeWidth={8} paintOrder="stroke" fontFamily="DM Sans, sans-serif">{short(Math.round(unlg(pos)), lang, t)}</text>
          )}
        </svg>

        {/* Tipps: erscheinen, sobald die Säule sie erreicht – auch die über der echten Zahl */}
        {entries.map((e) => {
          const g = lg(e.guess);
          if (g > pos + 1e-9) return null;
          const p = player(e.playerId)!;
          const col = columns.get(e.playerId) ?? 0;
          const yy = y(g);
          const over = g > target;
          const win = done && winners.has(e.playerId);
          const left = axisX + barW + 22 + col * colW;
          return (
            <div key={e.playerId} style={{
              position: 'absolute', left, top: yy - (crowd ? 18 : 24), display: 'flex', alignItems: 'center', gap: 8,
              opacity: done && !win ? 0.5 : 1, transition: 'opacity .4s', animation: 'upPop .35s ease-out both', zIndex: win ? 3 : 2,
            }}>
              {col === 0 && <span style={{ position: 'absolute', left: -22, top: crowd ? 17 : 23, width: 18, height: 3, background: win ? 'var(--yellow)' : over ? '#6B5CE7' : '#4A4378' }} />}
              <span style={{ position: 'relative' }}>
                <Avatar player={p} size={crowd ? 36 : 48} />
                {win && <Crown size={crowd ? 22 : 30} style={{ position: 'absolute', top: crowd ? -14 : -19, left: crowd ? 7 : 9 }} />}
              </span>
              {!crowd && (
                <span style={{ background: win ? RED : 'var(--surface)', borderRadius: 12, padding: '4px 10px', boxShadow: win ? '0 0 0 3px var(--yellow)' : undefined, whiteSpace: 'nowrap' }}>
                  <b style={{ fontSize: 15 }}>{p.name}{!e.player ? ' ·' : ''}</b>
                  <span className="display" style={{ display: 'block', fontSize: 17, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{short(e.guess, lang, t)}{win ? ' +1' : ''}</span>
                </span>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ================= Handy ================= */

function Keypad({ lang, t, initial, onSubmit, onDraft, deadline, locked }: { lang: string; t: Translate; initial: number | null; onSubmit: (n: number) => void; onDraft?: (n: number | null) => void; deadline?: number; locked: boolean }) {
  const [digits, setDigits] = useState(initial != null ? String(initial) : '');
  const value = digits ? Number(digits) : 0;
  // Eingetippte Zahl automatisch übertragen – zählt bei Zeitablauf, auch ohne „Abschicken“
  useDraft(digits ? value : null, onDraft, deadline);
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
  const now = useServerNow(250);
  switch (view.screen) {
    case 'setup':
      return (
        <>
          <h1 style={{ fontSize: 26 }}>{t('setup.title')}</h1>
          <p className="muted" style={{ fontSize: 15 }}>{t('setup.text')}</p>
          <ol style={{ fontSize: 15, lineHeight: 1.5, paddingLeft: 22, margin: 0 }}>
            <li>{t('setup.step1')}</li><li>{t('setup.step2')}</li><li>{t('setup.step3')}</li><li>{t('setup.step4phone')}</li>
          </ol>
          <a className="up-btn ghost full" href={KEY_URL} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>{t('setup.open')}</a>
          {view.error && <p className="up-error" style={{ fontSize: 14 }}>{view.error === 'key' ? t('error.key') : view.error === 'quota' ? t('error.quota') : t('error.network')}</p>}
          <TextAnswer button={t('setup.save')} placeholder="AIza…" maxLength={200} autoFocus={false} onSubmit={(key) => send({ type: 'setKey', key })} />
        </>
      );
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
          <Keypad key={view.videoId} lang={lang} t={t} initial={view.guess} locked={false} onSubmit={(n) => send({ type: 'guess', value: n })}
            onDraft={(n) => send({ type: 'guessDraft', draft: true, value: n })} deadline={view.deadline} />
          {view.canExtend && (
            <button type="button" className={`up-btn full ${view.wantsExtend ? 'cyan' : 'ghost'}`} aria-pressed={view.wantsExtend}
              onClick={() => send({ type: 'extend', on: !view.wantsExtend })} style={{ minHeight: 52, fontSize: 17 }}>
              {view.wantsExtend ? t('extend.on', { n: view.extendVotes, need: view.extendNeeded }) : t('extend.ask', { n: view.extendVotes, need: view.extendNeeded })}
            </button>
          )}
          {view.guess != null && (
            <p role="status" style={{ textAlign: 'center', fontSize: 15 }}>
              <b style={{ color: 'var(--green)' }}>✓ {t('guess.done')}: {fmt(view.guess, lang)}</b><br /><span className="muted">{t('guess.change')}</span>
            </p>
          )}
        </>
      );
    case 'result':
      if (view.doneAt && now < view.doneAt) return <PhoneWait title={t('lookAtTv')} text={view.guess != null ? `${t('guess.yours')}: ${fmt(view.guess, lang)}` : undefined} emoji={<Avatar player={me} size={96} />} />;
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
