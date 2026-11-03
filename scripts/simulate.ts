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

const scenarios: { game: string; players: number; options?: Record<string, number | string> }[] = [
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
  { game: 'guess-the-clicks', players: 2 },
  { game: 'guess-the-clicks', players: 30 },
  { game: 'guess-the-clicks', players: 100 },
  { game: 'hochstapler', players: 3 },
  { game: 'hochstapler', players: 6 },
  { game: 'hochstapler', players: 10 },
  { game: 'mehrheit', players: 3 },
  { game: 'mehrheit', players: 12 },
  { game: 'mehrheit', players: 100 },
  { game: 'wer-wars', players: 3 },
  { game: 'wer-wars', players: 10 },
  { game: 'schaetzmeister', players: 2 },
  { game: 'schaetzmeister', players: 15 },
  { game: 'schaetzmeister', players: 100 },
  { game: 'verraeter', players: 5 },
  { game: 'verraeter', players: 12 },
  { game: 'verraeter', players: 30 },
  { game: 'schwarmsinn', players: 1 },
  { game: 'schwarmsinn', players: 4 },
  { game: 'schwarmsinn', players: 12 },
  { game: 'crash', players: 2 },
  { game: 'crash', players: 100 },
  { game: 'kartoffel', players: 3 },
  { game: 'kartoffel', players: 20 },
  { game: 'sumo', players: 2 },
  { game: 'sumo', players: 12 },
  { game: 'sumo', players: 60 },
  { game: 'montagsmaler', players: 2 },
  { game: 'montagsmaler', players: 7 },
  { game: 'montagsmaler', players: 30 },
  // mit Spiel-Einstellungen
  { game: 'schlagfertig', players: 4, options: { rounds: 5, answerTime: 0.75 } },
  { game: 'bluff', players: 4, options: { questions: 3 } },
  { game: 'kritzelei', players: 4, options: { rounds: 1, drawTime: 45 } },
  { game: 'guess-the-clicks', players: 3, options: { videos: 3, guessTime: 20 } },
  { game: 'hochstapler', players: 4, options: { mode: 'point', rounds: 3 } },
  { game: 'hochstapler', players: 4, options: { mode: 'random', rounds: 7 } },
  { game: 'mehrheit', players: 5, options: { rounds: 4, voteTime: 0.7 } },
  { game: 'wer-wars', players: 4, options: { rounds: 1 } },
  { game: 'schwarmsinn', players: 3, options: { level: 18, time: 2 } },
  { game: 'crash', players: 4, options: { rounds: 4 } },
  { game: 'kartoffel', players: 5, options: { lives: 2 } },
  { game: 'sumo', players: 4, options: { rounds: 1 } },
  { game: 'montagsmaler', players: 5, options: { mode: 'team', rounds: 4 } },
  { game: 'montagsmaler', players: 3, options: { mode: 'team' } },
];
// Nur bestimmte Spiele testen:  npm test -- mehrheit wer-wars
const only = process.argv.slice(2);
if (only.length) scenarios.splice(0, scenarios.length, ...scenarios.filter((s) => only.includes(s.game)));

const server = spawn(process.execPath, ['--import', 'tsx', path.join(ROOT, 'server/index.ts')], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), UP_DEV: '1', UP_NO_CLIENT: '1', UP_TIME_SCALE: '0.02', UP_QUIET: '1', UP_FAKE_YOUTUBE: '1', UP_NO_UPDATE: '1' },
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

async function run({ game, players, options }: { game: string; players: number; options?: Record<string, number | string> }) {
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
  for (const [id, value] of Object.entries(options ?? {})) send('gameOption', { gameId: game, id, value });
  await new Promise((r) => setTimeout(r, 150));
  for (const [id, value] of Object.entries(options ?? {})) {
    if (state?.room?.settings?.gameOptions?.[game]?.[id] !== value) throw new Error(`Einstellung ${id} wurde nicht übernommen`);
  }
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
    const label = `${s.game.padEnd(13)} ${String(s.players).padStart(3)} Spieler${s.options ? ' ' + JSON.stringify(s.options) : ''}`;
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
