/** Ein Spielraum: Spieler, Host-Bildschirme, Lobby und das laufende Spiel. */

import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import {
  ANIMALS, type Avatar, type GameContext, type GameServer, type Lang, type PlayerInfo,
  resolveOptions, type GameManifest, type GameVote, type OlympiaSettings, type OlympiaState, type RankingEntry, type RoomSettings,
  type RoomSnapshot, type TimerHandle,
} from '../sdk/types';
import { shuffle } from '../sdk/util';
import {
  OLYMPIA_MAX, OLYMPIA_MIN, cleanOlympiaSettings, makeTeams, olympiaAllowed, olympiaOptions, resolvePicks,
  scoreDiscipline, smallestTeam, standingsOf,
} from '../sdk/olympia';
import { allGames, getGame, type LoadedGame } from './registry';
import { BOOT_ID, DEV, QUIET, TIME_SCALE } from './config';
import { getSecret, secretStatus, setSecret } from './secrets';
import { storeGet, storeSet } from './store';
import { deckStatus, drawnSet, markDrawn, refill, resetDeck, unmarkDrawn } from './decks';
import { updateStatus } from './update';
import { spieleStatus } from './spiele';
import { rememberRoom, rememberedRoom } from './roomstore';
import { joinBaseUrl } from './network';

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
  timers: Set<GameTimer>;
  finished: boolean;
  ranking: RankingEntry[] | null;
  memberIds: Set<string>;
  /** Pause: Zeitpunkt (echte Zeit), seit wann pausiert ist; null = läuft */
  pausedAt: number | null;
  /** wer pausiert hat: 'tv' oder die Spieler-ID */
  pausedBy: string | null;
  /** Summe aller bisherigen Pausen (ms) – die Spiel-Uhr läuft um so viel nach */
  shift: number;
}

/** Ein geplanter Aufruf eines Spiels (ctx.after, ctx.timer …) – lässt sich anhalten */
interface GameTimer {
  handle: ReturnType<typeof setTimeout> | null;
  /** fällig um (echte Zeit) */
  due: number;
  /** Restzeit während der Pause */
  left: number;
  fire: () => void;
}

