# Änderungen

Neue Versionen werden in der TV-Lobby angezeigt und lassen sich mit einem Klick installieren.

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
