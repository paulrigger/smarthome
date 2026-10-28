import { APPLIANCE_NAMES, deviceState, type EnergySummary, type LiveSnapshot, type Thresholds } from '@smarthome/shared';
import type { ReactNode } from 'react';
import { useSeries } from '../data';
import { energy, join, pct, power } from '../format';
import { shortLabel, type View } from '../view';
import { BarChart, LineChart, fmtPower } from './Charts';

interface Props {
  id: string; // Geräte-ID wie in APPLIANCE_NAMES (Shelly-Steckdosen, Herd/Backrohr per 3EM)
  live: LiveSnapshot | null;
  summary: EnergySummary | null;
  view: View;
  th: Thresholds;
}

const STATE = { on: 'an', standby: 'Standby', off: 'aus' } as const;
const BAR_TITLE = { day: 'Energie je Stunde', month: 'Energie je Tag', year: 'Energie je Monat', all: 'Energie je Jahr' } as const;
const LINE_TITLE = { day: 'Leistung', month: 'Leistung · Stundenmittel', year: 'Leistung · Tagesmittel', all: 'Leistung · Monatsmittel' } as const;

function Row({ k, v, sub }: { k: string; v: ReactNode; sub?: boolean }) {
  return (
    <div className={`row${sub ? ' sub' : ''}`}>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

/** Detail-Popup für ein Gerät aus den Kacheln der Übersicht. */
export function ApplianceDetails({ id, live, summary, view, th }: Props) {
  const name = (APPLIANCE_NAMES[id] ?? id).replace(/­/g, '');
  const kwh = summary?.appliances.find((a) => a.id === id)?.kwh ?? null;
  const w = live?.appliances.find((a) => a.id === id)?.power ?? null;
  const st = deviceState(id, w, th);
  const rest = summary?.energy.rest;
  const hours = summary ? (new Date(summary.to).getTime() - new Date(summary.from).getTime()) / 3_600_000 : 0;
  const energyS = useSeries('energy', [`appliance.${id}`], view);
  const powerS = useSeries('gauge', [`appliance.${id}.power`], view);
  const color = 'var(--c-sun)';

  return (
    <section className="details" style={{ ['--accent' as string]: 'var(--text)' }}>
      <h2>{name} <span>{shortLabel(view)}</span></h2>
      <dl>
        {view.isLive && <Row k="Leistung jetzt" v={w === null ? '–' : `${join(power(w))} · ${STATE[st!]}`} />}
        <Row k={`Energie ${shortLabel(view)}`} v={join(energy(kwh))} />
        <Row k="Ø Leistung" v={kwh !== null && hours > 0.1 ? join(power((kwh / hours) * 1000)) : '–'} sub />
        <Row k="Anteil am Haushalt" v={kwh !== null && rest ? pct(kwh / rest) : '–'} sub />
        <Row k="Schwelle aus / an" v={`${th[id]?.off ?? '–'} / ${th[id]?.on ?? '–'} W`} sub />
      </dl>
      <div className="charts">
        {energyS.error ? (
          <p className="chart-error">Diagramm konnte nicht geladen werden.</p>
        ) : (
          <BarChart data={energyS.data} series={[{ key: `appliance.${id}`, label: name, color }]} title={BAR_TITLE[view.period]} unit="kWh" />
        )}
        {powerS.error ? (
          <p className="chart-error">Diagramm konnte nicht geladen werden.</p>
        ) : (
          <LineChart data={powerS.data} series={[{ key: `appliance.${id}.power`, label: name, color }]} title={LINE_TITLE[view.period]} unit="W" format={fmtPower} />
        )}
      </div>
    </section>
  );
}
