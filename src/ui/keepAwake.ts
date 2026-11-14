/**
 * Bildschirm wach halten (wie bei einem laufenden Film): Fernseher und Handys sollen
 * während UP! nicht in den Ruhezustand gehen.
 *
 * 1) Wake-Lock-Schnittstelle des Browsers – geht nur über https oder localhost
 *    (also am Rechner, auf dem UP! läuft). Wird nach dem Zurückkehren in den Tab neu angefordert.
 * 2) Sonst (Handys im WLAN über http): ein winziges, stummes Video läuft unsichtbar in
 *    Endlosschleife. Das starten Browser erst nach einer Berührung – deshalb beim ersten Tippen.
 */
import { useEffect } from 'react';

// 4 s schwarzes 16×16-Video mit stummer Tonspur (2,7 KB)
const VIDEO = 'data:video/mp4;base64,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';

type Sentinel = { release(): Promise<void>; released?: boolean };

export function useKeepAwake(active = true) {
  useEffect(() => {
    if (!active) return;
    let lock: Sentinel | null = null;
    let video: HTMLVideoElement | null = null;
    let stopped = false;
    const nav = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<Sentinel> } };

    const requestLock = async () => {
      if (stopped || document.visibilityState !== 'visible' || !nav.wakeLock) return false;
      try {
        if (!lock || lock.released) lock = await nav.wakeLock.request('screen');
        return true;
      } catch {
        return false;
      }
    };

    const startVideo = () => {
      if (stopped) return;
      if (!video) {
        video = document.createElement('video');
        video.setAttribute('playsinline', '');
        video.setAttribute('muted', '');
        video.muted = true;
        video.loop = true;
        video.src = VIDEO;
        video.setAttribute('aria-hidden', 'true');
        Object.assign(video.style, { position: 'fixed', width: '1px', height: '1px', opacity: '0.01', pointerEvents: 'none', left: '0', top: '0' });
        document.body.appendChild(video);
      }
      video.play().catch(() => { /* klappt beim nächsten Tippen */ });
    };

    const kick = async () => {
      if (!(await requestLock())) startVideo();
    };

    const onVisible = () => { if (document.visibilityState === 'visible') void kick(); };
    void kick();
    document.addEventListener('visibilitychange', onVisible);
    // Videos dürfen erst nach einer Berührung laufen – bei jeder Berührung prüfen, ob noch alles läuft
    window.addEventListener('pointerdown', kick, { passive: true });
    window.addEventListener('keydown', kick);

    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pointerdown', kick);
      window.removeEventListener('keydown', kick);
      void lock?.release().catch(() => {});
      if (video) { video.pause(); video.remove(); }
    };
  }, [active]);
}
