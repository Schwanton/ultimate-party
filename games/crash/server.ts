/**
 * Crash – ein Kurs schwankt wie eine Aktie (meist aufwärts), bis er zufällig abstürzt.
 * Wer vorher aussteigt, bekommt 100 × Kurs Punkte. Wer noch drin ist, wenn es kracht, bekommt nichts.
 * Letzte Runde doppelt. Punktestände bleiben bis zum Ende geheim (jeder sieht nur seinen eigenen).
 */

import { Scores, type GameContext, type GameServerModule } from '@up/sdk';
import { crashTime as rollCrashTime, floor2, multAt, newSeed } from './curve';

const T = { intro: 8, ready: 3, afterCrash: 6, afterAllBusted: 2, allOutReveal: 1.5 };
const BASE = 100;

export default {
  create(ctx: GameContext) {
    const ids = ctx.players.map((p) => p.id);
    const scores = new Scores(ids);
    const total = Number(ctx.options.rounds) || 8;
    let round = 0;
    let phase: 'intro' | 'ready' | 'run' | 'crash' | 'final' = 'intro';
    let seed = 1;
    let startAt = 0;
    let crashTime = 0;
    let cashed = new Map<string, number>();
    /** wann (Sekunden nach Start) jemand ausgestiegen ist */
    let cashedT = new Map<string, number>();
    let crashTimer: { cancel(): void } | null = null;
    let best: { id: string; m: number } | null = null;

    const mult = () => (round === total ? 2 : 1);
    const base = () => ({ round, total, mult: mult(), seed });

    function intro() {
      ctx.setHostView({ screen: 'intro' });
      ctx.setAllPlayerViews(() => ({ screen: 'intro' }));
      ctx.after(T.intro, nextRound);
    }

    function nextRound() {
      if (round + 1 > total) return showFinal();
      round++;
      phase = 'ready';
      cashed = new Map();
      cashedT = new Map();
      seed = newSeed();
      crashTime = rollCrashTime(Math.random());
      startAt = Date.now() + T.ready * 1000;
      ctx.setHostView({ screen: 'ready', ...base(), startAt });
      ctx.setAllPlayerViews(() => ({ screen: 'ready', ...base(), startAt }));
      ctx.after(T.ready, run);
    }

    function run() {
      phase = 'run';
      startAt = Date.now();
      hostRun();
      ids.forEach(phoneRun);
      crashTimer?.cancel();
      crashTimer = ctx.timer(crashTime, () => crash());
      // Testspieler steigen irgendwann aus (manche zu spät)
      for (const id of ids) {
        if (!ctx.player(id)?.isBot) continue;
        const r = round;
        ctx.after(0.8 + Math.random() * 16, () => phase === 'run' && round === r && cashOut(id));
      }
    }

    function hostRun() {
      ctx.setHostView({ screen: 'run', ...base(), startAt, cashed: [...cashed].map(([id, m]) => ({ id, m, t: cashedT.get(id) ?? 0 })), inCount: ids.length - cashed.size, players: ids });
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
      // Gekracht wird genau jetzt (Zeit-Einstellungen können den Timer etwas verschieben)
      if (!allOut) crashTime = Math.max(0, (Date.now() - startAt) / 1000);
      const crashAt = floor2(multAt(seed, crashTime));
      const list = [...cashed].map(([id, x]) => ({ id, m: x, t: cashedT.get(id) ?? 0 })).sort((a, b) => b.m - a.m);
      ctx.setHostView({ screen: 'crash', ...base(), startAt, crashTime, crashAt, allOut, cashed: list, busted, players: ids });
      ctx.setAllPlayerViews((p) => ({
        screen: 'crashed', crashAt, m: cashed.get(p.id) ?? null,
        points: cashed.has(p.id) ? Math.round(BASE * cashed.get(p.id)! * m) : 0, total: scores.get(p.id),
      }));
      // Alle erwischt: schnell weiter
      ctx.after(cashed.size === 0 ? T.afterAllBusted : T.afterCrash, nextRound);
    }

    function showFinal() {
      phase = 'final';
      const ranking = scores.ranking();
      ctx.setHostView({ screen: 'final', ranking, best });
      ctx.setAllPlayerViews((p) => ({ screen: 'finalMe', score: scores.get(p.id), place: ranking.filter((r) => r.score > scores.get(p.id)).length + 1, of: ranking.length }));
      ctx.finish(ranking);
    }

    function cashOut(id: string) {
      if (phase !== 'run' || cashed.has(id) || !ids.includes(id)) return;
      const t = (Date.now() - startAt) / 1000;
      if (t >= crashTime) return crash();
      cashed.set(id, floor2(multAt(seed, t)));
      cashedT.set(id, t);
      phoneRun(id);
      hostRun();
      // Alle ausgestiegen: kurz danach zeigen, wann es gecrasht wäre
      if (cashed.size === ids.length) ctx.after(T.allOutReveal, () => crash(true));
    }

    return {
      start: intro,
      onAction(id, action) {
        if (action?.type === 'cash') cashOut(id);
      },
    };
  },
} satisfies GameServerModule;
