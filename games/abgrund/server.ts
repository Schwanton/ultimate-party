/**
 * Abgrund – kooperatives Deckbuilding-Roguelike (Etappe 2: Akt I).
 * Lager (Klassenwahl) → Pfadkarte mit Abstimmung → Stationen (Kampf, Elite, Ereignis, Händler, Lagerfeuer, Schatz) → Boss.
 * Der Run wird vor jeder Wegwahl gespeichert und kann im Lager fortgesetzt werden.
 */

import type { GameContext, GameServerModule } from '@up/sdk';
import {
  BOSSES, CARD, CLASSES, CLASS_IDS, ENEMIES, EVENTS, FIGHT_POOLS, GOLD, LEVELS, NODE_DESC, NODE_NAME, PRICE, RELICS, SIGHT,
  type ClassId, type EventDef, type FightSpec,
} from './data';
import {
  addCard, addRelic, afterFight, botPlan, cardOf, cardText, cost, fixHero, goldGain, heal, legendaryOffer, newFight, newHero, planCard,
  plannedCost, previewDamage, randomRelic, rareOffer, removeCard, resolveRound, rewardOffer, shopCards, shuffle, startRound,
  totalDuration, unplan, upgradeCard, type Fight, type Hero, type TimedEv,
} from './engine';
import { generateMap, nodeById, type ActMap } from './map';

/** Begleiter: vom Spiel gesteuerte Mitstreiter, die der VIP im Lager dazuholt */
interface Comp { id: string; name: string; color: string }
const COMP_NAMES = ['Alrik', 'Brann', 'Cora', 'Dorn', 'Elva', 'Fenn', 'Hagen', 'Ilsa', 'Jorin', 'Kara', 'Lute'];
const COMP_COLORS = ['#c9a26b', '#9fb8a0', '#b79bc4', '#d08f6c', '#8fb2c9', '#c4b26b', '#a8a8a8', '#c98f9f', '#8fc9b7', '#b9a58a', '#9f9fd0'];
const MAX_HEROES = 12;
const VOTE_TIME = 20;

interface SavedRun {
  v: 2;
  map: ActMap;
  path: string[];
  boss: string;
  seen: string[];
  removes: Record<string, number>;
  heroes: { name: string; hero: Hero; comp?: Comp }[];
  at: number;
}

type Phase = 'lager' | 'map' | 'plan' | 'resolve' | 'reward' | 'shop' | 'camp' | 'event' | 'treasure' | 'bossIntro' | 'end';
type FightKind = 'fight' | 'elite' | 'boss' | 'eventRelic' | 'eventRare';

interface ShopOffer { cards: { id: string; price: number; sold: boolean }[]; relics: { id: string; price: number; sold: boolean }[]; removed: boolean }
interface CampChoice { kind: 'rest' | 'forge' | 'watch'; uid?: string; target?: string }
interface RewardInfo { gold: number; relic: string | null; healed: number; offer: string[] }

const rnd = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const round5 = (n: number) => Math.round(n / 5) * 5;

