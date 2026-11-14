/**
 * Bonk! – Arena-Generator (läuft auf dem Server, die Daten gehen an den TV).
 * Raster aus Feldern: Inseln über dem Abgrund, Brücken dazwischen, Risse, Säulen, Eis, Prallkissen.
 * Gleicher Zufallswert = gleiche Arena.
 */

export const CELL = 40;

/** Feldarten im Raster (ein Zeichen pro Feld) */
export const T_ABYSS = '.';
export const T_FLOOR = '#';
export const T_BRIDGE = '=';
export const T_PILLAR = 'o';
export const T_ICE = 'i';

export interface Arena {
  seed: number;
  cols: number;
  rows: number;
  /** Zeilen als Text, je Feld ein Zeichen (siehe T_*) */
  grid: string[];
  /** Wände zum Abprallen: Strecken [x1, y1, x2, y2] auf Feldgrenzen (Spiel-Einheiten) */
  walls: [number, number, number, number][];
  /** Prallkissen (Feldmitte in Spiel-Einheiten) */
  bumpers: { x: number; y: number }[];
  /** Startplätze (Spiel-Einheiten) */
  spawns: { x: number; y: number }[];
  /** Mitte, in die sich das Feuer zurückzieht */
  center: { x: number; y: number };
  /** Abstand jedes Feldes zur Mitte (für den brennenden Rand), Zeile für Zeile */
  ring: number[];
  /** größter Ring-Abstand (Feuer startet dort) */
  ringMax: number;
}

export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export function walkable(c: string | undefined) {
  return c === T_FLOOR || c === T_BRIDGE || c === T_ICE;
}

export function arenaSize(players: number) {
  const cols = Math.round(Math.min(44, Math.max(31, 29 + players * 1.3)));
  const rows = Math.round(cols * 0.56);
  return { cols, rows };
}

/** Erzeugt eine Arena; probiert so lange neue Zufallswerte, bis alle Prüfregeln passen. */
export function generateArena(players: number, seed = Math.floor(Math.random() * 1e9)): Arena {
  for (let tries = 0; tries < 60; tries++) {
    const a = tryGenerate(players, seed + tries * 7919);
    if (a) return a;
  }
  return fallback(players, seed);
}

