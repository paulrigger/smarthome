import { DEFAULT_THRESHOLDS, MODEL_NODES, MODEL_VIEW, deviceState, flowDuration, modelAnchor, modelLinks, type DeviceState, type EnergySummary, type LiveSnapshot, type ModelNodeKey, type Thresholds } from '@smarthome/shared';
import { energyShort as energy, join, num, pct, power, type Fmt } from '../format';
import { Kpi } from '../pages/Kpi';
import type { ComponentType, SVGProps } from 'react';
import { nodeValues, press, Value, type NodeId } from './EnergyFlow';
import { Battery, Car, HeatPump, Home, Panel, Pylon, Sun } from './Icons';
import modelRaw from '../assets/haus-sw.svg?raw';

interface Props {
  live: LiveSnapshot | null;
  summary: EnergySummary | null;
  isLive: boolean;
  th?: Thresholds;
  selected: NodeId | null;
  onSelect: (id: NodeId) => void;
}

/*
 * Hausmodell (Mockup E, docs/mockups/gen_e.py): Linienmodell haus-sw.svg in der Mitte (Kopie aus docs/model),
 * Knoten außen im Uhrzeigersinn: WP, Speicher, Solarthermie, PV Dach, PV Carport, Akku, Netz, Auto, Haushalt;
 * Bézierkurven Knoten → Ankerpunkt (Kontrollpunkte per Suche kreuzungsfrei gelegt), Ketten WP → Speicher ← Solarthermie, Carport → Akku.
 * Geometrie rein in packages/shared/src/flow.ts (MODEL_NODES, modelLinks).
 */
const MODEL_INNER = modelRaw.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<title>[\s\S]*?<\/title>/, '');
const GEO = modelLinks();

/** Detail-Popup wie in den anderen Darstellungen; Speicher → Wärmepumpe (WW/Puffer-Temperaturen). */
const NODE_ID: Record<ModelNodeKey, NodeId> = {
  pvCarport: 'pvCarport', battery: 'battery', pvRoof: 'pvRoof', grid: 'grid', house: 'house', wallbox: 'car', heatpump: 'heatpump', tank: 'heatpump', solar: 'solarThermal',
};
const COLOR: Record<ModelNodeKey, string> = {
  pvCarport: 'var(--c-sun)', battery: 'var(--c-battery)', pvRoof: 'var(--c-sun)', grid: 'var(--c-grid)', house: 'var(--text)',
  wallbox: 'var(--c-car)', heatpump: 'var(--c-heat)', tank: 'var(--c-warmth)', solar: 'var(--c-warmth)',
};
/** Schlüssel für Schwellen aus/Standby/an (standby.ts); Haushalt/Speicher ohne eigene Schwelle. */
const DEV: Partial<Record<ModelNodeKey, string>> = {
  pvCarport: 'pvCarport', battery: 'battery', pvRoof: 'pvRoof', grid: 'grid', wallbox: 'wallbox', heatpump: 'heatpump', solar: 'solarThermal',
};
const HEAT: Partial<Record<ModelNodeKey, boolean>> = { tank: true, solar: true };

type IconC = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

/** Speicher: Zylinder mit Schichtgrenze (wie in der Haus-Grafik), 24er-Raster wie Icons.tsx. */
const TankIcon: IconC = ({ size, ...p }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" {...p}>
    <rect x="7" y="2.5" width="10" height="19" rx="5" />
    <path d="M7 12 H17 M9.5 16 Q12 14.5 14.5 16 M9.5 7.5 Q12 6 14.5 7.5" />
  </svg>
);

/** Gleiche runden Symbole wie die Haus-Grafik (EnergyFlow). */
const ICON: Record<ModelNodeKey, IconC> = {
  pvCarport: Panel, pvRoof: Panel, solar: Sun, heatpump: HeatPump, grid: Pylon, house: Home, wallbox: Car, battery: Battery, tank: TankIcon,
};

/** Fluss einer Linie: Richtung (+1 = in Pfadrichtung, −1 = dagegen), Leistung in W, Zustand. */
interface Flow {
  dir: 1 | -1 | 0;
  w: number;
  state: DeviceState | null;
}

interface NodeView {
  label: string;
  value: string;
  value2?: string; // zweite Wertzeile (Zeitraum: Bezug/Einspeisung, Laden/Entladen)
  soc?: number | null; // Ladestand-Ring (Akku, Auto; nur live)
  state: DeviceState | null; // null = stale bzw. ohne Live
  link: Flow; // Knoten ↔ Anker; Pfad läuft Knoten → Modell
}

