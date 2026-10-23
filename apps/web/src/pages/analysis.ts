import type { SeriesData } from '@smarthome/shared';
import type { ScatterPoint } from '../components/Charts';

const TZ = 'Europe/Vienna';
const fDay = new Intl.DateTimeFormat('de-AT', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'numeric' });
const fMonth = new Intl.DateTimeFormat('de-AT', { timeZone: TZ, month: 'long' });

/**
 * Arbeitszahl je Bucket (Tag/Monat) über mittlerer Außentemperatur.
 * Gauge-Werte (feiner) werden den Energie-Buckets zugeordnet und gemittelt.
 * Buckets mit wenig WP-Strom (< minKwh) fallen raus – dort ist die Zahl nicht aussagekräftig.
 */
export function copVsOutdoor(energyS: SeriesData | null, gauge: SeriesData | null, minKwh: number): ScatterPoint[] | null {
  if (!energyS || !gauge) return null;
  const starts = energyS.t.map((t) => new Date(t).getTime());
  const sum = starts.map(() => 0), cnt = starts.map(() => 0);
  const temps = gauge.values['outdoor.temp'] ?? [];
  let j = 0;
  gauge.t.forEach((t, i) => {
    const v = temps[i];
    const ms = new Date(t).getTime();
    while (j + 1 < starts.length && starts[j + 1] <= ms) j++;
    if (v === null || v === undefined || ms < starts[0]) return;
    sum[j] += v;
    cnt[j]++;
  });
  const el = energyS.values.heatpump ?? [], heat = energyS.values.heatpumpHeat ?? [];
  const out: ScatterPoint[] = [];
  starts.forEach((ms, i) => {
    const e = el[i], h = heat[i];
    if (!e || e < minKwh || !h || !cnt[i]) return;
    const d = new Date(ms);
    out.push({ x: sum[i] / cnt[i], y: h / e, size: e / (minKwh * 20), label: energyS.step === '1d' ? fDay.format(d) : fMonth.format(d) });
  });
  return out;
}

/** Arbeitszahl je Bucket als Serie (für Balken). */
export function copSeries(energyS: SeriesData | null): SeriesData | null {
  if (!energyS) return null;
  const el = energyS.values.heatpump ?? [], heat = energyS.values.heatpumpHeat ?? [];
  return { ...energyS, values: { cop: el.map((e, i) => (e && e > 0.2 && heat[i] ? Math.round((heat[i]! / e) * 10) / 10 : null)) } };
}
