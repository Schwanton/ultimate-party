/**
 * Abgrund – Spieldaten: Klassen, Karten, Gegner, Kämpfe.
 * Alle Zahlen sind Startwerte (siehe Konzept „Abgrund – Konzept Prototyp“).
 */

export type Speed = 'fast' | 'normal' | 'slow';
export type Rarity = 'basis' | 'common' | 'uncommon' | 'rare' | 'legendary';
export type ClassId = 'schildwacht' | 'klingenlaeufer' | 'kraeuterkundige';
/** Wen eine Karte trifft */
export type TargetKind = 'enemy' | 'ally' | 'self' | 'allEnemies' | 'allAllies' | 'randomEnemies';

/** Ein Effekt einer Karte. Werte in [normal, verbessert]. Mit `solo` gilt allein ein anderer Wert. */
export type Fx =
  | { k: 'dmg'; v: [number, number]; hits?: [number, number] }
  | { k: 'block'; v: [number, number]; solo?: [number, number] } // eigener Block
  | { k: 'blockTarget'; v: [number, number] } // Block für das gewählte Ziel (Verbündeter oder man selbst)
  | { k: 'blockAll'; v: [number, number]; solo?: [number, number] } // alle Spieler
  | { k: 'heal'; v: [number, number] } // gewähltes Ziel
  | { k: 'healAll'; v: [number, number]; solo?: [number, number] }
  | { k: 'poison'; v: [number, number] }
  | { k: 'weak'; v: [number, number] }
  | { k: 'vuln'; v: [number, number] }
  | { k: 'mark'; v: [number, number] }
  | { k: 'selfDmg'; v: [number, number] }
  | { k: 'thorns'; v: [number, number] } // Schaden zurück, wenn diese Runde angegriffen
  | { k: 'redirect' } // Angriffe auf den gewählten Verbündeten treffen diese Runde mich
  | { k: 'taunt' } // alle Gegner greifen diese Runde mich an
  | { k: 'cleanse' }
  | { k: 'doublePoison' }
  | { k: 'poisonBurst'; v: [number, number] } // Schaden = Gift × v
  | { k: 'energyOnKill'; v: [number, number] };

export interface CardDef {
  id: string;
  name: string;
  cls: ClassId;
  rarity: Rarity;
  cost: [number, number];
  speed: Speed;
  target: TargetKind;
  fx: Fx[];
  /** Kartentext mit {0},{1} … als Platzhalter für die Werte (normal/verbessert eingesetzt) */
  text: string;
  /** Sondertext allein (optional) */
  img: string;
  /** Ziel muss ein anderer Spieler sein (allein: man selbst) */
  otherAlly?: boolean;
  /** Bedingungen für doppelten Schaden */
  double?: 'belowHalf' | 'vulnOrMarked';
}

export interface ClassDef {
  id: ClassId;
  name: string;
  role: string;
  hp: number;
  desc: string;
  img: string;
  start: [string, number][];
}

