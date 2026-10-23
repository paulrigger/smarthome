import { flowDuration, hubLines, type EnergySummary, type LiveSnapshot } from '@smarthome/shared';
import type { ComponentType, SVGProps } from 'react';
import { energyShort as energy, join, num, pct, power, type Fmt } from '../format';
import { Kpi } from '../pages/Kpi';
import { press, Value, type NodeId } from './EnergyFlow';
import { Battery, Car, HeatPump, Home, Panel, Pylon, Sun } from './Icons';

interface Props {
  live: LiveSnapshot | null;
  summary: EnergySummary | null;
  isLive: boolean;
  selected: NodeId | null;
  onSelect: (id: NodeId) => void;
}

/*
 * Haus im Zentrum (viewBox 380 × 404): oben PV Dach · Solarthermie · PV Carport, links Netz, rechts Akku, unten WP · Auto.
 * Leitungen enden an den Kreisrändern; positive Werte fließen in Pfadrichtung.
 * Live: Dicke ∝ Leistung + Flusspunkte, sonst Dicke ∝ kWh, keine Animation.
 */
const C = { x: 190, y: 200, r: 60 };
const R = 22;

type Icon = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
type HubId = 'pvRoof' | 'solarThermal' | 'pvCarport' | 'grid' | 'battery' | 'heatpump' | 'car';

interface HubNode {
  id: HubId;
  label: string;
  x: number;
  y: number;
  color: string;
  Icon: Icon;
  text: { x: number; y: number; anchor: 'start' | 'middle' | 'end' };
  out?: boolean; // Verbraucher: Fluss vom Haus zum Knoten
  heat?: boolean;
  live: (l: LiveSnapshot) => number | null;
  kwh: (s: EnergySummary) => number;
}

const NODES: HubNode[] = [
  { id: 'pvRoof', label: 'PV Dach', x: 54, y: 58, color: 'var(--c-sun)', Icon: Panel, text: { x: 40, y: 108, anchor: 'middle' }, live: (l) => l.power.pvRoof, kwh: (s) => s.energy.pvRoof },
  { id: 'solarThermal', label: 'Solarthermie', x: 190, y: 40, color: 'var(--c-warmth)', Icon: Sun, heat: true, text: { x: 220, y: 30, anchor: 'start' }, live: (l) => l.power.solarThermal, kwh: (s) => s.energy.solarThermal },
  { id: 'pvCarport', label: 'PV Carport', x: 326, y: 58, color: 'var(--c-sun)', Icon: Panel, text: { x: 340, y: 108, anchor: 'middle' }, live: (l) => l.power.pvCarport, kwh: (s) => s.energy.pvCarport },
  // Netz/Akku im Zeitraum: größere Richtung, nicht Summe (sonst wirkt der Austausch größer als der Verbrauch)
  { id: 'grid', label: 'Netz', x: 38, y: 200, color: 'var(--c-grid)', Icon: Pylon, text: { x: 12, y: 246, anchor: 'start' }, live: (l) => l.power.grid, kwh: (s) => Math.max(s.energy.gridImport, s.energy.gridExport) },
  { id: 'battery', label: 'Akku', x: 342, y: 200, color: 'var(--c-battery)', Icon: Battery, text: { x: 368, y: 246, anchor: 'end' }, live: (l) => l.power.battery, kwh: (s) => Math.max(s.energy.batteryDischarge, s.energy.batteryCharge) },
  { id: 'heatpump', label: 'Wärmepumpe', x: 126, y: 352, color: 'var(--c-heat)', Icon: HeatPump, out: true, text: { x: 96, y: 330, anchor: 'end' }, live: (l) => l.power.heatpump, kwh: (s) => s.energy.heatpump },
  { id: 'car', label: 'Auto', x: 254, y: 352, color: 'var(--c-car)', Icon: Car, out: true, text: { x: 284, y: 330, anchor: 'start' }, live: (l) => l.power.wallbox, kwh: (s) => s.energy.wallbox },
];

/** Live: Richtung im Label, damit sie auch ohne Animation erkennbar ist. */
function liveLabel(n: HubNode, l: LiveSnapshot | null): string {
  const v = l ? n.live(l) : null;
  if (v === null || Math.abs(v) < 20) return n.label;
  if (n.id === 'grid') return v > 0 ? 'Netzbezug' : 'Einspeisung';
  if (n.id === 'battery') return v > 0 ? 'Akku entlädt' : 'Akku lädt';
  return n.label;
}

/** Gerade vom Knotenrand zum Hausrand (bzw. umgekehrt für Verbraucher). */
function linePath(n: HubNode): string {
  const dx = C.x - n.x, dy = C.y - n.y;
  const len = Math.hypot(dx, dy);
  const ux = dx / len, uy = dy / len;
  const a = [n.x + ux * (R + 10), n.y + uy * (R + 10)];
  const b = [C.x - ux * (C.r + 4), C.y - uy * (C.r + 4)];
  const [p, q] = n.out ? [b, a] : [a, b];
  return `M${p[0].toFixed(1)} ${p[1].toFixed(1)} L${q[0].toFixed(1)} ${q[1].toFixed(1)}`;
}

