import { useMemo } from 'react';
import type { CostResult, Money, SeriesData, YieldResult } from '@smarthome/shared';
import { useAssets, useCostYears, useCosts, useYears, useYield } from '../data';
import { energy, eur, eurOf, join, num, pct } from '../format';
import { DEFAULT_INVEST, useInvest, type InvestCfg } from '../invest';
import type { View } from '../view';
import { bucketName, shortLabel } from '../view';
import { BarChart } from '../components/Charts';
import { PaybackChart } from '../components/PaybackChart';
import { payback, type AssetId, type Payback } from './payback';
import { Kpi } from './Kpi';

const ASSETS: { id: AssetId; name: string; color: string }[] = [
  { id: 'carport', name: 'PV Carport', color: 'var(--c-sun)' },
  { id: 'battery', name: 'Akku', color: 'var(--c-battery)' },
];

const fMonth = new Intl.DateTimeFormat('de-AT', { month: 'long', year: 'numeric' });
const fDate = new Intl.DateTimeFormat('de-AT', { day: 'numeric', month: 'short', year: 'numeric' });

function sinceOf(cfg: InvestCfg, id: AssetId, detected: string | null | undefined): Date | null {
  const s = cfg[id].since;
  if (s) return new Date(`${s}T00:00:00`);
  return detected ? new Date(detected) : null;
}


// ------------------------------------------------------------------ Kosten & Erlöse

const money = eurOf;

function CostRow({ label, m, sub }: { label: string; m: Money | undefined; sub?: boolean }) {
  return (
    <tr className={sub ? 'sub' : ''}>
      <th scope="row">{label}</th>
      <td className="share">{m ? join(energy(m.kwh)) : ''}</td>
      <td>{money(m)}</td>
    </tr>
  );
}

function costSeries(c: CostResult | null): SeriesData | null {
  if (!c) return null;
  const has = c.buckets.import.map((v, i) => v > 0 || c.buckets.export[i] > 0 || c.buckets.fixed[i] > 0);
  const pick = (a: number[]) => a.map((v, i) => (has[i] ? v : null));
  return { kind: 'energy', period: c.period, date: c.date, step: c.bucketStep, t: c.buckets.t, values: { import: pick(c.buckets.import), fixed: pick(c.buckets.fixed), export: pick(c.buckets.export) } };
}

function Costs({ view }: { view: View }) {
  const c = useCosts(view);
  const t = c?.totals;
  const missing = t ? t.import.missingKwh + t.export.missingKwh : 0;
  const net = t ? t.import.eur + t.fixed - t.export.eur : null;
  return (
    <>
      <h1>Kosten &amp; Erlöse <span className="h-note">{shortLabel(view)}</span></h1>
      {t && missing > 0.05 && (
        <p className="t-msg bad">
          Für {join(energy(missing))} ist kein Preis hinterlegt ({c!.tariffs.map((x) => x.name).join(', ')}) – Beträge sind unvollständig. Preise unter Einstellungen → Tarife eintragen.
        </p>
      )}
      <dl className="kpis">
        <Kpi label="Stromkosten" value={{ value: money(t?.import), unit: '' }} hint={c?.avgImportPrice ? `Ø ${num(c.avgImportPrice, 1)} ct/kWh` : undefined} />
        <Kpi label="Einspeisung" value={{ value: money(t?.export), unit: '' }} hint={t ? join(energy(t.export.kwh)) : undefined} />
        <Kpi label="Fixkosten" value={{ value: t ? (t.fixedMissing && t.fixed === 0 ? '–' : eur(t.fixed)) : '…', unit: '' }} hint="Grundpreise, Zähler, Pauschalen" />
        <Kpi label="Saldo" value={{ value: net === null || missing > 0.05 ? '–' : eur(net), unit: '' }} hint="Bezug + Fixkosten − Erlös" />
        <Kpi label="Ersparnis PV + Akku" value={{ value: money(t?.saved), unit: '' }} hint={t ? `${join(energy(t.saved.kwh))} nicht bezogen` : undefined} />
      </dl>
      <div className="etables">
        <section className="etable elec" style={{ ['--dot' as string]: 'var(--c-grid)' }}>
          <h2>Netzstrom nach Verbraucher <span>{shortLabel(view)}</span></h2>
          <table>
            <tbody>
              <CostRow label="Netzbezug gesamt" m={t?.import} />
              <CostRow label="Haushalt" m={t?.rest} sub />
              <CostRow label="Wärmepumpe" m={t?.heatpump} sub />
              <CostRow label="Auto" m={t?.wallbox} sub />
            </tbody>
          </table>
          <p className="split-note">Je Viertelstunde: Netzanteil am Hausverbrauch × Preis des Zeitfensters (Arbeitspreis brutto inkl. Netz und Abgaben). Differenz zum Gesamtbezug = Akku aus dem Netz geladen. Fixkosten ({t ? eur(t.fixed) : '…'}) fallen unabhängig vom Verbrauch an und sind nicht auf Verbraucher umgelegt.</p>
        </section>
      </div>
      <section className="charts">
        <BarChart
          data={costSeries(c)}
          series={[{ key: 'import', label: 'Kosten Bezug', color: 'var(--c-grid)' }, { key: 'fixed', label: 'Fixkosten', color: 'var(--muted)' }, { key: 'export', label: 'Erlös Einspeisung', color: 'var(--c-sun)' }]}
          title={`Kosten und Erlöse je ${bucketName(view.period)}`}
          unit="€"
          format={(v) => eur(v)}
        />
      </section>
    </>
  );
}

