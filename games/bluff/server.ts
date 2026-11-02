/**
 * Bluff – Lügen zu wahren, kuriosen Fakten erfinden und die Wahrheit finden.
 * Nutzt den SDK-Baustein DeceptionRound.
 */

import { DeceptionRound, Scores, pick, type GameContext, type GameServerModule } from '@up/sdk';

interface Fact {
  id: string;
  question: string;
  answer: string;
  alternatives?: string[];
  decoys?: string[];
  source?: string;
}

const LAST_CHANCE = 5;
const T = { write: 45, choose: 22 };
const POINTS = { truth: 1000, fool: 500, audienceFool: 100 };
const REVEAL_STEP = 3.2;

export default {
  create(ctx: GameContext) {
    const ids = ctx.players.map((p) => p.id);
    const scores = new Scores(ids);
    const count = Number(ctx.options.questions) || 6;
    const facts = ctx.content<Fact>().slice(0, count);
    const half = Math.ceil(facts.length / 2);
    const wf = Number(ctx.options.writeTime) || 1;
    let q = -1;
    let round: DeceptionRound;
    let fact: Fact;
    let timer: { cancel(): void; deadline: number; duration: number } | null = null;
    let phase: 'write' | 'choose' | 'reveal' = 'write';
    let roundStart: Record<string, number> = {};
    let lastScoresAt = 0;

    const isPlayer = (id: string) => ids.includes(id);
    const choosers = () => [...ids, ...ctx.audience().map((a) => a.id)];
    // Erste Hälfte ×1, danach ×2, letzte Frage ×3
    const mult = () => (q === facts.length - 1 && facts.length > 2 ? 3 : q >= half ? 2 : 1);

    function hostBase() {
      return { n: q + 1, total: facts.length, mult: mult(), question: fact.question };
    }

    function intro() {
      ctx.setHostView({ screen: 'intro' });
      ctx.setAllPlayerViews(() => ({ screen: 'intro' }));
      ctx.after(6, next);
    }

    function next() {
      q++;
      if (q >= facts.length) return showScores(true);
      if (q === half && facts.length > 3 && lastScoresAt < half) return showScores(false);
      fact = facts[q];
      round = new DeceptionRound(fact.answer, fact.alternatives ?? [], fact.decoys ?? [], 40);
      phase = 'write';
      timer = ctx.timer(T.write * wf, startChoose);
      hostWrite();
      ids.forEach((id) => writeView(id));
      ctx.setAudienceView({ screen: 'audienceWait' });
    }

    function hostWrite() {
      ctx.setHostView({ screen: 'write', ...hostBase(), done: ids.filter((id) => round.hasLie(id)), players: ids, deadline: timer!.deadline, duration: timer!.duration });
    }

    function writeView(id: string, error?: string) {
      if (round.hasLie(id)) ctx.setPlayerView(id, { screen: 'written', lie: round.lieOf(id) });
      else ctx.setPlayerView(id, { screen: 'write', input: true, question: fact.question, error: error ?? null, attempt: Math.random(), deadline: timer!.deadline, duration: timer!.duration });
    }

    function startChoose() {
      timer?.cancel();
      phase = 'choose';
      const minOptions = Math.min(6, Math.max(4, round.lieCount + 2));
      round.buildOptions(minOptions);
      timer = ctx.timer(T.choose, startReveal);
      hostChoose();
      for (const id of choosers()) chooseView(id);
    }

    function hostChoose() {
      ctx.setHostView({ screen: 'choose', ...hostBase(), options: round.options.map(({ id, text }) => ({ id, text })), picked: round.pickCount, choosers: choosers().length, deadline: timer!.deadline, duration: timer!.duration });
    }

    function chooseView(id: string) {
      ctx.setPlayerView(id, { screen: 'choose', input: !round.pickOf(id), question: fact.question, options: round.optionsFor(id), selected: round.pickOf(id) ?? null, deadline: timer!.deadline, duration: timer!.duration });
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
      const items = round.reveal();
      const m = mult();
      const gained = new Map<string, number>();
      const add = (id: string, pts: number) => {
        if (!isPlayer(id)) return;
        scores.add(id, pts);
        gained.set(id, (gained.get(id) ?? 0) + pts);
      };
      const shown = items.map((it) => {
        let points = 0;
        if (it.kind === 'truth') it.pickers.forEach((p) => add(p, POINTS.truth * m));
        if (it.kind === 'lie') {
          const fooled = it.pickers.filter(isPlayer).length;
          const aud = it.pickers.length - fooled;
          points = Math.round((fooled * POINTS.fool * m + aud * POINTS.audienceFool * m) / it.authors.length);
          it.authors.forEach((a) => add(a, points));
        }
        return { ...it, points: it.kind === 'truth' ? POINTS.truth * m : points };
      });
      ctx.setHostView({ screen: 'reveal', ...hostBase(), items: shown, source: fact.source ?? null, step: REVEAL_STEP });
      for (const id of choosers()) {
        const pickId = round.pickOf(id);
        const picked = items.find((i) => i.id === pickId);
        const myLie = items.find((i) => i.authors.includes(id));
        const fooledCount = shown.find((s) => s.authors.includes(id))?.pickers.length ?? 0;
        ctx.setPlayerView(id, {
          screen: 'result', found: picked?.kind === 'truth', picked: picked?.text ?? null, truth: fact.answer,
          fooled: myLie ? fooledCount : 0, points: gained.get(id) ?? 0, revealAt: (items.length - 1) * REVEAL_STEP,
        });
      }
      ctx.after(items.length * REVEAL_STEP + 4, next);
    }

    function showScores(final: boolean) {
      lastScoresAt = q;
      const ranking = scores.ranking();
      ctx.setHostView({ screen: final ? 'final' : 'scores', before: roundStart, after: scores.snapshot(), ranking });
      roundStart = scores.snapshot();
      ctx.setAllPlayerViews((p) => ({ screen: final ? 'finalMe' : 'scoresMe', score: scores.get(p.id), place: ranking.findIndex((r) => r.playerId === p.id) + 1, of: ranking.length }));
      ctx.setAudienceView({ screen: 'lookAtTv' });
      if (final) ctx.finish(ranking);
      else ctx.after(8, () => {
        q--;
        next();
      });
    }

    return {
      start() {
        roundStart = scores.snapshot();
        intro();
      },
      onAction(id, action) {
        if (!action || typeof action !== 'object') return;
        if (action.type === 'lie' && phase === 'write' && isPlayer(id) && !round.hasLie(id)) {
          const res = round.submitLie(id, action.text);
          if (res !== 'ok') return writeView(id, res);
          writeView(id);
          hostWrite();
          if (ids.every((p) => round.hasLie(p) || !ctx.player(p)?.connected)) startChoose();
        } else if (action.type === 'pick' && phase === 'choose') {
          if (!round.pick(id, action.option)) return;
          chooseView(id);
          hostChoose();
          if (choosers().every((p) => round.pickOf(p) || !ctx.player(p)?.connected)) hurryChoose();
        }
      },
      onAudienceJoin(id) {
        if (phase === 'choose') chooseView(id);
        else ctx.setPlayerView(id, { screen: 'audienceWait' });
      },
      bot(_id, view) {
        if (view.screen === 'write') {
          const pool = [...(fact.decoys ?? []), 'Nein', '42', ctx.lang === 'de' ? 'Ein Kühlschrank' : 'A fridge'];
          return { type: 'lie', text: `${pick(pool)}${view.error ? ' ' + Math.floor(Math.random() * 99) : ''}` };
        }
        if (view.screen === 'choose' && !view.selected) return { type: 'pick', option: pick(view.options as { id: string }[]).id };
        return null;
      },
    };
  },
} satisfies GameServerModule;
