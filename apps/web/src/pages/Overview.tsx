import { useEffect, useState } from 'react';
import type { Period } from '@smarthome/shared';
import { EnergyFlow, type NodeId } from '../components/EnergyFlow';
import { Details } from '../components/Details';
import { Close } from '../components/Icons';
import { useMedia, useSummary, type Conn } from '../data';
import type { LiveSnapshot } from '@smarthome/shared';
import { energy, join, num, pct, power } from '../format';

interface Props {
  period: Period;
  live: LiveSnapshot | null;
  conn: Conn;
}

export function Overview({ period, live }: Props) {
  const summary = useSummary(period);
  const wide = useMedia('(min-width: 1024px)');
  const [selected, setSelected] = useState<NodeId | null>(null);
  const shown: NodeId | null = selected ?? (wide ? 'house' : null);
  const isLive = period === 'today';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSelected(null);
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  const kpis = [
    { k: 'Autarkie', v: pct(summary?.kpi.selfSufficiency) },
    { k: 'Eigenverbrauch', v: pct(summary?.kpi.selfConsumption) },
    { k: 'Arbeitszahl WP', v: num(summary?.kpi.cop, 1) },
    { k: 'Außen', v: num(live?.outdoorTemp, 1, '°C') },
  ];

  const appliances = (summary?.appliances ?? [])
    .map((a) => ({ ...a, power: live?.appliances.find((x) => x.id === a.id)?.power ?? null }))
    .sort((a, b) => b.kwh - a.kwh);
  const maxKwh = Math.max(0.001, ...appliances.map((a) => a.kwh));

  return (
    <div className="overview">
      <div className="flow-wrap">
        <EnergyFlow live={live} summary={summary} period={period} selected={shown} onSelect={(id) => setSelected(id === selected && !wide ? null : id)} />
      </div>

      <aside className="side">
        <dl className="kpis">
          {kpis.map((x) => (
            <div key={x.k}>
              <dt>{x.k}</dt>
              <dd>{x.v}</dd>
            </div>
          ))}
        </dl>

        {wide && shown && <Details id={shown} live={live} summary={summary} period={period} />}

        <section className="appliances">
          <h2>Geräte {period === 'today' ? 'heute' : 'diesen Monat'}</h2>
          <ul>
            {appliances.map((a) => (
              <li key={a.id}>
                <span className="a-name">{a.name}</span>
                <span className="a-bar" aria-hidden>
                  <span style={{ width: `${(a.kwh / maxKwh) * 100}%` }} />
                </span>
                <span className="a-kwh">{join(energy(a.kwh))}</span>
                {isLive && <span className={`a-now${(a.power ?? 0) > 5 ? ' on' : ''}`}>{(a.power ?? 0) > 5 ? join(power(a.power)) : ''}</span>}
              </li>
            ))}
          </ul>
        </section>
      </aside>

      {!wide && selected && (
        <div className="sheet-backdrop" onClick={() => setSelected(null)}>
          <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <button className="sheet-close" onClick={() => setSelected(null)} aria-label="Schließen">
              <Close size={22} />
            </button>
            <Details id={selected} live={live} summary={summary} period={period} />
          </div>
        </div>
      )}
    </div>
  );
}
