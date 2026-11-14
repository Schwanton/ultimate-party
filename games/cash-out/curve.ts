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

type Path = { x: number[]; e: number[]; heat: number[] };
const cache = new Map<number, Path>();

/** Logarithmus des Kurses je Zeitschritt */
export function pathOf(seed: number): number[] {
  return build(seed).x;
}

function build(seed: number): Path {
  const hit = cache.get(seed);
  if (hit) return hit;
  const r = rng(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  // Grundtrend: meist deutlich aufwärts, in ca. jeder 8. Runde abwärts
  const bear = r() < 0.12;
  const drift = bear ? -0.03 - r() * 0.03 : 0.075 + r() * 0.055;
  const vol = 0.17 + r() * 0.09;
  const out = [0];
  // erwarteter Verlauf (ohne Zufall) – damit der Start-Schub nicht als „steiler Anstieg“ zählt
  const exp = [0];
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
    exp.push(exp[i - 1] + (drift + boost - damp) * STEP);
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
  const path = { x: out, e: exp, heat: heatOf(out, exp) };
  if (cache.size > 30) cache.clear();
  cache.set(seed, path);
  return path;
}

/* ---------- Risiko („Hitze“): 0 = grün, 1 = rot ---------- */

/** Wie viel gefährlicher Rot ist als Grün (Hitze 0,15 gegenüber 0,85) */
export const RISK_RATIO = 3;
const HEAT_BASE = 0.38;

/**
 * Hitze je Zeitschritt, nur aus der Kurve berechnet (TV, Handys und Server rechnen gleich):
 * A steiler Anstieg (schneller als sonst) → röter
 * B Einbruch → erst ganz kurz röter, dann (verzögert) grüner
 * C Blase: weit über dem Schnitt der letzten Sekunden → röter
 * D seitwärts: bewegt sich kaum → kühlt ab
 */
function heatOf(x: number[], e: number[]): number[] {
  const W = 4; // 1 s
  const out = [HEAT_BASE];
  let h = HEAT_BASE;
  let jolt = 0;
  let spike = 0;
  let cool = 0;
  let emaX = 0, emaE = 0;
  const a = STEP / 4; // Schnitt über ca. 4 s
  for (let i = 1; i < x.length; i++) {
    emaX += (x[i] - emaX) * a;
    emaE += (e[i] - emaE) * a;
    const j = Math.max(0, i - W);
    // Abweichung vom erwarteten Verlauf in der letzten Sekunde (in „üblichen Schwankungen“)
    const z = (x[i] - x[j] - (e[i] - e[j])) / 0.2;
    // A
    // (klingt über ca. 3 s ab)
    if (z > 0.5) spike = Math.min(0.45, spike + 0.07 * (z - 0.5));
    spike *= 0.92;
    // B
    if (z < -0.8) {
      const d = -z - 0.8;
      jolt = Math.max(jolt, Math.min(0.4, 0.22 * d));
      cool += 0.04 * d;
    }
    jolt *= 0.72;
    h -= cool * 0.12;
    cool *= 0.88;
    // C
    const dev = x[i] - emaX - (e[i] - emaE);
    const bubble = Math.max(-0.15, Math.min(0.5, dev * 1.4));
    // D
    let lo = Infinity, hi = -Infinity;
    for (let k = Math.max(0, i - 8); k <= i; k++) { lo = Math.min(lo, x[k]); hi = Math.max(hi, x[k]); }
    const calm = i > 8 && hi - lo < 0.1 ? 0.25 : 0;
    h += (HEAT_BASE + bubble - calm - h) * 0.06;
    h = Math.max(0, Math.min(1, h));
    out.push(Math.max(0, Math.min(1, h + spike + jolt)));
  }
  return out;
}

/** Hitze zur Zeit t (0 = grün … 1 = rot) */
export function heatAt(seed: number, t: number): number {
  const p = build(seed).heat;
  const f = Math.max(0, Math.min(MAX_T, t)) / STEP;
  const i = Math.floor(f);
  const a = p[i] ?? p[p.length - 1];
  const b = p[i + 1] ?? a;
  return a + (b - a) * (f - i);
}

/** Absturz-Gefahr relativ zum Schnitt bei dieser Hitze */
export const riskFactor = (heat: number) => Math.pow(RISK_RATIO, (heat - 0.5) / 0.7);

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

/** Grund-Gefahr pro Sekunde bei Risiko-Farbe (so abgestimmt, dass Runden im Schnitt gleich lang bleiben) */
export const RISK_RATE = 1 / 11.3;

/**
 * Absturzzeit mit Risiko-Farbe: ab `min` hat jede Viertelsekunde eine kleine Absturz-Chance,
 * die mit der Hitze steigt (rot 3× so hoch wie grün).
 */
export function crashTimeRisk(seed: number, u: number, min = 1.5) {
  const need = -Math.log(1 - u);
  const p = build(seed).heat;
  let acc = 0;
  for (let t = min; t < MAX_T - 1; t += STEP) {
    const rate = RISK_RATE * riskFactor(p[Math.floor(t / STEP)] ?? HEAT_BASE);
    if (acc + rate * STEP >= need) return t + (need - acc) / rate;
    acc += rate * STEP;
  }
  return MAX_T - 1;
}

export const newSeed = () => Math.floor(Math.random() * 2 ** 31);
