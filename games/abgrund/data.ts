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
  | { k: 'energyOnKill'; v: [number, number] }
  | { k: 'str'; v: [number, number] } // Stärke bis Kampfende (+Schaden pro Treffer)
  | { k: 'strAll'; v: [number, number] } // Stärke für alle Spieler
  | { k: 'roundStr'; v: [number, number] } // diese Runde +Schaden pro Treffer
  | { k: 'dmgFromBlock'; v: [number, number] } // Schaden = eigener Block × v
  | { k: 'keepBlock' } // eigener Block verfällt diese Runde nicht
  | { k: 'stun' } // Ziel setzt seine nächste Aktion aus
  | { k: 'maxHpAll'; v: [number, number]; solo?: [number, number] } // +maximale Leben für alle (bleibt)
  | { k: 'power'; p: PowerId; v: [number, number] } // wirkt bis Kampfende jede Runde
  | { k: 'undying' } // einmal mit 1 Leben stehen bleiben (dieser Kampf)
  | { k: 'revive' } // erster Spieler, der fällt, steht wieder auf (dieser Kampf)
  | { k: 'execute'; v: [number, number] } // Gegner unter 25 % besiegt; Bosse erleiden v Schaden
  | { k: 'doubleAtk' }; // eigene Angriffskarten wirken diese Runde doppelt

/** Kräfte: wirken bis Kampfende zu Beginn jeder Runde */
export type PowerId = 'blockRound' | 'blockAllRound' | 'poisonAllRound' | 'healAllRound' | 'thorns';

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
  /** Text, wenn man allein spielt */
  soloText?: string;
  /** Erschöpft: nach dem Ausspielen für den Rest des Kampfes weg */
  exhaust?: boolean;
}

export interface ClassDef {
  id: ClassId;
  name: string;
  role: string;
  hp: number;
  desc: string;
  img: string;
  /** Klassenfarbe: Kartenrahmen, Namensband, Kostensiegel (später auch die Figur) */
  color: string;
  start: [string, number][];
}

