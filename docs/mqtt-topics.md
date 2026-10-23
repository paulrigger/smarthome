# Datenquellen, MQTT-Topics und Influx-Schreibweg (aus Node-RED-Flow „Import“, Stand 2026-10-23)

Broker: `10.0.0.1:1883` (Config-Node „SystaPi2“, mit Auth). Persönliche Teile von Topics sind hier maskiert (`<user>`, `<VIN>`).

## Schreibweg nach InfluxDB
- Alle Quellen schreiben in das globale Objekt `house.*` in Node-RED.
- **Alle 300 s** liest `convertToInflux` dieses Objekt, schreibt es als Batch nach Influx 2 (`influxdb2`, Bucket `smarthome`) und **leert es danach** (`global.set('house', {})`).
  → Influx hat höchstens **einen Punkt je 5 min** je Serie, als Momentaufnahme (keine Mittelwerte).
  → Eine Serie wird nur geschrieben, wenn ihre Quelle sich in diesen 5 min gemeldet hat.
- Ein zweiter Batch-Node zur alten InfluxDB 1.x (10.0.0.222) ist deaktiviert.

## Quellen → `house.*` → Influx

| Quelle | Abfrage | Rate | `house.*` | Influx (measurement / device / fields) | MQTT-Republish |
|---|---|---|---|---|---|
| Smart Meter (HTTP 10.0.0.223:8080/getmeterdata, OBIS) | HTTP | 60 s | `smarti` | powersensor / smarti / power (W, + Bezug), total, total_returned (kWh) | nur `CBYTE/<zähler>//total_startOfDay`, `…/total_returned_startOfDay` (00:00) |
| PV Dach (Fronius) über Shelly 3EM `shellypv`, Kanal 0 | MQTT | Shelly (~30 s) | `pv` | powersensor / house_pv / power (W, Erzeugung negativ), total, total_returned (Wh) | `fronius/inverter/power`, `…/total`, `…/total_returned` |
| Backrohr: Shelly 3EM `shellypv`, Kanal 1 | MQTT | Shelly | `backrohr` | powersensor / backrohr / power, total (Wh) | – |
| Herd: Shelly 3EM `shellyherd`, Kanäle 0–2 (summiert) | MQTT | Shelly | `herd0..2` | powersensor / herd | – |
| Wallbox: Shelly 3EM `shellywallbox`, Kanäle 0–2 (summiert) | MQTT | Shelly | `wallbox0..2` | powersensor / wallbox / power, total (Wh) | – |
| PV Carport: **Huawei SUN2000 Modbus** 10.0.0.253 (Reg. 32064 Leistung, 32106 Ertrag) | Modbus | **300 s** | `carportpv` | powersensor / carportpv / power (W), total_returned (kWh) | `huawei/inverter/power`, `…/total_returned`, `…/total_returned_startOfDay` |
| Akku Huawei (Reg. 37001 Leistung, 37004 SoC, 37066 Summen) | Modbus | **300 s** | `battery` | battery / huaweibattery / powerFromBattery (W, + Entladung), soc (%), total_charged, total_discharged (kWh) | `huawei/battery/powerFromBattery`, `/soc`, `/total_charged`, `/total_discharged`, `…_startOfDay` |
| FusionSolar Cloud-API (Wechselrichter, Akku) | HTTP | 300 s | `carportpvAPI`, `carportpvAPI2`, `batteryAPI` | powersensor / carportPVAPI(2), battery / batteryAPI | – |
| Wärmepumpe Lambda (Modbus 10.0.0.228) | Modbus | 60 s (Temperaturen 5 min) | `lambda.ww/hp/boiler/temps/hppow` | WP / lambda / WarmwasserOben, HPTempflow, HPQpheating (kW), HPFIpowerconsuption (W), HPCOP, BoilerOben, ActualAmbienTemp, WPElconsTotal, WPQprodTotal (Wh) | `lambda/ww`, `lambda/hp`, `lambda/boiler`, `lambda/temps`, `lambda/hp_power/startOfDay` (JSON) |
| Solarthermie Systa (HTTP 10.0.0.1:1337/SystaREST/status) | HTTP | 60 s | `systa` | Systa / systadata / collectorTempActual, solarPowerActual (kW), solarGainTotal (kWh) | – |
| Netatmo (Cloud) | HTTP | 60 s | `netatmo` | climatesensor / Gallerie, Wohnzimmer / Temp, Hum, Co2 | – |
| Shelly Plugs Gen2 (`<name>/status/switch:0`, JSON `apower`, `aenergy.total`) | MQTT | bei Änderung | `shellies.*` | powersensor / freezer, coffeemachine, washingmachine, geschirrspueler, kuehlschrank, router, kuechenlicht, klimaanlage / power (W), total (Wh) | `shellyfreezer/total_startOfDay`, `shellykaffeemaschine/total_startOfDay` |
| MG5 (SAIC-Gateway) `saic/<user>/vehicles/<VIN>/drivetrain/soc`, `…/fossilFuel/range`, `…/location/position`, `…/drivetrain/chargerConnected`, `…/mileage` | MQTT | Gateway | `mg5` | car / MG5 / soc, range, isHome, chargerConnectedBoolean | – (zusätzlich Google Sheet) |
| Tarif (global `tarifs`, Nachttarif-Logik) | – | 300 s | `tarif` | Tarif-Data / tarif / feedintarif1–3, nettarif | – |

