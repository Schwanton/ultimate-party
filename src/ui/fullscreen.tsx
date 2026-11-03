import { useEffect, useState, type CSSProperties } from 'react';

type Doc = Document & { webkitFullscreenElement?: Element | null; webkitFullscreenEnabled?: boolean; webkitExitFullscreen?: () => Promise<void> };
type El = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };

const doc = () => document as Doc;

/** Kann dieser Browser Vollbild? (iPhone-Safari z. B. nicht) */
export function fullscreenSupported(): boolean {
  if (typeof document === 'undefined') return false;
  return !!(doc().fullscreenEnabled || doc().webkitFullscreenEnabled);
}

const isFull = () => !!(doc().fullscreenElement || doc().webkitFullscreenElement);

export function toggleFullscreen() {
  try {
    if (isFull()) {
      if (doc().exitFullscreen) void doc().exitFullscreen().catch(() => {});
      else void doc().webkitExitFullscreen?.();
    } else {
      const el = document.documentElement as El;
      if (el.requestFullscreen) void el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
      else void el.webkitRequestFullscreen?.();
    }
  } catch { /* nicht unterstützt */ }
}

export function useFullscreen() {
  const [full, setFull] = useState(isFull);
  useEffect(() => {
    const on = () => setFull(isFull());
    document.addEventListener('fullscreenchange', on);
    document.addEventListener('webkitfullscreenchange', on);
    return () => {
      document.removeEventListener('fullscreenchange', on);
      document.removeEventListener('webkitfullscreenchange', on);
    };
  }, []);
  return { full, supported: fullscreenSupported(), toggle: toggleFullscreen };
}

/** Knopf: Vollbild an/aus. Wird ausgeblendet, wenn der Browser kein Vollbild kann. */
export function FullscreenButton({ enter, exit, size = 52, style }: { enter: string; exit: string; size?: number; style?: CSSProperties }) {
  const { full, supported, toggle } = useFullscreen();
  if (!supported) return null;
  const label = full ? exit : enter;
  const icon = Math.round(size * 0.46);
  return (
    <button type="button" aria-label={label} title={label} aria-pressed={full} onClick={toggle}
      style={{ width: size, height: size, flex: 'none', border: 0, borderRadius: Math.round(size * 0.3), background: 'var(--surface)', color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, ...style }}>
      <svg width={icon} height={icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {full
          ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
          : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
      </svg>
    </button>
  );
}
