import { useEffect, useState } from 'react';
import type { ControllerViewProps, GameClientModule, HostViewProps, PlayerInfo, Translate } from '@up/sdk';
import { Avatar, ChoiceList, Confetti, HostHeader, HostTimer, PhoneTimer, PhoneWait, Podium, Scoreboard, TextAnswer, VoterChips, sfx } from '@up/ui';

const CYAN = '#36D6F5';

/** Frage mit hervorgehobener Lücke „___“ */
function Question({ text, fill, size = 44 }: { text: string; fill?: string; size?: number }) {
  const [before, after] = text.split('___');
  return (
    <h1 style={{ fontSize: size, fontWeight: 800, lineHeight: 1.2, textAlign: 'center' }}>
      {before}
      <span style={{ display: 'inline-block', minWidth: fill ? undefined : '3.2em', borderBottom: `${Math.round(size / 9)}px solid var(--yellow)`, color: 'var(--yellow)', padding: '0 .15em', lineHeight: 1 }}>{fill ?? ' '}</span>
      {after}
    </h1>
  );
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
          <span className="up-tag anim-pop" style={{ background: CYAN, color: '#110D24', boxShadow: '0 8px 0 #1A97B0', fontSize: 80, padding: '12px 40px', borderRadius: 26, transform: 'rotate(-3deg)' }}>{t('intro.title')}</span>
          <p className="anim-up" style={{ fontSize: 28, maxWidth: 900, lineHeight: 1.35, animationDelay: '.4s' }}>{t('intro.text')}</p>
          <p className="muted anim-up" style={{ fontSize: 22, animationDelay: '.8s' }}>{t('intro.points')}</p>
        </div>
      );
    case 'write': {
      const done = new Set<string>(view.done);
      const ps: PlayerInfo[] = view.players.map((id: string) => player(id)).filter(Boolean);
      return (
        <>
          <HostHeader title={t('title')} color={CYAN} info={info(view, t)} right={<HostTimer deadline={view.deadline} duration={view.duration} />} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 40 }}>
            <div className="anim-up"><Question text={view.question} /></div>
            <p className="muted" style={{ textAlign: 'center', fontSize: 24 }}>{t('write.title')}</p>
          </div>
          <div style={{ display: 'flex', gap: 18, justifyContent: 'center', flexWrap: 'wrap', paddingBottom: 10 }}>
            {ps.map((p) => (
              <div key={p.id} style={{ position: 'relative', animation: done.has(p.id) ? 'upPop .4s ease-out' : undefined }}>
                <Avatar player={p} size={64} dim={!done.has(p.id)} />
                {done.has(p.id) && <span style={{ position: 'absolute', right: -6, bottom: -4, width: 26, height: 26, borderRadius: '50%', background: 'var(--green)', color: '#110D24', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</span>}
              </div>
            ))}
          </div>
        </>
      );
    }
    case 'choose': {
      const n = view.options.length;
      const cols = n <= 4 ? 2 : 3;
      return (
        <>
          <HostHeader title={t('title')} color={CYAN} info={info(view, t)} right={<HostTimer deadline={view.deadline} duration={view.duration} />} />
          <Question text={view.question} size={34} />
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 16, alignContent: 'center' }}>
            {view.options.map((o: any, i: number) => (
              <div key={o.id} style={{ background: 'var(--surface)', borderRadius: 24, padding: '22px 24px', minHeight: 90, display: 'flex', alignItems: 'center', boxShadow: '0 6px 0 #0A0716', animation: `upPop .45s ease-out ${(i * 0.1).toFixed(2)}s both` }}>
                <p className="display" style={{ fontSize: 28, fontWeight: 800 }}>{o.text}</p>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <span className="up-chip" style={{ fontSize: 17 }}>{t('choose.count', { n: view.picked, total: view.choosers })}</span>
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
          <HostHeader title={t('title')} color={CYAN} info={t('scores.title')} />
          <h1 style={{ fontSize: 36 }}>{t('scores.title')}</h1>
          <Scoreboard rows={rows} />
        </>
      );
    }
    case 'final':
      return (
        <>
          <HostHeader title={t('title')} color={CYAN} info={t('final.title')} />
          <Podium ranking={view.ranking} player={player} pointsLabel={t('common.points')} />
        </>
      );
  }
  return null;
}

