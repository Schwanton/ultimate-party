/**
 * Kritzelei – geheime Begriffe zeichnen, falsche Titel erfinden, den echten finden.
 * Nutzt den SDK-Baustein DeceptionRound.
 */

import { DeceptionRound, INPUT_GRACE, Scores, pick, shuffle, type GameContext, type GameServerModule } from '@up/sdk';

interface Word {
  id: string;
  word: string;
}

interface Stroke {
  c: number;
  w: number;
  p: number[];
}

const COLOR_COUNT = 13;
const LAST_CHANCE = 5;
const T = { draw: 75, title: 40, choose: 22 };
const POINTS = { truth: 1000, fool: 500, artist: 500, audienceFool: 100 };
const REVEAL_STEP = 3.2;

function validStrokes(raw: unknown): Stroke[] | null {
  if (!Array.isArray(raw) || raw.length > 400) return null;
  let total = 0;
  const out: Stroke[] = [];
  for (const s of raw) {
    if (!s || !Array.isArray(s.p) || s.p.length < 2 || s.p.length > 1200) continue;
    total += s.p.length;
    if (total > 30000) break;
    out.push({ c: Math.max(0, Math.min(COLOR_COUNT - 1, Number(s.c) | 0)), w: s.w ? 1 : 0, p: s.p.map((n: unknown) => Math.max(0, Math.min(1000, Number(n) | 0))) });
  }
  return out;
}

