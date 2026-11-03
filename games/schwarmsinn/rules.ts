/**
 * Schwarmsinn – Spielregeln. Werden vom Server (echtes Spiel) und vom Generator (Lösbarkeits-Prüfung) genutzt.
 *
 * Karte: Raster aus Zeichen
 *   ' ' nichts   '#' Wand   '.' Boden   'I' Eis   'L' Lava   'u' 'r' 'd' 'l' Einbahnfeld (nur in Pfeilrichtung betretbar)
 * Türen, Platten, Teleporter, Powerups, Chaos-Felder, Starts und Ausgänge liegen als Objekte auf Bodenfeldern.
 */

export type Dir = 'up' | 'right' | 'down' | 'left';
export const DIRS: Dir[] = ['up', 'right', 'down', 'left'];
export const DV: Record<Dir, [number, number]> = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };
const ONE_WAY: Record<string, Dir> = { u: 'up', r: 'right', d: 'down', l: 'left' };

/** Figuren: 0 Rot (Kreis), 1 Blau (Quadrat), 2 Gelb (Dreieck), 3 Grün (Raute) */
export const FIGURE_COUNT_MAX = 4;

export type DoorKind = 'hold' | 'switch';
export type ItemKind = 'lantern' | 'ghost' | 'swap' | 'key';

export interface Room { id: number; x: number; y: number; w: number; h: number }
export interface Door { id: number; x: number; y: number; vertical: boolean; kind: DoorKind; color: number | null; rooms: [number, number] }
export interface Plate { id: number; x: number; y: number; door: number; color: number | null }
export interface Item { id: number; x: number; y: number; kind: ItemKind; color?: number }
export interface Teleport { a: [number, number]; b: [number, number] }

export interface Level {
  n: number;
  seed: number;
  w: number;
  h: number;
  grid: string[];
  rooms: Room[];
  /** Raum pro Feld (Index y*w+x), -1 = Gang/außen */
  roomOf: number[];
  /** Raum-Verbindungen (für die Laterne) */
  links: [number, number][];
  doors: Door[];
  plates: Plate[];
  items: Item[];
  teleports: Teleport[];
  chaos: { x: number; y: number }[];
  figures: number;
  starts: [number, number][];
  exits: [number, number][];
  startRooms: number[];
  timeLimit: number;
  /** Bausteine, die in diesem Level neu sind (werden vorher erklärt) */
  intro: string[];
}

export interface State {
  pos: [number, number][];
  home: boolean[];
  /** Schalter-Türen, die dauerhaft offen sind (Schalter oder Schlüssel) */
  latched: boolean[];
  revealed: boolean[];
  itemTaken: boolean[];
  chaosUsed: boolean[];
  ghost: boolean[];
  keys: number[][];
}

export type GameEvent =
  | { k: 'step'; f: number }
  | { k: 'bump'; f: number }
  | { k: 'slide'; f: number }
  | { k: 'lava'; f: number }
  | { k: 'teleport'; f: number }
  | { k: 'ghost'; f: number }
  | { k: 'pickup'; f: number; item: ItemKind }
  | { k: 'swap'; f: number; with: number }
  | { k: 'chaos'; f: number }
  | { k: 'home'; f: number }
  | { k: 'reveal'; room: number }
  | { k: 'door'; door: number; open: boolean }
  | { k: 'unlock'; f: number; door: number };

export function initialState(L: Level): State {
  const s: State = {
    pos: L.starts.map((p) => [p[0], p[1]] as [number, number]),
    home: L.starts.map(() => false),
    latched: L.doors.map(() => false),
    revealed: L.rooms.map(() => false),
    itemTaken: L.items.map(() => false),
    chaosUsed: L.chaos.map(() => false),
    ghost: L.starts.map(() => false),
    keys: L.starts.map(() => []),
  };
  for (const p of s.pos) revealAt(L, s, p[0], p[1]);
  return s;
}

export const cellAt = (L: Level, x: number, y: number) => (x < 0 || y < 0 || x >= L.w || y >= L.h ? ' ' : L.grid[y][x]);
const isFloor = (c: string) => c !== ' ' && c !== '#';

