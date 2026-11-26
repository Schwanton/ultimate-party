/**
 * Schätzmeister – Schätzfragen mit Zahlen. Auflösung als Zahlenstrahl (wie bei Guess the Clicks!).
 *
 * Punkte je nach Einstellung „Wertung“ (scoring.ts, gleiche Datei wie bei Guess the Clicks!), letzte Frage ×2.
 * Entfernung als Faktor; Jahreszahlen relativ dazu, wie lange es her ist. Gleich nah = gleicher Platz.
 */

import { INPUT_GRACE, Scores, shuffle, type GameContext, type GameServerModule } from '@up/sdk';
import { answerSeconds, revealSeconds, type PlanOptions } from './reveal';
import { MODES, factor, scoreRound, type ScoringMode } from './scoring';

interface Item {
  id: string;
  question: string;
  answer: number | string;
  unit?: string;
  source?: string;
  /** Unterzeile unter der Antwort: Maßstab und Grundlage */
  note?: string;
}

const T = { intro: 7, lastChance: 5, afterReveal: 7 };

/** Jahreszahl-Frage: ohne Einheit, „Jahr“/„year“ in der Frage, Antwort eine plausible Jahreszahl */
function isYear(it: Item, now: number) {
  const a = Number(it.answer);
  return !it.unit && /jahr|year/i.test(it.question) && Number.isInteger(a) && a >= 1000 && a <= now + 1;
}

export default {
  create(ctx: GameContext) {
    const ids = ctx.players.map((p) => p.id);
    const scores = new Scores(ids);
    const total = Number(ctx.options.rounds) || 8;
    const guessTime = Number(ctx.options.guessTime) || 30;
    const MODE: ScoringMode = MODES.includes(ctx.options.scoring as ScoringMode) ? (ctx.options.scoring as ScoringMode) : 'rank';
    const LOOSE = ctx.options.strictness === 'loose';
    const NOW = new Date().getFullYear();
    /** Auflösung: Entfernung wie bei der Wertung; am Ende kommen alle mit Punkten zurück */
    const plan = (): PlanOptions => ({ log: true, showAll: MODE !== 'best', ...(isYear(item(), NOW) ? { yearNow: NOW } : {}) });
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
      ctx.setHostView({ screen: 'intro', mode: MODE, loose: LOOSE });
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
      const m = mult();
      const opts = plan();
      const placed = scoreRound([...guesses].map(([playerId, guess]) => ({ playerId, guess })), truth, MODE, LOOSE, opts)
        .map((e) => ({ ...e, points: e.points * m }));
      placed.forEach((e) => { if (e.points) scores.add(e.playerId, e.points); });
      // Gemischt schicken: Die Reihenfolge auf dem Strahl darf nichts verraten
      const shown = shuffle(placed.map(({ playerId, guess, place, points, exact }) => ({ playerId, guess, place, points, exact })));
      const startAt = Date.now() + 300;
      const ride = revealSeconds(truth, shown, opts);
      const doneAt = startAt + answerSeconds(truth, shown, opts) * 1000;
      ctx.setHostView({ screen: 'reveal', ...base(), answer: truth, source: item().source ?? null, note: item().note ?? null, entries: shown, mode: MODE, plan: opts, startAt });
      ctx.setAllPlayerViews((p) => {
        const mine = placed.find((e) => e.playerId === p.id);
        const g = mine?.guess ?? null;
        return {
          screen: 'result', doneAt, answer: truth, unit: item().unit ?? '', note: item().note ?? null, guess: g, place: mine?.place ?? null, of: placed.length,
          points: mine?.points ?? 0, exact: mine?.exact ?? false, mode: MODE, year: !!opts.yearNow,
          factor: g == null || opts.yearNow ? null : factor(g, truth), high: g != null && g > truth,
        };
      });
      ctx.after(ride + (opts.showAll ? 5 : T.afterReveal), next);
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
