import { useState } from 'react';
import { net, useNet, type SpieleStatus } from '../net';
import { useT } from '../i18n';
import { useReloadAfterRestart } from './Update';

type T = (k: string, v?: Record<string, string | number>) => string;
type Installed = SpieleStatus['installed'][number];
type CatalogItem = NonNullable<SpieleStatus['catalog']>[number];

/** „Spiele verwalten“: installierte Spiele, Updates (alle oder einzeln), Katalog und Installation aus GitHub */
export function GameManager({ onClose }: { onClose: () => void }) {
  const s = useNet();
  const room = s.room!;
  const host = s.host!;
  const sp = host.spiele;
  const lang = room.lang;
  const t = useT(lang) as T;
  const [confirm, setConfirm] = useState<string | null>(null);
  const players = room.players.filter((p) => !p.isBot).length;
  useReloadAfterRestart(sp?.busy?.step === 'restarting', host.boot);
  if (!sp) return null;

  const builtin = host.games.filter((g) => g.source !== 'installed' && !g.hidden).length;
  const checking = sp.installed.some((g) => g.update?.checking);
  const busy = !!sp.busy;
  const inLobby = room.phase === 'lobby';
  /** Updates starten UP! neu – bei verbundenen Handys erst nachfragen */
  const runUpdate = (key: string, payload: object) => {
    if (players > 0 && confirm !== key) return setConfirm(key);
    setConfirm(null);
    net.send('spiele:update', payload);
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={t('spiele.title')} style={{ position: 'absolute', inset: 0, zIndex: 75, background: 'rgba(10,7,22,.82)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div className="up-card anim-pop" onClick={(e) => e.stopPropagation()} style={{ width: 1040, maxHeight: 680, overflow: 'auto', padding: 32, display: 'flex', flexDirection: 'column', gap: 22, borderRadius: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={{ fontSize: 32, fontWeight: 800, flex: 1 }}>{t('spiele.title')}</h2>
          <button className="up-btn ghost small" disabled={checking || busy} onClick={() => net.send('spiele:check')}>{checking ? t('spiele.checking') : t('spiele.checkAll')}</button>
          {sp.updates > 0 && (
            <button className="up-btn small" disabled={busy || !inLobby} onClick={() => runUpdate('*', {})}>
              {confirm === '*' ? t('update.confirmShort') : t('spiele.updateAll', { n: sp.updates })}
            </button>
          )}
          <button className="up-btn small" onClick={onClose}>{t('settings.close')}</button>
        </div>
        {confirm && <p className="faint" style={{ fontSize: 15, marginTop: -12 }}>{t('spiele.restartConfirm')}</p>}

        {sp.message && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 16, background: 'var(--surface-2)', borderLeft: `6px solid ${sp.message.kind === 'ok' ? 'var(--green)' : 'var(--orange)'}` }}>
            <span style={{ flex: 1, fontSize: 16, fontWeight: 700 }}>{message(sp.message, t)}</span>
            <button className="up-btn ghost small" onClick={() => net.send('spiele:dismiss')}>✕</button>
          </div>
        )}
        {sp.restartNeeded && <p style={{ fontSize: 16, color: 'var(--orange)', fontWeight: 700 }}>{t('spiele.restartNeeded')} {t('update.restartHint')}</p>}
        {sp.busy?.step === 'restarting' && <p style={{ fontSize: 16, fontWeight: 700 }}>{t('update.restarting')} {t('update.wait')}</p>}

        <section>
          <div className="up-label" style={{ marginBottom: 8 }}>{t('spiele.installed')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sp.installed.length === 0 && <p className="muted" style={{ fontSize: 16 }}>{t('spiele.noneInstalled')}</p>}
            {sp.installed.map((g) => (
              <InstalledRow key={g.id} g={g} lang={lang} t={t} busy={busy} inLobby={inLobby}
                working={sp.busy?.id === g.id ? sp.busy.step : undefined}
                confirmUpdate={confirm === g.id}
                onUpdate={() => runUpdate(g.id, { gameId: g.id })} />
            ))}
            <p className="faint" style={{ fontSize: 14 }}>{t('spiele.builtin', { n: builtin })}</p>
          </div>
        </section>

        <Catalog sp={sp} lang={lang} t={t} busy={busy} inLobby={inLobby} />
        <FromGitHub t={t} busy={busy} inLobby={inLobby} working={sp.busy && !sp.installed.some((g) => g.id === sp.busy!.id) && !sp.catalog?.some((c) => c.id === sp.busy!.id) ? sp.busy.step : undefined} />
      </div>
    </div>
  );
}

