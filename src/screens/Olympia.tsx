/**
 * Olympia-Modus: mehrere Spiele hintereinander als Disziplinen, mit Medaillen und Siegerehrung.
 * TV: Übersicht in der Lobby, Teamwahl, Spielewahl, Eröffnung, Medaillen, Siegerehrung.
 * Handy: dieselben Phasen aus Sicht des Spielers, VIP mit Knöpfen.
 */
import { useEffect, useState } from 'react';
import type React from 'react';
import {
  OLYMPIA_MAX, OLYMPIA_MIN, cleanOlympiaSettings, olympiaAllowed, olympiaOptions,
  type GameManifest, type Lang, type OlympiaSettings, type OlympiaState, type OlympiaTeam, type PlayerInfo, type RoomSnapshot, type Translate,
} from '@up/sdk';
import { net } from '../net';
import { Avatar, Confetti, Crown, HostTimer, PhoneTimer, sfx, useCountdown } from '../ui';
import { GameCover, GameLibrary, gameName } from './GameLibrary';
import { GameOptionsForm } from './GameOptions';

export const MEDAL_COLORS = ['', '#FFD447', '#C9CEDB', '#E0965A'];
const MEDAL_DARK = ['', '#C79E1A', '#8E93A3', '#A8642F'];

export const olympiaSettingsOf = (room: RoomSnapshot): OlympiaSettings => cleanOlympiaSettings(room.settings.olympia);
/** Läuft Olympia gerade (nicht nur die Übersicht)? */
export const olympiaRunning = (room: RoomSnapshot) => !!room.olympia && room.olympia.phase !== 'setup';

/* ---------------- Hilfen ---------------- */

interface Entrant { id: string; name: string; color: string; player?: PlayerInfo; team?: OlympiaTeam }

function entrantOf(room: RoomSnapshot, o: OlympiaState, id: string, t: Translate): Entrant {
  const team = o.teams?.find((x) => x.id === id);
  if (team) return { id, name: t(`olympia.team.${team.key}`), color: team.color, team };
  const p = room.players.find((x) => x.id === id);
  return { id, name: p?.name ?? '?', color: p?.color ?? '#4A4378', player: p };
}

/** Avatar eines Spielers oder Farbkreis eines Teams */
function EntrantBadge({ e, size, flat }: { e: Entrant; size: number; flat?: boolean }) {
  if (e.player) return <Avatar player={e.player} size={size} flat={flat} />;
  return (
    <span aria-hidden="true" style={{ width: size, height: size, borderRadius: '50%', background: e.color, flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: flat ? undefined : `0 ${Math.max(2, size / 16)}px 0 rgba(0,0,0,.35)` }}>
      <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" stroke="#110D24" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.8c1.7.8 2.7 2.6 3 5.2" /></svg>
    </span>
  );
}

