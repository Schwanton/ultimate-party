/**
 * Guess the Clicks! – Aufrufe eines zufälligen YouTube-Videos schätzen.
 * Punkte je nach Einstellung „Wertung“ (siehe scoring.ts); Entfernung immer als Faktor daneben.
 */

import { INPUT_GRACE, Scores, shuffle, type GameContext, type GameServerModule } from '@up/sdk';
import { THEMES, YouTubeError, checkKey, fakeVideo, randomVideo, type Theme, type Video } from './youtube';
import { answerSeconds, revealSeconds, type PlanOptions } from './reveal';
import { MODES, factor, scoreRound, type ScoringMode } from './scoring';

const LAST_CHANCE = 5;
const MAX_GUESS = 100_000_000_000;

export default {
  create(ctx: GameContext) {
    const ROUNDS = Number(ctx.options.videos) || 8;
    const GUESS_TIME = Number(ctx.options.guessTime) || 40;
    const MODE: ScoringMode = MODES.includes(ctx.options.scoring as ScoringMode) ? (ctx.options.scoring as ScoringMode) : 'rank';
    const LOOSE = ctx.options.strictness === 'loose';
    const THEME: Theme = THEMES.includes(ctx.options.theme as Theme) ? (ctx.options.theme as Theme) : 'all';
    const KNOWN = ctx.options.views === 'known';
    /** Spielart „Höher oder tiefer“: Video A mit Aufrufen ist bekannt, hat Video B mehr oder weniger? (B wird zum nächsten A) */
    const HL = ctx.options.game === 'higherlower';
    const NEED = ROUNDS + (HL ? 1 : 0);
    const HL_POINTS = 500;
    let picks = new Map<string, 'more' | 'less'>();
    /** Bei „Nur der Nächste“ reicht das Finale wie bisher; sonst kommen am Ende alle mit Punkten zurück. */
    const PLAN: PlanOptions = { log: true, showAll: MODE !== 'best' };
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
    let extendVotes = new Set<string>();
    let extensions = 0;
    let baseDuration = 0;
    /** So viele Stimmen braucht es für „Video länger“ (mindestens die Hälfte der verbundenen Spieler) */
    const extendNeeded = () => Math.max(1, Math.ceil(ids.filter((p) => ctx.player(p)?.connected).length / 2));

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
          for (let i = 0; i < NEED; i++) videos.push(fakeVideo(i));
          loadingDone = true;
        } else {
          // erstes Video sofort, die anderen im Hintergrund
          videos.push(await randomVideo(key!, topics, ctx.lang, seen, { theme: THEME, known: KNOWN }));
          seen.add(videos[0].id);
          void (async () => {
            while (videos.length < NEED && !disposed) {
              try {
                const v = await randomVideo(key!, topics, ctx.lang, seen, { theme: THEME, known: KNOWN });
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
      ctx.setHostView({ screen: 'intro', mode: MODE, loose: LOOSE, hl: HL });
      ctx.after(6, next);
    }

    function next() {
      round++;
      if (round + (HL ? 1 : 0) >= videos.length) {
        // Video wird noch geladen? Kurz warten, sonst mit den vorhandenen Videos beenden.
        if (!loadingDone && waited++ < 15) {
          round--;
          return ctx.after(1, next);
        }
        return showScores(true);
      }
      if (round === Math.floor(ROUNDS / 2) && ROUNDS >= 6 && phase !== 'other') return showScores(false);
      // 3-Sekunden-Countdown vor jeder Runde
      phase = 'countdown';
      ctx.setHostView({ screen: 'countdown', n: round + 1, total: ROUNDS, key: Math.random() });
      ctx.setAllPlayerViews(() => ({ screen: 'countdown' }));
      ctx.setAudienceView({ screen: 'countdown' });
      ctx.after(3, HL ? startHL : startGuess);
    }

    /* ---------- Höher oder tiefer ---------- */

    const hlA = () => videos[round];
    const hlB = () => videos[round + 1];
    const hlMult = () => (round === ROUNDS - 1 && ROUNDS > 1 ? 2 : 1);

    function startHL() {
      phase = 'guess';
      picks = new Map();
      timer = ctx.timer(Math.min(GUESS_TIME, 30), revealHL);
      sendHL();
    }

    function sendHL() {
      const a = hlA(), b = hlB();
      ctx.setHostView({
        screen: 'hlGuess', n: round + 1, total: ROUNDS, mult: hlMult(),
        a: { id: a.id, title: a.title, channel: a.channel, views: a.views }, b: { id: b.id, title: b.title, channel: b.channel },
        picked: [...picks.keys()].filter(isPlayer).length, players: ids.length, deadline: timer!.deadline, duration: timer!.duration,
      });
      for (const id of members()) {
        ctx.setPlayerView(id, { screen: 'hlGuess', input: !picks.has(id), aTitle: a.title, aViews: a.views, aId: a.id, bTitle: b.title, bId: b.id, pick: picks.get(id) ?? null, deadline: timer!.deadline, duration: timer!.duration });
      }
    }

    function revealHL() {
      timer?.cancel();
      phase = 'reveal';
      const a = hlA(), b = hlB();
      // gleich viele Aufrufe: beide Antworten richtig
      const right: ('more' | 'less')[] = b.views > a.views ? ['more'] : b.views < a.views ? ['less'] : ['more', 'less'];
      const pts = HL_POINTS * hlMult();
      const winners = [...picks].filter(([id, p]) => isPlayer(id) && right.includes(p)).map(([id]) => id);
      winners.forEach((id) => scores.add(id, pts));
      ctx.setHostView({
        screen: 'hlReveal', n: round + 1, total: ROUNDS, a: { id: a.id, title: a.title, views: a.views }, b: { id: b.id, title: b.title, views: b.views },
        more: [...picks].filter(([id, p]) => isPlayer(id) && p === 'more').map(([id]) => id), less: [...picks].filter(([id, p]) => isPlayer(id) && p === 'less').map(([id]) => id),
        right, points: pts, startAt: Date.now() + 300,
      });
      for (const id of members()) {
        const p = picks.get(id) ?? null;
        ctx.setPlayerView(id, { screen: 'hlResult', pick: p, right: p ? right.includes(p) : null, views: b.views, aViews: a.views, points: p && right.includes(p) && isPlayer(id) ? pts : 0, doneAt: Date.now() + 3300 });
      }
      ctx.after(9, next);
    }

    function startGuess() {
      phase = 'guess';
      guesses = new Map();
      drafts = new Map();
      extendVotes = new Set();
      extensions = 0;
      timer = ctx.timer(GUESS_TIME, reveal, { grace: INPUT_GRACE });
      baseDuration = timer.duration;
      sendGuessViews();
    }

    function hostGuess() {
      const v = videos[round];
      ctx.setHostView({
        screen: 'guess', n: round + 1, total: ROUNDS, video: { id: v.id, title: v.title, channel: v.channel, published: v.published, durationSec: v.durationSec },
        guessed: [...guesses.keys()].filter(isPlayer).length, players: ids.length, deadline: timer!.deadline, duration: timer!.duration,
        extendVotes: extendVotes.size, extendNeeded: extendNeeded(), extensions,
      });
    }

    function guessView(id: string) {
      const v = videos[round];
      ctx.setPlayerView(id, {
        screen: 'guess', input: !guesses.has(id), title: v.title, videoId: v.id, guess: guesses.get(id) ?? null,
        deadline: timer!.deadline, duration: timer!.duration,
        canExtend: isPlayer(id), wantsExtend: extendVotes.has(id), extendVotes: extendVotes.size, extendNeeded: extendNeeded(), extensions,
      });
    }

    function sendGuessViews() {
      hostGuess();
      members().forEach(guessView);
    }

    /** eingetippt, aber nicht abgeschickt – der neueste Stand zählt bei Zeitablauf */
    let drafts = new Map<string, number>();

    function reveal() {
      timer?.cancel();
      for (const [id, n] of drafts) guesses.set(id, n);
      phase = 'reveal';
      const v = videos[round];
      const all = [...guesses.entries()].map(([playerId, guess]) => ({ playerId, guess }));
      const scored = scoreRound(all.filter((e) => isPlayer(e.playerId)), v.views, MODE, LOOSE);
      scored.forEach((e) => { if (e.points) scores.add(e.playerId, e.points); });
      const winners = scored.filter((e) => e.closest).map((e) => e.playerId);
      // Zahlenstrahl: startet gleich, Handys zeigen ihr Ergebnis erst, wenn die echte Zahl zu sehen ist
      // Auf dem Strahl stehen nur die Spieler, gemischt – die Reihenfolge darf nichts verraten
      const shown = shuffle(scored.map(({ playerId, guess, points, place }) => ({ playerId, guess, points, place })));
      const startAt = Date.now() + 300;
      const rideSeconds = revealSeconds(v.views, shown, PLAN);
      const doneAt = startAt + answerSeconds(v.views, shown, PLAN) * 1000;
      ctx.setHostView({
        screen: 'reveal', n: round + 1, total: ROUNDS, video: { id: v.id, title: v.title, channel: v.channel }, views: v.views,
        entries: shown, winners, mode: MODE, plan: PLAN, crowd: members().length, startAt,
      });
      for (const id of members()) {
        const mine = scored.find((e) => e.playerId === id);
        const guess = guesses.get(id) ?? null;
        ctx.setPlayerView(id, {
          screen: 'result', views: v.views, guess, won: winners.includes(id), mode: MODE,
          points: mine?.points ?? null, exact: mine?.exact ?? false,
          factor: guess == null ? null : factor(guess, v.views), high: guess != null && guess > v.views,
          place: mine ? mine.place : null, of: scored.length, total: scores.get(id), doneAt,
        });
      }
      ctx.after(rideSeconds + (PLAN.showAll ? 5 : 7), next);
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
      timer = ctx.timer(LAST_CHANCE, reveal, { grace: INPUT_GRACE });
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
        if (HL && phase === 'guess' && action?.type === 'hl' && (action.pick === 'more' || action.pick === 'less') && members().includes(id)) {
          picks.set(id, action.pick);
          sendHL();
          if (ids.every((p) => picks.has(p) || !ctx.player(p)?.connected) && timer && timer.deadline - Date.now() > LAST_CHANCE * 1200) {
            timer.cancel();
            timer = ctx.timer(LAST_CHANCE, revealHL);
            sendHL();
          }
          return;
        }
        if (phase === 'guess' && action?.type === 'extend' && isPlayer(id)) {
          if (action.on === false) extendVotes.delete(id);
          else extendVotes.add(id);
          if (extendVotes.size >= extendNeeded()) {
            // Zeit verdoppeln: noch einmal die volle Rate-Zeit obendrauf
            const end = timer!.deadline + baseDuration;
            timer?.cancel();
            timer = ctx.timerAt(end, reveal, { grace: INPUT_GRACE });
            extendVotes = new Set();
            extensions++;
          }
          sendGuessViews();
          return;
        }
        if (phase === 'setup' && action?.type === 'setKey' && typeof action.key === 'string' && action.key.trim().length > 10) {
          ctx.setSecret('youtubeApiKey', action.key.trim());
          void load();
          return;
        }
        if (phase === 'guess' && action?.type === 'guessDraft') {
          const d = Math.round(Number(action.value));
          if (action.value == null) drafts.delete(id);
          else if (Number.isFinite(d) && d >= 0 && d <= MAX_GUESS) drafts.set(id, d);
          return;
        }
        if (phase !== 'guess' || action?.type !== 'guess') return;
        const n = Math.round(Number(action.value));
        if (!Number.isFinite(n) || n < 0 || n > MAX_GUESS) return;
        drafts.delete(id);
        guesses.set(id, n);
        guessView(id);
        hostGuess();
        if (ids.every((p) => guesses.has(p) || !ctx.player(p)?.connected)) hurry();
      },
      onAudienceJoin(id) {
        if (phase === 'guess' && HL) sendHL();
        else if (phase === 'guess') guessView(id);
        else ctx.setPlayerView(id, { screen: 'audienceWait' });
      },
      bot(_id, view) {
        if (view.screen === 'hlGuess' && view.pick == null) return { type: 'hl', pick: Math.random() < 0.5 ? 'more' : 'less' };
        if (view.screen === 'guess' && view.guess == null) return { type: 'guess', value: Math.round(10 ** (1 + Math.random() * 8)) };
        return null;
      },
      dispose() {
        disposed = true;
      },
    };
  },
} satisfies GameServerModule;
