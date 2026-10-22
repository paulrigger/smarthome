import { InfluxDB, type QueryApi } from '@influxdata/influxdb-client';
import type { SeriesDef } from '../domain/registry';
import type { RawPoints } from '../domain/energy';

export interface InfluxConfig {
  url: string;
  token: string;
  org: string;
  bucket: string;
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const sid = (m: string, d: string, f: string) => `${m}\u0000${d}\u0000${f}`;

/** Flux-Filter über eine Liste von Serien (gruppiert nach measurement/device). */
export function seriesFilter(defs: SeriesDef[]): string {
  const groups = new Map<string, Set<string>>();
  for (const d of defs) {
    const k = `${d.measurement}\u0000${d.device}`;
    if (!groups.has(k)) groups.set(k, new Set());
    groups.get(k)!.add(d.field);
  }
  return [...groups.entries()]
    .map(([k, fields]) => {
      const [m, d] = k.split('\u0000');
      const f = [...fields].map((x) => `r._field == "${esc(x)}"`).join(' or ');
      return `(r._measurement == "${esc(m)}" and r.device == "${esc(d)}" and (${f}))`;
    })
    .join(' or\n      ');
}

export function lastFlux(bucket: string, defs: SeriesDef[], start: string, fn: 'last' | 'first' = 'last', stop?: string): string {
  return `from(bucket: "${esc(bucket)}")
  |> range(start: ${start}${stop ? `, stop: ${stop}` : ''})
  |> filter(fn: (r) =>
      ${seriesFilter(defs)})
  |> ${fn}()
  |> keep(columns: ["_time", "_value", "_measurement", "device", "_field"])`;
}

interface Row {
  _time: string;
  _value: number | boolean | string;
  _measurement: string;
  device: string;
  _field: string;
}

export function rowsToPoints(rows: Row[], defs: SeriesDef[]): RawPoints {
  const byId = new Map<string, string[]>();
  for (const d of defs) {
    const id = sid(d.measurement, d.device, d.field);
    byId.set(id, [...(byId.get(id) ?? []), d.key]);
  }
  const out: RawPoints = new Map();
  for (const r of rows) {
    for (const key of byId.get(sid(r._measurement, r.device, r._field)) ?? []) {
      const time = new Date(r._time);
      const prev = out.get(key);
      // mehrere Tabellen (z.B. unterschiedliche Tags) -> jüngsten Wert nehmen
      if (!prev || time > prev.time) out.set(key, { value: r._value, time });
    }
  }
  return out;
}

export class InfluxSource {
  private q: QueryApi;
  constructor(private cfg: InfluxConfig) {
    this.q = new InfluxDB({ url: cfg.url, token: cfg.token, timeout: 20_000 }).getQueryApi(cfg.org);
  }

  async query(defs: SeriesDef[], start: string, fn: 'last' | 'first' = 'last', stop?: string): Promise<RawPoints> {
    const rows = await this.q.collectRows<Row>(lastFlux(this.cfg.bucket, defs, start, fn, stop));
    return rowsToPoints(rows, defs);
  }

  async ping(): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(`${this.cfg.url}/health`, { signal: AbortSignal.timeout(3000) });
      return { ok: res.ok };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
}
