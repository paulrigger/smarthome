// Status der Sensoren und Geräte: letzter Wert je Quelle (MQTT live, InfluxDB gespeichert) mit Ampel.
// Rein: Eingaben (Zeitstempel je Serien-Key) → Ergebnis. Die API liefert die Zeitstempel, die Seite zeigt sie.

import { APPLIANCE_NAMES } from './names';

/** ok: innerhalb des Takts · late: bis 3× Takt überfällig · down: länger oder nie gesehen. */
export type Level = 'ok' | 'late' | 'down';

export interface SourceStatus {
  level: Level;
  seen: string | null; // ISO-Zeitstempel des letzten Werts
  ageS: number | null;
}

export interface DeviceStatus {
  id: string;
  name: string;
  maxAgeMin: number; // erwarteter Takt; darüber hinaus wird es gelb/rot
  /** null: keiner der Werte kommt über MQTT */
  mqtt: SourceStatus | null;
  influx: SourceStatus;
}

export interface SystemStatus {
  ts: string;
  mqtt: { connected: boolean; lastMessage: string | null };
  influx: { ok: boolean };
  devices: DeviceStatus[];
}

export interface DeviceDef {
  id: string;
  name: string;
  keys: string[]; // Serien-Keys aus registry.ts
  maxAgeMin: number;
}

const appliance = (id: string) => ({
  id: `appliance.${id}`,
  name: APPLIANCE_NAMES[id]?.replace(/­/g, '') ?? id,
  keys: [`appliance.${id}.power`, `appliance.${id}`],
  maxAgeMin: 10,
});

/** Geräte für die Statusseite. Takte aus Messdaten (Influx 5 min, Modbus Carport/Akku alle 5–30 min, Auto nur online). */
export const STATUS_DEVICES: DeviceDef[] = [
  { id: 'smarti', name: 'Netz (Smart Meter)', keys: ['grid.power', 'gridImport', 'gridExport'], maxAgeMin: 10 },
  { id: 'house_pv', name: 'PV Dach', keys: ['pvRoof.power', 'pvRoof'], maxAgeMin: 10 },
  { id: 'carportpv', name: 'PV Carport (Huawei)', keys: ['pvCarport.power', 'pvCarport'], maxAgeMin: 15 },
  { id: 'huaweibattery', name: 'Akku (Huawei)', keys: ['battery.power', 'battery.soc', 'batteryCharge', 'batteryDischarge'], maxAgeMin: 15 },
  { id: 'wallbox', name: 'Wallbox', keys: ['wallbox.power', 'wallbox'], maxAgeMin: 10 },
  {
    id: 'lambda',
    name: 'Wärmepumpe (Lambda)',
    keys: ['heatpump.power', 'heatpump.heat', 'heatpump.cop', 'heatpump.flowTemp', 'heatpump.dhwTop', 'heatpump.bufferTop', 'outdoor.temp', 'heatpump', 'heatpumpHeat'],
    maxAgeMin: 10,
  },
  { id: 'systadata', name: 'Solarthermie', keys: ['solarThermal.power', 'solarThermal.collectorTemp', 'solarThermal'], maxAgeMin: 10 },
  { id: 'Wohnzimmer', name: 'Raumklima Wohnzimmer', keys: ['Wohnzimmer.temp', 'Wohnzimmer.hum', 'Wohnzimmer.co2'], maxAgeMin: 10 },
  { id: 'Gallerie', name: 'Raumklima Galerie', keys: ['Gallerie.temp', 'Gallerie.hum', 'Gallerie.co2'], maxAgeMin: 10 },
  { id: 'MG5', name: 'Auto (MG5)', keys: ['car.soc', 'car.range', 'car.home', 'car.plugged'], maxAgeMin: 60 },
  ...Object.keys(APPLIANCE_NAMES).map(appliance),
];

/** Ampel-Stufe aus dem Alter des letzten Werts. */
export function levelOf(seen: Date | undefined, now: Date, maxAgeMin: number): Level {
  if (!seen) return 'down';
  const age = now.getTime() - seen.getTime();
  if (age <= maxAgeMin * 60_000) return 'ok';
  if (age <= 3 * maxAgeMin * 60_000) return 'late';
  return 'down';
}

function sourceOf(seen: Date | undefined, now: Date, maxAgeMin: number): SourceStatus {
  return {
    level: levelOf(seen, now, maxAgeMin),
    seen: seen?.toISOString() ?? null,
    ageS: seen ? Math.max(0, Math.round((now.getTime() - seen.getTime()) / 1000)) : null,
  };
}

/** Jüngster Zeitpunkt über die Keys eines Geräts (undefined, wenn keiner vorhanden). */
function newest(seen: Map<string, Date>, keys: string[]): Date | undefined {
  let best: Date | undefined;
  for (const k of keys) {
    const t = seen.get(k);
    if (t && (!best || t > best)) best = t;
  }
  return best;
}

export interface StatusInput {
  now: Date;
  mqttConnected: boolean;
  mqttLast: string | null;
  influxOk: boolean;
  /** Jüngster Wert je Serien-Key aus InfluxDB */
  influxSeen: Map<string, Date>;
  /** Jüngster Wert je Serien-Key über MQTT */
  mqttSeen: Map<string, Date>;
  devices?: DeviceDef[];
}

export function buildStatus(input: StatusInput): SystemStatus {
  const devices = (input.devices ?? STATUS_DEVICES).map<DeviceStatus>((d) => {
    const mq = newest(input.mqttSeen, d.keys);
    return {
      id: d.id,
      name: d.name,
      maxAgeMin: d.maxAgeMin,
      mqtt: mq ? sourceOf(mq, input.now, d.maxAgeMin) : null,
      influx: sourceOf(newest(input.influxSeen, d.keys), input.now, d.maxAgeMin),
    };
  });
  return {
    ts: input.now.toISOString(),
    mqtt: { connected: input.mqttConnected, lastMessage: input.mqttLast },
    influx: { ok: input.influxOk },
    devices,
  };
}

/** Geräte mit mindestens einer nicht grünen Ampel (MQTT nur, wenn der Wert überhaupt über MQTT kommt). */
export function statusProblems(s: SystemStatus): DeviceStatus[] {
  return s.devices.filter((d) => d.influx.level !== 'ok' || (d.mqtt !== null && d.mqtt.level !== 'ok'));
}

/** Mock-Daten: deterministisch je Gerät, damit die Seite ohne Heimnetz alle drei Stufen zeigt. */
export function mockSystemStatus(now = new Date()): SystemStatus {
  const influxSeen = new Map<string, Date>();
  const mqttSeen = new Map<string, Date>();
  STATUS_DEVICES.forEach((d, i) => {
    const influxAge = (i * 97) % 500; // Sekunden
    const t = new Date(now.getTime() - influxAge * 1000);
    for (const k of d.keys) influxSeen.set(k, t);
    if (i % 3 === 0) {
      for (const k of d.keys) mqttSeen.set(k, new Date(now.getTime() - ((i * 13) % 40) * 1000));
    }
  });
  // einzelne Geräte zeigen Verzug und Ausfall
  const car = STATUS_DEVICES.find((d) => d.id === 'MG5');
  if (car) for (const k of car.keys) influxSeen.set(k, new Date(now.getTime() - 2 * 3600_000));
  const herd = STATUS_DEVICES.find((d) => d.id === 'appliance.herd');
  if (herd) for (const k of herd.keys) influxSeen.delete(k);
  return buildStatus({ now, mqttConnected: true, mqttLast: now.toISOString(), influxOk: true, influxSeen, mqttSeen });
}
