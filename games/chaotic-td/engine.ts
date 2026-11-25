/**
 * Chaotic Tower Defense – Spielregeln ohne Netzwerk (auch für Tests).
 * Einheiten: 1 = ein Feld. Gebäude außer der Mauer sind 2 × 2 Felder groß; Positionen sind immer die linke obere Ecke.
 * Der Weg der Monster läuft über die Eckpunkte des Rasters (eng an Kanten und Ecken) und wird danach straff gezogen.
 */

export type ZoneKind = 'slow' | 'fast' | 'dmg' | 'range' | 'nobuild';
export interface Zone { k: ZoneKind; x: number; y: number; w: number; h: number; s: number }
export type Pt = [number, number];
export interface Teleporter { i: Pt; o: Pt }
export interface Price { p: number; f: number }

export const TYPES = ['L', 'P', 'F', 'K', 'R', 'A', 'Q', 'V'] as const;
export type TowerType = 'T' | (typeof TYPES)[number];

export interface MapDef {
  w: number;
  h: number;
  start: Pt;
  core: Pt;
  cps: Pt[];
  rocks: Pt[];
  tps: Teleporter[];
  zones: Zone[];
  maxLimit: number;
  money: number;
  moneyF: number;
  /** Preise mit Zufallsfaktor: wall, tower, depot, blast, income, dmgUp, up_<Typ>, lv2_<Typ>, lv3_<Typ> */
  price: Record<string, Price>;
}

export const TOWER: Record<TowerType, { dmg: number; range: number; cd: number; splash?: number; chain?: number; slow?: number; poison?: number; air?: 'only'; buff?: number }> = {
  T: { dmg: 3, range: 5, cd: 1.0 },
  L: { dmg: 4, range: 6, cd: 0.3 },
  P: { dmg: 10, range: 5.5, cd: 1.3, splash: 1.6 },
  F: { dmg: 2, range: 5, cd: 1.0, splash: 1.6, slow: 0.55 },
  K: { dmg: 8, range: 5.5, cd: 1.1, chain: 4 },
  R: { dmg: 45, range: 11, cd: 2.6 },
  A: { dmg: 18, range: 8, cd: 0.7, air: 'only' },
  Q: { dmg: 2, range: 5.5, cd: 0.9, poison: 4 },
  V: { dmg: 0, range: 4.5, cd: 1, buff: 0.3 },
};
export const LEVEL_DMG = [1, 1.9, 3.4];
export const LEVEL_RANGE = [1, 1.1, 1.2];
export const BUFF = [0.3, 0.5, 0.75];

const BASE_PRICE: Record<string, number> = {
  wall: 2, tower: 15, depot: 120, blast: 30, income: 50, dmgUp: 150,
  L: 20, P: 40, F: 35, K: 50, R: 70, A: 40, Q: 45, V: 80,
};

export interface MonsterType { hp: number; speed: number; count: number; armor?: number; air?: boolean; heal?: boolean; split?: boolean; jump?: boolean; shield?: number; boss?: boolean }
export const MONSTERS: Record<string, MonsterType> = {
  laeufer: { hp: 21, speed: 2.2, count: 12 },
  flitzer: { hp: 13, speed: 3.6, count: 12 },
  panzer: { hp: 49, speed: 1.5, count: 8, armor: 3 },
  schwarm: { hp: 7, speed: 2.4, count: 24 },
  flieger: { hp: 18, speed: 2.4, count: 10, air: true },
  heiler: { hp: 24, speed: 2.0, count: 10, heal: true },
  spalter: { hp: 28, speed: 2.0, count: 10, split: true },
  springer: { hp: 22, speed: 2.1, count: 10, jump: true },
  schild: { hp: 21, speed: 2.0, count: 10, shield: 20 },
  boss: { hp: 315, speed: 1.3, count: 1, armor: 4, boss: true },
  splitter: { hp: 8, speed: 2.6, count: 0 },
};
export const MONSTER_KEYS = Object.keys(MONSTERS);
const CYCLE = ['laeufer', 'flitzer', 'schwarm', 'panzer', 'heiler', 'flieger', 'spalter', 'springer', 'schild'];

