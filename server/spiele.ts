/**
 * Installierte Spiele: Spiele aus eigenen GitHub-Repositories installieren, nach Updates suchen und aktualisieren.
 *
 * - Installierte Spiele liegen in spiele/<id>/ (nicht in games/). Das UP!-Update fasst diesen Ordner nie an.
 * - Woher ein Spiel kommt, steht in .up-data/spiele.json (Repository, Version, Ref).
 * - Katalog: eine JSON-Liste geprüfter Spiele (Standard: Schwanton/up-spiele, Datei katalog.json).
 *   Ein Eintrag zeigt auf ein Repository und eine feste Version (Tag oder Commit).
 * - Spiele außerhalb des Katalogs: neueste GitHub-Release (Tag), sonst der aktuelle Stand des Hauptzweigs.
 * - Vor einem Update wird die alte Version in .up-data/spiele-backup/ gesichert. Lässt sich die neue Version
 *   nach dem Neustart nicht laden, stellt UP! automatisch die alte wieder her.
 * - Eigene Content-Packs in content/ bleiben bei Updates erhalten.
 */

import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, GAMES_DIR, INSTALLED_DIR, ROOT } from './config';
import { RENAMED_GAMES } from './migrate';
import { getGame, loadFailures, gameFolders } from './registry';
import { extract, fetchText, newer, notesFor } from './update';
import { SDK_VERSION, type GameManifest } from '../sdk/types';

/* ---------------- Adressen (für Tests umstellbar) ---------------- */

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const WEB = (process.env.UP_GH_WEB ?? 'https://github.com').replace(/\/$/, '');
const RAW = (process.env.UP_GH_RAW ?? 'https://raw.githubusercontent.com').replace(/\/$/, '');
const CATALOG_REPO: string = pkg.upUpdate?.catalog ?? 'Schwanton/up-spiele';
const CATALOG_URL = process.env.UP_CATALOG_URL ?? `${RAW}/${CATALOG_REPO}/main/katalog.json`;

const RECORDS = path.join(DATA_DIR, 'spiele.json');
const BACKUP_DIR = path.join(DATA_DIR, 'spiele-backup');
const TMP_DIR = path.join(DATA_DIR, 'spiele-tmp');
const MAX_DOWNLOAD = 150 * 1024 * 1024;
const ID_RE = /^[a-z][a-z0-9-]{1,40}$/;
const REPO_RE = /^[\w.-]+\/[\w.-]+$/;

/* ---------------- Typen ---------------- */

/** Eine Version eines Katalog-Spiels */
export interface CatalogRelease {
  version: string;
  /** Tag oder Commit, aus dem installiert wird */
  ref: string;
  sdkVersion: number;
}

/** Eintrag in katalog.json */
export interface CatalogEntry extends CatalogRelease {
  id: string;
  repo: string;
  /** Unterordner im Repository, falls das Spiel nicht im Hauptordner liegt */
  path?: string;
  name: Record<string, string>;
  description: Record<string, string>;
  author?: string;
  color?: string;
  minPlayers?: number;
  maxPlayers?: number;
  minutes?: number;
  tags?: string[];
  /** Adresse eines Titelbilds (https) */
  cover?: string;
  /** Ältere Versionen für ältere UP!-Versionen (passende wird automatisch gewählt) */
  older?: CatalogRelease[];
}

interface InstallRecord {
  from: 'katalog' | 'repo';
  repo: string;
  /** Unterordner im Repository ('' = Hauptordner) */
  path: string;
  ref: string;
  version: string;
  installedAt: number;
  /** Nach einem Update: beim nächsten Start prüfen, ob die neue Version lädt */
  verify?: boolean;
  /** Version der Sicherung (für die Meldung beim Zurückrollen) */
  previous?: string;
  /** Diese Version ließ sich nicht starten – nicht noch einmal anbieten */
  failedVersion?: string;
}

interface RecordsFile {
  games: Record<string, InstallRecord>;
  /** Meldung, die nach einem Neustart einmal angezeigt wird */
  message?: SpieleMessage;
}

export interface GameUpdateInfo {
  latest?: string;
  ref?: string;
  notes?: string[];
  /** Neue Version braucht eine neuere UP!-Version */
  needsNewerUp?: boolean;
  checking?: boolean;
  checkedAt?: number;
  error?: string;
}

