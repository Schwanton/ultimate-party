/**
 * Olympia-Modus: mehrere Spiele hintereinander als Disziplinen, mit Medaillen.
 * Hier stehen die Regeln, die Server und Bildschirme gemeinsam brauchen (ohne Netzwerk, auch für Tests).
 */

import {
  resolveOptions, type GameManifest, type GameOptionValues, type OlympiaDiscipline, type OlympiaPlace,
  type OlympiaScoring, type OlympiaSettings, type OlympiaStanding, type OlympiaTeam, type RankingEntry,
} from './types';

export const OLYMPIA_MIN = 3;
export const OLYMPIA_MAX = 8;

export const DEFAULT_OLYMPIA: OlympiaSettings = {
  pick: 'vip', scoring: 'medals', teams: 0, teamMode: 'switch', short: true, count: 5, list: [], options: {},
};

/** Teams: Schlüssel (für Name) und Farbe */
export const OLYMPIA_TEAMS = [
  { key: 'fire', color: '#FF3B4E' },
  { key: 'wave', color: '#36D6F5' },
  { key: 'forest', color: '#4BE3A1' },
  { key: 'flash', color: '#FFD447' },
] as const;

/** Mitgelieferte Spiele: kürzere Einstellungen für Olympia bzw. nicht geeignet (false) */
const BUILTIN: Record<string, false | GameOptionValues> = {
  abgrund: false, // kooperativ
  schwarmsinn: false, // kooperativ
  kronenduell: false, // nur 2 Spieler
  'tick-tack-boom': false, // kooperativ
  bonk: { rounds: 3 },
  'cash-out': { rounds: 5 },
  figurendle: { rounds: 3 },
  flunkerfakt: { questions: 4 },
  'guess-the-clicks': { videos: 5 },
  hochstapler: { rounds: 3 },
  mainstream: { rounds: 5 },
  maulwurf: { discussTime: 60 },
  'mic-drop': { rounds: 2 },
  montagsmaler: { turns: 0, rounds: 4 },
  'murmel-mayhem': { rounds: 3 },
  schaetzmeister: { rounds: 5 },
  sternenpakt: { years: 10 },
  sumo: { rounds: 2 },
  'tank-trouble': { mode: 'duell', rounds: 3 },
  vernissage: { rounds: 1 },
  'wer-wars': { rounds: 2 },
};

/** Taugt das Spiel als Disziplin? */
export function olympiaAllowed(m: GameManifest): boolean {
  if (m.olympia === false || BUILTIN[m.id] === false) return false;
  return true;
}

/** Kürzere Einstellungen für Olympia (nur die geänderten Werte) */
export function olympiaShort(m: GameManifest): GameOptionValues {
  const fromManifest = m.olympia && typeof m.olympia === 'object' ? m.olympia.options : undefined;
  const builtin = BUILTIN[m.id];
  if (fromManifest) return { ...fromManifest };
  if (builtin) return { ...builtin };
  // Fremde Spiele ohne Angabe: Rundenzahl auf etwa 60 % kürzen
  const rounds = m.options?.find((o) => o.id === 'rounds' && !o.choices && typeof o.default === 'number');
  if (rounds && typeof rounds.default === 'number' && rounds.default > 1) {
    return { rounds: Math.max(rounds.min ?? 1, Math.round(rounds.default * 0.6)) };
  }
  return {};
}

/** Einstellungen, mit denen das Spiel bei Olympia läuft */
export function olympiaOptions(m: GameManifest, settings: OlympiaSettings, normal: GameOptionValues | undefined): GameOptionValues {
  const base = { ...normal, ...(settings.short ? olympiaShort(m) : {}), ...settings.options[m.id] };
  return resolveOptions(m.options, base);
}

/** Einstellungen säubern (aus dem Netz oder aus der gespeicherten Datei) */
export function cleanOlympiaSettings(raw: unknown): OlympiaSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<OlympiaSettings>;
  const d = DEFAULT_OLYMPIA;
  const oneOf = <T,>(v: unknown, list: readonly T[], def: T): T => (list.includes(v as T) ? (v as T) : def);
  const count = typeof r.count === 'number' ? Math.max(OLYMPIA_MIN, Math.min(OLYMPIA_MAX, Math.round(r.count))) : d.count;
  const list = Array.isArray(r.list) ? [...new Set(r.list.filter((x) => typeof x === 'string'))].slice(0, OLYMPIA_MAX) : [];
  const options: Record<string, GameOptionValues> = {};
  if (r.options && typeof r.options === 'object') {
    for (const [k, v] of Object.entries(r.options)) if (v && typeof v === 'object') options[k] = { ...(v as GameOptionValues) };
  }
  return {
    pick: oneOf(r.pick, ['vip', 'random', 'secret', 'open'] as const, d.pick),
    scoring: oneOf(r.scoring, ['medals', 'points', 'medalpoints'] as const, d.scoring),
    teams: oneOf(r.teams, [0, 2, 3, 4] as const, d.teams),
    teamMode: oneOf(r.teamMode, ['switch', 'random', 'vip', 'free'] as const, d.teamMode),
    short: typeof r.short === 'boolean' ? r.short : d.short,
    count, list, options,
  };
}

/* ---------------- Wertung ---------------- */

const POINTS = [10, 8, 6, 5, 4, 3, 2, 1];

export function pointsFor(place: number, scoring: OlympiaScoring): number {
  if (scoring === 'medalpoints') return place >= 1 && place <= 3 ? 4 - place : 0;
  if (scoring === 'points') return POINTS[Math.min(place, POINTS.length) - 1] ?? 0;
  return 0;
}

