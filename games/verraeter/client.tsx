import { useEffect, useState } from 'react';
import type { ControllerViewProps, GameClientModule, HostViewProps, PlayerInfo, Translate } from '@up/sdk';
import { Avatar, Confetti, HostHeader, HostTimer, PhoneTimer, PhoneWait, Podium, sfx, useServerNow } from '@up/ui';
import { voterSchedule, votersSeconds } from './timing';

const BLUE = '#6C8CFF';
const BLUE_D = '#3D5BD9';
const LOYAL = '#36D6F5';
const LOYAL_D = '#1A97B0';
const TRAITOR = '#FF4F5E';
const TRAITOR_D = '#B8202E';
const NOBODY = 'nobody';

type Player = HostViewProps['player'];

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

/** Missions-Leiste: 3 Plätze für erfüllte, 3 für sabotierte Missionen */
function Track({ ok, fail, win, t }: { ok: number; fail: number; win: number; t: Translate }) {
  const dot = (filled: boolean, color: string, dark: string, icon: string, i: number) => (
    <span key={i} style={{ width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, background: filled ? color : 'transparent', border: filled ? 0 : `3px dashed ${color}`, boxShadow: filled ? `0 3px 0 ${dark}` : undefined, opacity: filled ? 1 : 0.5 }}>{filled ? icon : ''}</span>
  );
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <span style={{ display: 'flex', gap: 6 }} title={t('track.ok')}>{Array.from({ length: win }, (_, i) => dot(i < ok, LOYAL, LOYAL_D, '✓', i))}</span>
      <span className="faint" style={{ fontWeight: 800 }}>:</span>
      <span style={{ display: 'flex', gap: 6 }} title={t('track.fail')}>{Array.from({ length: win }, (_, i) => dot(i < fail, TRAITOR, TRAITOR_D, '💣', i))}</span>
    </div>
  );
}

function Header({ view, t }: { view: any; t: Translate }) {
  return (
    <HostHeader title={t('title')} color={BLUE} info={`${t('round', { n: view.round })} · ${t('aliveCount', { n: view.alive.length })} · ${t('traitorsStart', { n: view.traitorsTotal })}`}
      right={<div style={{ display: 'flex', alignItems: 'center', gap: 16 }}><Track ok={view.ok} fail={view.fail} win={view.win} t={t} />{view.deadline ? <HostTimer deadline={view.deadline} duration={view.duration} /> : null}</div>} />
  );
}

function RoleTag({ role, t, size = 18 }: { role: 'loyal' | 'traitor'; t: Translate; size?: number }) {
  const traitor = role === 'traitor';
  return (
    <span className="up-tag" style={{ background: traitor ? TRAITOR : LOYAL, color: '#110D24', boxShadow: `0 4px 0 ${traitor ? TRAITOR_D : LOYAL_D}`, fontSize: size, whiteSpace: 'nowrap' }}>
      {traitor ? '🗡️ ' + t('role.traitor') : '🛡️ ' + t('role.loyal')}
    </span>
  );
}

