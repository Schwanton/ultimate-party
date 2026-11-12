import { useEffect, useState } from 'react';
import type { ControllerViewProps, GameClientModule, HostViewProps, PlayerInfo, Translate } from '@up/sdk';
import { Avatar, Confetti, HostHeader, HostTimer, PhoneTimer, PhoneWait, Podium, Scoreboard, TextAnswer, sfx, useServerNow } from '@up/ui';
import { voterSchedule, votersSeconds } from './timing';

const PINK = '#FF6FB5';

function info(view: any, t: Translate) {
  const r = t('round', { n: view.round, total: view.totalRounds });
  return `${r}${view.n ? ' · ' + t('answerOf', { n: view.n, total: view.of }) : ''}${view.mult > 1 ? ' · ' + t('mult', { n: view.mult }) : ''}`;
}

function useElapsed(key: unknown, until: number) {
  const [start] = useState(() => ({ key, at: Date.now() }));
  const [, tick] = useState(0);
  if (start.key !== key) {
    start.key = key;
    start.at = Date.now();
  }
  const elapsed = (Date.now() - start.at) / 1000;
  const running = elapsed <= until;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => tick((n) => n + 1), 60);
    return () => clearInterval(id);
  }, [key, running]);
  return elapsed;
}

function Quote({ text, size = 46 }: { text: string; size?: number }) {
  return (
    <div className="anim-pop" style={{ position: 'relative', background: '#fff', color: '#110D24', borderRadius: 30, padding: '30px 44px', maxWidth: 1000, margin: '0 auto', boxShadow: `0 10px 0 ${PINK}` }}>
      <span className="display" style={{ position: 'absolute', top: -34, left: 22, fontSize: 96, color: PINK, lineHeight: 1 }}>“</span>
      <p className="display" style={{ fontSize: size, fontWeight: 800, lineHeight: 1.2, textAlign: 'center' }}>{text}</p>
    </div>
  );
}

/* ================= TV ================= */

function Host(props: HostViewProps) {
  const { view, t, player } = props;
  switch (view.screen) {
    case 'intro':
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28, textAlign: 'center' }}>
          <span className="up-tag anim-pop" style={{ background: PINK, color: '#110D24', boxShadow: '0 8px 0 #B83F7C', fontSize: 80, padding: '12px 40px', borderRadius: 26, transform: 'rotate(-3deg)' }}>{t('title')}</span>
          <p className="anim-up" style={{ fontSize: 28, maxWidth: 900, lineHeight: 1.35, animationDelay: '.4s' }}>{t('intro.text')}</p>
          <p className="muted anim-up" style={{ fontSize: 22, animationDelay: '.8s' }}>{t('intro.points')}</p>
        </div>
      );
    case 'write': {
      const done = new Set<string>(view.done);
      const ps = (view.players as string[]).map((id) => player(id)).filter(Boolean) as PlayerInfo[];
      return (
        <>
          <HostHeader title={t('title')} color={PINK} info={info(view, t)} right={<HostTimer deadline={view.deadline} duration={view.duration} />} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 30, textAlign: 'center' }}>
            <span className="up-label" style={{ fontSize: 20 }}>{t('write.label')}</span>
            <h1 className="anim-up" style={{ fontSize: 54, fontWeight: 800, maxWidth: 1050, lineHeight: 1.15 }}>{view.question}</h1>
            <p className="muted" style={{ fontSize: 22 }}>{t('write.hint')}</p>
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
    case 'assign': {
      const n = (view.answers as string[]).length;
      const cols = n > 6 ? 3 : 2;
      const size = n > 6 ? 21 : 25;
      return (
        <>
          <HostHeader title={t('title')} color={PINK} info={info(view, t)} right={<HostTimer deadline={view.deadline} duration={view.duration} />} />
          <p className="display muted" style={{ textAlign: 'center', fontSize: 24, fontWeight: 700 }}>{view.question}</p>
          <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: '14px 18px', alignContent: 'center' }}>
            {(view.answers as string[]).map((text, i) => (
              <div key={i} style={{ background: '#fff', color: '#110D24', borderRadius: 20, padding: '12px 16px', boxShadow: `0 6px 0 ${PINK}`, display: 'flex', gap: 12, alignItems: 'center', animation: `upPop .35s ease-out ${(0.08 * i).toFixed(2)}s both` }}>
                <span className="display" style={{ flex: 'none', width: 34, height: 34, borderRadius: '50%', background: PINK, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800 }}>{i + 1}</span>
                <p className="display" style={{ fontSize: size, fontWeight: 800, lineHeight: 1.2 }}>„{text}“</p>
              </div>
            ))}
          </div>
          <p className="display" style={{ textAlign: 'center', fontSize: 24, fontWeight: 800, color: PINK }}>{t('assign.title')}</p>
          <AssignProgress ids={view.candidates} done={view.done} player={player} />
        </>
      );
    }
    case 'reveal':
      return <HostReveal {...props} />;
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
          <HostHeader title={t('title')} color={PINK} info={t('final.title')} />
          <Podium ranking={view.ranking} player={player} pointsLabel={t('common.points')} />
        </>
      );
  }
  return null;
}

