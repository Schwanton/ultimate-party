import { useEffect, useMemo, useState } from 'react';
import type { ControllerViewProps, GameClientModule, HostViewProps, PlayerInfo, Translate } from '@up/sdk';
import { Avatar, Confetti, Crown, HostHeader, HostTimer, PhoneTimer, PhoneWait, Podium, Scoreboard, sfx, useDraft, useServerNow, vibrate } from '@up/ui';
import { Strahl } from './strahl';

const GREEN = '#4BE3A1';
const GREEN_D = '#1E9E6A';

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

function info(view: any, t: Translate) {
  return `${t('question', { n: view.n, total: view.total })}${view.mult > 1 ? ' · ' + t('mult', { n: view.mult }) : ''}`;
}

/* ================= TV ================= */

function Host(props: HostViewProps) {
  const { view, t, player } = props;
  switch (view.screen) {
    case 'intro':
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28, textAlign: 'center' }}>
          <span className="up-tag anim-pop" style={{ background: GREEN, color: '#110D24', boxShadow: `0 8px 0 ${GREEN_D}`, fontSize: 80, padding: '12px 40px', borderRadius: 26, transform: 'rotate(-3deg)' }}>{t('title')}</span>
          <p className="anim-up" style={{ fontSize: 28, maxWidth: 900, lineHeight: 1.35, animationDelay: '.4s' }}>{t('intro.text')}</p>
          <p className="muted anim-up" style={{ fontSize: 22, animationDelay: '.8s' }}>{t('intro.points')}</p>
        </div>
      );
    case 'guess': {
      const done = new Set<string>(view.done);
      const ps = (view.players as string[]).map((id) => player(id)).filter(Boolean) as PlayerInfo[];
      const many = ps.length > 24;
      return (
        <>
          <HostHeader title={t('title')} color={GREEN} info={info(view, t)} right={<HostTimer deadline={view.deadline} duration={view.duration} />} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 26, textAlign: 'center' }}>
            <h1 key={view.n} className="anim-up" style={{ fontSize: 56, fontWeight: 800, maxWidth: 1080, lineHeight: 1.15 }}>{view.question}</h1>
            {view.unit && <span className="up-tag" style={{ background: GREEN, color: '#110D24', boxShadow: `0 5px 0 ${GREEN_D}`, fontSize: 24 }}>{t('guess.unit', { unit: view.unit })}</span>}
          </div>
          {many ? (
            <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 10 }}>
              <span className="up-chip" style={{ fontSize: 18 }}>{t('guess.count', { n: done.size, total: ps.length })}</span>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', paddingBottom: 10 }}>
              {ps.map((p) => (
                <div key={p.id} style={{ position: 'relative', animation: done.has(p.id) ? 'upPop .4s ease-out' : undefined }}>
                  <Avatar player={p} size={ps.length > 12 ? 48 : 60} dim={!done.has(p.id)} />
                  {done.has(p.id) && <span style={{ position: 'absolute', right: -6, bottom: -4, width: 24, height: 24, borderRadius: '50%', background: 'var(--green)', color: '#110D24', fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</span>}
                </div>
              ))}
            </div>
          )}
        </>
      );
    }
    case 'reveal':
      return <HostReveal {...props} />;
    case 'scores': {
      const rows = Object.keys(view.after).map((id) => ({ player: player(id)!, before: view.before[id] ?? 0, after: view.after[id] })).filter((r) => r.player);
      return (
        <>
          <HostHeader title={t('title')} color={GREEN} info={t('scores.title')} />
          <h1 style={{ fontSize: 36 }}>{t('scores.title')}</h1>
          <Scoreboard rows={rows} />
        </>
      );
    }
    case 'final':
      return (
        <>
          <HostHeader title={t('title')} color={GREEN} info={t('final.title')} />
          <Podium ranking={view.ranking} player={player} pointsLabel={t('common.points')} />
        </>
      );
  }
  return null;
}

interface Entry { playerId: string; guess: number; diff: number; place: number; points: number }

/**
 * Zahlenstrahl: Die Säule fährt hoch, Tipps erscheinen beim Erreichen, an der echten Zahl wird kurz angehalten,
 * danach geht es weiter bis zum höchsten Tipp. Die Skala wächst mit.
 */
function HostReveal({ view, t, player, room }: HostViewProps) {
  const lang = room.lang;
  const entries = (view.entries as Entry[]).filter((e) => player(e.playerId));
  const podium = entries.filter((e) => e.place <= 3).sort((a, b) => a.place - b.place);
  const medal = ['🥇', '🥈', '🥉'];
  return (
    <>
      <HostHeader title={t('title')} color={GREEN} info={info(view, t)} />
      <Strahl
        answer={view.answer} startAt={view.startAt} player={player} color={GREEN}
        entries={entries.map((e) => ({ playerId: e.playerId, guess: e.guess, win: e.place === 1, badge: e.points ? `+${e.points}` : undefined }))}
        short={(n) => short(n, lang, t)}
        answerText={`${fmt(view.answer, lang)}${view.unit ? ` ${view.unit}` : ''}`}
        labels={{ placing: t('reveal.placing'), zoom: t('reveal.zoom'), out: (names) => t('reveal.out', { names }), drum: t('reveal.drum'), answer: t('reveal.answer') }}
      >
        {(phase) => (
          <div style={{ width: 600, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p className="display" style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.2 }}>{view.question}</p>
            {phase === 'done' && (
              <div className="anim-pop" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {podium.length === 0 && <b style={{ fontSize: 18 }}>{t('reveal.noGuess')}</b>}
                {podium.slice(0, 4).map((e) => {
                  const p = player(e.playerId)!;
                  return (
                    <span key={e.playerId} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: e.place === 1 ? GREEN : 'var(--surface)', color: e.place === 1 ? '#110D24' : '#fff', borderRadius: 14, padding: '5px 12px 5px 6px' }}>
                      <span style={{ fontSize: 20 }}>{medal[e.place - 1]}</span>
                      <Avatar player={p} size={28} flat={e.place === 1} />
                      <b style={{ fontSize: 15 }}>{p.name}{e.diff === 0 ? ` · ${t('reveal.exact')}` : ''}</b>
                      <b className="display" style={{ fontSize: 16 }}>+{e.points}</b>
                    </span>
                  );
                })}
                {view.source && <span className="faint" style={{ fontSize: 13, width: '100%' }}>{t('reveal.source', { source: view.source })}</span>}
              </div>
            )}
          </div>
        )}
      </Strahl>
    </>
  );
}