/** Spielerraster: markiert Team, Anführer*in, Stimmen */
function Grid({ ids, player, team, leader, decided, badges, dim, highlight }: {
  ids: string[]; player: Player; team?: string[]; leader?: string; decided?: string[]; badges?: Record<string, number>; dim?: (id: string) => boolean; highlight?: string | null;
}) {
  const n = ids.length;
  const size = n > 20 ? 54 : n > 12 ? 66 : 84;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: n > 20 ? '12px 10px' : '18px 18px', maxWidth: 1150, margin: '0 auto' }}>
      {ids.map((id) => {
        const p = player(id);
        if (!p) return null;
        const inTeam = team?.includes(id);
        const hl = highlight === id;
        const b = badges?.[id] ?? 0;
        return (
          <div key={id} style={{ position: 'relative', width: size + 30, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, opacity: dim?.(id) ? 0.3 : 1, transform: hl ? 'scale(1.25)' : inTeam ? 'translateY(-6px)' : undefined, transition: 'transform .35s cubic-bezier(.2,.9,.3,1.4), opacity .4s', zIndex: hl ? 3 : 1 }}>
            <span style={{ borderRadius: '50%', boxShadow: hl ? `0 0 0 5px var(--yellow), 0 0 30px ${BLUE}` : inTeam ? `0 0 0 6px ${BLUE}, 0 0 26px ${BLUE}` : undefined, transition: 'box-shadow .2s' }}><Avatar player={p} size={size} /></span>
            <b style={{ fontSize: n > 20 ? 13 : 15, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...(inTeam ? { background: BLUE, borderRadius: 999, padding: '1px 8px' } : {}) }}>{p.name}</b>
            {leader === id && <span style={{ position: 'absolute', top: -14, fontSize: 24 }}>👑</span>}
            {decided?.includes(id) && <span style={{ position: 'absolute', right: 8, bottom: 22, width: 24, height: 24, borderRadius: '50%', background: 'var(--green)', color: '#110D24', fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</span>}
            {b > 0 && <span key={b} className="display" style={{ position: 'absolute', top: -8, right: 6, minWidth: 32, height: 32, padding: '0 8px', borderRadius: 16, background: 'var(--yellow)', color: '#110D24', fontSize: 18, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 0 var(--yellow-d)', animation: 'upPop .3s ease-out both' }}>{b}</span>}
          </div>
        );
      })}
    </div>
  );
}

function Banished({ view, player, t }: { view: any; player: Player; t: Translate }) {
  if (!view.banished?.length) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, paddingBottom: 4 }}>
      <span className="faint" style={{ fontSize: 15, fontWeight: 700 }}>{t('banished.label')}</span>
      {view.banished.map((b: any) => {
        const p = player(b.playerId);
        return p ? (
          <span key={b.playerId} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface)', borderRadius: 999, padding: '3px 12px 3px 3px' }}>
            <Avatar player={p} size={28} dim />
            <span style={{ fontSize: 14, fontWeight: 700, color: b.role === 'traitor' ? TRAITOR : LOYAL }}>{b.role === 'traitor' ? '🗡️' : '🛡️'} {p.name}</span>
          </span>
        ) : null;
      })}
    </div>
  );
}

function Host(props: HostViewProps) {
  const { view, t, player } = props;
  switch (view.screen) {
    case 'intro':
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, textAlign: 'center' }}>
          <span className="up-tag anim-pop" style={{ background: BLUE, color: '#fff', boxShadow: `0 8px 0 ${BLUE_D}`, fontSize: 76, padding: '12px 40px', borderRadius: 26, transform: 'rotate(-3deg)' }}>{t('title')}</span>
          <p className="anim-up" style={{ fontSize: 27, maxWidth: 980, lineHeight: 1.35, animationDelay: '.4s' }}>{t('intro.text', { n: view.traitors })}</p>
          <div className="anim-up" style={{ display: 'flex', gap: 20, animationDelay: '.8s' }}>
            <div className="up-card" style={{ padding: '16px 22px', maxWidth: 440, textAlign: 'left', borderTop: `6px solid ${LOYAL}` }}>
              <b style={{ fontSize: 20, color: LOYAL }}>🛡️ {t('intro.loyalWin')}</b>
              <p className="muted" style={{ fontSize: 17, marginTop: 6 }}>{t('intro.loyalHow', { n: view.win })}</p>
            </div>
            <div className="up-card" style={{ padding: '16px 22px', maxWidth: 440, textAlign: 'left', borderTop: `6px solid ${TRAITOR}` }}>
              <b style={{ fontSize: 20, color: TRAITOR }}>🗡️ {t('intro.traitorWin')}</b>
              <p className="muted" style={{ fontSize: 17, marginTop: 6 }}>{t('intro.traitorHow', { n: view.win })}</p>
            </div>
          </div>
        </div>
      );
    case 'roles':
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 26, textAlign: 'center' }}>
          <span style={{ fontSize: 110, animation: 'upWobble 1.6s ease-in-out infinite' }}>🤫</span>
          <h1 style={{ fontSize: 52 }}>{t('roles.title')}</h1>
          <p className="muted" style={{ fontSize: 26 }}>{t('roles.text', { n: view.traitors })}</p>
        </div>
      );
    case 'pick': {
      const leader = player(view.leader);
      return (
        <>
          <Header view={view} t={t} />
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <h1 style={{ fontSize: 40 }}>{t('pick.title', { name: leader?.name ?? '?' })}</h1>
            <p className="muted" style={{ fontSize: 22 }}>{t('pick.text', { n: view.size, have: view.team.length })}</p>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}><div style={{ flex: 1 }}><Grid ids={view.alive} player={player} team={view.team} leader={view.leader} /></div></div>
          <Banished view={view} player={player} t={t} />
        </>
      );
    }
    case 'mission':
      return (
        <>
          <Header view={view} t={t} />
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <h1 style={{ fontSize: 44 }}>{t('mission.title')}</h1>
            <p className="muted" style={{ fontSize: 22 }}>{t('mission.text')}</p>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}><div style={{ flex: 1 }}><Grid ids={view.team} player={player} decided={view.decided} leader={view.leader} /></div></div>
          <Banished view={view} player={player} t={t} />
        </>
      );
    case 'missionResult':
      return <HostMissionResult {...props} />;
    case 'vote':
      return (
        <>
          <Header view={view} t={t} />
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h1 style={{ fontSize: 46 }}>{t('vote.title')}</h1>
            <p className="muted" style={{ fontSize: 21 }}>{view.lastResult === 'fail' ? t('vote.afterFail') : t('vote.afterOk')}</p>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}><div style={{ flex: 1 }}><Grid ids={view.alive} player={player} team={view.team} /></div></div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
            <span className="up-chip" style={{ fontSize: 17 }}>{t('vote.count', { n: view.voted, total: view.voters })}</span>
            <span className="up-chip" style={{ fontSize: 17 }}>{t('vote.teamHint')}</span>
          </div>
        </>
      );
    case 'voteResult':
      return <HostVoteResult {...props} />;
    case 'end':
      return <HostEnd {...props} />;
    case 'final':
      return (
        <>
          <HostHeader title={t('title')} color={BLUE} info={t('final.title')} />
          <Podium ranking={view.ranking} player={player} pointsLabel={t('common.points')} />
        </>
      );
  }
  return null;
}

