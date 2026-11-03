/**
 * Merkt sich die zuletzt benutzten Räume (Code, Schlüssel des Fernsehers, Sprache, Einstellungen)
 * in .up-data/rooms.json – damit nach einem Neustart oder Update der gleiche Raumcode weiterläuft.
 */

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, TIME_SCALE } from './config';

const FILE = path.join(ROOT, '.up-data', 'rooms.json');
const KEEP = 10;

export interface RememberedRoom {
  token: string;
  lang: string;
  settings: object;
  at?: number;
}

let cache: Record<string, RememberedRoom> | null = null;

function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    cache = {};
  }
  return cache!;
}

export function rememberRoom(code: string, data: RememberedRoom) {
  const all = load();
  all[code] = { ...data, at: Date.now() };
  // nur die letzten paar behalten
  const codes = Object.keys(all).sort((a, b) => (all[b].at ?? 0) - (all[a].at ?? 0));
  for (const c of codes.slice(KEEP)) delete all[c];
  if (TIME_SCALE !== 1) return; // Tests schreiben nichts
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(all));
  } catch { /* egal */ }
}

export function rememberedRoom(code: string): RememberedRoom | undefined {
  return load()[code];
}
