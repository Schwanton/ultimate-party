import { useState } from 'react';
import { net, useNet } from '../net';
import { useT } from '../i18n';
import { Avatar, sfx } from '../ui';

export function HostSettings({ onClose }: { onClose: () => void }) {
  const s = useNet();
  const room = s.room!;
  const host = s.host!;
  const t = useT(room.lang);
  const set = (patch: object) => net.send('settings', { patch });
  const packs = host.packs.filter((p) => p.lang === room.lang);
  const disabled = new Set(room.settings.disabledPacks);
  const togglePack = (key: string) => {
    const next = new Set(disabled);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    set({ disabledPacks: [...next] });
  };
  const times: [number, string][] = [[0.75, t('settings.timeLess')], [1, t('settings.timeNormal')], [1.5, t('settings.timeMore')], [2, t('settings.timeMuchMore')]];

  return (
    <div role="dialog" aria-modal="true" aria-label={t('settings.title')} style={{ position: 'absolute', inset: 0, zIndex: 70, background: 'rgba(10,7,22,.82)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div className="up-card anim-pop" onClick={(e) => e.stopPropagation()} style={{ width: 1000, maxHeight: 640, overflow: 'auto', padding: 32, display: 'flex', flexDirection: 'column', gap: 22, borderRadius: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 32, fontWeight: 800 }}>{t('settings.title')}</h2>
          <button className="up-btn small" onClick={onClose}>{t('settings.close')}</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 18, fontWeight: 700 }}>
              <input type="checkbox" checked={room.settings.allowPhotos} onChange={(e) => set({ allowPhotos: e.target.checked })} style={{ width: 26, height: 26, accentColor: '#FFD447' }} />
              {t('settings.photos')}
            </label>
            <SoundSettings t={t} />
            <div>
              <div className="up-label" style={{ marginBottom: 8 }}>{t('settings.time')}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {times.map(([f, label]) => (
                  <button key={f} className={`up-btn small${room.settings.timeFactor === f ? '' : ' ghost'}`} aria-pressed={room.settings.timeFactor === f} onClick={() => set({ timeFactor: f })}>{label}</button>
                ))}
              </div>
            </div>
            <div>
              <div className="up-label" style={{ marginBottom: 8 }}>{t('settings.packs')}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {packs.map((p) => {
                  const game = host.games.find((g) => g.id === p.game);
                  return (
                    <label key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 16 }}>
                      <input type="checkbox" disabled={!!p.error} checked={!disabled.has(p.key) && !p.error} onChange={() => togglePack(p.key)} style={{ width: 22, height: 22, accentColor: '#FFD447' }} />
                      <span style={{ width: 12, height: 12, borderRadius: 4, background: game?.color }} />
                      <b>{game?.name[room.lang] ?? p.game}</b> · {p.name}
                      <span className="faint">{p.error ? p.error : t('settings.packCount', { n: p.count })}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            {host.decks?.length ? (
              <div>
                <div className="up-label" style={{ marginBottom: 4 }}>{t('settings.decks')}</div>
                <p className="faint" style={{ fontSize: 14, marginBottom: 8 }}>{t('settings.decksHelp')}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {host.decks.map((d) => {
                    const game = host.games.find((g) => g.id === d.game);
                    return (
                      <div key={d.game} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 16 }}>
                        <span style={{ width: 12, height: 12, borderRadius: 4, background: game?.color }} />
                        <b style={{ flex: 1 }}>{game?.name[room.lang] ?? d.game}</b>
                        <span className="faint">{t('settings.deckLeft', { left: d.left, total: d.total })}</span>
                        <button className="up-btn ghost small" disabled={d.left === d.total} onClick={() => net.send('deck:reset', { gameId: d.game })}>{t('settings.deckShuffle')}</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {host.games.filter((g) => g.secrets?.length).map((g) => (
            <div key={g.id} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="up-label">{g.name[room.lang] ?? g.name.en}</div>
              {g.secrets!.map((sec) => (
                <SecretField key={sec.id} gameId={g.id} id={sec.id} isSet={!!g.secretsSet?.[sec.id]}
                  label={sec.label[room.lang] ?? sec.label.en} help={sec.help?.[room.lang] ?? sec.help?.en} url={sec.url} t={t} />
              ))}
            </div>
          ))}
          <div>
            <div className="up-label" style={{ marginBottom: 8 }}>{t('settings.players')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {room.players.map((p) => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface-2)', borderRadius: 16, padding: '6px 8px 6px 6px' }}>
                  <Avatar player={p} size={36} flat />
                  <span style={{ flex: 1, fontWeight: 700 }}>{p.name}</span>
                  <button className="up-btn ghost small" onClick={() => net.send('kick', { playerId: p.id })}>{t('settings.kick')}</button>
                </div>
              ))}
            </div>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SecretField({ gameId, id, isSet, label, help, url, t }: { gameId: string; id: string; isSet: boolean; label: string; help?: string; url?: string; t: (k: string) => string }) {
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState(false);
  const save = async (v: string) => {
    await net.request('secret', { gameId, id, value: v });
    setValue('');
    setSaved(true);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontWeight: 700 }}>{label} {isSet ? <span style={{ color: 'var(--green)' }}>✓ {t('settings.secretSet')}</span> : <span style={{ color: 'var(--orange)' }}>{t('settings.secretMissing')}</span>}</span>
      {help && <span className="muted" style={{ fontSize: 14 }}>{help}{url ? ' ' : ''}{url && <a href={url} target="_blank" rel="noreferrer">{t('settings.howTo')}</a>}</span>}
      <div style={{ display: 'flex', gap: 8 }}>
        <input className="up-input" type="password" autoComplete="off" placeholder={isSet ? '••••••••' : label} value={value} onChange={(e) => { setValue(e.target.value); setSaved(false); }} style={{ fontSize: 16, minHeight: 48 }} />
        <button className="up-btn small" disabled={!value.trim()} onClick={() => save(value)}>{saved ? '✓' : t('settings.save')}</button>
        {isSet && <button className="up-btn ghost small" onClick={() => save('')}>{t('settings.remove')}</button>}
      </div>
    </div>
  );
}

function SoundSettings({ t }: { t: (k: string) => string }) {
  const [fx, setFx] = useState(sfx.fxVolume);
  const [music, setMusic] = useState(sfx.musicVolume);
  const row = (label: string, value: number, set: (v: number) => void, apply: (v: number) => void) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 16 }}>
      <span style={{ width: 110 }}>{label}</span>
      <input type="range" min={0} max={1} step={0.05} value={value} style={{ flex: 1, accentColor: '#FFD447' }}
        onChange={(e) => { const v = Number(e.target.value); set(v); apply(v); }} />
    </label>
  );
  return (
    <div>
      <div className="up-label" style={{ marginBottom: 8 }}>{t('settings.sound')}</div>
      {row(t('settings.fx'), fx, setFx, (v) => { sfx.setVolumes(v, sfx.musicVolume); sfx.play('ding'); })}
      {row(t('settings.music'), music, setMusic, (v) => sfx.setVolumes(sfx.fxVolume, v))}
    </div>
  );
}
