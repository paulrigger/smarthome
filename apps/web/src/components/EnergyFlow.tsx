import { DEFAULT_THRESHOLDS, deviceState, flowDuration, type DeviceState, type EnergySummary, type LiveSnapshot, type Thresholds } from '@smarthome/shared';
import type { ComponentType, KeyboardEvent, SVGProps } from 'react';
import { energyShort as energy, join, num, power, type Fmt } from '../format';
import { Battery, Car, HeatPump, Panel, Pylon, Sun } from './Icons';

export type NodeId = 'pvRoof' | 'pvCarport' | 'solarThermal' | 'battery' | 'grid' | 'heatpump' | 'car' | 'house' | 'carport';

interface Props {
  live: LiveSnapshot | null;
  summary: EnergySummary | null;
  isLive: boolean;
  /** Schwellen aus/Standby/an je Gerät (useThresholds) */
  th?: Thresholds;
  selected: NodeId | null;
  onSelect: (id: NodeId) => void;
}

/*
 * Gebäudeschnitt (viewBox 380 × 462):
 *   Solarthermie (linke Dachseite) · PV Dach (rechte Dachseite) · PV Carport
 *   Haus (mit Wärmespeicher) + kleiner Carport-Anbau
 *   Unter der Geländelinie: Wärmepumpe · Netz · Akku · Auto
 * Flusspunkte: Strom immer --flow-elec, Wärme immer --flow-heat.
 */
const R = 20;
const H = { left: 20, right: 196, apexX: 108, apexY: 78, eave: 134, floor: 214, bottom: 292 };
const CP = { left: H.right, right: 344, roofL: 226, roofR: 232 };
const GROUND = H.bottom;
const ROW_Y = 362; // Knotenreihe unter Gelände
const TANK = { x: 34, y: 222, w: 42, h: 60 };

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
  { id: 'grid', label: 'Netz', x: 150, y: ROW_Y, color: 'var(--c-grid)', Icon: Pylon, text: { x: 150, y: ROW_Y + 40, anchor: 'middle' } },
  { id: 'battery', label: 'Akku', x: 254, y: ROW_Y, color: 'var(--c-battery)', Icon: Battery, text: { x: 254, y: ROW_Y + 40, anchor: 'middle' } },
  { id: 'car', label: 'Auto', x: 336, y: ROW_Y, color: 'var(--c-car)', Icon: Car, text: { x: 336, y: ROW_Y + 40, anchor: 'middle' } },
];

interface LinkDef {
  id: string;
  dev: string; // Schlüssel für Schwellen aus/Standby/an (standby.ts)
  path: string; // positive Werte fließen in Pfadrichtung
  heat?: boolean;
  live: (l: LiveSnapshot) => number | null;
  kwh: (s: EnergySummary) => number;
}

// Alle Leitungen enden an der Gebäudekante (Dach, Wand, Boden) – keine Linien im Gebäude.
const LINKS: LinkDef[] = [
  { id: 'solarThermal', dev: 'solarThermal', heat: true, path: `M44 ${34 + R} L44 ${roofY(44) - 13}`, live: (l) => l.power.solarThermal, kwh: (s) => s.energy.solarThermal },
  { id: 'pvRoof', dev: 'pvRoof', path: `M176 ${34 + R} L176 ${roofY(176) - 13}`, live: (l) => l.power.pvRoof, kwh: (s) => s.energy.pvRoof },
  { id: 'pvCarport', dev: 'pvCarport', path: `M290 ${172 + R} L290 ${carportRoofY(290) - 12}`, live: (l) => l.power.pvCarport, kwh: (s) => s.energy.pvCarport },
  { id: 'battery', dev: 'battery', path: `M254 ${ROW_Y - R - 4} L254 ${GROUND + 1}`, live: (l) => l.power.battery, kwh: (s) => s.energy.batteryDischarge + s.energy.batteryCharge },
  { id: 'car', dev: 'wallbox', path: `M336 ${GROUND + 1} L336 ${ROW_Y - R - 4}`, live: (l) => l.power.wallbox, kwh: (s) => s.energy.wallbox },
  { id: 'heatpump', dev: 'heatpump', path: `M40 ${GROUND + 1} L40 ${ROW_Y - R}`, live: (l) => l.power.heatpump, kwh: (s) => s.energy.heatpump },
  // Wärme fließt nur, wenn die WP läuft (Schwelle der WP auf ihren Strom)
  { id: 'heat', dev: 'heatpump', heat: true, path: `M${40 + R} ${ROW_Y} L100 ${ROW_Y} L100 ${GROUND + 1}`, live: (l) => l.heatpump.heatOutput, kwh: (s) => s.energy.heatpumpHeat },
  { id: 'grid', dev: 'grid', path: `M150 ${ROW_Y - R} L150 ${GROUND + 1}`, live: (l) => l.power.grid, kwh: (s) => s.energy.gridImport + s.energy.gridExport },
];
const linkOf = (id: string) => LINKS.find((k) => k.id === id)!;

