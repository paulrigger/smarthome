// Benachrichtigungen (Web Push): Regeln über den Live-Snapshot, rein und getestet (apps/api/src/domain/alerts.test.ts).
// Der Server ruft evaluateAlerts() alle ~30 s auf, hält den Zustand und verschickt die Ereignisse je Abo (Kategorie + Ruhezeit).

import type { LiveSnapshot } from './index';
import { DEFAULT_THRESHOLDS, deviceState, type Thresholds } from './standby';

export type AlertCategory = 'surplus' | 'carBattery' | 'fault' | 'appliance';

export const ALERT_CATEGORIES: { id: AlertCategory; label: string; note: string }[] = [
  { id: 'surplus', label: 'PV-Überschuss', note: 'Einspeisung über 2 kW seit 10 min – Zeit für Waschmaschine, Geschirrspüler oder Auto' },
  { id: 'carBattery', label: 'Auto & Akku', note: 'Laden beendet, Hausakku voll oder leer' },
  { id: 'appliance', label: 'Geräte fertig', note: 'Waschmaschine und Geschirrspüler fertig' },
  { id: 'fault', label: 'Störungen', note: 'Messwerte fehlen länger als 35 min (Smart Meter, PV, Akku, WP, Wallbox), keine Live-Daten, InfluxDB nicht erreichbar oder speichert nichts mehr (z. B. Festplatte weg)' },
];

export interface PushPrefs {
  categories: Record<AlertCategory, boolean>;
  /** Ruhezeit (lokale Stunden, über Mitternacht erlaubt); null = immer melden. Störungen ebenfalls stumm. */
  quiet: { from: number; to: number } | null;
}

export const DEFAULT_PUSH_PREFS: PushPrefs = {
  categories: { surplus: true, carBattery: true, appliance: true, fault: true },
  quiet: { from: 22, to: 7 },
};

export function validatePushPrefs(x: unknown): string | null {
  const p = x as PushPrefs;
  if (!p || typeof p !== 'object' || !p.categories || typeof p.categories !== 'object') return 'categories fehlt';
  for (const c of ALERT_CATEGORIES) if (typeof p.categories[c.id] !== 'boolean') return `Kategorie ${c.id} fehlt`;
  if (p.quiet !== null) {
    const h = (n: unknown) => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 23;
    if (!p.quiet || !h(p.quiet.from) || !h(p.quiet.to)) return 'quiet ungültig';
  }
  return null;
}

/** Liegt die lokale Stunde in der Ruhezeit? from == to = keine Ruhezeit. */
export function inQuietHours(quiet: PushPrefs['quiet'], hour: number): boolean {
  if (!quiet || quiet.from === quiet.to) return false;
  return quiet.from < quiet.to ? hour >= quiet.from && hour < quiet.to : hour >= quiet.from || hour < quiet.to;
}

export interface AlertEvent {
  category: AlertCategory;
  /** gleicher tag ersetzt die vorige Mitteilung auf dem Gerät */
  tag: string;
  title: string;
  body: string;
  /** Ziel beim Antippen (Hash-Route) */
  url: string;
}

