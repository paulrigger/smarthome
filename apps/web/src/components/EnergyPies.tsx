import { useId } from 'react';
import type { EnergySummary } from '@smarthome/shared';
import { shortLabel, type View } from '../view';
import { energy, join, num, pct } from '../format';

interface Props {
  summary: EnergySummary | null;
  view: View;
}

/** Muster für mono: Akku schraffiert, Netz gepunktet (wie Sankey); Carport/Solarthermie heller. */
type Mark = 'hatch' | 'dots' | 'light';

interface Slice {
  k: string;
  kwh: number;
  color: string;
  mark?: Mark;
  alpha?: number; // Abstufung innerhalb einer Farbe (Geräte nach Rang)
}

interface Pie {
  title: string;
  dot: string; // Farbpunkt der Überschrift
  center: string; // Beschriftung unter der Summe
  slices: Slice[];
  note?: string; // Kennzahl unter der Legende
}

const R = 46, W = 16; // Außenradius, Ringbreite (viewBox 100)

/** Ringsegment von a0 bis a1 (Bogenmaß, 0 = oben, im Uhrzeigersinn). */
function sector(a0: number, a1: number): string {
  const r0 = R - W;
  const p = (r: number, a: number) => `${(50 + r * Math.sin(a)).toFixed(2)} ${(50 - r * Math.cos(a)).toFixed(2)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${p(R, a0)} A${R} ${R} 0 ${large} 1 ${p(R, a1)} L${p(r0, a1)} A${r0} ${r0} 0 ${large} 0 ${p(r0, a0)} Z`;
}

