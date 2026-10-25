import { useMemo, useState } from 'react';
import type { SeriesData } from '@smarthome/shared';
import { useSeries, useSummary } from '../data';
import { energy, join, pct, power } from '../format';
import type { View } from '../view';
import { AreaChart, BarChart, LineChart, fmtPower, type SeriesSpec } from '../components/Charts';
import { Kpi } from './Kpi';

// PV Carport heller als PV Dach – gleiche Energiefarbe, in mono über die Helligkeit unterscheidbar
const CARPORT = 'color-mix(in srgb, var(--c-sun) 45%, var(--surface))';
const PV_POWER: SeriesSpec[] = [
  { key: 'pvRoof.power', label: 'PV Dach', color: 'var(--c-sun)' },
  { key: 'pvCarport.power', label: 'PV Carport', color: CARPORT },
];
const PV_ENERGY: SeriesSpec[] = [
  { key: 'pvRoof', label: 'PV Dach', color: 'var(--c-sun)' },
  { key: 'pvCarport', label: 'PV Carport', color: CARPORT },
];
const USE: SeriesSpec[] = [
  { key: 'rest', label: 'Haushalt', color: 'var(--muted)' },
  { key: 'heatpump', label: 'Wärmepumpe', color: 'var(--c-heat)' },
  { key: 'wallbox', label: 'Auto', color: 'var(--c-car)' },
];
const GRID: SeriesSpec[] = [
  { key: 'gridImport', label: 'Bezug', color: 'var(--c-grid)' },
  { key: 'gridExport', label: 'Einspeisung', color: 'color-mix(in srgb, var(--c-grid) 45%, var(--surface))' },
];
const BATTERY: SeriesSpec[] = [
  { key: 'batteryCharge', label: 'Laden', color: 'var(--c-battery)' },
  { key: 'batteryDischarge', label: 'Entladen', color: 'color-mix(in srgb, var(--c-battery) 45%, var(--surface))' },
];
/** Leistungskurven, per Legende ein-/ausblendbar (Netz/Akku mit Vorzeichen: + Bezug/Entladung). */
const LINES: SeriesSpec[] = [
  { key: 'pv.power', label: 'PV', color: 'var(--c-sun)' },
  { key: 'house.power', label: 'Haus', color: 'var(--text)' },
  { key: 'grid.power', label: 'Netz', color: 'var(--c-grid)' },
  { key: 'battery.power', label: 'Akku', color: 'var(--c-battery)' },
  { key: 'heatpump.power', label: 'Wärmepumpe', color: 'var(--c-heat)' },
  { key: 'wallbox.power', label: 'Auto', color: 'var(--c-car)' },
];
const HIDDEN_KEY = 'history.hidden';
const DEFAULT_HIDDEN = ['pv.power', 'heatpump.power', 'wallbox.power'];

/** Ausgeblendete Leistungskurven, pro Gerät gemerkt. */
function loadHidden(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? 'null');
    return Array.isArray(v) && v.every((k) => LINES.some((l) => l.key === k)) ? v : DEFAULT_HIDDEN;
  } catch {
    return DEFAULT_HIDDEN;
  }
}

/** Größte Summe zweier Reihen und ihr Index (Spitze bzw. bester Tag). */
function peak(d: SeriesData | null, keys: string[]): { v: number; i: number } | null {
  if (!d) return null;
  let best: { v: number; i: number } | null = null;
  d.t.forEach((_, i) => {
    const xs = keys.map((k) => d.values[k]?.[i] ?? null);
    if (xs.every((x) => x === null)) return;
    const v = xs.reduce<number>((a, x) => a + Math.max(0, x ?? 0), 0);
    if (!best || v > best.v) best = { v, i };
  });
  return best;
}

const fPeakTime = new Intl.DateTimeFormat('de-AT', { timeZone: 'Europe/Vienna', hour: '2-digit', minute: '2-digit' });
const fPeakDay = new Intl.DateTimeFormat('de-AT', { timeZone: 'Europe/Vienna', weekday: 'short', day: 'numeric', month: 'numeric' });
const fPeakMonth = new Intl.DateTimeFormat('de-AT', { timeZone: 'Europe/Vienna', month: 'long' });

