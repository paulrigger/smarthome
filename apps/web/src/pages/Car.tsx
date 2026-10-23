import { useState } from 'react';
import type { ChargeSession } from '@smarthome/shared';
import { useAllocation, useSeries } from '../data';
import { energy, join, num, pct } from '../format';
import type { View } from '../view';
import { BarChart, LineChart, fmtPower } from '../components/Charts';
import { Method, SOURCE_SERIES, SplitBar, SplitBlock, ownShare, splitSeries } from '../components/SourceSplit';
import { Kpi } from './Kpi';

const TZ = 'Europe/Vienna';
const fWhen = new Intl.DateTimeFormat('de-AT', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'numeric' });
const fTime = new Intl.DateTimeFormat('de-AT', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });

function duration(s: ChargeSession): string {
  const min = Math.round((new Date(s.end).getTime() - new Date(s.start).getTime()) / 60_000);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
}

function Session({ s, showDay }: { s: ChargeSession; showDay: boolean }) {
  const start = new Date(s.start);
  return (
    <li>
      <span className="s-when">
        {showDay && `${fWhen.format(start)}, `}
        {fTime.format(start)}–{fTime.format(new Date(s.end))}
        <small>{duration(s)}</small>
      </span>
      <span className="s-kwh">{join(energy(s.total))}</span>
      <SplitBar split={s} />
      <span className="s-pv">{pct(ownShare(s))} PV</span>
    </li>
  );
}

export function Car({ view }: { view: View }) {
  const { data: a, error } = useAllocation(view);
  const [all, setAll] = useState(false);
  const wb = a?.totals.wallbox ?? null;
  const isDay = view.period === 'day';
  const power = useSeries('gauge', isDay ? ['wallbox.power', 'pv.power'] : [], view).data;
  const sessions = [...(a?.sessions ?? [])].reverse();
  const shown = all ? sessions : sessions.slice(0, 8);
  const gridHeavy = sessions.filter((s) => s.grid / s.total > 0.5).length;

  return (
    <div className="analysis">
      <h1>E-Auto</h1>
      {error && <p className="chart-error">Daten konnten nicht geladen werden.</p>}
      <dl className="kpis">
        <Kpi label="Geladen" value={energy(wb?.total)} />
        <Kpi label="aus PV + Akku" value={{ value: pct(ownShare(wb)), unit: '' }} />
        <Kpi label="aus dem Netz" value={energy(wb?.grid)} />
        <Kpi label="Ladungen" value={{ value: a ? String(sessions.length) : '–', unit: '' }} hint={gridHeavy ? `${gridHeavy} davon überwiegend Netz` : undefined} />
      </dl>

      <SplitBlock title="Ladestrom" split={wb} note={wb && wb.battery > 0.5 ? `${join(energy(wb.battery))} kamen aus dem Hausakku – das Auto entlädt dabei den Speicher.` : undefined} />

      <section className="charts">
        <BarChart data={splitSeries(a, 'wallbox')} series={SOURCE_SERIES} title={`Ladestrom je ${isDay ? 'Stunde' : view.period === 'month' ? 'Tag' : 'Monat'}`} unit="kWh" stacked />
        {isDay && (
          <LineChart
            data={power}
            title="Laden und PV-Leistung"
            unit="W"
            format={fmtPower}
            series={[{ key: 'pv.power', label: 'PV', color: 'var(--c-sun)' }, { key: 'wallbox.power', label: 'Wallbox', color: 'var(--c-car)' }]}
          />
        )}
      </section>

      <section>
        <h2>Ladevorgänge <span>{a ? sessions.length : '…'}</span></h2>
        {a && sessions.length === 0 && <p className="split-note">Keine Ladung im Zeitraum.</p>}
        <ul className="sessions">
          {shown.map((s) => <Session key={s.start} s={s} showDay={!isDay} />)}
        </ul>
        {sessions.length > shown.length && (
          <button className="sessions-more" onClick={() => setAll(true)}>Alle {sessions.length} anzeigen</button>
        )}
      </section>
      <Method />
    </div>
  );
}
