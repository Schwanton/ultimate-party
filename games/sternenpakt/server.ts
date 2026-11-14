/**
 * Sternenpakt – Weltraum-Strategie im Zeitraffer (nach dem Vorbild von Neptune's Pride).
 * Regeln in engine.ts; hier: Ablauf, Ansichten, Chat und Computer-Reiche.
 */

import type { GameContext, GameServerModule } from '@up/sdk';
import * as E from './engine';

const TICK = 0.25;
/** Ansichten alle 2 Takte (0,5 s) neu schicken */
const PUBLISH_EVERY = 2;
/** Computer-Reiche denken alle 3 Spielsekunden nach */
const AUTO_EVERY = 3;
const INTRO = 40;
const PLAN = 40;
const RESOLVE = 15;
const RESOLVE_SPEED = E.YEAR / RESOLVE;
const REPLAY = 11;
const CHAT_MAX = 140;
const PLACE_BONUS = [1000, 500, 250];

const AI_NAMES: Record<string, string[]> = {
  de: ['Nexus', 'Kronos', 'Vortex', 'Omega'],
  en: ['Nexus', 'Kronos', 'Vortex', 'Omega'],
};
const AI_COLORS = ['#B9C2E8', '#FF8A5B', '#A98BFF', '#6BFFE0', '#FFE66B', '#FF6B8A'];

type Phase = 'intro' | 'run' | 'plan' | 'resolve' | 'replay' | 'final';
interface ChatMsg { f: number; x?: string; m?: number; t?: E.Tech; l?: number; id: number }
type TvMsg = { id: number; k: string; e?: number; star?: number; by?: number; prev?: number };

