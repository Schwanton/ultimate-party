/** Ein Spielraum: Spieler, Host-Bildschirme, Lobby und das laufende Spiel. */

import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import {
  ANIMALS, type Avatar, type GameContext, type GameServer, type Lang, type PlayerInfo,
  resolveOptions, type RankingEntry, type RoomSettings, type RoomSnapshot, type TimerHandle,
} from '../sdk/types';
import { shuffle } from '../sdk/util';
import { allGames, getGame, type LoadedGame } from './registry';
import { DEV, QUIET, TIME_SCALE } from './config';
import { getSecret, secretStatus, setSecret } from './secrets';
import { deckStatus, drawnSet, markDrawn, refill, resetDeck, unmarkDrawn } from './decks';
import { updateStatus } from './update';
import { rememberRoom, rememberedRoom } from './roomstore';

export const PALETTE = [
  '#E8336F', '#36D6F5', '#FFD447', '#9B7BFF', '#4BE3A1', '#FF9F43',
  '#FF7EB6', '#5B8CFF', '#C6F432', '#FF5A4E', '#2EC4B6', '#C29BFF',
];
const MAX_MEMBERS = 150;
const LOBBY_DROP_MS = 45_000;
const BOT_NAMES = ['Ada', 'Bruno', 'Cleo', 'Dario', 'Elif', 'Finn', 'Greta', 'Hugo', 'Ida', 'Juri', 'Kim', 'Lio', 'Mila', 'Nils', 'Oda', 'Pia'];

interface PlayerState {
  info: PlayerInfo;
  token: string;
  sockets: Set<WebSocket>;
  view: object | null;
  viewVersion: number;
  photo?: { buf: Buffer; type: string };
  lastSeen: number;
  order: number;
  lastSent?: string;
}

interface RunningGame {
  id: string;
  loaded: LoadedGame;
  server: GameServer | null;
  hostView: object | null;
  timers: Set<ReturnType<typeof setTimeout>>;
  finished: boolean;
  ranking: RankingEntry[] | null;
  memberIds: Set<string>;
}

export interface ServerMessage {
  [key: string]: unknown;
}

export class Room {
  readonly code: string;
  readonly hostToken: string;
  lang: Lang;
  settings: RoomSettings = { allowPhotos: true, disabledPacks: [], timeFactor: 1, gameOptions: {} };
  players = new Map<string, PlayerState>();
  hosts = new Set<WebSocket>();
  vipId: string | null = null;
  phase: 'lobby' | 'game' = 'lobby';
  selectedGameId: string | null = null;
  game: RunningGame | null = null;
  notice: string | null = null;
  results: { gameId: string; ranking: RankingEntry[] }[] = [];
  usedContent = new Set<string>();
  lastActivity = Date.now();
  /** nach einem Neustart wiederhergestellt (alte Handys dürfen automatisch neu beitreten) */
  restored = false;
  private order = 0;
  private flushQueued = false;
  private lastHostSent = new WeakMap<WebSocket, string>();

  constructor(code: string, lang: Lang, readonly joinUrl: string, hostToken: string = randomUUID()) {
    this.code = code;
    this.lang = lang;
    this.hostToken = hostToken;
    this.selectedGameId = allGames().find((g) => !g.manifest.hidden)?.manifest.id ?? null;
  }

  /* ---------------- Mitglieder ---------------- */

  private uniqueName(name: string, exceptId?: string): string {
    const taken = new Set([...this.players.values()].filter((p) => p.info.id !== exceptId).map((p) => p.info.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let i = 2; ; i++) if (!taken.has(`${name} ${i}`.toLowerCase())) return `${name} ${i}`;
  }

  private sanitizeAvatar(avatar: unknown): Avatar {
    const a = avatar as Avatar;
    if (a?.kind === 'animal' && (ANIMALS as readonly string[]).includes(a.animal)) return a;
    return { kind: 'animal', animal: ANIMALS[Math.floor(Math.random() * ANIMALS.length)] };
  }

  join(name: string, avatar: unknown, ws: WebSocket | null, isBot = false): { player?: PlayerState; error?: string } {
    if (this.players.size >= MAX_MEMBERS) return { error: 'room_full' };
    const clean = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 16);
    if (!clean) return { error: 'name_missing' };
    const id = randomUUID().slice(0, 8);
    const inGame = this.phase === 'game' && this.game;
    const info: PlayerInfo = {
      id,
      name: this.uniqueName(clean),
      avatar: this.sanitizeAvatar(avatar),
      color: PALETTE[this.order % PALETTE.length],
      role: inGame ? 'audience' : 'player',
      connected: !!ws || isBot,
      isBot,
    };
    const state: PlayerState = { info, token: randomUUID(), sockets: new Set(), view: null, viewVersion: 0, lastSeen: Date.now(), order: this.order++ };
    if (ws) state.sockets.add(ws);
    this.players.set(id, state);
    this.updateVip();
    if (inGame && this.game?.loaded.manifest.audience && this.game.server?.onAudienceJoin) {
      this.game.memberIds.add(id);
      this.safe(() => this.game?.server?.onAudienceJoin?.(id));
    }
    this.touch();
    return { player: state };
  }

