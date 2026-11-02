import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { qrPath } from './qr';
import { sfx } from './sound';

/** Feste 1280×720-Bühne, die sich auf jede Bildschirmgröße skaliert (TV, Laptop, Beamer). */
export function Stage({ children }: { children: ReactNode }) {
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / 1280, window.innerHeight / 720));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return (
    <div className="up-stage-wrap">
      <div className="up-stage" style={{ transform: `scale(${scale})` }}>
        <div className="up-stage-inner">{children}</div>
      </div>
    </div>
  );
}

export function Logo({ size = 38 }: { size?: number }) {
  return <span className="up-logo" style={{ fontSize: size }}>UP<span>!</span></span>;
}

/** Kopfzeile auf dem TV: Spielname, Rundeninfo, rechts z. B. Timer */
export function HostHeader({ title, color, info, right }: { title: string; color: string; info?: ReactNode; right?: ReactNode }) {
  const dark = isLight(color);
  return (
    <header style={{ height: 72, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span className="up-tag" style={{ background: color, color: dark ? '#110D24' : '#fff', boxShadow: `0 5px 0 ${shade(color)}` }}>{title}</span>
        {info && <span style={{ fontSize: 18, fontWeight: 500, color: 'var(--muted)' }}>{info}</span>}
      </div>
      {right}
    </header>
  );
}

/** Große, zentrierte Überschrift auf dem TV (z. B. Prompt oder Frage) */
export function HostPrompt({ label, children, size = 46 }: { label?: ReactNode; children: ReactNode; size?: number }) {
  return (
    <section style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 8 }} className="anim-up">
      {label && <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: 2, color: 'var(--muted)', textTransform: 'uppercase' }}>{label}</span>}
      <h1 style={{ fontSize: size, fontWeight: 800, lineHeight: 1.15 }}>{children}</h1>
    </section>
  );
}

const CONFETTI_COLORS = ['#FFD447', '#36D6F5', '#FFFFFF', '#4BE3A1', '#9B7BFF', '#E8336F'];

export function Confetti({ pieces = 28, loop = false, silent = false }: { pieces?: number; loop?: boolean; silent?: boolean }) {
  useEffect(() => {
    if (!silent) sfx.play('cheer');
  }, [silent]);
  const items = useMemo(() => Array.from({ length: pieces }, (_, i) => ({
    left: (i / pieces) * 100 + Math.random() * (100 / pieces),
    w: 8 + Math.random() * 8, h: 8 + Math.random() * 14, round: Math.random() < 0.35,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length], dur: 2.2 + Math.random() * 1.2, delay: Math.random() * (loop ? 3 : 0.5),
  })), [pieces, loop]);
  return (
    <div aria-hidden="true" style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 40, overflow: 'hidden' }}>
      {items.map((p, i) => (
        <span key={i} style={{
          position: 'absolute', top: -24, left: `${p.left}%`, width: p.w, height: p.round ? p.w : p.h,
          borderRadius: p.round ? '50%' : 3, background: p.color,
          animation: `upFall ${p.dur}s ease-in ${p.delay}s ${loop ? 'infinite' : 'both'}`,
        }} />
      ))}
    </div>
  );
}

export function QrCode({ text, size = 168 }: { text: string; size?: number }) {
  const { size: n, d } = useMemo(() => qrPath(text), [text]);
  return (
    <div style={{ width: size, height: size, background: '#fff', borderRadius: 18, padding: 12, flex: 'none' }}>
      <svg width={size - 24} height={size - 24} viewBox={`0 0 ${n} ${n}`} role="img" aria-label={text} shapeRendering="crispEdges">
        <path d={d} fill="#110D24" />
      </svg>
    </div>
  );
}

/** Handy-Bildschirm „Warte …“ */
export function PhoneWait({ title, text, emoji }: { title: string; text?: string; emoji?: ReactNode }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, textAlign: 'center', padding: '24px 8px' }} className="anim-fade">
      {emoji}
      <h2 style={{ fontSize: 28, fontWeight: 800 }}>{title}</h2>
      {text && <p className="muted" style={{ fontSize: 17 }}>{text}</p>}
    </div>
  );
}

/** Texteingabe mit Absenden-Button fürs Handy */
export function TextAnswer({
  onSubmit, placeholder, button, maxLength = 60, multiline = false, autoFocus = true, error,
}: {
  onSubmit: (text: string) => void; placeholder?: string; button: string; maxLength?: number; multiline?: boolean; autoFocus?: boolean; error?: string | null;
}) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) setTimeout(() => ref.current?.focus(), 50);
  }, [autoFocus]);
  const submit = () => {
    const v = text.trim();
    if (v) {
      onSubmit(v);
      setText('');
    }
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {multiline ? (
        <textarea ref={ref} className="up-input" rows={3} maxLength={maxLength} placeholder={placeholder} value={text}
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }} />
      ) : (
        <input ref={ref} className="up-input" maxLength={maxLength} placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)}
          autoComplete="off" autoCorrect="off" enterKeyHint="send" />
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }} className="faint">
        <span>{error ? <span style={{ color: '#FF9AA5', fontWeight: 700 }}>{error}</span> : null}</span>
        <span>{text.length}/{maxLength}</span>
      </div>
      <button type="submit" className="up-btn big full" disabled={!text.trim()}>{button}</button>
    </form>
  );
}

export interface ChoiceOption {
  id: string;
  text: ReactNode;
  disabled?: boolean;
  color?: string;
}

/** Große Auswahl-Buttons fürs Handy */
export function ChoiceList({ options, selected, onPick, locked }: { options: ChoiceOption[]; selected?: string | null; onPick: (id: string) => void; locked?: boolean }) {
  return (
    <div role="radiogroup" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {options.map((o) => {
        const isSel = selected === o.id;
        const style: CSSProperties = o.color ? { background: o.color, color: isLight(o.color) ? '#110D24' : '#fff', boxShadow: `0 5px 0 ${shade(o.color)}` } : {};
        return (
          <button key={o.id} type="button" role="radio" aria-checked={isSel} disabled={o.disabled || locked}
            className={`up-choice${isSel ? ' selected' : ''}${selected && !isSel ? ' dim' : ''}`} style={style} onClick={() => onPick(o.id)}>
            {o.text}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Farben ---------- */

export function isLight(hex: string): boolean {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
}

export function shade(hex: string, amount = 0.32): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const f = (c: number) => Math.max(0, Math.round(c * (1 - amount))).toString(16).padStart(2, '0');
  return `#${f((n >> 16) & 255)}${f((n >> 8) & 255)}${f(n & 255)}`;
}
