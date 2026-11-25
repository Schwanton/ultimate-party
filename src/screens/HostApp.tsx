import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type React from 'react';
import type { GameManifest, Lang, PlayerInfo, Translate } from '@up/sdk';
import { net, useNet, loadSession, saveSession } from '../net';
import { guessLang, useT } from '../i18n';
import { clientGame } from '../registry';
import { Avatar, Crown, FullscreenButton, useKeepAwake, Logo, QrCode, Stage, isLight, sfx, shade, toggleFullscreen, useServerNow } from '../ui';
import { HostSettings } from './HostSettings';
import { GameOptionsForm, optionsSummary } from './GameOptions';
import { UpdateBanner } from './Update';
import { GameCover, GameLibrary, fitOf, gameDesc, gameName, gameTags, playersLabel } from './GameLibrary';
import { HostVoteBoard, PickModeSwitch, PickedBadge, VoteOptions, pickModeOf, useRoll } from './PickMode';
import { OlympiaGameBadge, OlympiaHost, OlympiaSetup, olympiaRunning } from './Olympia';
import { HostPause, PauseIcon, PlayIcon } from './Pause';

async function connectHost() {
  const saved = loadSession('host');
  if (saved) {
    const res = await net.request('host:resume', saved);
    if (res.ok) return announce(res.code);
  }
  const res = await net.request('host:create', { lang: guessLang() });
  if (res.ok) {
    saveSession('host', { code: res.code, token: res.token });
    announce(res.code);
  }
}

/** Im Entwicklermodus teilt der TV dem umgebenden Fenster den Raumcode mit. */
function announce(code: string) {
  if (window.parent !== window) window.parent.postMessage({ type: 'up:room', code }, location.origin);
}

export function HostApp() {
  // TV und Laptop sollen nicht einschlafen, solange UP! offen ist
  useKeepAwake();
  const s = useNet();
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => {
    net.onOpen = () => void connectHost();
    net.start();
    sfx.enableOnThisDevice();
  }, []);
  useHostSounds();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSettingsOpen((o) => !o);
      // F = Vollbild an/aus (nicht beim Tippen in ein Feld)
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
      if ((e.key === 'f' || e.key === 'F') && !typing && !e.metaKey && !e.ctrlKey && !e.altKey && !e.repeat) toggleFullscreen();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const room = s.room;
  const lang = room?.lang ?? guessLang();
  const t = useT(lang, room?.phase === 'game' ? room.gameId : null);

  if (!room || !s.host) {
    return (
      <Stage>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 24 }}>
          <Logo size={72} />
          <p className="muted" style={{ fontSize: 22 }}>{t('status.connecting')}</p>
        </div>
      </Stage>
    );
  }

  const player = (id: string) => room.players.find((p) => p.id === id);

  if (room.phase === 'game' && room.gameId) {
    const game = clientGame(room.gameId);
    const Host = game?.client.Host;
    return (
      <Stage>
        {s.status !== 'open' && <ConnectionBanner text={t('status.reconnecting')} />}
        {Host && s.host.view ? <Host view={s.host.view} room={room} t={t} player={player} setSecret={async (id: string, value: string) => !!(await net.request('secret', { gameId: room.gameId, id, value })).ok} /> : <div className="muted">…</div>}
        <OlympiaGameBadge room={room} t={t} />
        <HostPause room={room} t={t} />
        <GameMenu finished={room.finished && !olympiaRunning(room)} vip={room.vipId ? player(room.vipId) : undefined} />
        <CornerJoin code={room.code} url={`${room.joinUrl}/?r=${room.code}`} />
      </Stage>
    );
  }

  if (olympiaRunning(room)) {
    return (
      <Stage>
        {s.status !== 'open' && <ConnectionBanner text={t('status.reconnecting')} />}
        <OlympiaHost room={room} games={s.host.games.filter((g) => !g.hidden || room.dev)} t={t} />
        <CornerJoin code={room.code} url={`${room.joinUrl}/?r=${room.code}`} />
      </Stage>
    );
  }

  if (room.intro) {
    const games = s.host.games;
    return (
      <Stage>
        <StartMoment game={games.find((g) => g.id === room.intro!.gameId)} until={room.intro.until} lang={room.lang} t={t}
          players={room.players.filter((p) => p.connected || p.isBot)} />
      </Stage>
    );
  }

  return (
    <Stage>
      {s.status !== 'open' && <ConnectionBanner text={t('status.reconnecting')} />}
      <HostLobby onSettings={() => setSettingsOpen(true)} />
      {settingsOpen && <HostSettings onClose={() => setSettingsOpen(false)} />}
    </Stage>
  );
}

