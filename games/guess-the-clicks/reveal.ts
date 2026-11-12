/**
 * Ablauf der Zahlenstrahl-Auflösung (seit 0.18.0). Server, TV und Handys rechnen ihn gleich aus.
 *
 * 1) Alle Tipps erscheinen nacheinander auf dem Strahl (Skala zuerst von 0 bis zum höchsten Tipp).
 * 2) Der leere Rand wird abgeschnitten: Die Skala reicht nur noch vom kleinsten bis zum größten Tipp.
 * 3) Schritt für Schritt wird ausgegraut und entfernt, wer am weitesten weg liegt – danach schrumpft
 *    die Skala jeweils auf die übrigen Tipps. Bei vielen Spielern fliegen mehrere auf einmal raus.
 * 4) Sind nur noch 2 übrig: Trommelwirbel, dann erscheint die echte Zahl (die Skala wächst bei Bedarf mit).
 *
 * Die echte Zahl bleibt bis zum Schluss verborgen; die Reihenfolge der Tipps verrät nichts,
 * weil der Server sie gemischt schickt.
 */

export interface RevealEntry {
  playerId: string;
  guess: number;
}

export interface RevealPlan {
  /** wann jeder Tipp erscheint (Sekunden ab Start) */
  placeAt: Record<string, number>;
  /** sichtbarer Bereich der Skala ab einem Zeitpunkt */
  ranges: { at: number; lo: number; hi: number; log: boolean }[];
  /** wer zu welchem Zeitpunkt ausgegraut wird (entfernt GREY Sekunden später) */
  outs: { at: number; ids: string[] }[];
  /** ab wann der Trommelwirbel läuft (null = kein Ausscheiden, z. B. bei nur 1–2 Tipps) */
  drumAt: number | null;
  /** ab wann die echte Zahl zu sehen ist */
  answerAt: number;
  /** Ende der Auflösung (Gewinner sichtbar) */
  doneAt: number;
}

export const START_DELAY = 0.8;
/** so lange ist ein Tipp grau, bevor er verschwindet */
export const GREY = 0.9;
/** Dauer einer Skalen-Änderung (Animation) */
export const MOVE = 0.9;
const AFTER_PLACE = 1.2;
const CROP = 1.6;
const OUT_STEP = 1.9;
const MAX_OUT_STEPS = 8;
const DRUM = 2.6;
const AFTER_ANSWER = 1.8;

export const lg = (v: number) => Math.log10(Math.max(0, v) + 1);

/** Bereich mit etwas Luft links und rechts – linear oder logarithmisch, je nach Spannweite */
export function padRange(values: number[]): { lo: number; hi: number; log: boolean } {
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (useLog(values)) {
    const a = lg(lo), b = lg(hi);
    const pad = Math.max(0.08, (b - a) * 0.08);
    return { lo: Math.max(0, 10 ** (a - pad) - 1), hi: 10 ** (b + pad) - 1, log: true };
  }
  if (hi === lo) {
    const d = Math.max(1, Math.abs(hi) * 0.1);
    lo -= d;
    hi += d;
  } else {
    const pad = (hi - lo) * 0.08;
    lo -= pad;
    hi += pad;
  }
  return { lo: Math.max(0, lo), hi, log: false };
}

/** Logarithmisch, wenn die Werte über mehr als ~1,5 Zehnerpotenzen streuen */
export function useLog(values: number[]) {
  const pos = values.filter((v) => v > 0);
  if (!pos.length) return false;
  return Math.max(...pos) / Math.max(1, Math.min(...values)) > 40;
}

export function buildPlan(answer: number, entries: RevealEntry[]): RevealPlan {
  const n = entries.length;
  const step = n ? Math.min(0.55, 5 / n) : 0;
  const placeAt: Record<string, number> = {};
  entries.forEach((e, i) => { placeAt[e.playerId] = i * step; });
  let t = n * step;
  const guesses = entries.map((e) => e.guess);
  const ranges: RevealPlan['ranges'] = [];
  // Anfangs ab 0 – logarithmisch nur, wenn die Tipps selbst über viele Zehnerpotenzen streuen
  const startValues = guesses.length ? guesses : [answer];
  const first = padRange(startValues);
  ranges.push({ at: 0, lo: 0, hi: first.hi, log: first.log });
  const outs: RevealPlan['outs'] = [];
  let drumAt: number | null = null;

  if (n >= 2) {
    // 2) leeren Rand abschneiden
    t += AFTER_PLACE;
    ranges.push({ at: t, ...padRange(guesses) });
    t += CROP;
    // 3) Weitester raus, bis 2 übrig sind
    let left = entries.map((e) => ({ ...e, diff: Math.abs(e.guess - answer) }));
    const batch = Math.max(1, Math.ceil((n - 2) / MAX_OUT_STEPS));
    while (left.length > 2) {
      const sorted = [...left].sort((a, b) => b.diff - a.diff);
      let take = sorted.slice(0, Math.min(batch, left.length - 2));
      // Gleich weit weg = gemeinsam raus; bleiben dadurch weniger als 2 übrig, hören wir hier auf
      const edge = take[take.length - 1].diff;
      take = sorted.filter((e) => e.diff >= edge);
      if (left.length - take.length < 2) break;
      const ids = new Set(take.map((e) => e.playerId));
      outs.push({ at: t, ids: [...ids] });
      left = left.filter((e) => !ids.has(e.playerId));
      ranges.push({ at: t + GREY, ...padRange(left.map((e) => e.guess)) });
      t += OUT_STEP;
    }
    // 4) Trommelwirbel
    drumAt = t;
    t += DRUM;
  } else {
    t += AFTER_PLACE;
  }
  const answerAt = t;
  const finalValues = n >= 2 ? entriesLeft(entries, outs).map((e) => e.guess) : guesses;
  ranges.push({ at: answerAt, ...padRange([...finalValues, answer]) });
  return { placeAt, ranges, outs, drumAt, answerAt, doneAt: answerAt + AFTER_ANSWER };
}

function entriesLeft(entries: RevealEntry[], outs: RevealPlan['outs']) {
  const gone = new Set(outs.flatMap((o) => o.ids));
  return entries.filter((e) => !gone.has(e.playerId));
}

/** Zustand zur Zeit t (Sekunden ab Start der Auflösung) */
export function stateAt(plan: RevealPlan, t: number) {
  let range = plan.ranges[0];
  for (const r of plan.ranges) if (r.at <= t) range = r;
  const greyed = new Set<string>();
  const removed = new Set<string>();
  for (const o of plan.outs) {
    if (t >= o.at + GREY) o.ids.forEach((id) => removed.add(id));
    else if (t >= o.at) o.ids.forEach((id) => greyed.add(id));
  }
  return {
    range,
    greyed,
    removed,
    placed: (id: string) => (plan.placeAt[id] ?? Infinity) <= t,
    drum: plan.drumAt !== null && t >= plan.drumAt && t < plan.answerAt,
    answer: t >= plan.answerAt,
    done: t >= plan.doneAt,
  };
}

/** Gesamtdauer inkl. Start-Verzögerung (für den Server) */
export function revealSeconds(answer: number, entries: RevealEntry[]) {
  return START_DELAY + buildPlan(answer, entries).doneAt;
}

/** Sekunden ab Start, bis die echte Zahl zu sehen ist (für die Handys) */
export function answerSeconds(answer: number, entries: RevealEntry[]) {
  return START_DELAY + buildPlan(answer, entries).answerAt;
}