const CARDS: CardDef[] = [
  /* ---------- Schildwacht ---------- */
  { id: 'schildstoss', name: 'Schildstoß', cls: 'schildwacht', rarity: 'basis', cost: [1, 1], speed: 'normal', target: 'enemy', fx: [{ k: 'dmg', v: [5, 7] }], text: '{dmg} Schaden', img: 'karte-schildstoss-2' },
  { id: 'deckung', name: 'Deckung', cls: 'schildwacht', rarity: 'basis', cost: [1, 1], speed: 'normal', target: 'self', fx: [{ k: 'block', v: [6, 9] }], text: '{block} Block', img: 'karte-deckung-2' },
  { id: 'abfangen', name: 'Abfangen', cls: 'schildwacht', rarity: 'basis', cost: [1, 1], speed: 'fast', target: 'ally', otherAlly: true, fx: [{ k: 'redirect' }, { k: 'block', v: [4, 7], solo: [8, 12] }], text: 'Angriffe auf einen Verbündeten treffen diese Runde dich. {block} Block', img: 'karte-abfangen-2' },
  { id: 'schildwall', name: 'Schildwall', cls: 'schildwacht', rarity: 'basis', cost: [2, 2], speed: 'normal', target: 'allAllies', fx: [{ k: 'blockAll', v: [6, 8], solo: [13, 17] }], text: 'Alle Spieler erhalten {blockAll} Block', img: 'karte-schildwall-2' },
  { id: 'schildramme', name: 'Schildramme', cls: 'schildwacht', rarity: 'common', cost: [1, 1], speed: 'normal', target: 'enemy', fx: [{ k: 'dmg', v: [4, 6] }, { k: 'block', v: [4, 6] }], text: '{dmg} Schaden, {block} Block', img: 'karte-schildstoss-2' },
  { id: 'wachsam', name: 'Wachsam', cls: 'schildwacht', rarity: 'common', cost: [1, 1], speed: 'fast', target: 'self', fx: [{ k: 'block', v: [7, 10] }], text: '{block} Block', img: 'karte-deckung-2' },
  { id: 'herausfordern', name: 'Herausfordern', cls: 'schildwacht', rarity: 'common', cost: [1, 1], speed: 'fast', target: 'self', fx: [{ k: 'taunt' }, { k: 'block', v: [3, 6] }], text: 'Alle Gegner greifen diese Runde dich an. {block} Block', img: 'karte-abfangen-2' },
  { id: 'schwerer-schlag', name: 'Schwerer Schlag', cls: 'schildwacht', rarity: 'common', cost: [2, 2], speed: 'slow', target: 'enemy', fx: [{ k: 'dmg', v: [14, 19] }], text: '{dmg} Schaden', img: 'karte-schildstoss-2' },
  { id: 'gegenwehr', name: 'Gegenwehr', cls: 'schildwacht', rarity: 'uncommon', cost: [1, 1], speed: 'normal', target: 'self', fx: [{ k: 'block', v: [5, 8] }, { k: 'thorns', v: [5, 8] }], text: '{block} Block. Wirst du angegriffen: {thorns} Schaden zurück', img: 'karte-deckung-2' },
  { id: 'bollwerk', name: 'Bollwerk', cls: 'schildwacht', rarity: 'uncommon', cost: [2, 2], speed: 'normal', target: 'ally', otherAlly: true, fx: [{ k: 'blockTarget', v: [8, 11] }, { k: 'block', v: [8, 11], solo: [14, 18] }], text: 'Ein Verbündeter und du erhalten je {block} Block', img: 'karte-schildwall-2' },
  { id: 'erschuettern', name: 'Erschüttern', cls: 'schildwacht', rarity: 'uncommon', cost: [1, 1], speed: 'normal', target: 'enemy', fx: [{ k: 'dmg', v: [6, 8] }, { k: 'weak', v: [1, 2] }], text: '{dmg} Schaden, Schwächung {weak}', img: 'karte-schildstoss-2' },
  { id: 'festungswall', name: 'Festungswall', cls: 'schildwacht', rarity: 'rare', cost: [2, 2], speed: 'fast', target: 'allAllies', fx: [{ k: 'blockAll', v: [7, 10], solo: [14, 18] }], text: 'Alle Spieler erhalten {blockAll} Block', img: 'karte-schildwall-2' },

  /* ---------- Klingenläufer ---------- */
  { id: 'schnitt', name: 'Schnitt', cls: 'klingenlaeufer', rarity: 'basis', cost: [1, 1], speed: 'normal', target: 'enemy', fx: [{ k: 'dmg', v: [6, 9] }], text: '{dmg} Schaden', img: 'karte-schnitt-2' },
  { id: 'ausweichen', name: 'Ausweichen', cls: 'klingenlaeufer', rarity: 'basis', cost: [1, 1], speed: 'normal', target: 'self', fx: [{ k: 'block', v: [5, 8] }], text: '{block} Block', img: 'karte-ausweichen-2' },
  { id: 'schneller-hieb', name: 'Schneller Hieb', cls: 'klingenlaeufer', rarity: 'basis', cost: [1, 1], speed: 'fast', target: 'enemy', fx: [{ k: 'dmg', v: [4, 6] }], text: '{dmg} Schaden', img: 'karte-schneller-hieb-2' },
  { id: 'hinrichtung', name: 'Hinrichtung', cls: 'klingenlaeufer', rarity: 'basis', cost: [2, 2], speed: 'slow', target: 'enemy', fx: [{ k: 'dmg', v: [8, 11] }], double: 'belowHalf', text: '{dmg} Schaden, doppelt gegen Gegner unter 50 % Leben', img: 'karte-hinrichtung-2' },
  { id: 'doppelschnitt', name: 'Doppelschnitt', cls: 'klingenlaeufer', rarity: 'common', cost: [1, 1], speed: 'normal', target: 'enemy', fx: [{ k: 'dmg', v: [4, 6], hits: [2, 2] }], text: '2 × {dmg} Schaden', img: 'karte-schnitt-2' },
  { id: 'finte', name: 'Finte', cls: 'klingenlaeufer', rarity: 'common', cost: [0, 0], speed: 'fast', target: 'enemy', fx: [{ k: 'dmg', v: [3, 5] }], text: '{dmg} Schaden', img: 'karte-schneller-hieb-2' },
  { id: 'sprungangriff', name: 'Sprungangriff', cls: 'klingenlaeufer', rarity: 'common', cost: [1, 1], speed: 'normal', target: 'enemy', fx: [{ k: 'dmg', v: [9, 12] }, { k: 'selfDmg', v: [2, 2] }], text: '{dmg} Schaden, du verlierst {selfDmg} Leben', img: 'karte-schnitt-2' },
  { id: 'rueckzugsschnitt', name: 'Rückzugsschnitt', cls: 'klingenlaeufer', rarity: 'common', cost: [1, 1], speed: 'normal', target: 'enemy', fx: [{ k: 'dmg', v: [5, 7] }, { k: 'block', v: [4, 6] }], text: '{dmg} Schaden, {block} Block', img: 'karte-ausweichen-2' },
  { id: 'blutrausch', name: 'Blutrausch', cls: 'klingenlaeufer', rarity: 'uncommon', cost: [1, 1], speed: 'normal', target: 'enemy', fx: [{ k: 'dmg', v: [5, 8] }, { k: 'energyOnKill', v: [1, 1] }], text: '{dmg} Schaden. Besiegt sie das Ziel: nächste Runde +1 Energie', img: 'karte-hinrichtung-2' },
  { id: 'wirbelklingen', name: 'Wirbelklingen', cls: 'klingenlaeufer', rarity: 'uncommon', cost: [2, 2], speed: 'normal', target: 'allEnemies', fx: [{ k: 'dmg', v: [6, 9] }], text: '{dmg} Schaden an alle Gegner', img: 'karte-schneller-hieb-2' },
  { id: 'ausnutzen', name: 'Ausnutzen', cls: 'klingenlaeufer', rarity: 'uncommon', cost: [1, 1], speed: 'normal', target: 'enemy', fx: [{ k: 'dmg', v: [6, 9] }], double: 'vulnOrMarked', text: '{dmg} Schaden, doppelt gegen verwundbare oder markierte Gegner', img: 'karte-schnitt-2' },
  { id: 'klingentanz', name: 'Klingentanz', cls: 'klingenlaeufer', rarity: 'rare', cost: [1, 1], speed: 'fast', target: 'randomEnemies', fx: [{ k: 'dmg', v: [3, 3], hits: [3, 4] }], text: '{hits} × {dmg} Schaden auf zufällige Gegner', img: 'karte-schneller-hieb-2' },

  /* ---------- Kräuterkundige ---------- */
  { id: 'dornenstich', name: 'Dornenstich', cls: 'kraeuterkundige', rarity: 'basis', cost: [1, 1], speed: 'normal', target: 'enemy', fx: [{ k: 'dmg', v: [5, 7] }], text: '{dmg} Schaden', img: 'karte-dornenstich-2' },
  { id: 'rindenhaut', name: 'Rindenhaut', cls: 'kraeuterkundige', rarity: 'basis', cost: [1, 1], speed: 'normal', target: 'self', fx: [{ k: 'block', v: [5, 8] }], text: '{block} Block', img: 'karte-rindenhaut-2' },
  { id: 'giftstachel', name: 'Giftstachel', cls: 'kraeuterkundige', rarity: 'basis', cost: [1, 1], speed: 'fast', target: 'enemy', fx: [{ k: 'poison', v: [3, 5] }], text: '{poison} Gift', img: 'karte-giftstachel-2' },
  { id: 'heilkraeuter', name: 'Heilkräuter', cls: 'kraeuterkundige', rarity: 'basis', cost: [1, 1], speed: 'normal', target: 'ally', fx: [{ k: 'heal', v: [6, 9] }], text: 'Heilt einen Spieler um {heal}', img: 'karte-heilkraeuter-2' },
  { id: 'giftwolke', name: 'Giftwolke', cls: 'kraeuterkundige', rarity: 'common', cost: [2, 2], speed: 'normal', target: 'allEnemies', fx: [{ k: 'poison', v: [2, 3] }], text: '{poison} Gift an alle Gegner', img: 'karte-giftstachel-2' },
  { id: 'heilsalbe', name: 'Heilsalbe', cls: 'kraeuterkundige', rarity: 'common', cost: [1, 1], speed: 'normal', target: 'ally', fx: [{ k: 'heal', v: [4, 6] }, { k: 'blockTarget', v: [4, 6] }], text: 'Ein Spieler: heilt {heal}, {blockTarget} Block', img: 'karte-heilkraeuter-2' },
  { id: 'dornenhieb', name: 'Dornenhieb', cls: 'kraeuterkundige', rarity: 'common', cost: [1, 1], speed: 'normal', target: 'enemy', fx: [{ k: 'dmg', v: [6, 8] }, { k: 'poison', v: [1, 2] }], text: '{dmg} Schaden, {poison} Gift', img: 'karte-dornenstich-2' },
  { id: 'laeutern', name: 'Läutern', cls: 'kraeuterkundige', rarity: 'common', cost: [0, 0], speed: 'fast', target: 'ally', fx: [{ k: 'cleanse' }, { k: 'heal', v: [2, 5] }], text: 'Entfernt alle negativen Effekte von einem Spieler, heilt {heal}', img: 'karte-heilkraeuter-2' },
  { id: 'virulenz', name: 'Virulenz', cls: 'kraeuterkundige', rarity: 'uncommon', cost: [1, 0], speed: 'slow', target: 'enemy', fx: [{ k: 'doublePoison' }], text: 'Verdoppelt das Gift eines Gegners', img: 'karte-giftstachel-2' },
  { id: 'wurzelgriff', name: 'Wurzelgriff', cls: 'kraeuterkundige', rarity: 'uncommon', cost: [1, 1], speed: 'normal', target: 'enemy', fx: [{ k: 'poison', v: [3, 5] }, { k: 'weak', v: [1, 2] }], text: '{poison} Gift, Schwächung {weak}', img: 'karte-dornenstich-2' },
  { id: 'lebenssaft', name: 'Lebenssaft', cls: 'kraeuterkundige', rarity: 'uncommon', cost: [2, 2], speed: 'normal', target: 'allAllies', fx: [{ k: 'healAll', v: [5, 8], solo: [9, 13] }], text: 'Alle Spieler werden um {healAll} geheilt', img: 'karte-heilkraeuter-2' },
  { id: 'pestbluete', name: 'Pestblüte', cls: 'kraeuterkundige', rarity: 'rare', cost: [2, 2], speed: 'slow', target: 'enemy', fx: [{ k: 'poisonBurst', v: [2, 3] }], text: 'Schaden in Höhe des {poisonBurst}-fachen Gifts des Ziels', img: 'karte-giftstachel-2' },

  /* ---------- Neu in Akt I ---------- */
  { id: 'schildschlag', name: 'Schildschlag', cls: 'schildwacht', rarity: 'common', cost: [1, 0], speed: 'slow', target: 'enemy', fx: [{ k: 'dmgFromBlock', v: [1, 1] }], text: 'Schaden in Höhe deines Blocks', img: 'karte-schildschlag' },
  { id: 'wachposten', name: 'Wachposten', cls: 'schildwacht', rarity: 'common', cost: [1, 1], speed: 'normal', target: 'ally', otherAlly: true, fx: [{ k: 'blockTarget', v: [5, 7] }, { k: 'block', v: [5, 7], solo: [9, 12] }], text: 'Ein Verbündeter und du erhalten je {block} Block', soloText: '{block} Block', img: 'karte-wachposten' },
  { id: 'kampfschrei', name: 'Kampfschrei', cls: 'schildwacht', rarity: 'uncommon', cost: [1, 1], speed: 'fast', target: 'allAllies', fx: [{ k: 'strAll', v: [1, 2] }], text: 'Alle Spieler erhalten {strAll} Stärke', soloText: 'Du erhältst {strAll} Stärke', exhaust: true, img: 'karte-herausforderung' },
  { id: 'eiserne-dornen', name: 'Eiserne Dornen', cls: 'schildwacht', rarity: 'uncommon', cost: [1, 1], speed: 'normal', target: 'self', fx: [{ k: 'power', p: 'thorns', v: [3, 5] }], text: 'Bis Kampfende: Greift dich ein Gegner an, {power} Schaden zurück', exhaust: true, img: 'karte-gegenwehr' },
  { id: 'ruestung-schmieden', name: 'Rüstung schmieden', cls: 'schildwacht', rarity: 'uncommon', cost: [2, 1], speed: 'normal', target: 'self', fx: [{ k: 'power', p: 'blockRound', v: [3, 4] }], text: 'Bis Kampfende: jede Runde {power} Block', exhaust: true, img: 'karte-ruestung-schmieden' },
  { id: 'unerschuetterlich', name: 'Unerschütterlich', cls: 'schildwacht', rarity: 'rare', cost: [3, 2], speed: 'slow', target: 'self', fx: [{ k: 'block', v: [20, 26] }, { k: 'keepBlock' }], text: '{block} Block. Dein Block verfällt diese Runde nicht', img: 'karte-unerschuetterlich' },
  { id: 'kreuzschnitt', name: 'Kreuzschnitt', cls: 'klingenlaeufer', rarity: 'common', cost: [1, 1], speed: 'normal', target: 'enemy', fx: [{ k: 'dmg', v: [7, 9] }, { k: 'mark', v: [2, 3] }], text: '{dmg} Schaden, Markiert {mark}', img: 'karte-doppelschnitt' },
  { id: 'kehlschnitt', name: 'Kehlschnitt', cls: 'klingenlaeufer', rarity: 'common', cost: [1, 1], speed: 'normal', target: 'enemy', fx: [{ k: 'dmg', v: [5, 7] }, { k: 'weak', v: [1, 2] }], text: '{dmg} Schaden, Schwächung {weak}', img: 'karte-kehlschnitt' },
  { id: 'schattenschritt', name: 'Schattenschritt', cls: 'klingenlaeufer', rarity: 'common', cost: [0, 0], speed: 'fast', target: 'self', fx: [{ k: 'block', v: [4, 6] }, { k: 'roundStr', v: [3, 4] }], text: '{block} Block. +{roundStr} Stärke für diese Runde', img: 'karte-schattenschritt' },
  { id: 'klingensturm', name: 'Klingensturm', cls: 'klingenlaeufer', rarity: 'uncommon', cost: [2, 2], speed: 'normal', target: 'allEnemies', fx: [{ k: 'dmg', v: [4, 5], hits: [2, 2] }], text: '2 × {dmg} Schaden an alle Gegner', img: 'karte-klingenwirbel' },
  { id: 'kampfrausch', name: 'Kampfrausch', cls: 'klingenlaeufer', rarity: 'uncommon', cost: [1, 1], speed: 'fast', target: 'self', fx: [{ k: 'str', v: [2, 3] }], text: '+{str} Stärke', exhaust: true, img: 'karte-blutrausch' },
  { id: 'tausend-schnitte', name: 'Tausend Schnitte', cls: 'klingenlaeufer', rarity: 'rare', cost: [3, 3], speed: 'normal', target: 'randomEnemies', fx: [{ k: 'dmg', v: [3, 4], hits: [6, 6] }], text: '{hits} × {dmg} Schaden auf zufällige Gegner', img: 'karte-tausend-schnitte' },
  { id: 'brennnessel', name: 'Brennnessel', cls: 'kraeuterkundige', rarity: 'common', cost: [1, 1], speed: 'normal', target: 'enemy', fx: [{ k: 'poison', v: [3, 4] }, { k: 'vuln', v: [1, 2] }], text: '{poison} Gift, Verwundbar {vuln}', img: 'karte-brennnessel' },
  { id: 'heiltrank', name: 'Heiltrank', cls: 'kraeuterkundige', rarity: 'common', cost: [1, 1], speed: 'fast', target: 'ally', fx: [{ k: 'heal', v: [8, 11] }], text: 'Heilt einen Spieler um {heal}', img: 'karte-heiltrank' },
  { id: 'wurzelschild', name: 'Wurzelschild', cls: 'kraeuterkundige', rarity: 'common', cost: [1, 1], speed: 'normal', target: 'allAllies', fx: [{ k: 'blockAll', v: [3, 5], solo: [6, 9] }], text: 'Alle Spieler erhalten {blockAll} Block', img: 'karte-wurzelschild' },
  { id: 'miasma', name: 'Miasma', cls: 'kraeuterkundige', rarity: 'uncommon', cost: [2, 2], speed: 'normal', target: 'self', fx: [{ k: 'power', p: 'poisonAllRound', v: [1, 2] }], text: 'Bis Kampfende: jede Runde {power} Gift an alle Gegner', exhaust: true, img: 'karte-miasma' },
  { id: 'schlafmohn', name: 'Schlafmohn', cls: 'kraeuterkundige', rarity: 'rare', cost: [2, 1], speed: 'normal', target: 'enemy', fx: [{ k: 'stun' }], text: 'Betäubt einen Gegner: er setzt seine nächste Aktion aus', img: 'karte-schlafmohn' },
  { id: 'elixier', name: 'Elixier des Lebens', cls: 'kraeuterkundige', rarity: 'rare', cost: [2, 2], speed: 'normal', target: 'allAllies', fx: [{ k: 'healAll', v: [6, 9], solo: [10, 14] }, { k: 'maxHpAll', v: [4, 6], solo: [6, 8] }], text: 'Alle Spieler heilen {healAll} und erhalten +{maxHpAll} maximale Leben', soloText: 'Du heilst {healAll} und erhältst +{maxHpAll} maximale Leben', img: 'karte-elixier' },

  /* ---------- Legendär (Boss-Belohnung) ---------- */
  { id: 'aegis', name: 'Ägis', cls: 'schildwacht', rarity: 'legendary', cost: [3, 2], speed: 'normal', target: 'self', fx: [{ k: 'power', p: 'blockAllRound', v: [6, 8] }], text: 'Bis Kampfende: alle Spieler erhalten jede Runde {power} Block', soloText: 'Bis Kampfende: jede Runde {power} Block', exhaust: true, img: 'karte-aegis' },
  { id: 'letztes-gefecht', name: 'Letztes Gefecht', cls: 'schildwacht', rarity: 'legendary', cost: [2, 2], speed: 'slow', target: 'enemy', fx: [{ k: 'dmgFromBlock', v: [2, 3] }], text: 'Schaden in Höhe deines {dmgFromBlock}-fachen Blocks', img: 'karte-letztes-gefecht' },
  { id: 'unbeugsam', name: 'Unbeugsam', cls: 'schildwacht', rarity: 'legendary', cost: [1, 0], speed: 'fast', target: 'self', fx: [{ k: 'undying' }], text: 'Fällst du in diesem Kampf, bleibst du einmal mit 1 Leben stehen', exhaust: true, img: 'karte-unbeugsam' },
  { id: 'todesreigen', name: 'Todesreigen', cls: 'klingenlaeufer', rarity: 'legendary', cost: [2, 2], speed: 'normal', target: 'randomEnemies', fx: [{ k: 'dmg', v: [5, 7], hits: [5, 5] }], text: '{hits} × {dmg} Schaden auf zufällige Gegner', img: 'karte-todesreigen' },
  { id: 'mondsichel', name: 'Mondsichel', cls: 'klingenlaeufer', rarity: 'legendary', cost: [2, 1], speed: 'slow', target: 'allEnemies', fx: [{ k: 'execute', v: [20, 30] }], text: 'Besiegt alle Gegner unter 25 % Leben. Bosse erleiden stattdessen {execute} Schaden', img: 'karte-mondsichel' },
  { id: 'schattenklon', name: 'Schattenklon', cls: 'klingenlaeufer', rarity: 'legendary', cost: [1, 0], speed: 'fast', target: 'self', fx: [{ k: 'doubleAtk' }], text: 'Deine Angriffskarten wirken diese Runde doppelt', img: 'karte-schattenklon' },
  { id: 'pestwind', name: 'Pestwind', cls: 'kraeuterkundige', rarity: 'legendary', cost: [1, 0], speed: 'slow', target: 'allEnemies', fx: [{ k: 'doublePoison' }], text: 'Verdoppelt das Gift aller Gegner', img: 'karte-pestwind' },
  { id: 'lebensbaum', name: 'Lebensbaum', cls: 'kraeuterkundige', rarity: 'legendary', cost: [2, 2], speed: 'normal', target: 'self', fx: [{ k: 'power', p: 'healAllRound', v: [4, 6] }], text: 'Bis Kampfende: alle Spieler heilen jede Runde {power}', soloText: 'Bis Kampfende: jede Runde {power} heilen', exhaust: true, img: 'karte-lebensbaum' },
  { id: 'wiedergeburt', name: 'Wiedergeburt', cls: 'kraeuterkundige', rarity: 'legendary', cost: [2, 1], speed: 'normal', target: 'self', fx: [{ k: 'revive' }], text: 'Fällt in diesem Kampf ein Spieler, steht er einmal mit 30 % Leben wieder auf', exhaust: true, img: 'karte-wiedergeburt' },
];

