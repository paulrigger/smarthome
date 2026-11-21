# Pi Status
- time: 2026-11-21T14:08:19+01:00
- host: systapi2  (10.0.1.1)
- commit: d36d3b1
- uptime: up 8 weeks, 2 days, 8 hours, 8 minutes
- load: 1.01 0.88 0.90
- mem: 
- disk /: 20G/57G (36%)
- temp: temp=50.5'C

## docker ps
```
NAMES                          IMAGE                      STATUS                 PORTS
smarthome-app                  smarthome-app:local        Up 4 days (healthy)    0.0.0.0:8090->8090/tcp, :::8090->8090/tcp
garmin_mcp_garmin-mcp_1        garmin_mcp_garmin-mcp      Up 8 weeks             127.0.0.1:8000->8000/tcp
influxdb                       influxdb:2.7               Up 11 days             0.0.0.0:8086->8086/tcp, :::8086->8086/tcp
grafana                        grafana/grafana            Up 4 weeks             0.0.0.0:3000->3000/tcp, :::3000->3000/tcp
mosquitto_docker_mosquitto_1   eclipse-mosquitto:latest   Up 8 weeks             0.0.0.0:1883->1883/tcp, :::1883->1883/tcp, 0.0.0.0:9001->9001/tcp, :::9001->9001/tcp
mynodered                      nodered/node-red           Up 2 weeks (healthy)   0.0.0.0:1880->1880/tcp, :::1880->1880/tcp
```

