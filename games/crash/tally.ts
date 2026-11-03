/**
 * Zeitplan der Auszählung am Ende (TV und Server rechnen gleich).
 * 1. Runde für Runde füllt sich ein Balken bis zum besten Ergebnis, die Beträge wandern zu den Spielern.
 * 2. Danach kommen die Zusatz-Einsätze dazu – vom Letzten zum Ersten.
 */

export const TALLY = { intro: 2.5, fill: 2.2, hold: 1.3, extrasIntro: 3, perExtra: 2.2, outro: 3 };

export interface TallyData {
  /** pro Runde: Grundgewinn (100er-Topf) je Spieler, 0 = gecrasht */
  rounds: { crashAt: number; mult: number; base: Record<string, number> }[];
  /** Summe der Zusatz-Einsätze je Spieler (kann negativ sein) */
  extra: Record<string, number>;
  /** Reihenfolge für die Zusatz-Einsätze (Letzter zuerst, nach Stand vor den Extras) */
  extraOrder: string[];
}

export function tallyDuration(t: TallyData) {
  return TALLY.intro + t.rounds.length * (TALLY.fill + TALLY.hold) + TALLY.extrasIntro + t.extraOrder.length * TALLY.perExtra + TALLY.outro;
}

/** Wo steht die Auszählung nach `sec` Sekunden? */
export function tallyAt(t: TallyData, sec: number) {
  let s = sec - TALLY.intro;
  if (s < 0) return { stage: 'intro' as const, round: -1, progress: 0, extrasDone: 0, extraProgress: 0 };
  const per = TALLY.fill + TALLY.hold;
  if (s < t.rounds.length * per) {
    const round = Math.floor(s / per);
    const inRound = s - round * per;
    return { stage: 'rounds' as const, round, progress: Math.min(1, inRound / TALLY.fill), extrasDone: 0, extraProgress: 0 };
  }
  s -= t.rounds.length * per;
  if (s < TALLY.extrasIntro) return { stage: 'extrasIntro' as const, round: t.rounds.length, progress: 1, extrasDone: 0, extraProgress: 0 };
  s -= TALLY.extrasIntro;
  if (s < t.extraOrder.length * TALLY.perExtra) {
    const i = Math.floor(s / TALLY.perExtra);
    return { stage: 'extras' as const, round: t.rounds.length, progress: 1, extrasDone: i, extraProgress: Math.min(1, (s - i * TALLY.perExtra) / (TALLY.perExtra * 0.6)) };
  }
  return { stage: 'done' as const, round: t.rounds.length, progress: 1, extrasDone: t.extraOrder.length, extraProgress: 1 };
}

/** Stand eines Spielers zum Zeitpunkt der Auszählung */
export function totalAt(t: TallyData, id: string, at: ReturnType<typeof tallyAt>) {
  let sum = 0;
  t.rounds.forEach((r, i) => {
    // Betrag wandert nach dem Füllen (in der Haltezeit) zum Spieler
    if (i < at.round || (i === at.round && at.stage === 'rounds' && at.progress >= 1)) sum += r.base[id] ?? 0;
  });
  if (at.stage === 'extrasIntro' || at.stage === 'extras' || at.stage === 'done') {
    sum = t.rounds.reduce((a, r) => a + (r.base[id] ?? 0), 0);
    const k = t.extraOrder.indexOf(id);
    if (k >= 0 && (k < at.extrasDone || (k === at.extrasDone && at.stage === 'extras'))) {
      const f = k < at.extrasDone ? 1 : at.extraProgress;
      sum += Math.round((t.extra[id] ?? 0) * f);
    }
  }
  return sum;
}