function AssignProgress({ ids, done, player }: { ids: string[]; done: string[]; player: HostViewProps['player'] }) {
  const d = new Set(done);
  return (
    <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', paddingBottom: 6 }}>
      {ids.map((id) => {
        const p = player(id);
        if (!p) return null;
        return (
          <div key={id} style={{ position: 'relative', animation: d.has(id) ? 'upPop .4s ease-out' : undefined }}>
            <Avatar player={p} size={52} dim={!d.has(id)} />
            {d.has(id) && <span style={{ position: 'absolute', right: -6, bottom: -4, width: 22, height: 22, borderRadius: '50%', background: 'var(--green)', color: '#110D24', fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</span>}
          </div>
        );
      })}
    </div>
  );
}

function Candidates({ ids, player, votes, author, dimOthers }: { ids: string[]; player: HostViewProps['player']; votes?: number[]; author?: string; dimOthers?: boolean }) {
  const size = ids.length > 8 ? 70 : 84;
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: ids.length > 8 ? 14 : 22, paddingBottom: 8 }}>
      {ids.map((id, i) => {
        const p = player(id);
        if (!p) return null;
        const isAuthor = author === id;
        const v = votes?.[i] ?? 0;
        return (
          <div key={id} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: size + 24, opacity: dimOthers && !isAuthor ? 0.35 : 1, transform: isAuthor ? 'scale(1.18) translateY(-8px)' : undefined, transition: 'opacity .4s, transform .5s cubic-bezier(.2,.9,.3,1.4)' }}>
            {isAuthor && <span className="up-tag" style={{ position: 'absolute', top: -40, background: 'var(--yellow)', color: '#110D24', boxShadow: '0 5px 0 var(--yellow-d)', fontSize: 15, whiteSpace: 'nowrap', animation: 'upBadge .5s ease-out both', zIndex: 2 }}>✍️</span>}
            <span style={{ borderRadius: '50%', boxShadow: isAuthor ? `0 0 0 5px var(--yellow), 0 0 30px ${PINK}` : undefined }}><Avatar player={p} size={size} /></span>
            <b style={{ fontSize: 16, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</b>
            {votes && v > 0 && (
              <span key={v} className="display" style={{ position: 'absolute', top: -6, right: 4, minWidth: 34, height: 34, borderRadius: 17, padding: '0 8px', background: PINK, color: '#110D24', fontSize: 20, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 0 #B83F7C', animation: 'upPop .3s ease-out both' }}>{v}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

const FROM = 1;

function HostReveal({ view, t, player }: HostViewProps) {
  const votes = view.votes as { playerId: string; voters: string[] }[];
  const counts = votes.map((v) => v.voters.length);
  const total = counts.reduce((a, b) => a + b, 0);
  const V = votersSeconds(total);
  const elapsed = useElapsed(`${view.round}-${view.n}`, FROM + V + 4) - FROM;
  const sched = voterSchedule(counts);
  const shown = sched.map((s) => s.filter((at) => at <= elapsed).length);
  const drum = elapsed >= V + 0.2;
  const unmask = elapsed >= V + 2.2;
  const author = player(view.author);
  const correct = (view.correct as string[]).map((id) => player(id)).filter(Boolean) as PlayerInfo[];
  const lastShown = shown.reduce((a, b) => a + b, 0);

  useEffect(() => {
    if (lastShown > 0) sfx.play('pop');
  }, [lastShown]);
  useEffect(() => {
    if (drum) sfx.play('drumroll');
  }, [drum]);
  useEffect(() => {
    if (unmask) sfx.play(correct.length ? 'fanfare' : 'stamp');
  }, [unmask]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {unmask && correct.length > 0 && <Confetti silent />}
      <HostHeader title={t('title')} color={PINK} info={info(view, t)} />
      <p className="display muted" style={{ textAlign: 'center', fontSize: 26, fontWeight: 700 }}>{view.question}</p>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 30 }}>
        <Quote text={view.text} size={40} />
        <div style={{ minHeight: 62, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          {!unmask && <p className="display" style={{ fontSize: 30, fontWeight: 800, color: PINK }}>{drum ? t('reveal.drum') : t('reveal.votes')}</p>}
          {unmask && author && (
            <div className="anim-pop" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <span className="display" style={{ fontSize: 34, fontWeight: 800 }}>{t('reveal.itWas', { name: author.name })}</span>
              {view.authorPoints > 0 && <span className="display" style={{ fontSize: 30, fontWeight: 800, color: 'var(--yellow)' }}>+{view.authorPoints}</span>}
              {correct.length > 0 && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface)', borderRadius: 999, padding: '6px 16px 6px 8px', marginLeft: 12 }}>
                  <span style={{ display: 'flex' }}>{correct.map((p, j) => <span key={p.id} style={{ marginLeft: j ? -10 : 0 }}><Avatar player={p} size={36} /></span>)}</span>
                  <b style={{ fontSize: 18 }}>{t('reveal.correct', { n: correct.length })}</b>
                  <b className="display" style={{ fontSize: 22, color: 'var(--yellow)' }}>+{view.correctPoints}</b>
                </span>
              )}
              {correct.length === 0 && <b className="muted" style={{ fontSize: 20 }}>{t('reveal.nobody')}</b>}
            </div>
          )}
        </div>
      </div>
      <Candidates ids={view.candidates} player={player} votes={shown} author={unmask ? view.author : undefined} dimOthers={unmask} />
    </>
  );
}

/* ================= Handy ================= */

/** Alle Antworten auf einmal zuordnen: Antwort antippen, dann die Person wählen */
function PhoneAssign({ view, t, send, player }: Pick<ControllerViewProps, 'view' | 't' | 'send' | 'player'>) {
  const list = view.answers as { i: number; text: string }[];
  const picks = view.picks as Record<string, string>;
  const [open, setOpen] = useState<number | null>(() => list.find((x) => !picks[x.i])?.i ?? null);
  const all = list.every((x) => picks[x.i]);
  const usedBy = new Map(Object.entries(picks).map(([i, id]) => [id, Number(i)]));
  return (
    <>
      <PhoneTimer deadline={view.deadline} duration={view.duration} hurryText={view.done ? undefined : t('timer.hurry')} />
      <span className="up-label">{t('assign.title')}</span>
      <p className="muted" style={{ fontSize: 14, marginTop: -6 }}>{t('assign.hint')}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {list.map((a, n) => {
          const who = picks[a.i] ? player(picks[a.i]) : undefined;
          const isOpen = open === a.i;
          return (
            <div key={a.i} style={{ borderRadius: 18, background: isOpen ? 'var(--surface-2)' : 'var(--surface)', boxShadow: isOpen ? `0 0 0 3px ${PINK}` : undefined }}>
              <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : a.i)} style={{ width: '100%', minHeight: 60, border: 0, background: 'transparent', color: '#fff', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left' }}>
                <span className="display" style={{ flex: 'none', width: 28, height: 28, borderRadius: '50%', background: PINK, color: '#110D24', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800 }}>{n + 1}</span>
                <span className="display" style={{ flex: 1, fontSize: 17, fontWeight: 800, lineHeight: 1.25 }}>„{a.text}“</span>
                {who ? <Avatar player={who} size={38} flat /> : <span style={{ flex: 'none', width: 38, height: 38, borderRadius: '50%', border: '3px dashed #5A5290', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8F88B8', fontWeight: 800 }}>?</span>}
              </button>
              {isOpen && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '0 10px 12px' }}>
                  {(view.options as string[]).map((id) => {
                    const p = player(id);
                    if (!p) return null;
                    const on = picks[a.i] === id;
                    const elsewhere = !on && usedBy.has(id);
                    return (
                      <button key={id} type="button" aria-pressed={on} onClick={() => {
                        send({ type: 'assign', answer: a.i, target: id });
                        const next = list.find((x) => x.i !== a.i && !picks[x.i]);
                        setOpen(next ? next.i : null);
                      }} style={{
                        minHeight: 52, border: 0, borderRadius: 14, padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left',
                        background: on ? PINK : '#1C1738', color: on ? '#110D24' : '#fff', opacity: elsewhere ? 0.55 : 1,
                      }}>
                        <Avatar player={p} size={32} flat={on} />
                        <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                          <b style={{ fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</b>
                          {elsewhere && <span style={{ fontSize: 12 }}>{t('assign.usedAt', { n: list.findIndex((x) => x.i === usedBy.get(id)) + 1 })}</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ flex: 1 }} />
      {view.done
        ? <p className="muted" style={{ textAlign: 'center', fontSize: 15 }}>{t('assign.waiting')}</p>
        : <button className="up-btn big full" disabled={!all} onClick={() => send({ type: 'done' })}>{all ? t('assign.done') : t('assign.missing', { n: list.filter((x) => !picks[x.i]).length })}</button>}
    </>
  );
}

function Controller({ view, t, send, me, player }: ControllerViewProps) {
  const now = useServerNow(250);
  switch (view.screen) {
    case 'intro':
      return <PhoneWait title={t('title')} text={t('lookAtTv')} emoji={<Avatar player={me} size={96} />} />;
    case 'write':
      return (
        <>
          <PhoneTimer deadline={view.deadline} duration={view.duration} hurryText={t('timer.hurry')} />
          <span className="up-label">{t('write.label')}</span>
          <h1 style={{ fontSize: 24, lineHeight: 1.25 }}>{view.question}</h1>
          <p className="muted" style={{ fontSize: 15 }}>{t('write.phoneHint')}</p>
          <TextAnswer button={t('write.send')} placeholder={t('write.input')} maxLength={70} onSubmit={(text) => send({ type: 'answer', text })}
            onDraft={(text) => send({ type: 'answerDraft', draft: true, text })} deadline={view.deadline} />
        </>
      );
    case 'written':
      return <PhoneWait title={t('written.title')} text={t('written.text')} emoji={<span className="display" style={{ fontSize: 24, fontWeight: 800, color: PINK }}>„{view.text}“</span>} />;
    case 'onlyMine':
      return (
        <>
          <PhoneTimer deadline={view.deadline} duration={view.duration} />
          <PhoneWait title={t('mine.title')} text={t('mine.text')} emoji={<span style={{ fontSize: 72 }}>😐</span>} />
        </>
      );
    case 'assign':
      return <PhoneAssign view={view} t={t} send={send} player={player} />;
    case 'result':
      if (now < view.showAt) return <PhoneWait title={t('lookAtTv')} emoji={<Avatar player={me} size={96} />} />;
      return (
        <div className="anim-fade" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, textAlign: 'center' }}>
          {(view.correct || (view.isAuthor && view.fooled > 0)) && <Confetti pieces={14} />}
          <Avatar player={me} size={100} />
          <h1 style={{ fontSize: 28 }}>
            {view.isAuthor ? (view.fooled > 0 ? t('result.fooled', { n: view.fooled }) : t('result.caught'))
              : view.correct ? t('result.correct') : view.guessed ? t('result.wrong', { name: view.authorName }) : t('result.itWas', { name: view.authorName })}
          </h1>
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
