import { useEffect, useState, type ComponentType, type SVGProps } from 'react';
import type { LiveSnapshot, Period } from '@smarthome/shared';
import { EnergyFlow, type NodeId } from '../components/EnergyFlow';
import { Details } from '../components/Details';
import { Close, Coffee, Dishwasher, Freezer, Fridge, Oven, Router, Stove, Washer } from '../components/Icons';
import { useMedia, useSummary, type Conn } from '../data';
import { energy, join, num, pct, power } from '../format';

type Icon = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

// Feste Reihenfolge (wie am E-Ink): Küche zuerst, Dauerläufer zuletzt
const APPLIANCE_ICONS: [string, Icon][] = [
  ['coffeemachine', Coffee], ['herd', Stove], ['backrohr', Oven], ['geschirrspueler', Dishwasher],
  ['washingmachine', Washer], ['kuehlschrank', Fridge], ['freezer', Freezer], ['router', Router],
];

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

  const appliances = APPLIANCE_ICONS.map(([id, Icon]) => {
    const a = summary?.appliances.find((x) => x.id === id);
    const l = live?.appliances.find((x) => x.id === id);
    return { id, Icon, name: a?.name ?? l?.name ?? id, kwh: a?.kwh ?? null, power: l?.power ?? null };
  });

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
          <h2>Geräte {isLive ? 'heute' : 'diesen Monat'}</h2>
          <ul>
            {appliances.map(({ id, Icon, name, kwh, power: p }) => {
              const on = isLive && (p ?? 0) > 5;
              return (
                <li key={id} className={on ? 'on' : ''}>
                  <Icon size={30} />
                  <span className="a-name">{name}</span>
                  <span className="a-kwh">{join(energy(kwh))}</span>
                  {isLive && <span className="a-now">{on ? join(power(p)) : 'aus'}</span>}
                </li>
              );
            })}
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
