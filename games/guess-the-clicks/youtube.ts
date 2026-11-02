/** Zufällige YouTube-Videos über die offizielle YouTube Data API v3. */

export interface Video {
  id: string;
  title: string;
  channel: string;
  published: string;
  durationSec: number;
  views: number;
}

const API = 'https://www.googleapis.com/youtube/v3';
const ORDERS = ['relevance', 'date', 'viewCount', 'rating', 'relevance'];

export class YouTubeError extends Error {
  constructor(readonly kind: 'quota' | 'key' | 'network' | 'empty', message: string) {
    super(message);
  }
}

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

/** Kamera-Dateinamen führen zu fast unbekannten Videos – sorgt für Spannweite bei den Aufrufen. */
function cameraQuery() {
  const n = () => String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  const patterns = [() => `IMG ${n()}`, () => `DSC ${n()}`, () => `MOV ${n()}`, () => `VID ${n()}`, () => `GOPR${n()}`];
  return patterns[Math.floor(Math.random() * patterns.length)]();
}

export async function randomVideo(key: string, topics: string[], lang: string, exclude: Set<string>): Promise<Video> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const q = Math.random() < 0.35 || !topics.length ? cameraQuery() : topics[Math.floor(Math.random() * topics.length)];
    const order = ORDERS[Math.floor(Math.random() * ORDERS.length)];
    const search = await call('search', {
      part: 'id', type: 'video', maxResults: '50', q, order, safeSearch: 'strict', videoEmbeddable: 'true', relevanceLanguage: lang,
    }, key);
    const ids: string[] = (search.items ?? []).map((i: any) => i.id?.videoId).filter((id: string) => id && !exclude.has(id));
    if (!ids.length) continue;
    const details = await call('videos', { part: 'snippet,statistics,contentDetails,status', id: ids.join(',') }, key);
    const usable = (details.items ?? []).filter((v: any) =>
      v.statistics?.viewCount !== undefined && v.status?.embeddable !== false && v.snippet?.liveBroadcastContent === 'none',
    );
    if (!usable.length) continue;
    const v = usable[Math.floor(Math.random() * usable.length)];
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

/** Testdaten ohne Internet (für npm test und den Entwicklermodus ohne Schlüssel). */
export function fakeVideo(i: number): Video {
  const views = Math.round(10 ** (1 + Math.random() * 8));
  return { id: 'dQw4w9WgXcQ', title: `Testvideo ${i + 1}`, channel: 'UP! Test', published: '2020-05-17T12:00:00Z', durationSec: 95, views };
}
