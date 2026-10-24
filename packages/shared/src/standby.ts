// Geräteabhängige Schwellen: aus / Standby / an (Betrag der Leistung in W).
// |W| < off → aus · off ≤ |W| < on → Standby (gedämpft, keine Animation) · |W| ≥ on → an (gefärbt, animiert).
// Standardwerte aus Messdaten 20.–22.10.2026 (5-min-Mittel), in den Einstellungen änderbar (API /api/thresholds).

import { APPLIANCE_NAMES } from './names';

export type DeviceState = 'off' | 'standby' | 'on';

export interface Threshold {
  off: number; // W
  on: number; // W, ≥ off
}

export type Thresholds = Record<string, Threshold>;

/** Anlagen (Leitungen/Knoten) und Geräte (Kacheln). */
export const DEVICE_LABELS: Record<string, string> = {
  pvRoof: 'PV Dach',
  pvCarport: 'PV Carport',
  solarThermal: 'Solarthermie',
  grid: 'Netz',
  battery: 'Akku',
  heatpump: 'Wärmepumpe',
  wallbox: 'Wallbox',
  ...Object.fromEntries(Object.entries(APPLIANCE_NAMES).map(([k, v]) => [k, v.replace(/­/g, '')])),
};
export const DEVICE_KEYS = Object.keys(DEVICE_LABELS);

const t = (off: number, on: number): Threshold => ({ off, on });

export const DEFAULT_THRESHOLDS: Thresholds = {
  pvRoof: t(10, 30), // Fronius nachts 2–20 W (Shelly-Messung)
  pvCarport: t(10, 30),
  solarThermal: t(50, 50),
  grid: t(20, 20), // kein Standby: nahe 0 = ausgeglichen
  battery: t(15, 80), // BMS-Standby 20–50 W
  heatpump: t(5, 50),
  wallbox: t(1, 50), // Standby 2–10 W
  coffeemachine: t(1, 1), // Leerlauf 2–5 W = an
  freezer: t(1, 15), // 2–10 W Elektronik, Kompressor 20–100 W
  kuehlschrank: t(1, 15),
  herd: t(1, 20), // Standby 2–10 W
  backrohr: t(1, 20),
  geschirrspueler: t(0.5, 5), // Standby 0,5–2 W
  washingmachine: t(0.5, 5),
  router: t(1, 5), // immer 10–20 W
};

const FALLBACK = t(5, 20);

/** Zustand aus Leistung; null bei fehlenden Daten (stale → "–", nicht "aus"). */
export function deviceState(key: string, w: number | null | undefined, th: Thresholds = DEFAULT_THRESHOLDS): DeviceState | null {
  if (w === null || w === undefined || !Number.isFinite(w)) return null;
  const x = th[key] ?? DEFAULT_THRESHOLDS[key] ?? FALLBACK;
  const a = Math.abs(w);
  return a >= x.on ? 'on' : a >= x.off ? 'standby' : 'off';
}

/** Defaults + gespeicherte Abweichungen (unbekannte Keys fallen weg). */
export function mergeThresholds(overrides: Partial<Thresholds> | null | undefined): Thresholds {
  const out: Thresholds = { ...DEFAULT_THRESHOLDS };
  for (const [k, v] of Object.entries(overrides ?? {})) if (k in DEFAULT_THRESHOLDS && v) out[k] = { off: v.off, on: v.on };
  return out;
}

/** Nur Abweichungen von den Defaults (zum Speichern). */
export function diffThresholds(th: Thresholds): Partial<Thresholds> {
  const out: Partial<Thresholds> = {};
  for (const [k, v] of Object.entries(th)) {
    const d = DEFAULT_THRESHOLDS[k];
    if (d && (d.off !== v.off || d.on !== v.on)) out[k] = v;
  }
  return out;
}

export function validateThresholds(x: unknown): string | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return 'Objekt erwartet';
  const ok = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n < 100_000;
  for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
    if (!(k in DEFAULT_THRESHOLDS)) return `Unbekanntes Gerät: ${k}`;
    const th = v as Partial<Threshold>;
    if (!th || !ok(th.off) || !ok(th.on)) return `${DEVICE_LABELS[k]}: Werte 0–100.000 W`;
    if (th.off! > th.on!) return `${DEVICE_LABELS[k]}: „aus unter“ darf nicht größer als „an ab“ sein`;
  }
  return null;
}
