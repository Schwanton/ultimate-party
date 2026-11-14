/**
 * Bonk! – Powerups (gemeinsam für Server und Handy/TV). Namen und Texte stehen in i18n unter pu.<id> und pud.<id>.
 * max = wie oft man es höchstens haben kann (ohne Angabe: beliebig oft, wirkt dann stärker).
 */

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export const RARITIES: Rarity[] = ['common', 'rare', 'epic', 'legendary'];
export const RARITY_COLOR: Record<Rarity, string> = { common: '#4BE3A1', rare: '#5B8CFF', epic: '#9B7BFF', legendary: '#FFD447' };
export const PRICE: Record<Rarity, number> = { common: 15, rare: 30, epic: 50, legendary: 80 };
export const REROLL_PRICE = 10;

export interface PowerupDef { id: string; rarity: Rarity; weapon: 'alle' | 'hammer' | 'schleuder'; max?: number }

export const POWERUPS: PowerupDef[] = [
  // für alle Waffen
  { id: 'leichtfuss', rarity: 'common', weapon: 'alle' },
  { id: 'brocken', rarity: 'common', weapon: 'alle' },
  { id: 'feuerfest', rarity: 'common', weapon: 'alle', max: 2 },
  { id: 'schnellrolle', rarity: 'common', weapon: 'alle', max: 3 },
  { id: 'wucht', rarity: 'rare', weapon: 'alle' },
  { id: 'doppelrolle', rarity: 'rare', weapon: 'alle', max: 1 },
  { id: 'dornen', rarity: 'rare', weapon: 'alle' },
  { id: 'siegeshunger', rarity: 'epic', weapon: 'alle' },
  { id: 'flipper', rarity: 'epic', weapon: 'alle', max: 1 },
  { id: 'viertesleben', rarity: 'legendary', weapon: 'alle', max: 1 },
  // Hammer
  { id: 'schnelllader', rarity: 'common', weapon: 'hammer', max: 3 },
  { id: 'langerstiel', rarity: 'common', weapon: 'hammer', max: 3 },
  { id: 'stampferplus', rarity: 'rare', weapon: 'hammer', max: 2 },
  { id: 'erdbeben', rarity: 'epic', weapon: 'hammer', max: 1 },
  { id: 'wirbelsturm', rarity: 'legendary', weapon: 'hammer', max: 1 },
  // Schleuder
  { id: 'schnellfeuer', rarity: 'common', weapon: 'schleuder', max: 3 },
  { id: 'abpraller', rarity: 'common', weapon: 'schleuder', max: 2 },
  { id: 'streuschuss', rarity: 'rare', weapon: 'schleuder', max: 1 },
  { id: 'ladeschussplus', rarity: 'rare', weapon: 'schleuder', max: 2 },
  { id: 'riesenkugel', rarity: 'epic', weapon: 'schleuder', max: 1 },
  { id: 'durchschlag', rarity: 'legendary', weapon: 'schleuder', max: 1 },
];

export const POWERUP = Object.fromEntries(POWERUPS.map((p) => [p.id, p])) as Record<string, PowerupDef>;

/** Grundchancen in % (gewöhnlich, selten, episch, legendär) und die Chancen bei vollem Aufholbonus */
const BASE = [55, 30, 12, 3];
const CATCH_UP = [40, 33, 21, 6];

/**
 * Seltenheits-Chancen für einen Spieler.
 * Ab Runde 3 bekommt, wer weit hinter dem Ersten liegt, bessere Chancen; der Bonus wächst alle 3 Runden (bis Stufe 3).
 * Spätere Runden heben die Chancen für alle leicht an.
 */
export function rarityChances(round: number, myScore: number, bestScore: number) {
  const stage = Math.min(3, Math.floor(round / 3));
  const gap = bestScore > 0 ? (bestScore - myScore) / bestScore : 0;
  const factor = Math.min(1, Math.max(0, (gap - 0.2) / 0.4)) * (stage / 3);
  const late = Math.min(1, round / 12) * 4; // bis zu 4 Prozentpunkte von gewöhnlich nach oben
  const c = BASE.map((b, i) => b + (CATCH_UP[i] - b) * factor);
  c[0] -= late; c[1] += late * 0.4; c[2] += late * 0.4; c[3] += late * 0.2;
  return c;
}

export function rollRarity(chances: number[], R = Math.random): Rarity {
  let x = R() * chances.reduce((a, b) => a + b, 0);
  for (let i = 0; i < chances.length; i++) {
    x -= chances[i];
    if (x < 0) return RARITIES[i];
  }
  return 'common';
}

/**
 * Zieht `count` verschiedene Powerups, die der Spieler noch nehmen darf.
 * `weaponFirst`: das erste ist auf jeden Fall eins für die eigene Waffe.
 */
export function drawPowerups(opts: { weapon: string; owned: Record<string, number>; chances: number[]; count: number; weaponFirst?: boolean; onlyWeapon?: boolean }) {
  const out: string[] = [];
  for (let i = 0; i < opts.count; i++) {
    const wantWeapon = opts.onlyWeapon || (opts.weaponFirst && i === 0);
    const first = rollRarity(opts.chances);
    const idx = RARITIES.indexOf(first);
    // gewürfelte Seltenheit, sonst die nächstniedrigere, sonst höhere
    const order = [first, ...RARITIES.slice(0, idx).reverse(), ...RARITIES.slice(idx + 1)];
    for (const rarity of order) {
      const pool = POWERUPS.filter((p) =>
        p.rarity === rarity && !out.includes(p.id) && (p.max === undefined || (opts.owned[p.id] ?? 0) < p.max)
        && (wantWeapon ? p.weapon === opts.weapon : p.weapon === 'alle' || p.weapon === opts.weapon));
      if (pool.length) { out.push(pool[Math.floor(Math.random() * pool.length)].id); break; }
    }
  }
  return out;
}
