/**
 * Heiße Kartoffel – eine Bombe mit geheimer Zündschnur wandert von Spieler zu Spieler.
 * Wer sie hat, muss eine Mini-Aufgabe lösen und darf sie erst dann weiterwerfen (nicht direkt zurück).
 * Wer sie beim Knall hält, verliert ein Leben. Wer keine Leben mehr hat, ist raus. Der Letzte gewinnt.
 *
 * Punkte: jede überlebte Explosion +100, Sieg +500.
 */

import { Scores, pick, shuffle, type GameContext, type GameServerModule } from '@up/sdk';

const T = { intro: 9, boom: 5, start: 3 };
const POINTS = { survive: 100, win: 500 };

type Task =
  | { kind: 'shape'; target: [number, number]; options: [number, number][] }
  | { kind: 'order'; cells: (number | null)[] }
  | { kind: 'math'; a: number; b: number; options: number[] }
  | { kind: 'tap'; count: number };

function makeTask(): Task {
  const kind = pick(['shape', 'order', 'math', 'tap'] as const);
  if (kind === 'shape') {
    // Form (0 Kreis, 1 Quadrat, 2 Dreieck, 3 Stern) × Farbe (0–3); Ziel kommt genau einmal vor
    const all: [number, number][] = [];
    for (let s = 0; s < 4; s++) for (let c = 0; c < 4; c++) all.push([s, c]);
    const opts = shuffle(all).slice(0, 6);
    return { kind, target: pick(opts), options: opts };
  }
  if (kind === 'order') {
    const cells: (number | null)[] = Array(9).fill(null);
    shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8]).slice(0, 4).forEach((pos, i) => (cells[pos] = i + 1));
    return { kind, cells };
  }
  if (kind === 'math') {
    const a = 2 + Math.floor(Math.random() * 11), b = 2 + Math.floor(Math.random() * 11);
    const wrong = new Set<number>();
    while (wrong.size < 3) {
      const w = a + b + pick([-3, -2, -1, 1, 2, 3, 10, -10]);
      if (w > 0 && w !== a + b) wrong.add(w);
    }
    return { kind, a, b, options: shuffle([a + b, ...wrong]) };
  }
  return { kind: 'tap', count: 6 + Math.floor(Math.random() * 4) };
}

export default {
  create(ctx: GameContext) {
    const ids = ctx.players.map((p) => p.id);
    const scores = new Scores(ids);
    const maxLives = Number(ctx.options.lives) || 1;
    const lives = new Map(ids.map((id) => [id, maxLives]));
    const outOrder: string[] = [];
    let holder = '';
    let prev: string | null = null;
    let phase: 'intro' | 'task' | 'throw' | 'boom' | 'final' = 'intro';
    let task: Task = makeTask();
    let taskId = 0;
    let roundStart = 0;
    let passes = 0;
    let lastThrowAt = 0;
    let fuse: { cancel(): void } | null = null;
    const throwsBy = new Map<string, number>();

    const alive = () => ids.filter((id) => (lives.get(id) ?? 0) > 0);
    const name = (id: string) => ctx.player(id)?.name ?? '?';

    function intro() {
      ctx.setHostView({ screen: 'intro' });
      ctx.setAllPlayerViews(() => ({ screen: 'intro' }));
      ctx.after(T.intro, () => startRound(pick(ids)));
    }

    function startRound(first: string) {
      holder = first;
      prev = null;
      passes = 0;
      roundStart = Date.now() + T.start * 1000;
      lastThrowAt = roundStart;
      // geheime Zündschnur: 14–30 s, bei vielen Spielern etwas länger
      const seconds = T.start + 14 + Math.random() * 16 + (alive().length > 8 ? 6 : 0);
      fuse?.cancel();
      fuse = ctx.timer(seconds, explode);
      giveTask();
    }

    function giveTask() {
      phase = 'task';
      task = makeTask();
      taskId++;
      views();
    }

    function hostView(extra: object = {}) {
      ctx.setHostView({
        screen: 'round', players: ids, alive: alive(), lives: Object.fromEntries(lives), maxLives, holder, prev, roundStart, passes, lastThrowAt, phase, ...extra,
      });
    }

    function views() {
      hostView();
      for (const id of ids) {
        if (!lives.get(id)) ctx.setPlayerView(id, { screen: 'out', place: ids.length - outOrder.indexOf(id) });
        else if (id !== holder) ctx.setPlayerView(id, { screen: 'safe', holder: name(holder), lives: lives.get(id), maxLives, roundStart });
        else if (phase === 'task') ctx.setPlayerView(id, { screen: 'task', task, taskId, roundStart, lives: lives.get(id), maxLives });
        else {
          const others = alive().filter((x) => x !== id);
          const targets = others.length >= 2 && prev ? others.filter((x) => x !== prev) : others;
          ctx.setPlayerView(id, { screen: 'throw', targets, roundStart });
        }
      }
    }

    function throwTo(target: string) {
      prev = holder;
      holder = target;
      passes++;
      lastThrowAt = Date.now();
      giveTask();
    }

    function explode() {
      if (phase === 'boom' || phase === 'final') return;
      phase = 'boom';
      const victim = holder;
      lives.set(victim, Math.max(0, (lives.get(victim) ?? 1) - 1));
      const out = lives.get(victim) === 0;
      if (out) outOrder.push(victim);
      for (const id of alive()) if (id !== victim) scores.add(id, POINTS.survive);
      hostView({ screen: 'boom', victim, out });
      for (const id of ids) {
        if (id === victim) ctx.setPlayerView(id, { screen: 'boom', out, lives: lives.get(id), maxLives });
        else if (!lives.get(id)) ctx.setPlayerView(id, { screen: 'out', place: ids.length - outOrder.indexOf(id) });
        else ctx.setPlayerView(id, { screen: 'phew', victim: name(victim) });
      }
      ctx.after(T.boom, () => {
        const left = alive();
        if (left.length <= 1) return finish(left[0]);
        // Wer explodiert ist und noch lebt, fängt an – sonst jemand Zufälliges
        startRound(left.includes(victim) ? victim : pick(left));
      });
    }

    function finish(winner?: string) {
      phase = 'final';
      fuse?.cancel();
      if (winner) scores.add(winner, POINTS.win);
      const ranking = scores.ranking();
      ctx.setHostView({ screen: 'final', ranking, winner: winner ?? null, throwsBy: Object.fromEntries(throwsBy) });
      ctx.setAllPlayerViews((p) => ({ screen: 'finalMe', won: p.id === winner, score: scores.get(p.id), place: ranking.filter((r) => r.score > scores.get(p.id)).length + 1, of: ranking.length }));
      ctx.finish(ranking);
    }

    return {
      start: intro,
      onAction(id, action) {
        if (!action || id !== holder) return;
        if (action.type === 'solved' && phase === 'task' && action.taskId === taskId) {
          phase = 'throw';
          views();
        } else if (action.type === 'throw' && phase === 'throw') {
          const target = String(action.target);
          if (target === id || !lives.get(target)) return;
          const others = alive().filter((x) => x !== id);
          if (others.length >= 2 && target === prev) return;
          throwsBy.set(id, (throwsBy.get(id) ?? 0) + 1);
          throwTo(target);
        }
      },
      bot(_id, view) {
        if (view.screen === 'task') return { type: 'solved', taskId: view.taskId };
        if (view.screen === 'throw') return { type: 'throw', target: pick(view.targets as string[]) };
        return null;
      },
    };
  },
} satisfies GameServerModule;
