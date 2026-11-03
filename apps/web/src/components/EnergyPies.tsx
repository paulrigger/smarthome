import { useId } from 'react';
import { APPLIANCE_NAMES, type EnergySummary } from '@smarthome/shared';
import { shortLabel, type View } from '../view';
import { energy, join, num, pct } from '../format';
import type { SeriesSpec } from './Charts';
import { press } from './EnergyFlow';
import { ChevronRight } from './Icons';

/** Muster für mono: Akku schraffiert, Netz gepunktet (wie Sankey); Carport/Solarthermie heller. */
type Mark = 'hatch' | 'dots' | 'light';

interface Slice {
  k: string;
  kwh: number;
  color: string;
  mark?: Mark;
  alpha?: number; // Abstufung innerhalb einer Farbe (Geräte nach Rang)
}

export type PieId = 'pvGen' | 'pvUse' | 'origin' | 'consumers' | 'household' | 'heat';

export interface Pie {
  id: PieId;
  title: string;
  dot: string; // Farbpunkt der Überschrift
  center: string; // Beschriftung unter der Summe
  slices: Slice[];
  note?: string; // Kennzahl unter der Legende
  /** Detail-Popup: gestapelte Energiebalken + Leistungslinien derselben Anteile */
  bars: SeriesSpec[];
  lines: SeriesSpec[];
  page: { to: string; label: string; section?: string }; // weiterführende Seite
}

const R = 46, W = 14; // Außenradius, Ringbreite (viewBox 100)

/** Ringsegment von a0 bis a1 (Bogenmaß, 0 = oben, im Uhrzeigersinn). */
function sector(a0: number, a1: number): string {
  const r0 = R - W;
  const p = (r: number, a: number) => `${(50 + r * Math.sin(a)).toFixed(2)} ${(50 - r * Math.cos(a)).toFixed(2)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${p(R, a0)} A${R} ${R} 0 ${large} 1 ${p(R, a1)} L${p(r0, a1)} A${r0} ${r0} 0 ${large} 0 ${p(r0, a0)} Z`;
}

/** Anteile mit Prozent und Winkeln. */
export function pieParts(pie: Pie) {
  const total = pie.slices.reduce((a, s) => a + Math.max(0, s.kwh), 0);
  let a = 0;
  const parts = pie.slices.map((s) => {
    const share = total > 0 ? Math.max(0, s.kwh) / total : 0;
    const a0 = a;
    a += share * 2 * Math.PI;
    return { ...s, share, a0, a1: a };
  });
  return { total, parts };
}

export const sharePct = (total: number, share: number) => (total <= 0 ? '–' : share > 0 && share < 0.005 ? '< 1 %' : pct(share));

