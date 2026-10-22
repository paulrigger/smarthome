import { describe, expect, it } from 'vitest';
import { buildLive, buildSummary, periodStart, type RawPoints } from './energy';
import { lastFlux, rowsToPoints } from '../sources/influx';
import { COUNTER_SERIES, LIVE_SERIES } from './registry';

const now = new Date('2026-10-22T10:00:00Z');
const pts = (o: Record<string, number | boolean | string>, t = now): RawPoints =>
  new Map(Object.entries(o).map(([k, v]) => [k, { value: v, time: t }]));

describe('buildLive', () => {
  it('berechnet Hausverbrauch aus PV + Netz + Batterie und wendet Faktoren an', () => {
    const live = buildLive(
      pts({
        'pvRoof.power': -4000, // Fronius liefert negativ, factor -1
        'pvCarport.power': 1000,
        'grid.power': -1500, // Einspeisung
        'battery.power': -1000, // Ladung
        'heatpump.power': 800,
        'wallbox.power': 0,
        'heatpump.heat': 2.7, // kW
        'car.plugged': 'true',
      }),
      now,
    );
    expect(live.power.pv).toBe(5000);
    expect(live.power.house).toBe(2500);
    expect(live.power.rest).toBe(1700);
    expect(live.heatpump.heatOutput).toBe(2700);
    expect(live.car.plugged).toBe(true);
  });

  it('markiert veraltete Leistungswerte', () => {
    const old = new Date(now.getTime() - 60 * 60 * 1000);
    const live = buildLive(pts({ 'grid.power': 500, 'pvRoof.power': 0 }, old), now);
    expect(live.power.grid).toBeNull();
    expect(live.stale).toContain('grid.power');
    expect(live.power.house).toBeNull();
  });
});

describe('buildSummary', () => {
  it('bildet Energiebilanz und KPIs aus Zählerdeltas', () => {
    const first = pts({
      gridImport: 1000, gridExport: 500, pvRoof: 10_000_000, pvCarport: 200,
      batteryCharge: 50, batteryDischarge: 40, heatpump: 1_000_000, heatpumpHeat: 3_000_000, wallbox: 0,
    });
    const last = pts({
      gridImport: 1005, gridExport: 508, pvRoof: 10_012_000, pvCarport: 204,
      batteryCharge: 53, batteryDischarge: 42, heatpump: 1_006_000, heatpumpHeat: 3_019_800, wallbox: 4000,
    });
    const s = buildSummary('today', now, now, first, last);
    expect(s.energy.pv).toBe(16);
    // Haus = 16 + 5 − 8 + 2 − 3 = 12
    expect(s.energy.house).toBe(12);
    expect(s.energy.heatpump).toBe(6);
    expect(s.energy.wallbox).toBe(4);
    expect(s.energy.rest).toBe(2);
    expect(s.kpi.selfSufficiency).toBeCloseTo(7 / 12, 3);
    expect(s.kpi.selfConsumption).toBe(0.5);
    expect(s.kpi.cop).toBe(3.3);
    expect(s.missing).toContain('solarThermal');
  });

  it('behandelt Zählerreset als 0 statt negativ', () => {
    const s = buildSummary('today', now, now, pts({ gridImport: 100 }), pts({ gridImport: 3 }));
    expect(s.energy.gridImport).toBe(0);
  });
});

describe('periodStart', () => {
  it('Tagesbeginn Wien (Sommerzeit, UTC+2)', () => {
    expect(periodStart('today', new Date('2026-10-22T10:00:00Z'), 'Europe/Vienna').toISOString()).toBe('2026-10-21T22:00:00.000Z');
  });
  it('kurz nach Mitternacht lokal gehört zum neuen Tag', () => {
    expect(periodStart('today', new Date('2026-10-21T22:30:00Z'), 'Europe/Vienna').toISOString()).toBe('2026-10-21T22:00:00.000Z');
  });
  it('Monatsbeginn Wien', () => {
    expect(periodStart('month', new Date('2026-10-22T10:00:00Z'), 'Europe/Vienna').toISOString()).toBe('2026-09-30T22:00:00.000Z');
  });
  it('Winterzeit (UTC+1)', () => {
    expect(periodStart('month', new Date('2026-12-15T10:00:00Z'), 'Europe/Vienna').toISOString()).toBe('2026-11-30T23:00:00.000Z');
  });
});

describe('influx mapping', () => {
  it('erzeugt Flux mit allen Serien und ordnet Zeilen Keys zu', () => {
    const flux = lastFlux('smarthome', COUNTER_SERIES, '-1d', 'first');
    expect(flux).toContain('r.device == "smarti"');
    expect(flux).toContain('|> first()');
    const p = rowsToPoints(
      [{ _time: now.toISOString(), _value: 42, _measurement: 'powersensor', device: 'smarti', _field: 'power' }],
      LIVE_SERIES,
    );
    expect(p.get('grid.power')?.value).toBe(42);
  });
});
