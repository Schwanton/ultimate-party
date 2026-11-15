/**
 * Murmel-Mayhem – Murmelbahn mit Fallen, Hilfen und Weichen.
 *
 * Ablauf pro Runde: Bauen (geheim, 40 s) → Enthüllen → Rennen (Server-Physik 30×/s, Positionen per ctx.stream)
 * → Auswertung → Umbau der Bahn. Regeln und Zahlen: Konzept-Dokument „Murmel-Mayhem – Konzept“.
 */

import { INPUT_GRACE, Scores, shuffle, type GameContext, type GameServerModule } from '@up/sdk';
import {
  Race, SORT, SWITCH_ONLY, TICK, TOGGLE, TOGGLE_START, addSocket, generateGoodTrack, itemExit, posOn,
  type CardKind, type Item, type ItemKind, type RaceEvent, type Socket, type Track,
} from './engine';

const T = { intro: 16, build: 40, reveal: 2.2, revealPer: 0.45, result: 9, umbau: 5, finalWait: 1, raceMin: 80, afterFirst: 30, raceMax: 110 };
const POINTS = { perPlace: 10, first: 100, trap: 20, trapMax: 100 };
const ITEMS: ItemKind[] = ['turbo', 'feder', 'magnet', 'schild', 'kleber', 'schranke', 'gegenfeder', 'falltuer', 'wind', 'bremse', 'farbweiche', 'bruecke', 'umleitung', 'wurmloch', 'kanone'];
const EVENTS: CardKind[] = ['beben', 'oel', 'riese', 'tausch'];
const STRONG: CardKind[] = ['turbo', 'kanone', 'schranke', 'farbweiche', 'magnet', 'falltuer'];

/** Bahn für Ansichten (TV vollständig, Handy vereinfacht) */
function geo(track: Track, phone = false) {
  const thin = (pts: [number, number][]) => (phone && pts.length > 6 ? pts.filter((_, i) => i % 3 === 0 || i === pts.length - 1) : pts);
  return {
    H: track.H,
    segs: track.segs.map((s) => ({ id: s.id, role: s.role, layer: s.layer, row: s.row, pts: thin(s.pts).map(([x, y]) => [Math.round(x), Math.round(y)]) })),
    mixers: track.mixers.map((m) => ({ kind: m.kind, x: Math.round(m.x), y: Math.round(m.y), side: m.side, turn: m.turn })),
    turns: track.turns,
    sockets: track.sockets.map((s) => ({ id: s.id, x: s.x, y: s.y, kind: s.kind, row: s.row, dust: s.kind === 'switch' && !!track.branches[s.branch!]?.dust })),
    panels: phone ? [] : track.panels,
    branches: track.branches.map((b) => ({ id: b.id, base: b.base, dust: b.dust })),
    marks: track.marks.map((m) => {
      const s = track.segs[m.seg];
      const p = posOn(s, s.len * 0.5);
      return { kind: m.kind, x: Math.round(p.x), y: Math.round(p.y) };
    }),
    conveyor: track.conveyor,
  };
}

interface Placement { card: number; socket: number }

