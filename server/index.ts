/** UP! Server: liefert die App aus, verwaltet Räume und spricht per WebSocket mit TV und Handys. */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { BUILD_DIR, DEV, PORT, QUIET } from './config';
import { lanAddress } from './network';
import { getGame, loadGames } from './registry';
import { setSecret } from './secrets';
import { installUpdate, onUpdateChange, startUpdateChecks, updateStatus } from './update';
import { allRooms, createRoom, getRoom, type Room } from './room';
import { buildClient, watchClient } from './build';

const MIME: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.map': 'application/json',
};

const lanIp = lanAddress();
const baseUrl = `http://${lanIp}:${PORT}`;

function log(...args: unknown[]) {
  if (!QUIET) console.log('[UP!]', ...args);
}

/* ---------------- HTTP ---------------- */

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');

  // Profilfotos: /photo/<raum>/<spieler>
  const photo = /^\/photo\/([A-Z]{4})\/([\w-]+)$/.exec(url.pathname);
  if (photo) {
    const p = getRoom(photo[1])?.photo(photo[2]);
    if (!p) return void res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type': p.type, 'Cache-Control': 'private, max-age=86400' });
    return void res.end(p.buf);
  }

  if (url.pathname === '/api/info') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return void res.end(JSON.stringify({ baseUrl, dev: DEV, version: updateStatus().current }));
  }

  if (url.pathname.startsWith('/assets/')) {
    const file = path.join(BUILD_DIR, path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, ''));
    if (file.startsWith(BUILD_DIR) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream',
        'Cache-Control': DEV ? 'no-cache' : 'public, max-age=31536000, immutable',
      });
      return void fs.createReadStream(file).pipe(res);
    }
    return void res.writeHead(404).end();
  }

  // Alles andere: die App (sie entscheidet anhand des Pfads, ob TV, Handy oder Entwicklermodus)
  const index = path.join(BUILD_DIR, 'index.html');
  if (!fs.existsSync(index)) return void res.writeHead(503).end('Wird gebaut …');
  res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
  fs.createReadStream(index).pipe(res);
});

/* ---------------- WebSocket ---------------- */

interface Session {
  room?: Room;
  role?: 'host' | 'player';
  playerId?: string;
}

const sockets = new Map<WebSocket, Session>();
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 1_000_000 });
wss.on('error', () => { /* Fehler des HTTP-Servers werden unten behandelt */ });

wss.on('connection', (ws) => {
  sockets.set(ws, {});
  (ws as any).isAlive = true;
  ws.on('pong', () => ((ws as any).isAlive = true));
  ws.on('message', (data) => {
    let msg: any;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return;
    }
    try {
      handle(ws, msg);
    } catch (e) {
      console.error('[UP!] Fehler bei Nachricht', msg?.t, e);
    }
  });
  ws.on('close', () => {
    sockets.get(ws)?.room?.detach(ws);
    sockets.delete(ws);
  });
});

// Tote Verbindungen erkennen (z. B. Handy im Standby)
setInterval(() => {
  for (const ws of wss.clients) {
    if ((ws as any).isAlive === false) {
      ws.terminate();
      continue;
    }
    (ws as any).isAlive = false;
    ws.ping();
  }
}, 15_000).unref();

function reply(ws: WebSocket, msg: any, payload: object) {
  if (msg.id !== undefined && ws.readyState === 1) ws.send(JSON.stringify({ t: 'reply', re: msg.id, ...payload }));
}

