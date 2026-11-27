/**
 * Eigene Fragen (Einstellung „Eigene Fragen“): Vor dem Spiel schreibt jeder eine Frage,
 * die anonym unter die normalen Fragen gemischt wird. Genutzt von Mic Drop und Wer war's?.
 *
 * TV-Ansicht: screen 'ownQuestions' – Handy: screen 'ownQuestions' bzw. 'ownQuestionsDone'.
 * Die passenden Bildschirme gibt es fertig in '@up/ui' (OwnQuestionsHost, OwnQuestionsPhone).
 */

import type { GameContext } from './types';
import { INPUT_GRACE } from './types';
import { cleanText, shuffle } from './util';

export interface OwnQuestion {
  authorId: string;
  text: string;
}

export function ownQuestionsPhase(ctx: GameContext, opts: {
  ids: string[];
  /** 'question' = persönliche Frage (Wer war's?), 'prompt' = Witz-Frage (Mic Drop) */
  kind: 'question' | 'prompt';
  seconds?: number;
  maxLength?: number;
  onDone: (questions: OwnQuestion[]) => void;
}) {
  const { ids, kind, onDone } = opts;
  const maxLength = opts.maxLength ?? 90;
  const written = new Map<string, string>();
  const drafts = new Map<string, string>();
  let timer: { cancel(): void; deadline: number; duration: number } | null = null;
  let active = false;

  function host() {
    ctx.setHostView({ screen: 'ownQuestions', kind, players: ids, done: [...written.keys()], deadline: timer!.deadline, duration: timer!.duration });
  }
  function view(id: string) {
    if (written.has(id)) ctx.setPlayerView(id, { screen: 'ownQuestionsDone', kind, text: written.get(id) });
    else ctx.setPlayerView(id, { screen: 'ownQuestions', input: true, kind, maxLength, deadline: timer!.deadline, duration: timer!.duration });
  }
  function finish() {
    if (!active) return;
    active = false;
    timer?.cancel();
    for (const [id, raw] of drafts) {
      if (written.has(id)) continue;
      const text = cleanText(raw, maxLength);
      if (text.length >= 5) written.set(id, text);
    }
    onDone([...written].map(([authorId, text]) => ({ authorId, text })));
  }

  return {
    start() {
      active = true;
      timer = ctx.timer(opts.seconds ?? 50, finish, { grace: INPUT_GRACE });
      host();
      ids.forEach(view);
    },
    /** true, wenn die Aktion hierher gehörte */
    onAction(id: string, action: any): boolean {
      if (!active || !action || !ids.includes(id)) return false;
      if (action.type === 'ownQuestion' && !written.has(id)) {
        const text = cleanText(String(action.text ?? ''), maxLength);
        if (text.length < 5) return true;
        written.set(id, text);
        view(id);
        host();
        if (ids.every((p) => written.has(p) || !ctx.player(p)?.connected)) finish();
        return true;
      }
      if (action.type === 'ownQuestionDraft' && !written.has(id)) {
        drafts.set(id, String(action.text ?? '').slice(0, 300));
        return true;
      }
      return false;
    },
    get active() {
      return active;
    },
    /** Testspieler schreiben eine einfache Frage */
    bot(id: string, v: any) {
      if (v?.screen !== 'ownQuestions') return null;
      const de = ctx.lang === 'de';
      const pool = kind === 'question'
        ? (de ? ['Was war dein erstes Haustier?', 'Wovor hast du heimlich Angst?', 'Was isst du am liebsten?'] : ['What was your first pet?', 'What are you secretly afraid of?', 'What is your favourite food?'])
        : (de ? ['Der schlechteste Name für ein Café', 'Was Hamster nachts denken', 'Ein neues Hobby für Rentner'] : ['The worst name for a café', 'What hamsters think at night', 'A new hobby for pensioners']);
      return { type: 'ownQuestion', text: `${pool[Math.floor(Math.random() * pool.length)]} (${id.slice(-2)})` };
    },
  };
}

/** Eigene Fragen unter die Spielfragen mischen: höchstens die Hälfte der Runden, zufällige Stellen */
export function mixOwnQuestions<T>(base: T[], own: OwnQuestion[], make: (q: OwnQuestion) => T): T[] {
  const out = base.slice();
  const take = shuffle(own).slice(0, Math.max(own.length ? 1 : 0, Math.floor(out.length / 2)));
  const slots = shuffle(out.map((_, i) => i)).slice(0, take.length);
  take.forEach((q, k) => (out[slots[k]] = make(q)));
  return out;
}
