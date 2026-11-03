/**
 * Wer war's? – alle beantworten anonym dieselbe persönliche Frage. Danach wird jede Antwort einzeln gezeigt
 * und alle raten, wer sie geschrieben hat.
 *
 * Punkte: richtig geraten 500, als Autor 200 für jeden, der falsch geraten hat. Letzte Runde ×2.
 */

import { INPUT_GRACE, Scores, cleanText, pick, shuffle, type GameContext, type GameServerModule } from '@up/sdk';
import { votersSeconds } from './timing';

interface Item {
  id: string;
  question: string;
}

const T = { intro: 8, write: 60, guess: 18, lastChance: 3, after: 4 };
const POINTS = { correct: 500, fooled: 200 };
const MAX_LEN = 70;

export default {
  create(ctx: GameContext) {
    const ids = ctx.players.map((p) => p.id);
    const scores = new Scores(ids);
    const totalRounds = Number(ctx.options.rounds) || 3;
    const wf = Number(ctx.options.writeTime) || 1;
    const questions = ctx.deck<Item>().drawMany(totalRounds);
    let round = -1;
    let answers = new Map<string, string>();
    /** nicht abgeschickte Antworten – zählen bei Zeitablauf */
    let drafts = new Map<string, string>();
    let order: { authorId: string; text: string }[] = [];
    let k = 0; // aktuelle Antwort
    let guesses = new Map<string, string>();
    let timer: { cancel(): void; deadline: number; duration: number } | null = null;
    let phase: 'intro' | 'write' | 'guess' | 'reveal' | 'scores' = 'intro';
    let roundStart = scores.snapshot();

    const mult = () => (round === questions.length - 1 && questions.length > 1 ? 2 : 1);
    const question = () => questions[round].question;
    const base = () => ({ round: round + 1, totalRounds: questions.length, mult: mult(), question: question() });
    const current = () => order[k];
    const guessers = () => ids.filter((id) => id !== current().authorId);

    function intro() {
      ctx.setHostView({ screen: 'intro' });
      ctx.setAllPlayerViews(() => ({ screen: 'intro' }));
      ctx.after(T.intro, nextRound);
    }

    function nextRound() {
      round++;
      if (round >= questions.length) return showScores(true);
      roundStart = scores.snapshot();
      answers = new Map();
      drafts = new Map();
      phase = 'write';
      timer = ctx.timer(T.write * wf, startGuessing, { grace: INPUT_GRACE });
      hostWrite();
      ids.forEach(writeView);
    }

    function hostWrite() {
      ctx.setHostView({ screen: 'write', ...base(), players: ids, done: [...answers.keys()], deadline: timer!.deadline, duration: timer!.duration });
    }

    function writeView(id: string) {
      if (answers.has(id)) ctx.setPlayerView(id, { screen: 'written', text: answers.get(id) });
      else ctx.setPlayerView(id, { screen: 'write', input: true, question: question(), deadline: timer!.deadline, duration: timer!.duration });
    }

    function startGuessing() {
      timer?.cancel();
      for (const [id, raw] of drafts) {
        const text = cleanText(raw, MAX_LEN);
        if (text && !answers.has(id)) answers.set(id, text);
      }
      order = shuffle([...answers].map(([authorId, text]) => ({ authorId, text })));
      k = -1;
      if (order.length === 0) return showScores(round >= questions.length - 1);
      nextAnswer();
    }

    function nextAnswer() {
      k++;
      if (k >= order.length) return showScores(round >= questions.length - 1);
      guesses = new Map();
      phase = 'guess';
      timer = ctx.timer(T.guess, reveal);
      hostGuess();
      ids.forEach(guessView);
    }

    function hostGuess() {
      ctx.setHostView({
        screen: 'guess', ...base(), n: k + 1, of: order.length, text: current().text, candidates: ids,
        guessed: guesses.size, guessers: guessers().length, deadline: timer!.deadline, duration: timer!.duration,
      });
    }

    function guessView(id: string) {
      if (id === current().authorId) {
        ctx.setPlayerView(id, { screen: 'mine', text: current().text, deadline: timer!.deadline, duration: timer!.duration });
        return;
      }
      ctx.setPlayerView(id, {
        screen: 'guess', input: !guesses.has(id), text: current().text, question: question(), options: ids.filter((x) => x !== id),
        selected: guesses.get(id) ?? null, deadline: timer!.deadline, duration: timer!.duration,
      });
    }

    function hurry() {
      if (!timer || timer.deadline - Date.now() <= T.lastChance * 1200) return;
      timer.cancel();
      timer = ctx.timer(T.lastChance, reveal);
      hostGuess();
      ids.forEach(guessView);
    }

    function reveal() {
      timer?.cancel();
      phase = 'reveal';
      const author = current().authorId;
      const m = mult();
      // Stimmen pro Kandidat (Reihenfolge der Kandidaten wie auf dem TV)
      const votes = ids.map((c) => ({ playerId: c, voters: shuffle([...guesses].filter(([, g]) => g === c).map(([v]) => v)) }));
      const correct = [...guesses].filter(([, g]) => g === author).map(([v]) => v);
      const fooled = guesses.size - correct.length;
      correct.forEach((id) => scores.add(id, POINTS.correct * m));
      if (fooled) scores.add(author, fooled * POINTS.fooled * m);
      const voteCount = guesses.size;
      ctx.setHostView({
        screen: 'reveal', ...base(), n: k + 1, of: order.length, text: current().text, candidates: ids, votes, author,
        correct, authorPoints: fooled * POINTS.fooled * m, correctPoints: POINTS.correct * m,
      });
      const showAt = Date.now() + (1 + votersSeconds(voteCount) + 2.2) * 1000;
      ctx.setAllPlayerViews((p) => ({
        screen: 'result', showAt, isAuthor: p.id === author, correct: correct.includes(p.id), guessed: guesses.has(p.id),
        authorName: ctx.player(author)?.name ?? '?', fooled,
        points: p.id === author ? fooled * POINTS.fooled * m : correct.includes(p.id) ? POINTS.correct * m : 0,
      }));
      ctx.after(1 + votersSeconds(voteCount) + 2.2 + T.after, nextAnswer);
    }

    function showScores(final: boolean) {
      phase = 'scores';
      const ranking = scores.ranking();
      ctx.setHostView({ screen: final ? 'final' : 'scores', before: roundStart, after: scores.snapshot(), ranking });
      ctx.setAllPlayerViews((p) => ({ screen: final ? 'finalMe' : 'scoresMe', score: scores.get(p.id), place: ranking.filter((r) => r.score > scores.get(p.id)).length + 1, of: ranking.length }));
      if (final) ctx.finish(ranking);
      else ctx.after(7, nextRound);
    }

    return {
      start: intro,
      onAction(id, action) {
        if (!action || !ids.includes(id)) return;
        if (action.type === 'answer' && phase === 'write' && !answers.has(id)) {
          const text = cleanText(String(action.text ?? ''), MAX_LEN);
          if (!text) return;
          answers.set(id, text);
          writeView(id);
          hostWrite();
          if (ids.every((p) => answers.has(p) || !ctx.player(p)?.connected)) startGuessing();
        } else if (action.type === 'answerDraft' && phase === 'write' && !answers.has(id)) {
          drafts.set(id, String(action.text ?? '').slice(0, 200));
        } else if (action.type === 'guess' && phase === 'guess' && id !== current().authorId) {
          const target = String(action.target);
          if (target === id || !ids.includes(target)) return;
          guesses.set(id, target);
          guessView(id);
          hostGuess();
          if (guessers().every((p) => guesses.has(p) || !ctx.player(p)?.connected)) hurry();
        }
      },
      bot(id, view) {
        if (view.screen === 'write') {
          const pool = ctx.lang === 'de'
            ? ['Pizza um 3 Uhr nachts', 'Mein Nachbar weiß das', 'Ein Einhorn-Kostüm', 'Ich habe geweint', 'Nie wieder Karaoke', 'Mit meiner Oma']
            : ['Pizza at 3 am', 'My neighbor knows', 'A unicorn costume', 'I cried', 'Never karaoke again', 'With my grandma'];
          return { type: 'answer', text: `${pick(pool)} ${id.slice(-2)}` };
        }
        if (view.screen === 'guess' && !view.selected) {
          const author = current().authorId;
          return { type: 'guess', target: Math.random() < 0.35 && author !== id ? author : pick(view.options as string[]) };
        }
        return null;
      },
    };
  },
} satisfies GameServerModule;
