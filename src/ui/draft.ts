/**
 * Entwürfe automatisch übertragen – damit bei Zeitablauf oder wackeligem WLAN nichts verloren geht.
 *
 *   useDraft(text, (v) => send({ type: 'answerDraft', text: v }), view.deadline);
 *
 * - schickt den aktuellen Stand kurz nach jeder Änderung (gebündelt),
 * - schickt ihn in den letzten Sekunden mehrmals erneut (5 / 3 / 2 / 1 / 0,4 s vorher und 0,3 s danach),
 * - schickt ihn, wenn die App in den Hintergrund geht oder die Ansicht verschwindet,
 * - und nach einem Verbindungsabbruch automatisch noch einmal (Aktionen mit `draft: true`, siehe ControllerApp).
 *
 * Der Server nimmt Entwürfe bis kurz nach Ablauf an (INPUT_GRACE) und wertet sie aus,
 * wenn jemand nicht selbst auf „Abschicken“ gedrückt hat.
 */

import { useEffect, useRef } from 'react';
import { net } from '../net';

const FINAL_PUSHES = [5, 3, 2, 1, 0.4, -0.3]; // Sekunden vor Ablauf (negativ = danach)

export function useDraft<T>(value: T, push: ((value: T) => void) | null | undefined, deadline?: number, opts: { debounceMs?: number; signature?: (value: T) => string; enabled?: boolean } = {}) {
  const { debounceMs = 600, signature = defaultSignature, enabled = true } = opts;
  const latest = useRef(value);
  const pushRef = useRef(push);
  const sent = useRef<string>(signature(value));
  latest.current = value;
  pushRef.current = push;
  const active = enabled && !!push;

  const flush = (force: boolean) => {
    const fn = pushRef.current;
    if (!fn) return;
    const sig = signature(latest.current);
    if (!force && sig === sent.current) return;
    sent.current = sig;
    fn(latest.current);
  };

  // Nach jeder Änderung (gebündelt)
  const sig = signature(value);
  useEffect(() => {
    if (!active || sig === sent.current) return;
    const id = setTimeout(() => flush(false), debounceMs);
    return () => clearTimeout(id);
  }, [sig, active]); // eslint-disable-line react-hooks/exhaustive-deps

  // Kurz vor Ablauf mehrmals – auch wenn sich nichts geändert hat (falls eine Nachricht verloren ging)
  useEffect(() => {
    if (!active || !deadline) return;
    const now = Date.now() + net.state.offset;
    const ids = FINAL_PUSHES.map((s) => deadline - s * 1000 - now)
      .filter((ms) => ms > 0)
      .map((ms) => setTimeout(() => hasContent(latest.current) && flush(true), ms));
    return () => ids.forEach(clearTimeout);
  }, [deadline, active]); // eslint-disable-line react-hooks/exhaustive-deps

  // App geht in den Hintergrund / Ansicht verschwindet
  useEffect(() => {
    if (!active) return;
    const onHide = () => document.visibilityState === 'hidden' && flush(false);
    const onPageHide = () => flush(false);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
      flush(false);
    };
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
}

function hasContent(v: unknown) {
  if (v == null) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function defaultSignature(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (v == null) return '';
  // Zeichnungen: Anzahl Striche + Punkte + letzter Punkt reicht als Fingerabdruck
  if (Array.isArray(v)) {
    let pts = 0;
    let last = '';
    for (const s of v as { p?: number[]; c?: number }[]) {
      pts += s?.p?.length ?? 0;
      last = `${s?.c}:${s?.p?.at(-2)},${s?.p?.at(-1)}`;
    }
    return `${v.length}/${pts}/${last}`;
  }
  return JSON.stringify(v);
}
