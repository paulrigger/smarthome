import type { EnergySummary, LiveSnapshot, Period } from '@smarthome/shared';
import type { ReactNode } from 'react';
import { energy, join, num, pct, power } from '../format';
import type { NodeId } from './EnergyFlow';

interface Props {
  id: NodeId;
  live: LiveSnapshot | null;
  summary: EnergySummary | null;
  period: Period;
}

const TITLES: Record<NodeId, string> = {
  pv: 'Photovoltaik',
  battery: 'Akku',
  grid: 'Netz',
  heatpump: 'Wärmepumpe',
  car: 'Auto & Wallbox',
  house: 'Haus',
};
const COLORS: Record<NodeId, string> = {
  pv: 'var(--c-sun)', battery: 'var(--c-battery)', grid: 'var(--c-grid)',
  heatpump: 'var(--c-heat)', car: 'var(--c-car)', house: 'var(--text)',
};

function Row({ k, v, sub }: { k: string; v: ReactNode; sub?: boolean }) {
  return (
    <div className={`row${sub ? ' sub' : ''}`}>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

export function detailTitle(id: NodeId) {
  return TITLES[id];
}

export function Details({ id, live, summary, period }: Props) {
  const l = live;
  const e = summary?.energy;
  const isLive = period === 'today';
  const per = period === 'today' ? 'heute' : 'diesen Monat';
  const rows: ReactNode[] = [];
  const add = (k: string, v: ReactNode, sub = false) => rows.push(<Row key={k} k={k} v={v} sub={sub} />);

  switch (id) {
    case 'pv':
      if (isLive) {
        add('Leistung', join(power(l?.power.pv)));
        add('Dach', join(power(l?.power.pvRoof)), true);
        add('Carport', join(power(l?.power.pvCarport)), true);
      }
      add(`Erzeugt ${per}`, join(energy(e?.pv)));
      add('Dach', join(energy(e?.pvRoof)), true);
      add('Carport', join(energy(e?.pvCarport)), true);
      add('Eigenverbrauch', pct(summary?.kpi.selfConsumption));
      add('Solarthermie', `${join(energy(e?.solarThermal))}${isLive ? ` · Kollektor ${num(l?.solarThermal.collectorTemp, 0, '°C')}` : ''}`);
      break;
    case 'battery':
      if (isLive) {
        add('Ladestand', num(l?.battery.soc, 0, '%'));
        const b = l?.power.battery ?? null;
        add(b !== null && b < 0 ? 'Lädt mit' : 'Entlädt mit', join(power(b)));
      }
      add(`Geladen ${per}`, join(energy(e?.batteryCharge)));
      add(`Entladen ${per}`, join(energy(e?.batteryDischarge)));
      break;
    case 'grid': {
      if (isLive) {
        const g = l?.power.grid ?? null;
        add(g !== null && g < 0 ? 'Einspeisung' : 'Bezug', join(power(g)));
      }
      add(`Bezug ${per}`, join(energy(e?.gridImport)));
      add(`Einspeisung ${per}`, join(energy(e?.gridExport)));
      add('Autarkie', pct(summary?.kpi.selfSufficiency));
      break;
    }
    case 'heatpump':
      if (isLive) {
        add('Elektrisch', join(power(l?.power.heatpump)));
        add('Heizleistung', join(power(l?.heatpump.heatOutput)));
        add('COP aktuell', num(l?.heatpump.cop, 2));
        add('Vorlauf', num(l?.heatpump.flowTemp, 1, '°C'));
        add('Warmwasser oben', num(l?.heatpump.dhwTop, 1, '°C'));
        add('Puffer oben', num(l?.heatpump.bufferTop, 1, '°C'));
        add('Außen', num(l?.outdoorTemp, 1, '°C'));
      }
      add(`Strom ${per}`, join(energy(e?.heatpump)));
      add(`Wärme ${per}`, join(energy(e?.heatpumpHeat)));
      add('Arbeitszahl', num(summary?.kpi.cop, 2));
      break;
    case 'car':
      if (isLive) {
        add('Ladestand', num(l?.car.soc, 0, '%'));
        add('Reichweite', num(l?.car.range, 0, 'km'));
        add('Status', l?.car.home === false ? 'unterwegs' : l?.car.plugged ? 'angesteckt' : 'zuhause, nicht angesteckt');
        add('Wallbox', join(power(l?.power.wallbox)));
      }
      add(`Geladen ${per}`, join(energy(e?.wallbox)));
      break;
    case 'house':
      if (isLive) {
        add('Verbrauch gesamt', join(power(l?.power.house)));
        add('Haushalt ohne WP/Auto', join(power(l?.power.rest)), true);
      }
      add(`Verbrauch ${per}`, join(energy(e?.house)));
      add('Haushalt', join(energy(e?.rest)), true);
      add('Wärmepumpe', join(energy(e?.heatpump)), true);
      add('Auto', join(energy(e?.wallbox)), true);
      add('Autarkie', pct(summary?.kpi.selfSufficiency));
      break;
  }

  return (
    <section className="details" style={{ ['--accent' as string]: COLORS[id] }}>
      <h2>{TITLES[id]}</h2>
      <dl>{rows}</dl>
    </section>
  );
}
