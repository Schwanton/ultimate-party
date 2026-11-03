/**
 * Schwarmsinn – bis zu 4 Figuren durch ein Labyrinth im Nebel zu ihren Ausgängen steuern.
 * Jede Aktion (Farbe + Richtung) liegt bei einem Spieler: Ohne Absprache geht nichts.
 *
 * Ablauf pro Level: (Erklärung neuer Bausteine) → Verteilung + Countdown → Spielen → geschafft (VIP entscheidet)
 * oder Zeit um (alle stimmen ab: genau so nochmal / neu erzeugen / nächstes Level).
 */

import { Scores, shuffle, type GameContext, type GameServerModule } from '@up/sdk';
import { DIRS, allHome, doorStates, initialState, move, type Dir, type GameEvent, type Level, type State } from './rules';
import { LEVEL_COUNT, generate } from './gen';

const T = { intro: 9, explain: 15, assign: 5, restart: 3, decide: 60, vote: 20, voteHurry: 3, pick: 45, end: 12 };
const MIN_STEP_MS = 140;
const DROP_AFTER_MS = 5000;

type Action = { f: number; d: Dir };
type Choice = 'next' | 'same' | 'new' | 'pick' | 'end';
const akey = (a: Action) => `${a.f}:${a.d}`;

interface PStats { presses: number; bumps: number; lava: number; homes: number }

/** Welche Bausteine kommen in diesem Level vor? (in Erklär-Reihenfolge) */
function featuresOf(L: Level): string[] {
  const g = L.grid.join('');
  const has = (k: string, cond: boolean) => (cond ? [k] : []);
  return [
    'controls', 'exit', ...has('fog', L.rooms.length > 1),
    ...has('figures', L.figures === 2), ...has('three', L.figures === 3), ...has('four', L.figures === 4),
    ...has('hold', L.doors.some((d) => d.kind === 'hold')),
    ...has('switch', L.doors.some((d) => d.kind === 'switch' && d.color == null)),
    ...has('color', L.doors.some((d) => d.color != null)),
    ...has('ice', g.includes('I')), ...has('lava', g.includes('L')), ...has('teleport', L.teleports.length > 0),
    ...has('oneway', /[urdl]/.test(g)), ...has('multistart', L.startRooms.length > 1),
    ...(['lantern', 'key', 'ghost', 'swap'] as const).filter((k) => L.items.some((i) => i.kind === k)),
    ...has('chaos', L.chaos.length > 0),
  ];
}

