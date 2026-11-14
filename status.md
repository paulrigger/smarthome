# Pi Status
- time: 2026-11-14T23:28:01+01:00
- host: systapi2  (10.0.1.1)
- commit: 049ab63
- uptime: up 7 weeks, 2 days, 17 hours, 27 minutes
- load: 0.83 0.73 0.57
- mem: 
- disk /: 19G/57G (35%)
- temp: temp=48.8'C

## docker ps
```
NAMES                          IMAGE                      STATUS                 PORTS
smarthome-app                  smarthome-app:local        Up 8 hours (healthy)   0.0.0.0:8090->8090/tcp, :::8090->8090/tcp
garmin_mcp_garmin-mcp_1        garmin_mcp_garmin-mcp      Up 7 weeks             127.0.0.1:8000->8000/tcp
influxdb                       influxdb:2.7               Up 5 days              0.0.0.0:8086->8086/tcp, :::8086->8086/tcp
grafana                        grafana/grafana            Up 3 weeks             0.0.0.0:3000->3000/tcp, :::3000->3000/tcp
mosquitto_docker_mosquitto_1   eclipse-mosquitto:latest   Up 7 weeks             0.0.0.0:1883->1883/tcp, :::1883->1883/tcp, 0.0.0.0:9001->9001/tcp, :::9001->9001/tcp
mynodered                      nodered/node-red           Up 12 days (healthy)   0.0.0.0:1880->1880/tcp, :::1880->1880/tcp
```

## app
```
{"ok":true,"version":"049ab63","source":"influx","influx":{"ok":true},"mqtt":{"connected":true,"lastMessage":"2026-11-14T22:28:01.107Z"}}
```
Live-Snapshot (Auszug):
```
{"ts":"2026-11-14T22:28:00.855Z","power":{"pv":0,"pvRoof":0,"pvCarport":0,"grid":334,"battery":-24,"house":310,"heatpump":0,"wallbox":6,"rest":304,"solarThermal":0},"battery":{"soc":5},"heatpump":{"cop":0,"heatOutput":0,"flowTemp":32.2,"dhwTop":50.8,"bufferTop":36.6},"solarThermal":{"collectorTemp":5.5},"outdoorTemp":-1,"rooms":[{"id":"Wohnzimmer","name":"Wohnzimmer","climate":{"temp":22.4,"hum":52,"co2":748}},{"id":"Gallerie","name":"Galerie","climate":{"temp":21.4,"hum":60,"co2":839}}],"car":{"soc":50,"range":178,"home":true,"plugged":false},"appliances":[{"id":"coffeemachine","name":"Kaffee­maschine","power":0,"energyWh":1355339.329,"run":null},{"id":"freezer","name":"Gefrier­schrank","power":51,"energyWh":7340.938,"run":null},{"id":"backrohr","name":"Backrohr","power":0,"energyWh":null,"run":null},{"id":"geschirrspueler","name":"Geschirr­spüler","power":0,"energyWh":119067.76,"run":null},{"id":"router","name":"Router","power":18,"energyWh":5488.167,"run":null},{"id":"kuehlschrank","name":"Kühl­schrank","power":51,"energyWh":61571.64,"run":null},{"id":"herd","name":"Herd","power":0,"energyWh":null,"run":null},{"id":"washingmachine","name":"Wasch­maschine","power":1,"energyWh":27819.727,"run":{"source":"miele","running":false,"status":"Off","program":null,"phase":null,"remainingMin":null,"elapsedMin":0,"endsAt":null}}],"stale":[]}
```
Miele / Live-Aktivitäten (ohne Schlüssel):
```
{"configured":true,"linked":true,"connected":true,"lastEvent":"2026-11-14T14:06:46.423Z","lastError":null,"runs":{"washingmachine":{"source":"miele","running":false,"status":"Off","program":null,"phase":null,"remainingMin":null,"elapsedMin":0,"endsAt":null}}}
{"enabled":true,"state":{"geschirrspueler":{"active":false,"endsAt":null,"startedAt":null,"highSince":null,"lastHigh":null},"washingmachine":{"active":false,"endsAt":null,"startedAt":null,"highSince":null,"lastHigh":null}},"log":[{"ts":"2026-11-14T16:33:43.666Z","text":"end geschirrspueler"},{"ts":"2026-11-14T16:11:43.700Z","text":"update geschirrspueler bis 2026-11-14T16:26:43.458Z"},{"ts":"2026-11-14T14:15:43.823Z","text":"start geschirrspueler bis 2026-11-14T16:12:43.424Z"}]}
```
Summary heute:
```
{"period":"day","date":"2026-11-14","from":"2026-11-13T23:00:00.000Z","to":"2026-11-14T22:28:01.171Z","end":"2026-11-14T23:00:00.000Z","isCurrent":true,"energy":{"pv":27.303,"pvRoof":12.597,"pvCarport":14.706,"gridImport":39.337,"gridExport":2.758,"batteryCharge":7.28,"batteryDischarge":6.134,"house":62.736,"heatpump":21.11,"heatpumpHeat":89.689,"wallbox":18.705,"rest":22.92,"solarThermal":4},"appliances":[{"id":"coffeemachine","name":"Kaffee­maschine","kwh":1.293},{"id":"freezer","name":"Gefrier­schrank","kwh":0.655},{"id":"backrohr","name":"Backrohr","kwh":1.888},{"id":"geschirrspueler","name":"Geschirr­spüler","kwh":2.537},{"id":"router","name":"Router","kwh":0.406},{"id":"kuehlschrank","name":"Kühl­schrank","kwh":0.278},{"id":"herd","name":"Herd","kwh":4.953},{"id":"washingmachine","name":"Wasch­maschine","kwh":0}],"kpi":{"selfSufficiency":0.373,"selfConsumption":0.899,"cop":4.25},"missing":[]}
```

