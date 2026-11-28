# Pi Status
- time: 2026-11-28T14:42:36+01:00
- host: systapi2  (10.0.1.1)
- commit: d6c102f
- uptime: up 5 days, 21 hours, 28 minutes
- load: 0.07 0.09 0.09
- mem: 
- disk /: 20G/57G (36%)
- temp: temp=47.7'C

## docker ps
```
NAMES                          IMAGE                      STATUS                PORTS
smarthome-app                  smarthome-app:local        Up 4 days (healthy)   0.0.0.0:8090->8090/tcp, :::8090->8090/tcp
garmin_mcp_garmin-mcp_1        garmin_mcp_garmin-mcp      Up 5 days             127.0.0.1:8000->8000/tcp
influxdb                       influxdb:2.7               Up 5 days             0.0.0.0:8086->8086/tcp, :::8086->8086/tcp
grafana                        grafana/grafana            Up 5 days             0.0.0.0:3000->3000/tcp, :::3000->3000/tcp
mosquitto_docker_mosquitto_1   eclipse-mosquitto:latest   Up 5 days             0.0.0.0:1883->1883/tcp, :::1883->1883/tcp, 0.0.0.0:9001->9001/tcp, :::9001->9001/tcp
mynodered                      nodered/node-red           Up 5 days (healthy)   0.0.0.0:1880->1880/tcp, :::1880->1880/tcp
```

## app
```
{"ok":true,"version":"d6c102f","source":"influx","influx":{"ok":true},"mqtt":{"connected":true,"lastMessage":"2026-11-28T13:42:34.776Z"}}
```
Live-Snapshot (Auszug):
```
{"ts":"2026-11-28T13:42:36.060Z","power":{"pv":1820,"pvRoof":1221,"pvCarport":599,"grid":-946,"battery":-403,"house":471,"heatpump":0,"wallbox":4,"rest":467,"solarThermal":0},"battery":{"soc":38},"heatpump":{"cop":0,"heatOutput":0,"flowTemp":35.9,"dhwTop":57.1,"bufferTop":41.8},"solarThermal":{"collectorTemp":77.3},"outdoorTemp":2.7,"rooms":[{"id":"Wohnzimmer","name":"Wohnzimmer","climate":{"temp":23.1,"hum":45,"co2":534}},{"id":"Gallerie","name":"Galerie","climate":{"temp":23.4,"hum":58,"co2":610}}],"car":{"soc":53,"range":157,"home":false,"plugged":false},"appliances":[{"id":"coffeemachine","name":"Kaffee­maschine","power":5,"energyWh":1373359.641,"run":null},{"id":"freezer","name":"Gefrier­schrank","power":40,"energyWh":1484.521,"run":null},{"id":"backrohr","name":"Backrohr","power":2,"energyWh":null,"run":null},{"id":"geschirrspueler","name":"Geschirr­spüler","power":0,"energyWh":126937.535,"run":null},{"id":"router","name":"Router","power":18,"energyWh":1650.682,"run":null},{"id":"kuehlschrank","name":"Kühl­schrank","power":0,"energyWh":65162.124,"run":null},{"id":"herd","name":"Herd","power":0,"energyWh":null,"run":null},{"id":"washingmachine","name":"Wasch­maschine","power":0,"energyWh":30438.816,"run":{"source":"miele","running":false,"status":"Off","program":null,"phase":null,"remainingMin":null,"elapsedMin":0,"endsAt":null}}],"stale":[]}
```
Miele / Live-Aktivitäten (ohne Schlüssel):
```
{"configured":true,"linked":true,"connected":true,"lastEvent":"2026-11-28T13:36:11.086Z","lastError":null,"runs":{"washingmachine":{"source":"miele","running":false,"status":"Off","program":null,"phase":null,"remainingMin":null,"elapsedMin":0,"endsAt":null}}}
{"enabled":true,"state":{"geschirrspueler":{"active":false,"endsAt":null,"startedAt":null,"highSince":null,"lastHigh":null},"washingmachine":{"active":false,"endsAt":null,"startedAt":null,"highSince":null,"lastHigh":null}},"log":[{"ts":"2026-11-27T16:47:39.974Z","text":"end washingmachine"},{"ts":"2026-11-27T16:13:40.012Z","text":"end geschirrspueler"},{"ts":"2026-11-27T14:00:39.940Z","text":"update washingmachine bis 2026-11-27T16:48:25.574Z"},{"ts":"2026-11-27T13:58:40.443Z","text":"start washingmachine bis 2026-11-27T17:07:37.546Z"},{"ts":"2026-11-27T13:58:40.113Z","text":"start geschirrspueler bis 2026-11-27T15:55:09.720Z"},{"ts":"2026-11-25T19:10:09.441Z","text":"end geschirrspueler"},{"ts":"2026-11-25T16:55:09.541Z","text":"start geschirrspueler bis 2026-11-25T18:51:39.111Z"}]}
```
Summary heute:
```
{"period":"day","date":"2026-11-28","from":"2026-11-27T23:00:00.000Z","to":"2026-11-28T13:42:36.092Z","end":"2026-11-28T23:00:00.000Z","isCurrent":true,"energy":{"pv":11.286,"pvRoof":7.025,"pvCarport":4.261,"gridImport":19.672,"gridExport":2.41,"batteryCharge":2.42,"batteryDischarge":0.009,"house":26.137,"heatpump":18.172,"heatpumpHeat":69.631,"wallbox":0.088,"rest":7.877,"solarThermal":2},"appliances":[{"id":"coffeemachine","name":"Kaffee­maschine","kwh":1.5},{"id":"freezer","name":"Gefrier­schrank","kwh":0.301},{"id":"backrohr","name":"Backrohr","kwh":0.018},{"id":"geschirrspueler","name":"Geschirr­spüler","kwh":0},{"id":"router","name":"Router","kwh":0.284},{"id":"kuehlschrank","name":"Kühl­schrank","kwh":0.163},{"id":"herd","name":"Herd","kwh":0.138},{"id":"washingmachine","name":"Wasch­maschine","kwh":0}],"kpi":{"selfSufficiency":0.247,"selfConsumption":0.786,"cop":3.83},"missing":[]}
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

/var/lib/docker/volumes/61250a636f08f3fff1656b1abfadc442b11a08347b45f24cb549934ab1f180dc/_data:  | 
/home/pi/influxdb-config/influxdb.yml: /dev/mmcblk0p2 ext4   rw,noatime | 20G/57G (36%)
/media/pi/PortableSSD/influxdb-data: /dev/sda1 ext4   rw,relatime,stripe=256 | 206G/916G (24%)
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
