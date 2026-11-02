import { useEffect, type ReactNode } from 'react';
import type { ControllerViewProps, GameClientModule, HostViewProps, PlayerInfo, Translate } from '@up/sdk';
import {
  Avatar, ChoiceList, Confetti, HostHeader, HostTimer, PhoneTimer, PhoneWait, Podium, Scoreboard, VoterChips, sfx, useServerNow, vibrate,
} from '@up/ui';

const PURPLE = '#9B7BFF';
const INK = '#110D24';

/** Jede Kategorie hat ihre eigene Farbe und ihr Piktogramm */
const CAT: Record<string, { color: string; dark: string; tint: string }> = {
  hands: { color: '#FFD447', dark: '#C79E1A', tint: '#3A3010' },
  number: { color: '#36D6F5', dark: '#1A97B0', tint: '#0F3440' },
  point: { color: '#4BE3A1', dark: '#23A872', tint: '#0F3A2A' },
};
const cat = (c: string) => CAT[c] ?? CAT.hands;

/** Piktogramme (eigene, einfache Formen) */
export function Pictogram({ category, size = 120, color = INK }: { category: string; size?: number; color?: string }) {
  const art: Record<string, ReactNode> = {
    hands: (
      <g fill={color}>
        <rect x="17" y="10" width="7" height="30" rx="3.5" />
        <rect x="25.5" y="5" width="7" height="34" rx="3.5" />
        <rect x="34" y="7" width="7" height="32" rx="3.5" />
        <rect x="42.5" y="13" width="7" height="27" rx="3.5" />
        <rect x="6" y="30" width="7" height="20" rx="3.5" transform="rotate(-38 9.5 40)" />
        <rect x="16" y="29" width="34" height="27" rx="12" />
      </g>
    ),
    number: (
      <g fill={color}>
        <rect x="21" y="6" width="7" height="32" rx="3.5" transform="rotate(-8 24.5 22)" />
        <rect x="30" y="5" width="7" height="33" rx="3.5" transform="rotate(6 33.5 21)" />
        <rect x="39" y="10" width="7" height="30" rx="3.5" transform="rotate(14 42.5 25)" />
        <rect x="14" y="30" width="34" height="26" rx="12" />
        <rect x="9" y="34" width="12" height="7" rx="3.5" />
        <circle cx="52" cy="50" r="10" fill={color} />
        <text x="52" y="54.5" textAnchor="middle" fontSize="13" fontWeight="900" fontFamily="Arial, sans-serif" fill={color === INK ? '#fff' : INK}>3</text>
      </g>
    ),
    point: (
      <g fill={color}>
        <rect x="26" y="22" width="34" height="9" rx="4.5" />
        <rect x="6" y="20" width="27" height="30" rx="11" />
        <rect x="12" y="13" width="7" height="14" rx="3.5" transform="rotate(-20 15.5 20)" />
        <rect x="22" y="33" width="14" height="7" rx="3.5" />
        <rect x="22" y="41" width="13" height="7" rx="3.5" />
      </g>
    ),
  };
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" style={{ flex: 'none' }}>
      {art[category] ?? art.hands}
    </svg>
  );
}

function info(view: any, t: Translate) {
  return `${t('round', { n: view.round, total: view.totalRounds })} · ${t('taskOf', { n: view.taskNo })}`;
}

function CatTag({ category, t, size = 26 }: { category: string; t: Translate; size?: number }) {
  const c = cat(category);
  return (
    <span className="up-tag" style={{ background: c.color, color: INK, boxShadow: `0 6px 0 ${c.dark}`, fontSize: size, transform: 'rotate(-2deg)', display: 'inline-flex', alignItems: 'center', gap: size * 0.4 }}>
      <Pictogram category={category} size={size * 1.3} />
      {t(`cat.${category}`)}
    </span>
  );
}

