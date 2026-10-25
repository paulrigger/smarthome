# Smarthome App – Projektkontext für Claude

Ziel: Grafana ablösen durch eine eigene PWA (Handy + Bildschirm) mit eigener API.
Sprache im Code: Englisch. Kommunikation mit Paul: Deutsch, knapp, technisch.

## Architektur
```
Sensoren → MQTT / Modbus / APIs → Node-RED → InfluxDB 2.x (bucket "smarthome", org "paul")
                                      │ MQTT        │ Flux/InfluxQL (read-only token)
                                      ▼             ▼
                              apps/api (TypeScript, Docker auf dem Pi)
                                      │ REST + SSE, liefert auch das Frontend aus
                                      ▼
                              apps/web (PWA)   [später auch E-Ink + iOS-Widget]
```

## Repo-Struktur & Commands
- `packages/shared` – API-Vertrag (Typen) + Mock-Daten. Änderungen am Vertrag zuerst hier.
- `apps/api` – Fastify, Port 8090. `src/domain/registry.ts` = welche Influx-Serien, `src/domain/energy.ts` = Bilanz/KPIs (rein, getestet), `src/sources/influx.ts` = Flux.
- `apps/web` – React + Vite PWA, HashRouter. Module in `App.tsx` (NAV + Route), Hausgrafik `components/EnergyFlow.tsx`.
- `npm test` · `npm run build` · `npm run dev:mock` (ohne Heimnetz) · Vorschau: `npm run build:preview -w apps/web`
- Ohne `INFLUX_TOKEN` oder mit `MOCK=1` liefert die API Demo-Daten.

## API
- `GET /api/live` · `GET /api/stream` (SSE) – Momentanwerte. Quelle: MQTT (`sources/mqtt.ts`, Mapping in `domain/mqttLive.ts`, Topics in `docs/mqtt-topics.md`), Influx `last()` nur als Startwert und für Solarthermie/Raumklima/`car.home`. `MQTT=0` → nur Influx.
- `GET /api/summary?period=day|month|year&date=YYYY-MM-DD` – Energiebilanz des Zeitraums (lokal Europe/Vienna)
- `GET /api/series?kind=energy|gauge&keys=a,b&period=…&date=…` – Diagramme
  - energy: kWh je Stunde/Tag/Monat (Flux `aggregateWindow(last)` + `difference`, lokale Fenster via `option location`)
  - gauge: Mittelwerte je 5 min/1 h/1 Tag; abgeleitete Keys: `pv`, `house`, `rest`, `pv.power`, `house.power`
- `GET /api/allocation?period=…&date=…` – Herkunft (PV direkt/Akku/Netz) von WP-, Wallbox- und Reststrom, je Bucket + Ladevorgänge
- `GET /api/yield?period=…&date=…` – Ertrag je Anlage mit Rangfolge (PV Dach → PV Carport → Akku), je Bucket
- `GET /api/assets` – Inbetriebnahme PV Carport/Akku (erster Messwert)
- `GET /api/tariffs` · `PUT /api/tariffs` (ganze Liste, validiert) – Tarife in SQLite (`node:sqlite`, `DATA_DIR/smarthome.db`, Docker-Volume `smarthome-data`)
- `GET /api/costs?period=…&date=…` – Kosten/Erlöse je Intervall: Bezug, Einspeisung, Netzanteil × Preis je Verbraucher, Ersparnis, Anlagenwert Carport/Akku
- `GET /api/thresholds` · `PUT /api/thresholds` – Schwellen aus/Standby/an je Gerät (Defaults + Abweichungen in SQLite-Tabelle `settings`)
- Energie je Fenster: Flux liefert Zählerstände (`aggregateWindow(last)`, Werte ≤ 0 raus), Differenz robust in `domain/counter.ts`
  (Einbrüche ignorieren, Sprünge > MAX_KW × Zeit seit letzter Änderung ignorieren, Nachholsprung nach hängendem Ausleser zählt).
  Anlass: Smart-Meter-Glitches 2025 (Intervalle mit 10.000+ kWh). Intervall-Summen = `summary` (last − first).
- Zeitlogik (Grenzen, DST, Buckets) zentral in `packages/shared/src/time.ts`; Mock (`mock.ts`) ist deterministisch je Datum.

