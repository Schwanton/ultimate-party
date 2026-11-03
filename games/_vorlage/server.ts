/**
 * Vorlage für eigene Spiele: „Schätzfrage“
 *
 * Ablauf: Frage → alle schätzen eine Zahl → Auflösung → nächste Frage → Endstand.
 * Kopieren mit:  npm run new-game mein-spiel
 */

import { INPUT_GRACE, Scores, type GameContext, type GameServerModule } from '@up/sdk';

interface Item {
  id: string;
  question: string;
  answer: string;
}


export default {
  create(ctx: GameContext) {
    const ids = ctx.players.map((p) => p.id);
    const scores = new Scores(ids);
    // Kartenstapel: jede Frage kommt erst wieder, wenn alle durch sind (auch über mehrere Spiele)
    const items = ctx.deck<Item>().drawMany(Number(ctx.options.rounds) || 3);
    let round = 0;
    let guesses = new Map<string, number>();
    // Entwürfe: was getippt, aber nicht abgeschickt wurde – zählt bei Zeitablauf (siehe useDraft im Client)
    let drafts = new Map<string, number>();
    let timer: { cancel(): void } | null = null;

    function ask() {
      guesses = new Map();
      drafts = new Map();
      const item = items[round];
      // INPUT_GRACE: kurze Nachfrist, damit die letzten Entwürfe noch ankommen
      const t = ctx.timer(30, reveal, { grace: INPUT_GRACE });
      timer = t;
      ctx.setHostView({ screen: 'ask', n: round + 1, total: items.length, question: item.question, deadline: t.deadline, duration: t.duration, done: [] });
      ctx.setAllPlayerViews(() => ({ screen: 'ask', input: true, question: item.question, deadline: t.deadline, duration: t.duration }));
    }

    function reveal() {
      timer?.cancel();
      for (const [id, n] of drafts) if (!guesses.has(id)) guesses.set(id, n);
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
        if (action?.type === 'guessDraft' && !guesses.has(playerId)) {
          const d = Number(action.value);
          if (Number.isFinite(d)) drafts.set(playerId, d);
          return;
        }
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
