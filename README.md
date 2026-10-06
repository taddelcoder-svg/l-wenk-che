# Löwenküche

Koch-Roguelite im Browser (angelehnt an PlateUp!, mit eigenen Tier-Köchen): Tagsüber Gäste bedienen,
nachts die Küche umbauen und einkaufen, 15 Tage bis zum Kultrestaurant.

- **Solo:** läuft komplett im Browser.
- **Koop:** bis zu 4 Köche in einer Küche, Raum mit 4-stelligem Code oder Einladungslink `/?raum=CODE`.
  Der Server rechnet das Spiel, die Browser bewegen ihre Figur sofort selbst und melden die Position.
- **Olympiade:** Disziplin der Swimming-Lions-Olympiade (Ticket-Link `?olymp=…`). Jeder kocht in seiner
  eigenen Küche mit demselben Ansturm (Seed aus der Lauf-Kennung), gewertet wird das Verdiente.
  Einstellungen: `menu` (`einfach` | `mittel` | `voll`) und `dauer` (180 | 240 | 300 Sekunden).

## Starten

```
npm install
npm start          # http://localhost:10900
npm test           # Regeln (logik) und Räume
```

Ohne `ZUGANG_PASSWORT` ist lokal alles offen; auf Render bleibt die Seite gesperrt, bis es gesetzt ist.

## Aufbau

- `js/logik.js` – alle Regeln (UMD, im Browser und auf dem Server gleich): Raster 14 × 12 mit Wänden,
  Geräte, Zutaten, Rezepte, Gäste mit Wegsuche, Tag/Nacht, Laden, Karten, `sicht()` für Anzeige und Netz.
- `raeume.js` – Koop-Räume und Olympia-Gruppen, 20 Hz Takt, 10 Hz Sicht an die Browser.
- `server.js` – Auslieferung, Passwort-Tor (`zugang.js`), WebSocket `/ws`.
- `js/modelle.js` – alle 3D-Modelle aus Grundformen (three.js r128, selbst ausgeliefert).
- `js/spiel.js` – Darstellung, Eingabe (Tastatur, Gamepad, Touch), Menüs, Netz.
- `olymp.js` und `zugang.js` sind die Vorlagen aus `olympiade/geteilt/`; bei Änderungen dort hierher kopieren.

Debug im Browser: `loewenkueche.sim(sek)` rechnet den Solo-Lauf weiter, `loewenkueche.sicht` zeigt den Zustand.