/* ================= Zufall ================= */

export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
const logFactor = (r: () => number, lo: number, hi: number) => Math.exp(Math.log(lo) + r() * (Math.log(hi) - Math.log(lo)));

/* ================= Karte erzeugen ================= */

const overlaps = (a: Pt, b: Pt, gap = 1) => Math.abs(a[0] - b[0]) < 2 + gap && Math.abs(a[1] - b[1]) < 2 + gap;

export function generateMap(seed: number): MapDef {
  const r = rng(seed);
  const ri = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
  const w = ri(10, 24) * 2, h = ri(8, 18) * 2;
  const placed: Pt[] = [];
  const spot = (tries = 200): Pt | null => {
    for (let k = 0; k < tries; k++) {
      const p: Pt = [ri(1, w - 3), ri(1, h - 3)];
      if (!placed.some((q) => overlaps(p, q, 2))) { placed.push(p); return p; }
    }
    return null;
  };
  // Start und Kern an gegenüberliegenden Seiten
  const horizontal = w >= h ? r() < 0.8 : r() < 0.2;
  let start: Pt, core: Pt;
  if (horizontal) { start = [0, ri(0, h - 2)]; core = [w - 2, ri(0, h - 2)]; }
  else { start = [ri(0, w - 2), 0]; core = [ri(0, w - 2), h - 2]; }
  if (r() < 0.5) [start, core] = [core, start];
  placed.push(start, core);
  const cps: Pt[] = [];
  const nCp = ri(0, 4);
  for (let k = 0; k < nCp; k++) { const p = spot(); if (p) cps.push(p); }
  const tps: Teleporter[] = [];
  const nTp = ri(0, 3);
  for (let k = 0; k < nTp; k++) { const i = spot(), o = spot(); if (i && o) tps.push({ i, o }); }
  const rocks: Pt[] = [];
  const nRock = ri(3, 12);
  for (let k = 0; k < nRock; k++) {
    const p = spot(60);
    if (p) { rocks.push(p); placed.pop(); placed.push(p); }
  }
  const zones: Zone[] = [];
  const kinds: ZoneKind[] = ['slow', 'fast', 'dmg', 'range', 'nobuild'];
  for (const k of kinds) {
    const n = ri(0, k === 'nobuild' ? 2 : 3);
    for (let j = 0; j < n; j++) {
      const zw = ri(3, Math.max(4, Math.floor(w / 3))), zh = ri(3, Math.max(4, Math.floor(h / 3)));
      const s = k === 'slow' ? 0.4 + r() * 0.4 : k === 'fast' ? 1.2 + r() * 0.6 : k === 'dmg' ? 1.2 + r() * 0.8 : k === 'range' ? 1.2 + r() * 0.6 : 1;
      zones.push({ k, x: ri(0, w - zw), y: ri(0, h - zh), w: zw, h: zh, s: Math.round(s * 100) / 100 });
    }
  }
  const price: Record<string, Price> = {};
  const add = (key: string, base: number) => {
    const f = logFactor(r, 0.25, 4);
    price[key] = { p: Math.max(1, Math.round(base * f)), f: Math.round(f * 100) / 100 };
  };
  for (const key of ['wall', 'tower', 'depot', 'blast', 'income', 'dmgUp']) add(key, BASE_PRICE[key]);
  for (const t of TYPES) { add('up_' + t, BASE_PRICE[t]); add('lv2_' + t, BASE_PRICE[t] * 1.2); add('lv3_' + t, BASE_PRICE[t] * 2.2); }
  const moneyF = logFactor(r, 0.5, 2);
  const map: MapDef = { w, h, start, core, cps, rocks, tps, zones, maxLimit: ri(16, 64), money: Math.round(90 * moneyF), moneyF: Math.round(moneyF * 100) / 100, price };
  // Felsen dürfen den Weg nicht ganz versperren
  const b = new Board(map);
  while (!b.route && map.rocks.length) { map.rocks.pop(); b.reset(); }
  return map;
}

