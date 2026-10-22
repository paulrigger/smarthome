import type { EnergySummary, LiveSnapshot, Period } from '@smarthome/shared';
import type { ComponentType, KeyboardEvent, SVGProps } from 'react';
import { energy, join, num, power, type Fmt } from '../format';
import { Battery, Car, HeatPump, Panel, Pylon, Sun } from './Icons';

export type NodeId = 'pvRoof' | 'pvCarport' | 'solarThermal' | 'battery' | 'grid' | 'heatpump' | 'car' | 'house' | 'carport';

interface Props {
  live: LiveSnapshot | null;
  summary: EnergySummary | null;
  period: Period;
  selected: NodeId | null;
  onSelect: (id: NodeId) => void;
}

/*
 * Gebäudeschnitt (viewBox 380 × 462):
 *   Solarthermie (linke Dachseite) · PV Dach (rechte Dachseite) · PV Carport
 *   Haus + kleiner Carport-Anbau mit Sammelschiene
 *   Unter der Geländelinie: Wärmepumpe · Netz · Akku · Auto
 * Flusspunkte: Strom immer --flow-elec, Wärme immer --flow-heat.
 */
const R = 20;
const H = { left: 20, right: 196, apexX: 108, apexY: 78, eave: 134, floor: 214, bottom: 292 };
const CP = { left: H.right, right: 344, roofL: 226, roofR: 232 };
const GROUND = H.bottom;
const BUS_Y = 262;
const ROW_Y = 362; // Knotenreihe unter Gelände

const roofY = (x: number) => H.apexY + (Math.abs(x - H.apexX) / (H.apexX - H.left)) * (H.eave - H.apexY);
const carportRoofY = (x: number) => CP.roofL + ((x - CP.left) / (CP.right - CP.left)) * (CP.roofR - CP.roofL);

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
  { id: 'solarThermal', label: 'Solarthermie', x: 44, y: 34, color: 'var(--c-warmth)', Icon: Sun, text: { x: 70, y: 27, anchor: 'start' } },
  { id: 'pvRoof', label: 'PV Dach', x: 176, y: 34, color: 'var(--c-sun)', Icon: Panel, text: { x: 202, y: 27, anchor: 'start' } },
  { id: 'pvCarport', label: 'PV Carport', x: 290, y: 172, color: 'var(--c-sun)', Icon: Panel, text: { x: 316, y: 165, anchor: 'start' } },
  { id: 'heatpump', label: 'Wärmepumpe', x: 40, y: ROW_Y, color: 'var(--c-heat)', Icon: HeatPump, text: { x: 40, y: ROW_Y + 40, anchor: 'middle' } },
  { id: 'grid', label: 'Netz', x: 156, y: ROW_Y, color: 'var(--c-grid)', Icon: Pylon, text: { x: 156, y: ROW_Y + 40, anchor: 'middle' } },
  { id: 'battery', label: 'Akku', x: 250, y: ROW_Y, color: 'var(--c-battery)', Icon: Battery, text: { x: 250, y: ROW_Y + 40, anchor: 'middle' } },
  { id: 'car', label: 'Auto', x: 336, y: ROW_Y, color: 'var(--c-car)', Icon: Car, text: { x: 336, y: ROW_Y + 40, anchor: 'middle' } },
];

interface LinkDef {
  id: string;
  path: string; // positive Werte fließen in Pfadrichtung
  heat?: boolean;
  live: (l: LiveSnapshot) => number | null;
  kwh: (s: EnergySummary) => number;
}

const LINKS: LinkDef[] = [
  { id: 'solarThermal', heat: true, path: `M44 ${34 + R} L44 ${roofY(44) - 6}`, live: (l) => l.power.solarThermal, kwh: (s) => s.energy.solarThermal },
  { id: 'pvRoof', path: `M176 ${34 + R} L176 ${roofY(176) - 6}`, live: (l) => l.power.pvRoof, kwh: (s) => s.energy.pvRoof },
  { id: 'pvCarport', path: `M290 ${172 + R} L290 ${BUS_Y}`, live: (l) => l.power.pvCarport, kwh: (s) => s.energy.pvCarport },
  { id: 'battery', path: `M250 ${ROW_Y - R - 4} L250 ${BUS_Y}`, live: (l) => l.power.battery, kwh: (s) => s.energy.batteryDischarge + s.energy.batteryCharge },
  { id: 'car', path: `M336 ${BUS_Y} L336 ${ROW_Y - R - 4}`, live: (l) => l.power.wallbox, kwh: (s) => s.energy.wallbox },
  {
    id: 'carport', path: `M250 ${BUS_Y} L${H.right + 2} ${BUS_Y}`,
    live: (l) => (l.power.pvCarport === null ? null : (l.power.pvCarport ?? 0) + (l.power.battery ?? 0) - (l.power.wallbox ?? 0)),
    kwh: (s) => Math.abs(s.energy.pvCarport + s.energy.batteryDischarge - s.energy.batteryCharge - s.energy.wallbox),
  },
  { id: 'heatpump', path: `M40 ${GROUND + 2} L40 ${ROW_Y - R}`, live: (l) => l.power.heatpump, kwh: (s) => s.energy.heatpump },
  { id: 'heat', heat: true, path: `M${40 + R} ${ROW_Y} L100 ${ROW_Y} L100 ${GROUND + 2}`, live: (l) => l.heatpump.heatOutput, kwh: (s) => s.energy.heatpumpHeat },
  { id: 'grid', path: `M156 ${ROW_Y - R} L156 ${GROUND + 2}`, live: (l) => l.power.grid, kwh: (s) => s.energy.gridImport + s.energy.gridExport },
];