function message(m: NonNullable<SpieleStatus['message']>, t: T) {
  const vars = { ...m.vars };
  if (vars.error) vars.error = t(`spiele.error.${vars.error}`) === `spiele.error.${vars.error}` ? vars.error : t(`spiele.error.${vars.error}`);
  return t(m.key, vars);
}

function InstalledRow({ g, lang, t, busy, inLobby, working, confirmUpdate, onUpdate }: {
  g: Installed; lang: string; t: T; busy: boolean; inLobby: boolean; working?: string; confirmUpdate: boolean; onUpdate: () => void;
}) {
  const [removing, setRemoving] = useState(false);
  const u = g.update;
  const canUpdate = !g.git && !!u?.latest && !u.needsNewerUp && u.latest !== g.version && u.latest !== g.failedVersion;
  let status: string;
  let color: string | undefined;
  if (working === 'downloading' || working === 'installing') status = t(working === 'downloading' ? 'update.downloading' : 'update.installing');
  else if (g.error) [status, color] = [t('spiele.broken', { error: g.error }), 'var(--red)'];
  else if (g.git) status = t('spiele.git');
  else if (u?.checking) status = t('spiele.checking');
  else if (u?.error) [status, color] = [t(`spiele.error.${u.error}`), 'var(--orange)'];
  else if (u?.latest && u.latest === g.failedVersion) [status, color] = [t('spiele.failedVersion', { version: u.latest }), 'var(--orange)'];
  else if (u?.latest && u.needsNewerUp) [status, color] = [t('spiele.needsNewerUp', { version: u.latest }), 'var(--orange)'];
  else if (canUpdate) [status, color] = [t('spiele.available', { version: u!.latest! }), 'var(--green)'];
  else if (u?.checkedAt) status = t('spiele.upToDate');
  else status = '';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface-2)', borderRadius: 16, padding: '10px 12px' }}>
      <span style={{ width: 14, height: 14, borderRadius: 5, background: g.color ?? 'var(--muted)', flex: 'none' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 17 }}>
          <b>{g.name?.[lang] ?? g.name?.en ?? g.id}</b>
          <span className="faint"> · {t('spiele.version', { version: g.version })}{g.from === 'katalog' ? ` · ${t('spiele.fromCatalog')}` : g.repo ? ` · ${g.repo}` : ''}</span>
        </div>
        {status && <div style={{ fontSize: 14, marginTop: 2, color, fontWeight: color ? 700 : undefined }}>{status}</div>}
        {canUpdate && u?.notes?.length ? <div className="faint" style={{ fontSize: 13, marginTop: 2 }}>{u.notes.join(' · ')}</div> : null}
      </div>
      {!g.git && (
        <button className="up-btn ghost small" disabled={busy || u?.checking} onClick={() => net.send('spiele:check', { gameId: g.id })}>{u?.checking ? t('spiele.checking') : t('spiele.check')}</button>
      )}
      {canUpdate && (
        <button className="up-btn small" disabled={busy || !inLobby} onClick={onUpdate}>{confirmUpdate ? t('update.confirmShort') : t('spiele.update')}</button>
      )}
      <button className="up-btn ghost small" disabled={busy || !inLobby} onClick={() => {
        if (!removing) return setRemoving(true);
        setRemoving(false);
        net.send('spiele:uninstall', { gameId: g.id });
      }} onBlur={() => setRemoving(false)}>{removing ? t('spiele.removeConfirm') : t('spiele.remove')}</button>
    </div>
  );
}

