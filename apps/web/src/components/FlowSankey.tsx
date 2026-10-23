import { bandPath, sankeyFlows, sankeyLayout, type EnergySummary, type LiveSnapshot, type SankeySource, type SankeyTarget } from '@smarthome/shared';
import { useId, type CSSProperties } from 'react';
import { energyShort as energy, join, num, pct, power } from '../format';
import { press, Value, type NodeId } from './EnergyFlow';

interface Props {
  live: LiveSnapshot | null;
  summary: EnergySummary | null;
  isLive: boolean;
  selected: NodeId | null;
  onSelect: (id: NodeId) => void;
}

/*
 * Sankey (viewBox 380 × 260): Quellen links (PV, Akku-Entladung, Netzbezug), Ziele rechts (Einspeisung, Akku laden, Haus).
 * Bänder ∝ Energie im Zeitraum, Farbe = Quelle; Akku schraffiert, Netz gepunktet (unterscheidbar auch in Schwarz-Weiß).
 */
const W = 380, HEIGHT = 260;
const BAR = 9;
const XL = 84, XR = W - 84 - BAR; // Balken links/rechts
const PV_SLOT = 110; // PV Dach + PV Carport, je ≥ 44 px Touch-Ziel auch bei 360 px Breite
const SLOT = 54;

const SRC: Record<SankeySource, { label: string; color: string; fill: string }> = {
  pv: { label: 'PV', color: 'var(--c-sun)', fill: 'pv' },
  battery: { label: 'Akku', color: 'var(--c-battery)', fill: 'battery' },
  grid: { label: 'Netzbezug', color: 'var(--c-grid)', fill: 'grid' },
};
const TGT: Record<SankeyTarget, { label: string; color: string; node: NodeId; fill: string }> = {
  export: { label: 'Einspeisung', color: 'var(--c-grid)', node: 'grid', fill: 'grid' },
  batteryCharge: { label: 'Akku laden', color: 'var(--c-battery)', node: 'battery', fill: 'battery' },
  house: { label: 'Haus', color: 'var(--text)', node: 'house', fill: 'house' },
};
const SRC_NODE: Record<Exclude<SankeySource, 'pv'>, NodeId> = { battery: 'battery', grid: 'grid' };

