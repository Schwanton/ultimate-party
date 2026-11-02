/**
 * Guess the Clicks! – Aufrufe eines zufälligen YouTube-Videos schätzen.
 * Wer am nächsten dran ist (absolute Differenz), bekommt 1 Punkt; bei Gleichstand alle Gleichnahen.
 */

import { Scores, type GameContext, type GameServerModule } from '@up/sdk';
import { YouTubeError, checkKey, fakeVideo, randomVideo, type Video } from './youtube';

const ROUNDS = 8;
const GUESS_TIME = 40;
const LAST_CHANCE = 5;
const MAX_GUESS = 100_000_000_000;

export default {
  create(ctx: GameContext) {
    const ids = ctx.players.map((p) => p.id);
    const scores = new Scores(ids);
    const videos: Video[] = [];
    let round = -1;
    let guesses = new Map<string, number>();
    let phase: 'setup' | 'loading' | 'countdown' | 'guess' | 'reveal' | 'other' = 'loading';
    let timer: { cancel(): void; deadline: number; duration: number } | null = null;
    let roundStart = scores.snapshot();
    let disposed = false;
    let loadingDone = false;
    let waited = 0;

    const members = () => [...ids, ...ctx.audience().map((a) => a.id)];
    const isPlayer = (id: string) => ids.includes(id);
    const fake = process.env.UP_FAKE_YOUTUBE === '1';

    function setup(error: string | null = null) {
      phase = 'setup';
      ctx.setHostView({ screen: 'setup', error });
      ctx.setAllPlayerViews(() => ({ screen: 'setup', error }));
    }

    async function load() {
      if (phase !== 'setup' && phase !== 'loading') return;
      const key = ctx.secret('youtubeApiKey');
      if (!key && !fake) return setup();
      phase = 'loading';
      ctx.setHostView({ screen: 'loading' });
      if (!fake) {
        try {
          await checkKey(key!);
        } catch (e) {
          if (disposed) return;
          const err = e as YouTubeError;
          if (err.kind === 'key') return setup('key');
          if (err.kind === 'quota') return setup('quota');
          return setup('network');
        }
      }
      ctx.setAllPlayerViews(() => ({ screen: 'intro' }));
      const topics = ctx.content<{ query: string }>().map((c) => c.query);
      const seen = new Set<string>();
      try {
        if (fake) {
          for (let i = 0; i < ROUNDS; i++) videos.push(fakeVideo(i));
          loadingDone = true;
        } else {
          // erstes Video sofort, die anderen im Hintergrund
          videos.push(await randomVideo(key!, topics, ctx.lang, seen));
          seen.add(videos[0].id);
          void (async () => {
            while (videos.length < ROUNDS && !disposed) {
              try {
                const v = await randomVideo(key!, topics, ctx.lang, seen);
                seen.add(v.id);
                videos.push(v);
              } catch {
                break;
              }
            }
            loadingDone = true;
          })();
        }
      } catch (e) {
        const err = e as YouTubeError;
        if (err.kind === 'key' || err.kind === 'quota') return setup(err.kind);
        ctx.setHostView({ screen: 'error', kind: err.kind ?? 'network', message: String(err.message ?? '') });
        ctx.setAllPlayerViews(() => ({ screen: 'lookAtTv' }));
        return;
      }
      if (disposed) return;
      ctx.setHostView({ screen: 'intro' });
      ctx.after(6, next);
    }

    function next() {
      round++;
      if (round >= videos.length) {
        // Video wird noch geladen? Kurz warten, sonst mit den vorhandenen Videos beenden.
        if (!loadingDone && waited++ < 15) {
          round--;
          return ctx.after(1, next);
        }
        return showScores(true);
      }
      if (round === 4 && phase !== 'other') return showScores(false);
      // 3-Sekunden-Countdown vor jeder Runde
      phase = 'countdown';
      ctx.setHostView({ screen: 'countdown', n: round + 1, total: ROUNDS, key: Math.random() });
      ctx.setAllPlayerViews(() => ({ screen: 'countdown' }));
      ctx.setAudienceView({ screen: 'countdown' });
      ctx.after(3, startGuess);
    }

    function startGuess() {
      phase = 'guess';
      guesses = new Map();
      timer = ctx.timer(GUESS_TIME, reveal);
      sendGuessViews();
    }

    function hostGuess() {
      const v = videos[round];
      ctx.setHostView({
        screen: 'guess', n: round + 1, total: ROUNDS, video: { id: v.id, title: v.title, channel: v.channel, published: v.published, durationSec: v.durationSec },
        guessed: [...guesses.keys()].filter(isPlayer).length, players: ids.length, deadline: timer!.deadline, duration: timer!.duration,
      });
    }

    function guessView(id: string) {
      const v = videos[round];
      ctx.setPlayerView(id, {
        screen: 'guess', input: !guesses.has(id), title: v.title, videoId: v.id, guess: guesses.get(id) ?? null,
        deadline: timer!.deadline, duration: timer!.duration,
      });
    }

    function sendGuessViews() {
      hostGuess();
      members().forEach(guessView);
    }

    function reveal() {
      timer?.cancel();
      phase = 'reveal';
      const v = videos[round];
      const entries = [...guesses.entries()].map(([playerId, guess]) => ({ playerId, guess, diff: Math.abs(guess - v.views), player: isPlayer(playerId) }));
      entries.sort((a, b) => a.diff - b.diff);
      const best = entries.find((e) => e.player)?.diff;
      const winners = best === undefined ? [] : entries.filter((e) => e.player && e.diff === best).map((e) => e.playerId);
      winners.forEach((w) => scores.add(w, 1));
      ctx.setHostView({ screen: 'reveal', n: round + 1, total: ROUNDS, video: { id: v.id, title: v.title, channel: v.channel }, views: v.views, entries, winners, crowd: members().length });
      const ranked = entries.filter((e) => e.player);
      for (const id of members()) {
        const mine = entries.find((e) => e.playerId === id);
        ctx.setPlayerView(id, {
          screen: 'result', views: v.views, guess: mine?.guess ?? null, won: winners.includes(id),
          place: mine?.player ? ranked.findIndex((e) => e.playerId === id) + 1 : null, of: ranked.length, total: scores.get(id),
        });
      }
      ctx.after(Math.min(14, 9 + entries.length * 0.2), next);
    }

    function showScores(final: boolean) {
      phase = 'other';
      const ranking = scores.ranking();
      ctx.setHostView({ screen: final ? 'final' : 'scores', before: roundStart, after: scores.snapshot(), ranking });
      roundStart = scores.snapshot();
      ctx.setAllPlayerViews((p) => ({ screen: final ? 'finalMe' : 'scoresMe', score: scores.get(p.id), place: ranking.filter((r) => r.score > scores.get(p.id)).length + 1, of: ranking.length }));
      ctx.setAudienceView({ screen: 'lookAtTv' });
      if (final) ctx.finish(ranking);
      else ctx.after(7, () => {
        round--;
        next();
      });
    }

    /** Alle haben getippt: noch 5 Sekunden zum Umentscheiden. */
    function hurry() {
      if (!timer || timer.deadline - Date.now() <= LAST_CHANCE * 1200) return;
      timer.cancel();
      timer = ctx.timer(LAST_CHANCE, reveal);
      sendGuessViews();
    }

    return {
      start() {
        void load();
      },
      onSecretChanged() {
        if (phase === 'setup') void load();
      },
      onAction(id, action) {
        if (phase === 'setup' && action?.type === 'setKey' && typeof action.key === 'string' && action.key.trim().length > 10) {
          ctx.setSecret('youtubeApiKey', action.key.trim());
          void load();
          return;
        }
        if (phase !== 'guess' || action?.type !== 'guess') return;
        const n = Math.round(Number(action.value));
        if (!Number.isFinite(n) || n < 0 || n > MAX_GUESS) return;
        guesses.set(id, n);
        guessView(id);
        hostGuess();
        if (ids.every((p) => guesses.has(p) || !ctx.player(p)?.connected)) hurry();
      },
      onAudienceJoin(id) {
        if (phase === 'guess') guessView(id);
        else ctx.setPlayerView(id, { screen: 'audienceWait' });
      },
      bot(_id, view) {
        if (view.screen === 'guess' && view.guess == null) return { type: 'guess', value: Math.round(10 ** (1 + Math.random() * 8)) };
        return null;
      },
      dispose() {
        disposed = true;
      },
    };
  },
} satisfies GameServerModule;
