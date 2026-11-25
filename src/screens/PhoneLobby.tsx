/**
 * Handy-Lobby: gewähltes Spiel als Titelbild oben, Spielauswahl mit Titelbildern (Kacheln oder große Bilder),
 * Filter „Nur passende“, Detail-Blatt, Herzen („Hab Lust drauf“), großer QR-Code zum Teilen und Startmoment.
 */

import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import type { GameManifest, PlayerInfo, RoomSnapshot, Translate } from '@up/sdk';
import { net, useNet } from '../net';
import { useT } from '../i18n';
import registry from '../registry';
import { Avatar, Crown, FullscreenButton, Logo, QrCode, useServerNow, vibrate } from '../ui';
import { GameOptionsForm, optionsSummary } from './GameOptions';
import { GameCover, IconClock, IconPerson, InfoChip, fitOf, gameDesc, gameName, gameTags, playersShort, useTagFilter } from './GameLibrary';
import { PhoneVote, PickModeSwitch, VoteOptions, pickModeOf, votesFor } from './PickMode';
import { OlympiaPhoneSetup } from './Olympia';

export function listGames(dev: boolean) {
  return registry.map((g) => g.manifest).filter((m) => !m.hidden || dev);
}

/* ---------------- kleine Bausteine ---------------- */

const IconQr = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M3 3h7v7H3zm2 2v3h3V5zM14 3h7v7h-7zm2 2v3h3V5zM3 14h7v7H3zm2 2v3h3v-3zM14 14h3v3h-3zM18 14h3v3h-3zM14 18h3v3h-3zM18 18h3v3h-3z" />
  </svg>
);
const IconHeart = ({ filled, size = 16 }: { filled: boolean; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}>
    <path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 7.9 3.6 4.5 7 4.5c2.1 0 3.6 1.2 5 3 1.4-1.8 2.9-3 5-3 3.4 0 5.6 3.4 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z" />
  </svg>
);

const HEART_PINK = '#E8336F';

/** Herzen: eigene Auswahl auch auf dem Handy merken (zusätzlich zum UP!-Rechner) */
function useHearts(room: RoomSnapshot, me: PlayerInfo) {
  const hearts = room.hearts ?? {};
  const mine = Object.keys(hearts).filter((g) => hearts[g].includes(me.id));
  const key = mine.join(',');
  // Beim Verbinden: gemerkte Herzen mitbringen
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('up:hearts') ?? '[]');
      if (Array.isArray(saved) && saved.length) net.send('hearts:sync', { list: saved });
    } catch { /* egal */ }
  }, [me.id]);
  // Stand vom Server übernehmen
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!ready) { setReady(true); return; }
    try { localStorage.setItem('up:hearts', JSON.stringify(mine)); } catch { /* egal */ }
  }, [key]);
  return {
    count: (id: string) => hearts[id]?.length ?? 0,
    mine: (id: string) => !!hearts[id]?.includes(me.id),
    myCount: mine.length,
    toggle: (id: string) => net.send('heart', { gameId: id, on: !hearts[id]?.includes(me.id) }),
    clear: () => {
      try { localStorage.setItem('up:hearts', '[]'); } catch { /* egal */ }
      net.send('hearts:clear');
    },
  };
}
type Hearts = ReturnType<typeof useHearts>;

/* ---------------- Lobby ---------------- */

