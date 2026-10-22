import type { EnergySummary, LiveSnapshot, Period } from '@smarthome/shared';
import type { ComponentType, SVGProps } from 'react';
import { energy, num, power, type Fmt } from '../format';
import { Battery, Car, HeatPump, Panel, Pylon } from './Icons';

export type NodeId = 'pv' | 'battery' | 'grid' | 'heatpump' | 'car' | 'house';

interface Props {
  live: LiveSnapshot | null;
  summary: EnergySummary | null;
  period: Period;
  selected: NodeId | null;
  onSelect: (id: NodeId) => void;
}

// Geometrie (viewBox 360 × 474)
const R = 25;
const HOUSE = { apexX: 180, apexY: 98, eaveY: 170, left: 98, right: 262, floor: 250, bottom: 330 };

interface NodeDef {
  id: Exclude<NodeId, 'house'>;
  label: string;
  x: number;
  y: number;
  color: string;
  Icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
  /** Pfad Knoten → Haus (Quellen) bzw. Haus → Knoten (Verbraucher) */
  path: string;
  /** Wo stehen die Werte */
  text: { x: number; y: number; anchor: 'start' | 'middle' | 'end' };
}

const ROOMS = [
  { id: 'Gallerie', name: 'Galerie', y: 212 },
  { id: 'Wohnzimmer', name: 'Wohnzimmer', y: 284 },
];

const NODES: NodeDef[] = [
  {
    id: 'pv', label: 'Photovoltaik', x: 180, y: 36, color: 'var(--c-sun)', Icon: Panel,
    path: `M180 ${36 + R} L180 ${HOUSE.apexY - 6}`, text: { x: 216, y: 30, anchor: 'start' },
  },
  {
    id: 'battery', label: 'Akku', x: 44, y: 207, color: 'var(--c-battery)', Icon: Battery,
    path: `M${44 + R} 207 L${HOUSE.left - 4} 207`, text: { x: 44, y: 252, anchor: 'middle' },
  },
  {
    id: 'grid', label: 'Netz', x: 316, y: 207, color: 'var(--c-grid)', Icon: Pylon,
    path: `M${316 - R} 207 L${HOUSE.right + 4} 207`, text: { x: 316, y: 252, anchor: 'middle' },
  },
  {
    id: 'heatpump', label: 'Wärmepumpe', x: 64, y: 384, color: 'var(--c-heat)', Icon: HeatPump,
    path: `M132 ${HOUSE.bottom + 4} L132 384 L${64 + R} 384`, text: { x: 64, y: 429, anchor: 'middle' },
  },
  {
    id: 'car', label: 'Auto', x: 296, y: 384, color: 'var(--c-car)', Icon: Car,
    path: `M228 ${HOUSE.bottom + 4} L228 384 L${296 - R} 384`, text: { x: 296, y: 429, anchor: 'middle' },
  },
];

/** Signierte Live-Leistung je Knoten: > 0 = Fluss in Pfadrichtung. */
function livePower(id: NodeDef['id'], l: LiveSnapshot | null): number | null {
  if (!l) return null;
  switch (id) {
    case 'pv': return l.power.pv;
    case 'battery': return l.power.battery;
    case 'grid': return l.power.grid;
    case 'heatpump': return l.power.heatpump;
    case 'car': return l.power.wallbox;
  }
}

/** Energie im Zeitraum, Haupt- und ggf. Gegenrichtung. */
function periodEnergy(id: NodeDef['id'], s: EnergySummary | null): { main: number | null; secondary?: { label: string; v: number } } {
  if (!s) return { main: null };
  const e = s.energy;
  switch (id) {
    case 'pv': return { main: e.pv };
    case 'battery': return { main: e.batteryDischarge, secondary: { label: 'geladen', v: e.batteryCharge } };
    case 'grid': return { main: e.gridImport, secondary: { label: 'eingesp.', v: e.gridExport } };
    case 'heatpump': return { main: e.heatpump };
    case 'car': return { main: e.wallbox };
  }
}

function flowDuration(w: number): number {
  // 50 W → ~3,2 s pro Zyklus, 10 kW → ~0,6 s
  const x = Math.log10(Math.max(50, Math.abs(w)));
  return Math.max(0.5, 3.2 - (x - 1.7) * 1.1);
}

function strokeWidth(share: number): number {
  return 2.5 + Math.sqrt(Math.max(0, Math.min(1, share))) * 7;
}

function Value({ f, x, y, anchor, big }: { f: Fmt; x: number; y: number; anchor: string; big?: boolean }) {
  return (
    <text x={x} y={y} textAnchor={anchor as 'start'} className={big ? 'fv fv-big' : 'fv'}>
      {f.value}
      {f.unit && <tspan className="fv-unit" dx="3">{f.unit}</tspan>}
    </text>
  );
}

