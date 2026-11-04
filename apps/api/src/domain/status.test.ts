import { describe, expect, it } from 'vitest';
import { buildStatus, levelOf, mockSystemStatus, statusProblems, type DeviceDef } from '@smarthome/shared';

const NOW = new Date('2026-11-04T12:00:00Z');
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000);
const DEV: DeviceDef[] = [
  { id: 'smarti', name: 'Netz', keys: ['grid.power', 'gridImport'], maxAgeMin: 10 },
  { id: 'lambda', name: 'WP', keys: ['heatpump.power'], maxAgeMin: 10 },
];

describe('levelOf', () => {
  it('grün bis zum Takt, gelb bis 3× Takt, rot darüber oder nie', () => {
    expect(levelOf(ago(9), NOW, 10)).toBe('ok');
    expect(levelOf(ago(10), NOW, 10)).toBe('ok');
    expect(levelOf(ago(11), NOW, 10)).toBe('late');
    expect(levelOf(ago(30), NOW, 10)).toBe('late');
    expect(levelOf(ago(31), NOW, 10)).toBe('down');
    expect(levelOf(undefined, NOW, 10)).toBe('down');
  });
});

describe('buildStatus', () => {
  it('nimmt je Gerät den jüngsten Key und trennt MQTT und Influx', () => {
    const s = buildStatus({
      now: NOW,
      mqttConnected: true,
      mqttLast: ago(0.1).toISOString(),
      influxOk: true,
      influxSeen: new Map([['grid.power', ago(4)], ['gridImport', ago(2)]]),
      mqttSeen: new Map([['grid.power', ago(0.5)]]),
      devices: DEV,
    });
    const [netz, wp] = s.devices;
    expect(netz.influx).toEqual({ level: 'ok', seen: ago(2).toISOString(), ageS: 120 });
    expect(netz.mqtt).toEqual({ level: 'ok', seen: ago(0.5).toISOString(), ageS: 30 });
    // WP-Werte nie über MQTT gesehen → kein MQTT-Status, Influx rot
    expect(wp.mqtt).toBeNull();
    expect(wp.influx.level).toBe('down');
    expect(s.influx.ok).toBe(true);
    expect(s.mqtt.connected).toBe(true);
  });

  it('Probleme: rote/gelbe Ampel in Influx oder MQTT', () => {
    const s = buildStatus({
      now: NOW,
      mqttConnected: false,
      mqttLast: null,
      influxOk: true,
      influxSeen: new Map([['grid.power', ago(1)], ['heatpump.power', ago(20)]]),
      mqttSeen: new Map([['grid.power', ago(60)]]),
      devices: DEV,
    });
    expect(statusProblems(s).map((d) => d.id)).toEqual(['smarti', 'lambda']);
    expect(s.devices[0].mqtt?.level).toBe('down');
    expect(s.devices[1].influx.level).toBe('late');
  });

  it('Mock zeigt alle drei Stufen', () => {
    const levels = new Set(mockSystemStatus(NOW).devices.flatMap((d) => [d.influx.level, d.mqtt?.level].filter(Boolean)));
    expect(levels).toEqual(new Set(['ok', 'late', 'down']));
  });
});
