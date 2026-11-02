import { useEffect } from 'react';
import type { ControllerViewProps, GameClientModule, HostViewProps, PlayerInfo, Translate } from '@up/sdk';
import {
  Avatar, ChoiceList, Confetti, HostHeader, HostTimer, PhoneTimer, PhoneWait, Podium, Scoreboard, TextAnswer, VoterChips, isLight, sfx, shade, useServerNow,
} from '@up/ui';

const PURPLE = '#9B7BFF';
const CAT_COLOR: Record<string, string> = { hands: '#FFD447', number: '#36D6F5', face: '#E8336F', point: '#4BE3A1', text: '#FF9F43' };

function info(view: any, t: Translate) {
  return `${t('round', { n: view.round, total: view.totalRounds })} · ${t('taskOf', { n: view.taskNo })}`;
}

function CatTag({ cat, t, size = 26 }: { cat: string; t: Translate; size?: number }) {
  const c = CAT_COLOR[cat] ?? PURPLE;
  return (
    <span className="up-tag" style={{ background: c, color: isLight(c) ? '#110D24' : '#fff', boxShadow: `0 6px 0 ${shade(c)}`, fontSize: size, transform: 'rotate(-2deg)' }}>
      {t(`cat.${cat}`)}
    </span>
  );
}

/* ================= TV ================= */