export default {
  create(ctx: GameContext) {
    const ids = ctx.players.map((p) => p.id);
    const planTime = Number(ctx.options.planTime) || 0;
    let phase: Phase = 'lager';
    const choice = new Map<string, ClassId>();
    const lagerReady = new Set<string>();
    let heroes: Hero[] = [];
    let comps: Comp[] = [];

    // Run
    let map: ActMap = { nodes: [] };
    /** besuchte Stationen in Reihenfolge; die letzte ist die aktuelle */
    let path: string[] = [];
    let boss = 'grubenmutter';
    let seen: string[] = [];
    let removes: Record<string, number> = {};

    // Kampf
    let fight: Fight | null = null;
    let fightKind: FightKind = 'fight';
    let events: TimedEv[] = [];
    let resolveStart = 0;
    let token = 0; // zeitgesteuerte Abläufe: veraltete Rückrufe werden ignoriert
    let planTimer: { cancel(): void } | null = null;
    let planDeadline = 0;

    // Abstimmung
    let vote: { kind: 'map' | 'event'; options: string[]; votes: Map<string, string>; deadline: number; timer: { cancel(): void } | null; winner?: string } | null = null;

    // Stationen
    const done = new Set<string>();
    const rewards = new Map<string, RewardInfo>();
    const picked = new Map<string, string | null>();
    const shop = new Map<string, ShopOffer>();
    let lastBuy: { id: string; text: string; at: number } | null = null;
    const camp = new Map<string, CampChoice>();
    let campResult: { id: string; text: string }[] | null = null;
    let ev: { def: EventDef; stage: 'vote' | 'choose' | 'result'; choice?: string; results: { id: string; text: string }[] } | null = null;
    const evPick = new Map<string, string>();
    const treasure = new Map<string, string | null>();
    let result: 'win' | 'lose' | null = null;
    let rewardApplied = false;

    const compOf = (id: string) => comps.find((c) => c.id === id);
    /** Alle Helden-IDs: Mitspieler, dann Begleiter */
    const allIds = () => [...ids, ...comps.map((c) => c.id)];
    const isBot = (id: string) => !!compOf(id) || !!ctx.player(id)?.isBot;
    const connected = (id: string) => !!ctx.player(id)?.connected || isBot(id);
    const heroOf = (id: string) => heroes.find((h) => h.id === id);
    const nameOf = (id: string) => compOf(id)?.name ?? ctx.player(id)?.name ?? '?';
    const randomClass = () => CLASS_IDS[Math.floor(Math.random() * CLASS_IDS.length)];
    const isSolo = () => (heroes.length || allIds().length) === 1;
    const pos = () => path[path.length - 1] ?? null;
    const node = () => (pos() ? nodeById(map, pos()!) : undefined);
    const level = () => node()?.lv ?? 0;
    /** Wer abstimmt: verbundene, echte Spieler */
    const voters = () => ids.filter((id) => !isBot(id) && ctx.player(id)?.connected);

    /** Gespeicherter Run passt, wenn gleich viele echte Spieler mitspielen (Begleiter kommen aus dem Speicher) */
    const saved = () => {
      const s = ctx.store.get<SavedRun>('run');
      return s && s.v === 2 && s.heroes.filter((x) => !x.comp).length === ids.length ? s : null;
    };
    const savedLevel = (s: SavedRun) => (s.path.length ? nodeById(s.map, s.path[s.path.length - 1])?.lv ?? 0 : 0);

    function setComps(n: number) {
      n = Math.max(0, Math.min(MAX_HEROES - ids.length, n));
      while (comps.length > n) { const c = comps.pop()!; choice.delete(c.id); lagerReady.delete(c.id); }
      while (comps.length < n) {
        const k = comps.length;
        const c = { id: `comp-${k}`, name: COMP_NAMES[k % COMP_NAMES.length], color: COMP_COLORS[k % COMP_COLORS.length] };
        comps.push(c);
        choice.set(c.id, randomClass());
        lagerReady.add(c.id);
      }
    }

    function saveRun() {
      ctx.store.set('run', { v: 2, map, path, boss, seen, removes, heroes: heroes.map((h) => ({ name: nameOf(h.id), hero: h, comp: compOf(h.id) })), at: Date.now() } satisfies SavedRun);
    }

    /* ---------------- Lager ---------------- */

    function startLager() {
      phase = 'lager';
      for (const id of ids) if (isBot(id)) { choice.set(id, randomClass()); lagerReady.add(id); }
      // Nur Testspieler (z. B. Simulation): sofort losspielen
      if (ids.every(isBot)) return newRun();
      broadcast();
    }

    function newRun() {
      heroes = allIds().map((id) => newHero(id, choice.get(id) ?? CLASS_IDS[0]));
      map = generateMap();
      path = [];
      boss = pick([...BOSSES]);
      seen = [];
      removes = {};
      startMap();
    }

    function continueRun() {
      const s = saved();
      if (!s) return;
      const free = s.heroes.filter((x) => !x.comp);
      heroes = [];
      comps = s.heroes.filter((x) => x.comp).map((x) => x.comp!);
      // gleiche Namen zuerst, Rest der Reihe nach
      const byName = new Map<string, Hero>();
      for (const id of ids) {
        const i = free.findIndex((x) => x.name === nameOf(id));
        if (i >= 0) byName.set(id, free.splice(i, 1)[0].hero);
      }
      const newId = new Map<string, string>();
      for (const id of ids) {
        const h = byName.get(id) ?? free.shift()!.hero;
        newId.set(h.id, id);
        heroes.push(fixHero({ ...h, id }));
      }
      for (const x of s.heroes) if (x.comp) heroes.push(fixHero({ ...x.hero, id: x.comp.id }));
      map = s.map;
      path = s.path ?? [];
      boss = s.boss;
      seen = s.seen ?? [];
      removes = Object.fromEntries(Object.entries(s.removes ?? {}).map(([k, v]) => [newId.get(k) ?? k, v]));
      startMap();
    }

    /* ---------------- Pfadkarte und Abstimmung ---------------- */

    function startMap() {
      phase = 'map';
      fight = null;
      ev = null;
      saveRun();
      const options = pos() ? node()!.next : map.nodes.filter((n) => n.lv === 1).map((n) => n.id);
      startVote('map', options);
    }

    function startVote(kind: 'map' | 'event', options: string[]) {
      vote?.timer?.cancel();
      const t = ++token;
      vote = { kind, options, votes: new Map(), deadline: 0, timer: null };
      if (options.length === 1 || !voters().length) {
        // nur ein Weg oder niemand zum Abstimmen: kurz zeigen, dann weiter
        vote.winner = options.length === 1 ? options[0] : pick(options);
        broadcast();
        ctx.after(options.length === 1 ? 3 : 2, () => t === token && finishVote());
        return;
      }
      vote.timer = ctx.timer(VOTE_TIME, () => t === token && finishVote());
      vote.deadline = Date.now() + VOTE_TIME * 1000;
      broadcast();
    }

    function castVote(id: string, option: string) {
      if (!vote || vote.winner || !vote.options.includes(option) || isBot(id)) return;
      vote.votes.set(id, option);
      broadcast();
      if (voters().every((v) => vote!.votes.has(v))) {
        const t = token;
        ctx.after(0.8, () => t === token && finishVote());
      }
    }

    function finishVote() {
      if (!vote) return;
      vote.timer?.cancel();
      let winner = vote.winner;
      if (!winner) {
        const count = new Map<string, number>();
        for (const o of vote.votes.values()) count.set(o, (count.get(o) ?? 0) + 1);
        const max = Math.max(0, ...count.values());
        const top = max ? [...count.entries()].filter(([, n]) => n === max).map(([o]) => o) : vote.options;
        winner = pick(top);
      }
      const kind = vote.kind;
      vote = null;
      token++;
      if (kind === 'map') enterNode(winner);
      else applyGroupEvent(winner);
    }

    function enterNode(id: string) {
      path.push(id);
      const n = node()!;
      if (n.type === 'fight') return startFight(pick(FIGHT_POOLS[n.lv <= 3 ? 'easy' : 'normal']), 'fight');
      if (n.type === 'elite') return startFight(pick(FIGHT_POOLS.elite), 'elite');
      if (n.type === 'boss') {
        phase = 'bossIntro';
        broadcast();
        const t = ++token;
        ctx.after(5, () => t === token && startFight({ enemies: [boss], boss: true }, 'boss'));
        return;
      }
      if (n.type === 'event') return startEvent();
      if (n.type === 'shop') return startShop();
      if (n.type === 'camp') return startCamp();
      if (n.type === 'treasure') return startTreasure();
    }

    /* ---------------- Kampf ---------------- */

    function startFight(spec: FightSpec, kind: FightKind) {
      fight = newFight(spec, heroes);
      fightKind = kind;
      nextRound();
    }

    function nextRound() {
      if (!fight) return;
      startRound(fight);
      phase = 'plan';
      for (const h of fight.heroes) if (isBot(h.id)) { botPlan(fight, h); h.ready = true; }
      planTimer?.cancel();
      planDeadline = 0;
      if (planTime) {
        planTimer = ctx.timer(planTime, () => {
          // Zeit um: wer nichts geplant hat, bekommt automatisch Karten (wie ein Testspieler)
          for (const h of fight!.heroes) if (!h.ready) { if (!h.plan.length) botPlan(fight!, h); h.ready = true; }
          checkAllReady();
        });
        planDeadline = Date.now() + planTime * 1000;
      }
      broadcast();
      checkAllReady();
    }

    function checkAllReady() {
      if (phase !== 'plan' || !fight) return;
      if (!fight.heroes.every((h) => h.ready)) return;
      planTimer?.cancel();
      events = resolveRound(fight);
      phase = 'resolve';
      resolveStart = Date.now() + 400;
      const t = ++token;
      broadcast();
      ctx.after(totalDuration(events) + 1.2, () => t === token && afterResolve());
    }

    function afterResolve() {
      if (!fight || phase !== 'resolve') return;
      if (fight.over === 'lose') return endRun('lose');
      if (fight.over === 'win') return startReward();
      nextRound();
    }

    /* ---------------- Belohnung nach dem Kampf ---------------- */

    function startReward() {
      phase = 'reward';
      rewards.clear();
      picked.clear();
      rewardApplied = false;
      const elite = fightKind === 'elite';
      for (const h of heroes) {
        const base = fightKind === 'boss' ? 0 : elite ? rnd(GOLD.elite[0], GOLD.elite[1]) : rnd(GOLD.fight[0], GOLD.fight[1]);
        const gold = goldGain(h, base);
        h.gold += gold;
        const healed = afterFight(h);
        let relic: string | null = null;
        if (elite || fightKind === 'eventRelic') {
          relic = randomRelic(h);
          if (relic) addRelic(h, relic);
        }
        const offer = fightKind === 'boss' ? legendaryOffer(h.cls) : fightKind === 'eventRare' ? rareOffer(h.cls) : rewardOffer(h.cls, elite);
        rewards.set(h.id, { gold, relic, healed, offer });
        if (isBot(h.id)) picked.set(h.id, Math.random() < 0.85 ? offer[0] ?? null : null);
      }
      broadcast();
      checkRewardDone();
    }

    function checkRewardDone() {
      if (phase !== 'reward' || rewardApplied || !heroes.every((h) => picked.has(h.id))) return;
      rewardApplied = true;
      for (const h of heroes) {
        const c = picked.get(h.id);
        if (c) addCard(h, c);
      }
      broadcast();
      const t = ++token;
      if (fightKind === 'boss') ctx.after(2, () => t === token && endRun('win'));
      else ctx.after(1.5, () => t === token && startMap());
    }

    /* ---------------- Händler ---------------- */

    function startShop() {
      phase = 'shop';
      shop.clear();
      done.clear();
      lastBuy = null;
      for (const h of heroes) {
        const cards = shopCards(h.cls).map((id) => ({ id, price: round5(PRICE[CARD[id].rarity as 'common' | 'uncommon' | 'rare'] * (0.9 + Math.random() * 0.2)), sold: false }));
        const r1 = randomRelic(h);
        const r2 = r1 ? randomRelic(h, [r1]) : null;
        const relics = [r1, r2].filter((x): x is string => !!x).map((id) => ({ id, price: RELICS[id].risky ? PRICE.riskyRelic : PRICE.relic, sold: false }));
        shop.set(h.id, { cards, relics, removed: false });
        if (isBot(h.id)) botShop(h);
      }
      broadcast();
      checkShopDone();
    }

    const removePrice = (id: string) => PRICE.remove + PRICE.removeStep * (removes[id] ?? 0);

    function buy(h: Hero, kind: 'card' | 'relic', i: number) {
      const o = shop.get(h.id);
      const item = kind === 'card' ? o?.cards[i] : o?.relics[i];
      if (!o || !item || item.sold || h.gold < item.price) return;
      h.gold -= item.price;
      item.sold = true;
      if (kind === 'card') addCard(h, item.id);
      else addRelic(h, item.id);
      lastBuy = { id: h.id, text: `kauft ${kind === 'card' ? CARD[item.id].name : RELICS[item.id].name}`, at: Date.now() };
    }

    function shopRemove(h: Hero, uid: string) {
      const o = shop.get(h.id);
      const price = removePrice(h.id);
      const c = cardOf(h, uid);
      if (!o || o.removed || h.gold < price || !c || h.deck.length <= 5) return;
      h.gold -= price;
      removeCard(h, uid);
      o.removed = true;
      removes[h.id] = (removes[h.id] ?? 0) + 1;
      lastBuy = { id: h.id, text: `entfernt ${CARD[c.id].name}`, at: Date.now() };
    }

    function botShop(h: Hero) {
      const o = shop.get(h.id)!;
      const affordable = o.cards.map((c, i) => ({ c, i })).filter(({ c }) => c.price <= h.gold);
      if (affordable.length && Math.random() < 0.7) buy(h, 'card', pick(affordable).i);
      done.add(h.id);
    }

    function checkShopDone() {
      if (phase !== 'shop' || !heroes.every((h) => done.has(h.id))) return;
      const t = ++token;
      ctx.after(1, () => t === token && startMap());
    }

    /* ---------------- Lagerfeuer ---------------- */

    function startCamp() {
      phase = 'camp';
      camp.clear();
      campResult = null;
      for (const h of heroes) if (isBot(h.id)) camp.set(h.id, botCamp(h));
      broadcast();
      checkCampDone();
    }

    function botCamp(h: Hero): CampChoice {
      const up = h.deck.filter((c) => !c.up);
      if (h.hp < h.maxHp * 0.7 || !up.length) return { kind: 'rest' };
      return { kind: 'forge', uid: pick(up).uid };
    }

    function checkCampDone() {
      if (phase !== 'camp' || campResult || !heroes.every((h) => camp.has(h.id))) return;
      campResult = [];
      for (const h of heroes) {
        const c = camp.get(h.id)!;
        if (c.kind === 'rest') {
          const g = heal(h, Math.round(h.maxHp * 0.3));
          campResult.push({ id: h.id, text: `rastet: +${g} Leben` });
        } else if (c.kind === 'forge') {
          const card = upgradeCard(h, c.uid!);
          campResult.push({ id: h.id, text: card ? `schmiedet ${CARD[card.id].name}+` : 'schmiedet' });
        } else {
          const t = heroOf(c.target!);
          const g = t ? heal(t, Math.round(t.maxHp * 0.3)) : 0;
          campResult.push({ id: h.id, text: `hält Wache: ${t ? nameOf(t.id) : '?'} +${g} Leben` });
        }
      }
      broadcast();
      const t = ++token;
      ctx.after(6, () => t === token && startMap());
    }

    /* ---------------- Ereignisse ---------------- */

    function startEvent() {
      phase = 'event';
      const pool = EVENTS.filter((e) => !seen.includes(e.id));
      const def = pick(pool.length ? pool : EVENTS);
      seen.push(def.id);
      ev = { def, stage: def.group ? 'vote' : 'choose', results: [] };
      evPick.clear();
      if (def.group) return startVote('event', def.options.map((o) => o.id));
      for (const h of heroes) if (isBot(h.id)) botEventPick(h);
      broadcast();
      checkEventDone();
    }

    function finishEventResult(secs: number) {
      if (!ev) return;
      ev.stage = 'result';
      broadcast();
      const t = ++token;
      ctx.after(secs, () => t === token && startMap());
    }

    function applyGroupEvent(opt: string) {
      if (!ev) return;
      ev.choice = opt;
      const r = ev.results;
      const id = ev.def.id;
      if (id === 'gruft' && opt === 'open') return startFight({ enemies: ['gruftwaechter'] }, 'eventRelic');
      if (id === 'gefangener' && opt === 'free') return startFight({ enemies: ['skelett', 'knochenpriester'] }, 'eventRare');
      if (id === 'brunnen' && opt === 'drink') for (const h of heroes) {
        if (Math.random() < 0.6) r.push({ id: h.id, text: `+${heal(h, 12)} Leben` });
        else { h.hp = Math.max(1, h.hp - 5); r.push({ id: h.id, text: '−5 Leben' }); }
      }
      if (id === 'brunnen' && opt === 'gold') for (const h of heroes) {
        const g = Math.min(20, h.gold);
        h.gold -= g;
        r.push({ id: h.id, text: `−${g} Gold, +${heal(h, Math.round(h.maxHp * 0.25))} Leben` });
      }
      if (id === 'bruecke' && opt === 'cross') for (const h of heroes) {
        h.hp = Math.max(1, h.hp - 8);
        const rel = randomRelic(h);
        if (rel) addRelic(h, rel);
        r.push({ id: h.id, text: `−8 Leben${rel ? `, Relikt: ${RELICS[rel].name}` : ''}` });
      }
      if (!r.length) r.push(...heroes.map((h) => ({ id: h.id, text: 'geht weiter' })));
      finishEventResult(7);
    }

    /** Einzelentscheidung: Option (und ggf. Karte) wählen */
    function eventPick(h: Hero, opt: string, uid?: string): boolean {
      if (!ev || ev.stage !== 'choose' || evPick.has(h.id) || !ev.def.options.some((o) => o.id === opt)) return false;
      const id = ev.def.id;
      let text = 'geht weiter';
      if (id === 'haendler' && opt === 'remove') {
        const c = uid ? cardOf(h, uid) : undefined;
        if (h.gold < 40 || !c || h.deck.length <= 5) return false;
        h.gold -= 40;
        removeCard(h, c.uid);
        text = `entfernt ${CARD[c.id].name}`;
      }
      if (id === 'haendler' && opt === 'relic') {
        const rel = randomRelic(h);
        if (h.gold < 90 || !rel) return false;
        h.gold -= 90;
        addRelic(h, rel);
        text = `kauft ${RELICS[rel].name}`;
      }
      if (id === 'blutaltar' && opt === 'bleed') {
        h.hp = Math.max(1, h.hp - 10);
        const ups = shuffle(h.deck.filter((c) => !c.up)).slice(0, 2);
        for (const c of ups) c.up = true;
        text = `−10 Leben, verbessert ${ups.map((c) => CARD[c.id].name).join(' und ') || 'nichts'}`;
      }
      if (id === 'spiegel' && opt === 'copy') {
        const c = uid ? cardOf(h, uid) : undefined;
        if (!c) return false;
        addCard(h, c.id);
        if (c.up) h.deck[h.deck.length - 1].up = true;
        text = `verdoppelt ${CARD[c.id].name}${c.up ? '+' : ''}`;
      }
      if (id === 'pilzhain' && opt === 'heal') text = `+${heal(h, 12)} Leben`;
      if (id === 'pilzhain' && opt === 'gold') { h.gold += 25; text = '+25 Gold'; }
      evPick.set(h.id, opt);
      ev.results.push({ id: h.id, text });
      return true;
    }

    function botEventPick(h: Hero) {
      if (!ev) return;
      for (const o of shuffle(ev.def.options.map((x) => x.id))) {
        const uid = o === 'remove' ? (h.deck.find((c) => CARD[c.id].rarity === 'basis') ?? h.deck[0])?.uid : o === 'copy' ? pick(h.deck).uid : undefined;
        if (eventPick(h, o, uid)) return;
      }
      if (!evPick.has(h.id)) { evPick.set(h.id, 'nothing'); ev.results.push({ id: h.id, text: 'geht weiter' }); }
    }

    function checkEventDone() {
      if (!ev || ev.stage !== 'choose' || !heroes.every((h) => evPick.has(h.id))) return;
      finishEventResult(6);
    }

    /* ---------------- Schatz ---------------- */

    function startTreasure() {
      phase = 'treasure';
      treasure.clear();
      done.clear();
      for (const h of heroes) {
        const rel = randomRelic(h);
        if (rel) addRelic(h, rel);
        treasure.set(h.id, rel);
        if (isBot(h.id)) done.add(h.id);
      }
      broadcast();
      checkTreasureDone();
    }

    function checkTreasureDone() {
      if (phase !== 'treasure' || !heroes.every((h) => done.has(h.id))) return;
      const t = ++token;
      ctx.after(1, () => t === token && startMap());
    }

    /* ---------------- Ende ---------------- */

    function endRun(r: 'win' | 'lose') {
      phase = 'end';
      result = r;
      token++;
      ctx.store.set('run', null);
      broadcast();
      const score = r === 'win' ? LEVELS : Math.max(0, level() - 1);
      ctx.finish(ids.map((id) => ({ playerId: id, score })));
    }

    /* ---------------- Ansichten ---------------- */

    const relicView = (id: string) => ({ ...RELICS[id] });

    function intentView(f: Fight, i: number) {
      const e = f.enemies[i];
      const m = e.intent?.move;
      if (!m || (e.dead && phase !== 'resolve')) return null;
      const dmg = m.dmg ? Math.floor((m.dmg + e.buff) * f.dmgMul * (e.st.weak > 0 ? 0.75 : 1)) : 0;
      return {
        name: m.name, dmg, hits: m.hits ?? 1, all: !!m.all, block: m.block ?? 0, weakAll: m.weakAll ?? 0, vuln: m.vuln ?? 0, buff: m.buff ?? 0, targets: e.intent!.targets,
        poison: m.poison ?? 0, vulnAll: m.vulnAll ?? 0, healAlly: m.healAlly ?? 0, blockAllies: m.blockAllies ?? 0, spawn: m.spawn?.n ?? 0, charge: !!m.charge, weakest: !!m.weakest,
      };
    }

    function enemiesView(f: Fight) {
      return f.enemies.map((e, i) => {
        const d = ENEMIES[e.id];
        return {
          uid: e.uid, id: e.id, name: d.name, img: d.img, fallback: d.fallback, size: d.size, elite: !!d.elite, boss: !!d.boss, minion: !!e.minion,
          hp: e.hp, maxHp: e.maxHp, block: e.block, st: e.st, buff: e.buff, dead: e.dead, intent: intentView(f, i),
        };
      });
    }

    function heroesView() {
      return heroes.map((h) => ({ id: h.id, cls: h.cls, img: CLASSES[h.cls].img, hp: h.hp, maxHp: h.maxHp, block: h.block, st: h.st, ready: h.ready, str: h.str, relics: h.relics, gold: h.gold }));
    }

    const cardInfo = (id: string, up = false) => {
      const d = CARD[id];
      return {
        id, cls: d.cls, name: d.name + (up ? '+' : ''), cost: d.cost[up ? 1 : 0], speed: d.speed, rarity: d.rarity, text: cardText(d, up, isSolo()), img: d.img, target: d.target, otherAlly: !!d.otherAlly && !isSolo(), up,
        upText: up ? null : cardText(d, true, isSolo()), upCost: d.cost[1],
      };
    };
    const cardView = (h: Hero, uid: string) => {
      const c = cardOf(h, uid)!;
      return { uid, ...cardInfo(c.id, c.up) };
    };
    const deckView = (h: Hero) => h.deck.map((c) => cardView(h, c.uid)).sort((a, b) => a.name.localeCompare(b.name));

    function voteView() {
      if (!vote) return null;
      return {
        kind: vote.kind, options: vote.options, winner: vote.winner ?? null, deadline: vote.deadline || undefined, duration: vote.deadline ? VOTE_TIME * 1000 : undefined,
        votes: Object.fromEntries(vote.options.map((o) => [o, [...vote!.votes.entries()].filter(([, v]) => v === o).map(([k]) => k)])), voters: voters(),
      };
    }

    function mapView() {
      const sight = level() + SIGHT;
      return {
        nodes: map.nodes.filter((n) => n.lv <= sight || path.includes(n.id)).map((n) => ({ id: n.id, lv: n.lv, col: n.col, type: n.type, next: n.next })),
        path, pos: pos(), level: level(), levels: LEVELS, sight,
        boss: sight >= LEVELS ? { id: boss, name: ENEMIES[boss].name, img: ENEMIES[boss].img, fallback: ENEMIES[boss].fallback } : null,
        vote: voteView(),
      };
    }

    function nodeInfo() {
      const n = node();
      return n ? { lv: n.lv, type: n.type, name: NODE_NAME[n.type] } : null;
    }

    function eventView() {
      if (!ev) return null;
      return {
        id: ev.def.id, name: ev.def.name, img: ev.def.img, text: ev.def.text, group: ev.def.group, stage: ev.stage, choice: ev.choice ?? null,
        options: ev.def.options, results: ev.results, picked: [...evPick.keys()],
      };
    }

    function hostView() {
      const base = { phase, screen: phase, solo: isSolo(), comps, node: nodeInfo(), levels: LEVELS };
      if (phase === 'lager') {
        const s = saved();
        return { ...base, players: allIds().map((id) => ({ id, cls: choice.get(id) ?? null, ready: lagerReady.has(id) })), saved: s ? { level: savedLevel(s), at: s.at } : null };
      }
      if (phase === 'map') return { ...base, map: mapView(), heroes: heroesView(), nodeNames: NODE_NAME, nodeDesc: NODE_DESC };
      if (phase === 'event') return { ...base, event: eventView(), heroes: heroesView(), vote: voteView() };
      if (phase === 'shop') return { ...base, heroes: heroesView(), done: [...done], last: lastBuy };
      if (phase === 'camp') return { ...base, heroes: heroesView(), chosen: [...camp.keys()], result: campResult };
      if (phase === 'treasure') return { ...base, heroes: heroesView(), done: [...done], relics: Object.fromEntries([...treasure.entries()].map(([k, v]) => [k, v ? relicView(v) : null])) };
      if (phase === 'bossIntro') return { ...base, boss: { name: ENEMIES[boss].name, img: ENEMIES[boss].img, fallback: ENEMIES[boss].fallback } };
      if (phase === 'reward') {
        return {
          ...base, heroes: heroesView(), kind: fightKind,
          rewards: allIds().map((id) => {
            const r = rewards.get(id);
            return { id, done: picked.has(id), card: picked.get(id) ? CARD[picked.get(id)!].name : null, gold: r?.gold ?? 0, healed: r?.healed ?? 0, relic: r?.relic ? relicView(r.relic) : null };
          }),
        };
      }
      if (phase === 'end') return { ...base, result, heroes: heroesView(), level: level() };
      const f = fight!;
      return {
        ...base, elite: f.elite, boss: f.boss, round: f.round, enemies: enemiesView(f), heroes: heroesView(), deadline: planDeadline || undefined, duration: planTime * 1000 || undefined,
        ...(phase === 'resolve' ? { events, startAt: resolveStart } : {}),
      };
    }

    function meView(h: Hero) {
      return {
        cls: h.cls, img: CLASSES[h.cls].img, name: CLASSES[h.cls].name, hp: h.hp, maxHp: h.maxHp, block: h.block, st: h.st, str: h.str,
        gold: h.gold, relics: h.relics.map(relicView), deckSize: h.deck.length,
      };
    }

    function phoneView(id: string) {
      const base = { phase, solo: isSolo(), comps, node: nodeInfo(), levels: LEVELS, vip: ctx.vip() === id };
      if (phase === 'lager') {
        const s = saved();
        return {
          ...base, input: !lagerReady.has(id), cls: choice.get(id) ?? null, ready: lagerReady.has(id),
          allChosen: ids.every((x) => choice.has(x)), compCount: comps.length, compMax: MAX_HEROES - ids.length,
          savedComps: s?.heroes.filter((x) => x.comp).length ?? 0, saved: s ? { level: savedLevel(s) } : null,
          classes: CLASS_IDS.map((c) => {
            const d = CLASSES[c];
            return { id: c, name: d.name, role: d.role, hp: d.hp, desc: d.desc, img: d.img, start: d.start.map(([cid, n]) => `${n}× ${CARD[cid].name}`) };
          }),
        };
      }
      const h = heroOf(id);
      if (!h) return { ...base, phase: 'watch' };
      const me = meView(h);
      const deck = deckView(h);
      const human = (x: Hero) => !isBot(x.id);
      if (phase === 'map') return { ...base, me, deck, map: mapView(), nodeNames: NODE_NAME, nodeDesc: NODE_DESC, input: !!vote && !vote.winner && !vote.votes.has(id), myVote: vote?.votes.get(id) ?? null };
      if (phase === 'bossIntro') return { ...base, me, deck };
      if (phase === 'reward') {
        const r = rewards.get(id);
        return {
          ...base, me, deck, kind: fightKind, input: !picked.has(id), done: picked.has(id), pickedName: picked.get(id) ? CARD[picked.get(id)!].name : null,
          gold: r?.gold ?? 0, healed: r?.healed ?? 0, relic: r?.relic ? relicView(r.relic) : null, offer: (r?.offer ?? []).map((cid) => cardInfo(cid)),
          waitingFor: heroes.filter((x) => human(x) && !picked.has(x.id)).map((x) => x.id),
        };
      }
      if (phase === 'shop') {
        const o = shop.get(id)!;
        return {
          ...base, me, deck, input: !done.has(id), done: done.has(id), waitingFor: heroes.filter((x) => human(x) && !done.has(x.id)).map((x) => x.id),
          cards: o.cards.map((c) => ({ ...c, card: cardInfo(c.id) })), relics: o.relics.map((r) => ({ ...r, relic: relicView(r.id) })),
          removePrice: removePrice(id), removed: o.removed,
        };
      }
      if (phase === 'camp') {
        return {
          ...base, me, deck, input: !camp.has(id), chosen: camp.get(id) ?? null, result: campResult,
          waitingFor: heroes.filter((x) => human(x) && !camp.has(x.id)).map((x) => x.id),
          allies: heroes.filter((x) => x.id !== id).map((x) => ({ id: x.id, cls: x.cls, img: CLASSES[x.cls].img, hp: x.hp, maxHp: x.maxHp })),
        };
      }
      if (phase === 'event') {
        const myVote = vote?.votes.get(id) ?? null;
        return {
          ...base, me, deck, event: eventView(), vote: voteView(), myVote,
          input: ev?.stage === 'vote' ? !!vote && !vote.winner && !myVote : ev?.stage === 'choose' && !evPick.has(id),
          waitingFor: ev?.stage === 'choose' ? heroes.filter((x) => human(x) && !evPick.has(x.id)).map((x) => x.id) : [],
        };
      }
      if (phase === 'treasure') return { ...base, me, deck, relic: treasure.get(id) ? relicView(treasure.get(id)!) : null, done: done.has(id), input: !done.has(id), waitingFor: heroes.filter((x) => human(x) && !done.has(x.id)).map((x) => x.id) };
      if (phase === 'end') return { ...base, me, result, level: level() };
      const f = fight!;
      return {
        ...base, me, round: f.round, elite: f.elite, boss: f.boss,
        energy: h.energy, used: plannedCost(h), ready: h.ready, input: phase === 'plan' && !h.ready,
        hand: h.hand.map((u) => {
          const cv = { ...cardView(h, u), cost: cost(cardOf(h, u)!) };
          const preview: Record<string, number> = {};
          if (cv.target === 'enemy') for (const e of f.enemies) if (!e.dead) {
            const d = previewDamage(f, h, cardOf(h, u)!, e.uid);
            if (d != null) preview[e.uid] = d;
          }
          return { ...cv, preview };
        }),
        plan: h.plan.map((p) => ({ uid: p.uid, target: p.target })),
        deck,
        drawPile: h.draw.map((u) => cardView(h, u)).sort((a, b) => a.name.localeCompare(b.name)),
        discardPile: h.discard.map((u) => cardView(h, u)).sort((a, b) => a.name.localeCompare(b.name)),
        enemies: enemiesView(f),
        allies: heroes.map((x) => ({ id: x.id, cls: x.cls, img: CLASSES[x.cls].img, hp: x.hp, maxHp: x.maxHp })),
        waitingFor: phase === 'plan' ? heroes.filter((x) => !x.ready).map((x) => x.id) : [],
        deadline: planDeadline || undefined, duration: planTime * 1000 || undefined,
        ...(phase === 'resolve' ? { endsAt: resolveStart + totalDuration(events) * 1000 } : {}),
      };
    }

    function broadcast() {
      ctx.setHostView(hostView());
      for (const id of ids) ctx.setPlayerView(id, phoneView(id));
      ctx.setAudienceView({ phase: 'watch' });
    }

    /** VIP: nicht länger auf getrennte Spieler warten – sie entscheiden automatisch */
    function skipDisconnected() {
      const off = heroes.filter((h) => !connected(h.id));
      if (phase === 'plan' && fight) { for (const x of off) if (!x.ready) { botPlan(fight, x); x.ready = true; } broadcast(); return checkAllReady(); }
      if (phase === 'reward') { for (const x of off) if (!picked.has(x.id)) picked.set(x.id, null); broadcast(); return checkRewardDone(); }
      if (phase === 'shop') { for (const x of off) done.add(x.id); broadcast(); return checkShopDone(); }
      if (phase === 'camp') { for (const x of off) if (!camp.has(x.id)) camp.set(x.id, { kind: 'rest' }); broadcast(); return checkCampDone(); }
      if (phase === 'event' && ev?.stage === 'choose') { for (const x of off) if (!evPick.has(x.id)) botEventPick(x); broadcast(); return checkEventDone(); }
      if (phase === 'treasure') { for (const x of off) done.add(x.id); broadcast(); return checkTreasureDone(); }
    }

    return {
      start: startLager,
      onAction(id, a) {
        if (!a || typeof a !== 'object') return;
        const vip = ctx.vip() === id;
        if (phase === 'lager') {
          if (a.type === 'class' && CLASS_IDS.includes(a.cls) && ids.includes(id)) { choice.set(id, a.cls); lagerReady.add(id); return broadcast(); }
          if (a.type === 'unready') { lagerReady.delete(id); return broadcast(); }
          if (vip && a.type === 'comps') { setComps(Number(a.n) || 0); return broadcast(); }
          if (vip && a.type === 'start' && ids.every((x) => choice.has(x))) return newRun();
          if (vip && a.type === 'continue') return continueRun();
          return;
        }
        if (vip && a.type === 'skipWait') return skipDisconnected();
        const h = heroOf(id);
        if (a.type === 'vote' && (phase === 'map' || phase === 'event')) return castVote(id, String(a.option));
        if (phase === 'plan' && fight && h) {
          if (a.type === 'plan' && !h.ready) { planCard(fight, h, String(a.uid), a.target ? String(a.target) : undefined); return broadcast(); }
          if (a.type === 'unplan' && !h.ready) { unplan(h, String(a.uid)); return broadcast(); }
          if (a.type === 'ready') { h.ready = !!a.on; broadcast(); return checkAllReady(); }
          return;
        }
        if (phase === 'resolve' && vip && a.type === 'skip') {
          token++;
          return afterResolve();
        }
        if (phase === 'reward' && h && a.type === 'pick' && !picked.has(id)) {
          const o = rewards.get(id)?.offer ?? [];
          picked.set(id, o.includes(a.card) ? a.card : null);
          broadcast();
          return checkRewardDone();
        }
        if (phase === 'shop' && h && !done.has(id)) {
          if (a.type === 'buy') buy(h, a.kind === 'relic' ? 'relic' : 'card', Number(a.i));
          if (a.type === 'remove') shopRemove(h, String(a.uid));
          if (a.type === 'done') done.add(id);
          broadcast();
          return checkShopDone();
        }
        if (phase === 'camp' && h && !campResult && a.type === 'camp') {
          const c = a.uid ? cardOf(h, String(a.uid)) : undefined;
          if (a.kind === 'rest') camp.set(id, { kind: 'rest' });
          if (a.kind === 'forge' && c && !c.up) camp.set(id, { kind: 'forge', uid: c.uid });
          if (a.kind === 'watch' && !isSolo() && heroOf(String(a.target)) && a.target !== id) camp.set(id, { kind: 'watch', target: String(a.target) });
          broadcast();
          return checkCampDone();
        }
        if (phase === 'camp' && vip && campResult && a.type === 'next') { token++; return startMap(); }
        if (phase === 'event' && h && ev?.stage === 'choose' && a.type === 'event') {
          eventPick(h, String(a.option), a.uid ? String(a.uid) : undefined);
          broadcast();
          return checkEventDone();
        }
        if (phase === 'event' && vip && ev?.stage === 'result' && a.type === 'next') { token++; return startMap(); }
        if (phase === 'treasure' && h && a.type === 'done') { done.add(id); broadcast(); return checkTreasureDone(); }
      },
      onPlayerRejoin() {
        broadcast();
      },
      bot(_id, view) {
        if (view.phase === 'lager') {
          if (!view.ready) return { type: 'class', cls: CLASS_IDS[Math.floor(Math.random() * CLASS_IDS.length)] };
          if (view.vip && view.allChosen) return { type: 'start' };
        }
        return null;
      },
    };
  },
} satisfies GameServerModule;