function HostMissionResult({ view, t, player }: HostViewProps) {
  const deck = view.deck as ('ok' | 'fail')[];
  const elapsed = useElapsed(`m${view.round}`, 1 + deck.length * view.flip + 2);
  const flipped = Math.max(0, Math.min(deck.length, Math.floor((elapsed - 1) / view.flip) + 1));
  const shown = elapsed >= 1 + deck.length * view.flip;
  const fails = deck.slice(0, flipped).filter((c) => c === 'fail').length;
  useEffect(() => {
    if (flipped > 0) sfx.play(deck[flipped - 1] === 'fail' ? 'wrong' : 'pop');
  }, [flipped]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (shown) sfx.play(view.result === 'ok' ? 'fanfare' : 'stamp');
  }, [shown]); // eslint-disable-line react-hooks/exhaustive-deps
  const ok = view.result === 'ok';
  const w = deck.length > 4 ? 120 : 150;
  return (
    <>
      {shown && ok && <Confetti silent />}
      <Header view={{ ...view, ok: shown || !ok ? view.ok : view.ok - 1, fail: shown || ok ? view.fail : view.fail - 1 }} t={t} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 34 }}>
        <p className="muted display" style={{ fontSize: 26, fontWeight: 700 }}>{t('result.cards')}</p>
        <div style={{ display: 'flex', gap: 18 }}>
          {deck.map((c, i) => {
            const open = i < flipped;
            const bad = c === 'fail';
            return (
              <div key={i} style={{ width: w, height: w * 1.35, borderRadius: 20, perspective: 600 }}>
                <div style={{ width: '100%', height: '100%', borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: w * 0.45,
                  background: open ? (bad ? TRAITOR : LOYAL) : 'var(--surface-2)', boxShadow: `0 8px 0 ${open ? (bad ? TRAITOR_D : LOYAL_D) : '#0A0716'}`,
                  transform: open ? 'rotateY(0deg)' : 'rotateY(180deg)', transition: 'transform .45s ease, background .2s .2s' }}>
                  {open ? (bad ? '💣' : '✓') : <span style={{ fontSize: w * 0.3, opacity: 0.35 }}>?</span>}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ minHeight: 80, display: 'flex', alignItems: 'center' }}>
          {shown ? (
            <span className="up-tag" style={{ fontSize: 44, padding: '10px 30px', background: ok ? LOYAL : TRAITOR, color: '#110D24', boxShadow: `0 7px 0 ${ok ? LOYAL_D : TRAITOR_D}`, animation: 'upBadge .6s ease-out both' }}>
              {ok ? t('result.ok') : t('result.fail', { n: fails })}
            </span>
          ) : (
            <span className="faint" style={{ fontSize: 22 }}>{t('result.team', { names: (view.team as string[]).map((id) => player(id)?.name).join(', ') })}</span>
          )}
        </div>
      </div>
      <Banished view={view} player={player} t={t} />
    </>
  );
}

