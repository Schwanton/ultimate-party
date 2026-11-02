import { useEffect, useRef, useState } from 'react';
import { net } from '../net';
import { sfx } from './sound';

/** Aktuelle Serverzeit, aktualisiert sich regelmäßig. */
export function useServerNow(intervalMs = 200): number {
  const [now, setNow] = useState(() => Date.now() + net.state.offset);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + net.state.offset), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export type Urgency = 'calm' | 'warn' | 'critical';

export function useCountdown(deadline?: number, duration?: number) {
  const now = useServerNow(200);
  if (!deadline) return { seconds: 0, fraction: 0, urgency: 'calm' as Urgency, active: false };
  const ms = Math.max(0, deadline - now);
  const seconds = Math.ceil(ms / 1000);
  const total = duration ?? 30000;
  const short = total <= 12000;
  const urgency: Urgency = ms <= 0 ? 'calm' : seconds <= (short ? 3 : 5) ? 'critical' : seconds <= (short ? 5 : 8) ? 'warn' : 'calm';
  return { seconds, fraction: Math.min(1, ms / total), urgency, active: ms > 0 };
}

const COLORS: Record<Urgency, string> = { calm: '#FFD447', warn: '#FF9F43', critical: '#FF3B4E' };

export function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch { /* nicht unterstützt */ }
}

/** Runder Timer für den großen Bildschirm – mit Zeitdruck-Effekten in den letzten Sekunden. */
export function HostTimer({ deadline, duration, size = 72 }: { deadline?: number; duration?: number; size?: number }) {
  const { seconds, fraction, urgency, active } = useCountdown(deadline, duration);
  // Ticken in den letzten Sekunden, Signal bei Zeitablauf
  const lastSec = useRef<number | null>(null);
  useEffect(() => {
    if (!deadline) return;
    if (lastSec.current !== null && seconds !== lastSec.current) {
      if (active && urgency === 'critical') sfx.play('tickUrgent');
      else if (active && urgency === 'warn') sfx.play('tick');
      else if (!active && lastSec.current > 0 && seconds === 0) sfx.play('timeUp');
    }
    lastSec.current = seconds;
  }, [seconds, active, urgency, deadline]);
  if (!deadline) return null;
  const color = COLORS[urgency];
  const r = size / 2 - 6;
  const circ = 2 * Math.PI * r;
  const beat = urgency === 'critical' ? 'upBeat .5s ease-in-out infinite' : urgency === 'warn' ? 'upBeat .8s ease-in-out infinite' : active ? 'upTick 1s ease-in-out infinite' : undefined;
  return (
    <>
      {active && urgency !== 'calm' && (
        <div aria-hidden="true" style={{
          position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 50,
          boxShadow: urgency === 'critical' ? 'inset 0 0 180px 30px rgba(255,59,78,.75)' : 'inset 0 0 120px 10px rgba(255,159,67,.5)',
          animation: `upVignette ${urgency === 'critical' ? '.5s' : '1s'} ease-in-out infinite`,
        }} />
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {active && urgency === 'critical' && (
          <span className="up-tag" style={{ background: 'var(--red)', color: '#fff', boxShadow: '0 5px 0 var(--red-d)', animation: 'upJitter .25s linear infinite' }}>!!!</span>
        )}
        <div role="timer" aria-label={`${seconds}`} style={{ position: 'relative', width: size, height: size, animation: beat }}>
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
            <circle cx={size / 2} cy={size / 2} r={r} fill={urgency === 'critical' ? '#3A0F1D' : '#1C1738'} stroke="#262048" strokeWidth="8" />
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
              strokeDasharray={`${(fraction * circ).toFixed(1)} ${circ.toFixed(1)}`} transform={`rotate(-90 ${size / 2} ${size / 2})`}
              style={{ transition: 'stroke-dasharray .25s linear, stroke .3s' }} />
          </svg>
          <span className="display" style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: urgency === 'critical' ? size * 0.42 : size * 0.36, color: urgency === 'calm' ? '#fff' : color,
          }}>{seconds}</span>
        </div>
      </div>
    </>
  );
}

/** Zeitbalken fürs Handy – wird dicker, rot und pulsiert in den letzten Sekunden. */
export function PhoneTimer({ deadline, duration, hurryText }: { deadline?: number; duration?: number; hurryText?: string }) {
  const { seconds, fraction, urgency, active } = useCountdown(deadline, duration);
  const vibrated = useRef<number | null>(null);
  useEffect(() => {
    if (urgency === 'critical' && active && vibrated.current !== deadline) {
      vibrated.current = deadline ?? null;
      vibrate([80, 60, 80]);
    }
  }, [urgency, active, deadline]);
  if (!deadline) return null;
  const color = COLORS[urgency];
  const urgent = urgency !== 'calm' && active;
  return (
    <>
      {urgency === 'critical' && active && (
        <div aria-hidden="true" style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 50, boxShadow: 'inset 0 0 70px 12px rgba(255,59,78,.7)', animation: 'upVignette .5s ease-in-out infinite' }} />
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div role="timer" style={{ flex: 1, height: urgent ? 16 : 10, borderRadius: 999, background: 'var(--surface-2)', overflow: 'hidden', transition: 'height .3s' }}>
          <div style={{
            height: '100%', borderRadius: 999, width: `${fraction * 100}%`, background: color,
            transition: 'width .25s linear, background .3s',
            animation: urgent ? `upBarPulse ${urgency === 'critical' ? '.5s' : '.9s'} ease-in-out infinite` : undefined,
          }} />
        </div>
        <span className="display" style={{
          width: 36, textAlign: 'right', fontWeight: 800, fontSize: urgency === 'critical' ? 26 : 20, color: urgent ? color : '#fff',
          animation: urgency === 'critical' && active ? 'upBeat .5s ease-in-out infinite' : undefined,
        }}>{seconds}</span>
      </div>
      {urgency === 'critical' && active && hurryText && (
        <p role="alert" className="display" style={{ textAlign: 'center', fontWeight: 800, fontSize: 20, color, animation: 'upJitter .3s linear infinite' }}>{hurryText}</p>
      )}
    </>
  );
}
