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

## Deploy-Weg (keine manuellen Updates)
- Push auf `main` → GitHub Actions: Tests, Build, Docker-Build → bei Erfolg Force-Push auf Branch **`deploy`**
- Pi: systemd-Timer `smarthome-sync` (alle 5 min) → `deploy/pi/sync.sh`: Branch `deploy` holen, bei neuem Stand `docker compose up -d --build` (Build auf dem Pi, keine Registry)
- App läuft auf dem Pi unter http://<pi>:8090
- Pi pusht Diagnose in Branch **`pi-status`** (status.md, Influx-Inventur, App-Logs, Sync-Journal).
  → Remote-Debugging: `git fetch origin pi-status && git show origin/pi-status:status.md`
- Claude hat KEINEN direkten Netzwerkzugriff aufs Heimnetz. Alles Live-Wissen kommt über `pi-status`.

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
| house_pv (Fronius Dach) | powersensor | total_returned (0.001,kWh), power (−1,W) |
| carportpv (Shelly 3EM) | powersensor | total_returned (1,kWh), power (1,W) |
| wallbox (Shelly 3EM) | powersensor | total (0.001,kWh), power (1,W) |
| lambda (Wärmepumpe) | WP | HPFIpowerconsuption W, WPElconsTotal Wh, HPQpheating kW, WPQprodTotal Wh, WarmwasserOben, BoilerOben, ActualAmbienTemp, HPTempflow °C, HPCOP |
| systadata (Solarthermie) | Systa | solarPowerActual W, solarGainTotal kWh, collectorTempActual °C |
| Wohnzimmer, Gallerie | climatesensor | Temp, Hum, Co2 |
| huaweibattery | battery | soc %, powerFromBattery W, total_charged/total_discharged kWh |
| MG5 (E-Auto) | car | soc, range, isHome, chargerConnectedBoolean |
| Verbraucher: coffeemachine, freezer, backrohr, geschirrspueler, router, kuehlschrank, herd, washingmachine | powersensor | total Wh, power W |

MQTT-Live-Topics: siehe `docs/mqtt-topics.md` (wird ergänzt). Broker 10.0.0.1:1883 mit Auth.
Achtung: obige Faktoren/Vorzeichen gegen `pi-status`-Inventur verifizieren, nicht blind übernehmen.

## Agents (.claude/agents)
- `ui-reviewer` nach sichtbaren UI-Änderungen, `data-verifier` nach Änderungen an Domain/Registry.
- Keine parallelen Rollen-Agents (Backend/Frontend getrennt) – API-Vertrag und UI hängen zu eng zusammen.

## Design
Dark default (Nachtblau #0F1B2A), Light via prefers-color-scheme. Farben je Energieart fix:
PV `--c-sun`, Netz `--c-grid`, Akku `--c-battery`, Wärmepumpe `--c-heat`, Auto `--c-car`. Schrift Barlow / Barlow Semi Condensed (Zahlen, tabular).
Einzige Dauer-Animation: Flusspunkte auf den Leitungen (Geschwindigkeit ∝ Leistung). Touch-Ziele ≥ 44 px.

## UI-Struktur
App-Shell mit Navigation (Handy: Tab-Bar unten, Desktop: Sidebar), globaler Zeitraum-Wähler.
Module:
1. **Übersicht** (MVP): Hausgrafik (inspiriert von `docs/eink-reference.png`, nicht 1:1), Live-Leistung + Tages-kWh; Umschalter Heute/Monat (Monat: Leistungen ausblenden)
2. Kosten & Erlöse (Tarif-JSON aus Node-RED)
3. Wärmepumpe: Verbrauch, PV- vs. Netzanteil, COP, Kosten
4. E-Auto/Wallbox: Ladeenergie, PV-Anteil, Kosten
5. Verlauf: Zeitreihen

## Backlog-Hinweis Allokation
PV-/Netzanteil je Verbraucher muss pro Intervall (5–15 min) berechnet und dann summiert werden,
nicht aus Tagessummen. Logik gehört in `apps/api/src/domain/allocation.ts`.
