// Web Push: Abos in SQLite, VAPID-Schlüssel beim ersten Start erzeugt (Tabelle settings, nie im Repo),
// Regel-Schleife über den Live-Snapshot (packages/shared/src/alerts.ts) → Versand je Abo nach Kategorie und Ruhezeit.
import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import webpush from 'web-push';
import type { AlertEvent, AlertState, LiveSnapshot, PushPrefs, StoreHealth, Thresholds } from '@smarthome/shared';
import { DEFAULT_PUSH_PREFS, INITIAL_ALERT_STATE, evaluateAlerts, inQuietHours, validatePushPrefs } from '@smarthome/shared';
import type { SettingsStore } from './sources/settingsStore';

interface Sub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}
export interface PushLogEntry {
  ts: string;
  category: string;
  title: string;
  body: string;
  sent: number;
}

const MAX_SUBS = 20;
const LOG_MAX = 30;

function isSub(x: unknown): x is Sub {
  const s = x as Sub;
  return !!s && typeof s.endpoint === 'string' && /^https:\/\/[^\s]+$/.test(s.endpoint) && s.endpoint.length < 1000
    && !!s.keys && typeof s.keys.p256dh === 'string' && typeof s.keys.auth === 'string' && s.keys.p256dh.length < 200 && s.keys.auth.length < 100;
}