/** Echte Uhr (Date.now wird während Spiel-Aufrufen durch die Spiel-Uhr ersetzt, siehe Room.safe) */
const realNow = Date.now.bind(Date);
let clockPatched = false;

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
  /** Abstimmung über das nächste Spiel (nur in der Lobby) */
  vote: GameVote | null = null;
  roll: { reel: string[]; at: number } | null = null;
  /** Olympia-Modus (null = aus) */
  olympia: OlympiaState | null = null;
  private olympiaTimer: ReturnType<typeof setTimeout> | null = null;
  private voteTimer: ReturnType<typeof setTimeout> | null = null;
  private lastPlayedId: string | null = null;
  usedContent = new Set<string>();
  lastActivity = Date.now();
  /** nach einem Neustart wiederhergestellt (alte Handys dürfen automatisch neu beitreten) */
  restored = false;
  private order = 0;
  private flushQueued = false;
  private lastHostSent = new WeakMap<WebSocket, string>();

  /** immer die aktuelle Adresse im WLAN (nicht die vom Start) */
  get joinUrl(): string {
    return joinBaseUrl();
  }

  constructor(code: string, lang: Lang, hostToken: string = randomUUID()) {
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
    this.olympiaAddPlayer(id);
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

  /** Host macht einen anderen (verbundenen, echten) Spieler zum VIP. */
  setVip(id: string) {
    const p = this.players.get(id);
    if (!p || p.info.isBot || !p.info.connected) return;
    this.vipId = id;
    this.touch();
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
    // Während Olympia niemanden entfernen – sonst fehlen Namen im Medaillenspiegel
    if (this.olympia && this.olympia.phase !== 'setup') return;
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
    // Wer selbst ein Spiel aussucht, schaltet zurück auf „VIP wählt“
    if (this.settings.pickMode && this.settings.pickMode !== 'vip') {
      this.settings.pickMode = 'vip';
      this.remember();
    }
    this.clearVote();
    this.roll = null;
    this.selectedGameId = id;
    this.touch();
  }

  /* ---------------- Nächstes Spiel: VIP, Abstimmung oder Zufall ---------------- */

  /** Spiele, die zur aktuellen Spielerzahl passen (sonst alle), ohne das zuletzt gespielte */
  private pickPool() {
    const n = this.eligible().length;
    const all = allGames().map((g) => g.manifest).filter((m) => !m.hidden || DEV);
    const fitting = all.filter((m) => n >= m.minPlayers && n <= m.maxPlayers);
    const pool = (fitting.length ? fitting : all).filter((m) => m.id !== this.lastPlayedId);
    return (pool.length ? pool : all).map((m) => m.id);
  }

  setPickMode(mode: string) {
    if (mode !== 'vip' && mode !== 'vote' && mode !== 'random') return;
    this.settings.pickMode = mode;
    this.remember();
    if (this.phase !== 'lobby') return this.touch();
    if (mode === 'vote') this.startVote();
    else if (mode === 'random') this.rollGame();
    else this.clearVote();
    this.touch();
  }

  private clearVote() {
    if (this.voteTimer) clearTimeout(this.voteTimer);
    this.voteTimer = null;
    this.vote = null;
  }

  /** Abstimmungs-Einstellungen ändern (startet eine laufende Abstimmung neu) */
  setVoteOptions(patch: { voteAll?: unknown; votesPerPlayer?: unknown }) {
    if (typeof patch.voteAll === 'boolean') this.settings.voteAll = patch.voteAll;
    if (patch.votesPerPlayer === 1 || patch.votesPerPlayer === 3) this.settings.votesPerPlayer = patch.votesPerPlayer;
    this.remember();
    if (this.phase === 'lobby' && this.settings.pickMode === 'vote') this.startVote();
    this.touch();
  }

  startVote() {
    if (this.phase !== 'lobby') return;
    this.clearVote();
    this.roll = null;
    const pool = this.settings.voteAll
      ? allGames().map((g) => g.manifest).filter((m) => !m.hidden || DEV).sort((a, b) => (a.name[this.lang] ?? a.name.en).localeCompare(b.name[this.lang] ?? b.name.en, this.lang)).map((m) => m.id)
      : shuffle(this.pickPool()).slice(0, 4);
    const maxVotes = Math.min(this.settings.votesPerPlayer === 3 ? 3 : 1, pool.length);
    const duration = this.settings.voteAll ? 60_000 : 45_000;
    this.vote = { candidates: pool, votes: {}, maxVotes, deadline: Date.now() + duration, duration, result: null };
    this.voteTimer = setTimeout(() => this.finishVote(), duration);
    // Bots stimmen zufällig ab (zum Testen)
    for (const p of this.players.values()) {
      if (!p.info.isBot) continue;
      for (const id of shuffle(pool).slice(0, maxVotes)) {
        setTimeout(() => this.castVote(p.info.id, id), 800 + Math.random() * 2500);
      }
    }
    this.touch();
  }

  /** Stimme an- oder abwählen. Sind alle Stimmen vergeben, ersetzt eine neue die älteste. */
  castVote(playerId: string, gameId: string) {
    const v = this.vote;
    if (!v || v.result || this.phase !== 'lobby' || !v.candidates.includes(gameId) || !this.players.has(playerId)) return;
    let mine = v.votes[playerId] ?? [];
    if (mine.includes(gameId)) mine = mine.filter((g) => g !== gameId);
    else {
      mine = [...mine, gameId];
      if (mine.length > v.maxVotes) mine = mine.slice(mine.length - v.maxVotes);
    }
    v.votes[playerId] = mine;
    // Alle (verbundenen) haben alle Stimmen vergeben → kurz danach auswerten
    const voters = [...this.players.values()].filter((p) => p.info.connected || p.info.isBot);
    if (voters.every((p) => (v.votes[p.info.id]?.length ?? 0) >= v.maxVotes)) {
      if (this.voteTimer) clearTimeout(this.voteTimer);
      v.deadline = Date.now() + 2500;
      this.voteTimer = setTimeout(() => this.finishVote(), 2500);
    }
    this.touch();
  }

  finishVote() {
    const v = this.vote;
    if (!v || v.result) return;
    if (this.voteTimer) clearTimeout(this.voteTimer);
    this.voteTimer = null;
    const counts = new Map<string, number>();
    for (const ids of Object.values(v.votes)) for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    const best = Math.max(0, ...counts.values());
    const top = v.candidates.filter((id) => (counts.get(id) ?? 0) === best);
    v.result = top[Math.floor(Math.random() * top.length)];
    v.deadline = Date.now();
    this.selectedGameId = v.result;
    this.touch();
  }

  rollGame() {
    if (this.phase !== 'lobby') return;
    this.clearVote();
    const pool = this.pickPool().filter((id) => id !== this.selectedGameId);
    const options = pool.length ? pool : this.pickPool();
    const picked = options[Math.floor(Math.random() * options.length)];
    const all = allGames().map((g) => g.manifest).filter((m) => !m.hidden || DEV).map((m) => m.id);
    const reel = Array.from({ length: 11 }, () => all[Math.floor(Math.random() * all.length)]);
    reel.push(picked);
    this.selectedGameId = picked;
    this.roll = { reel, at: Date.now() };
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
      id: m.id, loaded, server: null, hostView: null, timers: new Set(), finished: false, ranking: null, pausedAt: null, pausedBy: null, shift: 0,
      memberIds: new Set([...players, ...(m.audience ? rest : [])].map((p) => p.info.id)),
    };
    this.game = g;
    this.phase = 'game';
    this.notice = null;
    this.clearVote();
    this.roll = null;
    this.lastPlayedId = m.id;
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
    g.timers.forEach((t) => t.handle && clearTimeout(t.handle));
    g.timers.clear();
    try { g.server?.dispose?.(); } catch { /* egal */ }
    this.game = null;
  }

  /** Spiel beenden und alle zurück in die Lobby-Phase (ohne nächstes Spiel zu bestimmen) */
  private leaveGame() {
    this.stopGame();
    this.phase = 'lobby';
    for (const p of this.players.values()) {
      p.view = null;
      p.viewVersion++;
      p.info.role = 'player';
    }
    this.updateVip();
  }

  backToLobby() {
    // Bei Olympia: Disziplin abgebrochen → ohne Medaillen weiter zur Auswertung
    if (this.olympia?.phase === 'playing') return this.olympiaSkip();
    this.leaveGame();
    // Je nach Einstellung gleich das nächste Spiel bestimmen
    if (this.settings.pickMode === 'vote') this.startVote();
    else if (this.settings.pickMode === 'random') this.rollGame();
    this.touch();
  }

  /* ---------------- Olympia-Modus ---------------- */

  /** Einstellungen eines Spiels: bei Olympia gekürzt bzw. von Hand angepasst */
  optionsFor(m: GameManifest) {
    if (this.olympia?.phase === 'playing') return olympiaOptions(m, this.olympiaSettings(), this.settings.gameOptions[m.id]);
    return resolveOptions(m.options, this.settings.gameOptions[m.id]);
  }

  olympiaSettings(): OlympiaSettings {
    return cleanOlympiaSettings(this.settings.olympia);
  }

  private saveOlympiaSettings(next: OlympiaSettings) {
    this.settings.olympia = next;
    this.remember();
  }

  /** Spiele, die als Disziplin taugen und zur Spielerzahl passen */
  olympiaPool(): string[] {
    const n = this.eligible().length;
    return allGames().map((g) => g.manifest)
      .filter((m) => !m.hidden && olympiaAllowed(m) && n >= m.minPlayers && n <= m.maxPlayers)
      .map((m) => m.id);
  }

  /** Liste auf die gewünschte Anzahl bringen (fehlende per Zufall auffüllen) */
  private fillOlympiaList(cur: OlympiaSettings, count: number): string[] {
    const pool = this.olympiaPool();
    const list = cur.list.filter((id) => getGame(id) && olympiaAllowed(getGame(id)!.manifest)).slice(0, count);
    for (const id of shuffle(pool.filter((g) => !list.includes(g)))) {
      if (list.length >= count) break;
      list.push(id);
    }
    return list;
  }

  private emptyOlympia(): OlympiaState {
    const cur = this.olympiaSettings();
    return {
      phase: 'setup', deadline: 0, duration: 0, scoring: cur.scoring, disciplines: [], current: 0, teams: null, teamMode: cur.teamMode,
      picks: {}, pickMode: cur.pick, pickPool: [], entrants: [], standings: [],
    };
  }

  /** Olympia-Übersicht in der Lobby öffnen */
  openOlympia() {
    if (this.phase !== 'lobby' || this.olympia) return;
    this.clearVote();
    this.roll = null;
    const cur = this.olympiaSettings();
    if ((cur.pick === 'vip' || cur.pick === 'random') && cur.list.length < OLYMPIA_MIN) {
      this.saveOlympiaSettings({ ...cur, list: this.fillOlympiaList(cur, cur.count) });
    }
    this.olympia = this.emptyOlympia();
    this.touch();
  }

  /** Olympia verlassen (Übersicht schließen oder nach der Siegerehrung) */
  closeOlympia() {
    if (!this.olympia) return;
    if (this.olympia.phase !== 'setup' && this.olympia.phase !== 'ceremony') return;
    this.clearOlympiaTimer();
    this.olympia = null;
    if (this.phase === 'game') this.leaveGame();
    if (this.settings.pickMode === 'vote') this.startVote();
    else if (this.settings.pickMode === 'random') this.rollGame();
    this.touch();
  }

  /** Einstellungen in der Übersicht ändern */
  setOlympia(patch: Record<string, unknown>) {
    if (this.olympia?.phase !== 'setup') return;
    const cur = this.olympiaSettings();
    const next = cleanOlympiaSettings({ ...cur, ...patch, list: cur.list, options: cur.options });
    if (next.pick === 'vip' || next.pick === 'random') {
      // Anzahl geändert oder Liste zu kurz: auffüllen bzw. kürzen
      if (patch.count !== undefined || next.list.length < OLYMPIA_MIN) next.list = this.fillOlympiaList(next, next.count);
      if (patch.count === undefined) next.count = Math.max(OLYMPIA_MIN, Math.min(OLYMPIA_MAX, next.list.length));
    }
    this.saveOlympiaSettings(next);
    this.olympia = { ...this.olympia, scoring: next.scoring, teamMode: next.teamMode, pickMode: next.pick };
    this.touch();
  }

  /** Disziplin hinzufügen (VIP stellt zusammen) */
  olympiaAdd(gameId: string) {
    if (this.olympia?.phase !== 'setup') return;
    const cur = this.olympiaSettings();
    const m = getGame(gameId)?.manifest;
    if (!m || !olympiaAllowed(m) || cur.list.includes(gameId) || cur.list.length >= OLYMPIA_MAX) return;
    const list = [...cur.list, gameId];
    this.saveOlympiaSettings({ ...cur, list, count: Math.max(OLYMPIA_MIN, list.length), pick: cur.pick === 'random' ? 'vip' : cur.pick });
    this.olympia = { ...this.olympia, pickMode: this.olympiaSettings().pick };
    this.touch();
  }

  olympiaRemove(gameId: string) {
    if (this.olympia?.phase !== 'setup') return;
    const cur = this.olympiaSettings();
    const list = cur.list.filter((g) => g !== gameId);
    this.saveOlympiaSettings({ ...cur, list, count: Math.max(OLYMPIA_MIN, list.length) });
    this.touch();
  }

  /** Disziplin nach oben/unten schieben */
  olympiaMove(gameId: string, dir: number) {
    if (this.olympia?.phase !== 'setup') return;
    const cur = this.olympiaSettings();
    const i = cur.list.indexOf(gameId);
    const j = i + (dir < 0 ? -1 : 1);
    if (i < 0 || j < 0 || j >= cur.list.length) return;
    const list = [...cur.list];
    [list[i], list[j]] = [list[j], list[i]];
    this.saveOlympiaSettings({ ...cur, list });
    this.touch();
  }

  /** Zufall: neue Disziplinen ziehen */
  olympiaReroll() {
    if (this.olympia?.phase !== 'setup') return;
    const cur = this.olympiaSettings();
    this.saveOlympiaSettings({ ...cur, list: this.fillOlympiaList({ ...cur, list: [] }, cur.count) });
    this.touch();
  }

  /** Spiel-Einstellung nur für Olympia ändern */
  olympiaOption(gameId: string, id: string, value: unknown) {
    if (this.olympia?.phase !== 'setup') return;
    const m = getGame(gameId)?.manifest;
    if (!m?.options?.some((o) => o.id === id) || (typeof value !== 'number' && typeof value !== 'string')) return;
    const cur = this.olympiaSettings();
    this.saveOlympiaSettings({ ...cur, options: { ...cur.options, [gameId]: { ...cur.options[gameId], [id]: value } } });
    this.touch();
  }

  /** Spiel-Einstellungen für Olympia zurücksetzen */
  olympiaOptionReset(gameId: string) {
    if (this.olympia?.phase !== 'setup') return;
    const cur = this.olympiaSettings();
    const options = { ...cur.options };
    delete options[gameId];
    this.saveOlympiaSettings({ ...cur, options });
    this.touch();
  }

  private clearOlympiaTimer() {
    if (this.olympiaTimer) clearTimeout(this.olympiaTimer);
    this.olympiaTimer = null;
  }

  /** Phase setzen; seconds = 0 heißt: wartet auf VIP/TV */
  private olympiaPhase(phase: OlympiaState['phase'], seconds: number, onEnd?: () => void) {
    const o = this.olympia;
    if (!o) return;
    this.clearOlympiaTimer();
    const ms = seconds * 1000 * TIME_SCALE;
    o.phase = phase;
    o.duration = seconds ? ms : 0;
    o.deadline = seconds ? Date.now() + ms : 0;
    if (seconds && onEnd) this.olympiaTimer = setTimeout(() => { this.olympiaTimer = null; onEnd(); }, ms);
    this.touch();
  }

  /** Olympia starten: Teams → Spielewahl → Eröffnung → Disziplinen */
  startOlympia(): string | null {
    const o = this.olympia;
    if (!o || o.phase !== 'setup' || this.phase !== 'lobby') return 'no_game';
    const cur = this.olympiaSettings();
    const ids = this.eligible().map((p) => p.info.id);
    if (ids.length < 2 || (cur.teams && ids.length < cur.teams)) return 'not_enough_players';
    if ((cur.pick === 'vip' || cur.pick === 'random') && cur.list.length < 1) return 'no_game';
    if ((cur.pick === 'secret' || cur.pick === 'open') && !this.olympiaPool().length) return 'no_game';
    this.clearVote();
    this.roll = null;
    Object.assign(o, {
      scoring: cur.scoring, teamMode: cur.teamMode, pickMode: cur.pick, disciplines: [], current: 0, picks: {}, pickPool: [],
      teams: null, entrants: ids, standings: [],
    });
    if (cur.teams) {
      o.teams = makeTeams(cur.teamMode === 'free' ? [] : ids, cur.teams, shuffle);
      o.entrants = o.teams.map((t) => t.id);
      const seconds = { switch: 15, random: 6, free: 25, vip: 0 }[cur.teamMode];
      this.olympiaPhase('teams', seconds, () => this.finishTeams());
    } else {
      this.olympiaAfterTeams();
    }
    this.updateStandings();
    return null;
  }

  /** Teamwahl: Spieler wechselt (Zufall + wechseln, freie Wahl) */
  olympiaJoinTeam(playerId: string, teamId: string) {
    const o = this.olympia;
    if (o?.phase !== 'teams' || !o.teams || (o.teamMode !== 'switch' && o.teamMode !== 'free')) return;
    const target = o.teams.find((t) => t.id === teamId);
    const source = o.teams.find((t) => t.members.includes(playerId));
    if (!target || target === source || !this.players.has(playerId)) return;
    // Zufall + wechseln: nur in ein Team, das nicht größer ist als das eigene
    if (o.teamMode === 'switch' && source && target.members.length > source.members.length) return;
    if (source) source.members = source.members.filter((m) => m !== playerId);
    target.members.push(playerId);
    this.touch();
  }

  /** VIP teilt ein: Spieler in ein Team schieben */
  olympiaAssign(playerId: string, teamId: string) {
    const o = this.olympia;
    if (o?.phase !== 'teams' || !o.teams || o.teamMode !== 'vip') return;
    const target = o.teams.find((t) => t.id === teamId);
    if (!target || !this.players.has(playerId)) return;
    for (const t of o.teams) t.members = t.members.filter((m) => m !== playerId);
    target.members.push(playerId);
    this.touch();
  }

  /** Teamwahl beenden (Zeit um oder VIP „Fertig“) */
  finishTeams() {
    const o = this.olympia;
    if (o?.phase !== 'teams' || !o.teams) return;
    const all = this.eligible().map((p) => p.info.id);
    for (const id of shuffle(all.filter((id) => !o.teams!.some((t) => t.members.includes(id))))) smallestTeam(o.teams).members.push(id);
    o.teams = o.teams.filter((t) => t.members.length > 0);
    o.entrants = o.teams.map((t) => t.id);
    this.updateStandings();
    this.olympiaAfterTeams();
  }

  private olympiaAfterTeams() {
    const o = this.olympia!;
    const cur = this.olympiaSettings();
    if (cur.pick === 'secret' || cur.pick === 'open') {
      o.picks = {};
      o.pickPool = this.olympiaPool();
      this.olympiaPhase('pick', 45, () => this.finishPicks());
      for (const p of this.players.values()) {
        if (!p.info.isBot) continue;
        setTimeout(() => this.olympiaPickGame(p.info.id, o.pickPool[Math.floor(Math.random() * o.pickPool.length)]), (800 + Math.random() * 2500) * TIME_SCALE);
      }
    } else {
      const fitting = this.olympiaPool();
      const list = cur.pick === 'random' && !cur.list.length ? this.fillOlympiaList(cur, cur.count) : cur.list;
      this.beginDisciplines(list.filter((id) => fitting.includes(id)).length ? list.filter((id) => fitting.includes(id)) : list);
    }
  }

  /** „Jeder wählt“: Spieler tippt ein Spiel an (erneut tippen = ändern) */
  olympiaPickGame(playerId: string, gameId: string) {
    const o = this.olympia;
    if (o?.phase !== 'pick' || !o.pickPool.includes(gameId) || !this.players.has(playerId)) return;
    o.picks[playerId] = gameId;
    const voters = this.eligible();
    if (voters.every((p) => o.picks[p.info.id])) this.olympiaPhase('pick', 2.5, () => this.finishPicks());
    else this.touch();
  }

  finishPicks() {
    const o = this.olympia;
    if (o?.phase !== 'pick') return;
    const cur = this.olympiaSettings();
    this.beginDisciplines(resolvePicks(Object.values(o.picks), cur.count, o.pickPool));
  }

  private beginDisciplines(list: string[]) {
    const o = this.olympia!;
    o.disciplines = list.map((gameId) => ({ gameId, status: 'next', results: [], playerPlaces: {} }));
    o.current = 0;
    if (!o.disciplines.length) return this.olympiaCeremony();
    this.olympiaPhase('opening', 8, () => this.startDiscipline(0));
  }

  private startDiscipline(i: number): void {
    const o = this.olympia;
    if (!o) return;
    const d = o.disciplines[i];
    if (!d) return this.olympiaCeremony();
    o.current = i;
    d.status = 'now';
    this.clearOlympiaTimer();
    o.phase = 'playing';
    o.deadline = 0;
    o.duration = 0;
    this.selectedGameId = d.gameId;
    const error = this.startGame();
    if (error) {
      // Spiel passt gerade nicht (z. B. zu wenige Spieler): überspringen
      d.status = 'skipped';
      this.leaveGame();
      if (i + 1 < o.disciplines.length) return this.startDiscipline(i + 1);
      return this.olympiaCeremony();
    }
    this.touch();
  }

  /** Ein Spiel hat seine Rangliste gemeldet */
  olympiaGameFinished(gameId: string, ranking: RankingEntry[]) {
    const o = this.olympia;
    const d = o?.disciplines[o.current];
    if (!o || o.phase !== 'playing' || !d || d.gameId !== gameId || d.status !== 'now') return;
    const { results, playerPlaces } = scoreDiscipline(ranking, o.entrants, o.teams, o.scoring);
    d.results = results;
    d.playerPlaces = playerPlaces;
    d.status = 'done';
    this.updateStandings();
    // Kurz das Endergebnis des Spiels zeigen, dann Medaillen
    this.clearOlympiaTimer();
    o.deadline = Date.now() + 6000 * TIME_SCALE;
    o.duration = 6000 * TIME_SCALE;
    this.olympiaTimer = setTimeout(() => { this.olympiaTimer = null; this.olympiaMedals(); }, 6000 * TIME_SCALE);
  }

  /** Disziplin abgebrochen (Spiel beendet oder abgestürzt): ohne Medaillen weiter */
  olympiaSkip() {
    const o = this.olympia;
    if (!o || o.phase !== 'playing') return;
    const d = o.disciplines[o.current];
    if (d && d.status === 'now') d.status = 'skipped';
    this.olympiaMedals();
  }

  private olympiaMedals() {
    const o = this.olympia;
    if (!o) return;
    if (this.phase === 'game') this.leaveGame();
    this.olympiaPhase('medals', 10, () => this.olympiaNext());
  }

  /** Weiter zur nächsten Disziplin bzw. zur Siegerehrung */
  olympiaNext() {
    const o = this.olympia;
    if (!o) return;
    if (o.phase === 'opening') return this.startDiscipline(0);
    if (o.phase === 'teams') return this.finishTeams();
    if (o.phase === 'pick') return this.finishPicks();
    if (o.phase !== 'medals') return;
    const next = o.disciplines.findIndex((d, i) => i > o.current && d.status === 'next');
    if (next >= 0) this.startDiscipline(next);
    else this.olympiaCeremony();
  }

  /** Olympia vorzeitig beenden → Siegerehrung mit dem bisherigen Stand */
  endOlympia() {
    const o = this.olympia;
    if (!o || o.phase === 'setup' || o.phase === 'ceremony') return;
    if (o.phase === 'playing') {
      const d = o.disciplines[o.current];
      if (d?.status === 'now') d.status = 'skipped';
      this.leaveGame();
    }
    if (!o.disciplines.some((d) => d.status === 'done')) {
      // Noch nichts gespielt: zurück zur Übersicht
      this.clearOlympiaTimer();
      this.olympia = this.emptyOlympia();
      return this.touch();
    }
    this.olympiaCeremony();
  }

  private olympiaCeremony() {
    if (this.phase === 'game') this.leaveGame();
    this.updateStandings();
    this.olympiaPhase('ceremony', 0);
  }

  /** Spieler kommt während Olympia dazu */
  private olympiaAddPlayer(id: string) {
    const o = this.olympia;
    if (!o || o.phase === 'setup' || o.phase === 'ceremony') return;
    if (o.teams) {
      if (o.phase === 'teams' && o.teamMode === 'free') return; // wählt selbst
      if (!o.teams.some((t) => t.members.includes(id))) smallestTeam(o.teams).members.push(id);
    } else if (!o.entrants.includes(id)) {
      o.entrants.push(id);
    }
    this.updateStandings();
  }

  private updateStandings() {
    const o = this.olympia;
    if (!o) return;
    o.standings = standingsOf(o.disciplines, o.entrants, o.scoring);
  }

  /** Geheime Einstellung wurde vom Host geändert → laufendes Spiel informieren */
  secretChanged(gameId: string, id: string) {
    const g = this.game;
    if (g?.id === gameId && g.server?.onSecretChanged) this.safe(() => g.server?.onSecretChanged?.(id));
    this.touch();
  }

  action(playerId: string, action: unknown) {
    const g = this.game;
    if (!g || !g.server || !g.memberIds.has(playerId) || g.pausedAt !== null) return;
    this.safe(() => g.server?.onAction(playerId, action));
  }

  /** Spiel anhalten oder fortsetzen (VIP oder TV). Geplante Abläufe des Spiels warten, die Spiel-Uhr steht. */
  setPaused(paused: boolean, by: string) {
    const g = this.game;
    if (!g || g.finished) return;
    const now = realNow();
    if (paused && g.pausedAt === null) {
      g.pausedAt = now;
      g.pausedBy = by;
      for (const t of g.timers) {
        if (t.handle) clearTimeout(t.handle);
        t.handle = null;
        t.left = Math.max(0, t.due - now);
      }
    } else if (!paused && g.pausedAt !== null) {
      g.shift += now - g.pausedAt;
      g.pausedAt = null;
      g.pausedBy = null;
      for (const t of g.timers) {
        t.due = now + t.left;
        t.handle = setTimeout(t.fire, t.left);
      }
    } else return;
    this.touch();
  }

  private safe(fn: () => void): boolean {
    // Während eines Spiel-Aufrufs zeigt Date.now die Spiel-Uhr: Pausen zählen nicht mit
    const g = this.game;
    const patch = !!g && g.shift + (g.pausedAt !== null ? 1 : 0) > 0 && !clockPatched;
    if (patch) {
      const game = g!;
      clockPatched = true;
      Date.now = () => (game.pausedAt ?? realNow()) - game.shift;
    }
    try {
      fn();
      return true;
    } catch (e) {
      console.error(`[UP!] Fehler im Spiel "${this.game?.id}":`, e);
      this.notice = `game_error`;
      this.backToLobby();
      return false;
    } finally {
      if (patch) {
        Date.now = realNow;
        clockPatched = false;
      }
    }
  }

  private createContext(g: RunningGame, players: PlayerInfo[]): GameContext {
    const room = this;
    const alive = () => room.game === g;
    const schedule = (ms: number, fn: () => void): GameTimer => {
      const timer: GameTimer = { handle: null, due: realNow() + ms, left: ms, fire: () => {} };
      timer.fire = () => {
        timer.handle = null;
        g.timers.delete(timer);
        if (alive()) room.safe(fn);
      };
      g.timers.add(timer);
      if (g.pausedAt === null) timer.handle = setTimeout(timer.fire, ms);
      return timer;
    };
    const cancel = (timer: GameTimer) => {
      if (timer.handle) clearTimeout(timer.handle);
      g.timers.delete(timer);
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
      options: room.optionsFor(g.loaded.manifest),
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
      store: {
        get: <T,>(key: string) => storeGet<T>(g.id, key),
        set: (key: string, value: unknown) => storeSet(g.id, key, value),
      },
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
          cancel: () => cancel(t),
        };
      },
      timerAt(deadline, onEnd, opts): TimerHandle {
        const ms = Math.max(0, deadline - Date.now());
        const t = schedule(ms + (opts?.grace ?? 0) * 1000 * TIME_SCALE, onEnd);
        return {
          deadline: Date.now() + ms,
          duration: ms,
          cancel: () => cancel(t),
        };
      },
      after(seconds, fn) {
        schedule(seconds * 1000 * TIME_SCALE, fn);
      },
      clearTimers() {
        g.timers.forEach((t) => t.handle && clearTimeout(t.handle));
        g.timers.clear();
      },
      finish(ranking) {
        if (!alive()) return;
        g.finished = true;
        g.ranking = ranking;
        room.results.push({ gameId: g.id, ranking });
        room.olympiaGameFinished(g.id, ranking);
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
      vote: this.vote,
      roll: this.roll,
      olympia: this.olympia,
      pause: this.game && this.game.pausedAt !== null ? { at: this.game.pausedAt, shift: this.game.shift, by: this.game.pausedBy } : null,
      clockShift: this.game ? this.game.shift : 0,
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
      spiele: spieleStatus(),
      boot: BOOT_ID,
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

export function createRoom(lang: Lang): Room {
  let code = '';
  do {
    code = Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
  } while (rooms.has(code));
  const room = new Room(code, lang);
  rooms.set(code, room);
  room.remember();
  return room;
}

/**
 * Nach einem Neustart: Der Fernseher meldet sich mit seinem alten Code und Schlüssel –
 * dann gibt es den Raum mit genau diesem Code wieder (Einstellungen inklusive).
 */
export function restoreRoom(code: unknown, token: unknown): Room | undefined {
  if (typeof code !== 'string' || typeof token !== 'string') return undefined;
  const c = code.toUpperCase().trim();
  if (!/^[BCDFGHJKLMNPQRSTVWXZ]{4}$/.test(c) || rooms.has(c) || token.length < 8 || token.length > 64) return undefined;
  const saved = rememberedRoom(c);
  if (saved && saved.token !== token) return undefined;
  const room = new Room(c, saved?.lang === 'en' ? 'en' : 'de', token);
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