/** Live-Zustand einer Leitung bzw. eines Knotens. Wärme folgt dem WP-Strom. */
export function liveState(id: string, l: LiveSnapshot | null, th: Thresholds): DeviceState | null {
  const k = linkOf(id === 'heat' ? 'heatpump' : id);
  return l ? deviceState(k.dev, k.live(l), th) : null;
}

const strokeWidth = (share: number) => 2.5 + Math.sqrt(Math.max(0, Math.min(1, share))) * 6;

export function Value({ f, x, y, anchor, big, className = '' }: { f: Fmt; x: number; y: number; anchor: string; big?: boolean; className?: string }) {
  return (
    <text x={x} y={y} textAnchor={anchor as 'start'} className={`${big ? 'fv fv-big' : 'fv'} ${className}`}>
      {f.value}
      {f.unit && <tspan className="fv-unit" dx="2">{f.unit}</tspan>}
    </text>
  );
}

/** Wie press, aber für Ziele innerhalb eines anderen antippbaren Bereichs (z. B. Speicher im Haus). */
const pressInner = (fn: () => void) => ({
  onClick: (e: { stopPropagation: () => void }) => (e.stopPropagation(), fn()),
  role: 'button',
  tabIndex: 0,
  onKeyDown: (e: KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), e.stopPropagation(), fn()),
});

export const press = (fn: () => void) => ({
  onClick: fn,
  role: 'button',
  tabIndex: 0,
  onKeyDown: (e: KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), fn()),
});

