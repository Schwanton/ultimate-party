/**
 * Tick Tack Boom – kooperatives Bomben-Entschärfen.
 * Spielart A „Entschärfer“: einer sieht die Bombe auf dem Handy, die anderen haben die Anleitung.
 * Spielart B „Alle an Deck“: Bombe auf dem TV, jedes Modul bedient ein anderer, die Anleitung hat jemand anderes.
 * Regeln und Module: engine.ts
 */

import { shuffle, type GameContext, type GameServerModule, type TimerHandle } from '@up/sdk';
import * as E from './engine';

const T = { intro: 10, roles: 8, end: 7, botTick: 2.6 };
const TAP_MS = 600; // kürzer gedrückt = getippt
const DOPPEL_HOLD = 1.5;
const DOPPEL_WINDOW = 1.0;
const BOT_ERR = 0.06;

type Phase = 'intro' | 'roles' | 'armed' | 'end' | 'final';

export default {
  create(ctx: GameContext) {
    const lang: E.Lang = ctx.lang === 'en' ? 'en' : 'de';
    const ids = ctx.players.map((p) => p.id);
    const mode: 'a' | 'b' = ctx.options.mode === 'b' ? 'b' : 'a';
    const nb = [3, 4, 5].includes(Number(ctx.options.bombs)) ? Number(ctx.options.bombs) : 4;
    const plan = E.STAGE_PLAN[nb];
    const mixed = ctx.options.mix === 'on';
    const r = E.makeRng(Math.floor(Math.random() * 1e9));
    const rules = E.makeRules(lang, mixed ? Math.floor(Math.random() * 1e9) : null);
    const probe = ctx.timer(1, () => {});
    const scale = probe.duration / 1000;
    probe.cancel();
    const isBot = (id: string) => !!ctx.player(id)?.isBot;

    let phase: Phase = 'intro';
    let bombNo = 0;
    let bomb: E.Bomb | null = null;
    let key = 0;
    let defuser: string | null = null;
    let ops = new Map<number, string[]>();
    let chapters = new Map<string, (E.Kind | 'gehaeuse')[]>();
    let strikes = 0;
    let maxStrikes = 3;
    let clock = { at: 0, rem: 0, rate: 1 };
    let boomTimer: TimerHandle | null = null;
    let bombTimers: TimerHandle[] = [];
    let flash = { strikeAt: 0, solveAt: 0, by: '' };
    let doppel = { greenT: null as TimerHandle | null, winT: null as TimerHandle | null, firstRelease: 0 };
    const results: { stage: number; defused: boolean; left: number; strikes: number }[] = [];
    const stats = new Map(ids.map((id) => [id, { solved: 0, strikes: 0 }]));
    const chapterCache = new Map<string, E.Chapter>();
    const chap = (k: E.Kind | 'gehaeuse') => {
      if (!chapterCache.has(k)) chapterCache.set(k, E.chapter(lang, rules, k));
      return chapterCache.get(k)!;
    };

    const stage = () => E.STAGES[(bomb?.stage ?? 1) - 1];
    const remNow = () => Math.max(0, clock.rem - (Date.now() - clock.at) * clock.rate);

    /* ---------- Rollen ---------- */

    function assignRoles() {
      if (!bomb) return;
      ops = new Map();
      chapters = new Map(ids.map((id) => [id, []]));
      const give = (pid: string, k: E.Kind | 'gehaeuse') => {
        const list = chapters.get(pid)!;
        if (!list.includes(k)) list.push(k);
      };
      const kinds = bomb.mods.map((m) => m.kind);
      if (mode === 'a') {
        defuser = ids[bombNo % ids.length];
        const readers = shuffle(ids.filter((id) => id !== defuser));
        const partner = readers[0] ?? defuser;
        for (const m of bomb.mods) {
          ops.set(m.i, m.kind === 'stimme' ? [...ids] : m.kind === 'doppel' ? [defuser, partner] : [defuser]);
        }
        const n = Math.max(kinds.length, readers.length);
        for (let j = 0; j < n; j++) give(readers[j % readers.length], kinds[j % kinds.length]);
        for (const id of readers) give(id, 'gehaeuse');
      } else {
        defuser = null;
        const order = shuffle(ids);
        let p = 0;
        const next = () => order[p++ % order.length];
        for (const m of bomb.mods) {
          if (m.kind === 'stimme') ops.set(m.i, [...ids]);
          else if (m.kind === 'doppel') {
            const a = next();
            let b = next();
            if (b === a) b = next();
            ops.set(m.i, [a, b]);
          } else ops.set(m.i, [next()]);
        }
        // Anleitung immer bei jemandem, der das Modul nicht bedient
        let q = Math.floor(r() * order.length);
        for (const m of bomb.mods) {
          const own = ops.get(m.i)!;
          let reader = order[q++ % order.length];
          for (let tries = 0; tries < order.length && own.includes(reader) && m.kind !== 'stimme'; tries++) reader = order[q++ % order.length];
          give(reader, m.kind);
        }
        for (const id of ids) give(id, 'gehaeuse');
      }
    }

    /* ---------- Ansichten ---------- */

    function pub(m: E.Mod, full: boolean): object {
      const base = { i: m.i, kind: m.kind, solved: m.solved, ops: ops.get(m.i) ?? [] };
      if (!full) return base;
      switch (m.kind) {
        case 'kabel': return { ...base, colors: m.colors, cut: m.cut };
        case 'knopf': return { ...base, color: m.color, label: E.btnLabel(lang, m.label), held: m.held, strip: m.held ? m.strip : null };
        case 'zeichen': return { ...base, symbols: m.symbols, pressed: m.symbols.map((s) => m.order.indexOf(s) < m.done) };
        case 'blink': return { ...base, show: m.seq.slice(0, m.stage), stage: Math.min(m.stage, m.seq.length), total: m.seq.length, input: m.input };
        case 'funk': return { ...base, code: [...m.word].map((ch) => E.MORSE[ch]).join(' '), freq: E.FREQS[m.dial] };
        case 'irrgarten': return { ...base, pos: m.pos, goal: m.goal, markers: E.MAZE_MARKERS[m.maze] };
        case 'wort': return { ...base, display: m.display, buttons: m.buttons, stage: m.stage, total: m.total };
        case 'schloss': return { ...base, wheels: m.wheels };
        case 'doppel': return { ...base, hold: m.hold, green: m.green };
        case 'stimme': {
          const counts = m.symbols.map((_, k) => Object.values(m.votes).filter((v) => v === k).length);
          return { ...base, symbols: m.symbols, counts, voted: Object.keys(m.votes) };
        }
        case 'druck': return { ...base, last: m.last, period: m.period };
        case 'frage': return { ...base, q: m.q == null ? null : E.QUESTIONS[m.q][lang], deadline: m.deadline, duration: m.duration };
      }
    }

    function common() {
      return { key, mode, bombNo: bombNo + 1, bombs: plan.length, stage: bomb?.stage ?? 1, clock, strikes, maxStrikes, flash };
    }

    function hostView(): object {
      const base = { ...common(), screen: phase, defuser, results, mixed };
      if (phase === 'intro') return base;
      if (phase === 'final') {
        const most = (f: 'solved' | 'strikes') => {
          const best = [...stats.entries()].sort((a, b) => b[1][f] - a[1][f])[0];
          return best && best[1][f] > 0 ? { pid: best[0], n: best[1][f] } : null;
        };
        return { ...base, awards: { solved: most('solved'), strikes: most('strikes') } };
      }
      const readers = ids.map((pid) => ({ pid, chapters: (chapters.get(pid) ?? []).filter((k) => k !== 'gehaeuse').map((k) => E.kindTitle(lang, k)) }));
      return {
        ...base,
        readers,
        mods: bomb ? bomb.mods.map((m) => pub(m, mode === 'b')) : [],
        case: mode === 'b' ? bomb?.case : null,
        defused: results.at(-1)?.defused ?? false,
      };
    }

    function phoneView(pid: string): object {
      const base = { ...common(), screen: phase };
      if (phase === 'intro' || phase === 'final') return { ...base, defused: results.filter((x) => x.defused).length };
      if (phase === 'end') return { ...base, defused: results.at(-1)?.defused ?? false };
      const role = mode === 'b' ? 'crew' : pid === defuser ? 'defuser' : 'reader';
      const mine = bomb ? bomb.mods.filter((m) => (ops.get(m.i) ?? []).includes(pid)) : [];
      return {
        ...base,
        role,
        defuser,
        case: role === 'defuser' ? bomb?.case : null,
        mods: phase === 'armed' ? mine.map((m) => pub(m, true)) : mine.map((m) => pub(m, false)),
        chapters: (chapters.get(pid) ?? []).map(chap),
      };
    }

    function refresh(all = false) {
      ctx.setHostView(hostView());
      for (const id of ids) if (all || !isBot(id)) ctx.setPlayerView(id, phoneView(id));
      ctx.setAudienceView({ screen: 'audience', phase });
    }

    /* ---------- Ablauf ---------- */

    function intro() {
      phase = 'intro';
      refresh(true);
      ctx.after(T.intro, roles);
    }

    function roles() {
      const st = plan[bombNo];
      const kinds = E.chooseKinds(r, st, ids.length >= 2);
      bomb = E.makeBomb(r, rules, lang, st, kinds);
      key++;
      strikes = 0;
      maxStrikes = E.STAGES[st - 1].maxStrikes;
      flash = { strikeAt: 0, solveAt: 0, by: '' };
      assignRoles();
      clock = { at: Date.now(), rem: stage().time * 1000 * scale, rate: 1 };
      phase = 'roles';
      refresh(true);
      ctx.after(T.roles, arm);
    }

    function arm() {
      if (!bomb) return;
      phase = 'armed';
      boomTimer = ctx.timer(stage().time, () => endBomb(false));
      clock = { at: Date.now(), rem: boomTimer.duration, rate: 1 };
      for (const m of bomb.mods) {
        if (m.kind === 'druck') startDruck(m);
        if (m.kind === 'frage') scheduleFrage(m, 20);
      }
      refresh(true);
      botLoop(key);
    }

    function botLoop(k: number) {
      if (phase !== 'armed' || key !== k) return;
      for (const id of ids) if (isBot(id)) ctx.setPlayerView(id, phoneView(id));
      ctx.after(T.botTick, () => botLoop(k));
    }

    function endBomb(defused: boolean) {
      if (phase !== 'armed') return;
      boomTimer?.cancel();
      for (const t of bombTimers) t.cancel();
      bombTimers = [];
      doppelReset();
      results.push({ stage: bomb?.stage ?? 1, defused, left: defused ? remNow() : 0, strikes });
      phase = 'end';
      refresh(true);
      ctx.after(T.end, () => {
        bombNo++;
        if (bombNo < plan.length) roles();
        else finish();
      });
    }

    function finish() {
      phase = 'final';
      refresh(true);
      const won = results.filter((x) => x.defused).length;
      ctx.finish(ids.map((playerId) => ({ playerId, score: won })));
    }

    function strike(pid: string) {
      if (phase !== 'armed') return;
      strikes++;
      const s = stats.get(pid);
      if (s) s.strikes++;
      flash = { ...flash, strikeAt: Date.now(), by: pid };
      if (strikes >= maxStrikes) {
        endBomb(false);
        return;
      }
      const now = Date.now();
      clock = { at: now, rem: remNow(), rate: clock.rate * E.SPEEDUP };
      boomTimer?.cancel();
      boomTimer = ctx.timerAt(now + clock.rem / clock.rate, () => endBomb(false));
    }

    function solve(m: E.Mod, pid: string) {
      m.solved = true;
      const s = stats.get(pid);
      if (s) s.solved++;
      flash = { ...flash, solveAt: Date.now(), by: pid };
      if (bomb && bomb.mods.every((x) => x.solved || E.isNeedy(x.kind))) endBomb(true);
    }

    /* ---------- Dauer-Module ---------- */

    function startDruck(m: E.DruckMod) {
      const t = ctx.timer(35, () => {
        strike(m.i === -1 ? '' : (ops.get(m.i) ?? [''])[0]);
        if (phase === 'armed') { startDruck(m); refresh(); }
      });
      bombTimers.push(t);
      m.last = Date.now();
      m.period = t.duration;
      (m as any)._t = t;
    }

    function scheduleFrage(m: E.FrageMod, delay: number) {
      const t = ctx.timer(delay, () => {
        if (phase !== 'armed' || !bomb) return;
        m.q = Math.floor(r() * E.QUESTIONS.length);
        const ans = ctx.timer(15, () => {
          m.q = null;
          strike((ops.get(m.i) ?? [''])[0]);
          if (phase === 'armed') { scheduleFrage(m, 40); refresh(); }
        });
        bombTimers.push(ans);
        (m as any)._t = ans;
        m.deadline = ans.deadline;
        m.duration = ans.duration;
        refresh();
      });
      bombTimers.push(t);
    }

    /* ---------- Doppelschloss ---------- */

    function doppelReset(m?: E.DoppelMod) {
      doppel.greenT?.cancel();
      doppel.winT?.cancel();
      doppel = { greenT: null, winT: null, firstRelease: 0 };
      if (m) { m.hold = {}; m.green = false; }
    }

    function doppelAct(m: E.DoppelMod, pid: string, a: any) {
      const own = ops.get(m.i) ?? [];
      if (a.press) {
        if (m.green || m.hold[pid]) return;
        m.hold[pid] = true;
        if (own.every((id) => m.hold[id]) && !doppel.greenT) {
          doppel.greenT = ctx.timer(DOPPEL_HOLD, () => {
            if (phase !== 'armed' || m.solved) return;
            m.green = true;
            refresh();
          });
          bombTimers.push(doppel.greenT);
        }
        return;
      }
      if (a.release) {
        if (!m.hold[pid]) return;
        m.hold[pid] = false;
        if (!m.green) {
          doppelReset(m);
          strike(pid);
          return;
        }
        if (!doppel.firstRelease) {
          doppel.firstRelease = Date.now();
          doppel.winT = ctx.timer(DOPPEL_WINDOW, () => {
            if (phase !== 'armed' || m.solved) return;
            doppelReset(m);
            strike(pid);
            refresh();
          });
          bombTimers.push(doppel.winT);
          if (own.length < 2 || own.every((id) => !m.hold[id])) { doppelReset(m); solve(m, pid); }
          return;
        }
        doppelReset(m);
        solve(m, pid);
      }
    }

    /* ---------- Aktionen ---------- */

    function act(pid: string, i: number, a: any) {
      if (phase !== 'armed' || !bomb) return;
      const m = bomb.mods[i];
      if (!m || !(ops.get(m.i) ?? []).includes(pid)) return;
      if (m.solved && !E.isNeedy(m.kind)) return;
      const c = bomb.case;
      switch (m.kind) {
        case 'kabel': {
          const w = Number(a.w);
          if (!(w >= 0 && w < m.colors.length) || m.cut[w]) return;
          m.cut[w] = true;
          if (w === E.wireSolution(rules, c, m.colors)) solve(m, pid);
          else strike(pid);
          break;
        }
        case 'knopf': {
          const needHold = E.knopfHold(c, m);
          if (a.tap) {
            if (needHold) strike(pid); else solve(m, pid);
            m.held = false;
            break;
          }
          if (a.press) {
            if (m.held) return;
            m.held = true;
            m.heldAt = Date.now();
            break;
          }
          if (a.release) {
            if (!m.held) return;
            m.held = false;
            const dur = Date.now() - m.heldAt;
            if (dur < TAP_MS * scale) {
              if (needHold) strike(pid); else solve(m, pid);
            } else if (!needHold) strike(pid);
            else if (E.clockText(remNow()).includes(String(rules.stripDigit[m.strip]))) solve(m, pid);
            else strike(pid);
          }
          break;
        }
        case 'zeichen': {
          const s = String(a.s);
          const idx = m.order.indexOf(s);
          if (idx < 0 || idx < m.done) return;
          if (idx === m.done) {
            m.done++;
            if (m.done >= m.order.length) solve(m, pid);
          } else strike(pid);
          break;
        }
        case 'blink': {
          if (!E.BLINK_COLORS.includes(a.c)) return;
          if (a.c === E.blinkExpected(rules, c, m, strikes)) {
            m.input++;
            if (m.input >= m.stage) {
              m.stage++;
              m.input = 0;
              if (m.stage > m.seq.length) solve(m, pid);
            }
          } else {
            m.input = 0;
            strike(pid);
          }
          break;
        }
        case 'funk': {
          if (a.tune) {
            const n = E.FREQS.length;
            m.dial = (m.dial + (a.tune > 0 ? 1 : -1) + n) % n;
          } else if (a.send) {
            if (E.FREQS[m.dial] === rules.freqOf[m.word]) solve(m, pid);
            else strike(pid);
          }
          break;
        }
        case 'irrgarten': {
          if (!['n', 'o', 's', 'w'].includes(a.d)) return;
          const n = E.mazeStep(rules, m, a.d);
          if (!n) { strike(pid); break; }
          m.pos = n;
          if (n[0] === m.goal[0] && n[1] === m.goal[1]) solve(m, pid);
          break;
        }
        case 'wort': {
          const w = String(a.w);
          if (!m.buttons.includes(w)) return;
          if (w === E.wortAnswer(rules, m)) {
            m.stage++;
            if (m.stage > m.total) solve(m, pid);
            else E.newWortStage(r, rules, lang, m);
          } else {
            strike(pid);
            E.newWortStage(r, rules, lang, m);
          }
          break;
        }
        case 'schloss': {
          if (a.open) {
            const code = E.lockCode(rules, c);
            if (code.every((d, k) => m.wheels[k] === d)) solve(m, pid);
            else strike(pid);
          } else {
            const k = Number(a.wheel);
            if (!(k >= 0 && k < 3)) return;
            m.wheels[k] = (m.wheels[k] + (a.d > 0 ? 1 : 9)) % 10;
          }
          break;
        }
        case 'doppel':
          doppelAct(m, pid, a);
          break;
        case 'stimme': {
          const k = Number(a.vote);
          if (!(k >= 0 && k < m.symbols.length)) return;
          m.votes[pid] = k;
          const voters = ids.filter((id) => ctx.player(id)?.connected !== false);
          if (voters.every((id) => m.votes[id] !== undefined)) {
            const counts = m.symbols.map((_, j) => Object.values(m.votes).filter((v) => v === j).length);
            const top = Math.max(...counts);
            const winners = counts.filter((x) => x === top).length;
            const correct = m.symbols.indexOf(rules.voteRows[m.row].symbols[rules.voteRows[m.row].correct]);
            m.votes = {};
            if (winners === 1 && counts.indexOf(top) === correct) solve(m, pid);
            else strike(pid);
          }
          break;
        }
        case 'druck': {
          if (!a.vent) return;
          (m as any)._t?.cancel();
          startDruck(m);
          break;
        }
        case 'frage': {
          if (m.q == null || typeof a.answer !== 'boolean') return;
          const right = E.QUESTIONS[m.q].answer(c) === a.answer;
          (m as any)._t?.cancel();
          m.q = null;
          if (!right) strike(pid);
          if (phase === 'armed') scheduleFrage(m, 40);
          break;
        }
      }
      refresh();
    }

    /* ---------- Bots ---------- */

    function botAction(pid: string, m: E.Mod): any | null {
      if (!bomb) return null;
      const c = bomb.case;
      const err = Math.random() < BOT_ERR;
      const wrong = <T,>(xs: T[], right: T) => {
        const o = xs.filter((x) => x !== right);
        return o.length ? o[Math.floor(Math.random() * o.length)] : right;
      };
      switch (m.kind) {
        case 'kabel': {
          const sol = E.wireSolution(rules, c, m.colors);
          const free = m.colors.map((_, k) => k).filter((k) => !m.cut[k]);
          return { w: err ? wrong(free, sol) : sol };
        }
        case 'knopf': {
          const hold = E.knopfHold(c, m) !== err;
          if (!m.held) return hold ? { press: true } : { tap: true };
          return E.clockText(remNow()).includes(String(rules.stripDigit[m.strip])) || err ? { release: true } : null;
        }
        case 'zeichen': return { s: err ? wrong(m.symbols, m.order[m.done]) : m.order[m.done] };
        case 'blink': {
          const exp = E.blinkExpected(rules, c, m, strikes);
          return { c: err ? wrong(E.BLINK_COLORS, exp) : exp };
        }
        case 'funk': {
          const target = E.FREQS.indexOf(rules.freqOf[m.word]);
          if (m.dial === target || err) return { send: true };
          const n = E.FREQS.length;
          return { tune: (target - m.dial + n) % n <= n / 2 ? 1 : -1 };
        }
        case 'irrgarten': return { d: err ? wrong(['n', 'o', 's', 'w'], E.mazeNextDir(rules, m)) : E.mazeNextDir(rules, m) };
        case 'wort': {
          const ans = E.wortAnswer(rules, m);
          return { w: err ? wrong(m.buttons, ans) : ans };
        }
        case 'schloss': {
          const code = E.lockCode(rules, c);
          const k = m.wheels.findIndex((d, j) => d !== code[j]);
          if (k < 0 || err) return { open: true };
          return { wheel: k, d: (code[k] - m.wheels[k] + 10) % 10 <= 5 ? 1 : -1 };
        }
        case 'doppel':
          if (m.green) return m.hold[pid] ? { release: true } : null;
          return m.hold[pid] ? null : { press: true };
        case 'stimme': {
          if (m.votes[pid] !== undefined) return null;
          const row = rules.voteRows[m.row];
          const correct = m.symbols.indexOf(row.symbols[row.correct]);
          return { vote: Math.random() < 0.12 ? Math.floor(Math.random() * 3) : correct };
        }
        case 'druck': return Date.now() - m.last > m.period * 0.4 ? { vent: true } : null;
        case 'frage': return m.q == null ? null : { answer: Math.random() < 0.9 ? E.QUESTIONS[m.q].answer(c) : !E.QUESTIONS[m.q].answer(c) };
      }
    }

    return {
      start: intro,
      onAction(pid, action) {
        if (action?.type !== 'act' || action.key !== key) return;
        act(pid, Number(action.i), action.a ?? {});
      },
      onAudienceJoin() {
        ctx.setAudienceView({ screen: 'audience', phase });
      },
      bot(pid, view) {
        if (view?.screen !== 'armed' || phase !== 'armed' || !bomb) return null;
        const mine = bomb.mods.filter((m) => (ops.get(m.i) ?? []).includes(pid) && (!m.solved || E.isNeedy(m.kind)));
        const order = [...mine.filter((m) => E.isNeedy(m.kind)), ...mine.filter((m) => m.kind === 'doppel' || m.kind === 'stimme' || (m.kind === 'knopf' && m.held)), ...mine];
        for (const m of order) {
          if (m.solved && !E.isNeedy(m.kind)) continue;
          const a = botAction(pid, m);
          if (a) return { type: 'act', key, i: m.i, a };
        }
        return null;
      },
    };
  },
} satisfies GameServerModule;