function Host(props: HostViewProps) {
  const { view, t, player } = props;
  switch (view.screen) {
    case 'intro':
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, textAlign: 'center' }}>
          <span className="up-tag anim-pop" style={{ background: PURPLE, color: '#110D24', boxShadow: '0 8px 0 #6B4FD1', fontSize: 76, padding: '12px 40px', borderRadius: 26, transform: 'rotate(-3deg)' }}>{t('title')}</span>
          <p className="anim-up" style={{ fontSize: 27, maxWidth: 960, lineHeight: 1.35, animationDelay: '.4s' }}>{t('intro.text')}</p>
          <p className="muted anim-up" style={{ fontSize: 21, maxWidth: 960, animationDelay: '.8s' }}>{t('intro.rules')}</p>
          <p className="anim-up" style={{ fontSize: 21, maxWidth: 960, color: 'var(--yellow)', animationDelay: '1.2s' }}>{t('intro.physical')}</p>
        </div>
      );
    case 'read':
      return (
        <>
          <HostHeader title={t('title')} color={PURPLE} info={info(view, t)} right={<HostTimer deadline={view.deadline} duration={view.duration} />} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 30, textAlign: 'center' }}>
            <span className="anim-pop"><CatTag cat={view.category} t={t} size={52} /></span>
            <p style={{ fontSize: 28 }}>{t(`how.${view.category}`)}</p>
            <h1 style={{ fontSize: 46 }}>{t('read.title')}</h1>
            <p className="muted" style={{ fontSize: 22 }}>{t('read.text')}</p>
          </div>
        </>
      );
    case 'go':
      return <HostGo {...props} />;
    case 'write': {
      const done = new Set<string>(view.done);
      return (
        <>
          <HostHeader title={t('title')} color={PURPLE} info={info(view, t)} right={<HostTimer deadline={view.deadline} duration={view.duration} />} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 36 }}>
            <CatTag cat="text" t={t} size={44} />
            <p style={{ fontSize: 26 }}>{t('how.text')}</p>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', justifyContent: 'center' }}>
              {(view.players as string[]).map((id) => player(id)).filter(Boolean).map((p) => (
                <Avatar key={p!.id} player={p!} size={72} dim={!done.has(p!.id)} />
              ))}
            </div>
          </div>
        </>
      );
    }
    case 'answers':
      return (
        <>
          <HostHeader title={t('title')} color={PURPLE} info={info(view, t)} />
          <h1 style={{ fontSize: 40 }}>{t('text.title')}</h1>
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${view.answers.length > 6 ? 3 : 2}, minmax(0, 1fr))`, gap: 14, alignContent: 'center' }}>
            {view.answers.map((a: any, i: number) => {
              const p = player(a.playerId);
              return p ? (
                <div key={a.playerId} className="up-card" style={{ display: 'flex', alignItems: 'center', gap: 14, animation: `upPop .4s ease-out ${(i * 0.12).toFixed(2)}s both` }}>
                  <Avatar player={p} size={52} />
                  <div style={{ minWidth: 0 }}>
                    <b style={{ fontSize: 16, color: 'var(--muted)' }}>{p.name}</b>
                    <p className="display" style={{ fontSize: 24, fontWeight: 800 }}>{a.text || '—'}</p>
                  </div>
                </div>
              ) : null;
            })}
          </div>
        </>
      );
    case 'vote': {
      const ps = props.room.players.filter((p) => p.role === 'player');
      return (
        <>
          <HostHeader title={t('title')} color={PURPLE} info={info(view, t)} right={<HostTimer deadline={view.deadline} duration={view.duration} />} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 34 }}>
            <h1 className="anim-pop" style={{ fontSize: 64 }}>{t('vote.title')}</h1>
            <p style={{ fontSize: 26 }}>{t('vote.discuss')}</p>
            <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', justifyContent: 'center' }}>
              {ps.map((p, i) => (
                <div key={p.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, animation: `upFloat 3s ease-in-out ${(-0.4 * i).toFixed(1)}s infinite` }}>
                  <Avatar player={p} size={80} />
                  <b style={{ fontSize: 17 }}>{p.name}</b>
                </div>
              ))}
            </div>
            <span className="up-chip" style={{ fontSize: 17 }}>{t('vote.count', { n: view.voted, total: view.voters })}</span>
          </div>
        </>
      );
    }
    case 'result':
      return <HostResult {...props} />;
    case 'scores': {
      const rows = Object.keys(view.after).map((id) => ({ player: player(id)!, before: view.before[id] ?? 0, after: view.after[id] })).filter((r) => r.player);
      return (
        <>
          <HostHeader title={t('title')} color={PURPLE} info={t('round', { n: view.round, total: view.totalRounds })} />
          <h1 style={{ fontSize: 36 }}>{t('scores.title')}</h1>
          <Scoreboard rows={rows} />
        </>
      );
    }
    case 'final':
      return (
        <>
          <HostHeader title={t('title')} color={PURPLE} info={t('final.title')} />
          <Podium ranking={view.ranking} player={player} pointsLabel={t('common.points')} />
        </>
      );
  }
  return null;
}

function HostGo({ view, t }: HostViewProps) {
  const now = useServerNow(100);
  const toGo = Math.ceil((view.now - now) / 1000);
  const go = toGo <= 0;
  useEffect(() => {
    if (toGo > 0 && toGo <= 3) sfx.play('beep');
    if (toGo === 0) sfx.play('go');
  }, [toGo]);
  return (
    <>
      <HostHeader title={t('title')} color={PURPLE} info={info(view, t)} right={go ? <HostTimer deadline={view.deadline} duration={view.deadline - view.now} /> : null} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, textAlign: 'center' }}>
        <CatTag cat={view.category} t={t} size={34} />
        {go ? (
          <>
            <h1 key="now" style={{ fontSize: 170, lineHeight: 1, color: 'var(--yellow)', animation: 'upPop .4s ease-out both' }}>{t('go.now')}</h1>
            <p style={{ fontSize: 28 }}>{t('go.hold')}</p>
          </>
        ) : (
          <>
            <p className="muted" style={{ fontSize: 28 }}>{t('go.ready')}</p>
            <h1 key={toGo} style={{ fontSize: 200, lineHeight: 1, animation: 'upPop .5s ease-out both' }}>{toGo}</h1>
          </>
        )}
      </div>
    </>
  );
}

function HostResult({ view, t, player }: HostViewProps) {
  const faker = view.faker ? player(view.faker) : undefined;
  const accused = view.accused ? player(view.accused) : undefined;
  const titles: Record<string, [string, string]> = {
    caught: [t('result.caught'), t('result.caughtText', { name: faker?.name ?? '' })],
    wrong: [t('result.wrong'), t('result.wrongText', { name: accused?.name ?? '', faker: faker?.name ?? '' })],
    none: [t('result.noMajority'), t('result.noMajorityText')],
    escaped: [t('result.escaped'), t('result.escapedText', { name: faker?.name ?? '' })],
  };
  const [title, text] = titles[view.outcome];
  useEffect(() => {
    sfx.play(view.outcome === 'caught' ? 'fanfare' : view.outcome === 'none' ? 'wrong' : 'sneaky');
  }, [view.outcome, view.round, view.taskNo]);
  const good = view.outcome === 'caught';
  return (
    <>
      {view.faker && <Confetti pieces={good ? 30 : 16} silent={!good} />}
      <HostHeader title={t('title')} color={PURPLE} info={info(view, t)} />
      <div style={{ flex: 1, display: 'flex', gap: 40, alignItems: 'center' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <h1 className="anim-pop" style={{ fontSize: 64, color: good ? 'var(--green)' : view.outcome === 'none' ? 'var(--yellow)' : 'var(--red)' }}>{title}</h1>
          <p style={{ fontSize: 26 }}>{text}</p>
          {view.task && (
            <div className="anim-up" style={{ animationDelay: '.6s' }}>
              <span className="up-label">{t('result.task')}</span>
              {(view.task as string[]).map((x, i) => <p key={i} className="display" style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>„{x}“</p>)}
            </div>
          )}
        </div>
        <div style={{ width: 460, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {faker && (
            <div className="up-card anim-pop" style={{ display: 'flex', alignItems: 'center', gap: 16, background: PURPLE, color: '#110D24', boxShadow: '0 6px 0 #6B4FD1', animationDelay: '.3s' }}>
              <Avatar player={faker} size={72} />
              <div>
                <b style={{ fontSize: 15 }}>{t('title')}</b>
                <p className="display" style={{ fontSize: 30, fontWeight: 800 }}>{faker.name}</p>
              </div>
              {view.gained?.[faker.id] > 0 && <span className="display" style={{ marginLeft: 'auto', fontSize: 30, fontWeight: 800 }}>+{view.gained[faker.id]}</span>}
            </div>
          )}
          {(view.tally as any[]).map((row, i) => {
            const p = player(row.playerId);
            const voters = (row.voters as string[]).map((id) => player(id)).filter(Boolean) as PlayerInfo[];
            return p ? (
              <div key={row.playerId} className="up-card" style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8, animation: `upSlideUp .4s ease-out ${(0.1 * i).toFixed(2)}s both` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Avatar player={p} size={40} />
                  <b style={{ fontSize: 19, flex: 1 }}>{p.name}</b>
                  <span className="display" style={{ fontSize: 24, fontWeight: 800 }}>{row.votes}</span>
                  <span className="muted" style={{ fontSize: 15 }}>{row.votes === 1 ? t('result.voteFor1') : t('result.votesFor')}</span>
                </div>
                <VoterChips voters={voters} crowdSize={10} />
              </div>
            ) : null;
          })}
        </div>
      </div>
    </>
  );
}

/* ================= Handy ================= */

function Controller({ view, t, send, me, player }: ControllerViewProps) {
  switch (view.screen) {
    case 'intro':
      return <PhoneWait title={t('title')} text={t('lookAtTv')} emoji={<Avatar player={me} size={96} />} />;
    case 'task':
    case 'faker': {
      const isFaker = view.screen === 'faker';
      if (view.write) {
        return (
          <>
            <PhoneTimer deadline={view.deadline} duration={view.duration} hurryText={t('timer.hurry')} />
            <CatTag cat="text" t={t} size={20} />
            {isFaker ? (
              <div style={{ background: PURPLE, color: '#110D24', borderRadius: 20, padding: 16 }}>
                <b className="display" style={{ fontSize: 22 }}>{t('faker.title')}</b>
                <p style={{ fontSize: 15 }}>{t('faker.text')}</p>
              </div>
            ) : (
              <h1 style={{ fontSize: 24 }}>{view.task}</h1>
            )}
            <TextAnswer button={t('text.send')} placeholder={t('text.input')} maxLength={50} onSubmit={(text) => send({ type: 'answer', text })} />
          </>
        );
      }
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 20 }}>
          {view.go && <p className="display anim-pop" style={{ fontSize: 56, fontWeight: 800, textAlign: 'center', color: 'var(--yellow)' }}>{t('go.now')}</p>}
          <CatTag cat={view.category} t={t} size={20} />
          {isFaker ? (
            <div className="anim-pop" style={{ background: PURPLE, color: '#110D24', borderRadius: 24, padding: 22, boxShadow: '0 6px 0 #6B4FD1' }}>
              <h1 style={{ fontSize: 30 }}>{t('faker.title')}</h1>
              <p style={{ fontSize: 17, marginTop: 8 }}>{t('faker.text')}</p>
            </div>
          ) : (
            <div className="up-card anim-pop" style={{ padding: 22 }}>
              <span className="up-label">{t('task.label')}</span>
              <h1 style={{ fontSize: 28, lineHeight: 1.2, marginTop: 8 }}>{view.task}</h1>
            </div>
          )}
          <p className="muted" style={{ textAlign: 'center' }}>{t('task.secret')}</p>
        </div>
      );
    }
    case 'written':
      return <PhoneWait title={t('text.sent')} emoji={<span className="display" style={{ fontSize: 24, fontWeight: 800, color: 'var(--yellow)' }}>„{view.answer}“</span>} />;
    case 'vote':
      return (
        <>
          <PhoneTimer deadline={view.deadline} duration={view.duration} hurryText={view.selected ? undefined : t('timer.hurry')} />
          <h1 style={{ fontSize: 26 }}>{t('vote.title')}</h1>
          <ChoiceList
            options={(view.options as string[]).map((id) => {
              const p = player(id);
              return { id, text: <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>{p && <Avatar player={p} size={36} flat />}{p?.name ?? '?'}</span> };
            })}
            selected={view.selected} onPick={(id) => send({ type: 'vote', target: id })} />
          <p className="muted" style={{ textAlign: 'center', marginTop: 'auto' }}>{view.selected ? `${t('vote.done')} · ${t('vote.change')}` : t('vote.pick')}</p>
        </>
      );
    case 'outcome': {
      let title = t('me.next');
      if (view.roundOver) {
        if (view.isFaker) title = view.outcome === 'caught' ? t('me.caught') : t('me.escaped');
        else title = view.correct ? t('me.found') : t('me.missed');
      }
      const happy = view.roundOver && (view.isFaker ? view.outcome !== 'caught' : view.correct && view.outcome === 'caught');
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, textAlign: 'center' }} className="anim-fade">
          {happy && <Confetti pieces={14} />}
          <Avatar player={me} size={104} />
          <h1 style={{ fontSize: 30 }}>{title}</h1>
          {view.fakerName && !view.isFaker && <p style={{ fontSize: 18 }}>{t('result.caughtText', { name: view.fakerName })}</p>}
          {view.points > 0 && <span className="display" style={{ fontSize: 56, fontWeight: 800, color: 'var(--yellow)', animation: 'upPop .6s ease-out both' }}>+{view.points}</span>}
        </div>
      );
    }
    case 'scoresMe':
    case 'finalMe':
      return <PhoneWait title={t('me.place', { place: view.place, of: view.of })} text={t('me.score', { n: view.score })} emoji={<Avatar player={me} size={110} />} />;
    default:
      return <PhoneWait title={t('lookAtTv')} emoji={<Avatar player={me} size={96} />} />;
  }
}

export default { Host, Controller } satisfies GameClientModule;
