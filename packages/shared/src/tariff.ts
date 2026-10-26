// Stromtarife und Kosten je Intervall.
//
// Ein Tarif gilt ab validFrom (lokales Datum) bis zum nächsten. Preise in ct/kWh brutto (Gesamtpreis inkl. Netz).
// Bezug: das erste passende Zeitfenster (z. B. SNAP, WiNAP, Nacht) gewinnt, sonst der Grundpreis.
// Einspeisung: Staffel je Kalenderjahr (upToKwh = kumulierte Einspeisung seit 1.1.; null = unbegrenzt).
// Preis null = unbekannt → Energie zählt als "ohne Preis", nie als 0 €.
// Fixkosten (fixedPerYear, € brutto/Jahr: Grundpreise Energie + Netz, Messentgelte, Pauschalen) zeitanteilig je Stunde,
// unabhängig vom Verbrauch → eigene Zeile, nicht auf Verbraucher umgelegt.
//
// Kosten je Verbraucher = Netzanteil (Allokation, gleicher Mix für alle) × Bezugspreis des Intervalls.
// Anlagenwert (Carport, Akku) wie in yield.ts, aber mit dem Preis des jeweiligen Intervalls.

import { intervalMix, type Interval } from './allocation';
import { intervalYield, valueOf } from './yield';
import { zonedParts, type Period, type Step } from './time';

export interface TariffWindow {
  name: string; // z. B. "SNAP", "WiNAP", "Nacht"
  months: number[]; // 1–12, leer = alle
  days: number[]; // 0 = So … 6 = Sa, leer = alle
  from: number; // Stunde 0–24 (inklusive)
  to: number; // Stunde 0–24 (exklusive); to ≤ from → über Mitternacht
  price: number | null; // ct/kWh
}

export interface ExportTier {
  upToKwh: number | null; // Obergrenze kumuliert je Kalenderjahr, null = unbegrenzt
  price: number | null; // ct/kWh
}

export interface Tariff {
  validFrom: string; // YYYY-MM-DD, lokal
  name: string;
  importPrice: number | null; // Grundpreis ct/kWh brutto
  windows: TariffWindow[];
  exportTiers: ExportTier[];
  fixedPerYear?: number | null; // € brutto je Jahr, verbrauchsunabhängig
  note?: string;
}

const sorted = (ts: Tariff[]) => [...ts].sort((a, b) => a.validFrom.localeCompare(b.validFrom));
const pad = (n: number) => String(n).padStart(2, '0');

/** Lokale Zeitmerkmale eines Zeitpunkts (Datum, Monat, Wochentag, Stunde mit Minuten). */
export function localInfo(t: Date, tz?: string): { date: string; year: number; month: number; day: number; hour: number } {
  const p = zonedParts(t, tz);
  return {
    date: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
    year: p.year,
    month: p.month,
    day: new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay(),
    hour: p.hour + p.minute / 60,
  };
}

/** Gültiger Tarif an einem lokalen Datum (letzter mit validFrom ≤ date). */
export function tariffOn(tariffs: Tariff[], date: string): Tariff | null {
  let hit: Tariff | null = null;
  for (const t of sorted(tariffs)) if (t.validFrom <= date) hit = t;
  return hit;
}

export function windowMatches(w: TariffWindow, month: number, day: number, hour: number): boolean {
  if (w.months.length && !w.months.includes(month)) return false;
  const inHours = w.to > w.from ? hour >= w.from && hour < w.to : hour >= w.from || hour < w.to;
  if (!inHours) return false;
  // Über Mitternacht: der Teil nach 0 Uhr gehört zum Vortag (Sa 22–6 → So früh)
  const dayOfStart = w.to <= w.from && hour < w.to ? (day + 6) % 7 : day;
  return !w.days.length || w.days.includes(dayOfStart);
}

/** Bezugspreis (ct/kWh) und Name des Fensters zu einem lokalen Zeitpunkt. */
export function importPriceAt(t: Tariff, month: number, day: number, hour: number): { price: number | null; window: string | null } {
  for (const w of t.windows) if (windowMatches(w, month, day, hour)) return { price: w.price, window: w.name };
  return { price: t.importPrice, window: null };
}

