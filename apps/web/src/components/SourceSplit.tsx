// Herkunft einer Energiemenge: PV direkt / Akku / Netz als Balken + Legende.
import type { Allocation, SeriesData, SourceSplit as Split } from '@smarthome/shared';
import { energy, join, pct } from '../format';
import type { SeriesSpec } from './Charts';

export const SOURCES = [
  { key: 'pv', label: 'PV direkt', color: 'var(--c-sun)' },
  { key: 'battery', label: 'Akku', color: 'var(--c-battery)' },
  { key: 'grid', label: 'Netz', color: 'var(--c-grid)' },
] as const;

export const SOURCE_SERIES: SeriesSpec[] = SOURCES.map((s) => ({ ...s }));

/** Anteil aus eigener Erzeugung (PV direkt + Akku, der Akku lädt nur aus PV). */
export const ownShare = (s: Split | null | undefined) => (s && s.total > 0 ? (s.pv + s.battery) / s.total : null);

export function SplitBar({ split, label }: { split: Split; label?: string }) {
  const t = split.total || 1;
  return (
    <div className="split-bar" role="img" aria-label={label ?? SOURCES.map((s) => `${s.label} ${pct(split[s.key] / t)}`).join(', ')}>
      {split.total > 0 && SOURCES.map((s) => (split[s.key] > 0 ? <i key={s.key} className={s.key} style={{ flexGrow: split[s.key] }} /> : null))}
    </div>
  );
}

export function SplitBlock({ title, split, note }: { title: string; split: Split | null; note?: string }) {
  return (
    <section className="split">
      <h2>
        {title}
        <span>{split ? join(energy(split.total)) : '…'}</span>
      </h2>
      <SplitBar split={split ?? { total: 0, pv: 0, battery: 0, grid: 0 }} label={`${title} nach Herkunft`} />
      <dl className="split-legend">
        {SOURCES.map((s) => (
          <div key={s.key}>
            <dt><i style={{ background: s.color }} />{s.label}</dt>
            <dd>
              {split && split.total > 0 ? pct(split[s.key] / split.total) : '–'}
              <small>{split ? join(energy(split[s.key])) : ''}</small>
            </dd>
          </div>
        ))}
      </dl>
      {note && <p className="split-note">{note}</p>}
    </section>
  );
}

/** Allokations-Buckets als SeriesData für das gestapelte Balkendiagramm. */
export function splitSeries(a: Allocation | null, which: 'heatpump' | 'wallbox'): SeriesData | null {
  if (!a) return null;
  const b = a.buckets[which];
  const v = (k: 'pv' | 'battery' | 'grid') => b.map((x) => (x.total > 0 ? x[k] : null));
  return { kind: 'energy', period: a.period, date: a.date, step: a.bucketStep, t: a.buckets.t, values: { pv: v('pv'), battery: v('battery'), grid: v('grid') } };
}

export function Method() {
  return (
    <details className="method">
      <summary>Wie wird gerechnet?</summary>
      <p>
        Je Viertelstunde (Jahresansicht: je Stunde) wird bestimmt, woher der Strom im Haus kommt: <b>PV direkt</b> = Erzeugung − Einspeisung − Akkuladung,
        <b> Akku</b> = Entladung, <b>Netz</b> = Bezug. Jeder Verbraucher bekommt in diesem Intervall denselben Mix. Bezieht das Haus z.&nbsp;B. 30&nbsp;% aus dem Netz,
        während die Wärmepumpe läuft, stammt ihr Strom zu 30&nbsp;% aus dem Netz. Die Intervalle werden dann aufsummiert.
      </p>
      <p>Akkustrom zählt als Eigenstrom, weil der Akku nur aus der PV geladen wird. Ladeverluste des Akkus sind im Netz-/PV-Anteil nicht gesondert ausgewiesen.</p>
    </details>
  );
}
