// PushWard (https://pushward.app): Live-Aktivitäten (Dynamic Island) per HTTP. Schlüssel nur in .env (PUSHWARD_KEY, hlk_…).
import type { ActivityCommand, ActivityState, LiveSnapshot } from '@smarthome/shared';
import { planActivities } from '@smarthome/shared';
import type { SettingsStore } from './settingsStore';

const API = 'https://api.pushward.app';
const sec = (ms: number) => Math.round(ms / 1000);

export function openActivities(settings: SettingsStore, o: { key?: string; slugPrefix?: string; log: (msg: string) => void }) {
  const slug = (id: string) => `${o.slugPrefix ?? 'flux'}-${id}`;
  const created = new Set<string>();
  const log: { ts: string; text: string }[] = [];

  async function call(method: string, path: string, body?: unknown) {
    const r = await fetch(`${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${o.key}`, 'Content-Type': method === 'PATCH' ? 'application/merge-patch+json' : 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${(await r.text().catch(() => '')).slice(0, 120)}`);
  }

  async function send(c: ActivityCommand) {
    const s = slug(c.id);
    if (!created.has(s)) {
      await call('POST', '/activities', { slug: s, name: c.name, priority: 3 }); // idempotent
      created.add(s);
    }
    if (c.kind === 'end') {
      await call('PATCH', `/activities/${s}`, {
        state: 'ended',
        dismissal_ttl: 900,
        content: { template: 'countdown', state: `${c.name} fertig`, progress: 1, accent_color: 'green', icon: 'checkmark.circle' },
      });
    } else {
      await call('PATCH', `/activities/${s}`, {
        state: 'ongoing',
        content: {
          template: 'countdown',
          state: c.title,
          subtitle: c.subtitle ?? undefined,
          icon: c.icon,
          start_date: sec(c.startedAt),
          end_date: sec(Math.max(c.endsAt, Date.now() + 60_000)),
          completion_message: c.estimated ? 'gleich fertig' : 'fertig',
          accent_color: 'cyan',
        },
      });
    }
    log.unshift({ ts: new Date().toISOString(), text: `${c.kind} ${c.id}${c.kind !== 'end' ? ` bis ${new Date(c.endsAt).toISOString()}` : ''}` });
    log.length = Math.min(log.length, 20);
  }

  let state: ActivityState = settings.get<ActivityState>('activityState') ?? {};
  let busy = false;

  /** Ein Schritt mit dem aktuellen Snapshot (aus der Push-Schleife). */
  async function step(live: LiveSnapshot | null, now = Date.now()) {
    if (!o.key || busy) return;
    busy = true;
    try {
      const r = planActivities(state, live, now);
      state = r.state;
      if (r.commands.length) settings.put('activityState', state);
      for (const c of r.commands) await send(c).catch((e: Error) => o.log(`pushward: ${e.message}`));
    } finally {
      busy = false;
    }
  }

  return { step, enabled: !!o.key, status: () => ({ enabled: !!o.key, state, log }) };
}