## app
```
{"ok":true,"version":"d36d3b1","source":"influx","influx":{"ok":true},"mqtt":{"connected":true,"lastMessage":"2026-11-21T13:08:18.645Z"}}
```
Live-Snapshot (Auszug):
```
{"ts":"2026-11-21T13:08:19.411Z","power":{"pv":1366,"pvRoof":484,"pvCarport":882,"grid":1565,"battery":-21,"house":2910,"heatpump":1200,"wallbox":6,"rest":1704,"solarThermal":0},"battery":{"soc":6},"heatpump":{"cop":6.78,"heatOutput":8100,"flowTemp":32.2,"dhwTop":42.7,"bufferTop":29.8},"solarThermal":{"collectorTemp":22.2},"outdoorTemp":8.7,"rooms":[{"id":"Wohnzimmer","name":"Wohnzimmer","climate":{"temp":20.5,"hum":56,"co2":637}},{"id":"Gallerie","name":"Galerie","climate":{"temp":20,"hum":62,"co2":588}}],"car":{"soc":76,"range":267,"home":true,"plugged":false},"appliances":[{"id":"coffeemachine","name":"Kaffee­maschine","power":0,"energyWh":1363137.802,"run":null},{"id":"freezer","name":"Gefrier­schrank","power":47,"energyWh":1156.681,"run":null},{"id":"backrohr","name":"Backrohr","power":0,"energyWh":null,"run":null},{"id":"geschirrspueler","name":"Geschirr­spüler","power":0,"energyWh":122892.911,"run":null},{"id":"router","name":"Router","power":19,"energyWh":1208.857,"run":null},{"id":"kuehlschrank","name":"Kühl­schrank","power":53,"energyWh":63286.695,"run":null},{"id":"herd","name":"Herd","power":0,"energyWh":null,"run":null},{"id":"washingmachine","name":"Wasch­maschine","power":54,"energyWh":29404.027,"run":{"source":"miele","running":true,"status":"In use","program":"Cottons","phase":"Main wash","remainingMin":80,"elapsedMin":67,"endsAt":"2026-11-21T14:28:06.651Z"}}],"stale":[]}
```
Miele / Live-Aktivitäten (ohne Schlüssel):
```
{"configured":true,"linked":true,"connected":true,"lastEvent":"2026-11-21T13:08:06.651Z","lastError":null,"runs":{"washingmachine":{"source":"miele","running":true,"status":"In use","program":"Cottons","phase":"Main wash","remainingMin":80,"elapsedMin":67,"endsAt":"2026-11-21T14:28:06.651Z"}}}
{"enabled":true,"state":{"geschirrspueler":{"active":false,"endsAt":null,"startedAt":null,"highSince":null,"lastHigh":null},"washingmachine":{"active":true,"endsAt":1795271310502,"startedAt":1795262460795,"highSince":null,"lastHigh":null}},"log":[{"ts":"2026-11-21T12:02:30.982Z","text":"update washingmachine bis 2026-11-21T14:28:30.502Z"},{"ts":"2026-11-21T12:01:01.029Z","text":"start washingmachine bis 2026-11-21T15:09:59.070Z"},{"ts":"2026-11-20T20:07:30.451Z","text":"end washingmachine"},{"ts":"2026-11-20T20:03:00.554Z","text":"end geschirrspueler"},{"ts":"2026-11-20T17:52:00.425Z","text":"start geschirrspueler bis 2026-11-20T19:49:00.206Z"},{"ts":"2026-11-20T17:19:00.509Z","text":"update washingmachine bis 2026-11-20T20:06:53.057Z"},{"ts":"2026-11-20T17:17:30.472Z","text":"start washingmachine bis 2026-11-20T20:26:21.887Z"},{"ts":"2026-11-20T12:06:30.290Z","text":"end washingmachine"},{"ts":"2026-11-20T11:52:30.322Z","text":"update washingmachine bis 2026-11-20T12:08:13.815Z"},{"ts":"2026-11-20T10:56:30.429Z","text":"update washingmachine bis 2026-11-20T12:02:24.502Z"},{"ts":"2026-11-20T09:01:00.110Z","text":"update washingmachine bis 2026-11-20T11:47:57.108Z"},{"ts":"2026-11-20T08:59:00.243Z","text":"start washingmachine bis 2026-11-20T12:07:57.093Z"},{"ts":"2026-11-18T08:24:28.786Z","text":"end washingmachine"},{"ts":"2026-11-18T06:01:58.669Z","text":"update washingmachine bis 2026-11-18T08:25:52.760Z"},{"ts":"2026-11-18T06:00:28.911Z","text":"start washingmachine bis 2
```
Summary heute:
```
{"period":"day","date":"2026-11-21","from":"2026-11-20T23:00:00.000Z","to":"2026-11-21T13:08:19.526Z","end":"2026-11-21T23:00:00.000Z","isCurrent":true,"energy":{"pv":2.081,"pvRoof":0.766,"pvCarport":1.315,"gridImport":13.603,"gridExport":0.021,"batteryCharge":0.52,"batteryDischarge":0.915,"house":16.057,"heatpump":5.914,"heatpumpHeat":35.869,"wallbox":3.923,"rest":6.22,"solarThermal":0},"appliances":[{"id":"coffeemachine","name":"Kaffee­maschine","kwh":0.752},{"id":"freezer","name":"Gefrier­schrank","kwh":0.328},{"id":"backrohr","name":"Backrohr","kwh":0.014},{"id":"geschirrspueler","name":"Geschirr­spüler","kwh":0},{"id":"router","name":"Router","kwh":0.255},{"id":"kuehlschrank","name":"Kühl­schrank","kwh":0.14},{"id":"herd","name":"Herd","kwh":0.345},{"id":"washingmachine","name":"Wasch­maschine","kwh":0.233}],"kpi":{"selfSufficiency":0.153,"selfConsumption":0.99,"cop":6.07},"missing":[]}
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

/media/pi/PortableSSD/influxdb-data: /dev/sda1 ext4   rw,relatime,stripe=256 | 204G/916G (24%)
/var/lib/docker/volumes/61250a636f08f3fff1656b1abfadc442b11a08347b45f24cb549934ab1f180dc/_data:  | 
/home/pi/influxdb-config/influxdb.yml: /dev/mmcblk0p2 ext4   rw,noatime | 20G/57G (36%)
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
