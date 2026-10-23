import { describe, expect, it } from 'vitest';
import { buildLive, type RawPoints } from './energy';
import { MqttLiveState, mergeLive, mqttTopics, parseMessage } from './mqttLive';
import { CAR_PREFIX, MQTT_SAMPLE } from './fixtures/mqtt-sample';

const now = new Date('2026-10-23T10:30:00Z');

function stateFromSample(t = now): MqttLiveState {
  const s = new MqttLiveState(CAR_PREFIX);
  for (const [topic, payload] of MQTT_SAMPLE) s.apply(topic, payload, t);
  return s;
}

describe('MQTT live (Mitschnitt 2026-10-23)', () => {
  it('ergibt mit den Registry-Faktoren plausible Live-Werte', () => {
    const live = buildLive(stateFromSample().points(), now);
    expect(live.power.grid).toBe(187); // OBIS 1.7.0 0.187 kW Bezug − 2.7.0 0 kW
    expect(live.power.pvRoof).toBe(788); // Shelly −787.56 W, Faktor −1
    expect(live.power.pvCarport).toBe(1421);
    expect(live.power.pv).toBe(2209);
    expect(live.power.battery).toBe(-1943); // Ladung
    expect(live.battery.soc).toBe(46);
    expect(live.power.house).toBe(453); // 2209 + 187 − 1943
    expect(live.power.wallbox).toBe(5); // Summe 3 Kanäle 4.56 + 0 + 0
    expect(live.power.heatpump).toBe(0);
    expect(live.power.rest).toBe(448);
    expect(live.heatpump).toMatchObject({ flowTemp: 35.1, dhwTop: 52.1, bufferTop: 38.6 });
    expect(live.outdoorTemp).toBe(14.6);
    expect(live.car).toMatchObject({ soc: 79, range: 317, plugged: false });
    const app = Object.fromEntries(live.appliances.map((a) => [a.id, a.power]));
    expect(app).toMatchObject({ coffeemachine: 1090, freezer: 69, router: 17, kuehlschrank: 50, washingmachine: 4, herd: 0, backrohr: 0 });
    // fehlt nur, was es nicht auf MQTT gibt (kommt live aus Influx)
    const notOnMqtt = ['solarThermal.power', 'solarThermal.collectorTemp', 'car.home', 'Wohnzimmer.temp', 'Wohnzimmer.hum', 'Wohnzimmer.co2', 'Gallerie.temp', 'Gallerie.hum', 'Gallerie.co2'];
    expect(live.stale.filter((k) => !notOnMqtt.includes(k))).toEqual([]);
    expect(live.stale).toContain('solarThermal.power');
  });

  it('skaliert lambda/hp wie Node-RED (Qpheating 0,1 kW, COP und Tflow ×0,01)', () => {
    const s = new MqttLiveState();
    s.apply('lambda/hp', JSON.stringify({ Tflow: 3514, Qpheating: 27, FIPowerConsumption: 600, COP: 450 }), now);
    const live = buildLive(s.points(), now);
    expect(live.power.heatpump).toBe(600);
    expect(live.heatpump.heatOutput).toBe(2700);
    expect(live.heatpump.cop).toBe(4.5);
    expect(live.heatpump.flowTemp).toBe(35.1);
  });

  it('summiert Shelly-3EM-Kanäle und nimmt den jüngsten Zeitpunkt', () => {
    const s = new MqttLiveState();
    const t1 = new Date(now.getTime() - 20_000);
    s.apply('shellies/shellyherd/emeter/0/power', '1200.5', t1);
    s.apply('shellies/shellyherd/emeter/1/power', '800', now);
    s.apply('shellies/shellyherd/emeter/2/power', '0.00', t1);
    s.apply('shellies/shellyherd/emeter/1/power', '900', now); // ersetzt Kanal 1
    expect(s.points().get('appliance.herd.power')).toEqual({ value: 2100.5, time: now });
  });

  it('ignoriert unbekannte Topics und kaputte Payloads', () => {
    expect(parseMessage('shellies/lichterkette/light/0/power', '5')).toEqual([]);
    expect(parseMessage('CBYTE/1KFM0200176549/sensor', '{kaputt')).toEqual([]);
    expect(parseMessage('huawei/battery/soc', '')).toEqual([]);
    expect(parseMessage('shellyfreezer/status/switch:0', '{"id":0,"output":true}')).toEqual([]); // Teil-Update ohne apower
    // Auto nur mit konfiguriertem Präfix (zweites, veraltetes SAIC-Konto bleibt außen vor)
    expect(parseMessage(`${CAR_PREFIX}/drivetrain/soc`, '50')).toEqual([]);
    const s = new MqttLiveState();
    s.apply('foo/bar', '1', now);
    expect(s.lastMessage).toBeNull();
  });

  it('abonniert Auto-Topics nur mit Präfix', () => {
    expect(mqttTopics().some((t) => t.startsWith('saic/'))).toBe(false);
    expect(mqttTopics(CAR_PREFIX)).toContain(`${CAR_PREFIX}/drivetrain/soc`);
    expect(mqttTopics()).toContain('Shellykuehlschrank/status/switch:0');
  });

  it('MQTT hat Vorrang, Influx bleibt Startwert und Quelle für den Rest', () => {
    const old = new Date(now.getTime() - 4 * 60_000);
    const influx: RawPoints = new Map([
      ['grid.power', { value: 500, time: old }],
      ['battery.power', { value: 300, time: old }],
      ['solarThermal.power', { value: 1.2, time: old }],
      ['Wohnzimmer.temp', { value: 22.5, time: old }],
    ]);
    const mqtt: RawPoints = new Map([['grid.power', { value: 187, time: now }]]);
    const merged = mergeLive(influx, mqtt);
    expect(merged.get('grid.power')?.value).toBe(187);
    expect(merged.get('battery.power')?.value).toBe(300); // noch keine MQTT-Nachricht -> Influx
    const live = buildLive(merged, now);
    expect(live.power.solarThermal).toBe(1200);
    expect(live.rooms[0].climate.temp).toBe(22.5);
  });
});
