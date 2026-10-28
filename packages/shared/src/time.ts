// Zeiträume in lokaler Zeit (Europe/Vienna), gemeinsam für API, Web und Mock.
// Ein Zeitraum wird durch period + Ankerdatum 'YYYY-MM-DD' beschrieben
// (Tag: das Datum, Monat: der 1., Jahr: der 1.1., Gesamt: 1.1. des ersten Datenjahrs).

export type Period = 'day' | 'month' | 'year' | 'all';
/** Beginn von "Gesamt": Smart Meter, WP und Solarthermie ab 2023 in Influx (2022 nur PV Dach). */
export const LIFETIME_FROM = '2023-01-01';
export const APP_TZ = 'Europe/Vienna';

/** Offset (ms) lokale Wanduhrzeit − UTC zum Zeitpunkt t. */
const fmtCache = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

/** Lokale Wanduhr-Bestandteile (Monat 1-basiert). */
export function zonedParts(t: Date, tz = APP_TZ): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const p: Record<string, number> = {};
  for (const x of formatter(tz).formatToParts(t)) if (x.type !== 'literal') p[x.type] = Number(x.value);
  return { year: p.year, month: p.month, day: p.day, hour: p.hour, minute: p.minute, second: p.second };
}

export function tzOffset(t: Date, tz = APP_TZ): number {
  const p = zonedParts(t, tz);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(t.getTime() / 1000) * 1000;
}

/** Lokale Mitternacht y-m-d (m 0-basiert, Überlauf erlaubt) als UTC-Zeitpunkt. */
export function zonedMidnight(y: number, m: number, d: number, tz = APP_TZ): Date {
  const guess = Date.UTC(y, m, d);
  let t = guess - tzOffset(new Date(guess), tz);
  t = guess - tzOffset(new Date(t), tz); // zweiter Durchlauf für DST-Tage
  return new Date(t);
}

const pad = (n: number) => String(n).padStart(2, '0');
const fmt = (y: number, m: number, d: number) => {
  const x = new Date(Date.UTC(y, m, d));
  return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`;
};
export const parseDate = (s: string): [number, number, number] => {
  const [y, m, d] = s.split('-').map(Number);
  return [y, m - 1, d];
};
export const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Lokales Datum 'YYYY-MM-DD' zum Zeitpunkt now. */
export function localDate(now = new Date(), tz = APP_TZ): string {
  const l = new Date(now.getTime() + tzOffset(now, tz));
  return fmt(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate());
}

/** Ankerdatum eines Zeitraums (Tag bleibt, Monat → 1., Jahr → 1.1., Gesamt → LIFETIME_FROM). */
export function anchor(period: Period, date: string): string {
  if (period === 'all') return LIFETIME_FROM;
  const [y, m, d] = parseDate(date);
  return period === 'day' ? fmt(y, m, d) : period === 'month' ? fmt(y, m, 1) : fmt(y, 0, 1);
}

/** Zeitraum um n verschieben (−1 = vorheriger Tag/Monat/Jahr); Gesamt bleibt. */
export function shift(period: Period, date: string, n: number): string {
  if (period === 'all') return LIFETIME_FROM;
  const [y, m, d] = parseDate(anchor(period, date));
  return period === 'day' ? fmt(y, m, d + n) : period === 'month' ? fmt(y, m + n, 1) : fmt(y + n, 0, 1);
}

/** Gesamt endet mit dem laufenden Jahr (ein Balken je Jahr). */
export function bounds(period: Period, date: string, tz = APP_TZ, now = new Date()): { from: Date; end: Date } {
  const [y, m, d] = parseDate(anchor(period, date));
  if (period === 'all') return { from: zonedMidnight(y, 0, 1, tz), end: zonedMidnight(zonedParts(now, tz).year + 1, 0, 1, tz) };
  if (period === 'day') return { from: zonedMidnight(y, m, d, tz), end: zonedMidnight(y, m, d + 1, tz) };
  if (period === 'month') return { from: zonedMidnight(y, m, 1, tz), end: zonedMidnight(y, m + 1, 1, tz) };
  return { from: zonedMidnight(y, 0, 1, tz), end: zonedMidnight(y + 1, 0, 1, tz) };
}

export function isCurrent(period: Period, date: string, now = new Date(), tz = APP_TZ): boolean {
  if (period === 'all') return true;
  return anchor(period, date) === anchor(period, localDate(now, tz));
}

export type Step = '5m' | '15m' | '1h' | '1d' | '1mo' | '1y';

const FIXED_MS: Partial<Record<Step, number>> = { '5m': 300_000, '15m': 900_000, '1h': 3_600_000 };

/** Balken-Raster für Energie: Tag → Stunden, Monat → Tage, Jahr → Monate, Gesamt → Jahre. */
export function energyStep(period: Period): Step {
  return period === 'day' ? '1h' : period === 'month' ? '1d' : period === 'year' ? '1mo' : '1y';
}
/** Raster für Linien (Mittelwerte). */
export function gaugeStep(period: Period): Step {
  return period === 'day' ? '5m' : period === 'month' ? '1h' : period === 'year' ? '1d' : '1mo';
}

/** Startzeitpunkte aller Buckets im Zeitraum (lokal ausgerichtet, DST-sicher). */
export function bucketStarts(period: Period, date: string, step: Step, tz = APP_TZ): Date[] {
  const { from, end } = bounds(period, date, tz);
  const out: Date[] = [];
  const ms = FIXED_MS[step];
  if (ms) {
    for (let t = from.getTime(); t < end.getTime(); t += ms) out.push(new Date(t));
    return out;
  }
  const [y, m, d] = parseDate(anchor(period, date));
  for (let i = 0; ; i++) {
    const t = step === '1d' ? zonedMidnight(y, m, d + i, tz) : step === '1y' ? zonedMidnight(y + i, 0, 1, tz) : zonedMidnight(y, m + i, 1, tz);
    if (t >= end) break;
    out.push(t);
  }
  return out;
}

/** Bucket vor dem ersten (Basis für Zählerdifferenzen). */
export function previousBucketStart(period: Period, date: string, step: Step, tz = APP_TZ): Date {
  const first = bucketStarts(period, date, step, tz)[0];
  const ms = FIXED_MS[step];
  if (ms) return new Date(first.getTime() - ms);
  const [y, m, d] = parseDate(anchor(period, date));
  return step === '1d' ? zonedMidnight(y, m, d - 1, tz) : step === '1y' ? zonedMidnight(y - 1, 0, 1, tz) : zonedMidnight(y, m - 1, 1, tz);
}

/** Raster für die Herkunfts-Aufteilung: Viertelstunden, im Jahr Stunden (Datenmenge auf dem Pi); Gesamt = Jahre aneinander. */
export function allocationStep(period: Period): Step {
  return period === 'year' || period === 'all' ? '1h' : '15m';
}

/** Jahre (Ankerdatum) eines Zeitraums "Gesamt": LIFETIME_FROM bis zum laufenden Jahr. */
export function lifetimeYears(now = new Date(), tz = APP_TZ): string[] {
  const out: string[] = [];
  for (let y = +LIFETIME_FROM.slice(0, 4); y <= zonedParts(now, tz).year; y++) out.push(`${y}-01-01`);
  return out;
}
