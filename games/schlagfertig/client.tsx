import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { ControllerViewProps, GameClientModule, HostViewProps, PlayerInfo } from '@up/sdk';
import {
  Avatar, ChoiceList, Confetti, Crown, HostHeader, HostPrompt, HostTimer, PhoneTimer, PhoneWait, Podium, Scoreboard, TextAnswer, VoterChips, sfx, useServerNow,
} from '@up/ui';

const PINK = '#E8336F';

/** Schrittweise Enthüllung: liefert 0,1,2,… zu den angegebenen Zeitpunkten (Sekunden). */
function useSteps(times: number[], key: unknown) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    setStep(0);
    const ids = times.map((s, i) => setTimeout(() => setStep(i + 1), s * 1000));
    return () => ids.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return step;
}

function roundInfo(view: any, t: HostViewProps['t']) {
  const r = view.round === view.totalRounds ? t('roundFinal') : t('round', { n: view.round, total: view.totalRounds });
  return view.mult > 1 ? `${r} · ${t('mult', { n: view.mult })}` : r;
}

/* ================= TV ================= */

function Host(props: HostViewProps) {
  const { view, t } = props;
  switch (view.screen) {
    case 'intro':
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28, textAlign: 'center' }}>
          <span className="up-tag anim-pop" style={{ background: PINK, color: '#fff', boxShadow: '0 8px 0 #A81B4B', fontSize: 72, padding: '12px 36px', borderRadius: 26, transform: 'rotate(-3deg)' }}>{t('intro.title')}</span>
          <p className="anim-up" style={{ fontSize: 28, maxWidth: 900, lineHeight: 1.35, animationDelay: '.4s' }}>{view.duelMode ? t('intro.duel') : t('intro.crowd')}</p>
          {view.duelMode && <p className="muted anim-up" style={{ fontSize: 22, animationDelay: '.8s' }}>{t('intro.final')}</p>}
        </div>
      );
    case 'answer':
      return <HostAnswer {...props} />;
    case 'duel':
      return <HostDuel {...props} />;
    case 'duelResult':
      return <HostDuelResult {...props} />;
    case 'multiVote':
      return <HostMultiVote {...props} />;
    case 'multiResult':
      return <HostMultiResult {...props} />;
    case 'heat':
      return (
        <>
          <HostHeader title={t('title')} color={PINK} info={roundInfo(view, t)} right={<HostTimer deadline={view.deadline} duration={view.duration} />} />
          <HostPrompt label={t('heat.title', { n: view.stage })}>{view.prompt}</HostPrompt>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
            <p style={{ fontSize: 26 }}>{t('heat.text', { entries: view.entries, groups: view.groups })}</p>
            <Progress value={view.voted ?? 0} total={view.voters ?? 1} label={t('vote.count', { n: view.voted ?? 0, total: view.voters ?? 0 })} />
          </div>
        </>
      );
    case 'heatResult':
      return (
        <>
          <HostHeader title={t('title')} color={PINK} info={roundInfo(view, t)} />
          <HostPrompt label={view.prompt} size={38}>{t('heatResult.title')}</HostPrompt>
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${Math.min(4, view.winners.length)}, minmax(0, 1fr))`, gap: 16, alignContent: 'center' }}>
            {view.winners.map((w: any, i: number) => {
              const p = props.player(w.authorId);
              return (
                <div key={i} className="up-card" style={{ display: 'flex', flexDirection: 'column', gap: 12, animation: `upPop .5s ease-out ${(i * 0.15).toFixed(2)}s both` }}>
                  <p className="display" style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.2 }}>{w.text}</p>
                  {p && <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto' }}><Avatar player={p} size={32} flat /><b>{p.name}</b></span>}
                </div>
              );
            })}
          </div>
        </>
      );
    case 'scores':
    case 'final':
      return <HostScores {...props} />;
  }
  return null;
}

function Progress({ value, total, label }: { value: number; total: number; label: string }) {
  return (
    <div style={{ width: 600, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
      <div style={{ width: '100%', height: 18, background: 'var(--surface-2)', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${(value / Math.max(1, total)) * 100}%`, background: 'var(--yellow)', borderRadius: 999, transition: 'width .4s' }} />
      </div>
      <span className="muted" style={{ fontSize: 18 }}>{label}</span>
    </div>
  );
}

