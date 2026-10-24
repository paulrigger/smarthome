# Huawei-Modbus-Diagnose (10.0.0.253:502)

Stand: 2026-10-23 ~15:45, nur lesend erhoben (Node-RED-Logs, `ss`/`/proc/net/tcp`, Flows, Influx mit Read-only-Token). Nichts geändert.

## Kurzfazit
- **Etwa die Hälfte aller Abfragen scheitert**: 315 von ~576 Poll-Zyklen in 48 h (Abfrage alle 300 s). In Influx kommen **48,8 %** der Soll-Punkte für carportpv/huaweibattery an (Smart Meter als Referenz: 100 %).
- Die Fehler verteilen sich **gleichmäßig über alle Tageszeiten** (10–17 Timeouts je Stunde-des-Tages über 2 Tage). Lastspitzen (PV-Mittag, Cloud-Upload) scheiden damit als Hauptursache eher aus.
- Netz ok: Port 502 antwortet in 8–16 ms, Ping 0 % Verlust (Mittel 13,6 ms, max. 88 ms, WLAN-Jitter). Die Ausfälle sind **Modbus-Timeouts auf einer bestehenden TCP-Verbindung**, keine TCP-Verbindungsfehler.
- **Nur ein Client auf dem Pi** (Node-RED). Keine weiteren Skripte, Container oder Cronjobs, die 10.0.0.253 nutzen.
- Gerät: **SDongleA** (Hostname `SDongleA-BT23…3414.home`), Modbus über den Dongle, nicht über das Wechselrichter-WLAN (Port 6607 zu).

## 1. Node-RED-Logs (`docker logs mynodered --since 48h`)
1575 Zeilen mit modbus/huawei/timeout/ECONN:

| Anzahl | Meldung |
|---|---|
| 315 | `[warn] [modbus-getter:Total_Yield] Modbus Failure On State sending …` |
| 315 | `[warn] [modbus-getter:PV-Neu-Power] Modbus Failure On State sending …` |
| 315 | `[warn] [modbus-getter:Battery SOC in 0.1%] Modbus Failure On State sending …` |
| 315 | `[warn] [modbus-getter:Battery Charge and Discharge power in W] Modbus Failure On State sending …` |
| 304 | `[error] [modbus-getter:PV-Neu-Power] Error: Timed out` |
| 11 | `[error] [modbus-getter:PV-Neu-Power] Error: Port Not Open` |

Fehler je Tag: 21.10. (ab 14:05) 73 · 22.10. 163 · 23.10. (bis 13:45) 79.
Pro Fehlerzyklus melden alle 4 Getter **in derselben Sekunde** (314 von 316 Zyklen) – der erste Getter (`PV-Neu-Power`, Reg. 32064) läuft in den Timeout, die übrigen scheitern dann am Client-Zustand.

Beispielzeilen:
```
21 Oct 14:05:47 - [warn] [modbus-getter:Battery SOC in 0.1%] Modbus Failure On State sending Get More About It By Logging
21 Oct 14:05:47 - [warn] [modbus-getter:PV-Neu-Power] Modbus Failure On State sending Get More About It By Logging
23 Oct 13:45:49 - [warn] [modbus-getter:Total_Yield] Modbus Failure On State sending Get More About It By Logging
23 Oct 13:45:49 - [warn] [modbus-getter:Battery Charge and Discharge power in W] Modbus Failure On State sending Get More About It By Logging
23 Oct 13:45:49 - [error] [modbus-getter:PV-Neu-Power] Error: Timed out
```

Timeouts je Stunde des Tages (Summe über 48 h):
`00:13 01:12 02:10 03:15 04:15 05:11 06:12 07:12 08:13 09:10 10:12 11:13 12:13 13:14 14:14 15:15 16:10 17:10 18:12 19:11 20:17 21:10 22:15 23:15`

## 2. Wer spricht Modbus mit 10.0.0.253?
- `ss -tn` auf dem Host zeigt keine :502-Verbindung, weil Node-RED im Docker-Bridge-Netz läuft. Im Container (`/proc/net/tcp`):
  - `→ 10.0.0.253:502 ESTABLISHED` (eine dauerhafte Verbindung)
  - `→ 10.0.0.228:502 ESTABLISHED` (Lambda, anderes Gerät)
