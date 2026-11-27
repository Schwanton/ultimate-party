/**
 * Hochstapler – alle kennen die Aufgabe, nur einer nicht. Er muss mitmachen, ohne aufzufliegen.
 *
 * Seit 0.18.0: Ein zufälliger Hochstapler für die ganze Partie. Jede Runde = eine Aufgabe + Abstimmung.
 * Mehr als die Hälfte auf dieselbe Person = Anklage. Trifft sie den Hochstapler, ist das Spiel aus;
 * trifft sie einen Unschuldigen (oder gibt es keine Mehrheit), geht es einfach weiter.
 * Punkte gibt es erst am Ende, in einer Auszählung über alle Runden.
 * Modi: Hand heben, Finger zeigen, auf jemanden zeigen (ein Modus, abwechselnd oder zufällig).
 */

import { Scores, pick, shuffle, type GameContext, type GameServerModule } from '@up/sdk';

type Category = 'hands' | 'number' | 'point';
type Outcome = 'caught' | 'wrong' | 'none';

interface Task {
  id: string;
  category: Category;
  task: string;
}

interface RoundLog {
  round: number;
  category: Category;
  task: string;
  votes: Record<string, string>;
  outcome: Outcome;
  accused: string | null;
}

const CATEGORIES: Category[] = ['hands', 'number', 'point'];
const T = { read: 7, ready: 3, hold: 7, vote: 45, lastChance: 5, result: 7, reveal: 6, tallyPerRow: 0.9, tallyRest: 9 };
/** Sekunden nach „JETZT!“, bis die Aufgabe auf dem TV erscheint */
const TASK_AFTER = 2.5;
export const POINTS = {
  /** pro Runde, in der man auf den Hochstapler getippt hat */
  correctVote: 300,
  /** für alle, die in der entscheidenden Runde richtig lagen: früh erwischt = mehr */
  caughtBonus: (round: number) => Math.max(400, 1100 - 150 * round),
  /** Hochstapler: pro Runde unentdeckt */
  survived: 300,
  /** Hochstapler: ein Unschuldiger wurde angeklagt */
  wrongAccusation: 500,
  /** Hochstapler: bis zum Schluss nicht erwischt */
  escaped: 1500,
};

