/**
 * Abgrund – Kampfregeln (rein, ohne Netzwerk). Server und Simulation nutzen dasselbe.
 *
 * Runde: Absichten → Ziehen → Planen → schnell → normal → langsam → Gegner → Rundenende.
 * Die Auflösung liefert eine Liste von Ereignissen (mit Zwischenständen) für die Animation.
 */

import {
  CARD, CLASSES, ENEMIES, RARITY_ODDS, RELIC_IDS, RENAMED_CARDS, SHOP_ODDS, STICKERS, STICKER_IDS, dmgScale, extraEnemies, hpScale, legendaryPool, rewardPool,
  type CardDef, type ClassId, type EnemyMove, type FightSpec, type Fx, type PowerId, type Speed,
} from './data';

export interface Status { poison: number; weak: number; vuln: number; mark: number; stun: number }
const noStatus = (): Status => ({ poison: 0, weak: 0, vuln: 0, mark: 0, stun: 0 });

/** Ein aufgeklebter Sticker: Stelle (0–1 im Bildbereich) und Drehung (Grad) werden beim Aufkleben festgelegt */
export interface StickerOn { id: string; x: number; y: number; r: number }
export interface CardInst { uid: string; id: string; up: boolean; st?: StickerOn[] }
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
  /** Erschöpft: in diesem Kampf nicht mehr verfügbar */
  exhaust: string[];
  energy: number;
  bonusEnergy: number;
  plan: Planned[];
  ready: boolean;
  /** diese Runde: Angriffe auf diese Spieler treffen mich */
  covers: string[];
  taunt: boolean;
  /** Dornen: wer mich angreift, erleidet so viel Schaden (bis Kampfende) */
  thorns: number;
  /** Geschicklichkeit: +Block pro Blockkarte (bis Kampfende) */
  dex: number;
  /** nächste Runde zusätzliche Karten */
  drawNext: number;
  /** Run: Gold, Relikte und noch nicht aufgeklebte Sticker */
  gold: number;
  relics: string[];
  stickers: string[];
  /** Kampf: Stärke (+Schaden pro Treffer), Kräfte, einmalige Rettung */
  str: number;
  powers: Partial<Record<PowerId, number>>;
  undying: boolean;
  talismanUsed: boolean;
  /** Runde */
  roundStr: number;
  keepBlock: boolean;
  doubleAtk: boolean;
  firstAtkDone: boolean;
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
  /** herbeigerufen (stirbt mit dem Boss) */
  minion?: boolean;
  /** zweite Phase (Bosse) */
  p2?: boolean;
}

export interface Fight {
  elite: boolean;
  boss: boolean;
  round: number;
  /** Schadensfaktor der Gegner (Spielerzahl) */
  dmgMul: number;
  heroes: Hero[];
  enemies: Enemy[];
  /** Wiedergeburt: der erste, der fällt, steht wieder auf */
  revive: boolean;
  over?: 'win' | 'lose';
}

/* ---------------- Hilfen ---------------- */