export const CARD: Record<string, CardDef> = Object.fromEntries(CARDS.map((c) => [c.id, c]));

export const CLASSES: Record<ClassId, ClassDef> = {
  schildwacht: {
    id: 'schildwacht', name: 'Schildwacht', role: 'Verteidigung', hp: 80, img: 'held-schildwacht-2', color: '#3A5A78',
    desc: 'Steht vor der Gruppe, fängt Schaden ab und lenkt Angriffe auf sich.',
    start: [['schildstoss', 4], ['deckung', 4], ['abfangen', 1], ['schildwall', 1]],
  },
  klingenlaeufer: {
    id: 'klingenlaeufer', name: 'Klingenläufer', role: 'Schaden', hp: 65, img: 'held-klingenlaeufer-2', color: '#5B3A6E',
    desc: 'Schnelle, harte Schläge – besonders gegen geschwächte Gegner.',
    start: [['schnitt', 4], ['ausweichen', 4], ['schneller-hieb', 1], ['hinrichtung', 1]],
  },
  kraeuterkundige: {
    id: 'kraeuterkundige', name: 'Kräuterkundige', role: 'Heilung & Gift', hp: 60, img: 'held-kraeuterkundige-2', color: '#4F6B35',
    desc: 'Heilt die Gruppe und lässt Gegner langsam an Gift zugrunde gehen.',
    start: [['dornenstich', 4], ['rindenhaut', 4], ['giftstachel', 1], ['heilkraeuter', 1]],
  },
};
export const CLASS_IDS = Object.keys(CLASSES) as ClassId[];

