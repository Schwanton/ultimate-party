/**
 * Wer war's? – alle beantworten anonym dieselbe persönliche Frage. Danach sehen alle alle Antworten auf einmal
 * und ordnen jede einem Spieler zu (seit 0.18.0 gleichzeitig, damit am Ende niemand „übrig bleibt“).
 * Dann wird Antwort für Antwort aufgelöst.
 *
 * Punkte: richtig geraten 500, als Autor 200 für jeden, der falsch geraten hat. Letzte Runde ×2.
 */

import { INPUT_GRACE, Scores, cleanText, pick, shuffle, type GameContext, type GameServerModule } from '@up/sdk';
import { votersSeconds } from './timing';

interface Item {
  id: string;
  question: string;
}

const T = { intro: 8, write: 60, assignBase: 25, assignPer: 9, assignMax: 120, lastChance: 5, after: 4 };
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
    let k = 0; // aktuelle Antwort bei der Auflösung
    /** pro Ratendem: Antwort-Nummer → vermuteter Autor */
    let picks = new Map<string, Map<number, string>>();
    let doneSet = new Set<string>();
    let timer: { cancel(): void; deadline: number; duration: number } | null = null;
    let phase: 'intro' | 'write' | 'assign' | 'reveal' | 'scores' = 'intro';
    let roundStart = scores.snapshot();

    const mult = () => (round === questions.length - 1 && questions.length > 1 ? 2 : 1);
    const question = () => questions[round].question;
    const base = () => ({ round: round + 1, totalRounds: questions.length, mult: mult(), question: question() });
    /** wer etwas zuordnen muss: alle, die nicht nur ihre eigene Antwort sehen */
    const assigners = () => ids.filter((id) => order.some((o) => o.authorId !== id));
    const ownIndex = (id: string) => order.findIndex((o) => o.authorId === id);

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
      timer = ctx.timer(T.write * wf, startAssign, { grace: INPUT_GRACE });
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

    /* Alle Antworten auf einmal zuordnen */
    function startAssign() {
      timer?.cancel();
      for (const [id, raw] of drafts) {
        const text = cleanText(raw, MAX_LEN);
        if (text && !answers.has(id)) answers.set(id, text);
      }
      order = shuffle([...answers].map(([authorId, text]) => ({ authorId, text })));
      if (order.length === 0) return showScores(round >= questions.length - 1);
      picks = new Map(ids.map((id) => [id, new Map()]));
      doneSet = new Set();
      phase = 'assign';
      const seconds = Math.min(T.assignMax, T.assignBase + T.assignPer * order.length);
      timer = ctx.timer(seconds, startReveal);
      hostAssign();
      ids.forEach(assignView);
    }

    function hostAssign() {
      ctx.setHostView({
        screen: 'assign', ...base(), answers: order.map((o) => o.text), candidates: ids,
        done: [...doneSet], assigners: assigners().length, deadline: timer!.deadline, duration: timer!.duration,
      });
    }

    function assignView(id: string) {
      const own = ownIndex(id);
      const list = order.map((o, i) => ({ i, text: o.text })).filter((x) => x.i !== own);
      if (!list.length) {
        ctx.setPlayerView(id, { screen: 'onlyMine', deadline: timer!.deadline, duration: timer!.duration });
        return;
      }
      ctx.setPlayerView(id, {
        screen: 'assign', input: !doneSet.has(id), question: question(), answers: list, options: ids.filter((x) => x !== id),
        picks: Object.fromEntries(picks.get(id) ?? []), done: doneSet.has(id), deadline: timer!.deadline, duration: timer!.duration,
      });
    }

    function hurry() {
      if (!timer || timer.deadline - Date.now() <= T.lastChance * 1200) return;
      timer.cancel();
      timer = ctx.timer(T.lastChance, startReveal);
      hostAssign();
      ids.forEach(assignView);
    }

    /* Auflösung: Antwort für Antwort */
    function startReveal() {
      timer?.cancel();
      k = -1;
      revealNext();
    }

    function revealNext() {
      k++;
      if (k >= order.length) return showScores(round >= questions.length - 1);
      phase = 'reveal';
      const { authorId: author, text } = order[k];
      const guesses = new Map<string, string>();
      for (const [g, m] of picks) {
        const target = m.get(k);
        if (g !== author && target) guesses.set(g, target);
      }
      const m = mult();
      // Stimmen pro Kandidat (Reihenfolge der Kandidaten wie auf dem TV)
      const votes = ids.map((c) => ({ playerId: c, voters: shuffle([...guesses].filter(([, g]) => g === c).map(([v]) => v)) }));
      const correct = [...guesses].filter(([, g]) => g === author).map(([v]) => v);
      const fooled = guesses.size - correct.length;
      correct.forEach((id) => scores.add(id, POINTS.correct * m));
      if (fooled) scores.add(author, fooled * POINTS.fooled * m);
      const voteCount = guesses.size;
      ctx.setHostView({
        screen: 'reveal', ...base(), n: k + 1, of: order.length, text, candidates: ids, votes, author,
        correct, authorPoints: fooled * POINTS.fooled * m, correctPoints: POINTS.correct * m,
      });
      const showAt = Date.now() + (1 + votersSeconds(voteCount) + 2.2) * 1000;
      ctx.setAllPlayerViews((p) => ({
        screen: 'result', showAt, text, isAuthor: p.id === author, correct: correct.includes(p.id), guessed: guesses.has(p.id),
        authorName: ctx.player(author)?.name ?? '?', fooled,
        points: p.id === author ? fooled * POINTS.fooled * m : correct.includes(p.id) ? POINTS.correct * m : 0,
      }));
      ctx.after(1 + votersSeconds(voteCount) + 2.2 + T.after, revealNext);
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
          if (ids.every((p) => answers.has(p) || !ctx.player(p)?.connected)) startAssign();
        } else if (action.type === 'answerDraft' && phase === 'write' && !answers.has(id)) {
          drafts.set(id, String(action.text ?? '').slice(0, 200));
        } else if (action.type === 'assign' && phase === 'assign') {
          const i = Number(action.answer);
          const mine = picks.get(id);
          if (!mine || !Number.isInteger(i) || i < 0 || i >= order.length || i === ownIndex(id)) return;
          const target = String(action.target ?? '');
          if (!target) mine.delete(i);
          else {
            if (target === id || !ids.includes(target)) return;
            // Jeder Spieler nur einmal: war er schon bei einer anderen Antwort, tauschen die beiden
            const prev = mine.get(i);
            for (const [j, t] of mine) {
              if (j !== i && t === target) {
                if (prev) mine.set(j, prev);
                else mine.delete(j);
              }
            }
            mine.set(i, target);
          }
          doneSet.delete(id);
          assignView(id);
          hostAssign();
        } else if (action.type === 'done' && phase === 'assign') {
          doneSet.add(id);
          assignView(id);
          hostAssign();
          if (assigners().every((p) => doneSet.has(p) || !ctx.player(p)?.connected)) hurry();
        }
      },
      bot(id, view) {
        if (view.screen === 'write') {
          const pool = ctx.lang === 'de'
            ? ['Pizza um 3 Uhr nachts', 'Mein Nachbar weiß das', 'Ein Einhorn-Kostüm', 'Ich habe geweint', 'Nie wieder Karaoke', 'Mit meiner Oma']
            : ['Pizza at 3 am', 'My neighbor knows', 'A unicorn costume', 'I cried', 'Never karaoke again', 'With my grandma'];
          return { type: 'answer', text: `${pick(pool)} ${id.slice(-2)}` };
        }
        if (view.screen === 'assign' && !view.done) {
          const list = view.answers as { i: number }[];
          const open = list.find((x) => !(view.picks as Record<string, string>)[x.i]);
          if (!open) return { type: 'done' };
          const used = new Set(Object.values(view.picks as Record<string, string>));
          const free = (view.options as string[]).filter((o) => !used.has(o));
          const author = order[open.i]?.authorId;
          const target = author && author !== id && free.includes(author) && Math.random() < 0.35 ? author : pick(free.length ? free : (view.options as string[]));
          return { type: 'assign', answer: open.i, target };
        }
        return null;
      },
    };
  },
} satisfies GameServerModule;