export default {
  create(ctx: GameContext) {
    const ids = ctx.players.map((p) => p.id);
    const N = ids.length;
    const idx = new Map(ids.map((id, i) => [id, i]));
    const scores = new Scores(ids);
    const total = Number(ctx.options.rounds) || 5;
    const perPlayer = N <= 4 ? 6 : N <= 8 ? 4 : 3;
    const colors = ids.map((id) => ctx.player(id)?.color ?? '#FFFFFF');
    const { track, check } = generateGoodTrack(8, 10);
    ctx.log('Murmel-Mayhem Bahn', track.turns.join(','), 'Ähnlichkeit', check.rho.toFixed(2), 'Überholungen', Math.round(check.overtakes), 'Zeit', check.time.toFixed(0));
    let trackV = 1;
    let round = 0;
    let phase: 'intro' | 'build' | 'reveal' | 'race' | 'result' | 'umbau' | 'final' = 'intro';
    let items: Item[] = [];
    let nextItemId = 1;
    let offers = new Map<string, CardKind[]>();
    let placed = new Map<string, Placement[]>();
    let ready = new Set<string>();
    let buildTimer: { cancel(): void; deadline: number; duration: number } | null = null;
    let race: Race | null = null;
    let loop = 0;
    let raceEvents: RaceEvent[] = [];
    let marbleOwner: number[] = [];
    let raceStart = scores.snapshot();
    let lastUmbau: { key: string; x: number; y: number; vars?: Record<string, string | number> } | null = null;
    let lastRace: { points: Record<string, number>; finished: Record<string, number>; firstPid: string | null; traps: Record<string, number> } | null = null;

    const lastRound = () => round === total;
    const maxPlace = () => (lastRound() ? 3 : 2);
    const occupied = () => new Set(items.map((it) => it.socket));
    const publicItems = () => items.map((it) => {
      const so = track.sockets[it.socket];
      return { id: it.id, kind: it.kind, owner: ids[it.owner], x: so.x, y: so.y, age: it.age, on: it.on, toggle: TOGGLE.includes(it.kind), exit: it.exit ? (() => { const p = posOn(track.segs[it.exit!.seg], it.exit!.s); return [Math.round(p.x), Math.round(p.y)]; })() : null };
    });
    const isDust = (so: Socket) => so.kind === 'switch' && !!track.branches[so.branch!]?.dust;
    const fits = (kind: CardKind, so: Socket) => {
      if (SORT[kind] === 'ereignis') return false;
      if (SWITCH_ONLY.includes(kind)) return so.kind === 'switch' && !(kind === 'bruecke' && isDust(so));
      if (so.kind !== 'rail') return false;
      if (kind === 'kanone' && so.row >= 11) return false;
      return true;
    };

    /* ---------- Angebote ---------- */
    function makeOffers() {
      offers = new Map();
      const rank = scores.ranking();
      const behind = new Set(rank.slice(Math.ceil(rank.length / 2)).map((r) => r.playerId));
      const freeSwitch = track.sockets.filter((s) => s.kind === 'switch' && !occupied().has(s.id)).length;
      for (const id of ids) {
        const pool: CardKind[] = ITEMS.filter((k) => !SWITCH_ONLY.includes(k) || freeSwitch > 0);
        const weight = (k: CardKind) => (behind.has(id) && round > 1 && STRONG.includes(k) ? 1.7 : 1);
        const draw = (from: CardKind[]) => {
          const sum = from.reduce((a, k) => a + weight(k), 0);
          let r = Math.random() * sum;
          for (const k of from) if ((r -= weight(k)) <= 0) return k;
          return from[from.length - 1];
        };
        const hand: CardKind[] = [];
        while (hand.length < 3) {
          const k = Math.random() < 1 / 6 ? EVENTS[Math.floor(Math.random() * EVENTS.length)] : draw(pool);
          if (hand.filter((h) => h === k).length >= 1 && Math.random() < 0.7) continue;
          hand.push(k);
        }
        if (!hand.some((k) => SORT[k] === 'weiche')) hand[Math.floor(Math.random() * 3)] = draw(pool.filter((k) => SORT[k] === 'weiche'));
        offers.set(id, hand);
      }
    }

    /* ---------- Phasen ---------- */
    function intro() {
      phase = 'intro';
      ctx.setHostView({ screen: 'intro', geo: geo(track), trackV, perPlayer, total });
      ctx.setAllPlayerViews((p) => ({ screen: 'intro', color: p.color, perPlayer }));
      ctx.after(T.intro, build);
    }

    function build() {
      round++;
      phase = 'build';
      makeOffers();
      placed = new Map(ids.map((id) => [id, []]));
      ready = new Set();
      buildTimer = ctx.timer(T.build, reveal, { grace: INPUT_GRACE });
      hostBuild();
      for (const id of ids) playerBuild(id);
    }

    function hostBuild() {
      ctx.setHostView({ screen: 'build', players: ids, round, total, last: lastRound(), deadline: buildTimer!.deadline, duration: buildTimer!.duration, ready: [...ready], geo: geo(track), trackV, items: publicItems(), umbau: lastUmbau });
    }

    function playerBuild(id: string) {
      const occ = occupied();
      const mine = placed.get(id) ?? [];
      ctx.setPlayerView(id, {
        screen: 'build', round, total, max: maxPlace(), color: colors[idx.get(id)!],
        deadline: buildTimer!.deadline, duration: buildTimer!.duration,
        offers: offers.get(id) ?? [], placed: mine, ready: ready.has(id),
        geo: geo(track, true), trackV,
        taken: [...occ],
        items: publicItems().map((it) => ({ id: it.id, kind: it.kind, x: it.x, y: it.y, mine: it.owner === id, age: it.age })),
      });
    }

    function place(id: string, card: number, socket: number) {
      const hand = offers.get(id);
      const mine = placed.get(id);
      if (!hand || !mine || ready.has(id) || card < 0 || card >= hand.length) return;
      const kind = hand[card];
      const existing = mine.findIndex((p) => p.card === card);
      if (existing >= 0) mine.splice(existing, 1);
      if (mine.length >= maxPlace()) return playerBuild(id);
      if (SORT[kind] === 'ereignis') mine.push({ card, socket: -1 });
      else {
        const so = track.sockets[socket];
        if (!so || !fits(kind, so) || occupied().has(socket) || mine.some((p) => p.socket === socket)) return playerBuild(id);
        mine.push({ card, socket });
      }
      playerBuild(id);
    }

    function unplace(id: string, card: number) {
      const mine = placed.get(id);
      if (!mine || ready.has(id)) return;
      placed.set(id, mine.filter((p) => p.card !== card));
      playerBuild(id);
    }

    function setReady(id: string, on: boolean) {
      if (phase !== 'build') return;
      if (on) ready.add(id);
      else ready.delete(id);
      playerBuild(id);
      hostBuild();
      if (ready.size >= ids.filter((x) => ctx.player(x)?.connected !== false).length) {
        buildTimer?.cancel();
        reveal();
      }
    }

    /** Geheime Pläne aufdecken; doppelte Plätze bekommt, wer weiter hinten liegt */
    function reveal() {
      if (phase !== 'build') return;
      phase = 'reveal';
      buildTimer?.cancel();
      // Wer nichts gesetzt hat: Teile kommen auf zufällige freie Plätze
      for (const id of ids) {
        const mine = placed.get(id)!;
        const hand = offers.get(id)!;
        const taken = new Set([...occupied(), ...mine.map((p) => p.socket)]);
        for (let c = 0; c < hand.length && mine.length < maxPlace(); c++) {
          if (mine.some((p) => p.card === c)) continue;
          if (SORT[hand[c]] === 'ereignis') { mine.push({ card: c, socket: -1 }); continue; }
          const free = shuffle(track.sockets.filter((s) => fits(hand[c], s) && !taken.has(s.id)));
          if (free[0]) { mine.push({ card: c, socket: free[0].id }); taken.add(free[0].id); }
        }
      }
      const order = shuffle(ids).sort((a, b) => scores.get(a) - scores.get(b));
      const claimed = occupied();
      const fresh: { id: number; kind: CardKind; owner: string; x: number; y: number; moved: boolean }[] = [];
      raceEvents = [];
      const wants: { pid: string; kind: CardKind; socket: number }[] = [];
      for (const pid of order) for (const p of placed.get(pid)!) wants.push({ pid, kind: offers.get(pid)![p.card], socket: p.socket });
      // erst alle Wunschplätze nach Reihenfolge, dann ausweichen
      const later: typeof wants = [];
      for (const w of wants) {
        if (SORT[w.kind] === 'ereignis') {
          raceEvents.push({ kind: w.kind as RaceEvent['kind'], owner: idx.get(w.pid)!, at: 14 + Math.random() * 24 });
          fresh.push({ id: -1, kind: w.kind, owner: w.pid, x: -1, y: -1, moved: false });
          continue;
        }
        if (claimed.has(w.socket)) { later.push(w); continue; }
        claimed.add(w.socket);
        addItem(w.pid, w.kind as ItemKind, w.socket, false, fresh);
      }
      for (const w of later) {
        const want = track.sockets[w.socket];
        const wantR = track.segs[want.seg].r0 + want.s;
        const alt = track.sockets
          .filter((s) => !claimed.has(s.id) && fits(w.kind, s))
          .sort((a, b) => Math.abs(track.segs[a.seg].r0 + a.s - wantR) - Math.abs(track.segs[b.seg].r0 + b.s - wantR))[0];
        if (!alt) continue;
        claimed.add(alt.id);
        addItem(w.pid, w.kind as ItemKind, alt.id, true, fresh);
      }
      const dur = T.reveal + fresh.length * T.revealPer;
      ctx.setHostView({ screen: 'reveal', round, total, geo: geo(track), trackV, items: publicItems(), fresh, dur });
      ctx.setAllPlayerViews((p) => ({ screen: 'watch', color: p.color, key: 'phone.reveal', mine: fresh.filter((f) => f.owner === p.id) }));
      ctx.after(dur, startRace);
    }

    function addItem(pid: string, kind: ItemKind, socket: number, moved: boolean, fresh: { id: number; kind: CardKind; owner: string; x: number; y: number; moved: boolean }[]) {
      const so = track.sockets[socket];
      // Auf dem verstaubten Nebenweg starten Weichen auf „Hauptweg“ – umlegen ist dann eine bewusste Gemeinheit
      const on = isDust(so) && (kind === 'umleitung' || kind === 'farbweiche') ? false : TOGGLE_START[kind] ?? true;
      const it: Item = { id: nextItemId++, kind, owner: idx.get(pid)!, socket, age: 0, on, cool: 0, cnt: 0, exit: itemExit(track, kind, so), closedUntil: 0, openFrom: 0, trig: 0 };
      items.push(it);
      fresh.push({ id: it.id, kind, owner: pid, x: so.x, y: so.y, moved });
    }

    /* ---------- Rennen ---------- */
    function startRace() {
      phase = 'race';
      // Wer in der Wertung hinten liegt, startet eher früh
      const rank = new Map(scores.ranking().map((r, k) => [r.playerId, k]));
      const list: { owner: number; key: number }[] = [];
      for (const id of ids) for (let k = 0; k < perPlayer; k++) list.push({ owner: idx.get(id)!, key: Math.random() - (round > 1 ? ((rank.get(id) ?? 0) / Math.max(1, N - 1)) * 0.35 : 0) });
      list.sort((a, b) => a.key - b.key);
      marbleOwner = list.map((l) => l.owner);
      for (const it of items) { it.trig = 0; it.cnt = 0; it.cool = 0; it.closedUntil = 0; it.openFrom = 0; }
      race = new Race(track, marbleOwner, items, raceEvents);
      raceStart = scores.snapshot();
      const startedAt = Date.now();
      ctx.setHostView({ screen: 'race', players: ids, round, total, geo: geo(track), trackV, items: publicItems(), owners: marbleOwner.map((o) => ids[o]), colors: marbleOwner.map((o) => colors[o]), startedAt, events: raceEvents.map((e) => ({ kind: e.kind, owner: ids[e.owner] })) });
      phoneRace();
      const my = ++loop;
      let k = 0;
      let firstAt = -1;
      const tick = () => {
        if (my !== loop || phase !== 'race' || !race) return;
        race.step();
        k++;
        if (k % 15 === 0) botToggles();
        if (firstAt < 0 && race.finished.length) firstAt = race.t;
        streamFrame();
        if (k % 10 === 0) phoneRace();
        const t = race.t;
        const end = race.done || t >= T.raceMax || (t >= T.raceMin && firstAt >= 0 && t >= firstAt + T.afterFirst);
        if (end) return ctx.after(race.done ? 1.2 : 0.4, endRace);
        ctx.after(TICK, tick);
      };
      ctx.after(TICK, tick);
    }

    function streamFrame() {
      const r = race!;
      const order = r.order();
      ctx.stream({
        round, t: Math.round(r.t * 10) / 10,
        m: r.frame(),
        o: order,
        p: r.marbles.map((m) => Math.round(r.progress(m.i) * 1000)),
        ow: r.marbles.map((m) => m.owner),
        it: items.map((it) => [it.id, (it.on ? 1 : 0) | (r.t < it.closedUntil ? 2 : 0) | (r.spent(it) ? 4 : 0)]),
        fx: r.fx,
        g: r.giantPos(),
        q: r.t < r.quakeUntil ? 1 : 0,
        oil: r.oil && r.t < r.oil.until ? r.oil.seg : -1,
      });
      r.fx = [];
    }

    function phoneRace() {
      const r = race!;
      const order = r.order();
      const now = Date.now();
      for (const id of ids) {
        const o = idx.get(id)!;
        const mine = r.marbles.filter((m) => m.owner === o);
        const best = order.findIndex((i) => r.marbles[i].owner === o);
        const bestColor = best < 0 ? -1 : order.slice(0, best + 1).reduce((acc, i) => acc.add(r.marbles[i].owner), new Set<number>()).size;
        ctx.setPlayerView(id, {
          screen: 'race', round, total, color: colors[o], geo: geo(track, true), trackV,
          mine: mine.map((m) => [Math.round(m.x), Math.round(m.y), m.state === 'done' ? 1 : 0]),
          others: r.marbles.filter((m) => m.owner !== o && m.state !== 'wait').map((m) => [Math.round(m.x), Math.round(m.y)]),
          done: mine.filter((m) => m.state === 'done').length, of: mine.length,
          place: bestColor,
          toggles: items.filter((it) => it.owner === o && TOGGLE.includes(it.kind)).map((it) => {
            const so = track.sockets[it.socket];
            return { id: it.id, kind: it.kind, on: it.on, row: so.row + 1, readyAt: it.cool > r.t ? now + (it.cool - r.t) * 1000 : 0, x: so.x, y: so.y, dust: so.kind === 'switch' && track.branches[so.branch!]?.dust };
          }),
        });
      }
    }

    /** Testspieler legen ihre Weichen so, dass es eigenen Murmeln hilft */
    function botToggles() {
      const r = race!;
      for (const it of items) {
        if (!TOGGLE.includes(it.kind) || !ctx.player(ids[it.owner])?.isBot || r.t < it.cool) continue;
        const so = track.sockets[it.socket];
        let near: { own: boolean; d: number } | null = null;
        for (const m of r.marbles) {
          if (m.state !== 'rail' || m.seg !== so.seg || m.s > so.s || so.s - m.s > 320) continue;
          const d = so.s - m.s;
          if (!near || d < near.d) near = { own: m.owner === it.owner, d };
        }
        if (!near) continue;
        const dust = so.kind === 'switch' && track.branches[so.branch!]?.dust;
        const back = it.kind === 'wurmloch' && it.exit && track.segs[it.exit.seg].row < so.row;
        let want = it.on;
        if (it.kind === 'umleitung') want = dust ? !near.own : near.own;
        else if (it.kind === 'kanone') want = near.own;
        else if (it.kind === 'wurmloch') want = back ? !near.own : near.own;
        else if (it.kind === 'farbweiche') want = !dust;
        else if (it.kind === 'bruecke') want = true;
        if (want !== it.on) r.toggle(it.id, it.owner);
      }
    }

    function endRace() {
      if (phase !== 'race' || !race) return;
      phase = 'result';
      loop++;
      const r = race;
      const M = r.marbles.length;
      const mult = lastRound() ? 2 : 1;
      const points: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
      const finished: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
      const traps: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
      for (const i of r.finished) {
        const m = r.marbles[i];
        const pid = ids[m.owner];
        points[pid] += (M - m.place + 1) * POINTS.perPlace * mult;
        finished[pid]++;
      }
      const firstPid = r.finished.length ? ids[r.marbles[r.finished[0]].owner] : null;
      if (firstPid) points[firstPid] += POINTS.first * mult;
      for (const it of items) traps[ids[it.owner]] += it.trig;
      for (const id of ids) points[id] += Math.min(POINTS.trapMax, traps[id] * POINTS.trap) * mult;
      for (const id of ids) scores.add(id, points[id]);
      lastRace = { points, finished, firstPid, traps };
      // Abnutzung zählen, Teile altern
      for (const it of items) it.age++;
      items = items.filter((it) => it.age <= 1);
      const usage = r.segUse;
      ctx.setHostView({ screen: 'result', round, total, last: lastRound(), points, finished, traps, firstPid, before: raceStart, after: scores.snapshot(), perPlayer, mult });
      const rank = scores.ranking();
      ctx.setAllPlayerViews((p) => ({ screen: 'result', color: p.color, points: points[p.id] ?? 0, finished: finished[p.id] ?? 0, of: perPlayer, traps: traps[p.id] ?? 0, score: scores.get(p.id), place: rank.findIndex((x) => x.playerId === p.id) + 1, players: N }));
      race = null;
      if (lastRound()) return ctx.after(T.result, final);
      ctx.after(T.result, () => umbau(usage));
    }

    /** Die Bahn ändert sich ein kleines Stück */
    function umbau(usage: number[]) {
      phase = 'umbau';
      const rows = track.segs.filter((s) => s.role === 'row');
      lastUmbau = null;
      // Abnutzung jede 2. Runde: meistbenutzter Weg wird langsamer, am wenigsten benutzter schneller
      let wear: { worn: number; polished: number } | null = null;
      if (round % 2 === 0) {
        const sorted = rows.slice(1).sort((a, b) => usage[b.id] - usage[a.id]);
        const worn = sorted.find((s) => !track.marks.some((m) => m.seg === s.id));
        const polished = sorted.reverse().find((s) => !track.marks.some((m) => m.seg === s.id) && s !== worn);
        if (worn && polished) {
          worn.wear = 1.22;
          polished.wear = 0.82;
          track.marks.push({ seg: worn.id, kind: 'delle' }, { seg: polished.id, kind: 'poliert' });
          wear = { worn: worn.row + 1, polished: polished.row + 1 };
        }
      }
      const options: (() => void)[] = [];
      const dust = track.branches.find((b) => b.dust);
      if (dust && dust.base === 0) options.push(() => {
        dust.base = 0.25;
        const so = track.sockets.find((s) => s.branch === dust.id)!;
        lastUmbau = { key: 'umbau.dust', x: so.x, y: so.y };
      });
      const holdTurns = track.mixers.filter((m) => m.kind === 'trichter' || m.kind === 'nagel' || m.kind === 'wippe');
      if (holdTurns.length) options.push(() => {
        const m = holdTurns[Math.floor(Math.random() * holdTurns.length)];
        const kinds = (['trichter', 'nagel', 'wippe'] as const).filter((k) => k !== m.kind);
        const from = m.kind;
        m.kind = kinds[Math.floor(Math.random() * kinds.length)];
        track.turns[m.turn] = m.kind;
        lastUmbau = { key: 'umbau.swap', x: Math.round(m.x), y: Math.round(m.y), vars: { from, to: m.kind } };
      });
      options.push(() => {
        const so = addSocket(track);
        if (so) lastUmbau = { key: 'umbau.socket', x: so.x, y: so.y };
      });
      const shortB = track.branches.filter((b) => !b.dust && b.base < 0.3);
      if (shortB.length) options.push(() => {
        const b = shortB[Math.floor(Math.random() * shortB.length)];
        b.base = 0.3;
        const so = track.sockets.find((s) => s.branch === b.id)!;
        lastUmbau = { key: 'umbau.branch', x: so.x, y: so.y };
      });
      options[Math.floor(Math.random() * options.length)]();
      if (!lastUmbau) lastUmbau = { key: 'umbau.none', x: 600, y: 400 };
      if (wear) lastUmbau.vars = { ...(lastUmbau.vars ?? {}), worn: wear.worn, polished: wear.polished };
      trackV++;
      ctx.setHostView({ screen: 'umbau', round, total, geo: geo(track), trackV, items: publicItems(), umbau: lastUmbau, wear });
      ctx.setAllPlayerViews((p) => ({ screen: 'watch', color: p.color, key: 'phone.umbau' }));
      ctx.after(T.umbau, build);
    }

    function final() {
      phase = 'final';
      const ranking = scores.ranking();
      ctx.setHostView({ screen: 'final', ranking });
      ctx.setAllPlayerViews((p) => ({ screen: 'final', color: p.color, score: scores.get(p.id), place: ranking.findIndex((x) => x.playerId === p.id) + 1, of: ranking.length }));
      ctx.finish(ranking);
    }

    return {
      start: intro,
      onAction(id, a) {
        if (!a || !idx.has(id)) return;
        if (phase === 'build') {
          if (a.type === 'place') place(id, Number(a.card), Number(a.socket));
          else if (a.type === 'unplace') unplace(id, Number(a.card));
          else if (a.type === 'ready') setReady(id, a.on !== false);
        } else if (phase === 'race' && a.type === 'toggle' && race) {
          if (race.toggle(Number(a.item), idx.get(id)!)) phoneRace();
        }
      },
      onPlayerRejoin(id) {
        if (phase === 'build') playerBuild(id);
      },
      bot(id, view) {
        if (view?.screen !== 'build' || view.ready) return null;
        const hand = offers.get(id) ?? [];
        const mine = placed.get(id) ?? [];
        if (mine.length < maxPlace()) {
          const cards = shuffle(hand.map((_, c) => c).filter((c) => !mine.some((p) => p.card === c)));
          for (const c of cards) {
            const kind = hand[c];
            if (SORT[kind] === 'ereignis') return { type: 'place', card: c, socket: -1 };
            const occ = occupied();
            const free = shuffle(track.sockets.filter((s) => fits(kind, s) && !occ.has(s.id) && !mine.some((p) => p.socket === s.id)));
            if (free[0]) return { type: 'place', card: c, socket: free[0].id };
          }
        }
        return { type: 'ready' };
      },
      dispose() {
        loop++;
      },
    };
  },
} satisfies GameServerModule;