/** Sounds und Musik auf dem TV: Lobby-Musik, Beitritts-Klang, Übergänge zwischen Bildschirmen. */
function useHostSounds() {
  const s = useNet();
  const room = s.room;
  const inLobby = room?.phase === 'lobby';
  const game = room?.phase === 'game' ? clientGame(room.gameId) : undefined;
  sfx.auto = game?.manifest.autoSounds !== false;
  const intro = !!room?.intro;
  useEffect(() => {
    if (inLobby && !intro) sfx.startMusic();
    else sfx.stopMusic();
  }, [inLobby, intro]);
  // Startmoment: Tick pro Sekunde des Countdowns
  const introAt = room?.intro?.at;
  useEffect(() => {
    if (!introAt) return;
    sfx.play('whoosh');
    const ids = [1000, 2000].map((ms) => setTimeout(() => sfx.play('tick'), ms));
    return () => ids.forEach(clearTimeout);
  }, [introAt]);
  const count = room?.players.length ?? 0;
  const lastCount = useRef(count);
  useEffect(() => {
    if (inLobby && count > lastCount.current) sfx.play('join');
    lastCount.current = count;
  }, [count, inLobby]);
  const screen = room?.phase === 'game' ? `${room.gameId}:${s.host?.view?.screen ?? ''}` : 'lobby';
  const lastScreen = useRef(screen);
  useEffect(() => {
    if (screen !== lastScreen.current) sfx.play('whoosh');
    lastScreen.current = screen;
  }, [screen]);
}

/** Knopf „Ton an“, solange der Browser noch keinen Ton erlaubt hat */
function SoundButton({ label }: { label: string }) {
  const unlocked = useSyncExternalStore(sfx.subscribe, () => sfx.unlocked);
  if (unlocked) return null;
  return (
    <button className="up-btn small" onClick={() => { sfx.unlock(); setTimeout(() => sfx.play('join'), 150); }} style={{ animation: 'upTick 1.4s ease-in-out infinite' }}>
      {label}
    </button>
  );
}

/** Raumcode + QR-Code klein unten links (im Randbereich), damit Nachzügler jederzeit beitreten können */
function CornerJoin({ code, url }: { code: string; url: string }) {
  return (
    <div aria-label={code} style={{ position: 'absolute', left: 6, bottom: 6, width: 72, zIndex: 44, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, opacity: 0.92 }}>
      <span className="display" style={{ fontSize: 17, fontWeight: 800, letterSpacing: 1.5, color: 'var(--yellow)' }}>{code}</span>
      <div style={{ width: 72, height: 72, background: '#fff', borderRadius: 9, padding: 4 }}>
        <QrCode text={url} size={64} bare />
      </div>
    </div>
  );
}

function ConnectionBanner({ text }: { text: string }) {
  return (
    <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 60 }} className="up-chip">
      <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--orange)', animation: 'upPulse 1s infinite' }} /> {text}
    </div>
  );
}

