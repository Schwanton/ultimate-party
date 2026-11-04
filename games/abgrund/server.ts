/**
 * Abgrund – kooperatives Deckbuilding-Roguelike (Prototyp, Etappe 1).
 * Lager (Klassenwahl) → 3 Kämpfe mit Kartenbelohnung dazwischen → Sieg oder Niederlage.
 * Der Run wird nach jedem Kampf gespeichert und kann im Lager fortgesetzt werden.
 */

import type { GameContext, GameServerModule } from '@up/sdk';
import { CARD, CLASSES, CLASS_IDS, ENEMIES, FIGHTS, type ClassId } from './data';
import {
  addCard, botPlan, cardOf, cardText, cost, newFight, newHero, planCard, plannedCost, previewDamage, resolveRound,
  rewardOffer, startRound, totalDuration, unplan, type Fight, type Hero, type TimedEv,
} from './engine';

interface SavedRun {
  fightNo: number;
  /** comp = Begleiter (vom Spiel gesteuert) */
  heroes: { name: string; hero: Hero; comp?: Comp }[];
  at: number;
}

/** Begleiter: vom Spiel gesteuerte Mitstreiter, die der VIP im Lager dazuholt */
interface Comp { id: string; name: string; color: string }
const COMP_NAMES = ['Alrik', 'Brann', 'Cora', 'Dorn', 'Elva', 'Fenn', 'Hagen', 'Ilsa', 'Jorin', 'Kara', 'Lute'];
const COMP_COLORS = ['#c9a26b', '#9fb8a0', '#b79bc4', '#d08f6c', '#8fb2c9', '#c4b26b', '#a8a8a8', '#c98f9f', '#8fc9b7', '#b9a58a', '#9f9fd0'];
const MAX_HEROES = 12;

