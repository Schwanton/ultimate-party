/**
 * Chaotic Tower Defense – jeder gegen jeden nach dem Vorbild Entropy TD (StarCraft II).
 * Alle bekommen dieselbe Zufallskarte und bauen ihr eigenes Labyrinth. Erledigte Monster stehen sofort wieder auf.
 * Leben = 100 − (Kills des Besten − eigene Kills); der Beste hat 100 + Vorsprung auf den Zweiten. Wer 0 Leben hat, scheidet aus.
 * Ablauf: Kartenabstimmung → (Bauphase ↔ Welle) … → Letzter übrig gewinnt.
 */

import { type GameContext, type GameServerModule } from '@up/sdk';
import { Board, MONSTER_KEYS, TYPES, boostAt, generateMap, waveInfo, type Kind, type Leg, type MapDef, type TowerType } from './engine';

const TICK = 0.1;
const T = { vote: 25, firstBuild: 45, build: 30, final: 0 };
const MAX_WAVES = 40;
const LETTERS = 'ABCDEF';

type Phase = 'vote' | 'play' | 'final';

interface PState {
  id: string;
  board: Board;
  ready: boolean;
  out: boolean;
  place: number;
  shareTo: Set<string>;
  watch: string | null;
  err: string;
  errAt: number;
  skill: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const legsOut = (legs: Leg[] | null) => (legs ?? []).map((l) => ({ l: l.leg, j: l.jump ? 1 : 0, p: l.pts.map(([x, y]) => [r2(x), r2(y)]) }));

function mapOut(m: MapDef) {
  return { w: m.w, h: m.h, start: m.start, core: m.core, cps: m.cps, tps: m.tps, zones: m.zones, maxLimit: m.maxLimit };
}

function preview(m: MapDef) {
  const b = new Board(m);
  const towers = TYPES.map((t) => ({ t, p: m.price['up_' + t].p, f: m.price['up_' + t].f })).sort((a, c) => a.f - c.f);
  return {
    ...mapOut(m), rocks: m.rocks, legs: legsOut(b.route),
    money: m.money, moneyF: m.moneyF, blast: m.price.blast, depot: m.price.depot,
    cheap: towers.slice(0, 3), dear: towers.slice(-3).reverse(),
  };
}

export default {
  create(ctx: GameContext) {
    const ids = ctx.players.map((p) => p.id);
    const isBot = (id: string) => !!ctx.player(id)?.isBot;
    const seeds = Array.from({ length: 6 }, () => Math.floor(Math.random() * 1e9));
    const maps = seeds.map(generateMap);
    const votes = new Map<string, number>();
    let phase: Phase = 'vote';
    let map: MapDef = maps[0];
    let chosen = 0;
    const ps = new Map<string, PState>();
    let wave = 0;
    let stage: 'build' | 'wave' = 'build';
    let deadline = 0, duration = 0;
    let buildTimer: { cancel(): void } | null = null;
    let loop = 0;
    let tickN = 0;
    let elapsed = 0;
    const sent = new Map<string, string>();
    let hostSent = '';
    let outCount = 0;

    const active = () => ids.filter((id) => !ps.get(id)!.out);

    /* ---------- Leben ---------- */

    function lives() {
      const act = active().map((id) => ({ id, k: ps.get(id)!.board.kills })).sort((a, b) => b.k - a.k);
      const best = act[0]?.k ?? 0, second = act[1]?.k ?? best;
      const res = new Map<string, number>();
      act.forEach((a, i) => res.set(a.id, i === 0 ? 100 + (best - second) : 100 - (best - a.k)));
      return res;
    }

    function rows() {
      const lv = lives();
      const list = ids.map((id) => {
        const p = ps.get(id)!;
        return { id, kills: p.board.kills, lives: p.out ? 0 : lv.get(id) ?? 0, out: p.out, place: p.place, run: p.board.lastRun, done: p.board.waveDone, ready: p.ready };
      });
      list.sort((a, b) => (a.out !== b.out ? (a.out ? 1 : -1) : a.out ? a.place - b.place : b.kills - a.kills));
      return list;
    }

    /* ---------- Ansichten ---------- */

    function hostView(force = false) {
      let v: object;
      if (phase === 'vote') {
        const counts: Record<number, string[]> = {};
        for (const [id, k] of votes) (counts[k] ??= []).push(id);
        v = { screen: 'vote', maps: maps.map(preview), votes: counts, deadline, duration };
      } else if (phase === 'play') {
        const info = waveInfo(Math.max(1, stage === 'wave' ? wave : wave + 1));
        const next = [1, 2, 3].map((k) => waveInfo((stage === 'wave' ? wave : wave + 1) + k).type);
        const rs = rows();
        const longest = rs.filter((r) => !r.out && r.run > 0).sort((a, b) => b.run - a.run)[0] ?? null;
        v = {
          screen: 'game', stage, wave: stage === 'wave' ? wave : wave + 1, type: info.type, count: info.count, hpMul: info.hpMul, next,
          rows: rs, deadline: stage === 'build' ? deadline : 0, duration, elapsed: Math.round(elapsed),
          map: { w: map.w, h: map.h, cps: map.cps.length, maxLimit: map.maxLimit }, longest: longest ? { id: longest.id, run: longest.run } : null,
          ready: active().filter((id) => ps.get(id)!.ready).length, active: active().length,
          doneCount: active().filter((id) => ps.get(id)!.board.waveDone).length,
        };
      } else {
        v = { screen: 'final', rows: rows() };
      }
      const s = JSON.stringify(v);
      if (!force && s === hostSent) return;
      hostSent = s;
      ctx.setHostView(v);
    }

    function boardOut(p: PState) {
      const b = p.board;
      return {
        idx: ids.indexOf(p.id),
        bs: [...b.buildings.values()].map((x) => [x.id, x.kind === 'wall' ? 0 : x.kind === 'tower' ? 1 : 2, x.x, x.y, x.type, x.level, x.dmgN, x.spdN]),
        rocks: b.rocks,
        legs: legsOut(b.route),
      };
    }

    function canWatch(viewer: string, target: string) {
      if (viewer === target) return true;
      const v = ps.get(viewer)!, t = ps.get(target)!;
      return t.shareTo.has(viewer) || (v.out && t.out);
    }

    function playerView(id: string) {
      if (phase === 'vote') {
        return {
          screen: 'vote', deadline, duration, mine: votes.get(id) ?? null,
          maps: maps.map((m, i) => ({ letter: LETTERS[i], w: m.w, h: m.h, cps: m.cps.length, votes: [...votes.values()].filter((k) => k === i).length })),
        };
      }
      const p = ps.get(id)!;
      const lv = lives();
      if (phase === 'final') {
        const rs = rows();
        return { screen: 'final', place: rs.findIndex((r) => r.id === id) + 1, of: rs.length, kills: p.board.kills, won: rs[0]?.id === id };
      }
      const b = p.board;
      const now = Date.now();
      const priceKeys = ['wall', 'tower', 'depot', 'blast', 'income', 'dmgUp'];
      const prices: Record<string, [number, number]> = {};
      for (const k of priceKeys) prices[k] = [b.priceOf(k), map.price[k].f];
      for (const t of TYPES) for (const pre of ['up_', 'lv2_', 'lv3_']) prices[pre + t] = [map.price[pre + t].p, map.price[pre + t].f];
      const refunds: Record<number, [number, number]> = {};
      for (const x of b.buildings.values()) refunds[x.id] = [b.refund(x, now / 1000), Math.max(0, Math.round(x.builtAt * 1000 + 10000))];
      const ups: Record<number, [number, number, number | null, number | null]> = {};
      for (const x of b.buildings.values()) {
        const d = b.towerUpPrice(x, 'dmg'), sp = b.towerUpPrice(x, 'spd');
        if (d) ups[x.id] = [d.p, d.f, sp ? sp.p : null, sp ? sp.f : null];
      }
      const watchable = ids.filter((o) => o !== id && canWatch(id, o));
      const watchId = p.watch && watchable.includes(p.watch) ? p.watch : null;
      const rs = rows();
      return {
        screen: 'play', out: p.out, stage: p.out ? 'out' : b.waveDone ? 'build' : 'wave', globalStage: stage,
        wave: stage === 'wave' ? wave : wave + 1, type: waveInfo(Math.max(1, stage === 'wave' ? wave : wave + 1)).type,
        nextType: waveInfo(stage === 'wave' ? wave + 1 : wave + 2).type,
        deadline: stage === 'build' ? deadline : 0, duration, ready: p.ready,
        money: b.money, lives: p.out ? 0 : lv.get(id) ?? 0, kills: b.kills, rank: rs.findIndex((r) => r.id === id) + 1, of: ids.length, place: p.place,
        used: b.used, limit: b.limitMax, maxLimit: map.maxLimit, incomeLv: b.incomeLv, dmgLv: b.dmgLv, income: b.income(), run: b.lastRun,
        prices, refunds, ups, boost: b.waveDone ? 1 : boostAt(b.waveTime), map: mapOut(map), me: boardOut(p),
        watch: watchId ? { id: watchId, ...boardOut(ps.get(watchId)!) } : null, watchable,
        shareTo: [...p.shareTo], others: ids.filter((o) => o !== id).map((o) => ({ id: o, out: ps.get(o)!.out })),
        err: now - p.errAt < 4000 ? p.err : '',
        top: rs.slice(0, 5).map((r) => ({ id: r.id, kills: r.kills, lives: r.lives, out: r.out })),
      };
    }

    function sendPhones(force = false) {
      for (const id of ids) {
        const v = playerView(id);
        const s = JSON.stringify(v);
        if (!force && sent.get(id) === s) continue;
        sent.set(id, s);
        ctx.setPlayerView(id, v);
      }
    }

    function stream() {
      const b: number[][] = ids.map((id) => {
        const p = ps.get(id);
        if (!p || p.out) return [];
        const out: number[] = [];
        for (const m of p.board.monsters) out.push(Math.round(m.x * 10), Math.round(m.y * 10), MONSTER_KEYS.indexOf(m.type), Math.max(0, Math.min(9, Math.floor((m.hp / m.max) * 10))));
        return out;
      });
      ctx.stream({ k: wave, b }, { phones: true });
    }

    /* ---------- Abstimmung ---------- */

    function startVote() {
      phase = 'vote';
      const t = ctx.timer(T.vote, endVote);
      deadline = t.deadline; duration = t.duration;
      hostView(true);
      sendPhones(true);
      for (const id of ids) if (isBot(id)) ctx.after(1 + Math.random() * 4, () => { if (phase === 'vote') { votes.set(id, Math.floor(Math.random() * 6)); afterVote(); } });
    }

    function afterVote() {
      hostView();
      sendPhones();
      if (votes.size >= ids.length) endVote();
    }

    function endVote() {
      if (phase !== 'vote') return;
      ctx.clearTimers();
      const count = new Array(6).fill(0);
      for (const k of votes.values()) count[k]++;
      const most = Math.max(...count);
      const best = count.map((c, i) => (c === most ? i : -1)).filter((i) => i >= 0);
      chosen = best[Math.floor(Math.random() * best.length)];
      map = maps[chosen];
      for (const id of ids) ps.set(id, { id, board: new Board(map), ready: false, out: false, place: 0, shareTo: new Set(), watch: null, err: '', errAt: 0, skill: 0.3 + Math.random() * 0.7 });
      phase = 'play';
      beginBuild(T.firstBuild);
    }

    /* ---------- Bauphase und Wellen ---------- */

    function beginBuild(sec: number) {
      stage = 'build';
      const t = ctx.timer(sec, startWave);
      buildTimer = t;
      deadline = t.deadline; duration = t.duration;
      if (wave === 0) for (const id of active()) if (isBot(id)) scheduleBot(id);
      hostView(true);
      sendPhones(true);
    }

    function scheduleBot(id: string) {
      ctx.after(0.5 + Math.random() * 2, () => {
        const p = ps.get(id)!;
        if (phase !== 'play' || p.out || !p.board.waveDone) return;
        botBuild(p);
        p.ready = true;
        checkReady();
      });
    }

    function checkReady() {
      hostView();
      sendPhones();
      if (stage === 'build' && active().every((id) => ps.get(id)!.ready)) startWave();
    }

    function startWave() {
      if (phase !== 'play' || stage !== 'build') return;
      buildTimer?.cancel();
      buildTimer = null;
      wave++;
      if (wave > MAX_WAVES) return final();
      stage = 'wave';
      for (const id of active()) { const p = ps.get(id)!; p.ready = false; p.board.startWave(wave); }
      hostView(true);
      sendPhones(true);
      const my = ++loop;
      const tick = () => {
        if (my !== loop || phase !== 'play' || stage !== 'wave') return;
        step();
        if (my === loop && phase === 'play' && stage === 'wave') ctx.after(TICK, tick);
      };
      ctx.after(TICK, tick);
    }

    function step() {
      tickN++;
      elapsed += TICK;
      let changed = false;
      for (const id of active()) {
        const b = ps.get(id)!.board;
        if (b.waveDone) continue;
        b.step(TICK);
        if (b.waveDone) {
          b.money += b.income();
          changed = true;
          if (isBot(id)) scheduleBot(id);
        }
      }
      // ausscheiden
      const lv = lives();
      const nowOut = active().filter((id) => (lv.get(id) ?? 1) <= 0).sort((a, b) => ps.get(a)!.board.kills - ps.get(b)!.board.kills);
      if (nowOut.length) {
        for (const id of nowOut) {
          const p = ps.get(id)!;
          p.place = ids.length - outCount;
          outCount++;
          p.out = true;
          p.board.monsters = [];
          p.board.waveDone = true;
        }
        changed = true;
        if (active().length <= 1 && ids.length > 1) return final();
      }
      if (tickN % 2 === 0) stream();
      if (changed || tickN % 10 === 0) { hostView(); sendPhones(); }
      if (active().every((id) => ps.get(id)!.board.waveDone)) {
        stream();
        beginBuild(T.build);
        if (active().every((id) => ps.get(id)!.ready)) startWave();
      }
    }

    function final() {
      loop++;
      phase = 'final';
      ctx.clearTimers();
      for (const id of active()) ps.get(id)!.place = 0;
      const rs = rows();
      rs.forEach((r, i) => { ps.get(r.id)!.place = i + 1; });
      hostView(true);
      sendPhones(true);
      ctx.finish(rs.map((r) => ({ playerId: r.id, score: r.kills })));
    }

    /* ---------- Bots ---------- */

    function botBuild(p: PState) {
      const b = p.board;
      const now = Date.now() / 1000;
      if (wave < 8 && b.money > b.priceOf('income') * 2 && Math.random() < p.skill) b.buy('income');
      for (let act = 0; act < 10; act++) {
        if (b.used >= b.limitMax) {
          if (b.limitMax < map.maxLimit && b.money >= b.priceOf('depot')) {
            for (let k = 0; k < 30; k++) { const x = Math.floor(Math.random() * (map.w - 1)), y = Math.floor(Math.random() * (map.h - 1)); if (!b.build('depot', x, y, now)) break; }
            continue;
          }
          break;
        }
        const kind: Kind = b.money >= b.priceOf('tower') && Math.random() < 0.6 ? 'tower' : 'wall';
        if (b.money < b.priceOf(kind)) break;
        const tr = b.ground;
        if (!tr) break;
        const tries = Math.round(4 + p.skill * 22);
        let best: [number, number] | null = null, bestLen = -1;
        for (let k = 0; k < tries; k++) {
          const i = Math.floor(Math.random() * tr.x.length);
          const x = Math.floor(tr.x[i] + (Math.random() * 6 - 3)), y = Math.floor(tr.y[i] + (Math.random() * 6 - 3));
          const len = b.tryLength(kind, x, y);
          if (len > bestLen) { bestLen = len; best = [x, y]; }
        }
        if (!best || b.build(kind, best[0], best[1], now)) break;
      }
      // Türme verbessern
      const towers = [...b.buildings.values()].filter((x) => x.kind === 'tower');
      for (const t of towers) {
        if (t.type === 'T') {
          const order: TowerType[] = ['L', 'P', 'K', 'R', 'F', 'Q', 'V', 'L'];
          const to = order[Math.floor(Math.random() * order.length)];
          if (b.money >= map.price['up_' + to].p * 1.2) b.upgrade(t.id, to);
        } else if (t.level < 3 && b.money >= map.price['lv' + (t.level + 1) + '_' + t.type].p * 1.5 && Math.random() < p.skill) b.upgrade(t.id);
      }
      for (const t of towers) {
        const what = Math.random() < 0.6 ? 'dmg' : 'spd';
        const pr = b.towerUpPrice(t, what);
        if (pr && b.money >= pr.p * 2 && Math.random() < p.skill) b.towerUp(t.id, what);
      }
      if (b.money > b.priceOf('dmgUp') * 1.5 && Math.random() < p.skill * 0.5) b.buy('dmgUp');
    }

    /* ---------- Eingaben ---------- */

    function fail(p: PState, why: string) {
      p.err = why;
      p.errAt = Date.now();
    }

    return {
      start: startVote,
      onAction(id, a) {
        if (!a || typeof a !== 'object') return;
        if (phase === 'vote') {
          if (a.type === 'vote' && Number.isInteger(a.map) && a.map >= 0 && a.map < 6) { votes.set(id, a.map); afterVote(); }
          return;
        }
        if (phase !== 'play') return;
        const p = ps.get(id);
        if (!p) return;
        if (a.type === 'share' && typeof a.id === 'string' && ids.includes(a.id) && a.id !== id) {
          if (a.on) p.shareTo.add(a.id); else p.shareTo.delete(a.id);
          sendPhones();
          return;
        }
        if (a.type === 'watch') {
          p.watch = typeof a.id === 'string' && ids.includes(a.id) ? a.id : null;
          sendPhones();
          return;
        }
        if (p.out) return;
        const b = p.board;
        if (a.type === 'ready') {
          p.ready = !p.ready;
          return checkReady();
        }
        if (!b.waveDone) return fail(p, 'wave'), sendPhones();
        const now = Date.now() / 1000;
        const xi = Math.floor(Number(a.x)), yi = Math.floor(Number(a.y));
        let err: string | null = null;
        if (a.type === 'build' && (a.kind === 'wall' || a.kind === 'tower' || a.kind === 'depot') && Number.isFinite(xi) && Number.isFinite(yi)) err = b.build(a.kind, xi, yi, now);
        else if (a.type === 'upgrade') err = b.upgrade(Number(a.id), a.to);
        else if (a.type === 'towerUp' && (a.what === 'dmg' || a.what === 'spd')) err = b.towerUp(Number(a.id), a.what);
        else if (a.type === 'sell') err = b.sell(Number(a.id), now);
        else if (a.type === 'blast') err = b.blast(xi, yi);
        else if (a.type === 'buy' && (a.key === 'income' || a.key === 'dmgUp')) err = b.buy(a.key);
        else return;
        if (err) fail(p, err); else p.err = '';
        hostView();
        sendPhones();
      },
      onPlayerRejoin(id) {
        sent.delete(id);
        sendPhones();
      },
      bot() {
        return null;
      },
      dispose() {
        loop++;
      },
    };
  },
} satisfies GameServerModule;