function HostVoteResult({ view, t, player }: HostViewProps) {
  const tally = view.tally as { playerId: string; voters: string[] }[];
  const counts = tally.map((x) => x.voters.length);
  const total = counts.reduce((a, b) => a + b, 0);
  const V = votersSeconds(total);
  const elapsed = useElapsed(`v${view.round}`, 1 + V + 4) - 1;
  const sched = voterSchedule(counts);
  const badges: Record<string, number> = {};
  tally.forEach((x, i) => (badges[x.playerId] = sched[i].filter((at) => at <= elapsed).length));
  const drum = elapsed >= V + 0.3;
  const reveal = elapsed >= V + 2.2;
  const out = view.out ? player(view.out) : null;
  useEffect(() => {
    const n = Object.values(badges).reduce((a, b) => a + b, 0);
    if (n > 0) sfx.play('pop');
  }, [Object.values(badges).reduce((a, b) => a + b, 0)]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (drum && out) sfx.play('drumroll');
  }, [drum]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (reveal) sfx.play(view.outRole === 'traitor' ? 'fanfare' : view.out ? 'wrong' : 'whoosh');
  }, [reveal]); // eslint-disable-line react-hooks/exhaustive-deps
  const candidates = view.before as string[];
  return (
    <>
      {reveal && view.outRole === 'traitor' && <Confetti silent />}
      <Header view={reveal ? view : { ...view, alive: view.before }} t={t} />
      <div style={{ minHeight: 120, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, textAlign: 'center' }}>
        {!drum && <h1 style={{ fontSize: 42 }}>{t('voteResult.counting')}</h1>}
        {drum && !reveal && <h1 className="anim-pop" style={{ fontSize: 42 }}>{out ? t('voteResult.out', { name: out.name }) : view.tie ? t('voteResult.tie') : t('voteResult.nobody')}</h1>}
        {reveal && out && (
          <div className="anim-pop" style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <Avatar player={out} size={72} />
            <span className="display" style={{ fontSize: 40, fontWeight: 800 }}>{t('voteResult.was', { name: out.name })}</span>
            <RoleTag role={view.outRole} t={t} size={34} />
          </div>
        )}
        {reveal && !out && <h1 style={{ fontSize: 40 }}>{view.tie ? t('voteResult.tie') : t('voteResult.nobody')}</h1>}
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <Grid ids={candidates} player={player} badges={badges} highlight={drum ? view.out : null} dim={drum && view.out ? (id) => id !== view.out : undefined} />
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 12, paddingBottom: 4 }}>
        {badges[NOBODY] > 0 && <span className="up-chip" style={{ fontSize: 17 }}>{t('voteResult.skip', { n: badges[NOBODY] })}</span>}
      </div>
      <Banished view={{ banished: reveal ? view.banished : view.banished.filter((b: any) => b.playerId !== view.out) }} player={player} t={t} />
    </>
  );
}