export function rewardPool(cls: ClassId) {
  return CARDS.filter((c) => c.cls === cls && c.rarity !== 'basis' && c.rarity !== 'legendary');
}
export function legendaryPool(cls: ClassId) {
  return CARDS.filter((c) => c.cls === cls && c.rarity === 'legendary');
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
  poison?: number; // dem Ziel
  vulnAll?: number; // alle Spieler verwundbar
  healAlly?: number; // heilt den angeschlagensten anderen Gegner
  blockAllies?: number; // Block für alle Gegner
  weakest?: boolean; // zielt auf den Spieler mit den wenigsten Leben
  spawn?: { id: string; n: number }; // ruft Gegner herbei
  charge?: boolean; // lädt auf (nächste Aktion ist gewaltig)
  ifMinions?: boolean; // nur, solange herbeigerufene Gegner leben (sonst nichts)
  curse?: boolean; // unbekannter Fluch auf ein Ziel (Schwächung, Verwundbar oder Gift) – erst bei der Auflösung sichtbar
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
  boss?: boolean;
  /** ab der Hälfte der Leben (Bosse) */
  phase2?: EnemyMove[];
  /** Ersatzbild, solange das eigene noch fehlt */
  fallback?: string;
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
  rattenschwarm: {
    id: 'rattenschwarm', name: 'Rattenschwarm', hp: 18, img: 'gegner-rattenschwarm', fallback: 'gegner-schlundhund', size: 0.7,
    moves: [{ name: 'Nagen', dmg: 3, hits: 3 }, { name: 'Seuche', poison: 2 }],
  },
  knochenpriester: {
    id: 'knochenpriester', name: 'Knochenpriester', hp: 26, img: 'gegner-knochenpriester', fallback: 'gegner-aschenkultist', size: 1.05,
    moves: [{ name: 'Dunkle Gnade', healAlly: 8 }, { name: 'Fluch', vuln: 2 }, { name: 'Knochenschild', blockAllies: 6 }, { name: 'Dunkles Omen', curse: true }],
  },
  gruftwaechter: {
    id: 'gruftwaechter', name: 'Gruftwächter', hp: 40, img: 'gegner-gruftwaechter', fallback: 'gegner-knochenkoloss', size: 1.15,
    moves: [{ name: 'Steinhaut', block: 10 }, { name: 'Hammerschlag', dmg: 14 }, { name: 'Hammerschlag', dmg: 14 }],
  },
  henker: {
    id: 'henker', name: 'Der Henker', hp: 75, elite: true, img: 'gegner-henker', fallback: 'gegner-knochenkoloss', size: 1.3,
    moves: [{ name: 'Urteil', vulnAll: 2 }, { name: 'Richtbeil', dmg: 20, weakest: true }, { name: 'Kettenhieb', dmg: 8, all: true, weakAll: 1 }],
  },
  brutling: {
    id: 'brutling', name: 'Brutling', hp: 8, img: 'gegner-brutling', fallback: 'gegner-schlundhund', size: 0.5,
    moves: [{ name: 'Biss', dmg: 4 }],
  },
  grubenmutter: {
    id: 'grubenmutter', name: 'Die Grubenmutter', hp: 130, boss: true, img: 'boss-grubenmutter', fallback: 'gegner-knochenkoloss', size: 1.4,
    moves: [{ name: 'Brut gebären', spawn: { id: 'brutling', n: 2 } }, { name: 'Säurespucke', dmg: 12, vuln: 1 }, { name: 'Nest schützen', block: 10, ifMinions: true }],
  },
  aschenfuerst: {
    id: 'aschenfuerst', name: 'Der Aschenfürst', hp: 150, boss: true, img: 'boss-aschenfuerst', fallback: 'gegner-aschenkultist', size: 1.4,
    moves: [{ name: 'Glutschlag', dmg: 12 }, { name: 'Aufladen', charge: true }, { name: 'Feuersbrunst', dmg: 30, all: true }, { name: 'Ascheregen', weakAll: 1 }],
    phase2: [{ name: 'Aufladen', charge: true }, { name: 'Feuersbrunst', dmg: 30, all: true }, { name: 'Ascheregen', weakAll: 1 }],
  },
};

