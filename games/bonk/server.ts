/**
 * Bonk! – Arena-Kampf in der Draufsicht (Prototyp).
 * Der Server rechnet alles (30× pro Sekunde) und schickt die Positionen per ctx.stream an den TV.
 * Schaden tötet nicht, er macht den Rückflug länger. Ein Leben kostet nur das Landen im Abgrund.
 *
 * Punkte: Rauswurf +100 · Rundensieg +300 · Platz 2 +150 · Platz 3 +75.
 * Geld (nur für den Shop): Rauswurf 10 · Platz 1/2/3 15/10/5 · jede Runde 5.
 * Nach jeder Runde 1 von 3 Powerups, nach jeder 4. Runde ein Shop.
 */

import { Scores, shuffle, type GameContext, type GameServerModule } from '@up/sdk';
import { POWERUP, PRICE, REROLL_PRICE, drawPowerups, rarityChances } from './powerups';
import { CELL, COOLDOWN, T_PILLAR, WEAPONS, distToSegment, edgeDistance, generateArena, onGround, walkable, type Arena, type WeaponId } from './arena';

const TICK = 1 / 30;
const T = { intro: 8, weapon: 20, pick: 20, shop: 45, ready: 3, roundEnd: 5, scores: 6, respawn: 2.2, invuln: 1.5, credit: 3 };
const PHY = {
  radius: 15, accel: 1500, drag: 7, airDrag: 2.4, airControl: 0.15, landSpeed: 150,
  roll: 480, rollTime: 0.28, rollInvuln: 0.25, pillarR: 17, bumperR: 20, bumpSpeed: 560,
  kbScale: 1.3, kbMul: 0.85, fireDps: 12, firePush: 900,
};
const HAMMER = { maxCharge: 1.2, cooldown: 0.35, chargeSlow: 0.45, stompR: 78 };
const SLING = { every: 0.24, speed: 560, life: 0.6, r: 6, bigSpeed: 460, bigLife: 0.85, bigR: 10 };
const POINTS = { knockout: 100, place: [300, 150, 75] };
const MONEY = { knockout: 10, place: [15, 10, 5], round: 5 };
const FLAG = { air: 1, roll: 2, invuln: 4, gone: 8, out: 16, charge: 32, stun: 64 };

type State = 'alive' | 'gone' | 'out';
interface Fighter {
  id: string; weapon: WeaponId;
  x: number; y: number; vx: number; vy: number; ix: number; iy: number; fx: number; fy: number;
  dmg: number; lives: number; state: State; respawnAt: number;
  air: boolean; airMin: number; rollUntil: number; rollReady: number; invulnUntil: number; stunUntil: number; bumpUntil: number;
  charging: number | null; swingReady: number; altReady: number; fireHeld: boolean; nextShot: number;
  hitBy: string | null; hitAt: number; kos: number; place: number;
  botRelease: number; botRoll: number;
  pu: Record<string, number>; rollStock: number; rollRecharge: number; shots: number;
}
interface Shot { x: number; y: number; vx: number; vy: number; owner: string; until: number; big: boolean; bounces: number; pierce: boolean; hit: string[] }
type Ev = (string | number)[];

