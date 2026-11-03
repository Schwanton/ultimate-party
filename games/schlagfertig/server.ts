/**
 * Schlagfertig – witzige Antworten auf Prompts, die anderen stimmen ab.
 *
 * Bis 12 Spieler: Runde 1 und 2 als Duelle (je zwei Spieler pro Prompt), Runde 3 Finale (alle denselben Prompt).
 * Ab 13 Spieler: jede Runde ein Prompt für alle, Abstimmung im Turnier (Vorrunden parallel am Handy, Finale am TV).
 */

import { votersSeconds } from './timing';
import { INPUT_GRACE, Scores, cleanText, pick, shuffle, splitEvenly, type GameContext, type GameServerModule } from '@up/sdk';

interface Prompt {
  id: string;
  prompt: string;
}

const DUEL_LIMIT = 12;
const LAST_CHANCE = 5;
const MAX_LEN = 60;
const T = { answerDuel: 80, answerSingle: 55, vote: 20, heat: 25, finalVote: 30 };
/** Sekunden, in denen zuerst nur die Frage zu sehen ist, bevor die Antworten kommen */
const PROMPT_FIRST = 3;
const POINTS = { vote: 100, audience: 25, sweep: 250, champion: 500 };

const BOT_ANSWERS: Record<string, string[]> = {
  de: ['Ein Toaster mit Gefühlen', 'Opa beim Breakdance', 'Drei Waschbären im Trenchcoat', 'Leider nein', 'Mit Glitzer', 'Das Finanzamt', 'Ein sehr wütender Pinguin', 'Kartoffelsalat', 'Frag deine Mutter', 'Nur dienstags'],
  en: ['A toaster with feelings', 'Grandpa breakdancing', 'Three raccoons in a trench coat', 'Sadly no', 'With glitter', 'The tax office', 'A very angry penguin', 'Potato salad', 'Ask your mother', 'Only on Tuesdays'],
};

interface Answer {
  promptId: string;
  authorId: string;
  text: string | null;
}

