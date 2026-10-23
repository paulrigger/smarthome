import { describe, expect, it } from 'vitest';
import { bucketStarts, computeYield, intervalYield, valueOf, type Interval } from '@smarthome/shared';

const t = new Date('2026-07-01T10:00:00Z');
const iv = (o: Partial<Interval>): Interval => ({
  t, pvRoof: 0, pvCarport: 0, gridImport: 0, gridExport: 0, batteryCharge: 0, batteryDischarge: 0, heatpump: 0, heatpumpHeat: 0, wallbox: 0, ...o,
});

describe('Rangfolge PV Dach → PV Carport → Akku', () => {
  it('Dach deckt den Verbrauch zuerst, Carport nur den Rest', () => {
    // Haus 3 kWh: Dach 2 + Carport 2, Akku lädt 0,5, Einspeisung 0,5
    const y = intervalYield(iv({ pvRoof: 2, pvCarport: 2, batteryCharge: 0.5, gridExport: 0.5 }));
    expect(y.house).toBe(3);
    expect(y.roof).toEqual({ produced: 2, self: 2, toBattery: 0, exported: 0 });
    expect(y.carport).toEqual({ produced: 2, self: 1, toBattery: 0.5, exported: 0.5 });
  });

  it('Akku lädt zuerst aus Dach-Überschuss, Rest aus dem Netz', () => {
    const y = intervalYield(iv({ pvRoof: 1.5, gridImport: 0.6, batteryCharge: 1 }));
    // Haus = 1,5 + 0,6 − 1 = 1,1 → Dach-Überschuss 0,4 in den Akku, 0,6 aus dem Netz
    expect(y.battery.fromRoof).toBeCloseTo(0.4, 6);
    expect(y.battery.fromGrid).toBeCloseTo(0.6, 6);
    expect(y.carport.self).toBe(0);
  });

  it('bewertet Carport und Akku', () => {
    const r = computeYield(
      [iv({ pvRoof: 1, pvCarport: 3, gridExport: 1, batteryCharge: 1 }), iv({ t: new Date(t.getTime() + 9e5), batteryDischarge: 2, gridImport: 0.5 })],
      bucketStarts('day', '2026-07-01', '1h'),
      { period: 'day', date: '2026-07-01', from: '', to: '', step: '15m', bucketStep: '1h' },
    );
    expect(r.totals.carport).toEqual({ produced: 3, self: 1, toBattery: 1, exported: 1 });
    const v = valueOf(r.totals, { buy: 0.3, feed: 0.07 });
    expect(v.carport.total).toBeCloseTo(1 * 0.3 + 2 * 0.07, 6);
    expect(v.battery.total).toBeCloseTo(2 * 0.3 - 1 * 0.07, 6);
  });
});