/* ================= Wegberechnung ================= */

export interface Leg { pts: Pt[]; leg: number; jump?: boolean }

export function makeRouter(W: number, H: number, blocked: Uint8Array) {
  const bl = (c: number, r: number) => c < 0 || r < 0 || c >= W || r >= H || blocked[r * W + c] === 1;
  const hitPt = (x: number, y: number) => {
    const fx = x - Math.floor(x), fy = y - Math.floor(y), e = 1e-6;
    const onX = fx < e || fx > 1 - e, onY = fy < e || fy > 1 - e;
    if (onX && onY) {
      const X = Math.round(x), Y = Math.round(y);
      const a = bl(X - 1, Y - 1), b = bl(X, Y - 1), c = bl(X - 1, Y), d = bl(X, Y);
      return (a && d) || (b && c) || (a && b) || (c && d) || (a && c) || (b && d);
    }
    if (onX) { const X = Math.round(x), R = Math.floor(y); return bl(X - 1, R) && bl(X, R); }
    if (onY) { const Y = Math.round(y), C = Math.floor(x); return bl(C, Y - 1) && bl(C, Y); }
    return bl(Math.floor(x), Math.floor(y));
  };
  const los = (p: Pt, q: Pt) => {
    const n = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) * 8) + 1;
    for (let i = 1; i < n; i++) if (hitPt(p[0] + (q[0] - p[0]) * i / n, p[1] + (q[1] - p[1]) * i / n)) return false;
    return true;
  };
  const VW = W + 1, VH = H + 1;
  const vOk = (x: number, y: number) => {
    if (x < 0 || y < 0 || x > W || y > H) return false;
    const a = bl(x - 1, y - 1), b = bl(x, y - 1), c = bl(x - 1, y), d = bl(x, y);
    if (a && b && c && d) return false;
    return !((a && d && !b && !c) || (b && c && !a && !d));
  };
  const DIRS: [number, number, number][] = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  const edgeOk = (x: number, y: number, dx: number, dy: number) => {
    if (dx && dy) return !bl(x + (dx < 0 ? -1 : 0), y + (dy < 0 ? -1 : 0));
    if (dx) { const c = x + (dx < 0 ? -1 : 0); return !(bl(c, y - 1) && bl(c, y)); }
    const r = y + (dy < 0 ? -1 : 0); return !(bl(x - 1, r) && bl(x, r));
  };
  /** kürzester Weg zwischen zwei Rasterpunkten, eng an Ecken; null = versperrt */
  function path(from: Pt, to: Pt): Pt[] | null {
    const N = VW * VH;
    const g = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const s = from[1] * VW + from[0], goal = to[1] * VW + to[0];
    const hx = (k: number) => { const dx = Math.abs(k % VW - to[0]), dy = Math.abs(Math.floor(k / VW) - to[1]); return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy); };
    // kleiner Binär-Heap
    const heap: number[] = [], f: number[] = [];
    const push = (k: number, v: number) => {
      heap.push(k); f.push(v);
      let i = heap.length - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (f[p] <= f[i]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; [f[p], f[i]] = [f[i], f[p]]; i = p; }
    };
    const pop = () => {
      const top = heap[0];
      const lk = heap.pop()!, lv = f.pop()!;
      if (heap.length) {
        heap[0] = lk; f[0] = lv;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1, r = l + 1; let m = i;
          if (l < heap.length && f[l] < f[m]) m = l;
          if (r < heap.length && f[r] < f[m]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]]; [f[m], f[i]] = [f[i], f[m]]; i = m;
        }
      }
      return top;
    };
    g[s] = 0; push(s, hx(s));
    while (heap.length) {
      const cur = pop();
      if (closed[cur]) continue;
      if (cur === goal) break;
      closed[cur] = 1;
      const x = cur % VW, y = Math.floor(cur / VW);
      for (const [dx, dy, c] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx > W || ny > H) continue;
        const n = ny * VW + nx;
        if (closed[n] || (n !== goal && !vOk(nx, ny)) || !edgeOk(x, y, dx, dy)) continue;
        const ng = g[cur] + c;
        if (ng < g[n]) { g[n] = ng; prev[n] = cur; push(n, ng + hx(n)); }
      }
    }
    if (g[goal] === Infinity) return null;
    const raw: Pt[] = [];
    for (let k = goal; k !== -1; k = prev[k]) raw.push([k % VW, Math.floor(k / VW)]);
    raw.reverse();
    // straff ziehen
    const out: Pt[] = [raw[0]];
    let i = 0;
    while (i < raw.length - 1) {
      let j = i + 1;
      while (j + 1 < raw.length && los(raw[i], raw[j + 1])) j++;
      out.push(raw[j]);
      i = j;
    }
    return out;
  }
  return { path, los };
}

