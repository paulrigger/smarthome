import type { EnergySummary, LiveSnapshot, Period } from '@smarthome/shared';
import type { ComponentType, KeyboardEvent, SVGProps } from 'react';
import { energy, num, power, type Fmt } from '../format';
import { Battery, Car, HeatPump, Panel, Pylon } from './Icons';

export type NodeId = 'pvRoof' | 'pvCarport' | 'battery' | 'grid' | 'heatpump' | 'car' | 'house' | 'carport';

interface Props {
  live: LiveSnapshot | null;
  summary: EnergySummary | null;
  period: Period;
  selected: NodeId | null;
  onSelect: (id: NodeId) => void;
}

/*
 * Topologie (viewBox 380 × 452):
 *
 *   PV Dach            PV Carport
 *     │                    │
 *    /‾\   ◄── Bus ───────┼────────┐   Carport (Dach mit Modulen)
 *   │Haus│            Akku │      Auto
 *    ‾‾‾
 *   WP ⟲ Wärme   Netz
 */
const R = 22;
const H = { left: 22, right: 165, apexX: 93.5, apexY: 66, eave: 122, floor: 212, bottom: 296 };
const BUS_Y = 175;
const CP = { left: 200, right: 368, roofY: 112, ground: 318 };

type Icon = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

interface NodeDef {
  id: Exclude<NodeId, 'house' | 'carport'>;
  label: string;
  x: number;
  y: number;
  color: string;
  Icon: Icon;
  text: { x: number; y: number; anchor: 'start' | 'middle' | 'end' };
}

const NODES: NodeDef[] = [
  { id: 'pvRoof', label: 'PV Dach', x: H.apexX, y: 30, color: 'var(--c-sun)', Icon: Panel, text: { x: H.apexX + 30, y: 22, anchor: 'start' } },
  { id: 'pvCarport', label: 'PV Carport', x: 262, y: 30, color: 'var(--c-sun)', Icon: Panel, text: { x: 292, y: 22, anchor: 'start' } },
  { id: 'battery', label: 'Akku', x: 230, y: 232, color: 'var(--c-battery)', Icon: Battery, text: { x: 230, y: 274, anchor: 'middle' } },
  { id: 'car', label: 'Auto', x: 330, y: 232, color: 'var(--c-car)', Icon: Car, text: { x: 330, y: 274, anchor: 'middle' } },
  { id: 'heatpump', label: 'Wärmepumpe', x: 42, y: 360, color: 'var(--c-heat)', Icon: HeatPump, text: { x: 42, y: 400, anchor: 'middle' } },
  { id: 'grid', label: 'Netz', x: 150, y: 360, color: 'var(--c-grid)', Icon: Pylon, text: { x: 150, y: 400, anchor: 'middle' } },
];

interface LinkDef {
  id: string;
  path: string; // positive Werte fließen in Pfadrichtung
  color: string;
  heat?: boolean;
  live: (l: LiveSnapshot) => number | null;
  kwh: (s: EnergySummary) => number;
}

const LINKS: LinkDef[] = [
  { id: 'pvRoof', path: `M${H.apexX} ${30 + R} L${H.apexX} ${H.apexY - 8}`, color: 'var(--c-sun)', live: (l) => l.power.pvRoof, kwh: (s) => s.energy.pvRoof },
  { id: 'pvCarport', path: `M262 ${30 + R} L262 ${BUS_Y}`, color: 'var(--c-sun)', live: (l) => l.power.pvCarport, kwh: (s) => s.energy.pvCarport },
  { id: 'battery', path: `M230 ${232 - R} L230 ${BUS_Y}`, color: 'var(--c-battery)', live: (l) => l.power.battery, kwh: (s) => s.energy.batteryDischarge + s.energy.batteryCharge },
  { id: 'car', path: `M330 ${BUS_Y} L330 ${232 - R}`, color: 'var(--c-car)', live: (l) => l.power.wallbox, kwh: (s) => s.energy.wallbox },
  {
    id: 'carport', path: `M${CP.left} ${BUS_Y} L${H.right + 3} ${BUS_Y}`, color: 'var(--text)',
    live: (l) => (l.power.pvCarport === null ? null : (l.power.pvCarport ?? 0) + (l.power.battery ?? 0) - (l.power.wallbox ?? 0)),
    kwh: (s) => Math.abs(s.energy.pvCarport + s.energy.batteryDischarge - s.energy.batteryCharge - s.energy.wallbox),
  },
  { id: 'heatpump', path: `M42 ${H.bottom + 3} L42 ${360 - R}`, color: 'var(--c-heat)', live: (l) => l.power.heatpump, kwh: (s) => s.energy.heatpump },
  { id: 'heat', path: `M${42 + R} 360 L100 360 L100 ${H.bottom + 3}`, color: 'var(--c-warmth)', heat: true, live: (l) => l.heatpump.heatOutput, kwh: (s) => s.energy.heatpumpHeat },
  { id: 'grid', path: `M150 ${360 - R} L150 ${H.bottom + 3}`, color: 'var(--c-grid)', live: (l) => l.power.grid, kwh: (s) => s.energy.gridImport + s.energy.gridExport },
];

