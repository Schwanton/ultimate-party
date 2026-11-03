/**
 * Kronenduell – Regeln (nach „Regicide: Crown Duels“ von Badgers from Mars).
 * Reine Funktionen: werden vom Server (echtes Spiel) und vom Handy (Vorschau beim Planen) genutzt.
 *
 * Farben: ♣ Schwert (sw), ♠ Schild (sh), ♥ Trank (po), ♦ Kristall (cr). Werte 1 (Ass) bis 10.
 */

export type Suit = 'sw' | 'sh' | 'po' | 'cr';
export const SUITS: Suit[] = ['sw', 'sh', 'po', 'cr'];
export interface Card {
  id: number;
  s: Suit;
  n: number;
}
/** Karte in einer Zone; hidden = in dieser Runde verdeckt gelegt */
export interface ZCard extends Card {
  hidden?: boolean;
}
export type Zone = 'atk' | 'def' | 'spell' | 'corr';
export const ZONES: Zone[] = ['atk', 'def', 'spell', 'corr'];
export interface Zones {
  atk: ZCard[];
  def: ZCard[];
  spell: ZCard[];
  corr: ZCard[];
}

/** Bube, Dame, König */
export const VITALITY = [3, 4, 5];

export const emptyZones = (): Zones => ({ atk: [], def: [], spell: [], corr: [] });
export const cloneZones = (z: Zones): Zones => ({ atk: z.atk.map((c) => ({ ...c })), def: z.def.map((c) => ({ ...c })), spell: z.spell.map((c) => ({ ...c })), corr: z.corr.map((c) => ({ ...c })) });

