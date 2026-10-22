import type { EnergySummary, LiveSnapshot, Period } from '@smarthome/shared';
import { mockLive, mockSummary } from '@smarthome/shared';
import { buildLive, buildSummary, periodStart } from './domain/energy';
import { COUNTER_SERIES, LIVE_SERIES } from './domain/registry';
import type { InfluxSource } from './sources/influx';

export interface DataService {
  source: 'influx' | 'mock';
  live(): Promise<LiveSnapshot>;
  summary(period: Period): Promise<EnergySummary>;
  ping(): Promise<{ ok: boolean; error?: string }>;
}

/** Einfacher TTL-Cache, verhindert parallele Doppelabfragen. */
function cached<T>(ttlMs: number, fn: () => Promise<T>): () => Promise<T> {
  let at = 0;
  let pending: Promise<T> | null = null;
  let value: T | null = null;
  return async () => {
    if (value && Date.now() - at < ttlMs) return value;
    if (pending) return pending;
    pending = fn()
      .then((v) => {
        value = v;
        at = Date.now();
        return v;
      })
      .finally(() => {
        pending = null;
      });
    return pending;
  };
}

export function influxService(src: InfluxSource, tz: string): DataService {
  const live = cached(4_000, async () => buildLive(await src.query(LIVE_SERIES, '-24h'), new Date()));
  const summaries: Record<Period, () => Promise<EnergySummary>> = {
    today: cached(60_000, () => summary('today')),
    month: cached(5 * 60_000, () => summary('month')),
  };
  async function summary(period: Period): Promise<EnergySummary> {
    const now = new Date();
    const from = periodStart(period, now, tz);
    // first: erster Wert ab Periodenbeginn; last: letzter Wert bis jetzt
    const [first, last] = await Promise.all([
      src.query(COUNTER_SERIES, from.toISOString(), 'first'),
      src.query(COUNTER_SERIES, from.toISOString(), 'last'),
    ]);
    return buildSummary(period, from, now, first, last);
  }
  return { source: 'influx', live, summary: (p) => summaries[p](), ping: () => src.ping() };
}

export function mockService(): DataService {
  return {
    source: 'mock',
    live: async () => mockLive(),
    summary: async (p) => mockSummary(p),
    ping: async () => ({ ok: true }),
  };
}
