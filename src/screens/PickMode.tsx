/**
 * Nächstes Spiel wählen: VIP wählt (Standard), Abstimmung oder Zufall.
 * Umschalten können TV und VIP; abstimmen können alle Spieler auf dem Handy.
 */
import type React from 'react';
import type { GameManifest, GameVote, PickMode, PlayerInfo, RoomSnapshot, Translate } from '@up/sdk';
import { Avatar, Crown, HostTimer, PhoneTimer, useServerNow } from '../ui';
import { net } from '../net';
import { GameCover, gameName, playersLabel } from './GameLibrary';

export const ROLL_MS = 2600;

const IconCrown = () => (
  <svg width="18" height="14" viewBox="0 0 26 20" aria-hidden="true"><path d="M2 18 L4 5 L9 11 L13 2 L17 11 L22 5 L24 18 Z" fill="currentColor" /></svg>
);
const IconVote = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
);
const IconDice = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4" /><circle cx="8.5" cy="8.5" r="1.3" fill="currentColor" /><circle cx="15.5" cy="15.5" r="1.3" fill="currentColor" /><circle cx="12" cy="12" r="1.3" fill="currentColor" /></svg>
);

export const pickModeOf = (room: RoomSnapshot): PickMode => room.settings.pickMode ?? 'vip';

/** Umschalter „VIP wählt · Abstimmung · Zufall“ */
export function PickModeSwitch({ mode, t, big }: { mode: PickMode; t: Translate; big?: boolean }) {
  const items: [PickMode, string, () => React.ReactElement][] = [['vip', t('pick.vip'), IconCrown], ['vote', t('pick.vote'), IconVote], ['random', t('pick.random'), IconDice]];
  return (
    <div role="radiogroup" aria-label={t('pick.label')} style={{ display: 'flex', background: big ? 'var(--surface)' : 'var(--surface-2)', borderRadius: 999, padding: 4, gap: 2 }}>
      {items.map(([m, label, Icon]) => {
        const on = m === mode;
        return (
          <button key={m} type="button" role="radio" aria-checked={on} onClick={() => net.send('pickMode', { mode: m })} style={{
            flex: 1, border: 0, minHeight: 44, padding: big ? '8px 16px' : '8px 10px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            font: `700 ${big ? 16 : 14}px 'DM Sans', sans-serif`, background: on ? '#fff' : 'transparent', color: on ? '#110D24' : 'var(--muted)', whiteSpace: 'nowrap',
          }}><Icon />{label}</button>
        );
      })}
    </div>
  );
}

/** Walze beim Zufall: welcher Name gerade zu sehen ist (null = Animation vorbei) */
export function useRoll(room: RoomSnapshot, games: GameManifest[]) {
  const now = useServerNow(70);
  const roll = room.roll;
  if (!roll) return null;
  const elapsed = now - roll.at;
  if (elapsed < 0 || elapsed >= ROLL_MS) return null;
  const p = elapsed / ROLL_MS;
  const eased = 1 - (1 - p) ** 3;
  const id = roll.reel[Math.min(roll.reel.length - 1, Math.floor(eased * roll.reel.length))];
  return games.find((g) => g.id === id) ?? null;
}

function tally(vote: GameVote) {
  const m = new Map<string, string[]>();
  for (const [pid, gids] of Object.entries(vote.votes)) for (const gid of gids) m.set(gid, [...(m.get(gid) ?? []), pid]);
  return m;
}

export const votesFor = (vote: GameVote | null | undefined, gameId: string) =>
  vote ? Object.values(vote.votes).filter((g) => g.includes(gameId)).length : 0;

/** Kleiner Umschalter mit zwei bis drei Werten */
function Seg<T extends string | number | boolean>({ label, value, items, onPick }: { label: string; value: T; items: [T, string][]; onPick: (v: T) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span className="faint" style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>{label}</span>
      <div role="radiogroup" aria-label={label} style={{ display: 'flex', background: 'var(--surface-2)', borderRadius: 999, padding: 3 }}>
        {items.map(([v, text]) => (
          <button key={String(v)} type="button" role="radio" aria-checked={v === value} onClick={() => onPick(v)} style={{
            border: 0, minHeight: 36, padding: '4px 12px', borderRadius: 999, font: "700 13px 'DM Sans', sans-serif", whiteSpace: 'nowrap',
            background: v === value ? '#fff' : 'transparent', color: v === value ? '#110D24' : 'var(--muted)',
          }}>{text}</button>
        ))}
      </div>
    </div>
  );
}