/** Kleines Menü während des Spiels: zurück zur Lobby, nach Spielende „Nochmal“. */
function GameMenu({ finished, vip }: { finished: boolean; vip?: PlayerInfo }) {
  const s = useNet();
  const t = useT(s.room!.lang);
  const [open, setOpen] = useState<false | 'menu' | 'end'>(false);
  if (finished) {
    return (
      <div className="anim-fade" style={{ position: 'absolute', top: 30, right: 56, zIndex: 45, display: 'flex', gap: 12, alignItems: 'center', background: 'var(--surface)', padding: '10px 12px 10px 20px', borderRadius: 22 }}>
        <span className="muted" style={{ fontSize: 16 }}>{vip ? t('game.vipDecides', { name: vip.name }) : ''}</span>
        <button className="up-btn small" onClick={() => net.request('start')}>{t('game.again')}</button>
        <button className="up-btn ghost small" style={{ whiteSpace: 'nowrap' }} onClick={() => net.send('lobby')}>{t('game.otherGame')}</button>
      </div>
    );
  }
  const paused = !!s.room!.pause;
  return (
    <div style={{ position: 'absolute', right: 14, bottom: 12, zIndex: 85, display: 'flex', gap: 8, alignItems: 'center' }}>
      {open === 'menu' && (
        <>
          <button className="up-btn small" style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => { setOpen(false); net.send('pause', { paused: !paused }); }}>
            {paused ? <PlayIcon size={18} /> : <PauseIcon size={18} />} {paused ? t('game.resume') : t('game.pause')}
          </button>
          <button className="up-btn ghost small" onClick={() => setOpen('end')}>{t('game.end')}</button>
          <button className="up-btn ghost small" onClick={() => setOpen(false)}>{t('common.cancel')}</button>
        </>
      )}
      {open === 'end' && (
        <>
          <span className="muted" style={{ fontSize: 14 }}>{t('game.confirmLobby')}</span>
          <button className="up-btn small" onClick={() => { setOpen(false); net.send('lobby'); }}>{t('common.yes')}</button>
          <button className="up-btn ghost small" onClick={() => setOpen(false)}>{t('common.no')}</button>
        </>
      )}
      {!open && <FullscreenButton enter={t('fullscreen.enter')} exit={t('fullscreen.exit')} size={36} style={{ color: 'var(--faint)', opacity: 0.6 }} />}
      {!open && (
        <button aria-label={t('game.menu')} title={t('game.menu')} onClick={() => setOpen('menu')}
          style={{ width: 36, height: 36, borderRadius: 12, border: 0, background: 'var(--surface)', color: 'var(--faint)', opacity: 0.6, fontSize: 18 }}>⋯</button>
      )}
    </div>
  );
}

/* ---------------- Lobby auf dem TV ---------------- */

