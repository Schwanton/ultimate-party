import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import type { ControllerViewProps, GameClientModule, HostViewProps, PlayerInfo, Translate } from '@up/sdk';
import {
  Avatar, Confetti, DRAW_COLORS, DRAW_WIDTHS, Drawing, ERASER, HostHeader, HostTimer, PhoneTimer, PhoneWait, Podium, Scoreboard,
  type Stroke, sfx, useServerNow, useStream, vibrate,
} from '@up/ui';

const PINK = '#E8336F';
const PINK_D = '#A81B4B';
const TEAM = [
  { color: '#FF9F43', dark: '#C46A12' },
  { color: '#36D6F5', dark: '#1A97B0' },
];
/** Farben auf dem Handy (Nummern aus DRAW_COLORS): Schwarz, Pink, Rot, Orange, Gelb, Grün, Blau, Braun */
const PALETTE = [0, 1, 4, 5, 3, 6, 7, 9];
const CHECK = 'M5 12l5 5L20 7';

type Player = (id: string) => PlayerInfo | undefined;

const fmtTime = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function Icon({ d, size = 24, color = 'currentColor', width = 2.4 }: { d: string; size?: number; color?: string; width?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/** Zeichnung inklusive des Strichs, der gerade live entsteht */
function LiveDrawing({ strokes, round, size, style }: { strokes: Stroke[]; round: number; size: number; style?: CSSProperties }) {
  const live = useStream<{ r: number; n: number; s: Stroke | null }>();
  const all = live && live.r === round && live.s && live.n === strokes.length ? [...strokes, live.s] : strokes;
  return <Drawing strokes={all} size={size} style={style} />;
}

/** Buchstaben-Hilfe: _ _ _ T _ _ */
function Slots({ slots, size = 'big' }: { slots: string[]; size?: 'big' | 'small' }) {
  const big = size === 'big';
  const w = big ? Math.min(34, 760 / Math.max(1, slots.length)) : Math.max(9, Math.min(22, 230 / Math.max(1, slots.length)));
  return (
    <div aria-label={`${slots.filter((s) => s !== ' ' && s !== '-').length}`} style={{ display: 'flex', gap: big ? 8 : 3, alignItems: 'flex-end', flexWrap: big ? 'wrap' : 'nowrap', justifyContent: big ? 'center' : 'flex-start', minWidth: 0 }}>
      {slots.map((ch, i) => {
        if (ch === ' ') return <span key={i} style={{ width: w * 0.6 }} />;
        if (!/[\p{L}\p{N}_]/u.test(ch) && ch !== '') return <span key={i} className="display" style={{ fontSize: big ? 32 : 18, fontWeight: 800 }}>{ch}</span>;
        const shown = ch !== '';
        return (
          <span key={i} className="display" style={{
            width: w, height: big ? 46 : 24, borderBottom: `${big ? 5 : 3}px solid ${shown ? 'var(--yellow)' : '#B8B2D9'}`, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            fontWeight: 800, fontSize: big ? 34 : 18, lineHeight: 1, color: 'var(--yellow)', animation: shown ? 'upPop .5s ease-out both' : undefined,
          }}>{ch}</span>
        );
      })}
    </div>
  );
}

function teamName(t: Translate, n: number) {
  return t(`team.${n}`);
}

function TeamBadge({ t, n, score, active, player, members }: { t: Translate; n: number; score: number; active?: boolean; player: Player; members: string[] }) {
  const c = TEAM[n];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '8px 18px', borderRadius: 18,
      background: active ? c.color : 'var(--surface)', color: active ? '#110D24' : '#fff',
      boxShadow: active ? `0 5px 0 ${c.dark}, 0 0 30px ${c.color}66` : `inset 0 0 0 3px ${c.color}`, transition: 'all .3s',
    }}>
      <span style={{ fontWeight: 800, fontSize: 18, color: active ? '#110D24' : c.color }}>{teamName(t, n)}</span>
      <span style={{ display: 'flex' }}>
        {members.slice(0, 6).map((id, i) => {
          const p = player(id);
          return p ? <span key={id} style={{ marginLeft: i ? -10 : 0 }}><Avatar player={p} size={32} /></span> : null;
        })}
      </span>
      <span className="display" style={{ fontWeight: 800, fontSize: 30 }}>{score}</span>
    </div>
  );
}

/* ================= TV ================= */

/** Emotes der Spieler fliegen über dem Bild hoch – mit leisem Plopp */
function EmoteLayer({ emotes, player }: { emotes: { n: number; id: string; e: number; at: number }[] | undefined; player: Player }) {
  const now = useServerNow(250);
  const lastN = useRef(0);
  const lastSound = useRef(0);
  useEffect(() => {
    const newest = emotes?.length ? emotes[emotes.length - 1].n : 0;
    if (newest > lastN.current && performance.now() - lastSound.current > 70) {
      lastSound.current = performance.now();
      const pitch = 700 + ((newest * 97) % 400);
      sfx.custom((api) => api.tone(pitch, 0.09, { type: 'sine', vol: 0.05, to: pitch * 1.5 }));
    }
    lastN.current = Math.max(lastN.current, newest);
  }, [emotes]);
  return (
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 4 }}>
      {(emotes ?? []).filter((x) => now - x.at < 3200).map((x) => {
        const p = player(x.id);
        return (
          <span key={x.n} style={{
            position: 'absolute', bottom: 0, left: `${30 + ((x.n * 37) % 40)}%`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            animation: 'upEmote 3s ease-out forwards',
          }}>
            <span style={{ fontSize: 64, lineHeight: 1, filter: 'drop-shadow(0 4px 0 rgba(10,7,22,.6))' }}>{EMOTES[x.e]}</span>
            {p && <Avatar player={p} size={30} />}
          </span>
        );
      })}
    </div>
  );
}

function Host(props: HostViewProps) {
  const { view, t } = props;
  const roundInfo = view.round ? t('round', { n: view.round, total: view.totalRounds }) : undefined;
  switch (view.screen) {
    case 'intro':
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28, textAlign: 'center' }}>
          <span className="up-tag anim-pop" style={{ background: PINK, color: '#fff', boxShadow: `0 8px 0 ${PINK_D}`, fontSize: 80, padding: '12px 40px', borderRadius: 26, transform: 'rotate(-3deg)' }}>{t('title')}</span>
          <p className="anim-up" style={{ fontSize: 28, maxWidth: 960, lineHeight: 1.35, animationDelay: '.4s' }}>{t(view.team ? 'intro.textTeam' : 'intro.text')}</p>
          {view.team && (
            <div className="anim-up" style={{ display: 'flex', gap: 24, animationDelay: '.7s' }}>
              {[0, 1].map((n) => <TeamBadge key={n} t={t} n={n} score={0} player={props.player} members={view.teams[n].members} />)}
            </div>
          )}
          <p className="muted anim-up" style={{ fontSize: 20, animationDelay: '.9s' }}>{t('intro.rules')}</p>
        </div>
      );
    case 'pick':
      return <HostPick {...props} roundInfo={roundInfo} />;
    case 'draw':
      return <HostDraw {...props} roundInfo={roundInfo} />;
    case 'reveal':
      return <HostReveal {...props} roundInfo={roundInfo} />;
    case 'scores':
      return (
        <>
          <HostHeader title={t('title')} color={PINK} info={t('scores.title')} />
          {view.team ? <TeamScores {...props} /> : (
            <>
              <h1 style={{ fontSize: 36 }}>{t('scores.title')}</h1>
              <Scoreboard rows={Object.keys(view.after).map((id) => ({ player: props.player(id)!, before: view.before[id] ?? 0, after: view.after[id] })).filter((r) => r.player)} />
            </>
          )}
        </>
      );
    case 'gallery':
      return <HostGallery {...props} />;
    case 'final':
      return (
        <>
          <HostHeader title={t('title')} color={PINK} info={t('final.title')} />
          {view.team ? <TeamScores {...props} final /> : <Podium ranking={view.ranking} player={props.player} pointsLabel={t('common.points')} />}
        </>
      );
  }
  return null;
}