## Deploy-Weg (keine manuellen Updates)
- Push auf `main` → GitHub Actions: Tests, Build, Docker-Build → bei Erfolg Force-Push auf Branch **`deploy`**
- Pi: systemd-Timer `smarthome-sync` (alle 5 min) → `deploy/pi/sync.sh`: Branch `deploy` holen, bei neuem Stand `docker compose up -d --build` (Build auf dem Pi, keine Registry)
- App läuft auf dem Pi unter http://<pi>:8090
- Pi pusht Diagnose in Branch **`pi-status`** (status.md, Influx-Inventur, App-Logs, Sync-Journal).
  → Remote-Debugging: `git fetch origin pi-status && git show origin/pi-status:status.md`
- Claude-Sitzungen außerhalb des Pi (Cloud) haben keinen Heimnetz-Zugriff → Live-Wissen über `pi-status`.
  `docs/` im Branch `pi-status` (z. B. `docs/huawei-modbus-diagnose.md`) bleibt über Reports erhalten.

## Arbeitsweise (ab 2026-10-23: Entwicklung direkt auf dem Pi)
- Arbeitskopie: `~/dev/smarthome` (eigener Clone, Remote `github-smarthome:` = Deploy-Key). **Nie** in `~/smarthome` arbeiten – das ist das Deploy-Verzeichnis, `sync.sh` setzt es hart zurück.
- Node 22 user-lokal (`~/.local/node`), tmux-Session `claude` (Fenster `claude` = Shell/Claude Code, `dev` = Dev-Server).
- Dev: `npm run dev:pi` → API auf **8091** mit `.env.dev` (gitignored: Influx read-only, MQTT, kein Login) + Vite auf **5173** (`0.0.0.0`, Proxy `/api` → 8091). Ansehen: http://10.0.0.1:5173
- Prod (Container `smarthome-app`, **8090**) nicht anfassen. Ressourcen schonen: `npm run test:pi` / `npm run build:pi` (`nice -n 10`).
- Screenshots: `node scripts/shots.mjs <jobs.json>` (System-Chromium, Ausgabe `.shots/`, Beispiel `scripts/shots.example.json`). Kein `gh` auf dem Pi → CI-Ergebnis über `git fetch origin deploy`.
- Berechtigungen: `.claude/settings.json` (Allowlist). Dateien mit Edit/Write ändern, Bash-Befehle einfach halten (keine `cd … &&`-Ketten), damit nicht nachgefragt wird.
- Deploy **nur** über `main` → CI → `deploy` → Timer. Kein `docker compose` von Hand im Deploy-Verzeichnis.
- Node-RED (`mynodered`) nur ändern mit Backup von `flows.json` vorher **und** Pauls Freigabe. Bestehende Container und Caddy/Garmin nicht anfassen.

## Zugriff von außen / Login
Caddy (auf dem Pi, /etc/caddy/Caddyfile) terminiert TLS für energie.paulrigger.ddnsfree.com und proxyt auf :8090 – ohne Basic Auth
(iOS-Homescreen-Apps merken sich Basic Auth nicht). Login macht die App selbst: `apps/api/src/auth.ts`, aktiv mit `AUTH_PASSWORD` in `.env`.
Geschützt sind `/api/*` bei Anfragen mit `X-Forwarded-For` (= über Caddy); Heimnetz direkt auf :8090 ohne Login (`AUTH_EVERYWHERE=1` ändert das).
Session = signiertes HttpOnly-Cookie, 400 Tage. 5 Fehlversuche/15 min je IP.

## Harte Regeln
- Niemals in InfluxDB schreiben. API nutzt nur read-only Token.
- Keine Secrets ins Repo (`.env` ist gitignored; Secrets nur in `.env` auf dem Pi).
- Tests müssen ohne Heimnetz laufen (Fixtures aus `pi-status`-Inventur ableiten).
- Kaputter Build darf nie deployt werden: Image nur bei grünen Tests.

## Datenmodell (aus dem E-Ink-Projekt übernommen, Stand 2026-10)
InfluxDB-Struktur: `_measurement` + Tag `device` + `_field`.
Zähler ("total") → Tageswert = last − first im Zeitraum.

