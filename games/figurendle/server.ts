/**
 * Figurendle – geheime Figur erraten (nach dem Vorbild von Onepiecedle).
 *
 * Variante „Jeder für sich“: alle raten gleichzeitig auf dem Handy, der TV zeigt nur die Farben.
 * Variante „Gemeinsames Brett“: alle Hinweise auf dem TV, jeder darf jederzeit raten (3 s Pause nach einem Tipp).
 * Unbegrenzte Versuche, kein Zeitlimit; nach 10 Fehlversuchen kommt der Anfangsbuchstabe.
 * Runde endet, wenn alle getroffen oder aufgegeben haben (Brett: beim Treffer) oder der VIP auflöst.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Scores, shuffle, type GameContext, type GameServerModule } from '@up/sdk';
import { compare, consistent, soloPoints, valueText, type Cell, type Col, type Fig } from './logic';

interface ColDef { thema: string; titel?: string; spalten: Col[] }

const T = { intro: 10, revealSolo: 5, revealStep: 0.45, revealMax: 14, revealBrett: 9, scores: 7, cooldown: 3 };
const LETTER_AFTER = 10;
/** Bis alle Felder eines Tipps aufgeploppt sind (wie im Client: 0,28 s Abstand) + kurze Pause */
const popTime = (n: number) => n * 0.28 + 1.4;
const BRETT_HIT = 1000;
const BRETT_GREEN = 100;
const MAX_ROWS = 400;

/** Eigene Bilder liegen nur auf dem Rechner des Hosts: .up-data/bilder/figurendle/<id>.webp|png|jpg */
const IMG_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.up-data', 'bilder', 'figurendle');
function imageIndex(): Map<string, string> {
  const out = new Map<string, string>();
  try {
    for (const f of fs.readdirSync(IMG_DIR)) {
      const m = /^([\w.-]+)\.(webp|png|jpg)$/i.exec(f);
      if (m) out.set(m[1].toLowerCase(), `/eigene-bilder/figurendle/${encodeURIComponent(f)}`);
    }
  } catch { /* kein Ordner = keine Bilder */ }
  return out;
}

/**
 * Bilder aus dem Wiki des Themas laden (Content-Pack: „wiki“ beim Thema und bei jeder Figur).
 * Läuft im Hintergrund, nur für fehlende Bilder; gespeichert wird nur auf diesem Rechner (.up-data).
 */
let downloading: Promise<void> | null = null;
const failed = new Set<string>();

function shortId(id: string) {
  return id.replace(/^[^-]+-/, '').toLowerCase();
}

const LOG = () => path.join(IMG_DIR, 'protokoll.txt');
function log(line: string) {
  try { fs.appendFileSync(LOG(), `${new Date().toISOString()} ${line}\n`); } catch { /* egal */ }
}

