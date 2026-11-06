import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** Mitgelieferte Spiele (werden mit UP! aktualisiert) */
export const GAMES_DIR = path.join(ROOT, 'games');
/** Installierte Spiele aus eigenen Repositories (Katalog, GitHub, ZIP) – gehören nicht zu UP! und werden vom UP!-Update nie angefasst */
export const INSTALLED_DIR = path.join(ROOT, 'spiele');
/** Einstellungen, Schlüssel und Spielstände */
export const DATA_DIR = path.join(ROOT, '.up-data');
export const BUILD_DIR = path.join(ROOT, '.up-build');

export const DEV = process.argv.includes('--dev') || process.env.UP_DEV === '1';
export const PORT = Number(process.env.PORT || 3000);
/** Zeitfaktor für Tests (z. B. 0.01 = alles 100× schneller) */
export const TIME_SCALE = Number(process.env.UP_TIME_SCALE || 1);
export const QUIET = process.env.UP_QUIET === '1';
/** Kennung dieses Server-Starts (die TV-Ansicht erkennt daran einen Neustart) */
export const BOOT_ID = Date.now().toString(36);
