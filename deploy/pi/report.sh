#!/usr/bin/env bash
# Sammelt Diagnose-Infos (OHNE Secrets) und pusht sie als einzelnen Commit
# in den Branch 'pi-status'. So kann Claude den Zustand im Heimnetz remote lesen.
set -uo pipefail
cd "$(dirname "$0")/../.."
APP_DIR="$(pwd)"
set -a; [ -f .env ] && . ./.env; set +a

# Nach einem Neustart kurz auf die App warten (sonst "nicht erreichbar" im Report)
for _ in $(seq 1 30); do curl -sf -m 2 http://localhost:8090/api/health >/dev/null && break; sleep 2; done

OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

INFLUX_URL="${INFLUX_URL:-http://10.0.0.1:8086}"
INFLUX_ORG="${INFLUX_ORG:-paul}"
INFLUX_BUCKET="${INFLUX_BUCKET:-smarthome}"
AUTH=(-H "Authorization: Token ${INFLUX_TOKEN:-}")

flux() {  # $1 = Flux-Query -> CSV
  curl -s -m 60 "${AUTH[@]}" -H "Content-Type: application/vnd.flux" -H "Accept: application/csv" \
    -X POST "$INFLUX_URL/api/v2/query?org=$INFLUX_ORG" --data-binary "$1"
}

