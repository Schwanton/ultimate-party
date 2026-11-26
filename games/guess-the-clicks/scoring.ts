/**
 * Punkte bei Guess the Clicks! (seit 0.49.0).
 *
 * Entfernung = Faktor daneben (in Zehnerpotenzen): doppelt so viel ist genauso falsch wie halb so viel.
 * Daraus ergibt sich auch der Platz (gleich nah = gleicher Platz).
 *
 * Modi:
 *  - rank:     nach Platz, linear: Platz 1 = 1000, Letzter = 0, dazwischen gleichmäßig
 *  - best:     nur der Nächste bekommt 1 Punkt (bei Gleichstand alle Gleichnahen)
 *  - distance: 1000 × (1 − Zehnerpotenzen daneben ÷ Grenze); Grenze 1 (10-mal daneben = 0) oder locker 2 (100-mal)
 *  - bonus:    wie distance, dazu +250 für den Nächsten und +500 für höchstens 5 % daneben
 */
import { logDist } from './reveal';

export type ScoringMode = 'rank' | 'best' | 'distance' | 'bonus';
export const MODES: ScoringMode[] = ['rank', 'best', 'distance', 'bonus'];

export const CLOSEST_BONUS = 250;
export const EXACT_BONUS = 500;
/** „fast exakt“: höchstens 5 % daneben */
export const EXACT_FACTOR = 1.05;

/** Zehnerpotenzen daneben (0 = genau richtig, 1 = 10-mal daneben) */
export const logDistance = logDist;

/** Faktor daneben (≥ 1) */
export function factor(guess: number, answer: number) {
  return 10 ** logDist(guess, answer);
}

const round10 = (n: number) => Math.round(n / 10) * 10;

export interface Scored {
  playerId: string;
  guess: number;
  dist: number;
  place: number;
  closest: boolean;
  exact: boolean;
  points: number;
}

export function scoreRound(entries: { playerId: string; guess: number }[], answer: number, mode: ScoringMode, loose: boolean): Scored[] {
  const withDist = entries.map((e) => ({ ...e, dist: logDistance(e.guess, answer) })).sort((a, b) => a.dist - b.dist);
  const n = withDist.length;
  const limit = loose ? 2 : 1;
  return withDist.map((e) => {
    const place = withDist.filter((o) => o.dist < e.dist).length + 1;
    const closest = place === 1;
    const exact = factor(e.guess, answer) <= EXACT_FACTOR;
    const near = 1000 * Math.max(0, 1 - e.dist / limit);
    let points = 0;
    if (mode === 'best') points = closest ? 1 : 0;
    else if (mode === 'rank') points = n <= 1 ? 1000 : round10((1000 * (n - place)) / (n - 1));
    else if (mode === 'distance') points = round10(near);
    else points = round10(near) + (closest ? CLOSEST_BONUS : 0) + (exact ? EXACT_BONUS : 0);
    return { ...e, place, closest, exact, points };
  });
}