- `grep -r 10.0.0.253` in `~` und `/etc`: nur Node-RED-Flows (+ Backups in `~/.node-red`, `~/incident-backup-20261020T170218`) und `docs/mqtt-topics.md`. Keine Compose-Files, Container-Env oder Cronjobs (crontab enthält nur das Grafana-Backup).
- Nicht prüfbar vom Pi aus: andere Geräte im LAN (z. B. Home Assistant, Handy-App, NAS). Der SDongle erlaubt nur wenige parallele Modbus-TCP-Clients – falls woanders noch einer pollt, wäre das ein Kandidat.

Node-RED-Client „huawei“ (aus flows.json): Unit-ID 1, `clientTimeout` 10000 ms, `reconnectOnTimeout` an, `reconnectTimeout` 5000 ms, **`commandDelay` 1 ms**, `bufferCommands` an, `parallelUnitIdsAllowed` an.
Getter (alle per gemeinsamem Inject alle 300 s ausgelöst, gleichzeitig): 32064 (2 Reg.), 32106 (2), 37001 (2), 37004 (1), 37066 (4).

## 3. Lücken in InfluxDB (letzte 7 Tage, Soll 12 Punkte/h)
| Gerät | Punkte | Soll (12/h) | Verfügbarkeit |
|---|---|---|---|
| carportpv | 984 | 2016 | 48.8 % |
| huaweibattery | 984 | 2016 | 48.8 % |
| smarti | 2016 | 2016 | 100.0 % |

| Punkte/h | carportpv (Stunden) | huaweibattery soc (Stunden) |
|---|---|---|
| 2 | 1 | 1 |
| 3 | 8 | 8 |
| 4 | 21 | 21 |
| 5 | 44 | 44 |
| 6 | 33 | 33 |
| 7 | 41 | 41 |
| 8 | 12 | 12 |
| 9 | 7 | 7 |
| 10 | 1 | 1 |

### Stunde → Anzahl (lokal, Europe/Vienna; endet zur vollen Stunde)

