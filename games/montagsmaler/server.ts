/**
 * Montagsmaler – eine Person malt live, alle anderen raten per Handy.
 * Standard: jeder gegen jeden. Option: zwei Teams mit Klau-Versuch.
 *
 * Live-Zeichnung: Das malende Handy schickt Striche (auch halb fertige). Fertige Striche stehen in den
 * Views, der gerade entstehende Strich geht per ctx.stream an TV und alle Handys.
 */

import { Scores, levenshtein, normalizeAnswer, pick, type ContentItem, type GameContext, type GameServerModule } from '@up/sdk';

interface Word extends ContentItem {
  id: string;
  word: string;
  /** 1 leicht, 2 mittel, 3 schwer */
  level?: number;
  /** weitere Schreibweisen, die als richtig zählen */
  alt?: string[];
}

interface Stroke {
  c: number;
  w: number;
  p: number[];
}

type Phase = 'intro' | 'pick' | 'draw' | 'steal' | 'reveal' | 'scores' | 'gallery' | 'final';

const COLOR_COUNT = 13;
const WIDTH_COUNT = 3;
const MAX_STROKES = 500;
const MAX_POINTS = 40000;
const LEVEL_POINTS: Record<number, number> = { 1: 600, 2: 800, 3: 1000 };
const FIRST_BONUS = 100;
const T = { intro: 8, pick: 12, steal: 15, reveal: 7, scores: 7, gallery: 12 };
const FEED_MAX = 8;
const SCORES_EVERY = 3;
const TEAM_COLORS = ['#FF9F43', '#36D6F5'];

const round10 = (n: number) => Math.round(n / 10) * 10;

/** Schreibweisen vergleichen: „Bär“ = „Baer“ = „Bar“ */
function forms(s: string): string[] {
  const a = normalizeAnswer(s);
  const b = normalizeAnswer(s.replace(/[äÄ]/g, 'a').replace(/[öÖ]/g, 'o').replace(/[üÜ]/g, 'u'));
  return a === b ? [a] : [a, b];
}

function validStroke(raw: any): Stroke | null {
  if (!raw || !Array.isArray(raw.p) || raw.p.length < 2 || raw.p.length > 1200) return null;
  const p = raw.p.slice(0, raw.p.length - (raw.p.length % 2)).map((n: unknown) => Math.max(0, Math.min(1000, Number(n) | 0)));
  return { c: Math.max(0, Math.min(COLOR_COUNT - 1, Number(raw.c) | 0)), w: Math.max(0, Math.min(WIDTH_COUNT - 1, Number(raw.w) | 0)), p };
}