const CARDS: CardDef[] = [
  /* ---------- Schildwacht ---------- */
  { id: 'schildstoss', name: 'Schildstoß', cls: 'schildwacht', rarity: 'basis', cost: [1, 1], speed: 'normal', target: 'enemy', fx: [{ k: 'dmg', v: [5, 7] }], text: '{dmg} Schaden', img: 'karte-schildstoss' },
  { id: 'deckung', name: 'Deckung', cls: 'schildwacht', rarity: 'basis', cost: [1, 1], speed: 'normal', target: 'self', fx: [{ k: 'block', v: [6, 9] }], text: '{block} Block', img: 'karte-deckung' },
  { id: 'abfangen', name: 'Abfangen', cls: 'schildwacht', rarity: 'basis', cost: [1, 1], speed: 'fast', target: 'ally', otherAlly: true, fx: [{ k: 'redirect' }, { k: 'block', v: [4, 7], solo: [8, 12] }], text: 'Angriffe auf einen Verbündeten treffen diese Runde dich. {block} Block', img: 'karte-abfangen' },
  { id: 'schildwall', name: 'Schildwall', cls: 'schildwacht', rarity: 'basis', cost: [2, 2], speed: 'normal', target: 'allAllies', fx: [{ k: 'blockAll', v: [4, 6], solo: [8, 12] }], text: 'Alle Spieler erhalten {blockAll} Block', img: 'karte-schildwall' },
  { id: 'schildramme', name: 'Schildramme', cls: 'schildwacht', rarity: 'common', cost: [1, 1], speed: 'normal', target: 'enemy', fx: [{ k: 'dmg', v: [4, 6] }, { k: 'block', v: [4, 6] }], text: '{dmg} Schaden, {block} Block', img: 'karte-schildstoss' },
  { id: 'wachsam', name: 'Wachsam', cls: 'schildwacht', rarity: 'common', cost: [1, 1], speed: 'fast', target: 'self', fx: [{ k: 'block', v: [7, 10] }], text: '{block} Block', img: 'karte-deckung' },
  { id: 'herausfordern', name: 'Herausfordern', cls: 'schildwacht', rarity: 'common', cost: [1, 1], speed: 'fast', target: 'self', fx: [{ k: 'taunt' }, { k: 'block', v: [3, 6] }], text: 'Alle Gegner greifen diese Runde dich an. {block} Block', img: 'karte-abfangen' },
  { id: 'schwerer-schlag', name: 'Schwerer Schlag', cls: 'schildwacht', rarity: 'common', cost: [2, 2], speed: 'slow', target: 'enemy', fx: [{ k: 'dmg', v: [14, 19] }], text: '{dmg} Schaden', img: 'karte-schildstoss' },
  { id: 'gegenwehr', name: 'Gegenwehr', cls: 'schildwacht', rarity: 'uncommon', cost: [1, 1], speed: 'normal', target: 'self', fx: [{ k: 'block', v: [5, 8] }, { k: 'thorns', v: [5, 8] }], text: '{block} Block. Wirst du angegriffen: {thorns} Schaden zurück', img: 'karte-deckung' },
  { id: 'bollwerk', name: 'Bollwerk', cls: 'schildwacht', rarity: 'uncommon', cost: [2, 2], speed: 'normal', target: 'ally', otherAlly: true, fx: [{ k: 'blockTarget', v: [8, 11] }, { k: 'block', v: [8, 11], solo: [14, 18] }], text: 'Ein Verbündeter und du erhalten je {block} Block', img: 'karte-schildwall' },
  { id: 'erschuettern', name: 'Erschüttern', cls: 'schildwacht', rarity: 'uncommon', cost: [1, 1], speed: 'normal', target: 'enemy', fx: [{ k: 'dmg', v: [6, 8] }, { k: 'weak', v: [1, 2] }], text: '{dmg} Schaden, Schwächung {weak}', img: 'karte-schildstoss' },
  { id: 'festungswall', name: 'Festungswall', cls: 'schildwacht', rarity: 'rare', cost: [2, 2], speed: 'fast', target: 'allAllies', fx: [{ k: 'blockAll', v: [7, 10], solo: [14, 18] }], text: 'Alle Spieler erhalten {blockAll} Block', img: 'karte-schildwall' },

  /* ---------- Klingenläufer ---------- */
  { id: 'schnitt', name: 'Schnitt', cls: 'klingenlaeufer', rarity: 'basis', cost: [1, 1], speed: 'normal', target: 'enemy', fx: [{ k: 'dmg', v: [6, 9] }], text: '{dmg} Schaden', img: 'karte-schnitt' },
  { id: 'ausweichen', name: 'Ausweichen', cls: 'klingenlaeufer', rarity: 'basis', cost: [1, 1], speed: 'normal', target: 'self', fx: [{ k: 'block', v: [5, 8] }], text: '{block} Block', img: 'karte-ausweichen' },
  { id: 'schneller-hieb', name: 'Schneller Hieb', cls: 'klingenlaeufer', rarity: 'basis', cost: [1, 1], speed: 'fast', target: 'enemy', fx: [{ k: 'dmg', v: [4, 6] }], text: '{dmg} Schaden', img: 'karte-schneller-hieb' },
  { id: 'hinrichtung', name: 'Hinrichtung', cls: 'klingenlaeufer', rarity: 'basis', cost: [2, 2], speed: 'slow', target: 'enemy', fx: [{ k: 'dmg', v: [8, 11] }], double: 'belowHalf', text: '{dmg} Schaden, doppelt gegen Gegner unter 50 % Leben', img: 'karte-hinrichtung' },
  { id: 'doppelschnitt', name: 'Doppelschnitt', cls: 'klingenlaeufer', rarity: 'common', cost: [1, 1], speed: 'normal', target: 'enemy', fx: [{ k: 'dmg', v: [4, 6], hits: [2, 2] }], text: '2 × {dmg} Schaden', img: 'karte-schnitt' },
  { id: 'finte', name: 'Finte', cls: 'klingenlaeufer', rarity: 'common', cost: [0, 0], speed: 'fast', target: 'enemy', fx: [{ k: 'dmg', v: [3, 5] }], text: '{dmg} Schaden', img: 'karte-schneller-hieb' },
  { id: 'sprungangriff', name: 'Sprungangriff', cls: 'klingenlaeufer', rarity: 'common', cost: [1, 1], speed: 'normal', target: 'enemy', fx: [{ k: 'dmg', v: [9, 12] }, { k: 'selfDmg', v: [2, 2] }], text: '{dmg} Schaden, du verlierst {selfDmg} Leben', img: 'karte-schnitt' },
  { id: 'rueckzugsschnitt', name: 'Rückzugsschnitt', cls: 'klingenlaeufer', rarity: 'common', cost: [1, 1], speed: 'normal', target: 'enemy', fx: [{ k: 'dmg', v: [5, 7] }, { k: 'block', v: [4, 6] }], text: '{dmg} Schaden, {block} Block', img: 'karte-ausweichen' },
  { id: 'blutrausch', name: 'Blutrausch', cls: 'klingenlaeufer', rarity: 'uncommon', cost: [1, 1], speed: 'normal', target: 'enemy', fx: [{ k: 'dmg', v: [5, 8] }, { k: 'energyOnKill', v: [1, 1] }], text: '{dmg} Schaden. Besiegt sie das Ziel: nächste Runde +1 Energie', img: 'karte-hinrichtung' },
  { id: 'wirbelklingen', name: 'Wirbelklingen', cls: 'klingenlaeufer', rarity: 'uncommon', cost: [2, 2], speed: 'normal', target: 'allEnemies', fx: [{ k: 'dmg', v: [6, 9] }], text: '{dmg} Schaden an alle Gegner', img: 'karte-schneller-hieb' },
  { id: 'ausnutzen', name: 'Ausnutzen', cls: 'klingenlaeufer', rarity: 'uncommon', cost: [1, 1], speed: 'normal', target: 'enemy', fx: [{ k: 'dmg', v: [6, 9] }], double: 'vulnOrMarked', text: '{dmg} Schaden, doppelt gegen verwundbare oder markierte Gegner', img: 'karte-schnitt' },
  { id: 'klingentanz', name: 'Klingentanz', cls: 'klingenlaeufer', rarity: 'rare', cost: [1, 1], speed: 'fast', target: 'randomEnemies', fx: [{ k: 'dmg', v: [3, 3], hits: [3, 4] }], text: '{hits} Treffer à {dmg} Schaden auf zufällige Gegner', img: 'karte-schneller-hieb' },

  /* ---------- Kräuterkundige ---------- */
  { id: 'dornenstich', name: 'Dornenstich', cls: 'kraeuterkundige', rarity: 'basis', cost: [1, 1], speed: 'normal', target: 'enemy', fx: [{ k: 'dmg', v: [5, 7] }], text: '{dmg} Schaden', img: 'karte-dornenstich' },
  { id: 'rindenhaut', name: 'Rindenhaut', cls: 'kraeuterkundige', rarity: 'basis', cost: [1, 1], speed: 'normal', target: 'self', fx: [{ k: 'block', v: [5, 8] }], text: '{block} Block', img: 'karte-rindenhaut' },
  { id: 'giftstachel', name: 'Giftstachel', cls: 'kraeuterkundige', rarity: 'basis', cost: [1, 1], speed: 'fast', target: 'enemy', fx: [{ k: 'poison', v: [3, 5] }], text: '{poison} Gift', img: 'karte-giftstachel' },
  { id: 'heilkraeuter', name: 'Heilkräuter', cls: 'kraeuterkundige', rarity: 'basis', cost: [1, 1], speed: 'normal', target: 'ally', fx: [{ k: 'heal', v: [6, 9] }], text: 'Heilt einen Spieler um {heal}', img: 'karte-heilkraeuter' },
  { id: 'giftwolke', name: 'Giftwolke', cls: 'kraeuterkundige', rarity: 'common', cost: [2, 2], speed: 'normal', target: 'allEnemies', fx: [{ k: 'poison', v: [2, 3] }], text: '{poison} Gift an alle Gegner', img: 'karte-giftstachel' },
  { id: 'heilsalbe', name: 'Heilsalbe', cls: 'kraeuterkundige', rarity: 'common', cost: [1, 1], speed: 'normal', target: 'ally', fx: [{ k: 'heal', v: [4, 6] }, { k: 'blockTarget', v: [4, 6] }], text: 'Ein Spieler: heilt {heal}, {blockTarget} Block', img: 'karte-heilkraeuter' },
  { id: 'dornenhieb', name: 'Dornenhieb', cls: 'kraeuterkundige', rarity: 'common', cost: [1, 1], speed: 'normal', target: 'enemy', fx: [{ k: 'dmg', v: [6, 8] }, { k: 'poison', v: [1, 2] }], text: '{dmg} Schaden, {poison} Gift', img: 'karte-dornenstich' },
  { id: 'laeutern', name: 'Läutern', cls: 'kraeuterkundige', rarity: 'common', cost: [0, 0], speed: 'fast', target: 'ally', fx: [{ k: 'cleanse' }, { k: 'heal', v: [2, 5] }], text: 'Entfernt alle negativen Effekte von einem Spieler, heilt {heal}', img: 'karte-heilkraeuter' },
  { id: 'virulenz', name: 'Virulenz', cls: 'kraeuterkundige', rarity: 'uncommon', cost: [1, 0], speed: 'slow', target: 'enemy', fx: [{ k: 'doublePoison' }], text: 'Verdoppelt das Gift eines Gegners', img: 'karte-giftstachel' },
  { id: 'wurzelgriff', name: 'Wurzelgriff', cls: 'kraeuterkundige', rarity: 'uncommon', cost: [1, 1], speed: 'normal', target: 'enemy', fx: [{ k: 'poison', v: [3, 5] }, { k: 'weak', v: [1, 2] }], text: '{poison} Gift, Schwächung {weak}', img: 'karte-dornenstich' },
  { id: 'lebenssaft', name: 'Lebenssaft', cls: 'kraeuterkundige', rarity: 'uncommon', cost: [2, 2], speed: 'normal', target: 'allAllies', fx: [{ k: 'healAll', v: [5, 8], solo: [9, 13] }], text: 'Alle Spieler werden um {healAll} geheilt', img: 'karte-heilkraeuter' },
  { id: 'pestbluete', name: 'Pestblüte', cls: 'kraeuterkundige', rarity: 'rare', cost: [2, 2], speed: 'slow', target: 'enemy', fx: [{ k: 'poisonBurst', v: [2, 3] }], text: 'Schaden in Höhe des {poisonBurst}-fachen Gifts des Ziels', img: 'karte-giftstachel' },
];