{
  echo "# Pi Status"
  echo "- time: $(date -Iseconds)"
  echo "- host: $(hostname)  ($(hostname -I 2>/dev/null | awk '{print $1}'))"
  echo "- commit: $(git rev-parse --short HEAD)"
  echo "- uptime: $(uptime -p 2>/dev/null)"
  echo "- load: $(cut -d' ' -f1-3 /proc/loadavg)"
  echo "- mem: $(free -m | awk '/Mem:/{print $3"/"$2" MB used"}')"
  echo "- disk /: $(df -h / | awk 'NR==2{print $3"/"$2" ("$5")"}')"
  echo "- temp: $(vcgencmd measure_temp 2>/dev/null || cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null)"
  echo
  echo "## docker ps"
  echo '```'
  docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' 2>&1
  echo '```'
  echo
  echo "## app"
  echo '```'
  curl -s -m 5 http://localhost:8090/api/health 2>&1 || echo "app nicht erreichbar"; echo
  echo '```'
  echo "Live-Snapshot (Auszug):"
  echo '```'
  curl -s -m 15 http://localhost:8090/api/live 2>&1 | head -c 3000; echo
  echo '```'
  echo "Miele / Live-Aktivitäten (ohne Schlüssel):"
  echo '```'
  curl -s -m 10 http://localhost:8090/api/miele 2>&1 | head -c 1500; echo
  curl -s -m 10 http://localhost:8090/api/activities 2>&1 | head -c 1500; echo
  echo '```'
  echo "Summary heute:"
  echo '```'
  curl -s -m 30 "http://localhost:8090/api/summary?period=day" 2>&1 | head -c 3000; echo
  echo '```'
  echo
  echo "## influx"
  echo "- url: $INFLUX_URL  org: $INFLUX_ORG  bucket: $INFLUX_BUCKET  token gesetzt: $([ -n "${INFLUX_TOKEN:-}" ] && echo ja || echo NEIN)"
  echo '```'
  curl -s -m 5 "$INFLUX_URL/health" 2>&1; echo
  echo '```'
  echo "v1-Kompatibilität (InfluxQL, DBRP-Mapping):"
  echo '```'
  curl -s -m 10 "${AUTH[@]}" -G "$INFLUX_URL/query" \
    --data-urlencode "db=$INFLUX_BUCKET" --data-urlencode "q=SHOW MEASUREMENTS" 2>&1 | head -c 2000; echo
  echo '```'
  echo
  # Datenhaltung: wo liegen die InfluxDB-Daten, ist die (externe) Platte da, Kernel-Fehler zu USB/Platte
  echo "## Speicher"
  echo '```'
  docker inspect influxdb --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{println}}{{end}}' 2>&1
  for src in $(docker inspect influxdb --format '{{range .Mounts}}{{.Source}} {{end}}' 2>/dev/null); do
    echo "$src: $(findmnt -no SOURCE,FSTYPE,OPTIONS --target "$src" 2>/dev/null | cut -c1-120) | $(df -h "$src" 2>/dev/null | awk 'NR==2{print $3"/"$2" ("$5")"}')"
  done
  lsblk -o NAME,SIZE,TYPE,MOUNTPOINT,MODEL 2>/dev/null
  echo "Kernel (USB/Platte, letzte 24 h):"
  journalctl -k --since "-24h" --no-pager 2>/dev/null | grep -iE "usb.*disconnect|I/O error|EXT4-fs error|read-only|reset (high|super)-speed|uas" | tail -15
  echo '```'
  echo
  # Caddy (Port 80/443 per Router-Weiterleitung) terminiert TLS, Basic Auth für die App.
  # Nur Site-Adressen ausgeben – Pfade/Hashes in der Caddyfile sind Secrets.
  ext_host="${EXTERNAL_HOST:-energie.paulrigger.ddnsfree.com}"
  echo "## Zugriff von außen"
  echo "- caddy: $(systemctl is-active caddy 2>&1)"
  echo "- sites: $(grep -E '^[^[:space:]#].*\{[[:space:]]*$' /etc/caddy/Caddyfile 2>/dev/null | sed 's/[[:space:]]*{[[:space:]]*$//' | paste -sd ';' -)"
  echo "- app-host: https://$ext_host"
  pub_ip=$(curl -s -m 5 https://api.ipify.org 2>/dev/null)
  dns_ip=$(getent ahostsv4 "$ext_host" 2>/dev/null | awk 'NR==1{print $1}')
  echo "- DNS zeigt auf aktuelle öffentliche IP: $([ -n "$pub_ip" ] && [ "$pub_ip" = "$dns_ip" ] && echo ja || echo "NEIN (dns=${dns_ip:-?})")"
  echo "- zertifikat gültig bis: $(echo | openssl s_client -connect 127.0.0.1:443 -servername "$ext_host" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)"
  echo "- https /api/live ohne Login (erwartet 401): $(curl -s -o /dev/null -m 10 -w '%{http_code}' "https://$ext_host/api/live" 2>&1)"
  echo "- app-login von außen: $(curl -s -m 10 "https://$ext_host/api/auth" 2>&1 | head -c 200)"
  echo "- tailscale: $(tailscale status >/dev/null 2>&1 && echo online || echo offline)"
} > "$OUT/status.md"

