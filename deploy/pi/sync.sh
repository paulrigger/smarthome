#!/usr/bin/env bash
# Läuft alle 5 min per systemd-Timer auf dem Pi.
#  1. git pull (main)
#  2. falls docker-compose.yml existiert: Images ziehen, Container aktualisieren
#  3. Status-Report in Branch 'pi-status' pushen (Claude liest ihn remote)
set -uo pipefail
cd "$(dirname "$0")/../.."
APP_DIR="$(pwd)"

log() { echo "[$(date -Iseconds)] $*"; }

BEFORE=$(git rev-parse HEAD)
git fetch -q origin main && git merge -q --ff-only origin/main || log "WARN: git pull fehlgeschlagen"
AFTER=$(git rev-parse HEAD)
[ "$BEFORE" != "$AFTER" ] && log "Update: ${BEFORE:0:7} -> ${AFTER:0:7}"

if [ -f docker-compose.yml ]; then
  docker compose pull -q && docker compose up -d --remove-orphans 2>&1 | tail -5 \
    || log "WARN: docker compose fehlgeschlagen"
fi

# Report höchstens alle 15 min oder sofort nach einem Update
STAMP="$APP_DIR/.last_report"
if [ "$BEFORE" != "$AFTER" ] || [ ! -f "$STAMP" ] || [ -n "$(find "$STAMP" -mmin +15)" ]; then
  bash deploy/pi/report.sh && touch "$STAMP"
fi
