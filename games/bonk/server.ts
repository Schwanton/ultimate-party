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
import { BELTS, CELL, COOLDOWN, T_BROKEN, T_CRUMBLE, T_PILLAR, WALL_HALF, WEAPONS, distToSegment, edgeDistance, generateArena, onGround, walkable, type Arena, type WeaponId } from './arena';

const TICK = 1 / 30;
const T = { intro: 8, weapon: 20, pick: 20, shop: 45, ready: 3, roundEnd: 5, scores: 6, respawn: 2.2, invuln: 1.5, credit: 3 };
const PHY = {
  radius: 15, accel: 1500, drag: 7, airDrag: 2.4, airControl: 0.15, landSpeed: 150,
  roll: 480, rollTime: 0.28, rollInvuln: 0.25, pillarR: 17, bumperR: 20, bumpSpeed: 560,
  kbScale: 1.2, kbMul: 0.72, dmgMul: 0.8, fireDps: 10, firePush: 900, padSpeed: 720, beltPush: 1100,
};
const HAMMER = { maxCharge: 1.2, cooldown: 0.35, chargeSlow: 0.45, stompR: 78 };
const SLING = { every: 0.4, speed: 560, life: 0.6, r: 6, bigSpeed: 460, bigLife: 0.85, bigR: 10 };
const POINTS = { knockout: 100, place: [300, 150, 75] };
const MONEY = { knockout: 10, place: [15, 10, 5], round: 5 };
const WEAPON_PRICE = 50;
const FLAG = { air: 1, roll: 2, invuln: 4, gone: 8, out: 16, charge: 32, stun: 64, block: 128, meteor: 256 };
const HOOK = { speed: 760, range: 300, cooldown: 0.9, pull: 420 };
const BOMB = { speed: 350, flight: 0.4, fuse: 1.5, radius: 70, cooldown: 0.6, max: 2 };
const SWORD = { gap: 0.22, finisher: 0.4, comboWindow: 0.8, reach: 20, r: 30 };
const BOOM = { speed: 560, back: 600, range: 260, life: 3 };

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
  combo: number; comboAt: number; blocking: boolean; blockStart: number;
  weapon2: WeaponId | null; special: number; meteorUntil: number; hailUntil: number; nextHail: number; spinUntil: number; nextSpin: number;
  stormUntil: number; stormHit: Record<string, number>; padUntil: number; teleUntil: number;
}
interface Shot { x: number; y: number; vx: number; vy: number; owner: string; until: number; big: boolean; bounces: number; pierce: boolean; hit: string[]; dmg: number; base: number; kind: number }
interface Hook { owner: string; x: number; y: number; vx: number; vy: number; dist: number; max: number; mode: 'pull' | 'push' }
interface Bomb { owner: string; x: number; y: number; vx: number; vy: number; landAt: number; fuseAt: number; stuck: string | null; flying: boolean; gone?: boolean; big?: boolean }
interface Boom { owner: string; x: number; y: number; vx: number; vy: number; back: boolean; traveled: number; range: number; until: number; hitOut: string[]; hitBack: string[] }
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
    let hooks: Hook[] = [];
    let bombs: Bomb[] = [];
    let booms: Boom[] = [];
    const weaponOpts = new Map<string, WeaponId[]>(ids.map((id) => [id, shuffle(WEAPONS).slice(0, 3)]));
    const weapon2 = new Map<string, WeaponId | null>(ids.map((id) => [id, null]));
    let nextArena: Arena | null = null;
    let crumbleAt = new Map<number, number>(); // Feld → wann es bricht
    let brokenUntil = new Map<number, number>(); // Feld → wann es wiederkommt
    const lastRound = () => round === total;
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
    const altCd = (f: Fighter) => {
      switch (f.weapon) {
        case 'hammer': return COOLDOWN.stomp * 0.6 ** n(f, 'stampferplus');
        case 'schleuder': return COOLDOWN.bigShot * 0.6 ** n(f, 'ladeschussplus');
        case 'haken': return COOLDOWN.pushHook;
        case 'bomben': return COOLDOWN.detonate;
        default: return 0;
      }
    };
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
      for (const id of ids) if (isBot(id)) weapons.set(id, shuffle(weaponOpts.get(id)!)[0]);
      const timer = ctx.timer(T.weapon, finishWeapons);
      const show = () => {
        ctx.setHostView({ screen: 'weapon', ids, chosen: Object.fromEntries(weapons), deadline: timer.deadline, duration: timer.duration });
        ctx.setAllPlayerViews((p) => ({ screen: 'weapon', options: weaponOpts.get(p.id) ?? WEAPONS, chosen: weapons.get(p.id), deadline: timer.deadline, duration: timer.duration }));
      };
      showWeapons = show;
      show();
      if (ids.every((id) => weapons.get(id))) ctx.after(1.5, finishWeapons);
    }
    let showWeapons = () => {};

    function finishWeapons() {
      if (phase !== 'weapon') return;
      ctx.clearTimers();
      for (const id of ids) if (!weapons.get(id)) weapons.set(id, shuffle(weaponOpts.get(id)!)[0]);
      pickPhase(true);
    }

    function nextRound() {
      round++;
      if (round > total) return final();
      phase = 'ready';
      t = 0;
      shots = [];
      hooks = [];
      bombs = [];
      booms = [];
      events = [];
      arena = nextArena ?? generateArena(N);
      nextArena = null;
      grid = arena.grid.slice();
      crumbleAt = new Map();
      brokenUntil = new Map();
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
          combo: 0, comboAt: -9, blocking: false, blockStart: 0,
          weapon2: weapon2.get(id) ?? null, special: 0, meteorUntil: 0, hailUntil: 0, nextHail: 0, spinUntil: 0, nextSpin: 0,
          stormUntil: 0, stormHit: {}, padUntil: 0, teleUntil: 0,
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
        arena: { cols: arena.cols, rows: arena.rows, grid: arena.grid, walls: arena.walls, bumpers: arena.bumpers, pads: arena.pads, teleports: arena.teleports, ring: arena.ring, ringMax: arena.ringMax, center: arena.center, seed: arena.seed },
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
        if (f.blocking) { const k = n(f, 'dickerschild') ? 0.75 : 0.5; ax *= k; ay *= k; }
        const ice = cellAt(f.x, f.y) === 'i';
        if (f.air) { ax *= PHY.airControl; ay *= PHY.airControl; }
        else if (ice) { ax *= 0.45; ay *= 0.45; }
        f.vx += ax * TICK;
        f.vy += ay * TICK;
        if (t < f.meteorUntil) { ax = 0; ay = 0; }
        const belt = !f.air ? BELTS[cellAt(f.x, f.y) ?? ''] : undefined;
        if (belt) { ax += belt[0] * PHY.beltPush; ay += belt[1] * PHY.beltPush; }
        const drag = t < f.meteorUntil ? 0 : f.air ? PHY.airDrag : ice ? 0.9 : PHY.drag;
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
        if (Math.hypot(f.ix, f.iy) > 0.3 && f.charging === null && !f.air && !f.blocking) {
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
          const ox = f.x - cx, oy = f.y - cy, d = Math.hypot(ox, oy), min = PHY.radius + WALL_HALF;
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
        // Sprungpilze
        for (const pd of arena.pads) {
          if (f.air || t < f.padUntil || Math.hypot(f.x - pd.x, f.y - pd.y) > PHY.radius + 12) continue;
          let dx = f.ix, dy = f.iy;
          if (Math.hypot(dx, dy) < 0.2) [dx, dy] = [f.vx, f.vy];
          if (Math.hypot(dx, dy) < 1e-3) [dx, dy] = [f.fx, f.fy];
          const l = Math.hypot(dx, dy) || 1;
          f.vx = (dx / l) * PHY.padSpeed; f.vy = (dy / l) * PHY.padSpeed;
          f.air = true; f.airMin = t + 0.35; f.padUntil = t + 0.7;
          events.push(['pad', Math.round(pd.x), Math.round(pd.y)]);
        }
        // Teleporter
        for (const tp of arena.teleports) {
          if (f.air || t < f.teleUntil) continue;
          const atA = Math.hypot(f.x - tp.ax, f.y - tp.ay) < 16, atB = Math.hypot(f.x - tp.bx, f.y - tp.by) < 16;
          if (!atA && !atB) continue;
          events.push(['tele', Math.round(f.x), Math.round(f.y)]);
          [f.x, f.y] = atA ? [tp.bx, tp.by] : [tp.ax, tp.ay];
          f.teleUntil = t + 1.2;
          events.push(['tele', Math.round(f.x), Math.round(f.y)]);
        }
        // Bröckelplatten
        if (!f.air) {
          const gx = Math.floor(f.x / CELL), gy = Math.floor(f.y / CELL), k = gy * arena.cols + gx;
          if (grid[gy]?.[gx] === T_CRUMBLE && !crumbleAt.has(k)) crumbleAt.set(k, t + 0.9);
        }
        // Feuer: Schaden und Schubs zur Mitte
        if (!f.air && burning(f.x, f.y)) {
          const k = 0.5 ** n(f, 'feuerfest');
          f.dmg += PHY.fireDps * k * TICK;
        }
        // Meteorsprung landet
        if (f.meteorUntil && t >= f.meteorUntil) {
          f.meteorUntil = 0; f.vx = 0; f.vy = 0; f.air = false;
          shockwave(f, 100, 10, 360);
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

      stepCrumble();
      stepSpecials();
      stepShots();
      stepHooks();
      stepBombs();
      stepBooms();

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
        const pts = POINTS.knockout * (lastRound() ? 2 : 1);
        scores.add(f.hitBy, pts);
        gains[f.hitBy] = (gains[f.hitBy] ?? 0) + pts;
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
        if (c !== '#' && c !== 'i' && c !== 'g') continue;
        if (t >= fireStart && arena.ring[y * arena.cols + x] > r) continue;
        if (edgeDistance(grid, x, y) < 1) continue;
        const px = (x + 0.5) * CELL, py = (y + 0.5) * CELL;
        const obstacles = [...arena.bumpers, ...arena.pads, ...arena.teleports.flatMap((tp) => [{ x: tp.ax, y: tp.ay }, { x: tp.bx, y: tp.by }])];
        if (obstacles.some((o) => Math.hypot(o.x - px, o.y - py) < CELL * 1.6)) continue;
        if (arena.walls.some((w) => distToSegment(px, py, w) < CELL * 0.75)) continue;
        if (bombs.some((b) => Math.hypot(b.x - px, b.y - py) < CELL * 2)) continue;
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

    /** Schild: Treffer von vorn werden abgeblockt */
    function blocks(v: Fighter, dx: number, dy: number) {
      if (!v.blocking || v.state !== 'alive') return false;
      const l = Math.hypot(dx, dy) || 1;
      const arc = ((70 + 30 * n(v, 'dickerschild')) * Math.PI) / 180;
      return (-dx * v.fx - dy * v.fy) / l > Math.cos(arc);
    }

    function hit(v: Fighter, by: Fighter, dmg: number, base: number, dx: number, dy: number, counter = false) {
      if (v.state !== 'alive' || t < v.invulnUntil) return;
      if (by !== v && blocks(v, dx, dy)) {
        events.push(['block', Math.round(v.x + v.fx * 18), Math.round(v.y + v.fy * 18)]);
        if (n(v, 'konter') && t - v.blockStart < 0.3 && !counter) hit(by, v, 3, 320, -dx, -dy, true);
        dmg = 0;
        base *= 0.2;
      }
      dmg *= PHY.dmgMul;
      if (by !== v && n(by, 'spezial')) by.special = Math.min(100, by.special + dmg / 1.2);
      v.dmg += dmg;
      const kb = base * PHY.kbMul * (1 + (v.dmg / 100) * PHY.kbScale) * (1 + 0.1 * n(by, 'wucht')) * 0.85 ** n(v, 'brocken');
      const l = Math.hypot(dx, dy) || 1;
      v.vx = (dx / l) * kb + v.vx * 0.2;
      v.vy = (dy / l) * kb + v.vy * 0.2;
      v.air = true;
      v.airMin = t + 0.12;
      // kein Betäuben bei Treffern (seit 0.25.2)
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

    function attackDown(f: Fighter, w: WeaponId = f.weapon) {
      if (!canAct(f)) return;
      switch (w) {
        case 'hammer':
          if (f.charging === null && t >= f.swingReady) f.charging = t;
          break;
        case 'schleuder':
          f.fireHeld = true;
          if (t >= f.nextShot) shoot(f, false);
          break;
        case 'haken':
          if (t >= f.swingReady && !hooks.some((h) => h.owner === f.id)) { throwHook(f, 'pull'); f.swingReady = t + HOOK.cooldown * 0.6 ** n(f, 'doppelhaken'); }
          break;
        case 'bomben':
          if (t >= f.swingReady && bombs.filter((b) => b.owner === f.id).length < BOMB.max + 2 * n(f, 'minenleger')) { throwBomb(f); f.swingReady = t + BOMB.cooldown; }
          break;
        case 'schwert':
          slash(f);
          break;
        case 'bumerang':
          if (booms.filter((b) => b.owner === f.id).length < 1 + n(f, 'doppelbumerang')) throwBoom(f);
          break;
      }
    }

    function attackUp(f: Fighter, w: WeaponId = f.weapon) {
      if (w === 'hammer') { if (f.state === 'alive') swing(f); }
      else if (w === 'schleuder') f.fireHeld = false;
    }

    /** Zweite Waffe (aus dem Shop): eigene Taste. Bei Schwert und Schild nur das Schild. */
    function second(f: Fighter, down: boolean) {
      const w = f.weapon2;
      if (!w) return;
      if (w === 'schwert') return shield(f, down);
      if (down) attackDown(f, w); else attackUp(f, w);
    }

    function shield(f: Fighter, down: boolean) {
      if (down && canAct(f)) { f.blocking = true; f.blockStart = t; }
      else if (!down) f.blocking = false;
    }

    /* ---------- Spezialangriff (Ladeleiste) ---------- */

    function special(f: Fighter) {
      if (!n(f, 'spezial') || f.special < 100 || !canAct(f)) return;
      f.special = 0;
      events.push(['special', ids.indexOf(f.id)]);
      switch (f.weapon) {
        case 'hammer': { // Meteorsprung
          const dist = 210;
          f.vx = f.fx * dist / 0.55; f.vy = f.fy * dist / 0.55;
          f.air = true; f.airMin = t + 0.55; f.meteorUntil = t + 0.55; f.invulnUntil = Math.max(f.invulnUntil, t + 0.55); f.charging = null;
          break;
        }
        case 'schleuder': f.hailUntil = t + 2; f.nextHail = t; break;
        case 'haken': // Kettenzug: alle in Reichweite heranziehen
          for (const v of fighters.values()) {
            if (v === f || v.state !== 'alive') continue;
            const dx = f.x - v.x, dy = f.y - v.y, l = Math.hypot(dx, dy);
            if (l > 280 || l === 0) continue;
            hit(v, f, 4, 0, -dx, -dy);
            v.vx = (dx / l) * (HOOK.pull + l * 0.8); v.vy = (dy / l) * (HOOK.pull + l * 0.8); v.air = true; v.airMin = t + 0.2;
            events.push(['grab', Math.round(v.x), Math.round(v.y)]);
          }
          break;
        case 'bomben':
          aim(f, 220);
          bombs.push({ owner: f.id, x: f.x + f.fx * PHY.radius, y: f.y + f.fy * PHY.radius, vx: f.fx * BOMB.speed, vy: f.fy * BOMB.speed, landAt: t + BOMB.flight, fuseAt: t + 2.2, stuck: null, flying: true, big: true });
          break;
        case 'schwert': f.spinUntil = t + 1.5; f.nextSpin = t; f.blocking = false; break;
        case 'bumerang': f.stormUntil = t + 3; f.stormHit = {}; break;
      }
    }

    function stepSpecials() {
      for (const f of fighters.values()) {
        if (f.state !== 'alive') { f.hailUntil = 0; f.spinUntil = 0; f.stormUntil = 0; continue; }
        if (t < f.hailUntil && t >= f.nextHail) {
          f.nextHail = t + 0.12;
          for (const a of [-0.25, 0, 0.25]) {
            const dx = f.fx * Math.cos(a) - f.fy * Math.sin(a), dy = f.fx * Math.sin(a) + f.fy * Math.cos(a);
            shots.push({ x: f.x + dx * (PHY.radius + 6), y: f.y + dy * (PHY.radius + 6), vx: dx * SLING.speed, vy: dy * SLING.speed, owner: f.id, until: t + SLING.life, big: false, bounces: 0, pierce: false, hit: [], dmg: 2, base: 45, kind: 0 });
          }
        }
        if (t < f.spinUntil && t >= f.nextSpin) {
          f.nextSpin = t + 0.25;
          events.push(['swing', ids.indexOf(f.id), 60, 1]);
          for (const o of fighters.values()) {
            if (o === f || o.state !== 'alive') continue;
            const dx = o.x - f.x, dy = o.y - f.y;
            if (Math.hypot(dx, dy) > PHY.radius * 2 + 38) continue;
            hit(o, f, 4, 200, dx, dy);
          }
        }
        if (t < f.stormUntil) {
          for (let k = 0; k < 3; k++) {
            const a = t * 6 + (k * Math.PI * 2) / 3, bx = f.x + Math.cos(a) * 55, by = f.y + Math.sin(a) * 55;
            for (const o of fighters.values()) {
              if (o === f || o.state !== 'alive' || t < (f.stormHit[o.id] ?? 0)) continue;
              if (Math.hypot(o.x - bx, o.y - by) > PHY.radius + 12) continue;
              f.stormHit[o.id] = t + 0.4;
              hit(o, f, 5, 200, o.x - f.x, o.y - f.y);
            }
          }
        }
      }
    }

    /* ---------- Bröckelplatten ---------- */

    function setCell(k: number, ch: string) {
      const x = k % arena.cols, y = Math.floor(k / arena.cols);
      grid[y] = grid[y].slice(0, x) + ch + grid[y].slice(x + 1);
    }

    function stepCrumble() {
      for (const [k, at] of crumbleAt) {
        if (t < at) continue;
        crumbleAt.delete(k);
        setCell(k, T_BROKEN);
        brokenUntil.set(k, t + 8);
        events.push(['crumble', k]);
      }
      for (const [k, at] of brokenUntil) {
        if (t < at) continue;
        brokenUntil.delete(k);
        setCell(k, T_CRUMBLE);
      }
    }

    function alt(f: Fighter, down = true) {
      if (f.weapon === 'schwert') return shield(f, down); // Schild: halten
      if (!down || !canAct(f) || t < f.altReady) return;
      if (f.weapon === 'bumerang') { for (const b of booms) if (b.owner === f.id) b.back = true; return; }
      f.altReady = t + altCd(f);
      if (f.weapon === 'hammer') {
        f.charging = null;
        f.stunUntil = t + 0.15;
        shockwave(f, HAMMER.stompR * (1 + 0.2 * n(f, 'stampferplus')), 6, 240);
      } else if (f.weapon === 'schleuder') shoot(f, true);
      else if (f.weapon === 'haken') { hooks = hooks.filter((h) => h.owner !== f.id); throwHook(f, 'push'); }
      else if (f.weapon === 'bomben') for (const b of bombs) if (b.owner === f.id) b.fuseAt = Math.min(b.fuseAt, t);
    }

    /* ---------- Enterhaken ---------- */

    function throwHook(f: Fighter, mode: 'pull' | 'push') {
      aim(f, 320);
      hooks.push({ owner: f.id, x: f.x + f.fx * PHY.radius, y: f.y + f.fy * PHY.radius, vx: f.fx * HOOK.speed, vy: f.fy * HOOK.speed, dist: 0, max: HOOK.range * (1 + 0.3 * n(f, 'stahlseil')), mode });
      events.push(['hook', ids.indexOf(f.id)]);
    }

    function stepHooks() {
      const keep: Hook[] = [];
      for (const h of hooks) {
        const o = fighters.get(h.owner)!;
        if (o.state !== 'alive') continue;
        h.x += h.vx * TICK; h.y += h.vy * TICK; h.dist += HOOK.speed * TICK;
        const solid = cellAt(h.x, h.y) === T_PILLAR || arena.walls.some((w) => distToSegment(h.x, h.y, w) < WALL_HALF + 2);
        if (solid) {
          if (h.mode === 'pull') { // sich zur Wand ziehen
            const dx = h.x - o.x, dy = h.y - o.y, l = Math.hypot(dx, dy) || 1;
            o.vx = (dx / l) * 680; o.vy = (dy / l) * 680; o.air = true; o.airMin = t + 0.15; o.charging = null;
            events.push(['grab', Math.round(h.x), Math.round(h.y)]);
          }
          continue;
        }
        let used = false;
        for (const v of fighters.values()) {
          if (v === o || v.state !== 'alive' || t < v.invulnUntil) continue;
          if (Math.hypot(v.x - h.x, v.y - h.y) > PHY.radius + 6) continue;
          if (h.mode === 'push') hit(v, o, 6, 330, h.vx, h.vy);
          else if (blocks(v, h.vx, h.vy)) hit(v, o, 0, 0, h.vx, h.vy);
          else {
            hit(v, o, 5 + 3 * n(o, 'widerhaken'), 0, h.vx, h.vy);
            const dx = o.x - v.x, dy = o.y - v.y, l = Math.hypot(dx, dy) || 1;
            const sp = (HOOK.pull + l * 0.8) * (n(o, 'schleuderzug') ? 1.6 : 1);
            v.vx = (dx / l) * sp; v.vy = (dy / l) * sp; v.air = true; v.airMin = t + 0.2;
          }
          events.push(['grab', Math.round(h.x), Math.round(h.y)]);
          used = true;
          break;
        }
        if (!used && h.dist < h.max) keep.push(h);
      }
      hooks = keep;
    }

    /* ---------- Bomben ---------- */

    function throwBomb(f: Fighter) {
      aim(f, 200);
      bombs.push({ owner: f.id, x: f.x + f.fx * PHY.radius, y: f.y + f.fy * PHY.radius, vx: f.fx * BOMB.speed, vy: f.fy * BOMB.speed, landAt: t + BOMB.flight, fuseAt: t + BOMB.fuse * 0.75 ** n(f, 'kurzelunte'), stuck: null, flying: true });
      events.push(['toss', ids.indexOf(f.id)]);
    }

    function stepBombs() {
      const keep: Bomb[] = [];
      for (const b of bombs) {
        if (b.gone) continue;
        const o = fighters.get(b.owner)!;
        if (b.stuck) {
          const v = fighters.get(b.stuck);
          if (v && v.state === 'alive') { b.x = v.x; b.y = v.y; } else b.stuck = null;
        } else {
          b.x += b.vx * TICK; b.y += b.vy * TICK;
          if (!b.flying) { const d = Math.exp(-6 * TICK); b.vx *= d; b.vy *= d; }
          // Bomben sind kleine Hindernisse: Spieler prallen leicht ab und werden etwas gebremst
          for (const v of fighters.values()) {
            if (v.state !== 'alive' || (b.flying && v === o) || (n(o, 'haftbombe') && b.flying && v !== o)) continue;
            const dx = b.x - v.x, dy = b.y - v.y, d = Math.hypot(dx, dy), min = PHY.radius + 10;
            if (d >= min || d === 0) continue;
            const nx = dx / d, ny = dy / d;
            b.x = v.x + nx * min; b.y = v.y + ny * min;
            const vn = (b.vx - v.vx) * nx + (b.vy - v.vy) * ny;
            if (vn < 0) { b.vx -= 1.3 * vn * nx; b.vy -= 1.3 * vn * ny; b.vx *= 0.35; b.vy *= 0.35; }
            if (!b.flying) { b.vx += v.vx * 0.3; b.vy += v.vy * 0.3; v.vx *= 0.82; v.vy *= 0.82; }
          }
          if (!b.flying && Math.hypot(b.vx, b.vy) > 5 && !onGround(grid, b.x, b.y, 4)) { events.push(['fizzle', Math.round(b.x), Math.round(b.y)]); continue; }
        }
        if (b.flying && !b.stuck) {
          if (n(o, 'haftbombe')) {
            for (const v of fighters.values()) if (v !== o && v.state === 'alive' && Math.hypot(v.x - b.x, v.y - b.y) < PHY.radius + 8) { b.stuck = v.id; b.flying = false; break; }
          }
          if (b.flying && t >= b.landAt) {
            b.flying = false;
            if (!onGround(grid, b.x, b.y, 4)) { events.push(['fizzle', Math.round(b.x), Math.round(b.y)]); continue; }
          }
        }
        if (t >= b.fuseAt) { explode(b); continue; }
        keep.push(b);
      }
      bombs = keep.filter((b) => !b.gone);
    }

    function explode(b: Bomb) {
      b.gone = true;
      const o = fighters.get(b.owner)!;
      const r = (b.big ? 130 : BOMB.radius) * (1 + 0.2 * n(o, 'grossebombe'));
      events.push(['boom', Math.round(b.x), Math.round(b.y), Math.round(r)]);
      for (const v of fighters.values()) {
        if (v.state !== 'alive') continue;
        const dx = v.x - b.x, dy = v.y - b.y;
        if (Math.hypot(dx, dy) > r + PHY.radius) continue;
        if (v === o) hit(v, o, b.big ? 9 : 6, b.big ? 220 : 170, dx || 1, dy);
        else hit(v, o, b.big ? 18 : 12, b.big ? 400 : 300, dx || 1, dy);
      }
      if (n(o, 'kettenreaktion')) for (const c of bombs) if (c !== b && Math.hypot(c.x - b.x, c.y - b.y) < r) c.fuseAt = Math.min(c.fuseAt, t + 0.08);
    }

    /* ---------- Schwert und Schild ---------- */

    function slash(f: Fighter) {
      if (t < f.swingReady || f.blocking) return;
      const step = t - f.comboAt < SWORD.comboWindow ? (f.combo + 1) % 3 : 0;
      f.combo = step;
      f.comboAt = t;
      f.swingReady = t + (step === 2 ? SWORD.finisher : SWORD.gap) * 0.8 ** n(f, 'schnelleklinge');
      aim(f, 100);
      const hx = f.x + f.fx * (PHY.radius + SWORD.reach), hy = f.y + f.fy * (PHY.radius + SWORD.reach);
      events.push(['slash', ids.indexOf(f.id), step]);
      for (const o of fighters.values()) {
        if (o === f || o.state !== 'alive') continue;
        if (Math.hypot(o.x - hx, o.y - hy) > SWORD.r + PHY.radius) continue;
        const dx = o.x - f.x, dy = o.y - f.y, l = Math.hypot(dx, dy) || 1;
        hit(o, f, step === 2 ? 8 : 4, step === 2 ? 330 : 90, dx / l + f.fx * 0.6, dy / l + f.fy * 0.6);
        thorns(f, o);
      }
      if (step === 2 && n(f, 'klingenwelle')) {
        shots.push({ x: hx, y: hy, vx: f.fx * 500, vy: f.fy * 500, owner: f.id, until: t + 0.5, big: false, bounces: 0, pierce: true, hit: [], dmg: 6, base: 260, kind: 5 });
      }
    }

    /* ---------- Bumerang ---------- */

    function throwBoom(f: Fighter) {
      aim(f, 300);
      booms.push({ owner: f.id, x: f.x + f.fx * PHY.radius, y: f.y + f.fy * PHY.radius, vx: f.fx * BOOM.speed, vy: f.fy * BOOM.speed, back: false, traveled: 0, range: BOOM.range * (1 + 0.3 * n(f, 'weitwurf')), until: t + BOOM.life, hitOut: [], hitBack: [] });
      events.push(['throw', ids.indexOf(f.id)]);
    }

    function stepBooms() {
      const keep: Boom[] = [];
      for (const b of booms) {
        const o = fighters.get(b.owner)!;
        if (o.state !== 'alive' || t > b.until) continue;
        if (!b.back) {
          b.x += b.vx * TICK; b.y += b.vy * TICK; b.traveled += BOOM.speed * TICK;
          if (b.traveled >= b.range || cellAt(b.x, b.y) === T_PILLAR || arena.walls.some((w) => distToSegment(b.x, b.y, w) < WALL_HALF + 4)) b.back = true;
        } else {
          const dx = o.x - b.x, dy = o.y - b.y, l = Math.hypot(dx, dy) || 1;
          if (l < 22) continue; // gefangen
          b.vx = (dx / l) * BOOM.back; b.vy = (dy / l) * BOOM.back;
          b.x += b.vx * TICK; b.y += b.vy * TICK;
        }
        const list = b.back ? b.hitBack : b.hitOut;
        for (const v of fighters.values()) {
          if (v === o || v.state !== 'alive' || list.includes(v.id)) continue;
          if (Math.hypot(v.x - b.x, v.y - b.y) > PHY.radius + 12) continue;
          list.push(v.id);
          let dx = b.vx, dy = b.vy;
          if (b.back && n(o, 'rueckholsog')) { dx = o.x - v.x; dy = o.y - v.y; }
          hit(v, o, 6 + 2 * n(o, 'scharfkante'), 160, dx, dy);
        }
        keep.push(b);
      }
      booms = keep;
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
        shots.push({ x: f.x + dx * (PHY.radius + 6), y: f.y + dy * (PHY.radius + 6), vx: dx * sp, vy: dy * sp, owner: f.id, until: t + life, big, bounces: n(f, 'abpraller'), pierce: n(f, 'durchschlag') > 0, hit: [], dmg: big ? 7 : 2, base: big ? 280 : 45, kind: big ? 1 : 0 });
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
        const wall = arena.walls.find((w) => distToSegment(s.x, s.y, w) < WALL_HALF + 2);
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
          if (blocks(o, s.vx, s.vy)) { // Schild wirft Geschosse zurück
            s.vx = -s.vx; s.vy = -s.vy; s.owner = o.id; s.hit = []; s.until = t + 0.6;
            events.push(['block', Math.round(s.x), Math.round(s.y)]);
            break;
          }
          hit(o, by, s.dmg, s.base, s.vx, s.vy);
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
        const keepAway = f.weapon === 'schleuder' ? 180 : f.weapon === 'bomben' ? 150 : f.weapon === 'bumerang' ? 170 : f.weapon === 'haken' ? 190 : 0;
        if (keepAway) {
          if (best < keepAway - 50) { dx = -dx; dy = -dy; }
          else if (best < keepAway + 50) [dx, dy] = [-dy, dx];
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
      } else if (f.weapon === 'schleuder') {
        f.fx = (target.x - f.x) / best; f.fy = (target.y - f.y) / best;
        if (best < 300 && !f.fireHeld) attackDown(f);
        else if (best >= 300 && f.fireHeld) attackUp(f);
        if (best < 250 && t >= f.altReady && Math.random() < 0.02) alt(f);
      } else {
        f.fx = (target.x - f.x) / best; f.fy = (target.y - f.y) / best;
        const tg = target;
        if (f.weapon === 'haken') {
          if (best < 280 && Math.random() < 0.08) attackDown(f);
          if (best < 200 && t >= f.altReady && Math.random() < 0.02) alt(f);
        } else if (f.weapon === 'bomben') {
          if (best < 230 && Math.random() < 0.06) attackDown(f);
          if (t >= f.altReady && bombs.some((b) => b.owner === f.id && !b.flying && Math.hypot(b.x - tg.x, b.y - tg.y) < 65)) alt(f);
        } else if (f.weapon === 'schwert') {
          if (f.blocking && t >= f.botRelease) alt(f, false);
          else if (!f.blocking && best < 55 && Math.random() < 0.4) attackDown(f);
          else if (!f.blocking && best < 140 && Math.random() < 0.03) { alt(f, true); f.botRelease = t + 0.4 + Math.random() * 0.6; }
        } else if (f.weapon === 'bumerang') {
          if (best < 300 && Math.random() < 0.06) attackDown(f);
        }
      }
      if (t >= f.botRoll && Math.random() < 0.004) { roll(f); f.botRoll = t + 3; }
      if (f.special >= 100 && best < 200 && Math.random() < 0.05) special(f);
    }

    /* ---------- Senden ---------- */

    function stream() {
      ctx.stream({
        round, t: Math.round(t * 100) / 100, fire: t >= fireStart ? Math.round(fireR() * 10) / 10 : null,
        p: ids.map((id) => {
          const f = fighters.get(id)!;
          const flags = (f.air ? FLAG.air : 0) | (t < f.rollUntil ? FLAG.roll : 0) | (t < f.invulnUntil ? FLAG.invuln : 0)
            | (f.state === 'gone' ? FLAG.gone : 0) | (f.state === 'out' ? FLAG.out : 0) | (f.charging !== null ? FLAG.charge : 0) | (t < f.stunUntil ? FLAG.stun : 0) | (f.blocking ? FLAG.block : 0) | (t < f.meteorUntil ? FLAG.meteor : 0);
          const ang = Math.round((Math.atan2(f.fy, f.fx) * 180) / Math.PI);
          const charge = f.charging !== null ? Math.round(Math.min(1, (t - f.charging) / maxCharge(f)) * 100) : 0;
          return [Math.round(f.x), Math.round(f.y), ang, flags, Math.floor(f.dmg), f.lives, charge];
        }),
        o: [
          ...shots.map((s) => [s.kind, Math.round(s.x), Math.round(s.y), Math.round((Math.atan2(s.vy, s.vx) * 180) / Math.PI)]),
          ...hooks.map((h) => [2, Math.round(h.x), Math.round(h.y), ids.indexOf(h.owner), h.mode === 'push' ? 1 : 0]),
          ...bombs.map((b) => [3, Math.round(b.x), Math.round(b.y), Math.max(0, Math.round((b.fuseAt - t) * 10)), b.flying ? 1 : 0]),
          ...booms.map((b) => [4, Math.round(b.x), Math.round(b.y), ids.indexOf(b.owner)]),
          ...[...fighters.values()].filter((f) => t < f.stormUntil && f.state === 'alive').flatMap((f) => [0, 1, 2].map((k) => {
            const a = t * 6 + (k * Math.PI * 2) / 3;
            return [4, Math.round(f.x + Math.cos(a) * 55), Math.round(f.y + Math.sin(a) * 55), ids.indexOf(f.id)];
          })),
          ...bombs.filter((b) => b.big).map((b) => [6, Math.round(b.x), Math.round(b.y)]),
        ],
        cr: [...[...crumbleAt.keys()].map((k) => [k, 1]), ...[...brokenUntil.keys()].map((k) => [k, 2])],
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
        weapon2: f.weapon2, special: n(f, 'spezial') ? Math.floor(f.special) : null,
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
        const pts = (f.place >= 1 && f.place <= 3 && (f.place === 1 || N >= f.place + 1) ? POINTS.place[f.place - 1] : 0) * (lastRound() ? 2 : 1);
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
      const list = drawPowerups({ weapon: weapons.get(id) ?? 'hammer', weapon2: weapon2.get(id) ?? undefined, owned: owned.get(id) ?? {}, chances, count: 3, weaponFirst: true, onlyWeapon: start });
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
      if (round < total) nextArena = generateArena(N);
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
        preview: nextArena ? { cols: nextArena.cols, rows: nextArena.rows, grid: nextArena.grid, walls: nextArena.walls, bumpers: nextArena.bumpers, pads: nextArena.pads, teleports: nextArena.teleports, ring: nextArena.ring, ringMax: nextArena.ringMax, center: nextArena.center, seed: nextArena.seed } : null,
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
        shopOffers.set(id, drawPowerups({ weapon: weapons.get(id) ?? 'hammer', weapon2: weapon2.get(id) ?? undefined, owned: owned.get(id) ?? {}, chances, count: 6, weaponFirst: true }));
        addWeaponOffer(id);
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

    /** Ab und zu eine Zweitwaffe im Angebot (nicht die eigene) */
    function addWeaponOffer(id: string) {
      if (Math.random() > 0.6) return;
      const list = shopOffers.get(id) ?? [];
      const choices = WEAPONS.filter((w) => w !== weapons.get(id) && w !== weapon2.get(id));
      if (!choices.length) return;
      list[list.length - 1] = `waffe:${shuffle(choices)[0]}`;
      shopOffers.set(id, list);
    }

    function sendShop(id: string) {
      ctx.setPlayerView(id, {
        screen: 'shop', offers: shopOffers.get(id) ?? [], bought: shopBought.get(id) ?? [], money: money.get(id) ?? 0, owned: owned.get(id) ?? {},
        weapon: weapons.get(id), weapon2: weapon2.get(id) ?? null, done: shopDone.has(id), deadline: phaseTimer.deadline, duration: phaseTimer.duration,
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
      if (pu.startsWith('waffe:')) {
        const w = pu.slice(6) as WeaponId;
        const list = shopOffers.get(id) ?? [], bought = shopBought.get(id) ?? [], cash = money.get(id) ?? 0;
        if (!list.includes(pu) || bought.includes(pu) || !WEAPONS.includes(w) || w === weapons.get(id) || cash < WEAPON_PRICE) return false;
        money.set(id, cash - WEAPON_PRICE);
        weapon2.set(id, w);
        bought.push(pu);
        shopBought.set(id, bought);
        return true;
      }
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
          if (phase !== 'weapon' || !(weaponOpts.get(id) ?? []).includes(action.weapon)) return;
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
              shopOffers.set(id, drawPowerups({ weapon: weapons.get(id) ?? 'hammer', weapon2: weapon2.get(id) ?? undefined, owned: owned.get(id) ?? {}, chances: rarityChances(round, 0, 0), count: 6, weaponFirst: true }));
              addWeaponOffer(id);
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
          case 'alt': alt(f, action.down !== false); break;
          case 'b2': second(f, action.down !== false); break;
          case 'sp': special(f); break;
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
