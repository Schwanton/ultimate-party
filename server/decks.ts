/**
 * Kartenstapel: Inhalte (Begriffe, Fragen …) werden wie Karten gezogen.
 * Eine gezogene Karte kommt erst wieder dran, wenn der ganze Stapel aufgebraucht ist –
 * auch über mehrere Spiele und Neustarts hinweg. Gespeichert in .up-data/decks.json.
 *
 * Ein Stapel gehört zu einem Spiel und einer Sprache. Er enthält alle Karten der aktivierten Packs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './config';

const FILE = path.join(ROOT, '.up-data', 'decks.json');
const TEST = !!process.env.UP_TIME_SCALE && process.env.UP_TIME_SCALE !== '1';

type Store = Record<string, string[]>;
let cache: Store | null = null;

function load(): Store {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    cache = {};
  }
  return cache!;
}

function save() {
  if (TEST) return; // Tests sollen den echten Stapel nicht verbrauchen
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(cache));
  } catch { /* nicht schlimm – dann nur für diese Sitzung */ }
}

/** Schon gezogene Karten eines Stapels */
export function drawnSet(deckId: string): Set<string> {
  return new Set(load()[deckId] ?? []);
}

export function markDrawn(deckId: string, key: string) {
  const s = load();
  const list = s[deckId] ?? (s[deckId] = []);
  if (!list.includes(key)) list.push(key);
  save();
}

export function unmarkDrawn(deckId: string, key: string) {
  const s = load();
  const list = s[deckId];
  if (!list) return;
  const i = list.indexOf(key);
  if (i >= 0) list.splice(i, 1);
  save();
}

/** Stapel (teilweise) auffüllen: diese Karten dürfen wieder gezogen werden */
export function refill(deckId: string, keys: string[]) {
  const s = load();
  const drop = new Set(keys);
  s[deckId] = (s[deckId] ?? []).filter((k) => !drop.has(k));
  save();
}

/** Wie viele Karten sind noch im Stapel? (für die Einstellungen) */
export function deckStatus(deckId: string, keys: string[]) {
  const drawn = drawnSet(deckId);
  return { total: keys.length, left: keys.filter((k) => !drawn.has(k)).length };
}

export function resetDeck(deckId: string) {
  const s = load();
  delete s[deckId];
  save();
}
