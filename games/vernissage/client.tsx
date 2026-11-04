import { useCallback, useEffect, useRef, useState } from 'react';
import type { ControllerViewProps, GameClientModule, HostViewProps, PlayerInfo, Translate } from '@up/sdk';
import {
  Avatar, ChoiceList, Confetti, DrawCanvas, Drawing, HostHeader, HostTimer, PhoneTimer, PhoneWait, Podium, Scoreboard, TextAnswer, VoterChips, type Stroke, sfx, useDraft } from '@up/ui';

const YELLOW = '#FFD447';

function info(view: any, t: Translate) {
  const r = view.totalRounds > 1 ? `${t('round', { n: view.round, total: view.totalRounds })} · ` : '';
  return view.n ? `${r}${t('drawing', { n: view.n, total: view.total })}` : r.replace(/ · $/, '');
}

function ArtistTag({ id, t, player }: { id: string; t: Translate; player: HostViewProps['player'] }) {
  const p = player(id);
  if (!p) return null;
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Avatar player={p} size={40} /> <span className="muted" style={{ fontSize: 18 }}>{t('reveal.artist')}</span> <b style={{ fontSize: 20 }}>{p.name}</b>
    </span>
  );
}

/* ================= TV ================= */

function Host(props: HostViewProps) {
  const { view, t, player } = props;
  switch (view.screen) {
    case 'intro':
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28, textAlign: 'center' }}>
          <span className="up-tag anim-pop" style={{ background: YELLOW, color: '#110D24', boxShadow: '0 8px 0 #C79E1A', fontSize: 80, padding: '12px 40px', borderRadius: 26, transform: 'rotate(-3deg)' }}>{t('intro.title')}</span>
          <p className="anim-up" style={{ fontSize: 28, maxWidth: 940, lineHeight: 1.35, animationDelay: '.4s' }}>{t('intro.text')}</p>
          <p className="muted anim-up" style={{ fontSize: 20, animationDelay: '.8s' }}>{t('intro.points')}</p>
        </div>
      );
    case 'draw': {
      const done = new Set<string>(view.done);
      const ps: PlayerInfo[] = view.players.map((id: string) => player(id)).filter(Boolean);
      return (
        <>
          <HostHeader title={t('title')} color={YELLOW} info={info(view, t)} right={<HostTimer deadline={view.deadline} duration={view.duration} />} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 40 }}>
            <h1 className="anim-pop" style={{ fontSize: 72 }}>{t('draw.title')}</h1>
            <p className="muted" style={{ fontSize: 24 }}>{t('draw.onPhone')}</p>
            <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', justifyContent: 'center' }}>
              {ps.map((p, i) => (
                <div key={p.id} style={{ position: 'relative', animation: done.has(p.id) ? 'upPop .4s ease-out' : `upFloat 3s ease-in-out ${(-0.4 * i).toFixed(1)}s infinite` }}>
                  <Avatar player={p} size={76} dim={!done.has(p.id)} />
                  {done.has(p.id) && <span style={{ position: 'absolute', right: -6, bottom: -4, width: 30, height: 30, borderRadius: '50%', background: 'var(--green)', color: '#110D24', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</span>}
                </div>
              ))}
            </div>
          </div>
        </>
      );
    }
    case 'title': {
      const done = new Set<string>(view.done);
      const ps: PlayerInfo[] = view.players.map((id: string) => player(id)).filter(Boolean);
      return (
        <>
          <HostHeader title={t('title')} color={YELLOW} info={info(view, t)} right={<HostTimer deadline={view.deadline} duration={view.duration} />} />
          <div style={{ flex: 1, display: 'flex', gap: 48, alignItems: 'center' }}>
            <Drawing strokes={view.strokes} size={520} style={{ boxShadow: '0 10px 0 #C79E1A', animation: 'upPop .6s ease-out both' }} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 28 }}>
              <h1 style={{ fontSize: 56 }}>{t('title.ask')}</h1>
              <p style={{ fontSize: 24 }}>{t('title.write')}</p>
              <ArtistTag id={view.artistId} t={t} player={player} />
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                {ps.map((p) => <Avatar key={p.id} player={p} size={52} dim={!done.has(p.id)} />)}
              </div>
            </div>
          </div>
        </>
      );
    }
    case 'choose':
      return (
        <>
          <HostHeader title={t('title')} color={YELLOW} info={info(view, t)} right={<HostTimer deadline={view.deadline} duration={view.duration} />} />
          <div style={{ flex: 1, display: 'flex', gap: 40, alignItems: 'center' }}>
            <Drawing strokes={view.strokes} size={480} style={{ boxShadow: '0 10px 0 #C79E1A' }} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <h2 style={{ fontSize: 34 }}>{t('choose.title')}</h2>
              {view.options.map((o: any, i: number) => (
                <div key={o.id} style={{ background: 'var(--surface)', borderRadius: 20, padding: '14px 20px', boxShadow: '0 5px 0 #0A0716', animation: `upPop .45s ease-out ${(i * 0.1).toFixed(2)}s both` }}>
                  <p className="display" style={{ fontSize: 24, fontWeight: 800 }}>{o.text}</p>
                </div>
              ))}
              <span className="up-chip" style={{ alignSelf: 'flex-start', fontSize: 16 }}>{t('choose.count', { n: view.picked, total: view.choosers })}</span>
            </div>
          </div>
        </>
      );
    case 'reveal':
      return <HostReveal {...props} />;
    case 'scores': {
      const rows = Object.keys(view.after).map((id) => ({ player: player(id)!, before: view.before[id] ?? 0, after: view.after[id] })).filter((r) => r.player);
      return (
        <>
          <HostHeader title={t('title')} color={YELLOW} info={t('scores.title')} />
          <h1 style={{ fontSize: 36 }}>{t('scores.title')}</h1>
          <Scoreboard rows={rows} />
        </>
      );
    }
    case 'final':
      return (
        <>
          <HostHeader title={t('title')} color={YELLOW} info={t('final.title')} />
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
  }, [view.n, view.round]);
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
  const truth = it.kind === 'truth';
  const pickers: PlayerInfo[] = it.pickers.map((id: string) => player(id)).filter(Boolean);
  const authors: PlayerInfo[] = it.authors.map((id: string) => player(id)).filter(Boolean);
  const artist = player(view.artistId);
  return (
    <>
      {stamp && truth && pickers.length > 0 && <Confetti />}
      <HostHeader title={t('title')} color={YELLOW} info={info(view, t)} />
      <div style={{ flex: 1, display: 'flex', gap: 48, alignItems: 'center' }}>
        <Drawing strokes={view.strokes} size={480} style={{ boxShadow: '0 10px 0 #C79E1A' }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }}>
          <div key={it.id} className="anim-pop" style={{
            position: 'relative', width: '100%', padding: '28px 32px', borderRadius: 28, textAlign: 'center',
            background: stamp ? (truth ? 'var(--green)' : 'var(--surface-2)') : 'var(--surface)', color: stamp && truth ? '#110D24' : '#fff',
            boxShadow: `0 10px 0 ${stamp && truth ? 'var(--green-d)' : '#0A0716'}`, transition: 'background .3s',
          }}>
            <p className="display" style={{ fontSize: 40, fontWeight: 800 }}>{it.text}</p>
            {stamp && (
              <span className="up-tag" style={{ position: 'absolute', top: -24, right: -14, fontSize: 22, animation: 'upBadge .5s ease-out both', background: truth ? 'var(--yellow)' : 'var(--red)', color: truth ? '#110D24' : '#fff', boxShadow: `0 5px 0 ${truth ? 'var(--yellow-d)' : 'var(--red-d)'}` }}>
                {truth ? t('reveal.truth') : it.kind === 'house' ? t('reveal.house') : t('reveal.lie')}
              </span>
            )}
          </div>
          <div style={{ minHeight: 48 }}>
            {pickers.length ? <VoterChips voters={pickers} crowdSize={Math.min(10, pickers.length)} /> : <span className="faint" style={{ fontSize: 18 }}>{t('reveal.nobody')}</span>}
          </div>
          <div style={{ minHeight: 60 }}>
            {stamp && !truth && authors.length > 0 && (
              <div className="anim-up" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {authors.map((a) => <Avatar key={a.id} player={a} size={52} />)}
                <span className="display" style={{ fontSize: 26, fontWeight: 800 }}>{authors.map((a) => a.name).join(' & ')}</span>
                {it.points > 0 && <span className="display" style={{ fontSize: 34, fontWeight: 800, color: 'var(--yellow)', animation: 'upPop .5s ease-out .3s both' }}>+{it.points}</span>}
              </div>
            )}
            {stamp && truth && artist && (
              <div className="anim-up" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Avatar player={artist} size={52} />
                <span className="display" style={{ fontSize: 26, fontWeight: 800 }}>{artist.name}</span>
                {view.artistPoints > 0 && <span className="display" style={{ fontSize: 34, fontWeight: 800, color: 'var(--yellow)' }}>+{view.artistPoints}</span>}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/* ================= Handy ================= */

function DrawScreen({ view, t, send }: ControllerViewProps) {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const latest = useRef<Stroke[]>([]);
  const onChange = useCallback((s: Stroke[]) => {
    latest.current = s;
    setStrokes(s);
  }, []);
  // Zwischenstand automatisch übertragen – auch mehrmals kurz vor Ablauf und mit dem gerade gezeichneten Strich
  useDraft(strokes, (s) => send({ type: 'sketch', draft: true, strokes: s }), view.deadline, { debounceMs: 800 });
  return (
    <>
      <PhoneTimer deadline={view.deadline} duration={view.duration} hurryText={t('timer.hurry')} />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span className="up-label">{t('draw.yourWord')}</span>
        <h1 style={{ fontSize: 26 }}>{view.word}</h1>
      </div>
      <DrawCanvas onChange={onChange} labels={{ undo: t('draw.undo'), thin: t('draw.thin'), thick: t('draw.thick'), clear: t('draw.clear'), clearConfirm: t('draw.clearConfirm'), eraser: t('draw.eraser') }} />
      <button className="up-btn big full" onClick={() => latest.current.length && send({ type: 'drawing', strokes: latest.current })}>{t('draw.done')}</button>
    </>
  );
}

function Controller(props: ControllerViewProps) {
  const { view, t, send, me } = props;
  const [showResult, setShowResult] = useState(false);
  useEffect(() => {
    if (view.screen !== 'result') return setShowResult(false);
    const id = setTimeout(() => setShowResult(true), Math.max(1500, view.revealAt * 1000 + 1500));
    return () => clearTimeout(id);
  }, [view.screen, view.revealAt]);

  switch (view.screen) {
    case 'intro':
      return <PhoneWait title={t('intro.title')} text={t('lookAtTv')} emoji={<Avatar player={me} size={96} />} />;
    case 'draw':
      return <DrawScreen {...props} />;
    case 'drawn':
      return <PhoneWait title={t('drawn.title')} text={t('drawn.text')} emoji={<Drawing strokes={view.strokes} size={220} />} />;
    case 'title':
      return (
        <>
          <PhoneTimer deadline={view.deadline} duration={view.duration} hurryText={t('timer.hurry')} />
          <Drawing strokes={view.strokes} size={240} style={{ alignSelf: 'center' }} />
          <span className="up-label">{t('title.write')}</span>
          <TextAnswer key={view.attempt} button={t('title.send')} placeholder={t('title.input')} maxLength={40}
            error={view.error ? t(view.error === 'tooClose' ? 'title.tooClose' : 'title.duplicate') : null}
            onSubmit={(text) => send({ type: 'title', text })}
            onDraft={(text) => send({ type: 'titleDraft', draft: true, text })} deadline={view.deadline} />
        </>
      );
    case 'titled':
      return <PhoneWait title={t('title.sent')} emoji={<span className="display" style={{ fontSize: 24, fontWeight: 800, color: 'var(--yellow)' }}>„{view.title}“</span>} />;
    case 'yours':
      return <PhoneWait title={t('yours.title')} text={t('yours.text')} emoji={<Drawing strokes={view.strokes} size={220} />} />;
    case 'audienceWait':
      return <PhoneWait title={t('game.audience')} text={t('audience.wait')} emoji={<Avatar player={me} size={96} />} />;
    case 'choose':
      return (
        <>
          <PhoneTimer deadline={view.deadline} duration={view.duration} hurryText={view.selected ? undefined : t('timer.hurry')} />
          <Drawing strokes={view.strokes} size={160} style={{ alignSelf: 'center' }} />
          <span className="up-label">{t('choose.title')}</span>
          <ChoiceList options={view.options} selected={view.selected} onPick={(id) => send({ type: 'pick', option: id })} />
          <p className="muted" style={{ textAlign: 'center', marginTop: 'auto' }}>{view.selected ? `${t('choose.done')} · ${t('choose.change')}` : t('choose.pick')}</p>
        </>
      );
    case 'result':
      if (!showResult) return <PhoneWait title={t('lookAtTv')} emoji={<Avatar player={me} size={96} />} />;
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, textAlign: 'center' }} className="anim-fade">
          {(view.found || (view.isArtist && view.finders > 0)) && <Confetti pieces={14} />}
          <Avatar player={me} size={110} />
          <h1 style={{ fontSize: 30 }}>{view.isArtist ? t(view.finders === 0 ? 'result.artist0' : view.finders === 1 ? 'result.artist1' : 'result.artist', { n: view.finders }) : view.picked == null ? t('lookAtTv') : view.found ? t('result.found') : t('result.missed')}</h1>
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
