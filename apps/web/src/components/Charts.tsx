// Schlanke SVG-Diagramme (keine Library): Balken für Energie je Bucket, Linien für Leistung/Temperatur.
// Interaktion: Hover/Tippen auf einen Bucket zeigt die Werte im Tooltip; per Finger bleibt er stehen, bis woanders getippt wird.
import { useEffect, useMemo, useRef, useState, type PointerEvent, type RefObject } from 'react';
import type { Period, SeriesData, Step } from '@smarthome/shared';
import { zonedParts } from '@smarthome/shared';
import { energy, join, num, power } from '../format';

export interface SeriesSpec {
  key: string;
  label: string;
  color: string; // CSS-Farbe/Token
}

const W = 340;
const PAD = { l: 44, r: 8, t: 20, b: 22 }; // links Platz für "−1,5", oben für die Einheit der y-Achse
const TZ = 'Europe/Vienna';

const fHour = new Intl.DateTimeFormat('de-AT', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const fDay = new Intl.DateTimeFormat('de-AT', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'numeric' });
const fMonth = new Intl.DateTimeFormat('de-AT', { timeZone: TZ, month: 'long' });
const fMonthYear = new Intl.DateTimeFormat('de-AT', { timeZone: TZ, month: 'short', year: 'numeric' });
const fMonthShort = new Intl.DateTimeFormat('de-AT', { timeZone: TZ, month: 'narrow' });

/** Beschriftung eines Buckets für den Readout (Gesamt: Monat mit Jahr). */
function bucketLabel(t: Date, step: Step, next?: Date, period?: Period): string {
  if (step === '5m') return `${fHour.format(t)} Uhr`;
  if (step === '1h') return `${fHour.format(t)}–${next ? fHour.format(next) : ''} Uhr`;
  if (step === '1d') return fDay.format(t);
  if (step === '1y') return String(zonedParts(t).year);
  return period === 'all' ? fMonthYear.format(t) : fMonth.format(t);
}

/** Achsenbeschriftung (nur jede n-te). Über formatToParts – robust auch in Safari. */
function tick(t: Date, period: Period, step: Step): string | null {
  const p = zonedParts(t);
  if (period === 'day') return p.minute === 0 && p.hour % 3 === 0 ? `${p.hour}:00` : null;
  if (period === 'month') {
    const dayStart = step === '1h' ? p.hour === 0 : true;
    return dayStart && (p.day === 1 || p.day % 5 === 0) ? `${p.day}.` : null;
  }
  if (step === '1y') return String(p.year);
  if (period === 'all') return p.month === 1 ? String(p.year) : null;
  if (step === '1d') return p.day === 1 ? fMonthShort.format(t) : null;
  return fMonthShort.format(t);
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

type Fmt = (v: number | null) => string;
const fmtEnergy: Fmt = (v) => join(energy(v));
export const fmtPower: Fmt = (v) => join(power(v));
export const fmtTemp: Fmt = (v) => num(v, 1, '°C');
export const fmtPct: Fmt = (v) => num(v, 0, '%');
export const fmtPpm: Fmt = (v) => num(v, 0, 'ppm');
export const fmtNum: Fmt = (v) => num(v, 1);

/** y-Achse: Zahlen ohne Einheit, die Einheit steht einmal über der Achse; Leistung ab 1 kW in kW. */
function axisScale(maxAbs: number, unit: string): { unit: string; div: number } {
  return unit === 'W' && maxAbs >= 1000 ? { unit: 'kW', div: 1000 } : { unit, div: 1 };
}

function axisLabel(raw: number, unit: string): string {
  const v = Math.abs(raw) < (unit === 'W' ? 0.5 : 0.005) ? 0 : raw; // kein "−0" aus Rundung
  if (unit === 'kW') return num(v, Math.abs(v) >= 10 || Number.isInteger(+v.toFixed(1)) ? 0 : 1); // "1", "1,5", "12"
  if (unit === 'kWh') return num(v, v < 10 && v % 1 ? 1 : 0);
  if (unit === '€') return num(v, v !== 0 && Math.abs(v) < 2 ? 2 : v % 1 ? 1 : 0);
  return num(v, 0);
}

/** Einheit über den Achsenzahlen (rechtsbündig wie die Zahlen). */
function AxisUnit({ unit }: { unit: string }) {
  return unit ? <text x={PAD.l - 6} y={PAD.t - 8} textAnchor="end" className="chart-tick chart-unit">{unit}</text> : null;
}

/** Touch: Tooltip bleibt nach dem Loslassen stehen; Tippen außerhalb des Diagramms schließt ihn. */
function useTapAway(ref: RefObject<Element | null>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: globalThis.PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [ref, open, close]);
}

