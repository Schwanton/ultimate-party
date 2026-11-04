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

**Spannende Auflösungen**
- Schlagfertig: Bei jeder Abstimmung steht 3 Sekunden lang nur die Frage groß auf dem TV (und auf den Handys), dann fliegen die Antworten herein. Die Abstimmzeit beginnt erst danach.
- Guess the Clicks!: Zahlenstrahl auf logarithmischer Skala (10, 100, 1.000 …). Geschwindigkeit = Grundtempo + Abstand zum nächsten Tipp bzw. zur echten Zahl darüber (höchstens 2,4 Zehnerpotenzen/s, nahe der echten Zahl nur noch ca. 0,04). Erreicht die Säule einen Tipp, erscheint der Spieler daneben. Die Skala wächst mit (die Spitze bleibt bei 78 % der Höhe), damit sie die Größenordnung nicht verrät. An der echten Zahl hält die Säule 2,2 s, danach fährt sie weiter bis zum höchsten Tipp darüber (höchstens 9 s) – erst dann wird der Gewinner gezeigt. Bis zur echten Zahl höchstens 20 s Fahrt.
- Schlagfertig: Bei der Auflösung erscheinen die Abstimmenden einzeln und abwechselnd bei den Antworten (höchstens 0,6 s Abstand, insgesamt höchstens ca. 4,5 s; `games/schlagfertig/timing.ts`, vom Server für die Wartezeit mitgenutzt). Der Zeitplan wird in `games/guess-the-clicks/reveal.ts` berechnet und ist auf TV, Handys und Server gleich; die Handys zeigen ihr Ergebnis erst, wenn die Säule angekommen ist.
- Hochstapler: 2,5 s nach „JETZT!“ erscheint die Aufgabe auf dem TV und bleibt während der Abstimmung sichtbar (auch auf den Handys). So kann auch der Hochstapler mitdiskutieren.

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
- Spielmenü: In der TV-Lobby steht unten das gewählte Spiel mit Kurzbeschreibung, Start und Einstellungen. „Spiel wechseln“ öffnet die Bibliothek (4 Spalten, scrollbar, Reiter nach Kategorie aus `tags`, Filter „nur passende für N Spieler“). Auf dem Handy des VIP: Kategorie-Reiter und Kurzbeschreibung je Spiel.
- Mehrheit: eigene Antwort + Tipp auf die Mehrheit. Mehrheit richtig getippt 1000, selbst in der Mehrheit 250, letzte Frage ×2. Gleichstand oben: alle Spitzenantworten zählen. Stimmen erscheinen nacheinander, Zwischenstand alle 4 Fragen.
- Wer war's?: 60 s schreiben (max. 70 Zeichen), je Antwort 18 s raten (Autor rät nicht). Richtig 500, Autor 200 pro Fehltipp, letzte Runde ×2.
- Schätzmeister: Zahlenstrahl wie Guess the Clicks!; Platz 1/2/3 = 1000/600/300, exakt +500, letzte Frage ×2. Gleich nah = gleicher Platz. Antworten nur ganze Zahlen ≥ 0, mit optionaler Einheit und Quelle.
- Verräter-Team: Verräter automatisch ≈ Spieler/5 (mind. 1, höchstens weniger als die Hälfte). Teamgröße nach Lebenden: ≤5 → 2, ≤7 → 3, ≤10 → 4, ≤15 → 5, sonst 6. Eine Sabotage = Mission gescheitert, Karten werden gemischt aufgedeckt. Rauswählen mit Option „Niemanden“; Gleichstand = niemand. Sieg: Loyale bei 0 Verrätern oder 3 erfüllten Missionen; Verräter bei 3 Sabotagen oder Verräter ≥ Loyale. Gewinnerteam 1000 (+500 wenn noch drin), Loyale +250 für eine Stimme gegen einen rausgeworfenen Verräter.
- Eingaben gehen nicht verloren: Texte, Zahlen und Zeichnungen werden als Entwurf laufend übertragen (gebündelt nach 0,6 s, Zeichnungen 0,8 s, auch der gerade gezeichnete Strich), in den letzten Sekunden mehrmals erneut (5 / 3 / 2 / 1 / 0,4 s vorher, 0,3 s danach), beim Wechsel in den Hintergrund und nach einem Verbindungsabbruch. Der Server beendet Eingabephasen 1,5 s nach der angezeigten Zeit (INPUT_GRACE) und nimmt für alle, die nicht abgeschickt haben, den letzten Entwurf. Bei Schätzungen gilt eine danach neu getippte Zahl auch dann, wenn sie nicht erneut abgeschickt wurde. Lügen/Titel, die zu nah an der Wahrheit oder doppelt sind, werden dabei still verworfen.
- Schwarmsinn: Jede Aktion = Figur (Farbe + Form: Kreis, Quadrat, Dreieck, Raute) + Richtung; 1–4 Figuren → 4–16 Aktionen, pro Level nach Richtung gruppiert auf die Spieler verteilt (mehr Spieler als Aktionen: Aktionen doppelt). Pro Figur höchstens ein Schritt alle 140 ms. Wer 5 s getrennt ist, gibt seine Knöpfe an die anderen ab. 20 Level-Rezepte (Figuren, Räume, Bausteine), danach Endlos; Grundriss aus Zufallswert (gleicher Wert = „genau so nochmal“). Generator: Räume im Raster (max. 40 × 22 Felder), Mini-Labyrinthe ohne Sackgassen, Türen nach Schloss-und-Schlüssel-Prinzip (Platten immer vorher erreichbar, Halte-Türen mit Platten auf beiden Seiten und nur grau), Ausgänge/Platten/Starts nur auf Feldern, die keinen Weg versperren; Prüfer: keine Fallen (jede Figur kommt von überall zurück) und Türen-Logik bis zum Ausgang lösbar (`npm run check-levels`). Nebel: Raum wird beim Betreten aufgedeckt; Umriss, Türen und Ausgänge immer sichtbar. Neue Bausteine werden einmal pro Spielrunde erklärt (bei spätem Start alle auf einmal). Sterne nach Zeit: ≤ 50 % → 3, ≤ 75 % → 2, sonst 1. Geschafft: VIP wählt Nächstes/Genau so nochmal/Neu erzeugen/Level wählen/Beenden; Zeit um: alle stimmen ab (Gleichstand = genau so nochmal). Neustart im Level, sobald die Hälfte zustimmt. Kooperativ: alle bekommen dieselben Punkte (100 pro Stern).
- Crash: Kurs wie eine Aktie – zufälliger Verlauf (alle 0,25 s) aus einer Zufallszahl, die TV und Handys mitbekommen (Absturzzeit kennt nur der Server). Trend meist +7,5 bis +13 % pro Sekunde (log), in ca. 12 % der Runden abwärts; Schwankung 17–26 %; ab und zu ein kurzer Einbruch; ab 10× flacht der Trend ab, unter 0,3× federt er zurück. Start-Schub in den ersten Sekunden (ruhiger, kräftiger Anstieg): typisch 1,8× nach 2 s, 2,2× nach 3 s, 3× nach 5 s, 4,7× nach 10 s; nach 10 s liegen nur ca. 4 % unter 1×. Durchschnittlich am meisten bringt Aussteigen nach etwa 15 s. Sound: Herzschlag wird immer schneller (540 ms → 115 ms), ab 3 s Hi-Hat, ab 6 s steigender Bass, ab 11 s hohe Melodie, die immer höher klettert; beim Fallen zusätzlich schiefes Dröhnen. Frühester Absturz pro Partie zufällig 2–6 s (für die Partie fest), danach Exponentialverteilung (Mittel 10,5 s), dann fällt die Linie senkrecht auf 0. Länger drinbleiben lohnt sich im Schnitt. Fallender Kurs: rote Linie, roter Rand, Zittern, tiefer Warnton, Handy brummt. Einsatz: Pro Runde 100 gratis im Topf, im 5-s-Countdown kann jeder +0/10/25/100 % seines Geldes dazulegen (Standard +0 %). Ausgezahlt wird nach Serverzeit beim Eingang des Knopfdrucks: Topf × Kurs (letzte Runde × 2); beim Crash ist der Topf weg, also auch der Einsatz. Geld bleibt bis zur Auszählung geheim. Modi: sichtbar (Standard), halbgeheim (nur „Jemand ist ausgestiegen!“, Anzahl noch drin bzw. erwischt), geheim (gar nichts; Runde endet dann auch nicht früher, wenn alle raus sind). Auszählung am Ende: links Balken pro Spieler, rechts pro Runde: Balken füllt sich bis zum besten 100er-Gewinn (Spieler ploppen bei ihrem Betrag auf), dann kommt bei jedem das Einsatz-Ergebnis der Runde dazu (mit Einsatz in % und Ausstiegs-Kurs; Marker wandert, Skala wächst mit, auch negativ), danach fließen die Beträge nacheinander (größte zuerst) als fliegende Zahlen in die Balken links. Hat es alle erwischt: Balken sofort grau („ALLE WEG“) mit Fehlerton, Runde kürzer. Tempo: ca. 4,3 s pro Runde. Steigen alle aus, wird 1,5 s später gezeigt, wann es gekracht hätte; werden alle erwischt, geht es nach 2 s weiter (sonst 6 s). Kein Zwischenstand: jeder sieht nur seine eigenen Punkte, die Rangliste kommt erst am Ende.
- Heiße Kartoffel: geheime Zündschnur 14–30 s (+6 s ab 9 Spielern), Ticken wird mit der Zeit schneller (verrät die Zündschnur nicht). Aufgaben: Form+Farbe finden, 1–4 der Reihe nach, Plus-Aufgabe, x-mal tippen; falsch = 1,2 s Sperre. Nicht direkt zurückwerfen (ab 3 Spielern). Leben 1–3. Jede überlebte Explosion +100, Sieg +500. Wer noch lebt und explodiert ist, beginnt die nächste Runde.
- Sumo: Server-Physik mit 30 Hz, Positionen per ctx.stream an den TV. Beschleunigung 1500, Höchsttempo 360 (Rammen 2,4×, Masse 2,6× für 0,25 s, Abklingzeit 2,2 s). Plattform schrumpft ab 8 s bis 50 s auf 35 %, Runde max. 75 s. Runterschubsen zählt für den, der in den letzten 2,5 s angestoßen hat. Bots werden auf dem Server gesteuert.
- Kartenstapel (Begriff für die ganze Plattform): Begriffe, Fragen und Fakten werden wie Karten gezogen. Ein Stapel gehört zu Spiel + Sprache und enthält alle Karten der aktivierten Packs. Gezogene Karten werden auf dem Rechner gespeichert (`.up-data/decks.json`) und kommen erst wieder, wenn der Stapel leer ist; dann wird er aufgefüllt (ohne die Karten des laufenden Spiels). Gezogen = gesehen: Auch Begriffe, die bei Montagsmaler zur Wahl standen, aber nicht genommen wurden, sind verbraucht. In den Einstellungen steht pro Spiel „noch X von Y“ mit „Neu mischen“. Tests verbrauchen den Stapel nicht. Genutzt von Schlagfertig, Kritzelei, Bluff, Mehrheit, Wer war's?, Schätzmeister, Hochstapler und Montagsmaler.
- Montagsmaler: Punkte Raten = Höchstpunkte × (0,35 + 0,65 × Restzeit), Erste +100; Maler = Höchstpunkte × 0,8 × Anteil der Richtigen (leicht/mittel/schwer = 600/800/1000). Team: erstes richtiges Wort beendet die Runde, Team bekommt Höchstpunkte × (0,4 + 0,6 × Restzeit); Klau = halbe Höchstpunkte. Hinweise nach 50 % und 75 % der Zeit. Kein Schummel-Knopf (Hinweis „keine Buchstaben“ reicht). Emotes (😂 🤯 😍 👏 🚮) bis zu 10 pro Sekunde und Person, TV bekommt sie gebündelt alle 0,12 s. Raten-Bildschirm: Bild so groß wie möglich, Maler*in und eigene Tipps liegen über dem Bild, Emotes bei offener Tastatur als Spalte daneben. Am Ende Galerie auf TV und allen Handys; Herzen (eins pro Person und Bild) sortieren die Galerie live; Bilder als PNG (1080 × 1270), Teilen öffnet das Teilen-Menü des Handys (PNG wird vorher erzeugt, sonst blockiert das iPhone), sonst Speichern.

