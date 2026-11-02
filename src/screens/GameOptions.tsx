import { resolveOptions, type GameManifest, type Lang } from '@up/sdk';
import { net } from '../net';

/** Einstellungen eines Spiels (Rundenanzahl usw.) – auf dem TV und auf dem Handy des VIP */
export function GameOptionsForm({ game, values, lang, compact = false, disabled = false }: {
  game: GameManifest; values: Record<string, unknown> | undefined; lang: Lang; compact?: boolean; disabled?: boolean;
}) {
  const defs = game.options ?? [];
  const current = resolveOptions(defs, values);
  const set = (id: string, value: number | string) => net.send('gameOption', { gameId: game.id, id, value });
  if (!defs.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 12 : 18 }}>
      {defs.map((d) => {
        const label = d.label[lang] ?? d.label.en;
        const help = d.help?.[lang] ?? d.help?.en;
        const v = current[d.id];
        return (
          <div key={d.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: compact ? 15 : 18 }}>{label}</span>
            {help && <span className="muted" style={{ fontSize: compact ? 13 : 15, marginTop: -4 }}>{help}</span>}
            {d.choices ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {d.choices.map((c) => (
                  <button key={String(c.value)} type="button" disabled={disabled} aria-pressed={v === c.value}
                    className={`up-btn small${v === c.value ? '' : ' ghost'}`} onClick={() => set(d.id, c.value)}>
                    {c.label[lang] ?? c.label.en}
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button type="button" className="up-btn ghost small" disabled={disabled || (v as number) <= (d.min ?? -Infinity)}
                  aria-label="−" onClick={() => set(d.id, (v as number) - (d.step ?? 1))} style={{ width: 52 }}>−</button>
                <span className="display" style={{ minWidth: 56, textAlign: 'center', fontSize: 28, fontWeight: 800 }}>{v}</span>
                <button type="button" className="up-btn ghost small" disabled={disabled || (v as number) >= (d.max ?? Infinity)}
                  aria-label="+" onClick={() => set(d.id, (v as number) + (d.step ?? 1))} style={{ width: 52 }}>+</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Kurze Zusammenfassung, z. B. „5 Runden · Modus: rotierend“ */
export function optionsSummary(game: GameManifest, values: Record<string, unknown> | undefined, lang: Lang): string {
  const defs = game.options ?? [];
  const current = resolveOptions(defs, values);
  return defs.map((d) => {
    const v = current[d.id];
    const shown = d.choices ? (d.choices.find((c) => c.value === v)?.label[lang] ?? String(v)) : String(v);
    return `${d.label[lang] ?? d.label.en}: ${shown}`;
  }).join(' · ');
}