export interface InstalledGameInfo {
  id: string;
  name?: Record<string, string>;
  color?: string;
  version: string;
  repo?: string;
  from?: 'katalog' | 'repo';
  /** Spiel konnte nicht geladen werden */
  error?: string;
  /** Entwickler-Checkout (Ordner mit .git): Updates per „git pull“, nicht über UP! */
  git?: boolean;
  /** Diese Version ließ sich nicht starten und wird nicht noch einmal angeboten */
  failedVersion?: string;
  update?: GameUpdateInfo;
}

export interface SpieleMessage {
  kind: 'ok' | 'error' | 'rolledBack';
  /** Übersetzungsschlüssel + Werte (die TV-Ansicht übersetzt) */
  key: string;
  vars?: Record<string, string>;
  at: number;
}

export interface SpieleStatus {
  installed: InstalledGameInfo[];
  /** Anzahl installierbarer Updates */
  updates: number;
  catalog?: (CatalogEntry & { compatible: boolean; installedVersion?: string })[];
  catalogUrl: string;
  catalogFailed?: boolean;
  catalogCheckedAt?: number;
  /** Laufende Aktion */
  busy?: { id: string; step: 'checking' | 'downloading' | 'installing' | 'restarting' };
  message?: SpieleMessage;
  /** Ohne Startskript: Neustart von Hand nötig */
  restartNeeded?: boolean;
}

/* ---------------- Zustand ---------------- */

let catalog: CatalogEntry[] | undefined;
let catalogFailed = false;
let catalogCheckedAt: number | undefined;
const updates = new Map<string, GameUpdateInfo>();
let busy: SpieleStatus['busy'];
let message: SpieleMessage | undefined;
let restartNeeded = false;
const listeners = new Set<() => void>();
let reloadHook: () => Promise<void> = async () => {};
let shutdownHook: () => Promise<void> = async () => {};

export function onSpieleChange(fn: () => void) {
  listeners.add(fn);
}

function changed() {
  listeners.forEach((l) => l());
}

/** Vom Server gesetzt: Spiele neu laden + App neu bauen (ohne Neustart), Server sauber beenden */
export function setSpieleHooks(hooks: { reload: () => Promise<void>; shutdown: () => Promise<void> }) {
  reloadHook = hooks.reload;
  shutdownHook = hooks.shutdown;
}

function readRecords(): RecordsFile {
  try {
    const r = JSON.parse(fs.readFileSync(RECORDS, 'utf8')) as RecordsFile;
    return { games: r.games ?? {}, message: r.message };
  } catch {
    return { games: {} };
  }
}

function writeRecords(r: RecordsFile) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(RECORDS, JSON.stringify(r, null, 2));
}

function say(kind: SpieleMessage['kind'], key: string, vars?: Record<string, string>) {
  message = { kind, key, vars, at: Date.now() };
  changed();
}

function readManifest(dir: string): GameManifest | undefined {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as GameManifest;
  } catch {
    return undefined;
  }
}

/* ---------------- Status ---------------- */

export function spieleStatus(): SpieleStatus {
  const records = readRecords().games;
  const failures = new Map(loadFailures().filter((f) => f.source === 'installed').map((f) => [f.id, f.error]));
  const installed: InstalledGameInfo[] = gameFolders().filter((f) => f.source === 'installed').map(({ name, dir }) => {
    const m = getGame(name)?.manifest ?? readManifest(dir);
    const rec = records[name];
    return {
      id: name,
      name: m?.name,
      color: m?.color,
      version: m?.version ?? rec?.version ?? '?',
      repo: rec?.repo ?? m?.repo,
      from: rec?.from,
      error: failures.get(name),
      git: isGitCheckout(name) || undefined,
      failedVersion: rec?.failedVersion,
      update: updates.get(name),
    };
  });
  // nicht ladbare Ordner (z. B. Name schon vergeben) ebenfalls zeigen
  for (const [id, error] of failures) {
    if (!installed.some((g) => g.id === id)) installed.push({ id, version: '?', error });
  }
  const versionOf = new Map(installed.map((g) => [g.id, g.version]));
  return {
    installed,
    updates: installed.filter((g) => updateAvailable(g)).length,
    catalog: catalog?.map((e) => {
      const rel = pickRelease(e);
      return { ...e, ...rel, compatible: rel.sdkVersion <= SDK_VERSION, installedVersion: versionOf.get(e.id) };
    }),
    catalogUrl: CATALOG_URL,
    catalogFailed,
    catalogCheckedAt,
    busy,
    message,
    restartNeeded,
  };
}