  resume(token: string, ws: WebSocket): PlayerState | null {
    const p = [...this.players.values()].find((x) => x.token === token);
    if (!p) return null;
    p.sockets.add(ws);
    p.info.connected = true;
    p.lastSeen = Date.now();
    p.lastSent = undefined;
    if (this.game?.memberIds.has(p.info.id)) this.safe(() => this.game?.server?.onPlayerRejoin?.(p.info.id));
    this.updateVip();
    this.touch();
    return p;
  }

  detach(ws: WebSocket) {
    if (this.hosts.delete(ws)) return this.touch();
    for (const p of this.players.values()) {
      if (p.sockets.delete(ws)) {
        if (p.sockets.size === 0 && !p.info.isBot) {
          p.info.connected = false;
          p.lastSeen = Date.now();
        }
        this.touch();
      }
    }
  }

  setProfile(id: string, patch: { name?: unknown; avatar?: unknown }) {
    const p = this.players.get(id);
    if (!p) return;
    if (typeof patch.name === 'string' && patch.name.trim()) {
      p.info.name = this.uniqueName(patch.name.replace(/\s+/g, ' ').trim().slice(0, 16), id);
    }
    if (patch.avatar) {
      const a = patch.avatar as Avatar;
      if (a.kind === 'photo') {
        if (this.settings.allowPhotos && p.photo) p.info.avatar = { kind: 'photo', version: Date.now() };
      } else {
        p.info.avatar = this.sanitizeAvatar(a);
      }
    }
    this.touch();
  }

