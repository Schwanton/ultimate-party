/**
 * Vorlage für eigene Spiele: „Schätzfrage“
 *
 * Ablauf: Frage → alle schätzen eine Zahl → Auflösung → nächste Frage → Endstand.
 * Kopieren mit:  npm run new-game mein-spiel
 */

import { Scores, type GameContext, type GameServerModule } from '@up/sdk';

interface Item {
  id: string;
  question: string;
  answer: string;
}


export default {
  create(ctx: GameContext) {
    const ids = ctx.players.map((p) => p.id);
    const scores = new Scores(ids);
    const items = ctx.content<Item>().slice(0, Number(ctx.options.rounds) || 3);
    let round = 0;
    let guesses = new Map<string, number>();
    let timer: { cancel(): void } | null = null;

    function ask() {
      guesses = new Map();
      const item = items[round];
      const t = ctx.timer(30, reveal);
      timer = t;
      ctx.setHostView({ screen: 'ask', n: round + 1, total: items.length, question: item.question, deadline: t.deadline, duration: t.duration, done: [] });
      ctx.setAllPlayerViews(() => ({ screen: 'ask', input: true, question: item.question, deadline: t.deadline, duration: t.duration }));
    }

    function reveal() {
      timer?.cancel();
      const item = items[round];
      const truth = Number(item.answer);
      const ranked = [...guesses.entries()]
        .map(([playerId, guess]) => ({ playerId, guess, diff: Math.abs(guess - truth) }))
        .sort((a, b) => a.diff - b.diff);
      const before = scores.snapshot();
      ranked.forEach((r, i) => scores.add(r.playerId, i === 0 ? 1000 : i === 1 ? 500 : 100));
      ctx.setHostView({ screen: 'reveal', question: item.question, answer: item.answer, ranked, before, after: scores.snapshot() });
      ctx.setAllPlayerViews((p) => ({ screen: 'wait', guess: guesses.get(p.id) ?? null }));
      ctx.after(6, () => {
        round++;
        if (round < items.length) ask();
        else finish();
      });
    }

    function finish() {
      ctx.setHostView({ screen: 'final', ranking: scores.ranking() });
      ctx.setAllPlayerViews(() => ({ screen: 'final' }));
      ctx.finish(scores.ranking());
    }

    return {
      start: ask,
      onAction(playerId, action) {
        if (action?.type !== 'guess' || guesses.has(playerId)) return;
        const n = Number(action.value);
        if (!Number.isFinite(n)) return;
        guesses.set(playerId, n);
        ctx.setPlayerView(playerId, { screen: 'wait', guess: n });
        if (guesses.size >= ids.length) reveal();
      },
      bot(_playerId, view) {
        return view.screen === 'ask' ? { type: 'guess', value: Math.round(Math.random() * 300) } : null;
      },
    };
  },
} satisfies GameServerModule;
