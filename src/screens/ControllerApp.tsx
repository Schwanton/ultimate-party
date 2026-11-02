import { useCallback, useEffect, useRef, useState } from 'react';
import { ANIMALS, type Animal, type Avatar as AvatarData } from '@up/sdk';
import { net, useNet, loadSession, saveSession } from '../net';
import { guessLang, useT } from '../i18n';
import registry, { clientGame } from '../registry';
import { Avatar, Crown, Logo, isLight, shade, vibrate } from '../ui';
import { GameOptionsForm, optionsSummary } from './GameOptions';

const params = new URLSearchParams(location.search);

async function tryResume(): Promise<boolean> {
  const saved = loadSession('player');
  const code = params.get('r')?.toUpperCase();
  if (!saved || (code && saved.code !== code)) return false;
  const res = await net.request('resume', saved);
  if (!res.ok) saveSession('player', null);
  return !!res.ok;
}

export function ControllerApp() {
  const s = useNet();
  const [joined, setJoined] = useState(false);
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    net.onOpen = async () => {
      const ok = await tryResume();
      setJoined(ok);
      setChecked(true);
    };
    net.start();
  }, []);

  const lang = s.room?.lang ?? guessLang();
  const t = useT(lang, s.room?.phase === 'game' ? s.room.gameId : null);

  if (s.kicked) {
    return <div className="up-phone"><p style={{ margin: 'auto', fontSize: 20 }}>{t('status.kicked')}</p></div>;
  }
  if (!checked) {
    return <div className="up-phone" style={{ alignItems: 'center', justifyContent: 'center', minHeight: '100dvh' }}><Logo size={48} /></div>;
  }
  if (!joined || !s.room || !s.me) {
    return <JoinForm onJoined={() => setJoined(true)} />;
  }
  return <InRoom />;
}

/* ---------------- Beitreten ---------------- */

function JoinForm({ onJoined }: { onJoined: () => void }) {
  const lang = guessLang();
  const t = useT(lang);
  const [code, setCode] = useState((params.get('r') ?? '').toUpperCase().slice(0, 4));
  const [name, setName] = useState(params.get('name') ?? (() => { try { return localStorage.getItem('up:name') ?? ''; } catch { return ''; } })());
  const [animal] = useState<Animal>(() => ANIMALS[Math.floor(Math.random() * ANIMALS.length)]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const join = async () => {
    setBusy(true);
    setError(null);
    const res = await net.request('join', { code, name, avatar: { kind: 'animal', animal } });
    setBusy(false);
    if (!res.ok) return setError(t(`error.${res.error}`));
    try { localStorage.setItem('up:name', name.trim()); } catch { /* egal */ }
    saveSession('player', { code: res.code, token: res.token });
    onJoined();
  };

  // Entwicklermodus: simulierte Handys treten automatisch bei
  const auto = useRef(false);
  useEffect(() => {
    if (params.get('auto') === '1' && code.length === 4 && name && !auto.current) {
      auto.current = true;
      void join();
    }
  });

  return (
    <form className="up-phone up-phone-scroll" onSubmit={(e) => { e.preventDefault(); void join(); }}>
      <div style={{ display: 'flex', justifyContent: 'center', padding: '28px 0 8px' }}><Logo size={56} /></div>
      <h1 style={{ fontSize: 34, fontWeight: 800, textAlign: 'center' }}>{t('join.title')}</h1>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <Avatar avatar={{ kind: 'animal', animal }} color="#FFD447" size={96} />
      </div>
      <label className="up-label" htmlFor="code">{t('join.code')}</label>
      <input id="code" className="up-input display" value={code} maxLength={4} autoCapitalize="characters" autoComplete="off" inputMode="text"
        onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
        style={{ fontSize: 32, letterSpacing: '0.4em', textAlign: 'center', fontWeight: 800 }} placeholder="ABCD" />
      <label className="up-label" htmlFor="name">{t('join.name')}</label>
      <input id="name" className="up-input" value={name} maxLength={16} autoComplete="nickname" placeholder={t('join.namePlaceholder')} onChange={(e) => setName(e.target.value)} />
      {error && <p className="up-error">{error}</p>}
      <div style={{ flex: 1 }} />
      <button className="up-btn big full" disabled={busy || code.length !== 4 || !name.trim()}>{t('join.button')}</button>
    </form>
  );
}

/* ---------------- Im Raum ---------------- */

function InRoom() {
  const s = useNet();
  const room = s.room!;
  const me = s.me!;
  const t = useT(room.lang, room.phase === 'game' ? room.gameId : null);
  const [picking, setPicking] = useState(false);
  const player = (id: string) => room.players.find((p) => p.id === id);
  const isVip = room.vipId === me.id;
  const send = useCallback((action: unknown) => net.send('action', { action }), []);

  // Kurz vibrieren, wenn eine neue Aufgabe kommt
  const lastScreen = useRef<string | null>(null);
  useEffect(() => {
    const key = s.view?.screen ?? null;
    if (key && key !== lastScreen.current && s.view?.input) vibrate(40);
    lastScreen.current = key;
  }, [s.view]);

  let content;
  if (room.phase === 'game' && room.gameId) {
    const Controller = clientGame(room.gameId)?.client.Controller;
    content = s.view && Controller ? (
      <Controller key={room.gameId} view={s.view} room={room} me={me} t={t} player={player} send={send} />
    ) : (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, textAlign: 'center' }}>
        <Avatar player={me} size={96} />
        <p style={{ fontSize: 19 }}>{t('game.spectating')}</p>
      </div>
    );
  } else if (picking) {
    content = <AvatarPicker onDone={() => setPicking(false)} />;
  } else {
    content = <PhoneLobby onEditAvatar={() => setPicking(true)} />;
  }

  return (
    <div className="up-phone up-phone-scroll">
      {s.status !== 'open' && (
        <div className="up-chip" style={{ alignSelf: 'center' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--orange)', animation: 'upPulse 1s infinite' }} /> {t('status.reconnecting')}
        </div>
      )}
      {content}
      {room.phase === 'game' && room.finished && (
        isVip ? (
          <div style={{ display: 'flex', gap: 10 }} className="anim-up">
            <button className="up-btn full" onClick={() => net.request('start')}>{t('game.again')}</button>
            <button className="up-btn ghost full" onClick={() => net.send('lobby')}>{t('game.otherGame')}</button>
          </div>
        ) : (
          <p className="muted" style={{ textAlign: 'center' }}>{t('game.vipDecides', { name: player(room.vipId ?? '')?.name ?? 'VIP' })}</p>
        )
      )}
    </div>
  );
}