export default {
  create(ctx: GameContext) {
    const ids = ctx.players.map((p) => p.id);
    const N = ids.length;
    const scores = new Scores(ids);
    const total = Number(ctx.options.rounds) || 5;
    const controls = ctx.options.controls === 'gesten' ? 'gesten' : 'tasten';
    const weapons = new Map<string, WeaponId | null>(ids.map((id) => [id, null]));
    const fighters = new Map<string, Fighter>();
    let shots: Shot[] = [];
    let events: Ev[] = [];
    let arena: Arena = generateArena(N);
    let grid: string[] = arena.grid;
    let flow: number[] = [];
    let phase: 'intro' | 'weapon' | 'pick' | 'shop' | 'ready' | 'fight' | 'roundEnd' | 'final' = 'intro';
    const owned = new Map<string, Record<string, number>>(ids.map((id) => [id, {}]));
    const money = new Map<string, number>(ids.map((id) => [id, 0]));
    const offers = new Map<string, string[]>();
    const picked = new Map<string, string>();
    const shopOffers = new Map<string, string[]>();
    const shopBought = new Map<string, string[]>();
    const shopDone = new Set<string>();
    let phaseTimer: { deadline: number; duration: number } = { deadline: 0, duration: 0 };
    const n = (f: Fighter, id: string) => f.pu[id] ?? 0;
    const maxCharge = (f: Fighter) => HAMMER.maxCharge * 0.75 ** n(f, 'schnelllader');
    const rollCd = (f: Fighter) => COOLDOWN.roll * 0.75 ** n(f, 'schnellrolle');
    const altCd = (f: Fighter) => (f.weapon === 'hammer' ? COOLDOWN.stomp * 0.6 ** n(f, 'stampferplus') : COOLDOWN.bigShot * 0.6 ** n(f, 'ladeschussplus'));
    let round = 0;
    let t = 0;
    let loop = 0;
    let fireStart = 0;
    const fireDur = 40;
    let roundStart = scores.snapshot();
    let gains: Record<string, number> = {};
    const lastView = new Map<string, { json: string; at: number; screen: string }>();
    const isBot = (id: string) => !!ctx.player(id)?.isBot;

    /* ---------- Hilfen ---------- */

    const cellAt = (x: number, y: number) => grid[Math.floor(y / CELL)]?.[Math.floor(x / CELL)];
    const ringAt = (x: number, y: number) => {
      const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
      if (cx < 0 || cy < 0 || cx >= arena.cols || cy >= arena.rows) return 99;
      return arena.ring[cy * arena.cols + cx];
    };
    const fireR = () => {
      const k = Math.min(1, Math.max(0, (t - fireStart) / fireDur));
      return arena.ringMax + 1 - (arena.ringMax + 1 - 2.5) * k;
    };
    const burning = (x: number, y: number) => t >= fireStart && ringAt(x, y) > fireR();
    const withLives = () => ids.filter((id) => fighters.get(id)!.state !== 'out');
    const alive = () => ids.filter((id) => fighters.get(id)!.state === 'alive');

    /* ---------- Ablauf ---------- */

    function intro() {
      ctx.setHostView({ screen: 'intro', controls });
      ctx.setAllPlayerViews(() => ({ screen: 'intro' }));
      ctx.after(T.intro, chooseWeapons);
    }

    function chooseWeapons() {
      phase = 'weapon';
      for (const id of ids) if (isBot(id)) weapons.set(id, shuffle(WEAPONS)[0]);
      const timer = ctx.timer(T.weapon, finishWeapons);
      const show = () => {
        ctx.setHostView({ screen: 'weapon', ids, chosen: Object.fromEntries(weapons), deadline: timer.deadline, duration: timer.duration });
        ctx.setAllPlayerViews((p) => ({ screen: 'weapon', options: WEAPONS, chosen: weapons.get(p.id), deadline: timer.deadline, duration: timer.duration }));
      };
      showWeapons = show;
      show();
      if (ids.every((id) => weapons.get(id))) ctx.after(1.5, finishWeapons);
    }
    let showWeapons = () => {};

    function finishWeapons() {
      if (phase !== 'weapon') return;
      ctx.clearTimers();
      for (const id of ids) if (!weapons.get(id)) weapons.set(id, shuffle(WEAPONS)[0]);
      pickPhase(true);
    }

    function nextRound() {
      round++;
      if (round > total) return final();
      phase = 'ready';
      t = 0;
      shots = [];
      events = [];
      arena = generateArena(N);
      grid = arena.grid;
      flow = flowField();
      fireStart = 40 + 3 * N;
      const order = shuffle(ids);
      fighters.clear();
      order.forEach((id, i) => {
        const s = arena.spawns[i] ?? arena.spawns[0];
        fighters.set(id, {
          id, weapon: weapons.get(id) ?? 'hammer', x: s.x, y: s.y, vx: 0, vy: 0, ix: 0, iy: 0, fx: 1, fy: 0,
          dmg: 0, lives: 3 + ((owned.get(id) ?? {}).viertesleben ?? 0), state: 'alive', respawnAt: 0, air: false, airMin: 0, rollUntil: 0, rollReady: 0, invulnUntil: 0, stunUntil: 0, bumpUntil: 0,
          charging: null, swingReady: 0, altReady: 0, fireHeld: false, nextShot: 0, hitBy: null, hitAt: -9, kos: 0, place: 0, botRelease: 0, botRoll: 0,
          pu: owned.get(id) ?? {}, rollStock: 1 + ((owned.get(id) ?? {}).doppelrolle ?? 0), rollRecharge: 0, shots: 0,
        });
      });
      // Blickrichtung zur Mitte
      for (const f of fighters.values()) {
        const dx = arena.center.x - f.x, dy = arena.center.y - f.y, l = Math.hypot(dx, dy) || 1;
        f.fx = dx / l; f.fy = dy / l;
      }
      const startAt = Date.now() + T.ready * 1000;
      hostView({ startAt });
      lastView.clear();
      offers.clear();
      picked.clear();
      sendPlayerViews(true, startAt);
      stream();
      ctx.after(T.ready, fight);
    }

    function hostView(extra: object = {}) {
      ctx.setHostView({
        screen: 'arena', phase, round, total, ids,
        weapons: Object.fromEntries(ids.map((id) => [id, fighters.get(id)?.weapon ?? weapons.get(id)])),
        arena: { cols: arena.cols, rows: arena.rows, grid: arena.grid, walls: arena.walls, bumpers: arena.bumpers, ring: arena.ring, ringMax: arena.ringMax, center: arena.center, seed: arena.seed },
        fireStart, fireDur, cell: CELL, radius: PHY.radius,
        ...extra,
      });
    }

    function fight() {
      phase = 'fight';
      hostView({ startedAt: Date.now() });
      sendPlayerViews(true);
      const my = ++loop;
      const tick = () => {
        if (my !== loop || phase !== 'fight') return;
        step();
        ctx.after(TICK, tick);
      };
      ctx.after(TICK, tick);
    }

    /* ---------- Physik ---------- */

    function step() {
      t += TICK;
      for (const id of ids) if (isBot(id)) bot(fighters.get(id)!);

      for (const f of fighters.values()) {
        if (f.state === 'gone' && t >= f.respawnAt) respawn(f);
        if (f.state !== 'alive') continue;
        const maxStock = 1 + n(f, 'doppelrolle');
        if (f.rollStock < maxStock && t >= f.rollRecharge) { f.rollStock++; f.rollRecharge = t + rollCd(f); }
        const stunned = t < f.stunUntil;
        // Hammer lädt höchstens 2 s, dann schlägt er von selbst zu
        if (f.charging !== null && t - f.charging > 2) swing(f);
        const speed = PHY.accel * (1 + 0.1 * n(f, 'leichtfuss')) * (1 - 0.05 * n(f, 'brocken'));
        let ax = stunned ? 0 : f.ix * speed, ay = stunned ? 0 : f.iy * speed;
        if (f.charging !== null) { ax *= HAMMER.chargeSlow; ay *= HAMMER.chargeSlow; }
        const ice = cellAt(f.x, f.y) === 'i';
        if (f.air) { ax *= PHY.airControl; ay *= PHY.airControl; }
        else if (ice) { ax *= 0.45; ay *= 0.45; }
        f.vx += ax * TICK;
        f.vy += ay * TICK;
        const drag = f.air ? PHY.airDrag : ice ? 0.9 : PHY.drag;
        const damp = Math.exp(-drag * TICK);
        f.vx *= damp;
        f.vy *= damp;
        if (ice && !f.air) { // auf Eis höchstens normales Tempo
          const sp = Math.hypot(f.vx, f.vy), max = PHY.accel / PHY.drag;
          if (sp > max && Math.hypot(f.ix, f.iy) > 0.1) { f.vx *= max / sp; f.vy *= max / sp; }
        }
        // Am Rand festhalten: Laufen allein führt nie in den Abgrund (nur Fliegen und Rollen)
        const nx0 = f.x + f.vx * TICK, ny0 = f.y + f.vy * TICK;
        if (!f.air && !onGround(grid, nx0, ny0, PHY.radius * 0.95) && onGround(grid, f.x, f.y, PHY.radius * 0.95)) {
          if (onGround(grid, nx0, f.y, PHY.radius * 0.95)) { f.x = nx0; f.vy = 0; }
          else if (onGround(grid, f.x, ny0, PHY.radius * 0.95)) { f.y = ny0; f.vx = 0; }
          else { f.vx = 0; f.vy = 0; }
        } else {
          f.x = nx0;
          f.y = ny0;
        }
        if (Math.hypot(f.ix, f.iy) > 0.3 && f.charging === null && !f.air) {
          const l = Math.hypot(f.ix, f.iy);
          f.fx = f.ix / l; f.fy = f.iy / l;
        }
        // Säulen
        const gx = Math.floor(f.x / CELL), gy = Math.floor(f.y / CELL);
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
          if (grid[gy + oy]?.[gx + ox] !== T_PILLAR) continue;
          const px = (gx + ox + 0.5) * CELL, py = (gy + oy + 0.5) * CELL;
          const dx = f.x - px, dy = f.y - py, d = Math.hypot(dx, dy), min = PHY.radius + PHY.pillarR;
          if (d >= min || d === 0) continue;
          const nx = dx / d, ny = dy / d;
          f.x = px + nx * min; f.y = py + ny * min;
          const vn = f.vx * nx + f.vy * ny;
          if (vn < 0) {
            const hard = Math.hypot(f.vx, f.vy) > 300;
            f.vx -= (hard ? 1.6 : 1) * vn * nx;
            f.vy -= (hard ? 1.6 : 1) * vn * ny;
            if (hard && f.air) { f.stunUntil = t + 0.3; events.push(['wall', Math.round(f.x), Math.round(f.y)]); }
          }
        }
        // Wände: abprallen
        for (const w of arena.walls) {
          const [x1, y1, x2, y2] = w;
          const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy || 1;
          const k = Math.max(0, Math.min(1, ((f.x - x1) * dx + (f.y - y1) * dy) / l2));
          const cx = x1 + k * dx, cy = y1 + k * dy;
          const ox = f.x - cx, oy = f.y - cy, d = Math.hypot(ox, oy), min = PHY.radius + 3;
          if (d >= min) continue;
          const nx = d ? ox / d : -dy / Math.sqrt(l2), ny = d ? oy / d : dx / Math.sqrt(l2);
          f.x = cx + nx * min; f.y = cy + ny * min;
          const vn = f.vx * nx + f.vy * ny;
          if (vn < 0) {
            const fast = Math.hypot(f.vx, f.vy) > 260;
            const flip = f.hitBy && t - f.hitAt < 1.5 && fighters.get(f.hitBy)?.pu.flipper ? 2.6 : 1.8;
            f.vx -= (fast ? flip : 1) * vn * nx;
            f.vy -= (fast ? flip : 1) * vn * ny;
            if (fast) { if (f.air) f.stunUntil = t + 0.25; events.push(['wall', Math.round(cx), Math.round(cy)]); }
          }
        }
        // Prallkissen
        for (const b of arena.bumpers) {
          const dx = f.x - b.x, dy = f.y - b.y, d = Math.hypot(dx, dy);
          if (d >= PHY.radius + PHY.bumperR || t < f.bumpUntil) continue;
          const nx = d ? dx / d : 1, ny = d ? dy / d : 0;
          f.vx = nx * PHY.bumpSpeed; f.vy = ny * PHY.bumpSpeed;
          f.air = true; f.airMin = t + 0.15; f.bumpUntil = t + 0.3;
          events.push(['bump', Math.round(b.x), Math.round(b.y)]);
        }
        // Feuer: Schaden und Schubs zur Mitte
        if (!f.air && burning(f.x, f.y)) {
          const k = 0.5 ** n(f, 'feuerfest');
          f.dmg += PHY.fireDps * k * TICK;
          const dx = arena.center.x - f.x, dy = arena.center.y - f.y, l = Math.hypot(dx, dy) || 1;
          f.vx += (dx / l) * PHY.firePush * k * TICK;
          f.vy += (dy / l) * PHY.firePush * k * TICK;
        }
        // Landen
        if (f.air && t >= f.airMin && t >= f.rollUntil && Math.hypot(f.vx, f.vy) < PHY.landSpeed) f.air = false;
      }

      // Spieler untereinander: nur auseinanderschieben
      const live = alive();
      for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
        const a = fighters.get(live[i])!, b = fighters.get(live[j])!;
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = PHY.radius * 2;
        if (d >= min || d === 0) continue;
        const nx = dx / d, ny = dy / d, o = (min - d) / 2;
        a.x -= nx * o; a.y -= ny * o; b.x += nx * o; b.y += ny * o;
      }

      stepShots();

      // Runtergefallen?
      const before = withLives().length;
      const outNow: Fighter[] = [];
      for (const f of fighters.values()) {
        if (f.state !== 'alive' || f.air) continue;
        if (onGround(grid, f.x, f.y, PHY.radius * 0.95)) continue;
        fall(f);
        if ((f.state as State) === 'out') outNow.push(f);
      }
      if (outNow.length) {
        const place = before - outNow.length + 1;
        for (const f of outNow) f.place = place;
      }
      sendPlayerViews(false);
      stream();
      const left = withLives();
      if ((N > 1 && left.length <= 1) || (N === 1 && left.length === 0) || t >= fireStart + fireDur + 35) endRound();
    }

    function fall(f: Fighter) {
      f.lives--;
      f.charging = null;
      f.fireHeld = false;
      events.push(['fall', ids.indexOf(f.id), Math.round(f.x), Math.round(f.y)]);
      if (f.hitBy && f.hitBy !== f.id && t - f.hitAt < T.credit) {
        scores.add(f.hitBy, POINTS.knockout);
        gains[f.hitBy] = (gains[f.hitBy] ?? 0) + POINTS.knockout;
        const by = fighters.get(f.hitBy);
        money.set(f.hitBy, (money.get(f.hitBy) ?? 0) + MONEY.knockout);
        if (by) { by.kos++; by.dmg = Math.max(0, by.dmg - 20 * n(by, 'siegeshunger')); }
        events.push(['ko', ids.indexOf(f.hitBy), ids.indexOf(f.id)]);
      }
      f.hitBy = null;
      if (f.lives > 0) {
        f.state = 'gone';
        f.respawnAt = t + T.respawn;
      } else {
        f.state = 'out';
        if (round < total) offerPick(f.id); // wer raus ist, wählt schon sein Powerup
      }
    }

    function respawn(f: Fighter) {
      const r = fireR() - 1.5;
      const others = alive().map((id) => fighters.get(id)!);
      let best: [number, number] | null = null, bestD = -1;
      for (let y = 0; y < arena.rows; y++) for (let x = 0; x < arena.cols; x++) {
        const c = grid[y][x];
        if (c !== '#' && c !== 'i') continue;
        if (t >= fireStart && arena.ring[y * arena.cols + x] > r) continue;
        if (edgeDistance(grid, x, y) < 1) continue;
        const px = (x + 0.5) * CELL, py = (y + 0.5) * CELL;
        const d = others.length ? Math.min(...others.map((o) => Math.hypot(o.x - px, o.y - py))) : 0;
        const score = Math.min(d, CELL * 6) + Math.random() * CELL;
        if (score > bestD) { bestD = score; best = [px, py]; }
      }
      const [x, y] = best ?? [arena.center.x, arena.center.y];
      Object.assign(f, { x, y, vx: 0, vy: 0, dmg: 0, state: 'alive', air: false, invulnUntil: t + T.invuln, stunUntil: 0, charging: null, hitBy: null });
      events.push(['spawn', ids.indexOf(f.id)]);
    }

    /* ---------- Angriffe ---------- */

    function canAct(f: Fighter) {
      return phase === 'fight' && f.state === 'alive' && t >= f.stunUntil;
    }

    /** Blickrichtung mit leichter Zielhilfe (bis 30° zum nächsten Gegner in Reichweite) */
    function aim(f: Fighter, range: number) {
      let best: Fighter | null = null, bestD = range;
      for (const o of fighters.values()) {
        if (o === f || o.state !== 'alive') continue;
        const dx = o.x - f.x, dy = o.y - f.y, d = Math.hypot(dx, dy);
        if (d > bestD || d === 0) continue;
        if ((dx * f.fx + dy * f.fy) / d < Math.cos(Math.PI / 6)) continue;
        best = o; bestD = d;
      }
      if (best) {
        const dx = best.x - f.x, dy = best.y - f.y, d = Math.hypot(dx, dy);
        f.fx = dx / d; f.fy = dy / d;
      }
    }

    function hit(v: Fighter, by: Fighter, dmg: number, base: number, dx: number, dy: number) {
      if (v.state !== 'alive' || t < v.invulnUntil) return;
      v.dmg += dmg;
      const kb = base * PHY.kbMul * (1 + (v.dmg / 100) * PHY.kbScale) * (1 + 0.1 * n(by, 'wucht')) * 0.85 ** n(v, 'brocken');
      const l = Math.hypot(dx, dy) || 1;
      v.vx = (dx / l) * kb + v.vx * 0.2;
      v.vy = (dy / l) * kb + v.vy * 0.2;
      v.air = true;
      v.airMin = t + 0.12;
      v.stunUntil = t + 0.12 + kb / 2500;
      v.charging = null;
      v.hitBy = by.id;
      v.hitAt = t;
      events.push(['hit', Math.round(v.x), Math.round(v.y), Math.round(kb), ids.indexOf(v.id)]);
    }

    function swing(f: Fighter) {
      if (f.charging === null) return;
      const c = Math.min(1, (t - f.charging) / maxCharge(f));
      f.charging = null;
      f.swingReady = t + HAMMER.cooldown;
      aim(f, 120);
      const long = 1 + 0.2 * n(f, 'langerstiel');
      const reach = (PHY.radius + 18 + 8 * c) * long, r = (26 + 10 * c) * long;
      const hx = f.x + f.fx * reach, hy = f.y + f.fy * reach;
      const whirl = n(f, 'wirbelsturm') > 0 && c >= 0.6;
      events.push(['swing', ids.indexOf(f.id), Math.round(c * 100), whirl ? 1 : 0]);
      for (const o of fighters.values()) {
        if (o === f || o.state !== 'alive') continue;
        const inFront = Math.hypot(o.x - hx, o.y - hy) <= r + PHY.radius;
        const around = whirl && Math.hypot(o.x - f.x, o.y - f.y) <= reach + PHY.radius + 12;
        if (!inFront && !around) continue;
        const dx = o.x - f.x, dy = o.y - f.y, l = Math.hypot(dx, dy) || 1;
        hit(o, f, 7 + 11 * c, 150 + 260 * c, dx / l + (around ? 0 : f.fx * 0.6), dy / l + (around ? 0 : f.fy * 0.6));
        thorns(f, o);
      }
      if (n(f, 'erdbeben') > 0 && c >= 0.95) shockwave(f, 70, 4, 180);
    }

    /** Dornenhaut: wer im Nahkampf trifft, bekommt selbst Schaden */
    function thorns(attacker: Fighter, victim: Fighter) {
      const k = n(victim, 'dornen');
      if (k > 0 && victim.state === 'alive') attacker.dmg += 5 * k;
    }

    function shockwave(f: Fighter, radius: number, dmg: number, base: number) {
      events.push(['stomp', Math.round(f.x), Math.round(f.y), Math.round(radius)]);
      for (const o of fighters.values()) {
        if (o === f || o.state !== 'alive') continue;
        const dx = o.x - f.x, dy = o.y - f.y;
        if (Math.hypot(dx, dy) > radius + PHY.radius) continue;
        hit(o, f, dmg, base, dx, dy);
        thorns(f, o);
      }
    }

    function attackDown(f: Fighter) {
      if (!canAct(f)) return;
      if (f.weapon === 'hammer') {
        if (f.charging === null && t >= f.swingReady) f.charging = t;
      } else {
        f.fireHeld = true;
        if (t >= f.nextShot) shoot(f, false);
      }
    }

    function attackUp(f: Fighter) {
      if (f.weapon === 'hammer') { if (f.state === 'alive') swing(f); }
      else f.fireHeld = false;
    }

    function alt(f: Fighter) {
      if (!canAct(f) || t < f.altReady) return;
      f.altReady = t + altCd(f);
      if (f.weapon === 'hammer') {
        f.charging = null;
        f.stunUntil = t + 0.15;
        shockwave(f, HAMMER.stompR * (1 + 0.2 * n(f, 'stampferplus')), 6, 240);
      } else shoot(f, true);
    }

    function shoot(f: Fighter, big: boolean) {
      aim(f, 320);
      if (!big) {
        f.nextShot = t + SLING.every * 0.8 ** n(f, 'schnellfeuer');
        f.shots++;
        if (n(f, 'riesenkugel') > 0 && f.shots % 5 === 0) big = true;
      }
      const sp = big ? SLING.bigSpeed : SLING.speed;
      const life = (big ? SLING.bigLife : SLING.life) * (n(f, 'durchschlag') ? 1.5 : 1);
      const angles = n(f, 'streuschuss') ? [-0.21, 0, 0.21] : [0];
      for (const a of angles) {
        const dx = f.fx * Math.cos(a) - f.fy * Math.sin(a), dy = f.fx * Math.sin(a) + f.fy * Math.cos(a);
        shots.push({ x: f.x + dx * (PHY.radius + 6), y: f.y + dy * (PHY.radius + 6), vx: dx * sp, vy: dy * sp, owner: f.id, until: t + life, big, bounces: n(f, 'abpraller'), pierce: n(f, 'durchschlag') > 0, hit: [] });
      }
      events.push(['shot', ids.indexOf(f.id), big ? 1 : 0]);
    }

    function stepShots() {
      for (const f of fighters.values()) if (f.fireHeld && f.state === 'alive' && t >= f.nextShot && t >= f.stunUntil) shoot(f, false);
      const keep: Shot[] = [];
      for (const s of shots) {
        s.x += s.vx * TICK;
        s.y += s.vy * TICK;
        if (t > s.until || s.x < -CELL || s.y < -CELL || s.x > (arena.cols + 1) * CELL || s.y > (arena.rows + 1) * CELL) continue;
        // Säulen und Wände: abprallen (Abpraller) oder verschwinden
        let blocked = false;
        if (cellAt(s.x, s.y) === T_PILLAR) {
          const px = (Math.floor(s.x / CELL) + 0.5) * CELL, py = (Math.floor(s.y / CELL) + 0.5) * CELL;
          if (s.bounces > 0) {
            const l = Math.hypot(s.x - px, s.y - py) || 1, nx = (s.x - px) / l, ny = (s.y - py) / l, vn = s.vx * nx + s.vy * ny;
            s.vx -= 2 * vn * nx; s.vy -= 2 * vn * ny; s.x = px + nx * (PHY.pillarR + 6); s.y = py + ny * (PHY.pillarR + 6); s.bounces--;
          } else blocked = true;
        }
        const wall = arena.walls.find((w) => distToSegment(s.x, s.y, w) < 5);
        if (wall) {
          if (s.bounces > 0) {
            if (wall[0] === wall[2]) { s.vx = -s.vx; s.x += Math.sign(s.vx) * 6; } else { s.vy = -s.vy; s.y += Math.sign(s.vy) * 6; }
            s.bounces--;
          } else blocked = true;
        }
        if (blocked) continue;
        const r = s.big ? SLING.bigR : SLING.r;
        let used = false;
        for (const o of fighters.values()) {
          if (o.id === s.owner || o.state !== 'alive' || t < o.invulnUntil || s.hit.includes(o.id)) continue;
          if (Math.hypot(o.x - s.x, o.y - s.y) > r + PHY.radius) continue;
          const by = fighters.get(s.owner)!;
          hit(o, by, s.big ? 9 : 3, s.big ? 300 : 45, s.vx, s.vy);
          s.hit.push(o.id);
          if (!s.pierce) { used = true; break; }
        }
        if (!used) keep.push(s);
      }
      shots = keep;
    }

    function roll(f: Fighter) {
      if (!canAct(f) || f.rollStock <= 0 || t < f.rollUntil) return;
      if (f.rollStock === 1 + n(f, 'doppelrolle')) f.rollRecharge = t + rollCd(f);
      f.rollStock--;
      let dx = f.ix, dy = f.iy;
      if (Math.hypot(dx, dy) < 0.2) [dx, dy] = [f.fx, f.fy];
      const l = Math.hypot(dx, dy) || 1;
      f.vx = (dx / l) * PHY.roll;
      f.vy = (dy / l) * PHY.roll;
      f.air = true;
      f.airMin = t + PHY.rollTime;
      f.rollUntil = t + PHY.rollTime;
      f.invulnUntil = Math.max(f.invulnUntil, t + PHY.rollInvuln);
      f.charging = null;
      events.push(['roll', ids.indexOf(f.id)]);
    }

    /* ---------- Bots ---------- */

    /** Schritte bis zur Mitte für jedes begehbare Feld (Bots finden so den Weg zurück) */
    function flowField() {
      const out = new Array<number>(arena.cols * arena.rows).fill(-1);
      const cx = Math.floor(arena.center.x / CELL), cy = Math.floor(arena.center.y / CELL);
      const queue = [[cx, cy]];
      out[cy * arena.cols + cx] = 0;
      while (queue.length) {
        const [x, y] = queue.shift()!;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= arena.cols || ny >= arena.rows || !walkable(grid[ny][nx])) continue;
          const k = ny * arena.cols + nx;
          if (out[k] >= 0) continue;
          out[k] = out[y * arena.cols + x] + 1;
          queue.push([nx, ny]);
        }
      }
      return out;
    }

    /** Richtung zum nächsten Feld auf dem Weg zur Mitte */
    function homeDir(f: Fighter): [number, number] {
      const gx = Math.floor(f.x / CELL), gy = Math.floor(f.y / CELL);
      const here = flow[gy * arena.cols + gx] ?? -1;
      let tx = arena.center.x, ty = arena.center.y;
      if (here > 0) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = gx + dx, ny = gy + dy;
          if (nx < 0 || ny < 0 || nx >= arena.cols || ny >= arena.rows) continue;
          const v = flow[ny * arena.cols + nx];
          if (v >= 0 && v < here) { tx = (nx + 0.5) * CELL; ty = (ny + 0.5) * CELL; break; }
        }
      } else if (here === 0 || here === -1) {
        // auf der Mitte oder (in der Luft) über dem Abgrund: zur Feldmitte
        if (here === 0) { tx = (gx + 0.5) * CELL; ty = (gy + 0.5) * CELL; }
      }
      const l = Math.hypot(tx - f.x, ty - f.y) || 1;
      return [(tx - f.x) / l, (ty - f.y) / l];
    }

    function bot(f: Fighter) {
      if (f.state !== 'alive') return;
      let target: Fighter | null = null, best = Infinity;
      for (const o of fighters.values()) {
        if (o === f || o.state !== 'alive') continue;
        const d = Math.hypot(o.x - f.x, o.y - f.y);
        if (d < best) { best = d; target = o; }
      }
      let dx = 0, dy = 0;
      if (target) {
        dx = target.x - f.x; dy = target.y - f.y;
        if (f.weapon === 'schleuder') {
          if (best < 130) { dx = -dx; dy = -dy; }
          else if (best < 230) [dx, dy] = [-dy, dx];
        }
      }
      const l = Math.hypot(dx, dy) || 1;
      dx /= l; dy /= l;
      // Nicht in den Abgrund oder ins Feuer laufen
      const unsafe = (px: number, py: number) => !walkable(cellAt(px, py)) || burning(px, py);
      const risky = [14, 30, 46].some((k) => unsafe(f.x + dx * k, f.y + dy * k))
        || unsafe(f.x + f.vx * 0.25, f.y + f.vy * 0.25) || burning(f.x, f.y);
      if (risky) [dx, dy] = homeDir(f);
      f.ix = dx * 0.9 + (Math.random() - 0.5) * 0.12;
      f.iy = dy * 0.9 + (Math.random() - 0.5) * 0.12;
      if (!target) return;
      if (f.weapon === 'hammer') {
        if (f.charging === null && best < 60 && t >= f.swingReady && Math.random() < 0.3) { attackDown(f); f.botRelease = t + 0.05 + Math.random() * 0.9; }
        else if (f.charging !== null && t >= f.botRelease) attackUp(f);
        let near = 0;
        for (const o of fighters.values()) if (o !== f && o.state === 'alive' && Math.hypot(o.x - f.x, o.y - f.y) < HAMMER.stompR) near++;
        if (near >= 2 && t >= f.altReady && Math.random() < 0.1) alt(f);
      } else {
        f.fx = (target.x - f.x) / best; f.fy = (target.y - f.y) / best;
        if (best < 300 && !f.fireHeld) attackDown(f);
        else if (best >= 300 && f.fireHeld) attackUp(f);
        if (best < 250 && t >= f.altReady && Math.random() < 0.02) alt(f);
      }
      if (t >= f.botRoll && Math.random() < 0.004) { roll(f); f.botRoll = t + 3; }
    }

    /* ---------- Senden ---------- */

    function stream() {
      ctx.stream({
        round, t: Math.round(t * 100) / 100, fire: t >= fireStart ? Math.round(fireR() * 10) / 10 : null,
        p: ids.map((id) => {
          const f = fighters.get(id)!;
          const flags = (f.air ? FLAG.air : 0) | (t < f.rollUntil ? FLAG.roll : 0) | (t < f.invulnUntil ? FLAG.invuln : 0)
            | (f.state === 'gone' ? FLAG.gone : 0) | (f.state === 'out' ? FLAG.out : 0) | (f.charging !== null ? FLAG.charge : 0) | (t < f.stunUntil ? FLAG.stun : 0);
          const ang = Math.round((Math.atan2(f.fy, f.fx) * 180) / Math.PI);
          const charge = f.charging !== null ? Math.round(Math.min(1, (t - f.charging) / maxCharge(f)) * 100) : 0;
          return [Math.round(f.x), Math.round(f.y), ang, flags, Math.floor(f.dmg), f.lives, charge];
        }),
        s: shots.map((s) => [Math.round(s.x), Math.round(s.y), s.big ? 1 : 0]),
        e: events,
      });
      events = [];
    }

    function playerView(id: string, startAt?: number) {
      const f = fighters.get(id)!;
      return {
        screen: 'play', live: phase === 'fight', startAt, round, total, weapon: f.weapon, controls,
        dmg: Math.floor(f.dmg), lives: f.lives, state: f.state, place: f.place,
        respawnAt: f.state === 'gone' ? Date.now() + (f.respawnAt - t) * 1000 : undefined,
        kos: f.kos, color: ctx.player(id)?.color,
        rollCd: Math.round(rollCd(f) * 100) / 100, altCd: Math.round(altCd(f) * 100) / 100, rolls: 1 + n(f, 'doppelrolle'),
      };
    }

    function sendPlayerViews(force: boolean, startAt?: number) {
      const now = Date.now();
      for (const id of ids) {
        if (offers.has(id)) continue; // wählt schon sein Powerup
        const v = playerView(id, startAt);
        const { respawnAt, ...comparable } = v;
        const json = JSON.stringify(comparable);
        const last = lastView.get(id);
        if (!force && last && last.json === json) continue;
        const stateChanged = !last || last.screen !== v.state;
        if (!force && !stateChanged && now - last.at < 150) continue;
        lastView.set(id, { json, at: now, screen: v.state });
        ctx.setPlayerView(id, v);
      }
    }

    function endRound() {
      phase = 'roundEnd';
      loop++;
      // Wer noch Leben hat: nach Leben, dann nach wenig Schaden sortiert
      const left = withLives().map((id) => fighters.get(id)!).sort((a, b) => b.lives - a.lives || a.dmg - b.dmg);
      left.forEach((f, i) => (f.place = i + 1));
      const winners = left.filter((f) => f.place === 1).map((f) => f.id);
      for (const f of fighters.values()) {
        const pts = f.place >= 1 && f.place <= 3 && (f.place === 1 || N >= f.place + 1) ? POINTS.place[f.place - 1] : 0;
        if (pts) { scores.add(f.id, pts); gains[f.id] = (gains[f.id] ?? 0) + pts; }
        const m = MONEY.round + (f.place >= 1 && f.place <= 3 ? MONEY.place[f.place - 1] : 0);
        money.set(f.id, (money.get(f.id) ?? 0) + m);
      }
      stream();
      hostView({ winners, places: Object.fromEntries(ids.map((id) => [id, fighters.get(id)!.place])), kos: Object.fromEntries(ids.map((id) => [id, fighters.get(id)!.kos])) });
      ctx.setAllPlayerViews((p) => {
        const f = fighters.get(p.id)!;
        return { screen: 'roundEnd', won: winners.includes(p.id), place: f.place, kos: f.kos, gain: gains[p.id] ?? 0, score: scores.get(p.id), money: money.get(p.id) ?? 0, round, total };
      });
      ctx.after(T.roundEnd, () => (round < total ? pickPhase(false) : final()));
    }

    /* ---------- Powerups und Shop ---------- */

    function offerFor(id: string, start: boolean) {
      if (offers.has(id)) return;
      const best = Math.max(0, ...ids.map((x) => scores.get(x)));
      const chances = rarityChances(start ? 0 : round, scores.get(id), best);
      const list = drawPowerups({ weapon: weapons.get(id) ?? 'hammer', owned: owned.get(id) ?? {}, chances, count: 3, weaponFirst: true, onlyWeapon: start });
      offers.set(id, list);
      if (isBot(id) && list.length) choose(id, list[Math.floor(Math.random() * list.length)]);
    }

    /** Ausgeschiedene wählen schon während der Runde */
    function offerPick(id: string) {
      offerFor(id, false);
      sendPick(id, false);
    }

    function sendPick(id: string, start: boolean) {
      ctx.setPlayerView(id, {
        screen: 'pick', start, offers: offers.get(id) ?? [], picked: picked.get(id) ?? null, weapon: weapons.get(id),
        owned: owned.get(id) ?? {}, money: money.get(id) ?? 0, deadline: phase === 'pick' ? phaseTimer.deadline : undefined, duration: phase === 'pick' ? phaseTimer.duration : undefined,
      });
    }

    let pickStart = false;
    function pickPhase(start: boolean) {
      phase = 'pick';
      pickStart = start;
      ctx.clearTimers();
      for (const id of ids) offerFor(id, start);
      const timer = ctx.timer(T.pick, finishPick);
      phaseTimer = { deadline: timer.deadline, duration: timer.duration };
      showPick(true);
      for (const id of ids) sendPick(id, start);
      if (ids.every((id) => picked.has(id) || !(offers.get(id) ?? []).length)) ctx.after(1.5, finishPick);
    }

    function showPick(first = false) {
      ctx.setHostView({
        screen: 'pick', start: pickStart, round, total, ids,
        before: roundStart, after: scores.snapshot(), gains, animate: first,
        chosen: Object.fromEntries(ids.map((id) => [id, picked.has(id)])), deadline: phaseTimer.deadline, duration: phaseTimer.duration,
      });
    }

    function choose(id: string, pu: string) {
      if (picked.has(id) || !(offers.get(id) ?? []).includes(pu)) return;
      picked.set(id, pu);
      const o = owned.get(id)!;
      o[pu] = (o[pu] ?? 0) + 1;
    }

    function finishPick() {
      if (phase !== 'pick') return;
      phase = 'roundEnd';
      ctx.clearTimers();
      // Wer nicht gewählt hat, bekommt das erste Angebot
      for (const id of ids) if (!picked.has(id) && offers.get(id)?.length) choose(id, offers.get(id)![0]);
      roundStart = scores.snapshot();
      gains = {};
      if (!pickStart && round % 4 === 0 && round < total) shopPhase();
      else nextRound();
    }

    function shopPhase() {
      phase = 'shop';
      shopDone.clear();
      for (const id of ids) {
        const chances = rarityChances(round, 0, 0);
        shopOffers.set(id, drawPowerups({ weapon: weapons.get(id) ?? 'hammer', owned: owned.get(id) ?? {}, chances, count: 6, weaponFirst: true }));
        shopBought.set(id, []);
        if (isBot(id)) {
          for (const pu of shuffle(shopOffers.get(id)!)) buy(id, pu);
          shopDone.add(id);
        }
      }
      const timer = ctx.timer(T.shop, finishShop);
      phaseTimer = { deadline: timer.deadline, duration: timer.duration };
      for (const id of ids) sendShop(id);
      showShop();
      if (shopDone.size === ids.length) ctx.after(1.5, finishShop);
    }

    function sendShop(id: string) {
      ctx.setPlayerView(id, {
        screen: 'shop', offers: shopOffers.get(id) ?? [], bought: shopBought.get(id) ?? [], money: money.get(id) ?? 0, owned: owned.get(id) ?? {},
        weapon: weapons.get(id), done: shopDone.has(id), deadline: phaseTimer.deadline, duration: phaseTimer.duration,
      });
    }

    function showShop() {
      ctx.setHostView({
        screen: 'shop', round, total, ids, deadline: phaseTimer.deadline, duration: phaseTimer.duration,
        done: Object.fromEntries(ids.map((id) => [id, shopDone.has(id)])),
        bought: Object.fromEntries(ids.map((id) => [id, (shopBought.get(id) ?? []).length])),
      });
    }

    function buy(id: string, pu: string) {
      const def = POWERUP[pu];
      const list = shopOffers.get(id) ?? [];
      const bought = shopBought.get(id) ?? [];
      const o = owned.get(id)!;
      if (!def || !list.includes(pu) || bought.includes(pu)) return false;
      if (def.max !== undefined && (o[pu] ?? 0) >= def.max) return false;
      const cash = money.get(id) ?? 0;
      if (cash < PRICE[def.rarity]) return false;
      money.set(id, cash - PRICE[def.rarity]);
      o[pu] = (o[pu] ?? 0) + 1;
      bought.push(pu);
      shopBought.set(id, bought);
      return true;
    }

    function finishShop() {
      if (phase !== 'shop') return;
      phase = 'roundEnd';
      ctx.clearTimers();
      nextRound();
    }

    function final() {
      phase = 'final';
      const ranking = scores.ranking();
      ctx.setHostView({ screen: 'final', ranking });
      ctx.setAllPlayerViews((p) => ({ screen: 'finalMe', score: scores.get(p.id), place: ranking.filter((x) => x.score > scores.get(p.id)).length + 1, of: ranking.length }));
      ctx.finish(ranking);
    }

    return {
      start: intro,
      onAction(id, action) {
        if (!action || typeof action !== 'object') return;
        if (action.type === 'weapon') {
          if (phase !== 'weapon' || !WEAPONS.includes(action.weapon)) return;
          weapons.set(id, action.weapon);
          showWeapons();
          if (ids.every((x) => weapons.get(x))) ctx.after(1.5, finishWeapons);
          return;
        }
        if (action.type === 'pick') {
          if (!offers.has(id) || picked.has(id)) return;
          choose(id, String(action.id));
          sendPick(id, phase === 'pick' && pickStart);
          if (phase === 'pick') {
            showPick();
            if (ids.every((x) => picked.has(x) || !(offers.get(x) ?? []).length)) ctx.after(1.2, finishPick);
          }
          return;
        }
        if (phase === 'shop' && (action.type === 'buy' || action.type === 'reroll' || action.type === 'shopDone')) {
          if (shopDone.has(id)) return;
          if (action.type === 'buy') buy(id, String(action.id));
          else if (action.type === 'reroll') {
            const cash = money.get(id) ?? 0;
            if (cash >= REROLL_PRICE) {
              money.set(id, cash - REROLL_PRICE);
              shopOffers.set(id, drawPowerups({ weapon: weapons.get(id) ?? 'hammer', owned: owned.get(id) ?? {}, chances: rarityChances(round, 0, 0), count: 6, weaponFirst: true }));
              shopBought.set(id, []);
            }
          } else shopDone.add(id);
          sendShop(id);
          showShop();
          if (shopDone.size === ids.length) ctx.after(1.2, finishShop);
          return;
        }
        const f = fighters.get(id);
        if (!f || phase !== 'fight') { if (f && action.type === 'input') { f.ix = 0; f.iy = 0; } return; }
        switch (action.type) {
          case 'input': {
            let x = Number(action.x) || 0, y = Number(action.y) || 0;
            const len = Math.hypot(x, y);
            if (len > 1) [x, y] = [x / len, y / len];
            f.ix = x; f.iy = y;
            break;
          }
          case 'a': action.down ? attackDown(f) : attackUp(f); break;
          case 'roll': roll(f); break;
          case 'alt': alt(f); break;
        }
      },
      onPlayerRejoin(id) {
        lastView.delete(id);
        if (offers.has(id) && (phase === 'pick' || phase === 'fight')) sendPick(id, pickStart && phase === 'pick');
        if (phase === 'shop') sendShop(id);
      },
      dispose() {
        loop++;
      },
    };
  },
} satisfies GameServerModule;