export function PhoneLobby({ onEditAvatar }: { onEditAvatar: () => void }) {
  const s = useNet();
  const room = s.room!;
  const me = s.me!;
  const t = useT(room.lang);
  const isVip = room.vipId === me.id;
  const vip = room.players.find((p) => p.id === room.vipId);
  const [error, setError] = useState<string | null>(null);
  const active = room.players.filter((p) => p.connected || p.isBot).length;
  const all = listGames(room.dev);
  const { tag, setTag, present, shown } = useTagFilter(all);
  const [onlyFit, setOnlyFit] = useState(false);
  const list = onlyFit ? shown.filter((g) => fitOf(g, active) === 'ok') : shown;
  const selected = all.find((g) => g.id === room.selectedGameId);
  const mode = pickModeOf(room);
  const voting = mode === 'vote' && !!room.vote && !room.vote.result;
  const hearts = useHearts(room, me);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [optionsFirst, setOptionsFirst] = useState(false);
  const detail = all.find((g) => g.id === detailId);
  const [qrOpen, setQrOpen] = useState(false);
  const [view, setView] = useState<'grid' | 'list'>(() => {
    try { return localStorage.getItem('up:phoneView') === 'list' ? 'list' : 'grid'; } catch { return 'grid'; }
  });
  const pickView = (v: 'grid' | 'list') => {
    setView(v);
    try { localStorage.setItem('up:phoneView', v); } catch { /* egal */ }
  };
  const bg = voting ? undefined : selected;

  const start = async () => {
    setError(null);
    const res = await net.request('start');
    if (!res.ok) setError(t(`error.${res.error}`));
  };

  return (
    <>
      <PhoneBackdrop game={bg} />
      <header style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Logo size={24} />
        <span style={{ flex: 1 }} />
        <span className="up-chip" style={{ background: 'rgba(28,23,56,.8)' }}>{t('lobby.room')} <b>{room.code}</b></span>
        <button aria-label={t('phone.showQr')} title={t('phone.showQr')} onClick={() => setQrOpen(true)}
          style={{ width: 44, height: 44, flex: 'none', border: 0, borderRadius: 14, background: 'rgba(28,23,56,.8)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <IconQr />
        </button>
        <FullscreenButton enter={t('fullscreen.enter')} exit={t('fullscreen.exit')} size={44} />
      </header>

      {/* Kompakte Profil-Karte */}
      <section style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(28,23,56,.78)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', borderRadius: 20, padding: '10px 12px', boxShadow: `inset 0 0 0 2px ${me.color}` }}>
        <div style={{ position: 'relative', flex: 'none' }}>
          <Avatar player={me} size={48} />
          {isVip && <Crown size={20} style={{ position: 'absolute', top: -11, left: 14 }} />}
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span className="display" style={{ fontSize: 20, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{me.name}</span>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>{isVip ? t('lobby.youAreVip') : vip ? t('lobby.waitForVip', { name: vip.name }) : ''}</span>
        </div>
        <button aria-label={t('lobby.changeAvatar')} onClick={onEditAvatar} style={{ width: 40, height: 40, flex: 'none', border: 0, borderRadius: 12, background: 'var(--surface-2)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
        </button>
      </section>

      {room.olympia && <OlympiaPhoneSetup room={room} me={me} games={all} t={t} />}
      {!room.olympia && (<>
        {isVip && (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="up-label">{t('pick.label')}</span>
              <button onClick={() => net.send('olympia:open')} style={{ border: 0, minHeight: 36, padding: '4px 12px', borderRadius: 999, fontSize: 13, fontWeight: 700, background: 'rgba(28,23,56,.85)', color: 'var(--yellow)', boxShadow: 'inset 0 0 0 2px var(--yellow)' }}>{t('olympia.button')}</button>
            </div>
            <PickModeSwitch mode={mode} t={t} />
            {mode === 'vote' && <VoteOptions room={room} t={t} />}
          </section>
        )}

        {voting && room.vote && <PhoneVote vote={room.vote} games={all} room={room} me={me} t={t} isVip={isVip} />}

        {!voting && selected && (
          <>
            {/* Gewähltes Spiel groß oben */}
            <button onClick={() => setDetailId(selected.id)} aria-label={gameName(selected, room.lang)}
              style={{ border: 0, padding: 0, width: '100%', aspectRatio: '16 / 9', flex: 'none', borderRadius: 20, overflow: 'hidden', position: 'relative', background: 'var(--surface)', boxShadow: `0 0 0 3px ${selected.color}, 0 10px 30px rgba(0,0,0,.5)` }}>
              <GameCover g={selected} lang={room.lang} showName letterSize={150} />
              <span style={{ position: 'absolute', left: 10, top: 10, background: 'rgba(17,13,36,.84)', borderRadius: 999, padding: '5px 11px', fontSize: 12, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--yellow)' }}>
                {mode === 'random' ? t('pick.byRandom') : mode === 'vote' ? t('pick.byVote', { n: votesFor(room.vote, selected.id) }) : t('lobby.selected')}
              </span>
              <span style={{ position: 'absolute', left: 10, bottom: 10 }}><InfoChip g={selected} /></span>
              <HeartBadge n={hearts.count(selected.id)} mine={hearts.mine(selected.id)} style={{ right: 10, bottom: 10 }} />
            </button>

            {isVip ? (
              <>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="up-btn big" style={{ flex: 1 }} disabled={active < selected.minPlayers} onClick={start}>{t('lobby.start')}</button>
                  {selected.options?.length ? (
                    <button className="up-btn ghost big" aria-label={t('lobby.gameSettings')} onClick={() => { setOptionsFirst(true); setDetailId(selected.id); }} style={{ width: 62, padding: 0, flex: 'none' }}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2.2" /><circle cx="10" cy="17" r="2.2" /></svg>
                    </button>
                  ) : null}
                </div>
                <p className="faint" style={{ textAlign: 'center', fontSize: 13, marginTop: -6 }}>
                  {active < selected.minPlayers ? t('lobby.needPlayers', { n: selected.minPlayers - active })
                    : active > selected.maxPlayers ? t('lobby.tooMany', { n: selected.maxPlayers })
                      : selected.options?.length ? optionsSummary(selected, room.settings.gameOptions?.[selected.id], room.lang) : t('lobby.startsOnTv', { game: gameName(selected, room.lang) })}
                </p>
                {mode === 'random' && <button className="up-btn ghost full" onClick={() => net.send('random')}>{t('pick.reroll')}</button>}
                {mode === 'vote' && <button className="up-btn ghost full" onClick={() => net.send('vote:start')}>{room.vote ? t('pick.newVote') : t('pick.startVote')}</button>}
              </>
            ) : (
              <p style={{ fontSize: 14, lineHeight: 1.4, color: '#D9D5EE' }}>{t('phone.heartHint', { name: vip?.name ?? 'VIP' })}</p>
            )}
            {error && <p className="up-error">{error}</p>}
          </>
        )}

        {!voting && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <h2 style={{ flex: 1, fontSize: 22, fontWeight: 700 }}>{t('phone.games')}</h2>
              <div role="radiogroup" aria-label={t('phone.view')} style={{ display: 'flex', background: 'var(--surface)', borderRadius: 12, padding: 3, gap: 2 }}>
                {(['grid', 'list'] as const).map((v) => (
                  <button key={v} role="radio" aria-checked={view === v} aria-label={t(v === 'grid' ? 'phone.viewGrid' : 'phone.viewList')} onClick={() => pickView(v)}
                    style={{ width: 42, height: 38, border: 0, borderRadius: 9, background: view === v ? '#fff' : 'transparent', color: view === v ? '#110D24' : 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {v === 'grid'
                      ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><rect x="3" y="4" width="8" height="6" rx="1.5" /><rect x="13" y="4" width="8" height="6" rx="1.5" /><rect x="3" y="14" width="8" height="6" rx="1.5" /><rect x="13" y="14" width="8" height="6" rx="1.5" /></svg>
                      : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><rect x="3" y="3" width="18" height="8" rx="1.5" /><rect x="3" y="13" width="18" height="8" rx="1.5" /></svg>}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', margin: '0 -18px', padding: '2px 18px 4px', scrollbarWidth: 'none', flex: 'none' }}>
              <button type="button" aria-pressed={onlyFit} onClick={() => setOnlyFit((x) => !x)} style={{
                flex: 'none', border: 0, minHeight: 40, padding: '6px 14px', borderRadius: 999, fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap',
                background: onlyFit ? 'var(--green)' : 'transparent', color: onlyFit ? '#110D24' : '#fff', boxShadow: onlyFit ? 'none' : 'inset 0 0 0 2px var(--line)',
              }}>{onlyFit ? '✓ ' : ''}{t('lobby.onlyFitting', { n: active })}</button>
              {present.length > 1 && ['all', ...present].map((x) => (
                <button key={x} type="button" aria-pressed={tag === x} onClick={() => setTag(x)} style={{
                  flex: 'none', border: 0, minHeight: 40, padding: '6px 14px', borderRadius: 999, fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap',
                  background: tag === x ? '#fff' : 'var(--surface)', color: tag === x ? '#110D24' : 'var(--muted)',
                }}>{t(`tag.${x}`)}</button>
              ))}
            </div>

            {hearts.myCount > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: -6, fontSize: 13, color: 'var(--muted)' }}>
                <span style={{ color: '#FF6FB5', display: 'flex' }}><IconHeart filled /></span>
                <span style={{ flex: 1 }}>{hearts.myCount === 1 ? t('phone.myHeartsOne') : t('phone.myHearts', { n: hearts.myCount })}</span>
                <button onClick={hearts.clear} style={{ border: 0, background: 'transparent', color: 'var(--yellow)', fontSize: 13, fontWeight: 700, minHeight: 36, padding: '0 4px' }}>{t('phone.clearHearts')}</button>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: view === 'grid' ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)', gap: view === 'grid' ? 10 : 18 }}>
              {list.map((g) => (
                <GameTile key={g.id} g={g} big={view === 'list'} sel={g.id === room.selectedGameId} fit={fitOf(g, active)} players={active}
                  lang={room.lang} t={t} hearts={hearts} onOpen={() => setDetailId(g.id)} />
              ))}
            </div>
            {list.length === 0 && <p className="muted" style={{ textAlign: 'center', fontSize: 15 }}>{t('lobby.noFitting')}</p>}
          </>
        )}
      </>)}

      {detail && (
        <GameSheet g={detail} room={room} t={t} players={active} hearts={hearts} isVip={isVip} canChoose={isVip && mode === 'vip' && !room.olympia}
          openOptions={optionsFirst} onClose={() => { setDetailId(null); setOptionsFirst(false); }} />
      )}
      {qrOpen && <QrSheet room={room} t={t} onClose={() => setQrOpen(false)} />}
    </>
  );
}

/** Titelbild des gewählten Spiels unscharf oben im Hintergrund */
function PhoneBackdrop({ game }: { game?: GameManifest }) {
  if (!game?.coverUrl) return null;
  return (
    <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 460, overflow: 'hidden', zIndex: -1, pointerEvents: 'none' }}>
      <img key={game.coverUrl} src={game.coverUrl} alt="" className="anim-fade" style={{ position: 'absolute', left: -50, top: -50, width: 'calc(100% + 100px)', height: 520, objectFit: 'cover', filter: 'blur(26px) saturate(1.3) brightness(.55)' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(17,13,36,.35) 0%, rgba(17,13,36,.7) 60%, var(--bg) 100%)' }} />
    </div>
  );
}

function HeartBadge({ n, mine, style }: { n: number; mine: boolean; style: React.CSSProperties }) {
  if (!n) return null;
  return (
    <span style={{ position: 'absolute', display: 'inline-flex', alignItems: 'center', gap: 4, background: mine ? HEART_PINK : 'rgba(17,13,36,.84)', color: '#fff', borderRadius: 999, padding: '5px 10px', fontSize: 13, fontWeight: 800, ...style }}>
      <IconHeart filled size={13} />{n}
    </span>
  );
}

/** Kachel (zwei Spalten) oder großes Bild mit Beschreibung darunter (eine Spalte) */
function GameTile({ g, big, sel, fit, players, lang, t, hearts, onOpen }: {
  g: GameManifest; big: boolean; sel: boolean; fit: 'ok' | 'few' | 'many'; players: number; lang: string; t: Translate; hearts: Hearts; onOpen: () => void;
}) {
  const dim = fit !== 'ok' && !sel;
  const warn = sel ? '' : fit === 'few' ? (g.minPlayers - players === 1 ? t('phone.missingOne') : t('phone.missing', { n: g.minPlayers - players })) : fit === 'many' ? t('phone.tooMany') : '';
  const pad = big ? 10 : 6;
  const n = hearts.count(g.id);
  const mine = hearts.mine(g.id);
  const chip: React.CSSProperties = { position: 'absolute', borderRadius: 999, padding: big ? '5px 11px' : '3px 8px', fontSize: big ? 13 : 11, fontWeight: 800, whiteSpace: 'nowrap' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
      <div style={{ position: 'relative', aspectRatio: '16 / 9', borderRadius: big ? 18 : 14, overflow: 'hidden', background: 'var(--surface)', boxShadow: sel ? '0 0 0 3px #fff' : '0 4px 14px rgba(0,0,0,.4)' }}>
        <button onClick={onOpen} aria-label={gameName(g, lang)} style={{ position: 'absolute', inset: 0, border: 0, padding: 0, background: 'transparent', color: '#fff' }}>
          <span style={{ position: 'absolute', inset: 0, filter: dim ? 'grayscale(1) brightness(.55)' : undefined }}>
            <GameCover g={g} lang={lang} showName letterSize={big ? 120 : 64} />
          </span>
          <span style={{ position: 'absolute', left: pad, bottom: pad }}><InfoChip g={g} size={big ? 'm' : 's'} /></span>
          {sel && <span style={{ ...chip, left: pad, top: pad, background: '#fff', color: '#110D24' }}>{t('lobby.selected')}</span>}
          {warn && <span style={{ ...chip, left: pad, top: pad, background: 'var(--yellow)', color: '#110D24' }}>{warn}</span>}
        </button>
        <button onClick={() => hearts.toggle(g.id)} aria-pressed={mine} aria-label={t(mine ? 'phone.heartOn' : 'phone.heartOff')}
          style={{ position: 'absolute', right: big ? 6 : 2, top: big ? 6 : 2, border: 0, minWidth: 44, height: 44, padding: 0, background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: big ? 38 : 28, height: big ? 34 : 26, justifyContent: 'center', padding: '0 8px', borderRadius: 999, background: mine ? HEART_PINK : 'rgba(17,13,36,.78)', color: '#fff', fontSize: big ? 14 : 12, fontWeight: 800, opacity: n || big || mine ? 1 : 0.8 }}>
            <IconHeart filled={mine} size={big ? 16 : 13} />{n ? n : null}
          </span>
        </button>
      </div>
      {big && <p style={{ fontSize: 14, lineHeight: 1.4, color: 'var(--muted)', padding: '0 4px' }}>{gameDesc(g, lang)}</p>}
    </div>
  );
}

/** Detail-Blatt: großes Bild, Infos, Beschreibung, Herz, Einstellungen und „Dieses Spiel wählen“ */
function GameSheet({ g, room, t, players, hearts, isVip, canChoose, onClose, openOptions }: {
  g: GameManifest; room: RoomSnapshot; t: Translate; players: number; hearts: Hearts; isVip: boolean; canChoose: boolean; onClose: () => void; openOptions?: boolean;
}) {
  const fit = fitOf(g, players);
  const isSel = g.id === room.selectedGameId;
  const mine = hearts.mine(g.id);
  const n = hearts.count(g.id);
  const fitText = fit === 'few' ? t('lobby.needPlayers', { n: g.minPlayers - players }) : fit === 'many' ? t('lobby.tooManyShort') : t('lobby.fits');
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);
  const [showOptions, setShowOptions] = useState(!!openOptions);
  // Nach unten wischen schließt das Blatt (nur wenn es ganz oben ist)
  const [drag, setDrag] = useState(0);
  const touch = useRef<{ y: number; top: boolean } | null>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const onTouchStart = (e: React.TouchEvent) => { touch.current = { y: e.touches[0].clientY, top: (sheet.current?.scrollTop ?? 0) <= 0 }; };
  const onTouchMove = (e: React.TouchEvent) => {
    const tc = touch.current;
    if (!tc?.top) return;
    const dy = e.touches[0].clientY - tc.y;
    setDrag(dy > 0 ? dy : 0);
  };
  const onTouchEnd = () => {
    if (drag > 90) onClose();
    else setDrag(0);
    touch.current = null;
  };
  const hasOptions = isVip && !!g.options?.length;
  return (
    <div role="dialog" aria-modal="true" aria-label={gameName(g, room.lang)} onClick={onClose} className="anim-fade"
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(10,7,22,.72)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div ref={sheet} onClick={(e) => e.stopPropagation()} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} className="anim-up" style={{
        transform: drag ? `translateY(${drag}px)` : undefined, transition: drag ? 'none' : 'transform .2s ease-out', overscrollBehavior: 'contain',
        width: '100%', maxWidth: 520, maxHeight: '90dvh', overflowY: drag ? 'hidden' : 'auto', background: 'var(--surface)', borderRadius: '28px 28px 0 0',
        padding: '12px 18px max(22px, env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ flex: 1 }} />
          <span style={{ width: 44, height: 5, borderRadius: 3, background: 'var(--line)' }} />
          <span style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={onClose} aria-label={t('settings.close')} style={{ width: 44, height: 44, border: 0, borderRadius: 12, background: 'var(--surface-2)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </span>
        </div>
        <div style={{ position: 'relative', aspectRatio: '16 / 9', borderRadius: 18, overflow: 'hidden', flex: 'none', boxShadow: `0 0 0 3px ${g.color}` }}>
          <GameCover g={g} lang={room.lang} showName letterSize={140} />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 999, background: fit === 'ok' ? 'rgba(75,227,161,.18)' : 'rgba(255,212,71,.18)', color: fit === 'ok' ? 'var(--green)' : 'var(--yellow)', fontSize: 13, fontWeight: 700 }}>
            <IconPerson />{playersShort(g)} · {fitText}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 999, background: 'var(--surface-2)', fontSize: 13, fontWeight: 700 }}><IconClock />{t('lobby.minutes', { n: g.minutes })}</span>
          {gameTags(g).map((x) => <span key={x} style={{ padding: '5px 11px', borderRadius: 999, background: 'var(--surface-2)', color: 'var(--muted)', fontSize: 13, fontWeight: 700 }}>{t(`tag.${x}`)}</span>)}
        </div>
        <p style={{ fontSize: 16, lineHeight: 1.45, color: '#D9D5EE' }}>{gameDesc(g, room.lang)}</p>
        <button onClick={() => hearts.toggle(g.id)} aria-pressed={mine} style={{
          border: 0, minHeight: 52, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 16, fontWeight: 700,
          background: mine ? HEART_PINK : 'transparent', color: '#fff', boxShadow: `inset 0 0 0 2px ${mine ? HEART_PINK : '#FF6FB5'}`,
        }}>
          <IconHeart filled={mine} size={18} />{t(mine ? 'phone.heartOn' : 'phone.heartOff')}{n ? ` · ${n}` : ''}
        </button>
        {hasOptions && showOptions && (
          <div className="up-card anim-up" style={{ padding: '14px 16px', background: 'var(--surface-2)' }}>
            <p style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>{t('lobby.gameSettings')}</p>
            <GameOptionsForm game={g} values={room.settings.gameOptions?.[g.id]} lang={room.lang} compact />
          </div>
        )}
        {(canChoose || hasOptions) && (
          <div style={{ display: 'flex', gap: 10 }}>
            {canChoose && (
              <button className="up-btn big" style={{ flex: 1 }} disabled={isSel} onClick={() => { net.send('select', { gameId: g.id }); vibrate(20); onClose(); }}>
                {isSel ? `✓ ${t('phone.chosen')}` : t('phone.choose')}
              </button>
            )}
            {hasOptions && (
              <button className={`up-btn big${showOptions ? '' : ' ghost'}`} aria-pressed={showOptions} aria-label={t('lobby.gameSettings')} title={t('lobby.gameSettings')}
                onClick={() => setShowOptions((x) => !x)} style={canChoose ? { width: 62, padding: 0, flex: 'none' } : { flex: 1 }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2.2" /><circle cx="10" cy="17" r="2.2" /></svg>
                {!canChoose && <span style={{ marginLeft: 8 }}>{t('lobby.gameSettings')}</span>}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Großer QR-Code der Lobby auf dem Handy – zum Zeigen oder Teilen */
function QrSheet({ room, t, onClose }: { room: RoomSnapshot; t: Translate; onClose: () => void }) {
  const url = `${room.joinUrl}/?r=${room.code}`;
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== 'undefined' && !!navigator.share;
  const share = async () => {
    try {
      if (canShare) await navigator.share({ title: 'UP!', text: t('phone.shareText', { code: room.code }), url });
      else { await navigator.clipboard.writeText(url); setCopied(true); }
    } catch { /* abgebrochen */ }
  };
  return (
    <div role="dialog" aria-modal="true" aria-label={t('join.title')} onClick={onClose} className="anim-fade"
      style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(10,7,22,.94)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, padding: 24 }}>
      <h2 className="display" style={{ fontSize: 30, fontWeight: 800 }}>{t('join.title')}</h2>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 24, padding: 18, width: 'min(78vw, 340px)', aspectRatio: '1' }} className="up-qr-fill anim-pop">
        <QrCode text={url} size={280} bare />
      </div>
      <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--muted)', textAlign: 'center', wordBreak: 'break-all' }}>{room.joinUrl.replace(/^https?:\/\//, '')}</span>
      <div aria-label={`${t('join.code')} ${room.code}`} style={{ display: 'flex', gap: 7 }}>
        {room.code.split('').map((ch, i) => (
          <span key={i} className="display" style={{ width: 44, height: 52, borderRadius: 12, background: 'var(--yellow)', color: '#110D24', fontSize: 30, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 0 var(--yellow-d)' }}>{ch}</span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, width: '100%', maxWidth: 340 }} onClick={(e) => e.stopPropagation()}>
        <button className="up-btn ghost full" onClick={share}>{copied ? `✓ ${t('phone.copied')}` : t(canShare ? 'phone.share' : 'phone.copy')}</button>
        <button className="up-btn full" onClick={onClose}>{t('settings.close')}</button>
      </div>
    </div>
  );
}

/* ---------------- Startmoment ---------------- */

export function PhoneIntro({ room, me, t }: { room: RoomSnapshot; me: PlayerInfo; t: Translate }) {
  const intro = room.intro!;
  const now = useServerNow(100);
  const left = Math.max(1, Math.ceil((intro.until - now) / 1000));
  const game = listGames(true).find((g) => g.id === intro.gameId);
  useEffect(() => { vibrate([40, 60, 40]); }, [intro.at]);
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, textAlign: 'center' }}>
      {game?.coverUrl && (
        <div aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: -1, overflow: 'hidden' }}>
          <img src={game.coverUrl} alt="" style={{ position: 'absolute', inset: -60, width: 'calc(100% + 120px)', height: 'calc(100% + 120px)', objectFit: 'cover', filter: 'blur(28px) brightness(.5)' }} />
        </div>
      )}
      {game && (
        <div className="up-intro-zoom" style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', borderRadius: 20, overflow: 'hidden', boxShadow: `0 0 0 3px ${game.color}, 0 16px 40px rgba(0,0,0,.6)` }}>
          <GameCover g={game} lang={room.lang} showName letterSize={140} />
        </div>
      )}
      <p className="display" style={{ fontSize: 34, fontWeight: 800, textShadow: '0 4px 20px rgba(0,0,0,.6)' }}>{t('intro.title')}</p>
      <span key={left} className="display anim-pop" style={{ width: 110, height: 110, borderRadius: '50%', background: 'var(--yellow)', color: '#110D24', fontSize: 64, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 0 var(--yellow-d), 0 0 0 8px rgba(255,212,71,.25)' }}>{left}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 17, color: '#D9D5EE' }}><Avatar player={me} size={36} /> {t('intro.lookAtTv')}</span>
    </div>
  );
}

