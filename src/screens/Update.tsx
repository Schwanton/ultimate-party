import { useEffect, useState } from 'react';
import { net, useNet } from '../net';
import { useT } from '../i18n';

/** Hinweis in der TV-Lobby, wenn eine neue Version von UP! verfügbar ist */
export function UpdateBanner() {
  const s = useNet();
  const u = s.host?.update;
  const t = useT(s.room?.lang ?? 'de');
  const [hidden, setHidden] = useState(false);
  const [confirm, setConfirm] = useState(false);

  // Nach dem Neustart: warten, bis der Server mit neuer Version antwortet, dann Seite neu laden
  useEffect(() => {
    if (u?.state !== 'restarting') return;
    const id = setInterval(async () => {
      try {
        const info = await (await fetch('/api/info', { cache: 'no-store' })).json();
        if (info.version && info.version !== u.current) location.reload();
      } catch { /* Server startet noch */ }
    }, 1500);
    return () => clearInterval(id);
  }, [u?.state, u?.current]);

  if (!u || u.state === 'idle' || (hidden && u.state === 'available')) return null;
  const busy = u.state === 'downloading' || u.state === 'installing' || u.state === 'restarting';
  const players = s.room?.players.filter((p) => !p.isBot).length ?? 0;

  return (
    <div className="anim-up" role="status" style={{
      position: 'absolute', left: 56, right: 56, bottom: 160, zIndex: 65, display: 'flex', alignItems: 'center', gap: 18,
      background: 'var(--green)', color: '#110D24', borderRadius: 22, padding: '14px 20px', boxShadow: '0 6px 0 var(--green-d)',
    }}>
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}>
        <path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M5 21h14" />
      </svg>
      <div style={{ flex: 1, minWidth: 0 }}>
        <b className="display" style={{ fontSize: 20 }}>
          {u.state === 'error' ? t('update.failed')
            : u.state === 'downloading' ? t('update.downloading')
            : u.state === 'installing' ? t('update.installing')
            : u.state === 'restarting' ? t('update.restarting')
            : u.state === 'manual' && u.error === 'restart' ? t('update.restartManually')
            : t('update.available', { version: u.latest ?? '' })}
        </b>
        <p style={{ fontSize: 15, marginTop: 2 }}>
          {u.state === 'error' ? u.error
            : u.state === 'manual' && u.git ? t('update.git')
            : u.state === 'manual' ? t('update.restartHint')
            : busy ? t('update.wait')
            : u.notes?.length ? u.notes.join(' · ') : t('update.current', { version: u.current })}
        </p>
      </div>
      {(u.state === 'available' || u.state === 'error') && !confirm && (
        <>
          <button className="up-btn small" style={{ background: '#110D24', color: '#fff', boxShadow: '0 4px 0 #000' }} onClick={() => (players > 0 ? setConfirm(true) : net.send('update:install'))}>
            {u.state === 'error' ? t('update.retry') : t('update.install')}
          </button>
          {u.state === 'available' && <button className="up-btn ghost small" onClick={() => setHidden(true)}>{t('update.later')}</button>}
        </>
      )}
      {confirm && (
        <>
          <span style={{ fontSize: 15, fontWeight: 700, maxWidth: 260 }}>{t('update.confirm')}</span>
          <button className="up-btn small" style={{ background: '#110D24', color: '#fff', boxShadow: '0 4px 0 #000' }} onClick={() => { setConfirm(false); net.send('update:install'); }}>{t('common.yes')}</button>
          <button className="up-btn ghost small" onClick={() => setConfirm(false)}>{t('common.no')}</button>
        </>
      )}
      {busy && <span style={{ width: 30, height: 30, borderRadius: '50%', border: '4px solid rgba(17,13,36,.25)', borderTopColor: '#110D24', animation: 'upSpin 1s linear infinite', flex: 'none' }} />}
    </div>
  );
}