/** Eine Kampf-Aufstellung (Grundgruppe für 1–3 Spieler) */
export interface FightSpec { enemies: string[]; elite?: boolean; boss?: boolean }

/** Kampf-Aufstellungen in Akt I */
export const FIGHT_POOLS: Record<'easy' | 'normal' | 'elite', FightSpec[]> = {
  easy: [
    { enemies: ['skelett', 'schlundhund'] },
    { enemies: ['aschenkultist', 'skelett'] },
    { enemies: ['schlundhund', 'rattenschwarm'] },
  ],
  normal: [
    { enemies: ['knochenpriester', 'gruftwaechter'] },
    { enemies: ['rattenschwarm', 'aschenkultist'] },
    { enemies: ['gruftwaechter', 'schlundhund'] },
    { enemies: ['knochenpriester', 'skelett', 'rattenschwarm'] },
    { enemies: ['aschenkultist', 'schlundhund', 'skelett'] },
  ],
  elite: [
    { enemies: ['skelett', 'knochenkoloss'], elite: true },
    { enemies: ['henker'], elite: true },
  ],
};
export const BOSSES = ['grubenmutter', 'aschenfuerst'] as const;

/* ---------------- Relikte ---------------- */

export interface RelicDef { id: string; name: string; text: string; group?: boolean; risky?: boolean; img: string; letter: string }
export const RELICS: Record<string, RelicDef> = Object.fromEntries(([
  { id: 'kerzenstumpf', name: 'Kerzenstumpf', text: '+1 Energie in der ersten Runde jedes Kampfes.' },
  { id: 'eisenkette', name: 'Eisenkette', text: 'Alle Spieler starten jeden Kampf mit 4 Block.', group: true },
  { id: 'blutstein', name: 'Blutstein', text: 'Nach jedem gewonnenen Kampf heilst du 6 Leben.' },
  { id: 'schleifstein', name: 'Schleifstein', text: 'Deine erste Angriffskarte jeder Runde macht 3 Schaden mehr.' },
  { id: 'kraeuterbeutel', name: 'Kräuterbeutel', text: 'Deine Heilkarten heilen 2 mehr.' },
  { id: 'giftzahn', name: 'Giftzahn', text: 'Wenn du Gift gibst, +1 Gift.' },
  { id: 'kriegsbanner', name: 'Kriegsbanner', text: 'Alle Spieler machen in der ersten Runde jedes Kampfes 2 Schaden mehr pro Treffer.', group: true },
  { id: 'talisman', name: 'Talisman der Wacht', text: 'Fällt ein Spieler unter 25 % Leben, bekommt er sofort 10 Block (einmal pro Kampf).', group: true },
  { id: 'goldwaage', name: 'Goldene Waage', text: 'Du bekommst 50 % mehr Gold.' },
  { id: 'rabenfeder', name: 'Rabenfeder', text: 'Du ziehst in der ersten Runde jedes Kampfes 1 Karte mehr.' },
  { id: 'knochenwuerfel', name: 'Knochenwürfel', text: 'Zu Kampfbeginn wird ein zufälliger Gegner verwundbar (1 Runde).', group: true },
  { id: 'lebensfaden', name: 'Lebensfaden', text: '+10 maximale Leben.' },
  { id: 'schwarze-kerze', name: 'Schwarze Kerze', text: '+1 Energie jede Runde, aber am Rundenende 2 Schaden.', risky: true },
  { id: 'fluchklinge', name: 'Fluchklinge', text: 'Deine Treffer machen 4 Schaden mehr, aber du erleidest 25 % mehr Schaden.', risky: true },
  { id: 'seelenpakt', name: 'Seelenpakt', text: 'Du ziehst jede Runde 1 Karte mehr, aber −12 maximale Leben.', risky: true },
] as Omit<RelicDef, 'img' | 'letter'>[]).map((r) => [r.id, { ...r, img: `relikt-${r.id}`, letter: r.name[0] }]));
export const RELIC_IDS = Object.keys(RELICS);