export function openPush(db: DatabaseSync, settings: SettingsStore, opts: { subject: string; tz: string; log: (msg: string) => void }) {
  db.exec(`CREATE TABLE IF NOT EXISTS push_subs (
    endpoint TEXT PRIMARY KEY,
    sub TEXT NOT NULL,
    prefs TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_ok TEXT
  )`);
  let vapid = settings.get<{ publicKey: string; privateKey: string }>('vapid');
  if (!vapid) {
    vapid = webpush.generateVAPIDKeys();
    settings.put('vapid', vapid);
    opts.log('push: VAPID-Schlüssel erzeugt');
  }
  webpush.setVapidDetails(opts.subject, vapid.publicKey, vapid.privateKey);

  const hourOf = (d: Date) => Number(new Intl.DateTimeFormat('de-AT', { timeZone: opts.tz, hour: '2-digit', hour12: false }).format(d)) % 24;
  const all = () => (db.prepare('SELECT sub, prefs FROM push_subs').all() as { sub: string; prefs: string }[]).map((r) => ({ sub: JSON.parse(r.sub) as Sub, prefs: JSON.parse(r.prefs) as PushPrefs }));
  const del = (endpoint: string) => db.prepare('DELETE FROM push_subs WHERE endpoint = ?').run(endpoint);
  const ok = (endpoint: string) => db.prepare('UPDATE push_subs SET last_ok = ? WHERE endpoint = ?').run(new Date().toISOString(), endpoint);
  const getLog = () => settings.get<PushLogEntry[]>('pushLog') ?? [];

  async function sendTo(sub: Sub, e: Pick<AlertEvent, 'title' | 'body' | 'url' | 'tag'>): Promise<boolean> {
    try {
      await webpush.sendNotification(sub, JSON.stringify(e), { TTL: 3600, urgency: 'normal', topic: e.tag.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 32) });
      ok(sub.endpoint);
      return true;
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) {
        del(sub.endpoint); // Abo abgelaufen / App gelöscht
        opts.log(`push: Abo entfernt (${code})`);
      } else opts.log(`push: Versand fehlgeschlagen (${code ?? (err as Error).message})`);
      return false;
    }
  }

  async function dispatch(events: AlertEvent[], now = new Date()) {
    if (!events.length) return;
    const subs = all();
    const hour = hourOf(now);
    const log = getLog();
    for (const e of events) {
      let sent = 0;
      for (const { sub, prefs } of subs) {
        if (!prefs.categories[e.category] || inQuietHours(prefs.quiet, hour)) continue;
        if (await sendTo(sub, e)) sent++;
      }
      log.unshift({ ts: now.toISOString(), category: e.category, title: e.title, body: e.body, sent });
      opts.log(`push: ${e.title} → ${sent}/${subs.length}`);
    }
    settings.put('pushLog', log.slice(0, LOG_MAX));
  }

  /** Regel-Schleife; Zustand überlebt Neustarts (gespeichert, wenn sich etwas ereignet). */
  function start(live: () => Promise<LiveSnapshot>, thresholds: () => Thresholds, storeHealth?: () => Promise<StoreHealth>, everyMs = 30_000, storeEveryMs = 120_000) {
    let state: AlertState = { ...INITIAL_ALERT_STATE, ...(settings.get<AlertState>('alertState') ?? {}) };
    let busy = false;
    // Datenhaltung seltener prüfen (Flux-Abfrage); dazwischen gilt das letzte Ergebnis nicht erneut
    let storeAt = 0;
    const tick = async () => {
      if (busy) return;
      busy = true;
      try {
        let snap: LiveSnapshot | null = null;
        try {
          snap = await live();
        } catch {
          snap = null;
        }
        const now = new Date();
        let store: StoreHealth | undefined;
        if (storeHealth && now.getTime() - storeAt >= storeEveryMs) {
          storeAt = now.getTime();
          store = await storeHealth().catch((e: Error) => ({ ok: false, error: e.message, lastWrite: null }));
        }
        const r = evaluateAlerts(state, snap, now.getTime(), hourOf(now), thresholds(), undefined, store);
        state = r.state;
        if (r.events.length) {
          settings.put('alertState', state);
          await dispatch(r.events, now);
        }
      } catch (e) {
        opts.log(`push: Auswertung fehlgeschlagen (${(e as Error).message})`);
      } finally {
        busy = false;
      }
    };
    const t = setInterval(tick, everyMs);
    t.unref();
    return () => clearInterval(t);
  }

  // Meldungen vom Pi-Host (deploy/pi/hostcheck.sh): nur direkt vom Pi (Loopback/Docker-Bridge), nie über Caddy
  const HOST_KINDS: Record<string, { title: string; hint: string }> = {
    'disk-io': { title: 'Platte: Schreib-/Lesefehler', hint: 'InfluxDB speichert womöglich nicht. Externe SSD / USB-Strom prüfen.' },
    'usb-disconnect': { title: 'USB-Gerät getrennt', hint: 'Wenn das die SSD war: InfluxDB neu starten, damit sie wieder schreibt.' },
    'influx-restart': { title: 'InfluxDB neu gestartet', hint: 'Absturz (z. B. Plattenfehler) – Lücke im Verlauf möglich.' },
    'influx-down': { title: 'InfluxDB läuft nicht', hint: 'Es wird nichts gespeichert.' },
    'disk-missing': { title: 'Externe Platte nicht eingehängt', hint: 'InfluxDB schreibt auf die SD-Karte oder gar nicht.' },
  };
  const hostLast = new Map<string, number>();
  const HOST_REPEAT_MS = 60 * 60_000;
  const isLocal = (addr: string | undefined) =>
    !!addr && (/^(::ffff:)?127\./.test(addr) || addr === '::1' || /^(::ffff:)?172\.(1[6-9]|2\d|3[01])\./.test(addr));

  function routes(app: FastifyInstance) {
    app.post<{ Body: { kind?: string; detail?: string } }>('/api/push/host', { bodyLimit: 2048 }, async (req, reply) => {
      if (req.headers['x-forwarded-for'] || !isLocal(req.socket.remoteAddress)) return reply.code(403).send({ error: 'nur vom Pi' });
      const k = HOST_KINDS[String(req.body?.kind)];
      if (!k) return reply.code(400).send({ error: 'kind unbekannt' });
      const kind = String(req.body!.kind);
      const now = Date.now();
      if (now - (hostLast.get(kind) ?? 0) < HOST_REPEAT_MS) return { sent: false, reason: 'kürzlich gemeldet' };
      hostLast.set(kind, now);
      const detail = String(req.body?.detail ?? '').replace(/[^\p{L}\p{N}\s.,:;/()_\-+%=]/gu, '').slice(0, 160);
      await dispatch([{ category: 'fault', tag: `host-${kind}`, title: k.title, body: `${detail ? `${detail}. ` : ''}${k.hint}`, url: '#/' }]);
      return { sent: true };
    });

    app.get('/api/push', async () => ({ publicKey: vapid!.publicKey, subscribers: all().length, log: getLog() }));

    app.post<{ Body: { endpoint?: string } }>('/api/push/status', async (req) => {
      const row = db.prepare('SELECT prefs FROM push_subs WHERE endpoint = ?').get(String(req.body?.endpoint ?? '')) as { prefs: string } | undefined;
      return { subscribed: !!row, prefs: row ? (JSON.parse(row.prefs) as PushPrefs) : DEFAULT_PUSH_PREFS };
    });

    app.post<{ Body: { subscription: unknown; prefs?: unknown } }>('/api/push/subscribe', { bodyLimit: 8 * 1024 }, async (req, reply) => {
      const { subscription, prefs = DEFAULT_PUSH_PREFS } = req.body ?? ({} as never);
      if (!isSub(subscription)) return reply.code(400).send({ error: 'subscription ungültig' });
      const err = validatePushPrefs(prefs);
      if (err) return reply.code(400).send({ error: err });
      const exists = db.prepare('SELECT 1 FROM push_subs WHERE endpoint = ?').get(subscription.endpoint);
      if (!exists && all().length >= MAX_SUBS) return reply.code(409).send({ error: `höchstens ${MAX_SUBS} Geräte` });
      const sub: Sub = { endpoint: subscription.endpoint, keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth } };
      db.prepare(`INSERT INTO push_subs (endpoint, sub, prefs, created_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(endpoint) DO UPDATE SET sub = excluded.sub, prefs = excluded.prefs`).run(sub.endpoint, JSON.stringify(sub), JSON.stringify(prefs), new Date().toISOString());
      req.log.info('push: Abo gespeichert');
      return { subscribed: true, prefs };
    });

    app.post<{ Body: { endpoint?: string } }>('/api/push/unsubscribe', async (req) => {
      del(String(req.body?.endpoint ?? ''));
      return { subscribed: false };
    });

    app.post<{ Body: { endpoint?: string } }>('/api/push/test', async (req, reply) => {
      const row = db.prepare('SELECT sub FROM push_subs WHERE endpoint = ?').get(String(req.body?.endpoint ?? '')) as { sub: string } | undefined;
      if (!row) return reply.code(404).send({ error: 'nicht abonniert' });
      const sent = await sendTo(JSON.parse(row.sub), { title: 'Test', body: 'Benachrichtigungen funktionieren.', url: '#/einstellungen/benachrichtigungen', tag: 'test' });
      return sent ? { ok: true } : reply.code(502).send({ error: 'Versand fehlgeschlagen' });
    });
  }

  return { routes, start, dispatch };
}
