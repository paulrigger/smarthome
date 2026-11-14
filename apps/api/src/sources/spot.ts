// EPEX-Spotpreise (Day-Ahead AT) von energy-charts.info (öffentlich, ohne Schlüssel). Verteilung auf die Intervalle in packages/shared/src/spot.ts.
import { eurMwhToCt, type SpotPrices } from '@smarthome/shared';

const TTL = 3600_000;
const cache = new Map<string, { at: number; data: SpotPrices }>();

/** Demo-Preise (Mock/Tests): deterministisch je Viertelstunde, Tagesgang mit Abend-Spitze */
export function mockSpot(from: string, to: string): SpotPrices {
  const t: string[] = [], ct: number[] = [];
  const start = Date.parse(`${from}T00:00:00Z`), end = Date.parse(`${to}T00:00:00Z`) + 86400_000;
  for (let ms = start; ms < end; ms += 15 * 60_000) {
    const h = new Date(ms).getUTCHours() + new Date(ms).getUTCMinutes() / 60;
    t.push(new Date(ms).toISOString());
    ct.push(Math.round((12 + 6 * Math.sin(((h - 6) / 24) * 2 * Math.PI) + 5 * Math.exp(-((h - 19) ** 2) / 4)) * 100) / 100);
  }
  return { t, ct };
}

export function openSpot(o: { mock: boolean; log: (msg: string) => void }) {
  async function get(from: string, to: string): Promise<SpotPrices> {
    if (o.mock) return mockSpot(from, to);
    // Ende einschließlich: einen Tag mehr, damit der letzte Intervall-Tag sicher dabei ist
    const start = from.slice(0, 10), end = new Date(Date.parse(`${to.slice(0, 10)}T00:00:00Z`) + 86400_000).toISOString().slice(0, 10);
    const key = `${start}|${end}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL) return hit.data;
    const r = await fetch(`https://api.energy-charts.info/price?bzn=AT&start=${start}&end=${end}`, { signal: AbortSignal.timeout(15_000) });
    if (!r.ok) throw new Error(`energy-charts ${r.status}`);
    const j = (await r.json()) as { unix_seconds?: number[]; price?: number[]; unit?: string };
    if (!j.unix_seconds || !j.price || !String(j.unit ?? '').includes('MWh')) throw new Error('energy-charts: unerwartetes Format');
    const data: SpotPrices = { t: j.unix_seconds.map((s) => new Date(s * 1000).toISOString()), ct: j.price.map(eurMwhToCt) };
    cache.set(key, { at: Date.now(), data });
    return data;
  }
  return { get };
}
