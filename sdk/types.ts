/**
 * UP! Game-SDK – gemeinsame Typen für Plattform und Spiele.
 *
 * Ein Spiel besteht aus:
 *   games/<id>/manifest.json   – Beschreibung (GameManifest)
 *   games/<id>/server.ts       – Spiellogik (default export: GameServerModule)
 *   games/<id>/client.tsx      – Ansichten für TV und Handy (default export: GameClientModule)
 *   games/<id>/i18n/<lang>.json
 *   games/<id>/content/<lang>/<pack>.json
 *
 * Ausführliche Anleitung: docs/SPIELE-ENTWICKELN.md
 */

export const SDK_VERSION = 1;

export type Lang = 'de' | 'en';
export const LANGS: Lang[] = ['de', 'en'];

/** Tier-Avatare – alle gefährdet oder vom Aussterben bedroht. */
export const ANIMALS = [
  'panda', 'tiger', 'roterpanda', 'axolotl', 'schneeleopard', 'nashorn', 'orangutan', 'schildkroete',
] as const;
export type Animal = (typeof ANIMALS)[number];

export type Avatar =
  | { kind: 'animal'; animal: Animal }
  | { kind: 'photo'; version: number };

export interface PlayerInfo {
  id: string;
  name: string;
  avatar: Avatar;
  /** Spielerfarbe (Hex), vom Server vergeben */
  color: string;
  role: 'player' | 'audience';
  connected: boolean;
  isBot: boolean;
}

export interface GameManifest {
  id: string;
  name: Record<string, string>;
  description: Record<string, string>;
  minPlayers: number;
  maxPlayers: number;
  /** Darf überzähliges Publikum mitmachen? */
  audience: boolean;
  /** ungefähre Dauer in Minuten */
  minutes: number;
  /** Akzentfarbe des Spiels */
  color: string;
  /** SDK-Version, für die das Spiel gebaut ist */
  sdkVersion: number;
  /** Pflichtfelder (Strings) jedes Content-Eintrags, z. B. ["prompt"] */
  contentFields?: string[];
  /** false = keine automatischen Plattform-Sounds (Timer-Ticken, Übergänge, Jubel); das Spiel spielt selbst Sounds ab */
  autoSounds?: boolean;
  /** Kategorien für das Spielmenü: words, draw, guess, deceive, social, quick (andere landen unter „Weitere“) */
  tags?: string[];
  /** Nur im Entwicklermodus anzeigen (z. B. Vorlagen) */
  hidden?: boolean;
  version?: string;
  author?: string;
  /** Geheime Einstellungen, die der Host einträgt (z. B. API-Schlüssel) */
  secrets?: GameSecret[];
  /** Spiel-Einstellungen, die in der Lobby gewählt werden (Rundenanzahl usw.) */
  options?: GameOption[];
}

/** Eine Spiel-Einstellung. Werte sind Zahlen oder Texte; `choices` macht daraus eine Auswahl. */
export interface GameOption {
  id: string;
  label: Record<string, string>;
  help?: Record<string, string>;
  default: number | string;
  /** Auswahl-Liste (sonst Zahl mit min/max/step) */
  choices?: { value: number | string; label: Record<string, string> }[];
  min?: number;
  max?: number;
  step?: number;
}

export type GameOptionValues = Record<string, number | string>;

/** Liefert gültige Werte: Standardwerte + erlaubte Änderungen */
export function resolveOptions(defs: GameOption[] | undefined, values: Record<string, unknown> | undefined): GameOptionValues {
  const out: GameOptionValues = {};
  for (const d of defs ?? []) {
    const v = values?.[d.id];
    if (d.choices) {
      out[d.id] = d.choices.some((c) => c.value === v) ? (v as number | string) : d.default;
    } else if (typeof v === 'number' && Number.isFinite(v)) {
      const step = d.step ?? 1;
      const clamped = Math.min(d.max ?? Infinity, Math.max(d.min ?? -Infinity, v));
      out[d.id] = Math.round(clamped / step) * step;
    } else out[d.id] = d.default;
  }
  return out;
}

export interface GameSecret {
  id: string;
  label: Record<string, string>;
  help?: Record<string, string>;
  /** Link zu einer Anleitung */
  url?: string;
}

export interface ContentItem {
  id?: string;
  tags?: string[];
  [field: string]: unknown;
}

export interface ContentPack {
  id: string;
  name: string;
  game: string;
  lang: Lang;
  author?: string;
  version?: string;
  description?: string;
  items: ContentItem[];
}

export interface RankingEntry {
  playerId: string;
  score: number;
}

export interface TimerHandle {
  /** Zeitpunkt (ms seit 1970, Serverzeit), wann der Timer abläuft – gehört in die Views */
  deadline: number;
  /** Gesamtdauer in ms (für Fortschrittsbalken) */
  duration: number;
  cancel(): void;
}

