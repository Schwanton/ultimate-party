# UP! – Ultimate Party

Party-Spiele für zu Hause: Ein Bildschirm (Fernseher, Laptop, Beamer) zeigt das Spiel, alle spielen mit ihrem Handy. Keine App nötig – die Handys öffnen einfach eine Webseite im selben WLAN.

**Enthaltene Spiele**

| Spiel | Spieler | Worum es geht |
| --- | --- | --- |
| **Schlagfertig** | 3–100 | Witzige Antworten auf schräge Fragen schreiben, die anderen stimmen ab. Bis 12 Spieler als Duelle, darüber als Turnier. |
| **Bluff** | 3–12 (+ Publikum) | Glaubwürdige Lügen zu kuriosen, wahren Fakten erfinden – und die Wahrheit finden. |
| **Kritzelei** | 3–10 (+ Publikum) | Geheime Begriffe aufs Handy zeichnen, falsche Titel erfinden, den echten finden. |
| **Guess the Clicks!** | 2–100 | Ein zufälliges YouTube-Video läuft – wie viele Aufrufe hat es? Wer am nächsten dran ist, bekommt den Punkt. Braucht einen kostenlosen YouTube-API-Schlüssel (siehe unten). |

Neue Spiele lassen sich mit wenig Code hinzufügen und teilen – siehe [Spiele entwickeln](docs/SPIELE-ENTWICKELN.md).

---

## Spielen (ohne Programmierkenntnisse)

### 1. Einmalig: Node.js installieren

UP! braucht **Node.js ab Version 20** (kostenlos). Lade die **LTS-Version** von [nodejs.org](https://nodejs.org/de/download) herunter und installiere sie wie jedes andere Programm. Ist schon eine ältere Version installiert, einfach drüberinstallieren.

> Später gibt es UP! als fertige `.app` bzw. `.exe` – dann entfällt dieser Schritt.

### 2. UP! herunterladen

Auf GitHub oben auf **Code → Download ZIP** klicken und die ZIP-Datei entpacken.

### 3. Starten

- **Mac:** Doppelklick auf **`UP starten.command`**.
  Beim allerersten Mal meldet macOS evtl. „nicht verifizierter Entwickler“. Dann: **Rechtsklick → Öffnen → Öffnen**.
- **Windows:** Doppelklick auf **`UP starten.bat`**. Bei der Firewall-Frage „Zugriff zulassen“ wählen.

Beim ersten Start werden einmalig die nötigen Bausteine geladen (Internet nötig, ca. 1 Minute). Danach öffnet sich der **TV-Bildschirm** automatisch im Browser.

### Guess the Clicks! einrichten (einmalig)

Für echte, aktuelle Aufrufzahlen nutzt das Spiel die offizielle YouTube-Schnittstelle. Dafür braucht es einen kostenlosen API-Schlüssel:

1. Auf [console.cloud.google.com](https://console.cloud.google.com) mit einem Google-Konto ein Projekt anlegen.
2. Unter **APIs & Dienste → Bibliothek** die **YouTube Data API v3** suchen und aktivieren.
3. Unter **Anmeldedaten → Anmeldedaten erstellen → API-Schlüssel** einen Schlüssel erzeugen.
4. Im UP!-TV auf das **Zahnrad** tippen und den Schlüssel bei „Guess the Clicks!“ einfügen.

Der Schlüssel wird nur auf deinem Rechner gespeichert (`.up-data/secrets.json`) und nie an Handys geschickt. Das kostenlose Kontingent reicht für etwa 12 Spiele pro Tag.

### 4. Mitspielen

- Den TV-Bildschirm auf den Fernseher bringen (HDMI-Kabel oder Bildschirm teilen) oder im Browser des Smart-TVs die angezeigte Adresse mit `/host` öffnen.
- Alle Handys müssen **im selben WLAN** sein (nicht im Gäste-WLAN). Den **QR-Code** scannen oder die Adresse im Handy-Browser eingeben, dann den 4-stelligen **Raumcode**.
- Der erste Spieler ist **VIP** (Krone) und wählt auf seinem Handy das Spiel aus.

**Tipps**

- Das **Zahnrad** auf dem TV (oder die Taste `Esc`) öffnet die Einstellungen: Sprache, eigene Fotos erlauben, mehr Zeit für Antworten, Inhalte (Content-Packs) an- und ausschalten, Spieler entfernen.
- Wer die Verbindung verliert, landet beim Neuladen der Seite automatisch wieder im Spiel.
- Mit dem kleinen **⋯** unten rechts auf dem TV kann man ein laufendes Spiel abbrechen.

---

## Für Entwickler

```bash
npm install
npm run dev        # Entwicklermodus: http://localhost:3000/dev
npm start          # normal starten
npm test           # alle Spiele automatisch mit Bots durchspielen (3 bis 100 Spieler)
npm run new-game mein-spiel   # neues Spiel aus der Vorlage anlegen
npm run check-packs           # Content-Packs prüfen
```

Der **Entwicklermodus** zeigt TV und mehrere simulierte Handys in einem Fenster. Über „+ Bots“ in der TV-Lobby kommen beliebig viele Testspieler dazu. Änderungen an Ansichten erscheinen sofort, Änderungen an der Spiellogik starten den Server neu.

### Aufbau

```
server/     Server: Räume, Verbindungen, Spielablauf
src/        Browser-App: TV-Lobby, Handy-Lobby, Einstellungen, UI-Baukasten (src/ui)
sdk/        Schnittstelle für Spiele (Typen, Hilfsfunktionen, Baustein „Täuschen“)
games/      Ein Ordner pro Spiel (manifest.json, server.ts, client.tsx, i18n/, content/)
scripts/    Tests und Werkzeuge
docs/       Anleitungen
```

Technik: TypeScript, React, Node.js mit WebSockets (`ws`), esbuild. Keine Datenbank, nichts verlässt das lokale Netzwerk.

### Weitere Doku

- [Spiele entwickeln](docs/SPIELE-ENTWICKELN.md) – das Game-SDK Schritt für Schritt
- [Inhalte & Content-Packs](docs/INHALTE.md) – eigene Fragen schreiben oder mit KI erzeugen
- [Entscheidungen & Stand](docs/ENTSCHEIDUNGEN.md) – was wie gelöst ist und was noch kommt

## Lizenz

Code: [MIT](LICENSE). Mitgelieferte Inhalte (Fragen, Begriffe): CC BY 4.0.
UP! ist ein unabhängiges Projekt und steht in keiner Verbindung zu Jackbox Games.

---

### English (short)

UP! is a local party-game platform: one shared screen, everyone plays on their phone in the browser. Run `npm install && npm start` (Node.js ≥ 20), open the TV view that pops up, and join with phones on the same Wi-Fi. Language can be switched between German and English in the lobby. See `docs/` for the game SDK (German).