/** Plätze aus Werten (höher = besser, bei better='low' niedriger = besser); Gleichstand = gleicher Platz */
function placesOf(entries: { id: string; value: number }[], better: 'high' | 'low'): Map<string, number> {
  const out = new Map<string, number>();
  const beats = (o: number, e: number) => (better === 'high' ? o - e > 1e-9 : e - o > 1e-9);
  for (const e of entries) out.set(e.id, entries.filter((o) => beats(o.value, e.value)).length + 1);
  return out;
}

/**
 * Ergebnis einer Disziplin aus der Rangliste eines Spiels.
 * Einzeln: Platz nach Punkten im Spiel. Teams: Durchschnitt der Plätze der Mitglieder, die mitgespielt haben.
 */
export function scoreDiscipline(ranking: RankingEntry[], entrants: string[], teams: OlympiaTeam[] | null, scoring: OlympiaScoring) {
  const seen = new Set<string>();
  const rows = ranking.filter((r) => {
    if (seen.has(r.playerId) || typeof r.score !== 'number' || !Number.isFinite(r.score)) return false;
    seen.add(r.playerId);
    return true;
  });
  const playerPlaces = Object.fromEntries(placesOf(rows.map((r) => ({ id: r.playerId, value: r.score })), 'high'));
  let compPlaces: Map<string, number>;
  if (teams) {
    const avg = teams.flatMap((t) => {
      const ps = t.members.map((m) => playerPlaces[m]).filter((p): p is number => typeof p === 'number');
      return ps.length ? [{ id: t.id, value: ps.reduce((a, b) => a + b, 0) / ps.length }] : [];
    });
    compPlaces = placesOf(avg, 'low');
  } else {
    compPlaces = new Map(Object.entries(playerPlaces).filter(([id]) => entrants.includes(id)));
  }
  const results: OlympiaPlace[] = [...compPlaces.entries()]
    .map(([id, place]) => ({ id, place, medal: place <= 3 ? place : 0, points: pointsFor(place, scoring) }))
    .sort((a, b) => a.place - b.place);
  return { results, playerPlaces };
}

/** Medaillenspiegel bzw. Punktetabelle über alle gespielten Disziplinen */
export function standingsOf(disciplines: OlympiaDiscipline[], entrants: string[], scoring: OlympiaScoring): OlympiaStanding[] {
  const rows = new Map<string, OlympiaStanding>(entrants.map((id) => [id, { id, rank: 1, gold: 0, silver: 0, bronze: 0, points: 0 }]));
  for (const d of disciplines) {
    if (d.status !== 'done') continue;
    for (const r of d.results) {
      const row = rows.get(r.id);
      if (!row) continue;
      if (r.medal === 1) row.gold++;
      if (r.medal === 2) row.silver++;
      if (r.medal === 3) row.bronze++;
      row.points += r.points;
    }
  }
  const key = (s: OlympiaStanding) => (scoring === 'medals' ? [s.gold, s.silver, s.bronze] : [s.points, s.gold, s.silver, s.bronze]);
  const cmp = (a: OlympiaStanding, b: OlympiaStanding) => {
    const ka = key(a), kb = key(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return kb[i] - ka[i];
    return 0;
  };
  const list = [...rows.values()];
  for (const s of list) s.rank = 1 + list.filter((o) => cmp(o, s) < 0).length;
  return list.sort((a, b) => a.rank - b.rank || entrants.indexOf(a.id) - entrants.indexOf(b.id));
}

/* ---------------- Teams ---------------- */

/** Spieler zufällig und möglichst gleichmäßig auf n Teams verteilen */
export function makeTeams(playerIds: string[], n: number, shuffle: <T>(a: T[]) => T[]): OlympiaTeam[] {
  const teams: OlympiaTeam[] = OLYMPIA_TEAMS.slice(0, n).map((t, i) => ({ id: `t${i + 1}`, key: t.key, color: t.color, members: [] }));
  shuffle([...playerIds]).forEach((id, i) => teams[i % n].members.push(id));
  return teams;
}

/** Kleinstes Team (bei Gleichstand das erste) */
export function smallestTeam(teams: OlympiaTeam[]): OlympiaTeam {
  return teams.reduce((a, b) => (b.members.length < a.members.length ? b : a));
}

/**
 * „Jeder wählt“: aus den Wünschen die Disziplinen bestimmen.
 * Doppelte zählen einmal; zu viele → auslosen (öfter gewählt = größere Chance); zu wenige → Zufall füllt auf.
 */
export function resolvePicks(picks: string[], count: number, pool: string[], random: () => number = Math.random): string[] {
  const weights = new Map<string, number>();
  for (const g of picks) if (pool.includes(g)) weights.set(g, (weights.get(g) ?? 0) + 1);
  const chosen: string[] = [];
  while (chosen.length < count && weights.size) {
    const total = [...weights.values()].reduce((a, b) => a + b, 0);
    let r = random() * total;
    for (const [g, w] of weights) {
      r -= w;
      if (r <= 0) {
        chosen.push(g);
        weights.delete(g);
        break;
      }
    }
  }
  const rest = pool.filter((g) => !chosen.includes(g));
  while (chosen.length < count && rest.length) chosen.push(rest.splice(Math.floor(random() * rest.length), 1)[0]);
  // Reihenfolge zufällig
  for (let i = chosen.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [chosen[i], chosen[j]] = [chosen[j], chosen[i]];
  }
  return chosen;
}
