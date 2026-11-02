/**
 * Baustein „Täuschen und Wahrheit finden“ (genutzt von Bluff und Kritzelei).
 *
 * 1. Spieler schreiben Lügen (submitLie) – zu nah an der Wahrheit oder doppelt wird abgelehnt.
 * 2. buildOptions() mischt Lügen, Wahrheit und ggf. Haus-Lügen.
 * 3. Alle wählen (pick) – die eigene Lüge wird ihnen nicht angezeigt (optionsFor).
 * 4. reveal() liefert die Auflösung in sinnvoller Reihenfolge und wer wen reingelegt hat.
 */

import { cleanText, isTooClose, normalizeAnswer, shuffle } from './util';

export interface DeceptionOption {
  id: string;
  text: string;
  kind: 'truth' | 'lie' | 'house';
  /** Wer diese Lüge geschrieben hat (bei gleichen Lügen mehrere) */
  authors: string[];
}

export interface RevealItem extends DeceptionOption {
  pickers: string[];
}

export type LieResult = 'ok' | 'tooClose' | 'duplicate' | 'invalid';

export class DeceptionRound {
  private lies = new Map<string, string>();
  private picks = new Map<string, string>();
  options: DeceptionOption[] = [];

  constructor(
    readonly truth: string,
    private readonly accepted: string[] = [],
    private readonly houseLies: string[] = [],
    private readonly maxLength = 40,
  ) {}

  submitLie(playerId: string, raw: unknown): LieResult {
    const text = cleanText(raw, this.maxLength);
    if (!text) return 'invalid';
    if (isTooClose(text, [this.truth, ...this.accepted])) return 'tooClose';
    const n = normalizeAnswer(text);
    for (const [other, lie] of this.lies) if (other !== playerId && normalizeAnswer(lie) === n) return 'duplicate';
    this.lies.set(playerId, text);
    return 'ok';
  }

  hasLie(playerId: string) {
    return this.lies.has(playerId);
  }

  lieOf(playerId: string) {
    return this.lies.get(playerId);
  }

  get lieCount() {
    return this.lies.size;
  }

  /** Optionen bauen; mit Haus-Lügen auffüllen, bis mindestens `minOptions` da sind. */
  buildOptions(minOptions = 4): DeceptionOption[] {
    const list: Omit<DeceptionOption, 'id'>[] = [{ text: this.truth, kind: 'truth', authors: [] }];
    for (const [author, text] of this.lies) list.push({ text, kind: 'lie', authors: [author] });
    const used = new Set(list.map((o) => normalizeAnswer(o.text)));
    for (const h of shuffle(this.houseLies)) {
      if (list.length >= minOptions) break;
      if (used.has(normalizeAnswer(h)) || isTooClose(h, [this.truth, ...this.accepted])) continue;
      used.add(normalizeAnswer(h));
      list.push({ text: h, kind: 'house', authors: [] });
    }
    this.options = shuffle(list).map((o, i) => ({ ...o, id: `o${i}` }));
    return this.options;
  }

  optionsFor(playerId: string): { id: string; text: string }[] {
    return this.options.filter((o) => !o.authors.includes(playerId)).map(({ id, text }) => ({ id, text }));
  }

  pick(playerId: string, optionId: unknown): boolean {
    const o = this.options.find((x) => x.id === optionId);
    if (!o || o.authors.includes(playerId)) return false;
    this.picks.set(playerId, o.id);
    return true;
  }

  pickOf(playerId: string) {
    return this.picks.get(playerId);
  }

  get pickCount() {
    return this.picks.size;
  }

  /** Auflösung: zuerst gewählte Lügen (wenig → viel gewählt), zum Schluss die Wahrheit. */
  reveal(): RevealItem[] {
    const items = this.options.map((o) => ({ ...o, pickers: [...this.picks].filter(([, id]) => id === o.id).map(([p]) => p) }));
    const lies = items.filter((i) => i.kind !== 'truth' && i.pickers.length > 0).sort((a, b) => a.pickers.length - b.pickers.length);
    const truth = items.filter((i) => i.kind === 'truth');
    return [...lies, ...truth];
  }
}