| device | measurement | fields (Faktor, Einheit) |
|---|---|---|
| smarti (Smart Meter Netz) | powersensor | total (1,kWh) Bezug, total_returned (1,kWh) Einspeisung, power (1,W) |
| house_pv (Fronius Dach, gemessen per Shelly 3EM Kanal 0) | powersensor | total_returned (0.001,kWh), power (−1,W) |
| carportpv (Huawei SUN2000, Modbus, nur alle 300 s) | powersensor | total_returned (1,kWh), power (1,W) |
| wallbox (Shelly 3EM) | powersensor | total (0.001,kWh), power (1,W) |
| lambda (Wärmepumpe) | WP | HPFIpowerconsuption W, WPElconsTotal Wh, HPQpheating kW, WPQprodTotal Wh, WarmwasserOben, BoilerOben, ActualAmbienTemp, HPTempflow °C, HPCOP |
| systadata (Solarthermie) | Systa | solarPowerActual kW (×1000 → W), solarGainTotal kWh, collectorTempActual °C |
| Wohnzimmer, Gallerie | climatesensor | Temp, Hum, Co2 |
| huaweibattery | battery | soc %, powerFromBattery W, total_charged/total_discharged kWh |
| MG5 (E-Auto) | car | soc, range, isHome, chargerConnectedBoolean |
| Verbraucher: coffeemachine, freezer, backrohr, geschirrspueler, router, kuehlschrank, herd, washingmachine | powersensor | total Wh, power W |

Quellen, Takte, MQTT-Topics und Influx-Schreibweg: `docs/mqtt-topics.md` (aus Node-RED-Flow). Influx bekommt alles nur als 5-min-Momentaufnahme. Broker 10.0.0.1:1883 mit Auth.
Achtung: obige Faktoren/Vorzeichen gegen `pi-status`-Inventur verifizieren, nicht blind übernehmen.

## Agents (.claude/agents)
- `ui-reviewer` nach sichtbaren UI-Änderungen, `data-verifier` nach Änderungen an Domain/Registry.
- Keine parallelen Rollen-Agents (Backend/Frontend getrennt) – API-Vertrag und UI hängen zu eng zusammen.

## Design
Farbpaletten in `apps/web/src/themes.ts` (je Palette dark + light Tokens), Auswahl unter Einstellungen (pro Gerät, localStorage).
Standard: **Schwarz-Weiß** (`mono`), Alternative `night` (Nachtblau). Neue Palette = neuer Eintrag in `PALETTES`.
Komponenten nutzen nur Tokens: PV `--c-sun`, Netz `--c-grid`, Akku `--c-battery`, WP `--c-heat`, Auto `--c-car`,
Flüsse `--flow-elec` / `--flow-heat`, Gebäude `--structure`. In `mono` unterscheiden Graustufen + Linienmuster.
Schrift Barlow / Barlow Semi Condensed (Zahlen, tabular).
App-Symbol: Quelle `apps/web/icon/source.jpg` (weißes Symbol, Karomuster eingebrannt) → `python3 -I scripts/make_icons.py apps/web/icon/source.jpg apps/web/public`
erzeugt `icon-fg.png` (freigestellt), Manifest-/Apple-/Favicon-PNGs in Schwarz. Hintergrundfarbe unter Einstellungen → App-Symbol
(pro Gerät, `apps/web/src/appIcon.ts`, setzt Favicon + apple-touch-icon zur Laufzeit per Canvas; Manifest bleibt schwarz).
Einzige Dauer-Animation: Flusspunkte auf den Leitungen (Geschwindigkeit ∝ Leistung). Touch-Ziele ≥ 44 px.
Mono-Unterscheidung über Muster: Akku schraffiert, Netz gepunktet (Sankey-Bänder), Auto/Solarthermie schraffiert (Balken).
Gerätezustand **aus / Standby / an** über `deviceState(key, W, th)` (`packages/shared/src/standby.ts`, Defaults aus Messdaten,
änderbar unter Einstellungen → Geräte, `useThresholds()`): nur „an“ wird gefärbt und animiert, Standby gedämpft ohne Flusspunkte,
aus stärker gedämpft. Beispiele: Kaffeemaschine 2–5 W = an, Akku 20–50 W (BMS) und Wallbox 2–10 W = Standby. Nie pauschale W-Schwellen in Komponenten.

