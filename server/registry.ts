/**
 * Findet alle Spiele und lädt Manifeste, Spiellogik und Content-Packs.
 *
 * - games/   mitgelieferte Spiele (kommen mit UP!-Updates)
 * - spiele/  installierte Spiele aus eigenen Repositories (siehe server/spiele.ts)
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { GAMES_DIR, DEV, INSTALLED_DIR } from './config';
import { migrateRenamedGames } from './migrate';
import { LANGS, SDK_VERSION, type ContentPack, type GameManifest, type GameServerModule, type Lang } from '../sdk/types';

export interface PackInfo {
  key: string; // <game>/<lang>/<pack>
  game: string;
  lang: Lang;
  id: string;
  name: string;
  count: number;
  error?: string;
}

export type GameSource = 'builtin' | 'installed';

export interface LoadedGame {
  manifest: GameManifest;
  dir: string;
  source: GameSource;
  module: GameServerModule;
  packs: { info: PackInfo; pack?: ContentPack }[];
  warning?: string;
}

const games = new Map<string, LoadedGame>();

/** Spiele, die nicht geladen werden konnten (Ordnername → Grund) */
export interface LoadFailure {
  id: string;
  dir: string;
  source: GameSource;
  error: string;
}
const failures = new Map<string, LoadFailure>();

export interface GameFolder {
  name: string;
  dir: string;
  source: GameSource;
}

/** Alle Spielordner: zuerst mitgelieferte, dann installierte (gleicher Name → mitgeliefertes gewinnt) */
export function gameFolders(): GameFolder[] {
  const out: GameFolder[] = [];
  const seen = new Set<string>();
  for (const [root, source] of [[GAMES_DIR, 'builtin'], [INSTALLED_DIR, 'installed']] as const) {
    if (!fs.existsSync(root)) continue;
    for (const name of fs.readdirSync(root).sort()) {
      const dir = path.join(root, name);
      if (name.startsWith('.') || name.startsWith('_tmp') || !fs.existsSync(path.join(dir, 'manifest.json'))) continue;
      if (seen.has(name)) {
        if (source === 'installed') failures.set(name, { id: name, dir, source, error: `Es gibt schon ein mitgeliefertes Spiel „${name}“ – das installierte wird ignoriert` });
        continue;
      }
      seen.add(name);
      out.push({ name, dir, source });
    }
  }
  return out;
}

export function validatePack(raw: unknown, manifest: GameManifest, expected: { lang: Lang; id: string }): { pack?: ContentPack; error?: string } {
  if (!raw || typeof raw !== 'object') return { error: 'Datei ist kein JSON-Objekt' };
  const p = raw as Record<string, unknown>;
  if (!Array.isArray(p.items)) return { error: 'Feld "items" (Liste) fehlt' };
  const fields = manifest.contentFields ?? [];
  for (let i = 0; i < p.items.length; i++) {
    const it = p.items[i] as Record<string, unknown>;
    if (!it || typeof it !== 'object') return { error: `Eintrag ${i + 1} ist kein Objekt` };
    for (const f of fields) {
      if (typeof it[f] !== 'string' || !(it[f] as string).trim()) {
        return { error: `Eintrag ${i + 1}: Feld "${f}" fehlt oder ist leer` };
      }
    }
    if (it.tags !== undefined && !Array.isArray(it.tags)) return { error: `Eintrag ${i + 1}: "tags" muss eine Liste sein` };
  }
  return {
    pack: {
      id: expected.id,
      name: typeof p.name === 'string' ? p.name : expected.id,
      game: manifest.id,
      lang: expected.lang,
      author: typeof p.author === 'string' ? p.author : undefined,
      version: typeof p.version === 'string' ? p.version : undefined,
      description: typeof p.description === 'string' ? p.description : undefined,
      items: p.items as ContentPack['items'],
    },
  };
}

