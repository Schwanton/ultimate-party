/**
 * Sumo – Echtzeit: Kugeln auf einer schrumpfenden Plattform. Handy = Joystick + Rammen (kurzer Sprint, schwerer bei Stößen).
 * Der Server rechnet die Physik (30× pro Sekunde) und schickt die Positionen über ctx.stream an den TV.
 *
 * Punkte: für jeden, der vor dir runterfällt +50 · Runterschubsen +150 · Runde gewonnen +300.
 */

import { Scores, type GameContext, type GameServerModule } from '@up/sdk';

const TICK = 1 / 30;
const T = { intro: 9, ready: 3, roundEnd: 5, maxRound: 75, shrinkFrom: 8, shrinkTo: 50, scores: 6 };
const PHY = { accel: 1500, maxSpeed: 360, drag: 2.4, dash: 620, dashTime: 0.25, dashCooldown: 2.2, dashMass: 2.6, bounce: 0.85, kick: 1.35, creditWindow: 2.5 };
const POINTS = { outlast: 50, knockout: 150, win: 300 };

interface Ball { x: number; y: number; vx: number; vy: number; ix: number; iy: number; dashUntil: number; dashReady: number; out: boolean; hitBy: string | null; hitAt: number }

export default {
  create(ctx: GameContext) {
    const ids = ctx.players.map((p) => p.id);
    const scores = new Scores(ids);
    const total = Number(ctx.options.rounds) || 3;
    const N = ids.length;
    const r = N <= 6 ? 34 : N <= 16 ? 26 : N <= 40 ? 18 : 13;
    const R0 = Math.min(290, Math.max(180, r * Math.sqrt(N) * 3.2));
    let round = 0;
    let phase: 'intro' | 'ready' | 'fight' | 'roundEnd' | 'scores' | 'final' = 'intro';
    let balls = new Map<string, Ball>();
    let t = 0; // Sekunden seit Rundenbeginn (Spielzeit)
    let loop = 0;
    let outOrder: string[] = [];
    let kos = new Map<string, number>();
    let roundStart = scores.snapshot();
    let hitsThisTick = 0;

    const radius = () => (t < T.shrinkFrom ? R0 : Math.max(R0 * 0.35, R0 - (R0 * 0.65 * (t - T.shrinkFrom)) / (T.shrinkTo - T.shrinkFrom)));
    const aliveIds = () => ids.filter((id) => !balls.get(id)?.out);

    function intro() {
      ctx.setHostView({ screen: 'intro' });
      ctx.setAllPlayerViews(() => ({ screen: 'intro' }));
      ctx.after(T.intro, nextRound);
    }

    function nextRound() {
      round++;
      if (round > total) return final();
      phase = 'ready';
      t = 0;
      outOrder = [];
      kos = new Map();
      balls = new Map();
      ids.forEach((id, i) => {
        const a = (i / N) * Math.PI * 2 - Math.PI / 2;
        const d = R0 * (N > 30 ? 0.35 + 0.45 * ((i * 7) % 10) / 10 : 0.62);
        balls.set(id, { x: Math.cos(a) * d, y: Math.sin(a) * d, vx: 0, vy: 0, ix: 0, iy: 0, dashUntil: 0, dashReady: 0, out: false, hitBy: null, hitAt: -9 });
      });
      const startAt = Date.now() + T.ready * 1000;
      hostView({ startAt });
      ctx.setAllPlayerViews((p) => ({ screen: 'play', live: false, startAt, round, total, color: p.color }));
      stream();
      ctx.after(T.ready, fight);
    }

    function hostView(extra: object = {}) {
      ctx.setHostView({ screen: phase === 'roundEnd' ? 'roundEnd' : 'arena', phase, round, total, ids, r, R0, out: outOrder, kos: Object.fromEntries(kos), ...extra });
    }

    function fight() {
      phase = 'fight';
      hostView({ startedAt: Date.now() });
      ctx.setAllPlayerViews((p) => ({ screen: 'play', live: true, round, total, color: p.color }));
      const my = ++loop;
      const tick = () => {
        if (my !== loop || phase !== 'fight') return;
        step();
        ctx.after(TICK, tick);
      };
      ctx.after(TICK, tick);
    }

    function step() {
      t += TICK;
      const R = radius();
      // Bots steuern
      for (const id of ids) {
        const b = balls.get(id)!;
        if (b.out || !ctx.player(id)?.isBot) continue;
        let tx = 0, ty = 0, best = Infinity;
        for (const o of ids) {
          const ob = balls.get(o)!;
          if (o === id || ob.out) continue;
          const d = Math.hypot(ob.x - b.x, ob.y - b.y);
          if (d < best) [best, tx, ty] = [d, ob.x - b.x, ob.y - b.y];
        }
        const dist = Math.hypot(b.x, b.y);
        if (dist > R * 0.72) [tx, ty] = [-b.x, -b.y];
        const len = Math.hypot(tx, ty) || 1;
        b.ix = (tx / len) * 0.9 + (Math.random() - 0.5) * 0.3;
        b.iy = (ty / len) * 0.9 + (Math.random() - 0.5) * 0.3;
        if (best < r * 5 && t >= b.dashReady && Math.random() < 0.06) dash(id);
      }
      // Bewegung
      for (const b of balls.values()) {
        if (b.out) continue;
        b.vx += b.ix * PHY.accel * TICK;
        b.vy += b.iy * PHY.accel * TICK;
        const damp = Math.exp(-PHY.drag * TICK);
        b.vx *= damp;
        b.vy *= damp;
        const sp = Math.hypot(b.vx, b.vy);
        const max = t < b.dashUntil ? PHY.maxSpeed * 2.4 : PHY.maxSpeed;
        if (sp > max) {
          b.vx *= max / sp;
          b.vy *= max / sp;
        }
        b.x += b.vx * TICK;
        b.y += b.vy * TICK;
      }
      // Zusammenstöße
      hitsThisTick = 0;
      const live = ids.filter((id) => !balls.get(id)!.out);
      for (let i = 0; i < live.length; i++) {
        for (let j = i + 1; j < live.length; j++) {
          const a = balls.get(live[i])!, c = balls.get(live[j])!;
          const dx = c.x - a.x, dy = c.y - a.y;
          const d = Math.hypot(dx, dy);
          if (d >= 2 * r || d === 0) continue;
          const nx = dx / d, ny = dy / d;
          const overlap = 2 * r - d;
          a.x -= nx * overlap / 2;
          a.y -= ny * overlap / 2;
          c.x += nx * overlap / 2;
          c.y += ny * overlap / 2;
          const ma = t < a.dashUntil ? PHY.dashMass : 1, mc = t < c.dashUntil ? PHY.dashMass : 1;
          const vrel = (a.vx - c.vx) * nx + (a.vy - c.vy) * ny;
          if (vrel <= 0) continue;
          const imp = ((1 + PHY.bounce) * vrel * PHY.kick) / (1 / ma + 1 / mc);
          a.vx -= (imp / ma) * nx;
          a.vy -= (imp / ma) * ny;
          c.vx += (imp / mc) * nx;
          c.vy += (imp / mc) * ny;
          a.hitBy = live[j];
          a.hitAt = t;
          c.hitBy = live[i];
          c.hitAt = t;
          hitsThisTick = Math.max(hitsThisTick, imp);
        }
      }
      // Runtergefallen?
      const fell: string[] = [];
      for (const id of live) {
        const b = balls.get(id)!;
        if (Math.hypot(b.x, b.y) > R) {
          b.out = true;
          fell.push(id);
        }
      }
      for (const id of fell) {
        outOrder.push(id);
        for (const o of aliveIds()) scores.add(o, POINTS.outlast);
        const b = balls.get(id)!;
        if (b.hitBy && t - b.hitAt < PHY.creditWindow && b.hitBy !== id) {
          scores.add(b.hitBy, POINTS.knockout);
          kos.set(b.hitBy, (kos.get(b.hitBy) ?? 0) + 1);
        }
        ctx.setPlayerView(id, { screen: 'out', round, total, place: N - outOrder.length + 1, by: b.hitBy && t - b.hitAt < PHY.creditWindow ? ctx.player(b.hitBy)?.name ?? null : null });
      }
      if (fell.length) hostView({ fell, startedAt: Date.now() - t * 1000 });
      stream(fell);
      const left = aliveIds();
      if ((N > 1 && left.length <= 1) || (N === 1 && left.length === 0) || t >= T.maxRound) endRound(left);
    }

    function stream(fell: string[] = []) {
      const R = radius();
      ctx.stream({
        round, R: Math.round(R), t: Math.round(t * 10) / 10,
        b: ids.map((id) => {
          const b = balls.get(id)!;
          return [Math.round(b.x), Math.round(b.y), (t < b.dashUntil ? 1 : 0) | (b.out ? 2 : 0)];
        }),
        hit: Math.round(hitsThisTick), fell,
      });
    }

    function dash(id: string) {
      const b = balls.get(id);
      if (!b || b.out || phase !== 'fight' || t < b.dashReady) return;
      let dx = b.ix, dy = b.iy;
      if (Math.hypot(dx, dy) < 0.2) [dx, dy] = [b.vx, b.vy];
      const len = Math.hypot(dx, dy) || 1;
      b.vx += (dx / len) * PHY.dash;
      b.vy += (dy / len) * PHY.dash;
      b.dashUntil = t + PHY.dashTime;
      b.dashReady = t + PHY.dashCooldown;
    }

    function endRound(left: string[]) {
      phase = 'roundEnd';
      loop++;
      const winners = left;
      if (winners.length === 1) scores.add(winners[0], POINTS.win);
      hostView({ winners });
      ctx.setAllPlayerViews((p) => ({ screen: 'roundEnd', won: winners.includes(p.id), round, total, score: scores.get(p.id), kos: kos.get(p.id) ?? 0 }));
      ctx.after(T.roundEnd, () => (round < total ? showScores() : nextRound()));
    }

    function showScores() {
      phase = 'scores';
      ctx.setHostView({ screen: 'scores', before: roundStart, after: scores.snapshot(), round, total });
      roundStart = scores.snapshot();
      ctx.after(T.scores, nextRound);
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
        const b = balls.get(id);
        if (!b || !action) return;
        if (action.type === 'input') {
          let x = Number(action.x) || 0, y = Number(action.y) || 0;
          const len = Math.hypot(x, y);
          if (len > 1) [x, y] = [x / len, y / len];
          b.ix = x;
          b.iy = y;
        } else if (action.type === 'dash') dash(id);
      },
      dispose() {
        loop++;
      },
    };
  },
} satisfies GameServerModule;
