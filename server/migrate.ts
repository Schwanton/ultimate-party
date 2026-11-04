/**
 * Umbenannte Spiele: Nach einem Update liegt der alte Spielordner noch auf dem Rechner
 * (der Updater löscht keine Ordner, die es im Update nicht mehr gibt). Beim Start räumt UP! auf:
 *
 * - eigene Content-Packs aus dem alten Ordner wandern in den neuen
 * - der alte, mitgelieferte Ordner wird gelöscht (nur wenn er von UP! stammt und der neue da ist)
 * - Gespeichertes in .up-data (Kartenstapel, Raum-Einstellungen, Spielstände, Schlüssel) zieht mit um
 */

import fs from 'node:fs';
import path from 'node:path';
import { GAMES_DIR, ROOT } from './config';

/** alter Ordnername → neuer Ordnername */
export const RENAMED_GAMES: Record<string, string> = {
  bluff: 'flunkerfakt',
  crash: 'cash-out',
  kartoffel: 'heisse-kartoffel',
  verraeter: 'maulwurf',
  kritzelei: 'vernissage',
  mehrheit: 'mainstream',
  schlagfertig: 'mic-drop',
};

const DATA = path.join(ROOT, '.up-data');

function readJson(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}

function writeJson(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
}

function listFiles(dir: string, base = dir, out: string[] = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listFiles(p, base, out);
    else out.push(path.relative(base, p));
  }
  return out;
}

/** Ordner auf dem Rechner aufräumen */
function migrateFolders(games: string, log: (s: string) => void) {
  for (const [from, to] of Object.entries(RENAMED_GAMES)) {
    const oldDir = path.join(games, from);
    const newDir = path.join(games, to);
    if (!fs.existsSync(oldDir) || !fs.existsSync(path.join(newDir, 'manifest.json'))) continue;
    const manifest = readJson(path.join(oldDir, 'manifest.json')) as { id?: string; author?: string } | undefined;
    // Ein eigenes Spiel, das zufällig so heißt, bleibt unangetastet
    if (manifest && (manifest.id !== from || manifest.author !== 'UP!')) continue;
    // eigene Content-Packs mitnehmen
    const oldContent = path.join(oldDir, 'content');
    for (const f of listFiles(oldContent)) {
      const target = path.join(newDir, 'content', f);
      if (fs.existsSync(target)) continue;
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(oldContent, f), target);
      log(`Eigenes Content-Pack übernommen: ${from}/content/${f} → ${to}`);
    }
    fs.rmSync(oldDir, { recursive: true, force: true });
    log(`Alter Spielordner „${from}“ entfernt (heißt jetzt „${to}“)`);
  }
}

function renameKey(key: string): string {
  const [first, ...rest] = key.split('/');
  const to = RENAMED_GAMES[first];
  return to ? [to, ...rest].join('/') : key;
}

/** Gespeichertes in .up-data auf die neuen Namen umstellen */
function migrateData(data: string) {
  // Kartenstapel: "<spiel>/<sprache>"
  const decksFile = path.join(data, 'decks.json');
  const decks = readJson(decksFile) as Record<string, string[]> | undefined;
  if (decks && typeof decks === 'object') {
    let changed = false;
    for (const key of Object.keys(decks)) {
      const next = renameKey(key);
      if (next === key) continue;
      if (!decks[next]) decks[next] = decks[key];
      delete decks[key];
      changed = true;
    }
    if (changed) writeJson(decksFile, decks);
  }

  // Räume: Spiel-Einstellungen und abgeschaltete Packs
  const roomsFile = path.join(data, 'rooms.json');
  const rooms = readJson(roomsFile) as Record<string, { settings?: { gameOptions?: Record<string, unknown>; disabledPacks?: string[] } }> | undefined;
  if (rooms && typeof rooms === 'object') {
    let changed = false;
    for (const room of Object.values(rooms)) {
      const s = room?.settings;
      if (!s) continue;
      if (s.gameOptions && typeof s.gameOptions === 'object') {
        for (const key of Object.keys(s.gameOptions)) {
          const to = RENAMED_GAMES[key];
          if (!to) continue;
          if (!(to in s.gameOptions)) s.gameOptions[to] = s.gameOptions[key];
          delete s.gameOptions[key];
          changed = true;
        }
      }
      if (Array.isArray(s.disabledPacks)) {
        const next = s.disabledPacks.map((k) => (typeof k === 'string' ? renameKey(k) : k));
        if (next.some((k, i) => k !== s.disabledPacks![i])) {
          s.disabledPacks = next;
          changed = true;
        }
      }
    }
    if (changed) writeJson(roomsFile, rooms);
  }

  // Schlüssel: "<spiel>.<id>"
  const secretsFile = path.join(data, 'secrets.json');
  const secrets = readJson(secretsFile) as Record<string, string> | undefined;
  if (secrets && typeof secrets === 'object') {
    let changed = false;
    for (const key of Object.keys(secrets)) {
      const dot = key.indexOf('.');
      const to = dot > 0 ? RENAMED_GAMES[key.slice(0, dot)] : undefined;
      if (!to) continue;
      const next = to + key.slice(dot);
      if (!(next in secrets)) secrets[next] = secrets[key];
      delete secrets[key];
      changed = true;
    }
    if (changed) writeJson(secretsFile, secrets);
  }

  // Spielstände: .up-data/store/<spiel>.json
  const storeDir = path.join(data, 'store');
  for (const [from, to] of Object.entries(RENAMED_GAMES)) {
    const oldFile = path.join(storeDir, `${from}.json`);
    const newFile = path.join(storeDir, `${to}.json`);
    if (!fs.existsSync(oldFile)) continue;
    if (!fs.existsSync(newFile)) fs.renameSync(oldFile, newFile);
    else fs.rmSync(oldFile, { force: true });
  }
}

/** Beim Start aufrufen, bevor die Spiele geladen werden. Fehler halten UP! nicht auf. */
export function migrateRenamedGames(log: (s: string) => void = (s) => console.log(`[UP!] ${s}`), dirs = { games: GAMES_DIR, data: DATA }) {
  try {
    migrateFolders(dirs.games, log);
  } catch (e) {
    console.error('[UP!] Alte Spielordner konnten nicht aufgeräumt werden:', (e as Error).message);
  }
  try {
    migrateData(dirs.data);
  } catch (e) {
    console.error('[UP!] Gespeicherte Daten konnten nicht umgestellt werden:', (e as Error).message);
  }
}
