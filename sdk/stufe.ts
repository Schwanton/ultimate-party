/**
 * Fragen-Stufen (Einstellung „Stufe“): Familie / Normal / Frech.
 * Inhalte tragen optional "stufe": "familie" oder "frech" – ohne Angabe gelten sie als „normal“.
 *
 * - Familie: nur Karten mit "familie" (reicht das nicht, kommen normale dazu)
 * - Normal: alles außer "frech" (wie bisher)
 * - Frech: etwa die Hälfte frech, der Rest normal oder familie
 */

import type { ContentItem, GameContext } from './types';
import { shuffle } from './util';

export type Stufe = 'familie' | 'normal' | 'frech';

export function stufeOf(value: unknown): Stufe {
  return value === 'familie' || value === 'frech' ? value : 'normal';
}

type WithStufe = ContentItem & { stufe?: string };

/** n Karten passend zur Stufe ziehen (filter = zusätzliche Bedingung des Spiels) */
export function drawByStufe<T extends WithStufe>(ctx: GameContext, stufe: Stufe, n: number, filter: (item: T) => boolean = () => true): T[] {
  const normal = ctx.deck<T>({ filter: (it) => filter(it) && it.stufe !== 'frech' });
  if (stufe === 'familie') {
    const fam = ctx.deck<T>({ filter: (it) => filter(it) && it.stufe === 'familie' }).drawMany(n);
    // zu wenige Familien-Karten: mit normalen auffüllen (gezogene Karten kommen nicht doppelt)
    return fam.length >= n ? fam : [...fam, ...normal.drawMany(n - fam.length)];
  }
  if (stufe === 'frech') {
    const cheeky = ctx.deck<T>({ filter: (it) => filter(it) && it.stufe === 'frech' }).drawMany(Math.ceil(n / 2));
    return shuffle([...cheeky, ...normal.drawMany(n - cheeky.length)]);
  }
  return normal.drawMany(n);
}

/** Eine Karte passend zur Stufe (für Spiele, die einzeln ziehen) */
export function deckByStufe<T extends WithStufe>(ctx: GameContext, stufe: Stufe, filter: (item: T) => boolean = () => true) {
  const normal = ctx.deck<T>({ filter: (it) => filter(it) && it.stufe !== 'frech' });
  const fam = ctx.deck<T>({ filter: (it) => filter(it) && it.stufe === 'familie' });
  const cheeky = ctx.deck<T>({ filter: (it) => filter(it) && it.stufe === 'frech' });
  let flip = Math.random() < 0.5;
  return {
    draw(): T | undefined {
      if (stufe === 'familie') return fam.draw() ?? normal.draw();
      if (stufe === 'frech') {
        flip = !flip;
        return (flip ? cheeky.draw() : normal.draw()) ?? normal.draw() ?? cheeky.draw();
      }
      return normal.draw();
    },
  };
}

/** Auswahlliste für das Manifest (zum Kopieren): Familie / Normal / Frech */
export const STUFE_OPTION_HELP = {
  de: 'Familie: harmlose Fragen, auch für Kinder. Frech: auch Fragen über Dates, Partys und Peinliches – nichts Derbes.',
  en: 'Family: harmless questions, fine for kids. Cheeky: also questions about dates, parties and embarrassing moments – nothing crude.',
};
