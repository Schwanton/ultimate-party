# Entscheidungen & Stand

Dieses Dokument hält fest, was beim Bauen entschieden wurde (ohne Rückfrage) und was noch fehlt. Alles hier kann geändert werden.

## Stand

| Meilenstein | Status |
| --- | --- |
| 1 · Fundament: Server, Räume, QR-Code, Lobby, Wiederverbinden, Sprachen DE/EN, Tier-Avatare und Fotos | fertig |
| 2 · Game-SDK, UI-Baukasten, Entwicklermodus mit Bots, Spielvorlage, automatische Tests | fertig |
| 3 · Schlagfertig, Bluff, Kritzelei mit Basis-Packs DE/EN | fertig |
| Zusatz · Guess the Clicks! (YouTube-Aufrufe schätzen) | fertig |
| Zusatz · Hochstapler (à la „Fakin' It“) | fertig |
| 4 · Sounds, Spiel-Einstellungen, Updater | fertig |
| 4 · Olympia-Modus, Teams, Pack-Import per Drag & Drop, Spiele-Import | offen |
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

**Guess the Clicks!**
- 8 Videos, 40 s zum Tippen, Zwischenstand nach Video 4. Wenn alle getippt haben: noch 5 s zum Umentscheiden.
- Wer mit der absoluten Differenz am nächsten dran ist, bekommt 1 Punkt; bei Gleichstand alle Gleichnahen. Publikum darf mittippen, bekommt aber keine Punkte.
- Zufällige Videos: Ein gleichverteiltes Zufallsvideo gibt die YouTube-API nicht her. Pro Runde wird zufällig eine von vier Strategien gewählt: (1) zufälliges 5-Zeichen-Präfix aus dem Video-ID-Alphabet, angelehnt an die Methode „Dialing for Videos“ (UMass Amherst, 2023) – echte Präfix-Treffer werden bevorzugt; (2) Alltagswort + zufälliges 30-Tage-Fenster zwischen 2006 und heute; (3) Kamera-Dateiname („IMG 4821“) + zufälliges Jahr; (4) Thema aus dem Content-Pack. Außerdem wird eine Ziel-Größenordnung (10 bis 1 Mrd. Aufrufe, gleichverteilt auf der Log-Skala) gewürfelt und ein Video nahe daran gewählt. Nur öffentliche, einbettbare Videos ab 5 s, SafeSearch „streng“, keine Livestreams.
- Ton: Videos laufen mit Ton (Lautstärke 70 %). Blockiert der Browser das (Autoplay-Regel), läuft das Video stumm weiter und ein Klick oder Tastendruck auf dem TV schaltet den Ton ein.
- Fehlt der API-Schlüssel oder ist er ungültig, zeigt der TV eine Anleitung mit Eingabefeld und QR-Code zur Google-Seite; dasselbe Feld gibt es auf allen Handys. Nach dem Speichern wird der Schlüssel geprüft und das Spiel startet direkt.
- Kontingent: ca. 101 von 10.000 Einheiten pro Video → rund 12 Spiele pro Tag mit einem kostenlosen Schlüssel.
- Neu in der Plattform: Spiele können im Manifest „secrets“ (z. B. API-Schlüssel) anfordern. Der Host trägt sie in den Einstellungen ein; gespeichert in `.up-data/secrets.json`, nur der Server liest sie (`ctx.secret()`).

**Hochstapler** (nach dem Prinzip von „Fakin' It“, eigene Umsetzung und Texte)
- Drei Modi: Hand heben (gelb), Finger zeigen (cyan), auf jemanden zeigen (grün) – jeweils mit eigener Farbe und Piktogramm. „Gesicht ziehen“ und „Aufschreiben“ wurden nach dem ersten Test entfernt.
- Einstellung „Spielmodus“: alle drei abwechselnd (Standard), zufällig oder nur einer. Runden: automatisch (= Spielerzahl, höchstens 5) oder 3/5/7/10.
- Der Hochstapler sieht Kategorie, eine konkrete Anleitung („Beim JETZT! heben alle die Hand – oder nicht …“) und drei Schritte. Sein Handy hat dieselbe Farbe und dasselbe Piktogramm wie die der anderen, damit ihn niemand per Blick aufs Handy enttarnt.
- Ablauf pro Aufgabe: 7 s lesen → 3-2-1 → „JETZT!“ (7 s halten, Handy vibriert) → 45 s diskutieren und abstimmen (wenn alle gewählt haben: noch 5 s).
- Mehr als die Hälfte auf dieselbe Person = Anklage. Erwischt: jeder Richtige bekommt 1000 / 750 / 500 (Aufgabe 1/2/3), der Hochstapler 250 pro überstandener Aufgabe. Unschuldigen angeklagt oder 3 Aufgaben ohne Mehrheit: Hochstapler +2000.
- 45 Aufgaben pro Sprache (15 je Modus).

**Spiel-Einstellungen**
- Jedes Spiel kann im Manifest `options` anbieten. Sie stehen in der TV-Lobby unter „Spiel-Einstellungen“ und beim VIP auf dem Handy; gelten pro Raum.
- Schlagfertig: Runden 2–6 (letzte = Finale, ×3), Antwortzeit kurz/normal/lang. Bluff: 3–12 Fragen (zweite Hälfte ×2, letzte ×3), Zeit für Lügen. Kritzelei: Runden automatisch/1–3, Zeichenzeit 45 s/75 s/2 Min. Guess the Clicks!: 3–20 Videos, Tippzeit 20–90 s. Hochstapler: Modus und Runden.

**Guess the Clicks! – „Video länger“**
- Jeder Spieler kann während des Tippens „Video länger ansehen?“ antippen. Sobald mindestens die Hälfte der verbundenen Spieler dafür ist, kommt die volle Tippzeit noch einmal obendrauf (Zeit verdoppelt). Danach wird neu gezählt – beliebig oft.

**Raumcode im Spiel**
- Unten links (im Randbereich der Bühne, ohne Spielinhalte zu verdecken) stehen während jedes Spiels Raumcode und ein kleiner QR-Code. Nachzügler werden Publikum bzw. sind in der nächsten Runde dabei.

**Updater**
- Version steht in `package.json` („version“). Beim Start und alle 30 Minuten prüft UP! auf GitHub (`raw.githubusercontent.com`), ob es eine neuere gibt; dann erscheint in der TV-Lobby ein grüner Hinweis mit den Neuerungen aus `CHANGELOG.md`.
- „Jetzt aktualisieren“ lädt das ZIP von GitHub, entpackt es (mit `tar`, auf macOS und Windows 10+ eingebaut) und überschreibt die Programmdateien. Unangetastet bleiben `.up-data/` (Einstellungen, API-Schlüssel), `node_modules/`, eigene Spiele und eigene Content-Packs. Haben sich Pakete geändert, wird `npm install` ausgeführt.
- Danach beendet sich UP!, und das Startskript startet es automatisch neu (Datei `.up-data/restart`). Der TV lädt sich selbst neu; Handys müssen neu beitreten. Updates sind nur in der Lobby möglich.
- Git-Checkouts (Entwickler) werden nicht automatisch aktualisiert, sondern bekommen den Hinweis „git pull“.
- Wichtig für jede neue Version: `version` in `package.json` erhöhen und einen Abschnitt in `CHANGELOG.md` ergänzen.

**Sounds**
- Alle Sounds und die Lobby-Musik werden live im Browser erzeugt (Web Audio) – keine Audiodateien, keine Lizenzfragen, funktioniert offline.
- Nur der TV spielt Sounds; Handys vibrieren nur. Lautstärke für Effekte und Lobby-Musik im Zahnrad-Menü, gespeichert pro Gerät.
- Automatisch für alle Spiele: Lobby-Musik, Klang bei neuen Spielern, „Wusch“ bei jedem Bildschirmwechsel, Ticken in den letzten 8 Sekunden (schneller und höher in den letzten 5), Signal bei Zeitablauf, Jubel bei Konfetti, Trommelwirbel und Fanfare bei Zwischenstand und Siegerehrung.
- Pro Spiel: Schlagfertig (Enthüllung, Stempel beim Sieger, Fanfare bei Volltreffer), Bluff & Kritzelei (Aufdecken, „Ding“ bei der Wahrheit, Stempel bei Lügen), Hochstapler (Piepen bei 3-2-1, Signal bei „JETZT!“, Fanfare wenn erwischt, schleichende Melodie wenn entkommen).
- Guess the Clicks!: keine automatischen Sounds (der Video-Ton läuft), nur ein 3-Sekunden-Countdown mit Piepen vor jeder Runde. Spiele schalten die automatischen Sounds mit `"autoSounds": false` im Manifest ab.
- Browser erlauben Ton erst nach einem Klick auf die Seite. Solange das nicht passiert ist, zeigt die TV-Lobby einen Knopf „Ton an“.

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
5. Gespielte Inhalte dauerhaft merken (nicht nur pro Raum), Tag-Filter (`familie`, `ab18`) in den Einstellungen.
6. Online-Modus (Docker), direkte KI-Anbindung für neue Inhalte.
