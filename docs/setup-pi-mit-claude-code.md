# Pi-Setup mit Claude Code (lokal am Mac, im Heimnetz)

Einmalig. Danach laufen Updates automatisch und Claude liest den Pi-Zustand über Branch `pi-status`.

## Voraussetzungen am Mac
```bash
npm install -g @anthropic-ai/claude-code   # falls noch nicht installiert
gh auth status || gh auth login            # GitHub CLI, für Deploy-Key
ssh pi@10.0.0.1 'echo ok'                  # SSH ohne Passwort? sonst: ssh-copy-id pi@10.0.0.1
```

## Start
```bash
cd ~/Developer && git clone https://github.com/paulrigger/smarthome.git && cd smarthome
claude
```

## Prompt für Claude Code (einfügen)
```
Richte den Raspberry Pi für dieses Repo ein. Lies zuerst CLAUDE.md und deploy/pi/bootstrap.sh.
Pi mit InfluxDB/Docker: pi@10.0.0.1 (falls nicht erreichbar: frag mich nach Host).

Schritt 1 – Read-only Influx-Token:
- per ssh den Influx-Container finden (docker ps | grep -i influx)
- docker exec <container> influx auth create --org paul --read-buckets --description "smarthome-app read-only"
- Token NICHT im Chat ausgeben, nur in einer Shell-Variable halten.
- Prüfen: curl mit dem Token gegen http://10.0.0.1:8086/api/v2/buckets liefert "smarthome".

Schritt 2 – Bootstrap:
- scp deploy/pi/bootstrap.sh pi@10.0.0.1:~
- MQTT-Passwort aus ~/Developer/e-Ink/e-ink/mqtt_config.py (MQTT_PASSWORD) lesen, nicht ausgeben.
- ssh pi@10.0.0.1 "NONINTERACTIVE=1 INFLUX_TOKEN=... MQTT_PASSWORD=... bash ~/bootstrap.sh"
- Exit 3 = Deploy-Key fehlt: Public Key aus der Ausgabe mit
  gh repo deploy-key add <datei> --repo paulrigger/smarthome --title raspberry-pi --allow-write
  eintragen, dann bootstrap erneut ausführen.
- Am Ende prüfen: git fetch origin pi-status && git show origin/pi-status:status.md
  Fasse mir zusammen: Influx-Health, v1/InfluxQL ok?, Anzahl Serien in influx_series_last24h.csv,
  Auffälligkeiten.

Regeln: nichts in InfluxDB schreiben, keine bestehenden Container/Node-RED anfassen,
keine Secrets committen oder ausgeben. Vor sudo-Schritten kurz bestätigen lassen.
```

## Ergebnis
- `~/smarthome` auf dem Pi, `.env` mit read-only Token
- systemd-Timer `smarthome-sync` (alle 5 min)
- Branch `pi-status` auf GitHub mit Status + Influx-Inventur