export default {
  create(ctx: GameContext) {
    const teamMode = ctx.options.mode === 'team' && ctx.players.length >= 4;
    const drawTime = Number(ctx.options.drawTime) || 80;
    const roundsOpt = Number(ctx.options.rounds) || 0;

    // Mitspieler: alle vom Start + alle, die später dazukommen (machen voll mit)
    const members: string[] = ctx.players.map((p) => p.id);
    const scores = new Scores(members);
    const drawCount = new Map<string, number>(members.map((id) => [id, 0]));
    const team = new Map<string, number>();
    members.forEach((id, i) => team.set(id, i % 2));
    const teamScore = [0, 0];

    const allWords = ctx.content<Word>();
    const byLevel = (lvl: number) => allWords.filter((w) => (w.level ?? 2) === lvl);
    const usedWords = new Set<string>();

    let phase: Phase = 'intro';
    let round = 0;
    let totalRounds = 0;
    let drawer = '';
    let lastDrawer = '';
    let drawingTeam = 0;
    let choices: Word[] = [];
    let word: Word | null = null;
    let wordForms: string[] = [];
    let strokes: Stroke[] = [];
    let live: Stroke | null = null;
    let revealed: number[] = [];
    let timer: { cancel(): void; deadline: number; duration: number } | null = null;
    let hintTimers: { cancel(): void }[] = [];
    let drawStart = 0;
    /** Wer hat's erraten (Reihenfolge), mit Zeit und Punkten */
    let solved: { id: string; ms: number; points: number }[] = [];
    let stolenBy: number | null = null;
    let teamWon = false;
    let reporters = new Set<string>();
    /** Eigene Tipps pro Spieler (für den „ganz knapp“-Hinweis) */
    let myGuesses = new Map<string, { text: string; close: boolean }[]>();
    let feed: { n: number; id: string; text: string }[] = [];
    let feedN = 0;
    let toast: { n: number; id: string } | null = null;
    let lastGuessAt = new Map<string, number>();
    let roundStartScores = scores.snapshot();
    let lastScoresRound = 0;
    let endPending = false;
    const gallery: { word: string; strokes: Stroke[]; drawerId: string; firstId: string | null; firstMs: number | null; stolen: number | null; cheated: boolean }[] = [];

    const info = (id: string) => ctx.player(id);
    const connected = (id: string) => !!info(id)?.connected;
    const teamOf = (id: string) => team.get(id) ?? 0;
    const teamMembers = (t: number) => members.filter((id) => teamOf(id) === t);

    function autoRounds() {
      const n = members.length;
      if (roundsOpt) return roundsOpt;
      if (teamMode) return Math.min(10, n + (n % 2));
      return Math.max(2, Math.min(10, n));
    }

    /** Wer darf in dieser Phase raten? */
    function guessers(): string[] {
      if (phase === 'steal') return teamMembers(1 - drawingTeam);
      if (phase !== 'draw') return [];
      if (teamMode) return teamMembers(drawingTeam).filter((id) => id !== drawer);
      return members.filter((id) => id !== drawer);
    }
    const hasSolved = (id: string) => solved.some((s) => s.id === id);
    const canGuess = (id: string) => guessers().includes(id) && !hasSolved(id) && !(teamMode && (teamWon || stolenBy != null));

    /* ---------------- Wörter ---------------- */

    function takeWord(lvl: number): Word {
      const fresh = (list: Word[]) => list.filter((w) => !usedWords.has(w.word));
      let list = fresh(byLevel(lvl));
      if (!list.length) list = fresh(allWords);
      if (!list.length) {
        usedWords.clear();
        list = byLevel(lvl).length ? byLevel(lvl) : allWords;
      }
      const w = list[0] ?? { id: 'x', word: '?' };
      usedWords.add(w.word);
      return w;
    }

    function slots(full: boolean): string[] {
      if (!word) return [];
      const chars = [...word.word];
      return chars.map((ch, i) => (/[\p{L}\p{N}]/u.test(ch) ? (full || revealed.includes(i) ? ch.toUpperCase() : '') : ch === ' ' ? ' ' : ch));
    }

    function revealLetter() {
      if (!word) return;
      const chars = [...word.word];
      const hidden = chars.map((ch, i) => i).filter((i) => /[\p{L}\p{N}]/u.test(chars[i]) && !revealed.includes(i));
      if (hidden.length <= 2) return;
      revealed.push(pick(hidden));
      broadcast();
    }

    /* ---------------- Ablauf ---------------- */

    function intro() {
      phase = 'intro';
      totalRounds = autoRounds();
      broadcast();
      ctx.after(T.intro, nextRound);
    }

    function chooseDrawer(): string | null {
      const pool = (teamMode ? teamMembers(drawingTeam) : members).filter(connected);
      if (!pool.length) return null;
      const sorted = [...pool].sort((a, b) => (drawCount.get(a)! - drawCount.get(b)!) || members.indexOf(a) - members.indexOf(b));
      const notLast = sorted.filter((id) => id !== lastDrawer);
      return (notLast[0] ?? sorted[0]) || null;
    }

    function nextRound() {
      if (!roundsOpt) totalRounds = Math.max(totalRounds, Math.min(autoRounds(), 10));
      if (round >= totalRounds) return showGallery();
      if (round > 0 && round - lastScoresRound >= SCORES_EVERY && round < totalRounds) {
        lastScoresRound = round;
        return showScores(false);
      }
      round++;
      drawingTeam = teamMode ? (round - 1) % 2 : 0;
      const d = chooseDrawer();
      if (!d) return showGallery();
      drawer = d;
      lastDrawer = d;
      drawCount.set(d, (drawCount.get(d) ?? 0) + 1);
      // Rundenzustand zurücksetzen
      word = null;
      strokes = [];
      live = null;
      revealed = [];
      solved = [];
      stolenBy = null;
      teamWon = false;
      reporters = new Set();
      myGuesses = new Map();
      feed = [];
      toast = null;
      endPending = false;
      choices = [takeWord(1), takeWord(2), takeWord(3)];
      phase = 'pick';
      timer = ctx.timer(T.pick, () => startDraw(pick(choices)));
      broadcast();
      ctx.stream({ r: round, n: 0, s: null }, { phones: true });
    }

    function startDraw(w: Word) {
      if (phase !== 'pick') return;
      timer?.cancel();
      // nicht gewählte Wörter dürfen später wieder vorkommen
      choices.filter((c) => c !== w).forEach((c) => usedWords.delete(c.word));
      word = w;
      wordForms = [w.word, ...(w.alt ?? [])].flatMap(forms).filter(Boolean);
      phase = 'draw';
      timer = ctx.timer(drawTime, endDraw);
      drawStart = Date.now();
      const letters = [...w.word].filter((ch) => /[\p{L}\p{N}]/u.test(ch)).length;
      hintTimers = [];
      if (letters >= 4) hintTimers.push(ctx.timer(drawTime * 0.5, revealLetter));
      if (letters >= 6) hintTimers.push(ctx.timer(drawTime * 0.75, revealLetter));
      broadcast();
    }

    function endDraw() {
      if (phase !== 'draw') return;
      timer?.cancel();
      hintTimers.forEach((h) => h.cancel());
      live = null;
      if (teamMode && !teamWon && teamMembers(1 - drawingTeam).some(connected)) {
        phase = 'steal';
        timer = ctx.timer(T.steal, endRound);
        broadcast();
        return;
      }
      endRound();
    }

    function cheated() {
      const eligible = members.filter((id) => id !== drawer && connected(id)).length;
      const need = Math.max(1, Math.ceil(eligible / 2));
      return eligible > 0 && reporters.size >= need;
    }

    function endRound() {
      if (phase !== 'draw' && phase !== 'steal') return;
      timer?.cancel();
      hintTimers.forEach((h) => h.cancel());
      const cheat = cheated();
      const max = LEVEL_POINTS[word?.level ?? 2] ?? 800;
      let drawerPoints = 0;
      if (!teamMode) {
        const eligible = members.filter((id) => id !== drawer).length || 1;
        drawerPoints = cheat ? 0 : round10(max * 0.8 * (solved.length / eligible));
        if (drawerPoints) scores.add(drawer, drawerPoints);
      }
      gallery.push({
        word: word?.word ?? '?', strokes, drawerId: drawer, firstId: solved[0]?.id ?? null, firstMs: solved[0]?.ms ?? null,
        stolen: stolenBy, cheated: cheat,
      });
      phase = 'reveal';
      revealView = { drawerPoints, cheat };
      broadcast();
      ctx.stream({ r: round, n: strokes.length, s: null }, { phones: true });
      ctx.after(T.reveal + Math.min(4, solved.length * 0.4), nextRound);
    }
    let revealView = { drawerPoints: 0, cheat: false };

    function maybeEndEarly() {
      if (endPending) return;
      const open = guessers().filter((id) => connected(id) && !hasSolved(id));
      const done = teamMode ? teamWon || stolenBy != null : open.length === 0 && solved.length > 0;
      if (!done) return;
      endPending = true;
      // kurz warten, damit „… hat's!“ zu sehen ist; teamWon überspringt den Klau-Versuch
      ctx.after(1.6, () => (phase === 'draw' ? endDraw() : endRound()));
    }

    function showScores(final: boolean) {
      phase = final ? 'final' : 'scores';
      broadcast();
      roundStartScores = scores.snapshot();
      if (final) ctx.finish(scores.ranking());
      else ctx.after(T.scores, nextRound);
    }

    function showGallery() {
      if (!gallery.length) return showScores(true);
      phase = 'gallery';
      broadcast();
      ctx.after(Math.min(20, T.gallery + gallery.length * 0.5), () => showScores(true));
    }

    /* ---------------- Raten ---------------- */

    function guess(id: string, raw: unknown) {
      if (!canGuess(id) || !word) return;
      const text = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
      if (!text) return;
      const now = Date.now();
      if (now - (lastGuessAt.get(id) ?? 0) < 350) return;
      lastGuessAt.set(id, now);
      const g = forms(text);
      const right = g.some((x) => wordForms.includes(x));
      if (right) {
        const max = LEVEL_POINTS[word.level ?? 2] ?? 800;
        const ms = now - drawStart;
        if (phase === 'steal') {
          stolenBy = 1 - drawingTeam;
          const pts = round10(max * 0.5);
          solved.push({ id, ms, points: pts });
          addTeam(stolenBy, pts);
        } else if (teamMode) {
          teamWon = true;
          const frac = Math.max(0, (timer!.deadline - now) / timer!.duration);
          const pts = reportsBlock() ? 0 : round10(max * (0.4 + 0.6 * frac));
          solved.push({ id, ms, points: pts });
          addTeam(drawingTeam, pts);
        } else {
          const frac = Math.max(0, (timer!.deadline - now) / timer!.duration);
          const pts = round10(max * (0.35 + 0.65 * frac)) + (solved.length === 0 ? FIRST_BONUS : 0);
          solved.push({ id, ms, points: pts });
          scores.add(id, pts);
        }
        toast = { n: ++feedN, id };
        broadcast();
        maybeEndEarly();
        return;
      }
      const close = g.some((x) => wordForms.some((w) => {
        if (x.length < 3) return false;
        const d = levenshtein(x, w);
        if (d <= (w.length <= 5 ? 1 : 2)) return true;
        return Math.abs(x.length - w.length) <= 3 && (x.includes(w) || w.includes(x)) && x.length >= 4;
      }));
      const mine = myGuesses.get(id) ?? [];
      mine.push({ text, close });
      myGuesses.set(id, mine.slice(-6));
      // Knappe Tipps nur dem Ratenden zeigen, sonst verraten sie das Wort
      if (!close) feed = [...feed, { n: ++feedN, id, text }].slice(-FEED_MAX);
      broadcast();
    }

    /** Im Team-Modus: wurde gemeldet, gibt's für das malende Team nichts */
    const reportsBlock = () => cheated();

    function addTeam(t: number, pts: number) {
      if (!pts) return;
      teamScore[t] += pts;
      teamMembers(t).forEach((id) => scores.add(id, pts));
    }

    /* ---------------- Ansichten ---------------- */

    function teamsInfo() {
      if (!teamMode) return null;
      return [0, 1].map((t) => ({ color: TEAM_COLORS[t], score: teamScore[t], members: teamMembers(t) }));
    }

    function common() {
      return { round, totalRounds, team: teamMode, teams: teamsInfo() };
    }

    function hostView(): object {
      switch (phase) {
        case 'intro':
          return { screen: 'intro', ...common() };
        case 'pick':
          return { screen: 'pick', ...common(), drawerId: drawer, drawingTeam };
        case 'draw':
        case 'steal':
          return {
            screen: 'draw', ...common(), phase, drawerId: drawer, drawingTeam, strokes, slots: slots(false), letters: slots(true).length,
            feed, toast, solvedIds: solved.map((s) => s.id), members, scores: scores.snapshot(), reports: reporters.size,
            deadline: timer?.deadline, duration: timer?.duration, stolenBy, teamWon,
          };
        case 'reveal':
          return {
            screen: 'reveal', ...common(), word: word?.word, strokes, drawerId: drawer, drawingTeam,
            solved, missed: (teamMode ? [] : members.filter((id) => id !== drawer && !hasSolved(id))),
            drawerPoints: revealView.drawerPoints, cheat: revealView.cheat, stolenBy, teamWon,
          };
        case 'scores':
          return { screen: 'scores', ...common(), before: roundStartScores, after: scores.snapshot() };
        case 'gallery':
          return { screen: 'gallery', ...common(), pics: gallery };
        case 'final':
          return { screen: 'final', ...common(), ranking: scores.ranking() };
      }
    }

    function phoneView(id: string): object {
      const base = { ...common(), myTeam: teamMode ? teamOf(id) : null };
      switch (phase) {
        case 'intro':
          return { screen: 'intro', ...base };
        case 'pick':
          if (id === drawer) {
            return {
              screen: 'pick', ...base, input: true, deadline: timer?.deadline, duration: timer?.duration,
              words: choices.map((w, i) => ({ i, word: w.word, level: w.level ?? 2, points: LEVEL_POINTS[w.level ?? 2] })),
            };
          }
          return { screen: 'waitPick', ...base, drawerId: drawer };
        case 'draw':
        case 'steal': {
          const timing = { deadline: timer?.deadline, duration: timer?.duration };
          const shared = { ...base, ...timing, phase, round, strokes, drawerId: drawer, drawingTeam, stolenBy, teamWon };
          if (id === drawer) {
            return { screen: 'draw', ...shared, input: phase === 'draw', word: word?.word, solved: solved.length, total: guessers().length || members.length - 1 };
          }
          if (hasSolved(id) || (teamMode && (teamWon || stolenBy != null))) {
            const mine = solved.find((s) => s.id === id);
            return { screen: 'solved', ...shared, word: word?.word, points: mine?.points ?? 0, place: mine ? solved.indexOf(mine) + 1 : 0, feed, byTeam: teamMode && !mine };
          }
          const report = { reported: reporters.has(id), canReport: id !== drawer && phase === 'draw' };
          if (canGuess(id)) {
            return { screen: 'guess', ...shared, ...report, input: true, slots: slots(false), guesses: myGuesses.get(id) ?? [], steal: phase === 'steal' };
          }
          return { screen: 'watch', ...shared, ...report, slots: slots(false) };
        }
        case 'reveal': {
          const mine = solved.find((s) => s.id === id);
          let points = mine?.points ?? 0;
          if (id === drawer && !teamMode) points = revealView.drawerPoints;
          if (teamMode) points = stolenBy != null ? (teamOf(id) === stolenBy ? solved[0]?.points ?? 0 : 0) : teamWon && teamOf(id) === drawingTeam ? solved[0]?.points ?? 0 : 0;
          return { screen: 'roundResult', ...base, word: word?.word, isDrawer: id === drawer, found: !!mine, points, solvedCount: solved.length, cheat: revealView.cheat };
        }
        case 'scores':
        case 'gallery':
        case 'final': {
          const ranking = scores.ranking();
          return { screen: phase === 'final' ? 'finalMe' : 'scoresMe', ...base, score: scores.get(id), place: ranking.findIndex((r) => r.playerId === id) + 1, of: ranking.length };
        }
      }
    }

    function broadcast() {
      ctx.setHostView(hostView());
      for (const id of members) ctx.setPlayerView(id, phoneView(id));
    }

    /* ---------------- Live-Zeichnung ---------------- */

    function pushLive() {
      ctx.stream({ r: round, n: strokes.length, s: live }, { phones: true });
    }

    function totalPoints() {
      return strokes.reduce((n, s) => n + s.p.length, 0);
    }

    function onDraw(action: any) {
      if (phase !== 'draw') return;
      if (action.type === 'stroke') {
        const s = validStroke(action.s);
        if (!s || Number(action.i) !== strokes.length) return;
        if (action.done) {
          if (strokes.length >= MAX_STROKES || totalPoints() + s.p.length > MAX_POINTS) return;
          strokes = [...strokes, s];
          live = null;
          broadcast();
        } else {
          live = s;
          pushLive();
        }
      } else if (action.type === 'undo') {
        strokes = strokes.slice(0, -1);
        live = null;
        broadcast();
        pushLive();
      } else if (action.type === 'clear') {
        strokes = [];
        live = null;
        broadcast();
        pushLive();
      }
    }

    function addMember(id: string) {
      if (members.includes(id)) return;
      members.push(id);
      scores.add(id, 0);
      drawCount.set(id, 0);
      const sizes = [0, 1].map((t) => teamMembers(t).length);
      team.set(id, sizes[0] <= sizes[1] ? 0 : 1);
      if (!roundsOpt && round < totalRounds + 1) totalRounds = Math.max(totalRounds, autoRounds());
      broadcast();
    }

    return {
      start: intro,
      onAction(id, action) {
        if (!action || typeof action !== 'object' || !members.includes(id)) return;
        if (id === drawer) {
          if (action.type === 'pick' && phase === 'pick') {
            const w = choices[Number(action.i)];
            if (w) startDraw(w);
            return;
          }
          return onDraw(action);
        }
        if (action.type === 'guess') return guess(id, action.text);
        if (action.type === 'report' && phase === 'draw') {
          if (action.on === false) reporters.delete(id);
          else reporters.add(id);
          broadcast();
        }
      },
      onAudienceJoin: addMember,
      onPlayerRejoin() {
        broadcast();
      },
      bot(_id, view) {
        if (view.screen === 'pick') return { type: 'pick', i: Math.floor(Math.random() * 3) };
        if (view.screen === 'draw' && view.input && view.strokes.length < 6) {
          const p: number[] = [];
          let x = 200 + Math.random() * 600, y = 200 + Math.random() * 600;
          for (let i = 0; i < 10; i++) {
            x = Math.max(20, Math.min(980, x + (Math.random() - 0.5) * 200));
            y = Math.max(20, Math.min(980, y + (Math.random() - 0.5) * 200));
            p.push(Math.round(x), Math.round(y));
          }
          return { type: 'stroke', i: view.strokes.length, done: true, s: { c: Math.floor(Math.random() * 9), w: Math.floor(Math.random() * 3), p } };
        }
        if (view.screen === 'guess' && Math.random() < 0.35) {
          // je länger gemalt wird, desto eher kommt der Bot drauf
          const frac = timer ? 1 - Math.max(0, (timer.deadline - Date.now()) / timer.duration) : 0;
          if (word && Math.random() < 0.03 + 0.12 * frac) return { type: 'guess', text: word.word };
          return { type: 'guess', text: pick(allWords).word };
        }
        return null;
      },
    };
  },
} satisfies GameServerModule;

