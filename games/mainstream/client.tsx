import { useEffect, useState } from 'react';
import type { ControllerViewProps, GameClientModule, HostViewProps, PlayerInfo, Translate } from '@up/sdk';
import { Avatar, Confetti, Crown, HostHeader, HostPrompt, HostTimer, PhoneTimer, PhoneWait, Podium, Scoreboard, VoterChips, sfx, useServerNow } from '@up/ui';
import { revealPlan, voterSchedule } from './timing';

const ORANGE = '#FF9F1C';
const COLORS = ['#FF9F1C', '#36D6F5', '#E8336F', '#4BE3A1'];
const DARK = ['#B86A00', '#1A97B0', '#A81B4B', '#1E9E6A'];
const LETTERS = ['A', 'B', 'C', 'D'];

function info(view: any, t: Translate) {
  return `${t('question', { n: view.n, total: view.total })}${view.mult > 1 ? ' · ' + t('mult', { n: view.mult }) : ''}`;
}

/** Sekunden seit dem Wechsel von key (aktualisiert sich bis `until`) */
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

/* ================= TV ================= */

function Host(props: HostViewProps) {
  const { view, t, player } = props;
  switch (view.screen) {
    case 'intro':
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28, textAlign: 'center' }}>
          <span className="up-tag anim-pop" style={{ background: ORANGE, color: '#110D24', boxShadow: '0 8px 0 #B86A00', fontSize: 80, padding: '12px 40px', borderRadius: 26, transform: 'rotate(-3deg)' }}>{t('title')}</span>
          <p className="anim-up" style={{ fontSize: 28, maxWidth: 900, lineHeight: 1.35, animationDelay: '.4s' }}>{t('intro.text')}</p>
          <p className="muted anim-up" style={{ fontSize: 22, animationDelay: '.8s' }}>{t('intro.points')}</p>
        </div>
      );
    case 'vote': {
      const n = view.answers.length;
      return (
        <>
          <HostHeader title={t('title')} color={ORANGE} info={info(view, t)} right={<HostTimer deadline={view.deadline} duration={view.duration} />} />
          <HostPrompt label={t('vote.label')}>{view.question}</HostPrompt>
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, gap: 20, alignItems: 'center' }}>
            {view.answers.map((a: string, i: number) => (
              <div key={i} style={{ background: COLORS[i], color: '#110D24', borderRadius: 26, padding: '28px 24px', minHeight: 170, display: 'flex', flexDirection: 'column', gap: 12, boxShadow: `0 8px 0 ${DARK[i]}`, animation: `upPop .45s ease-out ${(i * 0.12).toFixed(2)}s both` }}>
                <span className="display" style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(17,13,36,.2)', fontSize: 24, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{LETTERS[i]}</span>
                <p className="display" style={{ fontSize: n > 3 ? 28 : 34, fontWeight: 800, lineHeight: 1.15 }}>{a}</p>
              </div>
            ))}
          </div>
          <footer style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
            <span className="up-chip" style={{ fontSize: 17 }}>{t('vote.count', { n: view.done, total: view.voters })}</span>
            <span className="up-chip" style={{ fontSize: 17 }}>{t('vote.hint')}</span>
          </footer>
        </>
      );
    }
    case 'reveal':
      return <HostReveal {...props} />;
    case 'scores': {
      const rows = Object.keys(view.after).map((id) => ({ player: player(id)!, before: view.before[id] ?? 0, after: view.after[id] })).filter((r) => r.player);
      return (
        <>
          <HostHeader title={t('title')} color={ORANGE} info={t('scores.title')} />
          <h1 style={{ fontSize: 36 }}>{t('scores.title')}</h1>
          <Scoreboard rows={rows} />
        </>
      );
    }
    case 'final':
      return (
        <>
          <HostHeader title={t('title')} color={ORANGE} info={t('final.title')} />
          <Podium ranking={view.ranking} player={player} pointsLabel={t('common.points')} />
        </>
      );
  }
  return null;
}

const FROM = 0.9;

