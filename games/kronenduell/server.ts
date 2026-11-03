/**
 * Kronenduell – Kartenduell für 2 nach den Regeln von „Regicide: Crown Duels“ (Badgers from Mars).
 *
 * Ablauf einer Runde: Planen (abwechselnd verdeckt legen) → Aufdecken → Kampf → Zauber → Aufräumen.
 * Die Auflösung läuft Schritt für Schritt auf dem TV; am Ende jeder Phase drücken beide „Weiter“.
 */

import { type GameContext, type GameServerModule } from '@up/sdk';
import {
  VITALITY, cloneZones, shuffle, counterDraws, damage, emptyZones, keepCount, newDeck, reveal, shatter, siphonCount, stats,
  type Card, type Part, type Zone, type Zones,
} from './rules';

/** Dauer (Sekunden) je Auflösungs-Schritt auf dem TV – wichtige Momente bekommen mehr Zeit */
const DUR: Record<string, number> = {
  phase: 1.1, reveal: 1.6, strength: 1.3, block: 1.3, hit: 2, miss: 1.5, royalFalls: 2.6, kingFalls: 3, shatter: 1.8, siphon: 1.6,
  corrupt: 2, draw: 1, cleanup: 1.4, counter: 1.4,
};
const DEFAULT_DUR = 1.4;
const PHASES = ['reveal', 'fight', 'spells', 'cleanup'] as const;
type PhaseName = (typeof PHASES)[number];

interface PState {
  id: string;
  royal: number; // 0 Bube, 1 Dame, 2 König
  hp: number;
  hand: Card[];
  zones: Zones;
  /** in dieser Runde korrupt (kein Legen in die Korruption, 2 Karten bleiben übrig) */
  corrupt: boolean;
  defeated: boolean;
}

/** Öffentliche Sicht auf einen Spieler (verdeckte Karten ohne Wert) */
function pub(p: PState, showHidden = false) {
  const hide = (c: Card & { hidden?: boolean }) => (c.hidden && !showHidden ? { id: c.id, hidden: true } : { ...c });
  return {
    id: p.id, royal: p.royal, hp: p.hp, vit: VITALITY[Math.min(2, p.royal)], corrupt: p.corrupt, defeated: p.defeated, hand: p.hand.length,
    zones: { atk: p.zones.atk.map(hide), def: p.zones.def.map(hide), spell: p.zones.spell.map(hide), corr: p.zones.corr.map((c) => ({ id: c.id, hidden: true })) },
  };
}

interface Step {
  k: string;
  v?: Record<string, unknown>;
  /** Spielstand nach diesem Schritt */
  b: ReturnType<typeof pub>[];
  /** betroffene Zonen zum Hervorheben */
  hl?: { p: string; z: Zone | 'royal' }[];
  /** Phase */
  ph: PhaseName;
  /** Beginn (Sekunden ab Start der Auflösung) und Dauer */
  at: number;
  d: number;
}