const signed = (w: number | null | undefined, neg: boolean) => (w === null || w === undefined ? '–' : `${neg ? '−' : ''}${join(power(w))}`);

/** "a → b Einheit"; bei unterschiedlichen Einheiten beide ausschreiben (754 W → 4,70 kW). */
const arrow = (a: Fmt, b: Fmt) => (a.unit === b.unit || !a.unit ? `${a.value} → ${join(b)}` : `${join(a)} → ${join(b)}`);

/** Live-Werte, Zustände und Flussrichtungen je Knoten. */
function liveView(l: LiveSnapshot | null, th: Thresholds): { nodes: Record<ModelNodeKey, NodeView>; chains: Record<string, Flow> } {
  const p = l?.power;
  const st = (k: ModelNodeKey, w: number | null | undefined) => (DEV[k] ? deviceState(DEV[k]!, w, th) : w === null || w === undefined ? null : Math.abs(w) >= 20 ? 'on' : 'off');
  const f = (dir: 1 | -1, w: number | null | undefined, s: DeviceState | null): Flow => ({ dir: s === 'on' && w ? dir : 0, w: Math.abs(w ?? 0), state: s });
  const bat = p?.battery ?? null, grid = p?.grid ?? null;
  const sBat = st('battery', bat);
  const charging = sBat === 'on' && (bat ?? 0) < 0;
  const sHp = st('heatpump', p?.heatpump);
  const sSol = st('solar', p?.solarThermal);
  const soc = l?.battery.soc;
  const carSoc = l?.car.soc;
  const nodes: Record<ModelNodeKey, NodeView> = {
    pvCarport: { label: 'PV Carport', value: join(power(p?.pvCarport)), state: st('pvCarport', p?.pvCarport), link: f(1, p?.pvCarport, st('pvCarport', p?.pvCarport)) },
    // Ladung kommt per DC über die Kette vom Carport; zum Haus fließt nur die Entladung. Wert: + laden, − entladen
    battery: { label: `Akku${soc != null ? ` · ${Math.round(soc)} %` : ''}`, value: bat === null ? '–' : `${bat < 0 ? '+' : bat > 0 ? '−' : ''}${join(power(bat))}`, state: sBat, link: f(1, charging ? 0 : bat, sBat), soc },
    pvRoof: { label: 'PV Dach', value: join(power(p?.pvRoof)), state: st('pvRoof', p?.pvRoof), link: f(1, p?.pvRoof, st('pvRoof', p?.pvRoof)) },
    grid: { label: 'Netz', value: signed(grid, (grid ?? 0) < 0), state: st('grid', grid), link: f((grid ?? 0) >= 0 ? 1 : -1, grid, st('grid', grid)) },
    house: { label: 'Haushalt', value: join(power(p?.rest)), state: st('house', p?.rest), link: f(-1, p?.rest, st('house', p?.rest)) },
    wallbox: { label: `Auto${carSoc != null ? ` · ${Math.round(carSoc)} %` : ''}`, value: st('wallbox', p?.wallbox) === 'standby' ? 'Standby' : join(power(p?.wallbox)), state: st('wallbox', p?.wallbox), link: f(-1, p?.wallbox, st('wallbox', p?.wallbox)), soc: carSoc },
    heatpump: { label: 'Wärmepumpe', value: sHp === 'off' ? 'aus' : arrow(power(p?.heatpump), power(l?.heatpump.heatOutput)), state: sHp, link: f(-1, p?.heatpump, sHp) },
    tank: { label: 'Speicher', value: `WW ${num(l?.heatpump.dhwTop, 0)} · P ${num(l?.heatpump.bufferTop, 0, '°C')}`, state: sHp === 'on' || sSol === 'on' ? 'on' : 'standby', link: { dir: 0, w: 0, state: 'standby' } },
    solar: { label: 'Solarthermie', value: `${join(power(p?.solarThermal))}${l?.solarThermal.collectorTemp != null ? ` · ${num(l.solarThermal.collectorTemp, 0, '°C')}` : ''}`, state: sSol, link: f(1, p?.solarThermal, sSol) },
  };
  const chains: Record<string, Flow> = {
    'pvCarport>battery': f(1, charging ? -bat! : 0, charging ? 'on' : sBat),
    'solar>tank': f(1, p?.solarThermal, sSol),
    'heatpump>tank': f(1, l?.heatpump.heatOutput, sHp), // Warmwasser-/Heizwasseranschluss
  };
  return { nodes, chains };
}