  setPhoto(id: string, dataUrl: unknown): string | null {
    const p = this.players.get(id);
    if (!p) return 'unknown_player';
    if (!this.settings.allowPhotos) return 'photos_disabled';
    const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(String(dataUrl ?? ''));
    if (!m) return 'invalid_image';
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 400_000) return 'image_too_large';
    p.photo = { buf, type: m[1] };
    p.info.avatar = { kind: 'photo', version: Date.now() };
    this.touch();
    return null;
  }

  photo(id: string) {
    return this.players.get(id)?.photo;
  }

  kick(id: string) {
    const p = this.players.get(id);
    if (!p) return;
    for (const ws of p.sockets) {
      try { ws.send(JSON.stringify({ t: 'kicked' })); ws.close(); } catch { /* egal */ }
    }
    this.players.delete(id);
    this.updateVip();
    this.touch();
  }

  addBots(count: number) {
    for (let i = 0; i < count; i++) {
      const name = BOT_NAMES[(this.order + i) % BOT_NAMES.length];
      this.join(`${name} (Bot)`, null, null, true);
    }
  }

  removeBots() {
    for (const p of [...this.players.values()]) if (p.info.isBot) this.players.delete(p.info.id);
    this.updateVip();
    this.touch();
  }

  private updateVip() {
    if (this.vipId && this.players.get(this.vipId)?.info.connected) return;
    const candidates = [...this.players.values()].filter((p) => !p.info.isBot && p.info.connected).sort((a, b) => a.order - b.order);
    this.vipId = candidates[0]?.info.id ?? null;
  }

  /** Regelmäßig aufgerufen: Spieler, die die Lobby verlassen haben, entfernen. */
  tick() {
    if (this.phase !== 'lobby') return;
    const now = Date.now();
    let changed = false;
    for (const p of [...this.players.values()]) {
      if (!p.info.connected && !p.info.isBot && now - p.lastSeen > LOBBY_DROP_MS) {
        this.players.delete(p.info.id);
        changed = true;
      }
    }
    if (changed) {
      this.updateVip();
      this.touch();
    }
  }

  isEmpty() {
    return this.hosts.size === 0 && ![...this.players.values()].some((p) => p.sockets.size > 0);
  }

  /* ---------------- Einstellungen ---------------- */

  /** Raum merken, damit er nach einem Neustart (z. B. Update) mit gleichem Code weiterläuft */
  remember() {
    rememberRoom(this.code, { token: this.hostToken, lang: this.lang, settings: this.settings });
  }

  updateSettings(patch: Partial<RoomSettings> & { lang?: Lang }) {
    if (patch.lang === 'de' || patch.lang === 'en') this.lang = patch.lang;
    if (typeof patch.allowPhotos === 'boolean') {
      this.settings.allowPhotos = patch.allowPhotos;
      if (!patch.allowPhotos) {
        for (const p of this.players.values()) {
          if (p.info.avatar.kind === 'photo') p.info.avatar = this.sanitizeAvatar(null);
          p.photo = undefined;
        }
      }
    }
    if (Array.isArray(patch.disabledPacks)) this.settings.disabledPacks = patch.disabledPacks.filter((k) => typeof k === 'string');
    if (typeof patch.timeFactor === 'number' && patch.timeFactor >= 0.5 && patch.timeFactor <= 3) this.settings.timeFactor = patch.timeFactor;
    this.remember();
    this.touch();
  }

  setGameOption(gameId: string, id: string, value: unknown) {
    const g = getGame(gameId);
    const def = g?.manifest.options?.find((o) => o.id === id);
    if (!g || !def || this.phase !== 'lobby') return;
    const next = resolveOptions(g.manifest.options, { ...this.settings.gameOptions[gameId], [id]: value });
    this.settings.gameOptions = { ...this.settings.gameOptions, [gameId]: next };
    this.remember();
    this.touch();
  }

  /* ---------------- Spielablauf ---------------- */

  selectGame(id: string) {
    if (this.phase !== 'lobby' || !getGame(id)) return;
    this.selectedGameId = id;
    this.touch();
  }

  /** Spieler, die aktuell mitspielen können (verbunden oder Bot) */
  private eligible() {
    return [...this.players.values()].filter((p) => p.info.connected || p.info.isBot).sort((a, b) => a.order - b.order);
  }

  startGame(): string | null {
    const id = this.selectedGameId;
    const loaded = id ? getGame(id) : undefined;
    if (!loaded) return 'no_game';
    const m = loaded.manifest;
    const eligible = this.eligible();
    if (eligible.length < m.minPlayers) return 'not_enough_players';
    this.stopGame();
    const humansFirst = eligible; // Beitrittsreihenfolge entscheidet über die Plätze
    const players = humansFirst.slice(0, m.maxPlayers);
    const rest = humansFirst.slice(m.maxPlayers);
    for (const p of this.players.values()) {
      p.view = null;
      p.viewVersion++;
      p.info.role = 'audience';
    }
    players.forEach((p) => (p.info.role = 'player'));
    const g: RunningGame = {
      id: m.id, loaded, server: null, hostView: null, timers: new Set(), finished: false, ranking: null,
      memberIds: new Set([...players, ...(m.audience ? rest : [])].map((p) => p.info.id)),
    };
    this.game = g;
    this.phase = 'game';
    this.notice = null;
    const ctx = this.createContext(g, players.map((p) => ({ ...p.info })));
    const ok = this.safe(() => {
      g.server = loaded.module.create(ctx);
      g.server.start();
    });
    if (!ok) return 'game_crashed';
    this.touch();
    return null;
  }

  restartGame() {
    return this.startGame();
  }

  stopGame() {
    const g = this.game;
    if (!g) return;
    g.timers.forEach((t) => clearTimeout(t));
    g.timers.clear();
    try { g.server?.dispose?.(); } catch { /* egal */ }
    this.game = null;
  }

  backToLobby() {
    this.stopGame();
    this.phase = 'lobby';
    for (const p of this.players.values()) {
      p.view = null;
      p.viewVersion++;
      p.info.role = 'player';
    }
    this.updateVip();
    this.touch();
  }

  /** Geheime Einstellung wurde vom Host geändert → laufendes Spiel informieren */
  secretChanged(gameId: string, id: string) {
    const g = this.game;
    if (g?.id === gameId && g.server?.onSecretChanged) this.safe(() => g.server?.onSecretChanged?.(id));
    this.touch();
  }

  action(playerId: string, action: unknown) {
    const g = this.game;
    if (!g || !g.server || !g.memberIds.has(playerId)) return;
    this.safe(() => g.server?.onAction(playerId, action));
  }

  private safe(fn: () => void): boolean {
    try {
      fn();
      return true;
    } catch (e) {
      console.error(`[UP!] Fehler im Spiel "${this.game?.id}":`, e);
      this.notice = `game_error`;
      this.backToLobby();
      return false;
    }
  }

  private createContext(g: RunningGame, players: PlayerInfo[]): GameContext {
    const room = this;
    const alive = () => room.game === g;
    const schedule = (ms: number, fn: () => void) => {
      const t = setTimeout(() => {
        g.timers.delete(t);
        if (alive()) room.safe(fn);
      }, ms);
      g.timers.add(t);
      return t;
    };
    const setView = (p: PlayerState, view: object) => {
      p.view = view;
      p.viewVersion++;
      if (p.info.isBot && g.server?.bot) {
        const version = p.viewVersion;
        schedule((500 + Math.random() * 2000) * TIME_SCALE, () => {
          if (p.viewVersion !== version) return;
          const act = g.server?.bot?.(p.info.id, view);
          if (act != null) room.action(p.info.id, act);
        });
      }
      room.touch();
    };
    return {
      lang: room.lang,
      options: resolveOptions(g.loaded.manifest.options, room.settings.gameOptions[g.id]),
      players,
      audience: () => [...room.players.values()].filter((p) => p.info.role === 'audience' && g.memberIds.has(p.info.id)).map((p) => ({ ...p.info })),
      player: (id) => {
        const p = room.players.get(id);
        return p ? { ...p.info } : undefined;
      },
      vip: () => room.vipId,
      stream: (data, opts) => {
        if (!alive()) return;
        const msg = JSON.stringify({ t: 'stream', now: Date.now(), d: data });
        for (const ws of room.hosts) send(ws, msg);
        if (opts?.phones) {
          for (const p of room.players.values()) if (g.memberIds.has(p.info.id)) for (const ws of p.sockets) send(ws, msg);
        }
      },
      content: <T,>() => room.contentFor(g) as T[],
      deck: <T extends { id?: string },>(opts?: { filter?: (item: T) => boolean }) => room.deckFor<T>(g, opts?.filter),
      setHostView(view) {
        if (!alive()) return;
        g.hostView = view;
        room.touch();
      },
      setPlayerView(id, view) {
        if (!alive()) return;
        const p = room.players.get(id);
        if (p) setView(p, view);
      },
      setAllPlayerViews(fn) {
        if (!alive()) return;
        for (const info of players) {
          const p = room.players.get(info.id);
          if (p) setView(p, fn({ ...p.info }));
        }
      },
      setAudienceView(view) {
        if (!alive()) return;
        for (const p of room.players.values()) {
          if (p.info.role === 'audience' && g.memberIds.has(p.info.id)) {
            setView(p, typeof view === 'function' ? view({ ...p.info }) : view);
          }
        }
      },
      timer(seconds, onEnd, opts): TimerHandle {
        const ms = seconds * 1000 * room.settings.timeFactor * TIME_SCALE;
        // Nachfrist: angezeigt wird die normale Zeit, beendet wird etwas später (Entwürfe kommen noch an)
        const t = schedule(ms + (opts?.grace ?? 0) * 1000 * TIME_SCALE, onEnd);
        return {
          deadline: Date.now() + ms,
          duration: ms,
          cancel: () => {
            clearTimeout(t);
            g.timers.delete(t);
          },
        };
      },
      timerAt(deadline, onEnd, opts): TimerHandle {
        const ms = Math.max(0, deadline - Date.now());
        const t = schedule(ms + (opts?.grace ?? 0) * 1000 * TIME_SCALE, onEnd);
        return {
          deadline: Date.now() + ms,
          duration: ms,
          cancel: () => {
            clearTimeout(t);
            g.timers.delete(t);
          },
        };
      },
      after(seconds, fn) {
        schedule(seconds * 1000 * TIME_SCALE, fn);
      },
      clearTimers() {
        g.timers.forEach((t) => clearTimeout(t));
        g.timers.clear();
      },
      finish(ranking) {
        if (!alive()) return;
        g.finished = true;
        g.ranking = ranking;
        room.results.push({ gameId: g.id, ranking });
        room.touch();
      },
      secret: (id) => getSecret(g.id, id),
      setSecret: (id, value) => {
        if (!g.loaded.manifest.secrets?.some((x) => x.id === id)) return;
        setSecret(g.id, id, value);
        room.touch();
      },
      log: (...args) => {
        if (!QUIET) console.log(`[${g.id}]`, ...args);
      },
    };
  }

  /** Alle Karten (Content-Einträge) der aktivierten Packs in Raumsprache, mit eindeutigem Schlüssel */
  private cardsFor(g: RunningGame) {
    const out: { key: string; item: object }[] = [];
    for (const { info, pack } of g.loaded.packs) {
      if (!pack || info.lang !== this.lang || this.settings.disabledPacks.includes(info.key)) continue;
      pack.items.forEach((item, i) => {
        const key = `${info.key}#${item.id ?? i}`;
        out.push({ key, item: { ...item, id: key } });
      });
    }
    return out;
  }

  /** Kartenstapel (siehe server/decks.ts): gezogene Karten kommen erst wieder, wenn der Stapel leer ist. */
  deckFor<T extends { id?: string }>(g: RunningGame, filter?: (item: T) => boolean) {
    const deckId = `${g.id}/${this.lang}`;
    const taken = new Set<string>(); // in diesem Spiel schon gezogen
    const cards = () => this.cardsFor(g).filter((c) => {
      try {
        return !filter || filter(c.item as T);
      } catch {
        return false;
      }
    });
    const draw = (): T | undefined => {
      const all = cards();
      if (!all.length) return undefined;
      const drawn = drawnSet(deckId);
      let fresh = all.filter((c) => !drawn.has(c.key) && !taken.has(c.key));
      if (!fresh.length) {
        // Stapel aufgebraucht: wieder auffüllen (außer den Karten aus diesem Spiel)
        refill(deckId, all.map((c) => c.key));
        fresh = all.filter((c) => !taken.has(c.key));
        if (!fresh.length) {
          taken.clear();
          fresh = all;
        }
      }
      const c = fresh[Math.floor(Math.random() * fresh.length)];
      markDrawn(deckId, c.key);
      taken.add(c.key);
      return { ...(c.item as T) };
    };
    return {
      draw,
      drawMany: (n: number) => {
        const out: T[] = [];
        for (let i = 0; i < n; i++) {
          const c = draw();
          if (!c) break;
          out.push(c);
        }
        return out;
      },
      putBack: (card: T) => {
        if (!card?.id) return;
        unmarkDrawn(deckId, card.id);
        taken.delete(card.id);
      },
      get size() {
        return cards().length;
      },
      get left() {
        const drawn = drawnSet(deckId);
        return cards().filter((c) => !drawn.has(c.key)).length;
      },
    };
  }

  /** Content-Einträge: aktivierte Packs in Raumsprache, noch nicht gespielte zuerst. */
  private contentFor(g: RunningGame) {
    const fresh: object[] = [];
    const used: object[] = [];
    for (const { info, pack } of g.loaded.packs) {
      if (!pack || info.lang !== this.lang || this.settings.disabledPacks.includes(info.key)) continue;
      pack.items.forEach((item, i) => {
        const key = `${info.key}#${item.id ?? i}`;
        const entry = { ...item, id: key };
        (this.usedContent.has(key) ? used : fresh).push(entry);
      });
    }
    const list = [...shuffle(fresh), ...shuffle(used)];
    // Wer Content abruft, verbraucht ihn – grob: die ersten 30 merken
    list.slice(0, 30).forEach((e) => this.usedContent.add((e as { id: string }).id));
    return list;
  }

  /* ---------------- Senden ---------------- */

  touch() {
    this.lastActivity = Date.now();
    if (this.flushQueued) return;
    this.flushQueued = true;
    setImmediate(() => {
      this.flushQueued = false;
      this.flush();
    });
  }

  snapshot(): RoomSnapshot {
    return {
      code: this.code,
      lang: this.lang,
      players: [...this.players.values()].sort((a, b) => a.order - b.order).map((p) => p.info),
      vipId: this.vipId,
      phase: this.phase,
      gameId: this.game?.id ?? null,
      selectedGameId: this.selectedGameId,
      finished: !!this.game?.finished,
      settings: this.settings,
      joinUrl: this.joinUrl,
      dev: DEV,
    };
  }

  /** Kartenstapel aller Spiele in Raumsprache: wie viele Karten sind noch nicht gezogen? */
  deckOverview() {
    return allGames().filter((g) => !g.manifest.noDeck && (!g.manifest.hidden || DEV)).flatMap((g) => {
      const keys: string[] = [];
      for (const { info, pack } of g.packs) {
        if (!pack || info.lang !== this.lang || this.settings.disabledPacks.includes(info.key)) continue;
        pack.items.forEach((item, i) => keys.push(`${info.key}#${item.id ?? i}`));
      }
      return keys.length ? [{ game: g.manifest.id, ...deckStatus(`${g.manifest.id}/${this.lang}`, keys) }] : [];
    });
  }

  shuffleDeck(gameId: string) {
    resetDeck(`${gameId}/${this.lang}`);
    this.touch();
  }

  hostPayload() {
    return {
      games: allGames().map((g) => ({ ...g.manifest, warning: g.warning, secretsSet: secretStatus(g.manifest.id, (g.manifest.secrets ?? []).map((x) => x.id)) })),
      packs: allGames().flatMap((g) => g.packs.map((p) => p.info)),
      decks: this.deckOverview(),
      notice: this.notice,
      results: this.results,
      update: updateStatus(),
    };
  }

  flush() {
    const room = JSON.stringify(this.snapshot());
    const now = Date.now();
    if (this.hosts.size) {
      const host = JSON.stringify({ ...this.hostPayload(), view: this.game?.hostView ?? null });
      const msg = `{"t":"state","role":"host","now":${now},"room":${room},"host":${host}}`;
      for (const ws of this.hosts) {
        if (this.lastHostSent.get(ws) === room + host) continue;
        this.lastHostSent.set(ws, room + host);
        send(ws, msg);
      }
    }
    for (const p of this.players.values()) {
      if (!p.sockets.size) continue;
      const body = `"room":${room},"me":${JSON.stringify(p.info)},"view":${JSON.stringify(p.view)},"viewVersion":${p.viewVersion}`;
      if (p.lastSent === body) continue;
      p.lastSent = body;
      const msg = `{"t":"state","role":"player","now":${now},${body}}`;
      for (const ws of p.sockets) send(ws, msg);
    }
  }

  broadcast(obj: ServerMessage) {
    const msg = JSON.stringify(obj);
    for (const ws of this.hosts) send(ws, msg);
    for (const p of this.players.values()) for (const ws of p.sockets) send(ws, msg);
  }
}

