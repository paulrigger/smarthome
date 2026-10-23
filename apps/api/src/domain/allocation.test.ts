import { describe, expect, it } from 'vitest';
import { allocate, bucketStarts, intervalMix, type Interval } from '@smarthome/shared';

const base = new Date('2026-10-22T10:00:00Z');
const iv = (min: number, o: Partial<Interval>): Interval => ({
  t: new Date(base.getTime() + min * 60_000),
  pvRoof: 0, pvCarport: 0, gridImport: 0, gridExport: 0, batteryCharge: 0, batteryDischarge: 0,
  heatpump: 0, heatpumpHeat: 0, wallbox: 0,
  ...o,
});
const meta = { period: 'day' as const, date: '2026-10-22', from: '', to: '', step: '15m' as const, bucketStep: '1h' as const };
const starts = bucketStarts('day', '2026-10-22', '1h');

describe('intervalMix', () => {
  it('PV direkt = PV − Einspeisung − Akkuladung', () => {
    const m = intervalMix(iv(0, { pvRoof: 2, gridExport: 0.5, batteryCharge: 0.5, gridImport: 0 }))!;
    expect(m.pv).toBe(1);
  });
  it('Mischung aus PV, Akku und Netz', () => {
    const m = intervalMix(iv(0, { pvRoof: 0.5, batteryDischarge: 0.25, gridImport: 0.25 }))!;
    expect(m).toEqual({ pv: 0.5, battery: 0.25, grid: 0.25 });
  });
});

describe('allocate', () => {
  it('verteilt proportional je Intervall und summiert', () => {
    const a = allocate(
      [
        // Mittag: alles PV, WP läuft
        iv(0, { pvRoof: 2, gridExport: 1, heatpump: 0.5, heatpumpHeat: 1.5 }),
        // Abend: halb Akku, halb Netz, Auto lädt
        iv(15, { batteryDischarge: 1, gridImport: 1, wallbox: 1.6, heatpump: 0.2, heatpumpHeat: 0.6 }),
      ],
      starts,
      meta,
    );
    expect(a.totals.heatpump.total).toBe(0.7);
    expect(a.totals.heatpump.pv).toBe(0.5);
    expect(a.totals.heatpump.battery).toBe(0.1);
    expect(a.totals.heatpump.grid).toBe(0.1);
    expect(a.totals.wallbox).toEqual({ total: 1.6, pv: 0, battery: 0.8, grid: 0.8 });
    expect(a.totals.house.total).toBe(3); // 1 + 2
    expect(a.totals.rest.total).toBeCloseTo(0.7, 3);
    // Wärme folgt der Herkunft des WP-Stroms
    expect(a.totals.heatpumpHeat.pv).toBe(1.5);
    expect(a.totals.heatpumpHeat.grid).toBe(0.3);
  });

  it('erkennt Ladevorgänge mit einer Lücke von max. einem Intervall', () => {
    const ivs = [0, 15, 45, 60, 120].map((m) => iv(m, { gridImport: 1, wallbox: 0.9 }));
    const a = allocate(ivs, starts, meta);
    expect(a.sessions).toHaveLength(2);
    expect(a.sessions[0].total).toBe(3.6);
    expect(a.sessions[0].end).toBe(new Date(base.getTime() + 75 * 60_000).toISOString());
  });

  it('kürzt Teilverbraucher, wenn sie den Gesamtverbrauch übersteigen', () => {
    const a = allocate([iv(0, { gridImport: 1, heatpump: 1, wallbox: 1 })], starts, meta);
    expect(a.totals.heatpump.total + a.totals.wallbox.total).toBeCloseTo(1, 6);
  });
});