export const ALERT_CONFIG = {
  surplusW: 2000, // Einspeisung ab
  surplusForMs: 10 * 60_000, // so lange am Stück
  surplusRearmMs: 30 * 60_000, // erst wieder melden, nachdem so lange < surplusW/2 eingespeist wurde
  surplusCooldownMs: 3 * 3600_000,
  carDoneAfterMs: 3 * 60_000, // Wallbox so lange nicht mehr "an"
  carMinKwh: 0.2,
  batteryFull: 99,
  batteryFullRearm: 90,
  batteryLow: 10,
  batteryLowRearm: 20,
  liveFailMs: 10 * 60_000,
  storeFailMs: 10 * 60_000, // InfluxDB nicht erreichbar / Abfrage scheitert
  storeStaleMs: 20 * 60_000, // jüngster Wert in InfluxDB älter (Node-RED schreibt alle 5 min)
  /** Geräte: läuft ab runW, fertig nach doneAfterMs unter runW, nur Läufe ≥ minRunMs */
  appliances: {
    washingmachine: { runW: 20, doneAfterMs: 8 * 60_000, minRunMs: 20 * 60_000 },
    geschirrspueler: { runW: 20, doneAfterMs: 20 * 60_000, minRunMs: 30 * 60_000 }, // Trocknen: lange Pausen ohne Last
  } as Record<string, { runW: number; doneAfterMs: number; minRunMs: number }>,
  /** Messwerte, deren Ausfall gemeldet wird; pv: nur tagsüber (Wechselrichter schlafen nachts) */
  faultKeys: [
    { key: 'grid.power', label: 'Smart Meter' },
    { key: 'pvRoof.power', label: 'PV Dach', pv: true },
    { key: 'pvCarport.power', label: 'PV Carport (Huawei)', pv: true },
    { key: 'battery.soc', label: 'Akku' },
    { key: 'heatpump.power', label: 'Wärmepumpe' },
    { key: 'wallbox.power', label: 'Wallbox' },
  ] as { key: string; label: string; pv?: boolean }[],
};

interface Run {
  start: number;
  lastHigh: number;
  kwh: number;
  last: number;
}

export interface AlertState {
  surplus: { since: number | null; lowSince: number | null; armed: boolean; lastAt: number | null };
  car: Run | null;
  carOffSince: number | null;
  batteryFullArmed: boolean;
  batteryLowArmed: boolean;
  faults: Record<string, boolean>; // gemeldet und noch nicht wieder da
  liveFailSince: number | null;
  liveFailReported: boolean;
  storeFailSince: number | null;
  storeFailReported: boolean;
  storeStaleReported: boolean;
  runs: Record<string, Run | null>;
}

export const INITIAL_ALERT_STATE: AlertState = {
  surplus: { since: null, lowSince: null, armed: true, lastAt: null },
  car: null,
  carOffSince: null,
  batteryFullArmed: true,
  batteryLowArmed: true,
  faults: {},
  liveFailSince: null,
  liveFailReported: false,
  storeFailSince: null,
  storeFailReported: false,
  storeStaleReported: false,
  runs: {},
};

