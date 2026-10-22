import { useEffect, useState, type ComponentType, type SVGProps } from 'react';
import type { LiveSnapshot, Period } from '@smarthome/shared';
import { EnergyFlow, type NodeId } from '../components/EnergyFlow';
import { Details } from '../components/Details';
import { EnergyTables } from '../components/EnergyTables';
import { Close, Coffee, Dishwasher, Freezer, Fridge, Oven, Router, Stove, Washer } from '../components/Icons';
import { useSummary, type Conn } from '../data';
import { energy, join, power } from '../format';

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
  const [selected, setSelected] = useState<NodeId | null>(null);
  const isLive = period === 'today';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSelected(null);
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  const appliances = APPLIANCE_ICONS.map(([id, Icon]) => {
    const a = summary?.appliances.find((x) => x.id === id);
    const l = live?.appliances.find((x) => x.id === id);
    return { id, Icon, name: a?.name ?? l?.name ?? id, kwh: a?.kwh ?? null, power: l?.power ?? null };
  });

  return (
    <div className="overview">
      <div className="flow-wrap">
        <EnergyFlow live={live} summary={summary} period={period} selected={selected} onSelect={(id) => setSelected(id === selected ? null : id)} />
      </div>

      <aside className="side">
        <EnergyTables live={live} summary={summary} period={period} />

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

      {selected && (
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
