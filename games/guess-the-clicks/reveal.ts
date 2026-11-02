/**
 * Zeitplan der Zahlenstrahl-Auflösung (wird von Server, TV und Handys gleich berechnet).
 *
 * Die Säule steigt auf einer logarithmischen Skala (10, 100, 1.000 …). Die Geschwindigkeit hängt vom
 * Abstand zum nächsten „spannenden Punkt“ darüber ab – einem Tipp oder der echten Zahl:
 * weit weg = schnell, nah dran = langsam. Nach einem Tipp beschleunigt sie wieder.
 */

export const lg = (v: number) => Math.log10(Math.max(0, v) + 1);
export const unlg = (x: number) => Math.max(0, 10 ** x - 1);

const FPS = 30;
const MAX_SPEED = 2.4; // Zehnerpotenzen pro Sekunde
const K = 1.2;
const MIN_NEAR_TARGET = 0.035;
const MIN_NEAR_GUESS = 0.28;
const MAX_SECONDS = 22;
export const START_DELAY = 1.2;

export interface Timeline {
  /** Position (log-Skala) pro Frame */
  frames: number[];
  fps: number;
  /** Dauer der Fahrt in Sekunden (ohne START_DELAY) */
  seconds: number;
  /** Oberes Ende der Skala (log) */
  top: number;
}

function simulate(target: number, guesses: number[], factor: number) {
  const tx = lg(target);
  const stops = [...new Set(guesses.map(lg).filter((g) => g > 0 && g < tx))].sort((a, b) => a - b);
  const frames: number[] = [0];
  let x = 0;
  let i = 0;
  const dt = 1 / FPS;
  while (x < tx && frames.length < FPS * 120) {
    while (i < stops.length && stops[i] <= x) i++;
    const next = i < stops.length ? stops[i] : tx;
    const dist = next - x;
    const min = next === tx ? MIN_NEAR_TARGET : MIN_NEAR_GUESS;
    const speed = Math.min(MAX_SPEED, min + K * dist) * factor;
    x = Math.min(tx, x + speed * dt);
    frames.push(x);
  }
  return frames;
}

export function buildTimeline(target: number, guesses: number[]): Timeline {
  let frames = simulate(target, guesses, 1);
  if (frames.length / FPS > MAX_SECONDS) frames = simulate(target, guesses, frames.length / FPS / MAX_SECONDS);
  const highest = Math.max(target, ...guesses, 10);
  return { frames, fps: FPS, seconds: frames.length / FPS, top: Math.max(1.5, lg(highest) + 0.35) };
}

/** Position zur Zeit t (Sekunden seit Beginn der Fahrt) */
export function positionAt(tl: Timeline, t: number): number {
  if (t <= 0) return 0;
  const f = t * tl.fps;
  const i = Math.floor(f);
  if (i >= tl.frames.length - 1) return tl.frames[tl.frames.length - 1];
  return tl.frames[i] + (tl.frames[i + 1] - tl.frames[i]) * (f - i);
}

/** Gesamtdauer der Auflösung inkl. Start-Verzögerung (für den Server) */
export function revealSeconds(target: number, guesses: number[]) {
  return START_DELAY + buildTimeline(target, guesses).seconds;
}
