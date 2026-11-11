// PV-Prognose für die nächsten Tage und Lade-Empfehlung fürs Auto („Überschuss abwarten oder nachts laden?“). Rein, getestet.
// Einstrahlung: Open-Meteo (shortwave_radiation = Globalstrahlung W/m², Mittel der vorangehenden Stunde), Kalibrierung gegen die eigene
// PV der letzten Tage (kWh je kWh/m²) – damit braucht es weder kWp noch Ausrichtung. Überschuss je Stunde = PV − typischer Hausverbrauch
// ohne Wallbox zu dieser Stunde (Median der letzten Tage); davon geht zuerst, was der Hausakku nachladen will (Ø Entladung je Tag).
import { localDate, zonedParts } from './time';

export interface ForecastHistory {
  /** Stundenbeginn (ms) */
  t: number[];
  /** PV-Energie der Stunde (kWh) */
  pv: (number | null)[];
  /** Hausverbrauch ohne Wallbox in der Stunde (kWh) */
  load: (number | null)[];
  /** Ø Akku-Entladung je Tag (kWh) – so viel lädt der Hausakku tagsüber zuerst nach */
  batteryDailyKwh: number | null;
}

export interface ForecastRadiation {
  /** Stundenbeginn (ms) */
  t: number[];
  /** Globalstrahlung (W/m², Mittel der Stunde ab t) */
  ghi: (number | null)[];
}

export interface CarNeed {
  soc: number | null;
  capacityKwh: number;
  targetSoc: number;
  /** Tage, in denen der Überschuss reichen soll (inkl. heute) */
  horizonDays: number;
}

export interface ForecastDay {
  date: string;
  /** PV-Prognose des Tages (heute: nur noch der Rest ab jetzt) */
  pvKwh: number;
  /** davon übrig fürs Auto (nach Hausverbrauch und Akku) */
  surplusKwh: number;
  /** heute: ab jetzt */
  partial: boolean;
}

export type AdviceKind = 'full' | 'pv' | 'night' | 'unknown';
export interface PvForecast {
  days: ForecastDay[];
  /** kWh PV je kWh/m² Einstrahlung (aus den letzten Tagen) */
  factor: number | null;
  calibHours: number;
  car: { soc: number | null; targetSoc: number; needKwh: number | null; capacityKwh: number };
  advice: { kind: AdviceKind; title: string; detail: string; byDate?: string };
  updated: string;
}

/** Faktor kWh PV je kWh/m²: Verhältnis der Summen über Tagstunden mit Daten (robust gegen einzelne Lücken). */
export function calibrate(hist: ForecastHistory, rad: ForecastRadiation): { factor: number | null; hours: number } {
  const r = new Map(rad.t.map((t, i) => [t, rad.ghi[i]]));
  let pv = 0, irr = 0, hours = 0;
  hist.t.forEach((t, i) => {
    const g = r.get(t);
    const p = hist.pv[i];
    if (g == null || p == null || g < 50) return; // nur Stunden mit nennenswerter Sonne
    pv += Math.max(0, p);
    irr += g / 1000;
    hours++;
  });
  return { factor: hours >= 12 && irr > 0 ? pv / irr : null, hours };
}

/** Typischer Verbrauch je Stunde des Tages (Median, kWh). */
export function loadProfile(hist: ForecastHistory, tz?: string): number[] {
  const by: number[][] = Array.from({ length: 24 }, () => []);
  hist.t.forEach((t, i) => {
    const v = hist.load[i];
    if (v != null && v >= 0) by[zonedParts(new Date(t), tz).hour].push(v);
  });
  const med = (xs: number[]) => {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  };
  const m = by.map(med);
  const all = m.filter((v): v is number => v !== null);
  const fallback = all.length ? all.reduce((a, b) => a + b, 0) / all.length : 0.4;
  return m.map((v) => v ?? fallback);
}

