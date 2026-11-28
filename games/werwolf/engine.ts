/**
 * Werwolf – Regeln ohne Netzwerk (für Server und Tests).
 *
 * Rollen, Standard-Mischung nach Spielerzahl, Auflösung der Nacht, Siegbedingungen.
 */

import { shuffle } from '@up/sdk';

export type Role = 'wolf' | 'villager' | 'seer' | 'witch' | 'hunter' | 'cupid' | 'protector';
export const SPECIALS: Role[] = ['seer', 'witch', 'hunter', 'cupid', 'protector'];
export const ALL_ROLES: Role[] = ['wolf', 'seer', 'witch', 'hunter', 'cupid', 'protector', 'villager'];

export const MIN_PLAYERS = 6;

/** Einstellungen der Partie (Rollen-Lobby) */
export interface Setup {
  wolves: number;
  /** eingeschaltete Sonderrollen (je eine) */
  specials: Role[];
  /** Bürgermeister-Wahl am ersten Tag */
  mayor: boolean;
  /** Diskussionszeit in Sekunden */
  discuss: number;
  /** Rolle beim Ausscheiden: aufdecken, nur Seite, gar nicht */
  reveal: 'role' | 'side' | 'none';
  /** Verdachts-Pfeile während der Diskussion */
  arrows: boolean;
  /** Stimmen: geheim bis zur Auflösung, offen live, ganz geheim */
  votes: 'reveal' | 'open' | 'secret';
  /** Letzte Worte: 10 s Scheinwerfer vor dem Aufdecken */
  lastWords: boolean;
  /** Erste Nacht ohne Opfer */
  quietFirstNight: boolean;
  /** Vorlesestimme auf dem TV */
  voice: boolean;
}

export function maxWolves(n: number) {
  return Math.max(1, Math.floor((n - 1) / 2));
}

export function defaultWolves(n: number) {
  return n <= 7 ? 1 : n <= 11 ? 2 : 3;
}

/** Vorschlag passend zur Spielerzahl */
export function defaultSetup(n: number): Setup {
  const specials: Role[] = ['seer'];
  if (n >= 7) specials.push('witch');
  if (n >= 8) specials.push('hunter');
  if (n >= 9) specials.push('cupid');
  if (n >= 10) specials.push('protector');
  return {
    wolves: Math.min(defaultWolves(n), maxWolves(n)), specials, mayor: true, discuss: 180, reveal: 'role',
    arrows: true, votes: 'reveal', lastWords: false, quietFirstNight: false, voice: false,
  };
}

/** Setup gegen die Spielerzahl prüfen (zu viele Rollen → Sonderrollen fallen hinten weg) */
export function fitSetup(s: Setup, n: number): Setup {
  const wolves = Math.max(1, Math.min(s.wolves, maxWolves(n)));
  const specials = SPECIALS.filter((r) => s.specials.includes(r)).slice(0, Math.max(0, n - wolves));
  return { ...s, wolves, specials };
}

/** Rollen auf die Spieler verteilen */
export function deal(ids: string[], s: Setup): Map<string, Role> {
  const fitted = fitSetup(s, ids.length);
  const pool: Role[] = [...Array(fitted.wolves).fill('wolf'), ...fitted.specials];
  while (pool.length < ids.length) pool.push('villager');
  const order = shuffle(ids);
  return new Map(order.map((id, i) => [id, pool[i]]));
}

/** Ist die Mischung unfair? (gelber Hinweis in der Lobby) */
export function unfair(s: Setup, n: number) {
  return s.wolves * 2 >= n - 1 || (s.wolves === 1 && n >= 12);
}

export function isWolf(r: Role | undefined) {
  return r === 'wolf';
}

/** Mehrheit unter Stimmen; Gleichstand → Zufall unter den Besten; keine Stimmen → null */
export function plurality(picks: Iterable<string>): { top: string | null; tied: string[]; counts: Record<string, number> } {
  const counts: Record<string, number> = {};
  for (const p of picks) counts[p] = (counts[p] ?? 0) + 1;
  const best = Math.max(0, ...Object.values(counts));
  const tied = Object.keys(counts).filter((k) => counts[k] === best && best > 0);
  return { top: tied.length ? shuffle(tied)[0] : null, tied, counts };
}

export interface NightInput {
  victim: string | null;
  protectedId: string | null;
  healed: boolean;
  poisoned: string | null;
}

/** Wer stirbt in der Nacht? (ohne Verliebte und Jäger – die kommen danach) */
export function nightDeaths(n: NightInput): string[] {
  const out: string[] = [];
  if (n.victim && n.victim !== n.protectedId && !n.healed) out.push(n.victim);
  if (n.poisoned && !out.includes(n.poisoned)) out.push(n.poisoned);
  return out;
}

export type Winner = 'village' | 'wolves' | 'lovers' | 'nobody';

/** Siegbedingungen. lovers = Paar, falls gemischt (Wolf + Dorf) */
export function winner(alive: string[], roles: Map<string, Role>, lovers: [string, string] | null): Winner | null {
  if (alive.length === 0) return 'nobody';
  const mixed = lovers && isWolf(roles.get(lovers[0])) !== isWolf(roles.get(lovers[1]));
  if (mixed && alive.length === 2 && alive.includes(lovers![0]) && alive.includes(lovers![1])) return 'lovers';
  const wolves = alive.filter((id) => isWolf(roles.get(id))).length;
  if (wolves === 0) return 'village';
  if (wolves >= alive.length - wolves) return 'wolves';
  return null;
}

/** Gewinnt dieser Spieler mit diesem Ausgang? */
export function wins(id: string, w: Winner, roles: Map<string, Role>, lovers: [string, string] | null) {
  const mixed = lovers && isWolf(roles.get(lovers[0])) !== isWolf(roles.get(lovers[1]));
  if (w === 'lovers') return !!lovers?.includes(id);
  if (w === 'nobody') return false;
  if (mixed && lovers!.includes(id)) return false;
  return w === 'wolves' ? isWolf(roles.get(id)) : !isWolf(roles.get(id));
}