function Donut({ pie, pid }: { pie: Pie; pid: string }) {
  const total = pie.slices.reduce((a, s) => a + Math.max(0, s.kwh), 0);
  const tf = energy(total);
  let a = 0;
  const parts = pie.slices.map((s) => {
    const share = total > 0 ? Math.max(0, s.kwh) / total : 0;
    const a0 = a;
    a += share * 2 * Math.PI;
    return { ...s, share, a0, a1: a };
  });
  const aria = `${pie.title}: ${join(tf)} – ` + parts.map((p) => `${p.k} ${join(energy(p.kwh))} (${pct(p.share)})`).join(', ');
  return (
    <section className="pie">
      <h3 style={{ '--dot': pie.dot } as React.CSSProperties}>{pie.title}</h3>
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
          <text x="50" y="64" textAnchor="middle" className="pie-center">{pie.center}</text>
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
              <span className="pie-p">{total <= 0 ? '–' : p.share > 0 && p.share < 0.005 ? '< 1 %' : pct(p.share)}</span>
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
const clean = (n: string) => n.replace(/\u00ad/g, ''); // weiche Trennstriche aus names.ts

/** Haushalt (ohne WP/Auto) nach Geräten: größte zuerst, abgestuft in einer Farbe; Rest = nicht einzeln gemessen. */
function deviceSlices(s: EnergySummary | null): Slice[] {
  const apps = [...(s?.appliances ?? [])].filter((a) => a.kwh > 0).sort((a, b) => b.kwh - a.kwh);
  const top = apps.slice(0, TOP).map((a, i): Slice => ({ k: clean(a.name), kwh: a.kwh, color: 'var(--text)', alpha: ALPHA[i] }));
  const more = apps.slice(TOP).reduce((x, a) => x + a.kwh, 0);
  const sum = apps.reduce((x, a) => x + a.kwh, 0);
  const rest = Math.max(0, (s?.energy.rest ?? 0) - sum); // Messzeitversatz kann Geräte > Haushalt machen → nie negativ
  return [
    ...top,
    ...(more > 0 ? [{ k: 'Weitere Geräte', kwh: more, color: 'var(--text)', alpha: 0.2 }] : []),
    { k: 'Rest', kwh: rest, color: 'var(--muted)', mark: 'hatch' },
  ];
}

function measured(s: EnergySummary | null): number | null {
  const rest = s?.energy.rest;
  if (!s || !rest) return null;
  return Math.min(1, s.appliances.reduce((x, a) => x + Math.max(0, a.kwh), 0) / rest);
}

/** Energie im Zeitraum als Ringdiagramme: Anteil am Ganzen je Diagramm (Prozent) + kWh. Ersetzt die Bilanztabellen. */
export function EnergyPies({ summary, view }: Props) {
  const pid = useId().replace(/:/g, '');
  const e = summary?.energy;
  const k = summary?.kpi;
  const z = (x: number | undefined) => x ?? 0;
  // PV direkt = PV − Einspeisung − Akkuladung (Akku lädt nur aus PV, hybrid.ts); nie negativ
  const pvDirect = Math.max(0, z(e?.pv) - z(e?.gridExport) - z(e?.batteryCharge));

  const pies: Pie[] = [
    {
      title: 'PV-Erzeugung', dot: 'var(--c-sun)', center: 'PV',
      slices: [
        { k: 'PV Dach', kwh: z(e?.pvRoof), color: 'var(--c-sun)' },
        { k: 'PV Carport', kwh: z(e?.pvCarport), color: 'var(--c-sun)', mark: 'light' },
      ],
    },
    {
      title: 'PV-Verwendung', dot: 'var(--c-sun)', center: 'PV',
      slices: [
        { k: 'Direkt', kwh: pvDirect, color: 'var(--c-sun)' },
        { k: 'Akku', kwh: z(e?.batteryCharge), color: 'var(--c-battery)', mark: 'hatch' },
        { k: 'Einspeisung', kwh: z(e?.gridExport), color: 'var(--c-grid)', mark: 'dots' },
      ],
      note: `Eigenverbrauch ${pct(k?.selfConsumption)}`,
    },
    {
      title: 'Verbrauch nach Herkunft', dot: 'var(--flow-elec)', center: 'Verbrauch',
      slices: [
        { k: 'PV direkt', kwh: pvDirect, color: 'var(--c-sun)' },
        { k: 'Akku', kwh: z(e?.batteryDischarge), color: 'var(--c-battery)', mark: 'hatch' },
        { k: 'Netz', kwh: z(e?.gridImport), color: 'var(--c-grid)', mark: 'dots' },
      ],
      note: `Autarkie ${pct(k?.selfSufficiency)}`,
    },
    {
      title: 'Verbrauch nach Verbraucher', dot: 'var(--flow-elec)', center: 'Verbrauch',
      slices: [
        { k: 'Haushalt', kwh: z(e?.rest), color: 'var(--muted)' },
        { k: 'Wärmepumpe', kwh: z(e?.heatpump), color: 'var(--c-heat)' },
        { k: 'Auto', kwh: z(e?.wallbox), color: 'var(--c-car)', mark: 'hatch' },
      ],
    },
    {
      title: 'Haushalt nach Geräten', dot: 'var(--flow-elec)', center: 'Haushalt',
      slices: deviceSlices(summary),
      note: `Gemessene Geräte ${pct(measured(summary))} vom Haushalt`,
    },
    {
      title: 'Wärme', dot: 'var(--flow-heat)', center: 'Wärme',
      slices: [
        { k: 'Wärmepumpe', kwh: z(e?.heatpumpHeat), color: 'var(--c-heat)' },
        { k: 'Solarthermie', kwh: z(e?.solarThermal), color: 'var(--c-warmth)', mark: 'hatch' },
      ],
      note: `Arbeitszahl WP ${num(k?.cop, 1)} · Strom WP ${join(energy(e?.heatpump))}`,
    },
  ];

  return (
    <section className="pies" aria-busy={!summary}>
      <h2>
        Energie <span>{shortLabel(view)}</span>
      </h2>
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
      <div className="pie-grid">
        {pies.map((p) => (
          <Donut key={p.title} pie={p} pid={pid} />
        ))}
      </div>
    </section>
  );
}