export function EnergyFlow({ live, summary, period, selected, onSelect }: Props) {
  const isLive = period === 'today';
  const houseKwh = summary?.energy.house ?? null;
  const maxKwh = Math.max(1, ...NODES.map((n) => periodEnergy(n.id, summary).main ?? 0));

  return (
    <svg className="flow" viewBox="0 0 360 474" role="group" aria-label="Energiefluss im Haus">
      {/* Leitungen */}
      {NODES.map((n) => {
        const p = isLive ? livePower(n.id, live) : null;
        const kwh = periodEnergy(n.id, summary).main ?? 0;
        const active = isLive ? p !== null && Math.abs(p) >= 20 : kwh > 0.05;
        const w = isLive ? strokeWidth(Math.abs(p ?? 0) / 8000) : strokeWidth(kwh / maxKwh);
        return (
          <g key={n.id} style={{ color: n.color }}>
            <path d={n.path} className="track" strokeWidth={w + 4} />
            {active && isLive && (
              <path
                d={n.path}
                className={`dots${(p ?? 0) < 0 ? ' rev' : ''}`}
                strokeWidth={w}
                style={{ animationDuration: `${flowDuration(p ?? 0)}s` }}
              />
            )}
            {active && !isLive && <path d={n.path} className="solid" strokeWidth={w} />}
          </g>
        );
      })}

      {/* Haus */}
      <g
        className={`house${selected === 'house' ? ' sel' : ''}`}
        onClick={() => onSelect('house')}
        role="button"
        tabIndex={0}
        aria-label="Haus – Details"
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect('house')}
      >
        <path
          className="house-body"
          d={`M${HOUSE.left} ${HOUSE.eaveY} L${HOUSE.apexX} ${HOUSE.apexY} L${HOUSE.right} ${HOUSE.eaveY} L${HOUSE.right} ${HOUSE.bottom} L${HOUSE.left} ${HOUSE.bottom} Z`}
        />
        <path className="house-roof" d={`M${HOUSE.left - 18} ${HOUSE.eaveY + 13} L${HOUSE.apexX} ${HOUSE.apexY - 4} L${HOUSE.right + 18} ${HOUSE.eaveY + 13}`} />
        <line className="house-floor" x1={HOUSE.left} x2={HOUSE.right} y1={HOUSE.floor} y2={HOUSE.floor} />
        <text x="180" y="136" textAnchor="middle" className="fl">Verbrauch</text>
        <Value f={isLive ? power(live?.power.house) : energy(houseKwh)} x={180} y={162} anchor="middle" big />
        {isLive && <Value f={energy(houseKwh)} x={180} y={188} anchor="middle" />}
        {ROOMS.map((r) => {
          const c = live?.rooms.find((x) => x.id === r.id)?.climate;
          return (
            <g key={r.id}>
              <text x="180" y={r.y} textAnchor="middle" className="fl">{r.name}</text>
              <text x="180" y={r.y + 22} textAnchor="middle" className="room">
                <tspan className="room-t">{num(c?.temp, 1, '°')}</tspan>
                <tspan dx="8" className="room-s">{num(c?.hum, 0, '%')}</tspan>
                <tspan dx="8" className={`room-s${(c?.co2 ?? 0) > 1000 ? ' warn' : ''}`}>{num(c?.co2, 0, 'ppm')}</tspan>
              </text>
            </g>
          );
        })}
      </g>

      {/* Knoten */}
      {NODES.map((n) => {
        const p = livePower(n.id, live);
        const pe = periodEnergy(n.id, summary);
        const soc = n.id === 'battery' ? live?.battery.soc : n.id === 'car' ? live?.car.soc : null;
        const circ = 2 * Math.PI * (R + 5);
        const { x, y, anchor } = n.text;
        let lineY = y;
        return (
          <g
            key={n.id}
            className={`node${selected === n.id ? ' sel' : ''}`}
            style={{ color: n.color }}
            onClick={() => onSelect(n.id)}
            role="button"
            tabIndex={0}
            aria-label={`${n.label} – Details`}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(n.id)}
          >
            <circle cx={n.x} cy={n.y} r={R + 14} className="hit" />
            <circle cx={n.x} cy={n.y} r={R} className="node-bg" />
            {soc !== null && soc !== undefined && (
              <>
                <circle cx={n.x} cy={n.y} r={R + 5} className="soc-track" />
                <circle
                  cx={n.x} cy={n.y} r={R + 5} className="soc"
                  strokeDasharray={`${(circ * Math.max(0, Math.min(100, soc))) / 100} ${circ}`}
                  transform={`rotate(-90 ${n.x} ${n.y})`}
                />
              </>
            )}
            <n.Icon x={n.x - 13} y={n.y - 13} size={26} />
            <text x={x} y={lineY} textAnchor={anchor} className="fl">
              {n.label}
              {soc !== null && soc !== undefined ? ` ${Math.round(soc)} %` : ''}
            </text>
            {isLive ? (
              <>
                <Value f={power(p)} x={x} y={(lineY += 22)} anchor={anchor} big />
                <Value f={energy(pe.main)} x={x} y={(lineY += 18)} anchor={anchor} />
              </>
            ) : (
              <>
                <Value f={energy(pe.main)} x={x} y={(lineY += 22)} anchor={anchor} big />
                {pe.secondary && (
                  <text x={x} y={(lineY += 18)} textAnchor={anchor} className="fv fv-sm">
                    {energy(pe.secondary.v).value} {energy(pe.secondary.v).unit} {pe.secondary.label}
                  </text>
                )}
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}
