import type { EnergySummary, LiveSnapshot, Period } from '@smarthome/shared';
import { energy, join, num, pct, power } from '../format';

interface Props {
  live: LiveSnapshot | null;
  summary: EnergySummary | null;
  period: Period;
}

interface Row {
  k: string;
  now?: string;
  sum?: string;
  sub?: boolean;
  total?: boolean;
}

const W = (w: number | null | undefined) => join(power(w));
const E = (k: number | null | undefined) => join(energy(k));
/** Nur positive Richtung anzeigen, sonst leer (z.B. Bezug vs. Einspeisung). */
const pos = (w: number | null | undefined) => (w === null || w === undefined ? '–' : w > 20 ? W(w) : '');
const neg = (w: number | null | undefined) => (w === null || w === undefined ? '–' : w < -20 ? W(-w) : '');

function Table({ title, rows, isLive, period, className }: { title: string; rows: Row[]; isLive: boolean; period: Period; className: string }) {
  return (
    <section className={`etable ${className}`}>
      <h2>{title}</h2>
      <table aria-label={title}>
        <thead>
          <tr>
            <th scope="col" />
            {isLive && <th scope="col">Jetzt</th>}
            <th scope="col">{period === 'today' ? 'Heute' : 'Monat'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.k} className={`${r.sub ? 'sub' : ''}${r.total ? ' total' : ''}`}>
              <th scope="row">{r.k}</th>
              {isLive && <td>{r.now ?? ''}</td>}
              <td>{r.sum ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function EnergyTables({ live, summary, period }: Props) {
  const isLive = period === 'today';
  const l = live?.power;
  const e = summary?.energy;
  const k = summary?.kpi;

  const strom: Row[] = [
    { k: 'PV Dach', now: W(l?.pvRoof), sum: E(e?.pvRoof) },
    { k: 'PV Carport', now: W(l?.pvCarport), sum: E(e?.pvCarport) },
    { k: 'Netzbezug', now: pos(l?.grid), sum: E(e?.gridImport) },
    { k: 'Einspeisung', now: neg(l?.grid), sum: E(e?.gridExport) },
    { k: 'Akku laden', now: neg(l?.battery), sum: E(e?.batteryCharge) },
    { k: 'Akku entladen', now: pos(l?.battery), sum: E(e?.batteryDischarge) },
    { k: 'Verbrauch gesamt', now: W(l?.house), sum: E(e?.house), total: true },
    { k: 'Haushalt', now: W(l?.rest), sum: E(e?.rest), sub: true },
    { k: 'Wärmepumpe', now: W(l?.heatpump), sum: E(e?.heatpump), sub: true },
    { k: 'Auto', now: W(l?.wallbox), sum: E(e?.wallbox), sub: true },
    { k: 'Autarkie', sum: pct(k?.selfSufficiency), total: true },
    { k: 'Eigenverbrauch PV', sum: pct(k?.selfConsumption) },
  ];

  const heatTotal = e ? e.heatpumpHeat + e.solarThermal : null;
  const heatNow = live ? (live.heatpump.heatOutput ?? 0) + (live.power.solarThermal ?? 0) : null;
  const waerme: Row[] = [
    { k: 'Wärmepumpe', now: W(live?.heatpump.heatOutput), sum: E(e?.heatpumpHeat) },
    { k: 'Solarthermie', now: W(live?.power.solarThermal), sum: E(e?.solarThermal) },
    { k: 'Wärme gesamt', now: W(heatNow), sum: E(heatTotal), total: true },
    { k: 'Strom Wärmepumpe', now: W(l?.heatpump), sum: E(e?.heatpump) },
    { k: 'COP / Arbeitszahl', now: num(live?.heatpump.cop, 1), sum: num(k?.cop, 1) },
    ...(isLive
      ? [
          { k: 'Vorlauf', now: num(live?.heatpump.flowTemp, 1, '°C') },
          { k: 'Warmwasser oben', now: num(live?.heatpump.dhwTop, 1, '°C') },
          { k: 'Puffer oben', now: num(live?.heatpump.bufferTop, 1, '°C') },
          { k: 'Kollektor', now: num(live?.solarThermal.collectorTemp, 1, '°C') },
          { k: 'Außen', now: num(live?.outdoorTemp, 1, '°C') },
        ]
      : []),
  ];

  return (
    <div className="etables">
      <Table title="Strom" rows={strom} isLive={isLive} period={period} className="elec" />
      <Table title="Wärme" rows={waerme} isLive={isLive} period={period} className="heat" />
    </div>
  );
}
