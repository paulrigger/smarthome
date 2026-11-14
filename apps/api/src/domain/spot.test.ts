import { describe, expect, it } from 'vitest';
import { eurMwhToCt, spotHourly, spotLookup, spotPerBucket, type SpotPrices } from '@smarthome/shared';
import { mockSpot } from '../sources/spot';

describe('EPEX-Spotpreise', () => {
  it('rechnet €/MWh in ct/kWh um', () => {
    expect(eurMwhToCt(208.68)).toBe(20.87);
    expect(eurMwhToCt(-5)).toBe(-0.5);
  });

  it('mittelt die Viertelstunden je Stunde und lässt Intervalle ohne Preis leer', () => {
    const spot: SpotPrices = {
      t: ['2026-11-13T10:00:00Z', '2026-11-13T10:15:00Z', '2026-11-13T10:30:00Z', '2026-11-13T10:45:00Z', '2026-11-13T12:00:00Z'],
      ct: [10, 20, 30, 40, 7],
    };
    const buckets = ['2026-11-13T10:00:00Z', '2026-11-13T11:00:00Z', '2026-11-13T12:00:00Z'];
    expect(spotPerBucket(spot, buckets, '1h')).toEqual([25, null, 7]);
    expect(spotPerBucket(spot, buckets, '15m')[0]).toBe(10);
  });

  it('Mock-Preise decken den Zeitraum mit Viertelstunden ab', () => {
    const m = mockSpot('2026-11-13', '2026-11-13');
    expect(m.t).toHaveLength(96);
    expect(m.ct.every((v) => Number.isFinite(v))).toBe(true);
  });

  it('stündliche Preise (vor Okt. 2025) gelten für alle Viertelstunden der Stunde; Lücken bleiben leer', () => {
    const h: SpotPrices = { t: ['2024-01-01T10:00:00Z', '2024-01-01T11:00:00Z'], ct: [12, 8] };
    const at = spotLookup(h);
    expect(at(Date.parse('2024-01-01T10:15:00Z'))).toBe(12);
    expect(at(Date.parse('2024-01-01T11:45:00Z'))).toBe(8);
    expect(at(Date.parse('2024-01-01T09:30:00Z'))).toBeNull();
    expect(spotHourly({ t: ['2026-01-01T10:00:00Z', '2026-01-01T10:15:00Z', '2026-01-01T10:30:00Z'], ct: [10, 20, 30] })).toEqual({ t: ['2026-01-01T10:00:00.000Z'], ct: [20] });
  });
});
