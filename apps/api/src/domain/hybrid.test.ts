import { describe, expect, it } from 'vitest';
import { HYBRID_ETA, correctHybrid } from './hybrid';

// Echte Stundenwerte 21./22.10.2026 (kWh): Carport-Zähler (AC), Akku laden/entladen (DC)
describe('correctHybrid (Huawei-Hybrid-WR, Akku DC, nur PV-Ladung)', () => {
  it('nachts: Zähler zählt Akku-Entladung mit → PV Carport ≈ 0', () => {
    const c = correctHybrid({ pvCarport: 0.21, batteryCharge: 0, batteryDischarge: 0.24 });
    expect(c.pvCarport).toBeLessThan(0.02);
    expect(c.batteryDischarge).toBeCloseTo(0.24 * HYBRID_ETA);
  });
  it('vormittags: PV lädt per DC den Akku, Zähler zeigt 0 → PV Carport = Ladung', () => {
    expect(correctHybrid({ pvCarport: 0, batteryCharge: 1.57, batteryDischarge: 0 }).pvCarport).toBeCloseTo(1.57);
    expect(correctHybrid({ pvCarport: 2.4, batteryCharge: 1.61, batteryDischarge: 0 }).pvCarport).toBeCloseTo(4.01);
  });
  it('AC-Bilanz bleibt exakt: PV Carport − Ladung + Entladung(AC) = Zähler', () => {
    const i = { pvCarport: 1.84, batteryCharge: 0, batteryDischarge: 1.93 };
    const c = correctHybrid(i);
    // 22.10. 18 Uhr: Zähler 1,84 > 0,88 · 1,93 = 1,70 → 0,14 kWh PV (Abendsonne)
    expect(c.pvCarport - c.batteryCharge + c.batteryDischarge).toBeCloseTo(i.pvCarport);
  });
  it('nie negativ', () => {
    expect(correctHybrid({ pvCarport: 0, batteryCharge: 0, batteryDischarge: 1 }).pvCarport).toBe(0);
  });
  it('AC zu klein (Zähler hängt nach): Entladung(AC) = Zähler, Bilanz bleibt exakt, Summe über Intervalle = Gesamt', () => {
    const lag = { pvCarport: 0.1, batteryCharge: 0, batteryDischarge: 0.5 }; // 0,88 · 0,5 = 0,44 > 0,1
    const c = correctHybrid(lag);
    expect(c.pvCarport).toBe(0);
    expect(c.batteryDischarge).toBeCloseTo(0.1);
    const ivs = [lag, { pvCarport: 0.8, batteryCharge: 0, batteryDischarge: 0.5 }];
    const house = (x: { pvCarport: number; batteryCharge: number; batteryDischarge: number }) => x.pvCarport - x.batteryCharge + x.batteryDischarge;
    const sumIv = ivs.map(correctHybrid).reduce((a, x) => a + house(x), 0);
    expect(sumIv).toBeCloseTo(0.9); // = Summe der Zählerwerte
  });
});
