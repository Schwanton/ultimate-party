/**
 * Tick Tack Boom – Regeln (ohne Netzwerk, auch für Tests).
 * Bombe erzeugen, Module prüfen, Anleitung als Daten erzeugen, Lösungen für Bots.
 * Eigene Module und Texte, angelehnt an die Idee von „Keep Talking and Nobody Explodes“.
 */

export type Lang = 'de' | 'en';
export type Kind = 'kabel' | 'knopf' | 'zeichen' | 'blink' | 'funk' | 'irrgarten' | 'wort' | 'schloss' | 'doppel' | 'stimme' | 'druck' | 'frage';

export const NORMAL: Kind[] = ['kabel', 'knopf', 'zeichen', 'blink', 'funk', 'irrgarten', 'wort', 'schloss'];
export const UP_MODS: Kind[] = ['doppel', 'stimme'];
export const NEEDY: Kind[] = ['druck', 'frage'];
export const isNeedy = (k: Kind) => k === 'druck' || k === 'frage';

/** Stufen: Module, Zeit (s), Fehler bis zum Knall */
export const STAGES = [
  { modules: 3, time: 300, maxStrikes: 3, needy: false },
  { modules: 4, time: 300, maxStrikes: 3, needy: false },
  { modules: 5, time: 330, maxStrikes: 3, needy: false },
  { modules: 6, time: 360, maxStrikes: 3, needy: false },
  { modules: 6, time: 360, maxStrikes: 2, needy: true },
];
/** Welche Stufen bei 3, 4 oder 5 Bomben gespielt werden */
export const STAGE_PLAN: Record<number, number[]> = { 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 4, 5] };
export const SPEEDUP = 1.25;

/* ---------- Zufall ---------- */