export default {
  create(ctx: GameContext) {
    const ids = ctx.players.slice(0, 2).map((p) => p.id);
    const players: PState[] = ids.map((id) => ({ id, royal: 0, hp: VITALITY[0], hand: [], zones: emptyZones(), corrupt: false, defeated: false }));
    let deck = newDeck();
    let discard: Card[] = [];
    let jester = Math.random() < 0.5 ? 0 : 1; // wer den Narren hat
    let round = 0;
    let phase: 'intro' | 'plan' | 'resolve' | 'end' = 'intro';
    let turn = 0;
    let steps: Step[] = [];
    let phaseStart = 0;
    let phaseDone = false; // Auflösungs-Animation ist durch
    let phaseToken = 0;
    /** zuletzt gelegte Karte (für die Animation auf dem TV) */
    let lastPlaced: { p: string; zone: Zone; k: number } | null = null;
    let placedCount = 0;
    let ready = new Set<string>();
    let winner: number | null = null; // -1 = unentschieden
    const P = (i: number) => players[i];
    const other = (i: number) => 1 - i;
    const idx = (id: string) => ids.indexOf(id);

    function draw(p: PState, n: number) {
      for (let i = 0; i < n; i++) {
        if (!deck.length) {
          deck = shuffle(discard); // Ablage neu mischen
          discard = [];
          if (!deck.length) return;
        }
        p.hand.push(deck.pop()!);
      }
    }
    function toDiscard(cards: Card[]) {
      discard.push(...cards.map(({ id, s, n }) => ({ id, s, n })));
    }

    /* ---------------- Start ---------------- */

    function start() {
      players.forEach((p) => draw(p, VITALITY[0]));
      phase = 'intro';
      ready = new Set();
      broadcast();
    }

    /* ---------------- Planen ---------------- */

    const canPlace = (i: number) => P(i).hand.length > keepCount(P(i).corrupt);

    function startPlot() {
      round++;
      phase = 'plan';
      lastPlaced = null;
      const [a, b] = [P(0).hand.length, P(1).hand.length];
      if (a === b) {
        if (round > 1) jester = other(jester);
        turn = jester;
      } else turn = a > b ? 0 : 1;
      if (!canPlace(turn)) turn = other(turn);
      if (!canPlace(0) && !canPlace(1)) return endPlot();
      broadcast();
    }

    function place(i: number, cardId: number, zone: Zone) {
      const p = P(i);
      if (phase !== 'plan' || turn !== i || !canPlace(i)) return;
      if (zone === 'corr' && p.corrupt) return;
      const k = p.hand.findIndex((c) => c.id === cardId);
      if (k < 0 || !['atk', 'def', 'spell', 'corr'].includes(zone)) return;
      const [card] = p.hand.splice(k, 1);
      p.zones[zone].push({ ...card, hidden: true });
      lastPlaced = { p: p.id, zone, k: ++placedCount };
      // Wer mehr Karten hat, legt weiter, bis beide gleich viele haben; sonst abwechselnd
      const o = other(i);
      if (!canPlace(i)) turn = canPlace(o) ? o : -1;
      else if (p.hand.length > P(o).hand.length || !canPlace(o)) turn = i;
      else turn = o;
      if (turn === -1) return endPlot();
      broadcast();
    }

    function endPlot() {
      // Letzte Karte(n) auf der Hand abwerfen (wie im Regelheft)
      for (const p of players) {
        toDiscard(p.hand);
        p.hand = [];
      }
      buildResolution();
      phase = 'resolve';
      startResolve();
    }

    /* ---------------- Auflösung ---------------- */

    function snap(): ReturnType<typeof pub>[] {
      return players.map((p) => pub(p));
    }

    function buildResolution() {
      steps = [];
      let t = 0;
      const order = [jester, other(jester)]; // wer den Narren hat, löst zuerst auf
      const push = (ph: PhaseName, k: string, v?: Record<string, unknown>, hl?: Step['hl']) => {
        // neue Phase: kurzer Zwischentitel
        if (steps.length && steps[steps.length - 1].ph !== ph) {
          const d = DUR.phase;
          steps.push({ k: 'phase', ph, b: steps[steps.length - 1].b, at: t, d });
          t += d;
        }
        const d = DUR[k] ?? DEFAULT_DUR;
        steps.push({ k, v, b: snap(), hl, ph, at: t, d });
        t += d;
      };

      // 1. Aufdecken
      const revealed = players.map((p) => reveal(p.zones));
      players.forEach((p, i) => {
        // erst alles aufdecken (Abwürfe danach als eigene Schritte)
        const z = cloneZones(p.zones);
        for (const k of ['atk', 'def', 'spell'] as const) z[k] = z[k].map((c) => ({ ...c, hidden: false }));
        p.zones = z;
        void i;
      });
      push('reveal', 'reveal');
      for (const i of order) {
        const p = P(i);
        const r = revealed[i];
        const name = { p: p.id };
        if (r.higherSw.length) {
          p.zones.atk = p.zones.atk.filter((c) => !r.higherSw.some((x) => x.id === c.id));
          toDiscard(r.higherSw);
          push('reveal', 'higherSw', { ...name, cards: r.higherSw }, [{ p: p.id, z: 'atk' }]);
        }
        if (r.higherSh.length) {
          p.zones.def = p.zones.def.filter((c) => !r.higherSh.some((x) => x.id === c.id));
          toDiscard(r.higherSh);
          push('reveal', 'higherSh', { ...name, cards: r.higherSh }, [{ p: p.id, z: 'def' }]);
        }
        if (r.wrongZone.length) {
          const gone = new Set(r.wrongZone.map((c) => c.id));
          p.zones.atk = p.zones.atk.filter((c) => !gone.has(c.id));
          p.zones.def = p.zones.def.filter((c) => !gone.has(c.id));
          toDiscard(r.wrongZone);
          push('reveal', 'wrongZone', { ...name, cards: r.wrongZone }, [{ p: p.id, z: 'atk' }, { p: p.id, z: 'def' }]);
        }
        if (r.spellCancel.length) {
          p.zones.spell = p.zones.spell.filter((c) => !r.spellCancel.some((x) => x.id === c.id));
          toDiscard(r.spellCancel);
          push('reveal', 'spellCancel', { ...name, cards: r.spellCancel }, [{ p: p.id, z: 'spell' }]);
        }
        p.zones = { ...r.zones, corr: p.zones.corr };
      }

      // 2. Kampf
      const st = players.map((p) => stats(p.zones));
      for (const i of order) {
        const p = P(i);
        const s = st[i];
        push('fight', 'strength', { p: p.id, value: s.baseStr, parts: s.strParts }, [{ p: p.id, z: 'atk' }]);
        push('fight', 'block', { p: p.id, value: s.baseBlk, parts: s.blkParts }, [{ p: p.id, z: 'def' }]);
        if (s.allOutAtk && s.allOutDef) push('fight', 'facePlant', { p: p.id }, [{ p: p.id, z: 'spell' }]);
        else if (s.allOutAtk) push('fight', 'allOutAtk', { p: p.id, str: s.str }, [{ p: p.id, z: 'spell' }]);
        else if (s.allOutDef) push('fight', 'allOutDef', { p: p.id, blk: s.blk }, [{ p: p.id, z: 'spell' }]);
      }
      for (const i of order) {
        const a = P(i);
        const d = P(other(i));
        const sa = st[i];
        const sd = st[other(i)];
        if (sa.str > sd.blk) {
          const dm = damage(a.zones);
          d.hp = Math.max(0, d.hp - dm.dmg);
          push('fight', 'hit', { p: a.id, t: d.id, str: sa.str, blk: sd.blk, dmg: dm.dmg, crit: dm.crit, match: dm.match, fallen: d.hp === 0 }, [{ p: d.id, z: 'royal' }]);
          const n = counterDraws(d.zones);
          if (n) {
            draw(d, n);
            push('fight', 'counter', { p: d.id, n }, [{ p: d.id, z: 'def' }]);
          }
        } else push('fight', 'miss', { p: a.id, t: d.id, str: sa.str, blk: sd.blk });
      }

      // 3. Zauber: erst Tränke (Absaugen), dann Kristalle (Zerschmettern)
      let any = false;
      for (const i of order) {
        const p = P(i);
        const n = siphonCount(p.zones, P(other(i)).zones);
        if (!n) continue;
        any = true;
        for (let k = 0; k < n; k++) {
          if (!deck.length) {
            deck = shuffle(discard);
            discard = [];
          }
          const c = deck.pop();
          if (c) p.zones.corr.push({ ...c, hidden: true });
        }
        push('spells', 'siphon', { p: p.id, n }, [{ p: p.id, z: 'corr' }]);
      }
      for (const i of order) {
        const p = P(i);
        if (!p.zones.spell.some((c) => c.s === 'cr')) continue;
        any = true;
        const destroyed = shatter(p.zones, P(other(i)).zones);
        toDiscard(destroyed);
        push('spells', destroyed.length ? 'shatter' : 'shatterNone', { p: p.id, t: P(other(i)).id, cards: destroyed }, [{ p: P(other(i)).id, z: 'atk' }, { p: P(other(i)).id, z: 'def' }]);
      }
      if (!any) push('spells', 'noSpells');

      // 4. Aufräumen
      for (const p of players) {
        const gone = [...p.zones.spell, ...p.zones.atk.filter((c) => c.s === 'po' || c.s === 'cr'), ...p.zones.def.filter((c) => c.s === 'po' || c.s === 'cr')];
        toDiscard(gone);
        p.zones.spell = [];
        p.zones.atk = p.zones.atk.filter((c) => c.s === 'sw');
        p.zones.def = p.zones.def.filter((c) => c.s === 'sh');
      }
      push('cleanup', 'cleanup');
      let kingsDown = 0;
      for (const i of order) {
        const p = P(i);
        if (p.hp > 0) continue;
        toDiscard([...p.zones.atk, ...p.zones.def]);
        p.zones.atk = [];
        p.zones.def = [];
        if (p.royal >= 2) {
          p.defeated = true;
          kingsDown++;
          push('cleanup', 'kingFalls', { p: p.id }, [{ p: p.id, z: 'royal' }]);
        } else {
          p.royal++;
          p.hp = VITALITY[p.royal];
          push('cleanup', 'royalFalls', { p: p.id, royal: p.royal }, [{ p: p.id, z: 'royal' }]);
        }
      }
      if (kingsDown) {
        winner = kingsDown === 2 ? -1 : players[0].defeated ? 1 : 0;
        return;
      }
      for (const i of order) {
        const p = P(i);
        const vit = VITALITY[p.royal];
        const wasCorrupt = p.corrupt;
        p.corrupt = p.zones.corr.length >= vit;
        if (p.corrupt) {
          const n = p.zones.corr.length;
          p.hand.push(...p.zones.corr.map(({ id, s, n: v }) => ({ id, s, n: v })));
          p.zones.corr = [];
          push('cleanup', 'corrupt', { p: p.id, n }, [{ p: p.id, z: 'corr' }]);
        } else if (wasCorrupt) push('cleanup', 'pure', { p: p.id });
        draw(p, vit);
        push('cleanup', 'draw', { p: p.id, n: vit });
      }
    }

    const totalDur = () => (steps.length ? steps[steps.length - 1].at + steps[steps.length - 1].d : 0);

    function startResolve() {
      ready = new Set();
      phaseStart = Date.now() + 300;
      phaseDone = false;
      const token = ++phaseToken;
      broadcast();
      // Erst wenn die ganze Runde gezeigt wurde, darf es weitergehen (Testspieler/Getrennte zählen als bereit)
      ctx.after(totalDur() + 0.5, () => {
        if (token !== phaseToken) return;
        phaseDone = true;
        checkAdvance();
      });
    }

    function checkAdvance() {
      if (phase !== 'resolve' && phase !== 'intro') return;
      if (phase === 'resolve' && !phaseDone) return;
      const need = ids.filter((id) => ctx.player(id)?.connected && !ctx.player(id)?.isBot);
      if (!need.every((id) => ready.has(id))) return;
      if (phase === 'intro') return startPlot();
      if (winner != null) return endGame();
      startPlot();
    }

    function endGame() {
      phase = 'end';
      broadcast();
      const ranking = ids.map((id, i) => ({ playerId: id, score: winner === -1 ? 1 : winner === i ? 2 : 0 })).sort((a, b) => b.score - a.score);
      ctx.finish(ranking);
    }

    /* ---------------- Ansichten ---------------- */

    function hostView() {
      const base = { round, jester: ids[jester], players: ids };
      if (phase === 'intro') return { screen: 'intro', ...base, ready: [...ready] };
      if (phase === 'plan') return { screen: 'plan', ...base, turn: ids[turn], board: snap(), deck: deck.length, discardTop: discard[discard.length - 1] ?? null, placed: lastPlaced };
      if (phase === 'resolve') return { screen: 'resolve', ...base, steps, startAt: phaseStart, ready: [...ready], deck: deck.length, last: winner != null };
      return { screen: 'end', ...base, winner: winner === -1 ? null : ids[winner!], draw: winner === -1, board: snap() };
    }

    function phoneView(i: number) {
      const p = P(i);
      const o = P(other(i));
      const base = { round, me: pub(p, true), opp: pub(o), jester: ids[jester] === p.id };
      if (phase === 'intro') return { screen: 'intro', ...base, input: true, pressed: ready.has(p.id) };
      if (phase === 'plan') {
        return {
          screen: 'plan', ...base, placed: lastPlaced, hand: p.hand, myTurn: turn === i, input: turn === i, canPlace: canPlace(i), keep: keepCount(p.corrupt),
        };
      }
      if (phase === 'resolve') return { screen: 'resolve', ...base, steps, startAt: phaseStart, pressed: ready.has(p.id), input: !ready.has(p.id), last: winner != null };
      return { screen: 'end', ...base, won: winner === i, draw: winner === -1 };
    }

    function broadcast() {
      ctx.setHostView(hostView());
      ids.forEach((id, i) => ctx.setPlayerView(id, phoneView(i)));
      ctx.setAudienceView({ screen: 'watch' });
    }

    return {
      start,
      onAction(id, action) {
        const i = idx(id);
        if (i < 0 || !action || typeof action !== 'object') return;
        if (action.type === 'place') return place(i, Number(action.card), String(action.zone) as Zone);
        if (action.type === 'next' && (phase === 'resolve' || phase === 'intro')) {
          ready.add(id);
          broadcast();
          checkAdvance();
        }
      },
      onPlayerRejoin() {
        broadcast();
        checkAdvance();
      },
      bot(id, view) {
        if (view.screen === 'plan' && view.myTurn && view.canPlace && view.hand.length) {
          const c = view.hand[Math.floor(Math.random() * view.hand.length)];
          const zones: Zone[] = view.me.corrupt ? ['atk', 'def', 'spell'] : ['atk', 'def', 'spell', 'corr'];
          const pref: Record<string, Zone> = { sw: 'atk', sh: 'def' };
          const zone = Math.random() < 0.7 && pref[c.s] ? pref[c.s] : zones[Math.floor(Math.random() * zones.length)];
          return { type: 'place', card: c.id, zone };
        }
        if ((view.screen === 'resolve' || view.screen === 'intro') && !view.pressed) return { type: 'next' };
        void id;
        return null;
      },
    };
  },
} satisfies GameServerModule;

export type { Part };
