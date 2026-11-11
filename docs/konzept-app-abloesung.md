# Konzept: Hersteller-Apps durch Flux ersetzen (Steuern)

Stand 2026-11-11 · Ziel: MG-, FusionSolar-, Lambda- und Shelly-App im Alltag nicht mehr nötig.
Lesen kann Flux fast alles schon – es fehlt der **Schreibweg**. Dieses Dokument ist das Konzept; umgesetzt wird schrittweise in Claude Code am Pi.

## Was Paul in den Apps tatsächlich tut (2026-11-11)

| App | Nutzung | Ersatz in Flux |
|---|---|---|
| MG (SAIC) | Ladeziel setzen, Klima (vorheizen/-kühlen), teilweise verriegeln | Auto-Seite + Prognose-Kachel + Auto-Knoten im Hausmodell |
| Lambda | nur **Urlaub** setzen | Wärme-Seite: „Urlaub von–bis“ |
| FusionSolar | nur **Wallbox Öko ↔ Direkt** umschalten | Auto-Seite + Prognose-Kachel (Knopf je nach Empfehlung) |
| Shelly | Steckdosen, **Lichter**, **Jalousien** steuern | Räume in der Explosionszeichnung + Gerätekacheln |

Firmware-Updates, Installateur-Einstellungen, Herstellersupport bleiben in den Hersteller-Apps (selten).

## Architektur: Steuerschicht

```
Flux-UI ── POST /api/control  {target, action, value} ──► API
             (Login Pflicht, auch im Heimnetz)              │ prüft Whitelist + Grenzen, loggt (SQLite control_log)
                                                            │ MQTT publish (QoS 1, nicht retained)
          ┌──────────────────────┬──────────────────────────┼───────────────────────────┐
          ▼                      ▼                          ▼                           ▼
   SAIC-Gateway (MG)      Shelly direkt (Gen2 RPC /   Node-RED → Modbus Lambda    Node-RED/Proxy → Huawei
   …/set-Topics           Gen1 command-Topics)        (Urlaub)                    (Wallbox-Modus)
          │                      │                          │                           │
          └──────── neuer Zustand kommt per MQTT zurück ──── LiveFeed ─── UI: „erledigt“ / nach 60 s „keine Bestätigung“
```

Regeln:
- **Flux spricht nie selbst Modbus.** Huawei verträgt nur einen Client (Backlog 1), Lambda-Schreiben läuft heute schon über Node-RED. Flux publiziert ein Befehls-Topic `flux/cmd/<target>`; Node-RED führt aus. Node-RED-Änderungen nur mit Backup + Freigabe.
- **Whitelist statt freier Topics:** Aktionen sind in `packages/shared/src/control.ts` definiert (rein, getestet): Ziel, Aktion, Werttyp, Grenzen, Bestätigung nötig ja/nein, Rückmelde-Key.
- **Bestätigungsdialog** für: MG entriegeln, Lambda Urlaub, Wallbox-Modus. Licht/Steckdose/Jalousie ohne Dialog (Ausnahme: Steckdosen mit Dauerverbrauchern wie Gefrierer, Kühlschrank, Router → gesperrt oder Dialog).
- **Log**: jede Aktion mit Zeit, Ziel, Wert, Ergebnis (bestätigt/Timeout/Fehler) → Einstellungen → System → Steuerprotokoll.
- **Rechte**: vorerst nur ein Login (Paul). Rollen (Familie, Carsharing-Partner nur „MG laden“) erst bei Bedarf.
- InfluxDB bleibt read-only.

## 1. Shelly – Steckdosen, Lichter, Jalousien (Einstieg, kleinstes Risiko)

- **Inventur zuerst** (Claude Code): `mosquitto_sub -t '#' -v` ~2 min mitschneiden, alle Shellys auflisten (Gen1 `shellies/<id>/…` vs. Gen2 `<name>/status/…`), Typ (Plug, 1PM, 2PM Cover, Dimmer), Raum. Ergebnis als Tabelle in `docs/mqtt-topics.md`. Bisher bekannt nur Plugs + 3EM; Lichter/Jalousien noch unbekannt.
- **Befehle** direkt an den Shelly (kein Node-RED nötig):
  - Gen2: `<name>/rpc` mit `{"id":1,"src":"flux","method":"Switch.Set","params":{"id":0,"on":true}}`, Jalousie `Cover.Open|Close|Stop|GoToPosition {pos}`, Dimmer `Light.Set {brightness}`
  - Gen1: `shellies/<id>/relay/0/command` = `on|off`, Rollo `shellies/<id>/roller/0/command` = `open|close|stop` bzw. `…/command/pos` = 0–100
  - Rückmeldung: `status/switch:0` (`output`), `status/cover:0` (`state`, `current_pos`)
- **UI**: In der Explosionszeichnung (Raum antippen) bekommt das Raumblatt Schalter: Licht an/aus (Dimmer-Schieber), Jalousie ▲ ■ ▼ + Position. Stockwerk-Ansicht: kleine Symbole im Raum (Glühbirne leuchtet, Jalousie-Stand als Balken). Gerätekacheln: langer Druck = Steckdose schalten.
- Zuordnung Raum ↔ Shelly in `ROOMS` (`floors.ts`), wie bei den Geräten.
- Später: „Alle Jalousien zu/auf“, Szenen (Abend, Urlaub), zeitgesteuert.

