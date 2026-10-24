// Ertrag je Anlage mit Rangfolge – Grundlage der Amortisation (PV Carport, Akku).
//
// Rangfolge je Intervall (15 min, Jahr: 1 h):
//  1. PV Dach deckt den Hausverbrauch zuerst (abgeschrieben, "kostet nichts").
//  2. PV Carport deckt den verbleibenden Hausverbrauch.
//  3. Überschuss lädt den Akku, zuerst aus PV Dach, dann aus PV Carport. Reicht er nicht, geht die Ladung zulasten
//     des Eigenverbrauchs (Carport vor Dach) – der Akku lädt nur aus PV (DC am Carport-WR). Netz nur als Messrest.
//  4. Verbleibender Überschuss wird eingespeist.
// Hausverbrauch = PV + Bezug − Einspeisung + Entladung − Ladung (ohne Akku-Ladung).
// Bewertung (Client, mit Preisen): Carport = Eigenverbrauch × Bezugspreis + Überschuss × Einspeisetarif.
// Akku = Entladung × Bezugspreis − PV-Ladung × Einspeisetarif (entgangene Einspeisung) − Netzladung × Bezugspreis.

import type { Interval } from './allocation';
import type { Period, Step } from './time';

export interface PlantYield {
  produced: number; // kWh erzeugt
  self: number; // direkt im Haus verbraucht
  toBattery: number; // in den Akku
  exported: number; // eingespeist
}

export interface BatteryYield {
  charged: number;
  fromRoof: number;
  fromCarport: number;
  fromGrid: number;
  discharged: number;
}

export interface YieldSplit {
  house: number;
  roof: PlantYield;
  carport: PlantYield;
  battery: BatteryYield;
}

export interface YieldResult {
  period: Period;
  date: string;
  from: string;
  to: string;
  step: Step;
  bucketStep: Step;
  totals: YieldSplit;
  buckets: { t: string[]; items: YieldSplit[] };
  intervals: number;
}

const plant = (): PlantYield => ({ produced: 0, self: 0, toBattery: 0, exported: 0 });
export const emptyYield = (): YieldSplit => ({
  house: 0,
  roof: plant(),
  carport: plant(),
  battery: { charged: 0, fromRoof: 0, fromCarport: 0, fromGrid: 0, discharged: 0 },
});

function addInto(a: YieldSplit, b: YieldSplit) {
  a.house += b.house;
  for (const p of ['roof', 'carport'] as const) for (const k of Object.keys(a[p]) as (keyof PlantYield)[]) a[p][k] += b[p][k];
  for (const k of Object.keys(a.battery) as (keyof BatteryYield)[]) a.battery[k] += b.battery[k];
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;
function round(y: YieldSplit): YieldSplit {
  const rp = (p: PlantYield): PlantYield => ({ produced: r3(p.produced), self: r3(p.self), toBattery: r3(p.toBattery), exported: r3(p.exported) });
  const b = y.battery;
  return {
    house: r3(y.house),
    roof: rp(y.roof),
    carport: rp(y.carport),
    battery: { charged: r3(b.charged), fromRoof: r3(b.fromRoof), fromCarport: r3(b.fromCarport), fromGrid: r3(b.fromGrid), discharged: r3(b.discharged) },
  };
}

/** Rangfolge eines Intervalls. */
export function intervalYield(i: Interval): YieldSplit {
  const roof = Math.max(0, i.pvRoof);
  const carport = Math.max(0, i.pvCarport);
  const chg = Math.max(0, i.batteryCharge);
  const dis = Math.max(0, i.batteryDischarge);
  const house = Math.max(0, roof + carport + Math.max(0, i.gridImport) - Math.max(0, i.gridExport) + dis - chg);

  const roofSelf0 = Math.min(roof, house);
  const carportSelf0 = Math.min(carport, house - roofSelf0);
  const roofSur = roof - roofSelf0;
  const carportSur = carport - carportSelf0;
  const roofSurToBat = Math.min(chg, roofSur);
  const carportSurToBat = Math.min(chg - roofSurToBat, carportSur);
  // Akku lädt nur aus PV (DC am Carport-WR, keine Netzladung): reicht der Überschuss nicht,
  // ging die Ladung zulasten des Eigenverbrauchs – zuerst Carport (DC-gekoppelt), dann Dach; das Haus bezog dafür Netz.
  const rest = chg - roofSurToBat - carportSurToBat;
  const carportSelfToBat = Math.min(rest, carportSelf0);
  const roofSelfToBat = Math.min(rest - carportSelfToBat, roofSelf0);
  const fromRoof = roofSurToBat + roofSelfToBat;
  const fromCarport = carportSurToBat + carportSelfToBat;
  const fromGrid = rest - carportSelfToBat - roofSelfToBat; // nur bei Messungenauigkeit (Ladung > PV)

  return {
    house,
    roof: { produced: roof, self: roofSelf0 - roofSelfToBat, toBattery: fromRoof, exported: roofSur - roofSurToBat },
    carport: { produced: carport, self: carportSelf0 - carportSelfToBat, toBattery: fromCarport, exported: carportSur - carportSurToBat },
    battery: { charged: chg, fromRoof, fromCarport, fromGrid, discharged: dis },
  };
}

export function computeYield(
  intervals: Interval[],
  bucketStarts: Date[],
  meta: Pick<YieldResult, 'period' | 'date' | 'from' | 'to' | 'step' | 'bucketStep'>,
): YieldResult {
  const totals = emptyYield();
  const items = bucketStarts.map(emptyYield);
  const sorted = [...intervals].sort((a, b) => a.t.getTime() - b.t.getTime());
  let bi = 0;
  let count = 0;
  for (const i of sorted) {
    while (bi + 1 < bucketStarts.length && bucketStarts[bi + 1] <= i.t) bi++;
    const y = intervalYield(i);
    addInto(totals, y);
    if (bucketStarts.length && i.t >= bucketStarts[0]) addInto(items[bi], y);
    if (y.house > 0 || y.roof.produced > 0 || y.carport.produced > 0) count++;
  }
  return { ...meta, totals: round(totals), buckets: { t: bucketStarts.map((t) => t.toISOString()), items: items.map(round) }, intervals: count };
}

// ------------------------------------------------------------------ Bewertung

export interface Prices {
  buy: number; // €/kWh Bezug (Energie + Netz + Abgaben, brutto)
  feed: number; // €/kWh Einspeisung
}

export interface AssetValue {
  carport: { self: number; feed: number; total: number };
  battery: { saved: number; lostFeed: number; gridCharge: number; total: number };
}

/** Geldwert eines Ertrags bei festen Preisen (später: je Intervall mit Zeitzonentarif). */
export function valueOf(y: YieldSplit, p: Prices): AssetValue {
  const cSelf = y.carport.self * p.buy;
  const cFeed = (y.carport.toBattery + y.carport.exported) * p.feed;
  const saved = y.battery.discharged * p.buy;
  const lostFeed = (y.battery.fromRoof + y.battery.fromCarport) * p.feed;
  const gridCharge = y.battery.fromGrid * p.buy;
  return {
    carport: { self: cSelf, feed: cFeed, total: cSelf + cFeed },
    battery: { saved, lostFeed, gridCharge, total: saved - lostFeed - gridCharge },
  };
}

/** Inbetriebnahme je Anlage (erster Datenpunkt in InfluxDB). */
export interface AssetInfo {
  carport: string | null;
  battery: string | null;
}
