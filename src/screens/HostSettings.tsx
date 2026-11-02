import { net, useNet } from '../net';
import { useT } from '../i18n';
import { Avatar } from '../ui';

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
          </div>

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
  );
}
