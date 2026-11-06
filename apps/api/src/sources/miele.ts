// Miele 3rd-Party-API: OAuth2 (Authorization Code), Gerätezustand per SSE (/v1/devices/all/events).
// Zugangsdaten nur aus der .env (MIELE_CLIENT_ID / MIELE_CLIENT_SECRET), Tokens in SQLite (settings.mieleToken), nie im Repo.
import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import type { ApplianceRun } from '@smarthome/shared';
import type { SettingsStore } from './settingsStore';

const NEW_AUTH = 'https://auth.domestic.miele-iot.com/partner/realms/mcs/protocol/openid-connect';
const LEGACY_AUTH = { auth: 'https://api.mcs3.miele.com/thirdparty/login', token: 'https://api.mcs3.miele.com/thirdparty/token' };
const API = 'https://api.mcs3.miele.com/v1';

/** Miele-Gerätetyp → unsere Geräte-ID (registry APPLIANCE_IDS). 1 = Waschmaschine, 2 = Trockner, 7 = Geschirrspüler. */
const TYPE_TO_ID: Record<number, string> = { 1: 'washingmachine', 7: 'geschirrspueler' };
/** Status: 5 läuft, 6 Pause, 4 Startvorwahl; 7 Ende, 1/2/10 aus/an/bereit. */
const RUNNING = new Set([5, 6]);

interface Token {
  access_token: string;
  refresh_token: string;
  expires_at: number; // ms
}

type Raw = Record<string, { ident?: { type?: { value_raw?: number } }; state?: Record<string, unknown> }>;

const hm = (x: unknown): number | null => (Array.isArray(x) && x.length >= 2 && typeof x[0] === 'number' ? x[0] * 60 + (x[1] as number) : null);
const loc = (x: unknown): string | null => {
  const v = (x as { value_localized?: unknown } | null)?.value_localized;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
};
const raw = (x: unknown): number | null => {
  const v = (x as { value_raw?: unknown } | null)?.value_raw;
  return typeof v === 'number' ? v : null;
};

/** Miele-Rohdaten → Laufinfo je Geräte-ID (rein, getestet). */
export function parseMiele(data: Raw, now: number): Record<string, ApplianceRun> {
  const out: Record<string, ApplianceRun> = {};
  for (const dev of Object.values(data ?? {})) {
    const id = TYPE_TO_ID[raw(dev.ident?.type) ?? -1];
    const st = dev.state;
    if (!id || !st) continue;
    const status = raw(st.status);
    const remaining = hm(st.remainingTime);
    const running = status !== null && RUNNING.has(status);
    out[id] = {
      source: 'miele',
      running,
      status: loc(st.status),
      program: loc(st.ProgramID) ?? loc(st.programType),
      phase: loc(st.programPhase),
      remainingMin: running ? remaining : null,
      elapsedMin: hm(st.elapsedTime),
      endsAt: running && remaining !== null ? new Date(now + remaining * 60_000).toISOString() : null,
    };
  }
  return out;
}

export interface MieleOptions {
  clientId?: string;
  clientSecret?: string;
  redirectUri: string; // https://<host>/api/miele/callback
  legacy?: boolean; // MIELE_AUTH=legacy
  lang?: string;
  log: (msg: string) => void;
}