/** Teleporter: das erste Eingangsfeld, über das ein Abschnitt läuft (nur unbenutzte). */
function firstTeleport(pts: Pt[], tps: Teleporter[], used: Set<number>): { at: number; p: Pt; t: number } | null {
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], b = pts[k], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 10);
    for (let i = 1; i <= n; i++) {
      const x = a[0] + (b[0] - a[0]) * i / n, y = a[1] + (b[1] - a[1]) * i / n;
      for (let t = 0; t < tps.length; t++) {
        if (used.has(t)) continue;
        const [ix, iy] = tps[t].i;
        if (x > ix + 0.02 && x < ix + 1.98 && y > iy + 0.02 && y < iy + 1.98) return { at: k, p: [x, y], t };
      }
    }
  }
  return null;
}

/** ganzer Weg Start → Checkpoints → Kern mit Teleportern; null = versperrt */
export function fullRoute(map: MapDef, leg: (a: Pt, b: Pt) => Pt[] | null): Leg[] | null {
  const stops: Pt[] = [map.start, ...map.cps, map.core].map(([x, y]) => [x + 1, y + 1]);
  const legs: Leg[] = [];
  const used = new Set<number>();
  for (let k = 0; k < stops.length - 1; k++) {
    let line = leg(stops[k], stops[k + 1]);
    if (!line) return null;
    for (let guard = 0; guard < 4; guard++) {
      const hit = firstTeleport(line, map.tps, used);
      if (!hit) break;
      used.add(hit.t);
      legs.push({ pts: [...line.slice(0, hit.at), hit.p], leg: k });
      const o: Pt = [map.tps[hit.t].o[0] + 1, map.tps[hit.t].o[1] + 1];
      legs.push({ pts: [hit.p, o], leg: k, jump: true });
      line = leg(o, stops[k + 1]);
      if (!line) return null;
    }
    legs.push({ pts: line, leg: k });
  }
  return legs;
}

export const legsLength = (legs: Leg[]) => legs.reduce((s, l) => s + (l.jump ? 0 : l.pts.reduce((a, p, i) => (i ? a + Math.hypot(p[0] - l.pts[i - 1][0], p[1] - l.pts[i - 1][1]) : 0), 0)), 0);

