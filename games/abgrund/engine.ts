/**
 * Abgrund – Kampfregeln (rein, ohne Netzwerk). Server und Simulation nutzen dasselbe.
 *
 * Runde: Absichten → Ziehen → Planen → schnell → normal → langsam → Gegner → Rundenende.
 * Die Auflösung liefert eine Liste von Ereignissen (mit Zwischenständen) für die Animation.
 */

import {
  CARD, CLASSES, ENEMIES, FIGHTS, RARITY_ODDS, dmgScale, extraEnemies, hpScale, rewardPool,
  type CardDef, type ClassId, type EnemyMove, type Fx, type Speed,
} from './data';

export interface Status { poison: number; weak: number; vuln: number; mark: number; stun: number }
const noStatus = (): Status => ({ poison: 0, weak: 0, vuln: 0, mark: 0, stun: 0 });

export interface CardInst { uid: string; id: string; up: boolean }
export interface Planned { uid: string; target?: string }

export interface Hero {
  id: string;
  cls: ClassId;
  hp: number;
  maxHp: number;
  block: number;
  st: Status;
  deck: CardInst[];
  draw: string[];
  discard: string[];
  hand: string[];
  energy: number;
  bonusEnergy: number;
  plan: Planned[];
  ready: boolean;
  /** diese Runde: Angriffe auf diese Spieler treffen mich */
  covers: string[];
  taunt: boolean;
  thorns: number;
}

export interface Intent { move: EnemyMove; targets: string[] }

export interface Enemy {
  uid: string;
  id: string;
  hp: number;
  maxHp: number;
  block: number;
  st: Status;
  buff: number;
  moveIdx: number;
  lastTarget?: string;
  intent?: Intent;
  dead: boolean;
}

export interface Fight {
  no: number;
  elite: boolean;
  round: number;
  /** Schadensfaktor der Gegner (Spielerzahl) */
  dmgMul: number;
  heroes: Hero[];
  enemies: Enemy[];
  over?: 'win' | 'lose';
}

/* ---------------- Hilfen ---------------- */