function HostLobby({ onSettings }: { onSettings: () => void }) {
  const s = useNet();
  const room = s.room!;
  const host = s.host!;
  const t = useT(room.lang);
  const players = room.players;
  const active = players.filter((p) => p.connected || p.isBot);
  const vip = players.find((p) => p.id === room.vipId);
  const games = host.games.filter((g) => !g.hidden || room.dev);
  const selected = games.find((g) => g.id === room.selectedGameId);
  // Zufall: kurz rattert eine Walze durch die Spiele
  const rolling = useRoll(room, games);
  const joinUrl = `${room.joinUrl}/?r=${room.code}`;
  const lastResult = host.results.at(-1);
  const lastWinner = lastResult?.ranking[0] ? players.find((p) => p.id === lastResult.ranking[0].playerId) : undefined;
  const canStart = !!selected && active.length >= selected.minPlayers;
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [qrBig, setQrBig] = useState(false);

  const setLang = (lang: Lang) => {
    try { localStorage.setItem('up:lang', lang); } catch { /* egal */ }
    net.send('settings', { patch: { lang } });
  };

  return (
    <>
      <LobbyBackdrop game={room.olympia ? undefined : (rolling ?? selected)} />
      <header style={{ height: 56, display: 'flex', alignItems: 'center', gap: 12 }}>
        <Logo />
        <span style={{ flex: 1 }} />
        {!room.olympia && (<>
          <span className="up-label" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{t('pick.label')}</span>
          <PickModeSwitch mode={pickModeOf(room)} t={t} big />
          {pickModeOf(room) === 'random' && <button className="up-btn ghost small" style={{ whiteSpace: 'nowrap' }} onClick={() => net.send('random')}>{t('pick.reroll')}</button>}
          {pickModeOf(room) === 'vote' && room.vote?.result && <button className="up-btn ghost small" style={{ whiteSpace: 'nowrap' }} onClick={() => net.send('vote:start')}>{t('pick.newVote')}</button>}
          {pickModeOf(room) === 'vote' && !room.vote && <button className="up-btn ghost small" style={{ whiteSpace: 'nowrap' }} onClick={() => net.send('vote:start')}>{t('pick.startVote')}</button>}
          <button className="up-btn small" style={{ whiteSpace: 'nowrap', background: 'var(--surface)', color: 'var(--yellow)', boxShadow: '0 0 0 2px var(--yellow)' }} onClick={() => net.send('olympia:open')}>{t('olympia.button')}</button>
          <span style={{ width: 8 }} />
        </>)}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', background: 'var(--surface)', borderRadius: 999, padding: 4 }}>
            {(['de', 'en'] as Lang[]).map((l) => (
              <button key={l} aria-pressed={room.lang === l} onClick={() => setLang(l)}
                style={{ border: 0, minHeight: 44, padding: '8px 16px', borderRadius: 999, fontWeight: 700, fontSize: 15, background: room.lang === l ? '#fff' : 'transparent', color: room.lang === l ? '#110D24' : 'var(--muted)' }}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          <FullscreenButton enter={t('fullscreen.enter')} exit={t('fullscreen.exit')} />
          <button aria-label={t('settings.title')} title={t('settings.title')} onClick={onSettings}
            style={{ width: 52, height: 52, border: 0, borderRadius: 16, background: 'var(--surface)', color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
          </button>
        </div>
      </header>

      {host.notice && <div className="up-error" style={{ fontSize: 18 }}>{t(`error.${host.notice}`)}</div>}
      <UpdateBanner />
      {optionsOpen && selected && (
        <div role="dialog" aria-modal="true" aria-label={t('lobby.gameSettings')} onClick={() => setOptionsOpen(false)}
          style={{ position: 'absolute', inset: 0, zIndex: 70, background: 'rgba(10,7,22,.82)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="up-card anim-pop" onClick={(e) => e.stopPropagation()} style={{ width: 720, maxHeight: 640, overflow: 'auto', padding: 32, display: 'flex', flexDirection: 'column', gap: 22, borderRadius: 28, borderTop: `8px solid ${selected.color}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: 30 }}>{selected.name[room.lang] ?? selected.name.en}</h2>
              <button className="up-btn small" onClick={() => setOptionsOpen(false)}>{t('settings.close')}</button>
            </div>
            <GameOptionsForm game={selected} values={room.settings.gameOptions?.[selected.id]} lang={room.lang} />
          </div>
        </div>
      )}

      {libraryOpen && (
        <GameLibrary games={games} selectedId={room.selectedGameId} players={active.length} lang={room.lang} t={t}
          onPick={(id) => { net.send('select', { gameId: id }); setLibraryOpen(false); }} onClose={() => setLibraryOpen(false)} />
      )}

      <main style={{ flex: 1, minHeight: 0, display: 'flex', gap: 24 }}>
        <div style={{ width: 376, flex: 'none', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Beitreten: Zeigt man auf den QR-Code (oder tippt ihn an), wird er so breit wie die Spalte */}
          <section className="up-card" onMouseEnter={() => setQrBig(true)} onMouseLeave={() => setQrBig(false)} onClick={() => setQrBig((x) => !x)}
            style={{ ...glass, padding: '18px 20px', display: 'flex', flexWrap: 'wrap', gap: qrBig ? 12 : 16, alignItems: 'center', borderRadius: 24, cursor: 'zoom-in' }}>
            <div className="up-qr-fill" style={{ width: qrBig ? 336 : 112, height: qrBig ? 336 : 112, flex: 'none', background: '#fff', borderRadius: qrBig ? 20 : 14, padding: qrBig ? 16 : 7, transition: 'width .3s ease, height .3s ease, padding .3s ease' }}>
              <QrCode text={joinUrl} size={112} bare />
            </div>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: qrBig ? 'row' : 'column', alignItems: qrBig ? 'center' : 'flex-start', justifyContent: 'space-between', gap: 6 }}>
              {!qrBig && <h2 style={{ fontSize: 24, fontWeight: 800 }}>{t('join.title')}</h2>}
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--muted)', wordBreak: 'break-all' }}>{room.joinUrl.replace(/^https?:\/\//, '')}</span>
              <div aria-label={`${t('join.code')} ${room.code}`} style={{ display: 'flex', gap: 6, marginTop: qrBig ? 0 : 4, flex: 'none' }}>
                {room.code.split('').map((ch, i) => (
                  <span key={i} className="display" style={{ width: 38, height: 46, borderRadius: 10, background: 'var(--yellow)', color: '#110D24', fontSize: 26, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 0 var(--yellow-d)' }}>{ch}</span>
                ))}
              </div>
            </div>
          </section>

          <section className="up-card" style={{ ...glass, flex: 1, minHeight: 0, overflow: 'hidden', padding: qrBig ? '14px 20px' : '18px 20px', display: 'flex', flexDirection: 'column', gap: qrBig ? 8 : 14, borderRadius: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, flex: 1 }}>{t('lobby.players')}</h2>
              <SoundButton label={t('sound.enable')} />
              {room.dev && (
                <>
                  <button className="up-btn ghost small" style={{ whiteSpace: 'nowrap', padding: '6px 10px' }} onClick={() => net.send('bots:add', { count: 1 })}>{t('lobby.addBots')}</button>
                  {players.some((p) => p.isBot) && <button className="up-btn ghost small" style={{ whiteSpace: 'nowrap', padding: '6px 10px' }} onClick={() => net.send('bots:remove')}>{t('lobby.removeBots')}</button>}
                </>
              )}
              <span style={{ background: 'var(--surface-2)', borderRadius: 999, padding: '5px 13px', fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap' }}>
                {active.length}{selected ? ` / ${selected.maxPlayers}` : ''}
              </span>
            </div>
            <PlayerGrid players={players} vipId={room.vipId} max={selected?.maxPlayers} freeLabel={t('lobby.free')} compact={qrBig} />
            {!qrBig && <p className="muted" style={{ marginTop: 'auto', fontSize: 15 }}>
              {lastWinner ? t('lobby.lastWinner', { name: lastWinner.name }) + ' · ' : ''}
              {vip ? t('lobby.vipPicks', { name: vip.name }) : t('lobby.waitingForPlayers')}
            </p>}
          </section>
        </div>

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {room.olympia ? <OlympiaSetup room={room} games={games} t={t} /> : (<>
          {pickModeOf(room) === 'vote' && <VoteOptions room={room} t={t} />}
          {pickModeOf(room) === 'vote' && room.vote && !room.vote.result ? (
            <HostVoteBoard vote={room.vote} games={games} room={room} t={t} player={(id) => room.players.find((p) => p.id === id)} />
          ) : (
            <SelectedGame game={rolling ?? selected} rolling={!!rolling} players={active.length} canStart={canStart && !rolling} gameCount={games.length} lang={room.lang} t={t}
              pickedBadge={pickModeOf(room) === 'vote' ? <PickedBadge room={room} t={t} vipName={vip?.name} /> : null}
              summary={selected?.options?.length ? optionsSummary(selected, room.settings.gameOptions?.[selected.id], room.lang) : ''}
              onLibrary={() => setLibraryOpen(true)} onOptions={() => setOptionsOpen(true)} />
          )}
          </>)}
        </div>
      </main>
    </>
  );
}

/** Halbdurchsichtige Karten über dem Bild-Hintergrund der Lobby */
const glass: React.CSSProperties = { background: 'rgba(28,23,56,.78)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' };

/**
 * Hintergrund der Lobby: Titelbild des gewählten Spiels, unscharf und abgedunkelt.
 * Beim Spielwechsel blendet das neue Bild weich über das alte.
 */
function LobbyBackdrop({ game }: { game?: GameManifest }) {
  const url = game?.coverUrl ?? null;
  const color = game?.color ?? null;
  const [layers, setLayers] = useState<{ key: number; url: string | null; color: string | null }[]>([]);
  const next = useRef(0);
  useEffect(() => {
    if (!url && !color) { setLayers([]); return; }
    const key = ++next.current;
    setLayers((ls) => [...ls.slice(-1), { key, url, color }]);
    const id = setTimeout(() => setLayers((ls) => ls.filter((l) => l.key >= key)), 900);
    return () => clearTimeout(id);
  }, [url, color]);
  return (
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: -1, overflow: 'hidden', pointerEvents: 'none' }}>
      {layers.map((l) => (
        <div key={l.key} style={{ position: 'absolute', inset: 0, animation: 'upFade .8s ease-out both' }}>
          {l.url
            ? <img src={l.url} alt="" style={{ position: 'absolute', inset: -60, width: 'calc(100% + 120px)', height: 'calc(100% + 120px)', objectFit: 'cover', filter: 'blur(30px) saturate(1.25) brightness(.55)' }} />
            : <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 70% 40%, ${shade(l.color ?? '#110D24', 0.45)}, var(--bg) 75%)` }} />}
        </div>
      ))}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(17,13,36,.55), rgba(17,13,36,.78))' }} />
    </div>
  );
}

/** Startmoment: Das Titelbild füllt den TV, dazu ein Countdown, dann beginnt das Spiel. */
function StartMoment({ game, until, players, lang, t }: { game?: GameManifest; until: number; players: PlayerInfo[]; lang: Lang; t: Translate }) {
  const now = useServerNow(100);
  const left = Math.max(1, Math.ceil((until - now) / 1000));
  return (
    <div role="status" aria-label={t('intro.title')} style={{ position: 'absolute', inset: 0, zIndex: 80, background: '#000', overflow: 'hidden' }}>
      {game && <div className="up-intro-zoom" style={{ position: 'absolute', inset: 0 }}><GameCover g={game} lang={lang} zoom showName letterSize={240} /></div>}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0) 45%, rgba(10,7,22,.92) 100%)' }} />
      <div className="up-intro-rise" style={{ position: 'absolute', left: 56, right: 56, bottom: 40, display: 'flex', alignItems: 'flex-end', gap: 32 }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <span className="display" style={{ fontSize: 60, fontWeight: 800, lineHeight: 1, textShadow: '0 4px 24px rgba(0,0,0,.6)' }}>{t('intro.title')}</span>
          <span style={{ fontSize: 20, fontWeight: 500, color: '#D9D5EE' }}>{t('intro.lookAtPhones')}</span>
          <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap', maxHeight: 52, overflow: 'hidden' }}>
            {players.slice(0, 18).map((p) => <Avatar key={p.id} player={p} size={46} />)}
          </div>
        </div>
        <span key={left} className="display anim-pop" style={{ width: 120, height: 120, flex: 'none', borderRadius: '50%', background: 'var(--yellow)', color: '#110D24', fontSize: 72, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 0 var(--yellow-d), 0 0 0 8px rgba(255,212,71,.25)' }}>{left}</span>
      </div>
    </div>
  );
}

const IconPlayers = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.8c1.7.8 2.7 2.6 3 5.2" /></svg>
);
const IconClock = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
);
const IconSliders = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2.2" /><circle cx="10" cy="17" r="2.2" /></svg>
);

const badge = (bg: string, color: string): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, background: bg, color, fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap' });

/** Rechts in der Lobby: das gewählte Spiel groß mit Titelbild, Infos, Einstellungen und Start */
function SelectedGame({ game, rolling, players, canStart, gameCount, lang, t, summary, pickedBadge, onLibrary, onOptions }: {
  game?: GameManifest; rolling?: boolean; players: number; canStart: boolean; gameCount: number; lang: Lang; t: Translate; summary: string; pickedBadge: React.ReactNode; onLibrary: () => void; onOptions: () => void;
}) {
  if (!game) {
    return (
      <section style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, borderRadius: 28, border: '3px dashed var(--line)' }}>
        <span className="muted display" style={{ fontSize: 30, fontWeight: 700 }}>{t('lobby.noGame')}</span>
        <button className="up-btn big" onClick={onLibrary}>{t('lobby.pickGame')} · {t('lobby.gamesCount', { n: gameCount })}</button>
      </section>
    );
  }
  const fit = fitOf(game, players);
  const fitText = fit === 'few' ? t('lobby.needPlayers', { n: game.minPlayers - players }) : fit === 'many' ? t('lobby.tooManyShort') : t('lobby.fits');
  return (
    <section style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Titelbild ganz und groß (16:9), passt sich der freien Höhe an */}
      <div style={{ flex: 1, minHeight: 160, containerType: 'size', display: 'flex', justifyContent: 'center' } as React.CSSProperties}>
        <button key={rolling ? 'roll' : game.id} className={rolling ? undefined : 'anim-up'} onClick={onLibrary} aria-label={`${gameName(game, lang)} – ${t('lobby.changeGame')}`}
          style={{ border: 0, padding: 0, width: 'min(100cqw, 100cqh * 16 / 9)', aspectRatio: '16 / 9', alignSelf: 'flex-start', borderRadius: 24, overflow: 'hidden', position: 'relative', background: 'var(--surface)', boxShadow: `0 0 0 3px ${game.color}, 0 12px 40px rgba(0,0,0,.55)` }}>
          <GameCover g={game} lang={lang} zoom={!rolling} showName letterSize={240} />
          {!rolling && pickedBadge}
          {rolling && <span className="display" style={{ position: 'absolute', left: 18, top: 18, background: 'var(--yellow)', color: '#110D24', borderRadius: 999, padding: '7px 16px', fontSize: 18, fontWeight: 800 }}>{t('pick.rolling')}</span>}
        </button>
      </div>
      {/* Infos und Start als schmale Leiste darunter */}
      <div style={{ flex: 'none', display: 'flex', gap: 20, alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span style={fit === 'ok' ? badge('rgba(75,227,161,.18)', 'var(--green)') : badge('rgba(255,212,71,.18)', 'var(--yellow)')}>
              <IconPlayers /> {playersLabel(game, t)} · {fitText}
            </span>
            <span style={badge('rgba(38,32,72,.85)', 'var(--text)')}><IconClock /> {t('lobby.minutes', { n: game.minutes })}</span>
            {gameTags(game).map((x) => <span key={x} style={badge('rgba(38,32,72,.85)', 'var(--muted)')}>{t(`tag.${x}`)}</span>)}
          </div>
          <p style={{ fontSize: 17, lineHeight: 1.38, color: '#D9D5EE', display: '-webkit-box', WebkitLineClamp: summary ? 1 : 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{gameDesc(game, lang)}</p>
          {summary && <p className="faint" style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{summary}</p>}
        </div>
        <div style={{ width: 236, flex: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button className="up-btn big" disabled={!canStart} onClick={() => net.request('start')}>{t('lobby.start')}</button>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="up-btn ghost small" style={{ flex: 1, whiteSpace: 'nowrap' }} onClick={onLibrary}>{t('lobby.changeGame')}</button>
            {game.options?.length ? (
              <button className="up-btn ghost small" aria-label={t('lobby.gameSettings')} title={t('lobby.gameSettings')} onClick={onOptions} style={{ width: 48, padding: 0 }}><IconSliders /></button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function PlayerGrid({ players, vipId, max, freeLabel, compact }: { players: PlayerInfo[]; vipId: string | null; max?: number; freeLabel: string; compact?: boolean }) {
  if (compact) {
    // Kompakt (wenn der QR-Code groß ist): nur kleine Avatare in zwei Reihen, ohne Namen
    const shown = players.slice(0, players.length > 18 ? 17 : 18);
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, minmax(0, 1fr))', gap: '6px 4px', justifyItems: 'center' }}>
        {shown.map((p) => (
          <div key={p.id} title={p.name} style={{ position: 'relative', opacity: p.connected || p.isBot ? 1 : 0.5 }}>
            <Avatar player={p} size={32} />
            {p.id === vipId && <Crown size={14} style={{ position: 'absolute', top: -7, left: 9 }} />}
          </div>
        ))}
        {players.length > shown.length && <div className="faint display" style={{ fontSize: 16, alignSelf: 'center' }}>+{players.length - shown.length}</div>}
      </div>
    );
  }
  const many = players.length > 8;
  const crowd = players.length > 18;
  const size = crowd ? 34 : many ? 44 : 56;
  const cols = crowd ? 8 : many ? 6 : 4;
  const shown = players.slice(0, cols * (crowd ? 4 : many ? 3 : 2));
  const free = many ? 0 : Math.max(0, Math.min(8, max ?? 8) - players.length);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: crowd ? '8px 4px' : many ? '10px 8px' : '14px 10px' }}>
      {shown.map((p, i) => (
        <div key={p.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, animation: `upFloat 3.2s ease-in-out ${(-0.6 * i).toFixed(1)}s infinite` }}>
          <div style={{ position: 'relative' }} className="anim-pop">
            <Avatar player={p} size={size} />
            {p.id === vipId && <Crown size={size * 0.42} style={{ position: 'absolute', top: -size * 0.22, left: size * 0.29 }} />}
          </div>
          <span style={{ fontSize: crowd ? 11 : many ? 13 : 15, fontWeight: 700, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: p.connected || p.isBot ? 1 : 0.5 }}>{p.name}</span>
        </div>
      ))}
      {Array.from({ length: free }, (_, i) => (
        <div key={`free${i}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <div style={{ width: size, height: size, borderRadius: '50%', border: '3px dashed var(--line)', animation: `upPulse 2s ease-in-out ${(-0.5 * i).toFixed(1)}s infinite` }} />
          <span className="faint" style={{ fontSize: 15 }}>{freeLabel}</span>
        </div>
      ))}
      {players.length > shown.length && <div className="faint display" style={{ fontSize: 22, alignSelf: 'center', textAlign: 'center' }}>+{players.length - shown.length}</div>}
    </div>
  );
}