| Stunde | carportpv/power | huaweibattery/soc | smarti/power (Referenz) |
|---|---|---|---|
| 2026-10-16 15:00 | 7 | 7 | 10 |
| 2026-10-16 16:00 | 4 | 4 | 12 |
| 2026-10-16 17:00 | 8 | 8 | 12 |
| 2026-10-16 18:00 | 5 | 5 | 12 |
| 2026-10-16 19:00 | 7 | 7 | 12 |
| 2026-10-16 20:00 | 9 | 9 | 12 |
| 2026-10-16 21:00 | 6 | 6 | 12 |
| 2026-10-16 22:00 | 4 | 4 | 12 |
| 2026-10-16 23:00 | 8 | 8 | 12 |
| 2026-10-17 00:00 | 5 | 5 | 12 |
| 2026-10-17 01:00 | 7 | 7 | 12 |
| 2026-10-17 02:00 | 6 | 6 | 12 |
| 2026-10-17 03:00 | 8 | 8 | 12 |
| 2026-10-17 04:00 | 4 | 4 | 12 |
| 2026-10-17 05:00 | 7 | 7 | 12 |
| 2026-10-17 06:00 | 6 | 6 | 12 |
| 2026-10-17 07:00 | 7 | 7 | 12 |
| 2026-10-17 08:00 | 3 | 3 | 12 |
| 2026-10-17 09:00 | 7 | 7 | 12 |
| 2026-10-17 10:00 | 6 | 6 | 12 |
| 2026-10-17 11:00 | 2 | 2 | 12 |
| 2026-10-17 12:00 | 5 | 5 | 12 |
| 2026-10-17 13:00 | 6 | 6 | 12 |
| 2026-10-17 14:00 | 6 | 6 | 12 |
| 2026-10-17 15:00 | 7 | 7 | 12 |
| 2026-10-17 16:00 | 8 | 8 | 12 |
| 2026-10-17 17:00 | 4 | 4 | 12 |
| 2026-10-17 18:00 | 3 | 3 | 12 |
| 2026-10-17 19:00 | 5 | 5 | 12 |
| 2026-10-17 20:00 | 3 | 3 | 12 |
| 2026-10-17 21:00 | 7 | 7 | 12 |
| 2026-10-17 22:00 | 5 | 5 | 12 |
| 2026-10-17 23:00 | 3 | 3 | 12 |
| 2026-10-18 00:00 | 5 | 5 | 12 |
| 2026-10-18 01:00 | 5 | 5 | 12 |
| 2026-10-18 02:00 | 7 | 7 | 12 |
| 2026-10-18 03:00 | 7 | 7 | 12 |
| 2026-10-18 04:00 | 7 | 7 | 12 |
| 2026-10-18 05:00 | 9 | 9 | 12 |
| 2026-10-18 06:00 | 5 | 5 | 12 |
| 2026-10-18 07:00 | 4 | 4 | 12 |
| 2026-10-18 08:00 | 6 | 6 | 12 |
| 2026-10-18 09:00 | 6 | 6 | 12 |
| 2026-10-18 10:00 | 7 | 7 | 12 |
| 2026-10-18 11:00 | 8 | 8 | 12 |
| 2026-10-18 12:00 | 6 | 6 | 12 |
| 2026-10-18 13:00 | 6 | 6 | 12 |
| 2026-10-18 14:00 | 9 | 9 | 12 |
| 2026-10-18 15:00 | 9 | 9 | 12 |
| 2026-10-18 16:00 | 7 | 7 | 12 |
| 2026-10-18 17:00 | 5 | 5 | 12 |
| 2026-10-18 18:00 | 7 | 7 | 12 |
| 2026-10-18 19:00 | 6 | 6 | 12 |
| 2026-10-18 20:00 | 5 | 5 | 12 |
| 2026-10-18 21:00 | 3 | 3 | 12 |
| 2026-10-18 22:00 | 4 | 4 | 12 |
| 2026-10-18 23:00 | 4 | 4 | 12 |
| 2026-10-19 00:00 | 6 | 6 | 12 |
| 2026-10-19 01:00 | 7 | 7 | 12 |
| 2026-10-19 02:00 | 5 | 5 | 12 |
| 2026-10-19 03:00 | 6 | 6 | 12 |
| 2026-10-19 04:00 | 5 | 5 | 12 |
| 2026-10-19 05:00 | 5 | 5 | 12 |
| 2026-10-19 06:00 | 6 | 6 | 12 |
| 2026-10-19 07:00 | 7 | 7 | 12 |
| 2026-10-19 08:00 | 5 | 5 | 12 |
| 2026-10-19 09:00 | 9 | 9 | 12 |
| 2026-10-19 10:00 | 7 | 7 | 12 |
| 2026-10-19 11:00 | 6 | 6 | 12 |
| 2026-10-19 12:00 | 5 | 5 | 12 |
| 2026-10-19 13:00 | 6 | 6 | 12 |
| 2026-10-19 14:00 | 6 | 6 | 12 |
| 2026-10-19 15:00 | 5 | 5 | 12 |
| 2026-10-19 16:00 | 5 | 5 | 12 |
| 2026-10-19 17:00 | 7 | 7 | 12 |
| 2026-10-19 18:00 | 5 | 5 | 12 |
| 2026-10-19 19:00 | 6 | 6 | 13 |
| 2026-10-19 20:00 | 6 | 6 | 12 |
| 2026-10-19 21:00 | 5 | 5 | 12 |
| 2026-10-19 22:00 | 5 | 5 | 12 |
| 2026-10-19 23:00 | 7 | 7 | 12 |
| 2026-10-20 00:00 | 6 | 6 | 12 |
| 2026-10-20 01:00 | 7 | 7 | 12 |
| 2026-10-20 02:00 | 5 | 5 | 12 |
| 2026-10-20 03:00 | 9 | 9 | 12 |
| 2026-10-20 04:00 | 7 | 7 | 12 |
| 2026-10-20 05:00 | 5 | 5 | 12 |
| 2026-10-20 06:00 | 5 | 5 | 12 |
| 2026-10-20 07:00 | 5 | 5 | 12 |
| 2026-10-20 08:00 | 7 | 7 | 12 |
| 2026-10-20 09:00 | 9 | 9 | 12 |
| 2026-10-20 10:00 | 7 | 7 | 12 |
| 2026-10-20 11:00 | 5 | 5 | 12 |
| 2026-10-20 12:00 | 5 | 5 | 12 |
| 2026-10-20 13:00 | 7 | 7 | 12 |
| 2026-10-20 14:00 | 4 | 4 | 12 |
| 2026-10-20 15:00 | 6 | 6 | 12 |
| 2026-10-20 16:00 | 10 | 10 | 13 |
| 2026-10-20 17:00 | 6 | 6 | 12 |
| 2026-10-20 18:00 | 7 | 7 | 12 |
| 2026-10-20 19:00 | 6 | 6 | 12 |
| 2026-10-20 20:00 | 5 | 5 | 12 |
| 2026-10-20 21:00 | 6 | 6 | 12 |
| 2026-10-20 22:00 | 6 | 6 | 12 |
| 2026-10-20 23:00 | 7 | 7 | 12 |
| 2026-10-21 00:00 | 7 | 7 | 12 |
| 2026-10-21 01:00 | 8 | 8 | 12 |
| 2026-10-21 02:00 | 4 | 4 | 12 |
| 2026-10-21 03:00 | 6 | 6 | 12 |
| 2026-10-21 04:00 | 5 | 5 | 12 |
| 2026-10-21 05:00 | 6 | 6 | 12 |
| 2026-10-21 06:00 | 8 | 8 | 12 |
| 2026-10-21 07:00 | 5 | 5 | 12 |
| 2026-10-21 08:00 | 3 | 3 | 12 |
| 2026-10-21 09:00 | 6 | 6 | 12 |
| 2026-10-21 10:00 | 8 | 8 | 12 |
| 2026-10-21 11:00 | 7 | 7 | 12 |
| 2026-10-21 12:00 | 7 | 7 | 12 |
| 2026-10-21 13:00 | 8 | 8 | 12 |
| 2026-10-21 14:00 | 6 | 6 | 12 |
| 2026-10-21 15:00 | 5 | 5 | 12 |
| 2026-10-21 16:00 | 5 | 5 | 12 |
| 2026-10-21 17:00 | 5 | 5 | 12 |
| 2026-10-21 18:00 | 7 | 7 | 12 |
| 2026-10-21 19:00 | 4 | 4 | 12 |
| 2026-10-21 20:00 | 5 | 5 | 12 |
| 2026-10-21 21:00 | 3 | 3 | 12 |
| 2026-10-21 22:00 | 5 | 5 | 12 |
| 2026-10-21 23:00 | 4 | 4 | 12 |
| 2026-10-22 00:00 | 4 | 4 | 12 |
| 2026-10-22 01:00 | 5 | 5 | 12 |
| 2026-10-22 02:00 | 5 | 5 | 12 |
| 2026-10-22 03:00 | 7 | 7 | 12 |
| 2026-10-22 04:00 | 4 | 4 | 12 |
| 2026-10-22 05:00 | 4 | 4 | 12 |
| 2026-10-22 06:00 | 6 | 6 | 12 |
| 2026-10-22 07:00 | 4 | 4 | 12 |
| 2026-10-22 08:00 | 3 | 3 | 12 |
| 2026-10-22 09:00 | 5 | 5 | 12 |
| 2026-10-22 10:00 | 7 | 7 | 12 |
| 2026-10-22 11:00 | 4 | 4 | 12 |
| 2026-10-22 12:00 | 4 | 4 | 12 |
| 2026-10-22 13:00 | 5 | 5 | 12 |
| 2026-10-22 14:00 | 5 | 5 | 12 |
| 2026-10-22 15:00 | 5 | 5 | 12 |
| 2026-10-22 16:00 | 4 | 4 | 12 |
| 2026-10-22 17:00 | 7 | 7 | 12 |
| 2026-10-22 18:00 | 7 | 7 | 12 |
| 2026-10-22 19:00 | 7 | 7 | 12 |
| 2026-10-22 20:00 | 7 | 7 | 12 |
| 2026-10-22 21:00 | 4 | 4 | 12 |
| 2026-10-22 22:00 | 7 | 7 | 12 |
| 2026-10-22 23:00 | 4 | 4 | 12 |
| 2026-10-23 00:00 | 5 | 5 | 12 |
| 2026-10-23 01:00 | 5 | 5 | 12 |
| 2026-10-23 02:00 | 7 | 7 | 12 |
| 2026-10-23 03:00 | 7 | 7 | 12 |
| 2026-10-23 04:00 | 5 | 5 | 12 |
| 2026-10-23 05:00 | 4 | 4 | 12 |
| 2026-10-23 06:00 | 7 | 7 | 12 |
| 2026-10-23 07:00 | 8 | 8 | 12 |
| 2026-10-23 08:00 | 8 | 8 | 12 |
| 2026-10-23 09:00 | 6 | 6 | 12 |
| 2026-10-23 10:00 | 7 | 7 | 12 |
| 2026-10-23 11:00 | 8 | 8 | 12 |
| 2026-10-23 12:00 | 6 | 6 | 12 |
| 2026-10-23 13:00 | 6 | 6 | 12 |
| 2026-10-23 14:00 | 5 | 5 | 12 |

