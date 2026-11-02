/** Alle installierten Spiele (wird beim Bauen aus dem Ordner games/ erzeugt). */

import games from 'up:games';
import type { GameClientModule, GameManifest } from '@up/sdk';

export interface ClientGame {
  manifest: GameManifest;
  client: GameClientModule;
  i18n: Record<string, Record<string, string>>;
}

const registry = games as ClientGame[];
export default registry;

export function clientGame(id: string | null | undefined) {
  return registry.find((g) => g.manifest.id === id);
}