function isGitCheckout(id: string) {
  return fs.existsSync(path.join(INSTALLED_DIR, id, '.git'));
}

function updateAvailable(g: InstalledGameInfo) {
  const u = g.update;
  return !g.git && !!u?.latest && !u.needsNewerUp && u.latest !== g.failedVersion && (newer(u.latest, g.version) || !!g.error && u.latest !== g.version);
}

/* ---------------- Katalog ---------------- */

function validEntry(e: unknown): e is CatalogEntry {
  const x = e as CatalogEntry;
  return !!x && typeof x.id === 'string' && ID_RE.test(x.id) && typeof x.repo === 'string' && REPO_RE.test(x.repo)
    && typeof x.ref === 'string' && !!x.ref && typeof x.version === 'string' && typeof x.sdkVersion === 'number'
    && !!x.name && typeof x.name === 'object';
}

/** Neueste Version, die zu dieser UP!-Version passt (sonst die neueste überhaupt) */
function pickRelease(e: CatalogEntry): CatalogRelease {
  const all = [{ version: e.version, ref: e.ref, sdkVersion: e.sdkVersion }, ...(e.older ?? [])]
    .filter((r) => r && typeof r.version === 'string' && typeof r.ref === 'string' && typeof r.sdkVersion === 'number')
    .sort((a, b) => (newer(a.version, b.version) ? -1 : newer(b.version, a.version) ? 1 : 0));
  return all.find((r) => r.sdkVersion <= SDK_VERSION) ?? all[0];
}

export async function loadCatalog() {
  try {
    const raw = JSON.parse(await fetchText(CATALOG_URL));
    const list: unknown[] = Array.isArray(raw) ? raw : Array.isArray(raw?.spiele) ? raw.spiele : [];
    catalog = list.filter(validEntry).filter((e) => !isBuiltinId(e.id));
    catalogFailed = false;
    catalogCheckedAt = Date.now();
  } catch (e) {
    // Katalog gibt es (noch) nicht → leer; sonst offline
    if ((e as Error).message === 'HTTP 404') {
      catalog = [];
      catalogFailed = false;
      catalogCheckedAt = Date.now();
    } else catalogFailed = true;
  }
  changed();
}

function isBuiltinId(id: string) {
  return fs.existsSync(path.join(GAMES_DIR, id)) || id in RENAMED_GAMES;
}

/* ---------------- GitHub ---------------- */

/** "besitzer/repo", "https://github.com/besitzer/repo", "…/tree/v1.2", "besitzer/repo@v1.2" */
export function parseRepo(input: string): { repo: string; ref?: string } | undefined {
  let s = input.trim().replace(/\.git$/, '').replace(/\/$/, '');
  let ref: string | undefined;
  const at = /^(.*)@([\w./-]+)$/.exec(s);
  if (at && !s.includes('://')) [s, ref] = [at[1], at[2]];
  const m = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+\/[\w.-]+)(?:\/tree\/([\w./-]+))?$/.exec(s);
  if (m) return { repo: m[1], ref: m[2] ?? ref };
  if (REPO_RE.test(s)) return { repo: s, ref };
  return undefined;
}

