/** Verbindung zum UP!-Server (WebSocket) mit automatischem Wiederverbinden. */

import { useSyncExternalStore } from 'react';
import type { GameManifest, PlayerInfo, RoomSnapshot } from '@up/sdk';

export interface PackInfo {
  key: string;
  game: string;
  lang: string;
  id: string;
  name: string;
  count: number;
  error?: string;
}

export interface HostData {
  games: (GameManifest & { warning?: string; secretsSet?: Record<string, boolean> })[];
  packs: PackInfo[];
  /** Kartenstapel je Spiel (Raumsprache) */
  decks?: { game: string; total: number; left: number }[];
  notice: string | null;
  results: { gameId: string; ranking: { playerId: string; score: number }[] }[];
  update?: { state: string; current: string; latest?: string; notes?: string[]; error?: string; git?: boolean };
  view: any;
}

export interface NetState {
  status: 'connecting' | 'open' | 'closed';
  role?: 'host' | 'player';
  room?: RoomSnapshot;
  me?: PlayerInfo;
  view?: any;
  viewVersion?: number;
  host?: HostData;
  /** Serverzeit minus lokale Zeit */
  offset: number;
  kicked?: boolean;
}

type Listener = () => void;

class Net {
  state: NetState = { status: 'connecting', offset: 0 };
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private pending = new Map<number, (msg: any) => void>();
  private nextId = 1;
  private retry = 0;
  private started = false;
  private serverVersion: string | null = null;
  /** wird nach jedem (Wieder-)Verbinden aufgerufen */
  onOpen: (() => void) | null = null;
  /** Live-Daten eines Spiels (ctx.stream) – getrennt vom normalen Zustand, damit nicht alles neu rendert */
  streamData: unknown = null;
  private streamListeners = new Set<() => void>();
  subscribeStream = (l: () => void) => {
    this.streamListeners.add(l);
    return () => this.streamListeners.delete(l);
  };
  getStream = () => this.streamData;

  start() {
    if (this.started) return;
    this.started = true;
    this.connect();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && (!this.ws || this.ws.readyState > 1)) this.connect();
    });
  }

  private connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;
    this.set({ status: 'connecting' });
    ws.onopen = async () => {
      this.retry = 0;
      // Nach einem Update läuft auf dem Server eine neue Version → Seite neu laden, um die neue App zu bekommen
      try {
        const info = await (await fetch('/api/info', { cache: 'no-store' })).json();
        if (this.serverVersion && info.version && info.version !== this.serverVersion) return location.reload();
        this.serverVersion = info.version ?? this.serverVersion;
      } catch { /* egal */ }
      this.set({ status: 'open' });
      this.syncClock();
      this.onOpen?.();
    };
    ws.onmessage = (ev) => this.receive(JSON.parse(ev.data));
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.set({ status: 'closed' });
      this.pending.forEach((cb) => cb({ ok: false, error: 'disconnected' }));
      this.pending.clear();
      const delay = Math.min(5000, 400 * 2 ** this.retry++);
      setTimeout(() => this.connect(), delay);
    };
  }

  private async syncClock() {
    const t0 = Date.now();
    const res = await this.request('ping');
    if (res?.now) this.set({ offset: res.now - (t0 + Date.now()) / 2 });
  }

  private receive(msg: any) {
    switch (msg.t) {
      case 'reply': {
        const cb = this.pending.get(msg.re);
        this.pending.delete(msg.re);
        cb?.(msg);
        return;
      }
      case 'state': {
        const { t, now, ...rest } = msg;
        this.set(rest);
        return;
      }
      case 'stream':
        this.streamData = msg.d;
        this.streamListeners.forEach((l) => l());
        return;
      case 'reload':
        location.reload();
        return;
      case 'kicked':
        this.set({ kicked: true });
        return;
    }
  }

  send(t: string, payload: object = {}) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ t, ...payload }));
  }

  request(t: string, payload: object = {}): Promise<any> {
    return new Promise((resolve) => {
      if (this.ws?.readyState !== 1) return resolve({ ok: false, error: 'disconnected' });
      const id = this.nextId++;
      this.pending.set(id, resolve);
      this.ws.send(JSON.stringify({ t, id, ...payload }));
      setTimeout(() => {
        if (this.pending.delete(id)) resolve({ ok: false, error: 'timeout' });
      }, 10_000);
    });
  }

  set(patch: Partial<NetState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  reset() {
    this.set({ role: undefined, room: undefined, me: undefined, view: undefined, host: undefined });
  }

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  getState = () => this.state;
}

export const net = new Net();

export function useNet(): NetState {
  return useSyncExternalStore(net.subscribe, net.getState);
}

/** Live-Daten vom Spiel-Server (ctx.stream), z. B. Positionen in Echtzeit-Spielen */
export function useStream<T = any>(): T | null {
  return useSyncExternalStore(net.subscribeStream, net.getStream) as T | null;
}

/** Gespeicherte Sitzung (pro Tab-„Slot“, damit der Entwicklermodus mehrere Handys simulieren kann). */
export function storageKey(kind: 'host' | 'player') {
  const slot = new URLSearchParams(location.search).get('slot');
  return slot ? `up:${kind}:${slot}` : `up:${kind}`;
}

export function loadSession(kind: 'host' | 'player'): { code: string; token: string } | null {
  try {
    const raw = (new URLSearchParams(location.search).get('slot') ? sessionStorage : localStorage).getItem(storageKey(kind));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSession(kind: 'host' | 'player', data: { code: string; token: string } | null) {
  try {
    const store = new URLSearchParams(location.search).get('slot') ? sessionStorage : localStorage;
    if (data) store.setItem(storageKey(kind), JSON.stringify(data));
    else store.removeItem(storageKey(kind));
  } catch {
    /* privater Modus */
  }
}
