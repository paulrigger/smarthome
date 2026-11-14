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

const HOUR = 3600_000;

/** Preis zu einem Zeitpunkt: der letzte Preis davor, solange er zum Raster passt (Viertelstunden bzw. vor Okt. 2025 Stunden). */
export function spotLookup(spot: SpotPrices): (ms: number) => number | null {
  const pts = spot.t.map((t, i) => ({ ms: Date.parse(t), ct: spot.ct[i] })).filter((p) => Number.isFinite(p.ms)).sort((a, b) => a.ms - b.ms);
  const spacing = pts.length > 1 ? pts[1].ms - pts[0].ms : HOUR;
  const tol = spacing <= 15 * 60_000 ? 15 * 60_000 : HOUR;
  return (ms) => {
    let lo = 0, hi = pts.length - 1, best = -1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (pts[m].ms <= ms) { best = m; lo = m + 1; } else hi = m - 1;
    }
    return best >= 0 && ms - pts[best].ms < tol ? pts[best].ct : null;
  };
}

/** Mittel der Preise je Intervall (liegt keiner darin, der Preis zu dessen Beginn). `buckets` = Startzeiten der Kostenreihe. */
export function spotPerBucket(spot: SpotPrices, buckets: string[], step: Step): (number | null)[] {
  const pts = spot.t.map((t, i) => ({ ms: Date.parse(t), ct: spot.ct[i] })).filter((p) => Number.isFinite(p.ms));
  const at = spotLookup(spot);
  return buckets.map((b) => {
    const from = Date.parse(b);
    const to = bucketEnd(new Date(from), step).getTime();
    let sum = 0, n = 0;
    for (const p of pts) if (p.ms >= from && p.ms < to) { sum += p.ct; n++; }
    return n ? sum / n : at(from);
  });
}

/** Stündliche Mittel (für lange Zeiträume im Diagramm). */
export function spotHourly(spot: SpotPrices): SpotPrices {
  const sums = new Map<number, { s: number; n: number }>();
  spot.t.forEach((t, i) => {
    const ms = Date.parse(t);
    if (!Number.isFinite(ms)) return;
    const h = Math.floor(ms / HOUR) * HOUR;
    const a = sums.get(h) ?? { s: 0, n: 0 };
    a.s += spot.ct[i];
    a.n++;
    sums.set(h, a);
  });
  const keys = [...sums.keys()].sort((a, b) => a - b);
  return { t: keys.map((k) => new Date(k).toISOString()), ct: keys.map((k) => Math.round((sums.get(k)!.s / sums.get(k)!.n) * 100) / 100) };
}