function PhoneLobby({ onEditAvatar }: { onEditAvatar: () => void }) {
  const s = useNet();
  const room = s.room!;
  const me = s.me!;
  const t = useT(room.lang);
  const isVip = room.vipId === me.id;
  const vip = room.players.find((p) => p.id === room.vipId);
  const [error, setError] = useState<string | null>(null);
  const active = room.players.filter((p) => p.connected || p.isBot).length;
  const list = useGames();
  const selected = list.find((g) => g.id === room.selectedGameId);

  const start = async () => {
    setError(null);
    const res = await net.request('start');
    if (!res.ok) setError(t(`error.${res.error}`));
  };

  return (
    <>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Logo size={24} />
        <span className="up-chip">{t('lobby.room')} <b>{room.code}</b></span>
      </header>

      <section style={{ background: me.color, borderRadius: 24, padding: 20, display: 'flex', alignItems: 'center', gap: 16, boxShadow: `0 6px 0 ${shade(me.color)}`, color: isLight(me.color) ? '#110D24' : '#fff' }}>
        <div style={{ position: 'relative' }}>
          <Avatar player={me} size={72} color="#FFFFFF" />
          {isVip && <Crown size={28} style={{ position: 'absolute', top: -14, left: 22 }} />}
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <span className="display" style={{ fontSize: 28, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis' }}>{me.name}</span>
          <span style={{ fontSize: 15, fontWeight: 500 }}>{isVip ? t('lobby.youAreVip') : vip ? t('lobby.waitForVip', { name: vip.name }) : ''}</span>
        </div>
        <button aria-label={t('lobby.changeAvatar')} onClick={onEditAvatar} style={{ width: 44, height: 44, flex: 'none', border: 0, borderRadius: 14, background: '#fff', color: '#A81B4B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
        </button>
      </section>

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: 22, fontWeight: 700 }}>{t('lobby.pickGame')}</h2>
        <span className="muted" style={{ fontSize: 14 }}>{t('lobby.playersReady', { n: active })}</span>
      </div>

      <div role="radiogroup" aria-label={t('lobby.pickGame')} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {list.map((g) => {
          const sel = g.id === room.selectedGameId;
          return (
            <button key={g.id} type="button" role="radio" aria-checked={sel} disabled={!isVip} onClick={() => net.send('select', { gameId: g.id })}
              style={{ minHeight: 72, width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 20, textAlign: 'left', background: sel ? 'var(--surface-2)' : 'var(--surface)', border: `3px solid ${sel ? g.color : 'transparent'}`, opacity: !isVip && !sel ? 0.6 : 1 }}>
              <span style={{ width: 40, height: 40, flex: 'none', borderRadius: 12, background: g.color }} />
              <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span className="display" style={{ fontSize: 19, fontWeight: 700 }}>{g.name[room.lang] ?? g.name.en}</span>
                <span className="muted" style={{ fontSize: 14 }}>{t('lobby.playersRange', { min: g.minPlayers, max: g.maxPlayers })} · {t('lobby.minutes', { n: g.minutes })}</span>
              </span>
            </button>
          );
        })}
      </div>

      {selected?.options?.length ? (
        isVip ? (
          <details className="up-card" style={{ padding: '14px 16px' }}>
            <summary style={{ fontWeight: 700, cursor: 'pointer', fontSize: 16 }}>{t('lobby.gameSettings')}
              <span className="faint" style={{ display: 'block', fontWeight: 500, fontSize: 13, marginTop: 4 }}>{optionsSummary(selected, room.settings.gameOptions?.[selected.id], room.lang)}</span>
            </summary>
            <div style={{ marginTop: 14 }}>
              <GameOptionsForm game={selected} values={room.settings.gameOptions?.[selected.id]} lang={room.lang} compact />
            </div>
          </details>
        ) : (
          <p className="faint" style={{ fontSize: 13 }}>{optionsSummary(selected, room.settings.gameOptions?.[selected.id], room.lang)}</p>
        )
      ) : null}
      {error && <p className="up-error">{error}</p>}
      <div style={{ flex: 1 }} />
      {isVip && selected && (
        <>
          <button className="up-btn big full" disabled={active < selected.minPlayers} onClick={start}>{t('lobby.start')}</button>
          <p className="muted" style={{ textAlign: 'center', fontSize: 14, marginTop: -4 }}>
            {active < selected.minPlayers ? t('lobby.needPlayers', { n: selected.minPlayers - active })
              : active > selected.maxPlayers ? t('lobby.tooMany', { n: selected.maxPlayers })
              : t('lobby.startsOnTv', { game: selected.name[room.lang] ?? selected.name.en })}
          </p>
        </>
      )}
    </>
  );
}

function useGames() {
  const room = useNet().room!;
  return listGames(room.dev);
}

function listGames(dev: boolean) {
  return registry.map((g) => g.manifest).filter((m) => !m.hidden || dev);
}

/* ---------------- Avatar wählen ---------------- */

async function resizeImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const size = 320;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const s = Math.min(img.width, img.height);
    ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function AvatarPicker({ onDone }: { onDone: () => void }) {
  const s = useNet();
  const room = s.room!;
  const me = s.me!;
  const t = useT(room.lang);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const current = me.avatar;

  const pick = (avatar: AvatarData) => net.send('profile', { avatar });
  const onFile = async (file?: File) => {
    if (!file) return;
    setError(null);
    try {
      const dataUrl = await resizeImage(file);
      const res = await net.request('photo', { dataUrl });
      if (!res.ok) setError(t(`error.${res.error}`));
    } catch {
      setError(t('error.invalid_image'));
    }
  };

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800 }}>{t('avatar.title')}</h1>
        <p className="muted" style={{ fontSize: 14 }}>{t('avatar.subtitle')}</p>
      </div>
      <section className="up-card" style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '16px 20px' }}>
        <span className="anim-pop" key={JSON.stringify(current)}><Avatar player={me} size={96} /></span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="display" style={{ fontSize: 24, fontWeight: 800 }}>{me.name}</span>
          <span className="muted" style={{ fontSize: 15 }}>{current.kind === 'animal' ? t(`animal.${current.animal}`) : t('animal.photo')}</span>
        </div>
      </section>
      <div role="radiogroup" aria-label={t('avatar.title')} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '12px 10px' }}>
        {ANIMALS.map((a) => {
          const sel = current.kind === 'animal' && current.animal === a;
          return (
            <button key={a} type="button" role="radio" aria-checked={sel} onClick={() => pick({ kind: 'animal', animal: a })}
              style={{ minHeight: 96, padding: '8px 2px', borderRadius: 18, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, background: sel ? 'var(--surface-2)' : 'transparent', border: `3px solid ${sel ? '#fff' : 'transparent'}` }}>
              <Avatar avatar={{ kind: 'animal', animal: a }} color={me.color} size={58} />
              <span style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.2, textAlign: 'center', hyphens: 'auto' }} lang={room.lang}>{t(`animal.${a}`)}</span>
            </button>
          );
        })}
      </div>
      {room.settings.allowPhotos && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--faint)', fontSize: 14 }}>
            <span style={{ flex: 1, height: 2, background: 'var(--surface-2)' }} />{t('avatar.orPhoto')}<span style={{ flex: 1, height: 2, background: 'var(--surface-2)' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <button type="button" className="up-btn ghost" onClick={() => cameraRef.current?.click()}>{t('avatar.take')}</button>
            <button type="button" className="up-btn ghost" onClick={() => uploadRef.current?.click()}>{t('avatar.upload')}</button>
          </div>
          <input ref={cameraRef} type="file" accept="image/*" capture="user" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          <input ref={uploadRef} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          <p className="faint" style={{ fontSize: 13, textAlign: 'center', marginTop: -6 }}>{t('avatar.photoNote')}</p>
        </>
      )}
      {error && <p className="up-error">{error}</p>}
      <div style={{ flex: 1 }} />
      <button className="up-btn big full" onClick={onDone}>{t('avatar.done')}</button>
    </>
  );
}
