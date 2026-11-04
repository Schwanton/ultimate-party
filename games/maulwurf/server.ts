/**
 * Verräter-Team – heimliche Verräter gegen die Loyalen.
 *
 * Jede Runde: Anführer*in (reihum) stellt ein Missionsteam zusammen → das Team spielt heimlich „Erfüllen“
 * oder (nur Verräter) „Sabotieren“; eine Sabotage reicht zum Scheitern → Diskussion und Rauswählen → Rolle wird aufgedeckt.
 *
 * Loyale gewinnen: alle Verräter raus ODER 3 Missionen erfüllt.
 * Verräter gewinnen: 3 Missionen sabotiert ODER mindestens so viele Verräter wie Loyale im Spiel.
 */

import { Scores, pick, shuffle, type GameContext, type GameServerModule } from '@up/sdk';
import { votersSeconds } from './timing';

const T = { intro: 14, roles: 12, pick: 40, mission: 20, flip: 1.1, missionResult: 4, lastChance: 5, voteResult: 5, end: 12 };
const WIN = 3;
const POINTS = { win: 1000, survived: 500, goodVote: 250 };
const NOBODY = 'nobody';

type Role = 'loyal' | 'traitor';

export function traitorCount(n: number) {
  return Math.max(1, Math.round(n / 5));
}

export function teamSize(alive: number) {
  return alive <= 5 ? 2 : alive <= 7 ? 3 : alive <= 10 ? 4 : alive <= 15 ? 5 : 6;
}

