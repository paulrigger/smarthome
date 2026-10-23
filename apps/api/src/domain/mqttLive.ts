// MQTT-Topics -> Rohwerte je Registry-Key (siehe docs/mqtt-topics.md).
// Werte werden in den Einheiten der Influx-Felder abgelegt, damit die Faktoren aus
// registry.ts unverändert gelten (z.B. pvRoof negativ, heatpump.heat in kW).
import type { RawPoints } from './energy';

/** Shelly Plus Plugs (Gen2): Topic-Präfix -> Appliance-Id */
const PLUGS: Record<string, string> = {
  shellykaffeemaschine: 'coffeemachine',
  shellyfreezer: 'freezer',
  shellygeschirrspueler: 'geschirrspueler',
  shellyrouter: 'router',
  Shellykuehlschrank: 'kuehlschrank',
  shellywashingmachine: 'washingmachine',
};

/** Shelly 3EM (Gen1): Kanäle werden summiert */
const EMETER_SUM: Record<string, string> = {
  shellywallbox: 'wallbox.power',
  shellyherd: 'appliance.herd.power',
};

const SMART_METER = 'CBYTE/1KFM0200176549/sensor';
const OBIS_IMPORT_KW = '1.0.1.7.0.255';
const OBIS_EXPORT_KW = '1.0.2.7.0.255';

type Value = number | boolean | string;
type Updates = [key: string, value: Value][];

const num = (s: string): number | null => {
  const n = Number(s);
  return s.trim() !== '' && Number.isFinite(n) ? n : null;
};
const json = (s: string): Record<string, unknown> | null => {
  try {
    const o = JSON.parse(s);
    return o && typeof o === 'object' ? (o as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};
const field = (o: Record<string, unknown> | null, k: string, scale = 1): number | null =>
  o && typeof o[k] === 'number' && Number.isFinite(o[k]) ? (o[k] as number) * scale : null;

/** Topics zum Abonnieren. carPrefix z.B. "saic/<konto>/vehicles/<VIN>" (ohne Slash am Ende). */
export function mqttTopics(carPrefix?: string): string[] {
  const t = [
    SMART_METER,
    'shellies/shellypv/emeter/0/power',
    'shellies/shellypv/emeter/1/power',
    ...Object.keys(EMETER_SUM).map((d) => `shellies/${d}/emeter/+/power`),
    'huawei/inverter/power',
    'huawei/battery/powerFromBattery',
    'huawei/battery/soc',
    'lambda/hp',
    'lambda/ww',
    'lambda/boiler',
    'lambda/temps',
    ...Object.keys(PLUGS).map((p) => `${p}/status/switch:0`),
  ];
  if (carPrefix) t.push(`${carPrefix}/drivetrain/soc`, `${carPrefix}/drivetrain/fossilFuel/range`, `${carPrefix}/drivetrain/chargerConnected`);
  return t;
}

/** Eine Nachricht -> Updates [registry-key, Rohwert]. Unbekanntes/Unlesbares -> []. */
export function parseMessage(topic: string, payload: string, carPrefix?: string): Updates {
  const out: Updates = [];
  const put = (key: string, v: Value | null) => {
    if (v !== null) out.push([key, v]);
  };
  const one = (key: string, v: Value | null): Updates => (v === null ? [] : [[key, v]]);

  if (topic === SMART_METER) {
    const o = json(payload);
    const imp = field(o, OBIS_IMPORT_KW);
    const exp = field(o, OBIS_EXPORT_KW);
    if (imp !== null && exp !== null) put('grid.power', Math.round((imp - exp) * 1000));
    return out;
  }
  if (topic === 'shellies/shellypv/emeter/0/power') return one('pvRoof.power', num(payload));
  if (topic === 'shellies/shellypv/emeter/1/power') return one('appliance.backrohr.power', num(payload));
  if (topic === 'huawei/inverter/power') return one('pvCarport.power', num(payload));
  if (topic === 'huawei/battery/powerFromBattery') return one('battery.power', num(payload));
  if (topic === 'huawei/battery/soc') return one('battery.soc', num(payload));

  const em = /^shellies\/([^/]+)\/emeter\/(\d)\/power$/.exec(topic);
  if (em && EMETER_SUM[em[1]]) return one(`${EMETER_SUM[em[1]]}#${em[2]}`, num(payload));

  if (topic.startsWith('lambda/')) {
    const o = json(payload);
    if (topic === 'lambda/hp') {
      put('heatpump.power', field(o, 'FIPowerConsumption'));
      put('heatpump.heat', field(o, 'Qpheating', 0.1)); // 0,1 kW -> kW
      put('heatpump.cop', field(o, 'COP', 0.01));
      put('heatpump.flowTemp', field(o, 'Tflow', 0.01));
    } else if (topic === 'lambda/ww') put('heatpump.dhwTop', field(o, 'WarmwasserOben'));
    else if (topic === 'lambda/boiler') put('heatpump.bufferTop', field(o, 'BoilerOben'));
    else if (topic === 'lambda/temps') put('outdoor.temp', field(o, 'ActualAmbienTemp'));
    return out;
  }

  const plug = /^([^/]+)\/status\/switch:0$/.exec(topic);
  if (plug && PLUGS[plug[1]]) return one(`appliance.${PLUGS[plug[1]]}.power`, field(json(payload), 'apower'));

  if (carPrefix && topic.startsWith(`${carPrefix}/drivetrain/`)) {
    const rest = topic.slice(carPrefix.length + '/drivetrain/'.length);
    if (rest === 'soc') put('car.soc', num(payload));
    else if (rest === 'fossilFuel/range') put('car.range', num(payload));
    else if (rest === 'chargerConnected') put('car.plugged', payload.trim()); // "True"/"False"
  }
  return out;
}

/** Letzter Wert je Key; Mehrkanal-Werte (key#n) werden zur Summe zusammengefasst. */
export class MqttLiveState {
  private readonly raw: RawPoints = new Map();
  lastMessage: Date | null = null;

  constructor(private readonly carPrefix?: string) {}

  apply(topic: string, payload: string, time = new Date()): void {
    const updates = parseMessage(topic, payload, this.carPrefix);
    if (!updates.length) return;
    this.lastMessage = time;
    for (const [key, value] of updates) this.raw.set(key, { value, time });
  }

  points(): RawPoints {
    const out: RawPoints = new Map();
    const sums = new Map<string, { value: number; time: Date }>();
    for (const [key, p] of this.raw) {
      const i = key.indexOf('#');
      if (i < 0) {
        out.set(key, p);
        continue;
      }
      const base = key.slice(0, i);
      const s = sums.get(base) ?? { value: 0, time: p.time };
      s.value += Number(p.value);
      if (p.time > s.time) s.time = p.time;
      sums.set(base, s);
    }
    for (const [key, s] of sums) out.set(key, { value: Math.round(s.value * 100) / 100, time: s.time });
    return out;
  }
}

/** MQTT hat Vorrang, Influx liefert Startwerte und alles, was es auf MQTT nicht gibt. */
export function mergeLive(influx: RawPoints, mqtt: RawPoints): RawPoints {
  const out: RawPoints = new Map(influx);
  for (const [key, p] of mqtt) out.set(key, p);
  return out;
}
