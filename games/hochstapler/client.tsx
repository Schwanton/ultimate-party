import { useEffect, useState, type ReactNode } from 'react';
import type { ControllerViewProps, GameClientModule, HostViewProps, PlayerInfo, Translate } from '@up/sdk';
import {
  Avatar, ChoiceList, Confetti, HostHeader, HostTimer, PhoneTimer, PhoneWait, Podium, VoterChips, sfx, useServerNow, vibrate,
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
  return t('round', { n: view.round, total: view.totalRounds });
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
          <p className="muted anim-up" style={{ fontSize: 21, maxWidth: 960, animationDelay: '1s' }}>{t('intro.rules', { n: view.totalRounds })}</p>
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
            {view.task && <TaskCard text={view.task} t={t} dark={cat(view.category).dark} small />}
            <h1 className="anim-pop" style={{ fontSize: 56 }}>{t('vote.title')}</h1>
            <p style={{ fontSize: 24 }}>{t('vote.discuss')}</p>
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
    case 'tally':
      return <HostTally {...props} />;
    case 'final':
      return (
        <>
          <HostHeader title={t('title')} color={PURPLE} info={t('final.title')} />
          <h1 style={{ fontSize: 36 }}>{t('final.title')}</h1>
          <Podium ranking={view.ranking} player={player} pointsLabel={t('common.points')} />
        </>
      );
  }
  return null;
}

/** Die Aufgabe, für alle sichtbar – hilft beim Diskutieren (auch dem Hochstapler) */
function TaskCard({ text, t, dark, small = false, label = 'task.was' }: { text: string; t: Translate; dark: string; small?: boolean; label?: string }) {
  return (
    <div className="anim-pop" style={{ background: '#fff', color: INK, borderRadius: 24, padding: small ? '14px 22px' : '20px 30px', boxShadow: `0 8px 0 ${dark}`, maxWidth: 1000, textAlign: 'center' }}>
      <span className="up-label" style={{ color: '#6E6890' }}>{t(label)}</span>
      <p className="display" style={{ fontSize: small ? 26 : 34, fontWeight: 800, lineHeight: 1.2, marginTop: 4 }}>{text}</p>
    </div>
  );
}

