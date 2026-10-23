// Schlanke SVG-Diagramme (keine Library): Balken für Energie je Bucket, Linien für Leistung/Temperatur.
// Interaktion: Tippen/Hover auf einen Bucket zeigt die Werte in der Kopfzeile (Readout).
import { useMemo, useRef, useState, type PointerEvent } from 'react';
import type { Period, SeriesData, Step } from '@smarthome/shared';
import { zonedParts } from '@smarthome/shared';
import { energy, join, num, power } from '../format';

export interface SeriesSpec {
  key: string;
  label: string;
  color: string; // CSS-Farbe/Token
}

const W = 340;
const PAD = { l: 38, r: 8, t: 8, b: 22 };
const TZ = 'Europe/Vienna';

const fHour = new Intl.DateTimeFormat('de-AT', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const fDay = new Intl.DateTimeFormat('de-AT', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'numeric' });
const fMonth = new Intl.DateTimeFormat('de-AT', { timeZone: TZ, month: 'long' });
const fMonthShort = new Intl.DateTimeFormat('de-AT', { timeZone: TZ, month: 'narrow' });

/** Beschriftung eines Buckets für den Readout. */
function bucketLabel(t: Date, step: Step, next?: Date): string {
  if (step === '5m') return `${fHour.format(t)} Uhr`;
  if (step === '1h') return `${fHour.format(t)}–${next ? fHour.format(next) : ''} Uhr`;
  if (step === '1d') return fDay.format(t);
  return fMonth.format(t);
}

/** Achsenbeschriftung (nur jede n-te). Über formatToParts – robust auch in Safari. */
function tick(t: Date, period: Period, step: Step): string | null {
  const p = zonedParts(t);
  if (period === 'day') return p.minute === 0 && p.hour % 3 === 0 ? `${p.hour}:00` : null;
  if (period === 'month') {
    const dayStart = step === '1h' ? p.hour === 0 : true;
    return dayStart && (p.day === 1 || p.day % 5 === 0) ? `${p.day}.` : null;
  }
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

function axisLabel(v: number, unit: string): string {
  if (unit === 'W') return Math.abs(v) >= 1000 ? `${num(v / 1000, Math.abs(v) >= 10000 ? 0 : 1)}k` : num(v, 0);
  if (unit === 'kWh') return num(v, v < 10 && v % 1 ? 1 : 0);
  return num(v, 0);
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
    setI(idx >= 0 && idx < n ? idx : null);
  };
  return { ref, i, onMove, onLeave: () => setI(null) };
}

function Legend({ series, values, format }: { series: SeriesSpec[]; values: (number | null)[]; format: Fmt }) {
  return (
    <div className="chart-legend">
      {series.map((s, j) => (
        <span key={s.key}>
          <i style={{ background: s.color }} />
          {s.label}
          <b>{format(values[j])}</b>
        </span>
      ))}
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
          <i style={{ background: r.color }} />
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

export function BarChart({ data, series, title, unit = 'kWh', format = fmtEnergy, height = 150, stacked = false, legendValues }: Props & { stacked?: boolean; legendValues?: (number | null)[] }) {
  const n = data?.t.length ?? 0;
  const hv = useHover(n);
  const H = height;
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;

  const { max, totals } = useMemo(() => {
    if (!data) return { max: 1, totals: series.map(() => 0) };
    const totals = series.map((s) => (data.values[s.key] ?? []).reduce<number>((a, v) => a + (v ?? 0), 0));
    let m = 0;
    for (let i = 0; i < n; i++) {
      const vals = series.map((s) => data.values[s.key]?.[i] ?? 0);
      m = Math.max(m, stacked ? vals.reduce((a, b) => a + b, 0) : Math.max(...vals));
    }
    return { max: niceMax(m), totals };
  }, [data, series, stacked, n]);

  if (!data) return <Frame title={title} readout=""><Empty text="Lade …" /></Frame>;

  const times = data.t.map((t) => new Date(t));
  const slot = plotW / n;
  const groupW = Math.max(1, slot - Math.min(4, slot * 0.25));
  const barW = stacked ? groupW : Math.max(1, (groupW - (series.length - 1)) / series.length);
  const y = (v: number) => PAD.t + plotH - (v / max) * plotH;
  const hi = hv.i;
  const readout = legendValues ? 'gesamt' : 'Summe';

  return (
    <Frame title={title} readout={readout}>
      <div className="chart-plot">
      <svg ref={hv.ref} viewBox={`0 0 ${W} ${H}`} className="chart-svg" onPointerMove={hv.onMove} onPointerDown={hv.onMove} onPointerLeave={hv.onLeave} role="img" aria-label={`${title}, ${series.map((s, j) => `${s.label} ${format(totals[j])}`).join(', ')}`}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(max * f)} y2={y(max * f)} className={f === 0 ? 'chart-base' : 'chart-grid'} />
            <text x={PAD.l - 6} y={y(max * f) + 4} textAnchor="end" className="chart-tick">{axisLabel(max * f, unit)}</text>
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
          label={bucketLabel(times[hi], data.step, times[hi + 1])}
          rows={series.map((s) => ({ color: s.color, label: s.label, value: format(data.values[s.key]?.[hi] ?? null) }))}
        />
      )}
      </div>
      <Legend series={series} values={legendValues ?? totals} format={format} />
    </Frame>
  );
}

