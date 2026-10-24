import { useEffect, useState } from 'react';
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

export function ThresholdEditor() {
  const { th, save } = useThresholds();
  const live = usePolledLive();
  const [draft, setDraft] = useState<Thresholds>(th);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(th), [th]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(th);
  const err = validateThresholds(draft);
  const set = (k: string, part: 'off' | 'on', v: number) => setDraft({ ...draft, [k]: { ...draft[k], [part]: v } });

  return (
    <div className="thresholds">
      <p className="hint">
        Unter „aus unter“ gilt ein Gerät als aus, ab „an ab“ als an (gefärbt, Flusspunkte). Dazwischen: Standby – sichtbar, aber ohne Animation.
      </p>
      <ul className="th-list">
        {DEVICE_KEYS.map((k) => {
          const d = draft[k] ?? DEFAULT_THRESHOLDS[k];
          const w = liveValue(live, k);
          const st = deviceState(k, w, draft);
          const isDefault = d.off === DEFAULT_THRESHOLDS[k].off && d.on === DEFAULT_THRESHOLDS[k].on;
          return (
            <li key={k} className="th-row">
              <div className="th-head">
                <strong>{DEVICE_LABELS[k]}</strong>
                <span className={`th-now ${st ?? 'stale'}`}>{w === null ? '–' : `${join(power(w))} · ${STATE_TEXT[st!]}`}</span>
              </div>
              <div className="th-inputs">
                <WattInput label="aus unter" value={d.off} onChange={(v) => set(k, 'off', v)} />
                <WattInput label="an ab" value={d.on} onChange={(v) => set(k, 'on', v)} />
                <button type="button" className="t-del" disabled={isDefault} onClick={() => setDraft({ ...draft, [k]: { ...DEFAULT_THRESHOLDS[k] } })}>
                  Standard
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="t-actions">
        {dirty && <button type="button" className="t-add" onClick={() => (setDraft(th), setMsg(null))}>Verwerfen</button>}
        <button
          type="button"
          className="t-save"
          disabled={!dirty || !!err || busy}
          onClick={async () => {
            setBusy(true);
            const e = await save(draft);
            setBusy(false);
            setMsg(e ? { ok: false, text: e } : { ok: true, text: 'Gespeichert – gilt für alle Geräte.' });
          }}
        >
          {busy ? 'Speichere …' : 'Speichern'}
        </button>
      </div>
      {dirty && err && <p className="t-msg bad">{err}</p>}
      {msg && !dirty && <p className={`t-msg${msg.ok ? '' : ' bad'}`}>{msg.text}</p>}
    </div>
  );
}