function flowDuration(w: number): number {
  const x = Math.log10(Math.max(50, Math.abs(w)));
  return Math.max(0.5, 3.2 - (x - 1.7) * 1.1);
}
const strokeWidth = (share: number) => 2.5 + Math.sqrt(Math.max(0, Math.min(1, share))) * 6;

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

/** Werte unter/neben einem Knoten: optional große Zahl, dann kleine Zeilen. */
function nodeValues(id: NodeDef['id'], l: LiveSnapshot | null, s: EnergySummary | null, isLive: boolean): { big?: Fmt; lines: string[] } {
  const e = s?.energy;
  const both = (p: number | null | undefined, k: number | null | undefined) =>
    isLive ? { big: power(p), lines: [join(energy(k))] } : { big: energy(k), lines: [] };
  switch (id) {
    case 'solarThermal': return both(l?.power.solarThermal, e?.solarThermal);
    case 'pvRoof': return both(l?.power.pvRoof, e?.pvRoof);
    case 'pvCarport': return both(l?.power.pvCarport, e?.pvCarport);
    case 'car': return both(l?.power.wallbox, e?.wallbox);
    case 'heatpump': return both(l?.power.heatpump, e?.heatpump);
    case 'battery': {
      const io = [`Laden ${join(energy(e?.batteryCharge))}`, `Entl. ${join(energy(e?.batteryDischarge))}`];
      if (!isLive) return { lines: io };
      return { big: power(l?.power.battery), lines: io };
    }
    case 'grid': {
      const io = [`Bezug ${join(energy(e?.gridImport))}`, `Einsp. ${join(energy(e?.gridExport))}`];
      if (!isLive) return { lines: io };
      return { big: power(l?.power.grid), lines: io };
    }
  }
}

/** Modulreihe parallel zu einer Dachlinie, nach außen versetzt. */
function Modules({ x1, y1, x2, y2, n, className }: { x1: number; y1: number; x2: number; y2: number; n: number; className: string }) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const ux = dx / len, uy = dy / len;
  let nx = uy, ny = -ux;
  if (ny > 0) { nx = -nx; ny = -ny; }
  const gap = 2.5, depth = 6, off = 3;
  const w = (len - gap * (n - 1)) / n;
  return (
    <g className={className}>
      {Array.from({ length: n }, (_, i) => {
        const sx = x1 + ux * i * (w + gap) + nx * off, sy = y1 + uy * i * (w + gap) + ny * off;
        const ex = sx + ux * w, ey = sy + uy * w;
        return <path key={i} d={`M${sx} ${sy} L${ex} ${ey} L${ex + nx * depth} ${ey + ny * depth} L${sx + nx * depth} ${sy + ny * depth} Z`} />;
      })}
    </g>
  );
}