// ------------------------------------------------------------------ Linien

export function LineChart({ data, series, title, unit, format = fmtNum, height = 140 }: Props) {
  const n = data?.t.length ?? 0;
  const hv = useHover(n);
  const H = height;
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;

  const range = useMemo(() => {
    let lo = Infinity, hi = -Infinity;
    for (const s of series) for (const v of data?.values[s.key] ?? []) if (v !== null) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    if (!Number.isFinite(lo)) return { lo: 0, hi: 1 };
    // Leistung/Prozent ab 0, Temperaturen eng um die Daten
    if (unit === 'W' || unit === '%' || unit === 'ppm') {
      const top = niceMax(Math.max(Math.abs(hi), Math.abs(lo)));
      return { lo: lo < 0 ? -niceMax(-lo) : 0, hi: hi > 0 ? niceMax(hi) : top * 0.1 };
    }
    const pad = Math.max(1, (hi - lo) * 0.15);
    return { lo: Math.floor(lo - pad), hi: Math.ceil(hi + pad) };
  }, [data, series, unit]);

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
  const legendValues = series.map((s) => (lastIdx === null ? null : data.values[s.key]?.[lastIdx] ?? null));
  const readout = lastIdx === null ? 'keine Daten' : `zuletzt ${bucketLabel(times[lastIdx], stepLabel)}`;

  const path = (key: string) => {
    let d = '';
    let pen = false;
    (data.values[key] ?? []).forEach((v, i) => {
      if (v === null) return; // Lücken überbrücken (Sensoren melden nur bei Änderung)
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  const ticks = range.lo < 0 && range.hi > 0 ? [range.lo, 0, range.hi] : [range.lo, (range.lo + range.hi) / 2, range.hi];

  return (
    <Frame title={title} readout={readout}>
      <div className="chart-plot">
      <svg ref={hv.ref} viewBox={`0 0 ${W} ${H}`} className="chart-svg" onPointerMove={hv.onMove} onPointerDown={hv.onMove} onPointerLeave={hv.onLeave} role="img" aria-label={title}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="chart-grid" />
            <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" className="chart-tick">{axisLabel(v, unit)}</text>
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
          label={bucketLabel(times[hi], stepLabel)}
          rows={series.map((s) => ({ color: s.color, label: s.label, value: format(nearest(data.values[s.key] ?? [], hi)) }))}
        />
      )}
      </div>
      <Legend series={series} values={legendValues} format={format} />
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

/** Punktwolke, z.B. Arbeitszahl je Tag über Außentemperatur. Optional lineare Trendlinie. */
export function ScatterChart({ points, title, xLabel, yLabel, color, formatX = fmtNum, formatY = fmtNum, trend = true, height = 180 }: {
  points: ScatterPoint[] | null; title: string; xLabel: string; yLabel: string; color: string;
  formatX?: Fmt; formatY?: Fmt; trend?: boolean; height?: number;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [hi, setHi] = useState<number | null>(null);
  const H = height;
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b - 4;

  const dom = useMemo(() => {
    if (!points?.length) return null;
    const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
    const x0 = Math.floor(Math.min(...xs) - 1), x1 = Math.ceil(Math.max(...xs) + 1);
    const y0 = Math.max(0, Math.floor(Math.min(...ys) - 0.5)), y1 = Math.ceil(Math.max(...ys) + 0.5);
    // Regression y = a + b·x
    const n = points.length;
    const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
    const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
    const b = sxx > 0 ? xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / sxx : 0;
    return { x0, x1, y0, y1: y1 === y0 ? y0 + 1 : y1, a: my - b * mx, b };
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
    setHi(best);
  };
  const xt = [dom.x0, (dom.x0 + dom.x1) / 2, dom.x1];
  const yt = [dom.y0, (dom.y0 + dom.y1) / 2, dom.y1];
  const p = hi !== null ? points[hi] : null;

  return (
    <Frame title={title} readout={`${points.length} Werte`}>
      <div className="chart-plot">
        <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="chart-svg" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHi(null)} role="img" aria-label={`${title}: ${yLabel} über ${xLabel}`}>
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