function HostGo({ view, t }: HostViewProps) {
  const now = useServerNow(100);
  const toGo = Math.ceil((view.now - now) / 1000);
  const go = toGo <= 0;
  const showTask = go && !!view.taskAt && now >= view.taskAt;
  useEffect(() => {
    if (showTask) sfx.play('reveal');
  }, [showTask]);
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
        <Pictogram category={view.category} size={showTask ? 90 : go ? 150 : 110} color={go ? INK : c.color} />
        {go ? (
          <>
            <h1 key="now" style={{ fontSize: showTask ? 96 : 150, lineHeight: 1, animation: 'upPop .4s ease-out both', transition: 'font-size .4s' }}>{t('go.now')}</h1>
            {showTask ? <TaskCard text={view.task} t={t} dark={c.dark} label="task.is" /> : <p style={{ fontSize: 28, fontWeight: 700 }}>{t('go.hold')}</p>}
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
  const accused = view.accused ? player(view.accused) : undefined;
  const titles: Record<string, [string, string, string]> = {
    caught: [t('result.caught'), t('result.caughtSoon'), 'var(--green)'],
    wrong: [t('result.wrong'), view.last ? t('result.lastRound') : t('result.wrongText', { name: accused?.name ?? '' }), 'var(--red)'],
    none: [t('result.noMajority'), view.last ? t('result.lastRound') : t('result.noMajorityText'), 'var(--yellow)'],
  };
  const [title, text, color] = titles[view.outcome];
  useEffect(() => {
    sfx.play(view.outcome === 'caught' ? 'fanfare' : 'wrong');
  }, [view.outcome, view.round]);
  return (
    <>
      <HostHeader title={t('title')} color={PURPLE} info={info(view, t)} />
      <div style={{ flex: 1, display: 'flex', gap: 40, alignItems: 'center' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <CatTag category={view.category} t={t} size={20} />
          <h1 className="anim-pop" style={{ fontSize: 64, color }}>{title}</h1>
          <p style={{ fontSize: 26 }}>{text}</p>
          {view.outcome === 'wrong' && accused && (
            <div className="up-card anim-pop" style={{ display: 'flex', alignItems: 'center', gap: 16, alignSelf: 'flex-start', animationDelay: '.4s' }}>
              <Avatar player={accused} size={64} />
              <p className="display" style={{ fontSize: 26, fontWeight: 800 }}>{t('result.innocent', { name: accused.name })}</p>
            </div>
          )}
        </div>
        <div style={{ width: 460, display: 'flex', flexDirection: 'column', gap: 10 }}>
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

/** Auszählung am Ende: erst wird der Hochstapler enthüllt, dann Zeile für Zeile alle Tipps aller Runden */
const REVEAL_AT = 3.2;
/** Zeigt den Inhalt erst nach `at` Sekunden */
function Later({ at, children }: { at: number; children: ReactNode }) {
  const [show, setShow] = useState(false);
  useEffect(() => { const id = setTimeout(() => setShow(true), at * 1000); return () => clearTimeout(id); }, [at]);
  return show ? <>{children}</> : null;
}
const TABLE_AT = 6;
const ROW_STEP = 0.9;

function HostTally({ view, t, player }: HostViewProps) {
  const faker = player(view.faker);
  const rounds = view.rounds as { round: number; category: string; votes: Record<string, string>; outcome: string }[];
  const order = view.order as string[];
  useEffect(() => {
    sfx.play('drumroll');
    const a = setTimeout(() => sfx.play(view.caught ? 'fanfare' : 'sneaky'), REVEAL_AT * 1000);
    const timers = order.map((_, i) => setTimeout(() => sfx.play('pop'), (TABLE_AT + i * ROW_STEP) * 1000));
    return () => { clearTimeout(a); timers.forEach(clearTimeout); };
  }, [view.faker]);
  const cell = rounds.length > 7 ? 40 : 52;
  return (
    <>
      <Later at={REVEAL_AT}><Confetti pieces={view.caught ? 30 : 16} silent /></Later>
      <HostHeader title={t('title')} color={PURPLE} info={t('tally.title')} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
        <p className="anim-fade" style={{ fontSize: 30, fontWeight: 700 }}>{t('tally.was')}</p>
        {faker && (
          <div className="up-card" style={{ display: 'flex', alignItems: 'center', gap: 14, background: PURPLE, color: INK, boxShadow: '0 6px 0 #6B4FD1', padding: '8px 22px 8px 10px', animation: `upPop .6s ease-out ${REVEAL_AT}s both` }}>
            <Avatar player={faker} size={58} />
            <span className="display" style={{ fontSize: 34, fontWeight: 800 }}>{faker.name}</span>
          </div>
        )}
        <p className="display" style={{ fontSize: 26, fontWeight: 800, color: view.caught ? 'var(--green)' : 'var(--red)', animation: `upPop .5s ease-out ${REVEAL_AT + 0.8}s both` }}>
          {view.caught ? t('tally.caughtIn', { n: view.caughtRound }) : t('tally.escaped')}
        </p>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', animation: `upFade .4s ease-out ${TABLE_AT - 0.4}s both` }}>
          <span className="up-label" style={{ width: 210 }}>{t('tally.player')}</span>
          {rounds.map((r) => (
            <span key={r.round} title={t(`cat.${r.category}`)} style={{ width: cell, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <Pictogram category={r.category} size={22} color={cat(r.category).color} />
              <span className="up-label" style={{ fontSize: 12 }}>{r.round}</span>
            </span>
          ))}
          <span className="up-label" style={{ flex: 1, textAlign: 'right' }}>{t('tally.points')}</span>
        </div>
        {order.map((id, i) => {
          const p = player(id);
          if (!p) return null;
          const isFaker = id === view.faker;
          const parts = (view.breakdown[id] as { label: string; points: number; n?: number }[]).map((b) => t(`tally.${b.label}`, { n: b.n ?? b.points })).join(' · ');
          return (
            <div key={id} className="up-card" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', background: isFaker ? '#2A2150' : undefined, boxShadow: isFaker ? `inset 0 0 0 3px ${PURPLE}` : undefined, animation: `upSlideUp .4s ease-out ${(TABLE_AT + i * ROW_STEP).toFixed(2)}s both` }}>
              <span style={{ width: 210, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <Avatar player={p} size={38} flat />
                <b style={{ fontSize: 18, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</b>
              </span>
              {rounds.map((r) => {
                if (isFaker) return <span key={r.round} className="display" style={{ width: cell, textAlign: 'center', color: r.outcome === 'caught' ? 'var(--red)' : PURPLE, fontWeight: 800, fontSize: 22 }}>{r.outcome === 'caught' ? '✗' : '✓'}</span>;
                const target = r.votes[id] ? player(r.votes[id]) : undefined;
                const hit = r.votes[id] === view.faker;
                return (
                  <span key={r.round} style={{ width: cell, display: 'flex', justifyContent: 'center' }}>
                    {target ? (
                      <span style={{ borderRadius: '50%', boxShadow: hit ? '0 0 0 4px var(--green), 0 0 14px rgba(75,227,161,.7)' : undefined, opacity: hit ? 1 : 0.3, filter: hit ? undefined : 'grayscale(.6)', display: 'inline-flex' }}>
                        <Avatar player={target} size={cell - 16} flat />
                      </span>
                    ) : <span className="faint">–</span>}
                  </span>
                );
              })}
              <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12 }}>
                <span className="muted" style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{parts}</span>
                <span className="display" style={{ fontSize: 26, fontWeight: 800, color: 'var(--yellow)' }}>{view.totals[id] ?? 0}</span>
              </span>
            </div>
          );
        })}
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
          {view.task && (
            <div style={{ background: '#fff', color: INK, borderRadius: 16, padding: '10px 14px', borderLeft: `6px solid ${cat(view.category).color}` }}>
              <span className="up-label" style={{ color: '#6E6890', fontSize: 12 }}>{t('task.was')}</span>
              <p style={{ fontWeight: 700, fontSize: 16, marginTop: 2 }}>{view.task}</p>
            </div>
          )}
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
      let text = '';
      if (view.last) { title = view.outcome === 'caught' ? t('result.caught') : t('me.lastRound'); text = t('me.tallySoon'); }
      else if (view.accusedMe) { title = t('me.innocent'); text = t('me.next'); }
      else if (view.isFaker) { title = t('me.stillHidden'); text = view.accusedName ? t('result.wrongText', { name: view.accusedName }) : ''; }
      else if (view.accusedName) text = t('result.wrongText', { name: view.accusedName });
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, textAlign: 'center' }} className="anim-fade">
          <Avatar player={me} size={104} />
          <h1 style={{ fontSize: 30 }}>{title}</h1>
          {text && <p style={{ fontSize: 18 }}>{text}</p>}
        </div>
      );
    }
    case 'end': {
      const title = view.isFaker ? (view.caught ? t('me.caught') : t('me.escaped')) : t('result.caughtText', { name: view.fakerName });
      const happy = view.isFaker ? !view.caught : view.hits > 0;
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, textAlign: 'center' }} className="anim-fade">
          {happy && <Confetti pieces={14} silent />}
          <Avatar player={me} size={104} />
          <h1 style={{ fontSize: 28 }}>{title}</h1>
          {!view.isFaker && <p style={{ fontSize: 18 }}>{t('me.hits', { n: view.hits, total: view.rounds })}</p>}
          <span className="display" style={{ fontSize: 52, fontWeight: 800, color: 'var(--yellow)', animation: 'upPop .6s ease-out both' }}>{t('me.score', { n: view.score })}</span>
          <p className="muted" style={{ fontSize: 18 }}>{t('me.place', { place: view.place, of: view.of })}</p>
        </div>
      );
    }
    default:
      return <PhoneWait title={t('lookAtTv')} emoji={<Avatar player={me} size={96} />} />;
  }
}

export default { Host, Controller } satisfies GameClientModule;