export default {
  create(ctx: GameContext) {
    const rng = E.mulberry32((Math.random() * 2 ** 32) >>> 0);
    const humans = ctx.players;
    const aiCount = Math.max(Number(ctx.options.ai) || 0, humans.length < 2 ? 2 - humans.length : 0);
    const usedColors = new Set(humans.map((p) => p.color.toUpperCase()));
    const aiColors = AI_COLORS.filter((c) => !usedColors.has(c));
    const seeds: E.EmpireSeed[] = [
      ...humans.map((p) => ({ id: p.id, name: p.name, color: p.color, auto: p.isBot, human: true })),
      ...Array.from({ length: aiCount }, (_, i) => ({
        id: `ki${i + 1}`, name: (AI_NAMES[ctx.lang] ?? AI_NAMES.de)[i % 4], color: aiColors[i % aiColors.length], auto: true, human: false,
      })),
    ];
    // Reihenfolge auf dem Kreis mischen
    for (let i = seeds.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [seeds[i], seeds[j]] = [seeds[j], seeds[i]];
    }
    const years = Number(ctx.options.years) || 15;
    const rounds = ctx.options.takt === 'rounds';
    const rough = ctx.options.ships === 'rough';
    const s = E.createGame(seeds, years, rng);
    const empOf = new Map<string, number>(s.empires.map((e, i) => [e.id, i]));
    const map = s.stars.map((st) => [Math.round(st.x * 100) / 100, Math.round(st.y * 100) / 100, st.name, st.home]);
    const half = Math.floor(s.stars.length / 2) + 1;

    let phase: Phase = 'intro';
    let speed = 0;
    let tickNo = 0;
    let dirty = true;
    let phaseDeadline = 0;
    let phaseDuration = 0;
    let resolveEnd = 0;
    let msgId = 1;
    const ready = new Set<string>();
    const msgs: TvMsg[] = [];
    const fx: { id: number; star: number; k: string; at: number }[] = [];
    let banner: { year: number; at: number } | null = null;
    const notes = new Map<number, { id: number; k: string; tech?: E.Tech; level?: number; ships?: number }[]>();
    const orders = new Map<number, E.Order[]>();
    const threads = new Map<string, ChatMsg[]>();
    const unread = new Map<number, Map<number, number>>();
    let result: { e: number; stars: number; ships: number; pts: number }[] = [];
    let introTimer: { cancel(): void } | null = null;
    let planTimer: { cancel(): void } | null = null;

    const pair = (a: number, b: number) => (a < b ? `${a}|${b}` : `${b}|${a}`);
    const show = (n: number, mine: boolean) => (mine || !rough ? n : n === 0 ? 0 : `~${Math.max(5, Math.round(n / 5) * 5)}`);
    const tv = (m: Omit<TvMsg, 'id'>) => {
      msgs.push({ id: msgId++, ...m });
      if (msgs.length > 4) msgs.shift();
    };
    const note = (e: number, n: { k: string; tech?: E.Tech; level?: number; ships?: number }) => {
      const list = notes.get(e) ?? [];
      list.push({ id: msgId++, ...n });
      if (list.length > 3) list.shift();
      notes.set(e, list);
    };
    const addFx = (star: number, k: string) => {
      const now = Date.now();
      fx.push({ id: msgId++, star, k, at: now });
      while (fx.length && (fx.length > 12 || now - fx[0].at > 4000)) fx.shift();
    };

    /* ---------- Ansichten ---------- */

    const empView = () => s.empires.map((e) => ({ id: e.id, n: e.name, c: e.color, ai: !e.human, p: e.pirate, o: e.out }));
    const clock = () => ({ sim: Math.round(s.sim * 1000) / 1000, at: Date.now(), speed });
    const common = () => ({
      map, emp: empView(), clock: clock(), year: s.year, years, rounds, phase, deadline: phaseDeadline, duration: phaseDuration,
      rank: E.standings(s).filter((r) => !s.empires[r.e].out || r.stars > 0).map((r) => [r.e, r.stars]), half, fx, banner,
    });
    const fleetsFor = (viewer: number) => s.fleets
      .filter((f) => f.owner === viewer || !E.cloaked(s, f))
      .map((f) => [f.id, f.owner, show(f.ships, f.owner === viewer), Math.round(f.x0 * 100) / 100, Math.round(f.y0 * 100) / 100, f.to, Math.round(f.t0 * 100) / 100, Math.round(f.t1 * 100) / 100, f.owner === viewer && E.cloaked(s, f) ? 1 : 0]);
    const parkedFor = (viewer: number) => s.parked.map((p) => [p.id, p.owner, show(p.ships, p.owner === viewer), Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100]);

    function hostView() {
      if (phase === 'intro') {
        return { screen: 'intro', ...common(), st: s.stars.map((st) => [st.owner, st.ships]), ready: ready.size, total: humans.filter((p) => !p.isBot).length };
      }
      if (phase === 'replay') return { screen: 'replay', map, emp: empView(), hist: s.history, winner: result[0]?.e ?? null, years };
      if (phase === 'final') return { screen: 'final', emp: empView(), result, ranking: ranking() };
      return {
        screen: 'play', ...common(),
        st: s.stars.map((st) => [st.owner, show(st.ships, false)]),
        fl: fleetsFor(-1), pk: parkedFor(-1), msgs,
      };
    }

    function chatFor(e: number) {
      const peers = s.empires.map((x, i) => ({ x, i })).filter(({ x, i }) => x.human && i !== e).map(({ i }) => i);
      const th: Record<number, ChatMsg[]> = {};
      for (const p of peers) th[p] = (threads.get(pair(e, p)) ?? []).slice(-30);
      const un: Record<number, number> = {};
      for (const [p, n] of unread.get(e) ?? []) if (n) un[p] = n;
      const gifts: Record<number, [E.Tech, number, number][]> = {};
      for (const p of peers) gifts[p] = E.TECHS.map((t) => [t, E.techGiftCost(s, p, t), s.empires[e].tech[t] > s.empires[p].tech[t] ? 1 : 0]);
      return { peers, th, un, gifts };
    }

    function phoneView(playerId: string) {
      const e = empOf.get(playerId);
      if (e == null) return { screen: 'watch' };
      const emp = s.empires[e];
      if (phase === 'intro') {
        return { screen: 'intro', me: e, ...common(), st: s.stars.map((st) => [st.owner, st.ships]), ready: ready.has(playerId) };
      }
      if (phase === 'replay' || phase === 'final') {
        const place = result.findIndex((r) => r.e === e);
        return { screen: 'end', me: e, emp: empView(), place: place + 1, stars: result[place]?.stars ?? 0, pts: result[place]?.pts ?? 0, winner: result[0]?.e ?? null };
      }
      return {
        screen: 'play', me: e, ...common(),
        st: s.stars.map((st) => [st.owner, show(st.ships, st.owner === e)]),
        fl: fleetsFor(e), pk: parkedFor(e),
        money: emp.money, income: E.incomeOf(s, e), rate: E.researchRate(s, e), rp: Math.floor(emp.rp * 10) / 10,
        tech: emp.tech, research: emp.research, range: E.rangeOf(s, e), pirate: emp.pirate, out: emp.out,
        my: s.stars.map((st, i) => ({ st, i })).filter(({ st }) => st.owner === e).map(({ st, i }) => [
          i, st.eco, st.ind, st.sci, E.upgradeCost(s, e, i, 'eco'), E.upgradeCost(s, e, i, 'ind'), E.upgradeCost(s, e, i, 'sci'), E.productionOf(s, e, i),
        ]),
        orders: orders.get(e) ?? [], ready: ready.has(playerId),
        chat: chatFor(e), notes: notes.get(e) ?? [],
      };
    }

    function publish() {
      dirty = false;
      ctx.setHostView(hostView());
      ctx.setAllPlayerViews((p) => phoneView(p.id));
      ctx.setAudienceView({ screen: 'watch' });
    }

    /* ---------- Ablauf ---------- */

    function handle(events: E.GameEvent[]) {
      for (const ev of events) {
        dirty = true;
        switch (ev.k) {
          case 'conquer':
            addFx(ev.star, 'conquer');
            tv({ k: 'conquer', e: ev.by, star: ev.star, prev: ev.prev });
            break;
          case 'hold':
            addFx(ev.star, 'fight');
            tv({ k: 'hold', e: ev.owner, star: ev.star, by: ev.by });
            break;
          case 'pirate':
            tv({ k: 'pirate', e: ev.e });
            break;
          case 'spawn':
            tv({ k: 'spawn', e: ev.e });
            note(ev.e, { k: 'spawn', ships: ev.ships });
            break;
          case 'out':
            tv({ k: 'out', e: ev.e });
            break;
          case 'tech':
            note(ev.e, { k: 'tech', tech: ev.tech, level: ev.level });
            break;
          case 'year':
            banner = { year: ev.year, at: Date.now() };
            break;
        }
      }
    }

    function runAuto(force: boolean) {
      s.empires.forEach((emp, e) => {
        if (!emp.auto || emp.out) return;
        // gestaffelt, damit nicht alle im selben Moment handeln
        const slot = (s.sim + e * 0.7) % AUTO_EVERY;
        if (!force && slot >= TICK * speed) return;
        for (const c of E.autoPlan(s, e, rng)) {
          if (c.kind === 'send' && rounds) queue(e, c.order);
          else E.applyCommand(s, e, c);
        }
        dirty = true;
      });
    }

    function queue(e: number, o: E.Order) {
      const list = orders.get(e) ?? [];
      if (list.length >= 30) return;
      list.push(o);
      orders.set(e, list);
    }

    function tick() {
      if (phase === 'run' || phase === 'resolve') {
        if (!rounds) runAuto(false);
        handle(E.tick(s, TICK * speed, rng));
        if (s.over) return end();
        if (phase === 'resolve' && s.sim >= resolveEnd - 1e-6) startPlan();
      }
      tickNo++;
      if (dirty || tickNo % PUBLISH_EVERY === 0) publish();
      ctx.after(TICK, tick);
    }

    function startGame() {
      if (phase !== 'intro') return;
      introTimer?.cancel();
      ready.clear();
      if (rounds) startPlan();
      else {
        phase = 'run';
        speed = 1;
        phaseDeadline = 0;
      }
      banner = { year: 1, at: Date.now() };
      dirty = true;
    }

    function startPlan() {
      phase = 'plan';
      speed = 0;
      ready.clear();
      const t = ctx.timer(PLAN, startResolve);
      planTimer = t;
      phaseDeadline = t.deadline;
      phaseDuration = t.duration;
      runAuto(true);
      dirty = true;
    }

    function startResolve() {
      if (phase !== 'plan') return;
      planTimer?.cancel();
      ready.clear();
      // geplante Flüge in zufälliger Reihenfolge starten
      const all: [number, E.Order][] = [];
      for (const [e, list] of orders) for (const o of list) all.push([e, o]);
      orders.clear();
      for (let i = all.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [all[i], all[j]] = [all[j], all[i]];
      }
      for (const [e, o] of all) {
        if (o.parked == null) {
          const from = s.stars[o.from];
          if (!from || from.owner !== e) continue;
          o.n = Math.min(o.n, from.ships);
          if (o.n < 1) continue;
        }
        E.sendFleet(s, e, o);
      }
      phase = 'resolve';
      speed = RESOLVE_SPEED;
      resolveEnd = s.year * E.YEAR;
      phaseDeadline = Date.now() + RESOLVE * 1000;
      phaseDuration = RESOLVE * 1000;
      dirty = true;
    }

    function ranking() {
      return result.filter((r) => s.empires[r.e].human).map((r) => ({ playerId: s.empires[r.e].id, score: r.pts }));
    }

    function end() {
      speed = 0;
      planTimer?.cancel();
      const st = E.standings(s);
      result = st.map((r, i) => ({ ...r, pts: r.stars * 100 + (r.stars > 0 ? PLACE_BONUS[i] ?? 0 : 0) }));
      phase = 'replay';
      publish();
      ctx.after(REPLAY, () => {
        phase = 'final';
        publish();
        ctx.finish(ranking());
      });
    }

    function introCheck() {
      const real = humans.filter((p) => !p.isBot && ctx.player(p.id)?.connected);
      if (real.length && real.every((p) => ready.has(p.id))) ctx.after(1, startGame);
      else if (!real.length && humans.every((p) => p.isBot)) ctx.after(3, startGame);
    }

    function planCheck() {
      const real = humans.filter((p) => !p.isBot && ctx.player(p.id)?.connected);
      if (real.length && real.every((p) => ready.has(p.id))) ctx.after(0.8, startResolve);
    }

    /* ---------- Chat ---------- */

    function chat(from: number, to: number, msg: Omit<ChatMsg, 'f' | 'id'>) {
      const key = pair(from, to);
      const list = threads.get(key) ?? [];
      list.push({ f: from, id: msgId++, ...msg });
      if (list.length > 40) list.shift();
      threads.set(key, list);
      const u = unread.get(to) ?? new Map<number, number>();
      u.set(from, (u.get(from) ?? 0) + 1);
      unread.set(to, u);
    }

    return {
      start() {
        const t = ctx.timer(INTRO, startGame);
        introTimer = t;
        phaseDeadline = t.deadline;
        phaseDuration = t.duration;
        publish();
        introCheck();
        ctx.after(TICK, tick);
      },

      onAction(playerId, a) {
        const e = empOf.get(playerId);
        if (e == null || !a || typeof a !== 'object') return;
        const emp = s.empires[e];
        const playing = phase === 'run' || phase === 'plan' || phase === 'resolve';
        switch (a.type) {
          case 'ready':
            if (phase === 'intro') {
              ready.add(playerId);
              introCheck();
            } else if (phase === 'plan') {
              if (a.off) ready.delete(playerId);
              else ready.add(playerId);
              planCheck();
            }
            break;
          case 'send': {
            if (!playing || emp.out) return;
            const o: E.Order = { from: Number(a.from), to: Number(a.to), n: Math.floor(Number(a.n)) };
            if (a.parked != null) { o.parked = Number(a.parked); o.from = -1; }
            if (!Number.isInteger(o.to) || !(o.n >= 1)) return;
            if (rounds) {
              // nur prüfen, gestartet wird in der Auflösung
              if (o.parked == null) {
                const from = s.stars[o.from];
                const planned = (orders.get(e) ?? []).filter((x) => x.parked == null && x.from === o.from).reduce((sum, x) => sum + x.n, 0);
                if (!from || from.owner !== e || o.from === o.to || E.starDist(s, o.from, o.to) > E.rangeOf(s, e) + 1e-6) return;
                o.n = Math.min(o.n, from.ships - planned);
                if (o.n < 1) return;
              } else {
                const p = s.parked.find((q) => q.id === o.parked && q.owner === e);
                if (!p) return;
                o.n = p.ships;
              }
              queue(e, o);
            } else if (E.sendFleet(s, e, o)) return;
            break;
          }
          case 'cancel': {
            const list = orders.get(e);
            if (list && Number.isInteger(a.i)) list.splice(a.i, 1);
            break;
          }
          case 'upgrade':
            if (!playing || E.upgrade(s, e, Number(a.star), a.kind)) return;
            break;
          case 'research':
            if (!playing) return;
            E.setResearch(s, e, a.tech);
            break;
          case 'chat': {
            const to = Number(a.to);
            const text = String(a.text ?? '').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX);
            if (!playing || !s.empires[to]?.human || to === e || !text) return;
            chat(e, to, { x: text });
            break;
          }
          case 'money': {
            const to = Number(a.to);
            if (!playing || !s.empires[to]?.human || E.giveMoney(s, e, to, Number(a.amount))) return;
            chat(e, to, { m: Math.floor(Number(a.amount)) });
            tv({ k: 'gift' });
            break;
          }
          case 'tech': {
            const to = Number(a.to);
            if (!playing || !s.empires[to]?.human || E.giveTech(s, e, to, a.tech)) return;
            chat(e, to, { t: a.tech, l: s.empires[to].tech[a.tech as E.Tech] });
            tv({ k: 'gift' });
            break;
          }
          case 'read': {
            unread.get(e)?.delete(Number(a.peer));
            break;
          }
          default:
            return;
        }
        publish();
      },

      onPlayerRejoin() {
        dirty = true;
      },

      bot() {
        // Testspieler werden auf dem Server wie Computer-Reiche gesteuert (siehe runAuto)
        return null;
      },
    };
  },
} satisfies GameServerModule;