/** Zeitraum: kWh je Knoten, keine Animation; Linien sichtbar, wenn Energie floss. */
function energyView(s: EnergySummary | null): { nodes: Record<ModelNodeKey, NodeView>; chains: Record<string, Flow> } {
  const e = s?.energy;
  const k = (v: number | undefined): Flow => ({ dir: 0, w: 0, state: v === undefined ? null : v > 0.05 ? 'on' : 'off' });
  const v = (x: number | undefined) => join(energy(x));
  const nodes: Record<ModelNodeKey, NodeView> = {
    pvCarport: { label: 'PV Carport', value: v(e?.pvCarport), state: k(e?.pvCarport).state, link: k(e?.pvCarport) },
    battery: { label: 'Akku', value: e ? `Laden ${join(energy(e.batteryCharge))}` : '–', value2: e ? `Entl. ${join(energy(e.batteryDischarge))}` : undefined, state: k(e?.batteryDischarge).state, link: k(e?.batteryDischarge) },
    pvRoof: { label: 'PV Dach', value: v(e?.pvRoof), state: k(e?.pvRoof).state, link: k(e?.pvRoof) },
    grid: { label: 'Netz', value: e ? `Bezug ${join(energy(e.gridImport))}` : '–', value2: e ? `Einsp. ${join(energy(e.gridExport))}` : undefined, state: k(e ? e.gridImport + e.gridExport : undefined).state, link: k(e ? e.gridImport + e.gridExport : undefined) },
    house: { label: 'Haushalt', value: v(e?.rest), state: k(e?.rest).state, link: k(e?.rest) },
    wallbox: { label: 'Auto', value: v(e?.wallbox), state: k(e?.wallbox).state, link: k(e?.wallbox) },
    heatpump: { label: 'Wärmepumpe', value: e ? arrow(energy(e.heatpump), energy(e.heatpumpHeat)) : '–', state: k(e?.heatpump).state, link: k(e?.heatpump) },
    tank: { label: 'Speicher', value: e ? `Wärme ${join(energy(e.heatpumpHeat + e.solarThermal))}` : '–', state: k(e ? e.heatpumpHeat + e.solarThermal : undefined).state, link: { dir: 0, w: 0, state: 'standby' } },
    solar: { label: 'Solarthermie', value: v(e?.solarThermal), state: k(e?.solarThermal).state, link: k(e?.solarThermal) },
  };
  const chains: Record<string, Flow> = {
    'pvCarport>battery': k(e?.batteryCharge),
    'solar>tank': k(e?.solarThermal),
    'heatpump>tank': k(e?.heatpumpHeat),
  };
  return { nodes, chains };
}

/** Haus-Grafik-Knoten (EnergyFlow.nodeValues) für die gleichen Werte; Haushalt und Speicher eigene Texte. */
const EF_ID: Partial<Record<ModelNodeKey, Parameters<typeof nodeValues>[0]>> = {
  pvRoof: 'pvRoof', pvCarport: 'pvCarport', solar: 'solarThermal', heatpump: 'heatpump', grid: 'grid', battery: 'battery', wallbox: 'car',
};

function nodeTexts(k: ModelNodeKey, l: LiveSnapshot | null, s: EnergySummary | null, isLive: boolean): { big?: Fmt; lines: string[] } {
  const e = s?.energy;
  const ef = EF_ID[k];
  if (ef) return nodeValues(ef, l, s, isLive); // Wärme der WP steht an der Kette zum Speicher (HeatLabels)
  if (k === 'house') return isLive ? { big: power(l?.power.rest), lines: [join(energy(e?.rest))] } : { big: energy(e?.rest), lines: [] };
  // Speicher: Temperaturen live, im Zeitraum die zugeführte Wärme (WP + Solar)
  return isLive
    ? { lines: [`WW oben ${num(l?.heatpump.dhwTop, 0, '°C')}`, `Puffer ${num(l?.heatpump.bufferTop, 0, '°C')}`] }
    : { big: energy(e ? e.heatpumpHeat + e.solarThermal : null), lines: [] };
}

const nodeAt = (id: ModelNodeKey) => MODEL_NODES.find((n) => n.id === id)!;

/**
 * Zusatzwerte im Modell: an der Kette WP → Speicher Wärmeleistung (aktueller COP) und Wärme des Zeitraums (Ø-COP),
 * links davon die Vorlauftemperatur; Kollektortemperatur am Solarthermie-Anker, Außentemperatur im Garten links über dem Akku.
 * Leistung, COP und Vorlauf nur, wenn die WP läuft; Temperaturen nur live. Lage relativ zu MODEL_NODES/Ankern.
 */