/** Weg als Folge von Punkten mit Gesamtlänge bis dorthin (Sprünge haben Länge 0) */
export interface Track { x: Float64Array; y: Float64Array; s: Float64Array; len: number }
export function toTrack(legs: Leg[]): Track {
  const xs: number[] = [], ys: number[] = [], ss: number[] = [];
  let s = 0;
  for (const l of legs) {
    l.pts.forEach((p, i) => {
      if (xs.length && i === 0) return;
      if (xs.length && !l.jump) s += Math.hypot(p[0] - xs[xs.length - 1], p[1] - ys[ys.length - 1]);
      xs.push(p[0]); ys.push(p[1]); ss.push(s);
    });
  }
  return { x: Float64Array.from(xs), y: Float64Array.from(ys), s: Float64Array.from(ss), len: s };
}
export function trackAt(t: Track, s: number): Pt {
  if (s <= 0) return [t.x[0], t.y[0]];
  let lo = 0, hi = t.s.length - 1;
  if (s >= t.s[hi]) return [t.x[hi], t.y[hi]];
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (t.s[m] <= s) lo = m; else hi = m; }
  const d = t.s[hi] - t.s[lo];
  const k = d > 0 ? (s - t.s[lo]) / d : 1;
  return [t.x[lo] + (t.x[hi] - t.x[lo]) * k, t.y[lo] + (t.y[hi] - t.y[lo]) * k];
}

/** Flieger: gerade Linien von Halt zu Halt, Teleporter ebenso */
export function flyRoute(map: MapDef): Leg[] {
  return fullRoute(map, (a, b) => [a, b])!;
}

/* ================= Spielfeld eines Spielers ================= */

export type Kind = 'wall' | 'tower' | 'depot';
export interface Building { id: number; kind: Kind; x: number; y: number; type: TowerType; level: number; spent: number; builtAt: number; cd: number }
export interface Monster { id: number; type: string; s: number; hp: number; max: number; shield: number; slowUntil: number; slow: number; poisonUntil: number; poison: number; armorDown: number; jumpAt: number; split: boolean; x: number; y: number }

export const sizeOf = (k: Kind) => (k === 'wall' ? 1 : 2);

export class Board {
  map: MapDef;
  occ: Int32Array;
  blocked: Uint8Array;
  buildings = new Map<number, Building>();
  rocks: Pt[];
  nextId = 1;
  route: Leg[] | null = null;
  ground: Track | null = null;
  air: Track | null = null;
  monsters: Monster[] = [];
  spawnQueue: string[] = [];
  spawnIn = 0;
  waveTime = 0;
  waveDone = true;
  lastRun = 0;
  kills = 0;
  money: number;
  limitMax = 10;
  depots = 0;
  incomeLv = 0;
  dmgLv = 0;
  shots: [number, number, number, number, number][] = [];

  constructor(map: MapDef) {
    this.map = map;
    this.occ = new Int32Array(map.w * map.h);
    this.blocked = new Uint8Array(map.w * map.h);
    this.rocks = map.rocks.map((p) => [p[0], p[1]] as Pt);
    this.money = map.money;
    this.reset();
  }

  reset() {
    this.rocks = this.map.rocks.map((p) => [p[0], p[1]] as Pt);
    this.rebuild();
  }