/** Lädt die Bilder (Feld „bild“ im Pack) auf diesen Rechner, damit sie auch ohne Internet da sind. */
export async function downloadImages(figs: Fig[], have: Map<string, string>): Promise<void> {
  const want = figs.filter((f) => typeof f.bild === 'string' && /^https:\/\//.test(f.bild) && !have.has(f.id.toLowerCase()) && !have.has(shortId(f.id)) && !failed.has(f.id));
  if (!want.length) return;
  fs.mkdirSync(IMG_DIR, { recursive: true });
  log(`Lade ${want.length} Bilder …`);
  const headers = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', Accept: 'image/webp,image/png,image/*;q=0.8' };
  const queue = [...want];
  let ok = 0;
  const worker = async () => {
    for (let f = queue.shift(); f; f = queue.shift()) {
      try {
        const res = await fetch(String(f.bild), { headers, signal: AbortSignal.timeout(30000) });
        const type = res.headers.get('content-type') ?? '';
        const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : type.includes('jpeg') || type.includes('jpg') ? 'jpg' : null;
        if (!res.ok || !ext) { failed.add(f.id); log(`${f.id}: HTTP ${res.status} ${type}`); continue; }
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 500 || buf.length > 8_000_000) { failed.add(f.id); log(`${f.id}: Größe ${buf.length}`); continue; }
        const tmp = path.join(IMG_DIR, `.${shortId(f.id)}.tmp`);
        fs.writeFileSync(tmp, buf);
        fs.renameSync(tmp, path.join(IMG_DIR, `${shortId(f.id)}.${ext}`));
        ok++;
      } catch (e) {
        log(`${f.id}: ${(e as Error).message}`);
      }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  log(`Fertig: ${ok} von ${want.length} gespeichert.`);
}

export default {
  create(ctx: GameContext) {
    const ids = ctx.players.map((p) => p.id);
    const scores = new Scores(ids);
    const lang = ctx.lang;
    const mode = ctx.options.variante === 'brett' ? 'brett' : 'solo';
    const level = String(ctx.options.schwierigkeit ?? 'normal');
    const maxBek = level === 'leicht' ? 1 : level === 'profi' ? 9 : 2;

    // Thema wählen: eines mit Spaltenbeschreibung und genug Figuren
    const all = ctx.content<Record<string, unknown>>();
    const defs = all.filter((x) => Array.isArray(x.spalten)) as unknown as ColDef[];
    const figsAll = all.filter((x) => typeof x.name === 'string' && x.werte && typeof x.werte === 'object') as unknown as Fig[];
    const themes = defs.filter((d) => figsAll.filter((f) => f.thema === d.thema).length >= 5);
    const def = themes.length ? shuffle(themes)[0] : null;
    const cols: Col[] = (def?.spalten ?? []).filter((c) => c && typeof c.key === 'string' && typeof c.label === 'string');
    const figs = figsAll.filter((f) => def && f.thema === def.thema);
    const byId = new Map(figs.map((f) => [f.id, f]));
    let imgs = imageIndex();
    const useWiki = ctx.options.bilder !== 'aus';
    // Eigenes Bild auf diesem Rechner, sonst (Einstellung „Figurenbilder“) direkt aus dem Wiki
    const img = (f: Fig) => imgs.get(f.id.toLowerCase()) ?? imgs.get(shortId(f.id)) ?? (useWiki && typeof f.bild === 'string' && /^https:\/\//.test(f.bild) ? f.bild : null);
    const sub = (f: Fig) => {
      const g = f.werte[cols[1]?.key ?? ''];
      return Array.isArray(g) ? String(g[0] ?? '') : g ? String(g) : '';
    };
    const makeList = () => figs.map((f) => ({ id: f.id, n: f.name, a: f.auch ?? [], s: sub(f), img: img(f) })).sort((a, b) => a.n.localeCompare(b.n));
    let figList = makeList();
    // Fehlende Bilder im Hintergrund aus dem Wiki laden (Einstellung „Figurenbilder“), nicht in automatischen Tests
    if (useWiki && process.env.UP_NO_UPDATE !== '1') {
      downloading ??= downloadImages(figs, imgs).finally(() => { downloading = null; });
      void downloading.then(() => { imgs = imageIndex(); figList = makeList(); });
    }

    const total = Number(ctx.options.rounds) || 5;
    const pool = (f: Fig) => !!def && f.thema === def.thema && typeof f.name === 'string' && (Number(f.bekanntheit) || 2) <= maxBek;
    let secrets = def ? ctx.deck<Fig>({ filter: (f) => pool(f) && byId.has(f.id) }).drawMany(total) : [];
    if (!secrets.length && figs.length) secrets = shuffle(figs).slice(0, total);

    let round = -1;
    let phase: 'intro' | 'guess' | 'reveal' | 'scores' | 'final' = 'intro';
    let secret: Fig = secrets[0];
    let roundStart = scores.snapshot();
    // Jeder für sich
    let solo = new Map<string, { guesses: Fig[]; cells: Cell[][]; place: number; points: number; gaveUp: boolean; pending?: boolean }>();
    // Gemeinsames Brett
    let board: { fig: Fig; by: string; cells: Cell[]; gain: number }[] = [];
    let greens: boolean[] = [];
    let cooling = new Set<string>();
    let gains = new Map<string, number>();
    let winner: string | null = null;

    const mult = () => (round === secrets.length - 1 && secrets.length > 1 ? 2 : 1);
    const base = () => ({ mode, round: round + 1, total: secrets.length, mult: mult(), cols: cols.map((c) => c.label), short: cols.map((c) => c.kurz || c.label), figs: figList });
    const letter = (misses: number) => (misses >= LETTER_AFTER ? secret.name.charAt(0).toUpperCase() : null);
    const connected = (id: string) => ctx.player(id)?.connected !== false;

    function intro() {
      if (!def || !secrets.length || !cols.length) {
        ctx.setHostView({ screen: 'empty' });
        ctx.setAllPlayerViews(() => ({ screen: 'empty' }));
        ctx.after(6, () => finish());
        return;
      }
      ctx.setHostView({ screen: 'intro', mode, theme: def.titel ?? def.thema, total: secrets.length });
      ctx.setAllPlayerViews(() => ({ screen: 'intro', mode }));
      ctx.after(T.intro, next);
    }

    function next() {
      round++;
      if (round >= secrets.length) return showScores(true);
      if (round === 3 && secrets.length > 4) {
        round--;
        return showScores(false, true);
      }
      startRound();
    }

    function startRound() {
      imgs = imageIndex();
      figList = makeList();
      secret = secrets[round];
      phase = 'guess';
      solo = new Map(ids.map((id) => [id, { guesses: [], cells: [], place: 0, points: 0, gaveUp: false }]));
      board = [];
      greens = cols.map(() => false);
      cooling = new Set();
      gains = new Map();
      winner = null;
      updateAll(true);
      tick();
    }

    /** Falls jemand die Verbindung verliert, endet die Runde trotzdem, sobald alle anderen fertig sind */
    function tick() {
      const r = round;
      ctx.after(3, () => {
        if (phase !== 'guess' || round !== r) return;
        checkEnd();
        if (phase === 'guess') tick();
      });
    }

    /* ---------- Ansichten ---------- */

    function hostView() {
      if (mode === 'solo') {
        const players = ids.map((id) => {
          const s = solo.get(id)!;
          return { id, rows: s.cells.map((row) => row.map((c) => c.c).join('')), n: s.guesses.length, place: s.pending ? 0 : s.place, gaveUp: s.gaveUp };
        });
        ctx.setHostView({ screen: 'guess', ...base(), figs: undefined, players, solved: players.filter((p) => p.place).length });
      } else {
        const misses = board.length;
        ctx.setHostView({
          screen: 'guess', ...base(), figs: undefined,
          board: board.slice().reverse().slice(0, 12).map((b) => ({ name: b.fig.name, by: b.by, cells: b.cells, gain: b.gain, img: img(b.fig) })),
          misses, letter: letter(misses), letterAfter: LETTER_AFTER,
          gains: [...gains].filter(([, g]) => g > 0).sort((a, b) => b[1] - a[1]).map(([id, g]) => ({ id, g })),
        });
      }
    }

    function playerView(id: string, input = false) {
      const vip = ctx.vip() === id;
      if (mode === 'solo') {
        const s = solo.get(id)!;
        if (s.place && !s.pending) {
          const waiting = ids.filter((p) => { const o = solo.get(p)!; return !o.place && !o.gaveUp; });
          return ctx.setPlayerView(id, { screen: 'solved', ...base(), figs: undefined, name: secret.name, img: img(secret), place: s.place, tries: s.guesses.length, points: s.points, waiting, vip });
        }
        if (s.gaveUp) {
          const waiting = ids.filter((p) => { const o = solo.get(p)!; return !o.place && !o.gaveUp; });
          return ctx.setPlayerView(id, { screen: 'gaveUp', ...base(), figs: undefined, waiting, vip });
        }
        const misses = s.guesses.length;
        return ctx.setPlayerView(id, {
          screen: 'guess', input, ...base(), vip,
          tried: s.guesses.map((f) => f.id),
          guesses: s.guesses.map((f, i) => ({ name: f.name, cells: s.cells[i] })).reverse(),
          letter: letter(misses), letterAfter: LETTER_AFTER, misses,
        });
      }
      const mine = board.filter((b) => b.by === id);
      return ctx.setPlayerView(id, {
        screen: 'guess', input, ...base(), vip,
        tried: board.map((b) => b.fig.id),
        mine: mine.slice().reverse().slice(0, 12).map((b) => ({ name: b.fig.name, colors: b.cells.map((c) => c.c).join('') })),
        cooling: cooling.has(id), cooldown: T.cooldown,
        points: gains.get(id) ?? 0,
        letter: letter(board.length),
      });
    }

    function updateAll(input = false) {
      hostView();
      ids.forEach((id) => playerView(id, input));
      ctx.setAudienceView({ screen: 'watch' });
    }

    /* ---------- Raten ---------- */

    function guessSolo(id: string, fig: Fig) {
      const s = solo.get(id)!;
      if (s.place || s.gaveUp || s.guesses.some((g) => g.id === fig.id) || s.guesses.length >= MAX_ROWS) return;
      s.guesses.push(fig);
      s.cells.push(compare(fig, secret, cols, lang));
      if (fig.id === secret.id) {
        s.place = [...solo.values()].filter((o) => o.place).length + 1;
        s.points = soloPoints(s.guesses.length - 1, s.place) * mult();
        scores.add(id, s.points);
        // Erst alle Felder aufploppen lassen, dann „Getroffen!“
        s.pending = true;
        const r = round;
        ctx.after(popTime(cols.length), () => {
          if (round !== r || phase !== 'guess') return;
          s.pending = false;
          ids.forEach((p) => { const o = solo.get(p)!; if ((o.place && !o.pending) || o.gaveUp) playerView(p); });
          hostView();
          checkEnd();
        });
      }
      playerView(id);
      hostView();
      checkEnd();
    }

    function guessBrett(id: string, fig: Fig) {
      if (winner || cooling.has(id) || board.some((b) => b.fig.id === fig.id) || board.length >= MAX_ROWS) return;
      const cells = compare(fig, secret, cols, lang);
      let gain = 0;
      if (fig.id === secret.id) {
        gain = BRETT_HIT * mult();
        winner = id;
      } else {
        cells.forEach((c, i) => {
          if (c.c === 'g' && !greens[i]) { greens[i] = true; gain += BRETT_GREEN * mult(); }
        });
      }
      board.push({ fig, by: id, cells, gain });
      if (gain) { gains.set(id, (gains.get(id) ?? 0) + gain); scores.add(id, gain); }
      if (winner) {
        // Erst alle Felder aufploppen lassen, dann die Auflösung
        updateAll();
        const r = round;
        ctx.after(popTime(cols.length), () => { if (round === r) reveal(); });
        return;
      }
      cooling.add(id);
      const r = round;
      // Testspieler raten langsamer, damit man im Entwicklermodus mitspielen kann
      const pause = ctx.player(id)?.isBot ? T.cooldown + 2 + Math.random() * 6 : T.cooldown;
      ctx.after(pause, () => {
        cooling.delete(id);
        if (phase === 'guess' && round === r) playerView(id);
      });
      updateAll();
    }

    function checkEnd() {
      if (phase !== 'guess' || mode !== 'solo') return;
      const open = ids.filter((id) => { const s = solo.get(id)!; return (!s.place || s.pending) && !s.gaveUp && connected(id); });
      if (!open.length) reveal();
    }

    /* ---------- Auflösung ---------- */

    function reveal() {
      if (phase !== 'guess') return;
      phase = 'reveal';
      const facts = cols.map((c) => ({ label: c.label, text: valueText(secret, c, lang) }));
      const sec = { name: secret.name, img: img(secret), facts };
      let wait: number;
      if (mode === 'solo') {
        const paths = ids
          .map((id) => {
            const s = solo.get(id)!;
            return {
              id, place: s.place, points: s.points, gaveUp: s.gaveUp,
              steps: s.guesses.slice(-14).map((f, i, arr) => {
                const cells = s.cells[s.cells.length - arr.length + i];
                return { name: f.name, greens: cells.filter((c) => c.c === 'g').length, hit: f.id === secret.id };
              }),
              hidden: Math.max(0, s.guesses.length - 14),
            };
          })
          .sort((a, b) => (a.place || 99) - (b.place || 99) || b.steps.length - a.steps.length);
        const longest = Math.max(1, ...paths.map((p) => p.steps.length));
        wait = Math.min(T.revealMax, T.revealSolo + longest * T.revealStep);
        ctx.setHostView({ screen: 'reveal', ...base(), figs: undefined, secret: sec, paths, cols: cols.length, stepDelay: T.revealStep });
      } else {
        wait = T.revealBrett;
        ctx.setHostView({
          screen: 'reveal', ...base(), figs: undefined, secret: sec, winner, tries: board.length,
          gains: ids.map((id) => ({ id, g: gains.get(id) ?? 0 })).filter((g) => g.g > 0).sort((a, b) => b.g - a.g),
        });
      }
      ctx.setAllPlayerViews((p) => {
        const s = solo.get(p.id);
        const points = mode === 'solo' ? s?.points ?? 0 : gains.get(p.id) ?? 0;
        return { screen: 'reveal', name: secret.name, img: img(secret), points, place: mode === 'solo' ? s?.place ?? 0 : winner === p.id ? 1 : 0, mode };
      });
      ctx.after(wait, next);
    }

    function showScores(final: boolean, resumeAfter = false) {
      phase = final ? 'final' : 'scores';
      const ranking = scores.ranking();
      ctx.setHostView({ screen: final ? 'final' : 'scores', before: roundStart, after: scores.snapshot(), ranking, round: round + 1, total: secrets.length });
      roundStart = scores.snapshot();
      ctx.setAllPlayerViews((p) => ({ screen: final ? 'finalMe' : 'scoresMe', score: scores.get(p.id), place: ranking.filter((r) => r.score > scores.get(p.id)).length + 1, of: ranking.length }));
      if (final) return finish();
      ctx.after(T.scores, () => {
        if (resumeAfter) { round++; startRound(); } else next();
      });
    }

    function finish() {
      if (phase !== 'final') {
        phase = 'final';
        ctx.setHostView({ screen: 'final', ranking: scores.ranking(), before: roundStart, after: scores.snapshot() });
      }
      ctx.finish(scores.ranking());
    }

    /* ---------- Bots ---------- */

    function botGuess(known: { fig: Fig; cells: Cell[] }[], tried: Set<string>) {
      // Testspieler sind nicht perfekt: nur manchmal passt ihr Tipp zu allen Hinweisen
      const smart = Math.random() < 0.55;
      const left = figs.filter((f) => !tried.has(f.id) && (!smart || consistent(f, known, cols, lang)));
      const choice = left.length ? left[Math.floor(Math.random() * left.length)] : figs.find((f) => !tried.has(f.id));
      return choice ? { type: 'guess', id: choice.id } : null;
    }

    return {
      start: intro,
      onAction(id, action) {
        if (!ids.includes(id) || !action || typeof action !== 'object') return;
        if (action.type === 'resolve') {
          if (phase === 'guess' && ctx.vip() === id) reveal();
          return;
        }
        if (phase !== 'guess') return;
        if (action.type === 'giveUp' && mode === 'solo') {
          const s = solo.get(id)!;
          if (s.place || s.gaveUp) return;
          s.gaveUp = true;
          ids.forEach((p) => { const o = solo.get(p)!; if ((o.place && !o.pending) || o.gaveUp) playerView(p); });
          hostView();
          checkEnd();
          return;
        }
        if (action.type !== 'guess' || typeof action.id !== 'string') return;
        const fig = byId.get(action.id);
        if (!fig) return;
        if (mode === 'solo') guessSolo(id, fig);
        else guessBrett(id, fig);
      },
      bot(id, view) {
        if (view.screen !== 'guess') return null;
        if (mode === 'solo') {
          const s = solo.get(id);
          if (!s || s.place || s.gaveUp) return null;
          if (s.guesses.length >= 8 && Math.random() < 0.05) return { type: 'giveUp' };
          return botGuess(s.guesses.map((f, i) => ({ fig: f, cells: s.cells[i] })), new Set(s.guesses.map((f) => f.id)));
        }
        if (view.cooling) return null;
        return botGuess(board.map((b) => ({ fig: b.fig, cells: b.cells })), new Set(board.map((b) => b.fig.id)));
      },
    };
  },
} satisfies GameServerModule;