const fWeek = (date: string) =>
  new Intl.DateTimeFormat('de-AT', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
const kwh = (v: number) => `${v < 10 ? v.toFixed(1).replace('.', ',') : Math.round(v)} kWh`;

export function forecast(hist: ForecastHistory, rad: ForecastRadiation, car: CarNeed, now: number, days = 4, tz?: string): PvForecast {
  const { factor, hours } = calibrate(hist, rad);
  const prof = loadProfile(hist, tz);
  const today = localDate(new Date(now), tz);
  const byDay = new Map<string, ForecastDay>();
  let todayFull = 0; // ganze PV-Prognose von heute (auch schon vergangene Stunden) – für den Akku-Anteil
  if (factor !== null)
    rad.t.forEach((t, i) => {
      const g = rad.ghi[i];
      if (g == null) return;
      const date = localDate(new Date(t), tz);
      if (date === today) todayFull += (factor * g) / 1000;
      if (t + 3600_000 <= now || date < today) return; // Vergangenheit
      const d = byDay.get(date) ?? { date, pvKwh: 0, surplusKwh: 0, partial: date === today };
      const share = t < now ? (t + 3600_000 - now) / 3600_000 : 1; // laufende Stunde anteilig
      const pv = (factor * g) / 1000 * share;
      d.pvKwh += pv;
      d.surplusKwh += Math.max(0, pv - prof[zonedParts(new Date(t), tz).hour] * share);
      byDay.set(date, d);
    });
  const list = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(0, days);
  // zuerst lädt der Hausakku nach (heute nur anteilig, wenn schon später Tag)
  const batt = hist.batteryDailyKwh ?? 0;
  for (const d of list) {
    const pvShare = d.partial ? (todayFull > 0 ? Math.min(1, d.pvKwh / todayFull) : 0) : 1;
    d.surplusKwh = Math.max(0, d.surplusKwh - batt * pvShare);
    d.pvKwh = Math.round(d.pvKwh * 10) / 10;
    d.surplusKwh = Math.round(d.surplusKwh * 10) / 10;
  }

  const need = car.soc == null ? null : Math.max(0, ((car.targetSoc - car.soc) / 100) * car.capacityKwh);
  let advice: PvForecast['advice'];
  if (factor === null || !list.length) advice = { kind: 'unknown', title: 'Keine Prognose', detail: 'Noch zu wenig PV-Daten zum Abgleich.' };
  else if (need === null) advice = { kind: 'unknown', title: 'Ladestand Auto unbekannt', detail: `Überschuss in ${car.horizonDays} Tagen: ${kwh(list.slice(0, car.horizonDays).reduce((s, d) => s + d.surplusKwh, 0))}` };
  else if (need < 1) advice = { kind: 'full', title: 'Auto ist geladen', detail: `${Math.round(car.soc!)} % – Ziel ${car.targetSoc} %` };
  else {
    let cum = 0;
    let by: ForecastDay | undefined;
    for (const d of list.slice(0, car.horizonDays)) {
      cum += d.surplusKwh;
      if (cum >= need) { by = d; break; }
    }
    if (by) {
      const when = by.date === today ? 'heute' : by.date === localDate(new Date(now + 86400_000), tz) ? 'morgen' : `bis ${fWeek(by.date)}`;
      advice = { kind: 'pv', title: `Mit PV laden – reicht ${when}`, detail: `Überschuss bis dahin ${kwh(cum)}`, byDate: by.date };
    } else {
      advice = {
        kind: 'night',
        title: 'Nachts laden',
        detail: `Überschuss in ${car.horizonDays} Tagen nur ${kwh(cum)} – ca. ${kwh(need - cum)} aus dem Netz`,
      };
    }
  }
  return {
    days: list,
    factor: factor === null ? null : Math.round(factor * 100) / 100,
    calibHours: hours,
    car: { soc: car.soc, targetSoc: car.targetSoc, needKwh: need === null ? null : Math.round(need * 10) / 10, capacityKwh: car.capacityKwh },
    advice,
    updated: new Date(now).toISOString(),
  };
}

/** Antwort von GET /api/forecast */
export type ForecastResponse = ({ configured: true } & PvForecast) | { configured: false; reason: string };

/** Demo-Einstrahlung (Mock/Tests): Sinusbogen 7–17 Uhr, Wolken je Tag deterministisch. */
export function mockRadiation(from: number, hours: number): ForecastRadiation {
  const t: number[] = [], ghi: (number | null)[] = [];
  const start = Math.floor(from / 3600_000) * 3600_000;
  for (let i = 0; i < hours; i++) {
    const ts = start + i * 3600_000;
    const h = new Date(ts).getUTCHours() + 1; // ~MEZ
    const day = Math.floor(ts / 86400_000);
    const cloud = 0.25 + 0.75 * ((Math.sin(day * 1.7) + 1) / 2);
    t.push(ts);
    ghi.push(h >= 7 && h <= 17 ? Math.round(420 * Math.sin(((h - 7) / 10) * Math.PI) * cloud) : 0);
  }
  return { t, ghi };
}
