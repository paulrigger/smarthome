import { describe, expect, it } from 'vitest';
import { counterDeltas, type CounterReading } from './counter';
import { energyDeltas } from '../sources/influx';
import { COUNTER_SERIES } from './registry';

const t0 = Date.parse('2025-10-01T00:00:00Z');
const series = (values: number[], stepMin = 15): CounterReading[] => values.map((value, i) => ({ time: new Date(t0 + i * stepMin * 60_000), value }));
const opts = { factor: 1, maxKw: 60, stepH: 0.25 };
const sum = (r: CounterReading[]) => r.reduce((a, b) => a + b.value, 0);

describe('counterDeltas', () => {
  it('normale Zählerstände = einfache Differenz', () => {
    const d = counterDeltas(series([100, 101, 103, 103.5]), opts);
    expect(d.map((x) => x.value)).toEqual([1, 2, 0.5]);
    expect(d[0].time.getTime()).toBe(t0 + 15 * 60_000);
  });

  it('Einbruch (0 oder Teilwert) wird ignoriert, der Rücksprung zählt nicht doppelt', () => {
    // Smart Meter: 9000 → 12 (Lesefehler) → 9002
    const d = counterDeltas(series([9000, 9001, 12, 9002, 9003]), opts);
    expect(sum(d)).toBeCloseTo(3);
  });

  it('unmöglicher Sprung nach oben wird ignoriert', () => {
    const d = counterDeltas(series([500, 501, 65_536 + 501, 502]), opts);
    expect(sum(d)).toBeCloseTo(2);
  });

  it('nach Datenlücke darf mehr Energie kommen (Zeit seit letztem Stand)', () => {
    const r = [{ time: new Date(t0), value: 100 }, { time: new Date(t0 + 6 * 3_600_000), value: 130 }];
    expect(counterDeltas(r, opts).map((x) => x.value)).toEqual([30]); // 5 kW über 6 h – ok
  });

  it('hängender Ausleser: Nachholsprung nach Tagen mit gleichem Stand zählt', () => {
    // 5 Tage gleicher Stand (alle 15 min geschrieben), dann +181 kWh
    const stuck = Array.from({ length: 5 * 96 }, () => 1000);
    const d = counterDeltas(series([999, ...stuck, 1181, 1182]), opts);
    expect(sum(d)).toBeCloseTo(1 + 181 + 1);
  });

  it('Zählertausch/Reset: stabiler neuer Stand wird nach 3 Fenstern Basis, ohne Sprung-Energie', () => {
    const d = counterDeltas(series([5000, 5001, 3, 4, 5, 6]), opts);
    expect(sum(d)).toBeCloseTo(1 + 1 + 1 + 1); // 5000→5001, dann 3→4→5→6
  });

  it('Faktor: Grenze gilt in kWh (Wh-Zähler)', () => {
    const wh = { ...opts, factor: 0.001 };
    expect(sum(counterDeltas(series([1_000_000, 1_010_000]), wh))).toBe(10_000); // 10 kWh in 15 min = 40 kW ok
    expect(sum(counterDeltas(series([1_000_000, 1_020_000]), wh))).toBe(0); // 20 kWh = 80 kW → verworfen
  });

  it('energyDeltas trennt Serien und ersetzt Flux difference()', () => {
    const defs = COUNTER_SERIES.filter((d) => d.key === 'gridImport' || d.key === 'gridExport');
    const pts = [
      ...series([10, 11, 0.5, 12]).map((r) => ({ key: 'gridImport', ...r })),
      ...series([50, 52, 54, 56]).map((r) => ({ key: 'gridExport', ...r })),
    ];
    const out = energyDeltas(pts, defs, '15m');
    expect(sum(out.filter((p) => p.key === 'gridImport'))).toBeCloseTo(2);
    expect(sum(out.filter((p) => p.key === 'gridExport'))).toBeCloseTo(6);
  });
});