/** Einstellungen der Abstimmung: was steht zur Wahl, wie viele Stimmen hat jeder */
export function VoteOptions({ room, t }: { room: RoomSnapshot; t: Translate }) {
  const all = !!room.settings.voteAll;
  const per = room.settings.votesPerPlayer === 3 ? 3 : 1;
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
      <Seg label={t('pick.choice')} value={all} items={[[false, t('pick.choice4')], [true, t('pick.choiceAll')]]} onPick={(v) => net.send('vote:options', { voteAll: v })} />
      <Seg label={t('pick.perPlayer')} value={per} items={[[1, '1'], [3, '3']]} onPick={(v) => net.send('vote:options', { votesPerPlayer: v })} />
    </div>
  );
}

/** TV: laufende Abstimmung mit 2–4 Spielen */
export function HostVoteBoard({ vote, games, room, t, player }: { vote: GameVote; games: GameManifest[]; room: RoomSnapshot; t: Translate; player: (id: string) => PlayerInfo | undefined }) {
  const byGame = tally(vote);
  const cands = vote.candidates.map((id) => games.find((g) => g.id === id)).filter(Boolean) as GameManifest[];
  const voters = room.players.filter((p) => p.connected || p.isBot);
  const done = Object.values(vote.votes).filter((g) => g.length >= vote.maxVotes).length;
  const many = vote.candidates.length > 4;
  const best = Math.max(1, ...[...byGame.values()].map((v) => v.length));
  return (
    <section className="anim-up" style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 14, borderRadius: 28, background: 'var(--surface)', padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 30, fontWeight: 800 }}>{t('pick.voteTitle')}</h2>
          <p className="muted" style={{ fontSize: 16 }}>{vote.maxVotes > 1 ? t('pick.voteHintN', { n: vote.maxVotes }) : t('pick.voteHint')} · {t('pick.voted', { n: done, total: voters.length })}</p>
        </div>
        <HostTimer deadline={vote.deadline} duration={vote.duration} size={60} />
      </div>
      {many ? (
        <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gridAutoRows: 'minmax(0, 1fr)', gap: 8 }}>
          {cands.map((g) => {
            const who = (byGame.get(g.id) ?? []).map(player).filter(Boolean) as PlayerInfo[];
            const lead = who.length > 0 && who.length === best;
            return (
              <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 0, borderRadius: 12, padding: '0 10px 0 0', overflow: 'hidden', background: lead ? 'var(--surface-2)' : '#1C1738', boxShadow: lead ? `0 0 0 3px ${g.color}` : undefined }}>
                <span style={{ width: 8, alignSelf: 'stretch', background: g.color, flex: 'none' }} />
                <span className="display" style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{gameName(g, room.lang)}</span>
                <span style={{ display: 'flex' }}>{who.slice(0, 4).map((p, j) => <span key={p.id} style={{ marginLeft: j ? -8 : 0 }}><Avatar player={p} size={22} flat /></span>)}</span>
                <span className="display" style={{ minWidth: 22, textAlign: 'right', fontSize: 20, fontWeight: 800, color: lead ? 'var(--yellow)' : 'var(--muted)' }}>{who.length}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gridAutoRows: 'minmax(0, 1fr)', gap: 14 }}>
        {cands.map((g, i) => {
          const who = (byGame.get(g.id) ?? []).map(player).filter(Boolean) as PlayerInfo[];
          return (
            <div key={g.id} style={{ position: 'relative', borderRadius: 20, overflow: 'hidden', boxShadow: `0 0 0 3px ${g.color}`, animation: `upPop .35s ease-out ${(0.08 * i).toFixed(2)}s both`, minHeight: 0 }}>
              <GameCover g={g} lang={room.lang} letterSize={150} />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(17,13,36,0) 30%, rgba(17,13,36,.92) 100%)' }} />
              <span className="display" style={{ position: 'absolute', right: 12, top: 10, minWidth: 46, height: 46, borderRadius: 23, background: '#fff', color: '#110D24', fontSize: 26, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 10px' }}>{who.length}</span>
              <div style={{ position: 'absolute', left: 14, right: 14, bottom: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span className="display" style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.05 }}>{gameName(g, room.lang)}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#D9D5EE' }}>{playersLabel(g, t)} · {t('lobby.minutes', { n: g.minutes })}</span>
                <div style={{ display: 'flex', minHeight: 30 }}>
                  {who.slice(0, 12).map((p, j) => <span key={p.id} style={{ marginLeft: j ? -8 : 0, animation: 'upPop .3s ease-out both' }}><Avatar player={p} size={30} /></span>)}
                  {who.length > 12 && <b style={{ marginLeft: 6, fontSize: 14, alignSelf: 'center' }}>+{who.length - 12}</b>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      )}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
        <button className="up-btn ghost" onClick={() => net.send('vote:start')}>{t('pick.newVote')}</button>
        <button className="up-btn" onClick={() => net.send('vote:end')}>{t('pick.endVote')}</button>
      </div>
    </section>
  );
}

/** Handy: abstimmen (alle) – der VIP kann zusätzlich auswerten */
export function PhoneVote({ vote, games, room, me, t, isVip }: { vote: GameVote; games: GameManifest[]; room: RoomSnapshot; me: PlayerInfo; t: Translate; isVip: boolean }) {
  const byGame = tally(vote);
  const mine = vote.votes[me.id] ?? [];
  const left = vote.maxVotes - mine.length;
  const cands = vote.candidates.map((id) => games.find((g) => g.id === id)).filter(Boolean) as GameManifest[];
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PhoneTimer deadline={vote.deadline} duration={vote.duration} />
      <h2 style={{ fontSize: 24, fontWeight: 800 }}>{t('pick.voteTitle')}</h2>
      <p className="muted" style={{ fontSize: 15, marginTop: -6 }}>
        {vote.maxVotes > 1 ? (left > 0 ? t('pick.votesLeft', { n: left, max: vote.maxVotes }) : t('pick.voteChangeN')) : mine.length ? t('pick.voteChange') : t('pick.votePhone')}
      </p>
      <div role={vote.maxVotes > 1 ? 'group' : 'radiogroup'} aria-label={t('pick.voteTitle')} style={{ display: 'flex', flexDirection: 'column', gap: vote.candidates.length > 4 ? 8 : 10 }}>
        {cands.map((g) => {
          const on = mine.includes(g.id);
          const n = (byGame.get(g.id) ?? []).length;
          return (
            <button key={g.id} type="button" role={vote.maxVotes > 1 ? 'checkbox' : 'radio'} aria-checked={on} onClick={() => net.send('gamevote', { gameId: g.id })} style={{
              minHeight: vote.candidates.length > 4 ? 60 : 76, border: `3px solid ${on ? g.color : 'transparent'}`, borderRadius: 20, padding: 0, overflow: 'hidden', display: 'flex', alignItems: 'stretch', textAlign: 'left',
              background: on ? 'var(--surface-2)' : 'var(--surface)', color: '#fff',
            }}>
              <span style={{ width: 92, flex: 'none', position: 'relative' }}><GameCover g={g} lang={room.lang} letterSize={64} /></span>
              <span style={{ flex: 1, minWidth: 0, padding: '10px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3 }}>
                <span className="display" style={{ fontSize: 19, fontWeight: 800 }}>{gameName(g, room.lang)}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)' }}>{playersLabel(g, t)} · {t('lobby.minutes', { n: g.minutes })}</span>
              </span>
              <span className="display" style={{ alignSelf: 'center', marginRight: 14, fontSize: 22, fontWeight: 800, color: on ? 'var(--yellow)' : 'var(--muted)' }}>{n}</span>
            </button>
          );
        })}
      </div>
      {isVip && (
        <div style={{ display: 'flex', gap: 10, position: 'sticky', bottom: 0, background: 'var(--bg)', padding: '10px 0 8px', margin: '0 -2px' }}>
          <button className="up-btn ghost full" onClick={() => net.send('vote:start')}>{t('pick.newVote')}</button>
          <button className="up-btn full" onClick={() => net.send('vote:end')}>{t('pick.endVote')}</button>
        </div>
      )}
    </section>
  );
}

/** Hinweis am gewählten Spiel: wie es ausgewählt wurde */
export function PickedBadge({ room, t, vipName }: { room: RoomSnapshot; t: Translate; vipName?: string }) {
  const mode = pickModeOf(room);
  const text = mode === 'vote' && room.vote?.result ? t('pick.byVote', { n: votesFor(room.vote, room.vote.result) })
    : mode === 'random' ? t('pick.byRandom')
      : vipName ? t('lobby.pickedBy', { name: vipName }) : null;
  if (!text) return null;
  return (
    <span style={{ position: 'absolute', left: 18, top: 18, background: 'var(--bg)', borderRadius: 999, padding: '7px 14px', fontSize: 14, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      {mode === 'vote' ? <IconVote /> : mode === 'random' ? <IconDice /> : <Crown size={18} />} {text}
    </span>
  );
}
