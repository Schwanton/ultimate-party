/**
 * Geheime Spiel-Einstellungen (z. B. API-Schlüssel). Werden nur auf diesem Rechner in
 * .up-data/secrets.json gespeichert und nie an Handys geschickt.
 */

import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './config';

const FILE = path.join(ROOT, '.up-data', 'secrets.json');
let cache: Record<string, string> | null = null;

function load(): Record<string, string> {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    cache = {};
  }
  return cache!;
}

export function getSecret(gameId: string, id: string): string | undefined {
  return process.env[`UP_SECRET_${gameId}_${id}`.toUpperCase().replace(/[^A-Z0-9_]/g, '_')] || load()[`${gameId}.${id}`] || undefined;
}

export function setSecret(gameId: string, id: string, value: string) {
  const all = load();
  const key = `${gameId}.${id}`;
  if (value) all[key] = value.trim().slice(0, 500);
  else delete all[key];
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(all, null, 2));
}

/** Welche Geheimnisse sind gesetzt? (nur ja/nein, nie der Wert) */
export function secretStatus(gameId: string, ids: string[]): Record<string, boolean> {
  return Object.fromEntries(ids.map((id) => [id, !!getSecret(gameId, id)]));
}
