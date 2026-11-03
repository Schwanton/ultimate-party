/**
 * Zeitplan der Auszählung am Ende (TV und Server rechnen gleich).
 * Pro Runde: 1. ein Balken füllt sich bis zum besten 100er-Gewinn, die Spieler ploppen bei ihrem Betrag auf,
 * 2. dann kommt bei jedem sein Einsatz-Ergebnis dazu (rauf oder runter),
 * 3. erst dann wandert alles in die Balken links – und weiter zur nächsten Runde.
 */

export const TALLY = { intro: 2.5, fill: 2.2, pause: 0.5, extra: 1.8, hold: 1.1, outro: 4 };
const PER = TALLY.fill + TALLY.pause + TALLY.extra + TALLY.hold;

export interface TallyRound {
  crashAt: number;
  mult: number;
  /** Gewinn aus den gratis 100 (0 = gecrasht) */
  base: Record<string, number>;
  /** Ergebnis des eigenen Einsatzes (kann negativ sein) */
  extra: Record<string, number>;
}

export interface TallyData {
  rounds: TallyRound[];
}

export function tallyDuration(t: TallyData) {
  return TALLY.intro + t.rounds.length * PER + TALLY.outro;
}

export type TallyStage = 'intro' | 'fill' | 'extra' | 'hold' | 'done';

/** Wo steht die Auszählung nach `sec` Sekunden? progress = 0…1 innerhalb der Stufe */
export function tallyAt(t: TallyData, sec: number): { stage: TallyStage; round: number; progress: number } {
  const s = sec - TALLY.intro;
  if (s < 0) return { stage: 'intro', round: -1, progress: 0 };
  const round = Math.floor(s / PER);
  if (round >= t.rounds.length) return { stage: 'done', round: t.rounds.length, progress: 1 };
  const x = s - round * PER;
  if (x < TALLY.fill) return { stage: 'fill', round, progress: x / TALLY.fill };
  if (x < TALLY.fill + TALLY.pause) return { stage: 'fill', round, progress: 1 };
  const y = x - TALLY.fill - TALLY.pause;
  if (y < TALLY.extra) return { stage: 'extra', round, progress: y / TALLY.extra };
  return { stage: 'hold', round, progress: 1 };
}

/** Stand eines Spielers links: Runden zählen, sobald sie fertig ausgewertet sind (Haltephase) */
export function totalAt(t: TallyData, id: string, at: ReturnType<typeof tallyAt>) {
  let sum = 0;
  t.rounds.forEach((r, i) => {
    if (i < at.round || (i === at.round && at.stage === 'hold')) sum += (r.base[id] ?? 0) + (r.extra[id] ?? 0);
  });
  return sum;
}
