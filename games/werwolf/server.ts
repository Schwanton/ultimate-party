/**
 * Werwolf – ohne Spielleiter: Der TV erzählt, die Handys sind Rollenkarte und Stimmzettel.
 *
 * Ablauf: Einführung → Rollen-Lobby (VIP stellt um, alle lesen das Lexikon) → Rollen ansehen →
 *   Nacht (Abschnitt A: alle tippen gleichzeitig; Abschnitt B: Hexe, alle anderen eine zweite Frage) →
 *   Morgen (Opfer, Bauchgefühl, Tode einzeln mit Karte) → Tag (Bürgermeister-Wahl an Tag 1, Diskussion, Abstimmung) → …
 *   → Ende (Rollen) → Rückblick Nacht für Nacht → Rangliste mit Auszeichnungen.
 *
 * Nachts sehen alle Handys gleich aus und die Nacht dauert immer gleich lang, damit niemand etwas verrät.
 */

import { Scores, pick, shuffle, type GameContext, type GameServerModule, type PlayerInfo } from '@up/sdk';
import {
  ALL_ROLES, SPECIALS, deal, defaultSetup, fitSetup, isWolf, maxWolves, nightDeaths, plurality, unfair, winner, wins,
  type Role, type Setup, type Winner,
} from './engine';

const T = {
  intro: 9, roles: 15, nightA: 30, nightB: 15, morning: 8, lastWords: 10, flip: 4.5, hunter: 20, successor: 20,
  mayorVote: 40, mayorResult: 5, vote: 30, hurry: 4, runoff: 20, voteRevealBase: 3, end: 9, recapStep: 3.6, final: 2,
};
const POINTS = { win: 1000, lovers: 1500, alive: 300, goodVote: 100, wolfDay: 100, ghostTip: 100, gutTip: 50 };
const NOBODY = 'nobody';
const WOLF_MSGS = ['take', 'not', 'danger', 'any', 'distract'];
const SETTINGS_KEY = 'settings-v2'; // v2: Erzählerstimme jetzt standardmäßig an

type DeathCause = 'wolves' | 'poison' | 'love' | 'hunter' | 'vote';
interface Death { id: string; cause: DeathCause; day: number }

interface NightLog {
  n: number;
  wolves: string[];
  victim: string | null;
  quote: { from: string; msg: string } | null;
  protector: { who: string; target: string | null } | null;
  witch: { who: string; healed: string | null; poisoned: string | null } | null;
  seer: { who: string; target: string; role: Role } | null;
  cupid: { who: string; lovers: [string, string] } | null;
  gut: { id: string; count: number; total: number } | null;
  deaths: string[];
}

