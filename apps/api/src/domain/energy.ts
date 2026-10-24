import type { EnergySummary, EnergyTotals, LiveSnapshot, Period, SeriesData, SeriesKind, Step } from '@smarthome/shared';
import { APPLIANCE_NAMES } from '@smarthome/shared';
import { APPLIANCE_IDS, COUNTER_SERIES, LIVE_SERIES, STALE_AFTER_MS } from './registry';
import { correctHybrid } from './hybrid';

const HYBRID_KEYS = ['pvCarport', 'batteryCharge', 'batteryDischarge'] as const;

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

export interface Range {
  period: Period;
  date: string;
  from: Date;
  to: Date; // Datenende (jetzt bei laufendem Zeitraum)
  end: Date;
  isCurrent: boolean;
}

export function buildSummary(range: Range, first: RawPoints, last: RawPoints): EnergySummary {
  const { period, date, from, to, end, isCurrent } = range;
  const { delta, missing } = counterDeltas(first, last);
  const g = (k: string) => delta.get(k) ?? 0;

  const pvRoof = g('pvRoof');
  // Hybrid-WR: Zähler = AC-Ausgabe inkl. Akku → PV und Akku-Entladung auf AC-Basis (hybrid.ts)
  const { pvCarport, batteryCharge, batteryDischarge } = correctHybrid({ pvCarport: g('pvCarport'), batteryCharge: g('batteryCharge'), batteryDischarge: g('batteryDischarge') });
  const pv = pvRoof + pvCarport;
  const gridImport = g('gridImport');
  const gridExport = g('gridExport');
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
    date,
    from: from.toISOString(),
    to: to.toISOString(),
    end: end.toISOString(),
    isCurrent,
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

// ---------------------------------------------------------------- Zeitreihen

/** Rohzeile einer Zeitreihe: key, Bucket-Start, Wert (noch ohne Faktor). */
export interface SeriesPoint {
  key: string;
  time: Date;
  value: number;
}

const FACTOR = new Map<string, number>([...COUNTER_SERIES, ...LIVE_SERIES].map((d) => [d.key, d.factor]));

/** Basis-Keys, die für abgeleitete Keys abgefragt werden müssen. */
export function expandKeys(kind: SeriesKind, keys: string[]): string[] {
  const out = new Set<string>();
  for (const k of keys) {
    if (kind === 'energy') {
      // Hybrid-Korrektur braucht immer alle drei Zähler (hybrid.ts)
      if (k === 'pv' || k === 'pvCarport' || k === 'batteryDischarge') HYBRID_KEYS.forEach((x) => out.add(x));
      if (k === 'pv') ['pvRoof', 'pvCarport'].forEach((x) => out.add(x));
      else if (k === 'house' || k === 'rest')
        ['pvRoof', 'pvCarport', 'gridImport', 'gridExport', 'batteryCharge', 'batteryDischarge', ...(k === 'rest' ? ['heatpump', 'wallbox'] : [])].forEach((x) => out.add(x));
      else out.add(k);
    } else {
      if (k === 'pv.power') ['pvRoof.power', 'pvCarport.power'].forEach((x) => out.add(x));
      else if (k === 'house.power') ['pvRoof.power', 'pvCarport.power', 'grid.power', 'battery.power'].forEach((x) => out.add(x));
      else out.add(k);
    }
  }
  return [...out];
}

export function buildSeries(kind: SeriesKind, keys: string[], period: Period, date: string, step: Step, starts: Date[], points: SeriesPoint[], now = new Date()): SeriesData {
  // Raster: key -> Bucket-Index -> Wert (mit Faktor)
  const idx = new Map(starts.map((t, i) => [t.getTime(), i]));
  const grid = new Map<string, (number | null)[]>();
  const nearest = (t: number) => {
    const exact = idx.get(t);
    if (exact !== undefined) return exact;
    // Toleranz für leicht verschobene Fensterstarts (DST, Rundung): nächster Start ≤ t
    let best = -1;
    for (let i = 0; i < starts.length && starts[i].getTime() <= t; i++) best = i;
    return best;
  };
  for (const p of points) {
    const i = nearest(p.time.getTime());
    if (i < 0) continue;
    if (!grid.has(p.key)) grid.set(p.key, starts.map(() => null));
    const f = FACTOR.get(p.key) ?? 1;
    const v = kind === 'energy' ? Math.max(0, p.value * f) : p.value * f;
    const arr = grid.get(p.key)!;
    arr[i] = (kind === 'energy' ? (arr[i] ?? 0) : 0) + v;
  }
  // Hybrid-WR: je Bucket PV Carport und Akku-Entladung auf AC-Basis umrechnen (hybrid.ts)
  if (kind === 'energy' && grid.has('pvCarport')) {
    const [ac, chg, dis] = HYBRID_KEYS.map((k) => grid.get(k));
    starts.forEach((_, i) => {
      if (ac?.[i] === null || ac?.[i] === undefined) return;
      const c = correctHybrid({ pvCarport: ac[i]!, batteryCharge: chg?.[i] ?? 0, batteryDischarge: dis?.[i] ?? 0 });
      ac[i] = c.pvCarport;
      if (dis && dis[i] !== null) dis[i] = c.batteryDischarge;
    });
  }
  const get = (k: string, i: number) => grid.get(k)?.[i] ?? null;
  const sum = (ks: string[], i: number, signs: number[]) => {
    let any = false, s = 0;
    ks.forEach((k, j) => {
      const v = get(k, i);
      if (v !== null) { any = true; s += v * signs[j]; }
    });
    return any ? s : null;
  };
  const values: SeriesData['values'] = {};
  for (const k of keys) {
    values[k] = starts.map((t, i) => {
      if (t > now) return null;
      let v: number | null;
      if (k === 'pv') v = sum(['pvRoof', 'pvCarport'], i, [1, 1]);
      else if (k === 'house' || k === 'rest') {
        v = sum(['pvRoof', 'pvCarport', 'gridImport', 'gridExport', 'batteryDischarge', 'batteryCharge'], i, [1, 1, 1, -1, 1, -1]);
        if (v !== null) v = Math.max(0, v - (k === 'rest' ? (get('heatpump', i) ?? 0) + (get('wallbox', i) ?? 0) : 0));
      } else if (k === 'pv.power') v = sum(['pvRoof.power', 'pvCarport.power'], i, [1, 1]);
      else if (k === 'house.power') {
        v = sum(['pvRoof.power', 'pvCarport.power', 'grid.power', 'battery.power'], i, [1, 1, 1, 1]);
        if (v !== null) v = Math.max(0, v);
      } else v = get(k, i);
      return v === null ? null : round(v, kind === 'energy' ? 3 : 2);
    });
    // Gauges: Sensoren schreiben oft nur bei Änderung → letzten Wert bis "jetzt" fortschreiben
    if (kind === 'gauge') {
      let last: number | null = null;
      values[k] = values[k].map((v, i) => (starts[i] > now ? null : v !== null ? (last = v) : last));
    }
  }
  return { kind, period, date, step, t: starts.map((x) => x.toISOString()), values };
}
