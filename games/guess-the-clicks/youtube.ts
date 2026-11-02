/**
 * Zufällige YouTube-Videos über die offizielle YouTube Data API v3.
 *
 * Ein wirklich gleichverteiltes Zufallsvideo kann man über die API nicht abfragen. Wir mischen daher
 * mehrere Strategien, die jeweils in andere Ecken von YouTube führen:
 *
 *  1. ID-Präfix („Dialing for Videos“, UMass 2023): Suche nach einer zufälligen 5-Zeichen-Folge aus dem
 *     Video-ID-Alphabet. Treffer, deren ID wirklich so beginnt, sind echte Zufallsstichproben.
 *  2. Zufallswort + zufälliger Zeitraum: ein Alltagswort und ein zufälliges 30-Tage-Fenster zwischen 2006 und heute.
 *  3. Kamera-Dateiname + Zeitraum: „IMG 4821“, „DSC 0193“ … führt zu privaten, kaum gesehenen Clips.
 *  4. Thema aus dem Content-Pack (eigene Themen der Spieler).
 *
 * Zusätzlich wird pro Runde eine zufällige Ziel-Größenordnung (10 bis 1 Mrd. Aufrufe) gewürfelt und aus den
 * Kandidaten eines in dieser Nähe gewählt – so wechseln sich Nischenvideos und Hits ab.
 */

export interface Video {
  id: string;
  title: string;
  channel: string;
  published: string;
  durationSec: number;
  views: number;
}

const API = 'https://www.googleapis.com/youtube/v3';
const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const FIRST_UPLOAD = Date.UTC(2006, 0, 1);

const WORDS: Record<string, string[]> = {
  de: ('Hund Katze Auto Garten Küche Regen Schnee Strand Berg Wald Fluss Brücke Zug Bus Fahrrad Pferd Kuh Ente Vogel Fisch '
    + 'Kuchen Pizza Nudeln Kaffee Tee Eis Brot Suppe Apfel Banane Gitarre Klavier Trommel Lied Tanz Party Hochzeit Geburtstag Schule Lehrer '
    + 'Oma Opa Baby Bruder Schwester Freund Nachbar Urlaub Reise Flughafen Hotel Zelt Feuer Grill Werkzeug Bohrer Holz Stein Lego Puzzle '
    + 'Spiel Ball Tor Fußball Basketball Tennis Schwimmen Laufen Yoga Training Rezept Test Anleitung Reparatur Umzug Wohnung Zimmer Keller Dach '
    + 'Fenster Tür Lampe Uhr Handy Computer Drucker Kamera Drohne Rakete Mond Sonne Stern Gewitter Sturm Herbst Winter Frühling Sommer '
    + 'Weihnachten Ostern Karneval Konzert Theater Zirkus Zoo Bauernhof Traktor Bagger Kran Baustelle Stadt Dorf Markt Laden Kasse').split(' '),
  en: ('dog cat car garden kitchen rain snow beach mountain forest river bridge train bus bike horse cow duck bird fish '
    + 'cake pizza pasta coffee tea ice cream bread soup apple banana guitar piano drum song dance party wedding birthday school teacher '
    + 'grandma grandpa baby brother sister friend neighbor vacation trip airport hotel tent fire grill tools drill wood stone lego puzzle '
    + 'game ball goal soccer basketball tennis swimming running yoga workout recipe review tutorial repair moving apartment room basement roof '
    + 'window door lamp clock phone computer printer camera drone rocket moon sun star thunderstorm storm autumn winter spring summer '
    + 'christmas easter carnival concert theater circus zoo farm tractor excavator crane construction city village market shop checkout').split(' '),
};

export class YouTubeError extends Error {
  constructor(readonly kind: 'quota' | 'key' | 'network' | 'empty', message: string) {
    super(message);
  }
}

const rand = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];

function parseDuration(iso: string): number {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso ?? '');
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0;
}

async function call(path: string, params: Record<string, string>, key: string) {
  const url = `${API}/${path}?${new URLSearchParams({ ...params, key })}`;
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  } catch (e) {
    throw new YouTubeError('network', (e as Error).message);
  }
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reason = body?.error?.errors?.[0]?.reason ?? '';
    if (/quota/i.test(reason)) throw new YouTubeError('quota', reason);
    if (res.status === 400 || res.status === 403) throw new YouTubeError('key', body?.error?.message ?? reason);
    throw new YouTubeError('network', body?.error?.message ?? `HTTP ${res.status}`);
  }
  return body;
}

