import { useSeries } from '../data';
import type { View } from '../view';
import { BarChart, LineChart, fmtNum, fmtPct, fmtPower, fmtPpm, fmtTemp, type SeriesSpec } from './Charts';
import type { NodeId } from './EnergyFlow';

type Fmt = (v: number | null) => string;
interface LineSpec { title: string; unit: string; format: Fmt; series: SeriesSpec[] }
interface NodeSpec { bars: SeriesSpec[]; stacked?: boolean; lines: LineSpec[] }

const C = {
  sun: 'var(--c-sun)', grid: 'var(--c-grid)', battery: 'var(--c-battery)', car: 'var(--c-car)',
  elec: 'var(--flow-elec)', heat: 'var(--flow-heat)', warn: 'var(--c-warn)', muted: 'var(--muted)',
};
const s = (key: string, label: string, color: string): SeriesSpec => ({ key, label, color });
const W = (title: string, ...series: SeriesSpec[]): LineSpec => ({ title, unit: 'W', format: fmtPower, series });
const T = (title: string, ...series: SeriesSpec[]): LineSpec => ({ title, unit: '°C', format: fmtTemp, series });

const SPECS: Record<NodeId, NodeSpec> = {
  pvRoof: { bars: [s('pvRoof', 'PV Dach', C.sun)], lines: [W('Leistung', s('pvRoof.power', 'PV Dach', C.sun))] },
  pvCarport: { bars: [s('pvCarport', 'PV Carport', C.sun)], lines: [W('Leistung', s('pvCarport.power', 'PV Carport', C.sun))] },
  solarThermal: {
    bars: [s('solarThermal', 'Wärme', C.heat)],
    lines: [W('Leistung', s('solarThermal.power', 'Solarthermie', C.heat)), T('Temperatur', s('solarThermal.collectorTemp', 'Kollektor', C.heat), s('heatpump.bufferTop', 'Puffer oben', C.grid))],
  },
  battery: {
    bars: [s('batteryCharge', 'Laden', C.battery), s('batteryDischarge', 'Entladen', C.grid)],
    lines: [W('Leistung (+ Entladen / − Laden)', s('battery.power', 'Akku', C.battery)), { title: 'Ladestand', unit: '%', format: fmtPct, series: [s('battery.soc', 'Ladestand', C.battery)] }],
  },
  grid: {
    bars: [s('gridImport', 'Bezug', C.grid), s('gridExport', 'Einspeisung', C.sun)],
    lines: [W('Leistung (+ Bezug / − Einspeisung)', s('grid.power', 'Netz', C.grid))],
  },
  heatpump: {
    bars: [s('heatpump', 'Strom', C.elec), s('heatpumpHeat', 'Wärme', C.heat)],
    lines: [
      W('Leistung', s('heatpump.power', 'Strom', C.elec), s('heatpump.heat', 'Wärme', C.heat)),
      T('Temperaturen', s('heatpump.flowTemp', 'Vorlauf', C.heat), s('heatpump.dhwTop', 'Warmwasser', C.warn), s('heatpump.bufferTop', 'Puffer', C.grid), s('outdoor.temp', 'Außen', C.battery)),
      { title: 'COP', unit: '', format: fmtNum, series: [s('heatpump.cop', 'COP', C.heat)] },
    ],
  },
  car: {
    bars: [s('wallbox', 'Geladen', C.car)],
    lines: [W('Ladeleistung', s('wallbox.power', 'Wallbox', C.car)), { title: 'Ladestand', unit: '%', format: fmtPct, series: [s('car.soc', 'Auto', C.car)] }],
  },
  carport: {
    bars: [s('pvCarport', 'PV Carport', C.sun), s('wallbox', 'Auto', C.car)],
    lines: [W('Leistung', s('pvCarport.power', 'PV Carport', C.sun), s('wallbox.power', 'Auto', C.car), s('battery.power', 'Akku', C.battery))],
  },
  house: {
    bars: [s('rest', 'Haushalt', C.muted), s('heatpump', 'Wärmepumpe', C.elec), s('wallbox', 'Auto', C.car)],
    stacked: true,
    lines: [
      W('Verbrauch', s('house.power', 'Gesamt', C.elec)),
      T('Raumtemperatur', s('Gallerie.temp', 'Galerie', C.heat), s('Wohnzimmer.temp', 'Wohnzimmer', C.grid)),
      { title: 'CO₂', unit: 'ppm', format: fmtPpm, series: [s('Gallerie.co2', 'Galerie', C.heat), s('Wohnzimmer.co2', 'Wohnzimmer', C.grid)] },
    ],
  },
};

const BAR_TITLE = { day: 'Energie je Stunde', month: 'Energie je Tag', year: 'Energie je Monat', all: 'Energie je Jahr' } as const;
const LINE_SUFFIX = { day: '', month: ' · Stundenmittel', year: ' · Tagesmittel', all: ' · Monatsmittel' } as const;

function Bars({ spec, view }: { spec: NodeSpec; view: View }) {
  const { data, error } = useSeries('energy', spec.bars.map((b) => b.key), view);
  if (error) return <p className="chart-error">Diagramm konnte nicht geladen werden.</p>;
  return <BarChart data={data} series={spec.bars} title={BAR_TITLE[view.period]} unit="kWh" stacked={spec.stacked} />;
}

function Lines({ line, view }: { line: LineSpec; view: View }) {
  const { data, error } = useSeries('gauge', line.series.map((x) => x.key), view);
  if (error) return <p className="chart-error">Diagramm konnte nicht geladen werden.</p>;
  return <LineChart data={data} series={line.series} title={line.title + LINE_SUFFIX[view.period]} unit={line.unit} format={line.format} />;
}

export function NodeCharts({ id, view }: { id: NodeId; view: View }) {
  const spec = SPECS[id];
  return (
    <div className="charts">
      <Bars spec={spec} view={view} />
      {spec.lines.map((l) => (
        <Lines key={l.title} line={l} view={view} />
      ))}
    </div>
  );
}
