import { useEffect, useState } from 'react';
import { runLabel, type ApplianceRun } from '@smarthome/shared';
import { MOCK, api } from '../data';
import { SubHead } from './SettingsNav';

interface MieleInfo {
  configured: boolean;
  linked: boolean;
  connected: boolean;
  lastEvent: string | null;
  lastError: string | null;
  runs: Record<string, ApplianceRun>;
}
interface ActivityInfo {
  enabled: boolean;
  log: { ts: string; text: string }[];
}

const NAMES: Record<string, string> = { washingmachine: 'Waschmaschine', geschirrspueler: 'Geschirrspüler' };
const fTime = new Intl.DateTimeFormat('de-AT', { timeZone: 'Europe/Vienna', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Einstellungen → Geräte-Anbindung: Miele verbinden, Status, Live-Aktivitäten (PushWard). */
export function MielePage() {
  const [m, setM] = useState<MieleInfo | null>(null);
  const [a, setA] = useState<ActivityInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = () => {
    if (MOCK) return;
    api('api/miele').then((r) => r.json()).then(setM).catch((e: Error) => setErr(e.message));
    api('api/activities').then((r) => r.json()).then(setA).catch(() => {});
  };
  useEffect(load, []);

  const unlink = async () => {
    await api('api/miele/logout', { method: 'POST' }).catch(() => {});
    load();
  };

  const state = !m ? '…' : !m.configured ? 'nicht eingerichtet' : !m.linked ? 'nicht verbunden' : m.connected ? 'verbunden' : 'verbinde …';

  return (
    <div className="settings">
      <SubHead title="Miele & Live-Aktivitäten" />
      <section>
        <h2>Miele</h2>
        <div className="nav-list">
          <div className="nav-row static">
            <span className="nr-title">Status</span>
            <span className="nr-value">{state}</span>
          </div>
          {m?.lastEvent && (
            <div className="nav-row static">
              <span className="nr-title">Letzte Meldung</span>
              <span className="nr-value">{fTime.format(new Date(m.lastEvent))}</span>
            </div>
          )}
          {m &&
            Object.entries(m.runs).map(([id, r]) => (
              <div className="nav-row static" key={id}>
                <span className="nr-title">{NAMES[id] ?? id}</span>
                <span className="nr-value">{r.running ? [r.program, runLabel(r)].filter(Boolean).join(' · ') : r.status ?? '–'}</span>
              </div>
            ))}
        </div>
        {m?.lastError && <p className="hint warn">{m.lastError}</p>}
        {err && <p className="hint warn">{err}</p>}
        {m && !m.configured && <p className="hint">MIELE_CLIENT_ID und MIELE_CLIENT_SECRET in der .env auf dem Pi eintragen (developer.miele.com).</p>}
        {m?.configured && (
          <div className="t-actions">
            <a className="t-add" href="api/miele/login">{m.linked ? 'Neu verbinden' : 'Mit Miele verbinden'}</a>
            {m.linked && (
              <button type="button" className="t-add" onClick={unlink}>
                Trennen
              </button>
            )}
          </div>
        )}
        <p className="hint">Liefert Programm, Phase und Restzeit von Waschmaschine und Geschirrspüler. Ohne Miele wird die Laufzeit aus der Leistung geschätzt.</p>
      </section>
      <section>
        <h2>Live-Aktivitäten (Dynamic Island)</h2>
        <div className="nav-list">
          <div className="nav-row static">
            <span className="nr-title">PushWard</span>
            <span className="nr-value">{!a ? '…' : a.enabled ? 'aktiv' : 'aus'}</span>
          </div>
        </div>
        {a && !a.enabled && <p className="hint">PUSHWARD_KEY (hlk_…) aus der PushWard-App in die .env auf dem Pi eintragen.</p>}
        {a?.log.length ? (
          <ul className="push-log">
            {a.log.slice(0, 8).map((e, i) => (
              <li key={i}>
                <span className="pl-time">{fTime.format(new Date(e.ts))}</span>
                <span>{e.text}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
