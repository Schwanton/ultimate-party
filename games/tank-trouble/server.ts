/**
 * Tank Trouble – Panzer in der Draufsicht nach dem Vorbild „Tanks!“ aus Wii Play.
 * Kampagne: alle zusammen gegen farbige Computer-Panzer, 10 Missionen, jeder 3 Leben (+1 nach Mission 5).
 * Duell: jeder gegen jeden, zufällige Arena, Powerups.
 * Der Server rechnet alles 30× pro Sekunde (engine.ts, ai.ts) und schickt die Positionen über ctx.stream an den TV.
 */

import { Scores, shuffle, type GameContext, type GameServerModule } from '@up/sdk';
import { DUEL_MAPS, ENEMY_LETTER, MISSIONS, mirror } from './levels';
import { BOT_SPEC, CELL, ENEMIES, H, PLAYER_SPEC, POWERUPS, W, World, type Ev, type Spec, type Tank } from './engine';
import { aiStep } from './ai';

const TICK = 1 / 30;
const T = { intro: 9, card: 4.5, ready: 3, clear: 3.5, fail: 3.5, roundEnd: 4, scores: 6, missionMax: 180, roundMax: 120 };
const POINTS = { duelKill: 100, duelWin: 300, survive: 100 };
const LIVES = 3;
const CPU_SPEC: Spec = { ...BOT_SPEC, fireCd: 0.75, err: 0.08, mineRate: 0.04 };
const CPU_COLORS = ['#8A93A8', '#C8874A', '#2FD9C9'];

type Phase = 'intro' | 'card' | 'ready' | 'fight' | 'clear' | 'fail' | 'roundEnd' | 'scores' | 'final';