export function EnergyFlow({ live, summary, period, selected, onSelect }: Props) {
  const isLive = period === 'today';
  const maxKwh = Math.max(1, ...LINKS.map((k) => (summary ? k.kwh(summary) : 0)));
  const room = (id: string) => live?.rooms.find((r) => r.id === id)?.climate;

  return (
    <svg className="flow" viewBox="0 0 380 462" role="group" aria-label="Energiefluss Haus und Carport">
      <line className="ground" x1={6} x2={374} y1={GROUND} y2={GROUND} />

      {/* Carport */}
      <g className={`bldg carport${selected === 'carport' ? ' sel' : ''}`} aria-label="Carport – Details" {...press(() => onSelect('carport'))}>
        <path className="bldg-body open" d={`M${CP.left} ${CP.roofL} L${CP.right} ${CP.roofR} L${CP.right} ${GROUND} L${CP.left} ${GROUND} Z`} />
        <path className="bldg-line" d={`M${CP.left} ${CP.roofL} L${CP.right + 6} ${carportRoofY(CP.right + 6)}`} />
        <path className="bldg-line thin" d={`M${CP.right - 2} ${CP.roofR} L${CP.right - 2} ${GROUND}`} />
        <Modules x1={CP.left + 10} y1={carportRoofY(CP.left + 10)} x2={CP.right - 4} y2={carportRoofY(CP.right - 4)} n={5} className="modules pv" />
      </g>

      {/* Haus */}
      <g className={`bldg house${selected === 'house' ? ' sel' : ''}`} aria-label="Haus – Details" {...press(() => onSelect('house'))}>
        <path className="bldg-body" d={`M${H.left} ${H.eave} L${H.apexX} ${H.apexY} L${H.right} ${H.eave} L${H.right} ${H.bottom} L${H.left} ${H.bottom} Z`} />
        <path className="bldg-line" d={`M${H.left - 10} ${roofY(H.left - 10)} L${H.apexX} ${H.apexY} L${H.right + 10} ${roofY(H.right + 10)}`} />
        <path className="bldg-line thin" d={`M${H.left} ${H.eave} V${H.bottom} M${H.right} ${H.eave} V${H.bottom}`} />
        <line className="bldg-floor" x1={H.left} x2={H.right} y1={H.floor} y2={H.floor} />
        <Modules x1={28} y1={roofY(28)} x2={86} y2={roofY(86)} n={3} className="modules st" />
        <Modules x1={132} y1={roofY(132)} x2={192} y2={roofY(192)} n={4} className="modules pv" />
        {/* Raumklima: oben Galerie, unten Wohnzimmer */}
        {[
          { id: 'Gallerie', y: 182 },
          { id: 'Wohnzimmer', y: 260 },
        ].map((r) => {
          const c = room(r.id);
          return (
            <text key={r.id} x={H.apexX} y={r.y} textAnchor="middle">
              <tspan className="room-t">{num(c?.temp, 1, '°')}</tspan>
              <tspan dx="8" className="room-s">{num(c?.hum, 0, '%')}</tspan>
              <tspan dx="7" className={`room-s${(c?.co2 ?? 0) > 1000 ? ' warn' : ''}`}>{num(c?.co2, 0, 'ppm')}</tspan>
            </text>
          );
        })}
      </g>

      {/* Sammelschiene Carport */}
      <line className="bus" x1={250} x2={336} y1={BUS_Y} y2={BUS_Y} />

      {/* Leitungen */}
      {LINKS.map((k) => {
        const p = isLive && live ? k.live(live) : null;
        const kwh = summary ? k.kwh(summary) : 0;
        const active = isLive ? p !== null && Math.abs(p) >= 20 : kwh > 0.05;
        const w = isLive ? strokeWidth(Math.abs(p ?? 0) / 8000) : strokeWidth(kwh / maxKwh);
        return (
          <g key={k.id} className={k.heat ? 'link heat' : 'link elec'}>
            <path d={k.path} className="track" strokeWidth={w + 4} />
            {active && isLive && (
              <path d={k.path} className={`dots${(p ?? 0) < 0 ? ' rev' : ''}`} strokeWidth={w} style={{ animationDuration: `${flowDuration(p ?? 0)}s` }} />
            )}
            {active && !isLive && <path d={k.path} className="solid" strokeWidth={w} />}
          </g>
        );
      })}

      {/* Wärme der WP zurück ins Haus: Leistung + Energie */}
      <g className="heat-label">
        {isLive && <Value f={power(live?.heatpump.heatOutput)} x={70} y={312} anchor="middle" className="warmth strong" />}
        <Value f={energy(summary?.energy.heatpumpHeat)} x={70} y={isLive ? 328 : 318} anchor="middle" className={isLive ? 'warmth' : 'warmth strong'} />
      </g>

      {/* Knoten */}
      {NODES.map((n) => {
        const v = nodeValues(n.id, live, summary, isLive);
        const soc = n.id === 'battery' ? live?.battery.soc : n.id === 'car' ? live?.car.soc : null;
        const circ = 2 * Math.PI * (R + 4.5);
        const { x, y, anchor } = n.text;
        let ly = y + (v.big ? 20 : 3);
        return (
          <g key={n.id} className={`node${selected === n.id ? ' sel' : ''}`} style={{ color: n.color }} aria-label={`${n.label} – Details`} {...press(() => onSelect(n.id))}>
            <circle cx={n.x} cy={n.y} r={R + 14} className="hit" />
            <circle cx={n.x} cy={n.y} r={R} className="node-bg" />
            {soc !== null && soc !== undefined && (
              <>
                <circle cx={n.x} cy={n.y} r={R + 4.5} className="soc-track" />
                <circle cx={n.x} cy={n.y} r={R + 4.5} className="soc" strokeDasharray={`${(circ * Math.max(0, Math.min(100, soc))) / 100} ${circ}`} transform={`rotate(-90 ${n.x} ${n.y})`} />
              </>
            )}
            <n.Icon x={n.x - 11} y={n.y - 11} size={22} />
            <text x={x} y={y} textAnchor={anchor} className="fl">
              {n.label}
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
  );
}