function TeamScores({ view, t, player, final }: HostViewProps & { final?: boolean }) {
  const [a, b] = view.teams as { score: number; members: string[] }[];
  const winner = a.score === b.score ? -1 : a.score > b.score ? 0 : 1;
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 36 }}>
      {final && <Confetti pieces={40} />}
      {final && <h1 className="anim-pop" style={{ fontSize: 72, color: winner >= 0 ? TEAM[winner].color : '#fff' }}>{winner >= 0 ? t('final.teamWins', { team: teamName(t, winner) }) : t('final.draw')}</h1>}
      <div style={{ display: 'flex', gap: 40 }}>
        {[a, b].map((tm, n) => (
          <div key={n} className="anim-pop" style={{
            width: 420, borderRadius: 28, padding: 28, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18,
            background: n === winner ? TEAM[n].color : 'var(--surface)', color: n === winner ? '#110D24' : '#fff',
            boxShadow: n === winner ? `0 8px 0 ${TEAM[n].dark}, 0 0 50px ${TEAM[n].color}77` : `inset 0 0 0 4px ${TEAM[n].color}`,
            animationDelay: `${n * 0.2}s`,
          }}>
            <span style={{ fontSize: 26, fontWeight: 800, color: n === winner ? '#110D24' : TEAM[n].color }}>{teamName(t, n)}</span>
            <span className="display" style={{ fontSize: 96, fontWeight: 800, lineHeight: 1 }}>{tm.score}</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
              {tm.members.map((id) => {
                const p = player(id);
                return p ? <Avatar key={id} player={p} size={48} /> : null;
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HostPick({ view, t, player, roundInfo }: HostViewProps & { roundInfo?: string }) {
  const p = player(view.drawerId);
  return (
    <>
      <HostHeader title={t('title')} color={PINK} info={roundInfo} right={view.team ? <TeamBadge t={t} n={view.drawingTeam} score={view.teams[view.drawingTeam].score} active player={player} members={view.teams[view.drawingTeam].members} /> : undefined} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 30, textAlign: 'center' }}>
        {p && <span className="anim-pop"><Avatar player={p} size={150} /></span>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h1 className="anim-up" style={{ fontSize: 64, lineHeight: 1 }}>{t('pick.next', { name: p?.name ?? '?' })}</h1>
          <p className="muted" style={{ fontSize: 24 }}>{t('pick.choosing')}</p>
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          {[['#4BE3A1', '#23A872', -6, 0], ['#FFD447', '#C79E1A', 0, -12], [PINK, PINK_D, 6, 0]].map(([bg, sh, rot, ty], i) => (
            <span key={i} className="display" style={{
              width: 120, height: 150, borderRadius: 18, background: bg as string, boxShadow: `0 6px 0 ${sh}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: 54, color: i === 2 ? '#fff' : '#110D24', transform: `rotate(${rot}deg) translateY(${ty}px)`,
              animation: `upFloat 2.4s ease-in-out ${(-0.5 * i).toFixed(1)}s infinite`,
            }}>?</span>
          ))}
        </div>
        <p className="faint" style={{ fontSize: 18, fontWeight: 700 }}>{t('pick.phones')}</p>
      </div>
    </>
  );
}

function HostDraw({ view, t, player, roundInfo }: HostViewProps & { roundInfo?: string }) {
  const drawer = player(view.drawerId);
  const solved = new Set<string>(view.solvedIds);
  const steal = view.phase === 'steal';

  // Klänge: falscher Tipp, jemand hat's, Klau-Versuch
  const lastFeed = useRef(0);
  const lastToast = useRef(0);
  useEffect(() => {
    const n = view.feed.length ? view.feed[view.feed.length - 1].n : 0;
    if (n > lastFeed.current && lastFeed.current) sfx.play('pop');
    lastFeed.current = Math.max(lastFeed.current, n, 1);
  }, [view.feed]);
  useEffect(() => {
    if (view.toast && view.toast.n > lastToast.current) {
      lastToast.current = view.toast.n;
      sfx.play('ding');
    }
  }, [view.toast]);
  useEffect(() => {
    if (steal) sfx.play('sneaky');
  }, [steal]);

  // „X hat's!“ nur kurz zeigen
  const [toastVisible, setToastVisible] = useState(false);
  useEffect(() => {
    if (!view.toast) return;
    setToastVisible(true);
    const id = setTimeout(() => setToastVisible(false), 2200);
    return () => clearTimeout(id);
  }, [view.toast?.n]);
  const toastPlayer = view.toast ? player(view.toast.id) : null;

  const guessers: string[] = view.team
    ? view.teams[steal ? 1 - view.drawingTeam : view.drawingTeam].members.filter((id: string) => id !== view.drawerId)
    : view.members.filter((id: string) => id !== view.drawerId);
  const rows = [...view.members].sort((a: string, b: string) => Number(solved.has(b)) - Number(solved.has(a)) || (view.scores[b] ?? 0) - (view.scores[a] ?? 0));

  const header = view.team ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <TeamBadge t={t} n={0} score={view.teams[0].score} active={(steal ? 1 - view.drawingTeam : view.drawingTeam) === 0} player={player} members={view.teams[0].members} />
      <span className="display faint" style={{ fontWeight: 800, fontSize: 20 }}>vs</span>
      <TeamBadge t={t} n={1} score={view.teams[1].score} active={(steal ? 1 - view.drawingTeam : view.drawingTeam) === 1} player={player} members={view.teams[1].members} />
    </div>
  ) : (
    <span style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 20, fontWeight: 700 }}>
      {drawer && <Avatar player={drawer} size={40} />}{t('draws', { name: drawer?.name ?? '?' })}
    </span>
  );

  return (
    <>
      <HostHeader title={t('title')} color={PINK} info={view.team ? undefined : roundInfo} right={
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>{header}<HostTimer deadline={view.deadline} duration={view.duration} /></div>
      } />
      <div style={{ flex: 1, display: 'flex', gap: 24, minHeight: 0, position: 'relative' }}>
        {/* falsche Tipps */}
        <section aria-label="Tipps" style={{ width: 280, position: 'relative', overflow: 'hidden' }}>
          {view.feed.map((f: any, i: number) => {
            const p = player(f.id);
            const age = view.feed.length - 1 - i;
            return (
              <span key={f.n} className="display" style={{
                position: 'absolute', left: (f.n * 37) % 50, top: 8 + i * 66, maxWidth: 270, overflow: 'hidden', textOverflow: 'ellipsis',
                fontWeight: 700, fontSize: 22, padding: '8px 16px', borderRadius: 16, background: age === 0 ? 'var(--cyan)' : 'var(--surface-2)', color: age === 0 ? '#110D24' : '#fff',
                boxShadow: `0 5px 0 ${age === 0 ? 'var(--cyan-d)' : '#0A0716'}`, display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap',
                opacity: Math.max(0.3, 1 - age * 0.12), transform: `rotate(${((f.n * 53) % 7) - 3}deg)`, animation: 'upFlyIn .45s cubic-bezier(.2,1.4,.4,1) backwards',
              }}>
                {p && <Avatar player={p} size={30} />}{f.text}
              </span>
            );
          })}
        </section>

        {/* Zeichnung */}
        <section style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <LiveDrawing strokes={view.strokes} round={view.round} size={500} style={{ boxShadow: `0 0 0 4px ${steal ? '#FF3B4E' : view.team ? TEAM[view.drawingTeam].color : 'var(--surface-2)'}, 0 0 40px rgba(232,51,111,.25)` }} />
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14 }}>
            <Slots slots={view.slots} />
            <span className="faint" style={{ fontSize: 16, fontWeight: 700 }}>{view.slots.filter((s: string) => s !== ' ' && s !== '-').length}</span>
          </div>
        </section>

        {/* rechts */}
        <aside style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          {steal ? (
            <div style={{ marginTop: 40, background: '#FF3B4E', borderRadius: 22, padding: '20px 22px', boxShadow: '0 7px 0 #B0182A, 0 0 40px rgba(255,59,78,.4)', transform: 'rotate(2deg)', display: 'flex', flexDirection: 'column', gap: 8, animation: 'upPop .5s ease-out both' }}>
              <span className="display" style={{ fontWeight: 800, fontSize: 40, lineHeight: 1 }}>{t('steal.title')}</span>
              <span style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.35 }}>{t('steal.text', { team: teamName(t, view.drawingTeam), other: teamName(t, 1 - view.drawingTeam) })}</span>
              <span style={{ fontSize: 15, opacity: 0.85 }}>{t('steal.rule', { team: teamName(t, 1 - view.drawingTeam) })}</span>
            </div>
          ) : view.team ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 20, fontWeight: 700 }}>
                {drawer && <Avatar player={drawer} size={44} />}{t('draws', { name: drawer?.name ?? '?' })}
              </span>
              <span className="muted" style={{ fontSize: 16 }}>{roundInfo}</span>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--muted)', letterSpacing: '.08em', textTransform: 'uppercase' }}>
                {t('solvedCount', { n: solved.size, total: guessers.length })}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden' }}>
                {rows.slice(0, 9).map((id) => {
                  const p = player(id);
                  if (!p) return null;
                  const ok = solved.has(id);
                  const isDrawer = id === view.drawerId;
                  return (
                    <div key={id} style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', borderRadius: 16, transition: 'all .3s',
                      background: ok ? 'var(--green)' : 'var(--surface)', color: ok ? '#110D24' : '#fff', boxShadow: ok ? '0 5px 0 var(--green-d)' : isDrawer ? 'inset 0 0 0 2px var(--cyan)' : undefined,
                      opacity: p.connected ? 1 : 0.5,
                    }}>
                      <Avatar player={p} size={34} />
                      <span style={{ flex: 1, fontWeight: 700, fontSize: 19, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                      {ok && <Icon d={CHECK} color="#110D24" width={3} />}
                      {isDrawer && <Icon d="M4 20l4-1 11-11-3-3L5 16zM14 6l3 3" color="var(--cyan)" size={22} width={2.4} />}
                      <span className="display" style={{ fontWeight: 800, fontSize: 19, color: ok ? '#110D24' : 'var(--muted)' }}>{view.scores[id] ?? 0}</span>
                    </div>
                  );
                })}
                {rows.length > 9 && <span className="faint" style={{ fontSize: 15, fontWeight: 700 }}>+ {rows.length - 9}</span>}
              </div>
            </>
          )}
        </aside>

        <EmoteLayer emotes={view.emotes} player={player} />
        {toastVisible && toastPlayer && (
          <div role="status" className="display" style={{
            position: 'absolute', left: '50%', top: 10, transform: 'translateX(-50%) rotate(-2deg)', zIndex: 5,
            background: 'var(--green)', color: '#110D24', fontWeight: 800, fontSize: 28, padding: '10px 26px', borderRadius: 18,
            boxShadow: '0 6px 0 var(--green-d), 0 0 30px rgba(75,227,161,.5)', display: 'flex', alignItems: 'center', gap: 12, animation: 'upPop .4s ease-out both',
          }}>
            <Icon d={CHECK} color="#110D24" size={28} width={3} />{t('hasIt', { name: toastPlayer.name })}
          </div>
        )}
      </div>
    </>
  );
}

function HostReveal({ view, t, player, roundInfo }: HostViewProps & { roundInfo?: string }) {
  const drawer = player(view.drawerId);
  useEffect(() => {
    sfx.play(view.solved.length ? 'reveal' : 'wrong');
  }, []);
  const solved = view.solved as { id: string; ms: number; points: number }[];
  const missed = (view.missed as string[]).map((id) => player(id)).filter(Boolean) as PlayerInfo[];
  const row = (k: string, content: ReactNode, style: CSSProperties = {}, delay = 0) => (
    <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 18px', borderRadius: 18, background: 'var(--surface)', fontSize: 21, fontWeight: 700, animation: `upPop .4s ease-out ${delay.toFixed(2)}s both`, ...style }}>{content}</div>
  );
  let banner: string | null = null;
  if (view.team) {
    banner = view.stolenBy != null ? t('reveal.stolen', { team: teamName(t, view.stolenBy) })
      : view.teamWon ? t('reveal.teamWon', { team: teamName(t, view.drawingTeam) }) : t('reveal.teamNobody');
  }
  const eligible = solved.length + missed.length;
  return (
    <>
      <HostHeader title={t('title')} color={PINK} info={roundInfo} />
      <div style={{ flex: 1, display: 'flex', gap: 40, minHeight: 0, position: 'relative' }}>
        <EmoteLayer emotes={view.emotes} player={player} />
        <section style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
          <Drawing strokes={view.strokes} size={420} style={{ transform: 'rotate(-2deg)', boxShadow: '0 10px 0 #0A0716' }} />
          {drawer && <span className="muted" style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 19, fontWeight: 700 }}><Avatar player={drawer} size={36} />{t('reveal.by', { name: drawer.name })}</span>}
        </section>
        <section style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <p className="muted" style={{ fontSize: 20, fontWeight: 700 }}>{t('reveal.was')}</p>
          <h1 className="display anim-pop" style={{ fontSize: Math.min(86, Math.floor(1100 / Math.max(1, String(view.word ?? '').length))), lineHeight: 0.95, color: 'var(--yellow)', textShadow: '0 0 30px rgba(255,212,71,.45)', marginBottom: 6, overflowWrap: 'break-word' }}>{view.word}</h1>
          {banner && (
            <div className="display" style={{ fontSize: 34, fontWeight: 800, color: view.stolenBy != null ? TEAM[view.stolenBy].color : view.teamWon ? TEAM[view.drawingTeam].color : 'var(--muted)' }}>
              {banner}{solved[0] ? <span style={{ color: '#fff' }}> + {solved[0].points}</span> : null}
            </div>
          )}
          {!view.team && solved.slice(0, 6).map((s, i) => {
            const p = player(s.id);
            if (!p) return null;
            const first = i === 0;
            return row(s.id, (
              <>
                <Avatar player={p} size={36} />
                <span style={{ flex: 1 }}>{p.name}{first && <span style={{ fontSize: 15, fontWeight: 800, background: '#110D24', color: 'var(--green)', padding: '3px 10px', borderRadius: 999, marginLeft: 10 }}>{t('reveal.first')}</span>}</span>
                <span style={{ fontSize: 16, fontWeight: 700, color: first ? '#1C5A40' : 'var(--faint)', width: 70, textAlign: 'right' }}>{fmtTime(s.ms)}</span>
                <span className="display" style={{ fontWeight: 800, fontSize: 24, color: first ? '#110D24' : 'var(--green)' }}>+ {s.points}</span>
              </>
            ), first ? { background: 'var(--green)', color: '#110D24', boxShadow: '0 5px 0 var(--green-d)' } : {}, 0.3 + i * 0.25);
          })}
          {!view.team && solved.length > 6 && <span className="faint" style={{ fontSize: 16, fontWeight: 700 }}>+ {solved.length - 6}</span>}
          {!view.team && solved.length === 0 && <p className="display" style={{ fontSize: 30, fontWeight: 800, color: 'var(--muted)' }}>{t('reveal.nobody')}</p>}
          {!view.team && missed.length > 0 && missed.length <= 4 && missed.map((p, i) => row(p.id, (
            <><Avatar player={p} size={36} /><span style={{ flex: 1 }}>{p.name}</span><span className="muted" style={{ fontSize: 17 }}>{t('reveal.missed')}</span></>
          ), { opacity: 0.55 }, 0.3 + (solved.length + i) * 0.25))}
          {!view.team && drawer && row('drawer', (
            <>
              <Avatar player={drawer} size={36} />
              <span style={{ flex: 1 }}>{view.cheat ? t('reveal.cheat') : t('reveal.drawer', { name: drawer.name, n: solved.length, total: eligible })}</span>
              <span className="display" style={{ fontWeight: 800, fontSize: 24, color: 'var(--cyan)' }}>+ {view.drawerPoints}</span>
            </>
          ), { marginTop: 'auto', background: 'var(--surface-2)', boxShadow: 'inset 0 0 0 2px var(--cyan)' }, 0.5 + Math.min(6, solved.length) * 0.25)}
        </section>
      </div>
    </>
  );
}

function HostGallery({ view, t, player }: HostViewProps) {
  const raw = view.pics as { word: string; strokes: Stroke[]; drawerId: string; firstId: string | null; firstMs: number | null; stolen: number | null }[];
  const live = useStream<{ g?: string; h?: number[] }>();
  const counts: number[] = live?.g === 'hearts' && live.h?.length === raw.length ? live.h : (view.hearts ?? raw.map(() => 0));
  const pics = raw.map((p, i) => ({ ...p, i, hearts: counts[i] ?? 0 })).sort((a, b) => b.hearts - a.hearts || a.i - b.i);
  const cols = pics.length <= 4 ? pics.length : pics.length <= 8 ? 4 : 5;
  const rowsN = Math.ceil(pics.length / cols);
  const size = Math.min(rowsN > 2 ? 120 : rowsN === 2 ? 190 : 300, Math.floor((1180 - (cols - 1) * 20) / cols) - 24);
  return (
    <>
      <HostHeader title={t('title')} color={PINK} info={t('gallery.sub', { n: pics.length })} />
      <h1 style={{ fontSize: 34 }}>{t('gallery.title')}</h1>
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, ${size + 40}px))`, gap: '18px 24px', alignContent: 'center', justifyContent: 'center' }}>
        {pics.map((p, i) => {
          const d = player(p.drawerId);
          const f = p.firstId ? player(p.firstId) : null;
          const meta = p.stolen != null ? t('gallery.stolen', { team: teamName(t, p.stolen) }) : f && p.firstMs != null ? t('gallery.first', { name: f.name, time: fmtTime(p.firstMs) }) : t('gallery.nobody');
          return (
            <figure key={p.i} style={{ position: 'relative',
              margin: 0, background: '#FFFDF7', borderRadius: 16, padding: '10px 10px 12px', boxShadow: '0 7px 0 #0A0716', display: 'flex', flexDirection: 'column', gap: 6, color: '#110D24',
              transform: `rotate(${((i * 37) % 5) - 2}deg)`, animation: `upPop .5s ease-out ${(i * 0.18).toFixed(2)}s both`,
            }}>
              <Drawing strokes={p.strokes} size={size} style={{ alignSelf: 'center', borderRadius: 10, background: '#fff' }} />
              {p.hearts > 0 && (
                <span className="display" style={{ position: 'absolute', top: -12, right: -10, background: PINK, color: '#fff', fontWeight: 800, fontSize: 20, padding: '4px 12px', borderRadius: 999, boxShadow: `0 4px 0 ${PINK_D}`, animation: 'upPop .4s ease-out both' }}>♥ {p.hearts}</span>
              )}
              <figcaption style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span className="display" style={{ fontWeight: 800, fontSize: 22, lineHeight: 1.05 }}>{p.word}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#4A4378' }}>{d?.name ?? '?'} · {meta}</span>
              </figcaption>
            </figure>
          );
        })}
      </div>
    </>
  );
}

/* ================= Handy ================= */

/** Sichtbare Höhe (schrumpft, wenn die Tastatur offen ist) */
function useViewportHeight() {
  const get = () => Math.round(window.visualViewport?.height ?? window.innerHeight);
  const [h, setH] = useState(get);
  useEffect(() => {
    const vv = window.visualViewport;
    const on = () => setH(get());
    vv?.addEventListener('resize', on);
    window.addEventListener('resize', on);
    return () => {
      vv?.removeEventListener('resize', on);
      window.removeEventListener('resize', on);
    };
  }, []);
  return h;
}

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(340);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function strokePath(p: number[]) {
  if (p.length === 2) return `M${p[0]} ${p[1]}l0.1 0`;
  let d = `M${p[0]} ${p[1]}`;
  for (let i = 2; i < p.length; i += 2) d += `L${p[i]} ${p[i + 1]}`;
  return d;
}

/** Malen fürs Handy: schickt Striche live (auch halb fertige) an den Server */
function DrawPad({ view, t, send }: ControllerViewProps) {
  const [strokes, setStrokes] = useState<Stroke[]>(() => view.strokes ?? []);
  const [color, setColor] = useState(0);
  const [width, setWidth] = useState(1);
  const [eraser, setEraser] = useState(false);
  const current = useRef<Stroke | null>(null);
  const lastSent = useRef(0);
  const svgRef = useRef<SVGSVGElement>(null);
  const [, force] = useState(0);
  const [boxRef, boxW] = useWidth();
  const vh = useViewportHeight();
  const size = Math.max(180, Math.min(boxW, vh - 360));
  const active = view.input !== false;

  // Mit dem Server abgleichen (z. B. nach Verbindungsabbruch)
  useEffect(() => {
    if (current.current) return;
    const server: Stroke[] = view.strokes ?? [];
    if (server.length === strokes.length) return;
    const id = setTimeout(() => setStrokes(server), 900);
    return () => clearTimeout(id);
  }, [view.strokes, strokes.length]);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const stop = (e: TouchEvent) => e.preventDefault();
    el.addEventListener('touchstart', stop, { passive: false });
    el.addEventListener('touchmove', stop, { passive: false });
    return () => {
      el.removeEventListener('touchstart', stop);
      el.removeEventListener('touchmove', stop);
    };
  }, []);

  const point = (e: RPointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    return [Math.round(((e.clientX - r.left) / r.width) * 1000), Math.round(((e.clientY - r.top) / r.height) * 1000)].map((n) => Math.max(0, Math.min(1000, n)));
  };
  const down = (e: RPointerEvent) => {
    if (!active) return;
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    current.current = { c: eraser ? ERASER : PALETTE[color], w: eraser ? 2 : width, p: point(e) };
    force((n) => n + 1);
  };
  const move = (e: RPointerEvent) => {
    const s = current.current;
    if (!s) return;
    e.preventDefault();
    const [x, y] = point(e);
    if (Math.hypot(x - s.p[s.p.length - 2], y - s.p[s.p.length - 1]) < 6) return;
    s.p.push(x, y);
    if (s.p.length > 1100) return up();
    force((n) => n + 1);
    const now = performance.now();
    if (now - lastSent.current > 50) {
      lastSent.current = now;
      send({ type: 'stroke', i: strokes.length, s: { ...s, p: [...s.p] } });
    }
  };
  const up = () => {
    const s = current.current;
    current.current = null;
    if (!s) return;
    send({ type: 'stroke', i: strokes.length, s, done: true });
    setStrokes((l) => [...l, s]);
  };
  const undo = () => {
    if (!strokes.length) return;
    setStrokes((l) => l.slice(0, -1));
    send({ type: 'undo' });
  };
  const clear = () => {
    if (!strokes.length || !window.confirm(t('draw.clearConfirm'))) return;
    setStrokes([]);
    send({ type: 'clear' });
  };

  const all = current.current ? [...strokes, current.current] : strokes;
  const toolBtn: CSSProperties = { flex: 1, height: 54, border: 0, borderRadius: 14, background: 'var(--surface-2)', color: '#fff', boxShadow: '0 4px 0 #0A0716', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 0, fontWeight: 700, fontSize: 17 };
  const on: CSSProperties = { background: '#fff', color: '#110D24', boxShadow: '0 4px 0 #8F88B8' };
  return (
    <div ref={boxRef} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <svg ref={svgRef} viewBox="0 0 1000 1000" width={size} height={size} aria-label={t('draw.label')}
        style={{ alignSelf: 'center', background: '#FFFDF7', borderRadius: 22, touchAction: 'none', display: 'block', userSelect: 'none', WebkitUserSelect: 'none', opacity: active ? 1 : 0.7 } as CSSProperties}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        {all.map((s, i) => (
          <path key={i} d={strokePath(s.p)} fill="none" stroke={DRAW_COLORS[s.c]} strokeWidth={DRAW_WIDTHS[s.w]} strokeLinecap="round" strokeLinejoin="round" />
        ))}
      </svg>
      <div role="radiogroup" aria-label={t('draw.color')} style={{ display: 'grid', gridTemplateColumns: 'repeat(8, minmax(0, 1fr))', gap: 4 }}>
        {PALETTE.map((ci, i) => {
          const sel = !eraser && color === i;
          return (
            <button key={ci} type="button" role="radio" aria-checked={sel} aria-label={`${t('draw.color')} ${i + 1}`} onClick={() => { setColor(i); setEraser(false); }}
              style={{ height: 44, border: 0, borderRadius: 12, padding: 0, background: DRAW_COLORS[ci], boxShadow: sel ? '0 0 0 3px #fff' : ci === 0 ? 'inset 0 0 0 2px #4A4378, 0 3px 0 #0A0716' : '0 3px 0 #0A0716', transform: sel ? 'translateY(-3px)' : undefined, transition: 'transform .1s' }} />
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {[8, 16, 26].map((d, i) => (
          <button key={d} type="button" aria-label={t(['draw.thin', 'draw.medium', 'draw.thick'][i])} aria-pressed={!eraser && width === i} onClick={() => { setWidth(i); setEraser(false); }}
            style={{ ...toolBtn, ...(!eraser && width === i ? on : {}) }}>
            <span style={{ width: d, height: d, borderRadius: '50%', background: !eraser && width === i ? '#110D24' : '#fff' }} />
          </button>
        ))}
        <button type="button" aria-label={t('draw.eraser')} aria-pressed={eraser} onClick={() => setEraser((x) => !x)} style={{ ...toolBtn, ...(eraser ? on : {}) }}>
          <Icon d="M7 21h10M5 15l9-9 5 5-8 8H8z" size={26} width={2} />
        </button>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" disabled={!strokes.length || !active} onClick={undo} style={{ ...toolBtn, opacity: strokes.length && active ? 1 : 0.5 }}>
          <Icon d="M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3" size={22} width={2.2} />{t('draw.undo')}
        </button>
        <button type="button" disabled={!strokes.length || !active} onClick={clear} style={{ ...toolBtn, color: '#FF8A8E', opacity: strokes.length && active ? 1 : 0.5 }}>
          <Icon d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" size={22} width={2.2} color="#FF8A8E" />{t('draw.clear')}
        </button>
      </div>
    </div>
  );
}

function DrawScreen(props: ControllerViewProps) {
  const { view, t } = props;
  const steal = view.phase === 'steal';
  return (
    <>
      <PhoneTimer deadline={view.deadline} duration={view.duration} hurryText={steal ? undefined : t('timer.hurry')} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', letterSpacing: '.08em', textTransform: 'uppercase' }}>{t('draw.label')}</span>
          <span className="display" style={{ fontWeight: 800, fontSize: 30, lineHeight: 1.05, color: 'var(--yellow)', overflowWrap: 'anywhere' }}>{view.word}</span>
        </div>
        {!view.team && (
          <span style={{ fontSize: 15, fontWeight: 700, background: view.solved ? 'var(--green)' : 'var(--surface-2)', color: view.solved ? '#110D24' : 'var(--muted)', padding: '6px 12px', borderRadius: 999, whiteSpace: 'nowrap' }}>
            {t('solvedCount', { n: view.solved, total: view.total })}
          </span>
        )}
      </div>
      {steal && <p role="status" style={{ fontWeight: 700, color: '#FF8A8E' }}>{t('draw.stealing', { team: teamName(t, 1 - view.drawingTeam) })}</p>}
      <DrawPad key={view.round} {...props} />
    </>
  );
}

/** Emotes, die auf dem Fernseher hochfliegen */
const EMOTES = ['😂', '🤯', '😍', '👏', '🚮'];

function EmoteBar({ send, t, vertical, size }: { send: (a: any) => void; t: Translate; vertical?: boolean; size?: number }) {
  const last = useRef(0);
  const [hit, setHit] = useState<number | null>(null);
  const fire = (i: number) => {
    const now = Date.now();
    if (now - last.current < 100) return;
    last.current = now;
    send({ type: 'emote', e: i });
    setHit(i);
    setTimeout(() => setHit(null), 150);
  };
  const h = size ?? 44;
  return (
    <div role="group" aria-label={t('emote.label')} style={vertical
      ? { display: 'flex', flexDirection: 'column', gap: 4, width: 46 }
      : { display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 6 }}>
      {EMOTES.map((e, i) => (
        <button key={e} type="button" aria-label={t(`emote.${i}`)} onMouseDown={(ev) => ev.preventDefault()} onClick={() => fire(i)}
          style={{ height: h, border: 0, borderRadius: 12, background: 'var(--surface)', fontSize: Math.min(24, h * 0.55), lineHeight: 1, padding: 0, transform: hit === i ? 'scale(1.2)' : undefined, transition: 'transform .1s', touchAction: 'manipulation' }}>
          {e}
        </button>
      ))}
    </div>
  );
}

/** Bildschirm nicht wegscrollen lassen, wenn die Tastatur aufgeht (iPhone) */
function useNoScroll() {
  useEffect(() => {
    const fix = () => {
      if (window.scrollY > 0 || (window.visualViewport?.offsetTop ?? 0) > 0) window.scrollTo(0, 0);
    };
    const later = () => {
      fix();
      setTimeout(fix, 60);
      setTimeout(fix, 300);
    };
    const vv = window.visualViewport;
    vv?.addEventListener('resize', later);
    vv?.addEventListener('scroll', fix);
    window.addEventListener('scroll', fix);
    document.addEventListener('focusin', later);
    return () => {
      vv?.removeEventListener('resize', later);
      vv?.removeEventListener('scroll', fix);
      window.removeEventListener('scroll', fix);
      document.removeEventListener('focusin', later);
    };
  }, []);
}

function GuessInput({ send, t }: { send: (a: any) => void; t: Translate }) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setTimeout(() => ref.current?.focus({ preventScroll: true }), 80);
  }, []);
  const submit = () => {
    const v = text.trim();
    if (!v) return;
    send({ type: 'guess', text: v });
    setText('');
    ref.current?.focus({ preventScroll: true });
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }} style={{ display: 'flex', gap: 8 }}>
      <label htmlFor="mm-guess" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{t('guess.placeholder')}</label>
      <input id="mm-guess" ref={ref} className="up-input" value={text} maxLength={40} placeholder={t('guess.placeholder')} onChange={(e) => setText(e.target.value)}
        autoComplete="off" autoCorrect="off" autoCapitalize="sentences" spellCheck={false} enterKeyHint="send" style={{ flex: 1, minWidth: 0 }} />
      <button type="submit" aria-label={t('guess.send')} onMouseDown={(e) => e.preventDefault()} onTouchStart={(e) => { e.preventDefault(); submit(); }}
        style={{ width: 64, flex: 'none', border: 0, borderRadius: 16, background: PINK, boxShadow: `0 5px 0 ${PINK_D}`, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, opacity: text.trim() ? 1 : 0.6 }}>
        <Icon d="M5 12h14M13 6l6 6-6 6" size={26} width={2.6} color="#fff" />
      </button>
    </form>
  );
}

/** Raten (oder zuschauen) mit Live-Zeichnung – alles kompakt, damit das Bild auch bei offener Tastatur groß bleibt */
function GuessScreen({ view, t, send, player }: ControllerViewProps) {
  const [boxRef, boxW] = useWidth();
  const vh = useViewportHeight();
  const guessing = view.screen === 'guess';
  useNoScroll();
  // Platz für alles außer dem Bild: Timer, Buchstaben-Zeile, Eingabe, Ränder des Handy-Bildschirms
  const rest = (guessing ? 150 : 95) + (view.steal ? 28 : 0);
  // Viel Platz (Tastatur zu): Emotes als Zeile unter dem Bild; wenig Platz: Emotes als Spalte daneben
  const roomy = vh - rest - 50 >= boxW;
  const size = roomy ? boxW : Math.max(140, Math.min(boxW - 52, vh - rest));
  const drawer = player(view.drawerId);
  const guesses = (view.guesses ?? []) as { text: string; close: boolean }[];

  // knapp daneben: kurz vibrieren
  const lastLen = useRef(guesses.length);
  useEffect(() => {
    if (guesses.length > lastLen.current && guesses[guesses.length - 1]?.close) vibrate([30, 40, 30]);
    lastLen.current = guesses.length;
  }, [guesses.length]);

  const recent = guesses.slice(-3).reverse();
  return (
    <div ref={boxRef} style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: -6 }}>
      <PhoneTimer deadline={view.deadline} duration={view.duration} />
      {view.steal && guessing && <p role="status" className="display" style={{ fontWeight: 800, fontSize: 18, color: '#FF8A8E', lineHeight: 1.2 }}>{t('steal.you')}</p>}
      <div style={{ display: 'flex', flexDirection: roomy ? 'column' : 'row', gap: 6 }}>
        <div style={{ position: 'relative', flex: 'none', alignSelf: 'flex-start' }}>
          <LiveDrawing strokes={view.strokes} round={view.round} size={size} style={{ borderRadius: 16 }} />
          <span style={{ position: 'absolute', left: 6, top: 6, fontSize: 11, fontWeight: 800, background: PINK, color: '#fff', padding: '2px 7px', borderRadius: 999, letterSpacing: '.06em' }}>{t('guess.live')}</span>
          {drawer && (
            <span style={{ position: 'absolute', right: 6, top: 6, display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, background: 'rgba(17,13,36,.75)', color: '#fff', padding: '2px 8px 2px 2px', borderRadius: 999, maxWidth: '60%' }}>
              <Avatar player={drawer} size={20} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{drawer.name}</span>
            </span>
          )}
          {recent.length > 0 && (
            <div style={{ position: 'absolute', left: 6, right: 6, bottom: 6, display: 'flex', gap: 4, overflow: 'hidden' }}>
              {recent.map((g, i) => g.close ? (
                <span key={guesses.length - i} style={{ fontSize: 13, fontWeight: 800, padding: '3px 9px', borderRadius: 999, background: 'var(--yellow)', color: '#110D24', whiteSpace: 'nowrap', animation: i === 0 ? 'upPop .4s ease-out both' : undefined }}>{g.text} – {t('guess.close')}</span>
              ) : (
                <span key={guesses.length - i} style={{ fontSize: 13, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: 'rgba(17,13,36,.78)', color: '#B8B2D9', textDecoration: 'line-through', whiteSpace: 'nowrap' }}>{g.text}</span>
              ))}
            </div>
          )}
        </div>
        <EmoteBar send={send} t={t} vertical={!roomy} size={roomy ? undefined : Math.min(46, Math.floor((size - 16) / 5))} />
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
        <Slots slots={view.slots} size="small" />
        <span className="faint" style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>{t('letters', { n: view.slots.filter((s: string) => s !== ' ' && s !== '-').length })}</span>
      </div>
      {guessing ? (
        <GuessInput send={send} t={t} />
      ) : (
        <p className="muted" style={{ textAlign: 'center', fontSize: 15 }}>
          {view.team && view.myTeam === view.drawingTeam ? t('watch.textOwn') : t('watch.text')}
        </p>
      )}
    </div>
  );
}

function SolvedScreen({ view, t, player, send }: ControllerViewProps) {
  const [boxRef, boxW] = useWidth();
  const vh = useViewportHeight();
  const size = Math.max(160, Math.min(boxW, vh - 440));
  useEffect(() => {
    if (view.points > 0) {
      sfx.play('ding');
      vibrate(60);
    }
  }, []);
  const headline = view.stolenBy != null && view.team
    ? t('solved.stolen', { team: teamName(t, view.stolenBy) })
    : view.byTeam ? t('solved.team') : `${view.word}!`;
  const good = !(view.team && view.stolenBy != null && view.stolenBy !== view.myTeam);
  return (
    <div ref={boxRef} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <PhoneTimer deadline={view.deadline} duration={view.duration} />
      <div className="anim-pop" style={{ background: good ? 'var(--green)' : 'var(--surface-2)', color: good ? '#110D24' : '#fff', borderRadius: 24, padding: 18, boxShadow: good ? '0 6px 0 var(--green-d)' : undefined, display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ width: 56, height: 56, borderRadius: '50%', background: '#110D24', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
          <Icon d={CHECK} color="var(--green)" size={32} width={3} />
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <span className="display" style={{ fontWeight: 800, fontSize: 28, lineHeight: 1.05, overflowWrap: 'anywhere' }}>{headline}</span>
          {view.place > 0 && <span style={{ fontSize: 16, fontWeight: 700 }}>{t('solved.place', { n: view.place })} · + {view.points}</span>}
          {view.place === 0 && view.word && <span style={{ fontSize: 16, fontWeight: 700 }}>{view.word}</span>}
        </span>
      </div>
      <LiveDrawing strokes={view.strokes} round={view.round} size={size} style={{ alignSelf: 'center', borderRadius: 22 }} />
      {view.feed?.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', letterSpacing: '.08em', textTransform: 'uppercase' }}>{t('solved.other')}</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {(view.feed as any[]).slice(-4).reverse().map((f) => (
              <span key={f.n} style={{ fontSize: 15, fontWeight: 700, padding: '6px 12px', borderRadius: 999, background: 'var(--surface-2)' }}>{player(f.id)?.name ?? '?'}: {f.text}</span>
            ))}
          </div>
        </div>
      )}
      <EmoteBar send={send} t={t} />
      <p className="faint" style={{ textAlign: 'center', fontSize: 15 }}>{t('solved.quiet')}</p>
    </div>
  );
}

/* ---------- Galerie am Ende: ansehen, speichern, teilen ---------- */

interface Pic { word: string; strokes: Stroke[]; drawerId: string }

/** Bild als PNG (mit Wort und Zeichner*in darunter) */
async function picToPng(pic: Pic, drawerName: string, by: string): Promise<Blob> {
  const W = 1080, PAD = 60, FOOT = 190;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = W + FOOT;
  const g = c.getContext('2d')!;
  g.fillStyle = '#110D24';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#FFFDF7';
  g.beginPath();
  g.roundRect(PAD / 2, PAD / 2, W - PAD, W - PAD, 40);
  g.fill();
  const scale = (W - PAD) / 1000;
  g.save();
  g.translate(PAD / 2, PAD / 2);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const st of pic.strokes) {
    g.strokeStyle = DRAW_COLORS[st.c] ?? DRAW_COLORS[0];
    g.lineWidth = (DRAW_WIDTHS[st.w] ?? DRAW_WIDTHS[0]) * scale;
    g.beginPath();
    g.moveTo(st.p[0] * scale, st.p[1] * scale);
    if (st.p.length === 2) g.lineTo(st.p[0] * scale + 0.1, st.p[1] * scale);
    for (let i = 2; i < st.p.length; i += 2) g.lineTo(st.p[i] * scale, st.p[i + 1] * scale);
    g.stroke();
  }
  g.restore();
  try {
    await document.fonts?.ready;
  } catch { /* egal */ }
  g.fillStyle = '#FFD447';
  g.font = "800 72px 'Bricolage Grotesque', system-ui, sans-serif";
  g.textBaseline = 'alphabetic';
  g.fillText(pic.word, PAD / 2 + 10, W + 70, W - 300);
  g.fillStyle = '#B8B2D9';
  g.font = "700 36px 'DM Sans', system-ui, sans-serif";
  g.fillText(`${by} ${drawerName}`, PAD / 2 + 10, W + 130, W - 300);
  g.fillStyle = PINK;
  g.beginPath();
  g.roundRect(W - 250, W + 40, 220, 96, 22);
  g.fill();
  g.fillStyle = '#fff';
  g.font = "800 44px 'Bricolage Grotesque', system-ui, sans-serif";
  g.textAlign = 'center';
  g.fillText('UP!', W - 140, W + 104);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('png'))), 'image/png'));
}

