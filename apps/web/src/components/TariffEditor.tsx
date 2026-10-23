import { useEffect, useState } from 'react';
import { localDate, validateTariffs, type ExportTier, type Tariff, type TariffWindow } from '@smarthome/shared';
import { useTariffs } from '../data';
import { num } from '../format';

const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const DAYS: [number, string][] = [[1, 'Mo'], [2, 'Di'], [3, 'Mi'], [4, 'Do'], [5, 'Fr'], [6, 'Sa'], [0, 'So']];
const fDate = new Intl.DateTimeFormat('de-AT', { day: 'numeric', month: 'short', year: 'numeric' });

/** Monatsliste ↔ Bereich von–bis (über den Jahreswechsel möglich). */
function monthRange(from: number, to: number): number[] {
  const out: number[] = [];
  for (let m = from; ; m = (m % 12) + 1) {
    out.push(m);
    if (m === to || out.length >= 12) break;
  }
  return out.length === 12 ? [] : out;
}
function rangeOf(months: number[]): [number, number] | null {
  if (!months.length) return null;
  // Start = Monat, dessen Vormonat nicht enthalten ist
  const start = months.find((m) => !months.includes(m === 1 ? 12 : m - 1)) ?? months[0];
  const end = months.find((m) => !months.includes(m === 12 ? 1 : m + 1)) ?? months[months.length - 1];
  return [start, end];
}

const parsePrice = (s: string): number | null => (s.trim() === '' ? null : Number(s.replace(',', '.')));
const showPrice = (p: number | null) => (p === null ? '' : String(p));

function PriceInput({ label, value, onChange, unit = 'ct/kWh' }: { label: string; value: number | null; onChange: (v: number | null) => void; unit?: string }) {
  const [text, setText] = useState(showPrice(value));
  useEffect(() => setText(showPrice(value)), [value]);
  return (
    <label className="field">
      <span>{label}</span>
      <span className="field-in">
        <input
          type="text"
          inputMode="decimal"
          value={text}
          placeholder="unbekannt"
          onChange={(e) => {
            setText(e.target.value);
            const v = parsePrice(e.target.value);
            if (v === null || Number.isFinite(v)) onChange(v);
          }}
        />
        <em>{unit}</em>
      </span>
    </label>
  );
}

