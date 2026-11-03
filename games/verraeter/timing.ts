/**
 * Zeitplan der Stimmen-Auflösung (Server und TV rechnen gleich):
 * Die Abstimmenden erscheinen nacheinander – abwechselnd bei den Antworten, wie ein Wettrennen.
 */

/** Abstand zwischen zwei Stimmen: bei wenigen gemütlich, bei vielen schneller (insgesamt höchstens ~4,5 s) */
export function voterInterval(n: number) {
  return n <= 0 ? 0 : Math.min(0.6, 4.5 / n);
}

export function votersSeconds(n: number) {
  return n * voterInterval(n);
}

/**
 * Reihenfolge, in der die Stimmen erscheinen: reihum über die Antworten (a1, b1, a2, b2 …).
 * Gibt für jede Antwort die Zeitpunkte (Sekunden ab Beginn) ihrer Stimmen zurück.
 */
export function voterSchedule(counts: number[]): number[][] {
  const total = counts.reduce((s, c) => s + c, 0);
  const step = voterInterval(total);
  const out = counts.map(() => [] as number[]);
  let k = 0;
  for (let round = 0; k < total; round++) {
    counts.forEach((c, i) => {
      if (round < c) out[i].push(++k * step);
    });
  }
  return out;
}