function HostReveal({ view, t, player }: HostViewProps) {
  const key = `${view.n}`;
  const voters = view.voters as string[][];
  const guessers = (view.guessers ?? view.voters.map(() => [])) as string[][];
  const counts = voters.map((v) => v.length);
  const gCounts = guessers.map((g) => g.length);
  const totalVotes = Math.max(1, counts.reduce((a, b) => a + b, 0));
  const plan = revealPlan(gCounts.reduce((a, b) => a + b, 0), counts.reduce((a, b) => a + b, 0));
  const elapsed = useElapsed(key, FROM + plan.votesDone + 3) - FROM;
  const gSched = voterSchedule(gCounts);
  const gShown = gSched.map((s) => s.filter((at) => at <= elapsed).length);
  const vSched = voterSchedule(counts);
  const shown = vSched.map((s) => s.filter((at) => at <= elapsed - plan.votesFrom).length);
  const votesPhase = elapsed >= plan.votesFrom - 0.6;
  const showMajority = elapsed >= plan.votesDone + 0.8;
  const showPredictors = elapsed >= plan.votesDone + 2.2;
  const majority = new Set<number>(view.majority);
  const predictors: PlayerInfo[] = (view.predictors as string[]).map((id) => player(id)).filter(Boolean) as PlayerInfo[];
  const maxShown = Math.max(1, ...counts);
  const totalGuessShown = gShown.reduce((a, b) => a + b, 0);
  const totalVoteShown = shown.reduce((a, b) => a + b, 0);

  useEffect(() => {
    if (totalGuessShown > 0) sfx.play('pop');
  }, [totalGuessShown]);
  useEffect(() => {
    if (totalVoteShown > 0) sfx.play('select');
  }, [totalVoteShown]);
  useEffect(() => {
    if (votesPhase) sfx.play('whoosh');
  }, [votesPhase]);
  useEffect(() => {
    if (showMajority) sfx.play(majority.size ? 'stamp' : 'wrong');
  }, [showMajority]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (showPredictors && predictors.length) sfx.play('cheer');
  }, [showPredictors]); // eslint-disable-line react-hooks/exhaustive-deps

  const n = view.answers.length;
  return (
    <>
      {showPredictors && predictors.length > 0 && <Confetti silent />}
      <HostHeader title={t('title')} color={ORANGE} info={info(view, t)} />
      <p className="display muted" style={{ textAlign: 'center', fontSize: 26, fontWeight: 700 }}>{view.question}</p>
      <p key={votesPhase ? 'b' : 'a'} className="display anim-pop" style={{ textAlign: 'center', fontSize: 30, fontWeight: 800, color: votesPhase ? '#fff' : 'var(--yellow)' }}>
        {votesPhase ? t('reveal.phaseVotes') : t('reveal.phaseGuesses')}
      </p>
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, gap: 20 }}>
        {view.answers.map((a: string, i: number) => {
          const k = Math.max(0, shown[i]);
          const pct = Math.round((k / totalVotes) * 100);
          const win = showMajority && majority.has(i);
          const lose = showMajority && !majority.has(i);
          const gs: PlayerInfo[] = guessers[i].slice(0, gShown[i]).map((id) => player(id)).filter(Boolean) as PlayerInfo[];
          const vs: PlayerInfo[] = voters[i].slice(0, k).map((id) => player(id)).filter(Boolean) as PlayerInfo[];
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0, opacity: lose ? 0.45 : 1, transition: 'opacity .4s' }}>
              {/* Tipps: wer glaubt, dass hier die Mehrheit ist */}
              <div style={{ minHeight: 66, borderRadius: 18, padding: '8px 10px', background: 'var(--surface)', boxShadow: `inset 0 0 0 2px ${votesPhase ? 'transparent' : COLORS[i]}`, display: 'flex', flexDirection: 'column', gap: 6, transition: 'box-shadow .3s' }}>
                <span className="up-label" style={{ fontSize: 12 }}>{t('reveal.guessLabel')} · {gShown[i]}</span>
                <VoterChips voters={gs.slice(0, 12)} crowdSize={view.crowd > 10 ? 20 : view.crowd} stagger={0} />
              </div>
              {/* Säule der echten Stimmen */}
              <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', position: 'relative', opacity: votesPhase ? 1 : 0, transition: 'opacity .4s' }}>
                {win && <Crown size={42} style={{ marginBottom: 4, animation: 'upBadge .5s ease-out both' }} />}
                <span className="display" style={{ fontSize: 32, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: win ? 'var(--yellow)' : '#fff' }}>{k}<span style={{ fontSize: 19, opacity: 0.7 }}> · {pct} %</span></span>
                <div style={{ width: '62%', height: Math.max(10, (k / maxShown) * 150), marginTop: 6, borderRadius: '18px 18px 6px 6px', background: COLORS[i], boxShadow: win ? '0 0 0 5px var(--yellow)' : undefined, transition: 'height .35s cubic-bezier(.2,.9,.3,1.2)' }} />
              </div>
              {/* Antwort + echte Stimmen */}
              <div style={{ position: 'relative', background: COLORS[i], color: '#110D24', borderRadius: 22, padding: '12px 16px', minHeight: 104, boxShadow: `0 6px 0 ${DARK[i]}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {win && <span className="up-tag" style={{ position: 'absolute', top: -20, right: 12, background: 'var(--yellow)', color: '#110D24', boxShadow: '0 5px 0 var(--yellow-d)', fontSize: 18, animation: 'upBadge .5s ease-out both' }}>{t('reveal.majority')}</span>}
                <p className="display" style={{ fontSize: 23, fontWeight: 800, lineHeight: 1.15 }}>{LETTERS[i]} · {a}</p>
                <VoterChips voters={vs.slice(0, 12)} crowdSize={view.crowd > 10 ? 20 : view.crowd} onDark={false} stagger={0} />
              </div>
            </div>
          );
        })}
      </div>
      <footer style={{ minHeight: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        {showPredictors && (
          <div className="anim-up" style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)', borderRadius: 999, padding: '8px 20px 8px 10px' }}>
            {predictors.length ? (
              <>
                <span style={{ display: 'flex' }}>{predictors.slice(0, 14).map((p, j) => <span key={p.id} style={{ marginLeft: j ? -10 : 0 }}><Avatar player={p} size={40} /></span>)}</span>
                <b style={{ fontSize: 20 }}>{predictors.length > 14 ? `+${predictors.length - 14} · ` : ''}{t('reveal.predicted', { n: predictors.length })}</b>
                <span className="display" style={{ fontSize: 26, fontWeight: 800, color: 'var(--yellow)' }}>+{1000 * view.mult}</span>
              </>
            ) : <b style={{ fontSize: 20 }}>{t('reveal.nobody')}</b>}
          </div>
        )}
      </footer>
    </>
  );
}

/* ================= Handy ================= */

function Options({ answers, selected, onPick, label }: { answers: string[]; selected: number | null; onPick: (i: number) => void; label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span className="up-label">{label}</span>
      <div style={{ display: 'grid', gridTemplateColumns: answers.length === 3 ? '1fr' : '1fr 1fr', gap: 8 }}>
        {answers.map((a, i) => {
          const on = selected === i;
          return (
            <button key={i} type="button" aria-pressed={on} onClick={() => onPick(i)} style={{
              minHeight: 58, border: 0, borderRadius: 16, padding: '10px 12px', textAlign: 'left', fontSize: 16, fontWeight: 700,
              background: on ? COLORS[i] : 'var(--surface)', color: on ? '#110D24' : '#fff',
              boxShadow: on ? `0 0 0 3px #fff, 0 4px 0 ${DARK[i]}` : `inset 6px 0 0 ${COLORS[i]}`, transition: 'background .15s',
            }}>
              <span style={{ opacity: 0.7, marginRight: 6 }}>{LETTERS[i]}</span>{a}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Controller({ view, t, send, me }: ControllerViewProps) {
  const now = useServerNow(250);
  switch (view.screen) {
    case 'intro':
      return <PhoneWait title={t('title')} text={t('lookAtTv')} emoji={<Avatar player={me} size={96} />} />;
    case 'vote': {
      const done = view.own != null && view.guess != null;
      return (
        <>
          <PhoneTimer deadline={view.deadline} duration={view.duration} hurryText={done ? undefined : t('timer.hurry')} />
          <h1 style={{ fontSize: 22, lineHeight: 1.25 }}>{view.question}</h1>
          <Options label={t('phone.own')} answers={view.answers} selected={view.own} onPick={(i) => send({ type: 'own', answer: i })} />
          <Options label={t('phone.guess')} answers={view.answers} selected={view.guess} onPick={(i) => send({ type: 'guess', answer: i })} />
          <p className="muted" style={{ textAlign: 'center', marginTop: 'auto', fontSize: 15 }}>{done ? t('phone.done') : t('phone.both')}</p>
        </>
      );
    }
    case 'result':
      if (view.doneAt && now < view.doneAt) return <PhoneWait title={t('lookAtTv')} emoji={<Avatar player={me} size={96} />} />;
      return (
        <div className="anim-fade" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, textAlign: 'center' }}>
          {view.predicted && <Confetti pieces={14} />}
          <Avatar player={me} size={100} />
          <p className="muted" style={{ fontSize: 16 }}>{t('result.majorityWas')}</p>
          <h1 style={{ fontSize: 26 }}>{view.majority.length ? view.majority.join(' / ') : '–'}</h1>
          <p style={{ fontSize: 18 }}>{view.predicted ? '✓ ' + t('result.predicted') : '✗ ' + t('result.notPredicted')}</p>
          <p style={{ fontSize: 18 }}>{view.inMajority ? '✓ ' + t('result.inMajority') : '✗ ' + t('result.inMinority')}</p>
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
