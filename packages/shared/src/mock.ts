// Plausible Fake-Daten für Entwicklung, Tests und Vorschau ohne Heimnetz.
// Deterministisch je Datum (gleicher Tag → gleiche Werte), Summen = Summe der Zeitreihen.
import type { EnergySummary, EnergyTotals, LiveSnapshot, SeriesData, SeriesKind } from './index';
import { APPLIANCE_NAMES } from './names';
import { allocate, type Allocation, type Interval } from './allocation';
import { computeYield, type AssetInfo, type YieldResult } from './yield';
import { computeCosts, type CostResult, type Tariff } from './tariff';
import { type Period, anchor, bounds, bucketStarts, energyStep, gaugeStep, isCurrent, localDate, parseDate, zonedParts } from './time';

const r = (n: number, d = 0) => Math.round(n * 10 ** d) / 10 ** d;
const jitter = (amp: number) => (Math.random() - 0.5) * 2 * amp;

/** PV-Profil 0..1 nach Tageszeit (Oktober: ca. 7:30–18:00). */
function sun(date: Date): number {
  const h = date.getHours() + date.getMinutes() / 60;
  if (h < 7.5 || h > 18) return 0;
  return Math.sin(((h - 7.5) / 10.5) * Math.PI) ** 1.5;
}

export function mockLive(now = new Date()): LiveSnapshot {
  const s = sun(now);
  const pvRoof = r(6200 * s + (s ? jitter(150) : 0));
  const pvCarport = r(6500 * s + (s ? jitter(150) : 0)); // real: Carport ≈ Dach
  const pv = pvRoof + pvCarport;
  const heatpump = r(900 + jitter(250));
  const wallbox = s > 0.4 ? r(3600 + jitter(100)) : 0;
  const appliances = Object.entries(APPLIANCE_NAMES).map(([id, name]) => ({
    id,
    name,
    power:
      id === 'router' ? r(14 + jitter(2)) :
      id === 'kuehlschrank' ? r(Math.random() > 0.5 ? 85 : 0) :
      id === 'freezer' ? r(Math.random() > 0.6 ? 110 : 0) :
      id === 'coffeemachine' ? r(Math.random() > 0.9 ? 1250 : 3) :
      0,
  }));
  const rest = r(320 + appliances.reduce((a, b) => a + (b.power ?? 0), 0) + jitter(40));
  const house = heatpump + wallbox + rest;
  const surplus = pv - house;
  const battery = surplus > 0 ? -Math.min(surplus, 3000) : Math.min(-surplus, 2500);
  const grid = r(house - pv - battery);
  return {
    ts: now.toISOString(),
    power: { pv, pvRoof, pvCarport, grid, battery: r(battery), house: r(house), heatpump, wallbox, rest, solarThermal: r(1800 * s) },
    battery: { soc: r(55 + 35 * s) },
    heatpump: { cop: r(3.4 + jitter(0.3), 2), heatOutput: r(heatpump * 3.4), flowTemp: r(34 + jitter(1), 1), dhwTop: r(49 + jitter(0.5), 1), bufferTop: r(38 + jitter(0.5), 1) },
    solarThermal: { collectorTemp: r(12 + 45 * s, 1) },
    outdoorTemp: r(9 + 5 * s, 1),
    rooms: [
      { id: 'Wohnzimmer', name: 'Wohnzimmer', climate: { temp: 21.4, hum: 46, co2: 612 } },
      { id: 'Gallerie', name: 'Galerie', climate: { temp: 20.8, hum: 41, co2: 845 } },
    ],
    car: { soc: 64, range: 238, home: true, plugged: wallbox > 0 },
    appliances,
    stale: [],
  };
}

// ------------------------------------------------------------ Tages-Simulation

