#!/usr/bin/env bash
# Läuft bei jedem Sync (alle 5 min) auf dem Pi: Probleme, die nur der Host sieht, als Push melden.
#  - Kernel: USB-Trennung, I/O-Fehler, EXT4-Fehler, Read-only-Remount (seit dem letzten Lauf)
#  - InfluxDB-Container neu gestartet / läuft nicht (Absturz, z. B. SIGBUS bei Plattenfehler)
#  - Datenpfad von InfluxDB nicht eingehängt
# Meldung per POST an die App (nur vom Pi selbst angenommen, siehe apps/api/src/push.ts /api/push/host).
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 0
STATE=".hostcheck"
mkdir -p "$STATE"
APP="http://localhost:8090/api/push/host"

post() { # $1 kind, $2 detail
  curl -s -m 10 -o /dev/null -X POST "$APP" -H 'Content-Type: application/json' \
    --data "$(printf '{"kind":"%s","detail":"%s"}' "$1" "$(printf '%s' "$2" | tr -d '"\\' | tr '\n' ' ' | cut -c1-200)")"
}

# --- Kernel-Meldungen seit dem letzten Lauf (beim ersten Lauf: letzte 6 min)
since="-6min"
[ -f "$STATE/kernel_since" ] && since="$(cat "$STATE/kernel_since")"
now="$(date '+%Y-%m-%d %H:%M:%S')"
klog="$(journalctl -k --since "$since" --no-pager -o short 2>/dev/null)"
echo "$now" > "$STATE/kernel_since"
io=$(printf '%s\n' "$klog" | grep -iE "I/O error|EXT4-fs error|Remounting filesystem read-only|lost sync page write" | grep -iE "sd[a-z]")
if [ -n "$io" ]; then
  post disk-io "$(printf '%s\n' "$io" | wc -l) Meldungen, zuletzt: $(printf '%s\n' "$io" | tail -1 | sed 's/^.*kernel: //')"
fi
usb=$(printf '%s\n' "$klog" | grep -iE "USB disconnect")
if [ -n "$usb" ]; then
  post usb-disconnect "$(printf '%s\n' "$usb" | tail -1 | sed 's/^.*kernel: //')"
fi

# --- InfluxDB-Container: läuft er, wurde er neu gestartet?
info=$(docker inspect -f '{{.State.Status}} {{.State.StartedAt}} {{.RestartCount}}' influxdb 2>/dev/null)
if [ -z "$info" ]; then
  post influx-down "Container influxdb nicht gefunden"
else
  status=${info%% *}
  rest=${info#* }
  if [ "$status" != "running" ]; then
    [ "$(cat "$STATE/influx_status" 2>/dev/null)" != "$status" ] && post influx-down "Container-Status: $status"
  elif [ -f "$STATE/influx_started" ] && [ "$(cat "$STATE/influx_started")" != "$rest" ]; then
    post influx-restart "neu gestartet: ${rest%% *} (Neustarts: ${rest##* })"
  fi
  echo "$status" > "$STATE/influx_status"
  [ "$status" = "running" ] && echo "$rest" > "$STATE/influx_started"
fi

# --- Datenpfad eingehängt?
for src in $(docker inspect influxdb --format '{{range .Mounts}}{{if eq .Destination "/var/lib/influxdb2"}}{{.Source}}{{end}}{{end}}' 2>/dev/null); do
  case "$src" in
    /media/*|/mnt/*)
      mp=$(findmnt -no TARGET --target "$src" 2>/dev/null)
      if [ "$mp" = "/" ] || [ -z "$mp" ]; then post disk-missing "$src liegt nicht auf der externen Platte (nicht eingehängt)"; fi
      ;;
  esac
done
exit 0
