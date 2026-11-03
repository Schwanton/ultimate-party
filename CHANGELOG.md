# Änderungen

Neue Versionen werden in der TV-Lobby angezeigt und lassen sich mit einem Klick installieren.

## 0.8.7

- Handy des VIP: „Los geht's!“ und die Spiel-Einstellungen stehen jetzt über der Spielsammlung
- Crash-Auszählung: schneller, bei jedem Einsatz steht der Prozentsatz und der Kurs beim Aussteigen, die Beträge fliegen nacheinander in die Balken links, und wenn es alle erwischt hat, ist der Balken sofort grau mit Fehlerton

## 0.8.6

- Nach einem Update oder Neustart bleibt der Raumcode gleich – und die Handys treten automatisch wieder bei
- Crash: In der Auszählung kommen die Einsätze jetzt in jeder Runde dazu – erst die 100er, dann bei jedem sein Einsatz, dann geht's in die Balken

## 0.8.5

- Crash: Einsätze – vor jeder Runde kann man +10 %, +25 % oder +100 % seines Geldes zu den 100 Gratis-Punkten in den Topf legen. Wer crasht, verliert den Einsatz
- Crash: Spannende Auszählung am Ende – Runde für Runde, und zum Schluss die Einsätze vom Letzten zum Ersten
- Crash: Neue Modi „halbgeheim“ (man sieht nur, wie viele noch drin sind) und „geheim“
- Crash: Frühester Absturz ist pro Partie zufällig zwischen 2 und 6 Sekunden

## 0.8.4

- Crash: Am Anfang steigt der Kurs fast immer schnell (ca. 2× nach 3 Sekunden) – Runden unter 1× sind jetzt selten
- Crash: Die Musik wird immer dramatischer: schnellerer Herzschlag, dann Hi-Hat, steigender Bass und eine immer höhere Melodie; beim Fallen ein bedrohliches Dröhnen

## 0.8.3

- Crash: Der Kurs verläuft jetzt wie eine Aktie – meist aufwärts, aber mit Rücksetzern, Einbrüchen und seltenen Runden, in denen es bergab geht. Fällt der Kurs, wird es rot, wackelt und brummt
- Crash: Beim Absturz fällt die Linie senkrecht auf null
- Crash: Werden alle erwischt, geht die nächste Runde sofort los
- Crash: Kein Zwischenstand mehr – jeder sieht nur seine eigenen Punkte, die Rangliste gibt es erst am Ende

## 0.8.2

- Montagsmaler: Beim Raten bleibt das Bild auch mit offener Tastatur groß – Maler*in und eigene Tipps liegen jetzt klein über dem Bild, weniger Abstände, Emotes daneben
- Montagsmaler: Schummel-Knopf entfernt
- Montagsmaler: Emotes bis zu 10× pro Sekunde – Spam erlaubt
- Montagsmaler: Herzen für Bilder in der Galerie, die Galerie sortiert sich danach; Teilen-Knopf öffnet direkt das Teilen-Menü (z. B. auf dem iPhone), „Alle teilen“ für alle Bilder auf einmal
- Einstellungen: „Nach Updates suchen“ mit aktueller Version und Installieren-Knopf

## 0.8.1

- Neu: Kartenstapel – Begriffe und Fragen werden wie Karten gezogen und kommen erst wieder, wenn alle einmal dran waren, auch über mehrere Spiele und Abende. In den Einstellungen: „noch X von Y“ und „Neu mischen“
- Montagsmaler: Beim Tippen scrollt der Bildschirm nicht mehr weg, das Eingabefeld sitzt direkt unter der Zeichnung
- Montagsmaler: Emote-Leiste (😂 🤯 😍 👏 🚮) – fliegt auf dem Fernseher übers Bild, mit leisem Plopp
- Montagsmaler: Am Ende alle Bilder auf dem Handy ansehen, als Bild speichern und teilen

## 0.8.0

- Neues Spiel: Montagsmaler – einer malt live, alle anderen raten per Handy (2–100 Spieler)
  - Zeichnung live auf dem Fernseher und auf allen Handys
  - Wortwahl leicht / mittel / schwer, Buchstaben-Hilfe, „ganz knapp!“-Hinweis, Schummel-Knopf
  - Optional zwei Teams mit 15-Sekunden-Klau-Versuch
  - Galerie aller Bilder am Ende; später Dazukommende malen und raten voll mit
  - 316 Begriffe pro Sprache
- Vollbild-Knopf auf dem Fernseher (Lobby und während des Spiels) und auf dem Handy (wo der Browser es kann)
- Live-Daten können jetzt auch an die Handys gehen (ctx.stream mit phones: true)

## 0.7.1

