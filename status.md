# Pi Status
- time: 2026-10-31T16:38:46+01:00
- host: systapi2  (10.0.1.1)
- commit: 87c3d41
- uptime: up 5 weeks, 2 days, 10 hours, 38 minutes
- load: 0.59 0.54 0.47
- mem: 
- disk /: 17G/57G (31%)
- temp: temp=51.0'C

## docker ps
```
NAMES                          IMAGE                      STATUS                  PORTS
smarthome-app                  smarthome-app:local        Up 17 hours (healthy)   0.0.0.0:8090->8090/tcp, :::8090->8090/tcp
garmin_mcp_garmin-mcp_1        garmin_mcp_garmin-mcp      Up 5 weeks              127.0.0.1:8000->8000/tcp
influxdb                       influxdb:2.7               Up 4 weeks              0.0.0.0:8086->8086/tcp, :::8086->8086/tcp
grafana                        grafana/grafana            Up 11 days              0.0.0.0:3000->3000/tcp, :::3000->3000/tcp
mosquitto_docker_mosquitto_1   eclipse-mosquitto:latest   Up 5 weeks              0.0.0.0:1883->1883/tcp, :::1883->1883/tcp, 0.0.0.0:9001->9001/tcp, :::9001->9001/tcp
mynodered                      nodered/node-red           Up 11 days (healthy)    0.0.0.0:1880->1880/tcp, :::1880->1880/tcp
```

## app
```
{"ok":true,"version":"87c3d41","source":"influx","influx":{"ok":true},"mqtt":{"connected":true,"lastMessage":"2026-10-31T15:38:42.433Z"}}
```
Live-Snapshot (Auszug):
```
{"ts":"2026-10-31T15:38:46.556Z","power":{"pv":127,"pvRoof":61,"pvCarport":66,"grid":0,"battery":694,"house":821,"heatpump":0,"wallbox":5,"rest":816,"solarThermal":2100},"battery":{"soc":93},"heatpump":{"cop":0,"heatOutput":0,"flowTemp":39,"dhwTop":59.8,"bufferTop":47.1},"solarThermal":{"collectorTemp":67.4},"outdoorTemp":10.1,"rooms":[{"id":"Wohnzimmer","name":"Wohnzimmer","climate":{"temp":24.6,"hum":54,"co2":807}},{"id":"Gallerie","name":"Galerie","climate":{"temp":24.8,"hum":58,"co2":785}}],"car":{"soc":69,"range":284,"home":true,"plugged":false},"appliances":[{"id":"coffeemachine","name":"Kaffee­maschine","power":0},{"id":"freezer","name":"Gefrier­schrank","power":5},{"id":"backrohr","name":"Backrohr","power":0},{"id":"geschirrspueler","name":"Geschirr­spüler","power":0},{"id":"router","name":"Router","power":17},{"id":"kuehlschrank","name":"Kühl­schrank","power":0},{"id":"herd","name":"Herd","power":376},{"id":"washingmachine","name":"Wasch­maschine","power":0}],"stale":[]}
```
Summary heute:
```
{"period":"day","date":"2026-10-31","from":"2026-10-30T23:00:00.000Z","to":"2026-10-31T15:37:59.448Z","end":"2026-10-31T23:00:00.000Z","isCurrent":true,"energy":{"pv":26.437,"pvRoof":11.685,"pvCarport":14.752,"gridImport":16.724,"gridExport":9.717,"batteryCharge":7,"batteryDischarge":0.528,"house":26.971,"heatpump":9.433,"heatpumpHeat":51.604,"wallbox":8.671,"rest":8.868,"solarThermal":4},"appliances":[{"id":"coffeemachine","name":"Kaffee­maschine","kwh":0.511},{"id":"freezer","name":"Gefrier­schrank","kwh":0.408},{"id":"backrohr","name":"Backrohr","kwh":0.02},{"id":"geschirrspueler","name":"Geschirr­spüler","kwh":0},{"id":"router","name":"Router","kwh":0.266},{"id":"kuehlschrank","name":"Kühl­schrank","kwh":0.171},{"id":"herd","name":"Herd","kwh":0.302},{"id":"washingmachine","name":"Wasch­maschine","kwh":0}],"kpi":{"selfSufficiency":0.38,"selfConsumption":0.632,"cop":5.47},"missing":[]}
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
