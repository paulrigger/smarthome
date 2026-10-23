import { describe, expect, it } from 'vitest';
import { bandPath, flowDuration, hubLines, mockSummary, sankeyFlows, sankeyLayout, type SankeyFlow } from '@smarthome/shared';

const sum = (f: SankeyFlow[], pick: (x: SankeyFlow) => boolean) => f.filter(pick).reduce((a, b) => a + b.kwh, 0);
const OPTS = { height: 240, gap: 12, minSlot: { pv: 96 }, defaultSlot: 48 };

describe('sankeyFlows', () => {
  // Echte Werte 2026-10-23 (Dev-Server, bis 17:50)
  const day = { pv: 10.039, gridImport: 30.654, gridExport: 1.164, batteryCharge: 4.73, batteryDischarge: 2.92 };

  it('teilt PV in Einspeisung, Akku und Haus', () => {
    const f = sankeyFlows(day);
    const get = (from: string, to: string) => f.find((x) => x.from === from && x.to === to)!.kwh;
    expect(get('pv', 'export')).toBeCloseTo(1.164);
    expect(get('pv', 'batteryCharge')).toBeCloseTo(4.73);
    expect(get('pv', 'house')).toBeCloseTo(10.039 - 1.164 - 4.73);
    expect(get('grid', 'house')).toBeCloseTo(30.654);
    expect(get('battery', 'house')).toBeCloseTo(2.92);
    expect(get('grid', 'batteryCharge')).toBe(0);
  });

  it('Bilanz links = rechts, Haus = Summe der Zuflüsse', () => {
    const f = sankeyFlows(day);
    const left = sum(f, () => true);
    expect(left).toBeCloseTo(day.pv + day.gridImport + day.batteryDischarge, 9);
    expect(sum(f, (x) => x.to === 'house')).toBeCloseTo(37.719, 2); // summary.energy.house
  });

  it('Ladung größer als PV-Überschuss → Rest aus dem Netz, nie negativ', () => {
    const f = sankeyFlows({ pv: 1, gridImport: 5, gridExport: 0.2, batteryCharge: 2, batteryDischarge: 0 });
    expect(f.every((x) => x.kwh >= 0)).toBe(true);
    expect(f.find((x) => x.from === 'pv' && x.to === 'house')!.kwh).toBe(0);
    expect(f.find((x) => x.from === 'grid' && x.to === 'batteryCharge')!.kwh).toBeCloseTo(1.2);
    expect(sum(f, () => true)).toBeCloseTo(6);
    expect(sum(f, (x) => x.to === 'batteryCharge')).toBeCloseTo(2);
  });

  it('Nacht/fehlende Werte: keine NaN, alles ≥ 0', () => {
    const f = sankeyFlows({ pv: 0, gridImport: 3, gridExport: NaN, batteryCharge: -0.01, batteryDischarge: 1 });
    expect(f.every((x) => Number.isFinite(x.kwh) && x.kwh >= 0)).toBe(true);
    expect(sum(f, (x) => x.to === 'house')).toBeCloseTo(4);
  });

  it('Mock-Monat (ohne Live) bilanziert', () => {
    const s = mockSummary('month', '2026-07-15');
    const f = sankeyFlows(s.energy);
    expect(sum(f, () => true)).toBeCloseTo(s.energy.pv + s.energy.gridImport + s.energy.batteryDischarge, 6);
    expect(sum(f, (x) => x.to === 'house')).toBeCloseTo(s.energy.house, 0);
  });
});

describe('sankeyLayout', () => {
  it('Balken ∝ kWh, linke und rechte Summe gleich hoch, passt in die Höhe', () => {
    const l = sankeyLayout(sankeyFlows({ pv: 30, gridImport: 5, gridExport: 12, batteryCharge: 6, batteryDischarge: 3 }), OPTS);
    const hL = l.sources.reduce((a, n) => a + n.h, 0);
    const hR = l.targets.reduce((a, n) => a + n.h, 0);
    expect(hL).toBeCloseTo(hR, 6);
    expect(hL).toBeCloseTo(38 * l.scale, 6);
    for (const side of [l.sources, l.targets]) {
      const last = side[side.length - 1];
      expect(last.slotY + last.slotH).toBeLessThanOrEqual(240 + 1e-6);
    }
    expect(l.sources.find((n) => n.id === 'pv')!.slotH).toBeGreaterThanOrEqual(96);
  });

  it('Bänder schließen lückenlos an die Knoten an', () => {
    const l = sankeyLayout(sankeyFlows({ pv: 30, gridImport: 5, gridExport: 12, batteryCharge: 6, batteryDischarge: 3 }), OPTS);
    for (const n of l.sources) {
      const out = l.bands.filter((b) => b.from === n.id);
      expect(out.reduce((a, b) => a + b.h, 0)).toBeCloseTo(n.h, 6);
      if (out.length) expect(out[0].y0).toBeCloseTo(n.y, 6);
    }
    for (const n of l.targets) {
      const inn = l.bands.filter((b) => b.to === n.id);
      expect(inn.reduce((a, b) => a + b.h, 0)).toBeCloseTo(n.h, 6);
    }
  });

  it('alles 0: Skala 0, Mindest-Slots bleiben, keine Bänder', () => {
    const l = sankeyLayout(sankeyFlows({ pv: 0, gridImport: 0, gridExport: 0, batteryCharge: 0, batteryDischarge: 0 }), OPTS);
    expect(l.scale).toBe(0);
    expect(l.bands).toHaveLength(0);
    expect(l.sources.map((n) => n.slotH)).toEqual([96, 48, 48]);
  });

  it('bandPath ist ein geschlossener Pfad ohne NaN', () => {
    const p = bandPath({ y0: 0, y1: 10, h: 5 }, 0, 100);
    expect(p).toMatch(/^M0 0 C50 0 50 10 100 10 L100 15 .* Z$/);
    expect(p).not.toContain('NaN');
  });
});

describe('hubLines', () => {
  const o = { min: 2, max: 10, ref: 5000, threshold: 20 };

  it('Dicke ∝ Leistung, größter Wert = max', () => {
    const l = hubLines({ pv: 8000, grid: -2000, car: 0 }, o);
    expect(l.pv.width).toBe(10);
    expect(l.grid.width).toBeCloseTo(2 + 8 * 0.25);
    expect(l.grid.value).toBe(-2000); // Vorzeichen bleibt (Richtung)
    expect(l.car).toEqual({ value: 0, width: 2, active: false, stale: false });
  });

  it('kleine Werte werden nicht aufgeblasen (ref)', () => {
    expect(hubLines({ pv: 50 }, o).pv.width).toBeCloseTo(2 + 8 * 0.01);
  });

  it('null/undefined = stale, nicht 0', () => {
    const l = hubLines({ pv: null, grid: undefined, battery: NaN }, o);
    for (const k of ['pv', 'grid', 'battery'] as const) expect(l[k]).toEqual({ value: null, width: 2, active: false, stale: true });
  });

  it('Monat in kWh: ohne ref relativ zum größten Wert', () => {
    const l = hubLines({ pv: 400, grid: 100 }, { ...o, ref: 0, threshold: 0.05 });
    expect(l.pv.width).toBe(10);
    expect(l.grid.width).toBe(4);
  });

  it('flowDuration: mehr Leistung = schneller', () => {
    expect(flowDuration(5000)).toBeLessThan(flowDuration(200));
    expect(flowDuration(-5000)).toBe(flowDuration(5000));
  });
});