- Kronenduell (seit 0.9.0): eigenes Spiel nach den Regeln von Regicide: Crown Duels (Badgers from Mars), Hinweis im Spiel. Genau 2 Spieler (später Computer-Gegner und „Stand Aside“ als Option). Farben: ♣ Schwert, ♠ Schild, ♥ Trank, ♦ Kristall; Ass = 1; Bube/Dame/König = Avatar-Tier mit Diadem/Tiara/Krone. Aufbau wie am Tisch: oben Zauber, links Verteidigung, Mitte Figur, rechts Angriff, unten Korruption; auf dem TV Gegner oben gespiegelt, eigene Seite unten. Kein Zeitlimit. Handy: Karte antippen, dann Zone = geplant; beliebig viele planen (auch wenn der Gegner dran ist), „Karte legen“ nur wenn man dran ist und genau eine geplant ist; gelegt ist gelegt. Auflösung Schritt für Schritt auf dem TV (Aktionsliste, Schritte mit eigener Dauer, Phasen-Banner), am Ende der ganzen Runde drücken beide einmal „Weiter“ (seit 0.9.1). Aufdecken: Nur schon liegende ♣/♠ über der kleinsten neu aufgedeckten fliegen raus, neu gelegte nie. Übrige Handkarte(n) werden wie im Regelheft abgeworfen. Jede Zone hat beim Legen einen eigenen Klang (Angriff Klinge, Verteidigung Holz, Zauber Glitzern, Korruption Saugen); Karten-IDs sind pro Partie zufällig. Spickzettel vor dem ersten Spiel und jederzeit auf dem Handy. Umsetzung: Wer mehr Karten hat, legt, bis beide gleich viele haben, dann abwechselnd; bei Gleichstand zu Rundenbeginn wechselt der Narr (🃏) und dessen Besitzer beginnt und löst zuerst auf. Treffer nur bei Stärke > Block. Absaugen zieht vom Stapel, ist er leer, wird die Ablage neu gemischt. Fallen beide Könige in derselben Runde: unentschieden. Testspieler legen zufällig (mit Vorliebe Schwert → Angriff, Schild → Verteidigung). Neues Etikett „Duell zu zweit“ in der Spielsammlung.