function seeded(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

type Hour = Record<string, number>; // Energie kWh in dieser Stunde bzw. Mittelwerte
interface SimDay { energy: Hour[]; gauge: Hour[] }
const APPS = Object.keys(APPLIANCE_NAMES);
const cache = new Map<string, SimDay>();

function simulateDay(date: string): SimDay {
  const hit = cache.get(date);
  if (hit) return hit;
  const rnd = seeded(date);
  const [, m] = parseDate(date);
  const summer = Math.sin((Math.PI * (m + 0.5)) / 12) ** 2; // 0 Winter … 1 Sommer
  const cloud = 0.35 + 0.65 * rnd();
  const sunrise = 8 - 2.5 * summer, sunset = 16.8 + 4.4 * summer;
  const outdoorBase = 1 + 19 * summer + (rnd() - 0.5) * 4;
  const charging = rnd() > 0.55;
  let soc = 30 + rnd() * 20; // %
  const cap = 10; // kWh
  const energy: Hour[] = [];
  const gauge: Hour[] = [];
  for (let h = 0; h < 24; h++) {
    const mid = h + 0.5;
    const prof = mid < sunrise || mid > sunset ? 0 : Math.sin(((mid - sunrise) / (sunset - sunrise)) * Math.PI) ** 1.4;
    const pvRoof = 7.2 * (0.55 + 0.45 * summer) * cloud * prof;
    const pvCarport = pvRoof * 1.05;
    const outdoor = outdoorBase + 4 * Math.sin(((h - 9) / 24) * 2 * Math.PI);
    const heatNeed = Math.max(0.15, (18 - outdoor) / 18);
    const cop = Math.max(2.2, 2.6 + 0.08 * outdoor + rnd() * 0.2);
    const hpHeat = 0.4 + 4.2 * heatNeed * (h >= 22 || h < 5 ? 0.7 : 1);
    const heatpump = hpHeat / cop;
    const solarThermal = pvRoof * 0.28;
    const wallbox = charging && h >= 11 && h < 14 ? 3.6 : 0;
    const peak = h === 7 || h === 12 || h === 18 || h === 19 ? 0.8 : 0;
    const rest = 0.32 + peak * rnd();
    const house = rest + heatpump + wallbox;
    let surplus = pvRoof + pvCarport - house;
    let charge = 0, discharge = 0;
    if (surplus > 0) {
      charge = Math.min(surplus, 3, ((100 - soc) / 100) * cap);
      surplus -= charge;
      soc += (charge / cap) * 100;
    } else {
      discharge = Math.min(-surplus, 2.5, ((soc - 10) / 100) * cap);
      surplus += discharge;
      soc -= (discharge / cap) * 100;
    }
    const apps: Hour = {};
    const shares = [0.06, 0.12, 0.1, 0.09, 0.1, 0.18, 0.12, 0.05];
    APPS.forEach((id, i) => (apps[`appliance.${id}`] = rest * shares[i] * (0.6 + rnd() * 0.8)));
    energy.push({
      pvRoof, pvCarport, heatpump, heatpumpHeat: hpHeat, solarThermal, wallbox,
      batteryCharge: charge, batteryDischarge: discharge,
      gridExport: Math.max(0, surplus), gridImport: Math.max(0, -surplus),
      ...apps,
    });
    gauge.push({
      'pvRoof.power': pvRoof * 1000, 'pvCarport.power': pvCarport * 1000, 'pv.power': (pvRoof + pvCarport) * 1000,
      'grid.power': -surplus * 1000, 'battery.power': (discharge - charge) * 1000, 'battery.soc': soc,
      'heatpump.power': heatpump * 1000, 'heatpump.heat': hpHeat * 1000, 'heatpump.cop': cop,
      'heatpump.flowTemp': 28 + 12 * heatNeed, 'heatpump.dhwTop': 47 + 3 * Math.sin(h / 3), 'heatpump.bufferTop': 33 + 8 * heatNeed,
      'outdoor.temp': outdoor, 'solarThermal.power': solarThermal * 1000, 'solarThermal.collectorTemp': outdoor + 50 * prof * cloud,
      'wallbox.power': wallbox * 1000, 'car.soc': 40 + (charging ? Math.min(40, Math.max(0, h - 11) * 9) : 0),
      'house.power': house * 1000,
      'Wohnzimmer.temp': 21 + 0.8 * Math.sin(((h - 15) / 24) * 2 * Math.PI), 'Gallerie.temp': 20.4 + 0.6 * Math.sin(((h - 16) / 24) * 2 * Math.PI),
      'Wohnzimmer.co2': 500 + 400 * (h >= 18 && h <= 23 ? 1 : h < 7 ? 0.4 : 0.15), 'Gallerie.co2': 480 + 520 * (h < 7 || h >= 22 ? 1 : 0.1),
    });
  }
  const day = { energy, gauge };
  cache.set(date, day);
  return day;
}

/** Lokale Stunde (0–23) und Datum eines Zeitpunkts in Wien. */
function localHour(t: Date): { date: string; hour: number } {
  const p = zonedParts(t);
  const pad = (n: number) => String(n).padStart(2, '0');
  return { date: `${p.year}-${pad(p.month)}-${pad(p.day)}`, hour: p.hour };
}

const derive = (h: Hour, key: string): number => {
  const pv = (h.pvRoof ?? 0) + (h.pvCarport ?? 0);
  if (key === 'pv') return pv;
  const house = pv + (h.gridImport ?? 0) - (h.gridExport ?? 0) + (h.batteryDischarge ?? 0) - (h.batteryCharge ?? 0);
  if (key === 'house') return house;
  if (key === 'rest') return house - (h.heatpump ?? 0) - (h.wallbox ?? 0);
  return h[key] ?? 0;
};

/** Energie eines Zeitintervalls [a, b) je Key als Summe der Simulationsstunden (anteilig). */
function energyBetween(a: Date, b: Date, keys: string[]): Record<string, number> {
  const sum: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 0]));
  for (let t = a.getTime(); t < b.getTime(); t += 3_600_000) {
    const { date, hour } = localHour(new Date(t));
    const span = Math.min(1, (b.getTime() - t) / 3_600_000);
    const h = simulateDay(date).energy[hour];
    for (const k of keys) sum[k] += derive(h, k) * span;
  }
  return sum;
}

