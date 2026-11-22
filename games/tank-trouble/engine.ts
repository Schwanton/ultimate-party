/**
 * Tank Trouble – Spielwelt ohne Netzwerk: Fahren, Kugeln mit Abprall, Minen, Powerups.
 * Läuft auf dem Server (30× pro Sekunde); traceShot nutzt auch der TV für die Ziellinie.
 */

import { COLS, ROWS } from './levels';

export const CELL = 40;
export const W = COLS * CELL;
export const H = ROWS * CELL;
export const TANK_R = 15;
export const BARREL = 22;

export interface ShotSpec { speed: number; bounces: number; rocket?: boolean }
export const SHOT = {
  normal: { speed: 250, bounces: 1 } as ShotSpec,
  rakete: { speed: 470, bounces: 1, rocket: true } as ShotSpec,
  abprall: { speed: 250, bounces: 2 } as ShotSpec,
};

export const MINE = { fuse: 10, arm: 0.8, ownerSafe: 2.5, radius: 66, blink: 2, contact: 26 };
export const POWERUPS = ['schild', 'rakete', 'abprall', 'turbo', 'mine'] as const;
export type PowerKind = (typeof POWERUPS)[number];
export const POWER = { first: 6, every: 10, max: 3, life: 25, turbo: 8, ammo: 3 };

export interface Spec {
  speed: number;
  fireCd: number;
  shot: ShotSpec;
  maxBullets: number;
  maxMines: number;
  /** Minen pro Sekunde (nur Computer) */
  mineRate: number;
  aim: 'direct' | 'bounce';
  /** Zielfehler in Bogenmaß */
  err: number;
  /** Drehtempo des Turms (Bogenmaß/s) */
  turn: number;
  dodge: boolean;
  invisible?: boolean;
  /** wie weit weg der Computer sich Ziele sucht (Felder) */
  roam: number;
  aggressive?: boolean;
  points: number;
}

export const PLAYER_SPEC: Spec = { speed: 125, fireCd: 0.3, shot: SHOT.normal, maxBullets: 5, maxMines: 2, mineRate: 0, aim: 'direct', err: 0, turn: 40, dodge: false, roam: 0, points: 100 };
export const BOT_SPEC: Spec = { ...PLAYER_SPEC, fireCd: 0.55, mineRate: 0.03, aim: 'bounce', err: 0.05, turn: 6, dodge: true, roam: 6, aggressive: true };

const ROCKET: ShotSpec = { speed: 430, bounces: 0, rocket: true };
const ROCKET2: ShotSpec = { speed: 430, bounces: 2, rocket: true };

