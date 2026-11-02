# Spiele entwickeln

Ein UP!-Spiel ist ein Ordner in `games/`. Die Plattform kümmert sich um Räume, Beitreten, Lobby, Wiederverbinden, Sprachen, Avatare und Einstellungen. Ein Spiel liefert nur seine **Regeln** (Server) und seine **Ansichten** (TV und Handy).

## In 5 Minuten zum eigenen Spiel

```bash
npm run new-game mein-spiel
npm run dev
```

Dann `http://localhost:3000/dev` öffnen: links der TV, rechts drei Handys. In der TV-Lobby mit „+ Bots“ Testspieler hinzufügen, auf dem ersten Handy dein Spiel wählen und starten.

Die Vorlage (`games/_vorlage`) ist ein vollständiges Mini-Spiel („Schätzfrage“, ca. 120 Zeilen) – lies sie einmal durch, dann ergibt der Rest sich fast von selbst.

## Der Ordner

```
games/mein-spiel/
  manifest.json        Name, Spielerzahl, Farbe …
  server.ts            Spiellogik
  client.tsx           Ansichten für TV (Host) und Handy (Controller)
  i18n/de.json         Texte auf Deutsch
  i18n/en.json         Texte auf Englisch
  content/de/*.json    Content-Packs (Fragen, Begriffe …) pro Sprache
  content/en/*.json
```

### manifest.json

```json
{
  "id": "mein-spiel",
  "name": { "de": "Mein Spiel", "en": "My Game" },
  "description": { "de": "…", "en": "…" },
  "minPlayers": 3,
  "maxPlayers": 8,
  "audience": true,
  "minutes": 10,
  "color": "#9B7BFF",
  "sdkVersion": 1,
  "contentFields": ["question"]
}
```

- `id` muss dem Ordnernamen entsprechen.
- `audience: true` – wer über `maxPlayers` hinaus beitritt, ist Publikum und bekommt eigene Ansichten (z. B. mit abstimmen).
- `contentFields` – Pflichtfelder jedes Content-Eintrags. Packs ohne diese Felder werden abgelehnt.
- `hidden: true` – Spiel nur im Entwicklermodus zeigen.
- `options` – Spiel-Einstellungen für die Lobby, z. B. Rundenanzahl. Zahl mit `min`/`max`/`step` oder Auswahl mit `choices`:

```json
"options": [
  { "id": "rounds", "label": { "de": "Runden", "en": "Rounds" }, "default": 3, "min": 1, "max": 10 },
  { "id": "speed", "label": { "de": "Tempo", "en": "Speed" }, "default": "normal",
    "choices": [ { "value": "normal", "label": { "de": "Normal", "en": "Normal" } },
                 { "value": "fast", "label": { "de": "Schnell", "en": "Fast" } } ] }
]
```

  Im Spiel: `ctx.options.rounds` (immer gültig, sonst Standardwert).

## Grundidee: Ansichten statt Spielzustand

Der Server entscheidet alles. Er schickt dem TV und jedem Handy eine **Ansicht** – ein einfaches Objekt, das beschreibt, was gerade zu sehen ist. Eingaben der Spieler kommen als **Aktionen** zurück.

```
Server  ── setHostView({ screen: 'frage', text: '…' }) ──►  TV
Server  ── setPlayerView(id, { screen: 'antworten' }) ──►  Handy
Server  ◄── onAction(id, { type: 'antwort', text: '…' }) ──  Handy
```

So kann niemand schummeln, und ein Handy, das die Verbindung verliert, bekommt beim Wiederverbinden automatisch seine aktuelle Ansicht.

## server.ts

```ts
import { Scores, type GameContext, type GameServerModule } from '@up/sdk';

export default {
  create(ctx: GameContext) {
    const scores = new Scores(ctx.players.map((p) => p.id));

    return {
      start() {
        const timer = ctx.timer(30, () => { /* Zeit abgelaufen */ });
        ctx.setHostView({ screen: 'frage', deadline: timer.deadline, duration: timer.duration });
        ctx.setAllPlayerViews(() => ({ screen: 'antworten', input: true, deadline: timer.deadline, duration: timer.duration }));
      },
      onAction(playerId, action) {
        // Eingaben immer prüfen – sie kommen von Handys!
      },
      bot(playerId, view) {
        // Was würde ein Testspieler tun? (für Entwicklermodus und npm test)
        return view.screen === 'antworten' ? { type: 'antwort', text: 'Bot-Antwort' } : null;
      },
    };
  },
} satisfies GameServerModule;
```

### Was `ctx` kann

| Funktion | Zweck |
| --- | --- |
| `ctx.players` | Mitspieler beim Start (id, name, avatar, color) |
| `ctx.audience()` | aktuelles Publikum |
| `ctx.player(id)` | aktuelle Infos zu einem Spieler (z. B. ob verbunden) |
| `ctx.lang` | Raumsprache (`de` / `en`) |
| `ctx.content()` | Einträge aller aktivierten Content-Packs, gemischt, ungespielte zuerst |
| `ctx.setHostView(view)` | Ansicht für den TV |
| `ctx.setPlayerView(id, view)` | Ansicht für ein Handy |
| `ctx.setAllPlayerViews(p => view)` | Ansicht für alle Mitspieler |
| `ctx.setAudienceView(view)` | Ansicht fürs Publikum |
| `ctx.timer(sek, fn)` | Countdown; liefert `deadline`/`duration` für die Anzeige. Berücksichtigt die Einstellung „mehr Zeit“. |
| `ctx.timerAt(zeitpunkt, fn)` | Countdown bis zu einem festen Zeitpunkt – z. B. um einen Timer zu verlängern |
| `ctx.options` | gewählte Spiel-Einstellungen |
| `ctx.after(sek, fn)` | kurze Pause, z. B. für Animationen |
| `ctx.secret(id)` | geheime Einstellung lesen, z. B. einen API-Schlüssel (im Manifest unter `secrets` deklarieren; der Host trägt ihn in den Einstellungen ein) |
| `ctx.finish(ranking)` | Spiel beendet; Rangliste wird gemeldet (später für den Olympia-Modus) |