/* ---------------- Ereignisse ---------------- */

export interface EventDef { id: string; name: string; img: string; text: string; group: boolean; /** frühestens ab Stufe */ minLv?: number; /** nur, wenn jeder so viel Gold hat */ minGold?: number; options: { id: string; label: string; desc: string; /** Gold pro Spieler */ cost?: number }[] }
export const EVENTS: EventDef[] = [
  { id: 'gruft', name: 'Die versiegelte Gruft', img: 'ereignis-gruft', group: true, text: 'Eine Steintür, mit Ketten verschlossen. Dahinter schlurft etwas Schweres hin und her. Auf der Schwelle glänzt ein altes Siegel.',
    options: [{ id: 'open', label: 'Öffnen', desc: 'Kampf gegen einen Gruftwächter – danach ein Relikt für jeden' }, { id: 'leave', label: 'Weitergehen', desc: 'Nichts passiert' }] },
  { id: 'brunnen', name: 'Brunnen der Tiefe', img: 'ereignis-brunnen', group: true, minLv: 3, text: 'Ein uralter Brunnen, sein Rand voller steinerner Gesichter. Tief unten glänzt dunkles Wasser.',
    options: [{ id: 'drink', label: 'Trinken', desc: 'Jeder heilt 12 Leben – oder verliert 5 (Zufall)' }, { id: 'gold', label: 'Gold opfern', desc: 'Jeder zahlt 20 Gold, alle heilen 25 % ihrer Leben', cost: 20 }] },
  { id: 'bruecke', name: 'Brücke über dem Abgrund', img: 'ereignis-bruecke', group: true, text: 'Eine morsche Hängebrücke über bodenloser Tiefe. Auf der anderen Seite schimmert eine Truhe.',
    options: [{ id: 'cross', label: 'Riskant überqueren', desc: 'Jeder verliert 8 Leben, dafür ein Relikt für jeden' }, { id: 'around', label: 'Umweg', desc: 'Nichts passiert' }] },
  { id: 'gefangener', name: 'Der Gefangene', img: 'ereignis-gefangener', group: true, text: 'Ein Gefangener hängt in einem rostigen Käfig über der Grube. „Holt mich hier raus – ich zeige euch etwas!“',
    options: [{ id: 'free', label: 'Befreien', desc: 'Kampf gegen seine Wärter, danach eine seltene Karte für jeden' }, { id: 'ignore', label: 'Ignorieren', desc: 'Nichts passiert' }] },
  { id: 'haendler', name: 'Wandernder Händler', img: 'ereignis-haendler', group: false, minLv: 4, minGold: 25, text: 'Ein Händler mit klapprigem Karren. „Für euch hab ich was Besonderes …“',
    options: [{ id: 'remove', label: 'Karte entfernen', desc: 'Eine Karte aus deinem Deck entfernen', cost: 25 }, { id: 'relic', label: 'Relikt kaufen', desc: 'Ein zufälliges Relikt', cost: 80 }, { id: 'nothing', label: 'Weitergehen', desc: 'Nichts passiert' }] },
  { id: 'blutaltar', name: 'Der Blutaltar', img: 'ereignis-blutaltar', group: false, text: 'Ein Altar aus schwarzem Stein, warm wie lebendige Haut. Wer ihm Blut gibt, dessen Waffen werden schärfer.',
    options: [{ id: 'bleed', label: 'Blut opfern', desc: 'Verliere 10 Leben, 2 zufällige Karten werden verbessert' }, { id: 'nothing', label: 'Weitergehen', desc: 'Nichts passiert' }] },
  { id: 'spiegel', name: 'Zerbrochener Spiegel', img: 'ereignis-spiegel', group: false, text: 'Ein hoher Spiegel mit gesprungenem Glas. Im Spiegelbild liegt alles doppelt.',
    options: [{ id: 'copy', label: 'Hineingreifen', desc: 'Eine Karte deines Decks verdoppeln' }, { id: 'nothing', label: 'Weitergehen', desc: 'Nichts passiert' }] },
  { id: 'pilzhain', name: 'Der Pilzhain', img: 'ereignis-pilzhain', group: false, text: 'Riesige leuchtende Pilze, ein klarer Bach. Zwischen dem Moos liegen alte Münzen.',
    options: [{ id: 'heal', label: 'Rasten', desc: '12 Leben heilen' }, { id: 'gold', label: 'Münzen sammeln', desc: '25 Gold' }] },
];

