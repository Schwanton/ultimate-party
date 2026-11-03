/**
 * Crash – ein Kurs schwankt wie eine Aktie (meist aufwärts), bis er zufällig abstürzt.
 * Pro Runde liegen 100 gratis im Topf; dazu kann jeder vor dem Start 0/10/25/100 % seines Geldes setzen.
 * Steigt man aus, bekommt man den Topf × Kurs. Kracht es, ist der Topf weg (und damit der eigene Einsatz).
 * Letzte Runde doppelt. Geldstände bleiben bis zur Auszählung am Ende geheim.
 *
 * Modi: open (man sieht, wer aussteigt), half (nur, dass jemand aussteigt), secret (nichts).
 */

import { Scores, type GameContext, type GameServerModule } from '@up/sdk';
import { crashTime as rollCrashTime, floor2, multAt, newSeed } from './curve';
import { tallyDuration, type TallyData } from './tally';

const T = { intro: 8, ready: 5, afterCrash: 6, afterAllBusted: 2, allOutReveal: 1.5 };
const BASE = 100;
const BETS = [0, 10, 25, 100];

export default {
  create(ctx: GameContext) {
    const ids = ctx.players.map((p) => p.id);
    const money = new Scores(ids);
    const total = Number(ctx.options.rounds) || 8;
    const mode = (['open', 'half', 'secret'].includes(String(ctx.options.mode)) ? String(ctx.options.mode) : 'open') as 'open' | 'half' | 'secret';
    // frühester Absturz: einmal pro Partie zwischen 2 und 6 Sekunden
    const minCrash = 2 + Math.random() * 4;
    let round = 0;
    let phase: 'intro' | 'ready' | 'run' | 'crash' | 'tally' = 'intro';
    let seed = 1;
    let startAt = 0;
    let crashTime = 0;
    let bets = new Map<string, number>(); // gewählter Prozentsatz
    let stakes = new Map<string, number>(); // eingesetztes Geld (fest ab Start)
    let cashed = new Map<string, number>();
    let cashedT = new Map<string, number>();
    let crashTimer: { cancel(): void } | null = null;
    const tally: TallyData = { rounds: [] };
    const extraSum = new Map<string, number>(ids.map((id) => [id, 0]));

    const mult = () => (round === total ? 2 : 1);
    const base = () => ({ round, total, mult: mult(), seed, mode });

    function intro() {
      ctx.setHostView({ screen: 'intro', mode });
      ctx.setAllPlayerViews(() => ({ screen: 'intro' }));
      ctx.after(T.intro, nextRound);
    }

    function nextRound() {
      if (round + 1 > total) return showTally();
      round++;
      phase = 'ready';
      cashed = new Map();
      cashedT = new Map();
      bets = new Map();
      stakes = new Map();
      seed = newSeed();
      crashTime = rollCrashTime(Math.random(), minCrash);
      startAt = Date.now() + T.ready * 1000;
      ctx.setHostView({ screen: 'ready', ...base(), startAt });
      ids.forEach(phoneReady);
      ctx.timer(T.ready, run);
    }

    function phoneReady(id: string) {
      const m = money.get(id);
      ctx.setPlayerView(id, {
        screen: 'ready', ...base(), startAt, input: true, money: m, bet: bets.get(id) ?? 0,
        options: BETS.map((pct) => ({ pct, amount: Math.floor((m * pct) / 100) })),
      });
    }

    function run() {
      phase = 'run';
      startAt = Date.now();
      for (const id of ids) stakes.set(id, Math.floor((money.get(id) * (bets.get(id) ?? 0)) / 100));
      hostRun();
      ids.forEach(phoneRun);
      crashTimer?.cancel();
      crashTimer = ctx.timer(crashTime, () => crash());
      // Testspieler setzen zufällig und steigen irgendwann aus (manche zu spät)
      for (const id of ids) {
        if (!ctx.player(id)?.isBot) continue;
        const r = round;
        ctx.after(0.8 + Math.random() * 16, () => phase === 'run' && round === r && cashOut(id));
      }
    }

    const pot = (id: string) => BASE + (stakes.get(id) ?? 0);

    function hostRun() {
      const inCount = ids.length - cashed.size;
      ctx.setHostView({
        screen: 'run', ...base(), startAt, players: ids, inCount, outCount: cashed.size,
        cashed: mode === 'open' ? [...cashed].map(([id, m]) => ({ id, m, t: cashedT.get(id) ?? 0 })) : [],
      });
    }

    function phoneRun(id: string) {
      ctx.setPlayerView(id, { screen: 'run', ...base(), startAt, input: !cashed.has(id), cashed: cashed.get(id) ?? null, pot: pot(id), stake: stakes.get(id) ?? 0 });
    }

    function crash(allOut = false) {
      if (phase !== 'run') return;
      crashTimer?.cancel();
      phase = 'crash';
      if (!allOut) crashTime = Math.max(0, (Date.now() - startAt) / 1000);
      const crashAt = floor2(multAt(seed, crashTime));
      const m = mult();
      const roundBase: Record<string, number> = {};
      const roundExtra: Record<string, number> = {};
      const results = new Map<string, { base: number; extra: number }>();
      for (const id of ids) {
        const x = cashed.get(id);
        const stake = stakes.get(id) ?? 0;
        const b = x != null ? Math.round(BASE * x * m) : 0;
        const e = x != null ? Math.round(stake * x * m) - stake : -stake;
        roundBase[id] = b;
        roundExtra[id] = e;
        extraSum.set(id, (extraSum.get(id) ?? 0) + e);
        money.add(id, b + e);
        results.set(id, { base: b, extra: e });
      }
      tally.rounds.push({
        crashAt, mult: m, base: roundBase, extra: roundExtra,
        pct: Object.fromEntries(ids.map((id) => [id, bets.get(id) ?? 0])),
        cm: Object.fromEntries([...cashed]),
      });
      const busted = ids.filter((id) => !cashed.has(id));
      ctx.setHostView({
        screen: 'crash', ...base(), startAt, crashTime, crashAt, allOut, players: ids, lastT: Math.max(0, ...cashedT.values()),
        bustedCount: busted.length, outCount: cashed.size,
        cashed: mode === 'open' ? [...cashed].map(([id, x]) => ({ id, m: x, t: cashedT.get(id) ?? 0 })).sort((a, b) => b.m - a.m) : [],
        busted: mode === 'open' ? busted : [],
      });
      ctx.setAllPlayerViews((p) => {
        const r = results.get(p.id)!;
        return { screen: 'crashed', crashAt, m: cashed.get(p.id) ?? null, pot: pot(p.id), stake: stakes.get(p.id) ?? 0, gain: r.base + r.extra, total: money.get(p.id) };
      });
      // Alle erwischt: schnell weiter
      ctx.after(cashed.size === 0 ? T.afterAllBusted : T.afterCrash, nextRound);
    }

    function showTally() {
      phase = 'tally';
      const startTally = Date.now() + 500;
      const ranking = money.ranking();
      ctx.setHostView({ screen: 'tally', startAt: startTally, tally, players: ids });
      ctx.setAllPlayerViews(() => ({ screen: 'tallyWait' }));
      ctx.after(tallyDuration(tally) + 0.5, () => {
        ctx.setAllPlayerViews((p) => ({
          screen: 'finalMe', score: money.get(p.id), place: ranking.filter((r) => r.score > money.get(p.id)).length + 1, of: ranking.length,
          extra: extraSum.get(p.id) ?? 0,
        }));
        ctx.finish(ranking);
      });
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
      // (im Geheim-Modus nicht – sonst wüssten alle, dass alle raus sind)
      if (cashed.size === ids.length && mode !== 'secret') ctx.after(T.allOutReveal, () => crash(true));
    }

    return {
      start: intro,
      onAction(id, action) {
        if (action?.type === 'cash') return cashOut(id);
        if (action?.type === 'bet' && phase === 'ready' && ids.includes(id) && BETS.includes(Number(action.pct))) {
          bets.set(id, Number(action.pct));
          phoneReady(id);
        }
      },
      bot(_id, view) {
        if (view.screen === 'ready' && view.bet === 0 && view.money > 0 && Math.random() < 0.6) return { type: 'bet', pct: BETS[1 + Math.floor(Math.random() * 3)] };
        return null;
      },
    };
  },
} satisfies GameServerModule;
