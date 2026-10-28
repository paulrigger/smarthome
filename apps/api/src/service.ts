import type { Allocation, AssetInfo, CostResult, EnergySummary, Interval, LiveSnapshot, Period, SeriesData, SeriesKind, Tariff, YieldResult } from '@smarthome/shared';
import { allocate, allocationStep, computeCosts, computeYield, mockAssets, mockCosts, mockYield, bounds, bucketStarts, energyStep, gaugeStep, isCurrent, lifetimeYears, mockAllocation, mockLive, mockSeries, mockSummary, previousBucketStart, zonedMidnight, zonedParts } from '@smarthome/shared';
import { buildLive, buildSeries, buildSummary, combineSummaries, combineYearSeries, counterDeltas, resetKeys, expandKeys, type Range, type RawPoints } from './domain/energy';
import { COUNTER_SERIES, LIVE_SERIES } from './domain/registry';
import { mergeLive } from './domain/mqttLive';
import { correctHybrid } from './domain/hybrid';
import type { InfluxSource } from './sources/influx';
import type { LiveFeed } from './sources/mqtt';

export interface DataService {
  source: 'influx' | 'mock';
  live(): Promise<LiveSnapshot>;
  summary(period: Period, date: string): Promise<EnergySummary>;
  series(kind: SeriesKind, keys: string[], period: Period, date: string): Promise<SeriesData>;
  allocation(period: Period, date: string): Promise<Allocation>;
  yield(period: Period, date: string): Promise<YieldResult>;
  /** rev: Tarif-Stand, damit der Cache nach dem Speichern neu rechnet. */
  costs(period: Period, date: string, tariffs: Tariff[], rev: number): Promise<CostResult>;
  assets(): Promise<AssetInfo>;
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

/** Abgeschlossene Zeiträume ändern sich nicht mehr → lange cachen; Gesamt (mehrere Jahre) 30 min. */
const ttl = (current: boolean, period: Period) => (!current ? 6 * 3600_000 : period === 'day' ? 60_000 : period === 'all' ? 30 * 60_000 : 5 * 60_000);

export function influxService(src: InfluxSource, tz: string, feed?: LiveFeed): DataService {
  const liveCache = cache<LiveSnapshot>(1);
  const startCache = cache<RawPoints>(1);
  const sumCache = cache<EnergySummary>();
  const serCache = cache<SeriesData>();
  const allocCache = cache<Allocation>(60);
  const yieldCache = cache<YieldResult>(60);
  const costCache = cache<CostResult>(60);
  const assetCache = cache<AssetInfo>(1);
  const ivCache = cache<{ intervals: Interval[]; meta: Meta; buckets: Date[] }>(30);

  /** Zählerdeltas je 15 min (Jahr: 1 h) – gemeinsame Basis für Allokation und Ertrag. */
  const intervalsOf = (period: Period, date: string): Promise<{ intervals: Interval[]; meta: Meta; buckets: Date[] }> => {
    const range = rangeOf(period, date, tz);
    return ivCache(`${period}:${date}`, ttl(range.isCurrent, period) - 1000, async () => {
      const step = allocationStep(period);
      const buckets = bucketStarts(period, date, energyStep(period), tz);
      const meta: Meta = { period, date, from: range.from.toISOString(), to: range.to.toISOString(), step, bucketStep: energyStep(period) };
      if (range.from > new Date()) return { intervals: [], meta, buckets };
      // Gesamt: Jahre nacheinander (je ~30 s auf dem Pi, abgeschlossene Jahre 6 h im Cache) statt einer Riesenabfrage
      if (period === 'all') {
        const intervals: Interval[] = [];
        for (const y of lifetimeYears(new Date(), tz)) intervals.push(...(await intervalsOf('year', y)).intervals);
        return { intervals, meta, buckets };
      }
      const defs = COUNTER_SERIES.filter((d) => ALLOC_KEYS.includes(d.key as (typeof ALLOC_KEYS)[number]));
      const points = await src.window(defs, previousBucketStart(period, date, step, tz), range.to, step, 'energy', tz);
      const factor = new Map(defs.map((d) => [d.key, d.factor]));
      const byTime = new Map<number, Interval>();
      for (const p of points) {
        if (p.time < range.from) continue;
        const k = p.time.getTime();
        if (!byTime.has(k)) byTime.set(k, { t: p.time, pvRoof: 0, pvCarport: 0, gridImport: 0, gridExport: 0, batteryCharge: 0, batteryDischarge: 0, heatpump: 0, heatpumpHeat: 0, wallbox: 0 });
        (byTime.get(k)! as unknown as Record<string, number>)[p.key] += Math.max(0, p.value * (factor.get(p.key) ?? 1));
      }
      // Hybrid-WR: PV Carport und Akku-Entladung je Intervall auf AC-Basis (domain/hybrid.ts)
      const intervals = [...byTime.values()].map((i) => ({ ...i, ...correctHybrid(i) }));
      return { intervals, meta, buckets };
    });
  };

  const svc: DataService = {
    source: 'influx',
    // Live: MQTT hat Vorrang; Influx last() als Startwert und für Werte ohne MQTT (Solarthermie, Raumklima, car.home)
    live: () =>
      liveCache('live', feed ? 1_000 : 4_000, async () => {
        const start = await startCache('start', feed ? 60_000 : 0, () => src.query(LIVE_SERIES, '-24h'));
        return buildLive(feed ? mergeLive(start, feed.points()) : start, new Date());
      }),

    summary: (period, date) => {
      const range = rangeOf(period, date, tz);
      return sumCache(`${period}:${date}`, ttl(range.isCurrent, period), async () => {
        if (range.from > new Date()) return buildSummary(range, new Map(), new Map());
        // Gesamt = Summe der Jahre (Zählerresets/Glitches je Jahr behandelt, Jahre einzeln gecacht)
        if (period === 'all') {
          const parts: EnergySummary[] = [];
          for (const y of lifetimeYears(new Date(), tz)) parts.push(await svc.summary('year', y));
          return combineSummaries(range, parts);
        }
        const start = range.from.toISOString();
        const stop = range.to.toISOString();
        const [first, last] = await Promise.all([
          src.query(COUNTER_SERIES, start, 'first', stop, true),
          src.query(COUNTER_SERIES, start, 'last', stop, true),
        ]);
        // Zählerreset im Zeitraum: Energie aus den Fenster-Deltas summieren (wie /api/series)
        const reset = resetKeys(first, last);
        const override = new Map<string, number>();
        if (reset.length) {
          const step = energyStep(period);
          const defs = COUNTER_SERIES.filter((d) => reset.includes(d.key));
          const points = await src.window(defs, previousBucketStart(period, date, step, tz), range.to, step, 'energy', tz);
          const factor = new Map(defs.map((d) => [d.key, d.factor]));
          for (const k of reset) override.set(k, 0);
          for (const p of points) if (p.time >= range.from) override.set(p.key, override.get(p.key)! + Math.max(0, p.value * (factor.get(p.key) ?? 1)));
        }
        return buildSummary(range, first, last, override);
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
        // Gesamt (Energie): Monatsreihen der Jahre aufsummiert – gleiche Werte wie in der Jahresansicht
        if (period === 'all' && kind === 'energy') {
          const years: SeriesData[] = [];
          for (const y of lifetimeYears(now, tz)) years.push(await svc.series(kind, keys, 'year', y));
          return combineYearSeries(keys, period, date, starts, years);
        }
        // Energie: ein Fenster vorher als Basis für die Differenz
        const start = kind === 'energy' ? previousBucketStart(period, date, step, tz) : range.from;
        const points = await src.window(defs, start, range.to, step, kind, tz);
        return buildSeries(kind, keys, period, date, step, starts, points, now);
      });
    },

    allocation: (period, date) => {
      const range = rangeOf(period, date, tz);
      return allocCache(`${period}:${date}`, ttl(range.isCurrent, period), async () => {
        const { intervals, meta, buckets } = await intervalsOf(period, date);
        return allocate(intervals, buckets, meta);
      });
    },

    yield: (period, date) => {
      const range = rangeOf(period, date, tz);
      return yieldCache(`${period}:${date}`, ttl(range.isCurrent, period), async () => {
        const { intervals, meta, buckets } = await intervalsOf(period, date);
        return computeYield(intervals, buckets, meta);
      });
    },

    costs: (period, date, tariffs, rev) => {
      const range = rangeOf(period, date, tz);
      return costCache(`${period}:${date}:${rev}`, ttl(range.isCurrent, period), async () => {
        const { intervals, meta, buckets } = await intervalsOf(period, date);
        // Einspeise-Staffel zählt je Kalenderjahr → bisherige Jahresmenge nur holen, wenn ein Tarif Stufen hat
        let exportBefore = 0;
        const yearStart = zonedMidnight(zonedParts(range.from, tz).year, 0, 1, tz);
        if (tariffs.some((t) => t.exportTiers.length > 1) && range.from > yearStart) {
          const defs = COUNTER_SERIES.filter((d) => d.key === 'gridExport');
          const [first, last] = await Promise.all([
            src.query(defs, yearStart.toISOString(), 'first', range.from.toISOString(), true),
            src.query(defs, yearStart.toISOString(), 'last', range.from.toISOString(), true),
          ]);
          exportBefore = counterDeltas(first, last).delta.get('gridExport') ?? 0;
        }
        return computeCosts(intervals, tariffs, buckets, meta, { tz, exportBefore });
      });
    },

    assets: () =>
      assetCache('assets', 24 * 3600_000, async () => {
        const defs = COUNTER_SERIES.filter((d) => d.key === 'pvCarport' || d.key === 'batteryCharge');
        const first = await src.query(defs, '2010-01-01T00:00:00Z', 'first', undefined, true);
        const iso = (k: string) => first.get(k)?.time.toISOString() ?? null;
        return { carport: iso('pvCarport'), battery: iso('batteryCharge') };
      }),

    ping: () => src.ping(),
  };
  return svc;
}

type Meta = Pick<Allocation, 'period' | 'date' | 'from' | 'to' | 'step' | 'bucketStep'>;

const ALLOC_KEYS = ['pvRoof', 'pvCarport', 'gridImport', 'gridExport', 'batteryCharge', 'batteryDischarge', 'heatpump', 'heatpumpHeat', 'wallbox'] as const;

export function mockService(): DataService {
  return {
    source: 'mock',
    live: async () => mockLive(),
    summary: async (p, d) => mockSummary(p, d),
    series: async (k, keys, p, d) => mockSeries(k, keys, p, d),
    allocation: async (p, d) => mockAllocation(p, d),
    yield: async (p, d) => mockYield(p, d),
    costs: async (p, d, tariffs) => mockCosts(p, d, tariffs),
    assets: async () => mockAssets(),
    ping: async () => ({ ok: true }),
  };
}
