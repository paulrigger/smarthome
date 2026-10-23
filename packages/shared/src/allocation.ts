// Herkunft des Stroms je Verbraucher (Wärmepumpe, Auto, Haushalt).
//
// Modell (bewusst einfach, nachvollziehbar):
//  1. Je Intervall (15 min) stehen dem Haus drei Quellen zur Verfügung:
//       PV direkt = PV − Einspeisung − Akku-Ladung   (was von der PV sofort im Haus verbraucht wird)
//       Akku      = Akku-Entladung                   (gespeicherter, fast ausschließlich PV-Strom)
//       Netz      = Netzbezug
//  2. Alle Verbraucher im Intervall bekommen denselben Mix (proportional).
//     Läuft z.B. die WP, während 30 % des Hausverbrauchs aus dem Netz kommen, ist ihr Strom zu 30 % Netz.
//  3. Summiert über die Intervalle ergibt sich die Herkunft je Tag/Monat/Jahr.
// Wichtig: Aufteilen je Intervall und dann summieren – nicht aus Tagessummen rechnen.

import type { Period, Step } from './time';

export interface SourceSplit {
  total: number; // kWh
  pv: number; // PV direkt
  battery: number; // aus dem Akku
  grid: number; // aus dem Netz
}

/** Energie (kWh) eines Intervalls, Rohwerte aus den Zählern. */
export interface Interval {
  t: Date;
  pvRoof: number;
  pvCarport: number;
  gridImport: number;
  gridExport: number;
  batteryCharge: number;
  batteryDischarge: number;
  heatpump: number;
  heatpumpHeat: number;
  wallbox: number;
}

export interface ChargeSession extends SourceSplit {
  start: string;
  end: string;
}

export interface Allocation {
  period: Period;
  date: string;
  from: string;
  to: string;
  step: Step; // Rechenraster (15m bzw. 1h)
  bucketStep: Step; // Darstellungsraster (Stunde/Tag/Monat)
  totals: {
    house: SourceSplit;
    heatpump: SourceSplit;
    wallbox: SourceSplit;
    rest: SourceSplit;
    heatpumpHeat: SourceSplit; // erzeugte Wärme, nach Herkunft des WP-Stroms
  };
  buckets: { t: string[]; heatpump: SourceSplit[]; wallbox: SourceSplit[]; heatpumpHeat: number[] };
  sessions: ChargeSession[];
  intervals: number; // Anzahl Intervalle mit Daten
}

export const emptySplit = (): SourceSplit => ({ total: 0, pv: 0, battery: 0, grid: 0 });

const add = (a: SourceSplit, b: SourceSplit) => {
  a.total += b.total;
  a.pv += b.pv;
  a.battery += b.battery;
  a.grid += b.grid;
};

const r3 = (n: number) => Math.round(n * 1000) / 1000;
export const roundSplit = (s: SourceSplit): SourceSplit => ({ total: r3(s.total), pv: r3(s.pv), battery: r3(s.battery), grid: r3(s.grid) });

/** Quellen-Mix eines Intervalls als Anteile (Summe 1) oder null ohne Verbrauch. */
export function intervalMix(i: Interval): { pv: number; battery: number; grid: number } | null {
  const pv = Math.max(0, i.pvRoof + i.pvCarport - i.gridExport - i.batteryCharge);
  const battery = Math.max(0, i.batteryDischarge);
  const grid = Math.max(0, i.gridImport);
  const sum = pv + battery + grid;
  if (sum <= 1e-6) return null;
  return { pv: pv / sum, battery: battery / sum, grid: grid / sum };
}

function split(kwh: number, mix: { pv: number; battery: number; grid: number } | null): SourceSplit {
  if (kwh <= 0) return emptySplit();
  // Ohne erkennbare Quelle (Messlücke): als Netz werten – konservativ
  if (!mix) return { total: kwh, pv: 0, battery: 0, grid: kwh };
  return { total: kwh, pv: kwh * mix.pv, battery: kwh * mix.battery, grid: kwh * mix.grid };
}

