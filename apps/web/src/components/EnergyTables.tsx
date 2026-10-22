import type { EnergySummary } from '@smarthome/shared';
import { shortLabel, type View } from '../view';
import { energy, join, num, pct } from '../format';

interface Props {
  summary: EnergySummary | null;
  view: View;
}

interface Row {
  op?: '+' | '−' | '=';
  k: string;
  v: string;
  sub?: boolean;
  total?: boolean;
  gap?: boolean; // Abstand davor (neuer Block)
}

const E = (k: number | null | undefined) => join(energy(k));

function Table({ title, rows, label, className }: { title: string; rows: Row[]; label: string; className: string }) {
  return (
    <section className={`etable ${className}`}>
      <h2>
        {title}
        <span>{label}</span>
      </h2>
      <table aria-label={title}>
        <tbody>
          {rows.map((r) => (
            <tr key={r.k} className={[r.sub && 'sub', r.total && 'total', r.gap && 'gap'].filter(Boolean).join(' ')}>
              <td className="op" aria-hidden>{r.op ?? ''}</td>
              <th scope="row">{r.k}</th>
              <td>{r.v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** Nur Energie im Zeitraum. Strom als Bilanz: PV − Einspeisung + Bezug − Laden + Entladen = Verbrauch. */
export function EnergyTables({ summary, view }: Props) {
  const label = shortLabel(view);
  const e = summary?.energy;
  const k = summary?.kpi;

  const strom: Row[] = [
    { k: 'PV Dach', v: E(e?.pvRoof) },
    { op: '+', k: 'PV Carport', v: E(e?.pvCarport) },
    { op: '=', k: 'PV gesamt', v: E(e?.pv), total: true },
    { op: '−', k: 'Einspeisung', v: E(e?.gridExport) },
    { op: '+', k: 'Netzbezug', v: E(e?.gridImport) },
    { op: '−', k: 'Akku laden', v: E(e?.batteryCharge) },
    { op: '+', k: 'Akku entladen', v: E(e?.batteryDischarge) },
    { op: '=', k: 'Verbrauch gesamt', v: E(e?.house), total: true },
    { k: 'Haushalt', v: E(e?.rest), sub: true },
    { k: 'Wärmepumpe', v: E(e?.heatpump), sub: true },
    { k: 'Auto', v: E(e?.wallbox), sub: true },
    { k: 'Autarkie', v: pct(k?.selfSufficiency), gap: true },
    { k: 'Eigenverbrauch PV', v: pct(k?.selfConsumption) },
  ];

  const waerme: Row[] = [
    { k: 'Wärmepumpe', v: E(e?.heatpumpHeat) },
    { op: '+', k: 'Solarthermie', v: E(e?.solarThermal) },
    { op: '=', k: 'Wärme gesamt', v: E(e ? e.heatpumpHeat + e.solarThermal : null), total: true },
    { k: 'Strom Wärmepumpe', v: E(e?.heatpump), gap: true },
    { k: 'Arbeitszahl', v: num(k?.cop, 1) },
  ];

  return (
    <div className="etables">
      <Table title="Strom" rows={strom} label={label} className="elec" />
      <Table title="Wärme" rows={waerme} label={label} className="heat" />
    </div>
  );
}
