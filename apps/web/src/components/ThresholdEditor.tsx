import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { NavRow, SubHead } from './SettingsNav';
import { DEFAULT_THRESHOLDS, DEVICE_KEYS, DEVICE_LABELS, deviceState, mockLive, validateThresholds, type LiveSnapshot, type Thresholds } from '@smarthome/shared';
import { api, MOCK, useThresholds } from '../data';
import { join, power } from '../format';

const STATE_TEXT = { off: 'aus', standby: 'Standby', on: 'an' } as const;

/** Momentanwert je Gerät aus dem Live-Snapshot. */
function liveValue(l: LiveSnapshot | null, key: string): number | null {
  if (!l) return null;
  if (key in l.power) return l.power[key as keyof LiveSnapshot['power']];
  return l.appliances.find((a) => a.id === key)?.power ?? null;
}

/** Live-Snapshot alle 10 s (ohne zweiten SSE-Stream). */
function usePolledLive(): LiveSnapshot | null {
  const [l, setL] = useState<LiveSnapshot | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      MOCK
        ? setL(mockLive())
        : api('api/live')
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => !cancelled && d && setL(d))
            .catch(() => undefined);
    load();
    const t = setInterval(load, 10_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);
  return l;
}

function WattInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const show = (v: number) => String(v).replace('.', ',');
  const [text, setText] = useState(show(value));
  useEffect(() => setText((t) => (Number(t.replace(',', '.')) === value ? t : show(value))), [value]);
  return (
    <label className="field">
      <span>{label}</span>
      <span className="field-in">
        <input
          type="text"
          inputMode="decimal"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const v = Number(e.target.value.replace(',', '.'));
            if (e.target.value.trim() !== '' && Number.isFinite(v)) onChange(v);
          }}
        />
        <em>W</em>
      </span>
    </label>
  );
}

const W = (n: number) => `${String(n).replace('.', ',')}`;
/** Anlagen (Leitungen der Grafiken) und Geräte (Kacheln) getrennt auflisten. */
const PLANT_KEYS = ['pvRoof', 'pvCarport', 'solarThermal', 'grid', 'battery', 'heatpump', 'wallbox'];

/** Ebene 2: alle Geräte mit Live-Zustand und Schwellen. */
export function DeviceList() {
  const { th } = useThresholds();
  const live = usePolledLive();
  const row = (k: string) => {
    const d = th[k] ?? DEFAULT_THRESHOLDS[k];
    const w = liveValue(live, k);
    const st = deviceState(k, w, th);
    const isDefault = d.off === DEFAULT_THRESHOLDS[k].off && d.on === DEFAULT_THRESHOLDS[k].on;
    return (
      <NavRow
        key={k}
        to={k}
        title={DEVICE_LABELS[k]}
        value={
          <>
            <span className={`th-now ${st ?? 'stale'}`}>{w === null ? '–' : `${join(power(w))} · ${STATE_TEXT[st!]}`}</span>
            <span className="th-vals">{W(d.off)} / {W(d.on)} W{isDefault ? '' : ' *'}</span>
          </>
        }
      />
    );
  };
  return (
    <div className="settings">
      <SubHead title="Geräte: aus / Standby / an" />
      <p className="hint">
        Unter „aus unter“ gilt ein Gerät als aus, ab „an ab“ als an (gefärbt, Flusspunkte). Dazwischen: Standby – sichtbar, aber ohne Animation. * = angepasst.
      </p>
      <section>
        <h2>Anlagen</h2>
        <div className="nav-list">{PLANT_KEYS.filter((k) => DEVICE_KEYS.includes(k)).map(row)}</div>
      </section>
      <section>
        <h2>Geräte</h2>
        <div className="nav-list">{DEVICE_KEYS.filter((k) => !PLANT_KEYS.includes(k)).map(row)}</div>
      </section>
    </div>
  );
}

/** Ebene 3: Schwellen eines Geräts. */
export function DevicePage() {
  const { key = '' } = useParams();
  const nav = useNavigate();
  const { th, save } = useThresholds();
  const live = usePolledLive();
  const base = th[key] ?? DEFAULT_THRESHOLDS[key];
  const [d, setD] = useState(base);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setD(th[key] ?? DEFAULT_THRESHOLDS[key]), [th, key]);

  if (!DEFAULT_THRESHOLDS[key]) return <div className="settings"><SubHead title="Gerät" back=".." backLabel="Geräte" /><p className="hint">Unbekanntes Gerät.</p></div>;

  const next: Thresholds = { ...th, [key]: d };
  const err = validateThresholds(next);
  const dirty = d.off !== base.off || d.on !== base.on;
  const isDefault = d.off === DEFAULT_THRESHOLDS[key].off && d.on === DEFAULT_THRESHOLDS[key].on;
  const w = liveValue(live, key);
  const st = deviceState(key, w, next);

  return (
    <div className="settings">
      <SubHead title={DEVICE_LABELS[key]} back=".." backLabel="Geräte" />
      <div className="th-row">
        <div className="th-head">
          <strong>Jetzt</strong>
          <span className={`th-now ${st ?? 'stale'}`}>{w === null ? '–' : `${join(power(w))} · ${STATE_TEXT[st!]}`}</span>
        </div>
        <div className="th-inputs">
          <WattInput label="aus unter" value={d.off} onChange={(off) => setD({ ...d, off })} />
          <WattInput label="an ab" value={d.on} onChange={(on) => setD({ ...d, on })} />
          <button type="button" className="t-del" disabled={isDefault} onClick={() => setD({ ...DEFAULT_THRESHOLDS[key] })}>
            Standard
          </button>
        </div>
        <p className="hint">Standard: aus unter {W(DEFAULT_THRESHOLDS[key].off)} W, an ab {W(DEFAULT_THRESHOLDS[key].on)} W (aus Messdaten).</p>
      </div>
      <div className="t-actions">
        <button
          type="button"
          className="t-save"
          disabled={!dirty || !!err || busy}
          onClick={async () => {
            setBusy(true);
            const e = await save(next);
            setBusy(false);
            if (e) setMsg(e);
            else nav('..', { relative: 'path' });
          }}
        >
          {busy ? 'Speichere …' : 'Speichern'}
        </button>
      </div>
      {dirty && err && <p className="t-msg bad">{err}</p>}
      {msg && <p className="t-msg bad">{msg}</p>}
    </div>
  );
}
