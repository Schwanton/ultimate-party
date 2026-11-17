/**
 * Murmel-Mayhem – Murmelbahn aus Bausteinen mit echter 2D-Physik, Fallen, Hilfen und Klappen.
 *
 * Ablauf: Murmel-Werkstatt (Farbe und Muster) → Einführung → pro Runde: Bauen (geheim, erst eigene
 * Teile ersetzen) → Enthüllen → Kamerafahrt über die Bahn → Rennen (Server-Physik, 30 Bilder/s)
 * → Punktetafel → Umbau der Bahn. Gebaute Teile bleiben bis Spielende (höchstens 4 je Spieler).
 * Regeln und Zahlen: Konzept-Dokument „Murmel-Mayhem – Konzept“ und Projektstand, Reiter „Bau-Entscheidungen“.
 */

import { INPUT_GRACE, Scores, shuffle, type GameContext, type GameServerModule } from '@up/sdk';
import {
  HOLE, Race, SORT, TICK, TOGGLE, addSocket, generateGoodTrack, makeTube, newItem, railY, rowNumber, swapEnd, tubeForward,
  type CardKind, type Item, type ItemKind, type RaceEvent, type Socket, type Track,
} from './engine';
import { PALETTE, PATTERNS, contrast, nearestFree, validDesign, type Design } from './muster';

const T = { werkstatt: 45, intro: 16, build: 40, reveal: 2.2, revealPer: 0.45, flight: 16, result: 15, umbau: 5, raceMin: 70, afterFirst: 25, raceMax: 120 };
const POINTS = { perPlace: 10, first: 100, trap: 20, trapMax: 100 };
const ITEMS: ItemKind[] = ['turbo', 'feder', 'magnet', 'schild', 'kleber', 'schranke', 'gegenfeder', 'falltuer', 'wind', 'bremse', 'farbweiche', 'umleitung', 'wurmloch', 'kanone'];
const EVENTS: CardKind[] = ['beben', 'oel', 'riese', 'tausch'];
const STRONG: CardKind[] = ['turbo', 'kanone', 'schranke', 'farbweiche', 'magnet', 'falltuer'];
const MAX_REMOVE = 2;
const r1 = (n: number) => Math.round(n);

/** Bahn für Ansichten (TV vollständig, Handy vereinfacht) */
function geo(track: Track, phone = false) {
  return {
    W: track.W,
    H: r1(track.H),
    rows: track.rows.map((r) => ({ i: r.i, key: r.key, dir: r.dir, pts: r.pts.map(([x, y]) => [r1(x), r1(y)]), end: r.end, mid: r.mid, wear: r.wear })),
    segs: track.segs.filter((s) => !phone || s.kind === 'rail' || s.kind === 'glass').map((s) => ({ ax: r1(s.ax), ay: r1(s.ay), bx: r1(s.bx), by: r1(s.by), kind: s.kind })),
    pins: phone ? [] : track.pins.map((p) => [r1(p.x), r1(p.y)]),
    wippes: track.wippes,
    wheels: track.wheels.map((w) => ({ cx: r1(w.cx), cy: r1(w.cy), r: w.r, hub: w.hub, n: w.n })),
    conv: track.conv,
    rocker: track.rocker,
    loop: track.loop,
    spiral: track.spiral,
    sockets: track.sockets.map((s) => ({ id: s.id, x: s.x, y: s.y, row: s.row, hole: s.hole })),
    finish: track.finish,
    labels: phone ? [] : track.labels,
    marks: track.marks,
    route: track.route,
  };
}

interface Placement { card: number; socket: number }
type Fresh = { id: number; kind: CardKind; owner: string; x: number; y: number; moved: boolean };