function nodeValues(n: HubNode, l: LiveSnapshot | null, s: EnergySummary | null, isLive: boolean): { big?: Fmt; lines: string[] } {
  const e = s?.energy;
  if (n.id === 'grid' || n.id === 'battery') {
    const io = n.id === 'grid'
      ? [`Bezug ${join(energy(e?.gridImport))}`, `Einsp. ${join(energy(e?.gridExport))}`]
      : [`Laden ${join(energy(e?.batteryCharge))}`, `Entl. ${join(energy(e?.batteryDischarge))}`];
    return isLive ? { big: power(l ? n.live(l) : null), lines: io } : { lines: io };
  }
  const k = e ? n.kwh(s!) : null;
  const heat = n.id === 'heatpump' ? [`Wärme ${join(energy(e?.heatpumpHeat))}`] : [];
  return isLive ? { big: power(l ? n.live(l) : null), lines: [join(energy(k)), ...heat] } : { big: energy(k), lines: heat };
}

export function FlowHub({ live, summary, isLive, selected, onSelect }: Props) {
  const raw = Object.fromEntries(NODES.map((n) => [n.id, isLive ? (live ? n.live(live) : null) : summary ? n.kwh(summary) : null])) as Record<HubId, number | null>;
  const lines = hubLines(raw, isLive ? { min: 2, max: 10, ref: 5000, threshold: 20 } : { min: 2, max: 10, ref: 0, threshold: 0.05 });
  const k = summary?.kpi;
  const houseBig = isLive ? power(live?.power.house) : energy(summary?.energy.house);

  const aria = NODES.map((n) => `${n.label} ${isLive ? join(power(raw[n.id])) : join(energy(raw[n.id]))}`).join(', ');

  return (
    <div className="alt-flow">
      <svg className="flow hub" viewBox="0 0 380 404" role="group" aria-label="Haus im Zentrum">
        {/* Leitungen (Grafik mit Textalternative) */}
        <g role="img" aria-label={`Haus ${join(houseBig)} – ${aria}`}>
          {NODES.map((n) => {
            const ln = lines[n.id];
            const d = linePath(n);
            const v = ln.value ?? 0;
            return (
              <g key={n.id} className={`link ${n.heat ? 'heat' : 'elec'}${ln.stale ? ' stale' : ''}`}>
                <path d={d} className="track" strokeWidth={ln.width + 4} />
                {ln.active && isLive && (
                  <path d={d} className={`dots${v < 0 ? ' rev' : ''}`} strokeWidth={ln.width} style={{ animationDuration: `${flowDuration(v)}s` }} />
                )}
                {ln.active && !isLive && <path d={d} className="solid" strokeWidth={ln.width} />}
              </g>
            );
          })}
        </g>

        {/* Haus */}
        <g className={`node house-hub${selected === 'house' ? ' sel' : ''}`} style={{ color: 'var(--text)' }} aria-label="Haus – Details" {...press(() => onSelect('house'))}>
          <circle cx={C.x} cy={C.y} r={C.r} className="node-bg" />
          <Home x={C.x - 12} y={C.y - 44} size={24} />
          <text x={C.x} y={C.y - 4} textAnchor="middle" className="fl">Haus</text>
          <Value f={houseBig} x={C.x} y={C.y + 20} anchor="middle" big />
          {isLive && <text x={C.x} y={C.y + 38} textAnchor="middle" className="fv fv-sm">{join(energy(summary?.energy.house))}</text>}
        </g>

        {/* Knoten */}
        {NODES.map((n) => {
          const v = nodeValues(n, live, summary, isLive);
          const soc = !isLive ? null : n.id === 'battery' ? live?.battery.soc : n.id === 'car' ? live?.car.soc : null;
          const circ = 2 * Math.PI * (R + 4.5);
          const { x, y, anchor } = n.text;
          let ly = y + (v.big ? 20 : 3);
          return (
            <g key={n.id} className={`node${selected === n.id ? ' sel' : ''}${lines[n.id].stale ? ' stale' : ''}`} style={{ color: n.color }} aria-label={`${n.label} – Details`} {...press(() => onSelect(n.id))}>
              <circle cx={n.x} cy={n.y} r={R + 10} className="hit" />
              <circle cx={n.x} cy={n.y} r={R} className="node-bg" />
              {soc !== null && soc !== undefined && (
                <>
                  <circle cx={n.x} cy={n.y} r={R + 4.5} className="soc-track" />
                  <circle cx={n.x} cy={n.y} r={R + 4.5} className="soc" strokeDasharray={`${(circ * Math.max(0, Math.min(100, soc))) / 100} ${circ}`} transform={`rotate(-90 ${n.x} ${n.y})`} />
                </>
              )}
              <n.Icon x={n.x - 11} y={n.y - 11} size={22} />
              <text x={x} y={y} textAnchor={anchor} className="fl">
                {isLive ? liveLabel(n, live) : n.label}
                {soc !== null && soc !== undefined ? ` ${Math.round(soc)} %` : ''}
              </text>
              {v.big && <Value f={v.big} x={x} y={ly} anchor={anchor} big />}
              {v.lines.map((t) => (
                <text key={t} x={x} y={(ly += 16)} textAnchor={anchor} className="fv fv-sm">{t}</text>
              ))}
            </g>
          );
        })}
      </svg>

      <dl className="kpis kpis-3">
        <Kpi label="Autarkie" value={{ value: pct(k?.selfSufficiency), unit: '' }} />
        <Kpi label="Eigenverbrauch" value={{ value: pct(k?.selfConsumption), unit: '' }} />
        <Kpi label="Arbeitszahl" value={{ value: num(k?.cop, 1), unit: '' }} hint="Wärmepumpe" />
      </dl>
    </div>
  );
}
