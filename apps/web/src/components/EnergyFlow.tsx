import type { EnergySummary, LiveSnapshot, Period } from '@smarthome/shared';
import type { ComponentType, KeyboardEvent, SVGProps } from 'react';
import { energy, num, power, type Fmt } from '../format';
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
 * Ansicht als Gebäudeschnitt (viewBox 380 × 446):
 *   Solarthermie (linke Dachseite)   PV (rechte Dachseite)
 *   Haus mit zwei Geschossen, rechts angebaut ein niedriger Carport
 *   mit PV am Dach, Akku und Auto darunter. WP und Netzanschluss unter Geländelinie.
 */
const R = 20;
const H = { left: 20, right: 200, apexX: 110, apexY: 70, eave: 130, floor: 207, bottom: 300 };
const CP = { left: H.right, right: 364, roofL: 188, roofR: 198, ground: H.bottom };
const BUS_Y = 228;
const GROUND = H.bottom;

/** y auf der Dachlinie bei x (links bzw. rechts vom First) */
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
  { id: 'pvCarport', label: 'PV Carport', x: 290, y: 130, color: 'var(--c-sun)', Icon: Panel, text: { x: 316, y: 123, anchor: 'start' } },
  { id: 'battery', label: 'Akku', x: 246, y: 262, color: 'var(--c-battery)', Icon: Battery, text: { x: 246, y: 322, anchor: 'middle' } },
  { id: 'car', label: 'Auto', x: 328, y: 262, color: 'var(--c-car)', Icon: Car, text: { x: 328, y: 322, anchor: 'middle' } },
  { id: 'heatpump', label: 'Wärmepumpe', x: 52, y: 362, color: 'var(--c-heat)', Icon: HeatPump, text: { x: 52, y: 400, anchor: 'middle' } },
  { id: 'grid', label: 'Netz', x: 156, y: 362, color: 'var(--c-grid)', Icon: Pylon, text: { x: 156, y: 400, anchor: 'middle' } },
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
  { id: 'solarThermal', path: `M44 ${34 + R} L44 ${roofY(44) - 6}`, color: 'var(--c-warmth)', heat: true, live: (l) => l.power.solarThermal, kwh: (s) => s.energy.solarThermal },
  { id: 'pvRoof', path: `M176 ${34 + R} L176 ${roofY(176) - 6}`, color: 'var(--c-sun)', live: (l) => l.power.pvRoof, kwh: (s) => s.energy.pvRoof },
  { id: 'pvCarport', path: `M290 ${130 + R} L290 ${BUS_Y}`, color: 'var(--c-sun)', live: (l) => l.power.pvCarport, kwh: (s) => s.energy.pvCarport },
  { id: 'battery', path: `M246 ${262 - R} L246 ${BUS_Y}`, color: 'var(--c-battery)', live: (l) => l.power.battery, kwh: (s) => s.energy.batteryDischarge + s.energy.batteryCharge },
  { id: 'car', path: `M328 ${BUS_Y} L328 ${262 - R}`, color: 'var(--c-car)', live: (l) => l.power.wallbox, kwh: (s) => s.energy.wallbox },
  {
    id: 'carport', path: `M246 ${BUS_Y} L${H.right + 2} ${BUS_Y}`, color: 'var(--text)',
    live: (l) => (l.power.pvCarport === null ? null : (l.power.pvCarport ?? 0) + (l.power.battery ?? 0) - (l.power.wallbox ?? 0)),
    kwh: (s) => Math.abs(s.energy.pvCarport + s.energy.batteryDischarge - s.energy.batteryCharge - s.energy.wallbox),
  },
  { id: 'heatpump', path: `M52 ${GROUND + 2} L52 ${362 - R}`, color: 'var(--c-heat)', live: (l) => l.power.heatpump, kwh: (s) => s.energy.heatpump },
  { id: 'heat', path: `M${52 + R} 362 L112 362 L112 ${GROUND + 2}`, color: 'var(--c-warmth)', heat: true, live: (l) => l.heatpump.heatOutput, kwh: (s) => s.energy.heatpumpHeat },
  { id: 'grid', path: `M156 ${362 - R} L156 ${GROUND + 2}`, color: 'var(--c-grid)', live: (l) => l.power.grid, kwh: (s) => s.energy.gridImport + s.energy.gridExport },
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

