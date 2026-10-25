import { DEFAULT_THRESHOLDS, MODEL_NODES, MODEL_VIEW, deviceState, flowDuration, modelLinks, type DeviceState, type EnergySummary, type LiveSnapshot, type ModelNodeKey, type Thresholds } from '@smarthome/shared';
import { energyShort as energy, join, num, pct, power, type Fmt } from '../format';
import { Kpi } from '../pages/Kpi';
import { press, type NodeId } from './EnergyFlow';
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
 * Knoten außen, Bézierkurven Knoten → Ankerpunkt am Modell, Ketten Carport → Akku und WP/Solar → Speicher.
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

// Symbole aus dem Mockup (stroke/fill = currentColor), für Radius 21
const ICON: Record<ModelNodeKey, string> = {
  pvCarport: '<path d="M-9 3 L-6 -6 L9 -6 L6 3 Z M-7.5 -1.5 L7.5 -1.5 M-1.5 -6 L-3 3 M3.5 -6 L2 3" fill="none" stroke-width="1.6" stroke-linejoin="round"/><path d="M0 3 V8 M-4 8 H4" stroke-width="1.6"/>',
  pvRoof: '<path d="M-9 3 L-6 -6 L9 -6 L6 3 Z M-7.5 -1.5 L7.5 -1.5 M-1.5 -6 L-3 3 M3.5 -6 L2 3" fill="none" stroke-width="1.6" stroke-linejoin="round"/><path d="M0 3 V8 M-4 8 H4" stroke-width="1.6"/>',
  solar: '<path d="M-8 -7 V7 M-4 -7 V7 M0 -7 V7 M4 -7 V7 M8 -7 V7 M-9 -7 H9" stroke-width="1.6" fill="none"/>',
  heatpump: '<rect x="-6" y="-9" width="12" height="18" rx="1.5" fill="none" stroke-width="1.6"/><path d="M-4 -6 H4 M-4 -3 H4 M-4 0 H4" stroke-width="1.2"/>',
  grid: '<path d="M-6 9 L0 -9 L6 9 M-4 3 H4 M-2.5 -3 H2.5 M-8 -5 H8" fill="none" stroke-width="1.6" stroke-linejoin="round"/>',
  house: '<path d="M-8 0 L0 -8 L8 0 V8 H-8 Z" fill="none" stroke-width="1.6" stroke-linejoin="round"/>',
  wallbox: '<path d="M-9 3 L-7 -3 L7 -3 L9 3 V7 H-9 Z M-6 7 V9 M6 7 V9" fill="none" stroke-width="1.6" stroke-linejoin="round"/>',
  battery: '<rect x="-6" y="-10" width="12" height="20" rx="2" fill="none" stroke-width="1.7"/><path d="M-2.5 -12 H2.5" stroke-width="1.7"/><rect x="-3.5" y="-1" width="7" height="8" stroke="none"/><rect x="-3.5" y="-7" width="7" height="4" stroke="none" fill-opacity="0.5"/>',
  tank: '<rect x="-7.5" y="-12" width="15" height="24" rx="7.5" fill="none" stroke-width="1.8"/><path d="M-7.5 0 H7.5" stroke-width="1.3"/><path d="M-4 5 Q0 2.5 4 5 M-4 -6 Q0 -8.5 4 -6" fill="none" stroke-width="1.3"/>',
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
    battery: { label: `Akku${soc != null ? ` · ${Math.round(soc)} %` : ''}`, value: bat === null ? '–' : `${bat < 0 ? '+' : bat > 0 ? '−' : ''}${join(power(bat))}`, state: sBat, link: f(1, charging ? 0 : bat, sBat) },
    pvRoof: { label: 'PV Dach', value: join(power(p?.pvRoof)), state: st('pvRoof', p?.pvRoof), link: f(1, p?.pvRoof, st('pvRoof', p?.pvRoof)) },
    grid: { label: 'Netz', value: signed(grid, (grid ?? 0) < 0), state: st('grid', grid), link: f((grid ?? 0) >= 0 ? 1 : -1, grid, st('grid', grid)) },
    house: { label: 'Haushalt', value: join(power(p?.rest)), state: st('house', p?.rest), link: f(-1, p?.rest, st('house', p?.rest)) },
    wallbox: { label: `Auto${carSoc != null ? ` · ${Math.round(carSoc)} %` : ''}`, value: st('wallbox', p?.wallbox) === 'standby' ? 'Standby' : join(power(p?.wallbox)), state: st('wallbox', p?.wallbox), link: f(-1, p?.wallbox, st('wallbox', p?.wallbox)) },
    heatpump: { label: 'Wärmepumpe', value: sHp === 'off' ? 'aus' : arrow(power(p?.heatpump), power(l?.heatpump.heatOutput)), state: sHp, link: f(-1, p?.heatpump, sHp) },
    tank: { label: 'Speicher', value: `WW ${num(l?.heatpump.dhwTop, 0)} · P ${num(l?.heatpump.bufferTop, 0, '°C')}`, state: sHp === 'on' || sSol === 'on' ? 'on' : 'standby', link: { dir: 0, w: 0, state: 'standby' } },
    solar: { label: 'Solarthermie', value: `${join(power(p?.solarThermal))}${l?.solarThermal.collectorTemp != null ? ` · ${num(l.solarThermal.collectorTemp, 0, '°C')}` : ''}`, state: sSol, link: f(1, p?.solarThermal, sSol) },
  };
  const chains: Record<string, Flow> = {
    'pvCarport>battery': f(1, charging ? -bat! : 0, charging ? 'on' : sBat),
    'pvRoof>battery': { dir: 0, w: 0, state: 'off' }, // Akku lädt nur DC aus dem Carport
    'heatpump>tank': f(1, l?.heatpump.heatOutput, sHp),
    'solar>tank': f(1, p?.solarThermal, sSol),
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
    'pvRoof>battery': { dir: 0, w: 0, state: 'off' },
    'heatpump>tank': k(e?.heatpumpHeat),
    'solar>tank': k(e?.solarThermal),
  };
  return { nodes, chains };
}