function Patterns({ id }: { id: string }) {
  return (
    <defs>
      <pattern id={`${id}-battery`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="1" y1="0" x2="1" y2="6" stroke="var(--c-battery)" strokeWidth="2" />
      </pattern>
      <pattern id={`${id}-grid`} width="5" height="5" patternUnits="userSpaceOnUse">
        <circle cx="2.5" cy="2.5" r="1.2" fill="var(--c-grid)" />
      </pattern>
    </defs>
  );
}

export function FlowSankey({ live, summary, isLive, selected, onSelect }: Props) {
  const pid = useId().replace(/:/g, '');
  const e = summary?.energy;
  const flows = e ? sankeyFlows(e) : [];
  const L = sankeyLayout(flows, { height: HEIGHT, gap: 12, minSlot: { pv: PV_SLOT }, defaultSlot: SLOT });
  const has = !!e && L.total > 0;

  const aria = e
    ? `Energiefluss: PV ${join(energy(e.pv))}, Netzbezug ${join(energy(e.gridImport))}, Akku-Entladung ${join(energy(e.batteryDischarge))} → ` +
      `Haus ${join(energy(e.house))}, Akku laden ${join(energy(e.batteryCharge))}, Einspeisung ${join(energy(e.gridExport))}`
    : 'Energiefluss – lädt';

  return (
    <div className="alt-flow">
      {isLive && <LiveStrip live={live} onSelect={onSelect} />}

      <svg className="flow sankey" viewBox={`0 0 ${W} ${HEIGHT}`} role="group" aria-label="Energiefluss im Zeitraum">
        <Patterns id={pid} />
        <g role="img" aria-label={aria}>
          {L.bands.map((b) => {
            const d = bandPath(b, XL + BAR, XR);
            const s = SRC[b.from];
            return (
              <g key={`${b.from}-${b.to}`} className="band">
                <path d={d} fill={s.color} className="band-fill" />
                {b.from !== 'pv' && <path d={d} fill={`url(#${pid}-${b.from})`} className="band-pattern" />}
              </g>
            );
          })}
          {!has && <text x={W / 2} y={HEIGHT / 2} textAnchor="middle" className="fl">{summary ? 'Keine Energieflüsse im Zeitraum' : 'lädt …'}</text>}
        </g>

        {/* Quellen links */}
        {L.sources.map((n) => {
          const s = SRC[n.id];
          if (n.id === 'pv') {
            // Balken in Dach / Carport geteilt, beide Hälften einzeln antippbar
            const roofShare = e && e.pv > 0 ? e.pvRoof / e.pv : 0.5;
            const hRoof = n.h * roofShare;
            const halves: { id: NodeId; label: string; kwh: number | undefined; y: number }[] = [
              { id: 'pvRoof', label: 'PV Dach', kwh: e?.pvRoof, y: n.slotY },
              { id: 'pvCarport', label: 'PV Carport', kwh: e?.pvCarport, y: n.slotY + n.slotH / 2 },
            ];
            return (
              <g key="pv" style={{ color: s.color }}>
                <rect x={XL} y={n.y} width={BAR} height={Math.max(hRoof, 0)} className="bar" />
                <rect x={XL} y={n.y + hRoof} width={BAR} height={Math.max(n.h - hRoof, 0)} className="bar alt" />
                {halves.map((hv) => (
                  <g key={hv.id} className={`node${selected === hv.id ? ' sel' : ''}`} aria-label={`${hv.label} – Details`} {...press(() => onSelect(hv.id))}>
                    <rect x={0} y={hv.y} width={XL + BAR + 4} height={n.slotH / 2} className="hit" />
                    <text x={XL - 6} y={hv.y + n.slotH / 4 - 4} textAnchor="end" className="fl">{hv.label}</text>
                    <Value f={energy(hv.kwh)} x={XL - 6} y={hv.y + n.slotH / 4 + 15} anchor="end" big />
                  </g>
                ))}
              </g>
            );
          }
          const id = SRC_NODE[n.id];
          return (
            <g key={n.id} className={`node${selected === id ? ' sel' : ''}`} style={{ color: s.color }} aria-label={`${s.label} – Details`} {...press(() => onSelect(id))}>
              <rect x={0} y={n.slotY} width={XL + BAR + 4} height={n.slotH} className="hit" />
              {n.h > 0 && <rect x={XL} y={n.y} width={BAR} height={n.h} className={`bar ${s.fill}`} />}
              <text x={XL - 6} y={n.slotY + n.slotH / 2 - 4} textAnchor="end" className="fl">{s.label}</text>
              <Value f={energy(n.kwh)} x={XL - 6} y={n.slotY + n.slotH / 2 + 15} anchor="end" big />
            </g>
          );
        })}

        {/* Ziele rechts */}
        {L.targets.map((n) => {
          const t = TGT[n.id];
          return (
            <g key={n.id} className={`node${selected === t.node ? ' sel' : ''}`} style={{ color: t.color }} aria-label={`${t.label} – Details`} {...press(() => onSelect(t.node))}>
              <rect x={XR - 4} y={n.slotY} width={W - XR + 4} height={n.slotH} className="hit" />
              {n.h > 0 && <rect x={XR} y={n.y} width={BAR} height={n.h} className={`bar ${t.fill}`} />}
              <text x={XR + BAR + 6} y={n.slotY + n.slotH / 2 - 4} className="fl">{t.label}</text>
              <Value f={energy(n.id === 'house' ? (e?.house ?? n.kwh) : n.kwh)} x={XR + BAR + 6} y={n.slotY + n.slotH / 2 + 15} anchor="start" big />
            </g>
          );
        })}
      </svg>

      <Consumption summary={summary} onSelect={onSelect} />
    </div>
  );
}

/** Momentanwerte als Leiste über der Grafik – die Bänder bleiben Energie. */
function LiveStrip({ live, onSelect }: { live: LiveSnapshot | null; onSelect: (id: NodeId) => void }) {
  const p = live?.power;
  const grid = p?.grid ?? null, bat = p?.battery ?? null;
  const items: { id: NodeId; label: string; v: number | null | undefined; sub?: string; color: string }[] = [
    { id: 'pvRoof', label: 'PV', v: p?.pv, color: 'var(--c-sun)' },
    { id: 'grid', label: grid !== null && grid < 0 ? 'Einsp.' : 'Netz', v: grid, color: 'var(--c-grid)' },
    { id: 'battery', label: bat !== null && bat < 0 ? 'Akku lädt' : 'Akku', v: bat, sub: num(live?.battery.soc, 0, '%'), color: 'var(--c-battery)' },
    { id: 'house', label: 'Haus', v: p?.house, color: 'var(--text)' },
  ];
  return (
    <div className="live-strip" role="group" aria-label="Leistung jetzt">
      {items.map((it) => {
        const f = power(it.v);
        return (
          <button key={it.id} onClick={() => onSelect(it.id)} style={{ '--dot': it.color } as CSSProperties} className={it.v === null || it.v === undefined ? 'stale' : ''}>
            <span className="ls-label">{it.label}</span>
            <span className="ls-value">
              {f.value}
              {f.unit && <small>{f.unit}</small>}
              {it.sub && <em>{it.sub}</em>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

interface Seg { key: string; label: string; kwh: number | undefined; node: NodeId }

function StackBar({ title, aside, segs, onSelect }: { title: string; aside?: string; segs: Seg[]; onSelect: (id: NodeId) => void }) {
  const total = segs.reduce((a, s) => a + Math.max(0, s.kwh ?? 0), 0);
  return (
    <section className="stack">
      <h2>
        {title}
        <span>{aside}</span>
      </h2>
      <div className="stack-bar" role="img" aria-label={`${title}: ${segs.map((s) => `${s.label} ${join(energy(s.kwh))}`).join(', ')}`}>
        {total > 0 && segs.map((s) => ((s.kwh ?? 0) > 0 ? <i key={s.key} className={s.key} style={{ flexGrow: s.kwh }} /> : null))}
      </div>
      <div className="stack-legend">
        {segs.map((s) => (
          <button key={s.key} onClick={() => onSelect(s.node)}>
            <span className="sl-label"><i className={s.key} />{s.label}</span>
            <span className="sl-value">
              {join(energy(s.kwh))}
              <small>{total > 0 && s.kwh !== undefined ? pct(s.kwh / total) : '–'}</small>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function Consumption({ summary, onSelect }: { summary: EnergySummary | null; onSelect: (id: NodeId) => void }) {
  const e = summary?.energy;
  return (
    <div className="stacks">
      <StackBar
        title="Hausverbrauch"
        aside={join(energy(e?.house))}
        onSelect={onSelect}
        segs={[
          { key: 'rest', label: 'Haushalt', kwh: e?.rest, node: 'house' },
          { key: 'heatpump', label: 'Wärmepumpe', kwh: e?.heatpump, node: 'heatpump' },
          { key: 'car', label: 'Auto', kwh: e?.wallbox, node: 'car' },
        ]}
      />
      <StackBar
        title="Wärme"
        aside={e ? `${join(energy(e.heatpumpHeat + e.solarThermal))} · JAZ ${num(summary?.kpi.cop, 1)}` : undefined}
        onSelect={onSelect}
        segs={[
          { key: 'hpheat', label: 'Wärmepumpe', kwh: e?.heatpumpHeat, node: 'heatpump' },
          { key: 'solar', label: 'Solarthermie', kwh: e?.solarThermal, node: 'solarThermal' },
        ]}
      />
    </div>
  );
}