/* ---------------- Pfadkarte ---------------- */

export type NodeType = 'fight' | 'elite' | 'event' | 'shop' | 'camp' | 'treasure' | 'boss';
export const NODE_NAME: Record<NodeType, string> = { fight: 'Kampf', elite: 'Elite', event: 'Ereignis', shop: 'Händler', camp: 'Lagerfeuer', treasure: 'Schatz', boss: 'Boss' };
export const NODE_DESC: Record<NodeType, string> = {
  fight: 'Gewöhnliche Gegner. Gold und eine neue Karte.',
  elite: 'Ein starker Gegner. Sicher ein Relikt, mehr Gold.',
  event: 'Etwas Unbekanntes. Mal Glück, mal Gefahr.',
  shop: 'Karten und Relikte kaufen, Karten entfernen.',
  camp: 'Rasten, schmieden oder Wache halten.',
  treasure: 'Eine Truhe: ein Relikt für jeden.',
  boss: 'Der Herr dieser Tiefe.',
};
/** Mögliche Stationen pro Stufe (Gewichte). Stufe 11 = Boss */
export const LEVEL_TYPES: Partial<Record<NodeType, number>>[] = [
  { fight: 1 },
  { fight: 6, event: 4 },
  { fight: 6, event: 4 },
  { fight: 4, event: 3, shop: 3 },
  { fight: 45, elite: 30, event: 25 },
  { treasure: 1 },
  { fight: 35, elite: 25, shop: 20, camp: 20 },
  { fight: 40, event: 35, camp: 25 },
  { fight: 45, elite: 30, shop: 25 },
  { camp: 1 },
];
export const LEVELS = LEVEL_TYPES.length + 1;
/** So viele Stufen sieht man voraus */
export const SIGHT = 3;

/* ---------------- Gold und Preise ---------------- */

export const GOLD = { fight: [12, 18], elite: [27, 33] } as const;
export const PRICE = { common: 35, uncommon: 55, rare: 100, relic: 120, riskyRelic: 90, remove: 35, removeStep: 20 };

/** Gegner-Leben je Spielerzahl */
/** Gesamtleben der Gegner relativ zur Grundgruppe (wird auf alle Gegner verteilt, auch zusätzliche) */
export const hpScale = (players: number) => (players === 1 ? 0.75 : 0.8 + 0.6 * (players - 1));
/** Schaden der Gegner je Spielerzahl (allein schwächer, in großen Gruppen stärker) */
export const dmgScale = (players: number) => (players === 1 ? 0.85 : 1 + 0.06 * (players - 2));
/** Zusätzliche Gegner je Spielerzahl */
export const extraEnemies = (players: number) => Math.min(5, Math.floor((players - 1) / 2));

export const SHOP_ODDS = { common: 0.55, uncommon: 0.35, rare: 0.1 };
export const RARITY_ODDS = {
  normal: { common: 0.7, uncommon: 0.25, rare: 0.05 },
  elite: { common: 0.5, uncommon: 0.4, rare: 0.1 },
};