// ------------------------------------------------------------------ Amortisation

function AssetCard({ name, color, p, extra }: { name: string; color: string; p: Payback | null; extra?: string }) {
  if (!p) return <section className="asset"><h2>{name}</h2><p className="split-note">Lade …</p></section>;
  const prog = p.invest > 0 ? Math.max(0, Math.min(1, p.cum / p.invest)) : 0;
  const total = p.perYear && p.perYear > 0 ? p.invest / p.perYear : null;
  return (
    <section className="asset" style={{ ['--asset' as string]: color }}>
      <h2>
        {name}
        <span>seit {fDate.format(p.since)}</span>
      </h2>
      <div className="asset-head">
        <div>
          <b>{eur(p.cum)}</b> von {eur(p.invest)}
        </div>
        <div className="asset-pb">
          {p.reached ? 'amortisiert' : p.paybackAt ? <>amortisiert ca. <b>{fMonth.format(p.paybackAt)}</b></> : 'keine Prognose'}
        </div>
      </div>
      <div className="progress" role="progressbar" aria-valuenow={Math.round(prog * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`${name} zu ${pct(prog)} amortisiert`}>
        <i style={{ width: `${prog * 100}%` }} />
        <span>{pct(prog)}</span>
      </div>
      <PaybackChart p={p} color={color} label={name} />
      <dl className="asset-facts">
        <div><dt>Ertrag p.a.</dt><dd>{eur(p.perYear)}</dd></div>
        <div><dt>Dauer gesamt</dt><dd>{total ? `${num(total, 1)} Jahre` : '–'}</dd></div>
        <div><dt>Rendite (einfach)</dt><dd>{p.perYear && p.invest ? pct(p.perYear / p.invest) : '–'}</dd></div>
      </dl>
      <p className="split-note">
        {p.basisMonths >= 12 ? 'Ertrag p.a. aus den letzten 12 vollen Monaten.' : p.basisMonths > 0 ? `Hochrechnung aus ${p.basisMonths} vollen Monaten – saisonal verzerrt.` : 'Noch kein voller Monat Daten.'}
        {extra ? ` ${extra}` : ''}
      </p>
    </section>
  );
}

function Row({ label, kwh, sub, share, strong }: { label: string; kwh: number | undefined; sub?: boolean; share?: number | null; strong?: boolean }) {
  return (
    <tr className={`${sub ? 'sub' : ''}${strong ? ' total' : ''}`}>
      <th scope="row">{label}</th>
      <td className="share">{share !== undefined ? pct(share) : ''}</td>
      <td>{join(energy(kwh ?? null))}</td>
    </tr>
  );
}

function YieldTables({ y, c, kwh }: { y: YieldResult | null; c: CostResult | null; kwh: number }) {
  const longEnough = y?.period === 'year' || y?.period === 'all'; // Wirkungsgrad erst über längere Zeit aussagekräftig (SoC-Schwankung)
  const t = y?.totals;
  const q = (a: number | undefined, b: number | undefined) => (a !== undefined && b ? a / b : null);
  const cycles = t ? t.battery.discharged : null;
  return (
    <div className="etables yield">
      <section className="etable elec">
        <h2>PV Dach <span>abgeschrieben · deckt zuerst</span></h2>
        <table>
          <tbody>
            <Row label="Erzeugt" kwh={t?.roof.produced} strong />
            <Row label="Eigenverbrauch" kwh={t?.roof.self} share={q(t?.roof.self, t?.roof.produced)} sub />
            <Row label="in den Akku" kwh={t?.roof.toBattery} share={q(t?.roof.toBattery, t?.roof.produced)} sub />
            <Row label="Einspeisung" kwh={t?.roof.exported} share={q(t?.roof.exported, t?.roof.produced)} sub />
          </tbody>
        </table>
      </section>
      <section className="etable elec" style={{ ['--dot' as string]: 'var(--c-sun)' }}>
        <h2>PV Carport <span>deckt den Rest · {c ? eur(c.totals.carport) : '…'}</span></h2>
        <table>
          <tbody>
            <Row label="Erzeugt" kwh={t?.carport.produced} strong />
            <Row label="Eigenverbrauch" kwh={t?.carport.self} share={q(t?.carport.self, t?.carport.produced)} sub />
            <Row label="in den Akku" kwh={t?.carport.toBattery} share={q(t?.carport.toBattery, t?.carport.produced)} sub />
            <Row label="Einspeisung" kwh={t?.carport.exported} share={q(t?.carport.exported, t?.carport.produced)} sub />
          </tbody>
        </table>
      </section>
      <section className="etable elec" style={{ ['--dot' as string]: 'var(--c-battery)' }}>
        <h2>Akku <span>{c ? eur(c.totals.battery) : '…'}</span></h2>
        <table>
          <tbody>
            <Row label="Geladen" kwh={t?.battery.charged} strong />
            <Row label="aus PV Dach" kwh={t?.battery.fromRoof} sub />
            <Row label="aus PV Carport" kwh={t?.battery.fromCarport} sub />
            {(t?.battery.fromGrid ?? 0) > 0.05 && <Row label="aus dem Netz" kwh={t?.battery.fromGrid} sub />}
            <Row label="Entladen" kwh={t?.battery.discharged} strong />
          </tbody>
        </table>
        {t && longEnough && t.battery.charged > 0.5 && (
          <p className="split-note">
            Wirkungsgrad {pct(t.battery.discharged / t.battery.charged)}
            {cycles !== null && kwh > 0 && <> · {num(cycles / kwh, 1)} Vollzyklen</>}
          </p>
        )}
      </section>
    </div>
  );
}

function valueSeries(c: CostResult | null): SeriesData | null {
  if (!c) return null;
  const has = c.buckets.carport.map((v, i) => v !== 0 || c.buckets.battery[i] !== 0);
  return {
    kind: 'energy', period: c.period, date: c.date, step: c.bucketStep, t: c.buckets.t,
    values: { carport: c.buckets.carport.map((v, i) => (has[i] ? v : null)), battery: c.buckets.battery.map((v, i) => (has[i] ? Math.max(0, v) : null)) },
  };
}

function NumField({ label, value, unit, onChange, step = 1 }: { label: string; value: number; unit: string; onChange: (v: number) => void; step?: number }) {
  return (
    <label className="field">
      <span>{label}</span>
      <span className="field-in">
        <input type="number" inputMode="decimal" step={step} value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} />
        <em>{unit}</em>
      </span>
    </label>
  );
}