# Inventur: letzter Wert jeder Serie (measurement/device/field) der letzten 24 h
flux "from(bucket: \"$INFLUX_BUCKET\")
  |> range(start: -24h)
  |> last()
  |> drop(columns: [\"_start\", \"_stop\", \"result\", \"table\"])" > "$OUT/influx_series_last24h.csv" 2>&1

# Alle Measurements über die gesamte Historie + ältester Zeitpunkt (Datenbasis für Monats-/Jahreswerte)
flux "import \"influxdata/influxdb/schema\"
schema.measurements(bucket: \"$INFLUX_BUCKET\", start: -10y)" > "$OUT/influx_measurements_all.csv" 2>&1

# Analyse Haushalt-Rest (nicht einzeln gemessener Verbrauch): höchstens alle 6 h neu, sonst Cache
# – Energie je Stunde für die letzten 14 Tage, 5-min-Leistung für die letzten 3 Tage, Monate des laufenden Jahres
ANA="$APP_DIR/.analysis"
if [ ! -f "$ANA/stamp" ] || [ -n "$(find "$ANA/stamp" -mmin +360 2>/dev/null)" ]; then
  mkdir -p "$ANA"
  api() { curl -s -m 120 "http://localhost:8090/api/series?$1"; }
  for i in $(seq 1 14); do
    d=$(date -d "-$i day" +%F)
    api "kind=energy&keys=house,rest,appliances,unmeasured,heatpump,wallbox&period=day&date=$d" > "$ANA/energy_$d.json"
  done
  for i in $(seq 0 2); do
    d=$(date -d "-$i day" +%F)
    api "kind=gauge&keys=house.power,rest.power,appliances.power,unmeasured.power,heatpump.power,wallbox.power&period=day&date=$d" > "$ANA/power_$d.json"
  done
  api "kind=energy&keys=house,rest,appliances,unmeasured,heatpump,wallbox&period=year&date=$(date +%F)" > "$ANA/months_$(date +%Y).json"
  # einzelne Geräte (Tagessummen 14 Tage) – zeigt, welche Steckdose wie viel beiträgt
  api "kind=energy&keys=appliance.coffeemachine,appliance.freezer,appliance.backrohr,appliance.geschirrspueler,appliance.router,appliance.kuehlschrank,appliance.herd,appliance.washingmachine&period=month&date=$(date +%F)" > "$ANA/appliances_month.json"
  date -Iseconds > "$ANA/stamp"
fi
mkdir -p "$OUT/analysis" && cp "$ANA"/* "$OUT/analysis/" 2>/dev/null
# alte Tagesdateien aus dem Cache entfernen
find "$ANA" -name '*_20*.json' -mtime +15 -delete 2>/dev/null

# Logs der App (falls laufend)
if [ -f docker-compose.yml ]; then
  docker compose logs --tail 200 --no-color > "$OUT/app_logs.txt" 2>&1
fi
journalctl -u smarthome-sync.service -n 100 --no-pager > "$OUT/sync_journal.txt" 2>&1
[ -f .last_build.log ] && tail -n 150 .last_build.log > "$OUT/last_build.log"

# Optional: kurzer MQTT-Sniff (nur Topics, 10 s)
if command -v mosquitto_sub >/dev/null && [ -n "${MQTT_HOST:-}" ]; then
  timeout 10 mosquitto_sub -h "$MQTT_HOST" -p "${MQTT_PORT:-1883}" \
    ${MQTT_USERNAME:+-u "$MQTT_USERNAME"} ${MQTT_PASSWORD:+-P "$MQTT_PASSWORD"} \
    -t '#' -v 2>/dev/null | cut -c1-300 | sort -u -k1,1 > "$OUT/mqtt_topics_10s.txt"
fi

# Manuell abgelegte Berichte (docs/ im Branch pi-status, z.B. Diagnosen) bleiben über Reports hinweg erhalten
if git fetch -q origin pi-status 2>/dev/null && git cat-file -e FETCH_HEAD:docs 2>/dev/null; then
  git archive FETCH_HEAD docs | tar -x -C "$OUT"
fi

# Sicherheitsnetz: niemals Secrets pushen
for s in "${INFLUX_TOKEN:-}" "${MQTT_PASSWORD:-}" "${AUTH_PASSWORD:-}" "${AUTH_SECRET:-}"; do
  [ -n "$s" ] && grep -rlF -- "$s" "$OUT" | xargs -r sed -i "s|$(printf '%s' "$s" | sed 's/[|&/\]/\\&/g')|<redacted>|g"
done

# Als Einzel-Commit (orphan, force) in Branch pi-status pushen -> keine History-Aufblähung
WT="$(mktemp -d)"
git -C "$WT" init -q -b pi-status
cp -r "$OUT"/. "$WT"/
git -C "$WT" -c user.name=raspberry-pi -c user.email=pi@smarthome.local add -A
git -C "$WT" -c user.name=raspberry-pi -c user.email=pi@smarthome.local commit -qm "status $(date -Iseconds)"
git -C "$WT" push -qf "$(git remote get-url origin)" pi-status 2>&1 | tail -2
rm -rf "$WT"
echo "report pushed"
