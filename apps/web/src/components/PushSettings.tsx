import { ALERT_CATEGORIES, type PushPrefs } from '@smarthome/shared';
import { usePush } from '../push';
import { SubHead } from './SettingsNav';

const fTime = new Intl.DateTimeFormat('de-AT', { timeZone: 'Europe/Vienna', weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
const HOURS = Array.from({ length: 24 }, (_, h) => h);

function Switch({ on, label, disabled, onChange }: { on: boolean; label: string; disabled?: boolean; onChange: (on: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`switch${on ? ' on' : ''}`} disabled={disabled} onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}

/** Wert für Ebene 1 (Einstellungen-Liste). */
export function pushSummary(subscribed: boolean | null): string {
  return subscribed === null ? '…' : subscribed ? 'an' : 'aus';
}

export function PushPage() {
  const p = usePush();
  const set = (next: PushPrefs) => (p.subscribed ? p.save(next) : undefined);
  const quietOn = p.prefs.quiet !== null;

  return (
    <div className="settings">
      <SubHead title="Benachrichtigungen" />

      {p.support === 'ios-browser' && (
        <p className="push-note">
          Auf dem iPhone funktionieren Mitteilungen nur in der App vom Home-Bildschirm: in Safari „Teilen → Zum Home-Bildschirm“, dann die App von dort öffnen und hier aktivieren.
        </p>
      )}
      {p.support === 'unsupported' && <p className="push-note">Dieser Browser unterstützt keine Push-Mitteilungen.</p>}
      {p.support === 'denied' && <p className="push-note">Mitteilungen sind für diese App blockiert – in den Systemeinstellungen (iOS: Mitteilungen → Haus) erlauben.</p>}

      <section>
        <div className="nav-list">
          <div className="nav-row static">
            <span className="nr-title">Dieses Gerät</span>
            <Switch
              on={!!p.subscribed}
              label="Benachrichtigungen auf diesem Gerät"
              disabled={p.busy || p.support !== 'ok' || p.subscribed === null}
              onChange={(on) => (on ? p.enable() : p.disable())}
            />
          </div>
        </div>
        {p.error && <p className="hint warn">{p.error}</p>}
        <p className="hint">Gilt nur für dieses Gerät. Ausgewertet wird auf dem Pi – die App muss dafür nicht offen sein.</p>
      </section>

      <section>
        <h2>Melden bei</h2>
        <div className="nav-list">
          {ALERT_CATEGORIES.map((c) => (
            <div className="nav-row static push-cat" key={c.id}>
              <span className="nr-title">
                {c.label}
                <small>{c.note}</small>
              </span>
              <Switch
                on={p.prefs.categories[c.id]}
                label={c.label}
                disabled={!p.subscribed || p.busy}
                onChange={(on) => set({ ...p.prefs, categories: { ...p.prefs.categories, [c.id]: on } })}
              />
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>Ruhezeit</h2>
        <div className="nav-list">
          <div className="nav-row static">
            <span className="nr-title">Nachts nichts melden</span>
            <Switch on={quietOn} label="Ruhezeit" disabled={!p.subscribed || p.busy} onChange={(on) => set({ ...p.prefs, quiet: on ? { from: 22, to: 7 } : null })} />
          </div>
          {quietOn && (
            <div className="nav-row static">
              <span className="nr-title">von – bis</span>
              <span className="push-hours">
                <select aria-label="Ruhezeit von" value={p.prefs.quiet!.from} disabled={!p.subscribed || p.busy} onChange={(e) => set({ ...p.prefs, quiet: { ...p.prefs.quiet!, from: Number(e.target.value) } })}>
                  {HOURS.map((h) => <option key={h} value={h}>{h}:00</option>)}
                </select>
                –
                <select aria-label="Ruhezeit bis" value={p.prefs.quiet!.to} disabled={!p.subscribed || p.busy} onChange={(e) => set({ ...p.prefs, quiet: { ...p.prefs.quiet!, to: Number(e.target.value) } })}>
                  {HOURS.map((h) => <option key={h} value={h}>{h}:00</option>)}
                </select>
              </span>
            </div>
          )}
        </div>
        <p className="hint">Was in der Ruhezeit passiert, wird nicht nachgeholt – es steht aber unten in der Liste.</p>
      </section>

      {p.subscribed && (
        <div className="t-actions">
          <button type="button" className="t-add" disabled={p.busy} onClick={() => p.test()}>
            Test senden
          </button>
        </div>
      )}

      <section>
        <h2>Zuletzt</h2>
        {p.log.length ? (
          <ul className="push-log">
            {p.log.slice(0, 15).map((e, i) => (
              <li key={i}>
                <span className="pl-time">{fTime.format(new Date(e.ts))}</span>
                <strong>{e.title}</strong>
                <span>{e.body}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">Noch keine Mitteilungen.</p>
        )}
      </section>
    </div>
  );
}
