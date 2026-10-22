import { InfluxDB, type QueryApi } from '@influxdata/influxdb-client';
import type { SeriesDef } from '../domain/registry';
import type { RawPoints, SeriesPoint } from '../domain/energy';

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

/** Fensteraggregation in lokaler Zeit. energy: Zählerstand am Fensterende, Differenz zum Vorfenster. */
export function windowFlux(bucket: string, defs: SeriesDef[], start: string, stop: string, every: string, mode: 'energy' | 'gauge', tz: string): string {
  return `import "timezone"
option location = timezone.location(name: "${esc(tz)}")

from(bucket: "${esc(bucket)}")
  |> range(start: ${start}, stop: ${stop})
  |> filter(fn: (r) =>
      ${seriesFilter(defs)})
  |> toFloat()
  |> aggregateWindow(every: ${every}, fn: ${mode === 'energy' ? 'last' : 'mean'}, createEmpty: false, timeSrc: "_start")${mode === 'energy' ? '\n  |> difference(nonNegative: true)' : ''}
  |> keep(columns: ["_time", "_value", "_measurement", "device", "_field"])`;
}

export function rowsToSeries(rows: Row[], defs: SeriesDef[]): SeriesPoint[] {
  const byId = new Map<string, string[]>();
  for (const d of defs) {
    const id = sid(d.measurement, d.device, d.field);
    byId.set(id, [...(byId.get(id) ?? []), d.key]);
  }
  const out: SeriesPoint[] = [];
  for (const r of rows) {
    const v = typeof r._value === 'number' ? r._value : Number(r._value);
    if (!Number.isFinite(v)) continue;
    for (const key of byId.get(sid(r._measurement, r.device, r._field)) ?? []) out.push({ key, time: new Date(r._time), value: v });
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

  async window(defs: SeriesDef[], start: Date, stop: Date, every: string, mode: 'energy' | 'gauge', tz: string): Promise<SeriesPoint[]> {
    if (!defs.length) return [];
    const rows = await this.q.collectRows<Row>(windowFlux(this.cfg.bucket, defs, start.toISOString(), stop.toISOString(), every, mode, tz));
    return rowsToSeries(rows, defs);
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