## UI-Struktur
App-Shell mit Navigation (Handy: Tab-Bar unten, Desktop: Sidebar), globaler Zeitraum-Wähler.
Module:
1. **Übersicht** (MVP): Grafik + Gerätekacheln + Tabellen; Live-Leistung nur bei `view.isLive`, sonst nur kWh.
   Darstellung wählbar unter Einstellungen (pro Gerät, localStorage `overviewStyle`, `apps/web/src/overviewStyle.ts`):
   - **Haus** (Standard) `components/EnergyFlow.tsx` – Gebäudeschnitt, inspiriert von `docs/eink-reference.png`
   - **Energiefluss** `components/FlowSankey.tsx` – Sankey PV/Akku/Netz → Einspeisung/Akku laden/Haus (Bänder ∝ kWh),
     darunter Hausverbrauch- und Wärme-Balken; heute zusätzlich Live-Leiste
   - **Haus im Zentrum** `components/FlowHub.tsx` – Hub, Linien ∝ Leistung (live, Flusspunkte) bzw. kWh, KPI-Karten
   Alle nutzen dieselben `NodeId`s → dasselbe Detail-Popup. Geometrie/Bilanz rein in `packages/shared/src/flow.ts`
   (`sankeyFlows`, `sankeyLayout`, `hubLines`, getestet in `apps/api/src/domain/flow.test.ts`).
2. Kosten & Erlöse (Tarife, siehe unten)
3. Wärmepumpe: Verbrauch, PV- vs. Netzanteil, COP, Kosten
4. E-Auto/Wallbox: Ladeenergie, PV-Anteil, Kosten
5. **Verlauf** `pages/History.tsx`: PV gesamt als gestapelte Fläche Dach + Carport (`AreaChart` in `Charts.tsx`, Lücken ≤ 3 Buckets aufgefüllt),
   PV-Erzeugung je Bucket gestapelt, KPIs (gesamt, Anteile, Spitze/bester Tag), Leistungskurven, Energiebalken Verbrauch / Netz / Akku.
   **Legende = Schalter** in allen Diagrammen (`Charts.tsx`, `Toggle`-Props `hidden`/`onToggle` für gesteuerten Zustand, sonst intern):
   ausgeblendete Serien fallen aus Achse/Stapel/Summe; Verlauf merkt die Leistungskurven pro Gerät (localStorage `history.hidden`).

## Allokation (Herkunft des Stroms) – umgesetzt
`packages/shared/src/allocation.ts` (rein, getestet in `apps/api/src/domain/allocation.test.ts`).
Je Intervall (15 min, Jahr: 1 h): PV direkt = PV − Einspeisung − Akkuladung, Akku = Entladung, Netz = Bezug.
Alle Verbraucher bekommen im Intervall denselben Mix (proportional), dann summiert. WP-Wärme folgt der Herkunft des WP-Stroms.
Ladevorgänge = zusammenhängende Wallbox-Intervalle (≥ 0,2 kWh). Seiten: `pages/Heat.tsx`, `pages/Car.tsx`.
Kosten je Verbraucher = Netzanteil × Tarif des Intervalls (`packages/shared/src/tariff.ts`, siehe Tarife).

## Tarife – umgesetzt
`packages/shared/src/tariff.ts` (rein, getestet in `apps/api/src/domain/tariff.test.ts`), Startbestand `tariffSeed.ts` (aus Node-RED `global.tarifs`).
Tarif gilt ab `validFrom` (lokal); Bezug: erstes passendes Zeitfenster (Monate, Wochentage, Stunden, über Mitternacht = Vortag), sonst Arbeitspreis.
Einspeisung: Staffel je Kalenderjahr (`exportBefore` aus Influx nur bei > 1 Stufe). Preise ct/kWh brutto; `null` = unbekannt → `missingKwh`, nie 0 €.
Stand: bis 2024 Tag/Nacht 13,68/11,1 ct, 2025–Sep 2026 31/26 ct (Nacht 22–6 + Sa ab 13 Uhr), ab 1.10.2026 Einheitspreis + WiNAP (Okt–Mär 22–6) + SNAP (Apr–Sep 10–16),
Einspeisung 15 ct (2024), 10 ct (2025), 7 ct fix (ab 10/2026). **Offen:** Arbeitspreis ab 1.10.2026, SNAP-/WiNAP-Preis, Staffelgrenzen 2024/2025 (Node-RED: 15/13/11 bzw. 10/8/6 ct).
UI: Einstellungen → Tarife (`components/TariffEditor.tsx`), Seite Kosten (`pages/Economics.tsx`: Kosten & Erlöse + Amortisation mit Intervallpreisen), KPIs auf Wärme/Auto.