## Für die App direkt per MQTT nutzbar (Live)
Gemessen 2026-10-23 mittags, 4 min Mitschnitt (Takt = Median der Abstände; R = retained).
Umrechnung so, dass das Ergebnis dem heutigen Registry-Wert (nach Faktor) entspricht.

| App-Key (`LIVE_SERIES`) | Topic | Payload → Wert | Takt |
|---|---|---|---|
| grid.power | `CBYTE/1KFM0200176549/sensor` | JSON (OBIS, kW): `("1.0.1.7.0.255" − "1.0.2.7.0.255") × 1000` → W, + Bezug | **5 s** |
| pvRoof.power | `shellies/shellypv/emeter/0/power` (identisch `fronius/inverter/power`) | Zahl W, Erzeugung negativ → ×−1 | 30 s |
| pvCarport.power | `huawei/inverter/power` | Zahl W | 300 s (Quelle) |
| battery.power | `huawei/battery/powerFromBattery` | Zahl W, + Entladung (Node-RED: `ch_discharge_power × −1`) | 300 s (Quelle) |
| battery.soc | `huawei/battery/soc` | Zahl % | 300 s |
| wallbox.power | `shellies/shellywallbox/emeter/{0,1,2}/power` | Summe der 3 Kanäle, W | 30 s |
| heatpump.power | `lambda/hp` → `FIPowerConsumption` | W | 60 s |
| heatpump.heat | `lambda/hp` → `Qpheating` | ×100 → W (Roh 0,1 kW) | 60 s |
| heatpump.cop | `lambda/hp` → `COP` | ×0,01 | 60 s |
| heatpump.flowTemp | `lambda/hp` → `Tflow` | ×0,01 °C (Modbus int16, schon vorzeichenrichtig) | 60 s |
| heatpump.dhwTop | `lambda/ww` → `WarmwasserOben` | °C | 60 s |
| heatpump.bufferTop | `lambda/boiler` → `BoilerOben` | °C | 60 s |
| outdoor.temp | `lambda/temps` → `ActualAmbienTemp` | °C | 300 s |
| car.soc | `saic/<user>_api/vehicles/<VIN>/drivetrain/soc` | Zahl % | R, bei Fahrzeug-Update |
| car.range | `…/drivetrain/fossilFuel/range` (Node-RED) bzw. `…/drivetrain/range` | km | R |
| car.plugged | `…/drivetrain/chargerConnected` | `True`/`False` (Python-Schreibweise!) | R |
| car.home | – (Node-RED leitet es aus `…/location/position` ab) | Geofence nachbauen oder aus Influx | R |
| appliance.coffeemachine.power | `shellykaffeemaschine/status/switch:0` | JSON `apower` W | 10 s / bei Änderung |
| appliance.freezer.power | `shellyfreezer/status/switch:0` | JSON `apower` | 1 s |
| appliance.geschirrspueler.power | `shellygeschirrspueler/status/switch:0` | JSON `apower` | 20 s |
| appliance.router.power | `shellyrouter/status/switch:0` | JSON `apower` | 60 s |
| appliance.kuehlschrank.power | `Shellykuehlschrank/status/switch:0` (großes **S**) | JSON `apower` | 10 s |
| appliance.washingmachine.power | `shellywashingmachine/status/switch:0` | JSON `apower` | 1 s |
| appliance.herd.power | `shellies/shellyherd/emeter/{0,1,2}/power` | Summe, W | 9 s |
| appliance.backrohr.power | `shellies/shellypv/emeter/1/power` | Zahl W | 30 s |

**Nicht auf MQTT** (Live weiter aus Influx oder direkt abfragen):
- solarThermal.power, solarThermal.collectorTemp: SystaREST `http://10.0.0.1:1337/SystaREST/status` (Quelle 60 s). Die App kann das direkt pollen; `solarPowerActual` ist kW.
- Wohnzimmer.* / Gallerie.* (Netatmo-Cloud, Station misst ohnehin nur alle 10 min) → Influx reicht.

**Fallstricke**
- SAIC: Es gibt zwei Konten mit derselben VIN. Aktuell ist nur das Konto `…_api` (Node-RED nutzt es). Das andere hat nur alte retained-Werte (letzte Ladung 12/2025) → nicht abonnieren.
- `smarti/total_startOfDay` (9430 kWh) gehört nicht zum aktuellen Zähler. Die Tagesbasis ist `CBYTE/1KFM0200176549//total_startOfDay` (doppelter Slash!).
- Die Shelly-Gen1-Werte (`shellies/…`) sind nicht retained. Nach einem App-Neustart fehlen sie bis zur nächsten Meldung (≤ 30 s), Akku/Carport bis 5 min → beim Start einmal Influx `last()` als Startwert nehmen.
- Akku und Carport werden über MQTT nicht schneller (Quelle 5 min), aber zuverlässiger als in Influx: dort fehlen Punkte, wenn sie nicht genau ins 5-min-Batchfenster fallen (heute Lücken bis 30 min).

**Bonus: Tages-kWh live** über `…_startOfDay` (retained, 00:00): heute = aktueller Zählerstand − startOfDay
(Netz: CBYTE OBIS 1.8.0/2.8.0, Carport: `huawei/inverter/total_returned`, Akku: `huawei/battery/total_(dis)charged`, WP: `lambda/hp_power/startOfDay` vs. Zähler – Achtung, der Zähler selbst wird für die WP nicht laufend gepublisht).