/** Linie + Flusspunkte; dashed = keine Verbindung im Betrieb (Dach → Akku). */
function Line({ d, heat, flow, isLive, dashed }: { d: string; heat: boolean; flow: Flow; isLive: boolean; dashed?: boolean }) {
  const cls = flow.state === 'on' ? 'on' : flow.state === 'standby' ? 'standby' : flow.state === 'off' ? 'off' : 'stale';
  return (
    <g className={`mlink ${heat ? 'heat' : 'elec'} ${cls}${dashed ? ' dashed' : ''}`}>
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
          {GEO.chains
            // Dach → Akku gibt es nur als Hinweis im Live-Bild (Akku lädt DC nur aus dem Carport)
            .filter((c) => isLive || c.from !== 'pvRoof')
            .map((c) => (
              <Line key={`${c.from}>${c.to}`} d={c.d} heat={c.heat} flow={view.chains[`${c.from}>${c.to}`]} isLive={isLive} dashed={c.from === 'pvRoof'} />
            ))}
          {MODEL_NODES.map((n) => {
            const nv = view.nodes[n.id];
            const g = GEO.links[n.id];
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
          const [ax, ay] = GEO.links[n.id].anchor;
          const id = NODE_ID[n.id];
          return (
            <circle key={`hit-${n.id}`} cx={ax} cy={ay} r={22} className={`mhit${selected === id ? ' sel' : ''}`} aria-label={`${view.nodes[n.id].label} im Modell – Details`} {...press(() => onSelect(id))} />
          );
        })}

        {MODEL_NODES.map((n) => {
          const nv = view.nodes[n.id];
          const id = NODE_ID[n.id];
          const dim = nv.state === 'standby' || nv.state === 'off' ? ` ${nv.state}` : nv.state === null && isLive ? ' stale' : '';
          // Zeilen: Label, Wert, ggf. zweiter Wert (oben: nach oben verschoben); linke Spalte linksbündig, damit nichts über den Rand ragt
          const extra = nv.value2 ? 15 : 0;
          const [l1, l2] = n.labelTop ? [n.y - n.r - 23 - extra, n.y - n.r - 8 - extra] : [n.y + n.r + 15, n.y + n.r + 30];
          const left = n.x < 60;
          const tx = left ? n.x - n.r : n.x;
          const anchor = left ? 'start' : 'middle';
          return (
            <g key={n.id} className={`node${selected === id ? ' sel' : ''}${dim}`} style={{ color: COLOR[n.id] }} aria-label={`${nv.label} – Details`} {...press(() => onSelect(id))}>
              <circle cx={n.x} cy={n.y} r={Math.max(n.r + 5, 23)} className="hit" />
              <circle cx={n.x} cy={n.y} r={n.r} className="node-bg" />
              <g transform={`translate(${n.x} ${n.y}) scale(${(n.r / 21).toFixed(2)})`} stroke="currentColor" fill="currentColor" dangerouslySetInnerHTML={{ __html: ICON[n.id] }} />
              <text x={tx} y={l1} textAnchor={anchor} className="mlabel">{nv.label}</text>
              <text x={tx} y={l2} textAnchor={anchor} className={`mval${nv.value2 ? ' sm' : ''}`}>{nv.value}</text>
              {nv.value2 && <text x={tx} y={l2 + 15} textAnchor={anchor} className="mval sm">{nv.value2}</text>}
            </g>
          );
        })}
      </svg>

      <dl className="kpis kpis-3">
        <Kpi label={isLive ? 'PV heute' : 'PV'} value={energy(e?.pv)} />
        <Kpi label="Verbrauch" value={energy(e?.house)} />
        <Kpi label="Autarkie" value={{ value: pct(summary?.kpi.selfSufficiency), unit: '' }} />
      </dl>
    </div>
  );
}
