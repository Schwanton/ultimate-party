/**
 * Mehrheit – jede Frage hat 2–4 Antworten. Alle wählen ihre eigene Antwort UND tippen, was die Mehrheit wählt.
 *
 * Punkte: Mehrheit richtig vorhergesagt 1000, selbst in der Mehrheit 250 (letzte Frage ×2).
 * Gleichstand an der Spitze: alle Antworten mit den meisten Stimmen zählen als Mehrheit.
 */

import { Scores, shuffle, type GameContext, type GameServerModule } from '@up/sdk';
import { votersSeconds } from './timing';

interface Item {
  id: string;
  question: string;
  answers: string[];
}

const T = { vote: 25, lastChance: 5, intro: 7 };
const POINTS = { predicted: 1000, inMajority: 250 };

export default {
  create(ctx: GameContext) {
    const ids = ctx.players.map((p) => p.id);
    const scores = new Scores(ids);
    const total = Number(ctx.options.rounds) || 8;
    const tf = Number(ctx.options.voteTime) || 1;
    const items = ctx.deck<Item>({ filter: (it) => Array.isArray(it.answers) && it.answers.length >= 2 && it.answers.length <= 4 }).drawMany(total);
    let q = -1;
    let own = new Map<string, number>();
    let guess = new Map<string, number>();
    let timer: { cancel(): void; deadline: number; duration: number } | null = null;
    let phase: 'intro' | 'vote' | 'reveal' | 'scores' = 'intro';
    let roundStart = scores.snapshot();
    let lastScores = 0;

    const item = () => items[q];
    const mult = () => (q === items.length - 1 ? 2 : 1);
    const base = () => ({ n: q + 1, total: items.length, mult: mult(), question: item().question, answers: item().answers });
    const doneCount = () => ids.filter((id) => own.has(id) && guess.has(id)).length;

    function intro() {
      ctx.setHostView({ screen: 'intro' });
      ctx.setAllPlayerViews(() => ({ screen: 'intro' }));
      ctx.after(T.intro, next);
    }

    function next() {
      q++;
      if (q >= items.length) return showScores(true);
      if (q > 0 && q - lastScores >= 4 && items.length - q > 1) {
        lastScores = q;
        q--;
        return showScores(false);
      }
      own = new Map();
      guess = new Map();
      phase = 'vote';
      timer = ctx.timer(T.vote * tf, reveal);
      hostVote();
      ids.forEach(voteView);
    }

    function hostVote() {
      ctx.setHostView({ screen: 'vote', ...base(), done: doneCount(), voters: ids.length, deadline: timer!.deadline, duration: timer!.duration });
    }

    function voteView(id: string) {
      ctx.setPlayerView(id, {
        screen: 'vote', input: !(own.has(id) && guess.has(id)), ...base(),
        own: own.get(id) ?? null, guess: guess.get(id) ?? null, deadline: timer!.deadline, duration: timer!.duration,
      });
    }

    function hurry() {
      if (!timer || timer.deadline - Date.now() <= T.lastChance * 1200) return;
      timer.cancel();
      timer = ctx.timer(T.lastChance, reveal);
      hostVote();
      ids.forEach(voteView);
    }

    function reveal() {
      timer?.cancel();
      phase = 'reveal';
      const answers = item().answers;
      const voters = answers.map((_, i) => shuffle(ids.filter((id) => own.get(id) === i)));
      const top = Math.max(...voters.map((v) => v.length));
      const majority = top > 0 ? answers.map((_, i) => i).filter((i) => voters[i].length === top) : [];
      const m = mult();
      const gained = new Map<string, number>();
      for (const id of ids) {
        let pts = 0;
        const g = guess.get(id);
        const o = own.get(id);
        if (g !== undefined && majority.includes(g)) pts += POINTS.predicted * m;
        if (o !== undefined && majority.includes(o)) pts += POINTS.inMajority * m;
        if (pts) {
          scores.add(id, pts);
          gained.set(id, pts);
        }
      }
      const predictors = ids.filter((id) => majority.includes(guess.get(id) ?? -1));
      ctx.setHostView({ screen: 'reveal', ...base(), voters, majority, predictors, crowd: ids.length });
      // Pause passt zur Länge der Auflösung (Stimmen erscheinen nacheinander)
      const seconds = 1 + votersSeconds(voters.flat().length) + 6;
      const doneAt = Date.now() + (1 + votersSeconds(voters.flat().length) + 1.2) * 1000;
      ctx.setAllPlayerViews((p) => ({
        screen: 'result', doneAt, points: gained.get(p.id) ?? 0,
        predicted: majority.includes(guess.get(p.id) ?? -1), inMajority: majority.includes(own.get(p.id) ?? -1),
        majority: majority.map((i) => answers[i]),
      }));
      ctx.after(seconds, next);
    }

    function showScores(final: boolean) {
      phase = 'scores';
      const ranking = scores.ranking();
      ctx.setHostView({ screen: final ? 'final' : 'scores', before: roundStart, after: scores.snapshot(), ranking });
      roundStart = scores.snapshot();
      ctx.setAllPlayerViews((p) => ({ screen: final ? 'finalMe' : 'scoresMe', score: scores.get(p.id), place: ranking.filter((r) => r.score > scores.get(p.id)).length + 1, of: ranking.length }));
      if (final) ctx.finish(ranking);
      else ctx.after(7, next);
    }

    return {
      start: intro,
      onAction(id, action) {
        if (phase !== 'vote' || !action || !ids.includes(id)) return;
        const i = Number(action.answer);
        if (!Number.isInteger(i) || i < 0 || i >= item().answers.length) return;
        if (action.type === 'own') own.set(id, i);
        else if (action.type === 'guess') guess.set(id, i);
        else return;
        voteView(id);
        hostVote();
        if (ids.every((p) => (own.has(p) && guess.has(p)) || !ctx.player(p)?.connected)) hurry();
      },
      bot(_id, view) {
        if (view.screen !== 'vote') return null;
        const n = (view.answers as string[]).length;
        // Bots haben eine leichte Vorliebe für die erste Antwort – so entstehen echte Mehrheiten
        const pickOne = () => (Math.random() < 0.4 ? 0 : Math.floor(Math.random() * n));
        if (view.own == null) return { type: 'own', answer: pickOne() };
        if (view.guess == null) return { type: 'guess', answer: pickOne() };
        return null;
      },
    };
  },
} satisfies GameServerModule;
