// API-Vertrag zwischen apps/api und apps/web.
// Konvention: Leistung in W, Energie in kWh, Temperatur in °C, Anteile 0..1.
// Vorzeichen: grid  > 0 = Netzbezug,      < 0 = Einspeisung
//             battery > 0 = Entladung,     < 0 = Ladung
//             alle Verbraucher/Erzeuger >= 0

import type { Period, Step } from './time';
export * from './time';
export * from './allocation';
export * from './yield';
export * from './flow';
export * from './tariff';
export { LEGACY_SEED_TARIFFS, SEED_TARIFFS } from './tariffSeed';
export * from './standby';
export * from './alerts';
export * from './activity';
export * from './floors';
export * from './status';

export interface Climate {
  temp: number | null;
  hum: number | null;
  co2: number | null;
}

/** Laufendes Programm eines vernetzten Geräts (Miele-API) bzw. geschätzt aus der Leistung. */
export interface ApplianceRun {
  source: 'miele' | 'estimate';
  running: boolean;
  status: string | null; // Klartext, z. B. "In Betrieb"
  program: string | null; // z. B. "Baumwolle"
  phase: string | null; // z. B. "Spülen"
  remainingMin: number | null;
  elapsedMin: number | null;
  endsAt: string | null; // ISO, voraussichtliches Ende
}

export interface Appliance {
  id: string;
  name: string;
  power: number | null; // W (live)
  energyWh?: number | null; // Zählerstand der Steckdose (Wh, nur per MQTT)
  run?: ApplianceRun | null;
}

export interface LiveSnapshot {
  ts: string;
  power: {
    pv: number | null; // Summe PV
    pvRoof: number | null;
    pvCarport: number | null;
    grid: number | null;
    battery: number | null;
    house: number | null; // Gesamtverbrauch inkl. WP + Wallbox
    heatpump: number | null;
    wallbox: number | null;
    rest: number | null; // Haus ohne WP/Wallbox
    solarThermal: number | null;
  };
  battery: { soc: number | null };
  heatpump: {
    cop: number | null;
    heatOutput: number | null; // W thermisch
    flowTemp: number | null;
    dhwTop: number | null; // Warmwasser oben
    bufferTop: number | null; // Puffer/Boiler oben
  };
  solarThermal: { collectorTemp: number | null };
  outdoorTemp: number | null;
  rooms: { id: string; name: string; climate: Climate }[];
  car: { soc: number | null; range: number | null; home: boolean | null; plugged: boolean | null };
  appliances: Appliance[];
  stale: string[]; // Keys ohne aktuelle Daten
}

export interface EnergyTotals {
  pv: number;
  pvRoof: number;
  pvCarport: number;
  gridImport: number;
  gridExport: number;
  batteryCharge: number;
  batteryDischarge: number;
  house: number;
  heatpump: number;
  heatpumpHeat: number;
  wallbox: number;
  rest: number;
  solarThermal: number;
}

export interface EnergySummary {
  period: Period;
  date: string; // Anker 'YYYY-MM-DD'
  from: string; // Beginn des Zeitraums
  to: string; // Ende der Daten (jetzt, falls laufender Zeitraum)
  end: string; // Ende des Zeitraums
  isCurrent: boolean;
  energy: EnergyTotals;
  appliances: { id: string; name: string; kwh: number }[];
  kpi: {
    selfSufficiency: number | null; // Autarkie
    selfConsumption: number | null; // Eigenverbrauchsquote
    cop: number | null; // Arbeitszahl im Zeitraum
  };
  missing: string[];
}

export interface Health {
  ok: boolean;
  version: string;
  source: 'influx' | 'mock';
  influx?: { ok: boolean; error?: string };
  /** nur wenn Live-Werte per MQTT kommen */
  mqtt?: { connected: boolean; lastMessage: string | null };
}

/** Zeitreihen für Diagramme. energy: kWh je Bucket (Balken), gauge: Mittelwerte (Linien). */
export type SeriesKind = 'energy' | 'gauge';
export interface SeriesData {
  kind: SeriesKind;
  period: Period;
  date: string;
  step: Step;
  t: string[]; // Bucket-Starts (ISO)
  values: Record<string, (number | null)[]>;
}

/** Erlaubte Keys: Energie = Zähler + abgeleitete, Gauge = Live-Serien + abgeleitete. */
// rest = Haus ohne WP/Wallbox; appliances = Summe der gemessenen Geräte; unmeasured = rest − appliances (nicht einzeln gemessen)
// pvDirect = PV − Einspeisung − Akkuladung (direkt im Haus verbrauchter PV-Strom)
export const DERIVED_ENERGY_KEYS = ['pv', 'house', 'rest', 'appliances', 'unmeasured', 'pvDirect'] as const;
// gridImport/gridExport/batteryCharge/batteryDischarge.power = vorzeichengetrennte Netz-/Akkuleistung
export const DERIVED_GAUGE_KEYS = [
  'pv.power', 'house.power', 'rest.power', 'appliances.power', 'unmeasured.power',
  'pvDirect.power', 'gridImport.power', 'gridExport.power', 'batteryCharge.power', 'batteryDischarge.power',
] as const;
/** Höchstzahl Keys je /api/series-Abfrage (Haushalt: 8 Geräte + Rest). */
export const MAX_SERIES_KEYS = 12;

export { APPLIANCE_NAMES } from './names';

export * from './mock';