- Abgrund (seit 0.10.0, Prototyp Etappe 1): kooperatives Deckbau-Roguelike. 1–12 Spieler, Klassen dürfen mehrfach gewählt werden, Nachzügler schauen zu. Eigenes Lager nach der Lobby (Klasse per Wischen, VIP startet oder setzt fort). Gleichzeitig planen, Pläne der anderen unsichtbar; optionaler Planungs-Timer 60/90 s (Standard aus). Bereit lässt sich zurücknehmen. Auflösung: schnell → normal → langsam (Unterstützung zuerst, Treffer pro Gegner gebündelt als „4 + 6 + 3 = 13“), dann Gegner, dann Rundenende (Gift, Dauer −1, Block weg, Hand auf Ablage). Zustände: Gift, Schwächung −25 %, Verwundbar +50 %, Markierung, Betäubung. Lebenspunkte: Schildwacht 80, Klingenläufer 65, Kräuterkundige 60. Energie 3, 5 Karten ziehen, Hand max. 10. Gegnerziele zufällig, nie zweimal hintereinander dasselbe. Gegner: Skelett 24 LP (Hieb 8, Hieb 8, Schild hoch Block 8 + 5), Schlundhund 20 LP (Biss 6×2, Zerfleischen 9 + Verwundbar), Aschenkultist 30 LP (Ascheregen schwächt alle, Feuerzunge 11, Glutritual +3), Elite Knochenkoloss 70 LP (Zermalmen 16, Knochensturm 7 auf alle, Sammeln Block 12 + 3). Kämpfe: Skelett + Schlundhund, Aschenkultist + Skelett, Skelett + Knochenkoloss. Skalierung: Gegner-LP × 0,75 allein bzw. × (0,8 + 0,6 × (N − 1)), Schaden × 0,85 allein bzw. × (1 + 0,06 × (N − 2)), zusätzlich min(5, ⌊(N − 1)/2⌋) Gegner (Skelett/Schlundhund abwechselnd), LP auf alle Gegner verteilt. Belohnung nach jedem Kampf: 3 Karten der eigenen Klasse (normal 70/25/5 % gewöhnlich/selten/episch, Elite 50/40/10) oder keine. Einer fällt = Run verloren. Gespeichert wird nach jedem Kampf (`ctx.store`), „Run fortsetzen“ nur bei gleicher Spielerzahl. Punkte = gewonnene Kämpfe. Bots: heilen bei wenig LP, blocken bei ≥ 6 Schaden, greifen sonst den schwächsten Gegner an (rechnen geplanten Schaden der anderen mit). Optik: Papiertheater (radierte Figuren mit Papierrand, Hintergrund oben hell, unten abgedunkelt, bronzene Trennlinie), Schriften IM Fell English + Crimson Pro (vorerst von Google Fonts), Karten auf dem Handy im Tarot-Stil, Energie als Kerzen. Bilder erzeugt mit `Bilder erzeugen.command` (OpenAI-Bild-API, Bildliste `games/abgrund/bilder/auftrag.json`).