function HostAnswer({ view, t, player }: HostViewProps) {
  const done = new Set<string>(view.done);
  const all: PlayerInfo[] = view.waiting.map((id: string) => player(id)).filter(Boolean);
  const many = all.length > 16;
  return (
    <>
      <HostHeader title={t('title')} color={PINK} info={roundInfo(view, t)} right={<HostTimer deadline={view.deadline} duration={view.duration} />} />
      <HostPrompt label={view.prompt ? t('answer.title') : undefined}>{view.prompt ?? t('answer.title')}</HostPrompt>
      {!view.prompt && <p className="muted" style={{ textAlign: 'center', fontSize: 22 }}>{t('answer.onPhone')}</p>}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {many ? (
          <Progress value={done.size} total={all.length} label={`${done.size} / ${all.length} ${t('answer.done')}`} />
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 22, justifyContent: 'center', maxWidth: 1000 }}>
            {all.map((p, i) => {
              const ok = done.has(p.id);
              return (
                <div key={p.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: 100, animation: ok ? 'upPop .4s ease-out' : `upFloat 3s ease-in-out ${(-0.4 * i).toFixed(1)}s infinite` }}>
                  <div style={{ position: 'relative' }}>
                    <Avatar player={p} size={76} dim={!ok} />
                    {ok && <span style={{ position: 'absolute', right: -6, bottom: -4, width: 30, height: 30, borderRadius: '50%', background: 'var(--green)', color: '#110D24', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</span>}
                  </div>
                  <span style={{ fontWeight: 700, fontSize: 17, opacity: ok ? 1 : 0.6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 100 }}>{p.name}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function AnswerCard({ side, text, children, style }: { side: 'a' | 'b'; text: string | null; children?: ReactNode; style?: CSSProperties }) {
  const a = side === 'a';
  return (
    <div style={{
      position: 'relative', flex: 1, minWidth: 0, boxSizing: 'border-box', borderRadius: 32, padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 16,
      background: a ? PINK : 'var(--cyan)', color: a ? '#fff' : '#110D24', boxShadow: `0 10px 0 ${a ? '#A81B4B' : '#1A97B0'}`,
      transition: 'transform .4s, opacity .4s', ...style,
    }}>
      <span className="display" style={{ width: 44, height: 44, flex: 'none', borderRadius: 12, background: a ? '#fff' : '#110D24', color: a ? '#A81B4B' : 'var(--cyan)', fontSize: 24, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{a ? 'A' : 'B'}</span>
      <p className="display" style={{ fontSize: text && text.length > 40 ? 32 : 38, fontWeight: 800, lineHeight: 1.15, opacity: text ? 1 : 0.6 }}>{text ?? '—'}</p>
      {children}
    </div>
  );
}

/** Erst nur die Frage, ab `showAt` (Serverzeit) dann die Antworten */
function useShown(showAt?: number) {
  const now = useServerNow(100);
  const shown = !showAt || now >= showAt;
  useEffect(() => {
    if (shown && showAt) sfx.play('whoosh');
  }, [shown, showAt]);
  return shown;
}

/** Große Frage in der Bildmitte, bevor die Antworten kommen */
function PromptStage({ label, prompt }: { label: string; prompt: string }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, textAlign: 'center', padding: '0 40px' }}>
      <span className="anim-fade" style={{ fontSize: 20, fontWeight: 700, letterSpacing: 2, color: 'var(--muted)', textTransform: 'uppercase' }}>{label}</span>
      <h1 className="anim-pop" style={{ fontSize: prompt.length > 60 ? 56 : 68, lineHeight: 1.12 }}>{prompt}</h1>
    </div>
  );
}

function HostDuel({ view, t }: HostViewProps) {
  const shown = useShown(view.showAt);
  if (!shown) {
    return (
      <>
        <HostHeader title={t('title')} color={PINK} info={`${roundInfo(view, t)} · ${t('vote.duel', { n: view.n, total: view.total })}`} />
        <PromptStage label={t('vote.duel', { n: view.n, total: view.total })} prompt={view.prompt} />
      </>
    );
  }
  return (
    <>
      <HostHeader title={t('title')} color={PINK} info={`${roundInfo(view, t)} · ${t('vote.duel', { n: view.n, total: view.total })}`} right={<HostTimer deadline={view.deadline} duration={view.deadline - (view.showAt ?? view.deadline - view.duration)} />} />
      <HostPrompt label={t('vote.label')}>{view.prompt}</HostPrompt>
      <section style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
        <AnswerCard side="a" text={view.a} style={{ animation: 'upSlideLeft .7s ease-out both', minHeight: 230 }} />
        <div style={{ width: 112, flex: 'none', display: 'flex', justifyContent: 'center', zIndex: 1, margin: '0 -28px' }}>
          <span className="display" style={{ width: 96, height: 96, borderRadius: '50%', background: 'var(--yellow)', color: '#110D24', fontSize: 36, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 0 var(--yellow-d), 0 0 0 8px var(--bg)', animation: 'upWobble 1.6s ease-in-out infinite' }}>VS</span>
        </div>
        <AnswerCard side="b" text={view.b} style={{ animation: 'upSlideRight .7s ease-out .15s both', minHeight: 230 }} />
      </section>
      <footer style={{ height: 40, display: 'flex', justifyContent: 'center' }}>
        <span className="up-chip" style={{ fontSize: 17 }}>{t('vote.count', { n: view.voted ?? 0, total: view.voters ?? 0 })}</span>
      </footer>
    </>
  );
}

function HostDuelResult({ view, t, player }: HostViewProps) {
  const step = useSteps([0.5, 2.1, 3.1], `${view.round}-${view.n}`);
  useEffect(() => {
    if (step === 2) sfx.play('reveal');
    if (step === 3) sfx.play(view.sweep ? 'fanfare' : view.winner ? 'stamp' : 'wrong');
  }, [step, view.sweep, view.winner]);
  const total = Math.max(1, view.a.voters.length + view.b.voters.length + view.a.audience + view.b.audience);
  const pct = (s: any) => Math.round(((s.voters.length + s.audience) / total) * 100);
  const side = (key: 'a' | 'b') => {
    const s = view[key];
    const won = view.winner === key;
    const author = player(s.authorId);
    const voters: PlayerInfo[] = s.voters.map((id: string) => player(id)).filter(Boolean);
    const dark = key === 'a';
    const votesLabel = s.voters.length === 1 ? t('result.vote1') : t('result.votes', { n: s.voters.length });
    return (
      <AnswerCard side={key} text={s.text ?? t('result.noAnswer')} style={{
        transform: step >= 3 ? (won ? 'scale(1.02)' : view.winner ? 'scale(.97)' : undefined) : undefined,
        opacity: step >= 3 && view.winner && !won ? 0.8 : 1, boxShadow: `${step >= 3 && won ? '0 0 0 5px var(--yellow), ' : ''}0 ${step >= 3 && won ? 15 : 10}px 0 ${dark ? '#A81B4B' : '#1A97B0'}`,
      }}>
        {step >= 3 && won && <span className="up-tag" style={{ position: 'absolute', top: -18, right: 28, background: 'var(--yellow)', color: '#110D24', boxShadow: '0 5px 0 var(--yellow-d)', animation: 'upBadge .6s ease-out both' }}>{t('result.winner')}</span>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ height: 20, borderRadius: 999, background: 'rgba(17,13,36,.22)', overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 999, background: dark ? '#fff' : '#110D24', width: step >= 1 ? `${pct(s)}%` : '0%', transition: 'width 1.1s cubic-bezier(.2,.9,.3,1.2)' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 700 }}>
            <span>{step >= 1 ? `${votesLabel} · ${pct(s)} %` : '…'}</span>
            <span>{step >= 1 && s.audience > 0 ? t('result.audience', { n: s.audience }) : ''}</span>
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 40 }}>{step >= 1 && <VoterChips voters={voters} crowdSize={view.crowd} onDark={dark} />}</div>
        <div style={{ height: 56, display: 'flex', alignItems: 'center', gap: 12 }}>
          {step >= 2 && author ? (
            <div className="anim-up" style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
              <span style={{ fontSize: 16 }}>{t('result.by')}</span>
              <Avatar player={author} size={52} />
              <span className="display" style={{ fontSize: 26, fontWeight: 800 }}>{author.name}</span>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
              <span className="display" style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(17,13,36,.22)', fontSize: 26, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>?</span>
              <span style={{ fontSize: 18, fontWeight: 700 }}>{t('result.who')}</span>
            </div>
          )}
          {step >= 3 && s.points > 0 && (
            <span className="display" style={{ fontSize: won ? 44 : 34, fontWeight: 800, color: dark ? 'var(--yellow)' : '#110D24', textShadow: dark ? '0 4px 0 #A81B4B' : undefined, animation: 'upPop .6s ease-out both' }}>+{s.points}</span>
          )}
        </div>
      </AnswerCard>
    );
  };
  return (
    <>
      {step >= 3 && view.winner && <Confetti />}
      <HostHeader title={t('title')} color={PINK} info={`${roundInfo(view, t)} · ${t('vote.duel', { n: view.n, total: view.total })}`}
        right={step >= 3 && (view.sweep || !view.winner) ? <span className="up-tag anim-pop" style={{ background: 'var(--surface)', color: 'var(--yellow)', fontSize: 20 }}>{view.sweep ? t('result.sweep') : t('result.tie')}</span> : null} />
      <p className="display muted" style={{ textAlign: 'center', fontSize: 28, fontWeight: 700 }}>{view.prompt}</p>
      <section style={{ flex: 1, display: 'flex', gap: 32, paddingBottom: 10 }}>
        {side('a')}
        {side('b')}
      </section>
    </>
  );
}

function HostMultiVote({ view, t }: HostViewProps) {
  const n = view.options.length;
  const cols = n <= 4 ? 2 : n <= 9 ? 3 : 4;
  const shown = useShown(view.showAt);
  if (!shown) {
    return (
      <>
        <HostHeader title={t('title')} color={PINK} info={roundInfo(view, t)} />
        <PromptStage label={t('vote.multi')} prompt={view.prompt} />
      </>
    );
  }
  return (
    <>
      <HostHeader title={t('title')} color={PINK} info={roundInfo(view, t)} right={<HostTimer deadline={view.deadline} duration={view.deadline - (view.showAt ?? view.deadline - view.duration)} />} />
      <HostPrompt label={t('vote.multi')} size={38}>{view.prompt}</HostPrompt>
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 14, alignContent: 'center' }}>
        {view.options.map((o: any, i: number) => (
          <div key={o.id} className="up-card" style={{ padding: '16px 20px', borderRadius: 22, animation: `upPop .45s ease-out ${(i * 0.08).toFixed(2)}s both` }}>
            <p className="display" style={{ fontSize: n > 9 ? 20 : 24, fontWeight: 800, lineHeight: 1.2 }}>{o.text}</p>
          </div>
        ))}
      </div>
      <footer style={{ display: 'flex', justifyContent: 'center' }}>
        <span className="up-chip" style={{ fontSize: 17 }}>{t('vote.count', { n: view.voted ?? 0, total: view.voters ?? 0 })}</span>
      </footer>
    </>
  );
}

function HostMultiResult({ view, t, player }: HostViewProps) {
  const step = useSteps([0.6, 2.2], `${view.round}-multi`);
  useEffect(() => {
    if (step === 2) sfx.play('stamp');
  }, [step]);
  const rows = view.rows as any[];
  const shown = rows.slice(0, 6);
  return (
    <>
      {step >= 2 && view.winnerId && <Confetti />}
      <HostHeader title={t('title')} color={PINK} info={roundInfo(view, t)} />
      <p className="display muted" style={{ textAlign: 'center', fontSize: 26, fontWeight: 700 }}>{view.prompt}</p>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {shown.map((r, i) => {
          const author = player(r.authorId);
          const first = i === 0 && r.points > 0;
          const voters: PlayerInfo[] = r.voters.map((id: string) => player(id)).filter(Boolean);
          return (
            <div key={r.id} style={{
              display: 'flex', alignItems: 'center', gap: 16, padding: '12px 20px', borderRadius: 22, minHeight: 70,
              background: first && step >= 2 ? PINK : 'var(--surface)', boxShadow: first && step >= 2 ? '0 0 0 4px var(--yellow)' : undefined,
              animation: `upSlideUp .45s ease-out ${(i * 0.1).toFixed(2)}s both`, transition: 'background .4s',
            }}>
              {first && step >= 2 && <Crown size={34} />}
              <p className="display" style={{ flex: 1, fontSize: 24, fontWeight: 800, lineHeight: 1.15 }}>{r.text}</p>
              <div style={{ maxWidth: 360 }}>{step >= 1 && <VoterChips voters={voters} crowdSize={view.crowd > 10 ? 20 : view.crowd} />}</div>
              {step >= 2 && author && (
                <span className="anim-up" style={{ display: 'flex', alignItems: 'center', gap: 8, width: 170 }}>
                  <Avatar player={author} size={40} /> <b style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{author.name}</b>
                </span>
              )}
              <span className="display" style={{ width: 90, textAlign: 'right', fontSize: 26, fontWeight: 800, color: 'var(--yellow)', visibility: step >= 2 ? 'visible' : 'hidden' }}>+{r.points}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function HostScores({ view, t, player }: HostViewProps) {
  if (view.screen === 'final') {
    return (
      <>
        <HostHeader title={t('title')} color={PINK} info={t('final.title')} />
        <Podium ranking={view.ranking} player={player} pointsLabel={t('common.points')} />
      </>
    );
  }
  const rows = Object.keys(view.after).map((id) => ({ player: player(id)!, before: view.before[id] ?? 0, after: view.after[id] })).filter((r) => r.player);
  return (
    <>
      <HostHeader title={t('title')} color={PINK} info={t('scores.next')} />
      <h1 style={{ fontSize: 36, fontWeight: 800 }}>{t('scores.title', { n: view.round })}</h1>
      <Scoreboard rows={rows} max={rows.length > 10 ? 10 : 8} />
    </>
  );
}

/* ================= Handy ================= */

function PhoneVote({ view, t, send }: ControllerViewProps) {
  const now = useServerNow(100);
  if (view.showAt && now < view.showAt) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16, textAlign: 'center' }}>
        <span className="up-label">{t('vote.label')}</span>
        <h1 className="anim-pop" style={{ fontSize: 30, lineHeight: 1.2 }}>{view.prompt}</h1>
        <p className="muted">{t('vote.soon')}</p>
      </div>
    );
  }
  return (
        <>
          <PhoneTimer deadline={view.deadline} duration={view.showAt ? view.deadline - view.showAt : view.duration} hurryText={view.selected ? undefined : t('timer.hurry')} />
          <span className="up-label">{t('vote.label')}</span>
          <h1 style={{ fontSize: 22, lineHeight: 1.2 }}>{view.prompt}</h1>
          <ChoiceList
            options={view.options.map((o: any, i: number) => ({ id: o.id, text: o.text, color: view.options.length === 2 ? (i === 0 ? PINK : '#36D6F5') : undefined }))}
            selected={view.selected} onPick={(id) => send({ type: 'vote', choice: id })} />
          {view.selected ? (
            <div role="status" className="up-card anim-pop" style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 'auto' }}>
              <span style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--green)', color: '#110D24', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</span>
              <span><b className="display" style={{ fontSize: 18 }}>{t('vote.done')}</b><br /><span className="muted" style={{ fontSize: 14 }}>{t('vote.change')}</span></span>
            </div>
          ) : (
            <p className="muted" style={{ textAlign: 'center', marginTop: 'auto' }}>{t('vote.pick')}</p>
          )}
        </>
      );
}

function Controller(props: ControllerViewProps) {
  const { view, t, send, me } = props;
  switch (view.screen) {
    case 'intro':
      return <PhoneWait title={t('intro.title')} text={t('lookAtTv')} />;
    case 'answer':
      return (
        <>
          <PhoneTimer deadline={view.deadline} duration={view.duration} hurryText={t('timer.hurry')} />
          <span className="up-label">{view.count > 1 ? t('answer.of', { n: view.index, count: view.count }) : ''}</span>
          <h1 className="anim-up" key={view.promptId} style={{ fontSize: 26, lineHeight: 1.2 }}>{view.prompt}</h1>
          <TextAnswer key={`in-${view.promptId}`} button={t('answer.send')} placeholder={t('answer.input')} maxLength={view.maxLength} onSubmit={(text) => send({ type: 'answer', promptId: view.promptId, text })} />
        </>
      );
    case 'answered':
      return <PhoneWait title={t('answered.title')} text={t('answered.text')} emoji={<Avatar player={me} size={96} />} />;
    case 'audienceWait':
      return <PhoneWait title={t('game.audience')} text={t('audience.wait')} emoji={<Avatar player={me} size={96} />} />;
    case 'vote':
      return <PhoneVote {...props} />;
    case 'yourDuel':
      return <PhoneWait title={t('yourDuel.title')} text={t('yourDuel.text')} emoji={<span className="display" style={{ fontSize: 22, fontWeight: 800, color: 'var(--muted)', textAlign: 'center' }}>{view.prompt}</span>} />;
    case 'duelOutcome':
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, textAlign: 'center' }}>
          {view.won && <Confetti pieces={14} />}
          <div style={{ position: 'relative' }} className="anim-pop">
            <Avatar player={me} size={120} />
            {view.won && <Crown size={48} style={{ position: 'absolute', top: -26, left: 36 }} />}
          </div>
          <h1 style={{ fontSize: 30 }}>{view.won ? t('outcome.won') : t('outcome.lost')}</h1>
          {view.text && <div style={{ background: PINK, borderRadius: 20, padding: '14px 18px', boxShadow: '0 6px 0 #A81B4B', transform: 'rotate(-1.5deg)' }}><p className="display" style={{ fontSize: 20, fontWeight: 800 }}>{view.text}</p></div>}
          <span className="display" style={{ fontSize: 64, fontWeight: 800, color: 'var(--yellow)', textShadow: '0 6px 0 var(--yellow-d)', animation: 'upPop .7s ease-out .3s both' }}>+{view.points}</span>
          {view.sweep && <span className="up-chip">{t('result.sweep')}</span>}
          <span className="muted">{t('outcome.total', { n: view.total })}</span>
        </div>
      );
    case 'advanced':
      return <PhoneWait title={t('advanced.title')} text={t('advanced.text')} emoji={<Avatar player={me} size={110} />} />;
    case 'scoresMe':
    case 'finalMe':
      return (
        <PhoneWait title={t('me.place', { place: view.place, of: view.of })} text={t('me.score', { n: view.score })}
          emoji={<div style={{ position: 'relative' }}><Avatar player={me} size={110} />{view.place === 1 && <Crown size={44} style={{ position: 'absolute', top: -24, left: 33 }} />}</div>} />
      );
    default:
      return <PhoneWait title={t('lookAtTv')} emoji={<Avatar player={me} size={96} />} />;
  }
}

export default { Host, Controller } satisfies GameClientModule;