/** Medaille als Kreis mit Platzzahl */
export function Medal({ medal, size = 34, label }: { medal: number; size?: number; label?: string }) {
  if (!medal) return null;
  return (
    <span role="img" aria-label={label} style={{ width: size, height: size, borderRadius: '50%', flex: 'none', background: MEDAL_COLORS[medal], boxShadow: `inset 0 0 0 ${Math.max(2, size / 12)}px ${MEDAL_DARK[medal]}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#110D24', font: `800 ${size * 0.5}px 'Bricolage Grotesque', sans-serif` }}>{medal}</span>
  );
}

/** Die fünf Punkte über dem Titel */
function Dots({ size = 14 }: { size?: number }) {
  return (
    <span aria-hidden="true" style={{ display: 'inline-flex', gap: size / 2 }}>
      {['#36D6F5', '#FFD447', '#E8336F', '#4BE3A1', '#9B7BFF'].map((c) => <span key={c} style={{ width: size, height: size, borderRadius: '50%', background: c }} />)}
    </span>
  );
}

/** Kleiner Umschalter mit Pillen */
function Pills<T extends string | number | boolean>({ label, value, items, onPick, small }: { label: string; value: T; items: [T, string][]; onPick: (v: T) => void; small?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: small ? 6 : 7 }}>
      <span className="up-label" style={{ fontSize: small ? 12 : 13 }}>{label}</span>
      <div role="radiogroup" aria-label={label} style={{ display: 'flex', flexWrap: 'wrap', gap: small ? 6 : 7 }}>
        {items.map(([v, text]) => {
          const on = v === value;
          return (
            <button key={String(v)} type="button" role="radio" aria-checked={on} onClick={() => onPick(v)} style={{
              minHeight: small ? 40 : 38, border: on ? '1px solid #FFD447' : '1px solid var(--line)', borderRadius: 999, padding: small ? '6px 12px' : '6px 14px',
              background: on ? '#FFD447' : 'transparent', color: on ? '#110D24' : '#fff', font: `${on ? 700 : 500} ${small ? 14 : 15}px 'DM Sans', sans-serif`, whiteSpace: 'nowrap',
            }}>{text}</button>
          );
        })}
      </div>
    </div>
  );
}

/** Was Olympia an den Einstellungen eines Spiels ändert, z. B. „Runden: 2 statt 3“ */
function shortText(g: GameManifest, s: OlympiaSettings, normal: Record<string, number | string> | undefined, lang: Lang, t: Translate) {
  const now = olympiaOptions(g, s, normal);
  const base = olympiaOptions(g, { ...s, short: false, options: {} }, normal);
  const parts = (g.options ?? []).filter((d) => now[d.id] !== base[d.id]).map((d) => {
    const show = (v: number | string) => (d.choices ? (d.choices.find((c) => c.value === v)?.label[lang] ?? String(v)) : String(v));
    return t('olympia.instead', { label: d.label[lang] ?? d.label.en, now: show(now[d.id]), before: show(base[d.id]) });
  });
  return parts.join(' · ') || t('olympia.normalSettings');
}

/* ================= TV: Übersicht in der Lobby ================= */

export function OlympiaSetup({ room, games, t }: { room: RoomSnapshot; games: GameManifest[]; t: Translate }) {
  const s = olympiaSettingsOf(room);
  const lang = room.lang;
  const active = room.players.filter((p) => p.connected || p.isBot).length;
  const allowed = games.filter((g) => olympiaAllowed(g) && !g.hidden);
  const hiddenNames = games.filter((g) => !olympiaAllowed(g)).map((g) => gameName(g, lang));
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [edit, setEdit] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<OlympiaSettings>) => net.send('olympia:set', { patch });
  const listMode = s.pick === 'vip' || s.pick === 'random';
  const list = s.list.map((id) => games.find((g) => g.id === id)).filter(Boolean) as GameManifest[];
  const minutes = list.reduce((a, g) => a + Math.round(g.minutes * (s.short ? 0.65 : 1)), 0);
  const editing = edit ? games.find((g) => g.id === edit) : undefined;
  const canStart = active >= 2 && (!listMode || list.length >= 1) && (!s.teams || active >= s.teams);

  const start = async () => {
    setError(null);
    const res = await net.request('olympia:start');
    if (!res.ok) setError(t(`error.${res.error}`));
  };

  return (
    <section className="anim-up" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Dots size={11} />
          <h1 className="display" style={{ fontSize: 42, fontWeight: 800, lineHeight: 1 }}>{t('olympia.title')}</h1>
          <p className="muted" style={{ fontSize: 15 }}>{t('olympia.subtitle')}</p>
        </div>
        <button className="up-btn ghost small" onClick={() => net.send('olympia:close')}>{t('olympia.close')}</button>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 14 }}>
        <div className="up-card" style={{ flex: '1 1 0', minWidth: 0, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto' }}>
          <Pills label={t('olympia.pick')} value={s.pick} onPick={(v) => set({ pick: v })}
            items={[['vip', t('olympia.pick.vip')], ['random', t('olympia.pick.random')], ['secret', t('olympia.pick.secret')], ['open', t('olympia.pick.open')]]} />
          <Pills label={t('olympia.scoring')} value={s.scoring} onPick={(v) => set({ scoring: v })}
            items={[['medals', t('olympia.scoring.medals')], ['points', t('olympia.scoring.points')], ['medalpoints', t('olympia.scoring.medalpoints')]]} />
          <Pills label={t('olympia.teams')} value={s.teams} onPick={(v) => set({ teams: v })}
            items={[[0, t('olympia.teams.0')], [2, t('olympia.teams.n', { n: 2 })], [3, t('olympia.teams.n', { n: 3 })], [4, t('olympia.teams.n', { n: 4 })]]} />
          {s.teams > 0 && (
            <Pills label={t('olympia.teamMode')} value={s.teamMode} onPick={(v) => set({ teamMode: v })}
              items={[['switch', t('olympia.teamMode.switch')], ['random', t('olympia.teamMode.random')], ['vip', t('olympia.teamMode.vip')], ['free', t('olympia.teamMode.free')]]} />
          )}
          <Pills label={t('olympia.length')} value={s.short} onPick={(v) => set({ short: v })}
            items={[[true, t('olympia.length.short')], [false, t('olympia.length.normal')]]} />
        </div>

        <div className="up-card" style={{ flex: '1 1 0', minWidth: 0, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="up-label" style={{ fontSize: 13 }}>{t('olympia.disciplines')}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {s.pick === 'random' && <button className="up-btn ghost small" style={{ minHeight: 34, padding: '4px 10px', fontSize: 14 }} onClick={() => net.send('olympia:reroll')}>{t('olympia.reroll')}</button>}
              <button type="button" aria-label={t('olympia.countDown')} disabled={s.count <= OLYMPIA_MIN} onClick={() => set({ count: s.count - 1 })} style={stepBtn}>−</button>
              <span className="display" style={{ fontSize: 24, fontWeight: 800, minWidth: 22, textAlign: 'center' }}>{s.count}</span>
              <button type="button" aria-label={t('olympia.countUp')} disabled={s.count >= OLYMPIA_MAX} onClick={() => set({ count: s.count + 1 })} style={stepBtn}>+</button>
            </div>
          </div>
          {listMode ? (
            <div style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {list.map((g, i) => (
                <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface-2)', borderRadius: 12, padding: '6px 8px 6px 6px' }}>
                  <span style={{ width: 20, textAlign: 'center', color: 'var(--faint)', fontWeight: 700 }}>{i + 1}</span>
                  <span style={{ position: 'relative', width: 52, height: 36, borderRadius: 8, overflow: 'hidden', flex: 'none' }}><GameCover g={g} lang={lang} letterSize={34} /></span>
                  <button type="button" onClick={() => setEdit(g.id)} title={t('olympia.editGame')} style={{ flex: 1, minWidth: 0, border: 0, background: 'transparent', color: '#fff', textAlign: 'left', padding: 0, display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: 700, fontSize: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{gameName(g, lang)}</span>
                    <span className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{shortText(g, s, room.settings.gameOptions?.[g.id], lang, t)}</span>
                  </button>
                  {active > g.maxPlayers || active < g.minPlayers ? <span style={{ fontSize: 12, color: 'var(--yellow)', fontWeight: 700 }}>{t('olympia.doesntFit')}</span> : null}
                  <button type="button" aria-label={t('olympia.up')} disabled={i === 0} onClick={() => net.send('olympia:move', { gameId: g.id, dir: -1 })} style={iconBtn}>↑</button>
                  <button type="button" aria-label={t('olympia.remove')} onClick={() => net.send('olympia:remove', { gameId: g.id })} style={iconBtn}>×</button>
                </div>
              ))}
              {list.length < OLYMPIA_MAX && (
                <button type="button" onClick={() => setLibraryOpen(true)} style={{ minHeight: 40, border: '1px dashed var(--line)', background: 'transparent', color: 'var(--muted)', borderRadius: 12, font: "600 15px 'DM Sans', sans-serif" }}>+ {t('olympia.addGame')}</button>
              )}
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10, padding: '0 6px' }}>
              <p className="display" style={{ fontSize: 22, fontWeight: 800 }}>{t(s.pick === 'open' ? 'olympia.everyonePicksOpen' : 'olympia.everyonePicksSecret')}</p>
              <p className="muted" style={{ fontSize: 15, lineHeight: 1.4 }}>{t('olympia.everyonePicksHint', { n: s.count })}</p>
            </div>
          )}
          {hiddenNames.length > 0 && <span className="faint" style={{ fontSize: 12 }}>{t('olympia.hidden', { names: hiddenNames.join(', ') })}</span>}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span className="muted" style={{ flex: 1, fontSize: 14 }}>
          {error ?? (listMode && list.length ? t('olympia.footer', { min: minutes }) : t('olympia.footerPick'))}
        </span>
        <button className="up-btn big pink" disabled={!canStart} onClick={start} style={{ padding: '0 34px' }}>{t('olympia.start')}</button>
      </div>

      {libraryOpen && (
        <GameLibrary games={allowed.filter((g) => !s.list.includes(g.id))} selectedId={null} players={active} lang={lang} t={t}
          onPick={(id) => { net.send('olympia:add', { gameId: id }); setLibraryOpen(false); }} onClose={() => setLibraryOpen(false)} />
      )}
      {editing && (
        <div role="dialog" aria-modal="true" aria-label={gameName(editing, lang)} onClick={() => setEdit(null)}
          style={{ position: 'absolute', inset: 0, zIndex: 70, background: 'rgba(10,7,22,.82)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="up-card anim-pop" onClick={(e) => e.stopPropagation()} style={{ width: 720, maxHeight: 640, overflow: 'auto', padding: 32, display: 'flex', flexDirection: 'column', gap: 18, borderRadius: 28, borderTop: `8px solid ${editing.color}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div>
                <h2 style={{ fontSize: 30 }}>{gameName(editing, lang)}</h2>
                <p className="muted" style={{ fontSize: 15 }}>{t('olympia.editHint')}</p>
              </div>
              <button className="up-btn small" onClick={() => setEdit(null)}>{t('settings.close')}</button>
            </div>
            {editing.options?.length ? (
              <GameOptionsForm game={editing} values={olympiaOptions(editing, s, room.settings.gameOptions?.[editing.id])} lang={lang}
                onSet={(id, value) => net.send('olympia:option', { gameId: editing.id, id, value })} />
            ) : <p className="muted">{t('olympia.noOptions')}</p>}
            {s.options[editing.id] && <button className="up-btn ghost small" style={{ alignSelf: 'flex-start' }} onClick={() => net.send('olympia:optionReset', { gameId: editing.id })}>{t('olympia.resetOptions')}</button>}
          </div>
        </div>
      )}
    </section>
  );
}