function Assumptions({ cfg, set, detected }: { cfg: InvestCfg; set: (c: InvestCfg) => void; detected: { carport: string | null; battery: string | null } | null }) {
  const up = (id: AssetId, k: string, v: number | string) => set({ ...cfg, [id]: { ...cfg[id], [k]: v } });
  return (
    <details className="assume">
      <summary>Investitionen anpassen</summary>
      <div className="assume-grid">
        {ASSETS.map((a) => (
          <fieldset key={a.id}>
            <legend>{a.name}</legend>
            <NumField label="Investition (nach Förderung)" value={cfg[a.id].invest} unit="€" step={100} onChange={(v) => up(a.id, 'invest', v)} />
            {a.id === 'battery' && <NumField label="Kapazität" value={cfg.battery.kwh} unit="kWh" step={0.5} onChange={(v) => up('battery', 'kwh', v)} />}
            <label className="field">
              <span>Inbetriebnahme</span>
              <span className="field-in">
                <input type="date" value={cfg[a.id].since} onChange={(e) => up(a.id, 'since', e.target.value)} />
              </span>
              <small>{cfg[a.id].since ? '' : detected?.[a.id] ? `leer = erster Messwert (${fDate.format(new Date(detected[a.id]!))})` : 'leer = erster Messwert'}</small>
            </label>
          </fieldset>
        ))}
        <button className="sessions-more" onClick={() => set(DEFAULT_INVEST)}>Zurücksetzen</button>
      </div>
      <p className="split-note">Investitionen sind Annahmen und werden nur auf diesem Gerät gespeichert. Strompreise kommen aus den Tarifen (Einstellungen).</p>
    </details>
  );
}