/* ================= Handy ================= */

function Keypad({ lang, t, initial, unit, onSubmit, onDraft, deadline }: { lang: string; t: Translate; initial: number | null; unit: string; onSubmit: (n: number) => void; onDraft?: (n: number | null) => void; deadline?: number }) {
  const [digits, setDigits] = useState(initial != null ? String(initial) : '');
  const value = digits ? Number(digits) : 0;
  // Eingetippte Zahl automatisch übertragen – zählt bei Zeitablauf, auch ohne „Abschicken“
  useDraft(digits ? value : null, onDraft, deadline);
  const press = (d: string) => {
    vibrate(8);
    setDigits((cur) => {
      const next = (cur === '0' ? '' : cur) + d;
      return next.length > 12 ? cur : next.replace(/^0+(?=\d)/, '');
    });
  };
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', '⌫'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="up-card" style={{ textAlign: 'center', padding: '12px 16px' }}>
        <div className="display" style={{ fontSize: digits.length > 9 ? 34 : 42, fontWeight: 800, fontVariantNumeric: 'tabular-nums', minHeight: 50 }}>{digits ? fmt(value, lang) : '0'}{unit ? <span style={{ fontSize: 20, opacity: 0.7 }}> {unit}</span> : null}</div>
        <div className="muted" style={{ fontSize: 15, minHeight: 20 }}>{value >= 1e4 ? short(value, lang, t) : ' '}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        {keys.map((k) => (
          <button key={k} type="button" className="up-btn ghost" style={{ minHeight: 52, fontSize: 24 }} aria-label={k === '⌫' ? t('guess.delete') : k}
            onClick={() => (k === '⌫' ? setDigits((c) => c.slice(0, -1)) : press(k))}>{k}</button>
        ))}
      </div>
      <button type="button" className="up-btn big full" disabled={!digits} onClick={() => onSubmit(value)}>{t('guess.send')}</button>
    </div>
  );
}

function Controller({ view, t, send, me, room }: ControllerViewProps) {
  const now = useServerNow(250);
  const [editing, setEditing] = useState(false);
  useEffect(() => setEditing(false), [view.n, view.guess]);
  const lang = room.lang;
  switch (view.screen) {
    case 'intro':
      return <PhoneWait title={t('title')} text={t('lookAtTv')} emoji={<Avatar player={me} size={96} />} />;
    case 'guess':
      if (view.guess != null && !editing) {
        return (
          <>
            <PhoneTimer deadline={view.deadline} duration={view.duration} />
            <PhoneWait title={t('guess.saved')} text={`${fmt(view.guess, lang)}${view.unit ? ' ' + view.unit : ''}`} emoji={<Avatar player={me} size={96} />} />
            <button className="up-btn ghost full" onClick={() => setEditing(true)}>{t('guess.change')}</button>
          </>
        );
      }
      return (
        <>
          <PhoneTimer deadline={view.deadline} duration={view.duration} hurryText={t('timer.hurry')} />
          <h1 style={{ fontSize: 21, lineHeight: 1.25 }}>{view.question}</h1>
          <Keypad key={`${view.n}`} lang={lang} t={t} initial={view.guess} unit={view.unit} onSubmit={(n) => send({ type: 'guess', value: n })}
            onDraft={(n) => send({ type: 'guessDraft', draft: true, value: n })} deadline={view.deadline} />
        </>
      );
    case 'result':
      if (now < view.doneAt) return <PhoneWait title={t('lookAtTv')} emoji={<Avatar player={me} size={96} />} />;
      return (
        <div className="anim-fade" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, textAlign: 'center' }}>
          {view.place === 1 && <Confetti pieces={14} />}
          <Avatar player={me} size={100} />
          <p className="muted" style={{ fontSize: 16 }}>{t('reveal.answer')}</p>
          <h1 style={{ fontSize: 34 }}>{fmt(view.answer, lang)} {view.unit}</h1>
          <p style={{ fontSize: 18 }}>{view.guess != null ? t('result.yours', { n: `${fmt(view.guess, lang)} ${view.unit}`.trim() }) : t('result.none')}</p>
          {view.place != null && <p style={{ fontSize: 18, fontWeight: 700 }}>{view.exact ? t('reveal.exact') + ' · ' : ''}{t('result.place', { n: view.place })}</p>}
          <span className="display" style={{ fontSize: 56, fontWeight: 800, color: 'var(--yellow)', textShadow: '0 6px 0 var(--yellow-d)', animation: 'upPop .6s ease-out both' }}>+{view.points}</span>
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
