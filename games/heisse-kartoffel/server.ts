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
  | { kind: 'tap'; count: number }
  | { kind: 'stroop'; word: number; ink: number; options: number[] };

function makeTask(): Task {
  const kind = pick(['shape', 'order', 'math', 'tap', 'stroop'] as const);
  if (kind === 'stroop') {
    // Farbwort in einer anderen Farbe – getippt wird die Schriftfarbe
    const word = Math.floor(Math.random() * 4);
    const ink = pick([0, 1, 2, 3].filter((c) => c !== word));
    return { kind, word, ink, options: shuffle([0, 1, 2, 3]) };
  }
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
    /** Kartoffeln im Spiel (ab 8 Lebenden auf Wunsch zwei) */
    type Pot = { holder: string; prev: string | null; phase: 'task' | 'throw'; task: Task; taskId: number; lastThrowAt: number };
    let pots: Pot[] = [];
    const twoPots = ctx.options.potatoes === 'two';
    let phase: 'intro' | 'play' | 'boom' | 'final' = 'intro';
    let taskCounter = 0;
    let roundStart = 0;
    let passes = 0;
    let fuse: { cancel(): void } | null = null;
    const throwsBy = new Map<string, number>();

    const alive = () => ids.filter((id) => (lives.get(id) ?? 0) > 0);
    const name = (id: string) => ctx.player(id)?.name ?? '?';
    const potOf = (id: string) => pots.find((p) => p.holder === id);

    function intro() {
      ctx.setHostView({ screen: 'intro', twoPots });
      ctx.setAllPlayerViews(() => ({ screen: 'intro' }));
      ctx.after(T.intro, () => startRound([pick(ids)]));
    }

    function newTask(pot: Pot) {
      pot.phase = 'task';
      pot.task = makeTask();
      pot.taskId = ++taskCounter;
    }

    function startRound(first: string[]) {
      const left = alive();
      const count = twoPots && left.length >= 8 ? 2 : 1;
      const starters = [...new Set(first.filter((id) => left.includes(id)))];
      while (starters.length < count) starters.push(pick(left.filter((id) => !starters.includes(id))));
      passes = 0;
      roundStart = Date.now() + T.start * 1000;
      pots = starters.slice(0, count).map((holder) => {
        const pot: Pot = { holder, prev: null, phase: 'task', task: makeTask(), taskId: 0, lastThrowAt: roundStart };
        newTask(pot);
        return pot;
      });
      phase = 'play';
      // geheime Zündschnur: 14–30 s, bei vielen Spielern etwas länger
      const seconds = T.start + 14 + Math.random() * 16 + (left.length > 8 ? 6 : 0);
      fuse?.cancel();
      fuse = ctx.timer(seconds, explode);
      views();
    }

    function hostView(extra: object = {}) {
      const p0 = pots[0];
      ctx.setHostView({
        screen: 'round', players: ids, alive: alive(), lives: Object.fromEntries(lives), maxLives, roundStart, passes,
        holder: p0?.holder ?? '', prev: p0?.prev ?? null, lastThrowAt: p0?.lastThrowAt ?? 0, phase: p0?.phase ?? 'task',
        pots: pots.map((p) => ({ holder: p.holder, phase: p.phase })), ...extra,
      });
    }

    function targetsFor(id: string, pot: Pot) {
      const others = alive().filter((x) => x !== id);
      let targets = others.length >= 2 && pot.prev ? others.filter((x) => x !== pot.prev) : others;
      // niemand bekommt zwei Kartoffeln auf einmal
      const busy = targets.filter((x) => !potOf(x));
      if (busy.length) targets = busy;
      return targets;
    }

    function views() {
      hostView();
      for (const id of ids) playerView(id);
    }

    function playerView(id: string) {
      const pot = potOf(id);
      if (!lives.get(id)) ctx.setPlayerView(id, { screen: 'out', place: ids.length - outOrder.indexOf(id) });
      else if (!pot) ctx.setPlayerView(id, { screen: 'safe', holder: pots.map((p) => name(p.holder)).join(' & '), lives: lives.get(id), maxLives, roundStart });
      else if (pot.phase === 'task') ctx.setPlayerView(id, { screen: 'task', task: pot.task, taskId: pot.taskId, roundStart, lives: lives.get(id), maxLives });
      else ctx.setPlayerView(id, { screen: 'throw', targets: targetsFor(id, pot), roundStart });
    }

    function explode() {
      if (phase !== 'play') return;
      phase = 'boom';
      const victims = pots.map((p) => p.holder);
      const outs: string[] = [];
      for (const v of victims) {
        lives.set(v, Math.max(0, (lives.get(v) ?? 1) - 1));
        if (lives.get(v) === 0) {
          outOrder.push(v);
          outs.push(v);
        }
      }
      for (const id of alive()) if (!victims.includes(id)) scores.add(id, POINTS.survive);
      hostView({ screen: 'boom', victim: victims[0], victims, out: outs.includes(victims[0]), outs });
      for (const id of ids) {
        if (victims.includes(id)) ctx.setPlayerView(id, { screen: 'boom', out: outs.includes(id), lives: lives.get(id), maxLives });
        else if (!lives.get(id)) ctx.setPlayerView(id, { screen: 'out', place: ids.length - outOrder.indexOf(id) });
        else ctx.setPlayerView(id, { screen: 'phew', victim: victims.map(name).join(' & ') });
      }
      ctx.after(T.boom, () => {
        const left = alive();
        if (left.length <= 1) return finish(left[0]);
        // Wer explodiert ist und noch lebt, fängt an – sonst jemand Zufälliges
        startRound(victims.filter((v) => left.includes(v)));
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
        const pot = potOf(id);
        if (!action || !pot || phase !== 'play') return;
        if (action.type === 'solved' && pot.phase === 'task' && action.taskId === pot.taskId) {
          pot.phase = 'throw';
          hostView();
          playerView(id);
        } else if (action.type === 'throw' && pot.phase === 'throw') {
          const target = String(action.target);
          if (!targetsFor(id, pot).includes(target)) return;
          throwsBy.set(id, (throwsBy.get(id) ?? 0) + 1);
          pot.prev = id;
          pot.holder = target;
          pot.lastThrowAt = Date.now();
          passes++;
          newTask(pot);
          hostView();
          playerView(id);
          playerView(target);
          // die anderen sehen, wer jetzt die Kartoffel(n) hat
          for (const x of ids) if (x !== id && x !== target && !potOf(x)) playerView(x);
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