function handle(ws: WebSocket, msg: any) {
  const s = sockets.get(ws)!;
  const room = s.room;
  const isHost = s.role === 'host';
  const isVip = s.role === 'player' && room?.vipId === s.playerId;

  switch (msg.t) {
    case 'ping':
      return reply(ws, msg, { now: Date.now() });

    /* ---- Host ---- */
    case 'host:create': {
      const r = createRoom(msg.lang === 'en' ? 'en' : 'de', baseUrl);
      r.hosts.add(ws);
      Object.assign(s, { room: r, role: 'host' });
      log(`Raum ${r.code} erstellt`);
      reply(ws, msg, { ok: true, code: r.code, token: r.hostToken });
      return r.touch();
    }
    case 'host:resume': {
      const r = getRoom(msg.code);
      if (!r || r.hostToken !== msg.token) return reply(ws, msg, { ok: false, error: 'room_not_found' });
      r.hosts.add(ws);
      Object.assign(s, { room: r, role: 'host' });
      reply(ws, msg, { ok: true, code: r.code, token: r.hostToken });
      return r.flush();
    }

    /* ---- Spieler ---- */
    case 'join': {
      const r = getRoom(msg.code);
      if (!r) return reply(ws, msg, { ok: false, error: 'room_not_found' });
      const { player, error } = r.join(msg.name, msg.avatar, ws);
      if (!player) return reply(ws, msg, { ok: false, error });
      Object.assign(s, { room: r, role: 'player', playerId: player.info.id });
      log(`${player.info.name} ist Raum ${r.code} beigetreten`);
      return reply(ws, msg, { ok: true, code: r.code, token: player.token, playerId: player.info.id });
    }
    case 'resume': {
      const r = getRoom(msg.code);
      const p = r?.resume(String(msg.token ?? ''), ws);
      if (!r || !p) return reply(ws, msg, { ok: false, error: 'session_expired' });
      Object.assign(s, { room: r, role: 'player', playerId: p.info.id });
      return reply(ws, msg, { ok: true, code: r.code, token: p.token, playerId: p.info.id });
    }
    case 'profile':
      if (room && s.playerId) room.setProfile(s.playerId, msg);
      return reply(ws, msg, { ok: true });
    case 'photo': {
      if (!room || !s.playerId) return;
      const error = room.setPhoto(s.playerId, msg.dataUrl);
      return reply(ws, msg, { ok: !error, error });
    }
    case 'action':
      if (room && s.playerId) room.action(s.playerId, msg.action);
      return;

    /* ---- Host oder VIP ---- */
    case 'select':
      if (room && (isHost || isVip)) room.selectGame(String(msg.gameId));
      return;
    case 'start': {
      if (!room || !(isHost || isVip)) return;
      const error = room.startGame();
      return reply(ws, msg, { ok: !error, error });
    }
    case 'gameOption':
      if (room && (isHost || isVip)) room.setGameOption(String(msg.gameId), String(msg.id), msg.value);
      return;
    case 'lobby':
      if (room && (isHost || isVip)) room.backToLobby();
      return;

    /* ---- Nur Host ---- */
    case 'settings':
      if (room && isHost) room.updateSettings(msg.patch ?? {});
      return;
    case 'secret': {
      const game = getGame(String(msg.gameId));
      if (!room || !isHost || !game?.manifest.secrets?.some((x) => x.id === msg.id)) return;
      setSecret(game.manifest.id, String(msg.id), String(msg.value ?? ''));
      for (const r of allRooms().values()) r.secretChanged(game.manifest.id, String(msg.id));
      return reply(ws, msg, { ok: true });
    }
    case 'update:check':
      if (isHost) void import('./update').then((u) => u.checkForUpdate());
      return;
    case 'update:install':
      if (room && isHost && room.phase === 'lobby') void installUpdate(shutdown);
      return;
    case 'kick':
      if (room && isHost) room.kick(String(msg.playerId));
      return;
    case 'deck:reset':
      if (room && isHost) room.shuffleDeck(String(msg.gameId));
      return;
    case 'bots:add':
      if (room && isHost && DEV) room.addBots(Math.max(1, Math.min(20, Number(msg.count) || 1)));
      return;
    case 'bots:remove':
      if (room && isHost && DEV) room.removeBots();
      return;
  }
}

/* ---------------- Start ---------------- */

async function main() {
  const games = await loadGames();
  onUpdateChange(() => {
    for (const r of allRooms().values()) r.touch();
  });
  startUpdateChecks();
  log(`${games.size} Spiel(e) geladen: ${[...games.keys()].join(', ')}`);
  if (process.env.UP_NO_CLIENT === '1') {
    // nur Server (für automatische Tests)
  } else if (DEV) {
    await watchClient(() => {
      log('App neu gebaut – Browser laden neu');
      for (const ws of wss.clients) if (ws.readyState === 1) ws.send('{"t":"reload"}');
    });
  } else {
    await buildClient();
  }
  server.listen(PORT, () => {
    console.log('');
    console.log('  ╭──────────────────────────────────────────────╮');
    console.log('  │  UP! – Ultimate Party läuft                   │');
    console.log('  ╰──────────────────────────────────────────────╯');
    console.log(`  Fernseher / Laptop:  http://localhost:${PORT}/host`);
    console.log(`  Handys:              ${baseUrl}`);
    if (DEV) console.log(`  Entwicklermodus:     http://localhost:${PORT}/dev`);
    console.log('');
    console.log('  Beenden: dieses Fenster schließen oder Strg+C drücken.');
    console.log('');
    if (!DEV && process.env.UP_NO_OPEN !== '1' && process.env.UP_NO_CLIENT !== '1') openBrowser(`http://localhost:${PORT}/host`);
  });
}

/** TV-Ansicht automatisch im Standardbrowser öffnen */
function openBrowser(url: string) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
  } catch { /* kein Browser – egal */ }
}

/** Server sauber beenden (für Updates) */
function shutdown(): Promise<void> {
  return new Promise((resolve) => {
    for (const ws of wss.clients) ws.close();
    server.close(() => resolve());
    setTimeout(resolve, 1500);
  });
}

server.on('error', (e: NodeJS.ErrnoException) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`[UP!] Port ${PORT} ist schon belegt. Läuft UP! bereits? Sonst: PORT=3001 npm start`);
    process.exit(1);
  }
  throw e;
});

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export { server };