## 2. MG – Ladeziel, Klima, Verriegeln

SAIC-Gateway (saic-python-mqtt-gateway) läuft schon, Konto `…_api`. Set-Topics (Namen am Gateway prüfen, Version!):
- Ladeziel: `saic/<user>_api/vehicles/<VIN>/drivetrain/socTarget/set` (40–100, 10er-Schritte)
- Laden start/stop: `…/drivetrain/charging/set` (`true|false`)
- Klima: `…/climate/remoteClimateState/set` (`on|off|front|blowingonly`), Temperatur `…/climate/remoteTemperature/set`
- Verriegeln: `…/doors/locked/set` (`true|false`) – **Entriegeln nur mit Dialog**
- Rückmeldung über die normalen Status-Topics; Achtung: SAIC-API träge (Befehl weckt das Auto, Bestätigung bis ~1–2 min) → Timeout hier 3 min, Zustand „läuft…“ anzeigen.
- **UI**: Auto-Seite oben Bedienfeld (Ladeziel-Stufen 50/60/70/80/90/100, Klima-Knopf mit Countdown, Schloss). Prognose-Kachel: bei „Nachts laden“ Knopf „Ladeziel X % setzen“; Auto-Knoten im Hausmodell öffnet das Bedienfeld.
- Carsharing-Hinweis: Ladeziel betrifft beide Haushalte → später evtl. Rolle „Partner“ nur Ladeziel.

## 3. FusionSolar – Wallbox Öko ↔ Direkt

Einzige Nutzung, aber technisch der unsicherste Weg. **Spike vor dem Bauen** (Claude Code, nur lesen, nichts schreiben):
1. Huawei-Doku „SCharger Modbus Interface Definitions“ / SUN2000 Modbus: Gibt es ein Register für den Lademodus (PV-Vorrang/„Öko“ vs. Schnellladen), und ist der Charger über den SDongle (10.0.0.253) per Modbus erreichbar (eigene Slave-ID)?
2. Falls nein: FusionSolar Northbound-API (OpenAPI) – erlaubt das Konto Steuerbefehle für den Charger? (Oft nur Installateur-Konten.)
3. Falls beides nein: **nicht umsetzen** (Paul 2026-11-11: keine Workarounds) – Wallbox bleibt in der FusionSolar-App.
- Schreibzugriff erst nach dem **Modbus-Proxy** (Backlog 1), sonst verschärfen wir die 50-%-Timeouts.
- **UI**: Auto-Seite + Prognose-Kachel: Umschalter „Öko | Direkt“, aktueller Modus sichtbar.

## 4. Lambda – Urlaub

- Spike: Lambda-Modbus-Doku (`docs/lambda-status.md`): Gibt es einen Urlaubs-/Ferienmodus als Register (Heizkreis-Betriebsart „Ferien“/„Abwesend“, oder Kalender)?
  - Wenn ja: Node-RED schreibt auf `flux/cmd/lambda/vacation` `{from, to}` das Register; Flux setzt am Ende-Datum zurück (Zeitplan in SQLite, Push „Urlaub endet morgen“).
  - Wenn nein: **nicht umsetzen** (Paul 2026-11-11: keine Workarounds) – Urlaub bleibt in der Lambda-App.
- **UI**: Wärme-Seite: Karte „Urlaub“ mit von–bis, Status „aktiv bis …“, Abbrechen. Bestätigungsdialog.

## Automationen (danach, macht Flux besser als die Apps)

Regeln rein in `packages/shared` (wie `alerts.ts`), ausgeführt in der Push-Schleife:
- (nur falls der Wallbox-Modus per Modbus/API schaltbar ist) Überschuss > X kW für 10 min **und** Auto angesteckt → Wallbox Öko.
- Prognose „Nachts laden“ um 21 Uhr → Push mit Knopf „Ladeziel 80 % setzen“.
- Sonnenuntergang → Jalousien Süd zu (Szene), Abwesenheit/Urlaub → Lichter-Simulation.
- Jede Automation einzeln schaltbar (Einstellungen → Automationen), jede Ausführung im Steuerprotokoll.

## Reihenfolge / Meilensteine

1. Steuerschicht (`control.ts`, `POST /api/control`, Log, Dialog-Komponente) + **Shelly** (Inventur → Licht/Steckdose/Jalousie in den Räumen) → Shelly-App weg.
2. **MG** Ladeziel/Klima/Schloss → MG-App weg.
3. **Lambda Urlaub** – nur wenn der Spike ein echtes Urlaubs-Register findet, sonst bleibt die Lambda-App dafür.
4. **Modbus-Proxy** (Backlog 1), dann **Wallbox-Modus** – nur wenn Modbus oder API den Modus direkt umschalten kann, sonst bleibt die FusionSolar-App dafür.
5. Automationen.

## Offene Fragen an Paul
- Welche Lichter/Jalousien sind Shellys (Räume)? → klärt die Inventur weitgehend, Raumzuordnung von Paul.
- Steckdosen mit Dauerverbrauchern (Gefrierer, Kühlschrank, Router) sperren?
- Sollen Carsharing-Partner später das MG-Ladeziel setzen dürfen?