/** Das bekommt jedes Spiel vom Server. */
export interface GameContext {
  readonly lang: Lang;
  /** Gewählte Spiel-Einstellungen (siehe manifest.options), immer mit gültigen Werten */
  readonly options: GameOptionValues;
  /** Mitspieler (Rolle "player") beim Start des Spiels */
  readonly players: PlayerInfo[];
  /** Aktuelles Publikum (kann sich während des Spiels ändern) */
  audience(): PlayerInfo[];
  /** Aktuelle Daten eines Spielers (Name, Avatar, Verbindung) */
  player(id: string): PlayerInfo | undefined;
  /** Alle aktivierten Content-Einträge dieses Spiels in der Raumsprache, gemischt */
  content<T extends ContentItem = ContentItem>(): T[];

  /** Ansicht für den großen Bildschirm setzen */
  setHostView(view: object): void;
  /** Ansicht für ein einzelnes Handy setzen */
  setPlayerView(playerId: string, view: object): void;
  /** Ansicht für alle Spieler-Handys setzen (Funktion pro Spieler) */
  setAllPlayerViews(fn: (player: PlayerInfo) => object): void;
  /** Ansicht für alle Publikums-Handys setzen */
  setAudienceView(view: object | ((audience: PlayerInfo) => object)): void;

  /** Countdown starten. Sekunden werden im Testmodus automatisch verkürzt. */
  timer(seconds: number, onEnd: () => void): TimerHandle;
  /** Countdown bis zu einem festen Zeitpunkt (ms, Serverzeit) – z. B. um einen Timer zu verlängern */
  timerAt(deadline: number, onEnd: () => void): TimerHandle;
  /** Kurze Pause (z. B. für Animationen), dann fn ausführen */
  after(seconds: number, fn: () => void): void;
  /** Alle laufenden Timer abbrechen */
  clearTimers(): void;

  /** Spiel ist fertig: Rangliste melden (wird für den Olympia-Modus genutzt). */
  finish(ranking: RankingEntry[]): void;

  /** Geheime Einstellung lesen (siehe manifest.secrets) – nur auf dem Server */
  secret(id: string): string | undefined;
  /** Geheime Einstellung speichern (z. B. wenn Spieler den Schlüssel im Spiel eingeben) */
  setSecret(id: string, value: string): void;

  log(...args: unknown[]): void;
}

/** Was die Plattform von einem Spiel erwartet. */
export interface GameServer {
  start(): void;
  /** Eingabe eines Spielers oder Publikums-Mitglieds */
  onAction(playerId: string, action: any): void;
  /** Spieler ist wieder verbunden (Ansicht wird automatisch erneut gesendet) */
  onPlayerRejoin?(playerId: string): void;
  /** Neues Publikum ist dazugekommen */
  onAudienceJoin?(playerId: string): void;
  /** Eine geheime Einstellung dieses Spiels wurde geändert (z. B. API-Schlüssel eingetragen) */
  onSecretChanged?(id: string): void;
  /**
   * Für Testspieler (Bots): Welche Aktion würde ein Bot bei dieser Ansicht ausführen?
   * null = nichts tun.
   */
  bot?(playerId: string, view: any): any | null;
  dispose?(): void;
}

export interface GameServerModule {
  create(ctx: GameContext): GameServer;
}

/* ---------- Client-Seite ---------- */

export interface RoomSnapshot {
  code: string;
  lang: Lang;
  players: PlayerInfo[];
  vipId: string | null;
  phase: 'lobby' | 'game';
  gameId: string | null;
  selectedGameId: string | null;
  finished: boolean;
  settings: RoomSettings;
  joinUrl: string;
  dev: boolean;
}

export interface RoomSettings {
  allowPhotos: boolean;
  /** deaktivierte Content-Packs: "<game>/<lang>/<pack>" */
  disabledPacks: string[];
  /** Zeitfaktor für Timer (1 = normal, 1.5 = mehr Zeit) */
  timeFactor: number;
  /** Spiel-Einstellungen pro Spiel (gameId → Werte) */
  gameOptions: Record<string, GameOptionValues>;
}

export interface HostViewProps<V = any> {
  view: V;
  room: RoomSnapshot;
  t: Translate;
  /** Spielerinfos per id nachschlagen */
  player: (id: string) => PlayerInfo | undefined;
  /** Geheime Einstellung des Spiels direkt vom TV aus speichern (z. B. API-Schlüssel) */
  setSecret: (id: string, value: string) => Promise<boolean>;
}

export interface ControllerViewProps<V = any> {
  view: V;
  room: RoomSnapshot;
  me: PlayerInfo;
  t: Translate;
  send: (action: any) => void;
  player: (id: string) => PlayerInfo | undefined;
}

export type Translate = (key: string, vars?: Record<string, string | number>) => string;

export interface GameClientModule {
  Host: (props: HostViewProps) => any;
  Controller: (props: ControllerViewProps) => any;
}