function Catalog({ sp, lang, t, busy, inLobby }: { sp: SpieleStatus; lang: string; t: T; busy: boolean; inLobby: boolean }) {
  const list = sp.catalog;
  return (
    <section>
      <div className="up-label" style={{ marginBottom: 4 }}>{t('spiele.catalog')}</div>
      <p className="faint" style={{ fontSize: 14, marginBottom: 10 }}>{t('spiele.catalogHelp')}</p>
      {!list && !sp.catalogFailed && <p className="muted" style={{ fontSize: 16 }}>{t('spiele.catalogLoading')}</p>}
      {sp.catalogFailed && !list && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="muted" style={{ fontSize: 16 }}>{t('spiele.catalogFailed')}</span>
          <button className="up-btn ghost small" onClick={() => net.send('spiele:check')}>{t('spiele.retry')}</button>
        </div>
      )}
      {list && list.length === 0 && <p className="muted" style={{ fontSize: 16 }}>{t('spiele.catalogEmpty')}</p>}
      {list && list.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {list.map((c) => <CatalogCard key={c.id} c={c} lang={lang} t={t} busy={busy} inLobby={inLobby} working={sp.busy?.id === c.id} />)}
        </div>
      )}
    </section>
  );
}

function CatalogCard({ c, lang, t, busy, inLobby, working }: { c: CatalogItem; lang: string; t: T; busy: boolean; inLobby: boolean; working: boolean }) {
  const facts = [
    c.minPlayers && c.maxPlayers ? t('spiele.players', { min: c.minPlayers, max: c.maxPlayers }) : '',
    c.minutes ? t('spiele.minutes', { n: c.minutes }) : '',
    c.author ? t('spiele.by', { author: c.author }) : '',
  ].filter(Boolean).join(' · ');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--surface-2)', borderRadius: 18, overflow: 'hidden' }}>
      <div style={{ height: 96, background: c.color ?? 'var(--purple)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        {c.cover && /^https:\/\//.test(c.cover)
          ? <img src={c.cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span className="display" style={{ fontSize: 44, fontWeight: 800, color: '#110D24' }}>{(c.name[lang] ?? c.name.en ?? c.id).slice(0, 1)}</span>}
      </div>
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        <b style={{ fontSize: 17 }}>{c.name[lang] ?? c.name.en ?? c.id}</b>
        <span className="muted" style={{ fontSize: 14, flex: 1 }}>{c.description?.[lang] ?? c.description?.en ?? ''}</span>
        {facts && <span className="faint" style={{ fontSize: 13 }}>{facts}</span>}
        {c.installedVersion
          ? <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--green)' }}>✓ {t('spiele.isInstalled')}</span>
          : !c.compatible
            ? <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--orange)' }}>{t('spiele.incompatible')}</span>
            : <button className="up-btn small" disabled={busy || !inLobby} onClick={() => net.send('spiele:install', { catalogId: c.id })}>{working ? t('spiele.installing') : t('spiele.install')}</button>}
      </div>
    </div>
  );
}

function FromGitHub({ t, busy, inLobby, working }: { t: T; busy: boolean; inLobby: boolean; working?: string }) {
  const [open, setOpen] = useState(false);
  const [repo, setRepo] = useState('');
  const [warn, setWarn] = useState(false);
  const install = async () => {
    setWarn(false);
    const r = await net.request('spiele:install', { repo: repo.trim() });
    if (r?.ok) setRepo('');
  };
  return (
    <section>
      <button className="up-btn ghost small" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? '▾' : '▸'} {t('spiele.advanced')}</button>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          <span className="muted" style={{ fontSize: 14 }}>{t('spiele.repoHelp')}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="up-input" value={repo} placeholder={t('spiele.repoPlaceholder')} autoComplete="off" spellCheck={false}
              onChange={(e) => { setRepo(e.target.value); setWarn(false); }} style={{ fontSize: 16, minHeight: 48 }} />
            {!warn && <button className="up-btn small" disabled={!repo.trim() || busy || !inLobby} onClick={() => setWarn(true)}>{working ? t('spiele.installing') : t('spiele.install')}</button>}
          </div>
          {warn && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 16, background: 'var(--surface-2)', borderLeft: '6px solid var(--orange)' }}>
              <span style={{ flex: 1, fontSize: 15 }}>{t('spiele.warning')}</span>
              <button className="up-btn small" disabled={busy} onClick={install}>{t('spiele.warningConfirm')}</button>
              <button className="up-btn ghost small" onClick={() => setWarn(false)}>{t('common.no')}</button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