/** Einspeisevergütung (€) für kwh, beginnend bei der bisherigen Jahresmenge before. null = Preis fehlt. */
export function exportValue(tiers: ExportTier[], before: number, kwh: number): number | null {
  if (kwh <= 0) return 0;
  const end = before + kwh;
  let eur = 0, pos = before, lower = 0;
  for (const tier of tiers) {
    const cap = tier.upToKwh ?? Infinity;
    const a = Math.max(pos, lower), e = Math.min(end, cap);
    if (e > a) {
      if (tier.price === null) return null;
      eur += ((e - a) * tier.price) / 100;
      pos = e;
    }
    lower = cap;
    if (pos >= end - 1e-12) return eur;
  }
  return null; // keine Stufe für den Rest
}

// ------------------------------------------------------------------ Kosten

export interface Money {
  kwh: number;
  eur: number; // nur Energie mit bekanntem Preis
  missingKwh: number; // Energie ohne hinterlegten Preis
}

export interface CostTotals {
  import: Money; // Netzbezug gesamt (Stromrechnung, inkl. Netzladung Akku)
  export: Money; // Einspeisevergütung
  heatpump: Money; // Netzanteil Wärmepumpe
  wallbox: Money; // Netzanteil Auto
  rest: Money; // Netzanteil Haushalt
  saved: Money; // Hausverbrauch aus PV + Akku, bewertet mit dem Bezugspreis
  carport: number; // Anlagenwert € (Rangfolge wie yield.ts)
  battery: number;
  fixed: number; // Fixkosten € im Zeitraum (bis "jetzt"), zeitanteilig
  fixedMissing: boolean; // in einem Teil des Zeitraums keine Fixkosten hinterlegt
}

export interface CostBuckets {
  t: string[];
  import: number[];
  export: number[];
  heatpump: number[];
  wallbox: number[];
  rest: number[];
  carport: number[];
  battery: number[];
  fixed: number[];
}

export interface CostResult {
  period: Period;
  date: string;
  from: string;
  to: string;
  step: Step;
  bucketStep: Step;
  totals: CostTotals;
  buckets: CostBuckets;
  /** Tarife, die im Zeitraum gelten (für Hinweise in der UI). */
  tariffs: { validFrom: string; name: string }[];
  /** Durchschnittlicher Bezugspreis (ct/kWh) der bepreisten Energie. */
  avgImportPrice: number | null;
  intervals: number;
}