interface Props {
  data: SeriesData | null;
  series: SeriesSpec[];
  title: string;
  unit: string; // Achse: 'kWh' | 'W' | '°C' | '%' | ...
  format?: Fmt;
  height?: number;
}

function useHover(n: number) {
  const ref = useRef<SVGSVGElement>(null);
  const [i, setI] = useState<number | null>(null);
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = ref.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const idx = Math.floor(((x - PAD.l) / (W - PAD.l - PAD.r)) * n);
    if (idx >= 0 && idx < n) setI(idx);
    else if (e.pointerType === 'mouse') setI(null);
  };
  const clear = useMemo(() => () => setI(null), []);
  useTapAway(ref, i !== null, clear);
  // Maus: Verlassen schließt; Finger: Tooltip bleibt (sonst müsste man draufbleiben und iOS beginnt zu markieren)
  return { ref, i, onMove, onLeave: (e: PointerEvent<SVGSVGElement>) => e.pointerType === 'mouse' && setI(null) };
}

/** Vergleichszeitraum, Buckets nach Index ausgerichtet (Tag i, Monat i …); Legenden-Key CMP blendet ihn aus. */
export interface Compare {
  data: SeriesData | null;
  label: string; // z. B. "2025", "Sep. 2026"
}
export const CMP = '_cmp';
const CMP_SWATCH = 'cmp'; // Tooltip-Zeile des Vergleichs: Strich statt Farbfeld

const sumOrNull = (xs: (number | null | undefined)[]) => (xs.every((v) => v === null || v === undefined) ? null : xs.reduce<number>((a, v) => a + Math.max(0, v ?? 0), 0));

/** Ausgeblendete Serien: intern oder von außen gesteuert (z. B. im localStorage gemerkt). */
export interface Toggle {
  hidden?: string[];
  onToggle?: (key: string) => void;
}

function useToggle({ hidden, onToggle }: Toggle): [Set<string>, (key: string) => void] {
  const [own, setOwn] = useState<string[]>([]);
  const list = hidden ?? own;
  const toggle = onToggle ?? ((k: string) => setOwn((h) => (h.includes(k) ? h.filter((x) => x !== k) : [...h, k])));
  return [new Set(list), toggle];
}

/** Legende = Schalter: Antippen blendet die Serie aus/ein. Vergleich als eigener Schalter (Strich-Symbol, Wert optional). */
function Legend({ series, values, format, off, onToggle, cmp }: {
  series: SeriesSpec[]; values: (number | null)[]; format: Fmt; off: Set<string>; onToggle: (key: string) => void;
  cmp?: { label: string; value?: number | null } | null;
}) {
  return (
    <div className="chart-legend" role="group" aria-label="Serien ein- und ausblenden">
      {series.map((s, j) => (
        <button key={s.key} type="button" aria-pressed={!off.has(s.key)} className={off.has(s.key) ? 'off' : ''} onClick={() => onToggle(s.key)}>
          <i style={{ background: s.color, borderColor: s.color }} />
          {s.label}
          <b>{format(values[j])}</b>
        </button>
      ))}
      {cmp && (
        <button type="button" aria-pressed={!off.has(CMP)} className={`cmp${off.has(CMP) ? ' off' : ''}`} onClick={() => onToggle(CMP)}>
          <i />
          {cmp.label}
          {cmp.value !== undefined && <b>{format(cmp.value)}</b>}
        </button>
      )}
    </div>
  );
}

/** Tooltip über dem Diagramm an der Hover-Position. */
function Tip({ xFrac, label, rows }: { xFrac: number; label: string; rows: { color: string; label: string; value: string }[] }) {
  const align = xFrac < 0.25 ? 'left' : xFrac > 0.75 ? 'right' : 'center';
  return (
    <div className={`chart-tip ${align}`} style={{ left: `${xFrac * 100}%` }} role="status">
      <strong>{label}</strong>
      {rows.map((r) => (
        <span key={r.label}>
          {r.color === CMP_SWATCH ? <i className="cmp" /> : <i style={{ background: r.color }} />}
          {r.label}
          <b>{r.value}</b>
        </span>
      ))}
    </div>
  );
}

