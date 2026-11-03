/**
 * Schwarmsinn – Level-Generator.
 *
 * Jedes Level hat ein festes Rezept (Figuren, Räume, Bausteine). Der Grundriss wird aus einem Zufallswert (seed)
 * erzeugt – gleicher seed = gleiches Level („genau so nochmal“).
 *
 * Damit jedes Level lösbar ist:
 *  1. Türen werden wie ein Schloss-und-Schlüssel-Rätsel vergeben: Die Platte einer Tür liegt immer in einem Bereich,
 *     den man vorher schon erreichen kann. Halte-Türen haben auf beiden Seiten eine Platte.
 *  2. Labyrinthe haben keine Sackgassen (überall Schleifen) – Figuren können einander ausweichen.
 *  3. Ausgänge, Platten und Starts liegen nur auf Feldern, die keinen Weg versperren.
 *  4. Ein Prüfprogramm spielt jedes Level durch (Erreichbarkeit, keine Fallen, Türen-Logik). Sonst: neu würfeln.
 */

import { DIRS, DV, initialState, move, type Door, type DoorKind, type Item, type ItemKind, type Level, type Plate, type Room, type State, type Teleport } from './rules';

export interface Recipe {
  figures: number;
  rooms: number;
  startRooms: number;
  /** Anteil Innenwände (0–0,35) */
  walls: number;
  /** Anteil zusätzlicher Verbindungen (Schleifen zwischen Räumen) */
  loops: number;
  switchGrey: number;
  switchColor: number;
  hold: number;
  ice: number;
  lava: number;
  teleports: number;
  oneway: number;
  lantern: number;
  ghost: number;
  swap: number;
  key: number;
  chaos: number;
  /** Sekunden */
  time: number;
  intro: string[];
}

const base: Recipe = {
  figures: 1, rooms: 2, startRooms: 1, walls: 0.12, loops: 0.25, switchGrey: 0, switchColor: 0, hold: 0,
  ice: 0, lava: 0, teleports: 0, oneway: 0, lantern: 0, ghost: 0, swap: 0, key: 0, chaos: 0, time: 90, intro: [],
};

/** Die 20 Level. Danach: Endlos-Modus mit zufälliger Mischung. */
export const LEVELS: Partial<Recipe>[] = [
  { figures: 1, rooms: 2, walls: 0.12, time: 90, intro: ['controls', 'exit'] },
  { figures: 1, rooms: 3, walls: 0.18, time: 120, intro: ['fog'] },
  { figures: 2, rooms: 3, walls: 0.2, time: 150, intro: ['figures'] },
  { figures: 2, rooms: 4, walls: 0.2, hold: 1, time: 180, intro: ['hold'] },
  { figures: 2, rooms: 4, walls: 0.22, switchGrey: 1, hold: 1, time: 180, intro: ['switch'] },
  { figures: 2, rooms: 5, walls: 0.22, switchColor: 2, hold: 1, time: 210, intro: ['color'] },
  { figures: 3, rooms: 5, walls: 0.24, switchGrey: 1, switchColor: 1, hold: 1, time: 240, intro: ['three'] },
  { figures: 3, rooms: 5, walls: 0.22, switchColor: 1, hold: 1, ice: 3, time: 240, intro: ['ice'] },
  { figures: 3, rooms: 6, walls: 0.24, switchColor: 1, hold: 1, lava: 3, time: 270, intro: ['lava'] },
  { figures: 3, rooms: 6, walls: 0.24, switchColor: 1, hold: 1, ice: 2, lava: 2, teleports: 1, time: 270, intro: ['teleport'] },
  { figures: 3, rooms: 6, walls: 0.26, switchColor: 2, hold: 1, lava: 2, lantern: 2, time: 270, intro: ['lantern'] },
  { figures: 4, rooms: 6, walls: 0.24, switchColor: 2, hold: 1, ice: 2, lava: 2, time: 300, intro: ['four'] },
  { figures: 4, rooms: 7, walls: 0.26, switchColor: 2, hold: 1, lava: 2, key: 2, time: 300, intro: ['key'] },
  { figures: 4, rooms: 7, walls: 0.26, switchColor: 2, hold: 2, ice: 2, ghost: 2, time: 300, intro: ['ghost'] },
  { figures: 4, rooms: 7, walls: 0.26, switchColor: 2, hold: 1, lava: 2, swap: 2, time: 300, intro: ['swap'] },
  { figures: 4, rooms: 8, walls: 0.26, switchColor: 2, hold: 2, ice: 2, lava: 2, chaos: 2, time: 330, intro: ['chaos'] },
  { figures: 4, rooms: 8, walls: 0.28, switchColor: 2, hold: 1, lava: 2, oneway: 4, time: 330, intro: ['oneway'] },
  { figures: 4, rooms: 8, walls: 0.28, startRooms: 2, switchColor: 2, hold: 2, ice: 2, lava: 2, teleports: 1, time: 360, intro: ['multistart'] },
  { figures: 4, rooms: 9, walls: 0.3, startRooms: 2, switchGrey: 1, switchColor: 2, hold: 2, ice: 3, lava: 3, teleports: 1, oneway: 3, lantern: 1, key: 1, ghost: 1, chaos: 1, time: 390 },
  { figures: 4, rooms: 10, walls: 0.3, startRooms: 2, switchGrey: 1, switchColor: 3, hold: 2, ice: 3, lava: 3, teleports: 1, oneway: 3, lantern: 1, key: 1, ghost: 1, swap: 1, chaos: 1, time: 420 },
];

