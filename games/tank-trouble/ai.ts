/**
 * Tank Trouble – Computer-Panzer (Gegner der Kampagne, Duell-Gegner und Testspieler).
 * Zielen: direkt oder über Abpraller (rechnet Flugbahnen vorab nach), Fahren: Wegsuche über das Feldraster,
 * weicht Minen aus, manche Typen weichen auch Kugeln aus.
 */

import { COLS, ROWS } from './levels';
import { BARREL, CELL, MINE, SHOT, TANK_R, World, angDiff, solidShot, solidTank, traceShot, type Tank } from './engine';

export const hostile = (a: Tank, b: Tank) => a.team !== b.team;

type Verdict = { kind: 'hit' | 'self' | 'friend' | 'miss'; d: number };

function evaluate(w: World, tk: Tank, ang: number, bounces: number): Verdict {
  const x = tk.x + Math.cos(ang) * BARREL, y = tk.y + Math.sin(ang) * BARREL;
  if (solidShot(w.grid, Math.floor(x / CELL), Math.floor(y / CELL))) return { kind: 'miss', d: 0 };
  let out: Verdict = { kind: 'miss', d: 0 };
  traceShot(w.grid, x, y, ang, bounces, 1300, (px, py, d) => {
    for (const o of w.tanks) {
      if (!o.alive) continue;
      const r = Math.hypot(o.x - px, o.y - py);
      if (o === tk) { if (d > 30 && r < TANK_R + 8) { out = { kind: 'self', d }; return true; } continue; }
      if (r < TANK_R + 3) { out = { kind: hostile(tk, o) ? 'hit' : 'friend', d }; return true; }
    }
    return false;
  }, 8);
  return out;
}

function bfs(w: World, sc: number, sr: number, blocked: Set<number>, maxDepth: number) {
  const N = COLS * ROWS;
  const dist = new Int16Array(N).fill(-1);
  const prev = new Int32Array(N).fill(-1);
  const start = sr * COLS + sc;
  if (sc < 0 || sr < 0 || sc >= COLS || sr >= ROWS) return { dist, prev, cells: [] as number[] };
  dist[start] = 0;
  const q = [start];
  for (let h = 0; h < q.length; h++) {
    const k = q[h];
    if (dist[k] >= maxDepth) continue;
    const c = k % COLS, r = (k - c) / COLS;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc, nr = r + dr;
      if (solidTank(w.grid, nc, nr)) continue;
      const nk = nr * COLS + nc;
      if (dist[nk] >= 0 || blocked.has(nk)) continue;
      dist[nk] = dist[k] + 1;
      prev[nk] = k;
      q.push(nk);
    }
  }
  return { dist, prev, cells: q };
}

function mineCells(w: World) {
  const s = new Set<number>();
  for (const m of w.mines) {
    const c0 = Math.floor(m.x / CELL), r0 = Math.floor(m.y / CELL);
    for (let r = r0 - 1; r <= r0 + 1; r++) for (let c = c0 - 1; c <= c0 + 1; c++) if (c >= 0 && r >= 0 && c < COLS && r < ROWS) s.add(r * COLS + c);
  }
  return s;
}

function planPath(w: World, tk: Tank, target: Tank | null) {
  const ai = tk.ai!;
  const sc = Math.floor(tk.x / CELL), sr = Math.floor(tk.y / CELL);
  const blocked = mineCells(w);
  blocked.delete(sr * COLS + sc);
  const { dist, prev, cells } = bfs(w, sc, sr, blocked, 30);
  let options = cells.filter((k) => dist[k] >= 2 && dist[k] <= tk.spec.roam);
  if (tk.spec.aggressive && target) {
    const tc = Math.floor(target.x / CELL), tr = Math.floor(target.y / CELL);
    const near = cells.filter((k) => {
      const c = k % COLS, r = (k - c) / COLS;
      const md = Math.abs(c - tc) + Math.abs(r - tr);
      return md >= 3 && md <= 7 && dist[k] >= 1;
    });
    if (near.length) options = near;
  }
  if (!options.length) options = cells.filter((k) => dist[k] >= 1);
  if (!options.length) { ai.path = []; return; }
  let k = options[Math.floor(Math.random() * options.length)];
  const path: [number, number][] = [];
  while (k >= 0 && dist[k] > 0) {
    const c = k % COLS;
    path.unshift([c, (k - c) / COLS]);
    k = prev[k];
  }
  ai.path = path;
}

