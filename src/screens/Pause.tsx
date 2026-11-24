import { useEffect } from 'react';
import type { RoomSnapshot } from '@up/sdk';
import { net } from '../net';
import { Avatar, sfx } from '../ui';

type T = (k: string, v?: Record<string, string | number>) => string;

function pausedByText(room: RoomSnapshot, t: T) {
  const by = room.pause?.by;
  if (!by || by === 'tv') return t('game.pausedByTv');
  const p = room.players.find((x) => x.id === by);
  return p ? t('game.pausedBy', { name: p.name }) : t('game.pausedByTv');
}

function PauseIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
      <rect x="14" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
    </svg>
  );
}
export function PlayIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" /></svg>
  );
}
export { PauseIcon };

/** Pause-Bild über dem ganzen TV. Musik und Geräusche schweigen, solange es zu sehen ist. */
export function HostPause({ room, t }: { room: RoomSnapshot; t: T }) {
  const paused = !!room.pause;
  useEffect(() => {
    if (paused) sfx.pauseAll();
    else sfx.resumeAll();
  }, [paused]);
  useEffect(() => () => sfx.resumeAll(), []);
  if (!room.pause) return null;
  const by = room.pause.by && room.pause.by !== 'tv' ? room.players.find((p) => p.id === room.pause!.by) : undefined;
  return (
    <div className="anim-fade" style={{ position: 'absolute', inset: 0, zIndex: 80, background: 'rgba(10,7,22,.82)', backdropFilter: 'blur(6px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 22 }}>
      <div style={{ width: 120, height: 120, borderRadius: '50%', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: '0 0 0 4px rgba(255,255,255,.15)' }}><PauseIcon size={64} /></div>
      <h1 className="display" style={{ fontSize: 72, letterSpacing: 4 }}>{t('game.paused')}</h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 24 }} className="muted">
        {by && <Avatar player={by} size={40} />}
        {pausedByText(room, t)}
      </div>
      <button className="up-btn" style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, fontSize: 22 }} onClick={() => net.send('pause', { paused: false })}>
        <PlayIcon size={24} /> {t('game.resume')}
      </button>
    </div>
  );
}

/** Pause-Bild auf dem Handy: alle sehen es, VIP kann weiterspielen lassen */
export function PhonePause({ room, t, isVip }: { room: RoomSnapshot; t: T; isVip: boolean }) {
  if (!room.pause) return null;
  return (
    <div className="anim-fade" style={{ position: 'fixed', inset: 0, zIndex: 92, background: 'rgba(10,7,22,.97)', backdropFilter: 'blur(6px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, textAlign: 'center', color: '#fff' }}>
      <div style={{ width: 84, height: 84, borderRadius: '50%', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><PauseIcon size={44} /></div>
      <h1 className="display" style={{ fontSize: 40 }}>{t('game.paused')}</h1>
      <p className="muted" style={{ fontSize: 17 }}>{pausedByText(room, t)}</p>
      {isVip ? (
        <button className="up-btn" style={{ minWidth: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }} onClick={() => net.send('pause', { paused: false })}>
          <PlayIcon size={22} /> {t('game.resume')}
        </button>
      ) : (
        <p className="muted" style={{ fontSize: 15 }}>{t('game.pausedWait')}</p>
      )}
    </div>
  );
}
