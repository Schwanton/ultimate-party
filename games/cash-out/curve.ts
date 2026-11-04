/**
 * Kurve von Crash – wie ein Aktienkurs: meist aufwärts, aber mit Rücksetzern, ab und zu
 * ein Einbruch und selten eine Runde, in der es insgesamt bergab geht.
 * Server, TV und Handys berechnen die Kurve identisch aus derselben Zahl (seed).
 * Wann es kracht, weiß nur der Server.
 */

/** Auflösung der Kurve in Sekunden */
export const STEP = 0.25;
/** Längste mögliche Runde */
export const MAX_T = 75;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const cache = new Map<number, number[]>();

/** Logarithmus des Kurses je Zeitschritt */
export function pathOf(seed: number): number[] {
  const hit = cache.get(seed);
  if (hit) return hit;
  const r = rng(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  // Grundtrend: meist deutlich aufwärts, in ca. jeder 8. Runde abwärts
  const bear = r() < 0.12;
  const drift = bear ? -0.03 - r() * 0.03 : 0.075 + r() * 0.055;
  const vol = 0.17 + r() * 0.09;
  const out = [0];
  let x = 0;
  let shock = 0;
  const n = Math.ceil(MAX_T / STEP);
  for (let i = 1; i <= n; i++) {
    // ab etwa 10× flacht der Aufwärtstrend ab, damit es nicht ins Absurde wächst
    const damp = 0.05 * Math.max(0, x - Math.log(10));
    // Start-Schub: in den ersten Sekunden geht es fast immer zügig aufwärts (ca. 2× nach 3 s)
    const t = i * STEP;
    const boost = 0.32 * Math.exp(-t / 2.6);
    const calm = Math.min(1, 0.35 + t / 6);
    x += (drift + boost - damp) * STEP + vol * calm * Math.sqrt(STEP) * gauss();
    // ab und zu ein Einbruch über ein paar Schritte (wird danach meist wieder aufgeholt)
    if (shock <= 0 && i > 16 && r() < 0.018) shock = -(0.05 + r() * 0.07);
    if (shock < 0) {
      x += shock;
      shock = r() < 0.3 ? 0 : shock * 0.8;
      if (shock > -0.01) shock = 0;
    }
    // nicht ins Bodenlose: unter 0,3× federt der Kurs zurück
    if (x < Math.log(0.3)) x = Math.log(0.3) + Math.abs(gauss()) * 0.05;
    out.push(x);
  }
  if (cache.size > 30) cache.clear();
  cache.set(seed, out);
  return out;
}

/** Kurs (Multiplikator) zur Zeit t */
export function multAt(seed: number, t: number): number {
  const p = pathOf(seed);
  const f = Math.max(0, Math.min(MAX_T, t)) / STEP;
  const i = Math.floor(f);
  const a = p[i] ?? p[p.length - 1];
  const b = p[i + 1] ?? a;
  return Math.exp(a + (b - a) * (f - i));
}

/** Wie stark fällt der Kurs gerade? 0 = gar nicht, 1 = heftig (Vergleich mit vor 0,75 s) */
export function fallAt(seed: number, t: number): number {
  if (t < 0.5) return 0;
  const now = Math.log(multAt(seed, t));
  const before = Math.log(multAt(seed, t - 0.75));
  return Math.max(0, Math.min(1, (before - now) / 0.25));
}

/** auf zwei Nachkommastellen abrunden (so wird ausgezahlt) */
export const floor2 = (m: number) => Math.floor(m * 100) / 100;

/** Absturzzeit (nur Server): frühestens `min` Sekunden (pro Partie 2–6 s), danach im Mittel ca. 10 s später, selten sehr lang */
export function crashTime(u: number, min = 1.5) {
  return Math.min(MAX_T - 1, min + -Math.log(1 - u) * 10.5);
}

export const newSeed = () => Math.floor(Math.random() * 2 ** 31);