function tryGenerate(players: number, seed: number): Arena | null {
  const R = rng(seed);
  const { cols, rows } = arenaSize(players);
  const g: string[][] = Array.from({ length: rows }, () => Array<string>(cols).fill(T_ABYSS));
  const inside = (x: number, y: number) => x >= 1 && y >= 1 && x < cols - 1 && y < rows - 1;

  // 1) Inseln: Mittelpunkte mit Mindestabstand
  const count = 4 + Math.floor(R() * 2) + (players > 5 ? 1 : 0) + (players > 9 ? 1 : 0);
  const centers: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < 200 && centers.length < count; i++) {
    const r = (1.9 + R() * 1.9) * (rows / 13);
    const x = 1.5 + r + R() * (cols - 3 - 2 * r);
    const y = 1.5 + r * 0.7 + R() * (rows - 3 - 1.4 * r);
    if (centers.every((c) => Math.hypot(c.x - x, c.y - y) > c.r + r + 1.3)) centers.push({ x, y, r });
  }
  if (centers.length < 3) return null;
  // jede Insel aus 2–3 sich überlappenden Ellipsen
  for (const c of centers) {
    const blobs = 2 + Math.floor(R() * 2);
    for (let b = 0; b < blobs; b++) {
      const bx = c.x + (R() - 0.5) * c.r, by = c.y + (R() - 0.5) * c.r * 0.7;
      const rx = c.r * (0.6 + R() * 0.5), ry = c.r * (0.5 + R() * 0.45);
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        if (!inside(x, y)) continue;
        const dx = (x + 0.5 - bx) / rx, dy = (y + 0.5 - by) / ry;
        if (dx * dx + dy * dy <= 1) g[y][x] = T_FLOOR;
      }
    }
  }

  // Dünne Stellen der Inseln auf 2 Felder verbreitern
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 1; y < rows - 1; y++) for (let x = 1; x < cols - 1; x++) {
      if (g[y][x] !== T_FLOOR) continue;
      if (g[y][x - 1] === T_ABYSS && g[y][x + 1] === T_ABYSS && inside(x + 1, y)) g[y][x + 1] = T_FLOOR;
      if (g[y - 1][x] === T_ABYSS && g[y + 1][x] === T_ABYSS && inside(x, y + 1)) g[y + 1][x] = T_FLOOR;
    }
  }

  // 2) Brücken: Inseln über einen minimalen Spannbaum verbinden (+ eine Extra-Brücke für Rundwege)
  const edges: [number, number, number][] = [];
  for (let i = 0; i < centers.length; i++) for (let j = i + 1; j < centers.length; j++) edges.push([Math.hypot(centers[i].x - centers[j].x, centers[i].y - centers[j].y), i, j]);
  edges.sort((a, b) => a[0] - b[0]);
  const parent = centers.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const bridges: [number, number][] = [];
  const extra: [number, number][] = [];
  for (const [, i, j] of edges) {
    if (find(i) !== find(j)) { parent[find(i)] = find(j); bridges.push([i, j]); }
    else if (extra.length < 1 && R() < 0.6) extra.push([i, j]);
  }
  for (const [i, j] of [...bridges, ...extra]) {
    const a = centers[i], b = centers[j];
    let x = Math.floor(a.x), y = Math.floor(a.y);
    const tx = Math.floor(b.x), ty = Math.floor(b.y);
    const wide = R() < 0.8; // meist 2 Felder breit, selten nur 1
    const horizontalFirst = R() < 0.5;
    const mark = (cx: number, cy: number, horizontal: boolean) => {
      for (const [ox, oy] of wide ? [[0, 0], [horizontal ? 0 : 1, horizontal ? 1 : 0]] : [[0, 0]]) {
        const px = cx + ox, py = cy + oy;
        if (inside(px, py) && g[py][px] === T_ABYSS) g[py][px] = T_BRIDGE;
      }
    };
    const stepX = () => { while (x !== tx) { x += Math.sign(tx - x); mark(x, y, true); } };
    const stepY = () => { while (y !== ty) { y += Math.sign(ty - y); mark(x, y, false); } };
    if (horizontalFirst) { stepX(); stepY(); } else { stepY(); stepX(); }
  }

  // 3) Risse: zufällige Linien aus Abgrund in großen Inseln (nur wenn alles verbunden bleibt)
  const cracks = 1 + Math.floor(R() * 2);
  for (let k = 0; k < cracks; k++) {
    const c = centers[Math.floor(R() * centers.length)];
    if (c.r < 2.8) continue;
    const backup = g.map((row) => row.slice());
    let x = Math.floor(c.x - c.r * 0.9), y = Math.floor(c.y + (R() - 0.5) * c.r);
    const vertical = R() < 0.5;
    if (vertical) { x = Math.floor(c.x + (R() - 0.5) * c.r); y = Math.floor(c.y - c.r * 0.9); }
    const len = 3 + Math.floor(R() * 4);
    for (let s = 0; s < len; s++) {
      if (inside(x, y) && g[y][x] === T_FLOOR) g[y][x] = T_ABYSS;
      if (vertical) { y++; x += R() < 0.3 ? (R() < 0.5 ? -1 : 1) : 0; }
      else { x++; y += R() < 0.3 ? (R() < 0.5 ? -1 : 1) : 0; }
    }
    if (!connected(g)) for (let yy = 0; yy < rows; yy++) g[yy] = backup[yy];
  }

  // 4) Säulen und Eis
  const floorCells: [number, number][] = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (g[y][x] === T_FLOOR) floorCells.push([x, y]);
  const pillars = 2 + Math.floor(R() * 4);
  for (let k = 0; k < pillars; k++) {
    const [x, y] = floorCells[Math.floor(R() * floorCells.length)];
    if (edgeDistance(g, x, y) < 2) continue;
    g[y][x] = T_PILLAR;
    if (!connected(g)) g[y][x] = T_FLOOR;
  }
  if (R() < 0.55) {
    const c = centers[Math.floor(R() * centers.length)];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      if (g[y][x] === T_FLOOR && Math.hypot(x + 0.5 - c.x, (y + 0.5 - c.y) * 1.3) < c.r * 0.75) g[y][x] = T_ICE;
    }
  }

  // Prüfregeln: genug Boden, alles verbunden
  const walk: [number, number][] = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (walkable(g[y][x])) walk.push([x, y]);
  if (walk.length < Math.max(60, players * 14)) return null;
  if (!connected(g)) return null;

  // 5) Prallkissen (nicht auf Startplätzen)
  const safe = walk.filter(([x, y]) => g[y][x] !== T_BRIDGE && edgeDistance(g, x, y) >= 1);
  if (safe.length < players + 3) return null;
  if (players > 1 && safe.length < players * 4) return null;
  const spawns = farthestPoints(safe, players, R);
  const bumpers: { x: number; y: number }[] = [];
  const bumperCount = Math.floor(R() * 3);
  const bumperCells = walk.filter(([x, y]) => g[y][x] === T_FLOOR && edgeDistance(g, x, y) >= 1);
  for (let k = 0; k < bumperCount * 6 && bumpers.length < bumperCount && bumperCells.length; k++) {
    const [x, y] = bumperCells[Math.floor(R() * bumperCells.length)];
    const px = (x + 0.5) * CELL, py = (y + 0.5) * CELL;
    if (spawns.some((s) => Math.hypot(s.x - px, s.y - py) < CELL * 2.5)) continue;
    if (bumpers.some((b) => Math.hypot(b.x - px, b.y - py) < CELL * 3)) continue;
    bumpers.push({ x: px, y: py });
  }

  // 6) Wände: einige Stücke am Inselrand (dort prallt man ab statt runterzufallen) und manchmal eine kurze Wand mitten auf einer Insel
  const walls: [number, number, number, number][] = [];
  const faces: [number, number, number, number][] = []; // x, y, dx, dy (Seite des Feldes, die zum Abgrund zeigt)
  for (const [x, y] of walk) {
    if (g[y][x] === T_BRIDGE) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const c = g[y + dy]?.[x + dx];
      if (c === undefined || c === T_ABYSS) faces.push([x, y, dx, dy]);
    }
  }
  const has = (x: number, y: number, dx: number, dy: number) => faces.some((f) => f[0] === x && f[1] === y && f[2] === dx && f[3] === dy);
  const runs = 3 + Math.floor(R() * 3);
  for (let k = 0; k < runs * 6 && walls.length < runs && faces.length; k++) {
    const [x, y, dx, dy] = faces[Math.floor(R() * faces.length)];
    const len = 2 + Math.floor(R() * 3);
    // entlang der Kante weitergehen (senkrecht zur Blickrichtung)
    const sx = dy !== 0 ? 1 : 0, sy = dx !== 0 ? 1 : 0;
    let n = 1;
    while (n < len && has(x + sx * n, y + sy * n, dx, dy)) n++;
    if (n < 2) continue;
    const ex = dx === 1 ? x + 1 : x, ey = dy === 1 ? y + 1 : y; // Linie auf der Feldgrenze
    const seg: [number, number, number, number] = dx !== 0 ? [ex * CELL, y * CELL, ex * CELL, (y + n) * CELL] : [x * CELL, ey * CELL, (x + n) * CELL, ey * CELL];
    if (walls.some((w) => Math.hypot(w[0] - seg[0], w[1] - seg[1]) < CELL * 3)) continue;
    walls.push(seg);
  }
  const innerWalls = 1 + Math.floor(R() * 2);
  for (let k = 0; k < innerWalls; k++) {
    const inner = walk.filter(([x, y]) => g[y][x] !== T_BRIDGE && edgeDistance(g, x, y) >= 2);
    if (inner.length) {
      const [x, y] = inner[Math.floor(R() * inner.length)];
      const seg: [number, number, number, number] = R() < 0.5 ? [x * CELL, y * CELL, (x + 2) * CELL, y * CELL] : [x * CELL, y * CELL, x * CELL, (y + 2) * CELL];
      if (!spawns.some((s) => distToSegment(s.x, s.y, seg) < CELL) && !walls.some((w) => Math.hypot(w[0] - seg[0], w[1] - seg[1]) < CELL * 3)) walls.push(seg);
    }
  }

  // Feuer-Mitte: Feld mit dem größten Abstand zum Abgrund, nahe am Schwerpunkt
  let mx = 0, my = 0;
  for (const [x, y] of walk) { mx += x; my += y; }
  mx /= walk.length; my /= walk.length;
  let best = walk[0], bestScore = -Infinity;
  for (const [x, y] of walk) {
    if (g[y][x] === T_BRIDGE) continue;
    const s = edgeDistance(g, x, y) * 3 - Math.hypot(x - mx, y - my);
    if (s > bestScore) { bestScore = s; best = [x, y]; }
  }
  const ring: number[] = [];
  let ringMax = 0;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const d = Math.hypot(x - best[0], y - best[1]);
    ring.push(Math.round(d * 10) / 10);
    if (walkable(g[y][x]) && d > ringMax) ringMax = d;
  }

  return {
    seed, cols, rows,
    grid: g.map((row) => row.join('')),
    walls, bumpers, spawns,
    center: { x: (best[0] + 0.5) * CELL, y: (best[1] + 0.5) * CELL },
    ring, ringMax: Math.round(ringMax * 10) / 10,
  };
}