export const ENEMIES: Record<string, Spec & { color: string }> = {
  braun: { color: '#C8874A', speed: 0, fireCd: 3.0, shot: SHOT.normal, maxBullets: 1, maxMines: 0, mineRate: 0, aim: 'direct', err: 0.16, turn: 1.4, dodge: false, roam: 0, points: 50 },
  grau: { color: '#B9C2D4', speed: 55, fireCd: 2.0, shot: SHOT.normal, maxBullets: 1, maxMines: 0, mineRate: 0, aim: 'direct', err: 0.1, turn: 2.0, dodge: false, roam: 4, points: 100 },
  tuerkis: { color: '#2FD9C9', speed: 0, fireCd: 2.2, shot: ROCKET, maxBullets: 1, maxMines: 0, mineRate: 0, aim: 'direct', err: 0.05, turn: 2.4, dodge: false, roam: 0, points: 150 },
  gelb: { color: '#FFD23F', speed: 105, fireCd: 2.4, shot: SHOT.normal, maxBullets: 1, maxMines: 4, mineRate: 0.22, aim: 'direct', err: 0.12, turn: 2.0, dodge: false, roam: 6, points: 150 },
  rot: { color: '#FF4B4B', speed: 70, fireCd: 1.4, shot: SHOT.normal, maxBullets: 3, maxMines: 0, mineRate: 0, aim: 'bounce', err: 0.06, turn: 2.6, dodge: false, roam: 5, points: 200 },
  gruen: { color: '#5BE36B', speed: 0, fireCd: 1.7, shot: ROCKET2, maxBullets: 2, maxMines: 0, mineRate: 0, aim: 'bounce', err: 0.03, turn: 3.0, dodge: false, roam: 0, points: 250 },
  lila: { color: '#B06BFF', speed: 115, fireCd: 1.0, shot: SHOT.normal, maxBullets: 5, maxMines: 2, mineRate: 0.06, aim: 'bounce', err: 0.07, turn: 3.2, dodge: true, roam: 6, aggressive: true, points: 250 },
  weiss: { color: '#F4F7FF', speed: 70, fireCd: 1.5, shot: SHOT.normal, maxBullets: 3, maxMines: 2, mineRate: 0.05, aim: 'bounce', err: 0.07, turn: 2.6, dodge: false, invisible: true, roam: 5, points: 300 },
  schwarz: { color: '#8A93A8', speed: 145, fireCd: 0.8, shot: ROCKET, maxBullets: 2, maxMines: 2, mineRate: 0.05, aim: 'direct', err: 0.04, turn: 4.0, dodge: true, roam: 7, aggressive: true, points: 400 },
};

export interface AiState {
  nextThink: number;
  path: [number, number][];
  repathAt: number;
  want: number;
  canFire: boolean;
  lastX: number; lastY: number; stuckSince: number;
}

export interface Tank {
  i: number;
  kind: 'player' | 'enemy';
  pid?: string;
  etype?: string;
  team: number;
  color: string;
  spec: Spec;
  x: number; y: number;
  body: number; turret: number;
  alive: boolean;
  /** Eingabe: Fahren (-1..1), Ziel-Winkel, Feuer/Mine angefordert */
  mx: number; my: number; aim: number;
  wantFire: boolean; wantMine: boolean;
  aimedAt: number;
  fireReady: number;
  shield: boolean;
  ammo: { kind: 'rakete' | 'abprall'; n: number } | null;
  turboUntil: number;
  extraMines: number;
  ai: AiState | null;
  moved: number;
}

export interface Bullet { id: number; x: number; y: number; vx: number; vy: number; owner: number; left: number; rocket: boolean; age: number }
export interface Mine { id: number; x: number; y: number; owner: number; age: number; fuse: number }
export interface Powerup { id: number; x: number; y: number; kind: PowerKind; age: number }

/** [id, Art, …Zahlen] */
export type Ev = [number, string, ...number[]];

export const solidTank = (g: string[][], c: number, r: number) => c < 0 || r < 0 || c >= COLS || r >= ROWS || g[r][c] === '#' || g[r][c] === '+' || g[r][c] === '~';
export const solidShot = (g: string[][], c: number, r: number) => c < 0 || r < 0 || c >= COLS || r >= ROWS || g[r][c] === '#' || g[r][c] === '+';

const angDiff = (a: number, b: number) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};
export { angDiff };

/**
 * Flugbahn einer Kugel nachrechnen. `visit(x, y, dist)` bei jedem Schritt; true = abbrechen.
 * Gibt die Eckpunkte zurück (Start, Abprallpunkte, Ende).
 */
export function traceShot(g: string[][], x: number, y: number, ang: number, bounces: number, maxLen: number, visit?: (x: number, y: number, d: number) => boolean, step = 6): [number, number][] {
  let vx = Math.cos(ang), vy = Math.sin(ang);
  const pts: [number, number][] = [[x, y]];
  let d = 0, left = bounces;
  while (d < maxLen) {
    let hit = false;
    const nx = x + vx * step;
    if (solidShot(g, Math.floor((nx + Math.sign(vx) * 3) / CELL), Math.floor(y / CELL))) { vx = -vx; hit = true; } else x = nx;
    const ny = y + vy * step;
    if (solidShot(g, Math.floor(x / CELL), Math.floor((ny + Math.sign(vy) * 3) / CELL))) { vy = -vy; hit = true; } else y = ny;
    d += step;
    if (hit) {
      pts.push([x, y]);
      if (--left < 0) return pts;
    }
    if (visit?.(x, y, d)) { pts.push([x, y]); return pts; }
  }
  pts.push([x, y]);
  return pts;
}