const kw = (w: number) => `${(w / 1000).toLocaleString('de-AT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kW`;
const kwh = (x: number) => `${x.toLocaleString('de-AT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kWh`;
const dur = (ms: number) => {
  const m = Math.round(ms / 60_000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} h`;
};
/** Leistung über dt integrieren (Lücken > 2 min nicht hochrechnen). */
const integrate = (run: Run, w: number, now: number) => {
  run.kwh += (Math.max(0, w) * Math.min(now - run.last, 120_000)) / 3_600_000_000;
  run.last = now;
};

/** Zustand der Datenhaltung: InfluxDB erreichbar? Zeitpunkt des jüngsten Werts (ms) über mehrere Quellen. */
export interface StoreHealth {
  ok: boolean;
  error?: string;
  lastWrite: number | null;
}

/** Datenhaltung prüfen (unabhängig vom Live-Snapshot, der über MQTT auch ohne InfluxDB läuft). */
function evaluateStore(s: AlertState, store: StoreHealth, now: number, cfg: typeof ALERT_CONFIG, events: AlertEvent[]) {
  if (!store.ok) {
    s.storeFailSince ??= now;
    if (!s.storeFailReported && now - s.storeFailSince >= cfg.storeFailMs) {
      s.storeFailReported = true;
      events.push({ category: 'fault', tag: 'fault-influx', title: 'InfluxDB nicht erreichbar', body: `Seit ${dur(now - s.storeFailSince)}${store.error ? ` (${store.error.slice(0, 80)})` : ''}. Verlauf und Auswertungen fehlen.`, url: '#/' });
    }
    return;
  }
  if (s.storeFailReported) events.push({ category: 'fault', tag: 'fault-influx', title: 'InfluxDB wieder erreichbar', body: `Ausfall ${dur(now - (s.storeFailSince ?? now))}.`, url: '#/' });
  s.storeFailSince = null;
  s.storeFailReported = false;
  const age = store.lastWrite === null ? Infinity : now - store.lastWrite;
  if (age >= cfg.storeStaleMs && !s.storeStaleReported) {
    s.storeStaleReported = true;
    events.push({
      category: 'fault',
      tag: 'fault-store',
      title: 'InfluxDB speichert keine Daten',
      body: `${store.lastWrite === null ? 'Kein Wert in den letzten 6 h' : `Letzter Wert vor ${dur(age)}`}. Externe Festplatte am Pi, InfluxDB oder Node-RED prüfen.`,
      url: '#/',
    });
  } else if (age < cfg.storeStaleMs && s.storeStaleReported) {
    s.storeStaleReported = false;
    events.push({ category: 'fault', tag: 'fault-store', title: 'InfluxDB speichert wieder', body: 'Neue Werte kommen an. Die Lücke bleibt im Verlauf.', url: '#/' });
  }
}

/**
 * Ein Auswerteschritt. live = null: Live-Daten nicht abrufbar.
 * hour = lokale Stunde (für "PV nur tagsüber"), damit die Funktion zeitzonenfrei testbar bleibt.
 */
export function evaluateAlerts(
  prev: AlertState,
  live: LiveSnapshot | null,
  now: number,
  hour: number,
  th: Thresholds = DEFAULT_THRESHOLDS,
  cfg = ALERT_CONFIG,
  store?: StoreHealth,
): { state: AlertState; events: AlertEvent[] } {
  const s: AlertState = structuredClone(prev);
  const events: AlertEvent[] = [];
  if (store) evaluateStore(s, store, now, cfg, events);

  // --- Störung: gar keine Live-Daten
  if (!live) {
    s.liveFailSince ??= now;
    if (!s.liveFailReported && now - s.liveFailSince >= cfg.liveFailMs) {
      s.liveFailReported = true;
      events.push({ category: 'fault', tag: 'fault-live', title: 'Keine Live-Daten', body: `Seit ${dur(now - s.liveFailSince)} keine Werte von MQTT/InfluxDB.`, url: '#/' });
    }
    return { state: s, events };
  }
  if (s.liveFailReported) events.push({ category: 'fault', tag: 'fault-live', title: 'Live-Daten wieder da', body: `Ausfall ${dur(now - (s.liveFailSince ?? now))}.`, url: '#/' });
  s.liveFailSince = null;
  s.liveFailReported = false;

  const p = live.power;
  const soc = live.battery.soc;

  // --- PV-Überschuss: Einspeisung (grid < 0) über surplusW am Stück
  const exp = p.grid === null ? null : -p.grid;
  if (exp !== null) {
    if (exp >= cfg.surplusW) {
      s.surplus.since ??= now;
      s.surplus.lowSince = null;
      const cooled = s.surplus.lastAt === null || now - s.surplus.lastAt >= cfg.surplusCooldownMs;
      if (s.surplus.armed && cooled && now - s.surplus.since >= cfg.surplusForMs) {
        s.surplus.armed = false;
        s.surplus.lastAt = now;
        const parts = [`Einspeisung ${kw(exp)}`];
        if (p.pv !== null) parts.push(`PV ${kw(p.pv)}`);
        if (soc !== null) parts.push(`Akku ${soc} %`);
        const hint = live.car.plugged && deviceState('wallbox', p.wallbox, th) !== 'on' ? 'Auto ist angesteckt und lädt nicht.' : 'Jetzt Waschmaschine, Geschirrspüler oder Auto.';
        events.push({ category: 'surplus', tag: 'surplus', title: 'PV-Überschuss', body: `${parts.join(' · ')}. ${hint}`, url: '#/' });
      }
    } else {
      s.surplus.since = null;
      if (exp < cfg.surplusW / 2) {
        s.surplus.lowSince ??= now;
        if (now - s.surplus.lowSince >= cfg.surplusRearmMs) s.surplus.armed = true;
      } else s.surplus.lowSince = null;
    }
  }

  // --- Auto: Ladevorgang beendet
  const wb = deviceState('wallbox', p.wallbox, th);
  if (wb === 'on') {
    s.carOffSince = null;
    if (!s.car) s.car = { start: now, lastHigh: now, kwh: 0, last: now };
    else integrate(s.car, p.wallbox!, now);
    s.car.lastHigh = now;
  } else if (s.car && wb !== null) {
    s.carOffSince ??= now;
    if (now - s.carOffSince >= cfg.carDoneAfterMs) {
      const run = s.car;
      s.car = null;
      s.carOffSince = null;
      if (run.kwh >= cfg.carMinKwh) {
        const carSoc = live.car.soc;
        events.push({
          category: 'carBattery',
          tag: 'car',
          title: carSoc !== null && carSoc < 95 ? `Auto: Laden beendet bei ${carSoc} %` : 'Auto fertig geladen',
          body: `${kwh(run.kwh)} in ${dur(run.lastHigh - run.start)}${carSoc !== null ? ` · Ladestand ${carSoc} %` : ''}${live.car.range !== null ? ` · ${live.car.range} km` : ''}`,
          url: '#/auto',
        });
      }
    }
  }

  // --- Hausakku voll / leer (mit Hysterese)
  if (soc !== null) {
    if (soc >= cfg.batteryFull && s.batteryFullArmed) {
      s.batteryFullArmed = false;
      events.push({ category: 'carBattery', tag: 'battery', title: 'Akku voll', body: `Ladestand ${soc} % – weiterer Überschuss geht ins Netz.`, url: '#/' });
    } else if (soc < cfg.batteryFullRearm) s.batteryFullArmed = true;
    if (soc <= cfg.batteryLow && s.batteryLowArmed) {
      s.batteryLowArmed = false;
      events.push({ category: 'carBattery', tag: 'battery', title: 'Akku leer', body: `Ladestand ${soc} % – Haus bezieht aus dem Netz${p.grid !== null && p.grid > 0 ? ` (${kw(p.grid)})` : ''}.`, url: '#/' });
    } else if (soc > cfg.batteryLowRearm) s.batteryLowArmed = true;
  }

  // --- Geräte fertig
  for (const a of live.appliances) {
    const c = cfg.appliances[a.id];
    if (!c || a.power === null) continue;
    let run = s.runs[a.id] ?? null;
    if (a.power >= c.runW) {
      if (!run) run = { start: now, lastHigh: now, kwh: 0, last: now };
      else integrate(run, a.power, now);
      run.lastHigh = now;
    } else if (run) {
      integrate(run, a.power, now);
      if (now - run.lastHigh >= c.doneAfterMs) {
        if (run.lastHigh - run.start >= c.minRunMs)
          events.push({ category: 'appliance', tag: `appliance-${a.id}`, title: `${a.name.replace(/­/g, '')} fertig`, body: `Lief ${dur(run.lastHigh - run.start)} · ${kwh(run.kwh)}`, url: '#/' });
        run = null;
      }
    }
    s.runs[a.id] = run;
  }

  // --- Störungen: Messwert fehlt (stale = älter als 35 min)
  const day = hour >= 8 && hour < 18;
  for (const f of cfg.faultKeys) {
    const isStale = live.stale.includes(f.key);
    if (isStale && !s.faults[f.key] && (!f.pv || day)) {
      s.faults[f.key] = true;
      events.push({ category: 'fault', tag: `fault-${f.key}`, title: `${f.label}: keine Daten`, body: 'Seit über 35 min kein Messwert.', url: '#/' });
    } else if (!isStale && s.faults[f.key]) {
      delete s.faults[f.key];
      events.push({ category: 'fault', tag: `fault-${f.key}`, title: `${f.label}: wieder da`, body: 'Messwerte kommen wieder.', url: '#/' });
    }
  }

  return { state: s, events };
}