let uidCounter = 0;
export const newUid = (p: string) => `${p}${(++uidCounter).toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

export function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

export const cardOf = (h: Hero, uid: string) => h.deck.find((c) => c.uid === uid);

const BLOCK_KEYS = ['block', 'blockTarget', 'blockAll'];
const plus = (f: Fx, n: number): Fx => {
  const x = { ...f } as Fx & { v: [number, number]; solo?: [number, number] };
  x.v = [x.v[0] + n, x.v[1] + n];
  if (x.solo) x.solo = [x.solo[0] + n, x.solo[1] + n];
  return x;
};
const STICKER_FX: Record<string, Fx> = {
  heilsalbe: { k: 'tgtHeal', v: [2, 2] }, giftzahn: { k: 'tgtPoison', v: [1, 1] }, schwaeche: { k: 'tgtWeak', v: [1, 1] },
  wunde: { k: 'tgtVuln', v: [1, 1] }, zielmarke: { k: 'tgtMark', v: [2, 2] }, dorn: { k: 'thorns', v: [1, 1] }, rabe: { k: 'drawNext', v: [1, 1] },
};

/** Die Karte, wie sie mit ihren Stickern wirkt (Werte, Tempo, Kosten, Zusatzwirkungen) */
export function defOf(c: { id: string; st?: StickerOn[] }): CardDef {
  const base = CARD[c.id];
  if (!c.st?.length) return base;
  const ids = c.st.map((s) => s.id);
  let fx = base.fx.map((f) => (ids.includes('schaerfe') && f.k === 'dmg' ? plus(f, 2) : f));
  fx = fx.map((f) => (ids.includes('panzer') && BLOCK_KEYS.includes(f.k) ? plus(f, 2) : f));
  const extra: string[] = [];
  for (const id of ids) {
    if (!STICKER_FX[id]) continue;
    // Dorn und Rabe stapeln sich mit gleichartigen Effekten der Karte nicht im Text – sie stehen extra da
    fx = [...fx, STICKER_FX[id]];
    extra.push(STICKERS[id].card ?? STICKERS[id].text);
  }
  const speed = ids.includes('eile') ? 'fast' : ids.includes('ruhe') ? 'slow' : base.speed;
  const cst: [number, number] = ids.includes('sparsam') ? [Math.max(0, base.cost[0] - 1), Math.max(0, base.cost[1] - 1)] : base.cost;
  const add = extra.length ? '. ' + extra.join('. ') : '';
  return { ...base, fx, speed, cost: cst, text: base.text + add, soloText: base.soloText ? base.soloText + add : undefined };
}

/** Passt ein Sticker auf eine Karte? */
export function stickerFits(c: CardInst, sid: string): boolean {
  const s = STICKERS[sid];
  const def = CARD[c.id];
  if (!s || !def) return false;
  const on = (c.st ?? []).map((x) => x.id);
  if (on.includes(sid) || (s.excl && on.includes(s.excl))) return false;
  if (s.fit === 'dmg') return def.fx.some((f) => f.k === 'dmg');
  if (s.fit === 'block') return def.fx.some((f) => BLOCK_KEYS.includes(f.k));
  if (s.fit === 'notFast') return def.speed !== 'fast';
  if (s.fit === 'notSlow') return def.speed !== 'slow';
  if (s.fit === 'cost1') return def.cost[0] >= 1;
  return true;
}

/** Sticker aufkleben: zufällige Stelle im Bildbereich, leicht schief */
export function applySticker(c: CardInst, sid: string) {
  const r = (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 16);
  (c.st ??= []).push({ id: sid, x: 0.18 + Math.random() * 0.64, y: 0.2 + Math.random() * 0.6, r: Math.round(r) });
}

export const randomStickers = (n: number, not: string[] = []) => shuffle(STICKER_IDS.filter((s) => !not.includes(s))).slice(0, n);

export const cost = (c: CardInst) => defOf(c).cost[c.up ? 1 : 0];
/** Wie oft ein Spieler ein Relikt hat */
export const relicN = (h: Hero, id: string) => h.relics.filter((r) => r === id).length;
/** Wie oft die Gruppe ein Relikt hat */
export const groupRelicN = (f: { heroes: Hero[] }, id: string) => f.heroes.reduce((s, h) => s + relicN(h, id), 0);

/** Wert eines Effekts (verbessert / allein) */
function val(f: Fx, up: boolean, solo: boolean): number {
  const anyF = f as { v?: [number, number]; solo?: [number, number] };
  const pair = solo && anyF.solo ? anyF.solo : anyF.v;
  return pair ? pair[up ? 1 : 0] : 0;
}

/** Veränderung der Kartenwerte durch Stärke, Schwächung und Relikte (für die Anzeige auf der Hand) */
export interface CardMod { add: number; weak: boolean; block?: number }

/**
 * Kartentext mit eingesetzten Werten. Schaden und Block werden als Marken ⟦D:gezeigt:normal⟧ / ⟦B:…⟧
 * geliefert – das Handy zeigt dafür Schwert bzw. Schild und färbt veränderte Werte grün oder rot.
 */
export function cardText(def: CardDef, up: boolean, solo: boolean, mod?: CardMod) {
  let base = solo && def.soloText ? def.soloText : def.text;
  if (solo) base = base.replace(/^Alle Spieler erhalten/, 'Du erhältst').replace(/^Alle Spieler werden um \{(\w+)\} geheilt$/, 'Du wirst um {$1} geheilt');
  return base.replace(/\{(\w+)\}/g, (_, key: string) => {
    if (key === 'hits') {
      const f = def.fx.find((x) => x.k === 'dmg') as { hits?: [number, number] } | undefined;
      return String(f?.hits?.[up ? 1 : 0] ?? 1);
    }
    const f = def.fx.find((x) => x.k === key);
    if (!f) return '?';
    const v = val(f, up, solo);
    if (key === 'dmg') {
      const shown = mod ? Math.max(0, Math.floor((v + mod.add) * (mod.weak ? 0.75 : 1))) : v;
      return `⟦D:${shown}:${v}⟧`;
    }
    if (key === 'execute') return `⟦D:${v}:${v}⟧`;
    if (key === 'block' || key === 'blockAll' || key === 'blockTarget') return `⟦B:${v + (mod?.block ?? 0)}:${v}⟧`;
    if (key === 'power' && f.k === 'power' && (f.p === 'blockRound' || f.p === 'blockAllRound')) return `⟦B:${v}:${v}⟧`;
    return String(v);
  }).replace(/(⟦D:[^⟧]+⟧) Schaden/g, '$1').replace(/(⟦B:[^⟧]+⟧) Block/g, '$1');
}

/** Wie sich Stärke, Schwächung und Relikte gerade auf die Karten eines Spielers auswirken */
export function handMod(f: Fight, h: Hero): CardMod {
  return { add: hitBonus(f, h) + (h.firstAtkDone ? 0 : relicN(h, 'schleifstein') * 3), weak: h.st.weak > 0, block: h.dex };
}

const isAttackDef = (def: CardDef) => def.fx.some((x) => ['dmg', 'poison', 'weak', 'vuln', 'mark', 'doublePoison', 'poisonBurst', 'dmgFromBlock', 'execute', 'stun', 'dmgFromThorns', 'missingDmg', 'stripBlock', 'spreadPoison'].includes(x.k));

/* ---------------- Aufbau ---------------- */

export function newHero(id: string, cls: ClassId): Hero {
  const c = CLASSES[cls];
  const deck: CardInst[] = [];
  for (const [cid, n] of c.start) for (let i = 0; i < n; i++) deck.push({ uid: newUid('c'), id: cid, up: false });
  return {
    id, cls, hp: c.hp, maxHp: c.hp, block: 0, st: noStatus(), deck, draw: [], discard: [], hand: [], exhaust: [],
    energy: 0, bonusEnergy: 0, plan: [], ready: false, covers: [], taunt: false, thorns: 0, dex: 0, drawNext: 0,
    gold: 0, relics: [c.relic], stickers: [], str: 0, powers: {}, undying: false, talismanUsed: false, roundStr: 0, keepBlock: false, doubleAtk: false, firstAtkDone: false,
  };
}

/** Ältere Spielstände ergänzen */
export function fixHero(h: Hero): Hero {
  const n = newHero(h.id, h.cls);
  const deck = h.deck.map((c) => (RENAMED_CARDS[c.id] ? { ...c, id: RENAMED_CARDS[c.id] } : c)).filter((c) => CARD[c.id]);
  return { ...n, ...h, deck, gold: h.gold ?? 0, relics: h.relics ?? [], stickers: h.stickers ?? [], powers: h.powers ?? {}, exhaust: h.exhaust ?? [], dex: h.dex ?? 0, drawNext: h.drawNext ?? 0 };
}

function makeEnemy(id: string, hpMul: number): Enemy {
  const hp = Math.max(1, Math.round(ENEMIES[id].hp * hpMul));
  return { uid: newUid('e'), id, hp, maxHp: hp, block: 0, st: noStatus(), buff: 0, moveIdx: ENEMIES[id].boss ? 0 : Math.floor(Math.random() * 2) % ENEMIES[id].moves.length, dead: false };
}

export function newFight(spec: FightSpec, heroes: Hero[]): Fight {
  const ids = [...spec.enemies];
  if (!spec.boss) {
    const extra = extraEnemies(heroes.length);
    for (let i = 0; i < extra; i++) ids.splice(i % 2 ? ids.length : 0, 0, i % 2 ? 'schlundhund' : 'skelett');
  }
  // Gesamtleben wächst mit der Spielerzahl; zusätzliche Gegner teilen es sich mit der Grundgruppe
  const scale = hpScale(heroes.length) * spec.enemies.length / ids.length;
  const enemies = ids.map((id) => makeEnemy(id, scale));
  for (const h of heroes) {
    h.block = 0;
    h.st = noStatus();
    h.draw = shuffle(h.deck.map((c) => c.uid));
    h.discard = [];
    h.hand = [];
    h.exhaust = [];
    h.plan = [];
    h.bonusEnergy = 0;
    h.str = 0;
    h.powers = {};
    h.undying = false;
    h.talismanUsed = false;
    h.covers = [];
    h.taunt = false;
    h.thorns = relicN(h, 'alraunenwurzel');
    h.dex = relicN(h, 'familienschild');
    h.str = relicN(h, 'wetzstahl');
    h.drawNext = 0;
  }
  const f: Fight = { elite: !!spec.elite, boss: !!spec.boss, round: 0, dmgMul: dmgScale(heroes.length), heroes, enemies, revive: false };
  for (let i = 0; i < groupRelicN(f, 'knochenwuerfel'); i++) pick(enemies).st.vuln += 1;
  for (const e of enemies) e.st.poison += 2 * groupRelicN(f, 'alraunenwurzel');
  return f;
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

const livingMinions = (f: Fight) => f.enemies.filter((e) => e.minion && !e.dead).length;

/** Wie viel Brut ein Gegner wirklich herbeiruft (allein weniger, höchstens so viel lebende Brut wie erlaubt) */
export function spawnCount(f: Fight, m: EnemyMove) {
  if (!m.spawn) return 0;
  const cap = f.heroes.length === 1 ? 2 : 3 + Math.floor((f.heroes.length - 1) / 3);
  const want = f.heroes.length === 1 ? 1 : m.spawn.n + Math.floor((f.heroes.length - 1) / 3);
  return Math.max(0, Math.min(want, cap - livingMinions(f)));
}

function nextMove(f: Fight, e: Enemy): EnemyMove {
  const def = ENEMIES[e.id];
  if (def.phase2 && !e.p2 && e.hp < e.maxHp / 2) { e.p2 = true; e.moveIdx = 0; }
  const list = e.p2 && def.phase2 ? def.phase2 : def.moves;
  for (let guard = 0; guard < list.length; guard++) {
    const m = list[e.moveIdx % list.length];
    e.moveIdx++;
    if (m.ifMinions && !livingMinions(f)) continue;
    return m;
  }
  return list[0];
}

/** Kräfte wirken (beim Ausspielen sofort und dann zu Beginn jeder Runde) */
function applyPower(f: Fight, h: Hero, p: PowerId, v: number) {
  const solo = f.heroes.length === 1;
  if (p === 'blockRound') h.block += v;
  if (p === 'blockAllRound') for (const t of solo ? [h] : f.heroes.filter((x) => x.hp > 0)) t.block += v;
  if (p === 'healAllRound') for (const t of solo ? [h] : f.heroes.filter((x) => x.hp > 0)) t.hp = Math.min(t.maxHp, t.hp + v);
  if (p === 'poisonAllRound') for (const e of f.enemies) if (!e.dead) e.st.poison += v;
  if (p === 'thorns') h.thorns += v;
  if (p === 'strRound') h.str += v;
}

export function startRound(f: Fight) {
  f.round++;
  // besiegte Brut räumen (Platz auf der Bühne)
  f.enemies = f.enemies.filter((e) => !(e.minion && e.dead));
  const alive = f.heroes.filter((h) => h.hp > 0);
  const targetedThisRound = new Map<string, number>();
  for (const e of f.enemies) {
    if (e.dead) continue;
    const move = nextMove(f, e);
    let targets: string[] = [];
    if (move.all || move.weakAll || move.vulnAll) targets = alive.map((h) => h.id);
    else if (move.weakest) {
      const t = [...alive].sort((a, b) => a.hp - b.hp)[0];
      targets = t ? [t.id] : [];
    } else if (move.dmg || move.vuln || move.poison || move.curse) {
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
  const first = f.round === 1;
  const chain = first ? groupRelicN(f, 'eisenkette') * 4 : 0;
  for (const h of f.heroes) {
    h.energy = 3 + h.bonusEnergy + relicN(h, 'schwarze-kerze') + (first ? relicN(h, 'kerzenstumpf') : 0);
    h.bonusEnergy = 0;
    h.plan = [];
    h.ready = false;
    h.roundStr = 0;
    h.keepBlock = false;
    h.doubleAtk = false;
    h.firstAtkDone = false;
    if (h.hp > 0) h.block += chain;
    drawCards(h, 5 + h.drawNext + relicN(h, 'seelenpakt') + (first ? relicN(h, 'rabenfeder') : 0));
    h.drawNext = 0;
  }
  for (const h of f.heroes) {
    if (h.hp <= 0) continue;
    for (const [p, v] of Object.entries(h.powers) as [PowerId, number][]) if (v) applyPower(f, h, p, v);
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
  const def = defOf(c);
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

/** Zusätzlicher Schaden pro Treffer eines Spielers (Stärke, Relikte) */
function hitBonus(f: Fight, h: Hero) {
  return h.str + h.roundStr + relicN(h, 'fluchklinge') * 4 + (f.round === 1 ? groupRelicN(f, 'kriegsbanner') * 2 : 0);
}

/** Erwarteter Schaden einer geplanten Karte auf ein Ziel (für die Vorschau auf dem Handy) */
export function previewDamage(f: Fight, h: Hero, c: CardInst, targetUid: string) {
  const def = defOf(c);
  const e = f.enemies.find((x) => x.uid === targetUid);
  if (!e) return null;
  const mul = h.doubleAtk ? 2 : 1;
  const fb = def.fx.find((x) => x.k === 'dmgFromBlock');
  if (fb) return heroHit(h.block * val(fb, c.up, false) + hitBonus(f, h), h.st, e.st) * mul;
  const ft = def.fx.find((x) => x.k === 'dmgFromThorns');
  if (ft) return heroHit(h.thorns * 2 + val(ft, c.up, false) + hitBonus(f, h), h.st, e.st) * mul;
  const fm = def.fx.find((x) => x.k === 'missingDmg');
  if (fm) return heroHit(missingBase(e.maxHp - e.hp, val(fm, c.up, false), !!ENEMIES[e.id].boss) + hitBonus(f, h), h.st, e.st) * mul;
  const dmg = def.fx.find((x) => x.k === 'dmg') as { v: [number, number]; hits?: [number, number] } | undefined;
  if (!dmg) {
    const pb = def.fx.find((x) => x.k === 'poisonBurst');
    if (pb) return e.st.poison * val(pb, c.up, false) * mul;
    return null;
  }
  let base = dmg.v[c.up ? 1 : 0];
  if (def.double === 'belowHalf' && e.hp < e.maxHp / 2) base *= 2;
  if (def.double === 'vulnOrMarked' && (e.st.vuln > 0 || e.st.mark > 0)) base *= 2;
  const hits = dmg.hits?.[c.up ? 1 : 0] ?? 1;
  return heroHit(base + hitBonus(f, h), h.st, e.st) * hits * mul;
}

/** Gnadenstoß: Prozent der fehlenden Leben (Bosse: die Hälfte) */
const missingBase = (missing: number, pct: number, boss: boolean) => Math.floor((missing * pct) / 100 / (boss ? 2 : 1));

/** Schaden an einem Spieler (nach Block) – mit Rettungen (Unbeugsam, Wiedergeburt) und Talisman */
function hurtHero(f: Fight, h: Hero, loss: number): { saved?: 'undying' | 'revive'; talisman?: boolean } {
  const out: { saved?: 'undying' | 'revive'; talisman?: boolean } = {};
  if (loss <= 0 || h.hp <= 0) return out;
  h.hp -= loss;
  if (h.hp <= 0) {
    if (h.undying) { h.hp = 1; h.undying = false; out.saved = 'undying'; }
    else if (f.revive) { h.hp = Math.ceil(h.maxHp * 0.3); f.revive = false; out.saved = 'revive'; }
    else h.hp = 0;
  }
  if (h.hp > 0 && !h.talismanUsed && h.hp < h.maxHp * 0.25 && groupRelicN(f, 'talisman') > 0) {
    h.talismanUsed = true;
    h.block += 10;
    out.talisman = true;
  }
  return out;
}

/* ---------------- Auflösung ---------------- */

export interface Snap {
  e: { hp: number; block: number; st: Status; buff: number; dead: boolean }[];
  h: Record<string, { hp: number; block: number; st: Status; str: number }>;
}

export type SupportItem = { from: string; card: string; to: string; block?: number; heal?: number; cleanse?: boolean; cover?: boolean; taunt?: boolean; thorns?: number; str?: number; note?: string };

export type Ev =
  | { k: 'tier'; tier: Speed | 'enemies' | 'end' }
  | { k: 'support'; items: SupportItem[] }
  | { k: 'hits'; enemy: number; parts: { from: string; card: string; dmg: number }[]; total: number; blocked: number; status?: Partial<Status>; killed: boolean; self?: { id: string; dmg: number }[] }
  | { k: 'fizzle'; from: string; card: string }
  | { k: 'enemy'; enemy: number; move: string; results: { id: string; dmg: number; blocked: number; loss: number; covered?: string; saved?: string; talisman?: boolean }[]; block?: number; buff?: number; weakAll?: number; vulnAll?: number; vuln?: string; thorns?: number; killed?: boolean; charge?: boolean; curse?: string; spawned?: number; heal?: { enemy: number; amount: number }; blockAll?: number; poison?: number }
  | { k: 'stunned'; enemy: number }
  | { k: 'poison'; items: { who: string; dmg: number; killed: boolean; src?: 'kerze'; saved?: string }[] }
  | { k: 'result'; result: 'win' | 'lose' };

export type TimedEv = Ev & { s: Snap; at: number; d: number };

function snap(f: Fight): Snap {
  return {
    e: f.enemies.map((e) => ({ hp: e.hp, block: e.block, st: { ...e.st }, buff: e.buff, dead: e.dead })),
    h: Object.fromEntries(f.heroes.map((h) => [h.id, { hp: h.hp, block: h.block, st: { ...h.st }, str: h.str }])),
  };
}

const DUR: Record<string, number> = { tier: 0.9, support: 1.3, hits: 1.7, fizzle: 0.8, enemy: 1.7, stunned: 1.1, poison: 1.3, result: 2 };

const POWER_NOTE: Record<PowerId, string> = { blockRound: 'Rüstung', blockAllRound: 'Ägis', poisonAllRound: 'Miasma', healAllRound: 'Lebensbaum', thorns: 'Dornen' };

/** Spieleraktionen einer Stufe gleichzeitig auflösen */
function resolveTier(f: Fight, tier: Speed, push: (e: Ev) => void) {
  const solo = f.heroes.length === 1;
  type Act = { h: Hero; c: CardInst; def: CardDef; target?: string };
  const acts: Act[] = [];
  for (const h of f.heroes) {
    if (h.hp <= 0) continue;
    for (const p of h.plan) {
      const c = cardOf(h, p.uid)!;
      const def = defOf(c);
      if (def.speed === tier) acts.push({ h, c, def, target: p.target });
    }
  }
  if (!acts.length) return;
  push({ k: 'tier', tier });

  // Zustand zu Beginn der Stufe (Bedingungen werden hier geprüft)
  const startE = f.enemies.map((e) => ({ hp: e.hp, maxHp: e.maxHp, st: { ...e.st }, dead: e.dead, block: e.block }));
  const startH = new Map(f.heroes.map((h) => [h.id, { ...h.st }]));
  const living = f.enemies.map((e, i) => i).filter((i) => !f.enemies[i].dead);

  // 1. Unterstützung (Block, Heilung, Schutz, Stärke, Kräfte) wirkt sofort
  const support: SupportItem[] = [];
  for (const a of acts) {
    const healBonus = relicN(a.h, 'kraeuterbeutel') * 2;
    const team = solo ? [a.h] : f.heroes.filter((x) => x.hp > 0);
    for (const fx of a.def.fx) {
      const v = val(fx, a.c.up, solo);
      const item = (to: string) => {
        let it = support.find((s) => s.from === a.h.id && s.card === a.def.id && s.to === to);
        if (!it) support.push((it = { from: a.h.id, card: a.def.id, to }));
        return it;
      };
      const bv = v + a.h.dex; // Geschicklichkeit: jede Blockkarte gibt mehr Block
      if (fx.k === 'block') { a.h.block += bv; item(a.h.id).block = (item(a.h.id).block ?? 0) + bv; }
      if (fx.k === 'blockTarget' && a.target) {
        const t = f.heroes.find((x) => x.id === a.target);
        if (t && !(solo && t.id === a.h.id)) { t.block += bv; item(t.id).block = (item(t.id).block ?? 0) + bv; }
      }
      if (fx.k === 'blockAll') for (const t of team) { t.block += bv; item(t.id).block = bv; }
      const tgtHero = a.def.target === 'ally' ? f.heroes.find((x) => x.id === a.target) : a.def.target === 'self' ? a.h : undefined;
      const heroTargets = tgtHero ? [tgtHero] : a.def.target === 'allAllies' ? team : [];
      if (fx.k === 'thornsTarget' && tgtHero) { tgtHero.thorns += v; item(tgtHero.id).thorns = v; }
      if (fx.k === 'thornsAll') for (const t of team) { t.thorns += v; item(t.id).thorns = v; }
      if (fx.k === 'doubleThorns' && tgtHero) { item(tgtHero.id).thorns = tgtHero.thorns; tgtHero.thorns *= 2; }
      if (fx.k === 'dex') { a.h.dex += v; item(a.h.id).note = `+${v} Geschicklichkeit`; }
      if (fx.k === 'dexAll') for (const t of team) { t.dex += v; item(t.id).note = `+${v} Geschicklichkeit`; }
      if (fx.k === 'drawNext') { a.h.drawNext += v; item(a.h.id).note = `+${v} Karte`; }
      if (fx.k === 'drawNextAll') for (const t of team) { t.drawNext += v; item(t.id).note = `+${v} Karte`; }
      if (fx.k === 'energyNext') { a.h.bonusEnergy += v; item(a.h.id).note = `+${v} Energie`; }
      if (fx.k === 'energyNextAll') for (const t of team) { t.bonusEnergy += v; item(t.id).note = `+${v} Energie`; }
      if (fx.k === 'tgtHeal') {
        const t = tgtHero && tgtHero.hp > 0 ? tgtHero : a.h;
        const g = Math.min(v + healBonus, t.maxHp - t.hp); t.hp += g; item(t.id).heal = (item(t.id).heal ?? 0) + g;
      }
      // Debuff-Sticker auf Karten, die Spieler treffen: das Ziel bekommt sie trotzdem (gewollt)
      for (const t of heroTargets) {
        if (fx.k === 'tgtPoison') { t.st.poison += v; item(t.id).note = `+${v} Gift`; }
        if (fx.k === 'tgtWeak') { t.st.weak += v; item(t.id).note = `Schwächung ${v}`; }
        if (fx.k === 'tgtVuln') { t.st.vuln += v; item(t.id).note = `Verwundbar ${v}`; }
        if (fx.k === 'tgtMark') { t.st.mark += v; item(t.id).note = `Markiert ${v}`; }
      }
      if (fx.k === 'heal' && a.target) {
        const t = f.heroes.find((x) => x.id === a.target);
        if (t && t.hp > 0) { const g = Math.min(v + healBonus, t.maxHp - t.hp); t.hp += g; item(t.id).heal = g; }
      }
      if (fx.k === 'maxHpAll') for (const t of team) { t.maxHp += v; t.hp += v; item(t.id).note = `+${v} max. Leben`; }
      if (fx.k === 'healAll') for (const t of team) { const g = Math.min(v + healBonus, t.maxHp - t.hp); t.hp += g; item(t.id).heal = g; }
      if (fx.k === 'cleanse' && a.target) {
        const t = f.heroes.find((x) => x.id === a.target);
        if (t) { t.st.poison = 0; t.st.weak = 0; t.st.vuln = 0; item(t.id).cleanse = true; }
      }
      if (fx.k === 'redirect' && a.target && a.target !== a.h.id) { a.h.covers.push(a.target); item(a.target).cover = true; }
      if (fx.k === 'taunt') { a.h.taunt = true; item(a.h.id).taunt = true; }
      if (fx.k === 'thorns') { a.h.thorns += v; item(a.h.id).thorns = v; }
      if (fx.k === 'selfDmg') { a.h.hp = Math.max(1, a.h.hp - v); }
      if (fx.k === 'str') { a.h.str += v; item(a.h.id).str = v; }
      if (fx.k === 'strAll') for (const t of team) { t.str += v; item(t.id).str = v; }
      if (fx.k === 'roundStr') { a.h.roundStr += v; item(a.h.id).note = `+${v} Stärke (Runde)`; }
      if (fx.k === 'keepBlock') { a.h.keepBlock = true; item(a.h.id).note = 'Block bleibt'; }
      if (fx.k === 'undying') { a.h.undying = true; item(a.h.id).note = 'unbeugsam'; }
      if (fx.k === 'revive') { f.revive = true; item(a.h.id).note = 'Wiedergeburt'; }
      if (fx.k === 'doubleAtk') { a.h.doubleAtk = true; item(a.h.id).note = 'Schattenklon'; }
      if (fx.k === 'power') {
        a.h.powers[fx.p] = (a.h.powers[fx.p] ?? 0) + v;
        applyPower(f, a.h, fx.p, v);
        item(a.h.id).note = POWER_NOTE[fx.p];
      }
    }
  }
  if (support.length) push({ k: 'support', items: support });

  // 2. Angriffe und Effekte auf Gegner – pro Gegner gesammelt
  const perEnemy = new Map<number, { parts: { from: string; card: string; dmg: number }[]; st: Partial<Status>; onKill: Hero[]; strip?: boolean }>();
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
        if (isAttackDef(a.def)) push({ k: 'fizzle', from: a.h.id, card: a.def.id });
        continue;
      }
      targets = [i];
    } else if (a.def.target === 'allEnemies' || a.def.target === 'randomEnemies') targets = living;
    if (!targets.length) continue;
    const hs = startH.get(a.h.id)!;
    const mul = a.h.doubleAtk && isAttackDef(a.def) ? 2 : 1;
    let bonus = hitBonus(f, a.h);
    if (isAttackDef(a.def) && !a.h.firstAtkDone) {
      a.h.firstAtkDone = true;
      bonus += relicN(a.h, 'schleifstein') * 3;
    }
    for (const fx of a.def.fx) {
      const v = val(fx, a.c.up, solo);
      if (fx.k === 'dmg') {
        const hits = (fx.hits?.[a.c.up ? 1 : 0] ?? 1) * mul;
        if (a.def.target === 'randomEnemies') {
          for (let k = 0; k < hits; k++) {
            const i = targets[Math.floor(Math.random() * targets.length)];
            add(i).parts.push({ from: a.h.id, card: a.def.id, dmg: heroHit(v + bonus, hs, startE[i].st) });
          }
        } else {
          for (const i of targets) {
            let base = v;
            const s = startE[i];
            if (a.def.double === 'belowHalf' && s.hp < s.maxHp / 2) base *= 2;
            if (a.def.double === 'vulnOrMarked' && (s.st.vuln > 0 || s.st.mark > 0)) base *= 2;
            add(i).parts.push({ from: a.h.id, card: a.def.id, dmg: heroHit(base + bonus, hs, s.st) * hits });
          }
        }
      }
      if (fx.k === 'dmgFromBlock') for (const i of targets) add(i).parts.push({ from: a.h.id, card: a.def.id, dmg: heroHit(a.h.block * v + bonus, hs, startE[i].st) * mul });
      if (fx.k === 'dmgFromThorns') for (const i of targets) add(i).parts.push({ from: a.h.id, card: a.def.id, dmg: heroHit(a.h.thorns * 2 + v + bonus, hs, startE[i].st) * mul });
      if (fx.k === 'missingDmg') for (const i of targets) {
        const s = startE[i];
        add(i).parts.push({ from: a.h.id, card: a.def.id, dmg: heroHit(missingBase(s.maxHp - s.hp, v, !!ENEMIES[f.enemies[i].id].boss) + bonus, hs, s.st) * mul });
      }
      if (fx.k === 'stripBlock') for (const i of targets) add(i).strip = true;
      if (fx.k === 'spreadPoison') for (const i of targets) {
        const n = Math.floor((startE[i].st.poison * v) / 100);
        if (n > 0) for (const j of living) if (j !== i) add(j).st.poison = (add(j).st.poison ?? 0) + n;
      }
      // Debuff-Sticker: bei zufälligen Zielen trifft es einen zufälligen Gegner
      const stTargets = a.def.target === 'randomEnemies' ? [targets[Math.floor(Math.random() * targets.length)]] : targets;
      for (const i of stTargets) {
        const x = add(i);
        if (fx.k === 'tgtPoison') x.st.poison = (x.st.poison ?? 0) + v;
        if (fx.k === 'tgtWeak') x.st.weak = (x.st.weak ?? 0) + v;
        if (fx.k === 'tgtVuln') x.st.vuln = (x.st.vuln ?? 0) + v;
        if (fx.k === 'tgtMark') x.st.mark = (x.st.mark ?? 0) + v;
      }
      if (fx.k === 'poisonBurst') for (const i of targets) add(i).parts.push({ from: a.h.id, card: a.def.id, dmg: startE[i].st.poison * v * mul });
      if (fx.k === 'execute') for (const i of targets) {
        const s = startE[i];
        if (ENEMIES[f.enemies[i].id].boss) add(i).parts.push({ from: a.h.id, card: a.def.id, dmg: v * mul });
        else if (s.hp < s.maxHp * 0.25) add(i).parts.push({ from: a.h.id, card: a.def.id, dmg: s.hp + s.block });
      }
      for (const i of targets) {
        const x = add(i);
        if (fx.k === 'poison') x.st.poison = (x.st.poison ?? 0) + (v + relicN(a.h, 'giftzahn')) * mul;
        if (fx.k === 'weak') x.st.weak = (x.st.weak ?? 0) + v * mul;
        if (fx.k === 'vuln') x.st.vuln = (x.st.vuln ?? 0) + v * mul;
        if (fx.k === 'mark') x.st.mark = (x.st.mark ?? 0) + v * mul;
        if (fx.k === 'stun') x.st.stun = 1;
        if (fx.k === 'doublePoison') x.st.poison = (x.st.poison ?? 0) + startE[i].st.poison * mul;
        if (fx.k === 'energyOnKill') x.onKill.push(a.h);
      }
    }
  }
  for (const [i, x] of [...perEnemy.entries()].sort((a, b) => a[0] - b[0])) {
    const e = f.enemies[i];
    if (e.dead) continue;
    if (x.strip) e.block = 0;
    const total = x.parts.reduce((s, p) => s + p.dmg, 0);
    const blocked = Math.min(e.block, total);
    e.block -= blocked;
    e.hp = Math.max(0, e.hp - (total - blocked));
    for (const [k, v] of Object.entries(x.st)) {
      if (k === 'stun') e.st.stun = 1;
      else (e.st as unknown as Record<string, number>)[k] += v as number;
    }
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
  const actors = f.enemies.filter((e) => !e.dead && e.intent);
  for (const e of actors) {
    const i = f.enemies.indexOf(e);
    if (e.dead) continue;
    if (first) { push({ k: 'tier', tier: 'enemies' }); first = false; }
    if (e.st.stun > 0) {
      e.st.stun = 0;
      push({ k: 'stunned', enemy: i });
      continue;
    }
    const m = e.intent!.move;
    const ev: Extract<Ev, { k: 'enemy' }> = { k: 'enemy', enemy: i, move: m.name, results: [] };
    const living = () => f.heroes.filter((h) => h.hp > 0);
    if (m.charge) ev.charge = true;
    if (m.block) { e.block += m.block; ev.block = m.block; }
    if (m.blockAllies) { for (const x of f.enemies) if (!x.dead) x.block += m.blockAllies; ev.blockAll = m.blockAllies; }
    if (m.healAlly) {
      const t = f.enemies.filter((x) => !x.dead && x !== e && x.hp < x.maxHp).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0] ?? e;
      const g = Math.min(m.healAlly, t.maxHp - t.hp);
      t.hp += g;
      ev.heal = { enemy: f.enemies.indexOf(t), amount: g };
    }
    if (m.spawn) {
      const n = spawnCount(f, m);
      const mul = Math.max(1, hpScale(f.heroes.length) / 2);
      for (let k = 0; k < n; k++) {
        const x = makeEnemy(m.spawn.id, mul);
        x.minion = true;
        f.enemies.push(x);
      }
      ev.spawned = n;
    }
    // Ziele für Angriffe und Zustände
    let targets: string[] = [];
    if (m.dmg || m.vuln || m.poison || m.curse) {
      targets = m.all ? living().map((h) => h.id) : e.intent!.targets.filter((id) => living().some((h) => h.id === id));
      if (!m.all) {
        const taunter = living().find((h) => h.taunt);
        if (taunter && m.dmg) targets = [taunter.id];
        else if (!targets.length && living().length) targets = [pick(living()).id];
      }
    }
    let thorns = 0;
    for (const tid of targets) {
      let h = f.heroes.find((x) => x.id === tid)!;
      let covered: string | undefined;
      const cover = living().find((x) => x.covers.includes(tid) && x.id !== tid);
      if (cover && !m.all && m.dmg) { covered = tid; h = cover; }
      let dmgSum = 0, blockedSum = 0, lossSum = 0;
      let saved: string | undefined, talisman = false;
      if (m.dmg) {
        const hits = m.hits ?? 1;
        for (let k = 0; k < hits && h.hp > 0; k++) {
          let d = (m.dmg + e.buff) * f.dmgMul;
          if (e.st.weak > 0) d *= 0.75;
          if (h.st.vuln > 0) d *= 1.5;
          if (relicN(h, 'fluchklinge')) d *= 1.25;
          d = Math.floor(d);
          const b = Math.min(h.block, d);
          h.block -= b;
          const r = hurtHero(f, h, d - b);
          saved = saved ?? r.saved;
          talisman = talisman || !!r.talisman;
          dmgSum += d; blockedSum += b; lossSum += d - b;
        }
        if (h.thorns > 0 && h.hp > 0) {
          thorns += h.thorns;
          if (h.powers.thornsPoison) e.st.poison += h.powers.thornsPoison;
          if (h.powers.thornsHeal) heal(h, h.powers.thornsHeal);
        }
      }
      if (m.vuln) h.st.vuln += m.vuln;
      if (m.poison) { h.st.poison += m.poison; ev.poison = m.poison; }
      if (m.curse) {
        const c = pick(['weak', 'vuln', 'poison'] as const);
        if (c === 'weak') h.st.weak += 2;
        if (c === 'vuln') h.st.vuln += 2;
        if (c === 'poison') h.st.poison += 3;
        ev.curse = c === 'weak' ? 'Schwächung 2' : c === 'vuln' ? 'Verwundbar 2' : '3 Gift';
      }
      ev.results.push({ id: h.id, dmg: dmgSum, blocked: blockedSum, loss: lossSum, covered, saved, talisman: talisman || undefined });
    }
    if (thorns > 0) {
      e.hp = Math.max(0, e.hp - thorns);
      ev.thorns = thorns;
      if (e.hp <= 0) { e.dead = true; ev.killed = true; }
    }
    if (m.weakAll) {
      for (const h of living()) h.st.weak += m.weakAll;
      ev.weakAll = m.weakAll;
    }
    if (m.vulnAll) {
      for (const h of living()) h.st.vuln += m.vulnAll;
      ev.vulnAll = m.vulnAll;
    }
    if (m.buff) { e.buff += m.buff; ev.buff = m.buff; }
    push(ev);
    if (f.heroes.some((h) => h.hp <= 0)) return;
  }
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
    if (h.hp > 0 && h.st.poison > 0) {
      const r = hurtHero(f, h, h.st.poison);
      items.push({ who: h.id, dmg: h.st.poison, killed: h.hp <= 0, saved: r.saved });
      h.st.poison--;
    }
    const k = relicN(h, 'schwarze-kerze');
    if (h.hp > 0 && k) {
      const r = hurtHero(f, h, 2 * k);
      items.push({ who: h.id, dmg: 2 * k, killed: h.hp <= 0, src: 'kerze', saved: r.saved });
    }
  }
  if (items.length) push({ k: 'poison', items });
  for (const x of [...f.enemies, ...f.heroes]) {
    x.st.weak = Math.max(0, x.st.weak - 1);
    x.st.vuln = Math.max(0, x.st.vuln - 1);
    x.st.mark = 0;
  }
  for (const h of f.heroes) if (!h.keepBlock) h.block = 0;
  for (const h of f.heroes) {
    h.covers = [];
    h.taunt = false;
    // Hand und gespielte Karten auf die Ablage – erschöpfende Karten auf den Erschöpft-Stapel
    discardHand(h);
  }
}

function discardHand(h: Hero) {
  const played = new Set(h.plan.map((p) => p.uid));
  for (const uid of h.hand) {
    const c = cardOf(h, uid);
    if (played.has(uid) && c && defOf(c).exhaust) h.exhaust.push(uid);
    else h.discard.push(uid);
  }
  h.hand = [];
  h.plan = [];
}

function checkOver(f: Fight): 'win' | 'lose' | null {
  if (f.heroes.some((h) => h.hp <= 0)) return 'lose';
  // Fällt der Boss, fällt seine Brut mit
  if (f.enemies.some((e) => e.dead && ENEMIES[e.id].boss)) for (const e of f.enemies) if (e.minion) e.dead = true;
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
  if (o) { f.over = o; push({ k: 'result', result: o }); endCleanup(f); }
  return out;
}

function endCleanup(f: Fight) {
  for (const h of f.heroes) {
    discardHand(h);
    // Kampfwerte enden mit dem Kampf
    h.str = 0;
    h.dex = 0;
    h.drawNext = 0;
    h.powers = {};
    h.roundStr = 0;
    h.bonusEnergy = 0;
    h.block = 0;
    h.covers = [];
    h.taunt = false;
    h.thorns = 0;
    h.st = noStatus();
  }
}

export const totalDuration = (evs: TimedEv[]) => (evs.length ? evs[evs.length - 1].at + evs[evs.length - 1].d : 0);

/* ---------------- Belohnungen, Laden, Relikte ---------------- */

function offerByOdds(cls: ClassId, odds: { common: number; uncommon: number; rare: number }, n: number): string[] {
  const pool = rewardPool(cls);
  const out: string[] = [];
  let guard = 0;
  while (out.length < n && guard++ < 200) {
    const r = Math.random();
    const rarity = r < odds.rare ? 'rare' : r < odds.rare + odds.uncommon ? 'uncommon' : 'common';
    let cands = pool.filter((c) => c.rarity === rarity && !out.includes(c.id));
    if (!cands.length) cands = pool.filter((c) => !out.includes(c.id));
    if (!cands.length) break;
    out.push(pick(cands).id);
  }
  return out;
}

export function rewardOffer(cls: ClassId, elite: boolean): string[] {
  return offerByOdds(cls, elite ? RARITY_ODDS.elite : RARITY_ODDS.normal, 3);
}
export function shopCards(cls: ClassId): string[] {
  return offerByOdds(cls, SHOP_ODDS, 5);
}
export function rareOffer(cls: ClassId): string[] {
  return offerByOdds(cls, { common: 0, uncommon: 0.3, rare: 0.7 }, 3);
}
export function legendaryOffer(cls: ClassId): string[] {
  return shuffle(legendaryPool(cls).map((c) => c.id)).slice(0, 3);
}

export function addCard(h: Hero, id: string) {
  h.deck.push({ uid: newUid('c'), id, up: false });
}

export function removeCard(h: Hero, uid: string) {
  h.deck = h.deck.filter((c) => c.uid !== uid);
}

export function upgradeCard(h: Hero, uid: string) {
  const c = cardOf(h, uid);
  if (c) c.up = true;
  return c;
}

/** Zufälliges Relikt, das der Spieler noch nicht hat */
export function randomRelic(h: Hero, exclude: string[] = []): string | null {
  const pool = RELIC_IDS.filter((r) => !h.relics.includes(r) && !exclude.includes(r));
  return pool.length ? pick(pool) : null;
}

export function addRelic(h: Hero, id: string) {
  h.relics.push(id);
  if (id === 'lebensfaden') { h.maxHp += 10; h.hp += 10; }
  if (id === 'seelenpakt') { h.maxHp = Math.max(10, h.maxHp - 12); h.hp = Math.max(1, Math.min(h.hp, h.maxHp)); }
}

export function heal(h: Hero, amount: number) {
  const g = Math.max(0, Math.min(amount, h.maxHp - h.hp));
  h.hp += g;
  return g;
}

/** Nach einem gewonnenen Kampf */
export function afterFight(h: Hero) {
  const k = relicN(h, 'blutstein');
  return k ? heal(h, 6 * k) : 0;
}

export function goldGain(h: Hero, base: number) {
  return Math.round(base * (1 + 0.5 * relicN(h, 'goldwaage')));
}

/* ---------------- Testspieler ---------------- */

/** Einfache, aber sinnvolle Planung: blocken bei Bedrohung, heilen bei wenig Leben, verstärken, sonst angreifen */
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
  const has = (c: CardInst, ks: string[]) => defOf(c).fx.some((x) => ks.includes(x.k));
  const isBlock = (c: CardInst) => has(c, ['block', 'blockAll', 'blockTarget']);
  const isHeal = (c: CardInst) => has(c, ['heal', 'healAll']);
  const isAtk = (c: CardInst) => isAttackDef(defOf(c));
  const isBuff = (c: CardInst) => has(c, ['str', 'strAll', 'roundStr', 'power', 'undying', 'revive', 'doubleAtk', 'dex', 'dexAll', 'thorns', 'thornsAll', 'thornsTarget', 'doubleThorns', 'drawNext', 'drawNextAll', 'energyNext', 'energyNextAll']);
  const order = [
    ...hand.filter((c) => isHeal(c) && hurt),
    ...(incoming >= 6 ? hand.filter(isBlock) : []),
    ...hand.filter(isBuff),
    ...hand.filter(isAtk),
    ...hand.filter(isBlock),
  ];
  let blockSoFar = 0;
  for (const c of order) {
    if (h.plan.some((p) => p.uid === c.uid)) continue;
    const def = defOf(c);
    if (isBlock(c) && !isAtk(c) && incoming >= 6 && blockSoFar >= incoming) continue;
    let target: string | undefined;
    if (def.target === 'enemy') {
      const poisonish = def.fx.some((x) => x.k === 'poison' || x.k === 'stun');
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