export class World {
  grid: string[][];
  tanks: Tank[] = [];
  bullets: Bullet[] = [];
  mines: Mine[] = [];
  powerups: Powerup[] = [];
  t = 0;
  events: Ev[] = [];
  private nextId = 1;
  powerupsOn = false;
  private nextPowerup = POWER.first;
  /** Rückmeldung an den Server: wer hat wen erwischt (-1 = niemand / Wand) */
  onKill: (victim: Tank, by: Tank | null) => void = () => {};
  onPickup: (tank: Tank, kind: PowerKind) => void = () => {};
  gridChanged = false;

  constructor(map: string[]) {
    this.grid = map.map((r) => r.split('').map((ch) => ('#+~'.includes(ch) ? ch : '.')));
  }

  ev(kind: string, ...nums: number[]) {
    this.events.push([this.nextId++, kind, ...nums.map((n) => Math.round(n))]);
  }

  addTank(t: Omit<Tank, 'i' | 'body' | 'turret' | 'alive' | 'mx' | 'my' | 'aim' | 'wantFire' | 'wantMine' | 'aimedAt' | 'fireReady' | 'shield' | 'ammo' | 'turboUntil' | 'extraMines' | 'ai' | 'moved'> & { turret?: number }): Tank {
    const tank: Tank = {
      ...t, i: this.tanks.length, body: 0, turret: t.turret ?? 0, alive: true, mx: 0, my: 0, aim: t.turret ?? 0, wantFire: false, wantMine: false, aimedAt: -9,
      fireReady: 0.5, shield: false, ammo: null, turboUntil: 0, extraMines: 0, moved: 0,
      ai: null,
    };
    this.tanks.push(tank);
    return tank;
  }

  bulletsOf(i: number) { let n = 0; for (const b of this.bullets) if (b.owner === i) n++; return n; }
  minesOf(i: number) { let n = 0; for (const m of this.mines) if (m.owner === i) n++; return n; }
  maxMines(t: Tank) { return t.spec.maxMines + t.extraMines; }

  step(dt: number) {
    this.t += dt;
    for (const tk of this.tanks) if (tk.alive) this.moveTank(tk, dt);
    this.separateTanks();
    for (const tk of this.tanks) {
      if (!tk.alive) { tk.wantFire = tk.wantMine = false; continue; }
      if (tk.wantFire) { tk.wantFire = false; this.fire(tk); }
      if (tk.wantMine) { tk.wantMine = false; this.layMine(tk); }
    }
    this.moveBullets(dt);
    this.tickMines(dt);
    this.tickPowerups(dt);
  }

  private moveTank(tk: Tank, dt: number) {
    let mx = tk.mx, my = tk.my;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    const sp = tk.spec.speed * (this.t < tk.turboUntil ? 1.5 : 1);
    const ox = tk.x, oy = tk.y;
    if (len > 0.15 && sp > 0) {
      tk.x += mx * sp * dt;
      this.collideGrid(tk);
      tk.y += my * sp * dt;
      this.collideGrid(tk);
      // Wanne dreht sich in Fahrtrichtung (vorne und hinten sind gleich)
      const want = Math.atan2(my, mx);
      let d = angDiff(tk.body, want);
      if (Math.abs(d) > Math.PI / 2) d = angDiff(tk.body, want + Math.PI);
      tk.body += Math.sign(d) * Math.min(Math.abs(d), 9 * dt);
    }
    tk.moved = Math.hypot(tk.x - ox, tk.y - oy);
    const d = angDiff(tk.turret, tk.aim);
    tk.turret += Math.sign(d) * Math.min(Math.abs(d), tk.spec.turn * dt);
  }