## influx
- url: http://10.0.0.1:8086  org: paul  bucket: smarthome  token gesetzt: ja
```
{"name":"influxdb", "message":"ready for queries and writes", "status":"pass", "checks":[], "version": "v2.7.11", "commit": "fbf5d4ab5e"}

```
v1-Kompatibilität (InfluxQL, DBRP-Mapping):
```
{"results":[{"statement_id":0,"series":[{"name":"measurements","columns":["name"],"values":[["Systa"],["Tarif-Data"],["WP"],["battery"],["boltdb_reads_total"],["boltdb_writes_total"],["car"],["climatesensor"],["go_gc_duration_seconds"],["go_goroutines"],["go_info"],["go_memstats_alloc_bytes"],["go_memstats_alloc_bytes_total"],["go_memstats_buck_hash_sys_bytes"],["go_memstats_frees_total"],["go_memstats_gc_sys_bytes"],["go_memstats_heap_alloc_bytes"],["go_memstats_heap_idle_bytes"],["go_memstats_heap_inuse_bytes"],["go_memstats_heap_objects"],["go_memstats_heap_released_bytes"],["go_memstats_heap_sys_bytes"],["go_memstats_last_gc_time_seconds"],["go_memstats_lookups_total"],["go_memstats_mallocs_total"],["go_memstats_mcache_inuse_bytes"],["go_memstats_mcache_sys_bytes"],["go_memstats_mspan_inuse_bytes"],["go_memstats_mspan_sys_bytes"],["go_memstats_next_gc_bytes"],["go_memstats_other_sys_bytes"],["go_memstats_stack_inuse_bytes"],["go_memstats_stack_sys_bytes"],["go_memstats_sys_bytes"],["go_threads"],["http_api_request_duration_seconds"],["http_api_requests_total"],["http_query_request_bytes"],["http_query_request_count"],["http_query_response_bytes"],["http_write_request_bytes"],["http_write_request_count"],["http_write_response_bytes"],["influxdb_buckets_total"],["influxdb_dashboards_total"],["influxdb_info"],["influxdb_organizations_total"],["influxdb_remotes_total"],["influxdb_replications_total"],["influxdb_scrapers_total"],["influxdb_telegrafs_total"],["influxdb_tokens_total"],["influxdb_uptime_seconds"],["influxdb_users_total"],["influxql_service_executing_duration_seconds"],["influxql_service_requests_total"],["powersensor"],["qc_all_active"],["qc_all_duration_seconds"],["qc_compiling_active"],["qc_compiling_duration_seconds"],["qc_executing_active"],["qc_executing_duration_seconds"],["qc_memory_unused_bytes"],["qc_queueing_active"],["qc_queueing_duration_seconds"],["qc_requests_total"],["query_influxdb_source_read_request_duration_seconds"],["service_bucket_
```

## Speicher
```
/var/lib/docker/volumes/61250a636f08f3fff1656b1abfadc442b11a08347b45f24cb549934ab1f180dc/_data -> /etc/influxdb2
/home/pi/influxdb-config/influxdb.yml -> /etc/influxdb2/config.yml
/media/pi/PortableSSD/influxdb-data -> /var/lib/influxdb2

/media/pi/PortableSSD/influxdb-data: /dev/sda1 ext4   rw,relatime,stripe=256 | 202G/916G (24%)
/var/lib/docker/volumes/61250a636f08f3fff1656b1abfadc442b11a08347b45f24cb549934ab1f180dc/_data:  | 
/home/pi/influxdb-config/influxdb.yml: /dev/mmcblk0p2 ext4   rw,noatime | 19G/57G (35%)
NAME          SIZE TYPE MOUNTPOINT            MODEL
sda         931,5G disk                       Portable SSD
└─sda1      931,5G part /media/pi/PortableSSD 
mmcblk0      58,2G disk                       
├─mmcblk0p1   512M part /boot/firmware        
└─mmcblk0p2  57,7G part /                     
Kernel (USB/Platte, letzte 24 h):
```

## Zugriff von außen
- caddy: active
- sites: paulrigger.synology.me, paulrigger.ddnsfree.com;energie.paulrigger.ddnsfree.com;avoir.paulrigger.ddnsfree.com;anlagen.paulrigger.ddnsfree.com
- app-host: https://energie.paulrigger.ddnsfree.com
- DNS zeigt auf aktuelle öffentliche IP: ja
- zertifikat gültig bis: Jan 20 18:21:48 2027 GMT
- https /api/live ohne Login (erwartet 401): 401
- app-login von außen: {"required":true,"ok":false}
- tailscale: online
