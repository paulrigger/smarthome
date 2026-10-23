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
- Zeitlogik (Grenzen, DST, Buckets) zentral in `packages/shared/src/time.ts`; Mock (`mock.ts`) ist deterministisch je Datum.

## Deploy-Weg (keine manuellen Updates)
- Push auf `main` → GitHub Actions: Tests, Build, Docker-Build → bei Erfolg Force-Push auf Branch **`deploy`**
- Pi: systemd-Timer `smarthome-sync` (alle 5 min) → `deploy/pi/sync.sh`: Branch `deploy` holen, bei neuem Stand `docker compose up -d --build` (Build auf dem Pi, keine Registry)
- App läuft auf dem Pi unter http://<pi>:8090
- Pi pusht Diagnose in Branch **`pi-status`** (status.md, Influx-Inventur, App-Logs, Sync-Journal).
  → Remote-Debugging: `git fetch origin pi-status && git show origin/pi-status:status.md`
- Claude hat KEINEN direkten Netzwerkzugriff aufs Heimnetz. Alles Live-Wissen kommt über `pi-status`.

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
Einzige Dauer-Animation: Flusspunkte auf den Leitungen (Geschwindigkeit ∝ Leistung). Touch-Ziele ≥ 44 px.

## UI-Struktur
App-Shell mit Navigation (Handy: Tab-Bar unten, Desktop: Sidebar), globaler Zeitraum-Wähler.
Module:
1. **Übersicht** (MVP): Hausgrafik (inspiriert von `docs/eink-reference.png`, nicht 1:1), Live-Leistung + Tages-kWh; Umschalter Heute/Monat (Monat: Leistungen ausblenden)
2. Kosten & Erlöse (Tarif-JSON aus Node-RED)
3. Wärmepumpe: Verbrauch, PV- vs. Netzanteil, COP, Kosten
4. E-Auto/Wallbox: Ladeenergie, PV-Anteil, Kosten
5. Verlauf: Zeitreihen

## Allokation (Herkunft des Stroms) – umgesetzt
`packages/shared/src/allocation.ts` (rein, getestet in `apps/api/src/domain/allocation.test.ts`).
Je Intervall (15 min, Jahr: 1 h): PV direkt = PV − Einspeisung − Akkuladung, Akku = Entladung, Netz = Bezug.
Alle Verbraucher bekommen im Intervall denselben Mix (proportional), dann summiert. WP-Wärme folgt der Herkunft des WP-Stroms.
Ladevorgänge = zusammenhängende Wallbox-Intervalle (≥ 0,2 kWh). Seiten: `pages/Heat.tsx`, `pages/Car.tsx`.
Nächster Schritt: Kosten je Verbraucher = Netzanteil × Tarif (Intervall-genau, SNAP/WiNAP).

## Amortisation (PV Carport, Akku) – umgesetzt
`packages/shared/src/yield.ts` (getestet in `yield.test.ts`). PV Dach ist abgeschrieben und deckt den Hausverbrauch zuerst,
dann PV Carport, Überschuss lädt den Akku (erst Dach, dann Carport, Rest Netz), Rest Einspeisung.
Wert Carport = Eigenverbrauch × Bezug + Überschuss × Einspeisung; Akku = Entladung × Bezug − PV-Ladung × Einspeisung − Netzladung × Bezug.
Seite `pages/Economics.tsx` (/kosten). Investitionen/Preise sind fiktive Annahmen in `apps/web/src/invest.ts` (localStorage) → später SQLite mit Tarifen.