function HostEnd({ view, t, player }: HostViewProps) {
  const loyalWon = view.winner === 'loyal';
  const traitors = (view.traitors as string[]).map((id) => player(id)).filter(Boolean) as PlayerInfo[];
  useEffect(() => {
    sfx.play('fanfare');
  }, []);
  return (
    <>
      <Confetti silent />
      <HostHeader title={t('title')} color={BLUE} info={t('end.info')} right={<Track ok={view.ok} fail={view.fail} win={view.win} t={t} />} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 26, textAlign: 'center' }}>
        <span className="up-tag anim-pop" style={{ fontSize: 60, padding: '14px 40px', background: loyalWon ? LOYAL : TRAITOR, color: '#110D24', boxShadow: `0 9px 0 ${loyalWon ? LOYAL_D : TRAITOR_D}` }}>
          {loyalWon ? '🛡️ ' + t('end.loyal') : '🗡️ ' + t('end.traitor')}
        </span>
        <p className="anim-up" style={{ fontSize: 26 }}>{t(`end.reason.${view.reason}`)}</p>
        <div className="anim-up" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, animationDelay: '.6s' }}>
          <span className="muted" style={{ fontSize: 20, fontWeight: 700 }}>{t('end.traitorsWere')}</span>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
            {traitors.map((p) => (
              <div key={p.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <span style={{ borderRadius: '50%', boxShadow: `0 0 0 4px ${TRAITOR}` }}><Avatar player={p} size={76} /></span>
                <b style={{ fontSize: 18 }}>{p.name}</b>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/* ================= Handy ================= */

/** Rolle antippen zum Anzeigen – damit niemand über die Schulter schaut */
function RoleChip({ view, t, player }: { view: any; t: Translate; player: Player }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => setOpen(false), 4000);
    return () => clearTimeout(id);
  }, [open]);
  if (!view.role) return null;
  const traitor = view.role === 'traitor';
  return (
    <button type="button" onClick={() => setOpen((o) => !o)} style={{
      border: 0, borderRadius: 16, minHeight: 44, padding: '8px 14px', textAlign: 'left', fontSize: 15, fontWeight: 700,
      background: open ? (traitor ? TRAITOR : LOYAL) : 'var(--surface)', color: open ? '#110D24' : 'var(--muted)',
    }}>
      {open ? (
        <>
          {traitor ? '🗡️ ' + t('role.traitor') : '🛡️ ' + t('role.loyal')}
          {traitor && view.mates?.length > 0 && <span style={{ display: 'block', fontWeight: 600, fontSize: 13 }}>{t('role.mates', { names: view.mates.map((id: string) => player(id)?.name ?? '?').join(', ') })}</span>}
        </>
      ) : '🔒 ' + t('role.peek')}
    </button>
  );
}

function PlayerPicker({ ids, selected, onPick, player, multi }: { ids: string[]; selected: string[]; onPick: (id: string) => void; player: Player; multi?: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      {ids.map((id) => {
        const p = player(id);
        if (!p) return null;
        const on = selected.includes(id);
        return (
          <button key={id} type="button" aria-pressed={on} onClick={() => onPick(id)} style={{
            minHeight: 56, border: 0, borderRadius: 16, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
            background: on ? BLUE : 'var(--surface)', color: '#fff', boxShadow: on ? '0 0 0 3px #fff' : undefined,
          }}>
            <Avatar player={p} size={36} flat={on} />
            <b style={{ fontSize: 15, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</b>
            {multi && <span style={{ fontSize: 18 }}>{on ? '✓' : ''}</span>}
          </button>
        );
      })}
    </div>
  );
}

function Controller({ view, t, send, me, player }: ControllerViewProps) {
  const now = useServerNow(250);
  const [shown, setShown] = useState(false);
  const chip = <RoleChip view={view} t={t} player={player} />;
  switch (view.screen) {
    case 'intro':
      return <PhoneWait title={t('title')} text={t('lookAtTv')} emoji={<Avatar player={me} size={96} />} />;
    case 'role': {
      const traitor = view.role === 'traitor';
      if (!shown) {
        return (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, textAlign: 'center' }}>
            <span style={{ fontSize: 80 }}>🤫</span>
            <h1 style={{ fontSize: 26 }}>{t('role.cover')}</h1>
            <button className="up-btn big full" onClick={() => setShown(true)}>{t('role.show')}</button>
          </div>
        );
      }
      return (
        <div className="anim-pop" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, textAlign: 'center', background: traitor ? TRAITOR : LOYAL, color: '#110D24', borderRadius: 28, padding: 24 }}>
          <span style={{ fontSize: 80 }}>{traitor ? '🗡️' : '🛡️'}</span>
          <h1 style={{ fontSize: 34 }}>{traitor ? t('role.youTraitor') : t('role.youLoyal')}</h1>
          <p style={{ fontSize: 17, fontWeight: 600 }}>{traitor ? t('role.traitorGoal') : t('role.loyalGoal')}</p>
          {traitor && view.mates.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <b>{t('role.matesTitle')}</b>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
                {view.mates.map((id: string) => {
                  const p = player(id);
                  return p ? <span key={id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}><Avatar player={p} size={52} /><b style={{ fontSize: 14 }}>{p.name}</b></span> : null;
                })}
              </div>
            </div>
          )}
          {traitor && view.mates.length === 0 && <p style={{ fontSize: 15 }}>{t('role.alone')}</p>}
          <button className="up-btn ghost small" onClick={() => setShown(false)}>{t('role.hide')}</button>
        </div>
      );
    }
    case 'pick':
      return (
        <>
          <PhoneTimer deadline={view.deadline} duration={view.duration} hurryText={t('timer.hurry')} />
          {chip}
          <span className="up-label">👑 {t('pick.you')}</span>
          <h1 style={{ fontSize: 22 }}>{t('pick.phone', { n: view.size, have: view.team.length })}</h1>
          <PlayerPicker ids={view.options} selected={view.team} onPick={(id) => send({ type: 'toggle', target: id })} player={player} multi />
          <button className="up-btn big full" disabled={view.team.length !== view.size} onClick={() => send({ type: 'confirm' })} style={{ marginTop: 'auto' }}>{t('pick.confirm')}</button>
        </>
      );
    case 'waitPick':
      return (
        <>
          {chip}
          <PhoneWait title={t('pick.wait', { name: player(view.leader)?.name ?? '?' })} text={t('pick.waitText', { n: view.size })} emoji={<span style={{ fontSize: 64 }}>👑</span>} />
        </>
      );
    case 'mission': {
      const traitor = view.role === 'traitor';
      if (view.choice) return <>{chip}<PhoneWait title={t('mission.sent')} text={t('mission.sentText')} emoji={<span style={{ fontSize: 64 }}>🤐</span>} /></>;
      return (
        <>
          <PhoneTimer deadline={view.deadline} duration={view.duration} hurryText={t('timer.hurry')} />
          {chip}
          <h1 style={{ fontSize: 26, textAlign: 'center' }}>{t('mission.phone')}</h1>
          <p className="muted" style={{ textAlign: 'center' }}>{t('mission.secret')}</p>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 14 }}>
            <button className="up-btn big full" style={{ background: LOYAL, color: '#110D24', boxShadow: `0 6px 0 ${LOYAL_D}`, minHeight: 90, fontSize: 24 }} onClick={() => send({ type: 'card', card: 'ok' })}>✓ {t('mission.ok')}</button>
            {traitor
              ? <button className="up-btn big full" style={{ background: TRAITOR, color: '#110D24', boxShadow: `0 6px 0 ${TRAITOR_D}`, minHeight: 90, fontSize: 24 }} onClick={() => send({ type: 'card', card: 'fail' })}>💣 {t('mission.fail')}</button>
              : <p className="faint" style={{ textAlign: 'center', fontSize: 14 }}>{t('mission.loyalOnly')}</p>}
          </div>
        </>
      );
    }
    case 'waitMission':
      return <>{chip}<PhoneWait title={t('mission.wait')} text={t('lookAtTv')} emoji={<span style={{ fontSize: 64 }}>⏳</span>} /></>;
    case 'vote': {
      const sel = view.selected ? [view.selected] : [];
      return (
        <>
          <PhoneTimer deadline={view.deadline} duration={view.duration} hurryText={view.selected ? undefined : t('timer.hurry')} />
          {chip}
          <h1 style={{ fontSize: 24 }}>{t('vote.phone')}</h1>
          <PlayerPicker ids={view.options} selected={sel} onPick={(id) => send({ type: 'vote', target: id })} player={player} />
          <button type="button" aria-pressed={view.selected === NOBODY} onClick={() => send({ type: 'vote', target: NOBODY })}
            style={{ minHeight: 52, border: 0, borderRadius: 16, fontWeight: 700, fontSize: 16, background: view.selected === NOBODY ? '#fff' : 'var(--surface)', color: view.selected === NOBODY ? '#110D24' : 'var(--muted)' }}>
            🤷 {t('vote.nobody')}
          </button>
          <p className="muted" style={{ textAlign: 'center', marginTop: 'auto', fontSize: 15 }}>{view.selected ? t('vote.change') : t('vote.pick')}</p>
        </>
      );
    }
    case 'banished':
      if (now < view.revealAt) return <PhoneWait title={t('lookAtTv')} emoji={<Avatar player={me} size={96} />} />;
      return <PhoneWait title={t('out.you')} text={t('out.text')} emoji={<span style={{ fontSize: 72 }}>👋</span>} />;
    case 'out':
      return (
        <>
          <PhoneWait title={t('out.title')} text={t('out.text')} emoji={<Avatar player={me} size={96} dim />} />
          <div style={{ display: 'flex', justifyContent: 'center' }}><RoleTag role={view.role} t={t} /></div>
        </>
      );
    case 'end':
      return (
        <div className="anim-fade" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, textAlign: 'center' }}>
          {view.won && <Confetti pieces={16} />}
          <Avatar player={me} size={100} />
          <h1 style={{ fontSize: 30 }}>{view.won ? t('end.youWon') : t('end.youLost')}</h1>
          <RoleTag role={view.role} t={t} />
          <p className="muted" style={{ fontSize: 18 }}>{t('me.score', { n: view.score })}</p>
        </div>
      );
    default:
      return <>{chip}<PhoneWait title={t('lookAtTv')} emoji={<Avatar player={me} size={96} />} /></>;
  }
}

export default { Host, Controller } satisfies GameClientModule;