  collideGrid(tk: { x: number; y: number }) {
    const R = TANK_R;
    for (let it = 0; it < 2; it++) {
      const c0 = Math.floor(tk.x / CELL), r0 = Math.floor(tk.y / CELL);
      for (let r = r0 - 1; r <= r0 + 1; r++) {
        for (let c = c0 - 1; c <= c0 + 1; c++) {
          if (!solidTank(this.grid, c, r)) continue;
          const px = Math.max(c * CELL, Math.min(tk.x, (c + 1) * CELL));
          const py = Math.max(r * CELL, Math.min(tk.y, (r + 1) * CELL));
          const dx = tk.x - px, dy = tk.y - py;
          const d = Math.hypot(dx, dy);
          if (d >= R) continue;
          if (d < 0.001) {
            // Mittelpunkt steckt im Feld: zur nächsten Kante schieben
            const l = tk.x - c * CELL, rr = (c + 1) * CELL - tk.x, u = tk.y - r * CELL, dd = (r + 1) * CELL - tk.y;
            const m = Math.min(l, rr, u, dd);
            if (m === l) tk.x = c * CELL - R; else if (m === rr) tk.x = (c + 1) * CELL + R; else if (m === u) tk.y = r * CELL - R; else tk.y = (r + 1) * CELL + R;
          } else {
            tk.x += (dx / d) * (R - d);
            tk.y += (dy / d) * (R - d);
          }
        }
      }
    }
    tk.x = Math.max(R, Math.min(W - R, tk.x));
    tk.y = Math.max(R, Math.min(H - R, tk.y));
  }

  private separateTanks() {
    const live = this.tanks.filter((t) => t.alive);
    for (let a = 0; a < live.length; a++) {
      for (let b = a + 1; b < live.length; b++) {
        const A = live[a], B = live[b];
        const dx = B.x - A.x, dy = B.y - A.y;
        const d = Math.hypot(dx, dy);
        if (d >= TANK_R * 2 || d === 0) continue;
        const push = (TANK_R * 2 - d) / 2;
        const aMob = A.spec.speed > 0, bMob = B.spec.speed > 0;
        const ka = aMob && bMob ? 1 : aMob ? 2 : 0, kb = aMob && bMob ? 1 : bMob ? 2 : 0;
        A.x -= (dx / d) * push * ka; A.y -= (dy / d) * push * ka;
        B.x += (dx / d) * push * kb; B.y += (dy / d) * push * kb;
        this.collideGrid(A);
        this.collideGrid(B);
      }
    }
  }

  fire(tk: Tank): boolean {
    if (this.t < tk.fireReady || this.bulletsOf(tk.i) >= tk.spec.maxBullets) return false;
    const shot = tk.ammo ? SHOT[tk.ammo.kind] : tk.spec.shot;
    const cx = Math.cos(tk.turret), cy = Math.sin(tk.turret);
    const x = tk.x + cx * BARREL, y = tk.y + cy * BARREL;
    tk.fireReady = this.t + tk.spec.fireCd;
    // Rohr steckt in der Wand: Kugel zerplatzt sofort
    if (solidShot(this.grid, Math.floor(x / CELL), Math.floor(y / CELL))) {
      this.ev('spark', x, y);
      return true;
    }
    if (tk.ammo) { if (--tk.ammo.n <= 0) tk.ammo = null; }
    this.bullets.push({ id: this.nextId++, x, y, vx: cx * shot.speed, vy: cy * shot.speed, owner: tk.i, left: shot.bounces, rocket: !!shot.rocket, age: 0 });
    this.ev('shot', x, y, tk.i, shot.rocket ? 1 : 0);
    return true;
  }