/** Abstand eines Punktes zu einer Strecke */
export function distToSegment(px: number, py: number, s: [number, number, number, number]) {
  const [x1, y1, x2, y2] = s;
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy || 1;
  const k = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2));
  return Math.hypot(px - (x1 + k * dx), py - (y1 + k * dy));
}

/** Steht ein Kreis noch auf Boden? Erst wenn der ganze Kreis über dem Abgrund ist, fällt man. */
export function onGround(grid: string[], x: number, y: number, r: number) {
  const at = (px: number, py: number) => walkable(grid[Math.floor(py / CELL)]?.[Math.floor(px / CELL)]);
  if (at(x, y)) return true;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    if (at(x + Math.cos(a) * r, y + Math.sin(a) * r)) return true;
  }
  return false;
}

/** Sind alle begehbaren Felder miteinander verbunden? */
function connected(g: string[][]) {
  const rows = g.length, cols = g[0].length;
  let start: [number, number] | null = null, total = 0;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (walkable(g[y][x])) { total++; start ??= [x, y]; }
  if (!start) return false;
  const seen = new Set<number>([start[1] * cols + start[0]]);
  const stack = [start];
  while (stack.length) {
    const [x, y] = stack.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || !walkable(g[ny][nx])) continue;
      const k = ny * cols + nx;
      if (!seen.has(k)) { seen.add(k); stack.push([nx, ny]); }
    }
  }
  return seen.size === total;
}