  rebuild() {
    const { w } = this.map;
    this.occ.fill(0);
    this.blocked.fill(0);
    for (const [x, y] of this.rocks) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) { this.blocked[(y + dy) * w + x + dx] = 1; this.occ[(y + dy) * w + x + dx] = -1; }
    for (const b of this.buildings.values()) {
      const n = sizeOf(b.kind);
      for (let dy = 0; dy < n; dy++) for (let dx = 0; dx < n; dx++) { this.blocked[(b.y + dy) * w + b.x + dx] = 1; this.occ[(b.y + dy) * w + b.x + dx] = b.id; }
    }
    this.computeRoute();
  }

  computeRoute() {
    const router = makeRouter(this.map.w, this.map.h, this.blocked);
    this.route = fullRoute(this.map, router.path);
    this.ground = this.route ? toTrack(this.route) : null;
    this.air = toTrack(flyRoute(this.map));
  }

  get used() { let n = 0; for (const b of this.buildings.values()) if (b.kind !== 'depot') n++; return n; }

  priceOf(key: string) {
    const pr = this.map.price[key];
    if (key === 'depot') return pr.p * (this.depots + 1);
    if (key === 'income') return Math.round(pr.p * (1 + 0.5 * this.incomeLv));
    if (key === 'dmgUp') return pr.p * (this.dmgLv + 1);
    return pr.p;
  }

  /** Feld frei zum Bauen? (ohne Wegprüfung) */
  canPlace(kind: Kind, x: number, y: number): string | null {
    const { w, h } = this.map;
    const n = sizeOf(kind);
    if (x < 0 || y < 0 || x + n > w || y + n > h) return 'edge';
    for (let dy = 0; dy < n; dy++) for (let dx = 0; dx < n; dx++) if (this.occ[(y + dy) * w + x + dx] !== 0) return 'occupied';
    const special: Pt[] = [this.map.start, this.map.core, ...this.map.cps, ...this.map.tps.map((t) => t.o)];
    for (const p of special) if (x < p[0] + 2 && x + n > p[0] && y < p[1] + 2 && y + n > p[1]) return 'special';
    for (const z of this.map.zones) if (z.k === 'nobuild' && x < z.x + z.w && x + n > z.x && y < z.y + z.h && y + n > z.y) return 'nobuild';
    return null;
  }

  build(kind: Kind, x: number, y: number, now = 0): string | null {
    const why = this.canPlace(kind, x, y);
    if (why) return why;
    const key = kind === 'wall' ? 'wall' : kind === 'tower' ? 'tower' : 'depot';
    const cost = this.priceOf(key);
    if (this.money < cost) return 'money';
    if (kind === 'depot' && this.limitMax >= this.map.maxLimit) return 'maxlimit';
    if (kind !== 'depot' && this.used >= this.limitMax) return 'limit';
    const b: Building = { id: this.nextId++, kind, x, y, type: 'T', level: 1, spent: cost, builtAt: now, cd: 0 };
    this.buildings.set(b.id, b);
    this.rebuild();
    if (!this.route) { this.buildings.delete(b.id); this.rebuild(); return 'blocks'; }
    this.money -= cost;
    if (kind === 'depot') { this.depots++; this.limitMax = Math.min(this.map.maxLimit, this.limitMax + 10); }
    return null;
  }

  /** Weglänge, wenn hier gebaut würde (−1 = nicht möglich); ändert nichts */
  tryLength(kind: Kind, x: number, y: number): number {
    if (this.canPlace(kind, x, y)) return -1;
    const id = -999;
    this.buildings.set(id, { id, kind, x, y, type: 'T', level: 1, spent: 0, builtAt: 0, cd: 0 });
    this.rebuild();
    const len = this.ground ? this.ground.len : -1;
    this.buildings.delete(id);
    this.rebuild();
    return len;
  }

  /** Grundturm zu einem besonderen Turm machen oder Stufe erhöhen */
  upgrade(id: number, to?: TowerType): string | null {
    const b = this.buildings.get(id);
    if (!b || b.kind !== 'tower') return 'none';
    let key: string;
    if (b.type === 'T') { if (!to || to === 'T' || !TYPES.includes(to as any)) return 'type'; key = 'up_' + to; }
    else { if (b.level >= 3) return 'max'; key = 'lv' + (b.level + 1) + '_' + b.type; }
    const cost = this.priceOf(key);
    if (this.money < cost) return 'money';
    this.money -= cost;
    b.spent += cost;
    if (b.type === 'T') b.type = to!; else b.level++;
    return null;
  }

  refund(b: Building, now: number) { return now - b.builtAt <= 10 ? b.spent : Math.floor(b.spent / 2); }

  sell(id: number, now: number): string | null {
    const b = this.buildings.get(id);
    if (!b) return 'none';
    if (b.kind === 'depot' && this.used > this.limitMax - 10) return 'inuse';
    this.money += this.refund(b, now);
    this.buildings.delete(id);
    if (b.kind === 'depot') { this.depots--; this.limitMax -= 10; }
    this.rebuild();
    return null;
  }

  blast(x: number, y: number): string | null {
    const k = this.rocks.findIndex((p) => p[0] === x && p[1] === y);
    if (k < 0) return 'none';
    const cost = this.priceOf('blast');
    if (this.money < cost) return 'money';
    this.money -= cost;
    this.rocks.splice(k, 1);
    this.rebuild();
    return null;
  }

  buy(key: 'income' | 'dmgUp'): string | null {
    const cost = this.priceOf(key);
    if (this.money < cost) return 'money';
    this.money -= cost;
    if (key === 'income') this.incomeLv++; else this.dmgLv++;
    return null;
  }

  income() { return 15 + 5 * this.incomeLv; }

  /* ---------- Welle ---------- */

  startWave(wave: number) {
    const w = waveInfo(wave);
    this.spawnQueue = Array.from({ length: w.count }, () => w.type);
    if (w.type === 'boss') for (let k = 0; k < 8; k++) this.spawnQueue.push('laeufer');
    this.spawnIn = 0;
    this.waveTime = 0;
    this.waveDone = false;
    this.monsters = [];
    this.hpMul = w.hpMul;
  }
  hpMul = 1;
  private mid = 1;

  private spawn(type: string, s = 0) {
    const t = MONSTERS[type];
    const max = Math.round(t.hp * this.hpMul);
    const m: Monster = { id: this.mid++, type, s, hp: max, max, shield: t.shield ?? 0, slowUntil: 0, slow: 1, poisonUntil: 0, poison: 0, armorDown: 0, jumpAt: 4, split: false, x: 0, y: 0 };
    this.place(m);
    this.monsters.push(m);
  }
  private place(m: Monster) {
    const tr = MONSTERS[m.type].air ? this.air! : this.ground!;
    [m.x, m.y] = trackAt(tr, m.s);
  }

  zoneAt(k: ZoneKind, x: number, y: number) {
    let f = 1;
    for (const z of this.map.zones) if (z.k === k && x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) f = k === 'slow' ? Math.min(f, z.s) : Math.max(f, z.s);
    return f;
  }

  /** ein Zeitschritt; liefert Anzahl Kills in diesem Schritt */
  step(dt: number): number {
    if (this.waveDone || !this.ground) return 0;
    this.waveTime += dt;
    this.shots = [];
    let kills = 0;
    // erscheinen
    this.spawnIn -= dt;
    while (this.spawnQueue.length && this.spawnIn <= 0) { this.spawn(this.spawnQueue.shift()!); this.spawnIn += 0.6; }
    // bewegen
    const t = this.waveTime;
    for (const m of this.monsters) {
      const mt = MONSTERS[m.type];
      let v = mt.speed * (t < m.slowUntil ? m.slow : 1) * this.zoneAt('slow', m.x, m.y) * this.zoneAt('fast', m.x, m.y);
      m.s += v * dt;
      if (mt.jump && t >= m.jumpAt) { m.s += 2.5; m.jumpAt = t + 4; }
      if (t < m.poisonUntil) this.hurt(m, m.poison * dt, true);
      this.place(m);
    }
    for (const m of this.monsters) if (MONSTERS[m.type].heal) for (const o of this.monsters) if (o !== m && Math.hypot(o.x - m.x, o.y - m.y) < 2) o.hp = Math.min(o.max, o.hp + 3 * dt);
    // Türme
    const dmgBonus = this.dmgLv;
    for (const b of this.buildings.values()) {
      if (b.kind !== 'tower' || b.type === 'V') continue;
      b.cd -= dt;
      if (b.cd > 0) continue;
      const spec = TOWER[b.type];
      const cx = b.x + 1, cy = b.y + 1;
      const range = spec.range * LEVEL_RANGE[b.level - 1] * this.zoneAt('range', cx, cy);
      let target: Monster | null = null;
      for (const m of this.monsters) {
        const air = !!MONSTERS[m.type].air;
        if (spec.air === 'only' && !air) continue;
        if ((m.x - cx) ** 2 + (m.y - cy) ** 2 > range * range) continue;
        if (!target || m.s > target.s) target = m;
      }
      if (!target) continue;
      b.cd = spec.cd;
      let buff = 1;
      for (const o of this.buildings.values()) if (o.kind === 'tower' && o.type === 'V' && Math.hypot(o.x - b.x, o.y - b.y) <= TOWER.V.range) buff += BUFF[o.level - 1];
      const dmg = (spec.dmg * LEVEL_DMG[b.level - 1] + dmgBonus) * buff * this.zoneAt('dmg', cx, cy);
      this.shots.push([b.id, Math.round(target.x * 10), Math.round(target.y * 10), 0, 0]);
      const hit = (m: Monster, d: number) => { kills += this.hurt(m, d, false); };
      if (spec.splash) {
        for (const m of this.monsters) if (Math.hypot(m.x - target.x, m.y - target.y) <= spec.splash) {
          hit(m, dmg);
          if (spec.slow) { m.slow = spec.slow; m.slowUntil = t + 1.5; }
        }
      } else if (spec.chain) {
        let cur: Monster | null = target, d = dmg;
        const done = new Set<Monster>();
        for (let k = 0; k < spec.chain && cur; k++) {
          done.add(cur); hit(cur, d); d *= 0.8;
          let next: Monster | null = null, best = 3;
          for (const m of this.monsters) { if (done.has(m)) continue; const dd = Math.hypot(m.x - cur.x, m.y - cur.y); if (dd < best) { best = dd; next = m; } }
          cur = next;
        }
      } else {
        hit(target, dmg);
        if (spec.poison) { target.poison = spec.poison * LEVEL_DMG[b.level - 1]; target.poisonUntil = t + 3; target.armorDown = 2; }
      }
    }
    // angekommen
    const len = this.ground.len, alen = this.air!.len;
    this.monsters = this.monsters.filter((m) => m.s < (MONSTERS[m.type].air ? alen : len));
    if ((!this.spawnQueue.length && !this.monsters.length) || this.waveTime >= 180) {
      this.waveDone = true;
      this.lastRun = Math.round(this.waveTime * 10) / 10;
      this.monsters = [];
    }
    this.kills += kills;
    return kills;
  }

  /** Schaden; liefert Kill-Wert (0, 1 oder 10 beim Boss). Getötete Monster stehen sofort wieder auf. */
  private hurt(m: Monster, d: number, poison: boolean): number {
    const mt = MONSTERS[m.type];
    if (!poison) d = Math.max(1, d - Math.max(0, (mt.armor ?? 0) - m.armorDown));
    if (m.shield > 0 && !poison) { const a = Math.min(m.shield, d); m.shield -= a; d -= a; }
    m.hp -= d;
    if (m.hp > 0) return 0;
    // Wiedergeburt am selben Ort
    m.hp = m.max; m.shield = mt.shield ?? 0; m.poisonUntil = 0; m.slowUntil = 0; m.armorDown = 0;
    if (mt.split && !m.split) { m.split = true; this.spawnAt('splitter', m.s); }
    const val = mt.boss ? 10 : 1;
    this.money += val;
    return val;
  }
  private spawnAt(type: string, s: number) { this.spawn(type, s); }
}

export function waveInfo(wave: number) {
  const boss = wave % 10 === 0;
  const type = boss ? 'boss' : CYCLE[(wave - 1) % CYCLE.length];
  const hpMul = (1 + 0.18 * (wave - 1)) * Math.pow(1.05, wave - 1);
  return { type, count: MONSTERS[type].count + Math.floor(wave / 6) * 2, hpMul: Math.round(hpMul * 100) / 100 };
}
