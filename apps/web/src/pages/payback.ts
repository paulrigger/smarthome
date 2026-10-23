import type { CostResult } from '@smarthome/shared';

export type AssetId = 'carport' | 'battery';

export interface Month { t: Date; value: number; cum: number }

export interface Payback {
  since: Date;
  invest: number;
  months: Month[]; // ab Inbetriebnahme bis jetzt
  cum: number; // bisher erwirtschaftet (€)
  perYear: number | null; // Ertrag p.a. (€), aus den letzten vollen Monaten
  basisMonths: number; // so viele volle Monate stecken in perYear
  paybackAt: Date | null; // erreicht oder prognostiziert
  reached: boolean;
}

const MAX_YEARS = 40;

/** Amortisation aus Monatswerten der Kosten-API (Anlagenwert je Monat, mit Tarif je Intervall bewertet). */
export function payback(years: CostResult[], asset: AssetId, invest: number, since: Date, now = new Date()): Payback {
  const items = years.flatMap((y) => y.buckets.t.map((t, i) => ({ t: new Date(t), value: y.buckets[asset][i] })));
  items.sort((a, b) => a.t.getTime() - b.t.getTime());
  const months: Month[] = [];
  let cum = 0;
  let reachedAt: Date | null = null;
  items.forEach(({ t, value }, i) => {
    const next = items[i + 1]?.t ?? new Date(t.getTime() + 31 * 864e5);
    if (next <= since || t > now) return;
    cum += value;
    if (!reachedAt && invest > 0 && cum >= invest) reachedAt = next < now ? next : now;
    months.push({ t, value, cum });
  });

  // Rate aus vollen Monaten (laufender Monat und Inbetriebnahme-Monat sind angebrochen)
  const full = months.filter((m, i) => i > 0 && i < months.length - 1 && m.t > since);
  const basis = full.slice(-12);
  const perYear = basis.length ? (basis.reduce((a, m) => a + m.value, 0) / basis.length) * 12 : null;

  let paybackAt: Date | null = reachedAt;
  if (!paybackAt && perYear && perYear > 0) {
    const years = (invest - cum) / perYear;
    if (years <= MAX_YEARS) paybackAt = new Date(now.getTime() + years * 365.25 * 864e5);
  }
  return { since, invest, months, cum, perYear, basisMonths: basis.length, paybackAt, reached: !!reachedAt };
}
