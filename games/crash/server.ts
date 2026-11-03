/**
 * Crash – ein Multiplikator steigt, bis er zufällig abstürzt. Wer vorher aussteigt, bekommt 100 × Multiplikator Punkte.
 * Wer noch drin ist, wenn es kracht, bekommt nichts. Letzte Runde doppelt.
 */

import { Scores, type GameContext, type GameServerModule } from '@up/sdk';
import { crashPoint, floor2, multAt, timeFor } from './curve';

const T = { intro: 8, ready: 3, afterCrash: 6, allOutReveal: 1.5, scores: 6 };
const BASE = 100;

export default {
  create(ctx: GameContext) {
    const ids = ctx.players.map((p) => p.id);
    const scores = new Scores(ids);
    const total = Number(ctx.options.rounds) || 8;
    let round = 0;
    let phase: 'intro' | 'ready' | 'run' | 'crash' | 'scores' = 'intro';
    let startAt = 0;
    let crashAt = 1;
    let crashTime = 0;
    let cashed = new Map<string, number>();
    let roundStart = scores.snapshot();
    let crashTimer: { cancel(): void } | null = null;
    let best: { id: string; m: number } | null = null;

    const mult = () => (round === total ? 2 : 1);
    const base = () => ({ round, total, mult: mult() });

    function intro() {
      ctx.setHostView({ screen: 'intro' });
      ctx.setAllPlayerViews(() => ({ screen: 'intro' }));
      ctx.after(T.intro, nextRound);
    }

    const scoresShown = new Set<number>();

    function nextRound() {
      if (round + 1 > total) return showScores(true);
      // Zwischenstand nach jeder dritten Runde
      if (round > 0 && round % 3 === 0 && !scoresShown.has(round)) {
        scoresShown.add(round);
        return showScores(false);
      }
      round++;
      phase = 'ready';
      cashed = new Map();
      crashAt = crashPoint(Math.random());
      startAt = Date.now() + T.ready * 1000;
      ctx.setHostView({ screen: 'ready', ...base(), startAt });
      ctx.setAllPlayerViews(() => ({ screen: 'ready', ...base(), startAt }));
      ctx.after(T.ready, run);
    }

    function run() {
      phase = 'run';
      startAt = Date.now();
      crashTime = timeFor(crashAt);
      hostRun();
      ids.forEach(phoneRun);
      crashTimer?.cancel();
      const t = ctx.timer(crashTime, crash);
      crashTimer = t;
    }

    function hostRun() {
      ctx.setHostView({ screen: 'run', ...base(), startAt, cashed: [...cashed].map(([id, m]) => ({ id, m })), inCount: ids.length - cashed.size, players: ids });
    }

    function phoneRun(id: string) {
      ctx.setPlayerView(id, { screen: 'run', ...base(), startAt, input: !cashed.has(id), cashed: cashed.get(id) ?? null });
    }

    function crash(allOut = false) {
      if (phase !== 'run') return;
      crashTimer?.cancel();
      phase = 'crash';
      const m = mult();
      const busted = ids.filter((id) => !cashed.has(id));
      for (const [id, x] of cashed) {
        scores.add(id, Math.round(BASE * x * m));
        if (!best || x > best.m) best = { id, m: x };
      }
      const list = [...cashed].map(([id, x]) => ({ id, m: x, points: Math.round(BASE * x * m) })).sort((a, b) => b.m - a.m);
      ctx.setHostView({ screen: 'crash', ...base(), startAt, crashAt, allOut, cashed: list, busted, players: ids });
      ctx.setAllPlayerViews((p) => ({ screen: 'crashed', crashAt, m: cashed.get(p.id) ?? null, points: cashed.has(p.id) ? Math.round(BASE * cashed.get(p.id)! * m) : 0, total: scores.get(p.id) }));
      ctx.after(T.afterCrash, nextRound);
    }

    function showScores(final: boolean) {
      phase = 'scores';
      const ranking = scores.ranking();
      ctx.setHostView({ screen: final ? 'final' : 'scores', before: roundStart, after: scores.snapshot(), ranking, best });
      roundStart = scores.snapshot();
      ctx.setAllPlayerViews((p) => ({ screen: final ? 'finalMe' : 'scoresMe', score: scores.get(p.id), place: ranking.filter((r) => r.score > scores.get(p.id)).length + 1, of: ranking.length }));
      if (final) ctx.finish(ranking);
      else ctx.after(T.scores, nextRound);
    }

    return {
      start: intro,
      onAction(id, action) {
        if (action?.type !== 'cash' || phase !== 'run' || cashed.has(id) || !ids.includes(id)) return;
        const t = (Date.now() - startAt) / 1000;
        if (t >= crashTime) return crash();
        cashed.set(id, Math.max(1, floor2(multAt(t))));
        phoneRun(id);
        hostRun();
        // Alle ausgestiegen: kurz danach zeigen, wann es gecrasht wäre
        if (cashed.size === ids.length) ctx.after(T.allOutReveal, () => crash(true));
      },
      bot(_id, view) {
        return view.screen === 'run' && view.input ? { type: 'cash' } : null;
      },
    };
  },
} satisfies GameServerModule;
