/** Kurve von Crash – Server und TV/Handys rechnen identisch. */

/** Wachstum pro Sekunde: 2× nach ~7 s, 5× nach ~16 s, 10× nach ~23 s */
export const K = 0.1;
export const multAt = (seconds: number) => Math.exp(K * Math.max(0, seconds));
export const timeFor = (mult: number) => Math.log(Math.max(1, mult)) / K;
/** auf zwei Nachkommastellen abrunden (so wird ausgezahlt) */
export const floor2 = (m: number) => Math.floor(m * 100) / 100;

/**
 * Absturzpunkt: klassische „Crash“-Verteilung – meist früh, manchmal sehr spät.
 * P(Absturz über x) ≈ 0,97 / x. Höchstens 60×.
 */
export function crashPoint(u: number) {
  return Math.min(60, Math.max(1, floor2(0.97 / (1 - u))));
}