export default {
  create(ctx: GameContext) {
    const players = ctx.players;
    const ids = players.map((p) => p.id);
    const duelMode = players.length <= DUEL_LIMIT;
    const scores = new Scores(ids);
    const prompts = ctx.content<Prompt>();
    let promptIndex = 0;
    const nextPrompt = (): Prompt => prompts[promptIndex++ % Math.max(1, prompts.length)] ?? { id: 'x', prompt: '…' };

    let round = 0; // 1..3
    const totalRounds = Number(ctx.options.rounds) || 3;
    const tf = Number(ctx.options.answerTime) || 1;
    let mult = 1;
    let answers: Answer[] = [];
    let promptsById = new Map<string, Prompt>();
    let assigned = new Map<string, string[]>(); // Spieler -> Prompt-IDs
    let phaseTimer: { cancel(): void } | null = null;
    let voteTimer: { deadline: number } | null = null;
    let votes = new Map<string, string>(); // Wähler -> Option
    let voteOptions: string[] = [];
    let eligibleVoters = new Set<string>();
    let onVotesComplete: (() => void) | null = null;
    let roundStart: Record<string, number> = {};
    let answerDeadline = 0;
    let answerDuration = 0;

    const members = () => [...players, ...ctx.audience()];
    const isPlayer = (id: string) => ids.includes(id);

    function cancelTimer() {
      phaseTimer?.cancel();
      phaseTimer = null;
    }

    /* ---------- Ablauf ---------- */

    function intro() {
      ctx.setHostView({ screen: 'intro', duelMode, players: players.length });
      ctx.setAllPlayerViews(() => ({ screen: 'intro' }));
      ctx.setAudienceView({ screen: 'intro' });
      ctx.after(5, startRound);
    }

    function startRound() {
      round++;
      mult = round === totalRounds ? 3 : Math.min(2, round);
      roundStart = scores.snapshot();
      answers = [];
      promptsById = new Map();
      assigned = new Map();
      const final = round === totalRounds;
      if (duelMode && !final) {
        // Jeder Spieler bekommt 2 Prompts, jeder Prompt geht an 2 Spieler
        const order = shuffle(ids);
        const list = order.map(() => nextPrompt());
        list.forEach((p) => promptsById.set(p.id, p));
        order.forEach((id, i) => assigned.set(id, [list[i].id, list[(i + order.length - 1) % order.length].id]));
        if (order.length === 2) assigned.set(order[1], [list[1].id, list[0].id]);
        askAnswers(T.answerDuel * tf);
      } else {
        const p = nextPrompt();
        promptsById.set(p.id, p);
        ids.forEach((id) => assigned.set(id, [p.id]));
        askAnswers(T.answerSingle * tf);
      }
    }

    function answeredAll(id: string) {
      const mine = assigned.get(id) ?? [];
      return mine.every((pid) => answers.some((a) => a.authorId === id && a.promptId === pid));
    }

    function answerHostView(deadline: number, duration: number) {
      ctx.setHostView({
        screen: 'answer', round, totalRounds, mult, duelMode, final: round === totalRounds,
        prompt: assigned.size && new Set([...assigned.values()].flat()).size === 1 ? promptsById.values().next().value?.prompt : null,
        done: ids.filter(answeredAll), waiting: ids, deadline, duration,
      });
    }

    function answerPlayerView(id: string, deadline: number, duration: number) {
      const mine = assigned.get(id) ?? [];
      const open = mine.filter((pid) => !answers.some((a) => a.authorId === id && a.promptId === pid));
      if (!open.length) {
        ctx.setPlayerView(id, { screen: 'answered' });
        return;
      }
      const p = promptsById.get(open[0])!;
      ctx.setPlayerView(id, {
        screen: 'answer', input: true, promptId: p.id, prompt: p.prompt, index: mine.length - open.length + 1, count: mine.length,
        maxLength: MAX_LEN, deadline, duration,
      });
    }

    /** Entwürfe (noch nicht abgeschickt) – zählen bei Zeitablauf */
    const drafts = new Map<string, string>();

    function askAnswers(seconds: number) {
      drafts.clear();
      const t = ctx.timer(seconds, endAnswers, { grace: INPUT_GRACE });
      phaseTimer = t;
      answerHostView(t.deadline, t.duration);
      ids.forEach((id) => answerPlayerView(id, t.deadline, t.duration));
      ctx.setAudienceView({ screen: 'audienceWait' });
      answerDeadline = t.deadline;
      answerDuration = t.duration;
    }

    function onAnswer(id: string, promptId: string, raw: unknown) {
      if (!assigned.get(id)?.includes(promptId) || answers.some((a) => a.authorId === id && a.promptId === promptId)) return;
      const text = cleanText(raw, MAX_LEN);
      if (!text) return;
      answers.push({ promptId, authorId: id, text });
      answerPlayerView(id, answerDeadline, answerDuration);
      answerHostView(answerDeadline, answerDuration);
      if (ids.every(answeredAll)) endAnswers();
    }

    function endAnswers() {
      cancelTimer();
      // fehlende Antworten eintragen
      for (const [id, pids] of assigned) {
        for (const pid of pids) {
          if (answers.some((a) => a.authorId === id && a.promptId === pid)) continue;
          answers.push({ promptId: pid, authorId: id, text: cleanText(drafts.get(`${id}|${pid}`) ?? '', MAX_LEN) || null });
        }
      }
      ctx.setAllPlayerViews(() => ({ screen: 'lookAtTv' }));
      if (duelMode && round < totalRounds) runDuels([...promptsById.keys()], 0);
      else if (duelMode || ids.length <= 6) finalVote(answers.filter((a) => a.text), true);
      else tournament(shuffle(answers.filter((a) => a.text)));
    }

    /* ---------- Abstimmen (allgemein) ---------- */

    function collectVotes(options: string[], voters: string[], seconds: number, done: () => void) {
      votes = new Map();
      voteOptions = options;
      eligibleVoters = new Set(voters);
      onVotesComplete = done;
      const t = ctx.timer(seconds + PROMPT_FIRST, finishVotes);
      phaseTimer = t;
      voteTimer = t;
      // Zeitpunkt, ab dem die Antworten sichtbar sind
      return Object.assign(t, { showAt: t.deadline - t.duration * (seconds / (seconds + PROMPT_FIRST)) });
    }

    /** Alle haben abgestimmt: Zeit auf wenige Sekunden verkürzen, damit man sich noch umentscheiden kann. */
    function hurryVotes() {
      if (!voteTimer || voteTimer.deadline - Date.now() <= LAST_CHANCE * 1200) return;
      phaseTimer?.cancel();
      const t = ctx.timer(LAST_CHANCE, finishVotes);
      phaseTimer = t;
      voteTimer = t;
      if (lastHostVote) {
        lastHostVote = { ...lastHostVote, deadline: t.deadline, duration: t.duration };
        ctx.setHostView({ ...lastHostVote, voted: votes.size, voters: eligibleVoters.size });
      }
      for (const [id, view] of lastVoteView) {
        if (!eligibleVoters.has(id)) continue;
        const v = { ...view, deadline: t.deadline, duration: t.duration, selected: votes.get(id) ?? null };
        lastVoteView.set(id, v);
        ctx.setPlayerView(id, v);
      }
    }

    function finishVotes() {
      cancelTimer();
      const cb = onVotesComplete;
      onVotesComplete = null;
      eligibleVoters = new Set();
      cb?.();
    }

    function onVote(id: string, choice: unknown) {
      if (!onVotesComplete || !eligibleVoters.has(id) || typeof choice !== 'string') return;
      const allowed = (voteViewsFor.get(id) ?? voteOptions);
      if (!allowed.includes(choice)) return;
      votes.set(id, choice);
      const updated = { ...(lastVoteView.get(id) ?? {}), selected: choice, input: false };
      lastVoteView.set(id, updated);
      ctx.setPlayerView(id, updated);
      if ([...eligibleVoters].every((v) => votes.has(v) || !ctx.player(v)?.connected)) hurryVotes();
      else if (lastHostVote) ctx.setHostView({ ...lastHostVote, voted: votes.size, voters: eligibleVoters.size });
    }

    const voteViewsFor = new Map<string, string[]>();
    const lastVoteView = new Map<string, object>();
    let lastHostVote: Record<string, unknown> | null = null;

    function sendVoteView(id: string, view: Record<string, unknown>, allowed: string[]) {
      voteViewsFor.set(id, allowed);
      lastVoteView.set(id, view);
      ctx.setPlayerView(id, view);
    }

    function hostVote(view: Record<string, unknown>) {
      lastHostVote = { ...view, voted: 0, voters: eligibleVoters.size };
      ctx.setHostView(lastHostVote);
    }

    function tally(optionIds: string[]) {
      const out = new Map<string, { players: string[]; audience: string[] }>();
      optionIds.forEach((o) => out.set(o, { players: [], audience: [] }));
      for (const [voter, choice] of votes) {
        const e = out.get(choice);
        if (!e) continue;
        (isPlayer(voter) ? e.players : e.audience).push(voter);
      }
      return out;
    }

    /* ---------- Duelle ---------- */

    function runDuels(pids: string[], i: number) {
      if (i >= pids.length) return showScores();
      const pid = pids[i];
      const pair = answers.filter((a) => a.promptId === pid);
      const [a, b] = pair;
      if (!a || !b) return runDuels(pids, i + 1);
      const prompt = promptsById.get(pid)!.prompt;
      if (!a.text && !b.text) return runDuels(pids, i + 1);
      if (!a.text || !b.text) return duelResult(pids, i, prompt, a, b, new Map([['a', { players: [], audience: [] }], ['b', { players: [], audience: [] }]]));
      const voters = members().map((m) => m.id).filter((id) => id !== a.authorId && id !== b.authorId);
      const t = collectVotes(['a', 'b'], voters, T.vote, () => duelResult(pids, i, prompt, a, b, tally(['a', 'b'])));
      hostVote({ screen: 'duel', round, totalRounds, mult, prompt, n: i + 1, total: pids.length, a: a.text, b: b.text, deadline: t.deadline, duration: t.duration, showAt: t.showAt });
      for (const m of members()) {
        if (voters.includes(m.id)) {
          sendVoteView(m.id, { screen: 'vote', input: true, prompt, options: [{ id: 'a', text: a.text }, { id: 'b', text: b.text }], deadline: t.deadline, duration: t.duration, showAt: t.showAt }, ['a', 'b']);
        } else if (isPlayer(m.id)) {
          ctx.setPlayerView(m.id, { screen: 'yourDuel', prompt });
        }
      }
      if (voters.length === 0) finishVotes();
    }

    function duelResult(pids: string[], i: number, prompt: string, a: Answer, b: Answer, res: Map<string, { players: string[]; audience: string[] }>) {
      const ra = res.get('a')!, rb = res.get('b')!;
      const pa = (ra.players.length * POINTS.vote + ra.audience.length * POINTS.audience) * mult;
      const pb = (rb.players.length * POINTS.vote + rb.audience.length * POINTS.audience) * mult;
      const totalPlayerVotes = ra.players.length + rb.players.length;
      let winner: 'a' | 'b' | null = pa > pb ? 'a' : pb > pa ? 'b' : null;
      if (!a.text) winner = 'b';
      if (!b.text) winner = 'a';
      const sweep = winner && totalPlayerVotes >= 2 && (winner === 'a' ? rb.players.length === 0 : ra.players.length === 0);
      const bonusA = winner === 'a' ? (sweep ? POINTS.sweep * mult : 0) + (!b.text ? POINTS.vote * mult : 0) : 0;
      const bonusB = winner === 'b' ? (sweep ? POINTS.sweep * mult : 0) + (!a.text ? POINTS.vote * mult : 0) : 0;
      scores.add(a.authorId, pa + bonusA);
      scores.add(b.authorId, pb + bonusB);
      ctx.setHostView({
        screen: 'duelResult', round, totalRounds, mult, prompt, n: i + 1, total: pids.length, winner, sweep: !!sweep,
        a: { text: a.text, authorId: a.authorId, voters: ra.players, audience: ra.audience.length, points: pa + bonusA },
        b: { text: b.text, authorId: b.authorId, voters: rb.players, audience: rb.audience.length, points: pb + bonusB },
        crowd: eligibleCount(a, b),
      });
      for (const [ans, pts, won] of [[a, pa + bonusA, winner === 'a'], [b, pb + bonusB, winner === 'b']] as const) {
        ctx.setPlayerView(ans.authorId, { screen: 'duelOutcome', won, points: pts, sweep: won && !!sweep, text: ans.text, total: scores.get(ans.authorId) });
      }
      members().filter((m) => m.id !== a.authorId && m.id !== b.authorId).forEach((m) => ctx.setPlayerView(m.id, { screen: 'lookAtTv' }));
      ctx.after(7 + votersSeconds(ra.players.length + rb.players.length), () => runDuels(pids, i + 1));
    }

    function eligibleCount(a: Answer, b: Answer) {
      return members().filter((m) => m.id !== a.authorId && m.id !== b.authorId).length;
    }

    /* ---------- Finale / großes Abstimmen am TV ---------- */

    function finalVote(entries: Answer[], isLast: boolean, champion = false) {
      if (entries.length === 0) return showScores();
      const options = shuffle(entries).map((e, k) => ({ id: String(k), text: e.text!, authorId: e.authorId }));
      const prompt = promptsById.get(entries[0].promptId)?.prompt ?? '';
      const voters = members().map((m) => m.id);
      const t = collectVotes(options.map((o) => o.id), voters, T.finalVote, () => finalResult(options, prompt, isLast, champion));
      hostVote({ screen: 'multiVote', round, totalRounds, mult, prompt, options: options.map((o) => ({ id: o.id, text: o.text })), deadline: t.deadline, duration: t.duration, champion, showAt: t.showAt });
      for (const m of members()) {
        const allowed = options.filter((o) => o.authorId !== m.id);
        sendVoteView(m.id, { screen: 'vote', input: true, prompt, options: allowed.map((o) => ({ id: o.id, text: o.text })), deadline: t.deadline, duration: t.duration, showAt: t.showAt }, allowed.map((o) => o.id));
      }
    }

    function finalResult(options: { id: string; text: string; authorId: string }[], prompt: string, isLast: boolean, champion: boolean) {
      const res = tally(options.map((o) => o.id));
      const rows = options.map((o) => {
        const r = res.get(o.id)!;
        const points = (r.players.length * POINTS.vote + r.audience.length * POINTS.audience) * mult;
        return { ...o, voters: r.players, audience: r.audience.length, points };
      }).sort((x, y) => y.points - x.points);
      const winnerId = rows[0] && rows[0].points > 0 ? rows[0].authorId : null;
      rows.forEach((r) => scores.add(r.authorId, r.points + (champion && r.authorId === winnerId ? POINTS.champion * mult : 0)));
      if (champion && rows[0] && winnerId) rows[0].points += POINTS.champion * mult;
      ctx.setHostView({ screen: 'multiResult', round, totalRounds, mult, prompt, rows, winnerId, crowd: members().length });
      for (const r of rows) ctx.setPlayerView(r.authorId, { screen: 'duelOutcome', won: r.authorId === winnerId, points: r.points, sweep: false, text: r.text, total: scores.get(r.authorId) });
      members().filter((m) => !rows.some((r) => r.authorId === m.id)).forEach((m) => ctx.setPlayerView(m.id, { screen: 'lookAtTv' }));
      void isLast;
      ctx.after(Math.min(12, 6 + rows.length * 0.6) + votersSeconds(rows.reduce((n, r) => n + r.voters.length, 0)), showScores);
    }

    /* ---------- Turnier für große Gruppen ---------- */

    function tournament(entries: Answer[], stage = 1) {
      if (entries.length <= 6) return finalVote(entries, true, true);
      const groups = splitEvenly(entries, 6);
      const prompt = promptsById.get(entries[0].promptId)?.prompt ?? '';
      // Jeder Wähler bekommt eine Gruppe ohne eigene Antwort
      const allVoters = shuffle(members().map((m) => m.id));
      const groupOf = new Map<string, number>();
      allVoters.forEach((id, k) => {
        let g = k % groups.length;
        for (let tries = 0; tries < groups.length && groups[g].some((e) => e.authorId === id); tries++) g = (g + 1) % groups.length;
        groupOf.set(id, g);
      });
      const optionId = (g: number, k: number) => `${g}-${k}`;
      const allOptions = groups.flatMap((grp, g) => grp.map((_, k) => optionId(g, k)));
      const t = collectVotes(allOptions, allVoters, T.heat, () => {
        const res = tally(allOptions);
        const winners: Answer[] = [];
        const shown: { text: string; authorId: string; votes: number }[] = [];
        groups.forEach((grp, g) => {
          const scored = grp.map((e, k) => {
            const r = res.get(optionId(g, k))!;
            const pts = Math.round((r.players.length * POINTS.vote + r.audience.length * POINTS.audience) * mult / 2);
            scores.add(e.authorId, pts);
            return { e, votes: r.players.length + r.audience.length };
          });
          const best = Math.max(...scored.map((s) => s.votes));
          const top = scored.filter((s) => s.votes === best);
          const w = pick(top).e;
          winners.push(w);
          shown.push({ text: w.text!, authorId: w.authorId, votes: best });
        });
        ctx.setHostView({ screen: 'heatResult', round, totalRounds, mult, prompt, stage, winners: shown, groups: groups.length });
        ctx.setAllPlayerViews((p) => ({ screen: winners.some((w) => w.authorId === p.id) ? 'advanced' : 'lookAtTv' }));
        ctx.setAudienceView({ screen: 'lookAtTv' });
        ctx.after(7, () => tournament(winners, stage + 1));
      });
      ctx.setHostView({ screen: 'heat', round, totalRounds, mult, prompt, stage, groups: groups.length, entries: entries.length, deadline: t.deadline, duration: t.duration, voted: 0, voters: allVoters.length });
      lastHostVote = { screen: 'heat', round, totalRounds, mult, prompt, stage, groups: groups.length, entries: entries.length, deadline: t.deadline, duration: t.duration };
      for (const id of allVoters) {
        const g = groupOf.get(id)!;
        const opts = groups[g].map((e, k) => ({ id: optionId(g, k), text: e.text!, own: e.authorId === id })).filter((o) => !o.own);
        sendVoteView(id, { screen: 'vote', input: true, prompt, options: opts.map(({ id: oid, text }) => ({ id: oid, text })), deadline: t.deadline, duration: t.duration, showAt: t.showAt }, opts.map((o) => o.id));
      }
    }

    /* ---------- Punkte ---------- */

    function showScores() {
      const last = round >= totalRounds;
      ctx.setHostView({ screen: last ? 'final' : 'scores', round, totalRounds, before: roundStart, after: scores.snapshot(), ranking: scores.ranking() });
      const ranking = scores.ranking();
      ctx.setAllPlayerViews((p) => ({ screen: last ? 'finalMe' : 'scoresMe', score: scores.get(p.id), place: ranking.findIndex((r) => r.playerId === p.id) + 1, of: ranking.length }));
      ctx.setAudienceView({ screen: 'lookAtTv' });
      if (last) ctx.finish(ranking);
      else ctx.after(9, startRound);
    }

    return {
      start: intro,
      onAction(id, action) {
        if (!action || typeof action !== 'object') return;
        if (action.type === 'answer') onAnswer(id, String(action.promptId), action.text);
        else if (action.type === 'answerDraft') {
          const pid = String(action.promptId);
          if (assigned.get(id)?.includes(pid) && !answers.some((a) => a.authorId === id && a.promptId === pid)) drafts.set(`${id}|${pid}`, String(action.text ?? '').slice(0, 200));
        }
        else if (action.type === 'vote') onVote(id, action.choice);
      },
      onAudienceJoin(id) {
        ctx.setPlayerView(id, { screen: 'audienceWait' });
      },
      bot(id, view) {
        if (view.screen === 'answer') return { type: 'answer', promptId: view.promptId, text: pick(BOT_ANSWERS[ctx.lang] ?? BOT_ANSWERS.en) };
        if (view.screen === 'vote' && !view.selected && view.options?.length) return { type: 'vote', choice: pick(view.options as { id: string }[]).id };
        void id;
        return null;
      },
    };
  },
} satisfies GameServerModule;

