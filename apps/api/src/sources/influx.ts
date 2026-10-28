import { InfluxDB, type QueryApi } from '@influxdata/influxdb-client';
import type { SeriesDef } from '../domain/registry';
import type { RawPoints, SeriesPoint } from '../domain/energy';
import { counterDeltas } from '../domain/counter';

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

/** counters: Zählerstände ≤ 0 verwerfen (Lesefehler; sonst wird last − first riesig, z. B. Solarthermie 11/2025). */
export function lastFlux(bucket: string, defs: SeriesDef[], start: string, fn: 'last' | 'first' = 'last', stop?: string, counters = false): string {
  return `from(bucket: "${esc(bucket)}")
  |> range(start: ${start}${stop ? `, stop: ${stop}` : ''})
  |> filter(fn: (r) =>
      ${seriesFilter(defs)})${counters ? '\n  |> filter(fn: (r) => r._value > 0.0)' : ''}
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

/**
 * Fensteraggregation in lokaler Zeit. energy: Zählerstand am Fensterende (Differenz rechnet counterDeltas,
 * robust gegen falsche Zählerstände); Stände ≤ 0 sind Messlücken (Node-RED schreibt dann 0).
 */
/** Gauges: Rohwerte über SeriesDef.max verwerfen, bevor gemittelt wird. */
function maxFilter(defs: SeriesDef[]): string {
  const capped = defs.filter((d) => d.max !== undefined);
  if (!capped.length) return '';
  return `\n  |> filter(fn: (r) => not (${capped.map((d) => `(${seriesFilter([d])} and r._value > ${d.max!.toFixed(1)})`).join(' or ')}))`;
}

export function windowFlux(bucket: string, defs: SeriesDef[], start: string, stop: string, every: string, mode: 'energy' | 'gauge', tz: string): string {
  return `import "timezone"
option location = timezone.location(name: "${esc(tz)}")

from(bucket: "${esc(bucket)}")
  |> range(start: ${start}, stop: ${stop})
  |> filter(fn: (r) =>
      ${seriesFilter(defs)})
  |> toFloat()${mode === 'energy' ? '\n  |> filter(fn: (r) => r._value > 0.0)' : maxFilter(defs)}
  |> aggregateWindow(every: ${every}, fn: ${mode === 'energy' ? 'last' : 'mean'}, createEmpty: false, timeSrc: "_start")
  |> keep(columns: ["_time", "_value", "_measurement", "device", "_field"])`;
}

const STEP_H: Record<string, number> = { '5m': 1 / 12, '15m': 0.25, '1h': 1, '1d': 24, '1mo': 24 * 28, '1y': 24 * 365 };

/** Größte plausible mittlere Leistung je Zähler (kW), großzügig über den Anlagengrößen. */
const MAX_KW_BY_KEY: Record<string, number> = {
  gridImport: 45, gridExport: 45, pvRoof: 30, pvCarport: 30, batteryCharge: 20, batteryDischarge: 20,
  wallbox: 25, heatpump: 20, heatpumpHeat: 80, solarThermal: 30,
};
const MAX_KW = (key: string) => MAX_KW_BY_KEY[key] ?? 15; // Geräte (Shelly)

/** Zählerstände je Fenster → Energie je Fenster (Rohwert-Einheit), je Serie bereinigt. */
export function energyDeltas(points: SeriesPoint[], defs: SeriesDef[], every: string): SeriesPoint[] {
  const byKey = new Map<string, Map<number, SeriesPoint>>();
  for (const p of points) {
    if (!byKey.has(p.key)) byKey.set(p.key, new Map());
    byKey.get(p.key)!.set(p.time.getTime(), p); // gleiche Zeit aus mehreren Tabellen: letzter gewinnt
  }
  const factor = new Map(defs.map((d) => [d.key, d.factor]));
  const out: SeriesPoint[] = [];
  for (const [key, m] of byKey) {
    const deltas = counterDeltas([...m.values()], { factor: factor.get(key) ?? 1, maxKw: MAX_KW(key), stepH: STEP_H[every] ?? 1 });
    for (const d of deltas) out.push({ key, time: d.time, value: d.value });
  }
  return out;
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
    // Jahresfenster 2024 (dichte Rohdaten) brauchen auf dem Pi > 20 s; abgeschlossene Zeiträume werden 6 h gecacht
    this.q = new InfluxDB({ url: cfg.url, token: cfg.token, timeout: 90_000 }).getQueryApi(cfg.org);
  }

  async query(defs: SeriesDef[], start: string, fn: 'last' | 'first' = 'last', stop?: string, counters = false): Promise<RawPoints> {
    const rows = await this.q.collectRows<Row>(lastFlux(this.cfg.bucket, defs, start, fn, stop, counters));
    return rowsToPoints(rows, defs);
  }

  async window(defs: SeriesDef[], start: Date, stop: Date, every: string, mode: 'energy' | 'gauge', tz: string): Promise<SeriesPoint[]> {
    if (!defs.length) return [];
    const rows = await this.q.collectRows<Row>(windowFlux(this.cfg.bucket, defs, start.toISOString(), stop.toISOString(), every, mode, tz));
    const points = rowsToSeries(rows, defs);
    return mode === 'energy' ? energyDeltas(points, defs, every) : points;
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