export const LEVEL_COUNT = LEVELS.length;

export function recipe(n: number, seed: number): Recipe {
  if (n <= LEVELS.length) {
    const r = { ...base, ...LEVELS[n - 1] };
    // Räume sollen kleine Labyrinthe sein
    return { ...r, walls: Math.min(0.4, r.walls * 1.3) };
  }
  // Endlos: zufällige Mischung, wird langsam enger
  const r = rng(seed ^ 0x9e3779b9);
  const pick = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
  return {
    ...base, figures: 4, rooms: pick(8, 10), startRooms: pick(1, 2), walls: Math.min(0.34, 0.28 + (n - 20) * 0.005), loops: 0.25,
    switchGrey: pick(0, 2), switchColor: pick(1, 3), hold: pick(1, 2), ice: pick(0, 3), lava: pick(1, 4), teleports: pick(0, 2),
    oneway: pick(0, 4), lantern: pick(0, 1), ghost: pick(0, 1), swap: pick(0, 1), key: pick(0, 1), chaos: pick(0, 1),
    time: Math.max(300, 420 - (n - 20) * 5), intro: [],
  };
}

/* ---------------- Zufall ---------------- */

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------- Erzeugen ---------------- */

export function generate(n: number, seed: number): Level {
  const R = recipe(n, seed);
  // Mehrere Versuche mit abgeleitetem Zufall – deterministisch für denselben seed
  for (let attempt = 0; attempt < 120; attempt++) {
    const L = build(R, rng((seed * 7919 + attempt * 104729) >>> 0), n, seed);
    if (L && check(L)) return L;
  }
  // Notfall: ohne Sonderfelder (sollte praktisch nie passieren)
  const simple: Recipe = { ...R, ice: 0, lava: 0, oneway: 0, teleports: 0, walls: Math.min(R.walls, 0.15) };
  for (let attempt = 0; attempt < 200; attempt++) {
    const L = build(simple, rng((seed * 31 + attempt) >>> 0), n, seed);
    if (L && check(L)) return L;
  }
  throw new Error('Level konnte nicht erzeugt werden');
}

type Cell = [number, number];