function HeatLabels({ live, summary, isLive, hpOn }: { live: LiveSnapshot | null; summary: EnergySummary | null; isLive: boolean; hpOn: boolean }) {
  const hp = nodeAt('heatpump'), tank = nodeAt('tank'), bat = nodeAt('battery');
  const x = hp.x + 17, y = (hp.y + tank.y) / 2 - 8; // rechts der Kette, zwischen WP und Speicher
  const [sx, sy] = modelAnchor('solar');
  const h = live?.heatpump;
  const heat = summary ? energy(summary.energy.heatpumpHeat) : null;
  const cop = summary?.kpi.cop;
  return (
    <g className="mlabels">
      {isLive && hpOn && (
        <text x={x} y={y} className="fv mheat">
          {power(h?.heatOutput).value}
          <tspan className="fv-unit" dx="2">{power(h?.heatOutput).unit}</tspan>
          {h?.cop != null && <tspan className="fv-sm mcop" dx="4">(COP {num(h.cop, 1)})</tspan>}
        </text>
      )}
      {heat && (
        <text x={x} y={y + 15} className="fv fv-sm">
          {join(heat)}
          {cop != null && <tspan dx="4">(COP {num(cop, 1)})</tspan>}
        </text>
      )}
      {isLive && hpOn && h?.flowTemp != null && (
        <>
          <text x={hp.x + 5} y={y - 6} textAnchor="end" className="fl mtiny">VL</text>
          <text x={hp.x + 5} y={y + 8} textAnchor="end" className="fv fv-sm mheat">{num(h.flowTemp, 0, '°C')}</text>
        </>
      )}
      {isLive && live?.solarThermal.collectorTemp != null && (
        <text x={sx - 6} y={sy - 5} textAnchor="end" className="fv fv-sm mwarm">{num(live.solarThermal.collectorTemp, 0, '°C')}</text>
      )}
      {isLive && live?.outdoorTemp != null && (
        <>
          <text x={bat.x - bat.r - 6} y={bat.y - bat.r - 18} textAnchor="end" className="fl mtiny">außen</text>
          <text x={bat.x - bat.r - 6} y={bat.y - bat.r - 4} textAnchor="end" className="fv fv-sm">{num(live.outdoorTemp, 1, '°C')}</text>
        </>
      )}
    </g>
  );
}

/** Linie + Flusspunkte. */
function Line({ d, heat, flow, isLive }: { d: string; heat: boolean; flow: Flow; isLive: boolean }) {
  const cls = flow.state === 'on' ? 'on' : flow.state === 'standby' ? 'standby' : flow.state === 'off' ? 'off' : 'stale';
  return (
    <g className={`mlink ${heat ? 'heat' : 'elec'} ${cls}`}>
      <path d={d} className="mtrack" />
      {isLive && flow.dir !== 0 && (
        <path d={d} className={`mdots${flow.dir < 0 ? ' rev' : ''}`} style={{ animationDuration: `${flowDuration(flow.w)}s` }} />
      )}
    </g>
  );
}

