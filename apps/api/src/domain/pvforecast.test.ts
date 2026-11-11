import { describe, expect, it } from 'vitest';
import { calibrate, forecast, loadProfile, mockRadiation, type ForecastHistory } from '@smarthome/shared';

const H = 3600_000;
const NOW = Date.UTC(2026, 10, 11, 9, 30); // 10:30 MEZ
const rad = mockRadiation(NOW - 14 * 24 * H, 21 * 24);

/** Vergangenheit: PV = 12 kWh je kWh/m² (z. B. 12 kWp), Hausverbrauch 0,5 kWh je Stunde */
function hist(factor = 12, load = 0.5, batt: number | null = 4): ForecastHistory {
  const h: ForecastHistory = { t: [], pv: [], load: [], batteryDailyKwh: batt };
  rad.t.forEach((t, i) => {
    if (t + H > NOW) return;
    h.t.push(t);
    h.pv.push(((rad.ghi[i] ?? 0) / 1000) * factor);
    h.load.push(load);
  });
  return h;
}

describe('PV-Prognose', () => {
  it('kalibriert den Faktor aus der eigenen PV und der Einstrahlung', () => {
    expect(calibrate(hist(12), rad).factor).toBeCloseTo(12, 5);
    expect(loadProfile(hist(12, 0.7))[3]).toBeCloseTo(0.7);
    expect(calibrate({ t: [], pv: [], load: [], batteryDailyKwh: null }, rad).factor).toBeNull();
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
});
