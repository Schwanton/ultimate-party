import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Lang, PlayerInfo } from '@up/sdk';
import { net, useNet, loadSession, saveSession } from '../net';
import { guessLang, useT } from '../i18n';
import { clientGame } from '../registry';
import { Avatar, Crown, Logo, QrCode, Stage, isLight, sfx, shade } from '../ui';
import { HostSettings } from './HostSettings';

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
        <GameMenu finished={room.finished} vip={room.vipId ? player(room.vipId) : undefined} />
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
  useEffect(() => {
    if (inLobby) sfx.startMusic();
    else sfx.stopMusic();
  }, [inLobby]);
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
  const [open, setOpen] = useState(false);
  if (finished) {
    return (
      <div className="anim-fade" style={{ position: 'absolute', top: 30, right: 56, zIndex: 45, display: 'flex', gap: 12, alignItems: 'center', background: 'var(--surface)', padding: '10px 12px 10px 20px', borderRadius: 22 }}>
        <span className="muted" style={{ fontSize: 16 }}>{vip ? t('game.vipDecides', { name: vip.name }) : ''}</span>
        <button className="up-btn small" onClick={() => net.request('start')}>{t('game.again')}</button>
        <button className="up-btn ghost small" onClick={() => net.send('lobby')}>{t('game.otherGame')}</button>
      </div>
    );
  }
  return (
    <div style={{ position: 'absolute', right: 14, bottom: 12, zIndex: 45, display: 'flex', gap: 8, alignItems: 'center' }}>
      {open && (
        <>
          <span className="muted" style={{ fontSize: 14 }}>{t('game.confirmLobby')}</span>
          <button className="up-btn small" onClick={() => { setOpen(false); net.send('lobby'); }}>{t('common.yes')}</button>
          <button className="up-btn ghost small" onClick={() => setOpen(false)}>{t('common.no')}</button>
        </>
      )}
      {!open && (
        <button aria-label={t('game.toLobby')} title={t('game.toLobby')} onClick={() => setOpen(true)}
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
  const joinUrl = `${room.joinUrl}/?r=${room.code}`;
  const lastResult = host.results.at(-1);
  const lastWinner = lastResult?.ranking[0] ? players.find((p) => p.id === lastResult.ranking[0].playerId) : undefined;
  const canStart = !!selected && active.length >= selected.minPlayers;

  const setLang = (lang: Lang) => {
    try { localStorage.setItem('up:lang', lang); } catch { /* egal */ }
    net.send('settings', { patch: { lang } });
  };

  return (
    <>
      <header style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Logo />
          <span className="display muted" style={{ fontSize: 20, fontWeight: 500 }}>{t('app.name')}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <SoundButton label={t('sound.enable')} />
          {room.dev && (
            <>
              <button className="up-btn ghost small" onClick={() => net.send('bots:add', { count: 1 })}>{t('lobby.addBots')}</button>
              {players.some((p) => p.isBot) && <button className="up-btn ghost small" onClick={() => net.send('bots:remove')}>{t('lobby.removeBots')}</button>}
            </>
          )}
          <div style={{ display: 'flex', background: 'var(--surface)', borderRadius: 999, padding: 4 }}>
            {(['de', 'en'] as Lang[]).map((l) => (
              <button key={l} aria-pressed={room.lang === l} onClick={() => setLang(l)}
                style={{ border: 0, minHeight: 44, padding: '8px 16px', borderRadius: 999, fontWeight: 700, fontSize: 15, background: room.lang === l ? '#fff' : 'transparent', color: room.lang === l ? '#110D24' : 'var(--muted)' }}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          <button aria-label={t('settings.title')} title={t('settings.title')} onClick={onSettings}
            style={{ width: 52, height: 52, border: 0, borderRadius: 16, background: 'var(--surface)', color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
          </button>
        </div>
      </header>

      {host.notice && <div className="up-error" style={{ fontSize: 18 }}>{t(`error.${host.notice}`)}</div>}

      <main style={{ flex: 1, minHeight: 0, display: 'flex', gap: 24 }}>
        <section className="up-card" style={{ width: 480, padding: 32, display: 'flex', flexDirection: 'column', gap: 20, borderRadius: 28 }}>
          <h2 style={{ fontSize: 40, fontWeight: 800 }}>{t('join.title')}</h2>
          <div style={{ display: 'flex', gap: 24 }}>
            <QrCode text={joinUrl} size={168} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
              <span className="muted" style={{ fontSize: 15, fontWeight: 500 }}>{t('join.scanOrOpen')}</span>
              <span style={{ fontSize: 20, fontWeight: 700, wordBreak: 'break-all' }}>{room.joinUrl.replace(/^https?:\/\//, '')}</span>
              <span className="muted" style={{ fontSize: 15, fontWeight: 500, marginTop: 8 }}>{t('join.code')}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                {room.code.split('').map((ch, i) => (
                  <span key={i} className="display" style={{ width: 52, height: 60, borderRadius: 14, background: 'var(--yellow)', color: '#110D24', fontSize: 36, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 5px 0 var(--yellow-d)' }}>{ch}</span>
                ))}
              </div>
            </div>
          </div>
          <p className="muted" style={{ fontSize: 15 }}>{t('join.noApp')}</p>
        </section>

        <section className="up-card" style={{ flex: 1, minWidth: 0, padding: 32, display: 'flex', flexDirection: 'column', gap: 18, borderRadius: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: 28, fontWeight: 700 }}>{t('lobby.players')}</h2>
            <span style={{ background: 'var(--surface-2)', borderRadius: 999, padding: '6px 14px', fontSize: 16, fontWeight: 700 }}>
              {active.length}{selected ? ` / ${selected.maxPlayers}` : ''}
            </span>
          </div>
          <PlayerGrid players={players} vipId={room.vipId} max={selected?.maxPlayers} freeLabel={t('lobby.free')} />
          <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <p className="muted" style={{ fontSize: 17 }}>
              {lastWinner ? t('lobby.lastWinner', { name: lastWinner.name }) + ' · ' : ''}
              {vip ? t('lobby.vipPicks', { name: vip.name }) : t('lobby.waitingForPlayers')}
            </p>
            {canStart && <button className="up-btn small" onClick={() => net.request('start')}>{t('lobby.start')}</button>}
          </div>
        </section>
      </main>

      <section aria-label="Spiele" style={{ height: 120, flex: 'none', display: 'grid', gridTemplateColumns: `repeat(${Math.max(3, games.length)}, minmax(0, 1fr))`, gap: 20 }}>
        {games.map((g) => {
          const sel = g.id === room.selectedGameId;
          const light = isLight(g.color);
          const fits = active.length >= g.minPlayers;
          return (
            <button key={g.id} onClick={() => net.send('select', { gameId: g.id })} style={{
              border: 0, textAlign: 'left', background: g.color, borderRadius: 22, padding: games.length > 4 ? '14px 16px' : '18px 22px', color: light ? '#110D24' : '#fff',
              boxShadow: `0 6px 0 ${shade(g.color)}${sel ? ', 0 0 0 4px #fff' : ''}`, transform: sel ? 'translateY(-6px)' : undefined,
              display: 'flex', flexDirection: 'column', justifyContent: 'space-between', opacity: fits || sel ? 1 : 0.55, transition: 'transform .2s',
            }}>
              <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span className="display" style={{ fontSize: games.length > 4 ? 20 : 26, fontWeight: 800, lineHeight: 1.1 }}>{g.name[room.lang] ?? g.name.en}</span>
                {sel && <span style={{ background: '#fff', color: shade(g.color, 0.4), fontSize: 13, fontWeight: 700, padding: '4px 10px', borderRadius: 999 }}>{t('lobby.selected')}</span>}
              </span>
              <span style={{ fontSize: games.length > 4 ? 13 : 15, fontWeight: 500 }}>
                {t('lobby.playersRange', { min: g.minPlayers, max: g.maxPlayers })}{g.audience ? ' +' : ''} · {t('lobby.minutes', { n: g.minutes })}
              </span>
            </button>
          );
        })}
      </section>
    </>
  );
}

function PlayerGrid({ players, vipId, max, freeLabel }: { players: PlayerInfo[]; vipId: string | null; max?: number; freeLabel: string }) {
  const many = players.length > 8;
  const size = players.length > 24 ? 40 : many ? 52 : 72;
  const cols = players.length > 24 ? 10 : many ? 6 : 4;
  const shown = players.slice(0, cols * (many ? 4 : 2));
  const free = many ? 0 : Math.max(0, Math.min(8, max ?? 8) - players.length);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: many ? '10px 8px' : '20px 12px' }}>
      {shown.map((p, i) => (
        <div key={p.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, animation: `upFloat 3.2s ease-in-out ${(-0.6 * i).toFixed(1)}s infinite` }}>
          <div style={{ position: 'relative' }} className="anim-pop">
            <Avatar player={p} size={size} />
            {p.id === vipId && <Crown size={size * 0.42} style={{ position: 'absolute', top: -size * 0.22, left: size * 0.29 }} />}
          </div>
          <span style={{ fontSize: many ? 14 : 18, fontWeight: 700, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: p.connected || p.isBot ? 1 : 0.5 }}>{p.name}</span>
        </div>
      ))}
      {Array.from({ length: free }, (_, i) => (
        <div key={`free${i}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <div style={{ width: size, height: size, borderRadius: '50%', border: '3px dashed var(--line)', animation: `upPulse 2s ease-in-out ${(-0.5 * i).toFixed(1)}s infinite` }} />
          <span className="faint" style={{ fontSize: 16 }}>{freeLabel}</span>
        </div>
      ))}
      {players.length > shown.length && <div className="faint display" style={{ fontSize: 22, alignSelf: 'center', textAlign: 'center' }}>+{players.length - shown.length}</div>}
    </div>
  );
}