export default {
  create(ctx: GameContext) {
    const ids = ctx.players.map((p) => p.id);
    const scores = new Scores(ids);
    /** Punkte nach Art (für die Aufteilung am Ende) */
    const pts = new Map<string, Map<string, { count: number; pts: number }>>();
    const PART_ORDER = ['win', 'lovers', 'alive', 'goodVote', 'wolfDay', 'gut', 'ghost'];
    function addPts(id: string, key: string, n: number) {
      scores.add(id, n);
      const m = pts.get(id) ?? new Map();
      const cur = m.get(key) ?? { count: 0, pts: 0 };
      m.set(key, { count: cur.count + 1, pts: cur.pts + n });
      pts.set(id, m);
    }
    function partsOf(id: string) {
      const m = pts.get(id);
      return m ? PART_ORDER.filter((k) => m.has(k)).map((k) => ({ key: k, ...m.get(k)! })) : [];
    }
    const stored = ctx.store.get<Partial<Setup>>(SETTINGS_KEY) ?? {};
    let setup: Setup = { ...defaultSetup(ids.length), ...pickSettings(stored) };
    setup = fitSetup(setup, ids.length);

    let roles = new Map<string, Role>();
    const alive = new Set(ids);
    const deaths: Death[] = [];
    let lovers: [string, string] | null = null;
    let mayor: string | null = null;
    let day = 0;
    let night = 0;
    let phase = 'intro';
    let timer: { cancel(): void; deadline: number; duration: number } | null = null;
    let sky: { mode: 'dusk' | 'night' | 'day'; from: number; to: number } = { mode: 'dusk', from: Date.now(), to: Date.now() };
    const potions = { heal: true, poison: true };
    let lastProtected: string | null = null;
    const nights: NightLog[] = [];
    let say: { key: string; vars?: Record<string, string>; n: number } | null = null;
    let sayN = 0;

    // Nacht-Eingaben
    let pickA = new Map<string, string[]>(); // Spieler → gewählte Ziele (Amor: 2)
    let chipA = new Map<string, string>();
    let wolfFeed: { from: string; msg: string; at: number }[] = [];
    let pickB = new Map<string, string>();
    let chipB = new Map<string, string>();
    let witchHeal = false;
    let witchPoison: string | null = null;
    let victim: string | null = null;
    let seerResult: { target: string; role: Role } | null = null;
    let section: 'A' | 'B' = 'A';
    const ghostTips = new Map<string, string>(); // Geist/Publikum → Tipp dieser Nacht

    // Tag
    let suspects = new Map<string, string>();
    let votes = new Map<string, string>();
    let runoff: string[] | null = null;
    let mayorVotes = new Map<string, string>();
    const votesReceived = new Map<string, number>();
    const goodVotes = new Map<string, number>();
    const gutHits = new Map<string, number>();
    let lastBauch: { id: string; count: number; total: number }[] = [];

    // Todesfolge
    let queue: Death[] = [];
    let current: Death | null = null;
    let afterDeaths: () => void = () => {};
    let shooter: string | null = null;
    let successorOf: string | null = null;

    const aliveList = () => ids.filter((id) => alive.has(id));
    const name = (id: string | null) => (id ? ctx.player(id)?.name ?? '?' : '?');
    const role = (id: string) => roles.get(id) ?? 'villager';
    const wolvesAlive = () => aliveList().filter((id) => isWolf(roles.get(id)));
    const audienceIds = () => ctx.audience().map((a) => a.id);
    /** VIP entscheidet (ohne VIP: der erste Spieler, z. B. nur Bots) */
    const vip = () => {
      const v = ctx.vip();
      return v && ids.includes(v) ? v : ids[0];
    };

    function speak(key: string, vars?: Record<string, string>) {
      say = { key, vars, n: ++sayN };
    }

    function pickSettings(s: Partial<Setup>): Partial<Setup> {
      const out: Partial<Setup> = {};
      for (const k of ['mayor', 'discuss', 'reveal', 'arrows', 'votes', 'lastWords', 'quietFirstNight', 'voice'] as const) {
        if (s[k] !== undefined) (out as any)[k] = s[k];
      }
      return out;
    }

    /** Was der TV über einen Toten zeigen darf */
    function deadInfo(d: Death) {
      const r = role(d.id);
      return {
        id: d.id, cause: d.cause, day: d.day,
        role: setup.reveal === 'role' ? r : null,
        side: setup.reveal !== 'none' ? (isWolf(r) ? 'wolves' : 'village') : null,
      };
    }

    function base() {
      return {
        day, night, alive: aliveList(), mayor, sky, say: setup.voice ? say : null, voice: setup.voice,
        dead: deaths.map(deadInfo), arrowsOn: setup.arrows,
      };
    }

    function me(id: string) {
      const r = roles.get(id) ?? null;
      return {
        role: r, alive: alive.has(id), mayor: mayor === id,
        mates: r === 'wolf' ? ids.filter((x) => x !== id && roles.get(x) === 'wolf') : [],
        lover: lovers?.includes(id) ? lovers.find((x) => x !== id) ?? null : null,
      };
    }

    function audienceView(view: (id: string) => object) {
      ctx.setAudienceView((a: PlayerInfo) => view(a.id));
    }

    /* ---------------- Einführung und Rollen-Lobby ---------------- */

    function intro() {
      phase = 'intro';
      speak('intro');
      ctx.setHostView({ screen: 'intro', ...base() });
      ctx.setAllPlayerViews(() => ({ screen: 'wait', me: me('') }));
      audienceView(() => ({ screen: 'wait', me: me('') }));
      ctx.after(T.intro, lobby);
    }

    function lobbyView() {
      const n = ids.length;
      const info = { setup, n, maxWolves: maxWolves(n), unfair: unfair(setup, n), roles: ALL_ROLES, vip: vip() };
      ctx.setHostView({ screen: 'lobby', ...base(), ...info });
      ctx.setAllPlayerViews((p) => ({ screen: 'lobby', me: me(p.id), ...info, isVip: p.id === vip() }));
      audienceView(() => ({ screen: 'lobby', me: me(''), ...info, isVip: false }));
    }

    function lobby() {
      phase = 'lobby';
      lobbyView();
    }

    function begin() {
      setup = fitSetup(setup, ids.length);
      ctx.store.set(SETTINGS_KEY, pickSettings(setup));
      roles = deal(ids, setup);
      phase = 'roles';
      speak('roles');
      timer = ctx.timer(T.roles, startNight);
      sky = { mode: 'dusk', from: Date.now(), to: timer.deadline };
      ctx.setHostView({ screen: 'roles', ...base(), deadline: timer.deadline, duration: timer.duration, wolves: setup.wolves });
      ctx.setAllPlayerViews((p) => ({ screen: 'roles', me: me(p.id), deadline: timer!.deadline, duration: timer!.duration }));
      audienceView(() => ({ screen: 'wait', me: me('') }));
    }

    /* ---------------- Nacht ---------------- */

    function startNight() {
      night++;
      phase = 'night';
      section = 'A';
      pickA = new Map();
      chipA = new Map();
      pickB = new Map();
      chipB = new Map();
      wolfFeed = [];
      witchHeal = false;
      witchPoison = null;
      victim = null;
      seerResult = null;
      ghostTips.clear();
      speak(`nightA${((night + day) % 4) + 1}`);
      timer = ctx.timer(T.nightA, endSectionA);
      sky = { mode: 'night', from: Date.now(), to: timer.deadline + T.nightB * timer.duration / T.nightA };
      nightViews();
    }


    /** Welche Aufgabe hat dieser Spieler in Abschnitt A? */
    function taskA(id: string): string {
      if (!alive.has(id)) return 'ghost';
      const r = role(id);
      if (r === 'wolf') return 'wolf';
      if (r === 'seer') return 'seer';
      if (r === 'protector') return 'protector';
      if (r === 'cupid' && night === 1) return 'cupid';
      return 'suspect';
    }

    function optionsA(id: string, task: string): string[] {
      const all = aliveList();
      if (task === 'wolf') return all.filter((x) => !isWolf(roles.get(x)));
      if (task === 'protector') return all.filter((x) => x !== lastProtected);
      if (task === 'cupid') return all;
      if (task === 'ghost') return all;
      return all.filter((x) => x !== id);
    }

    function wolfDots() {
      const dots: Record<string, number> = {};
      for (const [w, t] of pickA) if (isWolf(roles.get(w)) && alive.has(w)) for (const x of t) dots[x] = (dots[x] ?? 0) + 1;
      return dots;
    }

    function nightView(id: string, isAudience = false) {
      const common = { screen: 'night', section, me: isAudience ? me('') : me(id), night, deadline: timer!.deadline, duration: timer!.duration };
      if (section === 'A') {
        const task = isAudience ? 'ghost' : taskA(id);
        const opts = optionsA(id, task);
        const pickNow = isAudience ? (ghostTips.get(id) ? [ghostTips.get(id)!] : []) : task === 'ghost' ? (ghostTips.get(id) ? [ghostTips.get(id)!] : []) : pickA.get(id) ?? [];
        return {
          ...common, task, opts, pick: pickNow, multi: task === 'cupid' ? 2 : 1,
          chips: task === 'wolf' ? 'wolf' : 'sure', chip: chipA.get(id) ?? null,
          dots: task === 'wolf' ? wolfDots() : {},
          feed: task === 'wolf' ? wolfFeed.slice(-3).map((f) => ({ from: f.from, msg: f.msg })) : [],
          banner: null,
        };
      }
      // Abschnitt B
      const r = isAudience ? null : role(id);
      const isWitch = !isAudience && alive.has(id) && r === 'witch';
      const all = aliveList();
      let banner: object = { kind: 'quiet' };
      if (!isAudience && alive.has(id) && r === 'seer' && seerResult) banner = { kind: 'seer', target: seerResult.target, role: seerResult.role };
      if (!isAudience && alive.has(id) && r === 'wolf') banner = { kind: 'wolfTarget', target: victim };
      if (isWitch) {
        return {
          ...common, task: 'witch', victim, opts: all, pick: witchPoison ? [witchPoison] : [], multi: 1,
          chips: 'witch', chip: witchHeal ? 'heal' : witchPoison ? 'poison' : chipB.get(id) ?? null,
          potions: { ...potions }, heal: witchHeal, dots: {}, feed: [], banner: null,
        };
      }
      return {
        ...common, task: 'second', opts: all, pick: pickB.get(id) ? [pickB.get(id)!] : [], multi: 1,
        chips: 'sure', chip: chipB.get(id) ?? null, dots: {}, feed: [], banner,
      };
    }

    function nightViews() {
      ctx.setHostView({ screen: 'night', ...base(), section, deadline: timer!.deadline, duration: timer!.duration });
      ctx.setAllPlayerViews((p) => nightView(p.id));
      audienceView((id) => nightView(id, true));
    }

    function endSectionA() {
      // Wolfsopfer
      const wolfPicks: string[] = [];
      for (const [w, t] of pickA) if (isWolf(roles.get(w)) && alive.has(w) && t[0] && alive.has(t[0]) && !isWolf(roles.get(t[0]))) wolfPicks.push(t[0]);
      victim = setup.quietFirstNight && night === 1 ? null : plurality(wolfPicks).top;
      // Seherin
      const seer = aliveList().find((id) => role(id) === 'seer');
      const seerTarget = seer ? pickA.get(seer)?.[0] : undefined;
      seerResult = seer && seerTarget ? { target: seerTarget, role: role(seerTarget) } : null;
      // Amor
      const cupid = aliveList().find((id) => role(id) === 'cupid');
      let cupidLog: NightLog['cupid'] = null;
      if (cupid && night === 1) {
        let chosen = (pickA.get(cupid) ?? []).filter((x) => alive.has(x)).slice(0, 2);
        if (chosen.length < 2) chosen = [...chosen, ...shuffle(aliveList().filter((x) => !chosen.includes(x)))].slice(0, 2);
        lovers = [chosen[0], chosen[1]];
        cupidLog = { who: cupid, lovers };
      }
      // Beschützer
      const protector = aliveList().find((id) => role(id) === 'protector');
      const protTarget = protector ? pickA.get(protector)?.[0] ?? null : null;
      // Bauchgefühl
      const gutPicks: string[] = [];
      for (const [p, t] of pickA) if (taskA(p) === 'suspect' && t[0]) gutPicks.push(t[0]);
      const gut = plurality(gutPicks);
      lastBauch = Object.entries(gut.counts).map(([id, count]) => ({ id, count, total: gutPicks.length })).sort((a, b) => b.count - a.count).slice(0, 4);
      for (const [p, t] of pickA) if (taskA(p) === 'suspect' && t[0] && isWolf(roles.get(t[0]))) {
        gutHits.set(p, (gutHits.get(p) ?? 0) + 1);
        addPts(p, 'gut', POINTS.gutTip);
      }
      for (const [g, t] of ghostTips) if (isWolf(roles.get(t)) && ids.includes(g)) addPts(g, 'ghost', POINTS.ghostTip);
      const quote = wolfFeed.length ? pick(wolfFeed) : null;
      nights.push({
        n: night, wolves: wolvesAlive(), victim, quote: quote ? { from: quote.from, msg: quote.msg } : null,
        protector: protector ? { who: protector, target: protTarget } : null, witch: null,
        seer: seer && seerResult ? { who: seer, target: seerResult.target, role: seerResult.role } : null,
        cupid: cupidLog, gut: lastBauch[0] ? { ...lastBauch[0] } : null, deaths: [],
      });
      section = 'B';
      speak(`nightB${((night + day) % 3) + 1}`);
      timer = ctx.timer(T.nightB, () => endNight(protTarget));
      nightViews();
    }

    function endNight(protTarget: string | null) {
      const witch = aliveList().find((id) => role(id) === 'witch');
      const healed = !!(witch && witchHeal && victim && potions.heal);
      if (healed) potions.heal = false;
      const poisoned = witch && witchPoison && potions.poison && alive.has(witchPoison) ? witchPoison : null;
      if (poisoned) potions.poison = false;
      lastProtected = protTarget;
      const died = nightDeaths({ victim, protectedId: protTarget, healed, poisoned });
      const log = nights[nights.length - 1];
      if (witch) log.witch = { who: witch, healed: healed ? victim : null, poisoned };
      log.deaths = [...died];
      const list: Death[] = died.map((id) => ({ id, cause: id === poisoned && id !== victim ? 'poison' : 'wolves', day: night }));
      morning(list);
    }

    /* ---------------- Morgen ---------------- */

    function morning(list: Death[]) {
      day++;
      phase = 'morning';
      for (const d of list) kill(d);
      sky = { mode: 'day', from: Date.now(), to: Date.now() + 600_000 };
      speak(list.length > 1 ? 'morningTwo' : list.length ? `morningDeath${(day % 3) + 1}` : `morningNone${(day % 2) + 1}`);
      ctx.setHostView({ screen: 'morning', ...base(), died: list.map((d) => d.id), gut: lastBauch, lovers: night === 1 && lovers ? true : false });
      ctx.setAllPlayerViews((p) => ({ screen: 'morning', me: me(p.id), died: list.map((d) => d.id), newLover: night === 1 && lovers?.includes(p.id) ? me(p.id).lover : null }));
      audienceView(() => ({ screen: 'morning', me: me(''), died: list.map((d) => d.id) }));
      ctx.after(T.morning, () => processDeaths(list, startDay));
    }

    function kill(d: Death) {
      if (!alive.has(d.id)) return;
      alive.delete(d.id);
      deaths.push(d);
    }

    /* ---------------- Tode nacheinander (Letzte Worte, Karte, Jäger, Bürgermeister, Verliebte) ---------------- */

    function processDeaths(list: Death[], then: () => void) {
      queue = [...list];
      afterDeaths = then;
      nextDeath();
    }

    function nextDeath() {
      current = queue.shift() ?? null;
      if (!current) {
        if (checkEnd()) return;
        return afterDeaths();
      }
      if (setup.lastWords) lastWordsScreen();
      else flipScreen();
    }

    function lastWordsScreen() {
      phase = 'lastWords';
      timer = ctx.timer(T.lastWords, flipScreen);
      speak('lastWords', { name: name(current!.id) });
      ctx.setHostView({ screen: 'lastWords', ...base(), who: current!.id, deadline: timer.deadline, duration: timer.duration });
      ctx.setAllPlayerViews((p) => ({ screen: p.id === current!.id ? 'lastWordsMe' : 'tv', me: me(p.id) }));
      audienceView(() => ({ screen: 'tv', me: me('') }));
    }

    function flipScreen() {
      phase = 'flip';
      const d = current!;
      ctx.setHostView({ screen: 'flip', ...base(), who: d.id, cause: d.cause, info: deadInfo(d) });
      ctx.setAllPlayerViews((p) => ({ screen: p.id === d.id ? 'diedMe' : 'tv', me: me(p.id), cause: d.cause }));
      audienceView(() => ({ screen: 'tv', me: me('') }));
      ctx.after(T.flip, afterFlip);
    }

    function afterFlip() {
      const d = current!;
      // Verliebte sterben zusammen
      if (lovers?.includes(d.id)) {
        const other = lovers.find((x) => x !== d.id)!;
        if (alive.has(other)) {
          kill({ id: other, cause: 'love', day: d.cause === 'vote' ? day : night });
          queue.unshift(deaths[deaths.length - 1]);
        }
      }
      if (role(d.id) === 'hunter') return hunterShot(d.id);
      if (mayor === d.id) return pickSuccessor(d.id);
      nextDeath();
    }

    function hunterShot(id: string) {
      if (!aliveList().length) return afterHunter();
      phase = 'hunter';
      shooter = id;
      speak('hunter', { name: name(id) });
      timer = ctx.timer(T.hunter, () => hunterFire(pick(aliveList())));
      const opts = aliveList();
      ctx.setHostView({ screen: 'hunter', ...base(), who: id, deadline: timer.deadline, duration: timer.duration });
      ctx.setAllPlayerViews((p) => (p.id === id
        ? { screen: 'hunter', me: me(p.id), opts, deadline: timer!.deadline, duration: timer!.duration }
        : { screen: 'tv', me: me(p.id) }));
      audienceView(() => ({ screen: 'tv', me: me('') }));
    }

    function hunterFire(target: string) {
      timer?.cancel();
      const id = shooter!;
      shooter = null;
      if (alive.has(target)) {
        kill({ id: target, cause: 'hunter', day: deaths[deaths.length - 1]?.day ?? day });
        queue.unshift(deaths[deaths.length - 1]);
      }
      if (mayor === id) return pickSuccessor(id);
      afterHunter();
    }

    function afterHunter() {
      nextDeath();
    }

    function pickSuccessor(id: string) {
      const opts = aliveList();
      if (!opts.length) {
        mayor = null;
        return nextDeath();
      }
      phase = 'successor';
      successorOf = id;
      speak('successor', { name: name(id) });
      timer = ctx.timer(T.successor, () => setSuccessor(pick(opts)));
      ctx.setHostView({ screen: 'successor', ...base(), who: id, deadline: timer.deadline, duration: timer.duration });
      ctx.setAllPlayerViews((p) => (p.id === id
        ? { screen: 'successor', me: me(p.id), opts, deadline: timer!.deadline, duration: timer!.duration }
        : { screen: 'tv', me: me(p.id) }));
      audienceView(() => ({ screen: 'tv', me: me('') }));
    }

    function setSuccessor(target: string) {
      timer?.cancel();
      successorOf = null;
      mayor = alive.has(target) ? target : null;
      nextDeath();
    }

    /* ---------------- Tag ---------------- */

    function startDay() {
      if (setup.mayor && !mayor && aliveList().length > 2) return mayorElection();
      discuss();
    }

    function mayorElection() {
      phase = 'mayorVote';
      mayorVotes = new Map();
      speak('mayor');
      timer = ctx.timer(T.mayorVote, resolveMayor);
      mayorViews();
    }

    function mayorViews() {
      ctx.setHostView({ screen: 'mayorVote', ...base(), voted: mayorVotes.size, voters: aliveList().length, deadline: timer!.deadline, duration: timer!.duration });
      for (const id of ids) {
        if (!alive.has(id)) ctx.setPlayerView(id, { screen: 'tv', me: me(id) });
        else ctx.setPlayerView(id, { screen: 'mayorVote', me: me(id), opts: aliveList(), pick: mayorVotes.get(id) ?? null, deadline: timer!.deadline, duration: timer!.duration });
      }
      audienceView(() => ({ screen: 'tv', me: me('') }));
    }

    function resolveMayor() {
      timer?.cancel();
      const res = plurality(mayorVotes.values());
      mayor = res.top ?? pick(aliveList());
      phase = 'mayorResult';
      speak('mayorResult', { name: name(mayor) });
      ctx.setHostView({ screen: 'mayorResult', ...base(), counts: res.counts });
      ctx.setAllPlayerViews((p) => ({ screen: 'tv', me: me(p.id) }));
      ctx.after(T.mayorResult, discuss);
    }

    function discuss() {
      phase = 'discuss';
      suspects = new Map();
      speak(`discuss${(day % 2) + 1}`);
      timer = ctx.timer(setup.discuss, startVote);
      const to = timer.deadline + T.vote * 1000 * (timer.duration / (setup.discuss * 1000));
      // Sonne steht schon über den Dächern (keine zweite Morgenröte)
      sky = { mode: 'day', from: Date.now() - (to - Date.now()) * 0.12, to };
      discussViews();
    }

    function discussViews() {
      const arrows = setup.arrows ? [...suspects].filter(([a, b]) => alive.has(a) && alive.has(b)).map(([from, to]) => ({ from, to })) : [];
      ctx.setHostView({ screen: 'discuss', ...base(), arrows, deadline: timer!.deadline, duration: timer!.duration });
      for (const id of ids) {
        if (!alive.has(id)) ctx.setPlayerView(id, { screen: 'ghostDay', me: me(id) });
        else ctx.setPlayerView(id, {
          screen: 'discuss', me: me(id), opts: aliveList().filter((x) => x !== id), suspect: suspects.get(id) ?? null,
          arrows: setup.arrows, isVip: id === vip(), deadline: timer!.deadline, duration: timer!.duration,
        });
      }
      audienceView(() => ({ screen: 'tv', me: me('') }));
    }

    function startVote() {
      timer?.cancel();
      phase = 'vote';
      votes = new Map();
      runoff = null;
      speak('vote');
      timer = ctx.timer(T.vote, resolveVote);
      sky = { ...sky, to: Math.max(Date.now() + 2000, timer.deadline) };
      voteViews();
    }

    function voteViews() {
      const open = setup.votes === 'open';
      const live = open ? [...votes].map(([from, to]) => ({ from, to })) : [];
      const candidates = runoff ?? aliveList();
      ctx.setHostView({ screen: 'vote', ...base(), runoff, candidates, voted: [...votes.keys()], live, voters: aliveList().length, deadline: timer!.deadline, duration: timer!.duration });
      for (const id of ids) {
        if (!alive.has(id)) ctx.setPlayerView(id, { screen: 'ghostDay', me: me(id) });
        else ctx.setPlayerView(id, {
          screen: 'vote', me: me(id), opts: candidates.filter((x) => x !== id), pick: votes.get(id) ?? null, runoff: !!runoff,
          deadline: timer!.deadline, duration: timer!.duration,
        });
      }
      audienceView(() => ({ screen: 'tv', me: me('') }));
    }

    function hurry() {
      if (!timer || timer.deadline - Date.now() <= T.hurry * 1100) return;
      timer.cancel();
      timer = ctx.timer(T.hurry, resolveVote);
      voteViews();
    }

    function resolveVote() {
      timer?.cancel();
      const weight = (voter: string) => (voter === mayor ? 2 : 1);
      const counts: Record<string, number> = {};
      for (const [v, t] of votes) counts[t] = (counts[t] ?? 0) + weight(v);
      const best = Math.max(0, ...Object.values(counts));
      const tied = Object.keys(counts).filter((k) => counts[k] === best && best > 0);
      let out: string | null = null;
      let decidedBy: 'votes' | 'mayor' | null = null;
      if (tied.length === 1) {
        out = tied[0] === NOBODY ? null : tied[0];
        decidedBy = 'votes';
      } else if (tied.length > 1) {
        const mv = mayor ? votes.get(mayor) : undefined;
        if (mv && tied.includes(mv)) {
          out = mv === NOBODY ? null : mv;
          decidedBy = 'mayor';
        } else if (!runoff && tied.filter((x) => x !== NOBODY).length >= 2) {
          // Stichwahl
          const list = [...votes].map(([from, to]) => ({ from, to }));
          showTally(list, counts, null, true, () => {
            runoff = tied.filter((x) => x !== NOBODY);
            phase = 'vote';
            votes = new Map();
            speak('runoff');
            timer = ctx.timer(T.runoff, resolveVote);
            voteViews();
          });
          return;
        }
      }
      const list = [...votes].map(([from, to]) => ({ from, to }));
      // Statistik
      for (const [v, t] of votes) {
        if (t === NOBODY) continue;
        votesReceived.set(t, (votesReceived.get(t) ?? 0) + 1);
        if (isWolf(roles.get(t)) && !isWolf(roles.get(v))) {
          goodVotes.set(v, (goodVotes.get(v) ?? 0) + 1);
          addPts(v, 'goodVote', POINTS.goodVote);
        }
      }
      if (out && !isWolf(roles.get(out))) for (const w of ids) if (isWolf(roles.get(w))) addPts(w, 'wolfDay', POINTS.wolfDay);
      showTally(list, counts, out, false, () => {
        if (out) {
          kill({ id: out, cause: 'vote', day });
          processDeaths([deaths[deaths.length - 1]], startNight);
        } else {
          if (checkEnd()) return;
          startNight();
        }
      }, decidedBy);
    }

    function showTally(list: { from: string; to: string }[], counts: Record<string, number>, out: string | null, tie: boolean, then: () => void, decidedBy: 'votes' | 'mayor' | null = null) {
      phase = 'voteResult';
      const secret = setup.votes === 'secret';
      const seconds = T.voteRevealBase + Math.min(4.5, list.length * 0.45) + 2.5;
      speak(out ? 'voteOut' : tie ? 'voteTie' : 'voteNone', { name: name(out) });
      ctx.setHostView({
        screen: 'voteResult', ...base(), candidates: runoff ?? [...aliveList(), ...(out ? [out] : [])].filter((x, i, a) => a.indexOf(x) === i),
        list: secret ? [] : shuffle(list), counts, out, tie, decidedBy, secret, seconds,
      });
      ctx.setAllPlayerViews((p) => ({ screen: 'tv', me: me(p.id) }));
      ctx.after(seconds, then);
    }

    /* ---------------- Ende, Rückblick, Rangliste ---------------- */

    function checkEnd(): boolean {
      const w = winner(aliveList(), roles, lovers);
      if (!w) return false;
      finishGame(w);
      return true;
    }

    function finishGame(w: Winner) {
      phase = 'end';
      timer?.cancel();
      for (const id of ids) {
        if (!wins(id, w, roles, lovers)) continue;
        addPts(id, w === 'lovers' ? 'lovers' : 'win', w === 'lovers' ? POINTS.lovers : POINTS.win);
        if (alive.has(id)) addPts(id, 'alive', POINTS.alive);
      }
      speak(`end${w[0].toUpperCase()}${w.slice(1)}`);
      // Himmel bleibt stehen: Mond bzw. Sonne hoch am Himmel
      sky = { mode: w === 'wolves' ? 'night' : 'day', from: Date.now() - 360_000_000, to: Date.now() + 600_000_000 };
      const cast = ids.map((id) => ({ id, role: role(id), alive: alive.has(id), lover: !!lovers?.includes(id), mayor: mayor === id, death: deaths.find((d) => d.id === id) ?? null }));
      ctx.setHostView({ screen: 'end', ...base(), winner: w, cast, groups: groups(w), nights: night });
      endWinner = w;
      endViews(false);
      audienceView(() => ({ screen: 'end', me: me(''), winner: w, won: false, score: null, parts: [], awards: [], rank: 0, of: ids.length, team: null, death: null }));
      ctx.after(T.end, () => recap(w, cast));
    }

    let endWinner: Winner = 'nobody';

    /** Teams am Ende: Sieger zuerst. Ein gemischtes Liebespaar ist ein eigenes Team. */
    function groups(w: Winner) {
      const mixed = !!lovers && isWolf(roles.get(lovers[0])) !== isWolf(roles.get(lovers[1]));
      const inLove = (id: string) => mixed && lovers!.includes(id);
      const list = [
        { key: 'village', won: w === 'village', ids: ids.filter((id) => !isWolf(roles.get(id)) && !inLove(id)) },
        { key: 'wolves', won: w === 'wolves', ids: ids.filter((id) => isWolf(roles.get(id)) && !inLove(id)) },
        ...(mixed ? [{ key: 'lovers', won: w === 'lovers', ids: [...lovers!] }] : []),
      ].filter((g) => g.ids.length);
      return [...list.filter((g) => g.won), ...list.filter((g) => !g.won)];
    }

    /** Was ein Handy am Ende über sich selbst zeigt */
    function personal(id: string, w: Winner) {
      const ranking = scores.ranking();
      const g = groups(w).find((x) => x.ids.includes(id));
      return {
        me: me(id), winner: w, won: wins(id, w, roles, lovers), team: g?.key ?? null, score: scores.get(id), parts: partsOf(id),
        rank: ranking.findIndex((r) => r.playerId === id) + 1, of: ids.length, death: deaths.find((d) => d.id === id) ?? null,
        awards: awards().filter((a) => a.id === id).map((a) => a.key),
      };
    }
    /** Handys am Ende; während des Rückblicks hat der VIP „Überspringen“ */
    function endViews(recapRunning: boolean) {
      const w = endWinner;
      ctx.setAllPlayerViews((p) => ({ screen: 'end', ...personal(p.id, w), skip: recapRunning && p.id === vip() }));
    }

    function recapSteps() {
      const steps: object[] = [];
      for (const n of nights) {
        steps.push({ night: n.n, kind: 'wolves', wolves: n.wolves, victim: n.victim, quote: n.quote });
        if (n.cupid) steps.push({ night: n.n, kind: 'cupid', who: n.cupid.who, lovers: n.cupid.lovers });
        if (n.protector) steps.push({ night: n.n, kind: 'protector', who: n.protector.who, target: n.protector.target, saved: !!n.protector.target && n.protector.target === n.victim });
        if (n.seer) steps.push({ night: n.n, kind: 'seer', who: n.seer.who, target: n.seer.target, role: n.seer.role });
        if (n.witch) steps.push({ night: n.n, kind: 'witch', who: n.witch.who, victim: n.victim, healed: n.witch.healed, poisoned: n.witch.poisoned });
        if (n.gut) steps.push({ night: n.n, kind: 'gut', target: n.gut.id, count: n.gut.count, total: n.gut.total, role: role(n.gut.id) });
      }
      return steps.slice(0, 36);
    }

    function recap(w: Winner, cast: object[]) {
      phase = 'recap';
      const steps = recapSteps();
      speak('recap');
      const seconds = 1.5 + steps.length * T.recapStep;
      ctx.setHostView({ screen: 'recap', ...base(), winner: w, cast, steps, step: T.recapStep, startAt: Date.now() });
      timer = ctx.timer(seconds, () => final(w));
      endViews(true);
    }

    function awards() {
      const out: { key: string; id: string; n: number }[] = [];
      const villagers = ids.filter((id) => !isWolf(roles.get(id)));
      const best = (list: string[], score: (id: string) => number, min = 1) => {
        const top = Math.max(-Infinity, ...list.map(score));
        if (!list.length || top < min) return null;
        return list.find((id) => score(id) === top) ?? null;
      };
      const nose = best(villagers, (id) => goodVotes.get(id) ?? 0);
      if (nose) out.push({ key: 'nose', id: nose, n: goodVotes.get(nose) ?? 0 });
      const wolves = ids.filter((id) => isWolf(roles.get(id)));
      if (wolves.length) {
        const lived = (id: string) => (alive.has(id) ? 999 : deaths.find((d) => d.id === id)?.day ?? 0);
        const sheep = [...wolves].sort((a, b) => (votesReceived.get(a) ?? 0) - (votesReceived.get(b) ?? 0) || lived(b) - lived(a))[0];
        out.push({ key: 'sheep', id: sheep, n: votesReceived.get(sheep) ?? 0 });
      }
      const gutKing = best(ids, (id) => gutHits.get(id) ?? 0);
      if (gutKing) out.push({ key: 'gut', id: gutKing, n: gutHits.get(gutKing) ?? 0 });
      return out;
    }

    function final(w: Winner) {
      phase = 'final';
      const ranking = scores.ranking();
      const rank = (id: string) => ranking.findIndex((r) => r.playerId === id) + 1;
      const table = groups(w).map((g) => ({
        ...g,
        players: [...g.ids].sort((a, b) => scores.get(b) - scores.get(a)).map((id) => ({ id, role: role(id), alive: alive.has(id), mayor: mayor === id, total: scores.get(id), rank: rank(id), parts: partsOf(id) })),
      }));
      ctx.setHostView({ screen: 'final', ...base(), winner: w, ranking, table, awards: awards(), players: ids.length });
      ctx.setAllPlayerViews((p) => ({ screen: 'end', ...personal(p.id, w), skip: false }));
      ctx.after(T.final, () => ctx.finish(ranking));
    }

    /* ---------------- Eingaben ---------------- */

    function refreshNightPhone(id: string) {
      if (phase !== 'night') return;
      // Wölfe sehen Tipps der anderen Wölfe live → alle Wölfe aktualisieren
      if (section === 'A' && isWolf(roles.get(id)) && alive.has(id)) {
        for (const w of ids) if (isWolf(roles.get(w)) && alive.has(w)) ctx.setPlayerView(w, nightView(w));
      } else ctx.setPlayerView(id, nightView(id));
    }

    function nightAction(id: string, a: any, isAudience: boolean) {
      if (section === 'A') {
        const task = isAudience ? 'ghost' : taskA(id);
        const opts = optionsA(id, task);
        if (a.type === 'pick') {
          const t = String(a.target);
          if (!opts.includes(t)) return;
          if (task === 'ghost') {
            if (ghostTips.get(id) === t) ghostTips.delete(id);
            else ghostTips.set(id, t);
            return isAudience ? ctx.setPlayerView(id, nightView(id, true)) : refreshNightPhone(id);
          }
          const cur = pickA.get(id) ?? [];
          let next: string[];
          if (task === 'cupid') next = cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t].slice(-2);
          else next = cur[0] === t ? [] : [t];
          pickA.set(id, next);
          return refreshNightPhone(id);
        }
        if (a.type === 'chip') {
          const c = String(a.chip);
          if (task === 'wolf') {
            if (!WOLF_MSGS.includes(c)) return;
            wolfFeed.push({ from: id, msg: c, at: Date.now() });
            chipA.set(id, c);
          } else if (['sure', 'maybe', 'clueless'].includes(c)) chipA.set(id, c);
          return isAudience ? ctx.setPlayerView(id, nightView(id, true)) : refreshNightPhone(id);
        }
        return;
      }
      // Abschnitt B
      const isWitch = !isAudience && alive.has(id) && role(id) === 'witch';
      if (isWitch) {
        if (a.type === 'chip') {
          if (a.chip === 'heal' && potions.heal && victim) witchHeal = !witchHeal;
          else if (a.chip === 'poison' && potions.poison) chipB.set(id, 'poison');
          else if (a.chip === 'none') {
            witchHeal = false;
            witchPoison = null;
            chipB.set(id, 'none');
          }
        } else if (a.type === 'pick' && potions.poison) {
          const t = String(a.target);
          if (!alive.has(t)) return;
          witchPoison = witchPoison === t ? null : t;
        }
        return refreshNightPhone(id);
      }
      if (a.type === 'pick') {
        const t = String(a.target);
        if (!alive.has(t)) return;
        if (pickB.get(id) === t) pickB.delete(id);
        else pickB.set(id, t);
      } else if (a.type === 'chip' && ['sure', 'maybe', 'clueless'].includes(String(a.chip))) chipB.set(id, String(a.chip));
      if (isAudience) ctx.setPlayerView(id, nightView(id, true));
      else refreshNightPhone(id);
    }

    function lobbyAction(id: string, a: any) {
      if (id !== vip()) return;
      const n = ids.length;
      if (a.type === 'begin') return begin();
      if (a.type === 'wolves') setup = { ...setup, wolves: Math.max(1, Math.min(maxWolves(n), setup.wolves + (a.delta > 0 ? 1 : -1))) };
      else if (a.type === 'role' && SPECIALS.includes(a.role)) {
        const on = setup.specials.includes(a.role);
        setup = { ...setup, specials: on ? setup.specials.filter((r) => r !== a.role) : [...setup.specials, a.role] };
      } else if (a.type === 'set') {
        const v = a.value;
        if (a.key === 'discuss' && [120, 180, 300].includes(v)) setup = { ...setup, discuss: v };
        else if (a.key === 'reveal' && ['role', 'side', 'none'].includes(v)) setup = { ...setup, reveal: v };
        else if (a.key === 'votes' && ['reveal', 'open', 'secret'].includes(v)) setup = { ...setup, votes: v };
        else if (['mayor', 'arrows', 'lastWords', 'quietFirstNight', 'voice'].includes(a.key) && typeof v === 'boolean') setup = { ...setup, [a.key]: v };
        else return;
      } else return;
      setup = fitSetup(setup, n);
      lobbyView();
    }

    return {
      start: intro,
      onAction(id, a) {
        if (!a || typeof a !== 'object') return;
        const isAudience = !ids.includes(id);
        if (phase === 'lobby') return isAudience ? undefined : lobbyAction(id, a);
        if (phase === 'recap' && a.type === 'skipRecap' && id === vip()) {
          timer?.cancel();
          return final(endWinner);
        }
        if (phase === 'night') {
          return nightAction(id, a, isAudience);
        }
        if (isAudience || !alive.has(id)) return;
        if (phase === 'hunter' && id === shooter && a.type === 'pick') {
          const t = String(a.target);
          if (alive.has(t)) hunterFire(t);
        } else if (phase === 'successor' && id === successorOf && a.type === 'pick') {
          const t = String(a.target);
          if (alive.has(t)) setSuccessor(t);
        } else if (phase === 'mayorVote' && a.type === 'pick') {
          const t = String(a.target);
          if (!alive.has(t)) return;
          mayorVotes.set(id, t);
          mayorViews();
          if (aliveList().every((p) => mayorVotes.has(p) || !ctx.player(p)?.connected)) {
            timer?.cancel();
            timer = ctx.timer(2, resolveMayor);
          }
        } else if (phase === 'discuss') {
          if (a.type === 'suspect') {
            const t = String(a.target);
            if (t === id || !alive.has(t)) return;
            if (suspects.get(id) === t) suspects.delete(id);
            else suspects.set(id, t);
            discussViews();
          } else if (a.type === 'skip' && id === vip()) startVote();
        } else if (phase === 'vote' && a.type === 'vote') {
          const t = String(a.target);
          const candidates = runoff ?? aliveList();
          if (t === id || (t !== NOBODY && !candidates.includes(t))) return;
          votes.set(id, t);
          voteViews();
          if (aliveList().every((p) => votes.has(p) || !ctx.player(p)?.connected)) hurry();
        }
      },
      onAudienceJoin(id) {
        if (phase === 'night') ctx.setPlayerView(id, nightView(id, true));
        else ctx.setPlayerView(id, { screen: 'tv', me: me('') });
      },
      bot(id, view) {
        const r = roles.get(id);
        const opts = (view.opts as string[] | undefined) ?? [];
        if (view.screen === 'lobby' && view.isVip) {
          // Bot-VIP probiert zufällig Einstellungen aus (deckt in Tests alle Varianten ab)
          if (Math.random() < 0.6) {
            return pick([
              { type: 'set', key: 'votes', value: pick(['reveal', 'open', 'secret']) },
              { type: 'set', key: 'reveal', value: pick(['role', 'side', 'none']) },
              { type: 'set', key: 'lastWords', value: Math.random() < 0.5 },
              { type: 'set', key: 'quietFirstNight', value: Math.random() < 0.5 },
              { type: 'set', key: 'arrows', value: Math.random() < 0.5 },
              { type: 'set', key: 'mayor', value: Math.random() < 0.7 },
              { type: 'wolves', delta: pick([-1, 1]) },
              { type: 'role', role: pick(SPECIALS) },
            ]);
          }
          return { type: 'begin' };
        }
        if (view.screen === 'end' && view.skip && Math.random() < 0.5) return { type: 'skipRecap' };
        if (view.screen === 'night') {
          if ((view.pick as string[]).length >= (view.multi ?? 1) || (view.task === 'witch' && view.chip)) return null;
          if (view.task === 'witch') {
            if (view.victim && view.potions.heal && !view.heal && Math.random() < 0.5) return { type: 'chip', chip: 'heal' };
            if (view.potions.poison && Math.random() < 0.15) return { type: 'pick', target: pick(opts.filter((x) => x !== id)) ?? opts[0] };
            return { type: 'chip', chip: 'none' };
          }
          if (view.task === 'wolf' && !view.chip && Math.random() < 0.4) return { type: 'chip', chip: pick(WOLF_MSGS) };
          if (!opts.length) return null;
          if (view.task === 'wolf') {
            const dots = view.dots as Record<string, number>;
            const fav = Object.keys(dots).sort((a, b) => dots[b] - dots[a])[0];
            return { type: 'pick', target: fav && Math.random() < 0.7 ? fav : pick(opts) };
          }
          return { type: 'pick', target: pick(opts.filter((x) => !(view.pick as string[]).includes(x))) ?? opts[0] };
        }
        if ((view.screen === 'hunter' || view.screen === 'successor' || view.screen === 'mayorVote') && !view.pick && opts.length) {
          const good = opts.filter((x) => isWolf(roles.get(x)) !== isWolf(r));
          return { type: 'pick', target: view.screen === 'hunter' && good.length && Math.random() < 0.5 ? pick(good) : pick(opts) };
        }
        if (view.screen === 'discuss') {
          if (view.isVip && Math.random() < 0.3) return { type: 'skip' };
          if (!view.suspect && opts.length) return { type: 'suspect', target: pick(opts) };
          return null;
        }
        if (view.screen === 'vote' && !view.pick) {
          // Seherin kennt Wölfe, Wölfe schonen Wölfe
          const seen = nights.filter((n) => n.seer?.who === id && isWolf(n.seer.role) && opts.includes(n.seer.target)).map((n) => n.seer!.target);
          if (seen.length) return { type: 'vote', target: seen[0] };
          const pool = isWolf(r) ? opts.filter((x) => !isWolf(roles.get(x))) : opts;
          return { type: 'vote', target: Math.random() < 0.08 || !pool.length ? NOBODY : pick(pool) };
        }
        return null;
      },
    };
  },
} satisfies GameServerModule;
