import { describe, expect, it } from 'vitest';
import { calibrate, forecast, heatModel, loadProfile, mockRadiation, type ForecastHistory, type ForecastRadiation } from '@smarthome/shared';

const H = 3600_000;
const NOW = Date.UTC(2026, 10, 11, 9, 30); // 10:30 MEZ
const rad = mockRadiation(NOW - 14 * 24 * H, 21 * 24);

/** Vergangenheit: PV = 12 kWh je kWh/m² (z. B. 12 kWp), Hausverbrauch 0,5 kWh je Stunde */
function hist(factor = 12, load = 0.5, batt: number | null = 4, heat = 0): ForecastHistory {
  const h: ForecastHistory = { t: [], pv: [], load: [], heatpump: [], batteryDailyKwh: batt };
  rad.t.forEach((t, i) => {
    if (t + H > NOW) return;
    h.t.push(t);
    h.pv.push(((rad.ghi[i] ?? 0) / 1000) * factor);
    h.load.push(load + heat / 24);
    h.heatpump.push(heat / 24);
  });
  return h;
}

/** Temperatur je Tag konstant: Historie und Prognose mit demselben Tagesmittel */
const radWithTemp = (tc: number): ForecastRadiation => ({ ...rad, temp: rad.t.map(() => tc) });

describe('PV-Prognose', () => {
  it('kalibriert den Faktor aus der eigenen PV und der Einstrahlung', () => {
    expect(calibrate(hist(12), rad).factor).toBeCloseTo(12, 5);
    expect(loadProfile(hist(12, 0.7))[3]).toBeCloseTo(0.7);
    expect(calibrate({ t: [], pv: [], load: [], heatpump: [], batteryDailyKwh: null }, rad).factor).toBeNull();
  });

  it('Überschuss je Tag = PV − Verbrauch − Akku-Nachladen, heute nur der Rest', () => {
    const f = forecast(hist(), rad, { soc: 50, capacityKwh: 57, targetSoc: 80, horizonDays: 3 }, NOW);
    expect(f.days).toHaveLength(4);
    expect(f.days[0].partial).toBe(true);
    for (const d of f.days) expect(d.surplusKwh).toBeLessThanOrEqual(d.pvKwh);
    expect(f.car.needKwh).toBeCloseTo(17.1, 1);
  });

  it('Empfehlung: PV reicht / nachts laden / voll / unbekannt', () => {
    const big = forecast(hist(40, 0.3, 0), rad, { soc: 60, capacityKwh: 57, targetSoc: 80, horizonDays: 3 }, NOW);
    expect(big.advice.kind).toBe('pv');
    const small = forecast(hist(3, 0.6), rad, { soc: 20, capacityKwh: 57, targetSoc: 80, horizonDays: 3 }, NOW);
    expect(small.advice.kind).toBe('night');
    expect(small.advice.detail).toMatch(/aus dem Netz/);
    expect(forecast(hist(), rad, { soc: 85, capacityKwh: 57, targetSoc: 80, horizonDays: 3 }, NOW).advice.kind).toBe('full');
    expect(forecast(hist(), rad, { soc: null, capacityKwh: 57, targetSoc: 80, horizonDays: 3 }, NOW).advice.kind).toBe('unknown');
  });

  it('WP-Energie je Tag = a + b · Heizgradtage (Fit auf die Historie)', () => {
    // 10 Tage mit unterschiedlichem Tagesmittel: WP = 2 + 0,5 · HGT (kWh/Tag)
    const days = 10;
    const h: ForecastHistory = { t: [], pv: [], load: [], heatpump: [], batteryDailyKwh: null };
    const temp: (number | null)[] = [];
    for (let d = 0; d < days; d++) {
      const tc = 15 - (d % 5) * 3; // HGT 0 … 12
      for (let k = 0; k < 24; k++) {
        const t = Date.UTC(2026, 10, 1 + d, k - 1); // Stundenbeginn, lokal ≈ UTC+1
        h.t.push(t);
        h.pv.push(0);
        h.heatpump.push((2 + 0.5 * Math.max(0, 15 - tc)) / 24);
        h.load.push(1);
        temp.push(tc);
      }
    }
    const r: ForecastRadiation = { t: h.t, ghi: h.t.map(() => 0), temp };
    const m = heatModel(h, r);
    expect(m.days).toBe(days);
    expect(m.perHdd).toBeCloseTo(0.5, 2);
    expect(m.base).toBeCloseTo(2, 1);
  });

  it('kalter Tag: mehr Verbrauch durch die WP, weniger Überschuss', () => {
    const car = { soc: 50, capacityKwh: 57, targetSoc: 80, horizonDays: 3 };
    const warm = forecast(hist(12, 0.5, 0, 0), radWithTemp(18), car, NOW);
    const cold = forecast(hist(12, 0.5, 0, 10), radWithTemp(-5), car, NOW);
    const wd = warm.days[1], cd = cold.days[1];
    expect(cd.heatpumpKwh).toBeGreaterThan(wd.heatpumpKwh);
    expect(cd.loadKwh).toBeGreaterThan(wd.loadKwh);
    expect(cd.surplusKwh).toBeLessThan(wd.surplusKwh);
    expect(cd.tempC).toBe(-5);
  });
});
