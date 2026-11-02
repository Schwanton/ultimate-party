# Inhalte & Content-Packs

Fragen, Prompts und Begriffe liegen als **Content-Packs** vor: JSON-Dateien in `games/<spiel>/content/<sprache>/`. Jede Datei ist ein Pack. Im TV unter **Einstellungen → Inhalte** kann man Packs an- und ausschalten – z. B. den Basis-Pack ausschalten und nur ein eigenes „Firmenfeier“-Pack spielen.

UP! merkt sich innerhalb eines Raums, was schon gespielt wurde, und nimmt bevorzugt neue Einträge.

## Aufbau

```json
{
  "name": "Firmenfeier",
  "author": "Anna",
  "version": "1.0.0",
  "description": "Insider für unser Büro",
  "items": [
    { "prompt": "Was der Drucker wirklich denkt" },
    { "prompt": "Das neue Firmenmotto ab Montag", "tags": ["arbeit"] }
  ]
}
```

Speichern als z. B. `games/schlagfertig/content/de/firmenfeier.json`, dann UP! neu starten. Prüfen mit:

```bash
npm run check-packs
```

## Felder pro Spiel

| Spiel | Pflichtfelder | Optionale Felder |
| --- | --- | --- |
| Schlagfertig | `prompt` – die Frage | `tags` |
| Bluff | `question` – Satz mit `___` als Lücke · `answer` – die Wahrheit | `alternatives` (Schreibweisen, die auch als Wahrheit zählen) · `decoys` (2–3 Haus-Lügen, falls zu wenig Spieler) · `source` (Quelle) · `tags` |
| Kritzelei | `word` – was gezeichnet werden soll | `tags` |

**Bluff-Beispiel**

```json
{
  "question": "Ein Krake hat ___ Herzen.",
  "answer": "drei",
  "alternatives": ["3"],
  "decoys": ["zwei", "vier", "neun"],
  "source": "Wikipedia: Octopus"
}
```

Bei Bluff müssen die Fakten **wirklich stimmen** – bitte zu jeder Frage eine Quelle angeben und gegenprüfen.

## Mit KI neue Inhalte erzeugen

Kopiere eine der Vorlagen in eine KI (z. B. Claude), passe Thema und Anzahl an und speichere die Antwort als `.json`-Datei im passenden Ordner.

### Schlagfertig

```
Erstelle ein Content-Pack für das Partyspiel „Schlagfertig“ (wie Quiplash).
Thema: [z. B. Büroalltag]. Sprache: Deutsch. Anzahl: 40.
Jeder Prompt ist eine kurze, offene Aufforderung, auf die man witzig antworten kann,
z. B. „Das schlechteste Motto für eine Hochzeitsfeier“. Keine Fragen, die man mit Ja/Nein beantwortet.
Familienfreundlich. Gib NUR gültiges JSON in diesem Format aus:
{ "name": "[Name]", "author": "KI", "items": [ { "prompt": "…" } ] }
```

### Bluff

```
Erstelle ein Content-Pack für das Partyspiel „Bluff“ (wie Fibbage).
Thema: [z. B. Tiere]. Sprache: Deutsch. Anzahl: 20.
Jeder Eintrag ist ein kurioser, aber WAHRER Fakt als Satz mit einer Lücke „___“.
Die Antwort ist kurz (1–3 Wörter) und überraschend; man soll sie nicht leicht erraten können.
Gib 3 plausible falsche Antworten als „decoys“ und eine überprüfbare Quelle an.
Nimm nur Fakten, bei denen du dir sicher bist. Gib NUR gültiges JSON aus:
{ "name": "[Name]", "author": "KI", "items": [
  { "question": "… ___ …", "answer": "…", "alternatives": [], "decoys": ["…","…","…"], "source": "…" } ] }
```

KI-Fakten bitte stichprobenartig prüfen – KIs liegen manchmal daneben.

### Kritzelei

```
Erstelle ein Content-Pack für das Zeichenspiel „Kritzelei“ (wie Drawful).
Thema: [z. B. Urlaub]. Sprache: Deutsch. Anzahl: 50.
Jeder Begriff ist eine lustige, zeichenbare Szene aus 2–6 Wörtern, z. B. „Kaktus mit Sonnenbrille“.
Gib NUR gültiges JSON aus: { "name": "[Name]", "author": "KI", "items": [ { "word": "…" } ] }
```

## Lizenz der mitgelieferten Inhalte

Die Basis-Packs stehen unter **CC BY 4.0**: Du darfst sie verwenden und verändern, wenn du UP! als Quelle nennst.