const stepBtn: React.CSSProperties = { width: 34, height: 34, borderRadius: '50%', border: '1px solid var(--line)', background: 'transparent', color: '#fff', fontSize: 20, lineHeight: 1, padding: 0 };
const iconBtn: React.CSSProperties = { width: 32, height: 32, borderRadius: 10, border: 0, background: 'transparent', color: 'var(--faint)', fontSize: 18, padding: 0, flex: 'none' };

/* ================= TV: laufendes Olympia ================= */

export function OlympiaHost({ room, games, t }: { room: RoomSnapshot; games: GameManifest[]; t: Translate }) {
  const o = room.olympia!;
  useEffect(() => {
    if (o.phase === 'opening') sfx.play('fanfare');
    if (o.phase === 'medals') sfx.play('score');
  }, [o.phase, o.current]);
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 18, position: 'relative' }}>
      {o.phase === 'teams' && <HostTeams room={room} o={o} t={t} />}
      {o.phase === 'pick' && <HostPick room={room} o={o} games={games} t={t} />}
      {o.phase === 'opening' && <HostOpening room={room} o={o} games={games} t={t} />}
      {o.phase === 'medals' && <HostMedals room={room} o={o} games={games} t={t} />}
      {o.phase === 'ceremony' && <HostCeremony room={room} o={o} t={t} />}
    </div>
  );
}

function HostTitle({ kicker, title, sub, right }: { kicker: string; title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        <span className="up-label" style={{ color: 'var(--yellow)', fontSize: 14 }}>{kicker}</span>
        <h1 className="display" style={{ fontSize: 48, fontWeight: 800, lineHeight: 1 }}>{title}</h1>
        {sub && <p className="muted" style={{ fontSize: 18 }}>{sub}</p>}
      </div>
      {right}
    </div>
  );
}