function flowDuration(w: number): number {
  const x = Math.log10(Math.max(50, Math.abs(w)));
  return Math.max(0.5, 3.2 - (x - 1.7) * 1.1);
}
const strokeWidth = (share: number) => 2.5 + Math.sqrt(Math.max(0, Math.min(1, share))) * 6.5;

function Value({ f, x, y, anchor, big, className = '' }: { f: Fmt; x: number; y: number; anchor: string; big?: boolean; className?: string }) {
  return (
    <text x={x} y={y} textAnchor={anchor as 'start'} className={`${big ? 'fv fv-big' : 'fv'} ${className}`}>
      {f.value}
      {f.unit && <tspan className="fv-unit" dx="2">{f.unit}</tspan>}
    </text>
  );
}

const press = (fn: () => void) => ({
  onClick: fn,
  role: 'button',
  tabIndex: 0,
  onKeyDown: (e: KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), fn()),
});

/** Werte unter einem Knoten: Zeile 1 Name, Zeile 2 groß, Zeile 3 klein. */
function nodeValues(id: NodeDef['id'], l: LiveSnapshot | null, s: EnergySummary | null, isLive: boolean): { big: Fmt; small?: Fmt; note?: string } {
  const e = s?.energy;
  switch (id) {
    case 'pvRoof': return isLive ? { big: power(l?.power.pvRoof), small: energy(e?.pvRoof) } : { big: energy(e?.pvRoof) };
    case 'pvCarport': return isLive ? { big: power(l?.power.pvCarport), small: energy(e?.pvCarport) } : { big: energy(e?.pvCarport) };
    case 'battery': {
      if (!isLive) return { big: energy(e?.batteryDischarge), note: e ? `${energy(e.batteryCharge).value} ${energy(e.batteryCharge).unit} geladen` : undefined };
      const b = l?.power.battery ?? null;
      return { big: power(b), note: b === null || Math.abs(b) < 20 ? 'Standby' : b < 0 ? 'lädt' : 'entlädt' };
    }
    case 'car': return isLive ? { big: power(l?.power.wallbox), small: energy(e?.wallbox) } : { big: energy(e?.wallbox) };
    case 'heatpump': return isLive ? { big: power(l?.power.heatpump), small: energy(e?.heatpump) } : { big: energy(e?.heatpump) };
    case 'grid': {
      if (!isLive) return { big: energy(e?.gridImport), note: e ? `${energy(e.gridExport).value} ${energy(e.gridExport).unit} eingesp.` : undefined };
      const g = l?.power.grid ?? null;
      return { big: power(g), note: g === null || Math.abs(g) < 20 ? 'ausgeglichen' : g < 0 ? 'Einspeisung' : 'Bezug' };
    }
  }
}