/** Werte unter/neben einem Knoten: optional große Zahl, dann kleine Zeilen. */
export function nodeValues(id: NodeDef['id'], l: LiveSnapshot | null, s: EnergySummary | null, isLive: boolean): { big?: Fmt; lines: string[] } {
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

/** Geometrie entlang einer Dachlinie: Einheitsvektor u (entlang), n (senkrecht nach außen/oben). */
function along(x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const ux = dx / len, uy = dy / len;
  let nx = uy, ny = -ux;
  if (ny > 0) { nx = -nx; ny = -ny; }
  const at = (t: number, h: number) => [x1 + ux * t + nx * h, y1 + uy * t + ny * h] as const;
  return { len, at };
}

/** PV: flache Module mit Zellraster (2 Zeilen × 3 Zellen), leicht über dem Dach aufgeständert. */
function PvPanels({ x1, y1, x2, y2, n }: { x1: number; y1: number; x2: number; y2: number; n: number }) {
  const { len, at } = along(x1, y1, x2, y2);
  const gap = 2, h0 = 2.5, depth = 7;
  const w = (len - gap * (n - 1)) / n;
  const pt = (t: number, h: number) => at(t, h).map((v) => v.toFixed(2)).join(' ');
  return (
    <g className="pv-panels">
      {Array.from({ length: n }, (_, i) => {
        const t0 = i * (w + gap), t1 = t0 + w;
        const frame = `M${pt(t0, h0)} L${pt(t1, h0)} L${pt(t1, h0 + depth)} L${pt(t0, h0 + depth)} Z`;
        const cells = [1, 2].map((k) => `M${pt(t0 + (w * k) / 3, h0)} L${pt(t0 + (w * k) / 3, h0 + depth)}`).join(' ') + ` M${pt(t0, h0 + depth / 2)} L${pt(t1, h0 + depth / 2)}`;
        return (
          <g key={i}>
            <path d={frame} className="pv-frame" />
            <path d={cells} className="pv-cells" />
          </g>
        );
      })}
    </g>
  );
}

/** Solarthermie: Vakuumröhren-Kollektor – Sammelrohr oben, Röhren senkrecht zum Dach. */
function TubeCollector({ x1, y1, x2, y2, n }: { x1: number; y1: number; x2: number; y2: number; n: number }) {
  const { len, at } = along(x1, y1, x2, y2);
  const step = len / n;
  const base = 2.5, tube = 10;
  const [hx1, hy1] = at(0, base + tube + 1.5);
  const [hx2, hy2] = at(len, base + tube + 1.5);
  return (
    <g className="tubes">
      {Array.from({ length: n }, (_, i) => {
        const t = step * (i + 0.5);
        const [ax, ay] = at(t, base);
        const [bx, by] = at(t, base + tube);
        return <line key={i} x1={ax} y1={ay} x2={bx} y2={by} className="tube" />;
      })}
      <line x1={hx1} y1={hy1} x2={hx2} y2={hy2} className="tube-header" />
    </g>
  );
}

/** Schichtspeicher: Zylinder mit gewölbten Böden, Füßen und Anschlüssen; oben WW, unten Puffer. */
function Tank({ x, y, w, h, top, bottom }: { x: number; y: number; w: number; h: number; top: string | null; bottom: string | null }) {
  const r = w / 2, cap = 7;
  const body = `M${x} ${y + cap} Q${x} ${y} ${x + r} ${y} Q${x + w} ${y} ${x + w} ${y + cap} L${x + w} ${y + h - cap} Q${x + w} ${y + h} ${x + r} ${y + h} Q${x} ${y + h} ${x} ${y + h - cap} Z`;
  return (
    <g className="tank">
      <path d={body} className="tank-body" />
      {/* Schichtung: oben warm, unten kühler */}
      <line x1={x + 5} x2={x + w - 5} y1={y + h / 2} y2={y + h / 2} className="tank-layer" />
      {/* Anschlüsse rechts, Füße unten */}
      <path d={`M${x + w} ${y + 13} h5 M${x + w} ${y + h - 13} h5 M${x + 9} ${y + h} v4 M${x + w - 9} ${y + h} v4`} className="tank-fit" />
      {top && <text x={x + r} y={y + 22} textAnchor="middle" className="tank-t">{top}</text>}
      {bottom && <text x={x + r} y={y + h - 11} textAnchor="middle" className="tank-t">{bottom}</text>}
    </g>
  );
}

export function EnergyFlow({ live, summary, isLive, th = DEFAULT_THRESHOLDS, selected, onSelect }: Props) {
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
        <PvPanels x1={CP.left + 10} y1={carportRoofY(CP.left + 10)} x2={CP.right - 4} y2={carportRoofY(CP.right - 4)} n={5} />
      </g>

      {/* Haus */}
      <g className={`bldg house${selected === 'house' ? ' sel' : ''}`} aria-label="Haus – Details" {...press(() => onSelect('house'))}>
        <path className="bldg-body" d={`M${H.left} ${H.eave} L${H.apexX} ${H.apexY} L${H.right} ${H.eave} L${H.right} ${H.bottom} L${H.left} ${H.bottom} Z`} />
        <path className="bldg-line" d={`M${H.left - 10} ${roofY(H.left - 10)} L${H.apexX} ${H.apexY} L${H.right + 10} ${roofY(H.right + 10)}`} />
        <path className="bldg-line thin" d={`M${H.left} ${H.eave} V${H.bottom} M${H.right} ${H.eave} V${H.bottom}`} />
        <line className="bldg-floor" x1={H.left} x2={H.right} y1={H.floor} y2={H.floor} />
        <TubeCollector x1={26} y1={roofY(26)} x2={88} y2={roofY(88)} n={12} />
        <PvPanels x1={130} y1={roofY(130)} x2={194} y2={roofY(194)} n={3} />
        {/* Wärmespeicher im Erdgeschoss: oben Warmwasser, unten Puffer */}
        <g className={`tank-hit${selected === 'heatpump' ? ' sel' : ''}`} aria-label="Wärmespeicher – Details Wärmepumpe" {...pressInner(() => onSelect('heatpump'))}>
          <Tank
            {...TANK}
            top={isLive ? num(live?.heatpump.dhwTop, 0, '°') : null}
            bottom={isLive ? num(live?.heatpump.bufferTop, 0, '°') : null}
          />
        </g>
        {/* Kollektortemperatur an den Kollektoren */}
        {isLive && <text x={52} y={88} className="fv fv-sm warmth">{num(live?.solarThermal.collectorTemp, 0, '°')}</text>}
        {isLive && <text x={104} y={GROUND - 8} className="fv fv-sm warmth">VL {num(live?.heatpump.flowTemp, 0, '°')}</text>}
        {/* Raumklima: oben Galerie, unten Wohnzimmer */}
        {isLive && [
          { id: 'Gallerie', x: H.apexX, y: 170 },
          { id: 'Wohnzimmer', x: 140, y: 240 },
        ].map((r) => {
          const c = room(r.id);
          return (
            <g key={r.id}>
              <text x={r.x} y={r.y} textAnchor="middle" className="room-t">{num(c?.temp, 1, '°C')}</text>
              <text x={r.x} y={r.y + 18} textAnchor="middle">
                <tspan className="room-s">{num(c?.hum, 0, '%')}</tspan>
                <tspan dx="6" className={`room-s${(c?.co2 ?? 0) > 1000 ? ' warn' : ''}`}>{num(c?.co2, 0, 'ppm')}</tspan>
              </text>
            </g>
          );
        })}
      </g>


      {/* Leitungen */}
      {LINKS.map((k) => {
        if (k.id === 'car' && isLive && live?.car.plugged === false) return null; // Auto nicht angesteckt: keine Leitung
        const p = isLive && live ? k.live(live) : null;
        const kwh = summary ? k.kwh(summary) : 0;
        const active = isLive ? liveState(k.id, live, th) === 'on' && p !== null : kwh > 0.05;
        const w = isLive ? strokeWidth(Math.abs(p ?? 0) / 8000) : strokeWidth(kwh / maxKwh);
        return (
          <g key={k.id} className={k.heat ? 'link heat' : 'link elec'}>
            <path d={k.path} className="track" strokeWidth={w + 4} />
            {active && isLive && (['dots halo', 'dots'] as const).map((c) => (
              <path key={c} d={k.path} className={`${c}${(p ?? 0) < 0 ? ' rev' : ''}`} strokeWidth={Math.max(4.5, w) + (c === 'dots' ? 0 : 3)} style={{ animationDuration: `${flowDuration(p ?? 0)}s` }} />
            ))}
            {active && !isLive && <path d={k.path} className="solid" strokeWidth={w} />}
          </g>
        );
      })}

      {/* Wärme der WP zurück ins Haus: Leistung + Energie */}
      <g className="heat-label">
        {isLive && <Value f={power(live?.heatpump.heatOutput)} x={70} y={312} anchor="middle" className="warmth strong" />}
        <Value f={energy(summary?.energy.heatpumpHeat)} x={70} y={isLive ? 328 : 318} anchor="middle" className={isLive ? 'warmth' : 'warmth strong'} />
      </g>

      {/* Außentemperatur */}
      {isLive && <>
      <text x={374} y={92} textAnchor="end" className="fl">Außen</text>
      <text x={374} y={112} textAnchor="end" className="room-t">{num(live?.outdoorTemp, 1, '°C')}</text>
      </>}

      {/* Knoten */}
      {NODES.map((n) => {
        const v = nodeValues(n.id, live, summary, isLive);
        const soc = !isLive ? null : n.id === 'battery' ? live?.battery.soc : n.id === 'car' ? live?.car.soc : null;
        const circ = 2 * Math.PI * (R + 4.5);
        const { x, y, anchor } = n.text;
        let ly = y + (v.big ? 20 : 3);
        const st = isLive ? liveState(n.id, live, th) : null;
        return (
          <g key={n.id} className={`node${selected === n.id ? ' sel' : ''}${st === 'standby' || st === 'off' ? ` ${st}` : ''}`} style={{ color: n.color }} aria-label={`${n.label} – Details`} {...press(() => onSelect(n.id))}>
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
