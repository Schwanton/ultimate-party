/**
 * Updater: prüft auf GitHub, ob es eine neuere Version gibt, lädt sie herunter und installiert sie.
 *
 * - Version = "version" in package.json. Neue Versionen werden auf GitHub (Branch main) veröffentlicht.
 * - Installieren: ZIP von GitHub laden, entpacken, Dateien überschreiben. Nicht angefasst werden:
 *   .up-data (Einstellungen, API-Schlüssel), node_modules, eigene Content-Packs/Spiele und installierte Spiele (spiele/).
 * - Danach Neustart: Das Startskript („UP starten“) startet UP! automatisch neu.
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './config';

export type UpdateState = 'idle' | 'available' | 'downloading' | 'installing' | 'restarting' | 'manual' | 'error';

export interface UpdateStatus {
  state: UpdateState;
  current: string;
  latest?: string;
  notes?: string[];
  error?: string;
  /** Git-Checkout: Update per „git pull“ */
  git?: boolean;
  /** Suche läuft gerade */
  checking?: boolean;
  /** Zeitpunkt der letzten erfolgreichen Suche */
  checkedAt?: number;
  /** Letzte Suche fehlgeschlagen (z. B. offline) */
  checkFailed?: boolean;
}

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const CURRENT: string = pkg.version;
const REPO: string = pkg.upUpdate?.repo ?? 'Schwanton/ultimate-party';
const BRANCH: string = pkg.upUpdate?.branch ?? 'main';
const DATA = path.join(ROOT, '.up-data');
/** Für Tests umstellbar */
const RAW = process.env.UP_UPDATE_RAW ?? `https://raw.githubusercontent.com/${REPO}/${BRANCH}`;
const ZIP = process.env.UP_UPDATE_ZIP ?? `https://codeload.github.com/${REPO}/zip/refs/heads/${BRANCH}`;
/** Ordner, die komplett von UP! verwaltet werden (dort werden alte Dateien auch gelöscht) */
const MANAGED = ['server', 'src', 'sdk', 'scripts', 'docs'];
const KEEP = new Set(['.up-data', 'node_modules', '.git', '.up-build', 'spiele']);

let status: UpdateStatus = { state: 'idle', current: CURRENT, git: fs.existsSync(path.join(ROOT, '.git')) };
const listeners = new Set<() => void>();

export function updateStatus() {
  return status;
}

export function onUpdateChange(fn: () => void) {
  listeners.add(fn);
}

function set(patch: Partial<UpdateStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((l) => l());
}

/** "1.10.0" > "1.9.3" */
export function newer(a: string, b: string) {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d > 0;
  }
  return false;
}

export async function fetchText(url: string) {
  const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`, { signal: AbortSignal.timeout(15_000), headers: { 'Cache-Control': 'no-cache' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** Änderungen der neuen Version aus CHANGELOG.md (Abschnitt „## <version>“) */
export function notesFor(changelog: string, version: string): string[] {
  const lines = changelog.split('\n');
  const start = lines.findIndex((l) => l.trim().startsWith(`## ${version}`));
  if (start < 0) return [];
  const out: string[] = [];
  for (const l of lines.slice(start + 1)) {
    if (l.startsWith('## ')) break;
    const m = /^\s*[-*]\s+(.*)$/.exec(l);
    if (m) out.push(m[1].trim());
  }
  return out.slice(0, 6);
}

export async function checkForUpdate() {
  if (['downloading', 'installing', 'restarting'].includes(status.state) || status.checking) return;
  set({ checking: true });
  try {
    const remote = JSON.parse(await fetchText(`${RAW}/package.json`));
    if (!remote.version || !newer(remote.version, CURRENT)) return set({ state: 'idle', latest: remote.version, checking: false, checkedAt: Date.now(), checkFailed: false });
    let notes: string[] = [];
    try {
      notes = notesFor(await fetchText(`${RAW}/CHANGELOG.md`), remote.version);
    } catch { /* ohne Notizen */ }
    set({ state: status.git ? 'manual' : 'available', latest: remote.version, notes, error: undefined, checking: false, checkedAt: Date.now(), checkFailed: false });
  } catch {
    // offline – kein Problem, später erneut versuchen
    set({ checking: false, checkFailed: true });
  }
}

export function startUpdateChecks() {
  if (process.env.UP_NO_UPDATE === '1') return;
  void checkForUpdate();
  setInterval(() => void checkForUpdate(), 30 * 60_000).unref();
}