function loadPacks(dir: string, manifest: GameManifest) {
  const out: LoadedGame['packs'] = [];
  for (const lang of LANGS) {
    const langDir = path.join(dir, 'content', lang);
    if (!fs.existsSync(langDir)) continue;
    for (const file of fs.readdirSync(langDir).filter((f) => f.endsWith('.json')).sort()) {
      const id = file.replace(/\.json$/, '');
      const key = `${manifest.id}/${lang}/${id}`;
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(langDir, file), 'utf8'));
        const { pack, error } = validatePack(raw, manifest, { lang, id });
        out.push({ info: { key, game: manifest.id, lang, id, name: pack?.name ?? id, count: pack?.items.length ?? 0, error }, pack });
      } catch (e) {
        out.push({ info: { key, game: manifest.id, lang, id, name: id, count: 0, error: 'Ungültiges JSON: ' + (e as Error).message } });
      }
    }
  }
  return out;
}

/** Titelbild: aus dem Manifest ("cover") oder automatisch bilder/titelbild.webp|png|jpg. */
function findCover(dir: string, manifest: GameManifest): string | undefined {
  const candidates = manifest.cover ? [manifest.cover] : ['bilder/titelbild.webp', 'bilder/titelbild.png', 'bilder/titelbild.jpg'];
  for (const rel of candidates) {
    if (!/^(bilder)\/[\w.-]+\.(webp|png|jpg|svg)$/.test(rel)) {
      console.warn(`[UP!] ${manifest.id}: Titelbild "${rel}" muss im Ordner bilder/ liegen (webp, png, jpg oder svg)`);
      continue;
    }
    const file = path.join(dir, rel);
    if (fs.existsSync(file)) return `/game/${manifest.id}/${rel}?v=${Math.round(fs.statSync(file).mtimeMs)}`;
  }
  return undefined;
}

export async function loadGames(): Promise<Map<string, LoadedGame>> {
  games.clear();
  failures.clear();
  if (fs.existsSync(GAMES_DIR)) migrateRenamedGames();
  for (const { name, dir, source } of gameFolders()) {
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as GameManifest;
      if (manifest.id !== name) throw new Error(`manifest.id ("${manifest.id}") muss dem Ordnernamen ("${name}") entsprechen`);
      if (manifest.hidden && !DEV) continue;
      if (Number(manifest.sdkVersion) > SDK_VERSION) {
        throw new Error(`Braucht eine neuere UP!-Version (SDK ${manifest.sdkVersion}, UP! hat SDK ${SDK_VERSION})`);
      }
      const mod = await import(pathToFileURL(path.join(dir, 'server.ts')).href);
      const module = (mod.default ?? mod) as GameServerModule;
      if (typeof module.create !== 'function') throw new Error('server.ts muss "export default { create }" liefern');
      const warning = manifest.sdkVersion !== SDK_VERSION
        ? `Gebaut für SDK ${manifest.sdkVersion}, UP! nutzt SDK ${SDK_VERSION}`
        : undefined;
      manifest.coverUrl = findCover(dir, manifest);
      manifest.source = source;
      games.set(manifest.id, { manifest, dir, source, module, packs: loadPacks(dir, manifest), warning });
    } catch (e) {
      const error = (e as Error).message;
      failures.set(name, { id: name, dir, source, error });
      console.error(`[UP!] Spiel "${name}" konnte nicht geladen werden:`, error);
    }
  }
  return games;
}

/** Spiel aus dem Verkehr ziehen (z. B. wenn seine Ansichten nicht gebaut werden können) */
export function markBroken(id: string, error: string) {
  const g = games.get(id);
  games.delete(id);
  failures.set(id, { id, dir: g?.dir ?? '', source: g?.source ?? 'installed', error });
}

export function loadFailures() {
  return [...failures.values()];
}

export function getGame(id: string) {
  return games.get(id);
}

export function allGames() {
  return [...games.values()];
}