export function mockSeries(kind: SeriesKind, keys: string[], period: Period, date: string, now = new Date()): SeriesData {
  const step = kind === 'energy' ? energyStep(period) : gaugeStep(period);
  const starts = bucketStarts(period, date, step);
  const { end } = bounds(period, date);
  const values: SeriesData['values'] = Object.fromEntries(keys.map((k) => [k, []]));
  starts.forEach((s, i) => {
    const next = starts[i + 1] ?? end;
    const stop = next > now ? now : next;
    if (s >= now) {
      for (const k of keys) values[k].push(null);
      return;
    }
    const en = kind === 'energy' ? energyBetween(s, stop, keys) : null;
    for (const k of keys) {
      if (en) {
        values[k].push(r(en[k], 3));
      } else {
        // Mittelwert über die Simulationsstunden im Bucket (5-min: Stundenwert + Rauschen)
        let sum = 0, n = 0;
        for (let t = s.getTime(); t < stop.getTime(); t += 3_600_000) {
          const { date: d, hour } = localHour(new Date(t));
          sum += simulateDay(d).gauge[hour][k] ?? 0;
          n++;
        }
        const v = n ? sum / n : 0;
        const noise = step === '5m' && /power/.test(k) ? 1 + (Math.random() - 0.5) * 0.15 : 1;
        values[k].push(r(v * noise, 1));
      }
    }
  });
  return { kind, period, date: anchor(period, date), step, t: starts.map((x) => x.toISOString()), values };
}

const ENERGY_KEYS = ['pvRoof', 'pvCarport', 'gridImport', 'gridExport', 'batteryCharge', 'batteryDischarge', 'heatpump', 'heatpumpHeat', 'wallbox', 'solarThermal'];