export function Economics({ view }: { view: View }) {
  const [cfg, setCfg] = useInvest();
  const assets = useAssets();
  const since = { carport: sinceOf(cfg, 'carport', assets?.carport), battery: sinceOf(cfg, 'battery', assets?.battery) };
  const firstYear = assets ? Math.min(...[since.carport, since.battery].filter((d): d is Date => !!d).map((d) => d.getFullYear()), new Date().getFullYear()) : null;
  const costYears = useCostYears(firstYear);
  const years = useYears(firstYear);
  const y = useYield(view);
  const c = useCosts(view);

  const pb = useMemo(() => {
    const r: Record<AssetId, Payback | null> = { carport: null, battery: null };
    if (!costYears) return r;
    for (const a of ASSETS) {
      const s = since[a.id];
      if (s) r[a.id] = payback(costYears, a.id, cfg[a.id].invest, s);
    }
    return r;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [costYears, cfg, since.carport?.getTime(), since.battery?.getTime()]);

  const cycles = (() => {
    if (!years || !since.battery) return null;
    let dis = 0;
    for (const yr of years) yr.buckets.items.forEach((it, i) => { if (new Date(yr.buckets.t[i]) >= since.battery!) dis += it.battery.discharged; });
    return cfg.battery.kwh ? dis / cfg.battery.kwh : null;
  })();
  const missingYears = costYears?.filter((x) => x.totals.import.missingKwh > 0.05).map((x) => x.date.slice(0, 4)) ?? [];

  return (
    <div className="analysis">
      <Costs view={view} />

      <h1 className="h-sub">Amortisation</h1>
      <p className="lead">
        Rangfolge beim Eigenverbrauch: zuerst PV Dach (abgeschrieben), dann PV Carport, dann Akku. Bewertet je Viertelstunde mit dem gültigen Tarif.
        {missingYears.length > 0 && ` Ohne Preis (nicht bewertet): Teile von ${missingYears.join(', ')}.`}
      </p>
      <div className="assets">
        {ASSETS.map((a) => (
          <AssetCard key={a.id} name={a.name} color={a.color} p={pb[a.id]} extra={a.id === 'battery' && cycles !== null ? `Bisher ${num(cycles, 0)} Vollzyklen.` : undefined} />
        ))}
      </div>
      <Assumptions cfg={cfg} set={setCfg} detected={assets} />

      <h1 className="h-sub">Ertrag im gewählten Zeitraum</h1>
      <section className="charts">
        <BarChart
          data={valueSeries(c)}
          series={ASSETS.map((a) => ({ key: a.id, label: a.name, color: a.color }))}
          title={`Ertrag je ${bucketName(view.period)}`}
          unit="€"
          format={(v) => eur(v)}
        />
      </section>
      <YieldTables y={y} c={c} kwh={cfg.battery.kwh} />

      <details className="method">
        <summary>Wie wird gerechnet?</summary>
        <p>
          Je Viertelstunde (Jahr: je Stunde) gilt der Tarif mit dem letzten „gültig ab“ vor diesem Tag; innerhalb des Tarifs das erste passende Zeitfenster
          (z. B. SNAP, WiNAP, Nacht), sonst der Arbeitspreis. Einspeisung nach Staffel je Kalenderjahr.
        </p>
        <p>
          <b>Stromkosten</b> = Netzbezug × Preis. <b>Je Verbraucher</b>: Netzanteil am Hausverbrauch in dieser Viertelstunde × Preis (alle Verbraucher bekommen denselben Mix).
          <br />
          <b>Ersparnis</b> = Hausverbrauch aus PV + Akku × Preis, der sonst angefallen wäre.
        </p>
        <p>
          <b>PV Carport</b> = Eigenverbrauch × Bezugspreis + Überschuss × Einspeisetarif (auch was in den Akku geht, wäre sonst eingespeist worden).
          <br />
          <b>Akku</b> = Entladung × Bezugspreis − PV-Ladung × Einspeisetarif (entgangene Einspeisung) − Netzladung × Bezugspreis. Verluste mindern so automatisch den Ertrag.
        </p>
        <p>Energie ohne hinterlegten Preis wird nicht bewertet (kein 0 €). Ohne Wartung, Degradation oder Finanzierung. Ertrag p.a. aus den letzten 12 vollen Monaten, Prognose linear.</p>
      </details>
    </div>
  );
}
