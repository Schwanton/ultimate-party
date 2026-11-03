/**
 * Zeitplan der Zahlenstrahl-Auflösung (wird von Server, TV und Handys gleich berechnet).
 *
 * Die Säule steigt auf einer logarithmischen Skala (10, 100, 1.000 …). Die Geschwindigkeit hängt vom
 * Abstand zum nächsten „spannenden Punkt“ darüber ab – einem Tipp oder der echten Zahl:
 * weit weg = schnell, nah dran = langsam. Nach einem Tipp beschleunigt sie wieder.
 *
 * Ablauf: 1) hoch bis zur echten Zahl  2) kurze Pause, die echte Zahl wird gezeigt
 *         3) weiter hoch bis zum höchsten Tipp darüber (falls es welche gibt)  4) Gewinner.
 * Die Skala wächst mit der Säule mit, damit sie nichts über die Größenordnung verrät.
 */

export const lg = (v: number) => Math.log10(Math.max(0, v) + 1);
export const unlg = (x: number) => Math.max(0, 10 ** x - 1);

const FPS = 30;
const MAX_SPEED = 2.4; // Zehnerpotenzen pro Sekunde
const K = 1.2;
const MIN_NEAR_TARGET = 0.035;
const MIN_NEAR_GUESS = 0.28;
const MAX_UP = 20; // Sekunden bis zur echten Zahl (höchstens)
const MAX_OVER = 9; // Sekunden für die Fahrt über die echte Zahl hinaus (höchstens)
/** Pause an der echten Zahl, bevor es weitergeht */
export const HOLD = 2.2;
export const START_DELAY = 1.2;
/** Die Spitze der Säule bleibt bei diesem Anteil der Skalenhöhe */
const HEAD = 0.78;
const MIN_TOP = 2; // Skala zeigt anfangs bis 100

export interface Timeline {
  /** Position (log-Skala) pro Frame */
  frames: number[];
  fps: number;
  /** Dauer der Fahrt in Sekunden (ohne START_DELAY) */
  seconds: number;
  /** Sekunden bis die echte Zahl erreicht ist */
  targetAt: number;
  /** Sekunden, ab denen die Säule über die echte Zahl hinaus fährt */
  overFrom: number;
  /** Gibt es Tipps über der echten Zahl? */
  hasOver: boolean;
  /** Höchste Position am Ende */
  end: number;
}

function ride(from: number, to: number, stops: number[], minEnd: number, factor: number) {
  const frames: number[] = [];
  let x = from;
  let i = 0;
  const dt = 1 / FPS;
  while (x < to && frames.length < FPS * 120) {
    while (i < stops.length && stops[i] <= x) i++;
    const next = i < stops.length ? stops[i] : to;
    const min = next === to ? minEnd : MIN_NEAR_GUESS;
    const speed = Math.min(MAX_SPEED, min + K * (next - x)) * factor;
    x = Math.min(to, x + speed * dt);
    frames.push(x);
  }
  return frames;
}

function limited(from: number, to: number, stops: number[], minEnd: number, max: number) {
  let f = ride(from, to, stops, minEnd, 1);
  if (f.length / FPS > max) f = ride(from, to, stops, minEnd, f.length / FPS / max);
  return f;
}

export function buildTimeline(target: number, guesses: number[]): Timeline {
  const tx = lg(target);
  const gs = [...new Set(guesses.map(lg))].sort((a, b) => a - b);
  const below = gs.filter((g) => g > 0 && g < tx);
  const above = gs.filter((g) => g > tx);
  const up = [0, ...limited(0, tx, below, MIN_NEAR_TARGET, MAX_UP)];
  const targetAt = (up.length - 1) / FPS;
  const frames = [...up];
  let overFrom = targetAt;
  if (above.length) {
    for (let i = 0; i < HOLD * FPS; i++) frames.push(tx);
    overFrom = (frames.length - 1) / FPS;
    const top = above[above.length - 1];
    frames.push(...limited(tx, top, above.slice(0, -1), MIN_NEAR_GUESS, MAX_OVER));
  }
  return { frames, fps: FPS, seconds: (frames.length - 1) / FPS, targetAt, overFrom, hasOver: above.length > 0, end: frames[frames.length - 1] };
}

/** Position zur Zeit t (Sekunden seit Beginn der Fahrt) */
export function positionAt(tl: Timeline, t: number): number {
  if (t <= 0) return 0;
  const f = t * tl.fps;
  const i = Math.floor(f);
  if (i >= tl.frames.length - 1) return tl.frames[tl.frames.length - 1];
  return tl.frames[i] + (tl.frames[i + 1] - tl.frames[i]) * (f - i);
}

/** Sichtbares oberes Ende der Skala – wächst mit der Säule */
export function scaleTop(pos: number) {
  return Math.max(MIN_TOP, pos / HEAD);
}

/** Gesamtdauer der Auflösung inkl. Start-Verzögerung (für den Server) */
export function revealSeconds(target: number, guesses: number[]) {
  return START_DELAY + buildTimeline(target, guesses).seconds;
}
