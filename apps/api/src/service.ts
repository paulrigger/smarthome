import type { EnergySummary, LiveSnapshot, Period, SeriesData, SeriesKind } from '@smarthome/shared';
import { bounds, bucketStarts, energyStep, gaugeStep, isCurrent, mockLive, mockSeries, mockSummary, previousBucketStart } from '@smarthome/shared';
import { buildLive, buildSeries, buildSummary, expandKeys, type Range } from './domain/energy';
import { COUNTER_SERIES, LIVE_SERIES } from './domain/registry';
import type { InfluxSource } from './sources/influx';

export interface DataService {
  source: 'influx' | 'mock';
  live(): Promise<LiveSnapshot>;
  summary(period: Period, date: string): Promise<EnergySummary>;
  series(kind: SeriesKind, keys: string[], period: Period, date: string): Promise<SeriesData>;
  ping(): Promise<{ ok: boolean; error?: string }>;
}

/** TTL-Cache je Schlüssel, verhindert parallele Doppelabfragen. */
function cache<T>(maxEntries = 200) {
  const m = new Map<string, { at: number; ttl: number; p: Promise<T> }>();
  return (key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> => {
    const hit = m.get(key);
    if (hit && Date.now() - hit.at < hit.ttl) return hit.p;
    const p = fn();
    m.set(key, { at: Date.now(), ttl: ttlMs, p });
    p.catch(() => m.delete(key));
    if (m.size > maxEntries) m.delete(m.keys().next().value!);
    return p;
  };
}

export function rangeOf(period: Period, date: string, tz: string, now = new Date()): Range {
  const { from, end } = bounds(period, date, tz);
  return { period, date, from, end, to: end > now ? now : end, isCurrent: isCurrent(period, date, now, tz) };
}

/** Abgeschlossene Zeiträume ändern sich nicht mehr → lange cachen. */
const ttl = (current: boolean, period: Period) => (!current ? 6 * 3600_000 : period === 'day' ? 60_000 : 5 * 60_000);

export function influxService(src: InfluxSource, tz: string): DataService {
  const liveCache = cache<LiveSnapshot>(1);
  const sumCache = cache<EnergySummary>();
  const serCache = cache<SeriesData>();

  return {
    source: 'influx',
    live: () => liveCache('live', 4_000, async () => buildLive(await src.query(LIVE_SERIES, '-24h'), new Date())),

    summary: (period, date) => {
      const range = rangeOf(period, date, tz);
      return sumCache(`${period}:${date}`, ttl(range.isCurrent, period), async () => {
        if (range.from > new Date()) return buildSummary(range, new Map(), new Map());
        const start = range.from.toISOString();
        const stop = range.to.toISOString();
        const [first, last] = await Promise.all([
          src.query(COUNTER_SERIES, start, 'first', stop),
          src.query(COUNTER_SERIES, start, 'last', stop),
        ]);
        return buildSummary(range, first, last);
      });
    },

    series: (kind, keys, period, date) => {
      const range = rangeOf(period, date, tz);
      return serCache(`${kind}:${period}:${date}:${keys.join(',')}`, ttl(range.isCurrent, period), async () => {
        const step = kind === 'energy' ? energyStep(period) : gaugeStep(period);
        const starts = bucketStarts(period, date, step, tz);
        const base = expandKeys(kind, keys);
        const defs = (kind === 'energy' ? COUNTER_SERIES : LIVE_SERIES).filter((d) => base.includes(d.key));
        const now = new Date();
        if (range.from > now) return buildSeries(kind, keys, period, date, step, starts, [], now);
        // Energie: ein Fenster vorher als Basis für die Differenz
        const start = kind === 'energy' ? previousBucketStart(period, date, step, tz) : range.from;
        const points = await src.window(defs, start, range.to, step, kind, tz);
        return buildSeries(kind, keys, period, date, step, starts, points, now);
      });
    },

    ping: () => src.ping(),
  };
}

export function mockService(): DataService {
  return {
    source: 'mock',
    live: async () => mockLive(),
    summary: async (p, d) => mockSummary(p, d),
    series: async (k, keys, p, d) => mockSeries(k, keys, p, d),
    ping: async () => ({ ok: true }),
  };
}