function build(R: Recipe, r: () => number, n: number, seed: number): Level | null {
  const ri = (k: number) => Math.floor(r() * k);
  const shuffle = <T,>(a: T[]) => {
    const b = [...a];
    for (let i = b.length - 1; i > 0; i--) {
      const j = ri(i + 1);
      [b[i], b[j]] = [b[j], b[i]];
    }
    return b;
  };

  /* 1. Raumraster */
  const N = Math.max(2, R.rooms);
  const [C, RR] = N <= 3 ? [N, 1] : N === 4 ? [2, 2] : N <= 6 ? [3, 2] : N <= 8 ? [4, 2] : [4, 3];
  let slots: Cell[] = [];
  for (let cy = 0; cy < RR; cy++) for (let cx = 0; cx < C; cx++) slots.push([cx, cy]);
  const adjacent = (a: Cell, b: Cell) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;
  const connected = (list: Cell[]) => {
    const seen = new Set([0]);
    const q = [0];
    while (q.length) {
      const i = q.shift()!;
      list.forEach((s, j) => {
        if (!seen.has(j) && adjacent(list[i], s)) {
          seen.add(j);
          q.push(j);
        }
      });
    }
    return seen.size === list.length;
  };
  while (slots.length > N) {
    const cand = shuffle(slots.map((_, i) => i)).find((i) => connected(slots.filter((_, j) => j !== i)));
    if (cand === undefined) return null;
    slots = slots.filter((_, j) => j !== cand);
  }
  const rw = Math.min(14, Math.floor((40 - (C - 1)) / C));
  const rh = Math.min(10, Math.floor((22 - (RR - 1)) / RR));
  const W = C * rw + (C - 1);
  const H = RR * rh + (RR - 1);
  const g: string[][] = Array.from({ length: H }, () => Array(W).fill(' '));
  const rooms: Room[] = slots.map(([cx, cy], id) => ({ id, x: cx * (rw + 1), y: cy * (rh + 1), w: rw, h: rh }));
  const roomOf = Array(W * H).fill(-1);
  for (const rm of rooms) {
    for (let y = rm.y; y < rm.y + rm.h; y++) {
      for (let x = rm.x; x < rm.x + rm.w; x++) {
        const edge = x === rm.x || y === rm.y || x === rm.x + rm.w - 1 || y === rm.y + rm.h - 1;
        g[y][x] = edge ? '#' : '.';
        if (!edge) roomOf[y * W + x] = rm.id;
      }
    }
  }
  const inRoom = (rm: Room, x: number, y: number) => x > rm.x && y > rm.y && x < rm.x + rm.w - 1 && y < rm.y + rm.h - 1;

  /* 2. Verbindungen: Spannbaum + ein paar Schleifen */
  const allEdges: [number, number][] = [];
  rooms.forEach((a) => rooms.forEach((b) => {
    if (a.id < b.id && adjacent(slots[a.id], slots[b.id])) allEdges.push([a.id, b.id]);
  }));
  const startRoom0 = ri(rooms.length);
  const tree: [number, number][] = [];
  const inTree = new Set([startRoom0]);
  while (inTree.size < rooms.length) {
    const options = shuffle(allEdges.filter(([a, b]) => inTree.has(a) !== inTree.has(b)));
    const e = options[0];
    tree.push(e);
    inTree.add(e[0]);
    inTree.add(e[1]);
  }
  const extra = shuffle(allEdges.filter((e) => !tree.includes(e))).filter(() => r() < R.loops);
  const links = [...tree, ...extra];

  const protectedCells = new Set<number>();
  const corridorCells = new Set<number>();
  const doorCell = new Map<string, { x: number; y: number; vertical: boolean }>();
  for (const [ai, bi] of links) {
    let a = rooms[ai], b = rooms[bi];
    const horiz = slots[ai][1] === slots[bi][1];
    if (horiz && a.x > b.x) [a, b] = [b, a];
    if (!horiz && a.y > b.y) [a, b] = [b, a];
    if (horiz) {
      const y = a.y + 1 + ri(rh - 2);
      for (const x of [a.x + rw - 1, a.x + rw, b.x]) {
        g[y][x] = '.';
        corridorCells.add(y * W + x);
      }
      protectedCells.add(y * W + a.x + rw - 2);
      protectedCells.add(y * W + b.x + 1);
      doorCell.set(`${ai}-${bi}`, { x: a.x + rw, y, vertical: true });
    } else {
      const x = a.x + 1 + ri(rw - 2);
      for (const y of [a.y + rh - 1, a.y + rh, b.y]) {
        g[y][x] = '.';
        corridorCells.add(y * W + x);
      }
      protectedCells.add((a.y + rh - 2) * W + x);
      protectedCells.add((b.y + 1) * W + x);
      doorCell.set(`${ai}-${bi}`, { x, y: a.y + rh, vertical: false });
    }
  }

  const floor = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && g[y][x] !== '#' && g[y][x] !== ' ';
  const walkable = (x: number, y: number) => floor(x, y) && g[y][x] !== 'L';

  /** Sind alle begehbaren Felder des Raums (plus Gänge daneben) verbunden? */
  const roomConnected = (rm: Room, blocked = -1) => {
    const cells: number[] = [];
    for (let y = rm.y; y < rm.y + rm.h; y++) for (let x = rm.x; x < rm.x + rm.w; x++) if (walkable(x, y) && y * W + x !== blocked) cells.push(y * W + x);
    if (!cells.length) return true;
    const seen = new Set([cells[0]]);
    const q = [cells[0]];
    while (q.length) {
      const k = q.pop()!;
      const x = k % W, y = (k - x) / W;
      for (const d of DIRS) {
        const nx = x + DV[d][0], ny = y + DV[d][1];
        const nk = ny * W + nx;
        if (nx >= rm.x && ny >= rm.y && nx < rm.x + rm.w && ny < rm.y + rm.h && walkable(nx, ny) && nk !== blocked && !seen.has(nk)) {
          seen.add(nk);
          q.push(nk);
        }
      }
    }
    return seen.size === cells.length;
  };
  const degree = (x: number, y: number) => DIRS.filter((d) => floor(x + DV[d][0], y + DV[d][1])).length;

  /* 3. Mini-Labyrinth in jedem Raum: Wände ohne Sackgassen */
  for (const rm of rooms) {
    const area = (rm.w - 2) * (rm.h - 2);
    let target = Math.round(area * R.walls);
    for (let t = 0; t < 700 && target > 0; t++) {
      const x0 = rm.x + 1 + ri(rm.w - 2), y0 = rm.y + 1 + ri(rm.h - 2);
      const horiz = r() < 0.5;
      const len = 1 + ri(3);
      const seg: Cell[] = [];
      for (let i = 0; i < len; i++) {
        const x = x0 + (horiz ? i : 0), y = y0 + (horiz ? 0 : i);
        if (!inRoom(rm, x, y) || g[y][x] !== '.' || protectedCells.has(y * W + x)) break;
        seg.push([x, y]);
      }
      if (!seg.length) continue;
      seg.forEach(([x, y]) => (g[y][x] = '#'));
      let ok = roomConnected(rm);
      if (ok) {
        for (let y = rm.y + 1; ok && y < rm.y + rm.h - 1; y++) for (let x = rm.x + 1; ok && x < rm.x + rm.w - 1; x++) if (floor(x, y) && degree(x, y) < 2) ok = false;
      }
      if (!ok) seg.forEach(([x, y]) => (g[y][x] = '.'));
      else target -= seg.length;
    }
  }

  /* 4. Objekte platzieren */
  const used = new Set<number>();
  const pickCell = (rm: Room, opts: { nonArt?: boolean; plain?: boolean } = {}): Cell | null => {
    const cands: Cell[] = [];
    for (let y = rm.y + 1; y < rm.y + rm.h - 1; y++) {
      for (let x = rm.x + 1; x < rm.x + rm.w - 1; x++) {
        const k = y * W + x;
        if (g[y][x] !== '.' || used.has(k) || protectedCells.has(k)) continue;
        cands.push([x, y]);
      }
    }
    for (const c of shuffle(cands)) {
      if (opts.nonArt && !roomConnected(rm, c[1] * W + c[0])) continue;
      used.add(c[1] * W + c[0]);
      return c;
    }
    return null;
  };

  // Starträume
  const startRooms = [startRoom0];
  const bfsRooms = (from: number) => {
    const dist = rooms.map(() => Infinity);
    dist[from] = 0;
    const q = [from];
    while (q.length) {
      const a = q.shift()!;
      for (const [x, y] of links) {
        const o = x === a ? y : y === a ? x : -1;
        if (o >= 0 && dist[o] === Infinity) {
          dist[o] = dist[a] + 1;
          q.push(o);
        }
      }
    }
    return dist;
  };
  while (startRooms.length < Math.min(R.startRooms, rooms.length)) {
    const dist = bfsRooms(startRooms[0]);
    const far = rooms.filter((rm) => !startRooms.includes(rm.id)).sort((a, b) => dist[b.id] - dist[a.id]);
    startRooms.push(far[ri(Math.min(2, far.length))].id);
  }
  const F = R.figures;
  const figRoom = Array.from({ length: F }, (_, f) => startRooms[f % startRooms.length]);
  const starts: Cell[] = [];
  for (let f = 0; f < F; f++) {
    const c = pickCell(rooms[figRoom[f]], { nonArt: true });
    if (!c) return null;
    starts.push(c);
  }

  // Türen nach Schloss-und-Schlüssel-Prinzip
  const doors: Door[] = [];
  const plates: Plate[] = [];
  const pool: string[] = shuffle([
    ...Array(R.switchGrey).fill('g'), ...Array(R.switchColor).fill('c'), ...Array(R.hold).fill('h'),
  ]);
  const visited = new Set([startRoom0]);
  const available = () => Array.from({ length: F }, (_, f) => f).filter((f) => visited.has(figRoom[f]));
  const addDoor = (a: number, b: number, kind: string, plateRoomsA: number[], plateRoomB: number | null) => {
    const key = doorCell.has(`${a}-${b}`) ? `${a}-${b}` : `${b}-${a}`;
    const pos = doorCell.get(key)!;
    if (kind === 'o') return true;
    const avail = available();
    const dk: DoorKind = kind === 'h' ? 'hold' : 'switch';
    const color = kind === 'c' ? avail[ri(avail.length)] : null;
    const d: Door = { id: doors.length, x: pos.x, y: pos.y, vertical: pos.vertical, kind: dk, color, rooms: [a, b] };
    const pr = plateRoomsA[ri(plateRoomsA.length)];
    const p1 = pickCell(rooms[pr], { nonArt: true });
    if (!p1) return false;
    doors.push(d);
    plates.push({ id: plates.length, x: p1[0], y: p1[1], door: d.id, color });
    if (dk === 'hold' && plateRoomB != null) {
      const p2 = pickCell(rooms[plateRoomB], { nonArt: true });
      if (!p2) return false;
      plates.push({ id: plates.length, x: p2[0], y: p2[1], door: d.id, color: null });
    }
    return true;
  };
  const pending = [...tree];
  while (pending.length) {
    const idx = pending.findIndex(([a, b]) => visited.has(a) !== visited.has(b));
    const [a0, b0] = pending.splice(idx, 1)[0];
    const [a, b] = visited.has(a0) ? [a0, b0] : [b0, a0];
    // passenden Türtyp aus dem Vorrat nehmen
    let kind = 'o';
    const avail = available().length;
    const pi = pool.findIndex((k) => (k === 'h' ? avail >= 2 : k === 'c' ? avail >= 1 : true));
    if (pi >= 0 && r() < Math.max(0.55, pool.length / Math.max(1, pending.length + 1))) kind = pool.splice(pi, 1)[0];
    if (!addDoor(a, b, kind, kind === 'h' ? [a] : [...visited], b)) return null;
    visited.add(b);
  }
  // Rest des Vorrats auf Schleifen-Verbindungen verteilen
  for (const [a, b] of extra) {
    const kind = pool.length && r() < 0.7 ? pool.shift()! : 'o';
    if (kind === 'h' && F < 2) continue;
    if (!addDoor(a, b, kind, kind === 'h' ? [a] : rooms.map((rm) => rm.id), b)) return null;
  }

  // Ausgänge: möglichst weit weg vom Start der Figur
  const exits: Cell[] = [];
  for (let f = 0; f < F; f++) {
    const dist = bfsRooms(figRoom[f]);
    const order = [...rooms].sort((x, y) => dist[y.id] - dist[x.id]);
    const choice = order.slice(0, Math.max(1, Math.ceil(order.length / 2)));
    let c: Cell | null = null;
    for (const rm of shuffle(choice)) if ((c = pickCell(rm, { nonArt: true }))) break;
    if (!c) return null;
    exits.push(c);
  }

  // Lava (kleine Pfützen, versperren nie den einzigen Weg)
  for (let i = 0; i < R.lava; i++) {
    const rm = rooms[ri(rooms.length)];
    const c = pickCell(rm, { nonArt: true });
    if (!c) continue;
    g[c[1]][c[0]] = 'L';
    const grow = ri(3);
    for (let k = 0; k < grow; k++) {
      const d = DIRS[ri(4)];
      const x = c[0] + DV[d][0], y = c[1] + DV[d][1];
      const key = y * W + x;
      if (!inRoom(rm, x, y) || g[y][x] !== '.' || used.has(key) || protectedCells.has(key)) continue;
      g[y][x] = 'L';
      if (!roomConnected(rm)) g[y][x] = '.';
      else used.add(key);
    }
  }

  // Eis-Streifen
  for (let i = 0; i < R.ice; i++) {
    const rm = rooms[ri(rooms.length)];
    const runs: Cell[][] = [];
    for (let y = rm.y + 1; y < rm.y + rm.h - 1; y++) {
      for (let x = rm.x + 1; x < rm.x + rm.w - 1; x++) {
        for (const horiz of [true, false]) {
          const run: Cell[] = [];
          for (let k = 0; k < 5; k++) {
            const cx = x + (horiz ? k : 0), cy = y + (horiz ? 0 : k);
            if (!inRoom(rm, cx, cy) || g[cy][cx] !== '.' || used.has(cy * W + cx) || protectedCells.has(cy * W + cx)) break;
            run.push([cx, cy]);
          }
          if (run.length >= 2) runs.push(run);
        }
      }
    }
    if (!runs.length) continue;
    const run = runs[ri(runs.length)].slice(0, 2 + ri(3));
    run.forEach(([x, y]) => {
      g[y][x] = 'I';
      used.add(y * W + x);
    });
  }

  // Einbahnfelder (in geraden Gängen)
  for (let i = 0; i < R.oneway; i++) {
    const rm = rooms[ri(rooms.length)];
    const cands: [Cell, string][] = [];
    for (let y = rm.y + 1; y < rm.y + rm.h - 1; y++) {
      for (let x = rm.x + 1; x < rm.x + rm.w - 1; x++) {
        const k = y * W + x;
        if (g[y][x] !== '.' || used.has(k) || protectedCells.has(k)) continue;
        if (g[y][x - 1] === '.' && g[y][x + 1] === '.') cands.push([[x, y], r() < 0.5 ? 'r' : 'l']);
        if (g[y - 1][x] === '.' && g[y + 1][x] === '.') cands.push([[x, y], r() < 0.5 ? 'd' : 'u']);
      }
    }
    if (!cands.length) continue;
    const [[x, y], ch] = cands[ri(cands.length)];
    g[y][x] = ch;
    used.add(y * W + x);
  }

  // Teleporter-Paare (in verschiedenen Räumen)
  const teleports: Teleport[] = [];
  for (let i = 0; i < R.teleports; i++) {
    const [ra, rb] = shuffle(rooms).slice(0, 2);
    const a = pickCell(ra, { nonArt: true });
    const b = pickCell(rb, { nonArt: true });
    if (a && b) teleports.push({ a, b });
  }

  // Powerups
  const items: Item[] = [];
  const colored = doors.filter((d) => d.color != null);
  const addItems = (kind: ItemKind, count: number) => {
    for (let i = 0; i < count; i++) {
      if (kind === 'key' && !colored.length) return;
      const c = pickCell(rooms[ri(rooms.length)]);
      if (!c) continue;
      const it: Item = { id: items.length, x: c[0], y: c[1], kind };
      if (kind === 'key') it.color = colored[ri(colored.length)].color!;
      if (kind === 'swap') it.color = ri(F);
      items.push(it);
    }
  };
  addItems('lantern', R.lantern);
  addItems('ghost', R.ghost);
  addItems('swap', F >= 2 ? R.swap : 0);
  addItems('key', R.key);

  const chaos: { x: number; y: number }[] = [];
  for (let i = 0; i < R.chaos; i++) {
    const c = pickCell(rooms[ri(rooms.length)]);
    if (c) chaos.push({ x: c[0], y: c[1] });
  }

  return {
    n, seed, w: W, h: H, grid: g.map((row) => row.join('')), rooms, roomOf, links, doors, plates, items, teleports, chaos,
    figures: F, starts, exits, startRooms, timeLimit: R.time, intro: R.intro,
  };
}

