# smarthome

Eigene Energie-/Smarthome-App (PWA + API) als Grafana-Ersatz. Kontext & Regeln: [CLAUDE.md](CLAUDE.md).

## Pi einmalig einrichten
Vom Mac aus:
```bash
scp deploy/pi/bootstrap.sh pi@<pi-host>:~
ssh pi@<pi-host> 'bash ~/bootstrap.sh'
```
Das Script führt durch: Deploy-Key → GitHub, Repo-Clone, `.env`, systemd-Timer.

## Laufender Betrieb
- Updates: automatisch alle 5 min aus `main`
- Status/Logs vom Pi: Branch [`pi-status`](../../tree/pi-status)
- Manuell: `sudo systemctl start smarthome-sync` · Logs: `journalctl -u smarthome-sync -f`