function HostTeams({ room, o, t }: { room: RoomSnapshot; o: OlympiaState; t: Translate }) {
  const teams = o.teams ?? [];
  const player = (id: string) => room.players.find((p) => p.id === id);
  const unassigned = room.players.filter((p) => (p.connected || p.isBot) && !teams.some((x) => x.members.includes(p.id)));
  const sub = o.teamMode === 'switch' ? t('olympia.teamsSwitchHint') : o.teamMode === 'free' ? t('olympia.teamsFreeHint') : o.teamMode === 'vip' ? t('olympia.teamsVipHint') : t('olympia.teamsRandomHint');
  const cycle = (pid: string) => {
    if (o.teamMode !== 'vip') return;
    const i = teams.findIndex((x) => x.members.includes(pid));
    net.send('olympia:assign', { playerId: pid, teamId: teams[(i + 1) % teams.length].id });
  };
  const size = teams.reduce((a, x) => Math.max(a, x.members.length), 0) > 6 ? 56 : 84;
  return (
    <>
      <HostTitle kicker={t('olympia.kickerTeams')} title={t('olympia.teamsTitle')} sub={sub}
        right={o.deadline ? <HostTimer deadline={o.deadline} duration={o.duration} size={72} /> : <button className="up-btn" onClick={() => net.send('olympia:next')}>{t('olympia.teamsDone')}</button>} />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 18 }}>
        {teams.map((team) => (
          <div key={team.id} style={{ flex: '1 1 0', minWidth: 0, borderRadius: 24, padding: 20, display: 'flex', flexDirection: 'column', gap: 18, background: 'var(--surface)', border: `3px solid ${team.color}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 22, height: 22, borderRadius: '50%', background: team.color }} />
              <span className="display" style={{ fontSize: teams.length > 3 ? 26 : 32, fontWeight: 800 }}>{t(`olympia.team.${team.key}`)}</span>
              <span className="muted" style={{ marginLeft: 'auto', fontSize: 16 }}>{team.members.length}</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
              {team.members.map((id) => {
                const p = player(id);
                return p ? (
                  <button key={id} type="button" disabled={o.teamMode !== 'vip'} onClick={() => cycle(id)} className="anim-pop"
                    style={{ border: 0, background: 'transparent', color: '#fff', padding: 0, width: size + 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: o.teamMode === 'vip' ? 'pointer' : 'default' }}>
                    <Avatar player={p} size={size} />
                    <span style={{ fontSize: 15, fontWeight: 700, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                  </button>
                ) : null;
              })}
            </div>
          </div>
        ))}
      </div>
      {unassigned.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="muted">{t('olympia.notYetInTeam')}</span>
          {unassigned.map((p) => <Avatar key={p.id} player={p} size={34} flat dim />)}
        </div>
      )}
    </>
  );
}

function tallyPicks(o: OlympiaState) {
  const m = new Map<string, string[]>();
  for (const [pid, gid] of Object.entries(o.picks)) m.set(gid, [...(m.get(gid) ?? []), pid]);
  return m;
}

function HostPick({ room, o, games, t }: { room: RoomSnapshot; o: OlympiaState; games: GameManifest[]; t: Translate }) {
  const open = o.pickMode === 'open';
  const by = tallyPicks(o);
  const pool = o.pickPool.map((id) => games.find((g) => g.id === id)).filter(Boolean) as GameManifest[];
  const voters = room.players.filter((p) => p.connected || p.isBot);
  const missing = voters.filter((p) => !o.picks[p.id]);
  const cols = pool.length > 16 ? 5 : 4;
  return (
    <>
      <HostTitle kicker={t(open ? 'olympia.kickerPickOpen' : 'olympia.kickerPickSecret')} title={t('olympia.pickTitle')}
        sub={t(open ? 'olympia.pickHintOpen' : 'olympia.pickHintSecret')} right={<HostTimer deadline={o.deadline} duration={o.duration} size={72} />} />
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridAutoRows: 'minmax(0, 1fr)', gap: 10 }}>
        {pool.map((g) => {
          const who = open ? (by.get(g.id) ?? []).map((id) => room.players.find((p) => p.id === id)).filter(Boolean) as PlayerInfo[] : [];
          const on = who.length > 0;
          return (
            <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 0, borderRadius: 14, padding: '8px 10px', background: on ? 'var(--surface-2)' : 'var(--surface)', border: `2px solid ${on ? g.color : 'transparent'}` }}>
              <span style={{ position: 'relative', width: 44, height: 44, borderRadius: 10, overflow: 'hidden', flex: 'none' }}><GameCover g={g} lang={room.lang} letterSize={30} /></span>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{gameName(g, room.lang)}</span>
                <span style={{ display: 'flex', minHeight: 24 }}>{who.slice(0, 6).map((p, j) => <span key={p.id} style={{ marginLeft: j ? -7 : 0 }} className="anim-pop"><Avatar player={p} size={24} flat /></span>)}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="up-card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderRadius: 14 }}>
        <b style={{ fontSize: 17 }}>{t('olympia.picked', { n: voters.length - missing.length, total: voters.length })}</b>
        {missing.length > 0 && <span className="muted">{t('olympia.missing')}</span>}
        {missing.slice(0, 12).map((p) => <Avatar key={p.id} player={p} size={32} flat dim />)}
        <span className="muted" style={{ marginLeft: 'auto', fontSize: 15 }}>{t('olympia.pickRule', { n: olympiaSettingsOf(room).count })}</span>
      </div>
    </>
  );
}

/** Reihe der Disziplinen mit Status (fertig, jetzt, kommt noch) */
function DisciplineStrip({ o, games, lang, t, highlight }: { o: OlympiaState; games: GameManifest[]; lang: Lang; t: Translate; highlight: number }) {
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      {o.disciplines.map((d, i) => {
        const g = games.find((x) => x.id === d.gameId);
        const now = i === highlight;
        const done = d.status === 'done';
        const skipped = d.status === 'skipped';
        return (
          <div key={d.gameId + i} style={{ flex: '1 1 0', minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, borderRadius: 12, padding: '9px 12px', background: now ? 'var(--surface-2)' : 'var(--surface)', border: `2px solid ${now ? 'var(--yellow)' : 'transparent'}`, opacity: !now && !done && !skipped ? 0.6 : 1 }}>
            <span style={{ width: 26, height: 26, borderRadius: '50%', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', font: "800 14px 'DM Sans', sans-serif", color: '#110D24', background: done ? 'var(--green)' : skipped ? 'var(--line)' : now ? 'var(--yellow)' : 'var(--line)' }}>
              {done ? '✓' : skipped ? '–' : i + 1}
            </span>
            <span style={{ fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: skipped ? 'line-through' : undefined }}>{g ? gameName(g, lang) : d.gameId}</span>
          </div>
        );
      })}
    </div>
  );
}

function HostOpening({ room, o, games, t }: { room: RoomSnapshot; o: OlympiaState; games: GameManifest[]; t: Translate }) {
  const first = games.find((g) => g.id === o.disciplines[0]?.gameId);
  const entrants = o.entrants.map((id) => entrantOf(room, o, id, t));
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginTop: 10 }}>
        <Dots size={20} />
        <h1 className="display anim-pop" style={{ fontSize: 96, fontWeight: 800, lineHeight: 1 }}>{t('olympia.title')}</h1>
        <p className="muted" style={{ fontSize: 22 }}>{t('olympia.openingSub', { n: o.disciplines.length, scoring: t(`olympia.scoring.${o.scoring}`) })}</p>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: `repeat(${Math.min(4, o.disciplines.length)}, minmax(0, 1fr))`, gap: 14, alignContent: 'center' }}>
        {o.disciplines.map((d, i) => {
          const g = games.find((x) => x.id === d.gameId);
          return g ? (
            <div key={d.gameId} style={{ position: 'relative', height: o.disciplines.length > 4 ? 110 : 160, borderRadius: 18, overflow: 'hidden', boxShadow: `0 0 0 3px ${i === 0 ? 'var(--yellow)' : g.color}`, animation: `upPop .4s ease-out ${(0.15 * i).toFixed(2)}s both` }}>
              <GameCover g={g} lang={room.lang} letterSize={90} />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(17,13,36,0) 35%, rgba(17,13,36,.92) 100%)' }} />
              <span className="display" style={{ position: 'absolute', left: 12, top: 10, width: 34, height: 34, borderRadius: '50%', background: '#fff', color: '#110D24', fontSize: 18, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
              <span className="display" style={{ position: 'absolute', left: 14, right: 14, bottom: 10, fontSize: 20, fontWeight: 800 }}>{gameName(g, room.lang)}</span>
            </div>
          ) : null;
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', flex: 1 }}>
          {entrants.map((e) => (
            <span key={e.id} className="up-chip" style={{ fontSize: 16, gap: 8 }}>
              <EntrantBadge e={e} size={26} flat /> <b>{e.name}</b>
              {e.team && <span className="muted">{e.team.members.length}</span>}
            </span>
          ))}
        </div>
        <span className="muted" style={{ fontSize: 17, whiteSpace: 'nowrap' }}>{first ? t('olympia.firstUp', { game: gameName(first, room.lang) }) : ''}</span>
        <HostTimer deadline={o.deadline} duration={o.duration} size={56} />
      </div>
    </>
  );
}

/** Podest einer Disziplin (die besten drei bzw. alle mit Medaille) */
function MiniPodium({ room, o, results, t }: { room: RoomSnapshot; o: OlympiaState; results: OlympiaState['disciplines'][number]['results']; t: Translate }) {
  const byMedal = (m: number) => results.filter((r) => r.medal === m);
  const order = [2, 1, 3];
  const heights = ['', 220, 160, 115];
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 14 }}>
      {order.map((m) => {
        const rs = byMedal(m);
        if (!rs.length) return <div key={m} style={{ width: 160 }} />;
        return (
          <div key={m} style={{ width: 160, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, animation: `upSlideUp .5s ease-out ${(0.15 + (3 - m) * 0.25).toFixed(2)}s both` }}>
            <div style={{ display: 'flex' }}>
              {rs.slice(0, 3).map((r, j) => <span key={r.id} style={{ marginLeft: j ? -18 : 0 }}><EntrantBadge e={entrantOf(room, o, r.id, t)} size={rs.length > 1 ? 60 : 80} /></span>)}
            </div>
            <span style={{ fontWeight: 700, fontSize: 18, textAlign: 'center', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rs.map((r) => entrantOf(room, o, r.id, t).name).join(' & ')}</span>
            <div style={{ width: '100%', height: heights[m], borderRadius: '14px 14px 0 0', background: MEDAL_COLORS[m], display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 12, gap: 4, boxSizing: 'border-box' }}>
              <span className="display" style={{ fontSize: 46, fontWeight: 800, lineHeight: 1, color: '#110D24' }}>{m}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#110D24' }}>{t(`olympia.medal.${m}`)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Medaillenspiegel bzw. Punktetabelle */
function StandingsTable({ room, o, t, max = 8, compact }: { room: RoomSnapshot; o: OlympiaState; t: Translate; max?: number; compact?: boolean }) {
  const current = o.disciplines[o.current];
  const newMedal = (id: string) => current?.status === 'done' && current.results.some((r) => r.id === id && r.medal > 0);
  const showPoints = o.scoring !== 'medals';
  const cols = `34px minmax(0, 1fr) repeat(3, 50px)${showPoints ? ' 64px' : ''}`;
  const rows = o.standings.slice(0, max);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, alignItems: 'center', padding: '0 6px 6px', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--muted)' }}>
        <span>{t('olympia.rank')}</span><span>{t(o.scoring === 'medals' ? 'olympia.medalTable' : 'olympia.pointsTable')}</span>
        <span style={{ textAlign: 'center', color: MEDAL_COLORS[1] }}>{t('olympia.medal.1')}</span>
        <span style={{ textAlign: 'center', color: MEDAL_COLORS[2] }}>{t('olympia.medal.2')}</span>
        <span style={{ textAlign: 'center', color: MEDAL_COLORS[3] }}>{t('olympia.medal.3')}</span>
        {showPoints && <span style={{ textAlign: 'right' }}>{t('olympia.points')}</span>}
      </div>
      {rows.map((s, i) => {
        const e = entrantOf(room, o, s.id, t);
        return (
          <div key={s.id} style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, alignItems: 'center', borderRadius: 12, padding: compact ? '5px 6px' : '7px 6px', background: i === 0 ? 'var(--surface-2)' : 'transparent' }}>
            <span className="display" style={{ fontSize: 22, fontWeight: 800, textAlign: 'center' }}>{s.rank}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <EntrantBadge e={e} size={compact ? 28 : 34} flat />
              <b style={{ fontSize: 18, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</b>
              {newMedal(s.id) && <span style={{ fontSize: 11, fontWeight: 700, color: '#110D24', background: 'var(--green)', borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap' }}>{t('olympia.newMedal')}</span>}
            </span>
            <span className="display" style={{ textAlign: 'center', fontSize: 22, fontWeight: 800 }}>{s.gold}</span>
            <span className="display" style={{ textAlign: 'center', fontSize: 22, fontWeight: 800 }}>{s.silver}</span>
            <span className="display" style={{ textAlign: 'center', fontSize: 22, fontWeight: 800 }}>{s.bronze}</span>
            {showPoints && <span className="display" style={{ textAlign: 'right', fontSize: 22, fontWeight: 800, color: 'var(--yellow)' }}>{s.points}</span>}
          </div>
        );
      })}
      {o.standings.length > rows.length && <span className="faint" style={{ fontSize: 14, paddingLeft: 8 }}>{t('olympia.more', { n: o.standings.length - rows.length })}</span>}
    </div>
  );
}

function HostMedals({ room, o, games, t }: { room: RoomSnapshot; o: OlympiaState; games: GameManifest[]; t: Translate }) {
  const d = o.disciplines[o.current];
  const g = games.find((x) => x.id === d?.gameId);
  const last = !o.disciplines.some((x, i) => i > o.current && x.status === 'next');
  const { seconds } = useCountdown(o.deadline, o.duration);
  return (
    <>
      <HostTitle kicker={t('olympia.kickerDiscipline', { n: o.current + 1, total: o.disciplines.length })}
        title={d?.status === 'done' ? t('olympia.medalsIn', { game: g ? gameName(g, room.lang) : '' }) : t('olympia.skippedTitle', { game: g ? gameName(g, room.lang) : '' })}
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="muted" style={{ fontSize: 17 }}>{t(last ? 'olympia.ceremonyIn' : 'olympia.nextIn', { s: seconds })}</span>
            <button className="up-btn ghost small" onClick={() => net.send('olympia:end')}>{t('olympia.end')}</button>
            <button className="up-btn small" onClick={() => net.send('olympia:next')}>{t(last ? 'olympia.toCeremony' : 'olympia.next')}</button>
          </div>
        } />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 24 }}>
        <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          {d?.status === 'done' ? <MiniPodium room={room} o={o} results={d.results} t={t} /> : <p className="muted display" style={{ alignSelf: 'center', fontSize: 24 }}>{t('olympia.skippedHint')}</p>}
        </div>
        <div className="up-card" style={{ flex: '1 1 0', minWidth: 0, padding: '14px 16px', overflow: 'hidden' }}>
          <StandingsTable room={room} o={o} t={t} max={o.teams ? 4 : 7} />
        </div>
      </div>
      <DisciplineStrip o={o} games={games} lang={room.lang} t={t} highlight={o.current} />
    </>
  );
}

function HostCeremony({ room, o, t }: { room: RoomSnapshot; o: OlympiaState; t: Translate }) {
  useEffect(() => {
    sfx.play('drumroll');
    const timer = setTimeout(() => sfx.play('fanfare'), 1700);
    return () => clearTimeout(timer);
  }, []);
  const winners = o.standings.filter((s) => s.rank === 1);
  const names = winners.map((s) => entrantOf(room, o, s.id, t).name);
  const played = o.disciplines.filter((d) => d.status === 'done').length;
  const top = o.standings.slice(0, 3);
  const order = [1, 0, 2].filter((i) => top[i]);
  const heights = [240, 175, 125];
  const colors = [MEDAL_COLORS[1], MEDAL_COLORS[2], MEDAL_COLORS[3]];
  const rest = o.standings.slice(3, 9);
  const w = winners[0];
  return (
    <>
      <Confetti pieces={44} loop silent />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, position: 'relative' }}>
        <span className="up-label" style={{ color: 'var(--yellow)', fontSize: 15 }}>{t('olympia.kickerCeremony')}</span>
        <h1 className="display anim-pop" style={{ fontSize: 60, fontWeight: 800, lineHeight: 1, textAlign: 'center' }}>{t(names.length > 1 ? 'olympia.winnersAre' : 'olympia.winnerIs', { name: names.join(' & ') })}</h1>
        {w && <p className="muted" style={{ fontSize: 18 }}>{t(o.scoring === 'medals' ? 'olympia.winnerLine' : 'olympia.winnerLinePoints', { g: w.gold, s: w.silver, b: w.bronze, p: w.points, n: played })}</p>}
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 18 }}>
        {order.map((i) => {
          const s = top[i];
          const e = entrantOf(room, o, s.id, t);
          const place = Math.min(3, s.rank);
          return (
            <div key={s.id} style={{ width: 210, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, animation: `upSlideUp .7s ease-out ${(0.5 + (2 - i) * 0.6).toFixed(1)}s both` }}>
              <div style={{ position: 'relative' }}>
                <EntrantBadge e={e} size={i === 0 ? 116 : 90} />
                {i === 0 && <Crown size={50} style={{ position: 'absolute', top: -32, left: '50%', marginLeft: -25 }} />}
              </div>
              <span className="display" style={{ fontSize: i === 0 ? 28 : 23, fontWeight: 800, maxWidth: 210, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</span>
              <div style={{ display: 'flex', gap: 5 }}>
                {([[1, s.gold], [2, s.silver], [3, s.bronze]] as const).map(([m, n]) => (
                  <span key={m} style={{ fontSize: 14, fontWeight: 700, color: '#110D24', background: MEDAL_COLORS[m], borderRadius: 999, padding: '2px 9px' }}>{n} {t(`olympia.medalShort.${m}`)}</span>
                ))}
              </div>
              <div style={{ width: '100%', height: heights[i], borderRadius: '18px 18px 0 0', background: colors[place - 1], display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 14, gap: 2 }}>
                <span className="display" style={{ fontSize: 66, fontWeight: 800, lineHeight: 1, color: '#110D24' }}>{s.rank}</span>
                {o.scoring !== 'medals' && <span style={{ fontSize: 16, fontWeight: 700, color: '#110D24' }}>{s.points} {t('olympia.points')}</span>}
              </div>
            </div>
          );
        })}
      </div>
      {rest.length > 0 && (
        <div style={{ position: 'absolute', right: 0, bottom: 0, background: 'rgba(28,23,56,.94)', borderRadius: 16, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 220 }}>
          <span className="up-label" style={{ fontSize: 12 }}>{t('olympia.otherPlaces')}</span>
          {rest.map((s) => (
            <div key={s.id} style={{ display: 'flex', gap: 10, fontSize: 16 }}>
              <span className="muted" style={{ width: 20, fontWeight: 700 }}>{s.rank}</span>
              <b style={{ flex: 1 }}>{entrantOf(room, o, s.id, t).name}</b>
              <span className="muted">{o.scoring === 'medals' ? `${s.gold} · ${s.silver} · ${s.bronze}` : s.points}</span>
            </div>
          ))}
        </div>
      )}
      <button className="up-btn ghost" style={{ position: 'absolute', left: 0, bottom: 0 }} onClick={() => net.send('olympia:close')}>{t('olympia.backToLobby')}</button>
    </>
  );
}

/** TV während eines Spiels: kleine Olympia-Leiste oben rechts */
export function OlympiaGameBadge({ room, t }: { room: RoomSnapshot; t: Translate }) {
  const o = room.olympia;
  const { seconds } = useCountdown(o?.deadline, o?.duration);
  if (!o || o.phase !== 'playing') return null;
  return (
    <div style={{ position: 'absolute', top: 10, right: 14, zIndex: 46, display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(28,23,56,.88)', borderRadius: 999, padding: '6px 14px', fontSize: 15, fontWeight: 700 }}>
      <Dots size={8} />
      <span>{t('olympia.badge', { n: o.current + 1, total: o.disciplines.length })}</span>
      {room.finished && o.deadline > 0 && <span style={{ color: 'var(--yellow)' }}>· {t('olympia.medalsSoon', { s: seconds })}</span>}
    </div>
  );
}

/* ================= Handy ================= */

/** Handy in der Lobby, solange die Übersicht offen ist */
export function OlympiaPhoneSetup({ room, me, games, t }: { room: RoomSnapshot; me: PlayerInfo; games: GameManifest[]; t: Translate }) {
  const s = olympiaSettingsOf(room);
  const isVip = room.vipId === me.id;
  const lang = room.lang;
  const listMode = s.pick === 'vip' || s.pick === 'random';
  const list = s.list.map((id) => games.find((g) => g.id === id)).filter(Boolean) as GameManifest[];
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<OlympiaSettings>) => net.send('olympia:set', { patch });
  const active = room.players.filter((p) => p.connected || p.isBot).length;
  const start = async () => {
    setError(null);
    const res = await net.request('olympia:start');
    if (!res.ok) setError(t(`error.${res.error}`));
  };
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Dots size={9} />
        <h2 className="display" style={{ fontSize: 30, fontWeight: 800 }}>{t('olympia.title')}</h2>
        <p className="muted" style={{ fontSize: 15 }}>{isVip ? t('olympia.subtitle') : t('olympia.vipSetsUp')}</p>
      </div>
      {isVip && (
        <>
          <Pills small label={t('olympia.pick')} value={s.pick} onPick={(v) => set({ pick: v })}
            items={[['vip', t('olympia.pick.vip')], ['random', t('olympia.pick.random')], ['secret', t('olympia.pick.secret')], ['open', t('olympia.pick.open')]]} />
          <Pills small label={t('olympia.scoring')} value={s.scoring} onPick={(v) => set({ scoring: v })}
            items={[['medals', t('olympia.scoring.medals')], ['points', t('olympia.scoring.points')], ['medalpoints', t('olympia.scoring.medalpoints')]]} />
          <Pills small label={t('olympia.teams')} value={s.teams} onPick={(v) => set({ teams: v })}
            items={[[0, t('olympia.teams.0')], [2, t('olympia.teams.n', { n: 2 })], [3, t('olympia.teams.n', { n: 3 })], [4, t('olympia.teams.n', { n: 4 })]]} />
          {s.teams > 0 && (
            <Pills small label={t('olympia.teamMode')} value={s.teamMode} onPick={(v) => set({ teamMode: v })}
              items={[['switch', t('olympia.teamMode.switch')], ['random', t('olympia.teamMode.random')], ['vip', t('olympia.teamMode.vip')], ['free', t('olympia.teamMode.free')]]} />
          )}
          <Pills small label={t('olympia.length')} value={s.short} onPick={(v) => set({ short: v })}
            items={[[true, t('olympia.length.short')], [false, t('olympia.length.normal')]]} />
        </>
      )}
      <div className="up-card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="up-label" style={{ fontSize: 12 }}>{t('olympia.disciplines')}</span>
          {isVip && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button type="button" aria-label={t('olympia.countDown')} disabled={s.count <= OLYMPIA_MIN} onClick={() => set({ count: s.count - 1 })} style={{ ...stepBtn, width: 40, height: 40 }}>−</button>
              <b className="display" style={{ fontSize: 22 }}>{s.count}</b>
              <button type="button" aria-label={t('olympia.countUp')} disabled={s.count >= OLYMPIA_MAX} onClick={() => set({ count: s.count + 1 })} style={{ ...stepBtn, width: 40, height: 40 }}>+</button>
            </span>
          )}
        </div>
        {listMode ? list.map((g, i) => (
          <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="faint" style={{ width: 16, fontWeight: 700 }}>{i + 1}</span>
            <span style={{ width: 10, height: 30, borderRadius: 5, background: g.color, flex: 'none' }} />
            <span style={{ flex: 1, fontWeight: 700, fontSize: 16 }}>{gameName(g, lang)}</span>
            {isVip && <button type="button" aria-label={t('olympia.remove')} onClick={() => net.send('olympia:remove', { gameId: g.id })} style={{ ...iconBtn, width: 40, height: 40 }}>×</button>}
          </div>
        )) : <p className="muted" style={{ fontSize: 15 }}>{t(s.pick === 'open' ? 'olympia.everyonePicksOpen' : 'olympia.everyonePicksSecret')}</p>}
        {isVip && listMode && s.pick === 'random' && <button className="up-btn ghost small" onClick={() => net.send('olympia:reroll')}>{t('olympia.reroll')}</button>}
        {isVip && listMode && list.length < OLYMPIA_MAX && <button className="up-btn ghost small" onClick={() => setAdding((a) => !a)}>+ {t('olympia.addGame')}</button>}
        {adding && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {games.filter((g) => olympiaAllowed(g) && !s.list.includes(g.id)).map((g) => (
              <button key={g.id} type="button" onClick={() => { net.send('olympia:add', { gameId: g.id }); setAdding(false); }}
                style={{ minHeight: 48, display: 'flex', alignItems: 'center', gap: 10, border: 0, borderRadius: 12, background: 'var(--surface-2)', color: '#fff', padding: '6px 12px', textAlign: 'left', opacity: active < g.minPlayers || active > g.maxPlayers ? 0.5 : 1 }}>
                <span style={{ width: 10, height: 28, borderRadius: 5, background: g.color, flex: 'none' }} />
                <span style={{ flex: 1, fontWeight: 700 }}>{gameName(g, lang)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {isVip && (
        <>
          <button className="up-btn big full pink" disabled={active < 2} onClick={start}>{t('olympia.start')}</button>
          {error && <p className="up-error">{error}</p>}
          <button className="up-btn ghost full" onClick={() => net.send('olympia:close')}>{t('olympia.close')}</button>
        </>
      )}
    </section>
  );
}

/** Handy während Olympia (zwischen den Spielen) */
export function OlympiaPhone({ room, me, games, t }: { room: RoomSnapshot; me: PlayerInfo; games: GameManifest[]; t: Translate }) {
  const o = room.olympia!;
  const isVip = room.vipId === me.id;
  if (o.phase === 'teams') return <PhoneTeams room={room} o={o} me={me} t={t} isVip={isVip} />;
  if (o.phase === 'pick') return <PhonePick room={room} o={o} me={me} games={games} t={t} />;
  if (o.phase === 'opening') {
    const g = games.find((x) => x.id === o.disciplines[0]?.gameId);
    const team = o.teams?.find((x) => x.members.includes(me.id));
    return (
      <section style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, textAlign: 'center' }}>
        <Dots size={14} />
        <h2 className="display" style={{ fontSize: 44, fontWeight: 800 }}>{t('olympia.title')}</h2>
        <p style={{ fontSize: 19 }}>{t('olympia.phoneOpening', { n: o.disciplines.length })}</p>
        {team && <span className="up-chip" style={{ fontSize: 17, gap: 8 }}><span style={{ width: 16, height: 16, borderRadius: '50%', background: team.color }} /> {t('olympia.yourTeam', { team: t(`olympia.team.${team.key}`) })}</span>}
        {g && <p className="muted" style={{ fontSize: 16 }}>{t('olympia.firstUp', { game: gameName(g, room.lang) })}</p>}
        {isVip && <button className="up-btn full" onClick={() => net.send('olympia:next')}>{t('olympia.startNow')}</button>}
      </section>
    );
  }
  if (o.phase === 'medals') return <PhoneMedals room={room} o={o} me={me} games={games} t={t} isVip={isVip} />;
  if (o.phase === 'ceremony') return <PhoneCeremony room={room} o={o} me={me} t={t} isVip={isVip} />;
  return null;
}

function myEntrantId(o: OlympiaState, me: PlayerInfo) {
  return o.teams ? o.teams.find((x) => x.members.includes(me.id))?.id : me.id;
}

function PhoneTeams({ room, o, me, t, isVip }: { room: RoomSnapshot; o: OlympiaState; me: PlayerInfo; t: Translate; isVip: boolean }) {
  const teams = o.teams ?? [];
  const mine = teams.find((x) => x.members.includes(me.id));
  const player = (id: string) => room.players.find((p) => p.id === id);
  if (o.teamMode === 'vip') {
    if (!isVip) {
      return (
        <section style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, textAlign: 'center' }}>
          {mine ? <TeamCard team={mine} t={t} /> : null}
          <p className="muted" style={{ fontSize: 17 }}>{t('olympia.vipAssigns')}</p>
        </section>
      );
    }
    return (
      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 className="display" style={{ fontSize: 26, fontWeight: 800 }}>{t('olympia.teamsTitle')}</h2>
        <p className="muted" style={{ fontSize: 15 }}>{t('olympia.vipAssignHint')}</p>
        {room.players.filter((p) => p.connected || p.isBot).map((p) => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Avatar player={p} size={36} flat />
            <span style={{ flex: 1, fontWeight: 700, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
            {teams.map((team) => {
              const on = team.members.includes(p.id);
              return (
                <button key={team.id} type="button" aria-pressed={on} aria-label={t(`olympia.team.${team.key}`)} onClick={() => net.send('olympia:assign', { playerId: p.id, teamId: team.id })}
                  style={{ width: 44, height: 44, borderRadius: '50%', border: on ? '3px solid #fff' : '3px solid transparent', background: team.color, opacity: on ? 1 : 0.45, padding: 0 }} />
              );
            })}
          </div>
        ))}
        <button className="up-btn big full" onClick={() => net.send('olympia:next')}>{t('olympia.teamsDone')}</button>
      </section>
    );
  }
  const canSwitch = o.teamMode === 'switch' || o.teamMode === 'free';
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <PhoneTimer deadline={o.deadline} duration={o.duration} />
      {mine ? <TeamCard team={mine} t={t} /> : <h2 className="display" style={{ fontSize: 28, fontWeight: 800 }}>{t('olympia.chooseTeam')}</h2>}
      {mine && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{mine.members.map((id) => { const p = player(id); return p ? <span key={id} className="up-chip" style={{ gap: 6 }}><Avatar player={p} size={24} flat /> {p.name}</span> : null; })}</div>}
      {canSwitch && (
        <>
          <span className="up-label" style={{ fontSize: 12 }}>{mine ? t('olympia.switchTo') : t('olympia.teams')}</span>
          {teams.filter((x) => x !== mine).map((team) => {
            const blocked = o.teamMode === 'switch' && !!mine && team.members.length > mine.members.length;
            return (
              <button key={team.id} type="button" disabled={blocked} onClick={() => net.send('olympia:team', { teamId: team.id })}
                style={{ minHeight: 60, display: 'flex', alignItems: 'center', gap: 12, borderRadius: 18, border: `3px solid ${team.color}`, background: 'var(--surface)', color: '#fff', padding: '8px 16px', opacity: blocked ? 0.45 : 1 }}>
                <span style={{ width: 22, height: 22, borderRadius: '50%', background: team.color }} />
                <span className="display" style={{ flex: 1, textAlign: 'left', fontSize: 20, fontWeight: 800 }}>{t(`olympia.team.${team.key}`)}</span>
                <span className="muted">{team.members.length}</span>
              </button>
            );
          })}
          {o.teamMode === 'switch' && <p className="faint" style={{ fontSize: 13 }}>{t('olympia.switchRule')}</p>}
        </>
      )}
    </section>
  );
}

function TeamCard({ team, t }: { team: OlympiaTeam; t: Translate }) {
  return (
    <div style={{ background: team.color, color: '#110D24', borderRadius: 24, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 15, fontWeight: 700 }}>{t('olympia.youPlayFor')}</span>
      <span className="display" style={{ fontSize: 36, fontWeight: 800 }}>{t(`olympia.team.${team.key}`)}</span>
    </div>
  );
}

function PhonePick({ room, o, me, games, t }: { room: RoomSnapshot; o: OlympiaState; me: PlayerInfo; games: GameManifest[]; t: Translate }) {
  const open = o.pickMode === 'open';
  const by = tallyPicks(o);
  const mine = o.picks[me.id];
  const pool = o.pickPool.map((id) => games.find((g) => g.id === id)).filter(Boolean) as GameManifest[];
  const chosen = games.find((g) => g.id === mine);
  const sameAsMe = mine ? (by.get(mine) ?? []).filter((id) => id !== me.id).map((id) => room.players.find((p) => p.id === id)?.name).filter(Boolean) : [];
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PhoneTimer deadline={o.deadline} duration={o.duration} />
      <h2 className="display" style={{ fontSize: 28, fontWeight: 800 }}>{t('olympia.pickPhone')}</h2>
      <div role="radiogroup" aria-label={t('olympia.pickPhone')} style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        {pool.map((g) => {
          const on = mine === g.id;
          const n = open ? (by.get(g.id) ?? []).length : 0;
          return (
            <button key={g.id} type="button" role="radio" aria-checked={on} onClick={() => net.send('olympia:pick', { gameId: g.id })} style={{
              minHeight: 58, display: 'flex', alignItems: 'center', gap: 8, borderRadius: 14, padding: '8px 10px', textAlign: 'left',
              background: on ? 'var(--surface-2)' : 'var(--surface)', border: `2px solid ${on ? g.color : 'var(--surface-2)'}`, color: '#fff',
            }}>
              <span style={{ width: 8, alignSelf: 'stretch', borderRadius: 4, background: g.color, flex: 'none' }} />
              <span style={{ flex: 1, fontWeight: 700, fontSize: 14, lineHeight: 1.15 }}>{gameName(g, room.lang)}</span>
              {n > 0 && <span style={{ minWidth: 22, height: 22, borderRadius: 999, background: 'var(--yellow)', color: '#110D24', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{n}</span>}
            </button>
          );
        })}
      </div>
      {chosen && (
        <div style={{ position: 'sticky', bottom: 0, background: 'var(--surface)', border: `2px solid ${chosen.color}`, borderRadius: 16, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <b style={{ fontSize: 17 }}>{t('olympia.yourPick', { game: gameName(chosen, room.lang) })}</b>
          <span className="muted" style={{ fontSize: 13 }}>{open && sameAsMe.length ? t('olympia.samePick', { names: sameAsMe.join(', ') }) : t('olympia.changePick')}</span>
        </div>
      )}
    </section>
  );
}

function PhoneMedals({ room, o, me, games, t, isVip }: { room: RoomSnapshot; o: OlympiaState; me: PlayerInfo; games: GameManifest[]; t: Translate; isVip: boolean }) {
  const d = o.disciplines[o.current];
  const g = games.find((x) => x.id === d?.gameId);
  const id = myEntrantId(o, me);
  const res = d?.results.find((r) => r.id === id);
  const st = o.standings.find((s) => s.id === id);
  const nextIdx = o.disciplines.findIndex((x, i) => i > o.current && x.status === 'next');
  const next = nextIdx >= 0 ? games.find((x) => x.id === o.disciplines[nextIdx].gameId) : undefined;
  const { seconds } = useCountdown(o.deadline, o.duration);
  const gname = g ? gameName(g, room.lang) : '';
  return (
    <section style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
      <span className="up-label" style={{ alignSelf: 'flex-start', color: 'var(--yellow)', fontSize: 12 }}>{t('olympia.kickerDiscipline', { n: o.current + 1, total: o.disciplines.length })}</span>
      {res?.medal ? (
        <div className="anim-pop" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 10 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={{ width: 30, height: 56, background: '#36D6F5', transform: 'skewX(14deg)', borderRadius: '4px 4px 0 0' }} />
            <span style={{ width: 30, height: 56, background: '#E8336F', transform: 'skewX(-14deg)', borderRadius: '4px 4px 0 0' }} />
          </div>
          <span style={{ marginTop: -8 }}><Medal medal={res.medal} size={150} label={t(`olympia.medal.${res.medal}`)} /></span>
        </div>
      ) : (
        <div style={{ width: 120, height: 120, borderRadius: '50%', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 10 }}>
          <span className="display" style={{ fontSize: 48, fontWeight: 800, color: 'var(--muted)' }}>{res ? res.place : '–'}</span>
        </div>
      )}
      <h2 className="display" style={{ fontSize: 32, fontWeight: 800, textAlign: 'center', lineHeight: 1.05 }}>
        {d?.status !== 'done' ? t('olympia.skippedTitle', { game: gname }) : res?.medal ? t(`olympia.medalIn.${res.medal}`, { game: gname }) : res ? t('olympia.placeIn', { n: res.place, game: gname }) : t('olympia.notPlayed')}
      </h2>
      {st && <p className="muted" style={{ fontSize: 17 }}>{t(o.scoring === 'medals' ? 'olympia.overall' : 'olympia.overallPoints', { n: st.rank, p: st.points })}</p>}
      {st && (
        <div className="up-card" style={{ display: 'flex', gap: 18, padding: '12px 18px' }}>
          {([[1, st.gold], [2, st.silver], [3, st.bronze]] as const).map(([m, n]) => (
            <div key={m} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: 60 }}>
              <Medal medal={m} size={30} label={t(`olympia.medal.${m}`)} />
              <b style={{ fontSize: 20 }}>{n}</b>
            </div>
          ))}
        </div>
      )}
      <span className="faint" style={{ fontSize: 14 }}>{next ? t('olympia.nextGame', { game: gameName(next, room.lang), s: seconds }) : t('olympia.ceremonyIn', { s: seconds })}</span>
      {isVip && (
        <div style={{ marginTop: 'auto', alignSelf: 'stretch', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button className="up-btn big full pink" onClick={() => net.send('olympia:next')}>{t(next ? 'olympia.next' : 'olympia.toCeremony')}</button>
          <button className="up-btn ghost full" onClick={() => net.send('olympia:end')}>{t('olympia.end')}</button>
        </div>
      )}
    </section>
  );
}

function PhoneCeremony({ room, o, me, t, isVip }: { room: RoomSnapshot; o: OlympiaState; me: PlayerInfo; t: Translate; isVip: boolean }) {
  const id = myEntrantId(o, me);
  const st = o.standings.find((s) => s.id === id);
  const e = id ? entrantOf(room, o, id, t) : undefined;
  return (
    <section style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' }}>
      <span className="up-label" style={{ color: 'var(--yellow)', fontSize: 12 }}>{t('olympia.kickerCeremony')}</span>
      {st && st.rank <= 3 ? <span className="anim-pop" style={{ marginTop: 20 }}><Medal medal={st.rank} size={140} label={t(`olympia.medal.${st.rank}`)} /></span>
        : <span className="display" style={{ marginTop: 20, fontSize: 80, fontWeight: 800, color: 'var(--muted)' }}>{st?.rank ?? '–'}</span>}
      <h2 className="display" style={{ fontSize: 32, fontWeight: 800 }}>
        {st ? (st.rank === 1 ? t(o.teams ? 'olympia.teamWon' : 'olympia.youWon') : t('olympia.finalPlace', { n: st.rank })) : ''}
      </h2>
      {e?.team && <p className="muted" style={{ fontSize: 16 }}>{t('olympia.yourTeam', { team: e.name })}</p>}
      {st && <p className="muted" style={{ fontSize: 17 }}>{t('olympia.yourMedals', { g: st.gold, s: st.silver, b: st.bronze })}{o.scoring !== 'medals' ? ` · ${st.points} ${t('olympia.points')}` : ''}</p>}
      {isVip ? <button className="up-btn big full" style={{ marginTop: 'auto' }} onClick={() => net.send('olympia:close')}>{t('olympia.backToLobby')}</button>
        : <p className="faint" style={{ marginTop: 'auto' }}>{t('olympia.vipEnds')}</p>}
    </section>
  );
}
