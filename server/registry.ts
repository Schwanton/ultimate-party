/** Findet alle Spiele im Ordner games/ und lädt Manifeste, Spiellogik und Content-Packs. */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { GAMES_DIR, DEV } from './config';
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

export interface LoadedGame {
  manifest: GameManifest;
  dir: string;
  module: GameServerModule;
  packs: { info: PackInfo; pack?: ContentPack }[];
  warning?: string;
}

const games = new Map<string, LoadedGame>();

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

export async function loadGames(): Promise<Map<string, LoadedGame>> {
  games.clear();
  if (!fs.existsSync(GAMES_DIR)) return games;
  for (const name of fs.readdirSync(GAMES_DIR).sort()) {
    const dir = path.join(GAMES_DIR, name);
    const manifestPath = path.join(dir, 'manifest.json');
    if (name.startsWith('.') || !fs.existsSync(manifestPath)) continue;
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as GameManifest;
      if (manifest.id !== name) throw new Error(`manifest.id ("${manifest.id}") muss dem Ordnernamen ("${name}") entsprechen`);
      if (manifest.hidden && !DEV) continue;
      const mod = await import(pathToFileURL(path.join(dir, 'server.ts')).href);
      const module = (mod.default ?? mod) as GameServerModule;
      if (typeof module.create !== 'function') throw new Error('server.ts muss "export default { create }" liefern');
      const warning = manifest.sdkVersion !== SDK_VERSION
        ? `Gebaut für SDK ${manifest.sdkVersion}, UP! nutzt SDK ${SDK_VERSION}`
        : undefined;
      games.set(manifest.id, { manifest, dir, module, packs: loadPacks(dir, manifest), warning });
    } catch (e) {
      console.error(`[UP!] Spiel "${name}" konnte nicht geladen werden:`, (e as Error).message);
    }
  }
  return games;
}

export function getGame(id: string) {
  return games.get(id);
}

export function allGames() {
  return [...games.values()];
}