export type Rng = () => number;
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ri = (r: Rng, n: number) => Math.floor(r() * n);
const pickR = <T,>(r: Rng, xs: readonly T[]) => xs[ri(r, xs.length)];
function shuffleR<T>(r: Rng, xs: readonly T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = ri(r, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const L = (lang: Lang, de: string, en: string) => (lang === 'de' ? de : en);
const ORD_DE = ['erste', 'zweite', 'dritte', 'vierte', 'fünfte', 'sechste'];
const ORD_EN = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'];
const ord = (lang: Lang, i: number) => (lang === 'de' ? ORD_DE : ORD_EN)[i];

/* ---------- Gehäuse ---------- */

export interface Label { text: string; lit: boolean }
export interface Case { serial: string; batteries: number; labels: Label[] }

const LABEL_TEXTS = ['FRZ', 'MOK', 'SIG', 'KAT', 'BOB', 'NIX', 'TRN', 'LUX'];
const VOWELS = 'AEIOU';

export function makeCase(r: Rng): Case {
  const letters = 'ABCDEFGHJKLMNOPQRSTUVWXZ';
  const L1 = () => letters[ri(r, letters.length)];
  const D = () => String(ri(r, 10));
  const serial = `${L1()}${L1()}${D()}-${D()}${D()}${L1()}`;
  const batteries = ri(r, 5);
  const n = ri(r, 4);
  const labels = shuffleR(r, LABEL_TEXTS).slice(0, n).map((text) => ({ text, lit: r() < 0.5 }));
  return { serial, batteries, labels };
}
const digits = (c: Case) => c.serial.replace(/\D/g, '').split('').map(Number);
export const firstDigit = (c: Case) => digits(c)[0];
export const lastDigit = (c: Case) => digits(c).at(-1)!;
export const hasVowel = (c: Case) => [...c.serial].some((ch) => VOWELS.includes(ch));
export const litLabel = (c: Case, t: string) => c.labels.some((l) => l.text === t && l.lit);
export const hasLabel = (c: Case, t: string) => c.labels.some((l) => l.text === t);
export const litCount = (c: Case) => c.labels.filter((l) => l.lit).length;

/* ---------- Regelwerk (bei „Regeln neu mischen“ pro Partie anders) ---------- */

export type WireColor = 'rot' | 'blau' | 'gelb' | 'weiss' | 'schwarz';
export const WIRE_COLORS: WireColor[] = ['rot', 'blau', 'gelb', 'weiss', 'schwarz'];
export type BtnColor = 'rot' | 'blau' | 'gelb' | 'weiss';
export type BlinkColor = 'rot' | 'blau' | 'gruen' | 'gelb';
export const BLINK_COLORS: BlinkColor[] = ['rot', 'blau', 'gruen', 'gelb'];
export const BTN_LABELS = ['stopp', 'los', 'halt', 'drueck'] as const;
export type BtnLabel = (typeof BTN_LABELS)[number];

export const COLOR_NAME: Record<string, [string, string]> = {
  rot: ['rot', 'red'], blau: ['blau', 'blue'], gelb: ['gelb', 'yellow'], weiss: ['weiß', 'white'], schwarz: ['schwarz', 'black'], gruen: ['grün', 'green'],
};
export const colorName = (lang: Lang, c: string) => COLOR_NAME[c]?.[lang === 'de' ? 0 : 1] ?? c;
export const BTN_LABEL_TEXT: Record<BtnLabel, [string, string]> = { stopp: ['STOPP', 'STOP'], los: ['LOS', 'GO'], halt: ['HALT', 'HOLD'], drueck: ['DRÜCK', 'PRESS'] };
export const btnLabel = (lang: Lang, l: BtnLabel) => BTN_LABEL_TEXT[l][lang === 'de' ? 0 : 1];

/** Hieroglyphen-Spalten */
export const GLYPH_COLUMNS = [
  ['Ω', 'Ж', 'λ', '☽', '¶', 'π', 'Ξ'],
  ['☽', 'Ψ', 'Ж', '§', '¶', '★', 'Ю'],
  ['Б', '¶', 'Ω', '✱', 'Ψ', 'Φ', '¥'],
  ['λ', '✱', '§', 'Б', 'Ж', '⊕', '¿'],
  ['☆', 'Я', '¿', '★', '⊕', '∂', 'ð'],
  ['æ', '©', 'Ξ', 'Д', 'π', 'Σ', '☆'],
];

export const MORSE: Record<string, string> = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--',
  N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
};
export const FUNK_WORDS = ['RADAR', 'LASER', 'SONAR', 'METRO', 'PIXEL', 'TANGO', 'VIDEO', 'ROBOT', 'ALPHA', 'OMEGA', 'DELTA', 'SIGMA'];
export const FREQS = FUNK_WORDS.map((_, i) => (3.505 + i * 0.01).toFixed(3));

export const WORD_POOL: Record<Lang, string[]> = {
  de: ['LEER', 'LEHR', 'LEHRE', 'LEERE', 'MEER', 'MEHR', 'WAS', 'WAS?', 'DAS', 'DASS', 'NEIN', 'NEUN', 'SEIT', 'SEID', 'WIRD', 'WIRT'],
  en: ['YOUR', "YOU'RE", 'YOU', 'U', 'THEIR', 'THERE', "THEY'RE", 'WAIT', 'WEIGHT', 'NO', 'KNOW', 'READ', 'RED', 'WHAT', 'WHAT?', 'UR'],
};

export const VOTE_SYMBOLS = ['♣', '♦', '♥', '♠', '♪', '♫', '☂', '✿', '☼', '✂', '∞', '⌘'];

/** Irrgarten: 6×6, Bits offen N=1 O=2 S=4 W=8 */
export const MAZE_SIZE = 6;
export const MAZE_MARKERS: [number, number][][] = [
  [[0, 1], [5, 2]], [[4, 1], [1, 3]], [[3, 3], [5, 3]], [[0, 0], [0, 3]], [[4, 2], [3, 5]],
  [[4, 0], [2, 4]], [[1, 0], [1, 5]], [[3, 0], [2, 3]], [[0, 4], [2, 1]],
];
const DIRS = { n: { bit: 1, dx: 0, dy: -1, back: 4 }, o: { bit: 2, dx: 1, dy: 0, back: 8 }, s: { bit: 4, dx: 0, dy: 1, back: 1 }, w: { bit: 8, dx: -1, dy: 0, back: 2 } } as const;
export type Dir = keyof typeof DIRS;

function makeMaze(seed: number): number[] {
  const r = makeRng(seed);
  const N = MAZE_SIZE;
  const open = new Array(N * N).fill(0);
  const seen = new Array(N * N).fill(false);
  const stack = [ri(r, N * N)];
  seen[stack[0]] = true;
  while (stack.length) {
    const c = stack[stack.length - 1];
    const x = c % N, y = Math.floor(c / N);
    const opts = (Object.keys(DIRS) as Dir[]).filter((d) => {
      const nx = x + DIRS[d].dx, ny = y + DIRS[d].dy;
      return nx >= 0 && ny >= 0 && nx < N && ny < N && !seen[ny * N + nx];
    });
    if (!opts.length) { stack.pop(); continue; }
    const d = pickR(r, opts);
    const n = (y + DIRS[d].dy) * N + x + DIRS[d].dx;
    open[c] |= DIRS[d].bit;
    open[n] |= DIRS[d].back;
    seen[n] = true;
    stack.push(n);
  }
  // ein paar Extra-Durchgänge, damit es nicht nur einen Weg gibt
  for (let k = 0; k < 4; k++) {
    const c = ri(r, N * N), x = c % N, y = Math.floor(c / N);
    const d = pickR(r, ['o', 's'] as Dir[]);
    const nx = x + DIRS[d].dx, ny = y + DIRS[d].dy;
    if (nx < N && ny < N) { open[c] |= DIRS[d].bit; open[ny * N + nx] |= DIRS[d].back; }
  }
  return open;
}

export interface Rules {
  mixed: boolean;
  /** Farbe im Regeltext → Farbe auf der Bombe (Kabel) */
  wire: Record<WireColor, WireColor>;
  stripDigit: Record<BtnColor, number>;
  glyphUp: boolean;
  /** [Vokal ? 1 : 0][Fehler 0–2][Farbe] → zu drückende Farbe */
  blink: Record<BlinkColor, BlinkColor>[][];
  freqOf: Record<string, string>;
  mazes: number[][];
  wordLists: Record<string, string[]>;
  /** Welche Regel (A, B, C) gilt für Ziffer 1, 2, 3 */
  lock: number[];
  voteRows: { symbols: string[]; correct: number }[];
}

const BLINK_BASE: [BlinkColor, BlinkColor, BlinkColor, BlinkColor][][] = [
  // ohne Vokal: rot, blau, grün, gelb →
  [['blau', 'gruen', 'rot', 'gelb'], ['rot', 'gelb', 'blau', 'gruen'], ['gelb', 'blau', 'gruen', 'rot']],
  // mit Vokal
  [['gelb', 'rot', 'blau', 'gruen'], ['gruen', 'gelb', 'rot', 'blau'], ['blau', 'gruen', 'gelb', 'rot']],
];

export function makeRules(lang: Lang, mixSeed: number | null): Rules {
  const mixed = mixSeed != null;
  const r = makeRng(mixed ? mixSeed! : 7);
  const wirePerm = mixed ? shuffleR(r, WIRE_COLORS) : WIRE_COLORS;
  const wire = Object.fromEntries(WIRE_COLORS.map((c, i) => [c, wirePerm[i]])) as Record<WireColor, WireColor>;
  const dig = mixed ? shuffleR(r, [1, 2, 3, 5]) : [3, 5, 1, 2];
  const stripDigit = { blau: dig[0], gelb: dig[1], rot: dig[2], weiss: dig[3] } as Record<BtnColor, number>;
  const glyphUp = mixed ? r() < 0.5 : false;
  let base = BLINK_BASE.map((rows) => rows.map((row) => Object.fromEntries(BLINK_COLORS.map((c, i) => [c, row[i]])) as Record<BlinkColor, BlinkColor>));
  if (mixed) {
    const p = shuffleR(r, BLINK_COLORS);
    base = base.map((rows) => shuffleR(r, rows).map((m) => Object.fromEntries(BLINK_COLORS.map((c) => [c, p[BLINK_COLORS.indexOf(m[c])]])) as Record<BlinkColor, BlinkColor>));
  }
  const freqOrder = mixed ? shuffleR(r, FREQS) : FREQS;
  const freqOf = Object.fromEntries(FUNK_WORDS.map((w, i) => [w, freqOrder[i]]));
  const mazeBase = mixed ? 1000 + ri(r, 100000) : 101;
  const mazes = MAZE_MARKERS.map((_, i) => makeMaze(mazeBase + i * 17));
  const pool = WORD_POOL[lang];
  const wr = makeRng(mixed ? ri(r, 1e9) : 4242);
  const wordLists = Object.fromEntries(pool.map((w) => [w, shuffleR(wr, pool).slice(0, 8)]));
  const lock = mixed ? shuffleR(r, [0, 1, 2]) : [0, 1, 2];
  const vr = makeRng(mixed ? ri(r, 1e9) : 99);
  const voteRows: Rules['voteRows'] = [];
  const keys = new Set<string>();
  while (voteRows.length < 6) {
    const symbols = shuffleR(vr, VOTE_SYMBOLS).slice(0, 3);
    const key = [...symbols].sort().join('');
    if (keys.has(key)) continue;
    keys.add(key);
    voteRows.push({ symbols, correct: ri(vr, 3) });
  }
  return { mixed, wire, stripDigit, glyphUp, blink: base, freqOf, mazes, wordLists, lock, voteRows };
}

/* ---------- Module ---------- */

export interface ModBase { i: number; kind: Kind; solved: boolean }
export interface KabelMod extends ModBase { kind: 'kabel'; colors: WireColor[]; cut: boolean[] }
export interface KnopfMod extends ModBase { kind: 'knopf'; color: BtnColor; label: BtnLabel; strip: BtnColor; held: boolean; heldAt: number }
export interface ZeichenMod extends ModBase { kind: 'zeichen'; symbols: string[]; order: string[]; done: number }
export interface BlinkMod extends ModBase { kind: 'blink'; seq: BlinkColor[]; stage: number; input: number }
export interface FunkMod extends ModBase { kind: 'funk'; word: string; dial: number }
export interface IrrMod extends ModBase { kind: 'irrgarten'; maze: number; pos: [number, number]; goal: [number, number] }
export interface WortMod extends ModBase { kind: 'wort'; display: string; buttons: string[]; stage: number; total: number }
export interface SchlossMod extends ModBase { kind: 'schloss'; wheels: number[] }
export interface DoppelMod extends ModBase { kind: 'doppel'; hold: Record<string, boolean>; green: boolean }
export interface StimmeMod extends ModBase { kind: 'stimme'; row: number; symbols: string[]; votes: Record<string, number> }
export interface DruckMod extends ModBase { kind: 'druck'; last: number; period: number }
export interface FrageMod extends ModBase { kind: 'frage'; q: number | null; deadline: number; duration: number }
export type Mod = KabelMod | KnopfMod | ZeichenMod | BlinkMod | FunkMod | IrrMod | WortMod | SchlossMod | DoppelMod | StimmeMod | DruckMod | FrageMod;

export interface Bomb { stage: number; case: Case; mods: Mod[] }

export function chooseKinds(r: Rng, stage: number, allowUp: boolean): Kind[] {
  const st = STAGES[stage - 1];
  const easy: Kind[] = ['kabel', 'knopf', 'zeichen', 'schloss', 'blink'];
  let pool: Kind[] = stage === 1 ? easy : [...NORMAL, ...(allowUp ? UP_MODS : [])];
  const kinds = shuffleR(r, pool).slice(0, st.modules);
  if (st.needy) kinds.push(pickR(r, NEEDY));
  return kinds;
}

export function makeBomb(r: Rng, rules: Rules, lang: Lang, stage: number, kinds: Kind[]): Bomb {
  const c = makeCase(r);
  const mods = kinds.map((k, i) => makeMod(r, rules, lang, c, k, i));
  return { stage, case: c, mods };
}

function makeMod(r: Rng, rules: Rules, lang: Lang, c: Case, kind: Kind, i: number): Mod {
  const base = { i, solved: false };
  switch (kind) {
    case 'kabel': {
      const n = 3 + ri(r, 4);
      const colors = Array.from({ length: n }, () => pickR(r, WIRE_COLORS));
      return { ...base, kind, colors, cut: colors.map(() => false) };
    }
    case 'knopf':
      return { ...base, kind, color: pickR(r, ['rot', 'blau', 'gelb', 'weiss'] as BtnColor[]), label: pickR(r, BTN_LABELS), strip: pickR(r, ['rot', 'blau', 'gelb', 'weiss'] as BtnColor[]), held: false, heldAt: 0 };
    case 'zeichen': {
      for (;;) {
        const col = ri(r, GLYPH_COLUMNS.length);
        const chosen = shuffleR(r, GLYPH_COLUMNS[col]).slice(0, 4);
        const others = GLYPH_COLUMNS.filter((cc, k) => k !== col && chosen.every((s) => cc.includes(s)));
        if (others.length) continue;
        const colArr = GLYPH_COLUMNS[col];
        const order = [...chosen].sort((a, b) => (colArr.indexOf(a) - colArr.indexOf(b)) * (rules.glyphUp ? -1 : 1));
        return { ...base, kind, symbols: chosen, order, done: 0 };
      }
    }
    case 'blink': {
      const len = 3 + ri(r, 3);
      return { ...base, kind, seq: Array.from({ length: len }, () => pickR(r, BLINK_COLORS)), stage: 1, input: 0 };
    }
    case 'funk':
      return { ...base, kind, word: pickR(r, FUNK_WORDS), dial: ri(r, FREQS.length) };
    case 'irrgarten': {
      const maze = ri(r, rules.mazes.length);
      const N = MAZE_SIZE;
      for (;;) {
        const pos: [number, number] = [ri(r, N), ri(r, N)];
        const goal: [number, number] = [ri(r, N), ri(r, N)];
        if (Math.abs(pos[0] - goal[0]) + Math.abs(pos[1] - goal[1]) >= 5) return { ...base, kind, maze, pos, goal };
      }
    }
    case 'wort': {
      const m: WortMod = { ...base, kind, display: '', buttons: [], stage: 1, total: 3 };
      newWortStage(r, rules, lang, m);
      return m;
    }
    case 'schloss': {
      let wheels = [ri(r, 10), ri(r, 10), ri(r, 10)];
      return { ...base, kind, wheels };
    }
    case 'doppel':
      return { ...base, kind, hold: {}, green: false };
    case 'stimme': {
      const row = ri(r, rules.voteRows.length);
      return { ...base, kind, row, symbols: shuffleR(r, rules.voteRows[row].symbols), votes: {} };
    }
    case 'druck':
      return { ...base, kind, last: 0, period: 35 };
    case 'frage':
      return { ...base, kind, q: null, deadline: 0, duration: 0 };
  }
}

export function newWortStage(r: Rng, rules: Rules, lang: Lang, m: WortMod) {
  const pool = WORD_POOL[lang];
  for (;;) {
    const display = pickR(r, pool);
    const buttons = shuffleR(r, pool).slice(0, 6);
    if (rules.wordLists[display].some((w) => buttons.includes(w))) {
      m.display = display;
      m.buttons = buttons;
      return;
    }
  }
}

/* ---------- Lösungen ---------- */

export function wireSolution(rules: Rules, c: Case, colors: WireColor[]): number {
  const C = rules.wire;
  const n = colors.length;
  const count = (col: WireColor) => colors.filter((x) => x === col).length;
  const first = (col: WireColor) => colors.indexOf(col);
  const last = (col: WireColor) => colors.lastIndexOf(col);
  if (n === 3) {
    if (colors[0] === C.schwarz) return 2;
    const twice = WIRE_COLORS.find((col) => count(col) === 2);
    if (twice) return colors.findIndex((x) => x !== twice);
    if (c.batteries >= 2) return 0;
    return 1;
  }
  if (n === 4) {
    if (count(C.blau) === 0) return 2;
    if (litLabel(c, 'FRZ')) return first(C.blau);
    if (count(C.weiss) > 1) return last(C.weiss);
    return 1;
  }
  if (n === 5) {
    if (lastDigit(c) % 2 === 0 && count(C.gelb) > 0) return first(C.gelb);
    if (count(C.rot) === 1) return first(C.rot);
    if (count(C.schwarz) === 0) return 3;
    return 4;
  }
  if (count(C.rot) > count(C.blau)) return last(C.rot);
  if (c.batteries === 0) return 0;
  if (hasVowel(c)) return 4;
  return 2;
}

export function knopfHold(c: Case, m: { color: BtnColor; label: BtnLabel }): boolean {
  if (m.color === 'blau' && m.label === 'halt') return true;
  if (c.batteries > 2 && m.label === 'los') return false;
  if (m.color === 'weiss' && litLabel(c, 'MOK')) return true;
  if (m.color === 'rot' && m.label === 'stopp') return false;
  if (m.color === 'gelb') return true;
  return false;
}

export function blinkExpected(rules: Rules, c: Case, m: BlinkMod, strikes: number): BlinkColor {
  const table = rules.blink[hasVowel(c) ? 1 : 0][Math.min(2, strikes)];
  return table[m.seq[m.input]];
}

export function wortAnswer(rules: Rules, m: WortMod): string {
  return rules.wordLists[m.display].find((w) => m.buttons.includes(w))!;
}

export function lockCode(rules: Rules, c: Case): number[] {
  const rule = [
    () => (c.batteries + (hasVowel(c) ? 1 : 0)) % 10,
    () => (firstDigit(c) + c.labels.length) % 10,
    () => (litCount(c) * 3 + (c.batteries > 2 ? 1 : 0)) % 10,
  ];
  return rules.lock.map((k) => rule[k]());
}

export function mazeStep(rules: Rules, m: IrrMod, d: Dir): [number, number] | null {
  const open = rules.mazes[m.maze][m.pos[1] * MAZE_SIZE + m.pos[0]];
  if (!(open & DIRS[d].bit)) return null;
  return [m.pos[0] + DIRS[d].dx, m.pos[1] + DIRS[d].dy];
}

/** Kürzester Weg (für Bots) */
export function mazeNextDir(rules: Rules, m: IrrMod): Dir {
  const N = MAZE_SIZE;
  const open = rules.mazes[m.maze];
  const start = m.pos[1] * N + m.pos[0], goal = m.goal[1] * N + m.goal[0];
  const prev = new Map<number, [number, Dir]>();
  const q = [start];
  const seen = new Set([start]);
  while (q.length) {
    const c = q.shift()!;
    if (c === goal) break;
    for (const d of Object.keys(DIRS) as Dir[]) {
      if (!(open[c] & DIRS[d].bit)) continue;
      const n = c + DIRS[d].dy * N + DIRS[d].dx;
      if (seen.has(n)) continue;
      seen.add(n);
      prev.set(n, [c, d]);
      q.push(n);
    }
  }
  let c = goal;
  let dir: Dir = 'n';
  while (c !== start && prev.has(c)) {
    const [p, d] = prev.get(c)!;
    dir = d;
    c = p;
  }
  return dir;
}

/** Uhr wie auf dem Display: m:ss (aufgerundete Sekunden) */
export function clockText(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/* ---------- Fangfragen ---------- */

export const QUESTIONS: { de: string; en: string; answer: (c: Case) => boolean }[] = [
  { de: 'Hat die Bombe mehr als 2 Batterien?', en: 'Does the bomb have more than 2 batteries?', answer: (c) => c.batteries > 2 },
  { de: 'Leuchtet mindestens ein Aufkleber?', en: 'Is at least one label lit?', answer: (c) => litCount(c) > 0 },
  { de: 'Ist die letzte Ziffer der Seriennummer gerade?', en: 'Is the last digit of the serial number even?', answer: (c) => lastDigit(c) % 2 === 0 },
  { de: 'Hat die Seriennummer einen Vokal (A, E, I, O, U)?', en: 'Does the serial number contain a vowel (A, E, I, O, U)?', answer: (c) => hasVowel(c) },
  { de: 'Gibt es einen Aufkleber FRZ?', en: 'Is there a label FRZ?', answer: (c) => hasLabel(c, 'FRZ') },
  { de: 'Hat die Bombe gar keine Batterie?', en: 'Does the bomb have no batteries at all?', answer: (c) => c.batteries === 0 },
  { de: 'Gibt es mehr als 2 Aufkleber?', en: 'Are there more than 2 labels?', answer: (c) => c.labels.length > 2 },
];

/* ---------- Anleitung ---------- */

export type Block =
  | { type: 'text'; text: string }
  | { type: 'rules'; title?: string; items: string[] }
  | { type: 'table'; head: string[]; rows: string[][] }
  | { type: 'glyphs'; cols: string[][] }
  | { type: 'mazes'; mazes: { open: number[]; markers: [number, number][] }[] }
  | { type: 'words'; lists: [string, string[]][] }
  | { type: 'votes'; rows: { symbols: string[]; correct: number }[] };

export interface Chapter { kind: Kind | 'gehaeuse'; title: string; blocks: Block[] }

export const KIND_TITLE: Record<Kind | 'gehaeuse', [string, string]> = {
  kabel: ['Kabelsalat', 'Wire Mess'], knopf: ['Der große Knopf', 'The Big Button'], zeichen: ['Hieroglyphen', 'Hieroglyphs'],
  blink: ['Blinklicht', 'Flashing Lights'], funk: ['Funkspruch', 'Radio Call'], irrgarten: ['Irrgarten', 'Maze'], wort: ['Wortsalat', 'Word Jumble'],
  schloss: ['Zahlenschloss', 'Combination Lock'], doppel: ['Doppelschloss', 'Double Lock'], stimme: ['Stimmzettel', 'Ballot'],
  druck: ['Überdruck', 'Overpressure'], frage: ['Fangfrage', 'Trick Question'], gehaeuse: ['Gehäuse', 'Casing'],
};
export const kindTitle = (lang: Lang, k: Kind | 'gehaeuse') => KIND_TITLE[k][lang === 'de' ? 0 : 1];

export function chapter(lang: Lang, rules: Rules, kind: Kind | 'gehaeuse'): Chapter {
  const t = (de: string, en: string) => L(lang, de, en);
  const cn = (c: string) => colorName(lang, c);
  const W = rules.wire;
  const title = kindTitle(lang, kind);
  switch (kind) {
    case 'gehaeuse':
      return {
        kind, title, blocks: [
          { type: 'text', text: t('Viele Regeln fragen nach dem Gehäuse. Das sieht nur, wer die Bombe vor sich hat – also fragt nach!', 'Many rules ask about the casing. Only whoever has the bomb in front of them can see it – so ask!') },
          { type: 'rules', items: [
            t('Seriennummer: zum Beispiel KX7-42B. „Erste Ziffer“ ist hier 7, „letzte Ziffer“ ist 2. Vokale sind A, E, I, O, U.', 'Serial number: for example KX7-42B. The “first digit” here is 7, the “last digit” is 2. Vowels are A, E, I, O, U.'),
            t('Batterien: 0 bis 4 Stück.', 'Batteries: 0 to 4.'),
            t('Aufkleber: 0 bis 3 Etiketten mit drei Buchstaben. Ein Lämpchen daneben leuchtet oder ist aus.', 'Labels: 0 to 3 tags with three letters. A small lamp next to each is lit or off.'),
            t('Fehler: Nach jedem Fehler läuft die Zeit schneller. Beim letzten erlaubten Fehler knallt es.', 'Strikes: after every strike the clock runs faster. One strike too many and it blows.'),
          ] },
        ],
      };
    case 'kabel':
      return {
        kind, title, blocks: [
          { type: 'text', text: t('Zähle die Kabel von oben nach unten. Schneide genau eines durch. Die erste passende Regel gilt.', 'Count the wires from top to bottom. Cut exactly one. The first matching rule applies.') },
          { type: 'rules', title: t('Bei 3 Kabeln', '3 wires'), items: [
            t(`Ist das erste Kabel ${cn(W.schwarz)}? → das letzte.`, `Is the first wire ${cn(W.schwarz)}? → the last one.`),
            t('Sonst: Haben genau zwei Kabel dieselbe Farbe? → das Kabel mit der anderen Farbe.', 'Otherwise: do exactly two wires share a colour? → the wire with the other colour.'),
            t('Sonst: mindestens 2 Batterien? → das erste.', 'Otherwise: at least 2 batteries? → the first one.'),
            t('Sonst → das zweite.', 'Otherwise → the second one.'),
          ] },
          { type: 'rules', title: t('Bei 4 Kabeln', '4 wires'), items: [
            t(`Kein ${cn(W.blau)}es Kabel? → das dritte.`, `No ${cn(W.blau)} wire? → the third one.`),
            t(`Sonst: Leuchtet der Aufkleber FRZ? → das erste ${cn(W.blau)}e.`, `Otherwise: is the label FRZ lit? → the first ${cn(W.blau)} one.`),
            t(`Sonst: mehr als ein ${cn(W.weiss)}es Kabel? → das letzte ${cn(W.weiss)}e.`, `Otherwise: more than one ${cn(W.weiss)} wire? → the last ${cn(W.weiss)} one.`),
            t('Sonst → das zweite.', 'Otherwise → the second one.'),
          ] },
          { type: 'rules', title: t('Bei 5 Kabeln', '5 wires'), items: [
            t(`Ist die letzte Ziffer der Seriennummer gerade und gibt es ein ${cn(W.gelb)}es Kabel? → das erste ${cn(W.gelb)}e.`, `Is the last digit of the serial number even and is there a ${cn(W.gelb)} wire? → the first ${cn(W.gelb)} one.`),
            t(`Sonst: genau ein ${cn(W.rot)}es Kabel? → das ${cn(W.rot)}e.`, `Otherwise: exactly one ${cn(W.rot)} wire? → the ${cn(W.rot)} one.`),
            t(`Sonst: kein ${cn(W.schwarz)}es Kabel? → das vierte.`, `Otherwise: no ${cn(W.schwarz)} wire? → the fourth one.`),
            t('Sonst → das letzte.', 'Otherwise → the last one.'),
          ] },
          { type: 'rules', title: t('Bei 6 Kabeln', '6 wires'), items: [
            t(`Mehr ${cn(W.rot)}e als ${cn(W.blau)}e Kabel? → das letzte ${cn(W.rot)}e.`, `More ${cn(W.rot)} than ${cn(W.blau)} wires? → the last ${cn(W.rot)} one.`),
            t('Sonst: gar keine Batterie? → das erste.', 'Otherwise: no batteries at all? → the first one.'),
            t('Sonst: Hat die Seriennummer einen Vokal? → das fünfte.', 'Otherwise: does the serial number contain a vowel? → the fifth one.'),
            t('Sonst → das dritte.', 'Otherwise → the third one.'),
          ] },
        ],
      };
    case 'knopf': {
      const sd = rules.stripDigit;
      return {
        kind, title, blocks: [
          { type: 'text', text: t('Kurz tippen oder gedrückt halten? Die erste passende Regel gilt.', 'Tap it or hold it down? The first matching rule applies.') },
          { type: 'rules', items: [
            t(`Blauer Knopf mit „${btnLabel(lang, 'halt')}“ → halten.`, `Blue button saying “${btnLabel(lang, 'halt')}” → hold.`),
            t(`Sonst: mehr als 2 Batterien und Aufschrift „${btnLabel(lang, 'los')}“ → tippen.`, `Otherwise: more than 2 batteries and the button says “${btnLabel(lang, 'los')}” → tap.`),
            t('Sonst: weißer Knopf und der Aufkleber MOK leuchtet → halten.', 'Otherwise: white button and the label MOK is lit → hold.'),
            t(`Sonst: roter Knopf mit „${btnLabel(lang, 'stopp')}“ → tippen.`, `Otherwise: red button saying “${btnLabel(lang, 'stopp')}” → tap.`),
            t('Sonst: gelber Knopf → halten.', 'Otherwise: yellow button → hold.'),
            t('Sonst → tippen.', 'Otherwise → tap.'),
          ] },
          { type: 'text', text: t('Beim Halten leuchtet ein Streifen neben dem Knopf. Loslassen, wenn die Uhr irgendwo diese Ziffer zeigt:', 'While holding, a strip next to the button lights up. Release when the timer shows this digit anywhere:') },
          { type: 'table', head: [t('Streifen', 'Strip'), t('Ziffer', 'Digit')], rows: (['blau', 'gelb', 'rot', 'weiss'] as BtnColor[]).map((c) => [cn(c), String(sd[c])]) },
        ],
      };
    }
    case 'zeichen':
      return {
        kind, title, blocks: [
          { type: 'text', text: rules.glyphUp
            ? t('Nur eine Spalte enthält alle 4 Zeichen. Drückt sie in der Reihenfolge dieser Spalte – von UNTEN nach OBEN.', 'Only one column contains all 4 symbols. Press them in that column’s order – from the BOTTOM up.')
            : t('Nur eine Spalte enthält alle 4 Zeichen. Drückt sie in der Reihenfolge dieser Spalte, von oben nach unten.', 'Only one column contains all 4 symbols. Press them in that column’s order, from top to bottom.') },
          { type: 'glyphs', cols: GLYPH_COLUMNS },
        ],
      };
    case 'blink': {
      const rows = (v: number) => [0, 1, 2].map((e) => [t(`${e} Fehler`, `${e} strike${e === 1 ? '' : 's'}`), ...BLINK_COLORS.map((c) => cn(rules.blink[v][e][c]))]);
      const head = ['', ...BLINK_COLORS.map((c) => t(`${cn(c)} blinkt`, `${cn(c)} flashes`))];
      return {
        kind, title, blocks: [
          { type: 'text', text: t('Ein Feld blinkt, dann zwei, dann drei … Drückt jedes Mal die ganze Folge – aber übersetzt! Was zählt: die Fehler bis jetzt.', 'One field flashes, then two, then three … Press the whole sequence each time – but translated! What counts: the strikes so far.') },
          { type: 'text', text: t('Seriennummer MIT Vokal:', 'Serial number WITH a vowel:') },
          { type: 'table', head, rows: rows(1) },
          { type: 'text', text: t('Seriennummer OHNE Vokal:', 'Serial number WITHOUT a vowel:') },
          { type: 'table', head, rows: rows(0) },
        ],
      };
    }
    case 'funk':
      return {
        kind, title, blocks: [
          { type: 'text', text: t('Das Lämpchen blinkt ein Wort: kurz = Punkt, lang = Strich. Nach dem Wort kommt eine lange Pause. Stellt die passende Frequenz ein und drückt „Senden“.', 'The lamp flashes a word: short = dot, long = dash. After the word there is a long pause. Tune to the matching frequency and press “Send”.') },
          { type: 'table', head: [t('Wort', 'Word'), 'MHz'], rows: FUNK_WORDS.map((w) => [w, rules.freqOf[w]]).sort((a, b) => a[0].localeCompare(b[0])) },
          { type: 'table', head: [t('Buchstabe', 'Letter'), t('Zeichen', 'Code')], rows: [...new Set(FUNK_WORDS.join(''))].sort().map((ch) => [ch, MORSE[ch].replace(/\./g, '•').replace(/-/g, '▬')]) },
        ],
      };
    case 'irrgarten':
      return {
        kind, title, blocks: [
          { type: 'text', text: t('Die Wände sind unsichtbar. An den zwei grünen Ringen erkennt ihr den richtigen Plan. Führt das weiße Quadrat zum roten Dreieck – gegen eine Wand laufen ist ein Fehler.', 'The walls are invisible. The two green rings tell you which map it is. Guide the white square to the red triangle – bumping into a wall is a strike.') },
          { type: 'mazes', mazes: rules.mazes.map((open, i) => ({ open, markers: MAZE_MARKERS[i] })) },
        ],
      };
    case 'wort':
      return {
        kind, title, blocks: [
          { type: 'text', text: t('Sucht das Wort vom Bildschirm in der linken Spalte. Drückt die Taste, deren Wort in dieser Liste als ERSTES vorkommt. Das passiert dreimal.', 'Find the word on the screen in the left column. Press the button whose word comes FIRST in that list. This happens three times.') },
          { type: 'words', lists: Object.entries(rules.wordLists) },
        ],
      };
    case 'schloss': {
      const desc = [
        t('Anzahl der Batterien, plus 1, wenn die Seriennummer einen Vokal hat', 'number of batteries, plus 1 if the serial number contains a vowel'),
        t('erste Ziffer der Seriennummer plus Anzahl der Aufkleber', 'first digit of the serial number plus the number of labels'),
        t('leuchtende Aufkleber mal 3, plus 1 bei mehr als 2 Batterien', 'lit labels times 3, plus 1 if there are more than 2 batteries'),
      ];
      return {
        kind, title, blocks: [
          { type: 'text', text: t('Stellt die drei Rädchen ein und drückt „Öffnen“. Ist eine Zahl 10 oder größer, zählt nur die letzte Stelle.', 'Set the three wheels and press “Open”. If a number is 10 or more, only its last digit counts.') },
          { type: 'rules', items: rules.lock.map((k, i) => t(`Rädchen ${i + 1}: ${desc[k]}`, `Wheel ${i + 1}: ${desc[k]}`)) },
        ],
      };
    }
    case 'doppel':
      return {
        kind, title, blocks: [
          { type: 'text', text: t('Zwei Spieler haben ein Schloss auf dem Handy. Beide drücken und halten, bis das Lämpchen grün wird. Dann beide GLEICHZEITIG loslassen (höchstens eine Sekunde Abstand). Wer zu früh loslässt, macht einen Fehler.', 'Two players have a lock on their phones. Both press and hold until the lamp turns green. Then BOTH let go at the same time (at most one second apart). Letting go too early is a strike.') },
        ],
      };
    case 'stimme':
      return {
        kind, title, blocks: [
          { type: 'text', text: t('Alle stimmen auf ihrem Handy ab. Sucht die Zeile mit denselben drei Zeichen. Das markierte Zeichen ist richtig. Es zählt die Mehrheit – bei Gleichstand gibt es einen Fehler.', 'Everyone votes on their phone. Find the row with the same three symbols. The marked one is correct. The majority counts – a tie is a strike.') },
          { type: 'votes', rows: rules.voteRows },
        ],
      };
    case 'druck':
      return { kind, title, blocks: [{ type: 'text', text: t('Geht nie weg. Der Zeiger steigt. Rechtzeitig „Ablassen“ drücken, sonst gibt es einen Fehler.', 'Never goes away. The needle rises. Press “Vent” in time, or it is a strike.') }] };
    case 'frage':
      return { kind, title, blocks: [{ type: 'text', text: t('Geht nie weg. Ab und zu kommt eine Ja/Nein-Frage zum Gehäuse. 15 Sekunden zum Antworten, falsch oder zu spät ist ein Fehler.', 'Never goes away. Every now and then a yes/no question about the casing pops up. 15 seconds to answer; wrong or too late is a strike.') }] };
  }
}

export const ordinal = ord;
