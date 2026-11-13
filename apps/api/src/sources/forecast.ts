// PV-Prognose (Open-Meteo, gratis, ohne Schlüssel) + Lade-Empfehlung fürs Auto. Rechnung rein in packages/shared/src/pvforecast.ts.
// Standort nur aus der .env (FORECAST_LAT / FORECAST_LON), nie im Repo.
import type { FastifyInstance } from 'fastify';
import { forecast, localDate, mockRadiation, type ForecastHistory, type ForecastRadiation, type ForecastResponse, type LiveSnapshot, type SeriesData } from '@smarthome/shared';
import type { DataService } from '../service';

export interface ForecastOptions {
  lat?: number;
  lon?: number;
  mock: boolean;
  carCapacityKwh: number;
  carTargetSoc: number;
  horizonDays: number;
  tz: string;
  log: (msg: string) => void;
}

const HIST_DAYS = 14;
const H = 3600_000;

export function openForecast(svc: DataService, live: () => Promise<LiveSnapshot>, o: ForecastOptions) {
  let radCache: { at: number; rad: ForecastRadiation } | null = null;
  let histCache: { at: number; hist: ForecastHistory } | null = null;

  async function radiation(now: number): Promise<ForecastRadiation> {
    if (o.mock) return mockRadiation(now - HIST_DAYS * 24 * H, (HIST_DAYS + 7) * 24);
    if (radCache && now - radCache.at < H) return radCache.rad;
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${o.lat}&longitude=${o.lon}` +
      `&hourly=shortwave_radiation,temperature_2m&past_days=${HIST_DAYS}&forecast_days=7&timeformat=unixtime&timezone=UTC`;
    const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!r.ok) throw new Error(`Open-Meteo ${r.status}`);
    const j = (await r.json()) as { hourly?: { time?: number[]; shortwave_radiation?: (number | null)[]; temperature_2m?: (number | null)[] } };
    const time = j.hourly?.time ?? [];
    // Wert zum Zeitpunkt T = Mittel der Stunde davor → Stundenbeginn T − 1 h
    const rad = { t: time.map((s) => s * 1000 - H), ghi: j.hourly?.shortwave_radiation ?? [], temp: j.hourly?.temperature_2m ?? [] };
    radCache = { at: now, rad };
    return rad;
  }

  async function history(now: number): Promise<ForecastHistory> {
    if (histCache && now - histCache.at < 3 * H) return histCache.hist;
    const today = localDate(new Date(now), o.tz);
    const startDay = localDate(new Date(now - HIST_DAYS * 24 * H), o.tz);
    const months = [...new Set([startDay, today])];
    const gauge: SeriesData[] = [];
    const energy: SeriesData[] = [];
    for (const d of months) {
      gauge.push(await svc.series('gauge', ['pv.power', 'house.power', 'wallbox.power', 'heatpump.power'], 'month', d));
      energy.push(await svc.series('energy', ['batteryDischarge'], 'month', d));
    }
    const from = Date.parse(`${startDay}T00:00:00Z`) - 2 * H;
    const hist: ForecastHistory = { t: [], pv: [], load: [], heatpump: [], batteryDailyKwh: null };
    for (const g of gauge)
      g.t.forEach((iso, i) => {
        const t = Date.parse(iso);
        if (t < from || t + H > now) return; // nur abgeschlossene Stunden der letzten Tage
        const pv = g.values['pv.power']?.[i] ?? null;
        const house = g.values['house.power']?.[i] ?? null;
        const wb = g.values['wallbox.power']?.[i] ?? 0;
        const hp = g.values['heatpump.power']?.[i] ?? null;
        hist.t.push(t);
        hist.pv.push(pv === null ? null : Math.max(0, pv) / 1000); // Mittel W über 1 h = Wh
        hist.load.push(house === null ? null : Math.max(0, house - Math.max(0, wb ?? 0)) / 1000);
        hist.heatpump.push(hp === null ? null : Math.max(0, hp) / 1000);
      });
    const dis = energy
      .flatMap((e) => e.t.map((iso, i) => ({ t: Date.parse(iso), v: e.values['batteryDischarge']?.[i] ?? null })))
      .filter((x) => x.t >= from && x.t + 24 * H <= now && x.v !== null && x.v > 0)
      .slice(-7)
      .map((x) => x.v as number);
    hist.batteryDailyKwh = dis.length ? dis.reduce((a, b) => a + b, 0) / dis.length : null;
    histCache = { at: now, hist };
    return hist;
  }

  async function get(): Promise<ForecastResponse> {
    if (!o.mock && (o.lat === undefined || o.lon === undefined))
      return { configured: false, reason: 'FORECAST_LAT / FORECAST_LON fehlen in der .env' };
    const now = Date.now();
    const [rad, hist, snap] = await Promise.all([radiation(now), history(now), live().catch(() => null)]);
    const f = forecast(hist, rad, { soc: snap?.car.soc ?? null, capacityKwh: o.carCapacityKwh, targetSoc: o.carTargetSoc, horizonDays: o.horizonDays }, now, 4, o.tz);
    return { configured: true, ...f };
  }

  function routes(app: FastifyInstance) {
    app.get('/api/forecast', async (_req, reply) => {
      try {
        return await get();
      } catch (e) {
        o.log(`forecast: ${(e as Error).message}`);
        return reply.code(502).send({ error: (e as Error).message });
      }
    });
  }
  return { routes, get };
}
