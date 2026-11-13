// PV-Prognose für die nächsten Tage und Lade-Empfehlung fürs Auto („Überschuss abwarten oder nachts laden?“). Rein, getestet.
// Einstrahlung: Open-Meteo (shortwave_radiation = Globalstrahlung W/m², Mittel der vorangehenden Stunde), Kalibrierung gegen die eigene
// PV der letzten Tage (kWh je kWh/m²) – damit braucht es weder kWp noch Ausrichtung.
// Hausverbrauch = Grundlast ohne Wärmepumpe (Median je Stunde der letzten Tage) + Wärmepumpe. Die WP-Energie je Tag hängt von der
// Außentemperatur ab: a + b · Heizgradtage (Heizgrenze 15 °C, Tagesmittel aus Open-Meteo), gefittet auf die eigenen Tage.
// Überschuss je Tag = PV − Verbrauch − Akku-Nachladen (saldiert über den Tag, nicht je Stunde geklemmt).
import { localDate, zonedParts } from './time';

/** Heizgrenze für Heizgradtage: HGT = max(0; 15 °C − Tagesmittel) */
export const HEAT_BASE_C = 15;
const MIN_HOURS = 20; // Tage mit weniger Stunden (Lücken) zählen nicht

export interface ForecastHistory {
  /** Stundenbeginn (ms) */
  t: number[];
  /** PV-Energie der Stunde (kWh) */
  pv: (number | null)[];
  /** Hausverbrauch ohne Wallbox in der Stunde (kWh), enthält die Wärmepumpe */
  load: (number | null)[];
  /** Wärmepumpe Strom in der Stunde (kWh) */
  heatpump: (number | null)[];
  /** Ø Akku-Entladung je Tag (kWh) – so viel lädt der Hausakku tagsüber zuerst nach */
  batteryDailyKwh: number | null;
}

export interface ForecastRadiation {
  /** Stundenbeginn (ms) */
  t: number[];
  /** Globalstrahlung (W/m², Mittel der Stunde ab t) */
  ghi: (number | null)[];
  /** Außentemperatur (°C) der Stunde ab t */
  temp: (number | null)[];
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
  /** Hausverbrauch inkl. Wärmepumpe (heute: ab jetzt) */
  loadKwh: number;
  /** davon Wärmepumpe */
  heatpumpKwh: number;
  /** Tagesmittel der Außentemperatur */
  tempC: number | null;
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
  /** Modell: Grundlast je Tag, WP = heatBaseKwh + heatPerHddKwh · Heizgradtage (heatDays = Tage im Fit, 0 = Mittelwert ohne Temperatur) */
  model: { baseKwh: number; heatBaseKwh: number; heatPerHddKwh: number; heatDays: number };
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

/** Anteil der Wärmepumpe je Stunde des Tages an ihrer Gesamtenergie (Summe = 1). */
export function heatShape(hist: ForecastHistory, tz?: string): number[] {
  const sums = Array.from({ length: 24 }, () => 0);
  let total = 0;
  hist.t.forEach((t, i) => {
    const v = hist.heatpump[i];
    if (v == null || v <= 0) return;
    sums[zonedParts(new Date(t), tz).hour] += v;
    total += v;
  });
  return total > 0 ? sums.map((s) => s / total) : sums.map(() => 1 / 24);
}

const hddOf = (tempC: number) => Math.max(0, HEAT_BASE_C - tempC);

/** Tagesmittel der Außentemperatur je lokalem Datum (nur Tage mit genug Stunden). */
export function dailyTemps(rad: ForecastRadiation, tz?: string): Map<string, number> {
  const acc = new Map<string, { s: number; n: number }>();
  rad.t.forEach((t, i) => {
    const v = rad.temp[i];
    if (v == null) return;
    const d = localDate(new Date(t), tz);
    const a = acc.get(d) ?? { s: 0, n: 0 };
    a.s += v;
    a.n++;
    acc.set(d, a);
  });
  const out = new Map<string, number>();
  for (const [d, a] of acc) if (a.n >= MIN_HOURS) out.set(d, a.s / a.n);
  return out;
}

export interface HeatModel {
  /** WP-Energie je Tag ohne Heizbedarf (kWh) */
  base: number;
  /** zusätzlich je Heizgradtag (kWh) */
  perHdd: number;
  /** Tage im Fit (0 = nur Mittelwert) */
  days: number;
}

/** WP-Energie je Tag = a + b · Heizgradtage (kleinste Quadrate über die Historie, a, b ≥ 0). */
export function heatModel(hist: ForecastHistory, rad: ForecastRadiation, tz?: string): HeatModel {
  const temps = dailyTemps(rad, tz);
  const byDay = new Map<string, { kwh: number; n: number }>();
  hist.t.forEach((t, i) => {
    const v = hist.heatpump[i];
    if (v == null) return;
    const d = localDate(new Date(t), tz);
    const a = byDay.get(d) ?? { kwh: 0, n: 0 };
    a.kwh += Math.max(0, v);
    a.n++;
    byDay.set(d, a);
  });
  const full = [...byDay.entries()].filter(([, a]) => a.n >= MIN_HOURS);
  const pts: { x: number; y: number }[] = [];
  for (const [d, a] of full) {
    const tc = temps.get(d);
    if (tc !== undefined) pts.push({ x: hddOf(tc), y: a.kwh });
  }
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0);
  if (pts.length < 5) return { base: mean(full.map(([, a]) => a.kwh)), perHdd: 0, days: 0 };
  const mx = mean(pts.map((p) => p.x));
  const my = mean(pts.map((p) => p.y));
  const sxx = pts.reduce((s, p) => s + (p.x - mx) ** 2, 0);
  const sxy = pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0);
  const perHdd = sxx > 1e-6 ? Math.max(0, sxy / sxx) : 0;
  return { base: Math.max(0, my - perHdd * mx), perHdd, days: pts.length };
}