export function doorAt(L: Level, x: number, y: number) {
  return L.doors.find((d) => d.x === x && d.y === y);
}

export function figureAt(s: State, x: number, y: number, except = -1) {
  return s.pos.findIndex((p, i) => i !== except && p[0] === x && p[1] === y);
}

/** Ist die Tür gerade offen? Halte-Türen: solange eine Figur auf einer ihrer Platten (oder in der Tür) steht. */
export function doorOpen(L: Level, s: State, d: Door): boolean {
  if (s.latched[d.id]) return true;
  if (d.kind === 'switch') return false;
  if (figureAt(s, d.x, d.y) >= 0) return true;
  return L.plates.some((p) => p.door === d.id && s.pos.some((q, f) => q[0] === p.x && q[1] === p.y && (p.color == null || p.color === f)));
}

export function doorStates(L: Level, s: State) {
  return L.doors.map((d) => doorOpen(L, s, d));
}

function revealAt(L: Level, s: State, x: number, y: number, events?: GameEvent[]) {
  const r = L.roomOf[y * L.w + x];
  if (r >= 0 && !s.revealed[r]) {
    s.revealed[r] = true;
    events?.push({ k: 'reveal', room: r });
  }
}

/** Darf Figur f das Feld (x,y) in Richtung dir betreten? (ohne Geist/Schlüssel) */
function canEnter(L: Level, s: State, f: number, x: number, y: number, dir: Dir, ignoreFigures = false): boolean {
  const c = cellAt(L, x, y);
  if (!isFloor(c)) return false;
  if (ONE_WAY[c] && ONE_WAY[c] !== dir) return false;
  const d = doorAt(L, x, y);
  if (d && !doorOpen(L, s, d)) return false;
  if (!ignoreFigures && figureAt(s, x, y, f) >= 0) return false;
  return true;
}

function freeNear(L: Level, s: State, f: number, x: number, y: number): [number, number] {
  // nächstes freies Bodenfeld (Breitensuche), falls der Start besetzt ist
  const seen = new Set<number>([y * L.w + x]);
  const q: [number, number][] = [[x, y]];
  while (q.length) {
    const [cx, cy] = q.shift()!;
    const c = cellAt(L, cx, cy);
    if (isFloor(c) && c !== 'L' && figureAt(s, cx, cy, f) < 0) return [cx, cy];
    for (const dir of DIRS) {
      const nx = cx + DV[dir][0], ny = cy + DV[dir][1];
      const k = ny * L.w + nx;
      if (!seen.has(k) && isFloor(cellAt(L, nx, ny))) {
        seen.add(k);
        q.push([nx, ny]);
      }
    }
  }
  return [x, y];
}

/**
 * Figur f einen Schritt in Richtung dir bewegen. Ändert den Zustand und liefert die Ereignisse
 * (für Sounds, Statistiken und Anzeige).
 */