/** Zufälliges Zeitfenster zwischen 2006 und vor einer Woche */
function randomWindow(days: number) {
  const end = Date.now() - 7 * 864e5;
  const start = FIRST_UPLOAD + Math.random() * (end - FIRST_UPLOAD - days * 864e5);
  return { publishedAfter: new Date(start).toISOString(), publishedBefore: new Date(start + days * 864e5).toISOString() };
}

function cameraName() {
  const n = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  return rand([`IMG ${n}`, `IMG_${n}`, `DSC ${n}`, `MOV ${n}`, `VID ${n}`, `GOPR${n}`, `DSCF${n}`, `MVI ${n}`]);
}

type Plan = { params: Record<string, string>; prefix?: string };

function plan(lang: string, topics: string[]): Plan {
  const order = rand(['relevance', 'date', 'viewCount', 'rating', 'relevance']);
  const r = Math.random();
  if (r < 0.3) {
    const prefix = Array.from({ length: 5 }, () => rand(ID_ALPHABET.split(''))).join('');
    return { params: { q: `"${prefix}"`, order: 'relevance' }, prefix };
  }
  if (r < 0.65) return { params: { q: rand(WORDS[lang] ?? WORDS.en), order, ...randomWindow(30) } };
  if (r < 0.88) return { params: { q: cameraName(), order, ...randomWindow(365) } };
  return { params: { q: topics.length ? rand(topics) : rand(WORDS[lang] ?? WORDS.en), order, ...randomWindow(365 * 3) } };
}

export async function randomVideo(key: string, topics: string[], lang: string, exclude: Set<string>): Promise<Video> {
  // Ziel-Größenordnung der Aufrufe, gleichverteilt auf der Log-Skala: 10 … 1 Mrd.
  const targetLog = 1 + Math.random() * 8;
  for (let attempt = 0; attempt < 5; attempt++) {
    const p = plan(lang, topics);
    const search = await call('search', { part: 'id', type: 'video', maxResults: '50', safeSearch: 'strict', videoEmbeddable: 'true', ...p.params }, key);
    let ids: string[] = (search.items ?? []).map((i: any) => i.id?.videoId).filter((id: string) => id && !exclude.has(id));
    if (p.prefix) {
      // Echte Präfix-Treffer bevorzugen (das sind die wirklich zufälligen)
      const exact = ids.filter((id) => id.toLowerCase().startsWith(p.prefix!.toLowerCase()));
      if (exact.length) ids = exact;
    }
    if (!ids.length) continue;
    const details = await call('videos', { part: 'snippet,statistics,contentDetails,status', id: ids.join(',') }, key);
    const usable = (details.items ?? []).filter((v: any) =>
      v.statistics?.viewCount !== undefined && v.status?.embeddable !== false && v.status?.privacyStatus === 'public'
      && v.snippet?.liveBroadcastContent === 'none' && parseDuration(v.contentDetails?.duration) >= 5,
    );
    if (!usable.length) continue;
    // Die 3 Kandidaten nächst an der Ziel-Größenordnung, daraus zufällig einen
    const near = usable
      .map((v: any) => ({ v, d: Math.abs(Math.log10(Number(v.statistics.viewCount) + 1) - targetLog) }))
      .sort((a: any, b: any) => a.d - b.d)
      .slice(0, 3);
    const v = rand(near).v;
    return {
      id: v.id,
      title: v.snippet.title,
      channel: v.snippet.channelTitle,
      published: v.snippet.publishedAt,
      durationSec: parseDuration(v.contentDetails?.duration),
      views: Number(v.statistics.viewCount),
    };
  }
  throw new YouTubeError('empty', 'no usable videos');
}

/** Schlüssel prüfen (kostet 1 Einheit) */
export async function checkKey(key: string) {
  await call('videos', { part: 'id', id: 'dQw4w9WgXcQ' }, key);
}

/** Testdaten ohne Internet (für npm test und den Entwicklermodus). */
export function fakeVideo(i: number): Video {
  const views = Math.round(10 ** (1 + Math.random() * 8));
  return { id: 'dQw4w9WgXcQ', title: `Testvideo ${i + 1}`, channel: 'UP! Test', published: '2020-05-17T12:00:00Z', durationSec: 95, views };
}