const fWeek = (date: string) =>
  new Intl.DateTimeFormat('de-AT', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
const kwh = (v: number) => `${v < 10 ? v.toFixed(1).replace('.', ',') : Math.round(v)} kWh`;
const r1 = (v: number) => Math.round(v * 10) / 10;

export function forecast(hist: ForecastHistory, rad: ForecastRadiation, car: CarNeed, now: number, days = 4, tz?: string): PvForecast {
  const { factor, hours } = calibrate(hist, rad);
  const base = loadProfile({ ...hist, load: hist.load.map((v, i) => (v == null ? null : v - (hist.heatpump[i] ?? 0))) }, tz);
  const shape = heatShape(hist, tz);
  const hm = heatModel(hist, rad, tz);
  const temps = dailyTemps(rad, tz);
  // WP-Energie des Tages: aus der Temperaturprognose, ohne Temperatur der Mittelwert
  const heatDay = (date: string) => {
    const tc = temps.get(date);
    return tc === undefined ? hm.base : hm.base + hm.perHdd * hddOf(tc);
  };
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
      const d = byDay.get(date) ?? { date, pvKwh: 0, loadKwh: 0, heatpumpKwh: 0, tempC: temps.get(date) ?? null, surplusKwh: 0, partial: date === today };
      const share = t < now ? (t + 3600_000 - now) / 3600_000 : 1; // laufende Stunde anteilig
      const hour = zonedParts(new Date(t), tz).hour;
      const hp = heatDay(date) * shape[hour] * share;
      d.pvKwh += ((factor * g) / 1000) * share;
      d.heatpumpKwh += hp;
      d.loadKwh += base[hour] * share + hp;
      byDay.set(date, d);
    });
  const list = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(0, days);
  // zuerst lädt der Hausakku nach (heute nur anteilig, wenn schon später Tag)
  const batt = hist.batteryDailyKwh ?? 0;
  for (const d of list) {
    const pvShare = d.partial ? (todayFull > 0 ? Math.min(1, d.pvKwh / todayFull) : 0) : 1;
    d.surplusKwh = Math.max(0, d.pvKwh - d.loadKwh - batt * pvShare);
    d.pvKwh = r1(d.pvKwh);
    d.loadKwh = r1(d.loadKwh);
    d.heatpumpKwh = r1(d.heatpumpKwh);
    d.surplusKwh = r1(d.surplusKwh);
    if (d.tempC !== null) d.tempC = r1(d.tempC);
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
    model: {
      baseKwh: r1(base.reduce((s, v) => s + v, 0)),
      heatBaseKwh: r1(hm.base),
      heatPerHddKwh: Math.round(hm.perHdd * 100) / 100,
      heatDays: hm.days,
    },
    car: { soc: car.soc, targetSoc: car.targetSoc, needKwh: need === null ? null : Math.round(need * 10) / 10, capacityKwh: car.capacityKwh },
    advice,
    updated: new Date(now).toISOString(),
  };
}

/** Antwort von GET /api/forecast */
export type ForecastResponse = ({ configured: true } & PvForecast) | { configured: false; reason: string };

/** Demo-Einstrahlung (Mock/Tests): Sinusbogen 7–17 Uhr, Wolken und Temperatur je Tag deterministisch. */
export function mockRadiation(from: number, hours: number): ForecastRadiation {
  const t: number[] = [], ghi: (number | null)[] = [], temp: (number | null)[] = [];
  const start = Math.floor(from / 3600_000) * 3600_000;
  for (let i = 0; i < hours; i++) {
    const ts = start + i * 3600_000;
    const h = new Date(ts).getUTCHours() + 1; // ~MEZ
    const day = Math.floor(ts / 86400_000);
    const cloud = 0.25 + 0.75 * ((Math.sin(day * 1.7) + 1) / 2);
    t.push(ts);
    ghi.push(h >= 7 && h <= 17 ? Math.round(420 * Math.sin(((h - 7) / 10) * Math.PI) * cloud) : 0);
    // Tagesgang ±4 °C um ein Tagesmittel zwischen 3 und 11 °C
    temp.push(Math.round((7 + 4 * Math.sin(day * 2.3) + 4 * Math.sin(((h - 9) / 24) * 2 * Math.PI)) * 10) / 10);
  }
  return { t, ghi, temp };
}
