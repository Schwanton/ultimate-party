# Spiele entwickeln

Ein UP!-Spiel ist ein Ordner in `games/` (mitgeliefert) oder `spiele/` (aus einem eigenen Repository, siehe [Teilen](#teilen-eigenes-repository)). Die Plattform kümmert sich um Räume, Beitreten, Lobby, Wiederverbinden, Sprachen, Avatare und Einstellungen. Ein Spiel liefert nur seine **Regeln** (Server) und seine **Ansichten** (TV und Handy).

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
  bilder/ schriften/ klaenge/   eigene Dateien, im Spiel erreichbar unter /game/mein-spiel/bilder/datei.webp …
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
- `tags` – Kategorien fürs Spielmenü: `words`, `draw`, `guess`, `deceive`, `social`, `team`, `quick`, `duel` (mehrere möglich; Unbekanntes landet unter „Weitere“).
- `description` – Kurzbeschreibung (1–2 Sätze), steht im Spielmenü und in der Lobby.
- `hidden: true` – Spiel nur im Entwicklermodus zeigen.
- Titelbild – lege `bilder/titelbild.webp` (oder `.png`/`.jpg`) in den Spielordner, dann erscheint es groß in der Lobby und in der Spielauswahl. Ein Screenshot vom TV ist ideal; jedes Format geht, das Bild wird passend zugeschnitten. Ein anderes Bild aus `bilder/` wählst du mit `"cover": "bilder/datei.webp"`. Ohne Bild zeigt UP! die Spielfarbe mit dem Anfangsbuchstaben.
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
| `ctx.vip()` | aktuelle*r VIP – z. B. wer im Spiel entscheidet, wie es weitergeht |
| `ctx.stream(data)` | schnelle Live-Daten an den TV (z. B. Positionen 30× pro Sekunde), ohne die ganze Ansicht neu zu senden – im TV mit `useStream()` aus `@up/ui` lesen. Mit `ctx.stream(data, { phones: true })` geht es zusätzlich an alle Handys. Beispiele: `games/sumo`, `games/montagsmaler` (Live-Zeichnung) |
| `ctx.lang` | Raumsprache (`de` / `en`) |
| `ctx.content()` | Einträge aller aktivierten Content-Packs, gemischt, ungespielte zuerst |
| `ctx.deck()` | **Kartenstapel**: Inhalte wie Karten ziehen (`draw()`, `drawMany(n)`, `putBack(karte)`). Eine gezogene Karte kommt erst wieder, wenn der ganze Stapel durch ist – auch über mehrere Spiele und Neustarts hinweg (gespeichert in `.up-data/decks.json`). Mit `ctx.deck({ filter })` nur passende Karten, z. B. eine Schwierigkeitsstufe. Für alles nehmen, was Spieler nicht doppelt sehen sollen. |
| `ctx.setHostView(view)` | Ansicht für den TV |
| `ctx.setPlayerView(id, view)` | Ansicht für ein Handy |
| `ctx.setAllPlayerViews(p => view)` | Ansicht für alle Mitspieler |
| `ctx.setAudienceView(view)` | Ansicht fürs Publikum |
| `ctx.timer(sek, fn)` | Countdown; liefert `deadline`/`duration` für die Anzeige. Berücksichtigt die Einstellung „mehr Zeit“. |
| `ctx.timerAt(zeitpunkt, fn)` | Countdown bis zu einem festen Zeitpunkt – z. B. um einen Timer zu verlängern |
| `ctx.options` | gewählte Spiel-Einstellungen |
| `ctx.after(sek, fn)` | kurze Pause, z. B. für Animationen |
| `ctx.secret(id)` | geheime Einstellung lesen, z. B. einen API-Schlüssel (im Manifest unter `secrets` deklarieren; der Host trägt ihn in den Einstellungen ein) |
| `ctx.store.get(schlüssel)` / `ctx.store.set(schlüssel, wert)` | dauerhaft speichern, auch über Neustarts hinweg (`.up-data/store/<spiel>.json`), z. B. einen laufenden Run. In Tests wird nichts geschrieben. |
| `ctx.finish(ranking)` | Spiel beendet; Rangliste wird gemeldet (später für den Olympia-Modus) |

Eigenschaften in Ansichten mit Sonderbedeutung: `input: true` lässt das Handy kurz vibrieren (neue Aufgabe).

### Hilfsfunktionen aus `@up/sdk`

`shuffle`, `pick`, `splitEvenly`, `cleanText`, `normalizeAnswer`, `isTooClose`, `Scores` und der Baustein **`DeceptionRound`** („Täuschen und Wahrheit finden“) – damit sind Flunkerfakt und Vernissage gebaut. Wer ein ähnliches Spiel baut (z. B. „Wer hat das gesagt?“), bekommt Lügen-Prüfung, Optionen, Abstimmen und Auflösung geschenkt.

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
| `sfx` | Sounds: `sfx.play('ding')` – u. a. `pop`, `whoosh`, `ding`, `wrong`, `stamp`, `fanfare`, `cheer`, `drumroll`, `beep`, `go`, `reveal`, `sneaky`. Timer-Ticken, Übergänge und Jubel kommen automatisch; mit `"autoSounds": false` im Manifest abschalten und eigene Sounds mit `sfx.play(name, { always: true })` spielen. Ganz eigene Klänge: `sfx.custom((s) => s.tone(440, 0.1, { type: 'square' }))` (auch `s.noise(…)`); eigene Hintergrundmusik: `sfx.startMusic({ bpm: () => 110, step(s, i) { … } })` und `sfx.stopMusic()` – Beispiel in `games/schwarmsinn/client.tsx`. |
| `DrawCanvas`, `Drawing` | Zeichnen auf dem Handy, Zeichnung anzeigen |
| `useDraft` | Entwürfe automatisch übertragen (siehe unten). `TextAnswer` macht das mit `onDraft` und `deadline` schon von selbst. |

### Eingaben gehen nie verloren: Entwürfe + Nachfrist

Wer bei Zeitablauf noch nicht auf „Abschicken“ gedrückt hat, soll trotzdem mit seinem letzten Stand dabei sein – auch bei wackeligem WLAN. Dafür gibt es zwei Bausteine:

**Handy (`client.tsx`)** – den Entwurf laufend mitschicken:

```tsx
<TextAnswer button="Abschicken" onSubmit={(text) => send({ type: 'answer', text })}
  onDraft={(text) => send({ type: 'answerDraft', draft: true, text })} deadline={view.deadline} />

// oder für eigene Eingaben (Zahl, Zeichnung …):
useDraft(value, (v) => send({ type: 'guessDraft', draft: true, value: v }), view.deadline);
```

`useDraft` schickt kurz nach jeder Änderung, in den letzten Sekunden mehrmals (5 / 3 / 2 / 1 / 0,4 s vorher und kurz danach), beim Wechsel in den Hintergrund und nach einem Verbindungsabbruch erneut (dafür `draft: true` in der Aktion).

**Server (`server.ts`)** – Entwürfe merken, Timer mit Nachfrist starten und bei Ablauf auswerten:

```ts
const t = ctx.timer(60, endPhase, { grace: INPUT_GRACE }); // angezeigt: 60 s, beendet: 1,5 s später
// onAction: if (action.type === 'answerDraft' && phase === 'write' && !answers.has(id)) drafts.set(id, action.text);
// endPhase: for (const [id, text] of drafts) if (!answers.has(id)) answers.set(id, text);
```

Farben und Schriften kommen aus `src/ui/theme.css` (CSS-Variablen wie `var(--yellow)`). Animationen: Klassen `anim-pop`, `anim-up`, `anim-fade` oder die Keyframes dort.

## Texte (i18n)

`t('schlüssel', { n: 3 })` sucht zuerst in `games/<id>/i18n/<sprache>.json`, dann in den Plattform-Texten (`src/i18n.ts`, z. B. `game.lookAtTv`, `timer.hurry`, `common.points`). Platzhalter schreibt man als `{n}`.

## Testen

- **Entwicklermodus** (`npm run dev`, `/dev`) – TV + Handys + Bots.
- **Automatisch** – trage dein Spiel in `scripts/simulate.ts` ein und starte `npm test`. Alle Zeiten laufen dort 50× schneller, und Bots spielen komplett durch. Dafür braucht dein Spiel eine `bot()`-Funktion.

## Teilen: eigenes Repository

Ein Spiel muss nicht in das UP!-Repository. Jedes Spiel kann ein **eigenes GitHub-Repository** haben – Hosts installieren es dann mit einem Klick und bekommen Updates genauso bequem wie Updates von UP! selbst.

### Wo Spiele liegen

| Ordner | Was | Updates |
|---|---|---|
| `games/` | mitgelieferte Spiele | kommen mit dem UP!-Update |
| `spiele/` | installierte Spiele aus eigenen Repositories | pro Spiel, aus seinem Repository |

`spiele/` gehört nicht zu UP!: Der Ordner steht in `.gitignore`, und das UP!-Update fasst ihn nie an. Gibt es ein Spiel mit gleichem Namen in beiden Ordnern, gewinnt das mitgelieferte.

### Ein Spiel als eigenes Repository anlegen

```bash
npm run new-game mein-spiel -- --repo
```

Das legt `spiele/mein-spiel/` an (mit `CHANGELOG.md`). Der Spielordner selbst ist das Repository: `manifest.json`, `server.ts` und `client.tsx` liegen direkt im Hauptordner des Repositories (oder in genau einem Unterordner).

1. In `manifest.json` bei `"repo"` dein Repository eintragen, z. B. `"repo": "anna/mein-spiel"`.
2. Im Ordner `spiele/mein-spiel` ein Git-Repository anlegen und auf GitHub hochladen.
3. Entwickeln wie gewohnt mit `npm run dev` – UP! lädt Spiele aus `spiele/` genauso wie aus `games/`. Ein Ordner mit `.git` gilt als Entwickler-Checkout: UP! bietet dafür keine Updates an (du arbeitest ja selbst daran).

Ein vorhandenes Spiel-Repository zum Mitentwickeln einfach nach `spiele/` klonen: `git clone https://github.com/anna/mein-spiel spiele/mein-spiel`.

### Versionen veröffentlichen

- `version` im Manifest erhöhen (z. B. `1.2.0`) und im `CHANGELOG.md` einen Abschnitt `## 1.2.0` mit Stichpunkten schreiben – die zeigt UP! beim Update an.
- Auf GitHub eine **Release** mit passendem Tag anlegen (z. B. `v1.2.0`). UP! nimmt immer die neueste Release; gibt es keine, den aktuellen Stand des Hauptzweigs.
- `sdkVersion` ist die SDK-Version, die das Spiel mindestens braucht. Braucht ein Spiel ein neueres SDK, als UP! hat, wird es nicht geladen und Updates darauf erst nach einem UP!-Update angeboten.

### Installieren und Updates (für Hosts)

Einstellungen (Zahnrad) → **Spiele verwalten**:

- **Mehr Spiele** – der Katalog geprüfter Spiele, mit einem Klick installieren. Installieren geht ohne Neustart.
- **Aus GitHub installieren** – Repository eingeben (`anna/mein-spiel`, eine GitHub-Adresse oder `anna/mein-spiel@v1.2.0` für eine bestimmte Version).
- **Nach Updates suchen** – für ein einzelnes Spiel oder für alle. Der Knopf „Nach Updates suchen“ in den Einstellungen sucht nach Updates für UP! und alle Spiele; außerdem sucht UP! alle 30 Minuten von selbst.
- **Aktualisieren** – einzeln oder alle auf einmal. Gibt es Updates, erscheint in der Lobby derselbe grüne Hinweis wie für UP!-Updates; „Jetzt aktualisieren“ installiert UP! und alle Spiele in einem Rutsch und startet einmal neu.

Bei Updates bleiben eigene Content-Packs in `content/` erhalten, ebenso gespeicherte Daten in `.up-data`. Vor jedem Update sichert UP! die alte Version. Lässt sich die neue Version nicht starten (Fehler in `server.ts` oder `client.tsx`), stellt UP! automatisch die alte wieder her und bietet die kaputte Version nicht noch einmal an. Ein fehlerhaftes installiertes Spiel legt nie ganz UP! lahm – es wird nur übersprungen.

### Der Katalog

Der Katalog ist die Datei `katalog.json` im Repository [Schwanton/up-spiele](https://github.com/Schwanton/up-spiele) (einstellbar in `package.json` unter `upUpdate.catalog`). Neue Spiele und neue Versionen kommen per Pull Request dazu. Jeder Eintrag zeigt auf eine **feste Version** (Tag oder Commit) – geprüft wird also genau der Code, der installiert wird.

```json
{
  "spiele": [
    {
      "id": "mein-spiel",
      "repo": "anna/mein-spiel",
      "ref": "v1.2.0",
      "version": "1.2.0",
      "sdkVersion": 1,
      "name": { "de": "Mein Spiel", "en": "My Game" },
      "description": { "de": "Kurze Beschreibung", "en": "Short description" },
      "author": "Anna",
      "color": "#FF66AA",
      "minPlayers": 3,
      "maxPlayers": 8,
      "minutes": 15,
      "cover": "https://raw.githubusercontent.com/anna/mein-spiel/v1.2.0/bilder/titelbild.webp",
      "older": [{ "version": "1.1.0", "ref": "v1.1.0", "sdkVersion": 1 }]
    }
  ]
}
```

- `id` muss der `id` im Manifest entsprechen und darf nicht schon bei UP! dabei sein.
- `path` (optional): Unterordner im Repository, falls das Spiel nicht im Hauptordner liegt.
- `older` (optional): ältere Versionen. Wer noch eine ältere UP!-Version hat, bekommt automatisch die neueste Version, die dazu passt.

### Sicherheit

Spiele enthalten Code, der auf dem Rechner des Hosts läuft – mit denselben Rechten wie UP! selbst (er könnte z. B. gespeicherte API-Schlüssel lesen). Deshalb: Katalog-Einträge vor dem Aufnehmen ansehen und immer auf eine feste Version zeigen lassen. Beim Installieren aus GitHub warnt UP! vorher. Installiere nur Spiele aus Quellen, denen du vertraust.

## Regeln für gute UP!-Spiele

- Jede Phase hat einen Timer – niemand darf das Spiel aufhalten können.
- Phasen enden früher, wenn alle fertig sind.
- Bei Text-, Zahlen- und Zeichen-Eingaben Entwürfe mitschicken (`useDraft` / `onDraft`) und den Timer mit `INPUT_GRACE` starten – bei Zeitablauf zählt der letzte Stand.
- Eingaben auf dem Server prüfen (Länge, erlaubte Werte, richtige Phase).
- Für viele Spieler planen: Was zeigt der TV bei 40 Spielern? (`VoterChips` und `Scoreboard` machen das schon automatisch.)
- Ansichten klein halten: nur schicken, was das jeweilige Gerät braucht.
