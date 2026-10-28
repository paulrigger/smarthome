import { useMemo, useState } from 'react';
import type { EnergyTotals, Period, SeriesData } from '@smarthome/shared';
import { useSeries, useSummary } from '../data';
import { energy, join, pct, power } from '../format';
import { bucketName, compareView, shortLabel, yearBack, type View } from '../view';
import { AreaChart, BarChart, CMP, LineChart, fmtPower, type Compare, type SeriesSpec } from '../components/Charts';
import { ChevronLeft, ChevronRight } from '../components/Icons';
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
const COMPARE_KEY = 'history.compare';

/** Ausgeblendete Leistungskurven (und ggf. der Vergleich), pro Gerät gemerkt. */
function loadHidden(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? 'null');
    return Array.isArray(v) && v.every((k) => k === CMP || LINES.some((l) => l.key === k)) ? v : DEFAULT_HIDDEN;
  } catch {
    return DEFAULT_HIDDEN;
  }
}

/** Vergleich je Zeitraum: Abstand in Tagen/Monaten/Jahren (null = aus), pro Gerät gemerkt. */
type CompareCfg = Partial<Record<Period, number | null>>;
function loadCompare(): CompareCfg {
  try {
    const v = JSON.parse(localStorage.getItem(COMPARE_KEY) ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
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
const fPeakYear = new Intl.DateTimeFormat('de-AT', { timeZone: 'Europe/Vienna', year: 'numeric' });
const BEST = { month: 'Bester Tag', year: 'Bester Monat', all: 'Bestes Jahr' } as const;
const BEST_FMT = { month: fPeakDay, year: fPeakMonth, all: fPeakYear } as const;

/** Vergleichsleiste: ein/aus, Zeitraum mit ‹ ›, Abkürzung "Vorjahr". */
function CompareBar({ view, n, set }: { view: View; n: number | null; set: (n: number | null) => void }) {
  if (view.period === 'all') return null;
  const cmp = compareView(view, n);
  const back = yearBack(view);
  // weiter: nicht in die Zukunft und nicht auf den angezeigten Zeitraum selbst
  const next = n === null ? null : n + 1 === 0 ? 1 : n + 1;
  const nextView = compareView(view, next);
  const canNext = !!nextView && !!cmp && !cmp.isCurrent;
  return (
    <div className="cmp-bar" role="group" aria-label="Vergleichszeitraum">
      <button type="button" className={`chip${n ? ' on' : ''}`} aria-pressed={!!n} onClick={() => set(n ? null : -1)}>
        Vergleich
      </button>
      {cmp && (
        <>
          <button type="button" className="nav-btn" aria-label="Vergleich früher" onClick={() => set(n! - 1 === 0 ? -1 : n! - 1)}>
            <ChevronLeft size={20} />
          </button>
          <span className="cmp-label" aria-live="polite">mit {shortLabel(cmp)}</span>
          <button type="button" className="nav-btn" aria-label="Vergleich später" disabled={!canNext} onClick={() => set(next)}>
            <ChevronRight size={20} />
          </button>
          {view.period !== 'year' && n !== back && (
            <button type="button" className="chip" onClick={() => set(back)}>
              Vorjahr
            </button>
          )}
        </>
      )}
    </div>
  );
}

const ROWS: { k: keyof EnergyTotals; label: string }[] = [
  { k: 'pv', label: 'PV' },
  { k: 'house', label: 'Verbrauch' },
  { k: 'heatpump', label: 'Wärmepumpe' },
  { k: 'wallbox', label: 'Auto' },
  { k: 'gridImport', label: 'Netzbezug' },
  { k: 'gridExport', label: 'Einspeisung' },
];

/** Summen beider Zeiträume nebeneinander mit Änderung in %. */
function CompareTable({ a, b, la, lb }: { a: EnergyTotals | undefined; b: EnergyTotals | undefined; la: string; lb: string }) {
  const delta = (x?: number, y?: number) => {
    if (x === undefined || y === undefined || y <= 0.05) return '–';
    const d = x / y - 1;
    return `${d > 0 ? '+' : d < 0 ? '−' : '±'}${pct(Math.abs(d))}`;
  };
  return (
    <table className="cmp-table">
      <thead>
        <tr>
          <th scope="col" />
          <th scope="col">{la}</th>
          <th scope="col">{lb}</th>
          <th scope="col">Änderung</th>
        </tr>
      </thead>
      <tbody>
        {ROWS.map((r) => (
          <tr key={r.k}>
            <th scope="row">{r.label}</th>
            <td>{join(energy(a?.[r.k]))}</td>
            <td>{join(energy(b?.[r.k]))}</td>
            <td>{delta(a?.[r.k], b?.[r.k])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function History({ view }: { view: View }) {
  const isDay = view.period === 'day';
  const bucket = bucketName(view.period);
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
  const [cmpCfg, setCmpCfg] = useState(loadCompare);
  const cmpN = cmpCfg[view.period] ?? null;
  const setCmp = (n: number | null) => {
    const next = { ...cmpCfg, [view.period]: n };
    setCmpCfg(next);
    try {
      localStorage.setItem(COMPARE_KEY, JSON.stringify(next));
    } catch {
      /* privat */
    }
  };
  const cv = compareView(view, cmpN);

  const summary = useSummary(view);
  const cmpSummary = useSummary(cv);
  const e = summary?.energy;
  // Leistungskurven nur im Tag (5-min-Mittel); Monat: PV-Fläche aus Stundenmitteln
  const showPvPower = isDay || view.period === 'month';
  const pvPower = useSeries('gauge', showPvPower ? PV_POWER.map((s) => s.key) : [], view).data;
  const linesData = useSeries('gauge', isDay ? LINES.map((l) => l.key) : [], view).data;
  const pvE = useSeries('energy', PV_ENERGY.map((s) => s.key), view).data;
  const useE = useSeries('energy', USE.map((s) => s.key), view).data;
  const flowE = useSeries('energy', [...GRID, ...BATTERY].map((s) => s.key), view).data;

  // Vergleich: dieselben Reihen für den Vergleichszeitraum (Buckets nach Index ausgerichtet)
  const cview = cv ?? view;
  const cPvPower = useSeries('gauge', cv && showPvPower ? PV_POWER.map((s) => s.key) : [], cview).data;
  const cLines = useSeries('gauge', cv && isDay ? LINES.map((l) => l.key) : [], cview).data;
  const cPvE = useSeries('energy', cv ? PV_ENERGY.map((s) => s.key) : [], cview).data;
  const cUseE = useSeries('energy', cv ? USE.map((s) => s.key) : [], cview).data;
  const cFlowE = useSeries('energy', cv ? [...GRID, ...BATTERY].map((s) => s.key) : [], cview).data;
  const cmpLabel = cv ? shortLabel(cv) : '';
  const cmp = (d: SeriesData | null): Compare | null => (cv ? { data: d, label: cmpLabel } : null);

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
          label={isDay ? 'PV-Spitze' : BEST[view.period as keyof typeof BEST]}
          value={isDay ? power(top?.v) : energy(top?.v)}
          hint={topWhen ? (isDay ? `${fPeakTime.format(topWhen)} Uhr` : BEST_FMT[view.period as keyof typeof BEST_FMT].format(topWhen)) : undefined}
        />
      </dl>

      <CompareBar view={view} n={cmpN} set={setCmp} />
      {cv && <CompareTable a={e} b={cmpSummary?.energy} la={shortLabel(view)} lb={cmpLabel} />}

      <section className="charts">
        {showPvPower && (
          <AreaChart data={pvPower} series={PV_POWER} title={isDay ? 'PV-Leistung' : 'PV-Leistung (Stundenmittel)'} unit="W" format={fmtPower} totalLabel="PV gesamt" maxGap={isDay ? 3 : 1} compare={cmp(cPvPower)} />
        )}
        <BarChart data={pvE} series={PV_ENERGY} title={`PV-Erzeugung je ${bucket}`} unit="kWh" stacked legendValues={[e?.pvRoof ?? null, e?.pvCarport ?? null]} compare={cmp(cPvE)} />

        {isDay && (
          <LineChart data={linesData} series={LINES} title="Leistung (Netz/Akku: + Bezug/Entladung)" unit="W" format={fmtPower} height={170} hidden={hidden} onToggle={toggle} compare={cmp(cLines)} />
        )}

        <BarChart data={useE} series={USE} title={`Verbrauch je ${bucket}`} unit="kWh" stacked compare={cmp(cUseE)} />
        <BarChart data={flowE} series={GRID} title={`Netz je ${bucket}`} unit="kWh" compare={cmp(cFlowE)} />
        <BarChart data={flowE} series={BATTERY} title={`Akku je ${bucket}`} unit="kWh" compare={cmp(cFlowE)} />
      </section>
      {e && <p className="split-note">Haus gesamt {join(energy(e.house))} · Netzbezug {join(energy(e.gridImport))} · Einspeisung {join(energy(e.gridExport))}</p>}
    </div>
  );
}
