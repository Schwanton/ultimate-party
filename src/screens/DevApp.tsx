import { useEffect, useState } from 'react';
import { Logo } from '../ui';

const NAMES = ['Anna', 'Ben', 'Clara', 'Deniz', 'Emil', 'Fatma', 'Gustav', 'Hanna', 'Ilias', 'Jana', 'Kai', 'Lena'];

/**
 * Entwicklermodus: TV und mehrere Handys nebeneinander in einem Fenster.
 * Zusätzliche Bots gibt es über den Button „+ Bots“ in der TV-Lobby.
 */
export function DevApp() {
  const [code, setCode] = useState<string | null>(null);
  const [phones, setPhones] = useState(() => Number(new URLSearchParams(location.search).get('phones') ?? 3));
  const [session] = useState(() => Math.random().toString(36).slice(2, 6));

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin === location.origin && e.data?.type === 'up:room') setCode(e.data.code);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 12, padding: 12 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <Logo size={24} />
        <h1 style={{ fontSize: 20 }}>Entwicklermodus</h1>
        <span className="up-chip">Raum <b>{code ?? '…'}</b></span>
        <span style={{ flex: 1 }} />
        <span className="muted" style={{ fontSize: 14 }}>Handys: {phones}</span>
        <button className="up-btn ghost small" onClick={() => setPhones((n) => Math.max(0, n - 1))}>−</button>
        <button className="up-btn ghost small" onClick={() => setPhones((n) => Math.min(12, n + 1))}>+</button>
      </header>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 12 }}>
        <iframe title="TV" src={`/host?slot=dev-${session}`} style={{ flex: '1 1 60%', border: 0, borderRadius: 16, background: '#000', minWidth: 0 }} />
        <div style={{ flex: '1 1 40%', overflow: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12, alignContent: 'start' }}>
          {code && Array.from({ length: phones }, (_, i) => (
            <iframe key={`${code}-${i}`} title={NAMES[i]}
              src={`/?r=${code}&slot=dev-${session}-${i}&name=${encodeURIComponent(NAMES[i % NAMES.length])}&auto=1`}
              style={{ width: '100%', height: 480, border: '2px solid var(--surface-2)', borderRadius: 24, background: 'var(--bg)' }} />
          ))}
        </div>
      </div>
    </div>
  );
}