  layMine(tk: Tank): boolean {
    if (this.minesOf(tk.i) >= this.maxMines(tk)) return false;
    if (this.mines.some((m) => Math.hypot(m.x - tk.x, m.y - tk.y) < 30)) return false;
    this.mines.push({ id: this.nextId++, x: tk.x, y: tk.y, owner: tk.i, age: 0, fuse: MINE.fuse });
    this.ev('mine', tk.x, tk.y, tk.i);
    return true;
  }

  private moveBullets(dt: number) {
    const g = this.grid;
    const dead = new Set<Bullet>();
    for (const b of this.bullets) {
      b.age += dt;
      const sp = Math.hypot(b.vx, b.vy);
      const n = Math.max(1, Math.ceil((sp * dt) / 5));
      const h = dt / n;
      for (let s = 0; s < n && !dead.has(b); s++) {
        let hit = false;
        const nx = b.x + b.vx * h;
        if (solidShot(g, Math.floor((nx + Math.sign(b.vx) * 3) / CELL), Math.floor(b.y / CELL))) { b.vx = -b.vx; hit = true; } else b.x = nx;
        const ny = b.y + b.vy * h;
        if (solidShot(g, Math.floor(b.x / CELL), Math.floor((ny + Math.sign(b.vy) * 3) / CELL))) { b.vy = -b.vy; hit = true; } else b.y = ny;
        if (hit) {
          if (--b.left < 0) { dead.add(b); this.ev('spark', b.x, b.y); break; }
          this.ev('bounce', b.x, b.y);
        }
        // Treffer Panzer
        for (const tk of this.tanks) {
          if (!tk.alive) continue;
          if (tk.i === b.owner && b.age < 0.12) continue;
          if (Math.hypot(tk.x - b.x, tk.y - b.y) < TANK_R + 3) {
            dead.add(b);
            if (tk.shield) { tk.shield = false; this.ev('shield', tk.x, tk.y, tk.i); }
            else this.kill(tk, this.tanks[b.owner] ?? null);
            break;
          }
        }
        if (dead.has(b)) break;
        // Treffer Mine
        for (const m of this.mines) {
          if (Math.hypot(m.x - b.x, m.y - b.y) < 12) { dead.add(b); m.fuse = Math.min(m.fuse, m.age); break; }
        }
      }
    }
    // Kugeln zerstören sich gegenseitig
    const bs = this.bullets;
    for (let i = 0; i < bs.length; i++) {
      if (dead.has(bs[i])) continue;
      for (let j = i + 1; j < bs.length; j++) {
        if (dead.has(bs[j])) continue;
        if (Math.hypot(bs[i].x - bs[j].x, bs[i].y - bs[j].y) < 9) {
          dead.add(bs[i]); dead.add(bs[j]);
          this.ev('spark', (bs[i].x + bs[j].x) / 2, (bs[i].y + bs[j].y) / 2);
          break;
        }
      }
    }
    if (dead.size) this.bullets = bs.filter((b) => !dead.has(b));
  }

  kill(tk: Tank, by: Tank | null) {
    if (!tk.alive) return;
    tk.alive = false;
    tk.mx = tk.my = 0;
    this.ev('kill', tk.x, tk.y, tk.i, by ? by.i : -1);
    this.onKill(tk, by);
  }

  private tickMines(dt: number) {
    const boom: Mine[] = [];
    for (const m of this.mines) {
      m.age += dt;
      if (m.age >= m.fuse) { boom.push(m); continue; }
      if (m.age < MINE.arm) continue;
      for (const tk of this.tanks) {
        if (!tk.alive) continue;
        if (tk.i === m.owner && m.age < MINE.ownerSafe) continue;
        if (Math.hypot(tk.x - m.x, tk.y - m.y) < MINE.contact) { boom.push(m); break; }
      }
    }
    for (const m of boom) this.explode(m);
  }

