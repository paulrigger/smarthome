import type { EnergySummary, EnergyTotals, LiveSnapshot, Period } from '@smarthome/shared';
import { APPLIANCE_NAMES } from '@smarthome/shared';
import { APPLIANCE_IDS, COUNTER_SERIES, LIVE_SERIES, STALE_AFTER_MS } from './registry';

export interface Point {
  value: number | boolean | string;
  time: Date;
}
/** key (aus registry) -> Rohpunkt (noch ohne Faktor) */
export type RawPoints = Map<string, Point>;

const LIVE_BY_KEY = new Map(LIVE_SERIES.map((d) => [d.key, d]));
const COUNTER_BY_KEY = new Map(COUNTER_SERIES.map((d) => [d.key, d]));

const round = (n: number, d = 0) => Math.round(n * 10 ** d) / 10 ** d;

function toNum(v: Point['value'] | undefined): number | null {
  if (v === undefined || v === null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toBool(v: Point['value'] | undefined): boolean | null {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const t = String(v).toLowerCase();
  if (['true', '1', 'on', 'yes'].includes(t)) return true;
  if (['false', '0', 'off', 'no'].includes(t)) return false;
  return null;
}

// ---------------------------------------------------------------- live

export function buildLive(raw: RawPoints, now = new Date()): LiveSnapshot {
  const stale: string[] = [];
  const val = (key: string, digits = 0, staleCheck = true): number | null => {
    const def = LIVE_BY_KEY.get(key);
    const p = raw.get(key);
    const n = toNum(p?.value);
    if (!def || !p || n === null) {
      stale.push(key);
      return null;
    }
    if (staleCheck && now.getTime() - p.time.getTime() > STALE_AFTER_MS) {
      stale.push(key);
      return null;
    }
    return round(n * def.factor, digits);
  };
  const bool = (key: string) => toBool(raw.get(key)?.value);

  const pvRoof = val('pvRoof.power');
  const pvCarport = val('pvCarport.power');
  const grid = val('grid.power');
  const battery = val('battery.power');
  const heatpump = val('heatpump.power');
  const wallbox = val('wallbox.power');

  const pv = pvRoof === null && pvCarport === null ? null : Math.max(0, pvRoof ?? 0) + Math.max(0, pvCarport ?? 0);
  // Energiebilanz am Hausanschluss: Verbrauch = PV + Netz + Batterie(Entladung)
  const house = pv === null || grid === null ? null : Math.max(0, pv + grid + (battery ?? 0));
  const rest = house === null ? null : Math.max(0, house - (heatpump ?? 0) - (wallbox ?? 0));

  return {
    ts: now.toISOString(),
    power: {
      pv, pvRoof, pvCarport, grid, battery, house, heatpump, wallbox, rest,
      solarThermal: val('solarThermal.power', 0, false),
    },
    battery: { soc: val('battery.soc', 0, false) },
    heatpump: {
      cop: val('heatpump.cop', 2),
      heatOutput: val('heatpump.heat'),
      flowTemp: val('heatpump.flowTemp', 1, false),
      dhwTop: val('heatpump.dhwTop', 1, false),
      bufferTop: val('heatpump.bufferTop', 1, false),
    },
    solarThermal: { collectorTemp: val('solarThermal.collectorTemp', 1, false) },
    outdoorTemp: val('outdoor.temp', 1, false),
    rooms: [
      { id: 'Wohnzimmer', name: 'Wohnzimmer' },
      { id: 'Gallerie', name: 'Galerie' },
    ].map((r) => ({
      ...r,
      climate: {
        temp: val(`${r.id}.temp`, 1, false),
        hum: val(`${r.id}.hum`, 0, false),
        co2: val(`${r.id}.co2`, 0, false),
      },
    })),
    car: {
      soc: val('car.soc', 0, false),
      range: val('car.range', 0, false),
      home: bool('car.home'),
      plugged: bool('car.plugged'),
    },
    appliances: APPLIANCE_IDS.map((id) => ({ id, name: APPLIANCE_NAMES[id] ?? id, power: val(`appliance.${id}.power`, 0, false) })),
    stale,
  };
}

// ---------------------------------------------------------------- summary

/** Energie (kWh) je Zähler = (last − first) * factor; Zählerreset/negativ -> 0. */
export function counterDeltas(first: RawPoints, last: RawPoints): { delta: Map<string, number>; missing: string[] } {
  const delta = new Map<string, number>();
  const missing: string[] = [];
  for (const def of COUNTER_SERIES) {
    const a = toNum(first.get(def.key)?.value);
    const b = toNum(last.get(def.key)?.value);
    if (a === null || b === null) {
      missing.push(def.key);
      continue;
    }
    delta.set(def.key, Math.max(0, (b - a) * def.factor));
  }
  return { delta, missing };
}

export function buildSummary(period: Period, from: Date, to: Date, first: RawPoints, last: RawPoints): EnergySummary {
  const { delta, missing } = counterDeltas(first, last);
  const g = (k: string) => delta.get(k) ?? 0;

  const pvRoof = g('pvRoof');
  const pvCarport = g('pvCarport');
  const pv = pvRoof + pvCarport;
  const gridImport = g('gridImport');
  const gridExport = g('gridExport');
  const batteryCharge = g('batteryCharge');
  const batteryDischarge = g('batteryDischarge');
  const heatpump = g('heatpump');
  const wallbox = g('wallbox');
  const house = Math.max(0, pv + gridImport - gridExport + batteryDischarge - batteryCharge);

  const e: EnergyTotals = {
    pv, pvRoof, pvCarport, gridImport, gridExport, batteryCharge, batteryDischarge, house,
    heatpump, heatpumpHeat: g('heatpumpHeat'), wallbox,
    rest: Math.max(0, house - heatpump - wallbox),
    solarThermal: g('solarThermal'),
  };
  const energy = Object.fromEntries(Object.entries(e).map(([k, v]) => [k, round(v, 3)])) as unknown as EnergyTotals;

  return {
    period,
    from: from.toISOString(),
    to: to.toISOString(),
    energy,
    appliances: APPLIANCE_IDS.map((id) => ({ id, name: APPLIANCE_NAMES[id] ?? id, kwh: round(g(`appliance.${id}`), 3) })),
    kpi: {
      selfSufficiency: house > 0 ? round(Math.min(1, Math.max(0, (house - gridImport) / house)), 3) : null,
      selfConsumption: pv > 0 ? round(Math.min(1, Math.max(0, (pv - gridExport) / pv)), 3) : null,
      cop: heatpump > 0.05 && delta.has('heatpumpHeat') ? round(g('heatpumpHeat') / heatpump, 2) : null,
    },
    missing,
  };
}

// ---------------------------------------------------------------- Zeitraum

/** Offset (ms) der Zeitzone zum Zeitpunkt t: lokale Wanduhrzeit − UTC. */
function tzOffset(t: Date, tz: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(t).map((x) => [x.type, x.value]),
  );
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(t.getTime() / 1000) * 1000;
}

/** Beginn von heute / diesem Monat in der Zeitzone tz (z.B. Europe/Vienna). */
export function periodStart(period: Period, now: Date, tz: string): Date {
  const local = new Date(now.getTime() + tzOffset(now, tz)); // Wanduhrzeit als "UTC"
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const d = period === 'month' ? 1 : local.getUTCDate();
  const guess = Date.UTC(y, m, d);
  // Offset am Ziel-Zeitpunkt (DST-Wechsel innerhalb des Monats möglich)
  return new Date(guess - tzOffset(new Date(guess), tz));
}