/* ---------------- Prüfen ---------------- */

/** Bewegungen einer einzelnen Figur (ohne andere Figuren, ohne Powerups) mit gegebenen offenen Türen */
function reach(L: Level, f: number, from: [number, number], open: Set<number>, collectEdges = false) {
  const base: State = initialState(L);
  base.latched = L.doors.map((d) => open.has(d.id));
  // andere Figuren aus dem Weg
  base.pos = base.pos.map((_, i) => (i === f ? from : [-99, -99 - i]) as [number, number]);
  base.home = base.home.map(() => false);
  const key = (p: [number, number]) => p[1] * L.w + p[0];
  const seen = new Set([key(from)]);
  const q: [number, number][] = [from];
  const edges = new Map<number, number[]>();
  while (q.length) {
    const p = q.shift()!;
    for (const d of DIRS) {
      const s: State = { ...base, pos: base.pos.map((x) => [...x] as [number, number]), home: base.home.map(() => false), latched: [...base.latched] };
      s.pos[f] = [p[0], p[1]];
      move(L, s, f, d, { noItems: true, ignoreFigures: true });
      const np = s.pos[f];
      const nk = key(np);
      if (collectEdges) {
        const list = edges.get(key(p)) ?? [];
        list.push(nk);
        edges.set(key(p), list);
      }
      if (!seen.has(nk)) {
        seen.add(nk);
        q.push([np[0], np[1]]);
      }
    }
  }
  return { seen, edges };
}

