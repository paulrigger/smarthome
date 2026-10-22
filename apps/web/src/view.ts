import { type Period, bounds, isCurrent, localDate, shift } from '@smarthome/shared';

/** Was gerade angezeigt wird: Zeitraum + Ankerdatum. */
export interface View {
  period: Period;
  date: string; // Ankerdatum YYYY-MM-DD
  isCurrent: boolean; // laufender Tag/Monat/Jahr
  isLive: boolean; // heute → Live-Leistungen anzeigen
}

export function makeView(period: Period, date: string): View {
  const cur = isCurrent(period, date);
  return { period, date, isCurrent: cur, isLive: period === 'day' && cur };
}

export const today = () => localDate();
export const canNext = (v: View) => !v.isCurrent;
export const step = (v: View, n: number) => makeView(v.period, shift(v.period, v.date, n));

const TZ = 'Europe/Vienna';
const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('de-AT', { timeZone: TZ, ...o });
const fDayLong = f({ weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
const fMonth = f({ month: 'long', year: 'numeric' });
const fDayMonth = f({ day: 'numeric', month: 'short' });
const fTime = f({ hour: '2-digit', minute: '2-digit' });
const fShort = f({ weekday: 'short', day: 'numeric', month: 'numeric' });
const fMonShort = f({ month: 'short', year: 'numeric' });

/** Überschrift und Zeitspanne, z.B. "Donnerstag, 22. Oktober 2026" / "00:00 – 13:58". */
export function rangeText(v: View, now = new Date()): { title: string; span: string } {
  const { from, end } = bounds(v.period, v.date);
  const last = new Date(end.getTime() - 1);
  if (v.period === 'day') {
    const rel = v.date === localDate(now) ? 'Heute' : v.date === shift('day', localDate(now), -1) ? 'Gestern' : '';
    return {
      title: fDayLong.format(from),
      span: (rel ? `${rel} · ` : '') + (v.isCurrent ? `00:00 – ${fTime.format(now)} Uhr` : 'ganzer Tag'),
    };
  }
  if (v.period === 'month') {
    return {
      title: fMonth.format(from),
      span: `${fDayMonth.format(from)} – ${fDayMonth.format(v.isCurrent ? now : last)}${v.isCurrent ? ', bis jetzt' : ''}`,
    };
  }
  return {
    title: v.date.slice(0, 4),
    span: `${fDayMonth.format(from)} – ${fDayMonth.format(v.isCurrent ? now : last)}${v.isCurrent ? ', bis jetzt' : ''}`,
  };
}

/** Kurzform für Tabellenköpfe: "heute", "Mi 21.10.", "Okt. 2026", "2025". */
export function shortLabel(v: View): string {
  const { from } = bounds(v.period, v.date);
  if (v.period === 'day') return v.isCurrent ? 'heute' : fShort.format(from);
  if (v.period === 'month') return fMonShort.format(from);
  return v.date.slice(0, 4);
}