/** Tag der neuesten Release (über die Weiterleitung von /releases/latest, ohne API-Limit) */
async function latestReleaseTag(repo: string): Promise<string | undefined> {
  try {
    const res = await fetch(`${WEB}/${repo}/releases/latest`, { redirect: 'manual', signal: AbortSignal.timeout(15_000) });
    const loc = res.headers.get('location') ?? '';
    const m = /\/releases\/tag\/([^/?#]+)$/.exec(loc);
    return m ? decodeURIComponent(m[1]) : undefined;
  } catch {
    return undefined;
  }
}

function rawUrl(repo: string, ref: string, sub: string, file: string) {
  return `${RAW}/${repo}/${ref}/${sub ? sub.replace(/^\/|\/$/g, '') + '/' : ''}${file}`;
}

/** Neueste Version eines Spiels herausfinden */
async function resolveLatest(id: string, rec: InstallRecord | undefined): Promise<GameUpdateInfo & { ref: string; repo: string; path: string; from: 'katalog' | 'repo' }> {
  const entry = catalog?.find((e) => e.id === id && (!rec || rec.from === 'katalog' || rec.repo.toLowerCase() === e.repo.toLowerCase()));
  if (entry) {
    const rel = pickRelease(entry);
    let notes: string[] = [];
    try { notes = notesFor(await fetchText(rawUrl(entry.repo, rel.ref, entry.path ?? '', 'CHANGELOG.md')), rel.version); } catch { /* ohne Notizen */ }
    return { latest: rel.version, ref: rel.ref, repo: entry.repo, path: entry.path ?? '', from: 'katalog', needsNewerUp: rel.sdkVersion > SDK_VERSION, notes };
  }
  const repo = rec?.repo ?? (getGame(id)?.manifest ?? readManifest(path.join(INSTALLED_DIR, id)))?.repo;
  if (!repo) throw new Error('no_repo');
  const sub = rec?.path ?? '';
  const ref = (await latestReleaseTag(repo)) ?? 'HEAD';
  const m = JSON.parse(await fetchText(rawUrl(repo, ref, sub, 'manifest.json'))) as GameManifest;
  if (!m.version) throw new Error('manifest_no_version');
  let notes: string[] = [];
  try { notes = notesFor(await fetchText(rawUrl(repo, ref, sub, 'CHANGELOG.md')), m.version); } catch { /* ohne Notizen */ }
  return { latest: m.version, ref, repo, path: sub, from: 'repo', needsNewerUp: Number(m.sdkVersion) > SDK_VERSION, notes };
}

/* ---------------- Nach Updates suchen ---------------- */

/** Ein Spiel prüfen (lädt dabei auch den Katalog neu, damit Katalog-Spiele die neueste Version sehen) */
export async function checkGame(id: string, opts: { catalog?: boolean } = {}) {
  const rec = readRecords().games[id];
  if (!rec && !(getGame(id)?.manifest ?? readManifest(path.join(INSTALLED_DIR, id)))?.repo) {
    updates.set(id, { checkedAt: Date.now(), error: 'no_repo' });
    return changed();
  }
  updates.set(id, { ...updates.get(id), checking: true, error: undefined });
  changed();
  try {
    if (opts.catalog !== false && (rec?.from === 'katalog' || catalog?.some((e) => e.id === id))) await loadCatalog();
    const r = await resolveLatest(id, rec);
    updates.set(id, { latest: r.latest, ref: r.ref, notes: r.notes, needsNewerUp: r.needsNewerUp, checkedAt: Date.now() });
  } catch (e) {
    const msg = (e as Error).message;
    updates.set(id, { ...updates.get(id), checking: false, checkedAt: Date.now(), error: msg === 'no_repo' ? 'no_repo' : 'offline' });
  }
  changed();
}

let checkingAll = false;
/** Katalog laden und alle installierten Spiele prüfen */
export async function checkAllGames() {
  if (checkingAll) return;
  checkingAll = true;
  try {
    await loadCatalog();
    const ids = gameFolders().filter((f) => f.source === 'installed').map((f) => f.name);
    for (const id of ids) await checkGame(id, { catalog: false });
  } finally {
    checkingAll = false;
    changed();
  }
}

export function startSpieleChecks() {
  if (process.env.UP_NO_UPDATE === '1') return;
  void checkAllGames();
  setInterval(() => void checkAllGames(), 30 * 60_000).unref();
}

/* ---------------- Herunterladen und prüfen ---------------- */

/** Nur normale Dateien und Ordner kopieren (keine Verknüpfungen) */
function copyTree(from: string, to: string) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (e.name === '.git' || e.name === '.github' || e.name === 'node_modules' || e.name === '.DS_Store') continue;
    const src = path.join(from, e.name), dest = path.join(to, e.name);
    if (e.isDirectory()) copyTree(src, dest);
    else if (e.isFile()) fs.copyFileSync(src, dest);
  }
}

