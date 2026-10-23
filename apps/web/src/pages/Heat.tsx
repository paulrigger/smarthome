import { useAllocation, useCosts, useSeries, useSummary } from '../data';
import { ctPerKwh, energy, eurOf, join, num, pct } from '../format';
import type { View } from '../view';
import { BarChart, LineChart, ScatterChart, fmtNum, fmtPower, fmtTemp } from '../components/Charts';
import { Method, SOURCE_SERIES, SplitBlock, ownShare, splitSeries } from '../components/SourceSplit';
import { copSeries, copVsOutdoor } from './analysis';
import { Kpi } from './Kpi';

export function Heat({ view }: { view: View }) {
  const { data: a, error } = useAllocation(view);
  const summary = useSummary(view);
  const cost = useCosts(view)?.totals.heatpump ?? null;
  const hp = a?.totals.heatpump ?? null;
  const heat = a?.totals.heatpumpHeat ?? null;
  const solarThermal = summary?.energy.solarThermal ?? null;

  // Solaranteil der Wärme: Solarthermie + WP-Wärme aus PV/Akku
  const heatAll = heat && solarThermal !== null ? heat.total + solarThermal : null;
  const solarHeat = heat && solarThermal !== null ? solarThermal + heat.pv + heat.battery : null;
  const jaz = hp && heat && hp.total > 0.1 ? heat.total / hp.total : null;

  const isDay = view.period === 'day';
  const energyS = useSeries('energy', isDay ? [] : ['heatpump', 'heatpumpHeat'], view).data;
  const gauge = useSeries('gauge', isDay ? [] : ['outdoor.temp'], view).data;
  const power = useSeries('gauge', isDay ? ['heatpump.power', 'pv.power'] : [], view).data;
  const bucket = view.period === 'month' ? 'Tag' : 'Monat';

  return (
    <div className="analysis">
      <h1>Wärmepumpe</h1>
      {error && <p className="chart-error">Daten konnten nicht geladen werden.</p>}
      <dl className="kpis">
        <Kpi label="Strom WP" value={energy(hp?.total)} />
        <Kpi label="aus PV + Akku" value={{ value: pct(ownShare(hp)), unit: '' }} hint={hp ? `Netz ${join(energy(hp.grid))}` : undefined} />
        <Kpi label="Wärme gesamt" value={energy(heatAll)} hint="WP + Solarthermie" />
        <Kpi label="Arbeitszahl" value={{ value: num(jaz, 1), unit: '' }} hint={heatAll && solarHeat !== null ? `Solaranteil Wärme ${pct(solarHeat / heatAll)}` : undefined} />
        <Kpi label="Stromkosten WP" value={{ value: eurOf(cost), unit: '' }} hint={cost && eurOf(cost) !== '–' ? `Netzanteil · ${ctPerKwh(cost.eur, cost.kwh)}` : 'Netzanteil × Tarif'} />
        <Kpi label="Wärmekosten" value={{ value: cost && eurOf(cost) !== '–' ? ctPerKwh(cost.eur, heatAll) : '–', unit: '' }} hint="je kWh Wärme (WP + Solar)" />
      </dl>

      <SplitBlock title="Strom der Wärmepumpe" split={hp} />
      <SplitBlock
        title="Erzeugte Wärme"
        split={heat}
        note={solarThermal !== null && solarThermal > 0 ? `Dazu ${join(energy(solarThermal))} aus der Solarthermie.` : 'Wärme der WP, zugeordnet nach Herkunft ihres Stroms.'}
      />

      <section className="charts">
        <BarChart data={splitSeries(a, 'heatpump')} series={SOURCE_SERIES} title={`WP-Strom je ${isDay ? 'Stunde' : bucket}`} unit="kWh" stacked />
        {isDay && (
          <LineChart
            data={power}
            title="Wann läuft die WP?"
            unit="W"
            format={fmtPower}
            series={[{ key: 'pv.power', label: 'PV', color: 'var(--c-sun)' }, { key: 'heatpump.power', label: 'Wärmepumpe', color: 'var(--flow-elec)' }]}
          />
        )}
        {!isDay && (
          <ScatterChart
            points={copVsOutdoor(energyS, gauge, view.period === 'month' ? 1 : 20)}
            title={`Arbeitszahl je ${bucket} über Außentemperatur`}
            xLabel="Außen °C"
            yLabel="Arbeitszahl"
            color="var(--flow-heat)"
            formatX={fmtTemp}
          />
        )}
        {view.period === 'year' && (
          <BarChart data={copSeries(energyS)} series={[{ key: 'cop', label: 'Arbeitszahl', color: 'var(--flow-heat)' }]} title="Arbeitszahl je Monat" unit="" format={fmtNum} legendValues={[jaz]} />
        )}
      </section>
      <Method />
    </div>
  );
}