function Donut({ pie, pid, onOpen }: { pie: Pie; pid: string; onOpen?: (id: PieId) => void }) {
  const { total, parts } = pieParts(pie);
  const tf = energy(total);
  const aria = `${pie.title}: ${join(tf)} – ` + parts.map((p) => `${p.k} ${join(energy(p.kwh))} (${pct(p.share)})`).join(', ');
  return (
    <section className={`pie${onOpen ? ' tap' : ''}`} {...(onOpen ? press(() => onOpen(pie.id)) : {})} aria-label={onOpen ? `${pie.title} – Details` : undefined}>
      <h3 style={{ '--dot': pie.dot } as React.CSSProperties}>
        {pie.title}
        {onOpen && <ChevronRight size={18} />}
      </h3>
      <div className="pie-body">
        <svg viewBox="0 0 100 100" role="img" aria-label={aria}>
          <circle cx="50" cy="50" r={R - W / 2} className="pie-track" strokeWidth={W} />
          {parts.map((p) =>
            p.share <= 0 ? null : p.share >= 0.9999 ? (
              <g key={p.k}>
                <circle cx="50" cy="50" r={R - W / 2} fill="none" stroke={p.color} strokeOpacity={p.alpha} strokeWidth={W} className={p.mark === 'light' ? 'light' : ''} />
                {p.mark && p.mark !== 'light' && <circle cx="50" cy="50" r={R - W / 2} fill="none" stroke={`url(#${pid}-${p.mark})`} strokeWidth={W} />}
              </g>
            ) : (
              <g key={p.k} className="pie-slice">
                <path d={sector(p.a0, p.a1)} fill={p.color} fillOpacity={p.alpha} className={p.mark === 'light' ? 'light' : ''} />
                {p.mark && p.mark !== 'light' && <path d={sector(p.a0, p.a1)} fill={`url(#${pid}-${p.mark})`} />}
              </g>
            ),
          )}
          <text x="50" y="52" textAnchor="middle" className="pie-total">
            {tf.value}
            <tspan className="pie-unit" dx="1.5">{tf.unit}</tspan>
          </text>
          <text x="50" y="66" textAnchor="middle" className="pie-center">{pie.center}</text>
        </svg>
        <ul>
          {parts.map((p) => (
            <li key={p.k}>
              <svg viewBox="0 0 12 12" aria-hidden className="pie-sw">
                <rect width="12" height="12" rx="3" fill={p.color} fillOpacity={p.alpha} className={p.mark === 'light' ? 'light' : ''} />
                {p.mark && p.mark !== 'light' && <rect width="12" height="12" rx="3" fill={`url(#${pid}-${p.mark})`} />}
              </svg>
              <span className="pie-k">{p.k}</span>
              <span className="pie-v">{join(energy(p.kwh))}</span>
              <span className="pie-p">{sharePct(total, p.share)}</span>
            </li>
          ))}
        </ul>
      </div>
      {pie.note && <p className="pie-note">{pie.note}</p>}
    </section>
  );
}

const TOP = 5; // einzeln gezeigte Geräte, Rest als "Weitere Geräte"
const ALPHA = [1, 0.78, 0.6, 0.45, 0.32];
const clean = (n: string) => n.replace(/­/g, ''); // weiche Trennstriche aus names.ts
/** Graustufe für Linien/Balken (SeriesSpec kennt keine Deckkraft). */
const shade = (a: number) => `color-mix(in srgb, var(--text) ${Math.round(a * 100)}%, var(--surface))`;

/** Haushalt (ohne WP/Auto) nach Geräten: größte zuerst, abgestuft in einer Farbe; Rest = nicht einzeln gemessen. */
function deviceSlices(s: EnergySummary | null): Slice[] {
  const apps = [...(s?.appliances ?? [])].filter((a) => a.kwh > 0).sort((a, b) => b.kwh - a.kwh);
  const n = apps.length === TOP + 1 ? TOP + 1 : TOP; // ein einzelnes übriges Gerät beim Namen nennen
  const top = apps.slice(0, n).map((a, i): Slice => ({ k: clean(a.name), kwh: a.kwh, color: 'var(--text)', alpha: ALPHA[i] ?? 0.2 }));
  const more = apps.slice(n).reduce((x, a) => x + a.kwh, 0);
  const sum = apps.reduce((x, a) => x + a.kwh, 0);
  const rest = Math.max(0, (s?.energy.rest ?? 0) - sum); // Messzeitversatz kann Geräte > Haushalt machen → nie negativ
  return [
    ...top,
    ...(more > 0 ? [{ k: 'Weitere Geräte', kwh: more, color: 'var(--text)', alpha: 0.2 }] : []),
    { k: 'Rest', kwh: rest, color: 'var(--muted)', mark: 'hatch' },
  ];
}

/** Geräte für die Detail-Diagramme: alle, nach Energie im Zeitraum sortiert, + nicht erfasster Rest. */
function deviceSeries(s: EnergySummary | null, suffix: '' | '.power'): SeriesSpec[] {
  const kwh = new Map((s?.appliances ?? []).map((a) => [a.id, a.kwh]));
  const ids = Object.keys(APPLIANCE_NAMES).sort((a, b) => (kwh.get(b) ?? 0) - (kwh.get(a) ?? 0));
  return [
    ...ids.map((id, i) => ({ key: `appliance.${id}${suffix}`, label: clean(APPLIANCE_NAMES[id]), color: shade(Math.max(0.25, 1 - i * 0.1)) })),
    { key: `unmeasured${suffix}`, label: 'Rest (nicht erfasst)', color: 'var(--muted)' },
  ];
}

