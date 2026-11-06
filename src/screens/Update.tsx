import { useEffect, useState } from 'react';
import { net, useNet } from '../net';
import { useT } from '../i18n';

/** Wartet nach einem Neustart, bis der Server wieder antwortet (neue Start-Kennung), und lädt dann die Seite neu */
export function useReloadAfterRestart(restarting: boolean, boot: string | undefined) {
  useEffect(() => {
    if (!restarting) return;
    const id = setInterval(async () => {
      try {
        const info = await (await fetch('/api/info', { cache: 'no-store' })).json();
        if (info.boot && info.boot !== boot) location.reload();
      } catch { /* Server startet noch */ }
    }, 1500);
    return () => clearInterval(id);
  }, [restarting, boot]);
}

/** Hinweis in der TV-Lobby: Updates für UP! und installierte Spiele – ein Klick aktualisiert alles */
export function UpdateBanner() {
  const s = useNet();
  const u = s.host?.update;
  const sp = s.host?.spiele;
  const lang = s.room?.lang ?? 'de';
  const t = useT(lang);
  const [hidden, setHidden] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const gameBusy = sp?.busy && sp.busy.id !== '*' && sp.busy.step !== 'checking' && sp.installed.some((g) => g.id === sp.busy!.id) ? sp.busy : undefined;
  const restarting = u?.state === 'restarting' || sp?.busy?.step === 'restarting';
  useReloadAfterRestart(restarting, s.host?.boot);

  if (!u) return null;
  const upAvailable = u.state === 'available';
  const games = sp?.updates ?? 0;
  const gamesText = games === 1 ? t('update.gamesOne') : t('update.gamesMany', { n: games });
  const msg = sp?.message && ['spiele.msg.updated', 'spiele.msg.rolledBack', 'spiele.msg.updateFailed'].includes(sp.message.key) ? sp.message : undefined;
  const busy = u.state === 'downloading' || u.state === 'installing' || restarting || !!gameBusy;
  const offer = upAvailable || games > 0;

  if (!busy && !offer && !msg && !sp?.restartNeeded && (u.state === 'idle' || u.state === 'available')) return null;
  if (hidden && offer && !busy && !msg) return null;
  const players = s.room?.players.filter((p) => !p.isBot).length ?? 0;
  const gameName = (id: string) => sp?.installed.find((g) => g.id === id)?.name?.[lang] ?? id;

  let title: string;
  let detail: string;
  if (restarting) [title, detail] = [t('update.restarting'), t('update.wait')];
  else if (gameBusy) [title, detail] = [t('update.gamesUpdating', { name: gameName(gameBusy.id) }), t('update.wait')];
  else if (u.state === 'downloading' || u.state === 'installing') [title, detail] = [t(u.state === 'downloading' ? 'update.downloading' : 'update.installing'), t('update.wait')];
  else if (u.state === 'error') [title, detail] = [t('update.failed'), u.error ?? ''];
  else if (u.state === 'manual' && u.error === 'restart') [title, detail] = [t('update.restartManually'), t('update.restartHint')];
  else if (sp?.restartNeeded) [title, detail] = [t('spiele.restartNeeded'), t('update.restartHint')];
  else if (msg && !offer) [title, detail] = [t(msg.key, msg.vars), ''];
  else if (u.state === 'manual' && u.git && !games) [title, detail] = [t('update.available', { version: u.latest ?? '' }), t('update.git')];
  else {
    title = upAvailable && games ? t('update.availableBoth', { version: u.latest ?? '', games: gamesText })
      : upAvailable ? t('update.available', { version: u.latest ?? '' })
      : t('update.availableGames', { games: gamesText });
    const names = sp?.installed.filter((g) => g.update?.latest && !g.update.needsNewerUp && g.update.latest !== g.version && g.update.latest !== g.failedVersion).map((g) => `${g.name?.[lang] ?? g.id} ${g.update!.latest}`) ?? [];
    detail = [...(upAvailable ? u.notes ?? [] : []), ...(names.length ? [names.join(', ')] : [])].join(' · ') || t('update.current', { version: u.current });
  }

  const color = msg?.kind === 'rolledBack' || msg?.kind === 'error' || u.state === 'error' ? 'var(--orange)' : 'var(--green)';
  const install = () => net.send(u.state === 'error' && !games ? 'update:install' : 'update:all');
  const canInstall = !busy && (offer || u.state === 'error');

  return (
    <div className="anim-up" role="status" style={{
      position: 'absolute', left: 56, right: 56, bottom: 160, zIndex: 65, display: 'flex', alignItems: 'center', gap: 18,
      background: color, color: '#110D24', borderRadius: 22, padding: '14px 20px', boxShadow: '0 6px 0 rgba(0,0,0,.25)',
    }}>
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}>
        <path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M5 21h14" />
      </svg>
      <div style={{ flex: 1, minWidth: 0 }}>
        <b className="display" style={{ fontSize: 20 }}>{title}</b>
        {detail && <p style={{ fontSize: 15, marginTop: 2 }}>{detail}</p>}
        {msg && offer && <p style={{ fontSize: 15, marginTop: 2, fontWeight: 700 }}>{t(msg.key, msg.vars)}</p>}
      </div>
      {canInstall && !confirm && (
        <>
          <button className="up-btn small" style={{ background: '#110D24', color: '#fff', boxShadow: '0 4px 0 #000' }} onClick={() => (players > 0 ? setConfirm(true) : install())}>
            {u.state === 'error' && !games ? t('update.retry') : t('update.install')}
          </button>
          {offer && <button className="up-btn ghost small" onClick={() => setHidden(true)}>{t('update.later')}</button>}
        </>
      )}
      {!canInstall && !busy && msg && (
        <button className="up-btn ghost small" onClick={() => net.send('spiele:dismiss')}>{t('settings.close')}</button>
      )}
      {confirm && (
        <>
          <span style={{ fontSize: 15, fontWeight: 700, maxWidth: 260 }}>{t('update.confirm')}</span>
          <button className="up-btn small" style={{ background: '#110D24', color: '#fff', boxShadow: '0 4px 0 #000' }} onClick={() => { setConfirm(false); install(); }}>{t('common.yes')}</button>
          <button className="up-btn ghost small" onClick={() => setConfirm(false)}>{t('common.no')}</button>
        </>
      )}
      {busy && <span style={{ width: 30, height: 30, borderRadius: '50%', border: '4px solid rgba(17,13,36,.25)', borderTopColor: '#110D24', animation: 'upSpin 1s linear infinite', flex: 'none' }} />}
    </div>
  );
}