function WindowRow({ w, set, remove }: { w: TariffWindow; set: (w: TariffWindow) => void; remove: () => void }) {
  const r = rangeOf(w.months);
  const allDays = !w.days.length;
  const toggleDay = (d: number) => {
    const cur = allDays ? DAYS.map(([x]) => x) : w.days;
    const next = cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d];
    set({ ...w, days: next.length === 7 || next.length === 0 ? [] : next.sort() });
  };
  return (
    <fieldset className="tw">
      <div className="tw-head">
        <label className="field tw-name">
          <span>Zeitfenster</span>
          <span className="field-in"><input value={w.name} onChange={(e) => set({ ...w, name: e.target.value })} /></span>
        </label>
        <button type="button" className="t-del" onClick={remove} aria-label={`Zeitfenster ${w.name} entfernen`}>Entfernen</button>
      </div>
      <div className="tw-grid">
        <label className="field">
          <span>Monate</span>
          <span className="field-in">
            <select
              value={r ? r[0] : 0}
              onChange={(e) => {
                const f = Number(e.target.value);
                set({ ...w, months: f ? monthRange(f, r ? r[1] : f) : [] });
              }}
            >
              <option value={0}>ganzjährig</option>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>ab {m}</option>)}
            </select>
            {r && (
              <select value={r[1]} onChange={(e) => set({ ...w, months: monthRange(r[0], Number(e.target.value)) })}>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>bis {m}</option>)}
              </select>
            )}
          </span>
        </label>
        <label className="field">
          <span>Uhrzeit (von–bis, h)</span>
          <span className="field-in">
            <input type="number" min={0} max={24} step={0.25} value={w.from} onChange={(e) => set({ ...w, from: Number(e.target.value) })} aria-label="von Stunde" />
            –
            <input type="number" min={0} max={24} step={0.25} value={w.to} onChange={(e) => set({ ...w, to: Number(e.target.value) })} aria-label="bis Stunde" />
          </span>
        </label>
        <PriceInput label="Preis" value={w.price} onChange={(price) => set({ ...w, price })} />
      </div>
      <div className="t-days" role="group" aria-label="Wochentage (keiner gewählt = alle)">
        {DAYS.map(([d, l]) => (
          <button key={d} type="button" aria-pressed={allDays || w.days.includes(d)} className={allDays || w.days.includes(d) ? 'on' : ''} onClick={() => toggleDay(d)}>
            {l}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function TierRows({ tiers, set }: { tiers: ExportTier[]; set: (t: ExportTier[]) => void }) {
  const up = (i: number, t: ExportTier) => set(tiers.map((x, k) => (k === i ? t : x)));
  return (
    <div className="t-tiers">
      {tiers.map((t, i) => {
        const last = i === tiers.length - 1;
        const lower = i > 0 ? tiers[i - 1].upToKwh : 0;
        const title = tiers.length === 1 ? 'Ganze Menge' : last ? `ab ${num(lower, 0)} kWh/Jahr` : i === 0 ? 'Stufe 1' : `ab ${num(lower, 0)} kWh/Jahr`;
        return (
          <div key={i} className="t-tier">
            <div className="tw-head">
              <strong>{title}</strong>
              {tiers.length > 1 && (
                <button type="button" className="t-del" onClick={() => set(tiers.filter((_, k) => k !== i).map((x, k, a) => (k === a.length - 1 ? { ...x, upToKwh: null } : x)))} aria-label="Stufe entfernen">
                  Entfernen
                </button>
              )}
            </div>
            <div className="tw-grid">
              {!last && (
                <label className="field">
                  <span>bis (kumuliert im Jahr)</span>
                  <span className="field-in">
                    <input type="number" min={0} step={100} value={t.upToKwh ?? ''} onChange={(e) => up(i, { ...t, upToKwh: Number(e.target.value) })} />
                    <em>kWh</em>
                  </span>
                </label>
              )}
              <PriceInput label="Preis" value={t.price} onChange={(price) => up(i, { ...t, price })} />
            </div>
          </div>
        );
      })}
      <button
        type="button"
        className="t-add"
        onClick={() => {
          const prevCap = tiers.length > 1 ? tiers[tiers.length - 2].upToKwh ?? 0 : 0;
          const head = tiers.slice(0, -1);
          const last = tiers[tiers.length - 1];
          set([...head, { upToKwh: prevCap + 1000, price: last.price }, { upToKwh: null, price: null }]);
        }}
      >
        + Stufe
      </button>
    </div>
  );
}

function TariffCard({ t, open, set, remove }: { t: Tariff; open: boolean; set: (t: Tariff) => void; remove: () => void }) {
  const missing = t.importPrice === null || t.windows.some((w) => w.price === null) || t.exportTiers.some((x) => x.price === null);
  return (
    <details className="tariff" open={open}>
      <summary>
        <strong>{t.name || 'Ohne Namen'}</strong>
        <span>
          ab {fDate.format(new Date(`${t.validFrom}T00:00:00`))} · {t.importPrice === null ? 'Preis fehlt' : `${num(t.importPrice, 2)} ct`}
          {t.windows.length ? ` · ${t.windows.map((w) => w.name).join(', ')}` : ''}
        </span>
        {missing && <em className="t-warn">Preise fehlen</em>}
      </summary>
      <div className="t-body">
        <div className="tw-grid">
          <label className="field">
            <span>Gültig ab</span>
            <span className="field-in"><input type="date" value={t.validFrom} onChange={(e) => e.target.value && set({ ...t, validFrom: e.target.value })} /></span>
          </label>
          <label className="field">
            <span>Name</span>
            <span className="field-in"><input value={t.name} onChange={(e) => set({ ...t, name: e.target.value })} /></span>
          </label>
          <PriceInput label="Arbeitspreis Bezug (brutto, gesamt)" value={t.importPrice} onChange={(importPrice) => set({ ...t, importPrice })} />
        </div>

        <h3>Zeitfenster <small>erstes passendes gilt, sonst Arbeitspreis</small></h3>
        {t.windows.map((w, i) => (
          <WindowRow key={i} w={w} set={(nw) => set({ ...t, windows: t.windows.map((x, k) => (k === i ? nw : x)) })} remove={() => set({ ...t, windows: t.windows.filter((_, k) => k !== i) })} />
        ))}
        <button type="button" className="t-add" onClick={() => set({ ...t, windows: [...t.windows, { name: 'Neu', months: [], days: [], from: 22, to: 6, price: null }] })}>
          + Zeitfenster
        </button>

        <h3>Einspeisung <small>Staffel zählt je Kalenderjahr</small></h3>
        <TierRows tiers={t.exportTiers} set={(exportTiers) => set({ ...t, exportTiers })} />

        <label className="field">
          <span>Notiz</span>
          <textarea rows={2} value={t.note ?? ''} onChange={(e) => set({ ...t, note: e.target.value || undefined })} />
        </label>
        <button type="button" className="t-del" onClick={remove}>Tarif löschen</button>
      </div>
    </details>
  );
}

export function TariffEditor() {
  const { list, save } = useTariffs();
  const [draft, setDraft] = useState<Tariff[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(list), [list]);

  if (!draft) return <p className="hint">Lade Tarife …</p>;
  const dirty = JSON.stringify(draft) !== JSON.stringify(list);
  const shown = [...draft].map((t, i) => ({ t, i })).sort((a, b) => b.t.validFrom.localeCompare(a.t.validFrom));
  const err = validateTariffs(draft);

  const add = () => {
    const latest = shown[0]?.t;
    const base: Tariff = latest
      ? { ...structuredClone(latest), note: undefined }
      : { validFrom: '', name: '', importPrice: null, windows: [], exportTiers: [{ upToKwh: null, price: null }] };
    let d = localDate();
    while (draft.some((t) => t.validFrom === d)) d = new Date(new Date(`${d}T12:00:00`).getTime() + 864e5).toISOString().slice(0, 10);
    setDraft([...draft, { ...base, validFrom: d, name: 'Neuer Tarif' }]);
  };

  return (
    <div className="tariffs">
      {shown.map(({ t, i }, k) => (
        <TariffCard
          key={i}
          t={t}
          open={k === 0}
          set={(nt) => setDraft(draft.map((x, j) => (j === i ? nt : x)))}
          remove={() => setDraft(draft.filter((_, j) => j !== i))}
        />
      ))}
      <div className="t-actions">
        <button type="button" className="t-add" onClick={add}>+ Neuer Tarif</button>
        {dirty && <button type="button" className="t-add" onClick={() => (setDraft(list), setMsg(null))}>Verwerfen</button>}
        <button
          type="button"
          className="t-save"
          disabled={!dirty || !!err || busy}
          onClick={async () => {
            setBusy(true);
            const e = await save(draft);
            setBusy(false);
            setMsg(e ? { ok: false, text: e } : { ok: true, text: 'Gespeichert – Kosten werden neu berechnet.' });
          }}
        >
          {busy ? 'Speichere …' : 'Speichern'}
        </button>
      </div>
      {dirty && err && <p className="t-msg bad">{err}</p>}
      {msg && !dirty && <p className={`t-msg${msg.ok ? '' : ' bad'}`}>{msg.text}</p>}
      <p className="hint">
        Preise in ct/kWh brutto inkl. Netz und Abgaben. Leer = unbekannt: diese Energie wird in den Kosten als „ohne Preis“ ausgewiesen, nicht mit 0 € gerechnet.
        Gespeichert auf dem Pi, gilt für alle Geräte.
      </p>
    </div>
  );
}
