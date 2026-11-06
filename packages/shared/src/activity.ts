// Live-Aktivitäten (iOS Dynamic Island, über PushWard): wann starten/aktualisieren/beenden – rein, getestet (apps/api/src/domain/activity.test.ts).
// Quelle je Gerät: Miele-API (exakte Restzeit) oder Leistung (Start erkannt, Dauer geschätzt). Updates sparsam (Gratis-Kontingent 250/Monat).

import type { LiveSnapshot } from './index';

export interface ActivityConfig {
  /** Geräte mit Live-Aktivität: typische Dauer für die Schätzung (min) und Startschwelle (W) */
  devices: Record<string, { icon: string; estimateMin: number; startW: number; startForMs: number; doneAfterMs: number }>;
  /** Restzeit-Abweichung, ab der ein Update geschickt wird */
  resendMinDiff: number;
}

export const ACTIVITY_CONFIG: ActivityConfig = {
  devices: {
    washingmachine: { icon: 'washer', estimateMin: 120, startW: 20, startForMs: 3 * 60_000, doneAfterMs: 8 * 60_000 },
    geschirrspueler: { icon: 'dishwasher', estimateMin: 200, startW: 20, startForMs: 3 * 60_000, doneAfterMs: 20 * 60_000 },
  },
  resendMinDiff: 5,
};

export interface ActivityState {
  [id: string]: {
    active: boolean;
    endsAt: number | null; // zuletzt gesendetes Ende (ms)
    startedAt: number | null;
    highSince: number | null; // Leistung über Schwelle seit (nur Schätzung)
    lastHigh: number | null;
  };
}

export type ActivityCommand =
  | { kind: 'start' | 'update'; id: string; name: string; icon: string; endsAt: number; startedAt: number; title: string; subtitle: string | null; estimated: boolean }
  | { kind: 'end'; id: string; name: string };

const clean = (n: string) => n.replace(/­/g, '');

/** Ein Schritt: neuer Zustand + was an PushWard zu senden ist. */
export function planActivities(prev: ActivityState, live: LiveSnapshot | null, now: number, cfg = ACTIVITY_CONFIG): { state: ActivityState; commands: ActivityCommand[] } {
  const state: ActivityState = structuredClone(prev);
  const commands: ActivityCommand[] = [];
  if (!live) return { state, commands };
  for (const a of live.appliances) {
    const c = cfg.devices[a.id];
    if (!c) continue;
    const s = (state[a.id] ??= { active: false, endsAt: null, startedAt: null, highSince: null, lastHigh: null });
    const name = clean(a.name);
    const run = a.run;

    if (run && run.source === 'miele') {
      // Miele kennt Programm und Restzeit
      if (run.running && run.endsAt) {
        const ends = Date.parse(run.endsAt);
        const title = [run.program, run.phase].filter(Boolean).join(' · ') || name;
        if (!s.active) {
          s.active = true;
          s.startedAt = now - (run.elapsedMin ?? 0) * 60_000;
          s.endsAt = ends;
          commands.push({ kind: 'start', id: a.id, name, icon: c.icon, endsAt: ends, startedAt: s.startedAt, title, subtitle: run.phase, estimated: false });
        } else if (s.endsAt === null || Math.abs(ends - s.endsAt) >= cfg.resendMinDiff * 60_000) {
          s.endsAt = ends;
          commands.push({ kind: 'update', id: a.id, name, icon: c.icon, endsAt: ends, startedAt: s.startedAt ?? now, title, subtitle: run.phase, estimated: false });
        }
      } else if (s.active) {
        Object.assign(s, { active: false, endsAt: null, startedAt: null });
        commands.push({ kind: 'end', id: a.id, name });
      }
      continue;
    }

    // Schätzung aus der Leistung: Start nach startForMs über Schwelle, Ende nach doneAfterMs darunter
    if (a.power === null) continue;
    if (a.power >= c.startW) {
      s.highSince ??= now;
      s.lastHigh = now;
      if (!s.active && now - s.highSince >= c.startForMs) {
        s.active = true;
        s.startedAt = s.highSince;
        s.endsAt = s.highSince + c.estimateMin * 60_000;
        commands.push({ kind: 'start', id: a.id, name, icon: c.icon, endsAt: s.endsAt, startedAt: s.startedAt, title: name, subtitle: 'geschätzt', estimated: true });
      } else if (s.active && s.endsAt !== null && now > s.endsAt - 60_000) {
        // läuft länger als geschätzt → Ende um 15 min schieben
        s.endsAt = now + 15 * 60_000;
        commands.push({ kind: 'update', id: a.id, name, icon: c.icon, endsAt: s.endsAt, startedAt: s.startedAt ?? now, title: name, subtitle: 'dauert länger', estimated: true });
      }
    } else {
      if (!s.active) s.highSince = null;
      if (s.active && s.lastHigh !== null && now - s.lastHigh >= c.doneAfterMs) {
        Object.assign(s, { active: false, endsAt: null, startedAt: null, highSince: null, lastHigh: null });
        commands.push({ kind: 'end', id: a.id, name });
      }
    }
  }
  return { state, commands };
}

/** "noch 1:25 h" / "noch 12 min" für ein laufendes Programm, sonst null. */
export function runLabel(run: { running: boolean; remainingMin: number | null } | null | undefined): string | null {
  if (!run?.running || run.remainingMin === null) return null;
  const m = Math.max(0, Math.round(run.remainingMin));
  return m < 60 ? `noch ${m} min` : `noch ${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} h`;
}
