/**
 * Hochstapler – alle kennen die Aufgabe, nur einer nicht. Er muss mitmachen, ohne aufzufliegen.
 *
 * Modi: Hand heben, Finger zeigen, auf jemanden zeigen. In den Spiel-Einstellungen: ein Modus,
 * alle drei abwechselnd oder zufällig. Pro Runde: neuer Hochstapler, ein Modus, bis zu 3 Aufgaben.
 * Nach jeder Aufgabe wird abgestimmt. Mehr als die Hälfte auf dieselbe Person → Anklage.
 */

import { Scores, pick, shuffle, type GameContext, type GameServerModule } from '@up/sdk';

type Category = 'hands' | 'number' | 'point';

interface Task {
  id: string;
  category: Category;
  task: string;
}

const CATEGORIES: Category[] = ['hands', 'number', 'point'];
const T = { read: 7, ready: 3, hold: 7, vote: 45, lastChance: 5, result: 8 };
const POINTS = { caught: [1000, 750, 500], survivedTask: 250, escaped: 2000 };

export default {
  create(ctx: GameContext) {
    const ids = ctx.players.map((p) => p.id);
    const scores = new Scores(ids);
    const mode = String(ctx.options.mode ?? 'rotate');
    const totalRounds = Number(ctx.options.rounds) || Math.min(5, ids.length);
    const all = ctx.content<Task>().filter((t) => CATEGORIES.includes(t.category));
    const byCat = new Map<Category, Task[]>(CATEGORIES.map((c) => [c, all.filter((t) => t.category === c)]));
    const fakerOrder = shuffle(ids);
    const rotation = shuffle(CATEGORIES);

    let round = 0;
    let taskNo = 0; // 0..2
    let faker = '';
    let category: Category = 'hands';
    let tasks: Task[] = [];
    let phase: 'intro' | 'read' | 'go' | 'vote' | 'result' | 'scores' = 'intro';
    let timer: { cancel(): void; deadline: number; duration: number } | null = null;
    let votes = new Map<string, string>();
    let roundStart = scores.snapshot();

    const name = (id: string) => ctx.player(id)?.name ?? '?';
    const task = () => tasks[taskNo];
    const base = () => ({ round, totalRounds, taskNo: taskNo + 1, category });

    function intro() {
      ctx.setHostView({ screen: 'intro', mode });
      ctx.setAllPlayerViews(() => ({ screen: 'intro' }));
      ctx.after(12, startRound);
    }

    function pickCategory(): Category {
      if ((CATEGORIES as string[]).includes(mode)) return mode as Category;
      if (mode === 'random') return pick(CATEGORIES);
      return rotation[(round - 1) % rotation.length];
    }

    function startRound() {
      round++;
      roundStart = scores.snapshot();
      // Jeder kommt reihum dran; bei mehr Runden als Spielern wird die Reihenfolge neu gemischt
      faker = fakerOrder[(round - 1) % fakerOrder.length];
      category = pickCategory();
      const pool = byCat.get(category)!;
      if (pool.length < 3) pool.push(...shuffle(all.filter((t) => t.category === category)));
      tasks = pool.splice(0, 3);
      taskNo = 0;
      startTask();
    }

    function playerTaskView(id: string, extra: object = {}) {
      return id === faker
        ? { screen: 'faker', category, ...extra }
        : { screen: 'task', category, task: task().task, ...extra };
    }

    function startTask() {
      votes = new Map();
      phase = 'read';
      const t = ctx.timer(T.read, startGo);
      timer = t;
      ctx.setHostView({ screen: 'read', ...base(), deadline: t.deadline, duration: t.duration });
      ctx.setAllPlayerViews((p) => ({ ...playerTaskView(p.id), input: true }));
    }

    /* Countdown, dann machen alle gleichzeitig */
    function startGo() {
      phase = 'go';
      const t = ctx.timer(T.ready + T.hold, startVote);
      timer = t;
      const goAt = t.deadline - t.duration * (T.hold / (T.ready + T.hold));
      ctx.setHostView({ screen: 'go', ...base(), now: goAt, deadline: t.deadline, duration: t.duration });
      ctx.setAllPlayerViews((p) => playerTaskView(p.id, { go: true, goAt }));
    }

    /* Abstimmen */
    function startVote() {
      phase = 'vote';
      const t = ctx.timer(T.vote, resolveVote);
      timer = t;
      hostVote();
      ids.forEach(voteView);
    }

    function hostVote() {
      ctx.setHostView({ screen: 'vote', ...base(), voted: votes.size, voters: ids.length, deadline: timer!.deadline, duration: timer!.duration });
    }

    function voteView(id: string) {
      ctx.setPlayerView(id, {
        screen: 'vote', input: !votes.has(id), isFaker: id === faker, category, options: ids.filter((x) => x !== id),
        selected: votes.get(id) ?? null, deadline: timer!.deadline, duration: timer!.duration,
      });
    }

    function hurry() {
      if (!timer || timer.deadline - Date.now() <= T.lastChance * 1200) return;
      timer.cancel();
      timer = ctx.timer(T.lastChance, resolveVote);
      hostVote();
      ids.forEach(voteView);
    }

    function resolveVote() {
      timer?.cancel();
      phase = 'result';
      const counts = new Map<string, number>();
      for (const target of votes.values()) counts.set(target, (counts.get(target) ?? 0) + 1);
      const tally = ids.map((id) => ({ playerId: id, votes: counts.get(id) ?? 0, voters: [...votes].filter(([, t]) => t === id).map(([v]) => v) }))
        .sort((a, b) => b.votes - a.votes);
      const top = tally[0];
      const majority = top && top.votes > ids.length / 2;
      let outcome: 'caught' | 'wrong' | 'none' | 'escaped';
      if (majority && top.playerId === faker) outcome = 'caught';
      else if (majority) outcome = 'wrong';
      else outcome = taskNo >= 2 ? 'escaped' : 'none';

      const gained = new Map<string, number>();
      const add = (id: string, pts: number) => {
        scores.add(id, pts);
        gained.set(id, (gained.get(id) ?? 0) + pts);
      };
      if (outcome === 'caught') {
        for (const [voter, target] of votes) if (target === faker && voter !== faker) add(voter, POINTS.caught[taskNo]);
        if (taskNo > 0) add(faker, taskNo * POINTS.survivedTask);
      } else if (outcome === 'wrong' || outcome === 'escaped') {
        add(faker, POINTS.escaped);
      }
      const roundOver = outcome !== 'none';
      ctx.setHostView({
        screen: 'result', ...base(), outcome, tally: tally.filter((x) => x.votes > 0), accused: majority ? top.playerId : null,
        faker: roundOver ? faker : null, task: roundOver ? tasks.slice(0, taskNo + 1).map((x) => x.task) : null,
        gained: Object.fromEntries(gained),
      });
      ctx.setAllPlayerViews((p) => ({
        screen: 'outcome', outcome, isFaker: p.id === faker, roundOver, category,
        correct: votes.get(p.id) === faker, points: gained.get(p.id) ?? 0, fakerName: roundOver ? name(faker) : null,
      }));
      ctx.after(T.result, () => {
        if (!roundOver) {
          taskNo++;
          startTask();
        } else showScores(round >= totalRounds);
      });
    }

    function showScores(final: boolean) {
      phase = 'scores';
      const ranking = scores.ranking();
      ctx.setHostView({ screen: final ? 'final' : 'scores', before: roundStart, after: scores.snapshot(), ranking, round, totalRounds });
      ctx.setAllPlayerViews((p) => ({ screen: final ? 'finalMe' : 'scoresMe', score: scores.get(p.id), place: ranking.filter((r) => r.score > scores.get(p.id)).length + 1, of: ranking.length }));
      if (final) ctx.finish(ranking);
      else ctx.after(7, startRound);
    }

    return {
      start: intro,
      onAction(id, action) {
        if (action?.type !== 'vote' || phase !== 'vote') return;
        const target = String(action.target);
        if (target === id || !ids.includes(target)) return;
        votes.set(id, target);
        voteView(id);
        hostVote();
        if (ids.every((p) => votes.has(p) || !ctx.player(p)?.connected)) hurry();
      },
      bot(id, view) {
        if (view.screen === 'vote' && !view.selected) {
          // Bots tippen etwas besser als zufällig: 50 % auf den Hochstapler
          const target = id !== faker && Math.random() < 0.5 ? faker : pick(view.options as string[]);
          return { type: 'vote', target };
        }
        return null;
      },
    };
  },
} satisfies GameServerModule;