let uidCounter = 0;
const newUid = (p: string) => `${p}${(++uidCounter).toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

export function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const cardOf = (h: Hero, uid: string) => h.deck.find((c) => c.uid === uid);
export const cost = (c: CardInst) => CARD[c.id].cost[c.up ? 1 : 0];

/** Wert eines Effekts (verbessert / allein) */
function val(f: Fx, up: boolean, solo: boolean): number {
  const anyF = f as { v?: [number, number]; solo?: [number, number] };
  const pair = solo && anyF.solo ? anyF.solo : anyF.v;
  return pair ? pair[up ? 1 : 0] : 0;
}

/** Kartentext mit eingesetzten Werten */
export function cardText(def: CardDef, up: boolean, solo: boolean) {
  return def.text.replace(/\{(\w+)\}/g, (_, key: string) => {
    if (key === 'hits') {
      const f = def.fx.find((x) => x.k === 'dmg') as { hits?: [number, number] } | undefined;
      return String(f?.hits?.[up ? 1 : 0] ?? 1);
    }
    const f = def.fx.find((x) => x.k === key);
    return f ? String(val(f, up, solo)) : '?';
  }).replace(/^Alle Spieler erhalten (\d+) Block$/, solo ? 'Du erhältst $1 Block' : 'Alle Spieler erhalten $1 Block')
    .replace(/^Alle Spieler werden um (\d+) geheilt$/, solo ? 'Du wirst um $1 geheilt' : 'Alle Spieler werden um $1 geheilt');
}

/* ---------------- Aufbau ---------------- */

export function newHero(id: string, cls: ClassId): Hero {
  const c = CLASSES[cls];
  const deck: CardInst[] = [];
  for (const [cid, n] of c.start) for (let i = 0; i < n; i++) deck.push({ uid: newUid('c'), id: cid, up: false });
  return {
    id, cls, hp: c.hp, maxHp: c.hp, block: 0, st: noStatus(), deck, draw: [], discard: [], hand: [],
    energy: 0, bonusEnergy: 0, plan: [], ready: false, covers: [], taunt: false, thorns: 0,
  };
}

export function newFight(no: number, heroes: Hero[]): Fight {
  const spec = FIGHTS[no];
  const ids = [...spec.enemies];
  const extra = extraEnemies(heroes.length);
  for (let i = 0; i < extra; i++) ids.splice(i % 2 ? ids.length : 0, 0, i % 2 ? 'schlundhund' : 'skelett');
  // Gesamtleben wächst mit der Spielerzahl; zusätzliche Gegner teilen es sich mit der Grundgruppe
  const scale = hpScale(heroes.length) * spec.enemies.length / ids.length;
  const enemies: Enemy[] = ids.map((id) => {
    const hp = Math.round(ENEMIES[id].hp * scale);
    return { uid: newUid('e'), id, hp, maxHp: hp, block: 0, st: noStatus(), buff: 0, moveIdx: Math.floor(Math.random() * 2) % ENEMIES[id].moves.length, dead: false };
  });
  for (const h of heroes) {
    h.block = 0;
    h.st = noStatus();
    h.draw = shuffle(h.deck.map((c) => c.uid));
    h.discard = [];
    h.hand = [];
    h.plan = [];
    h.bonusEnergy = 0;
  }
  return { no, elite: !!spec.elite, round: 0, dmgMul: dmgScale(heroes.length), heroes, enemies };
}

/* ---------------- Rundenbeginn ---------------- */

function drawCards(h: Hero, n: number) {
  for (let i = 0; i < n && h.hand.length < 10; i++) {
    if (!h.draw.length) {
      h.draw = shuffle(h.discard);
      h.discard = [];
      if (!h.draw.length) return;
    }
    h.hand.push(h.draw.pop()!);
  }
}

export function startRound(f: Fight) {
  f.round++;
  const alive = f.heroes.filter((h) => h.hp > 0);
  const targetedThisRound = new Map<string, number>();
  for (const e of f.enemies) {
    if (e.dead) continue;
    const def = ENEMIES[e.id];
    const move = def.moves[e.moveIdx % def.moves.length];
    e.moveIdx++;
    let targets: string[] = [];
    if (move.all || move.weakAll) targets = alive.map((h) => h.id);
    else if (move.dmg || move.vuln) {
      // zufällig, möglichst nicht dasselbe Ziel wie letzte Runde und möglichst verteilt
      let pool = alive.filter((h) => h.id !== e.lastTarget);
      if (!pool.length) pool = alive;
      const least = Math.min(...pool.map((h) => targetedThisRound.get(h.id) ?? 0));
      pool = pool.filter((h) => (targetedThisRound.get(h.id) ?? 0) === least);
      const t = pool[Math.floor(Math.random() * pool.length)];
      targets = t ? [t.id] : [];
      if (t) {
        e.lastTarget = t.id;
        targetedThisRound.set(t.id, (targetedThisRound.get(t.id) ?? 0) + 1);
      }
    }
    e.intent = { move, targets };
  }
  for (const h of f.heroes) {
    h.energy = 3 + h.bonusEnergy;
    h.bonusEnergy = 0;
    h.plan = [];
    h.ready = false;
    drawCards(h, 5);
  }
}

/* ---------------- Planen ---------------- */

export function plannedCost(h: Hero) {
  return h.plan.reduce((s, p) => s + cost(cardOf(h, p.uid)!), 0);
}

export type PlanError = 'noCard' | 'noEnergy' | 'badTarget';

/** Karte einplanen (prüft Energie und Ziel) */
export function planCard(f: Fight, h: Hero, uid: string, target?: string): PlanError | null {
  const c = cardOf(h, uid);
  if (!c || !h.hand.includes(uid) || h.plan.some((p) => p.uid === uid)) return 'noCard';
  if (plannedCost(h) + cost(c) > h.energy) return 'noEnergy';
  const def = CARD[c.id];
  if (def.target === 'enemy') {
    if (!f.enemies.some((e) => e.uid === target && !e.dead)) return 'badTarget';
  } else if (def.target === 'ally') {
    if (!f.heroes.some((x) => x.id === target && x.hp > 0)) return 'badTarget';
    if (def.otherAlly && target === h.id && f.heroes.length > 1) return 'badTarget';
  } else target = undefined;
  h.plan.push({ uid, target });
  return null;
}

export function unplan(h: Hero, uid: string) {
  h.plan = h.plan.filter((p) => p.uid !== uid);
}

/* ---------------- Schaden ---------------- */

/** Schaden eines Spieler-Treffers (vor Block), mit Statuswerten vom Beginn der Stufe */
export function heroHit(base: number, attacker: Status, target: Status) {
  let d = base + target.mark;
  if (attacker.weak > 0) d = d * 0.75;
  if (target.vuln > 0) d = d * 1.5;
  return Math.floor(d);
}

/** Erwarteter Schaden einer geplanten Karte auf ein Ziel (für die Vorschau auf dem Handy) */
export function previewDamage(f: Fight, h: Hero, c: CardInst, targetUid: string) {
  const def = CARD[c.id];
  const e = f.enemies.find((x) => x.uid === targetUid);
  const dmg = def.fx.find((x) => x.k === 'dmg') as { v: [number, number]; hits?: [number, number] } | undefined;
  if (!e || !dmg) {
    const pb = def.fx.find((x) => x.k === 'poisonBurst');
    if (e && pb) return e.st.poison * val(pb, c.up, false);
    return null;
  }
  let base = dmg.v[c.up ? 1 : 0];
  if (def.double === 'belowHalf' && e.hp < e.maxHp / 2) base *= 2;
  if (def.double === 'vulnOrMarked' && (e.st.vuln > 0 || e.st.mark > 0)) base *= 2;
  const hits = dmg.hits?.[c.up ? 1 : 0] ?? 1;
  return heroHit(base, h.st, e.st) * hits;
}

/* ---------------- Auflösung ---------------- */

export interface Snap {
  e: { hp: number; block: number; st: Status; buff: number; dead: boolean }[];
  h: Record<string, { hp: number; block: number; st: Status }>;
}

export type Ev =
  | { k: 'tier'; tier: Speed | 'enemies' | 'end' }
  | { k: 'support'; items: { from: string; card: string; to: string; block?: number; heal?: number; cleanse?: boolean; cover?: boolean; taunt?: boolean; thorns?: number }[] }
  | { k: 'hits'; enemy: number; parts: { from: string; card: string; dmg: number }[]; total: number; blocked: number; status?: Partial<Status>; killed: boolean; self?: { id: string; dmg: number }[] }
  | { k: 'fizzle'; from: string; card: string }
  | { k: 'enemy'; enemy: number; move: string; results: { id: string; dmg: number; blocked: number; loss: number; covered?: string }[]; block?: number; buff?: number; weakAll?: number; vuln?: string; thorns?: number; killed?: boolean }
  | { k: 'stunned'; enemy: number }
  | { k: 'poison'; items: { who: string; dmg: number; killed: boolean }[] }
  | { k: 'result'; result: 'win' | 'lose' };

export type TimedEv = Ev & { s: Snap; at: number; d: number };

function snap(f: Fight): Snap {
  return {
    e: f.enemies.map((e) => ({ hp: e.hp, block: e.block, st: { ...e.st }, buff: e.buff, dead: e.dead })),
    h: Object.fromEntries(f.heroes.map((h) => [h.id, { hp: h.hp, block: h.block, st: { ...h.st } }])),
  };
}

const DUR: Record<string, number> = { tier: 0.9, support: 1.3, hits: 1.7, fizzle: 0.8, enemy: 1.7, stunned: 1.1, poison: 1.3, result: 2 };

/** Spieleraktionen einer Stufe gleichzeitig auflösen */
function resolveTier(f: Fight, tier: Speed, push: (e: Ev) => void) {
  const solo = f.heroes.length === 1;
  type Act = { h: Hero; c: CardInst; def: CardDef; target?: string };
  const acts: Act[] = [];
  for (const h of f.heroes) {
    if (h.hp <= 0) continue;
    for (const p of h.plan) {
      const c = cardOf(h, p.uid)!;
      const def = CARD[c.id];
      if (def.speed === tier) acts.push({ h, c, def, target: p.target });
    }
  }
  if (!acts.length) return;
  push({ k: 'tier', tier });

  // Zustand zu Beginn der Stufe (Bedingungen werden hier geprüft)
  const startE = f.enemies.map((e) => ({ hp: e.hp, maxHp: e.maxHp, st: { ...e.st }, dead: e.dead }));
  const startH = new Map(f.heroes.map((h) => [h.id, { ...h.st }]));
  const living = f.enemies.map((e, i) => i).filter((i) => !f.enemies[i].dead);

  // 1. Unterstützung (Block, Heilung, Schutz) wirkt sofort
  const support: Extract<Ev, { k: 'support' }>['items'] = [];
  for (const a of acts) {
    for (const fx of a.def.fx) {
      const v = val(fx, a.c.up, solo);
      const item = (to: string) => {
        let it = support.find((s) => s.from === a.h.id && s.card === a.def.id && s.to === to);
        if (!it) support.push((it = { from: a.h.id, card: a.def.id, to }));
        return it;
      };
      if (fx.k === 'block') { a.h.block += v; item(a.h.id).block = (item(a.h.id).block ?? 0) + v; }
      if (fx.k === 'blockTarget' && a.target) {
        const t = f.heroes.find((x) => x.id === a.target);
        if (t && !(solo && t.id === a.h.id)) { t.block += v; item(t.id).block = (item(t.id).block ?? 0) + v; }
      }
      if (fx.k === 'blockAll') for (const t of solo ? [a.h] : f.heroes.filter((x) => x.hp > 0)) { t.block += v; item(t.id).block = v; }
      if (fx.k === 'heal' && a.target) {
        const t = f.heroes.find((x) => x.id === a.target);
        if (t && t.hp > 0) { const g = Math.min(v, t.maxHp - t.hp); t.hp += g; item(t.id).heal = g; }
      }
      if (fx.k === 'healAll') for (const t of solo ? [a.h] : f.heroes.filter((x) => x.hp > 0)) { const g = Math.min(v, t.maxHp - t.hp); t.hp += g; item(t.id).heal = g; }
      if (fx.k === 'cleanse' && a.target) {
        const t = f.heroes.find((x) => x.id === a.target);
        if (t) { t.st.poison = 0; t.st.weak = 0; t.st.vuln = 0; item(t.id).cleanse = true; }
      }
      if (fx.k === 'redirect' && a.target && a.target !== a.h.id) { a.h.covers.push(a.target); item(a.target).cover = true; }
      if (fx.k === 'taunt') { a.h.taunt = true; item(a.h.id).taunt = true; }
      if (fx.k === 'thorns') { a.h.thorns += v; item(a.h.id).thorns = v; }
      if (fx.k === 'selfDmg') { a.h.hp = Math.max(1, a.h.hp - v); }
    }
  }
  if (support.length) push({ k: 'support', items: support });

  // 2. Angriffe und Effekte auf Gegner – pro Gegner gesammelt
  const perEnemy = new Map<number, { parts: { from: string; card: string; dmg: number }[]; st: Partial<Status>; onKill: Hero[] }>();
  const add = (i: number) => {
    let x = perEnemy.get(i);
    if (!x) perEnemy.set(i, (x = { parts: [], st: {}, onKill: [] }));
    return x;
  };
  for (const a of acts) {
    let targets: number[] = [];
    if (a.def.target === 'enemy') {
      const i = f.enemies.findIndex((e) => e.uid === a.target);
      if (i < 0 || startE[i].dead) {
        if (a.def.fx.some((x) => ['dmg', 'poison', 'weak', 'vuln', 'mark', 'doublePoison', 'poisonBurst'].includes(x.k))) push({ k: 'fizzle', from: a.h.id, card: a.def.id });
        continue;
      }
      targets = [i];
    } else if (a.def.target === 'allEnemies') targets = living;
    else if (a.def.target === 'randomEnemies') targets = living;
    if (!targets.length) continue;
    const hs = startH.get(a.h.id)!;
    for (const fx of a.def.fx) {
      const v = val(fx, a.c.up, solo);
      if (fx.k === 'dmg') {
        const hits = fx.hits?.[a.c.up ? 1 : 0] ?? 1;
        if (a.def.target === 'randomEnemies') {
          for (let k = 0; k < hits; k++) {
            const i = targets[Math.floor(Math.random() * targets.length)];
            add(i).parts.push({ from: a.h.id, card: a.def.id, dmg: heroHit(v, hs, startE[i].st) });
          }
        } else {
          for (const i of targets) {
            let base = v;
            const s = startE[i];
            if (a.def.double === 'belowHalf' && s.hp < s.maxHp / 2) base *= 2;
            if (a.def.double === 'vulnOrMarked' && (s.st.vuln > 0 || s.st.mark > 0)) base *= 2;
            const dmg = heroHit(base, hs, s.st) * hits;
            add(i).parts.push({ from: a.h.id, card: a.def.id, dmg });
          }
        }
      }
      if (fx.k === 'poisonBurst') for (const i of targets) add(i).parts.push({ from: a.h.id, card: a.def.id, dmg: startE[i].st.poison * v });
      for (const i of targets) {
        const x = add(i);
        if (fx.k === 'poison') x.st.poison = (x.st.poison ?? 0) + v;
        if (fx.k === 'weak') x.st.weak = (x.st.weak ?? 0) + v;
        if (fx.k === 'vuln') x.st.vuln = (x.st.vuln ?? 0) + v;
        if (fx.k === 'mark') x.st.mark = (x.st.mark ?? 0) + v;
        if (fx.k === 'doublePoison') x.st.poison = (x.st.poison ?? 0) + startE[i].st.poison;
        if (fx.k === 'energyOnKill') x.onKill.push(a.h);
      }
    }
  }
  for (const [i, x] of [...perEnemy.entries()].sort((a, b) => a[0] - b[0])) {
    const e = f.enemies[i];
    const total = x.parts.reduce((s, p) => s + p.dmg, 0);
    const blocked = Math.min(e.block, total);
    e.block -= blocked;
    e.hp = Math.max(0, e.hp - (total - blocked));
    for (const [k, v] of Object.entries(x.st)) (e.st as unknown as Record<string, number>)[k] += v as number;
    const killed = e.hp <= 0;
    if (killed) {
      e.dead = true;
      for (const h of x.onKill) h.bonusEnergy += 1;
    }
    push({ k: 'hits', enemy: i, parts: x.parts, total, blocked, status: Object.keys(x.st).length ? x.st : undefined, killed });
  }
}

function enemyPhase(f: Fight, push: (e: Ev) => void) {
  let first = true;
  // Gegner-Block hält bis zu ihrem nächsten Zug (schützt also während der Spielerzüge der nächsten Runde)
  for (const e of f.enemies) e.block = 0;
  f.enemies.forEach((e, i) => {
    if (e.dead || !e.intent) return;
    if (first) { push({ k: 'tier', tier: 'enemies' }); first = false; }
    if (e.st.stun > 0) {
      e.st.stun = 0;
      push({ k: 'stunned', enemy: i });
      return;
    }
    const m = e.intent.move;
    const ev: Extract<Ev, { k: 'enemy' }> = { k: 'enemy', enemy: i, move: m.name, results: [] };
    if (m.block) { e.block += m.block; ev.block = m.block; }
    if (m.dmg) {
      const hits = m.hits ?? 1;
      const living = f.heroes.filter((h) => h.hp > 0);
      let targets = m.all ? living.map((h) => h.id) : e.intent.targets.filter((id) => living.some((h) => h.id === id));
      if (!m.all) {
        const taunter = living.find((h) => h.taunt);
        if (taunter) targets = [taunter.id];
        else if (!targets.length && living.length) targets = [living[Math.floor(Math.random() * living.length)].id];
      }
      let thorns = 0;
      for (const tid of targets) {
        let h = f.heroes.find((x) => x.id === tid)!;
        let covered: string | undefined;
        const cover = living.find((x) => x.covers.includes(tid) && x.id !== tid);
        if (cover && !m.all) { covered = tid; h = cover; }
        let dmgSum = 0, blockedSum = 0, lossSum = 0;
        for (let k = 0; k < hits; k++) {
          let d = (m.dmg + e.buff) * f.dmgMul;
          if (e.st.weak > 0) d *= 0.75;
          if (h.st.vuln > 0) d *= 1.5;
          d = Math.floor(d);
          const b = Math.min(h.block, d);
          h.block -= b;
          h.hp = Math.max(0, h.hp - (d - b));
          dmgSum += d; blockedSum += b; lossSum += d - b;
        }
        if (m.vuln) h.st.vuln += m.vuln;
        if (h.thorns > 0) thorns += h.thorns;
        ev.results.push({ id: h.id, dmg: dmgSum, blocked: blockedSum, loss: lossSum, covered });
      }
      if (thorns > 0) {
        e.hp = Math.max(0, e.hp - thorns);
        ev.thorns = thorns;
        if (e.hp <= 0) { e.dead = true; ev.killed = true; }
      }
    }
    if (m.weakAll) {
      for (const h of f.heroes) if (h.hp > 0) h.st.weak += m.weakAll;
      ev.weakAll = m.weakAll;
    }
    if (m.buff) { e.buff += m.buff; ev.buff = m.buff; }
    push(ev);
  });
}

function endOfRound(f: Fight, push: (e: Ev) => void) {
  const items: Extract<Ev, { k: 'poison' }>['items'] = [];
  f.enemies.forEach((e, i) => {
    if (e.dead || e.st.poison <= 0) return;
    e.hp = Math.max(0, e.hp - e.st.poison);
    const killed = e.hp <= 0;
    if (killed) e.dead = true;
    items.push({ who: 'e' + i, dmg: e.st.poison, killed });
    e.st.poison--;
  });
  for (const h of f.heroes) {
    if (h.hp <= 0 || h.st.poison <= 0) continue;
    h.hp = Math.max(0, h.hp - h.st.poison);
    items.push({ who: h.id, dmg: h.st.poison, killed: h.hp <= 0 });
    h.st.poison--;
  }
  if (items.length) push({ k: 'poison', items });
  for (const x of [...f.enemies, ...f.heroes]) {
    x.st.weak = Math.max(0, x.st.weak - 1);
    x.st.vuln = Math.max(0, x.st.vuln - 1);
    x.st.mark = 0;
  }
  for (const h of f.heroes) h.block = 0;
  for (const h of f.heroes) {
    h.covers = [];
    h.taunt = false;
    h.thorns = 0;
    // Hand und gespielte Karten auf die Ablage
    h.discard.push(...h.hand);
    h.hand = [];
    h.plan = [];
  }
}

function checkOver(f: Fight): 'win' | 'lose' | null {
  if (f.heroes.some((h) => h.hp <= 0)) return 'lose';
  if (f.enemies.every((e) => e.dead)) return 'win';
  return null;
}

/** Ganze Runde auflösen. Liefert die Ereignisse mit Zeitplan (Sekunden) und Zwischenständen. */
export function resolveRound(f: Fight): TimedEv[] {
  const out: TimedEv[] = [];
  let t = 0;
  const push = (e: Ev) => {
    const d = e.k === 'hits' ? DUR.hits + Math.min(1.2, (e.parts.length - 1) * 0.15) : DUR[e.k] ?? 1.2;
    out.push({ ...e, s: snap(f), at: t, d } as TimedEv);
    t += d;
  };
  for (const tier of ['fast', 'normal', 'slow'] as Speed[]) {
    resolveTier(f, tier, push);
    const o = checkOver(f);
    if (o) { f.over = o; push({ k: 'result', result: o }); endCleanup(f); return out; }
  }
  enemyPhase(f, push);
  let o = checkOver(f);
  if (o) { f.over = o; push({ k: 'result', result: o }); endCleanup(f); return out; }
  endOfRound(f, push);
  o = checkOver(f);
  if (o) { f.over = o; push({ k: 'result', result: o }); }
  return out;
}

function endCleanup(f: Fight) {
  for (const h of f.heroes) {
    h.discard.push(...h.hand);
    h.hand = [];
    h.plan = [];
    h.block = 0;
    h.covers = [];
    h.taunt = false;
    h.thorns = 0;
  }
}

export const totalDuration = (evs: TimedEv[]) => (evs.length ? evs[evs.length - 1].at + evs[evs.length - 1].d : 0);

/* ---------------- Belohnung ---------------- */

export function rewardOffer(cls: ClassId, elite: boolean): string[] {
  const odds = elite ? RARITY_ODDS.elite : RARITY_ODDS.normal;
  const pool = rewardPool(cls);
  const out: string[] = [];
  let guard = 0;
  while (out.length < 3 && guard++ < 100) {
    const r = Math.random();
    const rarity = r < odds.rare ? 'rare' : r < odds.rare + odds.uncommon ? 'uncommon' : 'common';
    const cands = pool.filter((c) => c.rarity === rarity && !out.includes(c.id));
    const pick = (cands.length ? cands : pool.filter((c) => !out.includes(c.id)))[0 + Math.floor(Math.random() * (cands.length || 1))];
    if (pick && !out.includes(pick.id)) out.push(pick.id);
  }
  return out;
}

export function addCard(h: Hero, id: string) {
  h.deck.push({ uid: newUid('c'), id, up: false });
}

/* ---------------- Testspieler ---------------- */

/** Einfache, aber sinnvolle Planung: blocken bei Bedrohung, heilen bei wenig Leben, sonst angreifen */
export function botPlan(f: Fight, h: Hero) {
  const hand = h.hand.map((uid) => cardOf(h, uid)!).filter(Boolean);
  const incoming = f.enemies.reduce((s, e) => {
    if (e.dead || !e.intent?.move.dmg || !e.intent.targets.includes(h.id)) return s;
    return s + Math.floor((e.intent.move.dmg + e.buff) * f.dmgMul) * (e.intent.move.hits ?? 1);
  }, 0);
  const living = f.enemies.filter((e) => !e.dead);
  // schon geplanter Schaden aller Spieler (Testspieler verteilen sich, statt alle auf denselben zu hauen)
  const planned = new Map<string, number>();
  for (const x of f.heroes) for (const p of x.plan) {
    if (!p.target) continue;
    const d = previewDamage(f, x, cardOf(x, p.uid)!, p.target);
    if (d) planned.set(p.target, (planned.get(p.target) ?? 0) + d);
  }
  const left = (e: Enemy) => e.hp + e.block - (planned.get(e.uid) ?? 0);
  const pickWeakest = () => [...living].filter((e) => left(e) > 0).sort((a, b) => left(a) - left(b))[0] ?? living[0];
  const toughest = [...living].sort((a, b) => b.hp - a.hp)[0];
  const hurt = [...f.heroes].filter((x) => x.hp > 0 && x.hp < x.maxHp * 0.5).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
  const isBlock = (c: CardInst) => CARD[c.id].fx.some((x) => x.k === 'block' || x.k === 'blockAll' || x.k === 'blockTarget');
  const isHeal = (c: CardInst) => CARD[c.id].fx.some((x) => x.k === 'heal' || x.k === 'healAll');
  const isAtk = (c: CardInst) => CARD[c.id].fx.some((x) => x.k === 'dmg' || x.k === 'poison' || x.k === 'poisonBurst' || x.k === 'doublePoison');
  const order = [
    ...hand.filter((c) => isHeal(c) && hurt),
    ...(incoming >= 6 ? hand.filter(isBlock) : []),
    ...hand.filter(isAtk),
    ...hand.filter(isBlock),
  ];
  let blockSoFar = 0;
  for (const c of order) {
    if (h.plan.some((p) => p.uid === c.uid)) continue;
    const def = CARD[c.id];
    if (isBlock(c) && !isAtk(c) && incoming >= 6 && blockSoFar >= incoming) continue;
    let target: string | undefined;
    if (def.target === 'enemy') {
      const poisonish = def.fx.some((x) => x.k === 'poison');
      const t = poisonish ? toughest : pickWeakest();
      target = t?.uid;
      if (t && planCard(f, h, c.uid, target) === null) {
        const d = previewDamage(f, h, c, t.uid);
        if (d) planned.set(t.uid, (planned.get(t.uid) ?? 0) + d);
      }
      continue;
    } else if (def.target === 'ally') {
      target = (isHeal(c) ? hurt ?? h : f.heroes.find((x) => x.id !== h.id && x.hp > 0) ?? h).id;
    }
    if (!planCard(f, h, c.uid, target)) {
      if (isBlock(c)) blockSoFar += 6;
    }
  }
}