export default {
  create(ctx: GameContext) {
    const ids = ctx.players.map((p) => p.id);
    const isSolo = () => allIds().length === 1;
    const planTime = Number(ctx.options.planTime) || 0;
    let phase: 'lager' | 'plan' | 'resolve' | 'reward' | 'end' = 'lager';
    const choice = new Map<string, ClassId>();
    const lagerReady = new Set<string>();
    let heroes: Hero[] = [];
    let fight: Fight | null = null;
    let fightNo = 0;
    let events: TimedEv[] = [];
    let resolveStart = 0;
    let resolveToken = 0;
    const offers = new Map<string, string[]>();
    const picked = new Map<string, string | null>();
    let result: 'win' | 'lose' | null = null;
    let planTimer: { cancel(): void } | null = null;
    let planDeadline = 0;

    let comps: Comp[] = [];
    const compOf = (id: string) => comps.find((c) => c.id === id);
    /** Alle Helden-IDs: Mitspieler, dann Begleiter */
    const allIds = () => [...ids, ...comps.map((c) => c.id)];
    const isBot = (id: string) => !!compOf(id) || !!ctx.player(id)?.isBot;
    const connected = (id: string) => !!ctx.player(id)?.connected || isBot(id);
    const heroOf = (id: string) => heroes.find((h) => h.id === id);
    const nameOf = (id: string) => compOf(id)?.name ?? ctx.player(id)?.name ?? '?';
    const randomClass = () => CLASS_IDS[Math.floor(Math.random() * CLASS_IDS.length)];

    /** Gespeicherter Run passt, wenn gleich viele echte Spieler mitspielen (Begleiter kommen aus dem Speicher) */
    const saved = () => {
      const s = ctx.store.get<SavedRun>('run');
      return s && s.heroes.filter((x) => !x.comp).length === ids.length ? s : null;
    };

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
      fightNo = 0;
      startFight();
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
      for (const id of ids) {
        const h = byName.get(id) ?? free.shift()!.hero;
        heroes.push({ ...h, id });
      }
      for (const x of s.heroes) if (x.comp) heroes.push({ ...x.hero, id: x.comp.id });
      fightNo = s.fightNo;
      startFight();
    }

    /* ---------------- Kampf ---------------- */

    function startFight() {
      fight = newFight(fightNo, heroes);
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
      const token = ++resolveToken;
      broadcast();
      ctx.after(totalDuration(events) + 1.2, () => token === resolveToken && afterResolve());
    }

    function afterResolve() {
      if (!fight || phase !== 'resolve') return;
      if (fight.over === 'lose') return endRun('lose');
      if (fight.over === 'win') {
        if (fightNo >= FIGHTS.length - 1) return endRun('win');
        return startReward();
      }
      nextRound();
    }

    /* ---------------- Belohnung ---------------- */

    function startReward() {
      phase = 'reward';
      offers.clear();
      picked.clear();
      for (const h of heroes) {
        offers.set(h.id, rewardOffer(h.cls, !!fight?.elite));
        if (isBot(h.id)) picked.set(h.id, Math.random() < 0.85 ? offers.get(h.id)![0] : null);
      }
      broadcast();
      checkRewardDone();
    }

    function checkRewardDone() {
      if (phase !== 'reward') return;
      if (!heroes.every((h) => picked.has(h.id))) return;
      for (const h of heroes) {
        const c = picked.get(h.id);
        if (c) addCard(h, c);
      }
      fightNo++;
      ctx.store.set('run', { fightNo, heroes: heroes.map((h) => ({ name: nameOf(h.id), hero: h, comp: compOf(h.id) })), at: Date.now() } satisfies SavedRun);
      ctx.after(2.5, startFight);
      broadcast();
    }

    /* ---------------- Ende ---------------- */

    function endRun(r: 'win' | 'lose') {
      phase = 'end';
      result = r;
      ctx.store.set('run', null);
      broadcast();
      const won = r === 'win' ? FIGHTS.length : fightNo;
      ctx.finish(ids.map((id) => ({ playerId: id, score: won })));
    }

    /* ---------------- Ansichten ---------------- */

    function intentView(f: Fight, i: number) {
      const e = f.enemies[i];
      const m = e.intent?.move;
      if (!m || (e.dead && phase !== 'resolve')) return null;
      const dmg = m.dmg ? Math.floor((m.dmg + e.buff) * f.dmgMul * (e.st.weak > 0 ? 0.75 : 1)) : 0;
      return { name: m.name, dmg, hits: m.hits ?? 1, all: !!m.all, block: m.block ?? 0, weakAll: m.weakAll ?? 0, vuln: m.vuln ?? 0, buff: m.buff ?? 0, targets: e.intent!.targets };
    }

    function enemiesView(f: Fight) {
      return f.enemies.map((e, i) => ({
        uid: e.uid, id: e.id, name: ENEMIES[e.id].name, img: ENEMIES[e.id].img, size: ENEMIES[e.id].size, elite: !!ENEMIES[e.id].elite,
        hp: e.hp, maxHp: e.maxHp, block: e.block, st: e.st, buff: e.buff, dead: e.dead, intent: intentView(f, i),
      }));
    }

    function heroesView() {
      return heroes.map((h) => ({ id: h.id, cls: h.cls, img: CLASSES[h.cls].img, hp: h.hp, maxHp: h.maxHp, block: h.block, st: h.st, ready: h.ready }));
    }

    const cardView = (h: Hero, uid: string) => {
      const c = cardOf(h, uid)!;
      const def = CARD[c.id];
      return {
        uid, id: c.id, up: c.up, name: def.name + (c.up ? '+' : ''), cost: cost(c), speed: def.speed, rarity: def.rarity,
        text: cardText(def, c.up, isSolo()), img: def.img, target: def.target, otherAlly: !!def.otherAlly && !isSolo(),
      };
    };

    function hostView() {
      const base = { phase, screen: phase, fightNo, fights: FIGHTS.length, solo: isSolo(), comps };
      if (phase === 'lager') {
        return { ...base, players: allIds().map((id) => ({ id, cls: choice.get(id) ?? null, ready: lagerReady.has(id) })), saved: saved() ? { fightNo: saved()!.fightNo, at: saved()!.at } : null };
      }
      if (phase === 'reward') {
        return { ...base, heroes: heroesView(), picked: allIds().map((id) => ({ id, done: picked.has(id), card: picked.get(id) ? CARD[picked.get(id)!].name : null })) };
      }
      if (phase === 'end') return { ...base, result, heroes: heroesView() };
      const f = fight!;
      return {
        ...base, elite: f.elite, round: f.round, enemies: enemiesView(f), heroes: heroesView(), deadline: planDeadline || undefined, duration: planTime * 1000 || undefined,
        ...(phase === 'resolve' ? { events, startAt: resolveStart } : {}),
      };
    }

    function phoneView(id: string) {
      const base = { phase, fightNo, fights: FIGHTS.length, solo: isSolo(), comps };
      if (phase === 'lager') {
        return {
          ...base, input: !lagerReady.has(id), cls: choice.get(id) ?? null, ready: lagerReady.has(id), vip: ctx.vip() === id,
          allChosen: ids.every((x) => choice.has(x)), compCount: comps.length, compMax: MAX_HEROES - ids.length,
          savedComps: saved()?.heroes.filter((x) => x.comp).length ?? 0, saved: saved() ? { fightNo: saved()!.fightNo } : null,
          classes: CLASS_IDS.map((c) => {
            const d = CLASSES[c];
            return { id: c, name: d.name, role: d.role, hp: d.hp, desc: d.desc, img: d.img, start: d.start.map(([cid, n]) => `${n}× ${CARD[cid].name}`) };
          }),
        };
      }
      const h = heroOf(id);
      if (!h) return { ...base, phase: 'watch' };
      const me = { cls: h.cls, img: CLASSES[h.cls].img, name: CLASSES[h.cls].name, hp: h.hp, maxHp: h.maxHp, block: h.block, st: h.st };
      if (phase === 'reward') {
        const o = offers.get(id) ?? [];
        return {
          ...base, me, input: !picked.has(id), done: picked.has(id), pickedName: picked.get(id) ? CARD[picked.get(id)!].name : null,
          offer: o.map((cid) => {
            const d = CARD[cid];
            return { id: cid, name: d.name, cost: d.cost[0], speed: d.speed, rarity: d.rarity, text: cardText(d, false, isSolo()), img: d.img };
          }),
        };
      }
      if (phase === 'end') return { ...base, me, result };
      const f = fight!;
      const deckNames = (uids: string[]) => uids.map((u) => cardView(h, u)).sort((a, b) => a.name.localeCompare(b.name));
      const view = {
        ...base, me, round: f.round, elite: f.elite,
        energy: h.energy, used: plannedCost(h), ready: h.ready, input: phase === 'plan' && !h.ready,
        hand: h.hand.map((u) => {
          const cv = cardView(h, u);
          const preview: Record<string, number> = {};
          if (cv.target === 'enemy') for (const e of f.enemies) if (!e.dead) {
            const d = previewDamage(f, h, cardOf(h, u)!, e.uid);
            if (d != null) preview[e.uid] = d;
          }
          return { ...cv, preview };
        }),
        plan: h.plan.map((p) => ({ uid: p.uid, target: p.target })),
        drawPile: deckNames(h.draw), discardPile: deckNames(h.discard),
        enemies: enemiesView(f).map((e) => ({ uid: e.uid, id: e.id, name: e.name, img: e.img, elite: e.elite, hp: e.hp, maxHp: e.maxHp, block: e.block, st: e.st, buff: e.buff, dead: e.dead, intent: e.intent })),
        allies: heroes.map((x) => ({ id: x.id, cls: x.cls, img: CLASSES[x.cls].img, hp: x.hp, maxHp: x.maxHp })),
        vip: ctx.vip() === id,
        waitingFor: phase === 'plan' ? heroes.filter((x) => !x.ready).map((x) => x.id) : [],
        deadline: planDeadline || undefined, duration: planTime * 1000 || undefined,
        ...(phase === 'resolve' ? { endsAt: resolveStart + totalDuration(events) * 1000 } : {}),
      };
      return view;
    }

    function broadcast() {
      ctx.setHostView(hostView());
      for (const id of ids) ctx.setPlayerView(id, phoneView(id));
      ctx.setAudienceView({ phase: 'watch' });
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
        if (phase === 'plan' && fight) {
          const h = heroOf(id);
          if (!h) {
            return;
          }
          if (a.type === 'plan' && !h.ready) { planCard(fight, h, String(a.uid), a.target ? String(a.target) : undefined); return broadcast(); }
          if (a.type === 'unplan' && !h.ready) { unplan(h, String(a.uid)); return broadcast(); }
          if (a.type === 'ready') { h.ready = !!a.on; broadcast(); return checkAllReady(); }
          if (vip && a.type === 'skipWait') {
            // VIP: nicht länger auf getrennte Spieler warten – sie spielen diese Runde automatisch
            for (const x of fight.heroes) if (!x.ready && !connected(x.id)) { botPlan(fight, x); x.ready = true; }
            broadcast();
            return checkAllReady();
          }
          return;
        }
        if (phase === 'resolve' && vip && a.type === 'skip') {
          resolveToken++;
          return afterResolve();
        }
        if (phase === 'reward' && a.type === 'pick' && !picked.has(id)) {
          const o = offers.get(id) ?? [];
          picked.set(id, o.includes(a.card) ? a.card : null);
          broadcast();
          return checkRewardDone();
        }
      },
      onPlayerRejoin() {
        broadcast();
      },
      bot(id, view) {
        if (view.phase === 'lager') {
          if (!view.ready) return { type: 'class', cls: CLASS_IDS[Math.floor(Math.random() * CLASS_IDS.length)] };
          if (view.vip && view.allChosen) return { type: 'start' };
          return null;
        }
        if (view.phase === 'reward' && !view.done) return { type: 'pick', card: view.offer?.[0]?.id ?? null };
        void id;
        return null;
      },
    };
  },
} satisfies GameServerModule;
