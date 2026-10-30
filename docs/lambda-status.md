# Lambda-Wärmepumpe: Statuswerte (Modbus → Klartext)

Quelle: Lambda „Modbus Beschreibung und Protokoll“ (lambda-wp.at, Stand 02/2025). Register = Index/Subindex/Nummer, z. B. 1002 = Wärmepumpe 1, Nr. 02.

## Wo die Werte ankommen
| Register | Bedeutung | Node-RED-Feld | MQTT-Topic (JSON) | Influx |
|---|---|---|---|---|
| 1000 | Fehlerstatus WP | `HPErrorstate` | `lambda/hp` | – (auskommentiert) |
| 1001 | Fehlernummer | `HPErrorNumber` | `lambda/hp` | – |
| 1002 | WP-Status | `HPState` | `lambda/hp` | – |
| 1003 | Betriebszustand | `HPOperatingState` | `lambda/hp` | – |
| 2001 | Warmwasser (Boiler) Betriebszustand | `WarmwasserOperationState` | `lambda/ww` | – |
| 3001 | Puffer Betriebszustand | `BoilerOperationState` | `lambda/boiler` | – |
| 0001 | Außeneinheit/Ambient Betriebszustand | `OperatingState` | `lambda/temps` | – |

Live über MQTT sofort nutzbar. Für Verlauf/Statistik müssen die Felder in Node-RED `convertToInflux` → `addlambdadata` wieder aktiviert werden
(nur mit Backup von flows.json und Pauls Freigabe).

## 1002 – WP-Status (`HPState`)
| Wert | Lambda | Anzeige |
|---|---|---|
| 0 | INIT | Initialisierung |
| 1 | REFERENCE | Referenzfahrt |
| 2 | RESTART-BLOCK | Wiederanlaufsperre |
| 3 | READY | Bereit |
| 4 | START PUMPS | Pumpen starten |
| 5 | START COMPRESSOR | Verdichter startet |
| 6 | PRE-REGULATION | Vorregelung |
| 7 | REGULATION | Läuft (Regelung) |
| 9 | COOLING | Kühlen |
| 10 | DEFROSTING | **Abtauen** |
| 20 | STOPPING | Stoppt |
| 30 | FAULT-LOCK | Störabschaltung |
| 31 | ALARM-BLOCK | Alarmsperre |
| 40 | ERROR-RESET | Fehler-Reset |

## 1003 – Betriebszustand (`HPOperatingState`)
| Wert | Lambda | Anzeige |
|---|---|---|
| 0 | STBY | Bereitschaft |
| 1 | CH | **Heizen** |
| 2 | DHW | **Warmwasser** |
| 3 | CC | Kühlen |
| 4 | CIRCULATE | Umwälzen |
| 5 | DEFROST | **Abtauen** |
| 6 | OFF | Aus |
| 7 | FROST | Frostschutz |
| 8 | STBY-FROST | Bereitschaft (Frostschutz) |
| 10 | SUMMER | Sommerbetrieb |
| 11 | HOLIDAY | Urlaub |
| 12 | ERROR | Fehler |
| 13 | WARNING | Warnung |
| 14 | INFO-MESSAGE | Hinweis |
| 15 | TIME-BLOCK | Zeitsperre |
| 16 | RELEASE-BLOCK | Freigabesperre (EVU) |
| 17 | MINTEMP-BLOCK | Mindesttemperatursperre |
| 18 | FIRMWARE-DOWNLOAD | Firmware-Update |

## 2001 – Warmwasser (`WarmwasserOperationState`)
0 Bereitschaft · 1 Warmwasser bereiten · 2 Legionellenschutz · 3 Sommer · 4 Frostschutz · 5 Urlaub · 6 Vorrang-Stopp · 7 Fehler · 8 Aus ·
9 Sofort-Warmwasser · 10 Nachlauf-Stopp · 11 Temperatursperre · 12 Bereitschaft (Frostschutz)

## 3001 – Puffer (`BoilerOperationState`)
0 Bereitschaft · 1 Heizen · 2 Kühlen · 3 Sommer · 4 Frostschutz · 5 Urlaub · 6 Vorrang-Stopp · 7 Fehler · 8 Aus · 9 Bereitschaft (Frostschutz)

## 1000 – Fehlerstatus (`HPErrorstate`)
0 keiner · 1 Meldung · 2 Warnung · 3 Alarm · 4 Störung

## 0001 – Ambient (`OperatingState`)
0 Aus · 1 Automatik · 2 Manuell · 3 Fehler