export function EnergyFlow({ live, summary, period, selected, onSelect }: Props) {
  const isLive = period === 'today';
  const maxKwh = Math.max(1, ...LINKS.map((k) => (summary ? k.kwh(summary) : 0)));
  const roomOf = (id: string) => live?.rooms.find((r) => r.id === id)?.climate;

  return (
    <svg className="flow" viewBox="0 0 380 452" role="group" aria-label="Energiefluss Haus und Carport">
      {/* Carport */}
      <g className={`carport${selected === 'carport' ? ' sel' : ''}`} aria-label="Carport – Details" {...press(() => onSelect('carport'))}>
        <rect x={CP.left - 6} y={CP.roofY - 14} width={CP.right - CP.left + 14} height={CP.ground - CP.roofY + 14} className="hit" />
        <rect x={CP.left} y={CP.roofY} width={CP.right - CP.left} height={CP.ground - CP.roofY} className="carport-body" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <path key={i} className="panel" d={`M${CP.left + 6 + i * 26} ${CP.roofY - 3} l6 -10 h20 l-6 10 z`} />
        ))}
        <line className="carport-roof" x1={CP.left - 6} x2={CP.right + 8} y1={CP.roofY} y2={CP.roofY} />
        <line className="carport-post" x1={CP.left + 2} x2={CP.left + 2} y1={CP.roofY} y2={CP.ground} />
        <line className="carport-post" x1={CP.right - 2} x2={CP.right - 2} y1={CP.roofY} y2={CP.ground} />
        <line className="ground" x1={CP.left - 10} x2={CP.right + 12} y1={CP.ground} y2={CP.ground} />
        <text x={(CP.left + CP.right) / 2} y={CP.ground + 18} textAnchor="middle" className="fl">Carport</text>
      </g>

      {/* Sammelschiene im Carport */}
      <line className="bus" x1={CP.left} x2={334} y1={BUS_Y} y2={BUS_Y} />

      {/* Leitungen */}
      {LINKS.map((k) => {
        const p = isLive && live ? k.live(live) : null;
        const kwh = summary ? k.kwh(summary) : 0;
        const active = isLive ? p !== null && Math.abs(p) >= 20 : kwh > 0.05;
        const w = isLive ? strokeWidth(Math.abs(p ?? 0) / 8000) : strokeWidth(kwh / maxKwh);
        return (
          <g key={k.id} style={{ color: k.color }}>
            <path d={k.path} className="track" strokeWidth={w + 4} />
            {active && isLive && (
              <path d={k.path} className={`dots${k.heat ? ' heat' : ''}${(p ?? 0) < 0 ? ' rev' : ''}`} strokeWidth={w} style={{ animationDuration: `${flowDuration(p ?? 0)}s` }} />
            )}
            {active && !isLive && <path d={k.path} className="solid" strokeWidth={w} />}
          </g>
        );
      })}

      {/* Wärme-Beschriftung an der Rückleitung */}
      <g className="heat-label">
        <text x={71} y={316} textAnchor="middle" className="fl warmth">Wärme</text>
        <Value f={isLive ? power(live?.heatpump.heatOutput) : energy(summary?.energy.heatpumpHeat)} x={71} y={331} anchor="middle" className="warmth" />
      </g>

      {/* Haus */}
      <g className={`house${selected === 'house' ? ' sel' : ''}`} aria-label="Haus – Details" {...press(() => onSelect('house'))}>
        <path className="house-body" d={`M${H.left} ${H.eave} L${H.apexX} ${H.apexY} L${H.right} ${H.eave} L${H.right} ${H.bottom} L${H.left} ${H.bottom} Z`} />
        <path className="house-roof" d={`M${H.left - 12} ${H.eave + 9} L${H.apexX} ${H.apexY - 4} L${H.right + 12} ${H.eave + 9}`} />
        <line className="house-floor" x1={H.left} x2={H.right} y1={H.floor} y2={H.floor} />
        <text x={H.apexX} y={104} textAnchor="middle" className="fl">Verbrauch</text>
        <Value f={isLive ? power(live?.power.house) : energy(summary?.energy.house)} x={H.apexX} y={132} anchor="middle" big />
        {isLive && <Value f={energy(summary?.energy.house)} x={H.apexX} y={151} anchor="middle" />}
        {[
          { id: 'Gallerie', name: 'Galerie', y: 176 },
          { id: 'Wohnzimmer', name: 'Wohnzimmer', y: 240 },
        ].map((r) => {
          const c = roomOf(r.id);
          return (
            <g key={r.id}>
              <text x={H.apexX} y={r.y} textAnchor="middle" className="fl">{r.name}</text>
              <text x={H.apexX} y={r.y + 22} textAnchor="middle">
                <tspan className="room-t">{num(c?.temp, 1, '°')}</tspan>
                <tspan dx="6" className="room-s">{num(c?.hum, 0, '%')}</tspan>
                <tspan dx="5" className={`room-s${(c?.co2 ?? 0) > 1000 ? ' warn' : ''}`}>{num(c?.co2, 0, 'ppm')}</tspan>
              </text>
            </g>
          );
        })}
      </g>

      {/* Knoten */}
      {NODES.map((n) => {
        const v = nodeValues(n.id, live, summary, isLive);
        const soc = n.id === 'battery' ? live?.battery.soc : n.id === 'car' ? live?.car.soc : null;
        const circ = 2 * Math.PI * (R + 5);
        const { x, y, anchor } = n.text;
        return (
          <g key={n.id} className={`node${selected === n.id ? ' sel' : ''}`} style={{ color: n.color }} aria-label={`${n.label} – Details`} {...press(() => onSelect(n.id))}>
            <circle cx={n.x} cy={n.y} r={R + 14} className="hit" />
            <circle cx={n.x} cy={n.y} r={R} className="node-bg" />
            {soc !== null && soc !== undefined && (
              <>
                <circle cx={n.x} cy={n.y} r={R + 5} className="soc-track" />
                <circle cx={n.x} cy={n.y} r={R + 5} className="soc" strokeDasharray={`${(circ * Math.max(0, Math.min(100, soc))) / 100} ${circ}`} transform={`rotate(-90 ${n.x} ${n.y})`} />
              </>
            )}
            <n.Icon x={n.x - 12} y={n.y - 12} size={24} />
            <text x={x} y={y} textAnchor={anchor} className="fl">
              {n.label}
              {soc !== null && soc !== undefined ? ` ${Math.round(soc)} %` : ''}
            </text>
            <Value f={v.big} x={x} y={y + 21} anchor={anchor} big />
            {v.small && <Value f={v.small} x={x} y={y + 38} anchor={anchor} />}
            {v.note && <text x={x} y={y + 38} textAnchor={anchor} className="fv fv-sm">{v.note}</text>}
          </g>
        );
      })}
    </svg>
  );
}