export function move(L: Level, s: State, f: number, dir: Dir, opts: { noItems?: boolean; ignoreFigures?: boolean } = {}): GameEvent[] {
  const ev: GameEvent[] = [];
  if (s.home[f]) return ev;
  const before = doorStates(L, s);
  const [dx, dy] = DV[dir];
  let [x, y] = s.pos[f];
  let nx = x + dx, ny = y + dy;

  if (!canEnter(L, s, f, nx, ny, dir, opts.ignoreFigures)) {
    const d = doorAt(L, nx, ny);
    const key = d && d.color != null && !doorOpen(L, s, d) ? s.keys[f].indexOf(d.color) : -1;
    if (d && key >= 0 && !opts.noItems && (opts.ignoreFigures || figureAt(s, nx, ny, f) < 0)) {
      // Schlüssel öffnet die Tür dauerhaft
      s.keys[f].splice(key, 1);
      s.latched[d.id] = true;
      ev.push({ k: 'unlock', f, door: d.id });
    } else if (s.ghost[f] && !opts.noItems && !(figureAt(s, nx, ny, f) >= 0) && canEnter(L, s, f, nx + dx, ny + dy, dir, opts.ignoreFigures) && cellAt(L, nx, ny) !== ' ') {
      // Geist: einmal durch Wand oder Tür
      s.ghost[f] = false;
      nx += dx;
      ny += dy;
      ev.push({ k: 'ghost', f });
    } else {
      ev.push({ k: 'bump', f });
      return ev;
    }
  }

  x = nx;
  y = ny;
  s.pos[f] = [x, y];
  ev.push({ k: 'step', f });

  // Eis: weiterrutschen, solange es geht
  let slid = false;
  while (cellAt(L, x, y) === 'I' && canEnter(L, s, f, x + dx, y + dy, dir, opts.ignoreFigures)) {
    x += dx;
    y += dy;
    s.pos[f] = [x, y];
    slid = true;
    if (cellAt(L, x, y) === 'L') break;
  }
  if (slid) ev.push({ k: 'slide', f });

  // Lava: zurück zum Start
  if (cellAt(L, x, y) === 'L') {
    ev.push({ k: 'lava', f });
    const [sx, sy] = L.starts[f];
    [x, y] = freeNear(L, s, f, sx, sy);
    s.pos[f] = [x, y];
  }

  // Teleporter
  for (const t of L.teleports) {
    const other = t.a[0] === x && t.a[1] === y ? t.b : t.b[0] === x && t.b[1] === y ? t.a : null;
    if (other && (opts.ignoreFigures || figureAt(s, other[0], other[1], f) < 0)) {
      x = other[0];
      y = other[1];
      s.pos[f] = [x, y];
      ev.push({ k: 'teleport', f });
      break;
    }
  }

  revealAt(L, s, x, y, ev);

  if (!opts.noItems) {
    // Powerups
    L.items.forEach((it, i) => {
      if (s.itemTaken[i] || it.x !== x || it.y !== y) return;
      s.itemTaken[i] = true;
      ev.push({ k: 'pickup', f, item: it.kind });
      if (it.kind === 'ghost') s.ghost[f] = true;
      if (it.kind === 'key' && it.color != null) s.keys[f].push(it.color);
      if (it.kind === 'lantern') {
        const r = L.roomOf[y * L.w + x];
        for (const [a, b] of L.links) {
          const o = a === r ? b : b === r ? a : -1;
          if (o >= 0 && !s.revealed[o]) {
            s.revealed[o] = true;
            ev.push({ k: 'reveal', room: o });
          }
        }
      }
      if (it.kind === 'swap' && it.color != null && it.color !== f && it.color < L.figures && !s.home[it.color]) {
        const o = it.color;
        const tmp = s.pos[o];
        s.pos[o] = s.pos[f];
        s.pos[f] = tmp;
        ev.push({ k: 'swap', f, with: o });
        revealAt(L, s, tmp[0], tmp[1], ev);
      }
    });
    L.chaos.forEach((c, i) => {
      if (!s.chaosUsed[i] && c.x === s.pos[f][0] && c.y === s.pos[f][1]) {
        s.chaosUsed[i] = true;
        ev.push({ k: 'chaos', f });
      }
    });
  }

  // Schalter-Platten (bleiben offen)
  for (const p of L.plates) {
    const d = L.doors[p.door];
    if (d.kind !== 'switch' || s.latched[d.id]) continue;
    if (s.pos.some((q, g) => q[0] === p.x && q[1] === p.y && (p.color == null || p.color === g))) s.latched[d.id] = true;
  }

  // Ausgang erreicht?
  for (let g = 0; g < L.figures; g++) {
    if (!s.home[g] && s.pos[g][0] === L.exits[g][0] && s.pos[g][1] === L.exits[g][1]) {
      s.home[g] = true;
      ev.push({ k: 'home', f: g });
    }
  }

  const after = doorStates(L, s);
  after.forEach((open, i) => {
    if (open !== before[i]) ev.push({ k: 'door', door: i, open });
  });
  return ev;
}

export const allHome = (L: Level, s: State) => s.home.slice(0, L.figures).every(Boolean);