export const CARD: Record<string, CardDef> = Object.fromEntries(CARDS.map((c) => [c.id, c]));

export const CLASSES: Record<ClassId, ClassDef> = {
  schildwacht: {
    id: 'schildwacht', name: 'Schildwacht', role: 'Verteidigung', hp: 80, img: 'held-schildwacht',
    desc: 'Steht vor der Gruppe, fängt Schaden ab und lenkt Angriffe auf sich.',
    start: [['schildstoss', 4], ['deckung', 4], ['abfangen', 1], ['schildwall', 1]],
  },
  klingenlaeufer: {
    id: 'klingenlaeufer', name: 'Klingenläufer', role: 'Schaden', hp: 65, img: 'held-klingenlaeufer',
    desc: 'Schnelle, harte Schläge – besonders gegen geschwächte Gegner.',
    start: [['schnitt', 4], ['ausweichen', 4], ['schneller-hieb', 1], ['hinrichtung', 1]],
  },
  kraeuterkundige: {
    id: 'kraeuterkundige', name: 'Kräuterkundige', role: 'Heilung & Gift', hp: 60, img: 'held-kraeuterkundige',
    desc: 'Heilt die Gruppe und lässt Gegner langsam an Gift zugrunde gehen.',
    start: [['dornenstich', 4], ['rindenhaut', 4], ['giftstachel', 1], ['heilkraeuter', 1]],
  },
};
export const CLASS_IDS = Object.keys(CLASSES) as ClassId[];

