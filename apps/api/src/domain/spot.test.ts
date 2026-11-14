import { describe, expect, it } from 'vitest';
import { eurMwhToCt, spotPerBucket, type SpotPrices } from '@smarthome/shared';
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
});
