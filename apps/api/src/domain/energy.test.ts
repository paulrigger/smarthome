import { describe, expect, it } from 'vitest';
import { buildLive, buildSeries, buildSummary, expandKeys, type RawPoints, type Range } from './energy';
import { lastFlux, rowsToPoints, windowFlux } from '../sources/influx';
import { bounds, bucketStarts, previousBucketStart, shift } from '@smarthome/shared';
import { COUNTER_SERIES, LIVE_SERIES } from './registry';

const now = new Date('2026-10-22T10:00:00Z');
const R: Range = { period: 'day', date: '2026-10-22', from: now, to: now, end: now, isCurrent: true };
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
        'solarThermal.power': 1.5, // kW
        'car.plugged': 'true',
      }),
      now,
    );
    expect(live.power.pv).toBe(5000);
    expect(live.power.house).toBe(2500);
    expect(live.power.rest).toBe(1700);
    expect(live.heatpump.heatOutput).toBe(2700);
    expect(live.power.solarThermal).toBe(1500);
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
    const s = buildSummary(R, first, last);
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
    const s = buildSummary(R, pts({ gridImport: 100 }), pts({ gridImport: 3 }));
    expect(s.energy.gridImport).toBe(0);
  });
});

describe('Zeiträume (Europe/Vienna)', () => {
  it('Tag: lokale Mitternacht, Sommerzeit UTC+2', () => {
    const b = bounds('day', '2026-10-22');
    expect(b.from.toISOString()).toBe('2026-10-21T22:00:00.000Z');
    expect(b.end.toISOString()).toBe('2026-10-22T22:00:00.000Z');
  });
  it('Monat und Jahr', () => {
    expect(bounds('month', '2026-10-22').from.toISOString()).toBe('2026-09-30T22:00:00.000Z');
    expect(bounds('month', '2026-12-15').from.toISOString()).toBe('2026-11-30T23:00:00.000Z');
    expect(bounds('year', '2026-10-22').from.toISOString()).toBe('2025-12-31T23:00:00.000Z');
  });
  it('Vor/Zurück', () => {
    expect(shift('day', '2026-03-01', -1)).toBe('2026-02-28');
    expect(shift('month', '2026-01-15', -1)).toBe('2025-12-01');
    expect(shift('year', '2026-10-22', 1)).toBe('2027-01-01');
  });
  it('DST-Tage haben 23 bzw. 25 Stunden-Buckets', () => {
    expect(bucketStarts('day', '2026-03-29', '1h')).toHaveLength(23);
    expect(bucketStarts('day', '2026-10-25', '1h')).toHaveLength(25);
    expect(bucketStarts('month', '2026-02-10', '1d')).toHaveLength(28);
    expect(bucketStarts('year', '2026-06-01', '1mo')).toHaveLength(12);
    expect(previousBucketStart('year', '2026-06-01', '1mo').toISOString()).toBe('2025-11-30T23:00:00.000Z');
  });
});

describe('buildSeries', () => {
  it('ordnet Fenster Buckets zu und leitet Hausverbrauch ab', () => {
    const starts = bucketStarts('day', '2026-10-22', '1h');
    const t0 = starts[10];
    const p = (key: string, value: number) => ({ key, time: t0, value });
    const s = buildSeries('energy', ['house', 'pvRoof'], 'day', '2026-10-22', '1h', starts, [
      p('pvRoof', 2000), // Wh, factor 0.001
      p('pvCarport', 1), p('gridImport', 0.5), p('gridExport', 0.2), p('batteryCharge', 0.3), p('batteryDischarge', 0),
    ], new Date('2026-10-23T00:00:00Z'));
    expect(s.values.pvRoof[10]).toBe(2);
    expect(s.values.house[10]).toBe(3); // 2 + 1 + 0.5 − 0.2 − 0.3
    expect(s.values.pvRoof[9]).toBeNull();
    expect(expandKeys('energy', ['rest'])).toContain('wallbox');
  });
  it('Gauges: Lücken mit letztem Wert füllen, Zukunft leer', () => {
    const starts = bucketStarts('day', '2026-10-22', '1h');
    const s = buildSeries('gauge', ['battery.soc'], 'day', '2026-10-22', '1h', starts, [
      { key: 'battery.soc', time: starts[2], value: 40 },
      { key: 'battery.soc', time: starts[5], value: 60 },
    ], new Date(starts[8].getTime() + 1000));
    expect(s.values['battery.soc'].slice(0, 10)).toEqual([null, null, 40, 40, 40, 60, 60, 60, 60, null]);
  });
  it('Zukunft bleibt leer', () => {
    const starts = bucketStarts('day', '2026-10-22', '1h');
    const s = buildSeries('gauge', ['grid.power'], 'day', '2026-10-22', '1h', starts, [], new Date('2026-10-22T10:00:00Z'));
    expect(s.values['grid.power'][23]).toBeNull();
  });
  it('Flux mit lokaler Zeitzone und Differenz für Energie', () => {
    const f = windowFlux('smarthome', COUNTER_SERIES.slice(0, 2), 'a', 'b', '1d', 'energy', 'Europe/Vienna');
    expect(f).toContain('timezone.location(name: "Europe/Vienna")');
    expect(f).toContain('difference(nonNegative: true)');
    expect(windowFlux('smarthome', LIVE_SERIES.slice(0, 1), 'a', 'b', '5m', 'gauge', 'Europe/Vienna')).toContain('fn: mean');
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
