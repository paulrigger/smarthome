# Pi Status
- time: 2026-10-24T17:16:31+02:00
- host: systapi2  (10.0.1.1)
- commit: 61a8a42
- uptime: up 4 weeks, 2 days, 10 hours, 16 minutes
- load: 0.05 0.11 0.12
- mem: 
- disk /: 16G/57G (30%)
- temp: temp=47.7'C

## docker ps
```
NAMES                          IMAGE                      STATUS                 PORTS
smarthome-app                  smarthome-app:local        Up 6 hours (healthy)   0.0.0.0:8090->8090/tcp, :::8090->8090/tcp
garmin_mcp_garmin-mcp_1        garmin_mcp_garmin-mcp      Up 4 weeks             127.0.0.1:8000->8000/tcp
influxdb                       influxdb:2.7               Up 3 weeks             0.0.0.0:8086->8086/tcp, :::8086->8086/tcp
grafana                        grafana/grafana            Up 4 days              0.0.0.0:3000->3000/tcp, :::3000->3000/tcp
mosquitto_docker_mosquitto_1   eclipse-mosquitto:latest   Up 4 weeks             0.0.0.0:1883->1883/tcp, :::1883->1883/tcp, 0.0.0.0:9001->9001/tcp, :::9001->9001/tcp
mynodered                      nodered/node-red           Up 4 days (healthy)    0.0.0.0:1880->1880/tcp, :::1880->1880/tcp
```

## app
```
{"ok":true,"version":"61a8a42","source":"influx","influx":{"ok":true},"mqtt":{"connected":true,"lastMessage":"2026-10-24T15:16:31.007Z"}}
```
Live-Snapshot (Auszug):
```
{"ts":"2026-10-24T15:16:31.316Z","power":{"pv":475,"pvRoof":187,"pvCarport":288,"grid":-332,"battery":-27,"house":116,"heatpump":0,"wallbox":4,"rest":112,"solarThermal":0},"battery":{"soc":100},"heatpump":{"cop":0,"heatOutput":0,"flowTemp":37.1,"dhwTop":52,"bufferTop":40.6},"solarThermal":{"collectorTemp":66.7},"outdoorTemp":11.3,"rooms":[{"id":"Wohnzimmer","name":"Wohnzimmer","climate":{"temp":22,"hum":57,"co2":524}},{"id":"Gallerie","name":"Galerie","climate":{"temp":22.1,"hum":61,"co2":604}}],"car":{"soc":47,"range":157,"home":false,"plugged":false},"appliances":[{"id":"coffeemachine","name":"Kaffee­maschine","power":0},{"id":"freezer","name":"Gefrier­schrank","power":5},{"id":"backrohr","name":"Backrohr","power":0},{"id":"geschirrspueler","name":"Geschirr­spüler","power":1},{"id":"router","name":"Router","power":17},{"id":"kuehlschrank","name":"Kühl­schrank","power":0},{"id":"herd","name":"Herd","power":0},{"id":"washingmachine","name":"Wasch­maschine","power":0}],"stale":[]}
```
Summary heute:
```
{"period":"day","date":"2026-10-24","from":"2026-10-23T22:00:00.000Z","to":"2026-10-24T15:16:31.324Z","end":"2026-10-24T22:00:00.000Z","isCurrent":true,"energy":{"pv":11.413,"pvRoof":6.933,"pvCarport":4.48,"gridImport":9.899,"gridExport":4.369,"batteryCharge":6.98,"batteryDischarge":0.11,"house":10.073,"heatpump":8.33,"heatpumpHeat":45.778,"wallbox":0.103,"rest":1.64,"solarThermal":1},"appliances":[{"id":"coffeemachine","name":"Kaffee­maschine","kwh":0.758},{"id":"freezer","name":"Gefrier­schrank","kwh":0.406},{"id":"backrohr","name":"Backrohr","kwh":0.395},{"id":"geschirrspueler","name":"Geschirr­spüler","kwh":1.187},{"id":"router","name":"Router","kwh":0.285},{"id":"kuehlschrank","name":"Kühl­schrank","kwh":0.204},{"id":"herd","name":"Herd","kwh":0.021},{"id":"washingmachine","name":"Wasch­maschine","kwh":0}],"kpi":{"selfSufficiency":0.017,"selfConsumption":0.617,"cop":5.5},"missing":[]}
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

## Zugriff von außen
- caddy: active
- sites: paulrigger.synology.me, paulrigger.ddnsfree.com;energie.paulrigger.ddnsfree.com
- app-host: https://energie.paulrigger.ddnsfree.com
- DNS zeigt auf aktuelle öffentliche IP: ja
- zertifikat gültig bis: Jan 20 18:21:48 2027 GMT
- https /api/live ohne Login (erwartet 401): 401
- app-login von außen: {"required":true,"ok":false}
- tailscale: online
