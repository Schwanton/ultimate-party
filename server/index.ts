/** UP! Server: liefert die App aus, verwaltet Räume und spricht per WebSocket mit TV und Handys. */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { BOOT_ID, BUILD_DIR, DEV, PORT, QUIET } from './config';
import { initNetwork, joinBaseUrl, watchJoinBaseUrl } from './network';
import { getGame, loadGames } from './registry';
import { setSecret } from './secrets';
import { checkForUpdate, installUpdate, onUpdateChange, startUpdateChecks, updateStatus } from './update';
import { checkAllGames, checkGame, dismissMessage, installGame, onSpieleChange, setSpieleHooks, startSpieleChecks, uninstallGame, updatableGames, updateGames, verifyAfterStart } from './spiele';
import { allRooms, createRoom, getRoom, restoreRoom, type Room } from './room';
import { buildClient, watchClient } from './build';

const MIME: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.map': 'application/json',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
};


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
    return void res.end(JSON.stringify({ baseUrl: joinBaseUrl(), dev: DEV, version: updateStatus().current, boot: BOOT_ID }));
  }

  // Dateien eines Spiels (Bilder, Schriften, Klänge): /game/<spiel>/<ordner>/<datei>
  const gameFile = /^\/game\/([a-z0-9-]+)\/(bilder|schriften|klaenge)\/([\w.-]+\.(?:webp|png|jpg|woff2|mp3|ogg|svg))$/.exec(url.pathname);
  if (gameFile) {
    const dir = getGame(gameFile[1])?.dir;
    const file = dir ? path.join(dir, gameFile[2], gameFile[3]) : '';
    if (!file || !fs.existsSync(file)) return void res.writeHead(404).end();
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream',
      'Cache-Control': DEV ? 'no-cache' : 'public, max-age=86400',
    });
    return void fs.createReadStream(file).pipe(res);
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
      const r = createRoom(msg.lang === 'en' ? 'en' : 'de');
      r.hosts.add(ws);
      Object.assign(s, { room: r, role: 'host' });
      log(`Raum ${r.code} erstellt`);
      reply(ws, msg, { ok: true, code: r.code, token: r.hostToken });
      return r.touch();
    }
    case 'host:resume': {
      const r = getRoom(msg.code) ?? restoreRoom(msg.code, msg.token);
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
      if (!r) return reply(ws, msg, { ok: false, error: 'room_not_found' });
      // Raum wurde nach einem Neustart wiederhergestellt: Handy darf automatisch neu beitreten
      if (!p) return reply(ws, msg, { ok: false, error: r.restored ? 'room_restarted' : 'session_expired' });
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
      // Nach Updates suchen: UP! und alle installierten Spiele
      if (isHost) {
        void checkForUpdate();
        void checkAllGames();
      }
      return;
    case 'update:install':
      if (room && isHost && room.phase === 'lobby') void installUpdate(shutdown);
      return;
    case 'update:all':
      // Alles auf einmal: erst Spiele (ohne Neustart), dann UP! (startet neu); ohne UP!-Update starten die Spiele neu
      if (room && isHost && room.phase === 'lobby') void installEverything();
      return;

    /* ---- Installierte Spiele (nur Host) ---- */
    case 'spiele:check':
      if (isHost) void (msg.gameId ? checkGame(String(msg.gameId)) : checkAllGames());
      return;
    case 'spiele:install':
      if (!room || !isHost || room.phase !== 'lobby') return reply(ws, msg, { ok: false, error: 'busy' });
      void installGame({ catalogId: msg.catalogId ? String(msg.catalogId) : undefined, repo: msg.repo ? String(msg.repo) : undefined }).then((r) => reply(ws, msg, r));
      return;
    case 'spiele:update':
      if (!room || !isHost || room.phase !== 'lobby') return reply(ws, msg, { ok: false, error: 'busy' });
      void updateGames(msg.gameId ? [String(msg.gameId)] : undefined).then((r) => reply(ws, msg, r));
      return;
    case 'spiele:uninstall':
      if (!room || !isHost || room.phase !== 'lobby') return reply(ws, msg, { ok: false, error: 'busy' });
      void uninstallGame(String(msg.gameId)).then((r) => reply(ws, msg, r));
      return;
    case 'spiele:dismiss':
      if (isHost) dismissMessage();
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

/** Alle Browser neu laden lassen (neue App-Version) */
function reloadBrowsers() {
  for (const ws of wss.clients) if (ws.readyState === 1) ws.send('{"t":"reload"}');
}

/** Spiele neu einlesen und App neu bauen – nach Installieren oder Entfernen, ohne Neustart */
async function reloadGames() {
  const games = await loadGames();
  log(`${games.size} Spiel(e) geladen: ${[...games.keys()].join(', ')}`);
  // Im Entwicklermodus baut watchClient von selbst neu
  if (!DEV && process.env.UP_NO_CLIENT !== '1') {
    await buildClient();
    reloadBrowsers();
  }
  for (const r of allRooms().values()) r.touch();
}

/** „Alles aktualisieren“ in der Lobby */
async function installEverything() {
  const upAvailable = updateStatus().state === 'available';
  if (updatableGames().length) await updateGames(undefined, { restart: !upAvailable });
  if (upAvailable) await installUpdate(shutdown);
}

async function main() {
  const games = await loadGames();
  const touchAll = () => {
    for (const r of allRooms().values()) r.touch();
  };
  onUpdateChange(touchAll);
  onSpieleChange(touchAll);
  setSpieleHooks({ reload: reloadGames, shutdown });
  log(`${games.size} Spiel(e) geladen: ${[...games.keys()].join(', ')}`);
  if (process.env.UP_NO_CLIENT === '1') {
    // nur Server (für automatische Tests)
  } else if (DEV) {
    await watchClient(() => {
      log('App neu gebaut – Browser laden neu');
      reloadBrowsers();
    });
  } else {
    await buildClient();
  }
  // Frisch aktualisierte Spiele prüfen; lädt eines nicht, kommt die alte Version zurück (Neustart über das Startskript)
  if (await verifyAfterStart()) {
    log('Ein Spiel-Update ließ sich nicht laden – alte Version wiederhergestellt, UP! startet neu');
    process.exit(0);
  }
  startUpdateChecks();
  startSpieleChecks();
  await initNetwork();
  // Anderes WLAN? Neue Adresse sofort im QR-Code anzeigen
  watchJoinBaseUrl((url) => {
    console.log(`[UP!] Netzwerk gewechselt – Handys jetzt über: ${url}`);
    for (const r of allRooms().values()) r.flush();
  });
  server.listen(PORT, () => {
    console.log('');
    console.log('  ╭──────────────────────────────────────────────╮');
    console.log('  │  UP! – Ultimate Party läuft                   │');
    console.log('  ╰──────────────────────────────────────────────╯');
    console.log(`  Fernseher / Laptop:  http://localhost:${PORT}/host`);
    console.log(`  Handys:              ${joinBaseUrl()}`);
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
