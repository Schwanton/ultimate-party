/**
 * Schätzmeister – Schätzfragen mit Zahlen. Auflösung als Zahlenstrahl (wie bei Guess the Clicks!).
 *
 * Punkte nach Platz: 1000 / 600 / 300, genau getroffen +500. Letzte Frage ×2. Gleich nah = gleicher Platz.
 */

import { INPUT_GRACE, Scores, type GameContext, type GameServerModule } from '@up/sdk';
import { revealSeconds } from './reveal';

interface Item {
  id: string;
  question: string;
  answer: number | string;
  unit?: string;
  source?: string;
}

const T = { intro: 7, lastChance: 5, afterReveal: 7 };
const PLACE_POINTS = [1000, 600, 300];
const EXACT = 500;

export default {
  create(ctx: GameContext) {
    const ids = ctx.players.map((p) => p.id);
    const scores = new Scores(ids);
    const total = Number(ctx.options.rounds) || 8;
    const guessTime = Number(ctx.options.guessTime) || 30;
    const items = ctx.deck<Item>({ filter: (it) => Number.isFinite(Number(it.answer)) && Number(it.answer) >= 0 }).drawMany(total);
    let q = -1;
    let guesses = new Map<string, number>();
    /** eingetippt, aber nicht abgeschickt – der neueste Stand zählt bei Zeitablauf */
    let drafts = new Map<string, number>();
    let timer: { cancel(): void; deadline: number; duration: number } | null = null;
    let phase: 'intro' | 'guess' | 'reveal' | 'scores' = 'intro';
    let roundStart = scores.snapshot();
    let lastScores = 0;

    const item = () => items[q];
    const mult = () => (q === items.length - 1 && items.length > 1 ? 2 : 1);
    const base = () => ({ n: q + 1, total: items.length, mult: mult(), question: item().question, unit: item().unit ?? '' });

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
      guesses = new Map();
      drafts = new Map();
      phase = 'guess';
      timer = ctx.timer(guessTime, reveal, { grace: INPUT_GRACE });
      hostGuess();
      ids.forEach(guessView);
    }

    function hostGuess() {
      ctx.setHostView({ screen: 'guess', ...base(), players: ids, done: [...guesses.keys()], deadline: timer!.deadline, duration: timer!.duration });
    }

    function guessView(id: string) {
      ctx.setPlayerView(id, { screen: 'guess', input: true, ...base(), guess: guesses.get(id) ?? null, deadline: timer!.deadline, duration: timer!.duration });
    }

    function hurry() {
      if (!timer || timer.deadline - Date.now() <= T.lastChance * 1200) return;
      timer.cancel();
      timer = ctx.timer(T.lastChance, reveal, { grace: INPUT_GRACE });
      hostGuess();
      ids.forEach(guessView);
    }

    function reveal() {
      timer?.cancel();
      for (const [id, n] of drafts) guesses.set(id, n);
      phase = 'reveal';
      const truth = Number(item().answer);
      const entries = [...guesses].map(([playerId, guess]) => ({ playerId, guess, diff: Math.abs(guess - truth) })).sort((a, b) => a.diff - b.diff);
      // Platz = Anzahl unterschiedlicher, besserer Abstände (Gleichstand = gleicher Platz)
      const diffs = [...new Set(entries.map((e) => e.diff))];
      const m = mult();
      const placed = entries.map((e) => {
        const place = diffs.indexOf(e.diff) + 1;
        const points = ((PLACE_POINTS[place - 1] ?? 0) + (e.diff === 0 ? EXACT : 0)) * m;
        if (points) scores.add(e.playerId, points);
        return { ...e, place, points };
      });
      const startAt = Date.now() + 300;
      const ride = revealSeconds(truth, placed.map((e) => e.guess));
      const doneAt = startAt + ride * 1000;
      ctx.setHostView({ screen: 'reveal', ...base(), answer: truth, source: item().source ?? null, entries: placed, startAt });
      ctx.setAllPlayerViews((p) => {
        const mine = placed.find((e) => e.playerId === p.id);
        return { screen: 'result', doneAt, answer: truth, unit: item().unit ?? '', guess: mine?.guess ?? null, place: mine?.place ?? null, points: mine?.points ?? 0, exact: mine?.diff === 0 };
      });
      ctx.after(ride + T.afterReveal, next);
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
        if (phase === 'guess' && action?.type === 'guessDraft' && ids.includes(id)) {
          const d = Math.round(Number(action.value));
          if (action.value == null) drafts.delete(id);
          else if (Number.isFinite(d) && d >= 0 && d <= 1e12) drafts.set(id, d);
          return;
        }
        if (phase !== 'guess' || action?.type !== 'guess' || !ids.includes(id)) return;
        const n = Math.round(Number(action.value));
        if (!Number.isFinite(n) || n < 0 || n > 1e12) return;
        drafts.delete(id);
        guesses.set(id, n);
        guessView(id);
        hostGuess();
        if (ids.every((p) => guesses.has(p) || !ctx.player(p)?.connected)) hurry();
      },
      bot(_id, view) {
        if (view.screen !== 'guess' || view.guess != null) return null;
        // Bots schätzen in der richtigen Größenordnung, mal drunter, mal drüber
        const truth = Number(item().answer);
        return { type: 'guess', value: Math.max(0, Math.round(truth * 10 ** ((Math.random() - 0.5) * 0.8))) };
      },
    };
  },
} satisfies GameServerModule;