export default {
  create(ctx: GameContext) {
    const ids = ctx.players.map((p) => p.id);
    const N = ids.length;
    const idx = new Map(ids.map((id, i) => [id, i]));
    const scores = new Scores(ids);
    const total = Number(ctx.options.rounds) || 5;
    const perPlayer = N <= 4 ? 6 : N <= 8 ? 4 : 3;
    const { track, check } = generateGoodTrack(4, 2);
    ctx.log('Murmel-Mayhem Bahn', track.rows.map((r) => `${r.key}:${r.mid ?? '-'}/${r.end}`).join(' '), 'Ähnlichkeit', check.rho.toFixed(2), 'Zeit', check.time.toFixed(0), 'im Ziel', check.done.toFixed(2));
    /** Höchstzahl Teile je Spieler: 4, bei vielen Spielern weniger (es gibt nur so viele Bauplätze) */
    const cap = () => Math.max(2, Math.min(4, Math.floor((track.sockets.length * 0.85) / N)));

    // Murmel-Design: jede Hauptfarbe gibt es nur einmal
    const designs = new Map<string, Design>();
    {
      const taken = new Set<number>();
      for (const id of ids) {
        const c = nearestFree(ctx.player(id)?.color ?? '#ffffff', taken);
        taken.add(c);
        designs.set(id, { c, c2: contrast(c), p: 'uni' });
      }
    }
    const designOf = () => Object.fromEntries(ids.map((id) => [id, designs.get(id)!]));
    const colorOf = (id: string) => PALETTE[designs.get(id)!.c];

    let trackV = 1;
    let round = 0;
    let phase: 'werkstatt' | 'intro' | 'build' | 'reveal' | 'flight' | 'race' | 'result' | 'umbau' | 'final' = 'werkstatt';
    let items: Item[] = [];
    let nextItemId = 1;
    let offers = new Map<string, CardKind[]>();
    let placed = new Map<string, Placement[]>();
    let removing = new Map<string, number[]>();
    let removeDone = new Set<string>();
    let ready = new Set<string>();
    let buildTimer: { cancel(): void; deadline: number; duration: number } | null = null;
    let race: Race | null = null;
    let loop = 0;
    let raceEvents: RaceEvent[] = [];
    let raceStart = scores.snapshot();
    let lastUmbau: { key: string; x: number; y: number; vars?: Record<string, string | number> } | null = null;
    let fresh: Fresh[] = [];

    const lastRound = () => round === total;
    const maxCards = () => (lastRound() ? 3 : 2);
    const mineItems = (id: string) => items.filter((it) => it.owner === idx.get(id));
    /** Wie viele neue Teile (ohne Ereignisse) darf der Spieler noch bauen? */
    const itemRoom = (id: string) => Math.max(0, cap() - mineItems(id).length);
    const occupied = () => new Set(items.map((it) => it.socket));
    const publicItems = () => items.map((it) => {
      const so = track.sockets[it.socket];
      return { id: it.id, kind: it.kind, owner: ids[it.owner], x: so.x, y: so.y, row: so.row, dir: track.rows[so.row].dir, born: it.born, on: it.on, toggle: TOGGLE.includes(it.kind), tube: it.tube ?? null, forward: it.tube ? tubeForward(track, it) : true };
    });
    const fits = (kind: CardKind, so: Socket) => {
      if (SORT[kind] === 'ereignis') return false;
      if (HOLE.includes(kind) && !so.hole) return false;
      return true;
    };

    /* ---------- Murmel-Werkstatt ---------- */
    let werkTimer: { cancel(): void; deadline: number; duration: number } | null = null;
    function werkstatt() {
      phase = 'werkstatt';
      ready = new Set();
      werkTimer = ctx.timer(T.werkstatt, intro, { grace: INPUT_GRACE });
      hostWerkstatt();
      for (const id of ids) playerWerkstatt(id);
    }
    function hostWerkstatt() {
      ctx.setHostView({ screen: 'werkstatt', players: ids, designs: designOf(), ready: [...ready], deadline: werkTimer!.deadline, duration: werkTimer!.duration });
    }
    function playerWerkstatt(id: string) {
      const taken = ids.filter((x) => x !== id).map((x) => designs.get(x)!.c);
      ctx.setPlayerView(id, { screen: 'werkstatt', design: designs.get(id), taken, ready: ready.has(id), deadline: werkTimer!.deadline, duration: werkTimer!.duration, color: colorOf(id) });
    }
    function setDesign(id: string, raw: unknown) {
      const d = validDesign(raw);
      if (!d || ready.has(id)) return playerWerkstatt(id);
      if (ids.some((x) => x !== id && designs.get(x)!.c === d.c)) d.c = designs.get(id)!.c;
      designs.set(id, d);
      playerWerkstatt(id);
      hostWerkstatt();
      // andere Handys: belegte Farben aktualisieren
      for (const x of ids) if (x !== id) playerWerkstatt(x);
    }
    function werkReady(id: string, on: boolean) {
      if (on) ready.add(id);
      else ready.delete(id);
      playerWerkstatt(id);
      hostWerkstatt();
      if (ready.size >= ids.filter((x) => ctx.player(x)?.connected !== false).length) {
        werkTimer?.cancel();
        intro();
      }
    }

    /* ---------- Angebote ---------- */
    function makeOffers() {
      offers = new Map();
      const rank = scores.ranking();
      const behind = new Set(rank.slice(Math.ceil(rank.length / 2)).map((r) => r.playerId));
      for (const id of ids) {
        const weight = (k: CardKind) => (behind.has(id) && round > 1 && STRONG.includes(k) ? 1.7 : 1);
        const draw = (from: CardKind[]) => {
          const sum = from.reduce((a, k) => a + weight(k), 0);
          let r = Math.random() * sum;
          for (const k of from) if ((r -= weight(k)) <= 0) return k;
          return from[from.length - 1];
        };
        const hand: CardKind[] = [];
        while (hand.length < 3) {
          const k = Math.random() < 1 / 6 ? EVENTS[Math.floor(Math.random() * EVENTS.length)] : draw(ITEMS);
          if (hand.includes(k) && Math.random() < 0.7) continue;
          hand.push(k);
        }
        if (!hand.some((k) => SORT[k] === 'weiche')) hand[Math.floor(Math.random() * 3)] = draw(ITEMS.filter((k) => SORT[k] === 'weiche'));
        offers.set(id, hand);
      }
    }

    /* ---------- Phasen ---------- */
    function intro() {
      if (phase !== 'werkstatt') return;
      phase = 'intro';
      werkTimer?.cancel();
      ctx.setHostView({ screen: 'intro', geo: geo(track), trackV, perPlayer, total, cap: cap(), designs: designOf(), players: ids });
      ctx.setAllPlayerViews((p) => ({ screen: 'intro', color: colorOf(p.id), design: designs.get(p.id), perPlayer }));
      ctx.after(T.intro, build);
    }

    function build() {
      round++;
      phase = 'build';
      makeOffers();
      placed = new Map(ids.map((id) => [id, []]));
      removing = new Map(ids.map((id) => [id, []]));
      removeDone = new Set(ids.filter((id) => mineItems(id).length === 0));
      ready = new Set();
      buildTimer = ctx.timer(T.build, reveal, { grace: INPUT_GRACE });
      hostBuild();
      for (const id of ids) playerBuild(id);
    }

    function hostBuild() {
      ctx.setHostView({ screen: 'build', players: ids, round, total, last: lastRound(), deadline: buildTimer!.deadline, duration: buildTimer!.duration, ready: [...ready], geo: geo(track), trackV, items: publicItems(), umbau: lastUmbau, designs: designOf(), cap: cap() });
    }

    function playerBuild(id: string) {
      const mine = mineItems(id);
      const step = removeDone.has(id) ? 'place' : 'remove';
      ctx.setPlayerView(id, {
        screen: 'build', step, round, total, max: maxCards(), room: itemRoom(id), cap: cap(), color: colorOf(id), design: designs.get(id),
        deadline: buildTimer!.deadline, duration: buildTimer!.duration,
        offers: offers.get(id) ?? [], placed: placed.get(id) ?? [], ready: ready.has(id),
        geo: geo(track, true), trackV,
        taken: [...occupied()],
        mine: mine.map((it) => ({ id: it.id, kind: it.kind, row: rowNumber(track, track.sockets[it.socket].row) })),
        removing: removing.get(id) ?? [], maxRemove: Math.min(MAX_REMOVE, mine.length),
        items: publicItems().map((it) => ({ id: it.id, kind: it.kind, x: it.x, y: it.y, mine: it.owner === id })),
      });
    }

    function toggleRemove(id: string, itemId: number) {
      if (removeDone.has(id) || ready.has(id)) return;
      const list = removing.get(id)!;
      const k = list.indexOf(itemId);
      if (k >= 0) list.splice(k, 1);
      else if (list.length < MAX_REMOVE && mineItems(id).some((it) => it.id === itemId)) list.push(itemId);
      playerBuild(id);
    }

    /** Ausgewählte eigene Teile kommen weg, danach wird gebaut */
    function confirmRemove(id: string) {
      if (removeDone.has(id)) return;
      const list = new Set(removing.get(id)!);
      items = items.filter((it) => !(list.has(it.id) && it.owner === idx.get(id)));
      removeDone.add(id);
      playerBuild(id);
      hostBuild();
      for (const x of ids) if (x !== id) playerBuild(x);
    }

    function itemsPlaced(id: string) {
      const hand = offers.get(id) ?? [];
      return (placed.get(id) ?? []).filter((p) => SORT[hand[p.card]] !== 'ereignis').length;
    }

    function place(id: string, card: number, socket: number) {
      const hand = offers.get(id);
      const mine = placed.get(id);
      if (!hand || !mine || ready.has(id) || !removeDone.has(id) || card < 0 || card >= hand.length) return;
      const kind = hand[card];
      const existing = mine.findIndex((p) => p.card === card);
      if (existing >= 0) mine.splice(existing, 1);
      if (mine.length >= maxCards()) return playerBuild(id);
      if (SORT[kind] === 'ereignis') mine.push({ card, socket: -1 });
      else {
        if (itemsPlaced(id) >= itemRoom(id)) return playerBuild(id);
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
      if (on && !removeDone.has(id)) confirmRemove(id);
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
      for (const id of ids) if (!removeDone.has(id)) { removing.set(id, []); removeDone.add(id); }
      for (const id of ids) {
        const mine = placed.get(id)!;
        const hand = offers.get(id)!;
        const taken = new Set([...occupied(), ...mine.map((p) => p.socket)]);
        for (let c = 0; c < hand.length && mine.length < maxCards(); c++) {
          if (mine.some((p) => p.card === c)) continue;
          if (SORT[hand[c]] === 'ereignis') { mine.push({ card: c, socket: -1 }); continue; }
          if (itemsPlaced(id) >= itemRoom(id)) continue;
          const free = shuffle(track.sockets.filter((s) => fits(hand[c], s) && !taken.has(s.id)));
          if (free[0]) { mine.push({ card: c, socket: free[0].id }); taken.add(free[0].id); }
        }
      }
      const order = shuffle(ids).sort((a, b) => scores.get(a) - scores.get(b));
      const claimed = occupied();
      fresh = [];
      raceEvents = [];
      const wants: { pid: string; kind: CardKind; socket: number }[] = [];
      for (const pid of order) for (const p of placed.get(pid)!) wants.push({ pid, kind: offers.get(pid)![p.card], socket: p.socket });
      const later: typeof wants = [];
      for (const w of wants) {
        if (SORT[w.kind] === 'ereignis') {
          raceEvents.push({ kind: w.kind as RaceEvent['kind'], owner: idx.get(w.pid)!, at: 14 + Math.random() * 24 });
          fresh.push({ id: -1, kind: w.kind, owner: w.pid, x: -1, y: -1, moved: false });
          continue;
        }
        if (claimed.has(w.socket)) { later.push(w); continue; }
        claimed.add(w.socket);
        addItem(w.pid, w.kind as ItemKind, w.socket, false);
      }
      for (const w of later) {
        const want = track.sockets[w.socket];
        const alt = track.sockets
          .filter((s) => !claimed.has(s.id) && fits(w.kind, s))
          .sort((a, b) => Math.hypot(a.x - want.x, a.y - want.y) - Math.hypot(b.x - want.x, b.y - want.y))[0];
        if (!alt) continue;
        claimed.add(alt.id);
        addItem(w.pid, w.kind as ItemKind, alt.id, true);
      }
      const dur = T.reveal + fresh.length * T.revealPer;
      ctx.setHostView({ screen: 'reveal', round, total, geo: geo(track), trackV, items: publicItems(), fresh, dur, designs: designOf() });
      ctx.setAllPlayerViews((p) => ({ screen: 'watch', color: colorOf(p.id), design: designs.get(p.id), key: 'phone.reveal', mine: fresh.filter((f) => f.owner === p.id) }));
      ctx.after(dur, flight);
    }

    function addItem(pid: string, kind: ItemKind, socket: number, moved: boolean) {
      const so = track.sockets[socket];
      const it = newItem(nextItemId++, kind, idx.get(pid)!, socket, round);
      if (kind === 'wurmloch') it.tube = makeTube(track, so);
      items.push(it);
      fresh.push({ id: it.id, kind, owner: pid, x: so.x, y: so.y, moved });
    }

    /** Kamerafahrt über die ganze Bahn, neue Teile leuchten auf */
    function flight() {
      phase = 'flight';
      ctx.setHostView({ screen: 'flight', round, total, geo: geo(track), trackV, items: publicItems(), fresh: fresh.filter((f) => f.id > 0).map((f) => f.id), dur: T.flight, players: ids, designs: designOf() });
      ctx.setAllPlayerViews((p) => ({ screen: 'watch', color: colorOf(p.id), design: designs.get(p.id), key: 'phone.flight' }));
      ctx.after(T.flight, startRace);
    }

    /* ---------- Rennen ---------- */
    function startRace() {
      phase = 'race';
      const rank = new Map(scores.ranking().map((r, k) => [r.playerId, k]));
      const list: { owner: number; key: number }[] = [];
      for (const id of ids) for (let k = 0; k < perPlayer; k++) list.push({ owner: idx.get(id)!, key: Math.random() - (round > 1 ? ((rank.get(id) ?? 0) / Math.max(1, N - 1)) * 0.35 : 0) });
      list.sort((a, b) => a.key - b.key);
      const owners = list.map((l) => l.owner);
      for (const it of items) Object.assign(it, { trig: 0, used: 0, cool: 0, closedUntil: 0, readyAt: 0, gustUntil: 0, kickAt: -9, hit: new Set<number>() });
      race = new Race(track, owners, items, raceEvents);
      raceStart = scores.snapshot();
      ctx.setHostView({ screen: 'race', players: ids, round, total, geo: geo(track), trackV, items: publicItems(), n: owners.length, startedAt: Date.now(), designs: designOf(), mult: lastRound() ? 2 : 1 });
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
        if (end) return ctx.after(race.done ? 1.5 : 0.4, endRace);
        ctx.after(TICK, tick);
      };
      ctx.after(TICK, tick);
    }

    function streamFrame() {
      const r = race!;
      ctx.stream({
        round, t: Math.round(r.t * 10) / 10,
        m: r.frame(),
        o: r.order(),
        p: r.marbles.map((m) => Math.round(r.share(m.i) * 1000)),
        ow: r.marbles.map((m) => m.owner),
        it: items.map((it) => [it.id, (it.on ? 1 : 0) | (r.t < it.closedUntil ? 2 : 0) | (r.t < it.gustUntil ? 4 : 0) | (r.t - it.kickAt < 0.3 ? 8 : 0), r.left(it)]),
        w: r.wippe.map((w) => Math.round(w.a * 100)),
        b: r.blocks(),
        fx: r.fx,
        g: r.giantPos(),
        q: r.t < r.quakeUntil ? 1 : 0,
        oil: r.oil && r.t < r.oil.until ? r.oil.row : -1,
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
        const place = best < 0 ? -1 : order.slice(0, best + 1).reduce((acc, i) => acc.add(r.marbles[i].owner), new Set<number>()).size;
        ctx.setPlayerView(id, {
          screen: 'race', round, total, color: colorOf(id), design: designs.get(id), geo: geo(track, true), trackV,
          mine: mine.map((m) => [Math.round(m.x), Math.round(m.on ? m.y : -60), m.place ? 1 : 0]),
          others: r.marbles.filter((m) => m.owner !== o && m.on).map((m) => [Math.round(m.x), Math.round(m.y)]),
          done: mine.filter((m) => m.place).length, of: mine.length,
          place,
          toggles: items.filter((it) => it.owner === o && TOGGLE.includes(it.kind)).map((it) => {
            const so = track.sockets[it.socket];
            return { id: it.id, kind: it.kind, on: it.on, row: rowNumber(track, so.row), readyAt: it.cool > r.t ? now + (it.cool - r.t) * 1000 : 0, x: so.x, y: so.y, forward: it.tube ? tubeForward(track, it) : true };
          }),
        });
      }
    }

    /** Testspieler legen ihre Klappen so, dass es eigenen Murmeln hilft */
    function botToggles() {
      const r = race!;
      for (const it of items) {
        if (!TOGGLE.includes(it.kind) || !ctx.player(ids[it.owner])?.isBot || r.t < it.cool) continue;
        const so = track.sockets[it.socket];
        const row = track.rows[so.row];
        const dir = row.dir;
        let near: { own: boolean; d: number } | null = null;
        for (const m of r.marbles) {
          if (!m.on || m.place || Math.abs(m.y - (railY(row, m.x) - 13)) > 30) continue;
          const d = (so.x - m.x) * dir;
          if (d < 0 || d > 320) continue;
          if (!near || d < near.d) near = { own: m.owner === it.owner, d };
        }
        if (!near) continue;
        let want = it.on;
        if (it.kind === 'umleitung' || it.kind === 'kanone') want = near.own;
        else if (it.kind === 'wurmloch') want = tubeForward(track, it) ? near.own : !near.own;
        else if (it.kind === 'farbweiche') want = true;
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
      const trapPts: Record<string, number> = {};
      /** je Murmel: [Spieler-Nr., Platz, Punkte] */
      const marbles: [number, number, number][] = [];
      for (const i of r.finished) {
        const m = r.marbles[i];
        const pid = ids[m.owner];
        const pts = ((M - m.place + 1) * POINTS.perPlace + (m.place === 1 ? POINTS.first : 0)) * mult;
        points[pid] += pts;
        finished[pid]++;
        marbles.push([m.owner, m.place, pts]);
      }
      const firstPid = r.finished.length ? ids[r.marbles[r.finished[0]].owner] : null;
      for (const it of items) traps[ids[it.owner]] += it.trig;
      for (const id of ids) {
        trapPts[id] = Math.min(POINTS.trapMax, traps[id] * POINTS.trap) * mult;
        points[id] += trapPts[id];
      }
      for (const id of ids) scores.add(id, points[id]);
      const rowTime = r.rowTime;
      ctx.setHostView({ screen: 'result', round, total, last: lastRound(), players: ids, points, finished, traps, trapPts, marbles, firstPid, before: raceStart, after: scores.snapshot(), perPlayer, mult, designs: designOf() });
      const rank = scores.ranking();
      ctx.setAllPlayerViews((p) => ({ screen: 'result', color: colorOf(p.id), design: designs.get(p.id), points: points[p.id] ?? 0, finished: finished[p.id] ?? 0, of: perPlayer, traps: traps[p.id] ?? 0, score: scores.get(p.id), place: rank.findIndex((x) => x.playerId === p.id) + 1, players: N }));
      race = null;
      if (lastRound()) return ctx.after(T.result, final);
      ctx.after(T.result, () => umbau(rowTime));
    }

    /** Die Bahn ändert sich ein kleines Stück */
    function umbau(rowTime: number[]) {
      phase = 'umbau';
      lastUmbau = null;
      // Abnutzung jede 2. Runde: Reihe mit der meisten Rollzeit bekommt eine Delle, die mit der wenigsten wird poliert
      let wear: { worn: number; polished: number } | null = null;
      if (round % 2 === 0) {
        const free = track.rows.filter((row) => row.i > 0 && row.key !== 'B' && !track.marks.some((m) => m.row === row.i));
        const sorted = free.sort((a, b) => rowTime[b.i] - rowTime[a.i]);
        const worn = sorted[0], polished = sorted[sorted.length - 1];
        if (worn && polished && worn !== polished) {
          worn.wear = 4;
          polished.wear = 0;
          track.marks.push({ row: worn.i, kind: 'delle' }, { row: polished.i, kind: 'poliert' });
          wear = { worn: rowNumber(track, worn.i), polished: rowNumber(track, polished.i) };
        }
      }
      const options: (() => void)[] = [
        () => {
          const ch = swapEnd(track);
          if (!ch) return;
          const r = track.rows[ch.row];
          const e = r.pts[r.pts.length - 1];
          lastUmbau = { key: ch.from === 'offen' ? 'umbau.added' : ch.to === 'offen' ? 'umbau.removed' : 'umbau.swap', x: e[0], y: Math.round(e[1]) + 40, vars: { from: ch.from, to: ch.to, row: rowNumber(track, ch.row) } };
        },
        () => {
          const so = addSocket(track);
          if (so) lastUmbau = { key: 'umbau.socket', x: so.x, y: so.y };
        },
      ];
      options[Math.floor(Math.random() * options.length)]();
      if (!lastUmbau) lastUmbau = { key: 'umbau.none', x: 1200, y: 400 };
      if (wear) lastUmbau.vars = { ...(lastUmbau.vars ?? {}), worn: wear.worn, polished: wear.polished };
      trackV++;
      ctx.setHostView({ screen: 'umbau', round, total, geo: geo(track), trackV, items: publicItems(), umbau: lastUmbau, wear, designs: designOf() });
      ctx.setAllPlayerViews((p) => ({ screen: 'watch', color: colorOf(p.id), design: designs.get(p.id), key: 'phone.umbau' }));
      ctx.after(T.umbau, build);
    }

    function final() {
      phase = 'final';
      const ranking = scores.ranking();
      ctx.setHostView({ screen: 'final', ranking, designs: designOf() });
      ctx.setAllPlayerViews((p) => ({ screen: 'final', color: colorOf(p.id), design: designs.get(p.id), score: scores.get(p.id), place: ranking.findIndex((x) => x.playerId === p.id) + 1, of: ranking.length }));
      ctx.finish(ranking);
    }

    return {
      start: werkstatt,
      onAction(id, a) {
        if (!a || !idx.has(id)) return;
        if (phase === 'werkstatt') {
          if (a.type === 'design') setDesign(id, a.design);
          else if (a.type === 'ready') werkReady(id, a.on !== false);
        } else if (phase === 'build') {
          if (a.type === 'rmToggle') toggleRemove(id, Number(a.item));
          else if (a.type === 'rmDone') confirmRemove(id);
          else if (a.type === 'place') place(id, Number(a.card), Number(a.socket));
          else if (a.type === 'unplace') unplace(id, Number(a.card));
          else if (a.type === 'ready') setReady(id, a.on !== false);
        } else if (phase === 'race' && a.type === 'toggle' && race) {
          if (race.toggle(Number(a.item), idx.get(id)!)) phoneRace();
        }
      },
      onPlayerRejoin(id) {
        if (phase === 'build') playerBuild(id);
        if (phase === 'werkstatt') playerWerkstatt(id);
      },
      bot(id, view) {
        if (view?.screen === 'werkstatt') {
          if (view.ready) return null;
          const d = designs.get(id)!;
          if (d.p === 'uni' && Math.random() < 0.8) {
            const taken = new Set(ids.filter((x) => x !== id).map((x) => designs.get(x)!.c));
            const free = PALETTE.map((_, k) => k).filter((k) => !taken.has(k));
            const c = free[Math.floor(Math.random() * free.length)] ?? d.c;
            return { type: 'design', design: { c, c2: Math.floor(Math.random() * PALETTE.length), p: PATTERNS[1 + Math.floor(Math.random() * (PATTERNS.length - 1))] } };
          }
          return { type: 'ready' };
        }
        if (view?.screen !== 'build' || view.ready) return null;
        if (view.step === 'remove') {
          const mine = mineItems(id);
          const want = mine.length >= cap() ? 1 + Math.floor(Math.random() * Math.min(MAX_REMOVE, mine.length)) : Math.random() < 0.3 ? 1 : 0;
          const list = removing.get(id) ?? [];
          if (list.length < want) {
            const cand = mine.filter((it) => !list.includes(it.id));
            if (cand[0]) return { type: 'rmToggle', item: cand[Math.floor(Math.random() * cand.length)].id };
          }
          return { type: 'rmDone' };
        }
        const hand = offers.get(id) ?? [];
        const mine = placed.get(id) ?? [];
        if (mine.length < maxCards()) {
          const cards = shuffle(hand.map((_, c) => c).filter((c) => !mine.some((p) => p.card === c)));
          for (const c of cards) {
            const kind = hand[c];
            if (SORT[kind] === 'ereignis') return { type: 'place', card: c, socket: -1 };
            if (itemsPlaced(id) >= itemRoom(id)) continue;
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
