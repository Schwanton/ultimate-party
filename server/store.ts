/**
 * Spielspeicher: kleine JSON-Daten, die ein Spiel über Neustarts hinweg behält
 * (z. B. ein gespeicherter Run). Pro Spiel eine Datei in .up-data/store/<spiel>.json.
 */

import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './config';

const DIR = path.join(ROOT, '.up-data', 'store');
const TEST = !!process.env.UP_TIME_SCALE && process.env.UP_TIME_SCALE !== '1';
const cache = new Map<string, Record<string, unknown>>();

function load(game: string): Record<string, unknown> {
  let data = cache.get(game);
  if (data) return data;
  try {
    data = JSON.parse(fs.readFileSync(path.join(DIR, `${game}.json`), 'utf8'));
  } catch {
    data = {};
  }
  cache.set(game, data!);
  return data!;
}

export function storeGet<T>(game: string, key: string): T | undefined {
  return load(game)[key] as T | undefined;
}

export function storeSet(game: string, key: string, value: unknown) {
  const data = load(game);
  if (value === undefined || value === null) delete data[key];
  else data[key] = value;
  if (TEST) return; // Tests überschreiben keine echten Spielstände
  try {
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(path.join(DIR, `${game}.json`), JSON.stringify(data));
  } catch { /* dann nur für diese Sitzung */ }
}