export function newDeck(rand: () => number = Math.random): Card[] {
  const cards: Card[] = [];
  let id = 1;
  for (const s of SUITS) for (let n = 1; n <= 10; n++) cards.push({ id: id++, s, n });
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

/* ---------------- Aufdecken ---------------- */

export interface RevealResult {
  zones: Zones;
  /** abgeworfen: höhere Waffen/Rüstungen, falsche Zone, doppelte Zauber */
  higherSw: Card[];
  higherSh: Card[];
  wrongZone: Card[];
  spellCancel: Card[];
}

/** Aufdecken für einen Spieler (Korruption bleibt verdeckt) */
export function reveal(z0: Zones): RevealResult {
  const z = cloneZones(z0);
  const newSw = z.atk.filter((c) => c.hidden && c.s === 'sw');
  const newSh = z.def.filter((c) => c.hidden && c.s === 'sh');
  let higherSw: Card[] = [];
  let higherSh: Card[] = [];
  if (newSw.length) {
    const low = Math.min(...newSw.map((c) => c.n));
    higherSw = z.atk.filter((c) => c.s === 'sw' && c.n > low);
    z.atk = z.atk.filter((c) => !(c.s === 'sw' && c.n > low));
  }
  if (newSh.length) {
    const low = Math.min(...newSh.map((c) => c.n));
    higherSh = z.def.filter((c) => c.s === 'sh' && c.n > low);
    z.def = z.def.filter((c) => !(c.s === 'sh' && c.n > low));
  }
  const wrongZone = [...z.def.filter((c) => c.s === 'sw'), ...z.atk.filter((c) => c.s === 'sh')];
  z.def = z.def.filter((c) => c.s !== 'sw');
  z.atk = z.atk.filter((c) => c.s !== 'sh');
  const count = (s: Suit) => z.spell.filter((c) => c.s === s).length;
  const spellCancel = z.spell.filter((c) => count(c.s) > 1);
  z.spell = z.spell.filter((c) => count(c.s) <= 1);
  for (const k of ['atk', 'def', 'spell'] as const) z[k] = z[k].map((c) => ({ ...c, hidden: false }));
  return { zones: z, higherSw, higherSh, wrongZone, spellCancel };
}

/* ---------------- Kampf ---------------- */

export interface Part {
  k: 'weapon' | 'ignite' | 'igniteMatch' | 'armour' | 'ward' | 'wardMatch';
  v: number;
  extra?: number;
}

export interface Stats {
  str: number;
  blk: number;
  strParts: Part[];
  blkParts: Part[];
  /** Stärke/Block vor den Zaubern */
  baseStr: number;
  baseBlk: number;
  allOutAtk: boolean;
  allOutDef: boolean;
}

/** Stärke und Block (nach dem Aufdecken) */
export function stats(z: Zones): Stats {
  const strParts: Part[] = [];
  const blkParts: Part[] = [];
  const sw = z.atk.filter((c) => c.s === 'sw').sort((a, b) => b.n - a.n);
  const sh = z.def.filter((c) => c.s === 'sh').sort((a, b) => b.n - a.n);
  let str = 0;
  let blk = 0;
  if (sw.length) {
    str += sw[0].n + (sw.length - 1);
    strParts.push({ k: 'weapon', v: sw[0].n, extra: sw.length - 1 });
  }
  for (const c of z.atk.filter((x) => x.s === 'po')) {
    str += c.n;
    strParts.push({ k: 'ignite', v: c.n });
    if (sw.some((w) => w.n === c.n)) {
      str += c.n;
      strParts.push({ k: 'igniteMatch', v: c.n });
    }
  }
  if (sh.length) {
    blk += sh[0].n + (sh.length - 1);
    blkParts.push({ k: 'armour', v: sh[0].n, extra: sh.length - 1 });
  }
  for (const c of z.def.filter((x) => x.s === 'po')) {
    blk += c.n;
    blkParts.push({ k: 'ward', v: c.n });
    if (sh.some((a) => a.n === c.n)) {
      blk += c.n;
      blkParts.push({ k: 'wardMatch', v: c.n });
    }
  }
  const baseStr = str;
  const baseBlk = blk;
  const allOutAtk = z.spell.some((c) => c.s === 'sw');
  const allOutDef = z.spell.some((c) => c.s === 'sh');
  if (allOutAtk && allOutDef) {
    str = 0;
    blk = 0;
  } else if (allOutAtk) {
    str += blk;
    blk = 0;
  } else if (allOutDef) {
    blk += str;
    str = 0;
  }
  return { str, blk, strParts, blkParts, baseStr, baseBlk, allOutAtk, allOutDef };
}

/** Schaden bei einem Treffer: 1 + Kristalle im Angriff (+1 bei gleicher Zahl wie eine Waffe) */
export function damage(z: Zones) {
  let d = 1;
  let crit = 0;
  let match = 0;
  const sw = z.atk.filter((c) => c.s === 'sw');
  for (const c of z.atk.filter((x) => x.s === 'cr')) {
    crit++;
    if (sw.some((w) => w.n === c.n)) match++;
  }
  d += crit + match;
  return { dmg: d, crit, match };
}

/** Konter: Wer getroffen wird, zieht pro Kristall in der Verteidigung 1 Karte (+1 bei gleicher Zahl wie eine Rüstung) */
export function counterDraws(z: Zones) {
  const sh = z.def.filter((c) => c.s === 'sh');
  let n = 0;
  for (const c of z.def.filter((x) => x.s === 'cr')) n += 1 + (sh.some((a) => a.n === c.n) ? 1 : 0);
  return n;
}

/* ---------------- Zauber ---------------- */

/** Absaugen: pro Trank im Zauber 1 Karte vom Stapel in die eigene Korruption, +1 je gleicher Zahl bei Gegners Waffen/Rüstungen */
export function siphonCount(z: Zones, opp: Zones) {
  const targets = [...opp.atk, ...opp.def].filter((c) => c.s === 'sw' || c.s === 'sh');
  let n = 0;
  for (const c of z.spell.filter((x) => x.s === 'po')) n += 1 + targets.filter((t) => t.n === c.n).length;
  return n;
}

/**
 * Zerschmettern: pro Kristall im Zauber zuerst alle Waffen/Rüstungen des Gegners mit gleicher Zahl,
 * dann die mit der kleinsten Zahl (bei Gleichstand die Rüstung). Ändert opp und liefert die zerstörten Karten.
 */
export function shatter(z: Zones, opp: Zones): Card[] {
  const destroyed: Card[] = [];
  const remove = (c: Card) => {
    opp.atk = opp.atk.filter((x) => x.id !== c.id);
    opp.def = opp.def.filter((x) => x.id !== c.id);
    destroyed.push(c);
  };
  for (const cr of z.spell.filter((x) => x.s === 'cr')) {
    const pool = () => [...opp.atk, ...opp.def].filter((c) => c.s === 'sw' || c.s === 'sh');
    for (const m of pool().filter((c) => c.n === cr.n)) remove(m);
    const rest = pool().sort((a, b) => a.n - b.n || (a.s === 'sh' ? -1 : 1));
    if (rest.length) remove(rest[0]);
  }
  return destroyed;
}

/* ---------------- Planen ---------------- */

/** Wie viele Karten bleiben am Ende des Planens auf der Hand? */
export const keepCount = (corrupt: boolean) => (corrupt ? 2 : 1);

/** Vorschau: Stärke/Block für die eigene Seite, wenn diese Karten (zusätzlich verdeckt) lägen */
export function preview(z: Zones, extra: { card: Card; zone: Zone }[]) {
  const zz = cloneZones(z);
  for (const e of extra) zz[e.zone].push({ ...e.card, hidden: true });
  return stats(reveal(zz).zones);
}
