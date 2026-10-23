import { useEffect, useState, type FormEvent } from 'react';
import { MOCK } from '../data';

type State = 'checking' | 'ok' | 'login';

/** Prüft beim Start, ob ein Login nötig ist, und reagiert auf 401 aus der Datenschicht. */
export function useAuth(): State {
  const [state, setState] = useState<State>(MOCK ? 'ok' : 'checking');
  useEffect(() => {
    if (MOCK) return;
    fetch('api/auth', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { ok: true }))
      .then((a: { ok: boolean }) => setState(a.ok ? 'ok' : 'login'))
      .catch(() => setState('ok')); // offline: App mit Cache starten
    const on = () => setState('login');
    window.addEventListener('auth-required', on);
    return () => window.removeEventListener('auth-required', on);
  }, []);
  return state;
}

export function Login() {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch('api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) });
      if (r.ok) return location.reload();
      const d = await r.json().catch(() => ({}));
      setErr(d.error ?? 'Anmeldung fehlgeschlagen');
    } catch {
      setErr('Keine Verbindung');
    }
    setBusy(false);
  };

  return (
    <div className="login">
      <form onSubmit={submit}>
        <img src="icon.svg" alt="" width={72} height={72} />
        <h1>Haus</h1>
        <p>Einmal anmelden – das Gerät bleibt angemeldet.</p>
        {/* username-Feld hilft dem iOS-Schlüsselbund beim Speichern */}
        <input type="text" name="username" autoComplete="username" value="haus" readOnly hidden />
        <label>
          <span>Passwort</span>
          <input type="password" name="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus required />
        </label>
        {err && <p className="login-err" role="alert">{err}</p>}
        <button type="submit" disabled={busy || !pw}>{busy ? 'Anmelden …' : 'Anmelden'}</button>
      </form>
    </div>
  );
}
