import { useEffect, useState, type ComponentType, type SVGProps } from 'react';
import { runLabel, deviceState, type Detail, type LiveSnapshot } from '@smarthome/shared';
import { shortLabel, type View } from '../view';
import { EnergyFlow, press, type NodeId } from '../components/EnergyFlow';
import { ApplianceDetails } from '../components/ApplianceDetails';
import { ConnBadge } from '../components/ConnBadge';
import { FlowSankey } from '../components/FlowSankey';
import { FlowHub } from '../components/FlowHub';
import { FlowModel } from '../components/FlowModel';
import { HouseExplode } from '../components/HouseExplode';
import { loadOverviewStyle } from '../overviewStyle';
import { Details } from '../components/Details';
import type { PieId } from '../components/EnergyPies';
import { DayFlow } from '../components/DayFlow';
import { ForecastCard } from '../components/ForecastCard';
import { PieDetails } from '../components/PieDetails';
import { Close, Coffee, Dishwasher, Freezer, Fridge, Oven, Router, Stove, Washer } from '../components/Icons';
import { useForecast, useSummary, useThresholds, type Conn } from '../data';
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

export function Overview({ view, live, conn, deep, onDeep }: Props & { deep: Detail | null; onDeep: () => void }) {
  const summary = useSummary(view);
  const fc = useForecast(view.isCurrent);
  const [selected, setSelected] = useState<NodeId | null>(null);
  const [appliance, setAppliance] = useState<string | null>(null); // Gerät aus den Kacheln (eigenes Popup)
  const [pie, setPie] = useState<PieId | null>(null); // Ringdiagramm (eigenes Popup)
  const [house, setHouse] = useState<{ rect: DOMRect; vb: { w: number; h: number } } | null>(null); // Explosionszeichnung
  const [nodesOut, setNodesOut] = useState(false);
  const close = () => (setSelected(null), setAppliance(null), setPie(null));
  // Deep-Link (Push): Popup öffnen, danach Ziel verbrauchen
  useEffect(() => {
    if (!deep) return;
    setSelected(null); setAppliance(null); setPie(null);
    if (deep.kind === 'node') setSelected(deep.id as NodeId);
    else setAppliance(deep.id);
    onDeep();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deep]);
  const isLive = view.isLive;
  const [style] = useState(loadOverviewStyle);
  const Graphic = style === 'sankey' ? FlowSankey : style === 'hub' ? FlowHub : style === 'model' ? FlowModel : EnergyFlow;
  const { th } = useThresholds();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (setSelected(null), setAppliance(null), setPie(null));
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  const appliances = APPLIANCE_ICONS.map(([id, Icon]) => {
    const a = summary?.appliances.find((x) => x.id === id);
    const l = live?.appliances.find((x) => x.id === id);
    return { id, Icon, name: a?.name ?? l?.name ?? id, kwh: a?.kwh ?? null, power: l?.power ?? null, run: l?.run ?? null };
  });

  return (
    <div className="overview">
      <div className={`flow-wrap${style === 'house' ? '' : ' alt'}`}>
        <ConnBadge conn={conn} live={live} />
        {style === 'model' ? (
          <FlowModel
            live={live} summary={summary} isLive={isLive} th={th} selected={selected}
            onSelect={(id) => (setAppliance(null), setPie(null), setSelected(id === selected ? null : id))}
            onHouse={(from) => (close(), setHouse(from), setNodesOut(true))}
            exit={nodesOut}
          />
        ) : (
          <Graphic live={live} summary={summary} isLive={isLive} th={th} selected={selected} onSelect={(id) => (setAppliance(null), setPie(null), setSelected(id === selected ? null : id))} />
        )}
      </div>

      <aside className="side">
        {view.isCurrent && <ForecastCard data={fc} />}
        <DayFlow view={view} summary={summary} />
        <section className="appliances">
          <h2>Geräte <span>{shortLabel(view)}</span></h2>
          <ul>
            {appliances.map(({ id, Icon, name, kwh, power: p, run }) => {
              const st = isLive ? deviceState(id, p, th) : null;
              const left = isLive ? runLabel(run) : null; // Restzeit (Miele)
              return (
                <li
                  key={id}
                  className={`${st === 'on' || st === 'standby' ? st : ''}${appliance === id ? ' sel' : ''}`}
                  aria-label={`${name.replace(/­/g, '')} – Details`}
                  {...press(() => (setSelected(null), setPie(null), setAppliance(id)))}
                >
                  <Icon size={30} />
                  <span className="a-name">{name}</span>
                  {/* wie in der Grafik: Leistung oben groß, Energie darunter klein (ohne Live nur Energie groß) */}
                  {isLive ? (
                    <>
                      <span className="a-main a-now">{left ?? (st === 'on' ? join(power(p)) : st === 'standby' ? `Standby ${join(power(p))}` : st === 'off' ? 'aus' : '–')}</span>
                      <span className="a-sub">{join(energy(kwh))}</span>
                    </>
                  ) : (
                    <span className="a-main">{join(energy(kwh))}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </aside>

      {house && (
        <HouseExplode
          from={house} live={live} summary={summary} isLive={isLive} th={th}
          onClosing={() => setNodesOut(false)}
          onClose={() => setHouse(null)}
          onAppliance={(id) => (setSelected(null), setPie(null), setAppliance(id))}
        />
      )}

      {(selected || appliance || pie) && (
        <div className={`sheet-backdrop${house ? ' over-hx' : ''}`} onClick={close}>
          <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <button className="sheet-close" onClick={close} aria-label="Schließen">
              <Close size={22} />
            </button>
            {selected && <Details id={selected} live={live} summary={summary} view={view} />}
            {appliance && <ApplianceDetails id={appliance} live={live} summary={summary} view={view} th={th} />}
            {pie && <PieDetails id={pie} summary={summary} view={view} onNavigate={close} />}
          </div>
        </div>
      )}
    </div>
  );
}