export function FlowModel({ live, summary, isLive, th = DEFAULT_THRESHOLDS, selected, onSelect }: Props) {
  const view = isLive ? liveView(live, th) : energyView(summary);
  const e = summary?.energy;
  const aria =
    'Hausmodell: ' + MODEL_NODES.map((n) => `${view.nodes[n.id].label} ${view.nodes[n.id].value}`).join(', ');

  return (
    <div className="alt-flow">
      <svg className="flow model" viewBox={`0 0 ${MODEL_VIEW.w} ${MODEL_VIEW.h}`} role="group" aria-label="Hausmodell mit Energieflüssen">
        <g role="img" aria-label={aria}>
          <svg
            x={MODEL_VIEW.x}
            y={MODEL_VIEW.y}
            width={MODEL_VIEW.vbW * MODEL_VIEW.scale}
            height={MODEL_VIEW.vbH * MODEL_VIEW.scale}
            viewBox={`0 0 ${MODEL_VIEW.vbW} ${MODEL_VIEW.vbH}`}
            className="model-svg"
            fill="none"
            stroke="currentColor"
            dangerouslySetInnerHTML={{ __html: MODEL_INNER }}
          />
          {GEO.chains.map((c) => (
            <Line key={`${c.from}>${c.to}`} d={c.d} heat={c.heat} flow={view.chains[`${c.from}>${c.to}`]} isLive={isLive} />
          ))}
          {MODEL_NODES.map((n) => {
            const nv = view.nodes[n.id];
            const g = GEO.links[n.id];
            if (!g) return null; // Speicher: keine Linie zum Haus
            return (
              <g key={n.id}>
                <Line d={g.d} heat={!!HEAT[n.id]} flow={nv.link} isLive={isLive} />
                <circle cx={g.anchor[0]} cy={g.anchor[1]} r={2.4} className={`manchor ${HEAT[n.id] ? 'heat' : 'elec'} ${nv.link.state === 'on' ? 'on' : ''}`} />
              </g>
            );
          })}
        </g>

        {/* Anlagen im Modell antippbar (am Ankerpunkt, 44 px) → gleiches Popup wie der Knoten */}
        {MODEL_NODES.map((n) => {
          const g = GEO.links[n.id];
          if (!g) return null;
          const [ax, ay] = g.anchor;
          const id = NODE_ID[n.id];
          return (
            <circle key={`hit-${n.id}`} cx={ax} cy={ay} r={22} className={`mhit${selected === id ? ' sel' : ''}`} aria-label={`${view.nodes[n.id].label} im Modell – Details`} {...press(() => onSelect(id))} />
          );
        })}

        {MODEL_NODES.map((n) => {
          const nv = view.nodes[n.id];
          const id = NODE_ID[n.id];
          const dim = nv.state === 'standby' || nv.state === 'off' ? ` ${nv.state}` : nv.state === null && isLive ? ' stale' : '';
          // Texte wie in der Haus-Grafik: Beschriftung, Leistung groß (live) bzw. kWh, darunter kleine Zeilen (Energie, Bezug/Einsp. …)
          const soc = nv.soc ?? null;
          const ring = soc !== null ? 5 : 0;
          const tv = nodeTexts(n.id, live, summary, isLive);
          if (isLive && nv.state === 'off') delete tv.big; // Leistung nur, wenn das Gerät läuft
          const blockH = (tv.big ? 20 : 3) + 16 * tv.lines.length;
          const y0 =
            n.label === 'top' ? n.y - n.r - ring - 8 - blockH
            : n.label === 'right' ? n.y + 4 - blockH / 2
            : n.y + n.r + ring + 16;
          const tx = n.label === 'right' ? n.x + n.r + ring + 8 : n.align === 'start' ? n.x - n.r : n.align === 'end' ? n.x + n.r : n.x;
          let ly = y0 + (tv.big ? 20 : 3);
          const Icon = ICON[n.id];
          const circ = 2 * Math.PI * (n.r + 4.5);
          return (
            <g key={n.id} className={`node${selected === id ? ' sel' : ''}${dim}`} style={{ color: COLOR[n.id] }} aria-label={`${nv.label} – Details`} {...press(() => onSelect(id))}>
              <circle cx={n.x} cy={n.y} r={n.r + 10} className="hit" />
              <circle cx={n.x} cy={n.y} r={n.r} className="node-bg" />
              {/* Ladestand als Ring wie in der Haus-Grafik (Akku, Auto) */}
              {soc !== null && (
                <>
                  <circle cx={n.x} cy={n.y} r={n.r + 4.5} className="soc-track" />
                  <circle cx={n.x} cy={n.y} r={n.r + 4.5} className="soc" strokeDasharray={`${(circ * Math.max(0, Math.min(100, soc))) / 100} ${circ}`} transform={`rotate(-90 ${n.x} ${n.y})`} />
                </>
              )}
              <Icon x={n.x - 11} y={n.y - 11} size={22} />
              <text x={tx} y={y0} textAnchor={n.align} className="fl">{nv.label}</text>
              {tv.big && <Value f={tv.big} x={tx} y={ly} anchor={n.align} big />}
              {tv.lines.map((t) => (
                <text key={t} x={tx} y={(ly += 16)} textAnchor={n.align} className="fv fv-sm">{t}</text>
              ))}
            </g>
          );
        })}

        <HeatLabels live={live} summary={summary} isLive={isLive} hpOn={view.nodes.heatpump.state === 'on'} />
      </svg>

      <dl className="kpis kpis-3">
        <Kpi label={isLive ? 'PV heute' : 'PV'} value={energy(e?.pv)} />
        <Kpi label="Verbrauch" value={energy(e?.house)} />
        <Kpi label="Autarkie" value={{ value: pct(summary?.kpi.selfSufficiency), unit: '' }} />
      </dl>
    </div>
  );
}