function nodeValues(id: NodeDef['id'], l: LiveSnapshot | null, s: EnergySummary | null, isLive: boolean): { big: Fmt; small?: Fmt; note?: string } {
  const e = s?.energy;
  const both = (p: number | null | undefined, k: number | null | undefined) => (isLive ? { big: power(p), small: energy(k) } : { big: energy(k) });
  switch (id) {
    case 'solarThermal': return both(l?.power.solarThermal, e?.solarThermal);
    case 'pvRoof': return both(l?.power.pvRoof, e?.pvRoof);
    case 'pvCarport': return both(l?.power.pvCarport, e?.pvCarport);
    case 'car': return both(l?.power.wallbox, e?.wallbox);
    case 'heatpump': return both(l?.power.heatpump, e?.heatpump);
    case 'battery': {
      if (!isLive) return { big: energy(e?.batteryDischarge), note: e ? `${energy(e.batteryCharge).value} ${energy(e.batteryCharge).unit} geladen` : undefined };
      const b = l?.power.battery ?? null;
      return { big: power(b), note: b === null || Math.abs(b) < 20 ? 'Standby' : b < 0 ? 'lädt' : 'entlädt' };
    }
    case 'grid': {
      if (!isLive) return { big: energy(e?.gridImport), note: e ? `${energy(e.gridExport).value} ${energy(e.gridExport).unit} eingesp.` : undefined };
      const g = l?.power.grid ?? null;
      return { big: power(g), note: g === null || Math.abs(g) < 20 ? 'ausgeglichen' : g < 0 ? 'Einspeisung' : 'Bezug' };
    }
  }
}

/** Modulreihe parallel zu einer Dachlinie (x1,y1)→(x2,y2), nach außen versetzt. */
function Modules({ x1, y1, x2, y2, n, className }: { x1: number; y1: number; x2: number; y2: number; n: number; className: string }) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const ux = dx / len, uy = dy / len;
  // Normale nach oben/außen
  let nx = uy, ny = -ux;
  if (ny > 0) { nx = -nx; ny = -ny; }
  const gap = 2.5, depth = 7, off = 4;
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
  const roomOf = (id: string) => live?.rooms.find((r) => r.id === id)?.climate;

  return (
    <svg className="flow" viewBox="0 0 380 446" role="group" aria-label="Energiefluss Haus und Carport">
      <line className="ground" x1={6} x2={374} y1={GROUND} y2={GROUND} />

      {/* Carport (niedriger Anbau rechts) */}
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
        <Modules x1={134} y1={roofY(134)} x2={196} y2={roofY(196)} n={4} className="modules pv" />

        <text x={H.apexX} y={106} textAnchor="middle" className="fl">Verbrauch</text>
        <Value f={isLive ? power(live?.power.house) : energy(summary?.energy.house)} x={H.apexX} y={130} anchor="middle" big />
        {isLive && <Value f={energy(summary?.energy.house)} x={H.apexX} y={149} anchor="middle" />}
        {[
          { id: 'Gallerie', name: 'Galerie', y: 172 },
          { id: 'Wohnzimmer', name: 'Wohnzimmer', y: 240 },
        ].map((r) => {
          const c = roomOf(r.id);
          return (
            <g key={r.id}>
              <text x={H.apexX} y={r.y} textAnchor="middle" className="fl">{r.name}</text>
              <text x={H.apexX} y={r.y + 22} textAnchor="middle">
                <tspan className="room-t">{num(c?.temp, 1, '°')}</tspan>
                <tspan dx="7" className="room-s">{num(c?.hum, 0, '%')}</tspan>
                <tspan dx="6" className={`room-s${(c?.co2 ?? 0) > 1000 ? ' warn' : ''}`}>{num(c?.co2, 0, 'ppm')}</tspan>
              </text>
            </g>
          );
        })}
      </g>

      {/* Sammelschiene im Carport */}
      <line className="bus" x1={246} x2={328} y1={BUS_Y} y2={BUS_Y} />

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

      {/* Wärme aus der WP zurück ins Haus */}
      <text x={82} y={322} textAnchor="middle" className="fl warmth">Wärme</text>
      <Value f={isLive ? power(live?.heatpump.heatOutput) : energy(summary?.energy.heatpumpHeat)} x={82} y={338} anchor="middle" className="warmth" />

      {/* Knoten */}
      {NODES.map((n) => {
        const v = nodeValues(n.id, live, summary, isLive);
        const soc = n.id === 'battery' ? live?.battery.soc : n.id === 'car' ? live?.car.soc : null;
        const circ = 2 * Math.PI * (R + 4.5);
        const { x, y, anchor } = n.text;
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
            <Value f={v.big} x={x} y={y + 20} anchor={anchor} big />
            {v.small && <Value f={v.small} x={x} y={y + 36} anchor={anchor} />}
            {v.note && <text x={x} y={y + 36} textAnchor={anchor} className="fv fv-sm">{v.note}</text>}
          </g>
        );
      })}
    </svg>
  );
}