export function aiStep(w: World, tk: Tank) {
  if (!tk.alive) return;
  if (!tk.ai) tk.ai = { nextThink: w.t + Math.random() * 0.4, path: [], repathAt: 0, want: tk.turret, canFire: false, lastX: tk.x, lastY: tk.y, stuckSince: w.t };
  const ai = tk.ai;
  const spec = tk.spec;
  const targets = w.tanks.filter((o) => o.alive && hostile(tk, o));
  let nearest: Tank | null = null, best = Infinity;
  for (const o of targets) {
    const d = Math.hypot(o.x - tk.x, o.y - tk.y);
    if (d < best) { best = d; nearest = o; }
  }

  // Nachdenken: wohin zielen?
  if (w.t >= ai.nextThink) {
    ai.nextThink = w.t + 0.28 + Math.random() * 0.2;
    ai.canFire = false;
    if (nearest) {
      const bounces = tk.ammo ? SHOT[tk.ammo.kind].bounces : spec.shot.bounces;
      const a0 = Math.atan2(nearest.y - tk.y, nearest.x - tk.x);
      let found: number | null = null;
      if (evaluate(w, tk, a0, bounces).kind === 'hit') found = a0;
      else if (spec.aim === 'bounce') {
        let bestD = Infinity;
        const off = Math.random() * 0.17;
        for (let k = 0; k < 36; k++) {
          const a = off + (k / 36) * Math.PI * 2;
          const v = evaluate(w, tk, a, bounces);
          if (v.kind === 'hit' && v.d < bestD) { bestD = v.d; found = a; }
        }
      }
      if (found !== null) {
        ai.want = found + (Math.random() - 0.5) * 2 * spec.err;
        ai.canFire = true;
      } else ai.want = a0;
    }
    // Minen legen
    if (spec.mineRate > 0 && w.minesOf(tk.i) < w.maxMines(tk) && Math.random() < spec.mineRate * 0.38) {
      tk.wantMine = true;
      ai.repathAt = 0;
    }
  }
  tk.aim = ai.want;
  if (ai.canFire && Math.abs(angDiff(tk.turret, ai.want)) < 0.07) tk.wantFire = true;

  // Fahren
  tk.mx = tk.my = 0;
  if (spec.speed <= 0) return;
  if (Math.hypot(tk.x - ai.lastX, tk.y - ai.lastY) > 8) { ai.lastX = tk.x; ai.lastY = tk.y; ai.stuckSince = w.t; }
  if (w.t - ai.stuckSince > 1.2) { ai.repathAt = 0; ai.stuckSince = w.t; }
  if (w.t >= ai.repathAt || !ai.path.length) {
    planPath(w, tk, nearest);
    ai.repathAt = w.t + 2 + Math.random() * 2;
  }
  const next = ai.path[0];
  if (next) {
    const px = (next[0] + 0.5) * CELL, py = (next[1] + 0.5) * CELL;
    const dx = px - tk.x, dy = py - tk.y;
    const d = Math.hypot(dx, dy);
    if (d < 6) ai.path.shift();
    else { tk.mx = dx / d; tk.my = dy / d; }
  }
  // Minen in der Nähe: weg da
  for (const m of w.mines) {
    const dx = tk.x - m.x, dy = tk.y - m.y;
    const d = Math.hypot(dx, dy);
    const danger = m.owner === tk.i ? m.age > 1.5 || m.fuse - m.age < 3 : true;
    if (danger && d < MINE.radius + 14) {
      const k = d || 1;
      tk.mx = dx / k; tk.my = dy / k;
      if (w.t + 0.5 < ai.repathAt) ai.repathAt = w.t + 0.5;
    }
  }
  // Kugeln ausweichen
  if (spec.dodge) {
    for (const b of w.bullets) {
      if (b.owner === tk.i && b.age < 0.5) continue;
      const px = b.x - tk.x, py = b.y - tk.y;
      const v2 = b.vx * b.vx + b.vy * b.vy;
      const tt = -(px * b.vx + py * b.vy) / v2;
      if (tt <= 0 || tt > 0.7) continue;
      const cx = px + b.vx * tt, cy = py + b.vy * tt;
      const cd = Math.hypot(cx, cy);
      if (cd > TANK_R + 14) continue;
      const sp = Math.sqrt(v2);
      let nx = -b.vy / sp, ny = b.vx / sp;
      if (cx * nx + cy * ny > 0) { nx = -nx; ny = -ny; }
      tk.mx = nx; tk.my = ny;
      break;
    }
  }
}