/** Wie viele Felder bis zum nächsten Abgrund (0 = direkt am Rand), höchstens 4 */
export function edgeDistance(g: string[][] | string[], x: number, y: number) {
  for (let d = 1; d <= 4; d++) {
    for (let oy = -d; oy <= d; oy++) for (let ox = -d; ox <= d; ox++) {
      if (Math.max(Math.abs(ox), Math.abs(oy)) !== d) continue;
      const c = g[y + oy]?.[x + ox];
      if (c === undefined || c === T_ABYSS) return d - 1;
    }
  }
  return 4;
}

function farthestPoints(cells: [number, number][], n: number, R: () => number) {
  const out: { x: number; y: number }[] = [];
  const first = cells[Math.floor(R() * cells.length)];
  out.push({ x: (first[0] + 0.5) * CELL, y: (first[1] + 0.5) * CELL });
  while (out.length < n) {
    let best = cells[0], bestD = -1;
    for (const [x, y] of cells) {
      const px = (x + 0.5) * CELL, py = (y + 0.5) * CELL;
      const d = Math.min(...out.map((o) => Math.hypot(o.x - px, o.y - py)));
      if (d > bestD) { bestD = d; best = [x, y]; }
    }
    out.push({ x: (best[0] + 0.5) * CELL, y: (best[1] + 0.5) * CELL });
  }
  return out;
}