function HostReveal({ view, t, player }: HostViewProps) {
  const items = view.items as any[];
  const [i, setI] = useState(0);
  const [stamp, setStamp] = useState(false);
  useEffect(() => {
    setI(0);
    setStamp(false);
  }, [view.n]);
  useEffect(() => {
    setStamp(false);
    sfx.play('reveal');
    const a = setTimeout(() => {
      setStamp(true);
      sfx.play(items[i]?.kind === 'truth' ? 'ding' : 'stamp');
    }, 1300);
    const b = setTimeout(() => setI((x) => Math.min(items.length - 1, x + 1)), view.step * 1000);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [i, items.length, view.step]);
  const it = items[i];
  if (!it) return null;
  const pickers: PlayerInfo[] = it.pickers.map((id: string) => player(id)).filter(Boolean);
  const truth = it.kind === 'truth';
  const authors: PlayerInfo[] = it.authors.map((id: string) => player(id)).filter(Boolean);
  return (
    <>
      {stamp && truth && pickers.length > 0 && <Confetti />}
      <HostHeader title={t('title')} color={CYAN} info={info(view, t)} />
      <Question text={view.question} size={32} fill={stamp && truth ? it.text : undefined} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
        <div key={it.id} className="anim-pop" style={{
          position: 'relative', minWidth: 560, maxWidth: 900, padding: '34px 48px', borderRadius: 32, textAlign: 'center',
          background: stamp ? (truth ? 'var(--green)' : 'var(--surface-2)') : 'var(--surface)', color: stamp && truth ? '#110D24' : '#fff',
          boxShadow: `0 10px 0 ${stamp && truth ? 'var(--green-d)' : '#0A0716'}`, transition: 'background .3s',
        }}>
          <p className="display" style={{ fontSize: 48, fontWeight: 800 }}>{it.text}</p>
          {stamp && (
            <span className="up-tag" style={{
              position: 'absolute', top: -24, right: -18, fontSize: 24, animation: 'upBadge .5s ease-out both',
              background: truth ? 'var(--yellow)' : 'var(--red)', color: truth ? '#110D24' : '#fff', boxShadow: `0 5px 0 ${truth ? 'var(--yellow-d)' : 'var(--red-d)'}`,
            }}>{truth ? t('reveal.truth') : it.kind === 'house' ? t('reveal.house') : t('reveal.lie')}</span>
          )}
        </div>
        <div style={{ minHeight: 50 }}>
          {pickers.length ? <VoterChips voters={pickers} crowdSize={Math.min(10, pickers.length)} /> : <span className="faint" style={{ fontSize: 18 }}>{t('reveal.nobody')}</span>}
        </div>
        <div style={{ minHeight: 64 }}>
          {stamp && !truth && authors.length > 0 && (
            <div className="anim-up" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              {authors.map((a) => <Avatar key={a.id} player={a} size={56} />)}
              <span className="display" style={{ fontSize: 28, fontWeight: 800 }}>{authors.map((a) => a.name).join(' & ')}</span>
              {it.points > 0 && <span className="display" style={{ fontSize: 36, fontWeight: 800, color: 'var(--yellow)', animation: 'upPop .5s ease-out .3s both' }}>+{it.points}</span>}
            </div>
          )}
          {stamp && truth && (
            <div className="anim-up" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              {pickers.length > 0 && <span className="display" style={{ fontSize: 34, fontWeight: 800, color: 'var(--yellow)' }}>+{it.points}</span>}
              {view.source && <span className="faint" style={{ fontSize: 15 }}>{t('reveal.source', { source: view.source })}</span>}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ================= Handy ================= */

function Controller({ view, t, send, me }: ControllerViewProps) {
  const [showResult, setShowResult] = useState(false);
  useEffect(() => {
    if (view.screen !== 'result') return setShowResult(false);
    const id = setTimeout(() => setShowResult(true), Math.max(1500, view.revealAt * 1000 + 1500));
    return () => clearTimeout(id);
  }, [view.screen, view.revealAt]);

  switch (view.screen) {
    case 'intro':
      return <PhoneWait title={t('intro.title')} text={t('lookAtTv')} emoji={<Avatar player={me} size={96} />} />;
    case 'write':
      return (
        <>
          <PhoneTimer deadline={view.deadline} duration={view.duration} hurryText={t('timer.hurry')} />
          <span className="up-label">{t('write.title')}</span>
          <Question text={view.question} size={24} />
          <TextAnswer key={view.attempt} button={t('write.send')} placeholder={t('write.input')} maxLength={40}
            error={view.error ? t(view.error === 'tooClose' ? 'write.tooClose' : 'write.duplicate') : null}
            onSubmit={(text) => send({ type: 'lie', text })} />
        </>
      );
    case 'written':
      return <PhoneWait title={t('written.title')} text={t('written.text')} emoji={<span className="display" style={{ fontSize: 26, fontWeight: 800, color: 'var(--yellow)' }}>„{view.lie}“</span>} />;
    case 'audienceWait':
      return <PhoneWait title={t('game.audience')} text={t('audience.wait')} emoji={<Avatar player={me} size={96} />} />;
    case 'choose':
      return (
        <>
          <PhoneTimer deadline={view.deadline} duration={view.duration} hurryText={view.selected ? undefined : t('timer.hurry')} />
          <span className="up-label">{t('choose.title')}</span>
          <Question text={view.question} size={20} />
          <ChoiceList options={view.options} selected={view.selected} onPick={(id) => send({ type: 'pick', option: id })} />
          <p className="muted" style={{ textAlign: 'center', marginTop: 'auto' }}>{view.selected ? `${t('choose.done')} · ${t('choose.change')}` : t('choose.pick')}</p>
        </>
      );
    case 'result':
      if (!showResult) return <PhoneWait title={t('lookAtTv')} emoji={<Avatar player={me} size={96} />} />;
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, textAlign: 'center' }} className="anim-fade">
          {view.found && <Confetti pieces={14} />}
          <Avatar player={me} size={110} />
          <h1 style={{ fontSize: 30 }}>{view.picked == null ? t('lookAtTv') : view.found ? t('result.found') : t('result.missed')}</h1>
          {view.fooled > 0 && <p style={{ fontSize: 19 }}>{t('result.fooled', { n: view.fooled })}</p>}
          <span className="display" style={{ fontSize: 60, fontWeight: 800, color: 'var(--yellow)', textShadow: '0 6px 0 var(--yellow-d)', animation: 'upPop .6s ease-out both' }}>+{view.points}</span>
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