export function mockSummary(period: Period, date = localDate(), now = new Date()): EnergySummary {
  const { from, end } = bounds(period, date);
  const to = end > now ? now : end;
  const appKeys = Object.keys(APPLIANCE_NAMES).map((id) => `appliance.${id}`);
  const all = to > from ? energyBetween(from, to, [...ENERGY_KEYS, ...appKeys]) : {};
  const g = (k: string) => all[k] ?? 0;
  const e = Object.fromEntries(ENERGY_KEYS.map((k) => [k, g(k)])) as Record<string, number>;
  const pv = e.pvRoof + e.pvCarport;
  const house = pv + e.gridImport - e.gridExport + e.batteryDischarge - e.batteryCharge;
  const energy = Object.fromEntries(
    Object.entries({ ...e, pv, house, rest: house - e.heatpump - e.wallbox }).map(([k, v]) => [k, r(v, 3)]),
  ) as unknown as EnergyTotals;
  return {
    period,
    date: anchor(period, date),
    from: from.toISOString(),
    to: to.toISOString(),
    end: end.toISOString(),
    isCurrent: isCurrent(period, date, now),
    energy,
    appliances: Object.entries(APPLIANCE_NAMES).map(([id, name]) => ({ id, name, kwh: r(g(`appliance.${id}`), 3) })),
    kpi: {
      selfSufficiency: house > 0 ? r((house - e.gridImport) / house, 3) : null,
      selfConsumption: pv > 0 ? r((pv - e.gridExport) / pv, 3) : null,
      cop: e.heatpump > 0 ? r(e.heatpumpHeat / e.heatpump, 2) : null,
    },
    missing: [],
  };
}


// ------------------------------------------------------------ Herkunfts-Aufteilung (Mock)

function mockIntervals(period: Period, date: string, now: Date): { intervals: Interval[]; from: Date; to: Date } {
  const { from, end } = bounds(period, date);
  const to = end > now ? now : end;
  const intervals: Interval[] = [];
  for (let t = from.getTime(); t < to.getTime(); t += 3_600_000) {
    const { date: d, hour } = localHour(new Date(t));
    const h = simulateDay(d).energy[hour];
    intervals.push({
      t: new Date(t),
      pvRoof: h.pvRoof, pvCarport: h.pvCarport, gridImport: h.gridImport, gridExport: h.gridExport,
      batteryCharge: h.batteryCharge, batteryDischarge: h.batteryDischarge,
      heatpump: h.heatpump, heatpumpHeat: h.heatpumpHeat, wallbox: h.wallbox,
    });
  }
  return { intervals, from, to };
}

const mockMeta = (period: Period, date: string, from: Date, to: Date) => ({
  period, date: anchor(period, date), from: from.toISOString(), to: to.toISOString(), step: '1h' as const, bucketStep: energyStep(period),
});

export function mockAllocation(period: Period, date = localDate(), now = new Date()): Allocation {
  const { intervals, from, to } = mockIntervals(period, date, now);
  return allocate(intervals, bucketStarts(period, date, energyStep(period)), mockMeta(period, date, from, to));
}

export function mockYield(period: Period, date = localDate(), now = new Date()): YieldResult {
  const { intervals, from, to } = mockIntervals(period, date, now);
  return computeYield(intervals, bucketStarts(period, date, energyStep(period)), mockMeta(period, date, from, to));
}

export function mockCosts(period: Period, date: string, tariffs: Tariff[], now = new Date()): CostResult {
  const { intervals, from, to } = mockIntervals(period, date, now);
  return computeCosts(intervals, tariffs, bucketStarts(period, date, energyStep(period)), mockMeta(period, date, from, to));
}

export const mockAssets = (): AssetInfo => ({ carport: '2024-05-14T08:00:00.000Z', battery: '2025-03-03T09:00:00.000Z' });