export default {
  create(ctx: GameContext) {
    const ids = ctx.players.map((p) => p.id);
    const mode = ctx.options.mode === 'duell' ? 'duell' : 'kampagne';
    const totalRounds = Number(ctx.options.rounds) || 5;
    const scores = new Scores(ids);
    const level = ctx.options.difficulty === 'leicht' ? 'leicht' : ctx.options.difficulty === 'schwer' ? 'schwer' : 'normal';
    // Schwierigkeit der Kampagne: Leben und Gegnerstärke
    const startLives = mode === 'kampagne' ? (level === 'leicht' ? 5 : level === 'schwer' ? 2 : LIVES) : LIVES;
    const DIFF = level === 'leicht' ? { cd: 1.5, err: 1.6, speed: 0.85, turn: 0.75 } : level === 'schwer' ? { cd: 0.8, err: 0.7, speed: 1.1, turn: 1.2 } : null;
    const enemySpec = (type: string) => {
      const base = ENEMIES[type];
      if (!DIFF) return base;
      return { ...base, fireCd: base.fireCd * DIFF.cd, err: base.err * DIFF.err + (DIFF.err > 1 ? 0.03 : 0), speed: base.speed * DIFF.speed, turn: base.turn * DIFF.turn };
    };
    const lives = new Map(ids.map((id) => [id, startLives]));
    const kills = new Map(ids.map((id) => [id, 0]));
    const isBot = (id: string) => !!ctx.player(id)?.isBot;
    let cpuCount = mode === 'duell' ? Number(ctx.options.cpu) || 0 : 0;
    // Team-Duell: zwei Teams, zufällig und gleich groß eingeteilt
    const teamMode = mode === 'duell' && ctx.options.teams === 'on' && ids.length >= 2;
    const TEAM_COLORS = [['#FF4B4B', '#FF8A3D', '#FF5FA2', '#FFC23F'], ['#3EC8FF', '#5B7CFF', '#2FD9C9', '#A07CFF']];
    const teamOf = new Map<string, number>();
    const teamColor = new Map<string, string>();
    if (teamMode) shuffle(ids).forEach((id, i) => {
      teamOf.set(id, (i % 2) + 1);
      teamColor.set(id, TEAM_COLORS[i % 2][Math.floor(i / 2) % 4]);
    });
    const colorOf = (id: string) => teamColor.get(id) ?? ctx.player(id)?.color ?? '#3EC8FF';
    let winners: string[] = [];
    if (mode === 'duell' && ids.length + cpuCount < 2) cpuCount = 1;

    let phase: Phase = 'intro';
    let mission = 1;
    let round = 0;
    let key = 0;
    let loop = 0;
    let world: World | null = null;
    let tankOf = new Map<string, Tank>();
    let startAt = 0;
    let extraLife = false;
    let winner: string | null = null;
    let recent: { at: number; e: Ev }[] = [];
    let roundStart = scores.snapshot();
    const hud = new Map<string, string>();

    /* ---------- Ansichten ---------- */

    function tanksInfo() {
      return world ? world.tanks.map((t) => ({ i: t.i, kind: t.kind, pid: t.pid ?? null, etype: t.etype ?? null, color: t.color })) : [];
    }

    function hostView(extra: object = {}) {
      if (!world) return;
      const enemies: Record<string, [number, number]> = {};
      for (const t of world.tanks) if (t.kind === 'enemy' && t.etype) {
        const e = (enemies[t.etype] ??= [0, 0]);
        e[1]++;
        if (t.alive) e[0]++;
      }
      ctx.setHostView({
        screen: 'arena', mode, phase, key, grid: world.grid.map((r) => r.join('')), tanks: tanksInfo(),
        mission, missions: MISSIONS.length, round, total: totalRounds, startAt,
        lives: Object.fromEntries(lives), scores: scores.snapshot(), enemies, winner, winners, extraLife,
        teams: teamMode ? Object.fromEntries(teamOf) : null, colors: Object.fromEntries(ids.map((id) => [id, colorOf(id)])),
        alive: ids.filter((id) => tankOf.get(id)?.alive),
        ...extra,
      });
    }

    function playerView(id: string) {
      const tk = tankOf.get(id);
      const base = { mode, mission, missions: MISSIONS.length, round, total: totalRounds, lives: lives.get(id) ?? 0, score: scores.get(id), color: colorOf(id), team: teamOf.get(id) ?? null };
      if (phase === 'ready' || phase === 'fight') {
        if (!tk) return { screen: 'down', ...base, out: (lives.get(id) ?? 0) <= 0 };
        if (!tk.alive) return { screen: 'down', ...base, out: mode === 'kampagne' && (lives.get(id) ?? 0) <= 0 };
        const w = world!;
        return {
          screen: 'play', ...base, live: phase === 'fight', startAt,
          bullets: tk.spec.maxBullets - w.bulletsOf(tk.i), maxBullets: tk.spec.maxBullets,
          mines: w.maxMines(tk) - w.minesOf(tk.i), maxMines: w.maxMines(tk),
          shield: tk.shield, ammo: tk.ammo ? `${tk.ammo.kind}:${tk.ammo.n}` : null, turbo: w.t < tk.turboUntil,
        };
      }
      if (phase === 'clear' || phase === 'fail' || phase === 'roundEnd') return { screen: 'between', ...base, phase, won: winners.includes(id), alive: !!tk?.alive };
      return { screen: 'wait', ...base, phase };
    }

    function sendPhones(force = false) {
      for (const id of ids) {
        const v = playerView(id);
        const s = JSON.stringify(v);
        if (!force && hud.get(id) === s) continue;
        hud.set(id, s);
        ctx.setPlayerView(id, v);
      }
    }

    /* ---------- Aufbau einer Arena ---------- */

    function spawnPoints(map: string[]) {
      const pts: [number, number][] = [];
      const enemies: [number, number, string][] = [];
      map.forEach((row, r) => [...row].forEach((ch, c) => {
        if (ch === 'P') pts.push([c, r]);
        else if (ENEMY_LETTER[ch]) enemies.push([c, r, ENEMY_LETTER[ch]]);
      }));
      return { pts, enemies };
    }

    function newWorld(map: string[], players: string[], duel: boolean) {
      key++;
      const w = new World(map);
      w.powerupsOn = duel;
      const { pts, enemies } = spawnPoints(map);
      tankOf = new Map();
      const spots = duel ? shuffle(pts) : pts;
      const n = players.length + (duel ? cpuCount : 0);
      const pick = (i: number) => spots[duel ? i % spots.length : Math.min(spots.length - 1, Math.floor((i + 0.5) * spots.length / Math.max(1, n)))];
      const face = (c: number, r: number) => Math.atan2(H / 2 - (r + 0.5) * CELL, W / 2 - (c + 0.5) * CELL);
      players.forEach((id, i) => {
        const [c, r] = pick(i);
        const tk = w.addTank({ kind: 'player', pid: id, team: duel ? (teamOf.get(id) ?? i + 1) : 0, color: colorOf(id), spec: isBot(id) ? BOT_SPEC : PLAYER_SPEC, x: (c + 0.5) * CELL, y: (r + 0.5) * CELL, turret: face(c, r) });
        tankOf.set(id, tk);
      });
      if (duel) for (let k = 0; k < cpuCount; k++) {
        const [c, r] = pick(players.length + k);
        w.addTank({ kind: 'enemy', etype: 'cpu', team: 100 + k, color: CPU_COLORS[k % CPU_COLORS.length], spec: CPU_SPEC, x: (c + 0.5) * CELL, y: (r + 0.5) * CELL, turret: face(c, r) });
      }
      for (const [c, r, type] of enemies) {
        const spec = enemySpec(type);
        w.addTank({ kind: 'enemy', etype: type, team: 1, color: spec.color, spec, x: (c + 0.5) * CELL, y: (r + 0.5) * CELL, turret: Math.PI });
      }
      w.onKill = onKill;
      w.onPickup = () => sendPhones();
      world = w;
      recent = [];
      winner = null;
      winners = [];
    }

    function onKill(victim: Tank, by: Tank | null) {
      if (mode === 'kampagne') {
        if (victim.kind === 'player' && victim.pid) lives.set(victim.pid, Math.max(0, (lives.get(victim.pid) ?? 0) - 1));
        else if (victim.kind === 'enemy' && by?.kind === 'player' && by.pid) {
          scores.add(by.pid, victim.spec.points);
          kills.set(by.pid, (kills.get(by.pid) ?? 0) + 1);
        }
      } else if (by && by !== victim && by.kind === 'player' && by.pid && !(teamMode && by.team === victim.team)) {
        scores.add(by.pid, POINTS.duelKill);
        kills.set(by.pid, (kills.get(by.pid) ?? 0) + 1);
      }
      hostView();
    }

    /* ---------- Ablauf ---------- */

    function intro() {
      phase = 'intro';
      ctx.setHostView({ screen: 'intro', mode, missions: MISSIONS.length, total: totalRounds, lives: startLives, teams: teamMode ? Object.fromEntries(teamOf) : null });
      ctx.setAllPlayerViews(() => ({ screen: 'wait', phase: 'intro' }));
      ctx.after(T.intro, mode === 'kampagne' ? missionCard : nextRound);
    }

    function missionCard() {
      const players = ids.filter((id) => (lives.get(id) ?? 0) > 0);
      if (!players.length) return final();
      phase = 'card';
      const seen = new Set<string>();
      for (let m = 0; m < mission - 1; m++) for (const [, , t] of spawnPoints(MISSIONS[m]).enemies) seen.add(t);
      const counts = new Map<string, number>();
      for (const [, , t] of spawnPoints(MISSIONS[mission - 1]).enemies) counts.set(t, (counts.get(t) ?? 0) + 1);
      ctx.setHostView({
        screen: 'mission', mission, missions: MISSIONS.length, lives: Object.fromEntries(lives), extraLife,
        enemies: [...counts].map(([type, count]) => ({ type, count, isNew: !seen.has(type) })),
      });
      extraLife = false;
      ctx.setAllPlayerViews((p) => ({ screen: 'wait', phase: 'card', mission, missions: MISSIONS.length, lives: lives.get(p.id) ?? 0, color: p.color }));
      ctx.after(T.card, () => {
        newWorld(MISSIONS[mission - 1], players, false);
        ready();
      });
    }

    function nextRound() {
      round++;
      if (round > totalRounds) return final();
      const base = DUEL_MAPS[Math.floor(Math.random() * DUEL_MAPS.length)];
      newWorld(mirror(base, Math.random() < 0.5, Math.random() < 0.5), ids, true);
      ready();
    }

    function ready() {
      phase = 'ready';
      startAt = Date.now() + T.ready * 1000;
      hostView();
      sendPhones(true);
      stream();
      ctx.after(T.ready, fight);
    }

    function fight() {
      phase = 'fight';
      hostView();
      sendPhones(true);
      const my = ++loop;
      const tick = () => {
        if (my !== loop || phase !== 'fight') return;
        step();
        if (my === loop && phase === 'fight') ctx.after(TICK, tick);
      };
      ctx.after(TICK, tick);
    }

    function step() {
      const w = world!;
      for (const tk of w.tanks) {
        if (!tk.alive) continue;
        if (tk.kind === 'enemy' || (tk.pid && isBot(tk.pid))) aiStep(w, tk);
      }
      w.step(TICK);
      if (w.gridChanged) { w.gridChanged = false; hostView(); }
      for (const e of w.events) recent.push({ at: w.t, e });
      w.events = [];
      recent = recent.filter((r) => w.t - r.at < 0.7);
      stream();
      if (phase === 'fight') checkEnd();
      if (phase === 'fight') sendPhones();
    }

    function checkEnd() {
      const w = world!;
      if (mode === 'kampagne') {
        const enemiesLeft = w.tanks.some((t) => t.kind === 'enemy' && t.alive);
        const playersLeft = w.tanks.some((t) => t.kind === 'player' && t.alive);
        if (!enemiesLeft) return clear();
        if (!playersLeft) return fail();
        if (w.t >= T.missionMax) {
          for (const t of w.tanks) if (t.kind === 'player' && t.alive && t.pid) lives.set(t.pid, Math.max(0, (lives.get(t.pid) ?? 0) - 1));
          return fail();
        }
      } else {
        const left = w.tanks.filter((t) => t.alive);
        const teamsLeft = new Set(left.map((t) => t.team));
        if (teamMode && teamsLeft.size <= 1 && left.length) return endRound(left[0]);
        if (left.length <= 1 || w.t >= T.roundMax) endRound(left.length === 1 ? left[0] : null);
      }
    }

    function stop() {
      loop++;
    }

    function clear() {
      stop();
      phase = 'clear';
      for (const t of world!.tanks) if (t.kind === 'player' && t.alive && t.pid) scores.add(t.pid, POINTS.survive);
      if (mission === 5) {
        for (const id of ids) lives.set(id, (lives.get(id) ?? 0) + 1);
        extraLife = true;
      }
      hostView({ extraLife });
      sendPhones(true);
      ctx.after(T.clear, () => {
        mission++;
        if (mission > MISSIONS.length) return final(true);
        missionCard();
      });
    }

    function fail() {
      stop();
      phase = 'fail';
      hostView();
      sendPhones(true);
      ctx.after(T.fail, () => (ids.some((id) => (lives.get(id) ?? 0) > 0) ? missionCard() : final()));
    }

    function endRound(last: Tank | null) {
      stop();
      phase = 'roundEnd';
      winner = last?.kind === 'player' && last.pid ? last.pid : null;
      winners = teamMode && winner ? ids.filter((id) => teamOf.get(id) === teamOf.get(winner!)) : winner ? [winner] : [];
      for (const id of winners) scores.add(id, POINTS.duelWin);
      hostView({ cpuWon: last?.kind === 'enemy' });
      sendPhones(true);
      ctx.after(T.roundEnd, () => (round < totalRounds ? showScores() : nextRound()));
    }

    function showScores() {
      phase = 'scores';
      ctx.setHostView({ screen: 'scores', before: roundStart, after: scores.snapshot(), round, total: totalRounds });
      ctx.setAllPlayerViews((p) => ({ screen: 'wait', phase: 'scores', score: scores.get(p.id) }));
      roundStart = scores.snapshot();
      ctx.after(T.scores, nextRound);
    }

    function final(victory = false) {
      stop();
      phase = 'final';
      const ranking = scores.ranking();
      ctx.setHostView({ screen: 'final', mode, ranking, victory, mission: Math.min(mission, MISSIONS.length), missions: MISSIONS.length, kills: Object.fromEntries(kills) });
      ctx.setAllPlayerViews((p) => ({
        screen: 'finalMe', mode, victory, score: scores.get(p.id), kills: kills.get(p.id) ?? 0,
        place: ranking.filter((x) => x.score > scores.get(p.id)).length + 1, of: ranking.length,
      }));
      ctx.finish(ranking);
    }

    function stream() {
      const w = world;
      if (!w) return;
      const r = Math.round;
      ctx.stream({
        k: key,
        t: r(w.t * 10) / 10,
        tk: w.tanks.map((t) => [r(t.x), r(t.y), r(t.body * 100), r(t.turret * 100),
          (t.alive ? 1 : 0) | (t.shield ? 2 : 0) | (t.spec.invisible ? 4 : 0) | (w.t < t.turboUntil ? 8 : 0) | (t.kind === 'player' && w.t - t.aimedAt < 1.2 ? 16 : 0) | (t.moved > 0.5 ? 32 : 0)]),
        b: w.bullets.map((b) => [r(b.x), r(b.y), b.owner, b.rocket ? 1 : 0, b.left]),
        m: w.mines.map((m) => [r(m.x), r(m.y), m.owner, m.fuse - m.age < 2 ? 1 : 0]),
        p: w.powerups.map((p) => [r(p.x), r(p.y), POWERUPS.indexOf(p.kind)]),
        e: recent.map((x) => x.e),
      });
    }

    return {
      start: intro,
      onAction(id, action) {
        if (!action || phase !== 'fight' || isBot(id)) return;
        const tk = tankOf.get(id);
        if (!tk || !tk.alive) return;
        if (action.type === 'move') {
          let x = Number(action.x) || 0, y = Number(action.y) || 0;
          const len = Math.hypot(x, y);
          if (len > 1) [x, y] = [x / len, y / len];
          tk.mx = x;
          tk.my = y;
        } else if (action.type === 'aim') {
          const a = Number(action.a);
          if (Number.isFinite(a)) { tk.aim = a; tk.turret = a; tk.aimedAt = world!.t; }
        } else if (action.type === 'fire') tk.wantFire = true;
        else if (action.type === 'mine') tk.wantMine = true;
      },
      onPlayerRejoin(id) {
        hud.delete(id);
        sendPhones();
      },
      dispose() {
        loop++;
      },
    };
  },
} satisfies GameServerModule;