const fileName = (word: string) => `UP-${word.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'bild'}.png`;

const canShare = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function';

/** PNG-Dateien schon vorher erzeugen: iPhone öffnet das Teilen-Menü nur direkt nach dem Antippen */
function usePngFiles(pics: Pic[], player: Player, by: string) {
  const [files, setFiles] = useState<(File | null)[]>(() => pics.map(() => null));
  const key = pics.map((p) => p.word).join('|');
  useEffect(() => {
    let alive = true;
    (async () => {
      const out: (File | null)[] = [];
      for (const p of pics) {
        try {
          const blob = await picToPng(p, player(p.drawerId)?.name ?? '?', by);
          out.push(new File([blob], fileName(p.word), { type: 'image/png' }));
        } catch {
          out.push(null);
        }
        if (!alive) return;
        setFiles([...out, ...pics.slice(out.length).map(() => null)]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [key]);
  return files;
}

function shareFiles(files: File[], title: string, text: string) {
  try {
    if (files.length && navigator.canShare?.({ files })) {
      void navigator.share({ files, title }).catch(() => {});
    } else {
      void navigator.share({ title, text }).catch(() => {});
    }
  } catch { /* nicht unterstützt */ }
}

function HeartButton({ count, mine, onToggle, label, big }: { count: number; mine: boolean; onToggle: () => void; label: string; big?: boolean }) {
  const [pop, setPop] = useState(false);
  return (
    <button type="button" aria-label={label} aria-pressed={mine}
      onClick={(e) => { e.stopPropagation(); onToggle(); if (!mine) { setPop(true); setTimeout(() => setPop(false), 300); vibrate(15); } }}
      style={{
        display: 'flex', alignItems: 'center', gap: 5, border: 0, borderRadius: 999, padding: big ? '0 18px' : '0 10px', height: big ? 56 : 36,
        background: mine ? PINK : 'rgba(17,13,36,.08)', color: mine ? '#fff' : '#E8336F', fontWeight: 800, fontSize: big ? 20 : 15,
        boxShadow: mine && big ? `0 5px 0 ${PINK_D}` : undefined, transform: pop ? 'scale(1.25)' : undefined, transition: 'transform .15s', flex: 'none',
        ...(big && !mine ? { background: 'var(--surface)', color: '#FF7AA3' } : {}),
      }}>
      <svg width={big ? 24 : 18} height={big ? 24 : 18} viewBox="0 0 24 24" fill={mine ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.2 0 3.6 1.2 5.3 3.1 1.7-1.9 3.1-3.1 5.3-3.1 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z" />
      </svg>
      {count}
    </button>
  );
}

function PicViewer({ pic, file, t, player, onClose, onPrev, onNext, hearts, mine, onHeart }: {
  pic: Pic; file: File | null; t: Translate; player: Player; onClose: () => void; onPrev?: () => void; onNext?: () => void;
  hearts: number; mine: boolean; onHeart: () => void;
}) {
  const [boxRef, boxW] = useWidth();
  const [note, setNote] = useState<string | null>(null);
  const drawer = player(pic.drawerId)?.name ?? '?';
  const by = t('gallery.byShort');

  const save = () => {
    if (!file) return;
    try {
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      setNote(t('gallery.saved'));
    } catch {
      setNote(t('gallery.failed'));
    }
  };

  const btn: CSSProperties = { flex: 1, minHeight: 56, border: 0, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontWeight: 800, fontSize: 17, padding: '0 10px' };
  const share = canShare();
  return (
    <div role="dialog" aria-modal="true" aria-label={pic.word} className="anim-fade"
      style={{ position: 'fixed', inset: 0, zIndex: 80, background: '#0A0716', display: 'flex', flexDirection: 'column', padding: 'max(16px, env(safe-area-inset-top)) 16px max(18px, env(safe-area-inset-bottom))', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="display" style={{ fontWeight: 800, fontSize: 28, color: 'var(--yellow)', lineHeight: 1.05, overflowWrap: 'anywhere' }}>{pic.word}</div>
          <div className="muted" style={{ fontSize: 15, fontWeight: 700 }}>{by} {drawer}</div>
        </div>
        <button type="button" aria-label={t('gallery.close')} onClick={onClose} style={{ width: 48, height: 48, flex: 'none', border: 0, borderRadius: 14, background: 'var(--surface-2)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
          <Icon d="M6 6l12 12M18 6L6 18" size={24} />
        </button>
      </div>
      <div ref={boxRef} style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Drawing strokes={pic.strokes} size={Math.max(200, boxW)} style={{ borderRadius: 22 }} />
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button type="button" aria-label={t('gallery.prev')} disabled={!onPrev} onClick={onPrev} style={{ ...btn, flex: 'none', width: 48, background: 'var(--surface)', color: '#fff', opacity: onPrev ? 1 : 0.35 }}>
          <Icon d="M15 18l-6-6 6-6" />
        </button>
        <HeartButton big count={hearts} mine={mine} onToggle={onHeart} label={t('gallery.heart')} />
        {share ? (
          <button type="button" disabled={!file} onClick={() => file && shareFiles([file], pic.word, `${pic.word} – ${by} ${drawer} (UP!)`)}
            style={{ ...btn, background: PINK, color: '#fff', boxShadow: `0 5px 0 ${PINK_D}`, opacity: file ? 1 : 0.6 }}>
            <Icon d="M12 15V3M7 8l5-5 5 5M5 13v8h14v-8" size={22} />{t('gallery.share')}
          </button>
        ) : (
          <button type="button" disabled={!file} onClick={save} style={{ ...btn, background: '#fff', color: '#110D24', boxShadow: '0 5px 0 #8F88B8', opacity: file ? 1 : 0.6 }}>
            <Icon d="M12 4v11M7 10l5 5 5-5M5 20h14" size={22} />{t('gallery.save')}
          </button>
        )}
        <button type="button" aria-label={t('gallery.next')} disabled={!onNext} onClick={onNext} style={{ ...btn, flex: 'none', width: 48, background: 'var(--surface)', color: '#fff', opacity: onNext ? 1 : 0.35 }}>
          <Icon d="M9 18l6-6-6-6" />
        </button>
      </div>
      {share && (
        <button type="button" disabled={!file} onClick={save} className="up-btn ghost small" style={{ alignSelf: 'center' }}>{t('gallery.save')}</button>
      )}
      {note && <p role="status" className="muted" style={{ textAlign: 'center', fontSize: 14 }}>{note}</p>}
    </div>
  );
}

function PhoneGallery({ view, t, player, me, send }: ControllerViewProps) {
  const pics = (view.pics ?? []) as Pic[];
  const [open, setOpen] = useState<number | null>(null);
  const [boxRef, boxW] = useWidth();
  const thumb = Math.floor((boxW - 12) / 2) - 16;
  const by = t('gallery.byShort');
  const files = usePngFiles(pics, player, by);

  // Herzen: eigene merken wir sofort, die Zahlen kommen live vom Server
  const live = useStream<{ g?: string; h?: number[] }>();
  const [mine, setMine] = useState<boolean[]>(() => (view.mine as boolean[] | undefined) ?? pics.map(() => false));
  const serverCounts: number[] = live?.g === 'hearts' && live.h?.length === pics.length ? live.h : (view.hearts ?? pics.map(() => 0));
  const toggle = (i: number) => {
    const on = !mine[i];
    setMine((m) => m.map((x, k) => (k === i ? on : x)));
    send({ type: 'heart', i, on });
  };
  // Sortierung nach Herzen (bei Gleichstand Reihenfolge des Abends)
  const order = pics.map((_, i) => i).sort((a, b) => serverCounts[b] - serverCounts[a] || a - b);
  const pos = open == null ? -1 : order.indexOf(open);

  const ready = files.filter(Boolean) as File[];
  return (
    <div ref={boxRef} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <Avatar player={me} size={56} />
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <span className="display" style={{ fontWeight: 800, fontSize: 24 }}>{t('me.place', { place: view.place, of: view.of })}</span>
          <span className="muted" style={{ fontWeight: 700 }}>{t('me.score', { n: view.score })}</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 22 }}>{t('gallery.phoneTitle')}</h2>
          <p className="muted" style={{ fontSize: 14 }}>{t('gallery.phoneText')}</p>
        </div>
        {canShare() && pics.length > 1 && (
          <button type="button" className="up-btn small" disabled={ready.length < pics.length}
            onClick={() => shareFiles(ready, t('gallery.phoneTitle'), t('gallery.phoneTitle'))} style={{ flex: 'none' }}>
            {t('gallery.shareAll')}
          </button>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
        {order.map((i) => {
          const p = pics[i];
          return (
            <div key={i} role="button" tabIndex={0} onClick={() => setOpen(i)} onKeyDown={(e) => e.key === 'Enter' && setOpen(i)} aria-label={p.word}
              style={{ padding: 8, borderRadius: 16, background: '#FFFDF7', color: '#110D24', display: 'flex', flexDirection: 'column', gap: 6, boxShadow: '0 5px 0 #0A0716', cursor: 'pointer' }}>
              <Drawing strokes={p.strokes} size={Math.max(100, thumb)} style={{ borderRadius: 10, background: '#fff' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="display" style={{ fontWeight: 800, fontSize: 16, lineHeight: 1.1, overflowWrap: 'anywhere' }}>{p.word}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#4A4378', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{player(p.drawerId)?.name ?? '?'}</div>
                </div>
                <HeartButton count={serverCounts[i] ?? 0} mine={!!mine[i]} onToggle={() => toggle(i)} label={t('gallery.heart')} />
              </div>
            </div>
          );
        })}
      </div>
      {open != null && pics[open] && (
        <PicViewer pic={pics[open]} file={files[open]} t={t} player={player} onClose={() => setOpen(null)}
          hearts={serverCounts[open] ?? 0} mine={!!mine[open]} onHeart={() => toggle(open)}
          onPrev={pos > 0 ? () => setOpen(order[pos - 1]) : undefined} onNext={pos >= 0 && pos < order.length - 1 ? () => setOpen(order[pos + 1]) : undefined} />
      )}
    </div>
  );
}

function PickScreen({ view, t, send }: ControllerViewProps) {
  const colors = [['#4BE3A1', '#23A872', '#110D24'], ['#FFD447', '#C79E1A', '#110D24'], [PINK, PINK_D, '#fff']];
  return (
    <>
      <PhoneTimer deadline={view.deadline} duration={view.duration} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 12 }}>
        <h1 style={{ fontSize: 34, lineHeight: 1.05 }}>{t('pick.title')}</h1>
        <p className="muted" style={{ fontSize: 17 }}>{t('pick.text')}</p>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16 }}>
        {(view.words as { i: number; word: string; level: number; points: number }[]).map((w, k) => {
          const [bg, sh, fg] = colors[Math.max(0, Math.min(2, w.level - 1))];
          return (
            <button key={w.i} type="button" onClick={() => send({ type: 'pick', i: w.i })} className="anim-pop"
              style={{ minHeight: 112, border: 0, borderRadius: 22, background: bg, color: fg, boxShadow: `0 6px 0 ${sh}`, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 6, padding: '0 22px', textAlign: 'left', animationDelay: `${k * 0.08}s` }}>
              <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>{t(`pick.level${w.level}`)}</span>
              <span className="display" style={{ fontWeight: 800, fontSize: 30, lineHeight: 1 }}>{w.word}</span>
              <span style={{ fontSize: 15, fontWeight: 700 }}>{t('pick.points', { n: w.points })}</span>
            </button>
          );
        })}
      </div>
      <p className="faint" style={{ textAlign: 'center', fontSize: 14 }}>{t('pick.rule')}</p>
    </>
  );
}

function Controller(props: ControllerViewProps) {
  const { view, t, me, player } = props;
  switch (view.screen) {
    case 'intro':
      return (
        <PhoneWait title={t('title')} text={view.team && view.myTeam != null ? teamName(t, view.myTeam) : t('lookAtTv')}
          emoji={<span style={{ borderRadius: '50%', boxShadow: view.team && view.myTeam != null ? `0 0 0 5px ${TEAM[view.myTeam].color}` : undefined }}><Avatar player={me} size={96} /></span>} />
      );
    case 'waitPick': {
      const d = player(view.drawerId);
      return <PhoneWait title={t('waitPick.title', { name: d?.name ?? '?' })} text={t('waitPick.text')} emoji={d ? <Avatar player={d} size={96} /> : undefined} />;
    }
    case 'pick':
      return <PickScreen {...props} />;
    case 'draw':
      return <DrawScreen {...props} />;
    case 'guess':
    case 'watch':
      return <GuessScreen {...props} />;
    case 'solved':
      return <SolvedScreen {...props} />;
    case 'roundResult': {
      const title = view.isDrawer
        ? t(view.solvedCount === 0 ? 'result.drawer0' : view.solvedCount === 1 ? 'result.drawer1' : 'result.drawer', { n: view.solvedCount })
        : view.team ? (view.points > 0 ? t('solved.team') : t('result.missed'))
          : view.found ? t('result.found') : t('result.missed');
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, textAlign: 'center' }} className="anim-fade">
          {view.points > 0 && <Confetti pieces={14} />}
          <Avatar player={me} size={110} />
          <h1 style={{ fontSize: 30 }}>{title}</h1>
          <p className="muted" style={{ fontSize: 18 }}>{t('result.wordWas', { word: view.word })}</p>
          {view.isDrawer && view.cheat && <p style={{ color: 'var(--orange)', fontWeight: 700 }}>{t('result.cheat')}</p>}
          <span className="display" style={{ fontSize: 60, fontWeight: 800, color: 'var(--yellow)', textShadow: '0 6px 0 var(--yellow-d)', animation: 'upPop .6s ease-out both' }}>+{view.points}</span>
          {view.team && view.points > 0 && <span className="muted">{t('result.teamPoints')}</span>}
        </div>
      );
    }
    case 'gallery':
      return <PhoneGallery {...props} />;
    case 'scoresMe':
    case 'finalMe':
      return <PhoneWait title={t('me.place', { place: view.place, of: view.of })} text={t('me.score', { n: view.score })} emoji={<Avatar player={me} size={110} />} />;
    default:
      return <PhoneWait title={t('lookAtTv')} emoji={<Avatar player={me} size={96} />} />;
  }
}

export default { Host, Controller } satisfies GameClientModule;
