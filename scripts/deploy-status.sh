#!/usr/bin/env bash
# Zeigt, wo ein Commit gerade steckt: main (gepusht) → deploy (CI grün) → live (Pi, Port 8090).
# Aufruf: bash scripts/deploy-status.sh   (auf dem Pi; braucht Netz zu origin und localhost:8090)
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

git fetch -q origin main deploy 2>/dev/null
MAIN=$(git rev-parse --short origin/main)
DEPLOY=$(git rev-parse --short origin/deploy)
LIVE=$(curl -s -m 5 localhost:8090/api/health | sed -n 's/.*"version":"\([^"]*\)".*/\1/p')
LIVE=${LIVE:-unbekannt}

echo "main    $MAIN  $(git log -1 --format=%cr origin/main)"
echo "deploy  $DEPLOY  $(git log -1 --format=%cr origin/deploy)  (CI grün, Timer übernimmt)"
echo "live    $LIVE"

if [ "$LIVE" = "$MAIN" ]; then
  echo "→ live = main, alles ist draußen."
elif [ "$DEPLOY" != "$MAIN" ]; then
  echo "→ main liegt vor deploy: CI läuft noch oder ist rot (Actions-Tab prüfen)."
  git log --oneline origin/deploy..origin/main
else
  echo "→ deploy = main, der Pi hat den Stand noch nicht übernommen (Timer alle 5 min) oder der Build schlägt fehl (deploy/pi/.last_build.log)."
fi
