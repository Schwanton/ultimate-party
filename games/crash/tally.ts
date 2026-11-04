/**
 * Zeitplan der Auszählung am Ende (TV und Server rechnen gleich).
 * Pro Runde: 1. ein Balken füllt sich bis zum besten 100er-Gewinn, die Spieler ploppen bei ihrem Betrag auf,
 * 2. dann kommt bei jedem sein Einsatz-Ergebnis dazu (rauf oder runter),
 * 3. dann fließen die Beträge nacheinander in die Balken links – und weiter zur nächsten Runde.
 * Hat es alle erwischt, bleibt der Balken leer und grau (kürzer).
 */

export const TALLY = { intro: 2, outro: 4 };

export interface TallyRound {
  crashAt: number;
  mult: number;
  /** Gewinn aus den gratis 100 (0 = gecrasht) */
  base: Record<string, number>;
  /** Ergebnis des eigenen Einsatzes (kann negativ sein) */
  extra: Record<string, number>;
  /** gesetzter Prozentsatz (0/10/25/100) */
  pct?: Record<string, number>;
  /** Kurs beim Aussteigen (fehlt = gecrasht) */
  cm?: Record<string, number>;
  /** Option „Letzter raus“: wer den Bonus bekommen hat (steckt schon in extra) */
  last?: string[];
  lastBonus?: number;
}

export interface TallyData {
  rounds: TallyRound[];
}

export const allBusted = (r: TallyRound) => !Object.values(r.base).some((v) => v > 0);
const hasExtra = (r: TallyRound) => Object.values(r.extra).some((v) => v !== 0);

/** Dauer der Abschnitte einer Runde in Sekunden */
export function phases(r: TallyRound) {
  if (allBusted(r)) return { fill: 0, pause: 0.9, extra: hasExtra(r) ? 1.1 : 0, hold: hasExtra(r) ? 1 : 0.3 };
  return { fill: 1.6, pause: 0.3, extra: hasExtra(r) ? 1.5 : 0, hold: 1.7 };
}
const roundLen = (r: TallyRound) => {
  const p = phases(r);
  return p.fill + p.pause + p.extra + p.hold;
};

export function tallyDuration(t: TallyData) {
  return TALLY.intro + t.rounds.reduce((a, r) => a + roundLen(r), 0) + TALLY.outro;
}

export type TallyStage = 'intro' | 'fill' | 'extra' | 'hold' | 'done';

/** Wo steht die Auszählung nach `sec` Sekunden? progress = 0…1 innerhalb der Stufe, holdSec = Sekunden in der Haltephase */
export function tallyAt(t: TallyData, sec: number): { stage: TallyStage; round: number; progress: number; holdSec: number } {
  let s = sec - TALLY.intro;
  if (s < 0) return { stage: 'intro', round: -1, progress: 0, holdSec: 0 };
  for (let i = 0; i < t.rounds.length; i++) {
    const p = phases(t.rounds[i]);
    const len = p.fill + p.pause + p.extra + p.hold;
    if (s >= len) {
      s -= len;
      continue;
    }
    if (s < p.fill) return { stage: 'fill', round: i, progress: s / p.fill, holdSec: 0 };
    if (s < p.fill + p.pause) return { stage: 'fill', round: i, progress: 1, holdSec: 0 };
    const y = s - p.fill - p.pause;
    if (y < p.extra) return { stage: 'extra', round: i, progress: y / p.extra, holdSec: 0 };
    return { stage: 'hold', round: i, progress: (y - p.extra) / Math.max(0.01, p.hold), holdSec: y - p.extra };
  }
  return { stage: 'done', round: t.rounds.length, progress: 1, holdSec: 0 };
}

const ease = (x: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 3);

/** Wie weit ist der Betrag dieses Spielers schon nach links geflossen? (nacheinander, größte zuerst) */
export function flowFraction(r: TallyRound, id: string, holdSec: number) {
  return ease((holdSec - flowDelay(r, id)) / FLOW_SEC);
}

const FLOW_SEC = 0.5;
function flowDelay(r: TallyRound, id: string) {
  const amounts = Object.keys(r.base).map((k) => ({ k, v: Math.abs((r.base[k] ?? 0) + (r.extra[k] ?? 0)) })).sort((a, b) => b.v - a.v);
  const idx = amounts.findIndex((a) => a.k === id);
  return Math.min(0.12 * Math.max(0, idx), 0.6);
}

/** Sekunde der Haltephase, in der der Betrag links angekommen ist */
export const arrivalAt = (r: TallyRound, id: string) => flowDelay(r, id) + FLOW_SEC;

/** Stand eines Spielers links (während der Haltephase fließt der Rundenbetrag nach und nach dazu) */
export function totalAt(t: TallyData, id: string, at: ReturnType<typeof tallyAt>) {
  let sum = 0;
  t.rounds.forEach((r, i) => {
    const v = (r.base[id] ?? 0) + (r.extra[id] ?? 0);
    if (i < at.round) sum += v;
    else if (i === at.round && at.stage === 'hold') sum += Math.round(v * flowFraction(r, id, at.holdSec));
  });
  return sum;
}