export default {
  create(ctx: GameContext) {
    const ids = ctx.players.map((p) => p.id);
    const scores = new Scores(ids);
    const mode = String(ctx.options.mode ?? 'rotate');
    const totalRounds = Number(ctx.options.rounds) || 6;
    const all = ctx.content<Task>().filter((t) => CATEGORIES.includes(t.category));
    const byCat = new Map<Category, Task[]>(CATEGORIES.map((c) => [c, all.filter((t) => t.category === c)]));
    const rotation = shuffle(CATEGORIES);
    // Ein Hochstapler für die ganze Partie – zufällig, damit niemand ihn vorhersagen kann.
    // Einstellung: ab 7 Spielern zwei, die nichts voneinander wissen.
    const fakers = ctx.options.fakers === 'two' && ids.length >= 7 ? shuffle(ids).slice(0, 2) : [pick(ids)];
    const faker = fakers[0];
    const isFaker = (id: string) => fakers.includes(id);
    /** schon erwischte Hochstapler mit Runde */
    const caughtIn = new Map<string, number>();

    let round = 0;
    let category: Category = 'hands';
    let task: Task = { id: '', category: 'hands', task: '' };
    let phase: 'intro' | 'read' | 'go' | 'vote' | 'result' | 'end' = 'intro';
    let timer: { cancel(): void; deadline: number; duration: number } | null = null;
    let votes = new Map<string, string>();
    const history: RoundLog[] = [];

    const name = (id: string) => ctx.player(id)?.name ?? '?';
    const base = () => ({ round, totalRounds, category });

    function intro() {
      ctx.setHostView({ screen: 'intro', mode, totalRounds, twoFakers: fakers.length > 1 });
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
      category = pickCategory();
      const deck = ctx.deck<Task>({ filter: (t) => t.category === category });
      task = deck.draw() ?? pick(byCat.get(category)!);
      startTask();
    }

    function playerTaskView(id: string, extra: object = {}) {
      return isFaker(id)
        ? { screen: 'faker', category, ...extra }
        : { screen: 'task', category, task: task.task, ...extra };
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
      // Kurz nach dem „JETZT!“ wird die Aufgabe für alle eingeblendet
      const taskAt = goAt + t.duration * (TASK_AFTER / (T.ready + T.hold));
      ctx.setHostView({ screen: 'go', ...base(), now: goAt, taskAt, task: task.task, deadline: t.deadline, duration: t.duration });
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
      ctx.setHostView({ screen: 'vote', ...base(), task: task.task, voted: votes.size, voters: ids.length, deadline: timer!.deadline, duration: timer!.duration });
    }

    function voteView(id: string) {
      ctx.setPlayerView(id, {
        screen: 'vote', input: !votes.has(id), isFaker: isFaker(id), category, task: task.task, options: ids.filter((x) => x !== id),
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
      const majority = !!top && top.votes > ids.length / 2;
      const hitFaker = majority && isFaker(top.playerId);
      // schon erwischter Hochstapler noch einmal angeklagt: zählt wie keine Mehrheit
      const outcome: Outcome = !majority || (hitFaker && caughtIn.has(top.playerId)) ? 'none' : hitFaker ? 'caught' : 'wrong';
      if (outcome === 'caught') caughtIn.set(top.playerId, round);
      history.push({ round, category, task: task.task, votes: Object.fromEntries(votes), outcome, accused: majority ? top.playerId : null });
      const allCaught = caughtIn.size >= fakers.length;

      if ((outcome === 'caught' && allCaught) || round >= totalRounds) {
        // Erwischt oder letzte Runde vorbei: ab zur großen Auszählung
        ctx.setHostView({ screen: 'result', ...base(), outcome, tally: tally.filter((x) => x.votes > 0), accused: majority ? top.playerId : null, last: true });
        ctx.setAllPlayerViews(() => ({ screen: 'outcome', outcome, last: true }));
        ctx.after(outcome === 'caught' ? 3 : T.result, finish);
        return;
      }
      // zwei Hochstapler: einer erwischt, die Jagd geht weiter
      const oneLeft = outcome === 'caught' && !allCaught;
      ctx.setHostView({ screen: 'result', ...base(), outcome, oneLeft, tally: tally.filter((x) => x.votes > 0), accused: majority ? top.playerId : null, last: false });
      ctx.setAllPlayerViews((p) => ({ screen: 'outcome', outcome, oneLeft, last: false, isFaker: isFaker(p.id), accusedName: majority ? name(top.playerId) : null, accusedMe: majority && top.playerId === p.id }));
      ctx.after(T.result, startRound);
    }

    /** Punkte für alle Runden auf einmal */
    function finish() {
      phase = 'end';
      // erwischt = alle Hochstapler erwischt; caughtRound = Runde, in der der letzte aufflog
      const caughtRound = caughtIn.size >= fakers.length ? Math.max(...caughtIn.values()) : null;
      const breakdown: Record<string, { label: string; points: number; n?: number }[]> = Object.fromEntries(ids.map((id) => [id, []]));
      const add = (id: string, label: string, points: number, n?: number) => {
        if (!points) return;
        scores.add(id, points);
        breakdown[id].push({ label, points, n });
      };
      for (const id of ids) {
        if (isFaker(id)) continue;
        const hits = history.filter((h) => isFaker(h.votes[id])).length;
        add(id, 'hits', hits * POINTS.correctVote, hits);
        // Bonus für jeden Hochstapler, den man in seiner entscheidenden Runde richtig angeklagt hat
        for (const [f, r] of caughtIn) if (history[r - 1].votes[id] === f) add(id, 'caught', POINTS.caughtBonus(r));
      }
      for (const f of fakers) {
        const r = caughtIn.get(f);
        add(f, 'survived', (r ? r - 1 : history.length) * POINTS.survived);
        add(f, 'wrongAccused', history.filter((h) => h.outcome === 'wrong').length * POINTS.wrongAccusation);
        if (!r) add(f, 'escaped_pts', POINTS.escaped);
      }

      const ranking = scores.ranking();
      const rounds = history.map((h) => ({ round: h.round, category: h.category, task: h.task, votes: h.votes, outcome: h.outcome, accused: h.accused }));
      const tallyMs = (T.reveal + ids.length * T.tallyPerRow + T.tallyRest) * 1000;
      ctx.setHostView({
        screen: 'tally', faker, fakers, caughtIn: Object.fromEntries(caughtIn), caught: !!caughtRound, caughtRound, rounds, totals: scores.snapshot(), breakdown,
        order: [...ranking].reverse().map((r) => r.playerId), ranking,
      });
      ctx.setAllPlayerViews((p) => ({
        screen: 'end', isFaker: isFaker(p.id), caught: isFaker(p.id) ? caughtIn.has(p.id) : !!caughtRound, fakerName: fakers.map(name).join(' & '), twoFakers: fakers.length > 1,
        hits: history.filter((h) => isFaker(h.votes[p.id])).length, rounds: history.length,
        score: scores.get(p.id), place: ranking.filter((r) => r.score > scores.get(p.id)).length + 1, of: ranking.length,
      }));
      ctx.after(tallyMs / 1000, () => {
        ctx.setHostView({ screen: 'final', ranking });
        ctx.finish(ranking);
      });
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
          // Bots tippen etwas besser als zufällig: 40 % auf den Hochstapler
          const target = !isFaker(id) && Math.random() < 0.4 ? pick(fakers) : pick(view.options as string[]);
          return { type: 'vote', target };
        }
        return null;
      },
    };
  },
} satisfies GameServerModule;