/** Notfall: eine große Insel mit zwei Nebeninseln (sollte praktisch nie gebraucht werden) */
function fallback(players: number, seed: number): Arena {
  const { cols, rows } = arenaSize(players);
  const g: string[][] = Array.from({ length: rows }, (_, y) => Array.from({ length: cols }, (_, x) => (x > 2 && x < cols - 3 && y > 2 && y < rows - 3 ? T_FLOOR : T_ABYSS)));
  const walk: [number, number][] = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (walkable(g[y][x]) && edgeDistance(g, x, y) >= 1) walk.push([x, y]);
  const cx = Math.floor(cols / 2), cy = Math.floor(rows / 2);
  const ring: number[] = [];
  let ringMax = 0;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const d = Math.hypot(x - cx, y - cy);
    ring.push(Math.round(d * 10) / 10);
    if (walkable(g[y][x])) ringMax = Math.max(ringMax, d);
  }
  return { seed, cols, rows, grid: g.map((r) => r.join('')), walls: [], bumpers: [], spawns: farthestPoints(walk, players, rng(seed)), center: { x: (cx + 0.5) * CELL, y: (cy + 0.5) * CELL }, ring, ringMax };
}

/* ---------- Waffen (gemeinsam für Server und Handy/TV) ---------- */

export type WeaponId = 'hammer' | 'schleuder' | 'haken' | 'bomben' | 'schwert' | 'bumerang';
export const WEAPONS: WeaponId[] = ['hammer', 'schleuder', 'haken', 'bomben', 'schwert', 'bumerang'];

export const WEAPON_COLOR: Record<WeaponId | 'alle', string> = {
  hammer: '#FFD447',
  schleuder: '#FF9F43',
  haken: '#36D6F5',
  bomben: '#FF3B4E',
  schwert: '#9B7BFF',
  bumerang: '#4BE3A1',
  alle: '#FFFFFF',
};

/** Wanddicke (Spiel-Einheiten) – so dick wird sie auch gezeichnet */
export const WALL_HALF = 6;

/** Symbole (Pfade im 24er-Raster, nur Linien) */
export const ICON: Record<string, string> = {
  hammer: 'M4 4h12v6H4z M10 10v11',
  schleuder: 'M12 21v-8 M12 13L6 4 M12 13l6-9 M6 4c2 4 10 4 12 0',
  haken: 'M15 3v10a5 5 0 1 1-9-3 M6 10l-2 2 M6 10l2.5 1 M15 3h5',
  bomben: 'M10 21a6.5 6.5 0 1 0 0-13a6.5 6.5 0 0 0 0 13z M14.5 9.5l3-3 M19 2.5v2 M21.5 5h-2',
  schild: 'M12 3l7 3v5c0 5-3 8-7 10c-4-2-7-5-7-10V6z M12 7v9 M9.5 9.5h5',
  schwert: 'M12 3l7 3v5c0 5-3 8-7 10c-4-2-7-5-7-10V6z M12 7v9 M9.5 9.5h5',
  bumerang: 'M4 18L11 5.5c.5-.9 1.5-.9 2 0L20 18h-4l-4-7.5L8 18z',
  alle: 'M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6l-5.4 2.9 1.2-6-4.5-4.2 6.1-.7z',
};

/** Abklingzeiten in Sekunden (das Handy zeigt sie an) */
export const COOLDOWN = { roll: 1.5, stomp: 4, bigShot: 3, pushHook: 4, detonate: 2.5 };
