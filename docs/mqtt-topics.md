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
| App-Key | Topic | Format | Takt |
|---|---|---|---|
| pvRoof.power | `shellies/shellypv/emeter/0/power` | Zahl W (Erzeugung negativ → ×−1) | ~30 s |
| wallbox.power | `shellies/shellywallbox/emeter/{0,1,2}/power` | Zahl W, Summe der 3 Kanäle | ~30 s |
| appliance.herd.power | `shellies/shellyherd/emeter/{0,1,2}/power` | Summe | ~30 s |
| appliance.backrohr.power | `shellies/shellypv/emeter/1/power` | Zahl W | ~30 s |
| appliance.*.power | `shelly<name>/status/switch:0` | JSON `apower` | bei Änderung |
| heatpump.* | `lambda/hp` (JSON: FIPowerConsumption W, Qpheating ×0,1 kW, COP ×0,01, Tflow ×0,01 °C), `lambda/ww`, `lambda/boiler`, `lambda/temps` | JSON | 60 s |
| pvCarport.power | `huawei/inverter/power` | Zahl W | **300 s** |
| battery.power / soc | `huawei/battery/powerFromBattery`, `huawei/battery/soc` | Zahl | **300 s** |
| grid.power | **nicht auf MQTT** (nur HTTP → global → Influx) | | |
| car.* | `saic/<user>/vehicles/<VIN>/…` | | Gateway |
