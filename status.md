# Pi Status
- time: 2026-11-07T15:00:46+01:00
- host: systapi2  (10.0.1.1)
- commit: 2674b22
- uptime: up 6 weeks, 2 days, 9 hours, 0 minutes
- load: 0.65 0.24 0.14
- mem: 
- disk /: 18G/57G (33%)
- temp: temp=49.4'C

## docker ps
```
NAMES                          IMAGE                      STATUS                            PORTS
smarthome-app                  smarthome-app:local        Up 2 seconds (health: starting)   0.0.0.0:8090->8090/tcp, :::8090->8090/tcp
garmin_mcp_garmin-mcp_1        garmin_mcp_garmin-mcp      Up 6 weeks                        127.0.0.1:8000->8000/tcp
influxdb                       influxdb:2.7               Up 2 days                         0.0.0.0:8086->8086/tcp, :::8086->8086/tcp
grafana                        grafana/grafana            Up 2 weeks                        0.0.0.0:3000->3000/tcp, :::3000->3000/tcp
mosquitto_docker_mosquitto_1   eclipse-mosquitto:latest   Up 6 weeks                        0.0.0.0:1883->1883/tcp, :::1883->1883/tcp, 0.0.0.0:9001->9001/tcp, :::9001->9001/tcp
mynodered                      nodered/node-red           Up 5 days (healthy)               0.0.0.0:1880->1880/tcp, :::1880->1880/tcp
```

## app
```
{"ok":true,"version":"2674b22","source":"influx","influx":{"ok":true},"mqtt":{"connected":true,"lastMessage":"2026-11-07T14:00:45.261Z"}}
```
Live-Snapshot (Auszug):
```
{"ts":"2026-11-07T14:00:46.895Z","power":{"pv":1169,"pvRoof":432,"pvCarport":737,"grid":5,"battery":-887,"house":287,"heatpump":0,"wallbox":4,"rest":283,"solarThermal":0},"battery":{"soc":34},"heatpump":{"cop":0,"heatOutput":0,"flowTemp":27.1,"dhwTop":50.7,"bufferTop":32},"solarThermal":{"collectorTemp":67.7},"outdoorTemp":11.5,"rooms":[{"id":"Wohnzimmer","name":"Wohnzimmer","climate":{"temp":22.7,"hum":56,"co2":1414}},{"id":"Gallerie","name":"Galerie","climate":{"temp":21,"hum":60,"co2":1194}}],"car":{"soc":46,"range":168,"home":false,"plugged":false},"appliances":[{"id":"coffeemachine","name":"Kaffee­maschine","power":5,"energyWh":null},{"id":"freezer","name":"Gefrier­schrank","power":5,"energyWh":null},{"id":"backrohr","name":"Backrohr","power":2,"energyWh":null},{"id":"geschirrspueler","name":"Geschirr­spüler","power":0,"energyWh":null},{"id":"router","name":"Router","power":18,"energyWh":null},{"id":"kuehlschrank","name":"Kühl­schrank","power":0,"energyWh":null},{"id":"herd","name":"Herd","power":0,"energyWh":null},{"id":"washingmachine","name":"Wasch­maschine","power":0,"energyWh":null}],"stale":[]}
```
Miele / Live-Aktivitäten (ohne Schlüssel):
```
{"configured":true,"linked":true,"connected":false,"lastEvent":null,"lastError":null,"runs":{}}
{"enabled":true,"state":{"geschirrspueler":{"active":false,"endsAt":null,"startedAt":null,"highSince":null,"lastHigh":null},"washingmachine":{"active":false,"endsAt":null,"startedAt":null,"highSince":null,"lastHigh":null}},"log":[]}
```
Summary heute:
```
{"period":"day","date":"2026-11-07","from":"2026-11-06T23:00:00.000Z","to":"2026-11-07T14:00:46.944Z","end":"2026-11-07T23:00:00.000Z","isCurrent":true,"energy":{"pv":10.199,"pvRoof":3.784,"pvCarport":6.416,"gridImport":10.101,"gridExport":0.066,"batteryCharge":3.18,"batteryDischarge":0.994,"house":18.048,"heatpump":7.57,"heatpumpHeat":40.079,"wallbox":0.089,"rest":10.389,"solarThermal":1},"appliances":[{"id":"coffeemachine","name":"Kaffee­maschine","kwh":1.616},{"id":"freezer","name":"Gefrier­schrank","kwh":0.388},{"id":"backrohr","name":"Backrohr","kwh":0.573},{"id":"geschirrspueler","name":"Geschirr­spüler","kwh":1.241},{"id":"router","name":"Router","kwh":0.262},{"id":"kuehlschrank","name":"Kühl­schrank","kwh":0.174},{"id":"herd","name":"Herd","kwh":0.895},{"id":"washingmachine","name":"Wasch­maschine","kwh":0}],"kpi":{"selfSufficiency":0.44,"selfConsumption":0.993,"cop":5.29},"missing":[]}
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
/media/pi/PortableSSD/influxdb-data -> /var/lib/influxdb2
/var/lib/docker/volumes/61250a636f08f3fff1656b1abfadc442b11a08347b45f24cb549934ab1f180dc/_data -> /etc/influxdb2
/home/pi/influxdb-config/influxdb.yml -> /etc/influxdb2/config.yml

/var/lib/docker/volumes/61250a636f08f3fff1656b1abfadc442b11a08347b45f24cb549934ab1f180dc/_data:  | 
/home/pi/influxdb-config/influxdb.yml: /dev/mmcblk0p2 ext4   rw,noatime | 18G/57G (33%)
/media/pi/PortableSSD/influxdb-data: /dev/sda1 ext4   rw,relatime,stripe=256 | 200G/916G (23%)
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