export function check(L: Level): boolean {
  const key = (p: [number, number]) => p[1] * L.w + p[0];
  const allOpen = new Set(L.doors.map((d) => d.id));

  // A) Keine Fallen: Jede Figur kommt (bei offenen Türen) überall hin und von überall zurück
  for (let f = 0; f < L.figures; f++) {
    const { seen, edges } = reach(L, f, L.starts[f], allOpen, true);
    if (!seen.has(key(L.exits[f]))) return false;
    // Rückweg: umgekehrte Kanten ab Start
    const rev = new Map<number, number[]>();
    for (const [a, list] of edges) for (const b of list) {
      const l = rev.get(b) ?? [];
      l.push(a);
      rev.set(b, l);
    }
    const back = new Set([key(L.starts[f])]);
    const q = [key(L.starts[f])];
    while (q.length) for (const a of rev.get(q.pop()!) ?? []) if (!back.has(a)) {
      back.add(a);
      q.push(a);
    }
    for (const k of seen) if (!back.has(k)) return false;
  }

  // B) Türen-Logik: Türen nach und nach öffnen (Platten erreichbar?), dann muss jede Figur ihren Ausgang erreichen
  const open = new Set<number>();
  for (let round = 0; round < L.doors.length + 2; round++) {
    const reached = Array.from({ length: L.figures }, (_, f) => reach(L, f, L.starts[f], open).seen);
    let changed = false;
    for (const d of L.doors) {
      if (open.has(d.id)) continue;
      const ps = L.plates.filter((p) => p.door === d.id);
      const who = Array.from({ length: L.figures }, (_, f) => f).filter((f) => ps.some((p) => (p.color == null || p.color === f) && reached[f].has(p.y * L.w + p.x)));
      if ((d.kind === 'switch' && who.length >= 1) || (d.kind === 'hold' && who.length >= 2)) {
        open.add(d.id);
        changed = true;
      }
    }
    if (!changed) break;
  }
  for (let f = 0; f < L.figures; f++) if (!reach(L, f, L.starts[f], open).seen.has(key(L.exits[f]))) return false;
  return true;
}