function Frame({ title, readout, children }: { title: string; readout: string; children: React.ReactNode }) {
  return (
    <figure className="chart">
      <figcaption>
        <span>{title}</span>
        <span className="chart-readout">{readout}</span>
      </figcaption>
      {children}
    </figure>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="chart-empty">{text}</div>;
}

// ------------------------------------------------------------------ Balken

export function BarChart({ data, series: all, title, unit = 'kWh', format = fmtEnergy, height = 150, stacked = false, legendValues, compare, ...tg }: Props & Toggle & { stacked?: boolean; legendValues?: (number | null)[]; compare?: Compare | null }) {
  const n = data?.t.length ?? 0;
  const hv = useHover(n);
  const H = height;
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const [off, toggle] = useToggle(tg);
  const offKey = [...off].join();
  const series = useMemo(() => all.filter((s) => !off.has(s.key)), [all, offKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const cd = compare?.data && !off.has(CMP) ? compare.data : null;
  // Vergleichswert je Bucket: gestapelt die Summe der sichtbaren Serien, sonst je Serie
  const cmpAt = (i: number, key?: string) => (key ? cd?.values[key]?.[i] ?? null : sumOrNull(series.map((s) => cd?.values[s.key]?.[i])));

  const { max, totals } = useMemo(() => {
    if (!data) return { max: 1, totals: all.map(() => 0) };
    const totals = all.map((s) => (data.values[s.key] ?? []).reduce<number>((a, v) => a + (v ?? 0), 0));
    let m = 0;
    for (let i = 0; i < n; i++) {
      const vals = series.map((s) => data.values[s.key]?.[i] ?? 0);
      if (vals.length) m = Math.max(m, stacked ? vals.reduce((a, b) => a + b, 0) : Math.max(...vals));
      if (cd) m = Math.max(m, stacked ? cmpAt(i) ?? 0 : Math.max(0, ...series.map((s) => cmpAt(i, s.key) ?? 0)));
    }
    return { max: niceMax(m), totals };
  }, [data, all, series, stacked, n, cd]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return <Frame title={title} readout=""><Empty text="Lade …" /></Frame>;

  const times = data.t.map((t) => new Date(t));
  const slot = plotW / n;
  const groupW = Math.max(1, slot - Math.min(4, slot * 0.25));
  const barW = stacked ? groupW : Math.max(1, (groupW - (series.length - 1)) / Math.max(1, series.length));
  const y = (v: number) => PAD.t + plotH - (v / max) * plotH;
  const hi = hv.i;
  const readout = legendValues ? 'gesamt' : 'Summe';
  const ax = axisScale(max, unit);

  return (
    <Frame title={title} readout={readout}>
      <div className="chart-plot">
      <svg ref={hv.ref} viewBox={`0 0 ${W} ${H}`} className="chart-svg" onPointerMove={hv.onMove} onPointerDown={hv.onMove} onPointerLeave={hv.onLeave} role="img" aria-label={`${title}, ${all.map((s, j) => `${s.label} ${format(totals[j])}`).join(', ')}`}>
        <AxisUnit unit={ax.unit} />
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(max * f)} y2={y(max * f)} className={f === 0 ? 'chart-base' : 'chart-grid'} />
            <text x={PAD.l - 6} y={y(max * f) + 4} textAnchor="end" className="chart-tick">{axisLabel((max * f) / ax.div, ax.unit)}</text>
          </g>
        ))}
        {hi !== null && <rect x={PAD.l + hi * slot} y={PAD.t} width={slot} height={plotH} className="chart-hl" />}
        {times.map((t, i) => {
          const x0 = PAD.l + i * slot + (slot - groupW) / 2;
          let acc = 0;
          return (
            <g key={i}>
              {series.map((s, j) => {
                const v = data.values[s.key]?.[i];
                if (v === null || v === undefined || v <= 0) return null;
                const top = stacked ? y(acc + v) : y(v);
                const bottom = stacked ? y(acc) : y(0);
                acc += v;
                const x = stacked ? x0 : x0 + j * (barW + 1);
                const h = Math.max(1, bottom - top - (stacked && acc !== v ? 1 : 0));
                return <rect key={s.key} x={x} y={top} width={barW} height={h} rx={Math.min(2, barW / 2)} fill={s.color} />;
              })}
              {/* Vergleich: Strich auf Höhe des Vergleichswerts (gestapelt: Summe, sonst je Serie) */}
              {cd && (stacked ? [{ x: x0, v: cmpAt(i) }] : series.map((s, j) => ({ x: x0 + j * (barW + 1), v: cmpAt(i, s.key) }))).map((m, j) =>
                m.v === null || m.v <= 0 ? null : <line key={`c${j}`} x1={m.x - 1} x2={m.x + barW + 1} y1={y(m.v)} y2={y(m.v)} className="chart-cmp" />,
              )}
              {(() => {
                const l = tick(t, data.period, data.step);
                return l ? <text x={PAD.l + i * slot + slot / 2} y={H - 6} textAnchor="middle" className="chart-tick">{l}</text> : null;
              })()}
            </g>
          );
        })}
      </svg>
      {hi !== null && (
        <Tip
          xFrac={(PAD.l + (hi + 0.5) * slot) / W}
          label={bucketLabel(times[hi], data.step, times[hi + 1], data.period)}
          rows={[
            ...series.map((s) => ({ color: s.color, label: s.label, value: format(data.values[s.key]?.[hi] ?? null) })),
            ...(!cd ? [] : stacked
              ? [{ color: 'var(--text)', label: 'gesamt', value: format(sumOrNull(series.map((s) => data.values[s.key]?.[hi]))) }, { color: CMP_SWATCH, label: compare!.label, value: format(cmpAt(hi)) }]
              : series.map((s) => ({ color: CMP_SWATCH, label: `${s.label} ${compare!.label}`, value: format(cmpAt(hi, s.key)) }))),
          ]}
        />
      )}
      </div>
      <Legend series={all} values={legendValues ?? totals} format={format} off={off} onToggle={toggle}
        cmp={compare && { label: compare.label, value: stacked && compare.data ? sumOrNull(compare.data.t.map((_, i) => sumOrNull(series.map((s) => compare.data!.values[s.key]?.[i])))) : undefined }} />
    </Frame>
  );
}