  private explode(m: Mine) {
    if (!this.mines.includes(m)) return;
    this.mines = this.mines.filter((x) => x !== m);
    const R = MINE.radius;
    this.ev('boom', m.x, m.y, R);
    const owner = this.tanks[m.owner] ?? null;
    for (const tk of this.tanks) {
      if (tk.alive && Math.hypot(tk.x - m.x, tk.y - m.y) < R) {
        if (tk.shield) { tk.shield = false; this.ev('shield', tk.x, tk.y, tk.i); } else this.kill(tk, owner);
      }
    }
    const c0 = Math.floor(m.x / CELL), r0 = Math.floor(m.y / CELL);
    for (let r = r0 - 2; r <= r0 + 2; r++) {
      for (let c = c0 - 2; c <= c0 + 2; c++) {
        if (r < 0 || c < 0 || r >= ROWS || c >= COLS || this.grid[r][c] !== '+') continue;
        if (Math.hypot((c + 0.5) * CELL - m.x, (r + 0.5) * CELL - m.y) < R + 12) {
          this.grid[r][c] = '.';
          this.gridChanged = true;
          this.ev('block', (c + 0.5) * CELL, (r + 0.5) * CELL);
        }
      }
    }
    this.bullets = this.bullets.filter((b) => Math.hypot(b.x - m.x, b.y - m.y) >= R);
    this.powerups = this.powerups.filter((p) => Math.hypot(p.x - m.x, p.y - m.y) >= R);
    for (const o of this.mines) if (Math.hypot(o.x - m.x, o.y - m.y) < R) o.fuse = Math.min(o.fuse, o.age + 0.15);
  }

  private tickPowerups(dt: number) {
    for (const p of this.powerups) p.age += dt;
    this.powerups = this.powerups.filter((p) => p.age < POWER.life);
    if (!this.powerupsOn) return;
    if (this.t >= this.nextPowerup) {
      this.nextPowerup = this.t + POWER.every;
      if (this.powerups.length < POWER.max) this.spawnPowerup();
    }
    for (const p of [...this.powerups]) {
      for (const tk of this.tanks) {
        if (!tk.alive || tk.kind !== 'player') continue;
        if (Math.hypot(tk.x - p.x, tk.y - p.y) < 24) {
          this.powerups = this.powerups.filter((x) => x !== p);
          this.applyPowerup(tk, p.kind);
          this.ev('pick', p.x, p.y, tk.i, POWERUPS.indexOf(p.kind));
          this.onPickup(tk, p.kind);
          break;
        }
      }
    }
  }

  private spawnPowerup() {
    for (let tries = 0; tries < 40; tries++) {
      const c = Math.floor(Math.random() * COLS), r = Math.floor(Math.random() * ROWS);
      if (this.grid[r][c] !== '.') continue;
      const x = (c + 0.5) * CELL, y = (r + 0.5) * CELL;
      if (this.tanks.some((t) => t.alive && Math.hypot(t.x - x, t.y - y) < CELL * 3)) continue;
      if (this.powerups.some((p) => Math.hypot(p.x - x, p.y - y) < CELL * 3)) continue;
      if (this.mines.some((m) => Math.hypot(m.x - x, m.y - y) < CELL * 2)) continue;
      const kind = POWERUPS[Math.floor(Math.random() * POWERUPS.length)];
      this.powerups.push({ id: this.nextId++, x, y, kind, age: 0 });
      this.ev('power', x, y, POWERUPS.indexOf(kind));
      return;
    }
  }

  applyPowerup(tk: Tank, kind: PowerKind) {
    if (kind === 'schild') tk.shield = true;
    else if (kind === 'rakete' || kind === 'abprall') tk.ammo = { kind, n: POWER.ammo };
    else if (kind === 'turbo') tk.turboUntil = this.t + POWER.turbo;
    else if (kind === 'mine') tk.extraMines = Math.min(2, tk.extraMines + 1);
  }
}
