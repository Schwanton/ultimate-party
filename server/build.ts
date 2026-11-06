/** Baut die Browser-App (TV und Handy) mit esbuild. */

import fs from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';
import { BUILD_DIR, DEV, GAMES_DIR, INSTALLED_DIR, ROOT } from './config';
import { allGames, markBroken } from './registry';
import { LANGS } from '../sdk/types';

/** Spiele, deren Ansichten sich nicht bauen ließen – werden beim nächsten Bauen weggelassen */
const excluded = new Set<string>();

/** Virtuelles Modul "up:games": bindet alle Spiele (Ansichten, Manifest, Texte) in die App ein. */
function gamesPlugin(): esbuild.Plugin {
  return {
    name: 'up-games',
    setup(build) {
      build.onResolve({ filter: /^up:games$/ }, () => ({ path: 'up:games', namespace: 'up-games' }));
      build.onLoad({ filter: /.*/, namespace: 'up-games' }, () => {
        const lines: string[] = [];
        const entries: string[] = [];
        const watchDirs: string[] = [GAMES_DIR, ...(fs.existsSync(INSTALLED_DIR) ? [INSTALLED_DIR] : [])];
        // nur Spiele, die der Server erfolgreich geladen hat
        allGames().filter((g) => !excluded.has(g.manifest.id)).sort((a, b) => a.manifest.id.localeCompare(b.manifest.id)).forEach((g, i) => {
          const dir = g.dir;
          const manifestPath = path.join(dir, 'manifest.json');
          const clientPath = path.join(dir, 'client.tsx');
          if (!fs.existsSync(clientPath)) return;
          watchDirs.push(dir);
          lines.push(`import c${i} from ${JSON.stringify(clientPath)};`);
          lines.push(`import m${i} from ${JSON.stringify(manifestPath)};`);
          const i18n: string[] = [];
          for (const lang of LANGS) {
            const p = path.join(dir, 'i18n', `${lang}.json`);
            if (fs.existsSync(p)) {
              lines.push(`import t${i}_${lang} from ${JSON.stringify(p)};`);
              i18n.push(`${lang}: t${i}_${lang}`);
            }
          }
          // Herkunft mitgeben (im Manifest auf der Platte steht sie nicht)
          entries.push(`{ manifest: { ...m${i}, source: ${JSON.stringify(g.source)} }, client: c${i}, i18n: { ${i18n.join(', ')} } }`);
        });
        lines.push(`export default [${entries.join(',\n')}];`);
        return { contents: lines.join('\n'), loader: 'ts', resolveDir: ROOT, watchDirs };
      });
    },
  };
}

function writeIndexHtml() {
  const stamp = Date.now().toString(36);
  const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no, interactive-widget=resizes-content">
<meta name="theme-color" content="#110D24">
<meta name="apple-mobile-web-app-capable" content="yes">
<title>UP! – Ultimate Party</title>
<link rel="icon" href="/assets/icon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=DM+Sans:wght@400;500;700&display=swap">
<link rel="stylesheet" href="/assets/main.css?v=${stamp}">
</head>
<body>
<div id="root"></div>
<script type="module" src="/assets/main.js?v=${stamp}"></script>
</body>
</html>
`;
  fs.writeFileSync(path.join(BUILD_DIR, 'index.html'), html);
  fs.copyFileSync(path.join(ROOT, 'src', 'icon.svg'), path.join(BUILD_DIR, 'assets', 'icon.svg'));
}

const options: esbuild.BuildOptions = {
  entryPoints: { main: path.join(ROOT, 'src', 'main.tsx') },
  bundle: true,
  outdir: path.join(BUILD_DIR, 'assets'),
  format: 'esm',
  target: ['es2020', 'chrome90', 'safari15', 'firefox90'],
  jsx: 'automatic',
  loader: { '.json': 'json', '.svg': 'text' },
  minify: !DEV,
  sourcemap: DEV ? 'inline' : false,
  define: { 'process.env.NODE_ENV': JSON.stringify(DEV ? 'development' : 'production') },
  tsconfig: path.join(ROOT, 'tsconfig.json'),
  logLevel: 'silent',
  plugins: [gamesPlugin()],
};

/** Zu welchem installierten Spiel gehört eine Datei aus einer Fehlermeldung? */
function installedGameOf(file: string | undefined) {
  if (!file) return undefined;
  const abs = path.resolve(ROOT, file.replace(/^[\w-]+:/, ''));
  return allGames().find((g) => g.source === 'installed' && abs.startsWith(g.dir + path.sep));
}

/**
 * Baut die App. Lassen sich die Ansichten eines installierten Spiels nicht bauen, wird nur dieses Spiel
 * weggelassen (und als defekt markiert) – ein fremdes Spiel darf nie ganz UP! lahmlegen.
 */
export async function buildClient(): Promise<void> {
  fs.mkdirSync(path.join(BUILD_DIR, 'assets'), { recursive: true });
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await esbuild.build(options);
      if (result.errors.length) throw Object.assign(new Error('build'), { errors: result.errors });
      break;
    } catch (e) {
      const errors: esbuild.Message[] = (e as { errors?: esbuild.Message[] }).errors ?? [];
      const broken = new Set(errors.map((m) => installedGameOf(m.location?.file)).filter((g) => !!g));
      if (!broken.size || attempt > 10) {
        throw new Error(errors.length ? errors.map((m) => `${m.location?.file ?? ''}:${m.location?.line ?? ''} ${m.text}`).join('\n') : (e as Error).message);
      }
      for (const g of broken) {
        const msg = errors.find((m) => installedGameOf(m.location?.file) === g);
        const reason = `Ansichten (client.tsx) lassen sich nicht bauen: ${msg?.text ?? ''}`;
        console.error(`[UP!] Spiel "${g!.manifest.id}" wird übersprungen – ${reason}`);
        excluded.add(g!.manifest.id);
        markBroken(g!.manifest.id, reason);
      }
    }
  }
  writeIndexHtml();
}

/** Entwicklermodus: bei jeder Änderung neu bauen und Browser neu laden lassen. */
export async function watchClient(onRebuild: () => void): Promise<void> {
  fs.mkdirSync(path.join(BUILD_DIR, 'assets'), { recursive: true });
  const ctx = await esbuild.context({
    ...options,
    plugins: [
      ...(options.plugins ?? []),
      {
        name: 'up-reload',
        setup(build) {
          build.onEnd((result) => {
            if (result.errors.length) {
              console.error('[UP!] Build-Fehler:\n' + result.errors.map((e) => `  ${e.location?.file}:${e.location?.line} ${e.text}`).join('\n'));
              return;
            }
            writeIndexHtml();
            onRebuild();
          });
        },
      },
    ],
  });
  await ctx.watch();
}