Eigenschaften in Ansichten mit Sonderbedeutung: `input: true` lässt das Handy kurz vibrieren (neue Aufgabe).

### Hilfsfunktionen aus `@up/sdk`

`shuffle`, `pick`, `splitEvenly`, `cleanText`, `normalizeAnswer`, `isTooClose`, `Scores` und der Baustein **`DeceptionRound`** („Täuschen und Wahrheit finden“) – damit sind Bluff und Kritzelei gebaut. Wer ein ähnliches Spiel baut (z. B. „Wer hat das gesagt?“), bekommt Lügen-Prüfung, Optionen, Abstimmen und Auflösung geschenkt.

## client.tsx

```tsx
import type { ControllerViewProps, GameClientModule, HostViewProps } from '@up/sdk';
import { HostHeader, HostTimer, PhoneTimer, TextAnswer, PhoneWait } from '@up/ui';

function Host({ view, t, player }: HostViewProps) {
  if (view.screen === 'frage') {
    return <HostHeader title={t('title')} color="#9B7BFF" right={<HostTimer deadline={view.deadline} duration={view.duration} />} />;
  }
  return null;
}

function Controller({ view, t, send }: ControllerViewProps) {
  if (view.screen === 'antworten') {
    return (
      <>
        <PhoneTimer deadline={view.deadline} duration={view.duration} hurryText={t('timer.hurry')} />
        <TextAnswer button={t('send')} onSubmit={(text) => send({ type: 'antwort', text })} />
      </>
    );
  }
  return <PhoneWait title={t('game.lookAtTv')} />;
}

export default { Host, Controller } satisfies GameClientModule;
```

Der TV ist immer eine **1280 × 720 Bühne**, die automatisch auf jeden Bildschirm skaliert wird – du gestaltest also für genau eine Größe. Das Handy ist eine Spalte, die von oben nach unten gefüllt wird.

### UI-Baukasten `@up/ui`

| Baustein | Wofür |
| --- | --- |
| `Avatar`, `Crown` | Spielerbild (Tier oder Foto) |
| `HostHeader`, `HostPrompt` | Kopfzeile und große Frage auf dem TV |
| `HostTimer`, `PhoneTimer` | Countdown mit Zeitdruck-Effekten in den letzten Sekunden |
| `TextAnswer`, `ChoiceList` | Texteingabe und große Auswahl-Buttons fürs Handy |
| `PhoneWait` | „Warte …“-Bildschirm |
| `VoterChips` | Wer hat wofür gestimmt (passt sich der Gruppengröße an) |
| `Scoreboard`, `Podium` | Zwischenstand mit Balken, Siegerehrung |
| `Confetti` | Konfetti (mit Jubel-Sound, `silent` schaltet ihn ab) |
| `sfx` | Sounds: `sfx.play('ding')` – u. a. `pop`, `whoosh`, `ding`, `wrong`, `stamp`, `fanfare`, `cheer`, `drumroll`, `beep`, `go`, `reveal`, `sneaky`. Timer-Ticken, Übergänge und Jubel kommen automatisch; mit `"autoSounds": false` im Manifest abschalten und eigene Sounds mit `sfx.play(name, { always: true })` spielen. |
| `DrawCanvas`, `Drawing` | Zeichnen auf dem Handy, Zeichnung anzeigen |

Farben und Schriften kommen aus `src/ui/theme.css` (CSS-Variablen wie `var(--yellow)`). Animationen: Klassen `anim-pop`, `anim-up`, `anim-fade` oder die Keyframes dort.

## Texte (i18n)

`t('schlüssel', { n: 3 })` sucht zuerst in `games/<id>/i18n/<sprache>.json`, dann in den Plattform-Texten (`src/i18n.ts`, z. B. `game.lookAtTv`, `timer.hurry`, `common.points`). Platzhalter schreibt man als `{n}`.

## Testen

- **Entwicklermodus** (`npm run dev`, `/dev`) – TV + Handys + Bots.
- **Automatisch** – trage dein Spiel in `scripts/simulate.ts` ein und starte `npm test`. Alle Zeiten laufen dort 50× schneller, und Bots spielen komplett durch. Dafür braucht dein Spiel eine `bot()`-Funktion.

## Teilen

Ein Spiel ist nur ein Ordner. Zum Weitergeben den Ordner zippen; zum Installieren in `games/` entpacken und UP! neu starten. (Ein Import per Drag & Drop in der App ist geplant.)

Achtung: Spiele enthalten Code. Installiere nur Spiele aus Quellen, denen du vertraust.

## Regeln für gute UP!-Spiele

- Jede Phase hat einen Timer – niemand darf das Spiel aufhalten können.
- Phasen enden früher, wenn alle fertig sind.
- Eingaben auf dem Server prüfen (Länge, erlaubte Werte, richtige Phase).
- Für viele Spieler planen: Was zeigt der TV bei 40 Spielern? (`VoterChips` und `Scoreboard` machen das schon automatisch.)
- Ansichten klein halten: nur schicken, was das jeweilige Gerät braucht.