function send(ws: WebSocket, msg: string) {
  if (ws.readyState === 1) ws.send(msg);
}

/* ---------------- Raumverwaltung ---------------- */

const rooms = new Map<string, Room>();
const LETTERS = 'BCDFGHJKLMNPQRSTVWXZ';

export function createRoom(lang: Lang, joinUrl: string): Room {
  let code = '';
  do {
    code = Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
  } while (rooms.has(code));
  const room = new Room(code, lang, joinUrl);
  rooms.set(code, room);
  room.remember();
  return room;
}

/**
 * Nach einem Neustart: Der Fernseher meldet sich mit seinem alten Code und Schlüssel –
 * dann gibt es den Raum mit genau diesem Code wieder (Einstellungen inklusive).
 */
export function restoreRoom(code: unknown, token: unknown, joinUrl: string): Room | undefined {
  if (typeof code !== 'string' || typeof token !== 'string') return undefined;
  const c = code.toUpperCase().trim();
  if (!/^[BCDFGHJKLMNPQRSTVWXZ]{4}$/.test(c) || rooms.has(c) || token.length < 8 || token.length > 64) return undefined;
  const saved = rememberedRoom(c);
  if (saved && saved.token !== token) return undefined;
  const room = new Room(c, saved?.lang === 'en' ? 'en' : 'de', joinUrl, token);
  if (saved?.settings) room.settings = { ...room.settings, ...saved.settings };
  room.restored = true;
  rooms.set(c, room);
  room.remember();
  return room;
}

export function getRoom(code: unknown): Room | undefined {
  return typeof code === 'string' ? rooms.get(code.toUpperCase().trim()) : undefined;
}

export function allRooms() {
  return rooms;
}

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    room.tick();
    if (room.isEmpty() && now - room.lastActivity > 30 * 60_000) {
      room.stopGame();
      rooms.delete(code);
    }
  }
}, 10_000).unref();