/** Farbiger Hintergrund für den ganzen Bildschirm */
function Tint({ category, strong = false, z = -1 }: { category: string; strong?: boolean; z?: number }) {
  const c = cat(category);
  return <div aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: z, background: strong ? c.color : `radial-gradient(circle at 50% 45%, ${c.tint}, var(--bg) 75%)` }} />;
}

/* ================= TV ================= */

function Host(props: HostViewProps) {
  const { view, t, player } = props;
  switch (view.screen) {
    case 'intro':
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 22, textAlign: 'center' }}>
          <span className="up-tag anim-pop" style={{ background: PURPLE, color: INK, boxShadow: '0 8px 0 #6B4FD1', fontSize: 76, padding: '12px 40px', borderRadius: 26, transform: 'rotate(-3deg)' }}>{t('title')}</span>
          <p className="anim-up" style={{ fontSize: 27, maxWidth: 960, lineHeight: 1.35, animationDelay: '.4s' }}>{t('intro.text')}</p>
          <div className="anim-up" style={{ display: 'flex', gap: 18, animationDelay: '.7s' }}>
            {(['hands', 'number', 'point'] as const).filter((c) => view.mode === 'rotate' || view.mode === 'random' || view.mode === c).map((c) => <CatTag key={c} category={c} t={t} size={22} />)}
          </div>
          <p className="muted anim-up" style={{ fontSize: 21, maxWidth: 960, animationDelay: '1s' }}>{t('intro.rules')}</p>
          <p className="anim-up" style={{ fontSize: 21, maxWidth: 960, color: 'var(--yellow)', animationDelay: '1.3s' }}>{t('intro.physical')}</p>
        </div>
      );
    case 'read':
      return (
        <>
          <Tint category={view.category} />
          <HostHeader title={t('title')} color={PURPLE} info={info(view, t)} right={<HostTimer deadline={view.deadline} duration={view.duration} />} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, textAlign: 'center' }}>
            <div className="anim-pop" style={{ width: 200, height: 200, borderRadius: '50%', background: cat(view.category).color, boxShadow: `0 10px 0 ${cat(view.category).dark}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Pictogram category={view.category} size={130} />
            </div>
            <CatTag category={view.category} t={t} size={34} />
            <p style={{ fontSize: 26 }}>{t(`how.${view.category}`)}</p>
            <h1 style={{ fontSize: 40 }}>{t('read.title')} <span className="muted" style={{ fontSize: 24, fontWeight: 500 }}>{t('read.text')}</span></h1>
          </div>
        </>
      );
    case 'go':
      return <HostGo {...props} />;
    case 'vote': {
      const ps = props.room.players.filter((p) => p.role === 'player');
      return (
        <>
          <HostHeader title={t('title')} color={PURPLE} info={info(view, t)} right={<HostTimer deadline={view.deadline} duration={view.duration} />} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 30 }}>
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
  const c = cat(view.category);
  return (
    <>
      <Tint category={view.category} strong={go} />
      <HostHeader title={t('title')} color={PURPLE} info={info(view, t)} right={go ? <HostTimer deadline={view.deadline} duration={view.deadline - view.now} /> : null} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, textAlign: 'center', color: go ? INK : '#fff' }}>
        <Pictogram category={view.category} size={go ? 150 : 110} color={go ? INK : c.color} />
        {go ? (
          <>
            <h1 key="now" style={{ fontSize: 150, lineHeight: 1, animation: 'upPop .4s ease-out both' }}>{t('go.now')}</h1>
            <p style={{ fontSize: 28, fontWeight: 700 }}>{t('go.hold')}</p>
          </>
        ) : (
          <>
            <p style={{ fontSize: 28, opacity: 0.8 }}>{t('go.ready')}</p>
            <h1 key={toGo} style={{ fontSize: 190, lineHeight: 1, color: c.color, animation: 'upPop .5s ease-out both' }}>{toGo}</h1>
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
  const good = view.outcome === 'caught';
  useEffect(() => {
    sfx.play(view.outcome === 'caught' ? 'fanfare' : view.outcome === 'none' ? 'wrong' : 'sneaky');
  }, [view.outcome, view.round, view.taskNo]);
  return (
    <>
      {view.faker && <Confetti pieces={good ? 30 : 16} silent={!good} />}
      <HostHeader title={t('title')} color={PURPLE} info={info(view, t)} />
      <div style={{ flex: 1, display: 'flex', gap: 40, alignItems: 'center' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <CatTag category={view.category} t={t} size={20} />
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
            <div className="up-card anim-pop" style={{ display: 'flex', alignItems: 'center', gap: 16, background: PURPLE, color: INK, boxShadow: '0 6px 0 #6B4FD1', animationDelay: '.3s' }}>
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

/**
 * Aufgabe bzw. Hochstapler-Hinweis. Beide sehen von Weitem gleich aus (gleiche Farbe, gleiches Piktogramm),
 * damit niemand den Hochstapler am Handy erkennt.
 */
function TaskScreen({ view, t }: ControllerViewProps) {
  const isFaker = view.screen === 'faker';
  const c = cat(view.category);
  const now = useServerNow(100);
  const go = view.go && view.goAt && now >= view.goAt;
  useEffect(() => {
    if (go) vibrate(isFaker ? [120, 60, 120] : 150);
  }, [go, isFaker]);
  return (
    <>
    <Tint category={view.category} strong z={0} />
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, color: INK, position: 'relative', zIndex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Pictogram category={view.category} size={56} />
        <span className="display" style={{ fontSize: 22, fontWeight: 800 }}>{t(`cat.${view.category}`)}</span>
      </div>
      {go && <p className="display anim-pop" style={{ fontSize: 54, fontWeight: 800, textAlign: 'center', lineHeight: 1 }}>{isFaker ? t('go.fakerNow') : t('go.now')}</p>}
      <div className="anim-pop" style={{ background: '#fff', borderRadius: 24, padding: 22, boxShadow: `0 8px 0 ${c.dark}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {isFaker ? (
          <>
            <h1 style={{ fontSize: 30, color: '#6B4FD1' }}>{t('faker.title')}</h1>
            <p style={{ fontSize: 17, fontWeight: 500 }}>{t(`faker.${view.category}`)}</p>
            <ol style={{ margin: 0, paddingLeft: 22, fontSize: 17, fontWeight: 700, lineHeight: 1.6 }}>
              <li>{t('faker.step1')}</li><li>{t('faker.step2')}</li><li>{t('faker.step3')}</li>
            </ol>
          </>
        ) : (
          <>
            <span className="up-label" style={{ color: '#6E6890' }}>{t('task.label')}</span>
            <h1 style={{ fontSize: 28, lineHeight: 1.2 }}>{view.task}</h1>
          </>
        )}
      </div>
      <p style={{ textAlign: 'center', fontWeight: 700, opacity: 0.75, marginTop: 'auto' }}>{t('task.secret')}</p>
    </div>
    </>
  );
}

function Controller(props: ControllerViewProps) {
  const { view, t, send, me, player } = props;
  switch (view.screen) {
    case 'intro':
      return <PhoneWait title={t('title')} text={t('lookAtTv')} emoji={<Avatar player={me} size={96} />} />;
    case 'task':
    case 'faker':
      return <TaskScreen {...props} />;
    case 'vote':
      return (
        <>
          <PhoneTimer deadline={view.deadline} duration={view.duration} hurryText={view.selected ? undefined : t('timer.hurry')} />
          <h1 style={{ fontSize: 26 }}>{t('vote.title')}</h1>
          {view.isFaker && <p style={{ fontSize: 15, color: PURPLE, fontWeight: 700 }}>{t('faker.vote')}</p>}
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
          {happy && <Confetti pieces={14} silent />}
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
