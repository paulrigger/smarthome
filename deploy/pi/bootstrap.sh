#!/usr/bin/env bash
# Einmalige Einrichtung des Raspberry Pi für die Smarthome-App.
# Idempotent: kann beliebig oft erneut ausgeführt werden.
#
#   curl -fsSL https://raw.githubusercontent.com/... geht NICHT (privates Repo) ->
#   Datei per scp vom Mac kopieren oder Inhalt einfügen, dann:
#   bash bootstrap.sh
set -euo pipefail
# Nicht-interaktiv (z.B. durch Claude Code):
#   NONINTERACTIVE=1 INFLUX_TOKEN=... MQTT_PASSWORD=... bash bootstrap.sh
#   Exit-Code 3 = Deploy-Key noch nicht auf GitHub eingetragen (Public Key steht in der Ausgabe)
NONINTERACTIVE="${NONINTERACTIVE:-0}"

REPO="paulrigger/smarthome"
APP_DIR="${APP_DIR:-$HOME/smarthome}"
KEY="$HOME/.ssh/smarthome_deploy"
HOST_ALIAS="github-smarthome"

echo "== 1/5 Voraussetzungen"
for c in git curl docker; do
  command -v "$c" >/dev/null || { echo "FEHLT: $c"; exit 1; }
done
docker compose version >/dev/null 2>&1 || { echo "FEHLT: docker compose plugin"; exit 1; }
echo "ok: git, curl, docker, docker compose"

echo "== 2/5 Deploy-Key"
mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"
if [ ! -f "$KEY" ]; then
  ssh-keygen -t ed25519 -N "" -C "smarthome-pi-deploy" -f "$KEY" >/dev/null
fi
if ! grep -q "Host $HOST_ALIAS" "$HOME/.ssh/config" 2>/dev/null; then
  cat >> "$HOME/.ssh/config" <<EOF

Host $HOST_ALIAS
  HostName github.com
  User git
  IdentityFile $KEY
  IdentitiesOnly yes
EOF
  chmod 600 "$HOME/.ssh/config"
fi
ssh-keyscan -t ed25519 github.com 2>/dev/null >> "$HOME/.ssh/known_hosts"
sort -u -o "$HOME/.ssh/known_hosts" "$HOME/.ssh/known_hosts"

until ssh -T "$HOST_ALIAS" 2>&1 | grep -q "successfully authenticated"; do
  echo
  echo ">>> Diesen Public Key auf GitHub eintragen:"
  echo ">>> https://github.com/$REPO/settings/keys/new"
  echo ">>> Titel: raspberry-pi   |   [x] Allow write access   (nötig für Status-Reports)"
  echo
  cat "$KEY.pub"
  echo
  [ "$NONINTERACTIVE" = 1 ] && exit 3
  read -rp "Eingetragen? Enter drücken zum Testen ... "
done
echo "ok: GitHub-Zugriff"

echo "== 3/5 Repo"
if [ ! -d "$APP_DIR/.git" ]; then
  git clone "$HOST_ALIAS:$REPO.git" "$APP_DIR"
else
  git -C "$APP_DIR" pull --ff-only
fi
git -C "$APP_DIR" config user.name  "raspberry-pi"
git -C "$APP_DIR" config user.email "pi@smarthome.local"

echo "== 4/5 .env"
if [ ! -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
fi
setenv() {  # $1=KEY $2=VALUE -> in .env setzen, falls Wert übergeben
  [ -z "$2" ] && return 0
  local v; v=$(printf '%s' "$2" | sed 's/[|&\\]/\\&/g')
  sed -i "s|^$1=.*|$1=$v|" "$APP_DIR/.env"
}
setenv INFLUX_TOKEN  "${INFLUX_TOKEN:-}"
setenv INFLUX_URL    "${INFLUX_URL:-}"
setenv MQTT_PASSWORD "${MQTT_PASSWORD:-}"
if ! grep -q '^INFLUX_TOKEN=.\+' "$APP_DIR/.env"; then
  echo ">>> INFLUX_TOKEN fehlt in $APP_DIR/.env"
  [ "$NONINTERACTIVE" = 1 ] && exit 4
  echo ">>>   nano $APP_DIR/.env"
  read -rp "Eingetragen? Enter ... "
fi

echo "== 5/5 systemd-Timer (alle 5 min: update + status report)"
sudo tee /etc/systemd/system/smarthome-sync.service >/dev/null <<EOF
[Unit]
Description=Smarthome App: git pull, deploy, status report
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=oneshot
User=$USER
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/env bash $APP_DIR/deploy/pi/sync.sh
EOF
sudo tee /etc/systemd/system/smarthome-sync.timer >/dev/null <<EOF
[Unit]
Description=Smarthome App sync alle 5 min

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
Persistent=true

[Install]
WantedBy=timers.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now smarthome-sync.timer

echo
echo "== Erster Lauf"
sudo systemctl start smarthome-sync.service || true
journalctl -u smarthome-sync.service -n 30 --no-pager
echo
echo "FERTIG. Status landet im Branch 'pi-status': https://github.com/$REPO/tree/pi-status"
