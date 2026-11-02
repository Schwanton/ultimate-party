# Entscheidungen & Stand

Dieses Dokument hält fest, was beim Bauen entschieden wurde (ohne Rückfrage) und was noch fehlt. Alles hier kann geändert werden.

## Stand

| Meilenstein | Status |
| --- | --- |
| 1 · Fundament: Server, Räume, QR-Code, Lobby, Wiederverbinden, Sprachen DE/EN, Tier-Avatare und Fotos | fertig |
| 2 · Game-SDK, UI-Baukasten, Entwicklermodus mit Bots, Spielvorlage, automatische Tests | fertig |
| 3 · Schlagfertig, Bluff, Kritzelei mit Basis-Packs DE/EN | fertig |
| 4 · Olympia-Modus, Teams, Pack-Import per Drag & Drop, Spiele-Import, Sounds | offen |
| 5 · Fertige `.app` / `.exe`, Online-Modus | offen |

`npm test` spielt alle Spiele automatisch mit 2 bis 100 Bots durch.

## Technik

**Statt Vite, Socket.IO und Tailwind: esbuild, `ws` und eigenes CSS.**
Das Konzept nannte Vite, Socket.IO und Tailwind. Gebaut wurde mit esbuild (bündelt die App), `ws` (WebSockets) und einem eigenen Stylesheet mit CSS-Variablen. Gründe:
- Nur 5 Laufzeit-Pakete statt mehrerer Hundert → schnellere Installation, weniger kann kaputtgehen, kleinere `.app` später.
- Wiederverbinden, Zeitabgleich und Neuladen im Entwicklermodus sind mit wenigen Zeilen selbst gebaut.
- Ehrlicher Nebengrund: In der Umgebung, in der UP! entstanden ist, war das npm-Verzeichnis gesperrt; nur diese Pakete waren verfügbar und testbar.
React bleibt wie besprochen. Ein Umstieg auf Vite/Tailwind wäre später möglich, ist aber nicht nötig.

**QR-Code:** eigener kleiner Generator (`src/ui/qr.ts`), mit OpenCV gegengeprüft.

**Schriften:** Bricolage Grotesque und DM Sans werden von Google Fonts geladen. Ohne Internet fallen sie auf Systemschriften zurück. → Für die `.app` lokal einbinden.

## Spielregeln & Zahlen

**Schlagfertig**
- Bis 12 Spieler: Runde 1 und 2 als Duelle (jeder bekommt 2 Prompts, jeder Prompt geht an 2 Spieler), Runde 3 Finale mit einem Prompt für alle.
- Ab 13 Spieler: jede Runde ein Prompt für alle; Vorrunden parallel auf den Handys (Gruppen à max. 6, jeder stimmt in einer Gruppe ohne eigene Antwort ab), die besten 6 kommen ins Finale auf dem TV. Gruppensieger-Bonus im Finale: 500 × Runde.
- Punkte: 100 pro Spielerstimme, 25 pro Publikumsstimme, jeweils × Rundennummer. „Volltreffer“ (alle Spielerstimmen): +250 × Runde.
- Zeiten: 80 s für zwei Antworten, 55 s für eine, 20 s Duell-Abstimmung, 30 s Finale.

**Bluff**
- 6 Fragen, Multiplikator 1-1-1-2-2-3, Zwischenstand nach Frage 3.
- Wahrheit gefunden: 1000, jeder Reingelegte: 500, Publikum reingelegt: 100 (× Multiplikator).
- Lügen, die (fast) der Wahrheit entsprechen oder doppelt sind, werden abgelehnt. Fehlen Lügen, füllt UP! mit „Haus-Lügen“ auf (mindestens 4 Antworten zur Wahl).
- 28 Fakten pro Sprache, jeweils mit Quelle.

**Kritzelei**
- Bis 5 Spieler 2 Runden, sonst 1. 75 s zum Zeichnen; Zwischenstände werden alle 2 s gespeichert, damit bei Zeitablauf nichts verloren geht.
- Echten Titel finden: 1000, Zeichner: 500 pro Treffer, falscher Titel gewählt: 500.

**Allgemein**
- Zeitdruck: ab 8 s orange, ab 5 s rot mit Pulsieren, Rand-Glühen und Vibration (bei Timern ≤ 12 s: ab 5 / 3 s).
- Wer abstimmt, sieht seine eigene Antwort nicht in der Auswahl.
- Phasen enden früher, sobald alle (verbundenen) Spieler fertig sind.
- Wer zu spät kommt, schaut als Publikum zu und ist in der nächsten Runde dabei.
- Wer in der Lobby länger als 45 s weg ist, wird entfernt. Im Spiel bleibt jeder drin.
- Fotos werden auf 320 × 320 px verkleinert, nur im Arbeitsspeicher gehalten und beim Schließen des Raums gelöscht.

## Offen / nächste Schritte

1. **Fertige `.app` / `.exe`** (Electron oder Tauri, Schriften lokal, Icon). Für Mac idealerweise per GitHub Actions gebaut.
2. **Olympia-Modus** mit Disziplinen (fest/zufällig), Teams (Durchschnittswertung) und Siegerehrung – die Spiele melden ihre Rangliste bereits über `ctx.finish()`.
3. **Import per Drag & Drop**: Content-Packs und Spiele (`.upgame`) direkt in die TV-Ansicht ziehen.
4. **Sounds** und Hintergrundmusik (abschaltbar).
5. Gespielte Inhalte dauerhaft merken (nicht nur pro Raum), Tag-Filter (`familie`, `ab18`) in den Einstellungen.
6. Online-Modus (Docker), direkte KI-Anbindung für neue Inhalte.