export function extract(zip: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true });
  // macOS und Windows 10+ haben „tar“ (bsdtar), das ZIP-Dateien entpacken kann
  const tries: [string, string[]][] = [['tar', ['-xf', zip, '-C', dest]], ['unzip', ['-q', '-o', zip, '-d', dest]]];
  for (const [cmd, args] of tries) {
    const r = spawnSync(cmd, args, { stdio: 'ignore' });
    if (r.status === 0) return;
  }
  throw new Error('Entpacken nicht möglich');
}

function listFiles(dir: string, base = dir, out: string[] = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listFiles(p, base, out);
    else out.push(path.relative(base, p));
  }
  return out;
}

function inside(root: string, p: string) {
  const r = path.relative(root, p);
  return !!r && !r.startsWith('..') && !path.isAbsolute(r);
}

/** Neue Dateien über die Installation kopieren, veraltete Dateien in verwalteten Ordnern entfernen */
function sync(from: string) {
  const files = listFiles(from).filter((f) => !KEEP.has(f.split(path.sep)[0]));
  const fresh = new Set(files);
  for (const f of files) {
    const target = path.join(ROOT, f);
    if (!inside(ROOT, target)) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(from, f), target);
    if (f.endsWith('.command')) fs.chmodSync(target, 0o755);
  }
  // veraltete Dateien entfernen – nur in verwalteten Ordnern und in mitgelieferten Spielen (außer content/)
  // nur Spiel-Ordner (games/<id>/…), keine einzelnen Dateien direkt in games/
  const gamesInUpdate = new Set(files.filter((f) => f.startsWith(`games${path.sep}`) && f.split(path.sep).length > 2).map((f) => f.split(path.sep)[1]));
  const roots = [...MANAGED.map((m) => path.join(ROOT, m)), ...[...gamesInUpdate].map((g) => path.join(ROOT, 'games', g))];
  for (const dir of roots) {
    if (!fs.existsSync(dir)) continue;
    for (const f of listFiles(dir, ROOT)) {
      const parts = f.split(path.sep);
      if (parts[0] === 'games' && parts[2] === 'content') continue;
      if (!fresh.has(f)) fs.rmSync(path.join(ROOT, f), { force: true });
    }
  }
}

function npmInstall(): Promise<boolean> {
  return new Promise((resolve) => {
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const child = spawn(npm, ['install', '--no-audit', '--no-fund'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
    child.on('exit', (code) => resolve(code === 0));
    child.on('error', () => resolve(false));
  });
}

/** Update installieren. `beforeRestart` schließt den Server sauber. */
export async function installUpdate(beforeRestart: () => Promise<void>) {
  if (status.state !== 'available') return;
  const tmp = path.join(DATA, 'update');
  try {
    set({ state: 'downloading', error: undefined });
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(tmp, { recursive: true });
    let res: Response;
    try {
      res = await fetch(ZIP, { signal: AbortSignal.timeout(120_000) });
    } catch {
      throw new Error('Keine Verbindung zu GitHub – ist der Rechner online?');
    }
    if (!res.ok) throw new Error(`Download fehlgeschlagen (HTTP ${res.status})`);
    const zip = path.join(tmp, 'update.zip');
    fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()));

    set({ state: 'installing' });
    const out = path.join(tmp, 'files');
    extract(zip, out);
    const top = fs.readdirSync(out).find((d) => fs.existsSync(path.join(out, d, 'package.json')));
    if (!top) throw new Error('Update-Archiv ist unvollständig');
    const fromDir = path.join(out, top);
    const newPkg = JSON.parse(fs.readFileSync(path.join(fromDir, 'package.json'), 'utf8'));
    const depsChanged = JSON.stringify(newPkg.dependencies) !== JSON.stringify(pkg.dependencies);
    sync(fromDir);
    if (depsChanged) {
      fs.rmSync(path.join(ROOT, 'node_modules', '.up-node-version'), { force: true });
      if (!(await npmInstall())) throw new Error('Pakete konnten nicht installiert werden – bitte UP! neu starten');
    }
    fs.rmSync(tmp, { recursive: true, force: true });

    set({ state: 'restarting', latest: newPkg.version });
    await new Promise((r) => setTimeout(r, 600)); // Hinweis noch an den TV senden
    await beforeRestart();
    if (process.env.UP_LAUNCHER === '1') {
      // Das Startskript sieht diese Datei und startet UP! neu
      fs.writeFileSync(path.join(DATA, 'restart'), newPkg.version);
      setTimeout(() => process.exit(0), 300);
    } else {
      set({ state: 'manual', error: 'restart' });
    }
  } catch (e) {
    set({ state: 'error', error: (e as Error).message });
  }
}
