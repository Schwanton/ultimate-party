/**
 * Hochstapler – alle kennen die Aufgabe, nur einer nicht. Er muss mitmachen, ohne aufzufliegen.
 *
 * Pro Runde: neuer Hochstapler, eine Kategorie, bis zu 3 Aufgaben. Nach jeder Aufgabe wird abgestimmt.
 * Mehr als die Hälfte auf dieselbe Person → Anklage. Trifft sie den Hochstapler: erwischt.
 * Trifft sie einen Unschuldigen oder bleibt er 3 Aufgaben unentdeckt: Hochstapler gewinnt die Runde.
 */

import { Scores, cleanText, pick, shuffle, type GameContext, type GameServerModule } from '@up/sdk';

type Category = 'hands' | 'number' | 'face' | 'point' | 'text';

interface Task {
  id: string;
  category: Category;
  task: string;
}

const CATEGORIES: Category[] = ['hands', 'number', 'face', 'point', 'text'];
const T = { read: 7, ready: 3, hold: 7, write: 40, answers: 9, vote: 45, lastChance: 5, result: 8 };
const POINTS = { caught: [1000, 750, 500], survivedTask: 250, escaped: 2000 };

export default {
  create(ctx: GameContext) {
    const ids = ctx.players.map((p) => p.id);
    const scores = new Scores(ids);
    const totalRounds = Math.min(5, ids.length);
    const all = ctx.content<Task>();
    const byCat = new Map<Category, Task[]>(CATEGORIES.map((c) => [c, all.filter((t) => t.category === c)]));
    const fakerOrder = shuffle(ids);
    const usedCats: Category[] = [];

    let round = 0;
    let taskNo = 0; // 0..2
    let faker = '';
    let category: Category = 'hands';
    let tasks: Task[] = [];
    let phase: 'intro' | 'read' | 'write' | 'go' | 'vote' | 'result' | 'scores' = 'intro';
    let timer: { cancel(): void; deadline: number; duration: number } | null = null;
    let answers = new Map<string, string>();
    let votes = new Map<string, string>();
    let roundStart = scores.snapshot();

    const name = (id: string) => ctx.player(id)?.name ?? '?';
    const task = () => tasks[taskNo];
    const base = () => ({ round, totalRounds, taskNo: taskNo + 1, category });

    function intro() {
      ctx.setHostView({ screen: 'intro' });
      ctx.setAllPlayerViews(() => ({ screen: 'intro' }));
      ctx.after(12, startRound);
    }

    function pickCategory(): Category {
      const options = CATEGORIES.filter((c) => (byCat.get(c)?.length ?? 0) >= 3 && !usedCats.slice(-3).includes(c));
      const c = pick(options.length ? options : CATEGORIES.filter((x) => (byCat.get(x)?.length ?? 0) > 0));
      usedCats.push(c);
      return c;
    }

    function startRound() {
      round++;
      roundStart = scores.snapshot();
      faker = fakerOrder[(round - 1) % fakerOrder.length];
      category = pickCategory();
      const pool = byCat.get(category)!;
      tasks = pool.splice(0, 3);
      if (tasks.length < 3) tasks = [...tasks, ...shuffle(all.filter((t) => t.category === category))].slice(0, 3);
      taskNo = 0;
      startTask();
    }

    function playerTaskView(id: string, extra: object = {}) {
      return id === faker
        ? { screen: 'faker', category, ...extra }
        : { screen: 'task', category, task: task().task, ...extra };
    }

    function startTask() {
      answers = new Map();
      votes = new Map();
      phase = 'read';
      const t = ctx.timer(T.read, category === 'text' ? startWrite : startGo);
      timer = t;
      ctx.setHostView({ screen: 'read', ...base(), deadline: t.deadline, duration: t.duration });
      ctx.setAllPlayerViews((p) => ({ ...playerTaskView(p.id), input: true }));
    }

    /* --- Körperliche Aufgaben: Countdown, dann alle gleichzeitig --- */
    function startGo() {
      phase = 'go';
      const t = ctx.timer(T.ready + T.hold, startVote);
      timer = t;
      ctx.setHostView({ screen: 'go', ...base(), now: t.deadline - T.hold * 1000 * (t.duration / ((T.ready + T.hold) * 1000)), deadline: t.deadline, duration: t.duration });
      ctx.setAllPlayerViews((p) => playerTaskView(p.id, { go: true }));
    }

    /* --- Schreib-Aufgaben --- */
    function startWrite() {
      phase = 'write';
      const t = ctx.timer(T.write, showAnswers);
      timer = t;
      hostWrite();
      ids.forEach(writeView);
    }

    function hostWrite() {
      ctx.setHostView({ screen: 'write', ...base(), players: ids, done: [...answers.keys()], deadline: timer!.deadline, duration: timer!.duration });
    }

    function writeView(id: string) {
      if (answers.has(id)) ctx.setPlayerView(id, { screen: 'written', answer: answers.get(id) });
      else ctx.setPlayerView(id, { ...playerTaskView(id), write: true, input: true, deadline: timer!.deadline, duration: timer!.duration });
    }

    function showAnswers() {
      timer?.cancel();
      phase = 'go';
      ctx.setHostView({ screen: 'answers', ...base(), answers: shuffle(ids).map((id) => ({ playerId: id, text: answers.get(id) ?? '' })) });
      ctx.setAllPlayerViews(() => ({ screen: 'lookAtTv' }));
      ctx.after(T.answers, startVote);
    }

    /* --- Abstimmen --- */
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
        screen: 'vote', input: !votes.has(id), isFaker: id === faker, options: ids.filter((x) => x !== id),
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
        add(faker, taskNo * POINTS.survivedTask);
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
        screen: 'outcome', outcome, isFaker: p.id === faker, roundOver,
        correct: votes.get(p.id) === faker, points: gained.get(p.id) ?? 0, fakerName: roundOver ? name(faker) : null,
      }));
      ctx.after(T.result, () => {
        if (!roundOver) {
          taskNo++;
          startTask();
        } else if (round >= totalRounds) showScores(true);
        else showScores(false);
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
        if (!action || typeof action !== 'object') return;
        if (action.type === 'answer' && phase === 'write' && !answers.has(id)) {
          const text = cleanText(action.text, 50);
          if (!text) return;
          answers.set(id, text);
          writeView(id);
          hostWrite();
          if (ids.every((p) => answers.has(p) || !ctx.player(p)?.connected)) showAnswers();
        } else if (action.type === 'vote' && phase === 'vote') {
          const target = String(action.target);
          if (target === id || !ids.includes(target)) return;
          votes.set(id, target);
          voteView(id);
          hostVote();
          if (ids.every((p) => votes.has(p) || !ctx.player(p)?.connected)) hurry();
        }
      },
      bot(id, view) {
        if (view.write) return { type: 'answer', text: pick(['Pizza', 'Katze', 'Urlaub', 'Kaffee', 'Schlafen', 'Musik']) };
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
