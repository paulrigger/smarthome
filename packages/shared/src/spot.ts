// EPEX-Spotpreise (Day-Ahead, Österreich) für die Kosten-Seite: Preise je Viertelstunde, auf die Intervalle der Kostenreihe verteilt. Rein, getestet.
// Quelle: energy-charts.info (Bundesnetzagentur | SMARD, CC BY 4.0). Börsenpreis netto, ohne Netz, Abgaben und Steuern.
import type { Step } from './time';

/** Startzeiten (ISO) und Preis je Viertelstunde in ct/kWh */
export interface SpotPrices {
  t: string[];
  ct: number[];
}

/** €/MWh → ct/kWh */
export const eurMwhToCt = (v: number) => Math.round((v / 10) * 100) / 100;

/** Ende eines Intervalls gleicher Länge wie `step` (lokale Zeit: Tag/Monat/Jahr laufen über die Zeitumstellung) */
export function bucketEnd(start: Date, step: Step): Date {
  const d = new Date(start);
  switch (step) {
    case '5m': return new Date(d.getTime() + 5 * 60_000);
    case '15m': return new Date(d.getTime() + 15 * 60_000);
    case '1h': return new Date(d.getTime() + 3600_000);
    case '1d': return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    case '1mo': return new Date(d.getFullYear(), d.getMonth() + 1, 1);
    case '1y': return new Date(d.getFullYear() + 1, 0, 1);
  }
}

/** Mittel der Viertelstunden je Intervall (null, wenn im Intervall kein Preis liegt). `buckets` = Startzeiten der Kostenreihe. */
export function spotPerBucket(spot: SpotPrices, buckets: string[], step: Step): (number | null)[] {
  const pts = spot.t.map((t, i) => ({ ms: Date.parse(t), ct: spot.ct[i] })).filter((p) => Number.isFinite(p.ms) && p.ct != null);
  return buckets.map((b) => {
    const from = Date.parse(b);
    const to = bucketEnd(new Date(from), step).getTime();
    let sum = 0, n = 0;
    for (const p of pts) if (p.ms >= from && p.ms < to) { sum += p.ct; n++; }
    return n ? sum / n : null;
  });
}
