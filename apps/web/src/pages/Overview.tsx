import { useEffect, useState, type ComponentType, type SVGProps } from 'react';
import { deviceState, type LiveSnapshot } from '@smarthome/shared';
import { shortLabel, type View } from '../view';
import { EnergyFlow, press, type NodeId } from '../components/EnergyFlow';
import { ApplianceDetails } from '../components/ApplianceDetails';
import { ConnBadge } from '../components/ConnBadge';
import { FlowSankey } from '../components/FlowSankey';
import { FlowHub } from '../components/FlowHub';
import { FlowModel } from '../components/FlowModel';
import { loadOverviewStyle } from '../overviewStyle';
import { Details } from '../components/Details';
import { EnergyPies } from '../components/EnergyPies';
import { Close, Coffee, Dishwasher, Freezer, Fridge, Oven, Router, Stove, Washer } from '../components/Icons';
import { useSummary, useThresholds, type Conn } from '../data';
import { energy, join, power } from '../format';

type Icon = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

// Feste Reihenfolge (wie am E-Ink): Küche zuerst, Dauerläufer zuletzt
const APPLIANCE_ICONS: [string, Icon][] = [
  ['coffeemachine', Coffee], ['herd', Stove], ['backrohr', Oven], ['geschirrspueler', Dishwasher],
  ['washingmachine', Washer], ['kuehlschrank', Fridge], ['freezer', Freezer], ['router', Router],
];

interface Props {
  view: View;
  live: LiveSnapshot | null;
  conn: Conn;
}

export function Overview({ view, live, conn }: Props) {
  const summary = useSummary(view);
  const [selected, setSelected] = useState<NodeId | null>(null);
  const [appliance, setAppliance] = useState<string | null>(null); // Gerät aus den Kacheln (eigenes Popup)
  const close = () => (setSelected(null), setAppliance(null));
  const isLive = view.isLive;
  const [style] = useState(loadOverviewStyle);
  const Graphic = style === 'sankey' ? FlowSankey : style === 'hub' ? FlowHub : style === 'model' ? FlowModel : EnergyFlow;
  const { th } = useThresholds();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (setSelected(null), setAppliance(null));
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
      <div className={`flow-wrap${style === 'house' ? '' : ' alt'}`}>
        <ConnBadge conn={conn} live={live} />
        <Graphic live={live} summary={summary} isLive={isLive} th={th} selected={selected} onSelect={(id) => (setAppliance(null), setSelected(id === selected ? null : id))} />
      </div>

      <aside className="side">
        <section className="appliances">
          <h2>Geräte <span>{shortLabel(view)}</span></h2>
          <ul>
            {appliances.map(({ id, Icon, name, kwh, power: p }) => {
              const st = isLive ? deviceState(id, p, th) : null;
              return (
                <li
                  key={id}
                  className={`${st === 'on' || st === 'standby' ? st : ''}${appliance === id ? ' sel' : ''}`}
                  aria-label={`${name.replace(/­/g, '')} – Details`}
                  {...press(() => (setSelected(null), setAppliance(id)))}
                >
                  <Icon size={30} />
                  <span className="a-name">{name}</span>
                  <span className="a-kwh">{join(energy(kwh))}</span>
                  {isLive && (
                    <span className="a-now">{st === 'on' ? join(power(p)) : st === 'standby' ? `Standby ${join(power(p))}` : st === 'off' ? 'aus' : '–'}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
        <EnergyPies summary={summary} view={view} />
      </aside>

      {(selected || appliance) && (
        <div className="sheet-backdrop" onClick={close}>
          <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <button className="sheet-close" onClick={close} aria-label="Schließen">
              <Close size={22} />
            </button>
            {selected && <Details id={selected} live={live} summary={summary} view={view} />}
            {appliance && <ApplianceDetails id={appliance} live={live} summary={summary} view={view} th={th} />}
          </div>
        </div>
      )}
    </div>
  );
}
