#!/usr/bin/env bash
# Läuft alle 5 min per systemd-Timer auf dem Pi.
#  1. Branch "deploy" holen (nur Stände mit grüner CI; Fallback: main, solange es deploy nicht gibt)
#  2. Bei neuem Stand oder gestopptem Container: docker compose up -d --build
#  3. Status-Report in Branch 'pi-status' pushen (Claude liest ihn remote)
# Alles in main(): bash liest die Funktion komplett ein, bevor git das Script selbst aktualisiert.
set -uo pipefail

main() {
  cd "$(dirname "$0")/../.." || exit 1
  local APP_DIR; APP_DIR="$(pwd)"
  log() { echo "[$(date -Iseconds)] $*"; }

  local BRANCH=deploy
  git ls-remote --exit-code --heads origin deploy >/dev/null 2>&1 || BRANCH=main

  local BEFORE AFTER
  BEFORE=$(git rev-parse HEAD)
  if git fetch -q origin "$BRANCH"; then
    git checkout -q -B "$BRANCH" "origin/$BRANCH" && git reset -q --hard "origin/$BRANCH"
  else
    log "WARN: git fetch fehlgeschlagen"
  fi
  AFTER=$(git rev-parse HEAD)
  [ "$BEFORE" != "$AFTER" ] && log "Update ($BRANCH): ${BEFORE:0:7} -> ${AFTER:0:7}"

  if [ -f docker-compose.yml ]; then
    local running
    running=$(docker compose ps --status running -q 2>/dev/null | wc -l)
    if [ "$BEFORE" != "$AFTER" ] || [ "$running" -eq 0 ]; then
      log "Build + Start (Version ${AFTER:0:7}) ..."
      if APP_VERSION="${AFTER:0:7}" docker compose up -d --build --remove-orphans > "$APP_DIR/.last_build.log" 2>&1; then
        log "OK"
        docker image prune -f >/dev/null 2>&1
        # Report erst, wenn die App antwortet (max. 60 s)
        for _ in $(seq 12); do curl -sf -m 3 http://localhost:8090/api/health >/dev/null && break; sleep 5; done
      else
        log "FEHLER beim Build/Start – siehe .last_build.log (im pi-status Report)"
      fi
    fi
  fi

  # Report höchstens alle 15 min oder sofort nach einem Update
  local STAMP="$APP_DIR/.last_report"
  if [ "$BEFORE" != "$AFTER" ] || [ ! -f "$STAMP" ] || [ -n "$(find "$STAMP" -mmin +15)" ]; then
    bash deploy/pi/report.sh && touch "$STAMP"
  fi
}

main "$@"
exit