- Spiel-Dateien: Unter `/game/<spiel>/bilder|schriften|klaenge/<datei>` liefert der Server Dateien aus dem Spielordner aus (webp, png, jpg, svg, woff2, mp3, ogg …).

- Neustart/Update: Der Raum (Code, Schlüssel des Fernsehers, Sprache, Einstellungen) wird in `.up-data/rooms.json` gemerkt (die letzten 10). Meldet sich der Fernseher nach einem Neustart mit altem Code und Schlüssel, gibt es den Raum mit genau diesem Code wieder. Handys merken sich Name und Tier und treten dann automatisch wieder bei (bis ca. 16 s Wartezeit auf den Fernseher). Fotos und laufende Spiele gehen beim Neustart verloren.

## Offen / nächste Schritte

1. **Fertige `.app` / `.exe`** (Electron oder Tauri, Schriften lokal, Icon). Für Mac idealerweise per GitHub Actions gebaut.
2. **Olympia-Modus** mit Disziplinen (fest/zufällig), Teams (Durchschnittswertung) und Siegerehrung – die Spiele melden ihre Rangliste bereits über `ctx.finish()`.
3. **Import per Drag & Drop**: Content-Packs und Spiele (`.upgame`) direkt in die TV-Ansicht ziehen.
5. Tag-Filter (`familie`, `ab18`) in den Einstellungen.
6. Online-Modus (Docker), direkte KI-Anbindung für neue Inhalte.
