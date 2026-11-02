/** Hilfsfunktionen für Spiele (laufen auf dem Server und im Browser). */

import type { RankingEntry } from './types';

export function shuffle<T>(items: readonly T[]): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/** Teilt eine Liste in möglichst gleich große Gruppen mit höchstens `max` Einträgen. */
export function splitEvenly<T>(items: readonly T[], max: number): T[][] {
  if (items.length === 0) return [];
  const groups = Math.ceil(items.length / max);
  const out: T[][] = Array.from({ length: groups }, () => []);
  items.forEach((it, i) => out[i % groups].push(it));
  return out;
}

/** Text für Vergleiche vereinheitlichen: Kleinschreibung, ohne Satzzeichen, Umlaute ausgeschrieben. */
export function normalizeAnswer(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/^(der|die|das|ein|eine|einen|the|a|an)\s+/, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Baustein „Täuschen und Wahrheit finden“:
 * Ist eine erfundene Antwort zu nah an der Wahrheit (oder an einer erlaubten Variante)?
 */
export function isTooClose(lie: string, truths: string[]): boolean {
  const l = normalizeAnswer(lie);
  if (!l) return false;
  return truths.some((t) => {
    const n = normalizeAnswer(t);
    if (!n) return false;
    if (l === n) return true;
    const tolerance = n.length >= 8 ? 2 : n.length >= 5 ? 1 : 0;
    return levenshtein(l, n) <= tolerance;
  });
}

/** Punkte-Tabelle führen und daraus eine Rangliste bauen. */
export class Scores {
  private map = new Map<string, number>();
  constructor(playerIds: string[]) {
    playerIds.forEach((id) => this.map.set(id, 0));
  }
  add(id: string, points: number) {
    this.map.set(id, (this.map.get(id) ?? 0) + points);
  }
  get(id: string) {
    return this.map.get(id) ?? 0;
  }
  snapshot(): Record<string, number> {
    return Object.fromEntries(this.map);
  }
  ranking(): RankingEntry[] {
    return [...this.map.entries()]
      .map(([playerId, score]) => ({ playerId, score }))
      .sort((a, b) => b.score - a.score);
  }
}

/** Antwort säubern: trimmen, Leerzeichen zusammenfassen, Länge begrenzen. */
export function cleanText(s: unknown, maxLength = 80): string {
  if (typeof s !== 'string') return '';
  return s.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}