export default {
  create(ctx: GameContext) {
    const ids = ctx.players.map((p) => p.id);
    const scores = new Scores(ids);
    const timeFactor = Number(ctx.options.time) || 1;
    let levelN = Math.max(1, Number(ctx.options.level) || 1);
    let seed = 0;
    let L!: Level;
    let S!: State;
    let phase: 'intro' | 'explain' | 'assign' | 'play' | 'finishing' | 'won' | 'lost' | 'pick' | 'end' = 'intro';
    let timer: { cancel(): void; deadline: number; duration: number } | null = null;
    let startedAt = 0;
    let assignment = new Map<string, Action[]>();
    const restartVotes = new Set<string>();
    let votes = new Map<string, Choice>();
    const explained = new Set<string>();
    const lastStep: number[] = [0, 0, 0, 0];
    const disconnectedSince = new Map<string, number>();
    let stats = new Map<string, PStats>();
    const totals = new Map<string, PStats>();
    let flashes: { p: string; a: string; at: number }[] = [];
    let events: (GameEvent & { id: number })[] = [];
    let evSeq = 0;
    let watch = 0;
    const results: { n: number; stars: number; seconds: number; won: boolean }[] = [];
    let lastResult: { stars: number; seconds: number; presses: number; awards: Award[] } | null = null;

    const name = (id: string) => ctx.player(id)?.name ?? '?';
    const active = () => ids.filter((id) => ctx.player(id)?.connected);
    const decider = () => {
      const v = ctx.vip();
      if (v && ids.includes(v) && ctx.player(v)?.connected) return v;
      return active()[0] ?? ids[0];
    };
    const st = (id: string) => {
      if (!stats.has(id)) stats.set(id, { presses: 0, bumps: 0, lava: 0, homes: 0 });
      return stats.get(id)!;
    };

    /* ---------- Level vorbereiten ---------- */

    function intro() {
      ctx.setHostView({ screen: 'intro' });
      ctx.setAllPlayerViews(() => ({ screen: 'intro' }));
      ctx.after(T.intro, () => loadLevel(levelN, true));
    }

    function loadLevel(n: number, fresh: boolean) {
      levelN = n;
      if (fresh || !seed) seed = (Math.random() * 2 ** 31) >>> 0;
      L = generate(levelN, seed);
      const newOnes = featuresOf(L).filter((k) => !explained.has(k));
      if (newOnes.length) {
        newOnes.forEach((k) => explained.add(k));
        phase = 'explain';
        const t = ctx.timer(T.explain, startAssign);
        timer = t;
        ctx.setHostView({ screen: 'explain', n: levelN, figures: L.figures, features: newOnes, decider: decider(), deadline: t.deadline, duration: t.duration });
        ctx.setAllPlayerViews((p) => ({ screen: 'explain', isDecider: p.id === decider(), n: levelN }));
      } else startAssign();
    }

    function distribute(players: string[], random: boolean) {
      const acts: Action[] = [];
      for (const d of DIRS) for (let f = 0; f < L.figures; f++) acts.push({ f, d });
      const list = random ? shuffle(acts) : acts;
      const ps = shuffle(players.length ? players : ids);
      const out = new Map<string, Action[]>(ids.map((id) => [id, []]));
      if (ps.length <= list.length) {
        ps.forEach((id, i) => out.set(id, list.slice(Math.floor((i * list.length) / ps.length), Math.floor(((i + 1) * list.length) / ps.length))));
      } else {
        ps.forEach((id, i) => out.set(id, [list[i % list.length]]));
      }
      return out;
    }

    function startAssign() {
      timer?.cancel();
      S = initialState(L);
      stats = new Map();
      restartVotes.clear();
      events = [];
      flashes = [];
      assignment = distribute(active(), false);
      phase = 'assign';
      const t = ctx.timer(T.assign, startPlay);
      timer = t;
      hostPlay(t.deadline);
      phones(t.deadline);
    }

    function restartSame() {
      // gleiche Verteilung, gleicher Grundriss
      S = initialState(L);
      stats = new Map();
      restartVotes.clear();
      events = [];
      phase = 'assign';
      timer?.cancel();
      const t = ctx.timer(T.restart, startPlay);
      timer = t;
      hostPlay(t.deadline);
      phones(t.deadline);
    }

    function startPlay() {
      phase = 'play';
      startedAt = Date.now();
      timer = ctx.timer(L.timeLimit * timeFactor, timeUp);
      hostPlay();
      phones();
      const myWatch = ++watch;
      const tick = () => {
        if (myWatch !== watch || phase !== 'play') return;
        checkDisconnects();
        ctx.after(1, tick);
      };
      ctx.after(1, tick);
    }

    /* ---------- Ansichten ---------- */

    function hostPlay(countdownTo?: number) {
      const now = Date.now();
      flashes = flashes.filter((x) => now - x.at < 700);
      ctx.setHostView({
        screen: 'play', n: levelN, phase, level: L,
        st: { pos: S.pos, home: S.home, open: doorStates(L, S), latched: S.latched, revealed: S.revealed, itemTaken: S.itemTaken, chaosUsed: S.chaosUsed, ghost: S.ghost, keys: S.keys },
        assign: Object.fromEntries([...assignment].map(([id, acts]) => [id, acts.map(akey)])),
        flashes, events: events.slice(-30), countdownTo: countdownTo ?? null,
        deadline: phase === 'play' ? timer?.deadline : null, duration: phase === 'play' ? timer?.duration : null,
        limit: L.timeLimit * timeFactor * 1000,
        restart: { votes: restartVotes.size, need: restartNeed() }, startedAt,
      });
    }

    function othersFor(id: string) {
      // „Ruf die anderen“: wer hat welche Richtung (ohne meine Aktionen)
      const mine = new Set((assignment.get(id) ?? []).map(akey));
      return DIRS.map((d) => ({
        d,
        who: [...assignment].filter(([pid]) => pid !== id).map(([pid, acts]) => ({ name: name(pid), figs: acts.filter((a) => a.d === d && !mine.has(akey(a))).map((a) => a.f) })).filter((x) => x.figs.length),
      }));
    }

    function phoneView(id: string, countdownTo?: number) {
      return {
        screen: 'play', n: levelN, live: phase === 'play', figures: L.figures, countdownTo: countdownTo ?? null,
        actions: assignment.get(id) ?? [], others: othersFor(id), home: S.home,
        restart: { votes: restartVotes.size, need: restartNeed(), mine: restartVotes.has(id) },
        deadline: phase === 'play' ? timer?.deadline : null, duration: phase === 'play' ? timer?.duration : null,
      };
    }

    function phones(countdownTo?: number) {
      ctx.setAllPlayerViews((p) => phoneView(p.id, countdownTo));
    }

    const restartNeed = () => Math.max(1, Math.ceil(active().length / 2));

    /* ---------- Spielen ---------- */

    function onMove(id: string, f: number, d: Dir) {
      if (phase !== 'play' || f < 0 || f >= L.figures || !DIRS.includes(d)) return;
      if (!(assignment.get(id) ?? []).some((a) => a.f === f && a.d === d)) return;
      const now = Date.now();
      if (now - lastStep[f] < MIN_STEP_MS) return;
      lastStep[f] = now;
      const s = st(id);
      s.presses++;
      const ev = move(L, S, f, d);
      for (const e of ev) {
        events.push({ ...e, id: ++evSeq });
        if (e.k === 'bump') s.bumps++;
        if (e.k === 'lava') s.lava++;
        if (e.k === 'home') s.homes++;
      }
      if (events.length > 60) events = events.slice(-30);
      flashes.push({ p: id, a: `${f}:${d}`, at: now });
      let phonesChanged = ev.some((e) => e.k === 'home');
      if (ev.some((e) => e.k === 'chaos')) {
        assignment = distribute(active(), true);
        phonesChanged = true;
      }
      if (allHome(L, S)) {
        phase = 'finishing';
        timer?.cancel();
        const seconds = (now - startedAt) / 1000;
        hostPlay();
        phones();
        ctx.after(1.6, () => won(seconds));
        return;
      }
      hostPlay();
      if (phonesChanged) phones();
    }

    function checkDisconnects() {
      const now = Date.now();
      let changed = false;
      for (const id of ids) {
        const connected = ctx.player(id)?.connected;
        if (connected) {
          disconnectedSince.delete(id);
          continue;
        }
        if (!disconnectedSince.has(id)) disconnectedSince.set(id, now);
        const mine = assignment.get(id) ?? [];
        if (mine.length && now - disconnectedSince.get(id)! > DROP_AFTER_MS) {
          const others = active();
          if (!others.length) continue;
          // Aktionen an die Verbundenen mit den wenigsten Knöpfen geben
          for (const a of mine) {
            const target = others.sort((x, y) => (assignment.get(x)?.length ?? 0) - (assignment.get(y)?.length ?? 0))[0];
            const list = assignment.get(target) ?? [];
            if (!list.some((b) => akey(b) === akey(a))) list.push(a);
            assignment.set(target, list);
          }
          assignment.set(id, []);
          changed = true;
        }
      }
      if (changed) {
        hostPlay();
        phones();
      }
    }

    function timeUp() {
      if (phase !== 'play') return;
      phase = 'lost';
      results.push({ n: levelN, stars: 0, seconds: L.timeLimit * timeFactor, won: false });
      addTotals();
      votes = new Map();
      const t = ctx.timer(T.vote, resolveVote);
      timer = t;
      lostViews();
    }

    function lostViews() {
      const counts = countVotes();
      ctx.setHostView({ screen: 'lost', n: levelN, level: L, st: { pos: S.pos, home: S.home, open: doorStates(L, S), latched: S.latched, revealed: S.revealed, itemTaken: S.itemTaken, chaosUsed: S.chaosUsed, ghost: S.ghost, keys: S.keys }, homeCount: S.home.filter(Boolean).length, counts, voted: votes.size, voters: active().length, deadline: timer!.deadline, duration: timer!.duration });
      const d = decider();
      ctx.setAllPlayerViews((p) => ({ screen: 'vote', isDecider: p.id === d, n: levelN, homeCount: S.home.filter(Boolean).length, figures: L.figures, counts, mine: votes.get(p.id) ?? null, deadline: timer!.deadline, duration: timer!.duration }));
    }

    function countVotes() {
      const c = { same: 0, new: 0, next: 0 };
      for (const v of votes.values()) if (v in c) c[v as 'same']++;
      return c;
    }

    function resolveVote() {
      timer?.cancel();
      const c = countVotes();
      // Gleichstand → genau so nochmal
      const best = c.next > c.same && c.next > c.new ? 'next' : c.new > c.same ? 'new' : 'same';
      applyChoice(best);
    }

    function won(seconds: number) {
      phase = 'won';
      const limit = L.timeLimit * timeFactor;
      const stars = seconds <= limit * 0.5 ? 3 : seconds <= limit * 0.75 ? 2 : 1;
      results.push({ n: levelN, stars, seconds, won: true });
      ids.forEach((id) => scores.add(id, stars * 100));
      addTotals();
      const presses = [...stats.values()].reduce((s, x) => s + x.presses, 0);
      lastResult = { stars, seconds, presses, awards: awards(stats) };
      const t = ctx.timer(T.decide, () => applyChoice('next'));
      timer = t;
      wonViews();
    }

    function wonViews() {
      const d = decider();
      ctx.setHostView({ screen: 'won', n: levelN, ...lastResult, limit: L.timeLimit * timeFactor, decider: d, maxLevel: LEVEL_COUNT, deadline: timer!.deadline, duration: timer!.duration });
      ctx.setAllPlayerViews((p) => (p.id === d
        ? { screen: 'decide', n: levelN, stars: lastResult!.stars, deadline: timer!.deadline, duration: timer!.duration }
        : { screen: 'waitDecide', decider: name(d), stars: lastResult!.stars }));
    }

    function addTotals() {
      for (const [id, s] of stats) {
        const t = totals.get(id) ?? { presses: 0, bumps: 0, lava: 0, homes: 0 };
        t.presses += s.presses;
        t.bumps += s.bumps;
        t.lava += s.lava;
        t.homes += s.homes;
        totals.set(id, t);
      }
    }

    function applyChoice(c: Choice) {
      timer?.cancel();
      if (c === 'end') return endGame();
      if (c === 'pick') return pickLevel();
      if (c === 'same') return startSameLayout();
      if (c === 'new') return loadLevel(levelN, true);
      return loadLevel(levelN + 1, true);
    }

    function startSameLayout() {
      L = generate(levelN, seed);
      startAssign();
    }

    function pickLevel() {
      phase = 'pick';
      const t = ctx.timer(T.pick, () => loadLevel(levelN + 1, true));
      timer = t;
      const d = decider();
      ctx.setHostView({ screen: 'pick', decider: d, n: levelN });
      ctx.setAllPlayerViews((p) => (p.id === d
        ? { screen: 'pickLevel', current: levelN, max: LEVEL_COUNT, best: bestStars(), deadline: t.deadline, duration: t.duration }
        : { screen: 'waitDecide', decider: name(d) }));
    }

    function bestStars() {
      const b: Record<number, number> = {};
      for (const r of results) b[r.n] = Math.max(b[r.n] ?? 0, r.stars);
      return b;
    }

    function endGame() {
      phase = 'end';
      const ranking = scores.ranking();
      ctx.setHostView({ screen: 'end', results, awards: awards(totals), totalStars: results.reduce((s, r) => s + r.stars, 0) });
      ctx.setAllPlayerViews(() => ({ screen: 'end', totalStars: results.reduce((s, r) => s + r.stars, 0), levels: results.filter((r) => r.won).length }));
      ctx.after(T.end, () => ctx.finish(ranking));
    }

    type Award = { kind: string; playerId: string; value: number };
    function awards(src: Map<string, PStats>): Award[] {
      const list = [...src].filter(([id]) => ids.includes(id));
      const top = (k: keyof PStats, kind: string, min = 1): Award | null => {
        const best = list.sort((a, b) => b[1][k] - a[1][k])[0];
        return best && best[1][k] >= min ? { kind, playerId: best[0], value: best[1][k] } : null;
      };
      const out = [top('presses', 'presses'), top('homes', 'homes'), top('bumps', 'bumps', 3), top('lava', 'lava')].filter(Boolean) as Award[];
      if (list.length >= 3) {
        const quiet = [...list].sort((a, b) => a[1].presses - b[1].presses)[0];
        if (quiet && !out.some((a) => a.playerId === quiet[0])) out.push({ kind: 'quiet', playerId: quiet[0], value: quiet[1].presses });
      }
      // jede Person höchstens einmal, maximal 4 Auszeichnungen
      const seen = new Set<string>();
      return out.filter((a) => (seen.has(a.playerId) ? false : (seen.add(a.playerId), true))).slice(0, 4);
    }

    return {
      start: intro,
      onAction(id, action) {
        if (!action || !ids.includes(id)) return;
        switch (action.type) {
          case 'move':
            return onMove(id, Number(action.f), action.d as Dir);
          case 'restart': {
            if (phase !== 'play') return;
            if (restartVotes.has(id)) restartVotes.delete(id);
            else restartVotes.add(id);
            if (restartVotes.size >= restartNeed()) return restartSame();
            hostPlay();
            phones();
            return;
          }
          case 'go':
            if (phase === 'explain' && id === decider()) startAssign();
            return;
          case 'decide':
            if (phase === 'won' && id === decider() && ['next', 'same', 'new', 'pick', 'end'].includes(action.choice)) applyChoice(action.choice);
            return;
          case 'endGame':
            if ((phase === 'lost' || phase === 'won') && id === decider()) applyChoice('end');
            return;
          case 'vote':
            if (phase !== 'lost' || !['same', 'new', 'next'].includes(action.choice)) return;
            votes.set(id, action.choice);
            if (active().every((p) => votes.has(p)) && timer && timer.deadline - Date.now() > T.voteHurry * 1000) {
              timer.cancel();
              timer = ctx.timer(T.voteHurry, resolveVote);
            }
            lostViews();
            return;
          case 'pickLevel': {
            const n = Math.round(Number(action.n));
            if (phase === 'pick' && id === decider() && n >= 1 && n <= LEVEL_COUNT + 1) loadLevel(n, true);
            return;
          }
        }
      },
      bot(id, view) {
        if (view.screen === 'play' && view.live && view.actions?.length) {
          const a = view.actions[Math.floor(Math.random() * view.actions.length)];
          return { type: 'move', f: a.f, d: a.d };
        }
        if (view.screen === 'explain' && view.isDecider) return { type: 'go' };
        if (view.screen === 'decide') return { type: 'decide', choice: view.n >= levelN && results.length >= 2 ? 'end' : 'next' };
        if (view.screen === 'vote' && view.isDecider && results.length >= 2) return { type: 'endGame' };
        if (view.screen === 'vote' && !view.mine) return { type: 'vote', choice: results.length >= 1 ? 'next' : 'same' };
        if (view.screen === 'pickLevel') return { type: 'pickLevel', n: 1 };
        return null;
      },
    };
  },
} satisfies GameServerModule;