// ------------------------------------------------------------------ Linien

export function LineChart({ data, series: all, title, unit, format = fmtNum, height = 140, compare, ...tg }: Props & Toggle & { compare?: Compare | null }) {
  const n = data?.t.length ?? 0;
  const hv = useHover(n);
  const H = height;
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const [off, toggle] = useToggle(tg);
  const offKey = [...off].join();
  const series = useMemo(() => all.filter((s) => !off.has(s.key)), [all, offKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const cd = compare?.data && !off.has(CMP) ? compare.data : null;

  const range = useMemo(() => {
    let lo = Infinity, hi = -Infinity;
    for (const d of cd ? [data, cd] : [data])
      for (const s of series) for (const v of (d?.values[s.key] ?? []).slice(0, n)) if (v !== null) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    if (!Number.isFinite(lo)) return { lo: 0, hi: 1 };
    // Leistung/Prozent ab 0, Temperaturen eng um die Daten
    if (unit === 'W' || unit === '%' || unit === 'ppm') {
      // Messrauschen um 0 (PV nachts −8 W) erzeugt keine eigene Achsenhälfte
      if (lo < 0 && hi > 0 && -lo < 0.03 * hi) lo = 0;
      if (hi > 0 && lo < 0 && hi < 0.03 * -lo) hi = 0;
      const top = niceMax(Math.max(Math.abs(hi), Math.abs(lo)));
      return { lo: lo < 0 ? -niceMax(-lo) : 0, hi: hi > 0 ? niceMax(hi) : top * 0.1 };
    }
    const pad = Math.max(1, (hi - lo) * 0.15);
    return { lo: Math.floor(lo - pad), hi: Math.ceil(hi + pad) };
  }, [data, cd, n, series, unit]);

  if (!data) return <Frame title={title} readout=""><Empty text="Lade …" /></Frame>;

  const times = data.t.map((t) => new Date(t));
  const x = (i: number) => PAD.l + ((i + 0.5) / n) * plotW;
  const y = (v: number) => PAD.t + plotH - ((v - range.lo) / (range.hi - range.lo)) * plotH;
  const hi = hv.i;
  // letzter vorhandener Wert als Standard-Readout
  const lastIdx = (() => {
    for (let i = n - 1; i >= 0; i--) if (series.some((s) => data.values[s.key]?.[i] !== null)) return i;
    return null;
  })();
  const stepLabel = data.step === '1h' ? '5m' : data.step;
  const legendValues = all.map((s) => (lastIdx === null ? null : data.values[s.key]?.[lastIdx] ?? null));
  const readout = lastIdx === null ? 'keine Daten' : `zuletzt ${bucketLabel(times[lastIdx], stepLabel, undefined, data.period)}`;

  const path = (key: string, src: SeriesData = data) => {
    let d = '';
    let pen = false;
    (src.values[key] ?? []).slice(0, n).forEach((v, i) => {
      if (v === null) return; // Lücken überbrücken (Sensoren melden nur bei Änderung)
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  const ticks = range.lo < 0 && range.hi > 0 ? [range.lo, 0, range.hi] : [range.lo, (range.lo + range.hi) / 2, range.hi];
  const ax = axisScale(Math.max(Math.abs(range.lo), Math.abs(range.hi)), unit);

  return (
    <Frame title={title} readout={readout}>
      <div className="chart-plot">
      <svg ref={hv.ref} viewBox={`0 0 ${W} ${H}`} className="chart-svg" onPointerMove={hv.onMove} onPointerDown={hv.onMove} onPointerLeave={hv.onLeave} role="img" aria-label={title}>
        <AxisUnit unit={ax.unit} />
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="chart-grid" />
            <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" className="chart-tick">{axisLabel(v / ax.div, ax.unit)}</text>
          </g>
        ))}
        {range.lo < 0 && range.hi > 0 && <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} className="chart-base" />}
        {times.map((t, i) => {
          const l = tick(t, data.period, data.step);
          return l ? (
            <g key={i}>
              <line x1={x(i)} x2={x(i)} y1={PAD.t} y2={PAD.t + plotH} className="chart-vgrid" />
              <text x={x(i)} y={H - 6} textAnchor="middle" className="chart-tick">{l}</text>
            </g>
          ) : null;
        })}
        {/* Vergleich gestrichelt in der Farbe der Serie, darunter */}
        {cd && series.map((s) => <path key={`c${s.key}`} d={path(s.key, cd)} fill="none" stroke={s.color} className="chart-cmp-line" />)}
        {series.map((s) => (
          <path key={s.key} d={path(s.key)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {hi !== null && (
          <g>
            <line x1={x(hi)} x2={x(hi)} y1={PAD.t} y2={PAD.t + plotH} className="chart-cross" />
            {series.map((s) => {
              const v = nearest(data.values[s.key] ?? [], hi);
              return v === null ? null : <circle key={s.key} cx={x(hi)} cy={y(v)} r={4} fill={s.color} className="chart-dot" />;
            })}
          </g>
        )}
      </svg>
      {hi !== null && (
        <Tip
          xFrac={x(hi) / W}
          label={bucketLabel(times[hi], stepLabel, undefined, data.period)}
          rows={[
            ...series.map((s) => ({ color: s.color, label: s.label, value: format(nearest(data.values[s.key] ?? [], hi)) })),
            ...(cd ? series.map((s) => ({ color: CMP_SWATCH, label: `${s.label} ${compare!.label}`, value: format(nearest(cd.values[s.key] ?? [], hi)) })) : []),
          ]}
        />
      )}
      </div>
      <Legend series={all} values={legendValues} format={format} off={off} onToggle={toggle} cmp={compare && { label: compare.label }} />
    </Frame>
  );
}

// ------------------------------------------------------------------ Gestapelte Flächen

/** Lücken bis maxGap Buckets mit dem letzten Wert füllen (z. B. Huawei schreibt nur alle 5–15 min). */
function fillGaps(arr: (number | null)[], maxGap: number): (number | null)[] {
  let last: number | null = null, gap = 0;
  return arr.map((v) => {
    if (v !== null && v !== undefined) {
      last = v;
      gap = 0;
      return v;
    }
    gap++;
    return last !== null && gap <= maxGap ? last : null;
  });
}

/**
 * Gestapelte Flächen, Oberkante = Summe (z. B. PV Dach + PV Carport = PV gesamt).
 * Negative Werte zählen als 0 (Erzeugung). Legende: letzter Wert je Serie + Summe.
 */
export function AreaChart({ data, series: all, title, unit = 'W', format = fmtPower, height = 160, maxGap = 3, totalLabel = 'gesamt', compare, ...tg }: Props & Toggle & { maxGap?: number; totalLabel?: string; compare?: Compare | null }) {
  const n = data?.t.length ?? 0;
  const hv = useHover(n);
  const H = height;
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const [off, toggle] = useToggle(tg);
  const offKey = [...off].join();

  const cd = compare?.data && !off.has(CMP) ? compare.data : null;

  // Ausgeblendete Serien fallen aus dem Stapel, die Summe zählt nur die sichtbaren; Vergleich = Summe als gestrichelte Linie
  const { allVals, series, vals, total, cmpTotal, max } = useMemo(() => {
    const allVals = all.map((s) => fillGaps(data?.values[s.key] ?? [], maxGap).map((v) => (v === null ? null : Math.max(0, v))));
    const vis = all.map((s, j) => j).filter((j) => !off.has(all[j].key));
    const vals = vis.map((j) => allVals[j]);
    const sum = (vs: (number | null)[][]) => Array.from({ length: n }, (_, i) => {
      const xs = vs.map((a) => a[i] ?? null);
      return !xs.length || xs.every((v) => v === null) ? null : xs.reduce<number>((a, v) => a + (v ?? 0), 0);
    });
    const total = sum(vals);
    const cmpTotal = cd ? sum(vis.map((j) => fillGaps(cd.values[all[j].key] ?? [], maxGap).map((v) => (v === null ? null : Math.max(0, v))))) : null;
    return { allVals, series: vis.map((j) => all[j]), vals, total, cmpTotal, max: niceMax(Math.max(0, ...total.map((v) => v ?? 0), ...(cmpTotal ?? []).map((v) => v ?? 0))) };
  }, [data, cd, all, n, maxGap, offKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return <Frame title={title} readout=""><Empty text="Lade …" /></Frame>;

  const times = data.t.map((t) => new Date(t));
  const x = (i: number) => PAD.l + ((i + 0.5) / n) * plotW;
  const y = (v: number) => PAD.t + plotH - (v / max) * plotH;
  const cum = (j: number, i: number) => vals.slice(0, j + 1).reduce((a, s) => a + (s[i] ?? 0), 0);

  // zusammenhängende Abschnitte mit Daten
  const runs: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    if (total[i] === null) continue;
    if (runs.length && runs[runs.length - 1][1] === i - 1) runs[runs.length - 1][1] = i;
    else runs.push([i, i]);
  }
  const area = (j: number) =>
    runs
      .map(([a, b]) => {
        const idx = Array.from({ length: b - a + 1 }, (_, k) => a + k);
        const top = idx.map((i) => `${x(i).toFixed(1)} ${y(cum(j, i)).toFixed(1)}`);
        const bot = idx.reverse().map((i) => `${x(i).toFixed(1)} ${y(j ? cum(j - 1, i) : 0).toFixed(1)}`);
        return `M${top.join(' L')} L${bot.join(' L')} Z`;
      })
      .join(' ');
  const topLine = runs.map(([a, b]) => Array.from({ length: b - a + 1 }, (_, k) => `${k ? 'L' : 'M'}${x(a + k).toFixed(1)} ${y(total[a + k]!).toFixed(1)}`).join('')).join(' ');

  const lastIdx = (() => {
    for (let i = n - 1; i >= 0; i--) if (total[i] !== null) return i;
    return null;
  })();
  const hi = hv.i;
  const stepLabel = data.step === '1h' ? '5m' : data.step;
  const at = (i: number | null) => (i === null ? all.map(() => null) : allVals.map((a) => a[i]));
  const legend = [...all, { key: '_total', label: totalLabel, color: 'var(--text)' }];
  const showTotal = !off.has('_total');
  const ax = axisScale(max, unit);

  return (
    <Frame title={title} readout={lastIdx === null ? 'keine Daten' : `zuletzt ${bucketLabel(times[lastIdx], stepLabel, undefined, data.period)}`}>
      <div className="chart-plot">
        <svg ref={hv.ref} viewBox={`0 0 ${W} ${H}`} className="chart-svg" onPointerMove={hv.onMove} onPointerDown={hv.onMove} onPointerLeave={hv.onLeave} role="img" aria-label={`${title}: ${legend.map((s, j) => `${s.label} ${format(j < all.length ? at(lastIdx)[j] : lastIdx === null ? null : total[lastIdx])}`).join(', ')}`}>
          <AxisUnit unit={ax.unit} />
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(max * f)} y2={y(max * f)} className={f === 0 ? 'chart-base' : 'chart-grid'} />
              <text x={PAD.l - 6} y={y(max * f) + 4} textAnchor="end" className="chart-tick">{axisLabel((max * f) / ax.div, ax.unit)}</text>
            </g>
          ))}
          {times.map((t, i) => {
            const l = tick(t, data.period, data.step);
            return l ? <text key={i} x={x(i)} y={H - 6} textAnchor="middle" className="chart-tick">{l}</text> : null;
          })}
          {series.map((s, j) => <path key={s.key} d={area(j)} fill={s.color} className="chart-area" />)}
          {showTotal && <path d={topLine} fill="none" stroke="var(--text)" strokeWidth={1.5} strokeLinejoin="round" />}
          {cmpTotal && (
            <path
              d={cmpTotal.map((v, i) => (v === null ? '' : `${i && cmpTotal[i - 1] !== null ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)).join('')}
              fill="none" stroke="var(--text)" className="chart-cmp-line"
            />
          )}
          {hi !== null && total[hi] !== null && (
            <g>
              <line x1={x(hi)} x2={x(hi)} y1={PAD.t} y2={PAD.t + plotH} className="chart-cross" />
              <circle cx={x(hi)} cy={y(total[hi]!)} r={4} fill="var(--text)" className="chart-dot" />
            </g>
          )}
        </svg>
        {hi !== null && (
          <Tip
            xFrac={x(hi) / W}
            label={bucketLabel(times[hi], stepLabel, undefined, data.period)}
            rows={[
              ...series.map((s, j) => ({ color: s.color, label: s.label, value: format(vals[j][hi]) })),
              ...(showTotal ? [{ color: 'var(--text)', label: totalLabel, value: format(total[hi]) }] : []),
              ...(cmpTotal ? [{ color: CMP_SWATCH, label: compare!.label, value: format(cmpTotal[hi]) }] : []),
            ]}
          />
        )}
      </div>
      <Legend series={legend} values={[...at(lastIdx), lastIdx === null ? null : total[lastIdx]]} format={format} off={off} onToggle={toggle} cmp={compare && { label: compare.label }} />
    </Frame>
  );
}

/** Wert am Index oder der letzte bekannte davor (Sensoren melden nur bei Änderung). */
function nearest(arr: (number | null)[], i: number): number | null {
  for (let k = i; k >= 0; k--) if (arr[k] !== null && arr[k] !== undefined) return arr[k];
  return null;
}

// ------------------------------------------------------------------ Streuung

export interface ScatterPoint { x: number; y: number; label: string; size?: number }

/**
 * Trendlinie y = a + b·x: gewichtet (z. B. Arbeitszahl nach Strommenge – Tage mit wenig Betrieb zählen wenig)
 * und robust (Huber, iterativ neu gewichtet): einzelne Ausreißer wie ein reiner Warmwassertag kippen die Gerade nicht.
 */
export function robustFit(xs: number[], ys: number[], w0: number[]): { a: number; b: number } {
  let w = w0.map((v) => Math.max(0, v));
  let a = 0, b = 0;
  for (let it = 0; it < 5; it++) {
    const sw = w.reduce((s, v) => s + v, 0) || 1;
    const mx = xs.reduce((s, x, i) => s + w[i] * x, 0) / sw, my = ys.reduce((s, y, i) => s + w[i] * y, 0) / sw;
    const sxx = xs.reduce((s, x, i) => s + w[i] * (x - mx) ** 2, 0);
    b = sxx > 0 ? xs.reduce((s, x, i) => s + w[i] * (x - mx) * (ys[i] - my), 0) / sxx : 0;
    a = my - b * mx;
    const res = ys.map((y, i) => y - (a + b * xs[i]));
    const sorted = res.map(Math.abs).sort((p, q) => p - q);
    const mad = sorted[Math.floor(sorted.length / 2)] * 1.4826;
    if (!(mad > 1e-9)) break;
    const k = 1.345 * mad;
    w = w0.map((v, i) => Math.max(0, v) * Math.min(1, k / Math.max(Math.abs(res[i]), 1e-12)));
  }
  return { a, b };
}

/** Punktwolke, z.B. Arbeitszahl je Tag über Außentemperatur. Optional robuste, gewichtete Trendlinie. */
export function ScatterChart({ points, title, xLabel, yLabel, color, formatX = fmtNum, formatY = fmtNum, trend = true, height = 180 }: {
  points: ScatterPoint[] | null; title: string; xLabel: string; yLabel: string; color: string;
  formatX?: Fmt; formatY?: Fmt; trend?: boolean; height?: number;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [hi, setHi] = useState<number | null>(null);
  const clear = useMemo(() => () => setHi(null), []);
  useTapAway(ref, hi !== null, clear);
  const H = height;
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b - 4;

  const dom = useMemo(() => {
    if (!points?.length) return null;
    const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
    const x0 = Math.floor(Math.min(...xs) - 1), x1 = Math.ceil(Math.max(...xs) + 1);
    const y0 = Math.max(0, Math.floor(Math.min(...ys) - 0.5)), y1 = Math.ceil(Math.max(...ys) + 0.5);
    const { a, b } = robustFit(xs, ys, points.map((p) => p.size ?? 1));
    return { x0, x1, y0, y1: y1 === y0 ? y0 + 1 : y1, a, b };
  }, [points]);

  if (!points) return <Frame title={title} readout=""><Empty text="Lade …" /></Frame>;
  if (!dom) return <Frame title={title} readout=""><Empty text="Keine Daten im Zeitraum" /></Frame>;

  const sx = (v: number) => PAD.l + ((v - dom.x0) / (dom.x1 - dom.x0)) * plotW;
  const sy = (v: number) => PAD.t + plotH - ((v - dom.y0) / (dom.y1 - dom.y0)) * plotH;
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W, py = ((e.clientY - r.top) / r.height) * H;
    let best: number | null = null, bd = 18 ** 2;
    points.forEach((p, i) => {
      const d = (sx(p.x) - px) ** 2 + (sy(p.y) - py) ** 2;
      if (d < bd) { bd = d; best = i; }
    });
    if (best !== null || e.pointerType === 'mouse') setHi(best);
  };
  const xt = [dom.x0, (dom.x0 + dom.x1) / 2, dom.x1];
  const yt = [dom.y0, (dom.y0 + dom.y1) / 2, dom.y1];
  const p = hi !== null ? points[hi] : null;

  return (
    <Frame title={title} readout={`${points.length} Werte`}>
      <div className="chart-plot">
        <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="chart-svg" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={(e) => e.pointerType === 'mouse' && setHi(null)} role="img" aria-label={`${title}: ${yLabel} über ${xLabel}`}>
          {yt.map((v) => (
            <g key={`y${v}`}>
              <line x1={PAD.l} x2={W - PAD.r} y1={sy(v)} y2={sy(v)} className="chart-grid" />
              <text x={PAD.l - 6} y={sy(v) + 4} textAnchor="end" className="chart-tick">{num(v, v % 1 ? 1 : 0)}</text>
            </g>
          ))}
          {xt.map((v) => (
            <text key={`x${v}`} x={sx(v)} y={H - 10} textAnchor="middle" className="chart-tick">{num(v, v % 1 ? 1 : 0)}</text>
          ))}
          <text x={W - PAD.r} y={H - 0} textAnchor="end" className="chart-tick">{xLabel}</text>
          {trend && points.length >= 4 && (
            <line x1={sx(dom.x0)} x2={sx(dom.x1)} y1={sy(dom.a + dom.b * dom.x0)} y2={sy(dom.a + dom.b * dom.x1)} className="chart-trend" />
          )}
          {points.map((pt, i) => (
            <circle key={i} cx={sx(pt.x)} cy={sy(pt.y)} r={i === hi ? 6 : 4 + Math.min(2, pt.size ?? 0)} fill={color} fillOpacity={i === hi ? 1 : 0.7} className="chart-dot" />
          ))}
        </svg>
        {p && (
          <Tip xFrac={sx(p.x) / W} label={p.label} rows={[
            { color, label: yLabel, value: formatY(p.y) },
            { color: 'transparent', label: xLabel, value: formatX(p.x) },
          ]} />
        )}
      </div>
    </Frame>
  );
}