## 4. Gerät hinter 10.0.0.253
- `ip neigh`: `14:eb:08:21:15:db`, erreichbar über **wlan0** des Pi (der Pi selbst hängt mit 10.0.0.1 per WLAN im Netz; eth0 hat 10.0.1.1).
- DNS-Name: `SDongleA-BT23…3414.home` → **Huawei SDongleA** (Smart Dongle). OUI 14:EB:08 = Huawei (OUI-Datenbank auf dem Pi nicht installiert, Zuordnung über den Hostnamen).
- Port 502 offen; 6607, 80, 443, 8080 zu. Ein Modbus über das interne Wechselrichter-WLAN würde über dessen Access Point (192.168.200.1:6607) laufen – das ist hier nicht der Fall.
- Ob der Dongle selbst per WLAN oder per Ethernet (FE) am Router hängt, ist vom Pi aus nicht eindeutig. Der Ping-Jitter (bis 88 ms) passt zu WLAN – auf mindestens einer Seite (Pi oder Dongle) ist es sicher WLAN.

## Hypothesen (nicht verifiziert) und nächste Schritte
1. **Leerlauf-Trennung**: Die Verbindung bleibt 300 s ungenutzt; der SDongle verwirft solche Sitzungen erfahrungsgemäß nach kurzer Zeit. Die erste Abfrage danach läuft auf eine tote Sitzung → Timeout → Reconnect → nächster Zyklus klappt. Passt zum ~50-%-Muster und zu den typischen Punkt-Abständen von 10–15 min in Influx.
2. **Burst ohne Pause**: 5 Getter gleichzeitig mit `commandDelay` 1 ms. Huawei empfiehlt Abstände zwischen Requests (Größenordnung 1 s) und nach dem Verbindungsaufbau eine kurze Wartezeit.
3. Ein **weiterer Client** irgendwo im LAN (nicht auf dem Pi) – vom Router/der FusionSolar-App aus prüfen.

Vorschlag (Backlog, erst nach Freigabe): ein **Modbus-Proxy** als einziger Client des Dongles (eine Verbindung, serielle Requests mit Pausen, Keepalive-Poll < 60 s, Reconnect mit Wartezeit), der die Werte per MQTT veröffentlicht. Node-RED liest dann nur noch MQTT. Alternativ zuerst minimal in Node-RED: Poll-Intervall auf 30–60 s, `commandDelay` ~1000 ms, Getter nacheinander statt parallel.