export function rewardPool(cls: ClassId) {
  return CARDS.filter((c) => c.cls === cls && c.rarity !== 'basis');
}

/* ---------------- Gegner ---------------- */

/** Eine Gegneraktion. `all` = jeder Spieler wird getroffen */
export interface EnemyMove {
  name: string;
  dmg?: number;
  hits?: number;
  all?: boolean;
  block?: number;
  weakAll?: number;
  vuln?: number; // dem Ziel
  buff?: number; // +Schaden dauerhaft
}

export interface EnemyDef {
  id: string;
  name: string;
  hp: number;
  elite?: boolean;
  img: string;
  /** relative Höhe auf der Bühne */
  size: number;
  moves: EnemyMove[];
}

export const ENEMIES: Record<string, EnemyDef> = {
  skelett: {
    id: 'skelett', name: 'Skelett', hp: 24, img: 'gegner-skelett', size: 1,
    moves: [{ name: 'Hieb', dmg: 8 }, { name: 'Hieb', dmg: 8 }, { name: 'Schild hoch', block: 6, dmg: 5 }],
  },
  schlundhund: {
    id: 'schlundhund', name: 'Schlundhund', hp: 20, img: 'gegner-schlundhund', size: 0.8,
    moves: [{ name: 'Biss', dmg: 6, hits: 2 }, { name: 'Zerfleischen', dmg: 9, vuln: 1 }],
  },
  aschenkultist: {
    id: 'aschenkultist', name: 'Aschenkultist', hp: 30, img: 'gegner-aschenkultist', size: 1.05,
    moves: [{ name: 'Ascheregen', weakAll: 1 }, { name: 'Feuerzunge', dmg: 11 }, { name: 'Glutritual', buff: 3 }],
  },
  knochenkoloss: {
    id: 'knochenkoloss', name: 'Knochenkoloss', hp: 70, elite: true, img: 'gegner-knochenkoloss', size: 1.3,
    moves: [{ name: 'Zermalmen', dmg: 16 }, { name: 'Knochensturm', dmg: 7, all: true }, { name: 'Sammeln', block: 8, buff: 3 }],
  },
};

/** Die drei Kämpfe des Prototyps (Grundgruppe für 1–3 Spieler) */
export const FIGHTS: { enemies: string[]; elite?: boolean }[] = [
  { enemies: ['skelett', 'schlundhund'] },
  { enemies: ['aschenkultist', 'skelett'] },
  { enemies: ['skelett', 'knochenkoloss'], elite: true },
];

/** Gegner-Leben je Spielerzahl */
/** Gesamtleben der Gegner relativ zur Grundgruppe (wird auf alle Gegner verteilt, auch zusätzliche) */
export const hpScale = (players: number) => (players === 1 ? 0.75 : 0.8 + 0.6 * (players - 1));
/** Schaden der Gegner je Spielerzahl (allein schwächer, in großen Gruppen stärker) */
export const dmgScale = (players: number) => (players === 1 ? 0.85 : 1 + 0.06 * (players - 2));
/** Zusätzliche Gegner je Spielerzahl */
export const extraEnemies = (players: number) => Math.min(5, Math.floor((players - 1) / 2));

export const RARITY_ODDS = {
  normal: { common: 0.7, uncommon: 0.25, rare: 0.05 },
  elite: { common: 0.5, uncommon: 0.4, rare: 0.1 },
};