- Deutlich mehr Inhalte (neues Paket „Extra“, Deutsch und Englisch):
  - Schlagfertig: +119 Fragen (jetzt 199)
  - Kritzelei: +110 Zeichen-Aufgaben (jetzt 180)
  - Wer war's?: +60 Fragen (jetzt 100)
  - Bluff: +30 wahre Fakten mit Quelle (jetzt 58)
- Die Pakete lassen sich in den Einstellungen einzeln abschalten

## 0.7.0

- Neues Spiel: Crash – rechtzeitig aussteigen, bevor der Multiplikator abstürzt (2–100 Spieler)
- Neues Spiel: Heiße Kartoffel – Bombe mit geheimer Zündschnur, Mini-Aufgaben, wer sie beim Knall hält, fliegt raus (3–20 Spieler)
- Neues Spiel: Sumo – Echtzeit-Rempeln auf einer schrumpfenden Plattform mit dem Handy als Joystick (2–100 Spieler)
- Live-Kanal für Echtzeit-Spiele (ctx.stream / useStream)

## 0.6.0

- Neues Spiel: Schwarmsinn – gemeinsam bis zu vier Figuren durch ein Labyrinth im Nebel steuern, jeder hat nur ein paar Knöpfe (1–100 Spieler)
- 20 Level mit Erklärung neuer Bausteine (Halte- und Schalter-Platten, farbige Türen, Eis, Lava, Teleporter, Einbahnfelder, Laterne, Schlüssel, Geist, Tausch, Richtungs-Chaos) plus Endlos-Modus
- Jedes Level wird neu erzeugt und automatisch auf Lösbarkeit geprüft; nach einem Level „genau so nochmal“ oder „neu erzeugen“
- Eigene Hintergrundmusik und Klänge für Spiele (sfx.custom, sfx.startMusic)
- Neue Kategorie „Teamwork“ im Spielmenü

## 0.5.1

- Eingaben gehen nicht mehr verloren: Zeichnungen, Texte und Schätzungen werden laufend übertragen – auch ohne „Abschicken“ zählt bei Zeitablauf der letzte Stand
- In den letzten Sekunden wird der Stand mehrmals erneut gesendet, nach einem Verbindungsabbruch automatisch noch einmal
- Kritzelei: Auch ein Strich, der beim Zeitablauf noch gezeichnet wird, kommt mit; „Zurück“ + neu zeichnen wird jetzt richtig übernommen
- Kurze Nachfrist auf dem Server, damit verspätete Nachrichten noch ankommen

## 0.5.0

- Neues Spielmenü: gewähltes Spiel mit Kurzbeschreibung in der Lobby, Bibliothek mit Kategorien und Filter für die Spielerzahl
- Neues Spiel: Mehrheit – wähle deine Antwort und tippe, was die Mehrheit wählt (3–100 Spieler)
- Neues Spiel: Wer war's? – anonyme Antworten, ratet, wer was geschrieben hat (3–10 Spieler)
- Neues Spiel: Schätzmeister – Schätzfragen mit Zahlenstrahl-Auflösung (2–100 Spieler)
- Neues Spiel: Verräter-Team – heimliche Verräter, Missionen und Rauswählen (5–30 Spieler)

## 0.4.1

- Guess the Clicks!: Die Skala wächst mit der Säule mit und verrät nicht mehr, wie hoch es geht
- Guess the Clicks!: Nach der echten Zahl fährt die Säule weiter bis zu den höheren Tipps – erst dann steht der Gewinner fest
- Schlagfertig: Die Abstimmenden erscheinen nacheinander, abwechselnd bei beiden Antworten

## 0.4.0

- Guess the Clicks!: neue Auflösung als Zahlenstrahl – die Säule fährt hoch, wird nahe an Tipps und der echten Zahl langsamer, und jeder Tipp erscheint mit Bild, sobald er erreicht ist
- Schlagfertig: bei der Abstimmung erscheint zuerst die Frage, kurz danach die Antworten
- Hochstapler: kurz nach „JETZT!“ wird die Aufgabe für alle eingeblendet und bleibt während der Diskussion sichtbar

## 0.3.1

- Updater: TV und Handys laden nach einem Update automatisch die neue Version
- Updater: verständlichere Fehlermeldung ohne Internet

## 0.3.0

- Updater: neue Versionen direkt in der Lobby installieren
- Spiel-Einstellungen in der Lobby (Rundenanzahl, Zeiten, Modus)
- Raumcode und QR-Code während des Spiels unten links
- Hochstapler: nur noch Hand heben, Finger zeigen und Zeigen – mit Farben, Piktogrammen und klarerer Hochstapler-Ansicht
- Guess the Clicks!: Abstimmung „Video länger ansehen“
- Weißer Auswahlrahmen wird nicht mehr abgeschnitten

## 0.2.0

- Sounds und Lobby-Musik
- Neue Spiele: Guess the Clicks! und Hochstapler

## 0.1.0

- Erste Version mit Schlagfertig, Bluff und Kritzelei