export function History({ view }: { view: View }) {
  const isDay = view.period === 'day';
  const bucket = isDay ? 'Stunde' : view.period === 'month' ? 'Tag' : 'Monat';
  const [hidden, setHidden] = useState(loadHidden);
  const toggle = (k: string) => {
    const next = hidden.includes(k) ? hidden.filter((x) => x !== k) : [...hidden, k];
    setHidden(next);
    try {
      localStorage.setItem(HIDDEN_KEY, JSON.stringify(next));
    } catch {
      /* privat */
    }
  };

  const summary = useSummary(view);
  const e = summary?.energy;
  // Leistungskurven nur im Tag (5-min-Mittel); Monat: PV-Fläche aus Stundenmitteln
  const pvPower = useSeries('gauge', view.period === 'year' ? [] : PV_POWER.map((s) => s.key), view).data;
  const linesData = useSeries('gauge', isDay ? LINES.map((l) => l.key) : [], view).data;
  const pvE = useSeries('energy', PV_ENERGY.map((s) => s.key), view).data;
  const useE = useSeries('energy', USE.map((s) => s.key), view).data;
  const flowE = useSeries('energy', [...GRID, ...BATTERY].map((s) => s.key), view).data;

  const top = useMemo(() => (isDay ? peak(pvPower, PV_POWER.map((s) => s.key)) : peak(pvE, PV_ENERGY.map((s) => s.key))), [isDay, pvPower, pvE]);
  const topData = isDay ? pvPower : pvE;
  const topWhen = top && topData ? new Date(topData.t[top.i]) : null;
  const share = (x: number | undefined) => (e && e.pv > 0 && x !== undefined ? pct(x / e.pv) : '–');

  return (
    <div className="analysis">
      <h1>Verlauf</h1>
      <dl className="kpis">
        <Kpi label="PV gesamt" value={energy(e?.pv)} />
        <Kpi label="PV Dach" value={energy(e?.pvRoof)} hint={`${share(e?.pvRoof)} der PV`} />
        <Kpi label="PV Carport" value={energy(e?.pvCarport)} hint={`${share(e?.pvCarport)} der PV`} />
        <Kpi
          label={isDay ? 'PV-Spitze' : `Bester ${view.period === 'month' ? 'Tag' : 'Monat'}`}
          value={isDay ? power(top?.v) : energy(top?.v)}
          hint={topWhen ? (isDay ? `${fPeakTime.format(topWhen)} Uhr` : view.period === 'month' ? fPeakDay.format(topWhen) : fPeakMonth.format(topWhen)) : undefined}
        />
      </dl>

      <section className="charts">
        {view.period !== 'year' && (
          <AreaChart data={pvPower} series={PV_POWER} title={isDay ? 'PV-Leistung' : 'PV-Leistung (Stundenmittel)'} unit="W" format={fmtPower} totalLabel="PV gesamt" maxGap={isDay ? 3 : 1} />
        )}
        <BarChart data={pvE} series={PV_ENERGY} title={`PV-Erzeugung je ${bucket}`} unit="kWh" stacked legendValues={[e?.pvRoof ?? null, e?.pvCarport ?? null]} />

        {isDay && (
          <LineChart data={linesData} series={LINES} title="Leistung (Netz/Akku: + Bezug/Entladung)" unit="W" format={fmtPower} height={170} hidden={hidden} onToggle={toggle} />
        )}

        <BarChart data={useE} series={USE} title={`Verbrauch je ${bucket}`} unit="kWh" stacked />
        <BarChart data={flowE} series={GRID} title={`Netz je ${bucket}`} unit="kWh" />
        <BarChart data={flowE} series={BATTERY} title={`Akku je ${bucket}`} unit="kWh" />
      </section>
      {e && <p className="split-note">Haus gesamt {join(energy(e.house))} · Netzbezug {join(energy(e.gridImport))} · Einspeisung {join(energy(e.gridExport))}</p>}
    </div>
  );
}