export default {
  create(ctx: GameContext) {
    const ids = ctx.players.map((p) => p.id);
    const scores = new Scores(ids);
    const wanted = Number(ctx.options.traitors) || traitorCount(ids.length);
    const nTraitors = Math.min(wanted, Math.floor((ids.length - 1) / 2));
    const discuss = Number(ctx.options.discussTime) || 90;
    const traitors = new Set(shuffle(ids).slice(0, nTraitors));
    const role = (id: string): Role => (traitors.has(id) ? 'traitor' : 'loyal');
    const alive = new Set(ids);
    const missions: ('ok' | 'fail')[] = [];
    const banished: { playerId: string; role: Role; round: number }[] = [];
    let leaderOrder = shuffle(ids);
    let leaderIdx = -1;
    let leader = '';
    let round = 0;
    let team: string[] = [];
    let confirmed = false;
    let cards = new Map<string, 'ok' | 'fail'>();
    let votes = new Map<string, string>();
    let timer: { cancel(): void; deadline: number; duration: number } | null = null;
    let phase: 'intro' | 'roles' | 'pick' | 'mission' | 'missionResult' | 'vote' | 'voteResult' | 'end' = 'intro';

    const aliveList = () => ids.filter((id) => alive.has(id));
    const traitorsAlive = () => aliveList().filter((id) => traitors.has(id)).length;
    const loyalAlive = () => aliveList().length - traitorsAlive();
    const ok = () => missions.filter((m) => m === 'ok').length;
    const fail = () => missions.filter((m) => m === 'fail').length;
    const status = () => ({ round, ok: ok(), fail: fail(), alive: aliveList(), traitorsTotal: nTraitors, banished, win: WIN });
    const roleInfo = (id: string) => ({
      role: role(id), alive: alive.has(id),
      mates: traitors.has(id) ? [...traitors].filter((x) => x !== id) : [],
    });

    function intro() {
      ctx.setHostView({ screen: 'intro', traitors: nTraitors, win: WIN });
      ctx.setAllPlayerViews(() => ({ screen: 'intro' }));
      ctx.after(T.intro, showRoles);
    }

    function showRoles() {
      phase = 'roles';
      ctx.setHostView({ screen: 'roles', traitors: nTraitors, ...status() });
      ctx.setAllPlayerViews((p) => ({ screen: 'role', ...roleInfo(p.id) }));
      ctx.after(T.roles, nextRound);
    }

    /* ---------- Team zusammenstellen ---------- */

    function nextRound() {
      if (checkEnd()) return;
      round++;
      // nächste*r lebende Anführer*in
      for (let i = 0; i < ids.length; i++) {
        leaderIdx = (leaderIdx + 1) % leaderOrder.length;
        if (alive.has(leaderOrder[leaderIdx])) break;
      }
      leader = leaderOrder[leaderIdx];
      team = [];
      confirmed = false;
      phase = 'pick';
      timer = ctx.timer(T.pick, () => autoTeam());
      pickViews();
    }

    function size() {
      return Math.min(teamSize(aliveList().length), aliveList().length);
    }

    function pickViews() {
      ctx.setHostView({ screen: 'pick', ...status(), leader, team, size: size(), deadline: timer!.deadline, duration: timer!.duration });
      for (const id of ids) {
        if (!alive.has(id)) ctx.setPlayerView(id, { screen: 'out', ...roleInfo(id) });
        else if (id === leader) ctx.setPlayerView(id, { screen: 'pick', input: true, ...roleInfo(id), options: aliveList(), team, size: size(), deadline: timer!.deadline, duration: timer!.duration });
        else ctx.setPlayerView(id, { screen: 'waitPick', ...roleInfo(id), leader, team, size: size() });
      }
    }

    function autoTeam() {
      const rest = shuffle(aliveList().filter((x) => !team.includes(x)));
      team = [...team, ...rest].slice(0, size());
      startMission();
    }

    /* ---------- Mission ---------- */

    function startMission() {
      timer?.cancel();
      confirmed = true;
      phase = 'mission';
      cards = new Map();
      timer = ctx.timer(T.mission, revealMission);
      missionViews();
    }

    function missionViews() {
      ctx.setHostView({ screen: 'mission', ...status(), leader, team, decided: [...cards.keys()], deadline: timer!.deadline, duration: timer!.duration });
      for (const id of ids) {
        if (!alive.has(id)) ctx.setPlayerView(id, { screen: 'out', ...roleInfo(id) });
        else if (team.includes(id)) ctx.setPlayerView(id, { screen: 'mission', input: !cards.has(id), ...roleInfo(id), choice: cards.get(id) ?? null, team, deadline: timer!.deadline, duration: timer!.duration });
        else ctx.setPlayerView(id, { screen: 'waitMission', ...roleInfo(id), team });
      }
    }

    function revealMission() {
      timer?.cancel();
      phase = 'missionResult';
      for (const id of team) if (!cards.has(id)) cards.set(id, 'ok');
      const deck = shuffle([...cards.values()]);
      const result: 'ok' | 'fail' = deck.includes('fail') ? 'fail' : 'ok';
      missions.push(result);
      const seconds = 1 + deck.length * T.flip + T.missionResult;
      ctx.setHostView({ screen: 'missionResult', ...status(), team, deck, result, flip: T.flip });
      ctx.setAllPlayerViews((p) => (alive.has(p.id) ? { screen: 'lookAtTv', ...roleInfo(p.id) } : { screen: 'out', ...roleInfo(p.id) }));
      ctx.after(seconds, () => (checkEnd() ? undefined : startVote()));
    }

    /* ---------- Diskutieren und rauswählen ---------- */

    function startVote() {
      phase = 'vote';
      votes = new Map();
      timer = ctx.timer(discuss, resolveVote);
      voteViews();
    }

    function voteViews() {
      ctx.setHostView({ screen: 'vote', ...status(), lastResult: missions.at(-1), team, voted: votes.size, voters: aliveList().length, deadline: timer!.deadline, duration: timer!.duration });
      for (const id of ids) {
        if (!alive.has(id)) ctx.setPlayerView(id, { screen: 'out', ...roleInfo(id) });
        else ctx.setPlayerView(id, { screen: 'vote', input: !votes.has(id), ...roleInfo(id), options: aliveList().filter((x) => x !== id), selected: votes.get(id) ?? null, deadline: timer!.deadline, duration: timer!.duration });
      }
    }

    function hurry() {
      if (!timer || timer.deadline - Date.now() <= T.lastChance * 1200) return;
      timer.cancel();
      timer = ctx.timer(T.lastChance, resolveVote);
      voteViews();
    }

    function resolveVote() {
      timer?.cancel();
      phase = 'voteResult';
      const before = aliveList();
      const candidates = [...before, NOBODY];
      const tally = candidates.map((c) => ({ playerId: c, voters: shuffle([...votes].filter(([, t]) => t === c).map(([v]) => v)) }));
      const top = Math.max(0, ...tally.map((x) => x.voters.length));
      const leaders = tally.filter((x) => x.voters.length === top && top > 0);
      const out = leaders.length === 1 && leaders[0].playerId !== NOBODY ? leaders[0].playerId : null;
      if (out) {
        alive.delete(out);
        banished.push({ playerId: out, role: role(out), round });
        if (traitors.has(out)) for (const [v, t] of votes) if (t === out && !traitors.has(v)) scores.add(v, POINTS.goodVote);
      }
      const total = [...votes.values()].length;
      const revealAt = Date.now() + (1 + votersSeconds(total) + 3.2) * 1000;
      ctx.setHostView({ screen: 'voteResult', ...status(), before, tally, out, outRole: out ? role(out) : null, tie: !out && leaders.length > 1 });
      ctx.setAllPlayerViews((p) => (p.id === out ? { screen: 'banished', ...roleInfo(p.id), revealAt } : alive.has(p.id) ? { screen: 'lookAtTv', ...roleInfo(p.id) } : { screen: 'out', ...roleInfo(p.id) }));
      ctx.after(1 + votersSeconds(total) + 3.2 + T.voteResult, nextRound);
    }

    /* ---------- Ende ---------- */

    function checkEnd(): boolean {
      let winner: Role | null = null;
      let reason = '';
      if (traitorsAlive() === 0) [winner, reason] = ['loyal', 'allOut'];
      else if (ok() >= WIN) [winner, reason] = ['loyal', 'missions'];
      else if (fail() >= WIN) [winner, reason] = ['traitor', 'missions'];
      else if (traitorsAlive() >= loyalAlive()) [winner, reason] = ['traitor', 'majority'];
      if (!winner) return false;
      phase = 'end';
      timer?.cancel();
      for (const id of ids) {
        if (role(id) !== winner) continue;
        scores.add(id, POINTS.win);
        if (alive.has(id)) scores.add(id, POINTS.survived);
      }
      ctx.setHostView({ screen: 'end', ...status(), winner, reason, traitors: [...traitors] });
      ctx.setAllPlayerViews((p) => ({ screen: 'end', ...roleInfo(p.id), winner, won: role(p.id) === winner, score: scores.get(p.id) }));
      ctx.after(T.end, () => {
        const ranking = scores.ranking();
        ctx.setHostView({ screen: 'final', ranking });
        ctx.finish(ranking);
      });
      return true;
    }

    return {
      start: intro,
      onAction(id, action) {
        if (!action || !alive.has(id)) return;
        if (phase === 'pick' && id === leader && !confirmed) {
          if (action.type === 'toggle') {
            const target = String(action.target);
            if (!alive.has(target)) return;
            if (team.includes(target)) team = team.filter((x) => x !== target);
            else if (team.length < size()) team = [...team, target];
            pickViews();
          } else if (action.type === 'confirm' && team.length === size()) startMission();
        } else if (phase === 'mission' && action.type === 'card' && team.includes(id) && !cards.has(id)) {
          const card = action.card === 'fail' && traitors.has(id) ? 'fail' : 'ok';
          cards.set(id, card);
          missionViews();
          if (team.every((m) => cards.has(m))) {
            timer?.cancel();
            ctx.after(1, revealMission);
          }
        } else if (phase === 'vote' && action.type === 'vote') {
          const target = String(action.target);
          if (target === id || (target !== NOBODY && !alive.has(target))) return;
          votes.set(id, target);
          voteViews();
          if (aliveList().every((p) => votes.has(p) || !ctx.player(p)?.connected)) hurry();
        }
      },
      bot(id, view) {
        if (view.screen === 'pick' && view.input) {
          if ((view.team as string[]).length < view.size) {
            const pool = (view.options as string[]).filter((x) => !(view.team as string[]).includes(x));
            // Verräter nehmen sich gern selbst mit
            const target = traitors.has(id) && !(view.team as string[]).includes(id) ? id : pick(pool);
            return { type: 'toggle', target };
          }
          return { type: 'confirm' };
        }
        if (view.screen === 'mission' && view.input) return { type: 'card', card: traitors.has(id) && Math.random() < 0.7 ? 'fail' : 'ok' };
        if (view.screen === 'vote' && !view.selected) {
          const opts = (view.options as string[]).filter((x) => !(traitors.has(id) && traitors.has(x)));
          return { type: 'vote', target: Math.random() < 0.1 || !opts.length ? NOBODY : pick(opts) };
        }
        return null;
      },
    };
  },
} satisfies GameServerModule;