/** Repository-Stand laden, Spiel darin finden und prüfen. Liefert einen fertigen Ordner in spiele/_tmp-<id>. */
async function fetchGame(repo: string, ref: string, sub: string, expectId?: string): Promise<{ dir: string; manifest: GameManifest; path: string }> {
  const work = path.join(TMP_DIR, `${Date.now()}`);
  fs.mkdirSync(work, { recursive: true });
  try {
    let res: Response;
    try {
      res = await fetch(`${WEB}/${repo}/archive/${ref}.zip`, { signal: AbortSignal.timeout(180_000) });
    } catch {
      throw new Error('offline');
    }
    if (res.status === 404) throw new Error('not_found');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_DOWNLOAD) throw new Error('too_large');
    const zip = path.join(work, 'spiel.zip');
    fs.writeFileSync(zip, buf);
    const out = path.join(work, 'files');
    extract(zip, out);
    const top = fs.readdirSync(out).filter((d) => fs.statSync(path.join(out, d)).isDirectory());
    if (top.length !== 1) throw new Error('bad_archive');
    const base = path.join(out, top[0]);
    // Spiel im Hauptordner, im angegebenen Unterordner oder (eindeutig) eine Ebene tiefer
    let rel = sub;
    if (!rel && !fs.existsSync(path.join(base, 'manifest.json'))) {
      const subs = fs.readdirSync(base).filter((d) => fs.existsSync(path.join(base, d, 'manifest.json')));
      if (subs.length !== 1) throw new Error('no_manifest');
      rel = subs[0];
    }
    const src = path.resolve(base, rel);
    if (!src.startsWith(base)) throw new Error('bad_archive');
    const manifest = readManifest(src);
    if (!manifest) throw new Error('no_manifest');
    if (!ID_RE.test(manifest.id ?? '')) throw new Error('bad_id');
    if (expectId && manifest.id !== expectId) throw new Error('wrong_id');
    if (isBuiltinId(manifest.id)) throw new Error('builtin_id');
    if (!fs.existsSync(path.join(src, 'server.ts')) || !fs.existsSync(path.join(src, 'client.tsx'))) throw new Error('incomplete');
    if (typeof manifest.sdkVersion !== 'number') throw new Error('incomplete');
    if (manifest.sdkVersion > SDK_VERSION) throw new Error('needs_newer_up');
    const staged = path.join(INSTALLED_DIR, `_tmp-${manifest.id}`);
    fs.rmSync(staged, { recursive: true, force: true });
    copyTree(src, staged);
    return { dir: staged, manifest, path: rel };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

/** Eigene Content-Packs aus der alten Version übernehmen (Dateien, die die neue Version nicht mitbringt) */
function keepOwnContent(oldDir: string, newDir: string) {
  const from = path.join(oldDir, 'content');
  if (!fs.existsSync(from)) return;
  for (const lang of fs.readdirSync(from)) {
    const langDir = path.join(from, lang);
    if (!fs.statSync(langDir).isDirectory()) continue;
    for (const f of fs.readdirSync(langDir)) {
      const target = path.join(newDir, 'content', lang, f);
      if (f.endsWith('.json') && !fs.existsSync(target)) {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(path.join(langDir, f), target);
      }
    }
  }
}

function errorKey(e: unknown) {
  const m = (e as Error).message;
  return ['offline', 'not_found', 'too_large', 'bad_archive', 'no_manifest', 'bad_id', 'wrong_id', 'builtin_id', 'incomplete', 'needs_newer_up', 'exists', 'no_repo', 'bad_repo', 'busy', 'not_installed']
    .includes(m) ? m : 'unknown';
}

/* ---------------- Installieren ---------------- */

/** Neues Spiel installieren (aus dem Katalog per id, oder aus einem Repository) – ohne Neustart */
export async function installGame(req: { catalogId?: string; repo?: string }): Promise<{ ok: boolean; error?: string; id?: string }> {
  if (busy) return { ok: false, error: 'busy' };
  let repo: string, ref: string, sub = '', from: InstallRecord['from'], expectId: string | undefined;
  if (req.catalogId) {
    const e = catalog?.find((x) => x.id === req.catalogId);
    if (!e) return { ok: false, error: 'not_found' };
    const rel = pickRelease(e);
    if (rel.sdkVersion > SDK_VERSION) return { ok: false, error: 'needs_newer_up' };
    ({ repo } = e);
    ref = rel.ref;
    sub = e.path ?? '';
    from = 'katalog';
    expectId = e.id;
  } else {
    const p = parseRepo(req.repo ?? '');
    if (!p) return { ok: false, error: 'bad_repo' };
    repo = p.repo;
    ref = p.ref ?? (await latestReleaseTag(repo)) ?? 'HEAD';
    from = 'repo';
  }
  busy = { id: expectId ?? repo, step: 'downloading' };
  changed();
  try {
    const got = await fetchGame(repo, ref, sub, expectId);
    const id = got.manifest.id;
    const target = path.join(INSTALLED_DIR, id);
    if (fs.existsSync(target)) {
      fs.rmSync(got.dir, { recursive: true, force: true });
      throw new Error('exists');
    }
    busy = { id, step: 'installing' };
    changed();
    fs.renameSync(got.dir, target);
    const r = readRecords();
    r.games[id] = { from, repo, path: got.path, ref, version: got.manifest.version ?? '0.0.0', installedAt: Date.now() };
    writeRecords(r);
    updates.delete(id);
    await reloadHook();
    const name = got.manifest.name?.de ?? id;
    say(getGame(id) ? 'ok' : 'error', getGame(id) ? 'spiele.msg.installed' : 'spiele.msg.installedBroken', { name, version: got.manifest.version ?? '' });
    return { ok: !!getGame(id), id, error: getGame(id) ? undefined : 'broken' };
  } catch (e) {
    const error = errorKey(e);
    if (error === 'unknown') console.error('[UP!] Installation fehlgeschlagen:', e);
    say('error', 'spiele.msg.installFailed', { error });
    return { ok: false, error };
  } finally {
    busy = undefined;
    changed();
  }
}

/** Spiel entfernen (Spielstände in .up-data bleiben) – ohne Neustart */
export async function uninstallGame(id: string): Promise<{ ok: boolean; error?: string }> {
  if (busy) return { ok: false, error: 'busy' };
  const dir = path.join(INSTALLED_DIR, id);
  if (!ID_RE.test(id) || !fs.existsSync(dir)) return { ok: false, error: 'not_installed' };
  const name = (getGame(id)?.manifest ?? readManifest(dir))?.name?.de ?? id;
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(path.join(BACKUP_DIR, id), { recursive: true, force: true });
  const r = readRecords();
  delete r.games[id];
  writeRecords(r);
  updates.delete(id);
  await reloadHook();
  say('ok', 'spiele.msg.removed', { name });
  return { ok: true };
}

/* ---------------- Aktualisieren ---------------- */

/** Ids aller Spiele mit installierbarem Update */
export function updatableGames() {
  return spieleStatus().installed.filter(updateAvailable).map((g) => g.id);
}

/**
 * Spiele aktualisieren (ohne ids: alle mit Update). Danach Neustart, außer `restart: false`
 * (z. B. wenn gleich danach noch UP! selbst aktualisiert wird und ohnehin neu startet).
 */
export async function updateGames(ids?: string[], opts: { restart?: boolean } = {}): Promise<{ ok: boolean; error?: string; updated: string[] }> {
  if (busy) return { ok: false, error: 'busy', updated: [] };
  const todo = (ids ?? updatableGames()).filter((id) => updatableGames().includes(id));
  const updated: string[] = [];
  let lastError: string | undefined;
  for (const id of todo) {
    const u = updates.get(id)!;
    const records = readRecords();
    const rec = records.games[id];
    const current = path.join(INSTALLED_DIR, id);
    busy = { id, step: 'downloading' };
    changed();
    try {
      const latest = await resolveLatest(id, rec);
      if (latest.needsNewerUp) throw new Error('needs_newer_up');
      const got = await fetchGame(latest.repo, latest.ref, latest.path, id);
      busy = { id, step: 'installing' };
      changed();
      keepOwnContent(current, got.dir);
      // alte Version sichern, neue an ihre Stelle
      const backup = path.join(BACKUP_DIR, id);
      fs.rmSync(backup, { recursive: true, force: true });
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
      const oldVersion = readManifest(current)?.version ?? rec?.version ?? '?';
      try {
        fs.renameSync(current, backup);
      } catch {
        copyTree(current, backup);
        fs.rmSync(current, { recursive: true, force: true });
      }
      fs.renameSync(got.dir, current);
      const r = readRecords();
      r.games[id] = {
        from: latest.from, repo: latest.repo, path: latest.path, ref: latest.ref,
        version: got.manifest.version ?? u.latest ?? '?', installedAt: Date.now(), verify: true, previous: oldVersion,
      };
      writeRecords(r);
      updated.push(id);
    } catch (e) {
      lastError = errorKey(e);
      if (lastError === 'unknown') console.error(`[UP!] Update von "${id}" fehlgeschlagen:`, e);
      updates.set(id, { ...u, error: lastError });
    }
  }
  busy = undefined;
  if (updated.length) {
    const r = readRecords();
    r.message = { kind: 'ok', key: 'spiele.msg.updated', vars: { names: updated.map((id) => readManifest(path.join(INSTALLED_DIR, id))?.name?.de ?? id).join(', ') }, at: Date.now() };
    writeRecords(r);
    if (opts.restart !== false) await restart();
  } else if (lastError) {
    say('error', 'spiele.msg.updateFailed', { error: lastError });
  }
  changed();
  return { ok: !lastError, error: lastError, updated };
}

/** UP! neu starten, damit aktualisierte Spiele geladen werden */
async function restart() {
  if (process.env.UP_LAUNCHER === '1') {
    busy = { id: '*', step: 'restarting' };
    changed();
    await new Promise((r) => setTimeout(r, 600)); // Hinweis noch an den TV senden
    await shutdownHook();
    fs.writeFileSync(path.join(DATA_DIR, 'restart'), 'spiele');
    setTimeout(() => process.exit(0), 300);
  } else {
    restartNeeded = true;
    changed();
  }
}

/* ---------------- Nach dem Start: Updates prüfen, ggf. zurückrollen ---------------- */

/**
 * Nach dem Laden aller Spiele aufrufen. Ein frisch aktualisiertes Spiel, das nicht lädt,
 * wird durch die gesicherte alte Version ersetzt. Liefert true, wenn UP! deshalb neu starten muss.
 */
export async function verifyAfterStart(): Promise<boolean> {
  const r = readRecords();
  message = r.message;
  delete r.message;
  let rolledBack = false;
  for (const [id, rec] of Object.entries(r.games)) {
    if (!rec.verify) continue;
    const backup = path.join(BACKUP_DIR, id);
    if (getGame(id)) {
      fs.rmSync(backup, { recursive: true, force: true });
      rec.verify = false;
      delete rec.previous;
      continue;
    }
    const error = loadFailures().find((f) => f.id === id)?.error ?? '';
    if (!fs.existsSync(backup)) {
      rec.verify = false;
      continue;
    }
    console.error(`[UP!] Neue Version von "${id}" lädt nicht (${error}) – alte Version wird wiederhergestellt`);
    const current = path.join(INSTALLED_DIR, id);
    fs.rmSync(current, { recursive: true, force: true });
    fs.renameSync(backup, current);
    const failed = rec.version;
    rec.version = rec.previous ?? readManifest(current)?.version ?? '?';
    rec.failedVersion = failed;
    rec.verify = false;
    delete rec.previous;
    rolledBack = true;
    r.message = { kind: 'rolledBack', key: 'spiele.msg.rolledBack', vars: { name: readManifest(current)?.name?.de ?? id, version: failed, error }, at: Date.now() };
  }
  writeRecords(r);
  if (rolledBack) {
    message = r.message;
    if (process.env.UP_LAUNCHER === '1') {
      // sauber mit der alten Version neu starten (die neue steckt schon im Modul-Speicher)
      fs.writeFileSync(path.join(DATA_DIR, 'restart'), 'rollback');
      return true;
    }
    // ohne Startskript: Meldung bleibt stehen, bis UP! neu gestartet wird
    const keep = readRecords();
    keep.message = r.message;
    writeRecords(keep);
    restartNeeded = true;
  }
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  // liegengebliebene Zwischenordner aufräumen
  if (fs.existsSync(INSTALLED_DIR)) {
    for (const d of fs.readdirSync(INSTALLED_DIR)) if (d.startsWith('_tmp-')) fs.rmSync(path.join(INSTALLED_DIR, d), { recursive: true, force: true });
  }
  changed();
  return false;
}

/** Meldung ausblenden */
export function dismissMessage() {
  message = undefined;
  changed();
}
