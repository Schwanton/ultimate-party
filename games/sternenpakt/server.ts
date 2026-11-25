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
const INTRO = 60;
const PLAN = 40;
/** Bedenkpause (Echtzeit): so lange steht die Zeit */
const BREAK = 60;
const RESOLVE = 15;
const RESOLVE_SPEED = E.YEAR / RESOLVE;
const REPLAY = 11;
const CHAT_MAX = 140;

const AI_NAMES: Record<string, string[]> = {
  de: ['Nexus', 'Kronos', 'Vortex', 'Omega'],
  en: ['Nexus', 'Kronos', 'Vortex', 'Omega'],
};
const AI_COLORS = ['#B9C2E8', '#FF8A5B', '#A98BFF', '#6BFFE0', '#FFE66B', '#FF6B8A'];

type Phase = 'intro' | 'run' | 'break' | 'plan' | 'resolve' | 'replay' | 'final';
interface ChatMsg { f: number; x?: string; m?: number; t?: E.Tech; l?: number; id: number }
type TvMsg = { id: number; k: string; e?: number; star?: number; by?: number; prev?: number };
const r2 = (n: number) => Math.round(n * 100) / 100;
const missionView = (m: E.Mission) => ({ k: m.k, star: m.star, target: m.target, pts: m.pts, done: m.done, failed: m.failed });

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
    // Startplätze mischen
    for (let i = seeds.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [seeds[i], seeds[j]] = [seeds[j], seeds[i]];
    }
    const years = Number(ctx.options.years) || 15;
    const rounds = ctx.options.takt === 'rounds';
    const rough = ctx.options.ships === 'rough';
    const announce = ctx.options.missions === 'announce';
    /** alle so viele Jahre eine Bedenkpause (0 = aus; nur Echtzeit) */
    const breakEvery = rounds ? 0 : Number(ctx.options.breaks) || 0;
    const s = E.createGame(seeds, years, rng);
    const empOf = new Map<string, number>(s.empires.map((e, i) => [e.id, i]));
    const map = s.stars.map((st) => [r2(st.x), r2(st.y), st.name, st.home, st.sp]);
    const neb = s.neb.map((n) => [r2(n.x), r2(n.y), r2(n.r)]);
    const wh = s.wh;
    const half = Math.floor(s.stars.length / 2) + 1;
    // Computer-Reiche und Testspieler wählen ihre Aufträge sofort
    s.empires.forEach((emp, e) => { if (emp.auto) E.chooseMissions(s, e, [0, 1]); });

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
    const notes = new Map<number, { id: number; k: string; tech?: E.Tech; level?: number; ships?: number; star?: number; m?: E.MissionKind }[]>();
    const orders = new Map<number, E.Order[]>();
    const threads = new Map<string, ChatMsg[]>();
    const unread = new Map<number, Map<number, number>>();
    let result: { e: number; stars: number; ships: number; heart: number; mis: number; pts: number }[] = [];
    let introTimer: { cancel(): void } | null = null;
    let planTimer: { cancel(): void } | null = null;
    let breakTimer: { cancel(): void } | null = null;
    let breakDue = false;

    const pair = (a: number, b: number) => (a < b ? `${a}|${b}` : `${b}|${a}`);
    const show = (n: number, mine: boolean) => (mine || !rough ? n : n === 0 ? 0 : `~${Math.max(5, Math.round(n / 5) * 5)}`);
    const tv = (m: Omit<TvMsg, 'id'>) => {
      msgs.push({ id: msgId++, ...m });
      if (msgs.length > 4) msgs.shift();
    };
    const note = (e: number, n: { k: string; tech?: E.Tech; level?: number; ships?: number; star?: number; m?: E.MissionKind }) => {
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
      map, neb, wh, heart: s.heart, emp: empView(), clock: clock(), year: s.year, years, rounds, phase, deadline: phaseDeadline, duration: phaseDuration,
      rank: E.standings(s, false).filter((r) => !s.empires[r.e].out || r.stars > 0).map((r) => [r.e, r.pts, r.stars, r.heart]), half, fx, banner,
    });
    /** [id, Besitzer, Schiffe, x0, y0, Ziel, t0, t1, getarnt(eigene), weitere Stationen (nur eigene), Wurmloch] */
    const fleetsFor = (viewer: number) => s.fleets
      .filter((f) => f.owner === viewer || !E.cloaked(s, f))
      .map((f) => [f.id, f.owner, show(f.ships, f.owner === viewer), r2(f.x0), r2(f.y0), f.to, r2(f.t0), r2(f.t1), f.owner === viewer && E.cloaked(s, f) ? 1 : 0, f.owner === viewer ? f.path : 0, f.wh ? 1 : 0]);
    const parkedFor = (viewer: number) => s.parked.map((p) => [p.id, p.owner, show(p.ships, p.owner === viewer), r2(p.x), r2(p.y)]);

    function hostView() {
      if (phase === 'intro') {
        return { screen: 'intro', ...common(), st: s.stars.map((st) => [st.owner, st.ships]), ready: ready.size, total: humans.filter((p) => !p.isBot).length };
      }
      if (phase === 'replay') return { screen: 'replay', map, neb, wh, heart: s.heart, emp: empView(), hist: s.history, winner: result[0]?.e ?? null, years };
      if (phase === 'final') {
        return {
          screen: 'final', emp: empView(), result, ranking: ranking(), map,
          missions: s.empires.map((emp) => emp.missions.map(missionView)),
        };
      }
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

    function bestFor(e: number) {
      const b = (k: E.Kind, border = false) => {
        const x = E.bestUpgrade(s, e, k, border);
        return x ? [x.star, x.cost] : null;
      };
      return { eco: b('eco'), ind: b('ind'), indB: b('ind', true), sci: b('sci') };
    }

    function phoneView(playerId: string) {
      const e = empOf.get(playerId);
      if (e == null) return { screen: 'watch' };
      const emp = s.empires[e];
      if (phase === 'intro') {
        return {
          screen: 'intro', me: e, ...common(), st: s.stars.map((st) => [st.owner, st.ships]), ready: ready.has(playerId),
          offer: emp.offer.map(missionView), chosen: emp.missions.length > 0,
        };
      }
      if (phase === 'replay' || phase === 'final') {
        const place = result.findIndex((r) => r.e === e);
        const r = result[place];
        return {
          screen: 'end', me: e, emp: empView(), map, place: place + 1, stars: r?.stars ?? 0, heart: r?.heart ?? 0, mis: r?.mis ?? 0, pts: r?.pts ?? 0,
          winner: result[0]?.e ?? null, missions: emp.missions.map(missionView),
        };
      }
      return {
        screen: 'play', me: e, ...common(),
        st: s.stars.map((st) => [st.owner, show(st.ships, st.owner === e)]),
        fl: fleetsFor(e), pk: parkedFor(e),
        money: emp.money, income: E.incomeOf(s, e), rate: E.researchRate(s, e), rp: Math.floor(emp.rp * 10) / 10,
        tech: emp.tech, research: emp.research, range: E.rangeOf(s, e), pirate: emp.pirate, out: emp.out, guard: emp.guard,
        my: s.stars.map((st, i) => ({ st, i })).filter(({ st }) => st.owner === e).map(({ st, i }) => [
          i, st.eco, st.ind, st.sci, E.upgradeCost(s, e, i, 'eco'), E.upgradeCost(s, e, i, 'ind'), E.upgradeCost(s, e, i, 'sci'), E.productionOf(s, e, i), st.rally, E.starIncome(s, e, st),
        ]),
        best: bestFor(e),
        missions: emp.missions.map(missionView),
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
          case 'heart':
            tv({ k: 'heart', e: ev.e });
            break;
          case 'rallyLost':
            note(ev.e, { k: 'rally', star: ev.star });
            break;
          case 'mission':
            note(ev.e, { k: 'mission', m: ev.m });
            if (announce) {
              ctx.after(20 + rng() * 70, () => {
                if (phase === 'replay' || phase === 'final') return;
                tv({ k: 'mission' });
                dirty = true;
              });
            }
            break;
          case 'year':
            banner = { year: ev.year, at: Date.now() };
            if (breakEvery && (ev.year - 1) % breakEvery === 0) breakDue = true;
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
      if (list.length >= 30) return false;
      list.push(o);
      orders.set(e, list);
      return true;
    }
    const plannedFrom = (e: number, from: number) => (orders.get(e) ?? []).filter((x) => x.parked == null && x.from === from).reduce((sum, x) => sum + x.n, 0);

    function tick() {
      if (phase === 'run' || phase === 'resolve') {
        if (!rounds) runAuto(false);
        handle(E.tick(s, TICK * speed, rng));
        if (s.over) return end();
        if (phase === 'resolve' && s.sim >= resolveEnd - 1e-6) startPlan();
        if (phase === 'run' && breakDue) startBreak();
      }
      tickNo++;
      if (dirty || tickNo % PUBLISH_EVERY === 0) publish();
      ctx.after(TICK, tick);
    }

    function startGame() {
      if (phase !== 'intro') return;
      introTimer?.cancel();
      ready.clear();
      E.autoMissions(s);
      if (rounds) startPlan();
      else {
        phase = 'run';
        speed = 1;
        phaseDeadline = 0;
      }
      banner = { year: 1, at: Date.now() };
      dirty = true;
    }

    /** Bedenkpause: Zeit steht, Bauen und Befehle gehen weiter */
    function startBreak() {
      breakDue = false;
      phase = 'break';
      speed = 0;
      ready.clear();
      const t = ctx.timer(BREAK, endBreak);
      breakTimer = t;
      phaseDeadline = t.deadline;
      phaseDuration = t.duration;
      runAuto(true);
      dirty = true;
    }

    function endBreak() {
      if (phase !== 'break') return;
      breakTimer?.cancel();
      ready.clear();
      phase = 'run';
      speed = 1;
      phaseDeadline = 0;
      banner = { year: s.year, at: Date.now() };
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
      breakTimer?.cancel();
      result = E.standings(s, true);
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
      if (real.length && real.every((p) => ready.has(p.id))) ctx.after(0.8, phase === 'break' ? endBreak : startResolve);
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

    /** Flug planen (Runden) oder sofort starten (Echtzeit). Liefert true bei Erfolg. */
    function order(e: number, o: E.Order) {
      if (!rounds) return !E.sendFleet(s, e, o);
      if (o.parked == null) {
        const from = s.stars[o.from];
        if (!from || from.owner !== e || o.from === o.to || !E.routeFor(s, e, o.from, o.to)) return false;
        o.n = Math.min(o.n, from.ships - plannedFrom(e, o.from));
        if (o.n < 1) return false;
      } else {
        const p = s.parked.find((q) => q.id === o.parked && q.owner === e);
        if (!p) return false;
        o.n = p.ships;
      }
      return queue(e, o);
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
        const playing = phase === 'run' || phase === 'break' || phase === 'plan' || phase === 'resolve';
        switch (a.type) {
          case 'missions':
            if (phase !== 'intro' || !Array.isArray(a.pick) || E.chooseMissions(s, e, a.pick)) return;
            break;
          case 'ready':
            if (phase === 'intro') {
              if (!emp.missions.length) E.chooseMissions(s, e, [0, 1]);
              ready.add(playerId);
              introCheck();
            } else if (phase === 'plan' || phase === 'break') {
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
            if (!order(e, o)) return;
            break;
          }
          case 'pull': {
            if (!playing || emp.out || !Array.isArray(a.from)) return;
            const to = Number(a.to);
            if (s.stars[to]?.owner !== e) return;
            const froms = [...new Set((a.from as unknown[]).map(Number))].filter((f) => Number.isInteger(f) && f !== to).slice(0, 40);
            if (rounds) {
              for (const f of froms) {
                const st = s.stars[f];
                if (!st || st.owner !== e) continue;
                const n = st.ships - plannedFrom(e, f) - emp.guard;
                if (n >= 1) order(e, { from: f, to, n });
              }
            } else if (!E.pullShips(s, e, to, froms)) return;
            break;
          }
          case 'rally':
            if (!playing || E.setRally(s, e, Number(a.star), a.target == null ? -1 : Number(a.target))) return;
            break;
          case 'guard':
            if (!playing && phase !== 'intro') return;
            E.setGuard(s, e, Number(a.n));
            break;
          case 'cancel': {
            const list = orders.get(e);
            if (list && Number.isInteger(a.i)) list.splice(a.i, 1);
            break;
          }
          case 'upgrade':
            if (!playing || E.upgrade(s, e, Number(a.star), a.kind)) return;
            break;
          case 'upgradeBest': {
            if (!playing || !E.KINDS.includes(a.kind)) return;
            const b = E.bestUpgrade(s, e, a.kind, !!a.border);
            if (!b || E.upgrade(s, e, b.star, a.kind)) return;
            break;
          }
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
            // Auftrag „Geld verschenken“ sofort prüfen
            const ev: E.GameEvent[] = [];
            for (const m of emp.missions) if (m.k === 'give' && !m.done && emp.given >= 200) { m.done = true; ev.push({ k: 'mission', e, m: 'give' }); }
            handle(ev);
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