function measured(s: EnergySummary | null): number | null {
  const rest = s?.energy.rest;
  if (!s || !rest) return null;
  return Math.min(1, s.appliances.reduce((x, a) => x + Math.max(0, a.kwh), 0) / rest);
}

const sp = (key: string, label: string, color: string): SeriesSpec => ({ key, label, color });
const LIGHT = (c: string) => `color-mix(in srgb, ${c} 45%, var(--surface))`;

/** Alle Ringdiagramme des Zeitraums (auch für das Detail-Popup). */
export function buildPies(summary: EnergySummary | null): Pie[] {
  const e = summary?.energy;
  const k = summary?.kpi;
  const z = (x: number | undefined) => x ?? 0;
  // PV direkt = PV − Einspeisung − Akkuladung (Akku lädt nur aus PV, hybrid.ts); nie negativ
  const pvDirect = Math.max(0, z(e?.pv) - z(e?.gridExport) - z(e?.batteryCharge));
  return [
    {
      id: 'pvGen', title: 'PV-Erzeugung', dot: 'var(--c-sun)', center: 'PV',
      slices: [
        { k: 'PV Dach', kwh: z(e?.pvRoof), color: 'var(--c-sun)' },
        { k: 'PV Carport', kwh: z(e?.pvCarport), color: 'var(--c-sun)', mark: 'light' },
      ],
      bars: [sp('pvRoof', 'PV Dach', 'var(--c-sun)'), sp('pvCarport', 'PV Carport', LIGHT('var(--c-sun)'))],
      lines: [sp('pvRoof.power', 'PV Dach', 'var(--c-sun)'), sp('pvCarport.power', 'PV Carport', LIGHT('var(--c-sun)'))],
      page: { to: '/verlauf', label: 'Verlauf' },
    },
    {
      id: 'pvUse', title: 'PV-Verwendung', dot: 'var(--c-sun)', center: 'PV',
      slices: [
        { k: 'Direkt', kwh: pvDirect, color: 'var(--c-sun)' },
        { k: 'Akku', kwh: z(e?.batteryCharge), color: 'var(--c-battery)', mark: 'hatch' },
        { k: 'Einspeisung', kwh: z(e?.gridExport), color: 'var(--c-grid)', mark: 'dots' },
      ],
      note: `Eigenverbrauch ${pct(k?.selfConsumption)}`,
      bars: [sp('pvDirect', 'Direkt', 'var(--c-sun)'), sp('batteryCharge', 'Akku', 'var(--c-battery)'), sp('gridExport', 'Einspeisung', 'var(--c-grid)')],
      lines: [sp('pvDirect.power', 'Direkt', 'var(--c-sun)'), sp('batteryCharge.power', 'Akku laden', 'var(--c-battery)'), sp('gridExport.power', 'Einspeisung', 'var(--c-grid)')],
      page: { to: '/kosten', label: 'Kosten & Erlöse' },
    },
    {
      id: 'origin', title: 'Verbrauch nach Herkunft', dot: 'var(--flow-elec)', center: 'Verbrauch',
      slices: [
        { k: 'PV direkt', kwh: pvDirect, color: 'var(--c-sun)' },
        { k: 'Akku', kwh: z(e?.batteryDischarge), color: 'var(--c-battery)', mark: 'hatch' },
        { k: 'Netz', kwh: z(e?.gridImport), color: 'var(--c-grid)', mark: 'dots' },
      ],
      note: `Autarkie ${pct(k?.selfSufficiency)}`,
      bars: [sp('pvDirect', 'PV direkt', 'var(--c-sun)'), sp('batteryDischarge', 'Akku', 'var(--c-battery)'), sp('gridImport', 'Netz', 'var(--c-grid)')],
      lines: [sp('pvDirect.power', 'PV direkt', 'var(--c-sun)'), sp('batteryDischarge.power', 'Akku', 'var(--c-battery)'), sp('gridImport.power', 'Netz', 'var(--c-grid)')],
      page: { to: '/kosten', label: 'Kosten & Erlöse' },
    },
    {
      id: 'consumers', title: 'Verbrauch nach Verbraucher', dot: 'var(--flow-elec)', center: 'Verbrauch',
      slices: [
        { k: 'Haushalt', kwh: z(e?.rest), color: 'var(--muted)' },
        { k: 'Wärmepumpe', kwh: z(e?.heatpump), color: 'var(--c-heat)' },
        { k: 'Auto', kwh: z(e?.wallbox), color: 'var(--c-car)', mark: 'hatch' },
      ],
      bars: [sp('rest', 'Haushalt', 'var(--muted)'), sp('heatpump', 'Wärmepumpe', 'var(--c-heat)'), sp('wallbox', 'Auto', 'var(--c-car)')],
      lines: [sp('rest.power', 'Haushalt', 'var(--muted)'), sp('heatpump.power', 'Wärmepumpe', 'var(--c-heat)'), sp('wallbox.power', 'Auto', 'var(--c-car)')],
      page: { to: '/verlauf', label: 'Verlauf' },
    },
    {
      id: 'household', title: 'Haushalt nach Geräten', dot: 'var(--flow-elec)', center: 'Haushalt',
      slices: deviceSlices(summary),
      note: `Gemessene Geräte ${pct(measured(summary))} vom Haushalt`,
      bars: deviceSeries(summary, ''),
      lines: deviceSeries(summary, '.power'),
      page: { to: '/verlauf', label: 'Verlauf · Haushalt', section: 'haushalt' },
    },
    {
      id: 'heat', title: 'Wärme', dot: 'var(--flow-heat)', center: 'Wärme',
      slices: [
        { k: 'Wärmepumpe', kwh: z(e?.heatpumpHeat), color: 'var(--c-heat)' },
        { k: 'Solarthermie', kwh: z(e?.solarThermal), color: 'var(--c-warmth)', mark: 'hatch' },
      ],
      note: `Arbeitszahl WP ${num(k?.cop, 1)} · Strom WP ${join(energy(e?.heatpump))}`,
      bars: [sp('heatpumpHeat', 'Wärmepumpe', 'var(--c-heat)'), sp('solarThermal', 'Solarthermie', 'var(--c-warmth)')],
      lines: [sp('heatpump.heat', 'Wärmepumpe', 'var(--c-heat)'), sp('solarThermal.power', 'Solarthermie', 'var(--c-warmth)')],
      page: { to: '/waerme', label: 'Wärme' },
    },
  ];
}

/** Muster-Definitionen (einmal je Seite/Popup). */
export function PieDefs({ pid }: { pid: string }) {
  return (
    <svg width="0" height="0" aria-hidden style={{ position: 'absolute' }}>
      <defs>
        <pattern id={`${pid}-hatch`} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="1" y1="0" x2="1" y2="4" stroke="var(--bg)" strokeWidth="1.2" strokeOpacity="0.7" />
        </pattern>
        <pattern id={`${pid}-dots`} width="4" height="4" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="0.9" fill="var(--bg)" fillOpacity="0.75" />
        </pattern>
      </defs>
    </svg>
  );
}

/** Energie im Zeitraum als Ringdiagramme; ganzes Diagramm antippen → Detail-Popup (onOpen). */
export function EnergyPies({ summary, view, onOpen }: { summary: EnergySummary | null; view: View; onOpen?: (id: PieId) => void }) {
  const pid = useId().replace(/:/g, '');
  return (
    <section className="pies" aria-busy={!summary}>
      <h2>
        Energie <span>{shortLabel(view)}</span>
      </h2>
      <PieDefs pid={pid} />
      <div className="pie-grid">
        {buildPies(summary).map((p) => (
          <Donut key={p.id} pie={p} pid={pid} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}
