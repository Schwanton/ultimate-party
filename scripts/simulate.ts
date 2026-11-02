/**
 * Automatischer Test: spielt jedes Spiel mit Bots in verschiedenen Gruppengrößen komplett durch.
 * Aufruf: npm test
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3271;

const scenarios: { game: string; players: number }[] = [
  { game: '_vorlage', players: 2 },
  { game: 'schlagfertig', players: 3 },
  { game: 'schlagfertig', players: 8 },
  { game: 'schlagfertig', players: 12 },
  { game: 'schlagfertig', players: 13 },
  { game: 'schlagfertig', players: 40 },
  { game: 'schlagfertig', players: 100 },
  { game: 'bluff', players: 3 },
  { game: 'bluff', players: 12 },
  { game: 'bluff', players: 20 }, // 8 davon Publikum
  { game: 'kritzelei', players: 3 },
  { game: 'kritzelei', players: 6 },
  { game: 'kritzelei', players: 10 },
];

const server = spawn(process.execPath, ['--import', 'tsx', path.join(ROOT, 'server/index.ts')], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), UP_DEV: '1', UP_NO_CLIENT: '1', UP_TIME_SCALE: '0.02', UP_QUIET: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverErrors = '';
server.stderr.on('data', (d) => (serverErrors += String(d)));
server.stdout.on('data', () => {});

function connect(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

async function waitForServer() {
  for (let i = 0; i < 100; i++) {
    try {
      const ws = await connect();
      ws.close();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error('Server startet nicht');
}

async function run({ game, players }: { game: string; players: number }) {
  const ws = await connect();
  let id = 1;
  const pending = new Map<number, (m: any) => void>();
  let state: any = null;
  const screens = new Set<string>();
  ws.on('message', (raw) => {
    const m = JSON.parse(String(raw));
    if (m.t === 'reply') pending.get(m.re)?.(m);
    if (m.t === 'state') {
      state = m;
      if (m.host?.view?.screen) screens.add(m.host.view.screen);
    }
  });
  const req = (t: string, p: object = {}) => new Promise<any>((res) => {
    const rid = id++;
    pending.set(rid, res);
    ws.send(JSON.stringify({ t, id: rid, ...p }));
  });
  const send = (t: string, p: object = {}) => ws.send(JSON.stringify({ t, ...p }));

  await req('host:create', { lang: Math.random() < 0.5 ? 'de' : 'en' });
  for (let left = players; left > 0; left -= 20) send('bots:add', { count: Math.min(20, left) });
  await new Promise((r) => setTimeout(r, 300));
  send('select', { gameId: game });
  await new Promise((r) => setTimeout(r, 100));
  const started = await req('start');
  if (!started.ok) throw new Error(`Start fehlgeschlagen: ${started.error}`);
  const t0 = Date.now();
  while (Date.now() - t0 < 120_000) {
    await new Promise((r) => setTimeout(r, 200));
    if (state?.host?.notice) throw new Error(`Spiel abgebrochen: ${state.host.notice}`);
    if (state?.room?.finished) break;
  }
  ws.close();
  if (!state?.room?.finished) throw new Error(`nicht fertig geworden (zuletzt: ${state?.host?.view?.screen})`);
  const ranking = state.host.results.at(-1)?.ranking ?? [];
  return { seconds: ((Date.now() - t0) / 1000).toFixed(1), ranked: ranking.length, top: ranking[0]?.score ?? 0, screens: [...screens].join(',') };
}

let failed = 0;
try {
  await waitForServer();
  for (const s of scenarios) {
    const label = `${s.game.padEnd(13)} ${String(s.players).padStart(3)} Spieler`;
    try {
      const r = await run(s);
      console.log(`✔ ${label}  ${r.seconds}s  Rangliste: ${r.ranked}  Bester: ${r.top}  [${r.screens}]`);
    } catch (e) {
      failed++;
      console.log(`✘ ${label}  ${(e as Error).message}`);
    }
    if (serverErrors.includes('Fehler im Spiel')) {
      console.log(serverErrors);
      serverErrors = '';
      failed++;
    }
  }
} finally {
  server.kill();
}
console.log(failed ? `\n${failed} Test(s) fehlgeschlagen` : '\nAlle Tests bestanden');
process.exit(failed ? 1 : 0);