/**
 * Verteilt die Intervalle auf Verbraucher und Darstellungs-Buckets.
 * bucketStarts: aufsteigende Bucket-Anfänge (Stunde/Tag/Monat), jedes Intervall fällt in den letzten Start ≤ t.
 */
export function allocate(
  intervals: Interval[],
  bucketStarts: Date[],
  meta: Pick<Allocation, 'period' | 'date' | 'from' | 'to' | 'step' | 'bucketStep'>,
  sessionMinKwh = 0.02,
): Allocation {
  const totals = { house: emptySplit(), heatpump: emptySplit(), wallbox: emptySplit(), rest: emptySplit(), heatpumpHeat: emptySplit() };
  const bHp = bucketStarts.map(emptySplit);
  const bWb = bucketStarts.map(emptySplit);
  const bHeat = bucketStarts.map(() => 0);
  const sessions: ChargeSession[] = [];
  let current: ChargeSession | null = null;
  let count = 0;

  const sorted = [...intervals].sort((a, b) => a.t.getTime() - b.t.getTime());
  let bi = 0;
  const stepMs = meta.step === '15m' ? 900_000 : 3_600_000;

  for (const i of sorted) {
    while (bi + 1 < bucketStarts.length && bucketStarts[bi + 1] <= i.t) bi++;
    const mix = intervalMix(i);
    const house = Math.max(0, i.pvRoof + i.pvCarport + i.gridImport - i.gridExport + i.batteryDischarge - i.batteryCharge);
    let hp = Math.max(0, i.heatpump);
    let wb = Math.max(0, i.wallbox);
    // Messungenauigkeit: Teilverbraucher größer als Gesamtverbrauch → anteilig kürzen
    if (hp + wb > house && hp + wb > 0) {
      const k = house / (hp + wb);
      hp *= k;
      wb *= k;
    }
    const sHp = split(hp, mix);
    const sWb = split(wb, mix);
    add(totals.house, split(house, mix));
    add(totals.heatpump, sHp);
    add(totals.wallbox, sWb);
    add(totals.rest, split(Math.max(0, house - hp - wb), mix));
    const heatShare = hp > 0 ? sHp : null;
    const heat = Math.max(0, i.heatpumpHeat);
    if (heatShare) add(totals.heatpumpHeat, { total: heat, pv: (heat * sHp.pv) / hp, battery: (heat * sHp.battery) / hp, grid: (heat * sHp.grid) / hp });
    else add(totals.heatpumpHeat, { total: heat, pv: 0, battery: 0, grid: heat });
    if (bucketStarts.length && i.t >= bucketStarts[0]) {
      add(bHp[bi], sHp);
      add(bWb[bi], sWb);
      bHeat[bi] += heat;
    }
    if (house > 0 || hp > 0 || wb > 0) count++;

    // Ladevorgänge: zusammenhängende Intervalle mit Wallbox-Energie (max. ein Intervall Pause)
    if (wb >= sessionMinKwh) {
      if (current && i.t.getTime() - new Date(current.end).getTime() > stepMs) {
        sessions.push(current);
        current = null;
      }
      if (!current) current = { start: i.t.toISOString(), end: '', ...emptySplit() };
      add(current, sWb);
      current.end = new Date(i.t.getTime() + stepMs).toISOString();
    }
  }
  if (current) sessions.push(current);

  return {
    ...meta,
    totals: {
      house: roundSplit(totals.house),
      heatpump: roundSplit(totals.heatpump),
      wallbox: roundSplit(totals.wallbox),
      rest: roundSplit(totals.rest),
      heatpumpHeat: roundSplit(totals.heatpumpHeat),
    },
    buckets: { t: bucketStarts.map((t) => t.toISOString()), heatpump: bHp.map(roundSplit), wallbox: bWb.map(roundSplit), heatpumpHeat: bHeat.map(r3) },
    sessions: sessions.filter((s) => s.total >= 0.2).map((s) => ({ ...roundSplit(s), start: s.start, end: s.end })),
    intervals: count,
  };
}