## Hybrid-Wechselrichter (Carport) – wichtig für alle Energiezahlen
Akku (LUNA2000) hängt **DC** am Huawei SUN2000 und lädt **nur aus PV** (Paul, 2026-10-24). `carportpv.total_returned` (Reg. 32106)
ist die **AC-Ausgabe** des WR: zählt Akku-Entladung mit, PV→Akku (DC) fehlt. Korrektur in `apps/api/src/domain/hybrid.ts`
(Summary, Energiereihen je Bucket, Intervalle): PV Carport = AC + Ladung − η·Entladung (≥ 0), Akku→Haus = η·Entladung, η = 0,88
(Nachtwerte). Damit Haus = PV Dach + AC + Bezug − Einspeisung exakt. Live-Leistung `pvCarport.power` (Reg. 32064, DC-Eingang) ist echte PV.
Mock-Daten modellieren PV direkt (keine Korrektur).

## Amortisation (PV Carport, Akku) – umgesetzt
`packages/shared/src/yield.ts` (getestet in `yield.test.ts`). PV Dach ist abgeschrieben und deckt den Hausverbrauch zuerst,
dann PV Carport, Überschuss lädt den Akku (erst Dach, dann Carport; reicht er nicht, zulasten des Eigenverbrauchs – keine Netzladung), Rest Einspeisung.
Wert Carport = Eigenverbrauch × Bezug + Überschuss × Einspeisung; Akku = Entladung × Bezug − PV-Ladung × Einspeisung − Netzladung × Bezug.
Bewertet je Intervall mit dem Tarif (`computeCosts` → `buckets.carport/battery`). Seite `pages/Economics.tsx` (/kosten).
Investitionen sind Annahmen in `apps/web/src/invest.ts` (localStorage, pro Gerät).

## Backlog
1. **Huawei-Modbus** (10.0.0.253, SDongleA): Diagnose liegt in `pi-status:docs/huawei-modbus-diagnose.md` – ~50 % der 5-min-Polls scheitern (Timeout auf bestehender Verbindung, gleichmäßig über den Tag, nur Node-RED als Client auf dem Pi). Offen: weitere Clients im LAN prüfen → danach **Modbus-Proxy** vorschlagen (einziger Client, serielle Requests mit Pausen, Keepalive < 60 s, Werte per MQTT).
2. **Node-RED-Fixes** (nur mit Backup + Freigabe, siehe Arbeitsweise):
   - `convertToInflux` absichern: `msg.payload.shellies?.…`, 3EM-Phasen einzeln prüfen statt `value1.power != null`
   - Nachttarif-Logik mutiert das globale Tarif-Objekt
   - `convertToKW` liest nur das Low-Word → Reg. 32064 als I32 lesen
   - 32-Bit-Zusammensetzung mit 65536 statt 65535 (z. B. Lambda `WPElcons2 * 65535`, `convertTokWh`)
   - Topic-Doppelslash `CBYTE/…//total_startOfDay`
   - FusionSolar-Credentials aus dem Function-Node in Env-Variablen
3. ~~Live-Werte per MQTT, Influx als Fallback~~ – umgesetzt (d446856), siehe API.
5. **UI-Kleinkram** (aus ui-review 2026-10-23): `.seg`-Buttons (Tag/Monat/Jahr) nur 40 px hoch → 44 px;
   Haus-Detail: Diagrammlegende ≠ Tabelle (Haushalt/Auto, andere Quelle in `Details.tsx`); PV-Dach-Leistungsdiagramm zeigt „−0“-Tick;
   Knotenbeschriftung in Energiefarbe hat in `night` hell zu wenig Kontrast (Haus-Variante; Hub nutzt `--text`).
4. ~~Tarif-Datenbank~~ – umgesetzt (siehe Tarife). Offen: fehlende Preise eintragen; Floater (Spotpreis) falls Tarifwechsel.
6. **Performance:** Jahresabfrage 2024 (1-h-Fenster) braucht ~30 s auf dem Pi (Influx-Timeout jetzt 90 s, Ergebnis 6 h gecacht). Ggf. Downsampling-Task oder Vorberechnung.
7. **Datenqualität:** Influx-Lücken 21.–26.09. und 1.10.2026 (Nachholenergie landet im ersten Intervall danach, ggf. im Folgemonat:
   Okt 2026 Reihe +23 kWh Carport ggü. Monatssumme – Verhalten wie früher mit Flux `difference`); Allokation kürzt WP/Wallbox, wenn sie im Intervall > Hausverbrauch (Messzeitversatz Shelly vs. Smart Meter, ~5–10 % Wallbox).