export default {
  create(ctx: GameContext) {
    const ids = ctx.players.map((p) => p.id);
    const scores = new Scores(ids);
    const totalRounds = Number(ctx.options.rounds) || (ids.length <= 5 ? 2 : 1);
    const drawTime = Number(ctx.options.drawTime) || T.draw;
    const words = ctx.content<Word>();
    let wordIndex = 0;
    let round = 0;
    let secret = new Map<string, string>();
    let drawings = new Map<string, Stroke[]>();
    let order: string[] = [];
    let current = -1;
    let deception: DeceptionRound;
    let phase: 'draw' | 'title' | 'choose' | 'reveal' = 'draw';
    let timer: { cancel(): void; deadline: number; duration: number } | null = null;
    let roundStart = scores.snapshot();

    const isPlayer = (id: string) => ids.includes(id);
    const artist = () => order[current];
    const guessers = () => ids.filter((id) => id !== artist());
    const choosers = () => [...guessers(), ...ctx.audience().map((a) => a.id)];
    const houseWords = () => shuffle(words.map((w) => w.word)).slice(0, 8);

    function intro() {
      ctx.setHostView({ screen: 'intro' });
      ctx.setAllPlayerViews(() => ({ screen: 'intro' }));
      ctx.after(7, startRound);
    }

    function startRound() {
      round++;
      secret = new Map();
      drawings = new Map();
      ids.forEach((id) => secret.set(id, words[wordIndex++ % words.length]?.word ?? '?'));
      phase = 'draw';
      timer = ctx.timer(drawTime, endDrawing, { grace: INPUT_GRACE });
      hostDraw();
      ids.forEach((id) => ctx.setPlayerView(id, { screen: 'draw', input: true, word: secret.get(id), deadline: timer!.deadline, duration: timer!.duration }));
      ctx.setAudienceView({ screen: 'audienceWait' });
    }

    const submitted = new Set<string>();
    function hostDraw() {
      ctx.setHostView({ screen: 'draw', round, totalRounds, players: ids, done: [...submitted], deadline: timer!.deadline, duration: timer!.duration });
    }

    function endDrawing() {
      timer?.cancel();
      submitted.clear();
      order = shuffle(ids.filter((id) => (drawings.get(id)?.length ?? 0) > 0));
      current = -1;
      nextDrawing();
    }

    function nextDrawing() {
      current++;
      if (current >= order.length) return showScores();
      const a = artist();
      deception = new DeceptionRound(secret.get(a)!, [], houseWords(), 40);
      phase = 'title';
      titleDrafts = new Map();
      timer = ctx.timer(T.title, startChoose, { grace: INPUT_GRACE });
      hostTitle();
      for (const id of ids) {
        if (id === a) ctx.setPlayerView(id, { screen: 'yours', strokes: drawings.get(a) });
        else titleView(id);
      }
      ctx.setAudienceView({ screen: 'audienceWait' });
    }

    function base() {
      return { round, totalRounds, n: current + 1, total: order.length, artistId: artist(), strokes: drawings.get(artist()) };
    }

    function hostTitle() {
      ctx.setHostView({ screen: 'title', ...base(), players: guessers(), done: guessers().filter((g) => deception.hasLie(g)), deadline: timer!.deadline, duration: timer!.duration });
    }

    function titleView(id: string, error?: string) {
      if (deception.hasLie(id)) ctx.setPlayerView(id, { screen: 'titled', title: deception.lieOf(id), strokes: drawings.get(artist()) });
      else ctx.setPlayerView(id, { screen: 'title', input: true, strokes: drawings.get(artist()), error: error ?? null, attempt: Math.random(), deadline: timer!.deadline, duration: timer!.duration });
    }

    /** nicht abgeschickte Titel – zählen bei Zeitablauf */
    let titleDrafts = new Map<string, string>();

    function startChoose() {
      timer?.cancel();
      for (const [id, text] of titleDrafts) if (!deception.hasLie(id) && text.trim()) deception.submitLie(id, text);
      phase = 'choose';
      deception.buildOptions(Math.min(6, Math.max(4, deception.lieCount + 2)));
      timer = ctx.timer(T.choose, startReveal);
      hostChoose();
      choosers().forEach(chooseView);
      ctx.setPlayerView(artist(), { screen: 'yours', strokes: drawings.get(artist()) });
    }

    function hostChoose() {
      ctx.setHostView({ screen: 'choose', ...base(), options: deception.options.map(({ id, text }) => ({ id, text })), picked: deception.pickCount, choosers: choosers().length, deadline: timer!.deadline, duration: timer!.duration });
    }

    function chooseView(id: string) {
      ctx.setPlayerView(id, { screen: 'choose', input: !deception.pickOf(id), options: deception.optionsFor(id), selected: deception.pickOf(id) ?? null, strokes: drawings.get(artist()), deadline: timer!.deadline, duration: timer!.duration });
    }

    /** Alle haben gewählt: Zeit auf wenige Sekunden verkürzen, damit man sich noch umentscheiden kann. */
    function hurryChoose() {
      const left = (timer?.deadline ?? 0) - Date.now();
      if (!timer || left <= LAST_CHANCE * 1000 * 1.2) return;
      timer.cancel();
      timer = ctx.timer(LAST_CHANCE, startReveal);
      hostChoose();
      choosers().forEach(chooseView);
    }

    function startReveal() {
      timer?.cancel();
      phase = 'reveal';
      const a = artist();
      const items = deception.reveal();
      const gained = new Map<string, number>();
      const add = (id: string, pts: number) => {
        if (!isPlayer(id) || pts <= 0) return;
        scores.add(id, pts);
        gained.set(id, (gained.get(id) ?? 0) + pts);
      };
      let finders = 0;
      const shown = items.map((it) => {
        let points = 0;
        if (it.kind === 'truth') {
          const playerFinders = it.pickers.filter(isPlayer);
          finders = playerFinders.length;
          playerFinders.forEach((p) => add(p, POINTS.truth));
          add(a, finders * POINTS.artist);
          points = POINTS.truth;
        } else if (it.kind === 'lie') {
          const fooled = it.pickers.filter(isPlayer).length;
          points = Math.round((fooled * POINTS.fool + (it.pickers.length - fooled) * POINTS.audienceFool) / it.authors.length);
          it.authors.forEach((au) => add(au, points));
        }
        return { ...it, points };
      });
      ctx.setHostView({ screen: 'reveal', ...base(), items: shown, artistPoints: finders * POINTS.artist, step: REVEAL_STEP });
      for (const id of [...ids, ...ctx.audience().map((x) => x.id)]) {
        const picked = items.find((i) => i.id === deception.pickOf(id));
        const mine = shown.find((s) => s.authors.includes(id));
        ctx.setPlayerView(id, {
          screen: 'result', isArtist: id === a, finders, found: picked?.kind === 'truth', picked: picked?.text ?? null,
          fooled: mine ? mine.pickers.length : 0, points: gained.get(id) ?? 0, revealAt: (items.length - 1) * REVEAL_STEP,
        });
      }
      ctx.after(items.length * REVEAL_STEP + 4, nextDrawing);
    }

    function showScores() {
      const final = round >= totalRounds;
      const ranking = scores.ranking();
      ctx.setHostView({ screen: final ? 'final' : 'scores', before: roundStart, after: scores.snapshot(), ranking });
      roundStart = scores.snapshot();
      ctx.setAllPlayerViews((p) => ({ screen: final ? 'finalMe' : 'scoresMe', score: scores.get(p.id), place: ranking.findIndex((r) => r.playerId === p.id) + 1, of: ranking.length }));
      ctx.setAudienceView({ screen: 'lookAtTv' });
      if (final) ctx.finish(ranking);
      else ctx.after(8, startRound);
    }

    return {
      start: intro,
      onAction(id, action) {
        if (!action || typeof action !== 'object') return;
        if ((action.type === 'drawing' || action.type === 'sketch') && phase === 'draw' && isPlayer(id) && !submitted.has(id)) {
          const strokes = validStrokes(action.strokes);
          if (!strokes) return;
          drawings.set(id, strokes);
          if (action.type === 'drawing' && strokes.length) {
            submitted.add(id);
            ctx.setPlayerView(id, { screen: 'drawn', strokes });
            hostDraw();
            if (ids.every((p) => submitted.has(p) || !ctx.player(p)?.connected)) endDrawing();
          }
        } else if (action.type === 'title' && phase === 'title' && isPlayer(id) && id !== artist() && !deception.hasLie(id)) {
          const res = deception.submitLie(id, action.text);
          if (res !== 'ok') return titleView(id, res);
          titleView(id);
          hostTitle();
          if (guessers().every((p) => deception.hasLie(p) || !ctx.player(p)?.connected)) startChoose();
        } else if (action.type === 'titleDraft' && phase === 'title' && isPlayer(id) && id !== artist() && !deception.hasLie(id)) {
          titleDrafts.set(id, String(action.text ?? '').slice(0, 200));
        } else if (action.type === 'pick' && phase === 'choose') {
          if (!deception.pick(id, action.option)) return;
          chooseView(id);
          hostChoose();
          if (choosers().every((p) => deception.pickOf(p) || !ctx.player(p)?.connected)) hurryChoose();
        }
      },
      onAudienceJoin(id) {
        if (phase === 'choose') chooseView(id);
        else ctx.setPlayerView(id, { screen: 'audienceWait' });
      },
      bot(_id, view) {
        if (view.screen === 'draw') {
          const strokes = Array.from({ length: 3 + Math.floor(Math.random() * 4) }, () => {
            const p: number[] = [];
            let x = 200 + Math.random() * 600, y = 200 + Math.random() * 600;
            for (let i = 0; i < 12; i++) {
              x = Math.max(20, Math.min(980, x + (Math.random() - 0.5) * 160));
              y = Math.max(20, Math.min(980, y + (Math.random() - 0.5) * 160));
              p.push(Math.round(x), Math.round(y));
            }
            return { c: Math.floor(Math.random() * 11), w: Math.random() < 0.3 ? 1 : 0, p };
          });
          return { type: 'drawing', strokes };
        }
        if (view.screen === 'title') return { type: 'title', text: pick(words).word + (view.error ? ` ${Math.floor(Math.random() * 99)}` : '') };
        if (view.screen === 'choose' && !view.selected) return { type: 'pick', option: pick(view.options as { id: string }[]).id };
        return null;
      },
    };
  },
} satisfies GameServerModule;