export function openMiele(settings: SettingsStore, o: MieleOptions) {
  const configured = !!(o.clientId && o.clientSecret);
  const urls = o.legacy ? LEGACY_AUTH : { auth: `${NEW_AUTH}/auth`, token: `${NEW_AUTH}/token` };
  let runs: Record<string, ApplianceRun> = {};
  let connected = false;
  let lastEvent: string | null = null;
  let lastError: string | null = null;
  const pending = new Map<string, number>(); // OAuth state → Ablauf
  let abort: AbortController | null = null;
  let stopped = false;
  let wake: (() => void) | null = null; // Warten abbrechen (nach Login sofort verbinden)
  const pause = (ms: number) =>
    new Promise<void>((r) => {
      const t = setTimeout(r, ms);
      t.unref?.();
      wake = () => (clearTimeout(t), r());
    });

  const token = () => settings.get<Token>('mieleToken');

  async function tokenRequest(body: Record<string, string>): Promise<Token> {
    const r = await fetch(urls.token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ client_id: o.clientId!, client_secret: o.clientSecret!, ...body }),
    });
    const j = (await r.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };
    if (!r.ok || !j.access_token) throw new Error(`Token ${r.status} ${j.error ?? ''}`.trim());
    const t: Token = { access_token: j.access_token, refresh_token: j.refresh_token ?? body.refresh_token ?? '', expires_at: Date.now() + (j.expires_in ?? 3600) * 1000 };
    settings.put('mieleToken', t);
    return t;
  }

  async function accessToken(): Promise<string | null> {
    const t = token();
    if (!t) return null;
    if (t.expires_at - Date.now() > 5 * 60_000) return t.access_token;
    if (!t.refresh_token) return null;
    return (await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh_token })).access_token;
  }

  /** SSE-Strom lesen; bei Abbruch mit Pause neu verbinden. Ohne Token: alle 5 min nachsehen. */
  async function loop() {
    let wait = 5_000;
    while (!stopped) {
      try {
        const at = await accessToken();
        if (!at) {
          connected = false;
          await pause(5 * 60_000);
          continue;
        }
        // Startzustand holen, dann Ereignisse
        const r0 = await fetch(`${API}/devices?language=${o.lang ?? 'de'}`, { headers: { Authorization: `Bearer ${at}`, Accept: 'application/json' } });
        if (r0.status === 401) throw new Error('401 – Anmeldung abgelaufen');
        if (r0.ok) runs = parseMiele((await r0.json()) as Raw, Date.now());
        abort = new AbortController();
        const r = await fetch(`${API}/devices/all/events?language=${o.lang ?? 'de'}`, {
          headers: { Authorization: `Bearer ${at}`, Accept: 'text/event-stream' },
          signal: abort.signal,
        });
        if (!r.ok || !r.body) throw new Error(`SSE ${r.status}`);
        connected = true;
        lastError = null;
        wait = 5_000;
        const dec = new TextDecoder();
        let buf = '';
        let event = '';
        const reader = r.body.getReader();
        // Token läuft ab → Verbindung vorher neu aufbauen
        const renewAt = (token()?.expires_at ?? Date.now() + 3600_000) - 2 * 60_000;
        for (;;) {
          if (Date.now() > renewAt) {
            abort.abort();
            break;
          }
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i: number;
          while ((i = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, i).replace(/\r$/, '');
            buf = buf.slice(i + 1);
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:') && event === 'devices') {
              try {
                runs = { ...runs, ...parseMiele(JSON.parse(line.slice(5)), Date.now()) };
                lastEvent = new Date().toISOString();
              } catch {
                /* unvollständige Zeile ignorieren */
              }
            } else if (line === '') event = '';
          }
        }
      } catch (e) {
        if (stopped) break;
        lastError = (e as Error).message;
        if ((e as Error).name !== 'AbortError') o.log(`miele: ${lastError}`);
      }
      connected = false;
      await pause(wait);
      wait = Math.min(wait * 2, 5 * 60_000);
    }
  }

  function routes(app: FastifyInstance) {
    app.get('/api/miele', async () => ({
      configured,
      linked: !!token(),
      connected,
      lastEvent,
      lastError,
      runs,
    }));

    // Anmeldung starten (nur mit App-Login erreichbar) → Miele-Login
    app.get('/api/miele/login', async (_req, reply) => {
      if (!configured) return reply.code(400).send({ error: 'MIELE_CLIENT_ID/SECRET fehlen in .env' });
      const state = randomBytes(16).toString('base64url');
      pending.set(state, Date.now() + 10 * 60_000);
      const q = new URLSearchParams({ client_id: o.clientId!, response_type: 'code', redirect_uri: o.redirectUri, state });
      if (!o.legacy) q.set('scope', 'openid mcs_thirdparty_read');
      return reply.redirect(`${urls.auth}?${q}`);
    });

    // Rückkehr von Miele (öffentlich, geschützt durch das einmalige state)
    app.get<{ Querystring: { code?: string; state?: string; error?: string } }>('/api/miele/callback', async (req, reply) => {
      const { code, state, error } = req.query;
      const exp = state ? pending.get(state) : undefined;
      if (state) pending.delete(state);
      if (!exp || exp < Date.now()) return reply.code(400).type('text/html').send('Anmeldung abgelaufen – bitte in der App erneut „Mit Miele verbinden“.');
      if (error || !code) return reply.code(400).type('text/html').send(`Miele-Anmeldung abgebrochen (${String(error ?? 'kein Code')}).`);
      try {
        await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: o.redirectUri });
      } catch (e) {
        return reply.code(502).type('text/html').send(`Token-Abruf fehlgeschlagen: ${(e as Error).message}`);
      }
      abort?.abort(); // sofort mit neuem Token verbinden
      wake?.();
      return reply.redirect('/#/einstellungen/miele');
    });

    app.post('/api/miele/logout', async () => {
      settings.put('mieleToken', null);
      abort?.abort();
      runs = {};
      return { linked: false };
    });
  }

  if (configured) void loop();
  return {
    routes,
    runs: () => runs,
    stop: () => ((stopped = true), abort?.abort(), wake?.()),
  };
}
