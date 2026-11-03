import { useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { EnergySummary } from '@smarthome/shared';
import { useSeries } from '../data';
import { energy, join } from '../format';
import { shortLabel, type View } from '../view';
import { BarChart, LineChart, fmtPower } from './Charts';
import { buildPies, pieParts, sharePct, PieDefs, type PieId } from './EnergyPies';
import { ChevronRight } from './Icons';

const BAR_TITLE = { day: 'Energie je Stunde', month: 'Energie je Tag', year: 'Energie je Monat', all: 'Energie je Jahr' } as const;
const LINE_TITLE = { day: 'Leistung', month: 'Leistung · Stundenmittel', year: 'Leistung · Tagesmittel', all: 'Leistung · Monatsmittel' } as const;

/** Detail-Popup zu einem Ringdiagramm: Anteile, gestapelte Energiebalken je Zeitschritt, Leistungslinien je Anteil. */
export function PieDetails({ id, summary, view, onNavigate }: { id: PieId; summary: EnergySummary | null; view: View; onNavigate?: () => void }) {
  const pid = useId().replace(/:/g, '');
  const navigate = useNavigate();
  const pie = buildPies(summary).find((p) => p.id === id)!;
  const { total, parts } = pieParts(pie);
  const bars = useSeries('energy', pie.bars.map((s) => s.key), view);
  const lines = useSeries('gauge', pie.lines.map((s) => s.key), view);
  // viele Linien (Haushalt): anfangs nur die 4 größten Geräte + Rest, übrige per Legende zuschaltbar
  const [hidden, setHidden] = useState<string[]>(() => (pie.lines.length > 6 ? pie.lines.slice(4, -1).map((s) => s.key) : []));
  const toggle = (k: string) => setHidden((h) => (h.includes(k) ? h.filter((x) => x !== k) : [...h, k]));

  return (
    <section className="details" style={{ ['--accent' as string]: pie.dot }}>
      <h2>
        {pie.title} <span>{shortLabel(view)}</span>
      </h2>
      <PieDefs pid={pid} />
      <dl>
        {parts.map((p) => (
          <div className="row" key={p.k}>
            <dt>
              <svg viewBox="0 0 12 12" aria-hidden className="pie-sw">
                <rect width="12" height="12" rx="3" fill={p.color} fillOpacity={p.alpha} className={p.mark === 'light' ? 'light' : ''} />
                {p.mark && p.mark !== 'light' && <rect width="12" height="12" rx="3" fill={`url(#${pid}-${p.mark})`} />}
              </svg>{' '}
              {p.k}
            </dt>
            <dd>
              {join(energy(p.kwh))} <small>{sharePct(total, p.share)}</small>
            </dd>
          </div>
        ))}
        <div className="row">
          <dt>Gesamt</dt>
          <dd>{join(energy(total))}</dd>
        </div>
        {pie.note && (
          <div className="row sub">
            <dt>{pie.note}</dt>
            <dd />
          </div>
        )}
      </dl>
      <div className="charts">
        {bars.error ? (
          <p className="chart-error">Diagramm konnte nicht geladen werden.</p>
        ) : (
          <BarChart data={bars.data} series={pie.bars} title={BAR_TITLE[view.period]} unit="kWh" stacked />
        )}
        {lines.error ? (
          <p className="chart-error">Diagramm konnte nicht geladen werden.</p>
        ) : (
          <LineChart data={lines.data} series={pie.lines} title={LINE_TITLE[view.period]} unit="W" format={fmtPower} height={170} hidden={hidden} onToggle={toggle} />
        )}
      </div>
      <button
        type="button"
        className="pie-link"
        onClick={() => (onNavigate?.(), navigate(pie.page.to, { state: pie.page.section ? { section: pie.page.section } : undefined }))}
      >
        Mehr: {pie.page.label}
        <ChevronRight size={18} />
      </button>
    </section>
  );
}