const money = (): Money => ({ kwh: 0, eur: 0, missingKwh: 0 });
function book(m: Money, kwh: number, price: number | null) {
  if (kwh <= 0) return;
  m.kwh += kwh;
  if (price === null) m.missingKwh += kwh;
  else m.eur += (kwh * price) / 100;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const roundMoney = (m: Money): Money => ({ kwh: r3(m.kwh), eur: r2(m.eur), missingKwh: r3(m.missingKwh) });

/**
 * Kosten je Intervall aufsummieren.
 * exportBefore: kWh Einspeisung im Kalenderjahr vor dem ersten Intervall (nur für Staffeln nötig).
 */
export function computeCosts(
  intervals: Interval[],
  tariffs: Tariff[],
  bucketStarts: Date[],
  meta: Pick<CostResult, 'period' | 'date' | 'from' | 'to' | 'step' | 'bucketStep'>,
  opts: { tz?: string; exportBefore?: number } = {},
): CostResult {
  const totals = { import: money(), export: money(), heatpump: money(), wallbox: money(), rest: money(), saved: money(), carport: 0, battery: 0 };
  const n = bucketStarts.length;
  const z = () => Array.from({ length: n }, () => 0);
  const b: CostBuckets = { t: bucketStarts.map((t) => t.toISOString()), import: z(), export: z(), heatpump: z(), wallbox: z(), rest: z(), carport: z(), battery: z(), fixed: z() };
  const used = new Map<string, string>();

  const list = [...intervals].sort((a, c) => a.t.getTime() - c.t.getTime());
  let bi = 0;
  let count = 0;
  let year: number | null = null;
  let exported = opts.exportBefore ?? 0;

  for (const i of list) {
    while (bi + 1 < n && bucketStarts[bi + 1] <= i.t) bi++;
    const inBucket = n > 0 && i.t >= bucketStarts[0];
    const loc = localInfo(i.t, opts.tz);
    if (year !== null && loc.year !== year) exported = 0; // Staffel beginnt jedes Jahr neu
    year = loc.year;

    const tariff = tariffOn(tariffs, loc.date);
    if (tariff) used.set(tariff.validFrom, tariff.name);
    const price = tariff ? importPriceAt(tariff, loc.month, loc.day, loc.hour).price : null;

    // Netzbezug + Einspeisung (Rechnung)
    const imp = Math.max(0, i.gridImport);
    const exp = Math.max(0, i.gridExport);
    book(totals.import, imp, price);
    const expEur = tariff ? exportValue(tariff.exportTiers, exported, exp) : exp > 0 ? null : 0;
    if (exp > 0) {
      totals.export.kwh += exp;
      if (expEur === null) totals.export.missingKwh += exp;
      else totals.export.eur += expEur;
    }
    exported += exp;

    // Verbraucher: Netzanteil × Preis (gleiche Logik wie allocate)
    const y = intervalYield(i);
    let hp = Math.max(0, i.heatpump);
    let wb = Math.max(0, i.wallbox);
    if (hp + wb > y.house && hp + wb > 0) {
      const k = y.house / (hp + wb);
      hp *= k;
      wb *= k;
    }
    const mix = intervalMix(i);
    const g = mix ? mix.grid : 1; // Messlücke: konservativ Netz
    const rest = Math.max(0, y.house - hp - wb);
    book(totals.heatpump, hp * g, price);
    book(totals.wallbox, wb * g, price);
    book(totals.rest, rest * g, price);
    book(totals.saved, y.house * (1 - g), price);

    // Anlagenwert mit Intervallpreisen; Einspeisetarif = Grenzpreis der aktuellen Stufe
    const feed = tariff ? exportValue(tariff.exportTiers, exported, 1) : null;
    let carport = 0, battery = 0;
    if (price !== null && feed !== null) {
      const v = valueOf(y, { buy: price / 100, feed });
      carport = v.carport.total;
      battery = v.battery.total;
      totals.carport += carport;
      totals.battery += battery;
    }

    if (inBucket) {
      if (price !== null) {
        b.import[bi] += (imp * price) / 100;
        b.heatpump[bi] += (hp * g * price) / 100;
        b.wallbox[bi] += (wb * g * price) / 100;
        b.rest[bi] += (rest * g * price) / 100;
      }
      if (expEur !== null) b.export[bi] += expEur;
      b.carport[bi] += carport;
      b.battery[bi] += battery;
    }
    if (y.house > 0 || imp > 0 || exp > 0) count++;
  }

  // Fixkosten zeitanteilig je Stunde (Jahr mit 365/366 Tagen), von from bis to (laufender Zeitraum: bis jetzt)
  let fixed = 0, fixedMissing = false;
  const end = new Date(meta.to).getTime();
  let fb = 0;
  for (let h = new Date(meta.from).getTime(); h < end; h += 3600_000) {
    const t = new Date(h);
    const loc = localInfo(t, opts.tz);
    const perYear = tariffOn(tariffs, loc.date)?.fixedPerYear;
    if (perYear === null || perYear === undefined) { fixedMissing = true; continue; }
    const leap = loc.year % 4 === 0 && (loc.year % 100 !== 0 || loc.year % 400 === 0);
    const eur = (perYear * Math.min(1, (end - h) / 3600_000)) / ((leap ? 366 : 365) * 24);
    fixed += eur;
    while (fb + 1 < n && bucketStarts[fb + 1] <= t) fb++;
    if (n > 0 && t >= bucketStarts[0]) b.fixed[fb] += eur;
  }

  const priced = totals.import.kwh - totals.import.missingKwh;
  return {
    ...meta,
    totals: {
      import: roundMoney(totals.import),
      export: roundMoney(totals.export),
      heatpump: roundMoney(totals.heatpump),
      wallbox: roundMoney(totals.wallbox),
      rest: roundMoney(totals.rest),
      saved: roundMoney(totals.saved),
      carport: r2(totals.carport),
      battery: r2(totals.battery),
      fixed: r2(fixed),
      fixedMissing,
    },
    buckets: {
      t: b.t,
      import: b.import.map(r2), export: b.export.map(r2), heatpump: b.heatpump.map(r2), wallbox: b.wallbox.map(r2),
      rest: b.rest.map(r2), carport: b.carport.map(r2), battery: b.battery.map(r2), fixed: b.fixed.map(r2),
    },
    tariffs: [...used].map(([validFrom, name]) => ({ validFrom, name })),
    avgImportPrice: priced > 0.01 ? r2((totals.import.eur / priced) * 100) : null,
    intervals: count,
  };
}

/** Prüft einen Tarif aus der UI/API; liefert Fehlermeldung oder null. */
export function validateTariff(t: unknown): string | null {
  const x = t as Partial<Tariff>;
  const price = (v: unknown) => v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1000);
  if (!x || typeof x !== 'object') return 'Tarif fehlt';
  if (typeof x.validFrom !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x.validFrom)) return 'validFrom muss YYYY-MM-DD sein';
  if (typeof x.name !== 'string' || x.name.length > 80) return 'name fehlt oder zu lang';
  if (!price(x.importPrice)) return `${x.validFrom}: Grundpreis ungültig`;
  if (!Array.isArray(x.windows) || x.windows.length > 20) return `${x.validFrom}: windows ungültig`;
  for (const w of x.windows) {
    const hours = (h: unknown) => typeof h === 'number' && h >= 0 && h <= 24;
    const ints = (a: unknown, lo: number, hi: number) => Array.isArray(a) && a.every((v) => Number.isInteger(v) && v >= lo && v <= hi);
    if (!w || typeof w.name !== 'string' || !ints(w.months, 1, 12) || !ints(w.days, 0, 6) || !hours(w.from) || !hours(w.to) || w.from === w.to || !price(w.price)) {
      return `${x.validFrom}: Zeitfenster „${w?.name ?? '?'}“ ungültig`;
    }
  }
  if (!Array.isArray(x.exportTiers) || !x.exportTiers.length || x.exportTiers.length > 10) return `${x.validFrom}: Einspeisung fehlt`;
  let last = 0;
  for (const [k, tier] of x.exportTiers.entries()) {
    const isLast = k === x.exportTiers.length - 1;
    if (!price(tier?.price)) return `${x.validFrom}: Einspeisepreis ungültig`;
    if (isLast ? tier.upToKwh !== null : !(typeof tier.upToKwh === 'number' && tier.upToKwh > last)) {
      return `${x.validFrom}: Staffelgrenzen müssen steigen, die letzte Stufe ist unbegrenzt`;
    }
    last = tier.upToKwh ?? last;
  }
  if (x.fixedPerYear !== undefined && x.fixedPerYear !== null && !(typeof x.fixedPerYear === 'number' && x.fixedPerYear >= 0 && x.fixedPerYear < 100_000)) {
    return `${x.validFrom}: Fixkosten ungültig`;
  }
  if (x.note !== undefined && (typeof x.note !== 'string' || x.note.length > 500)) return `${x.validFrom}: Notiz zu lang`;
  return null;
}

export function validateTariffs(list: unknown): string | null {
  if (!Array.isArray(list) || list.length > 50) return 'Liste erwartet';
  for (const t of list) {
    const e = validateTariff(t);
    if (e) return e;
  }
  const dates = (list as Tariff[]).map((t) => t.validFrom);
  if (new Set(dates).size !== dates.length) return 'Gültig-ab-Datum doppelt';
  return null;
}
