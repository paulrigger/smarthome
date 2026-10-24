import { describe, expect, it } from 'vitest';
import { SEED_TARIFFS, computeCosts, exportValue, importPriceAt, localInfo, tariffOn, validateTariffs, type Interval, type Tariff } from '@smarthome/shared';
import { openDb } from '../sources/db';
import { openTariffStore } from '../sources/tariffStore';

const iv = (iso: string, o: Partial<Interval>): Interval => ({
  t: new Date(iso), pvRoof: 0, pvCarport: 0, gridImport: 0, gridExport: 0, batteryCharge: 0, batteryDischarge: 0, heatpump: 0, heatpumpHeat: 0, wallbox: 0, ...o,
});
const meta = { period: 'day' as const, date: '2025-06-14', from: '', to: '', step: '15m' as const, bucketStep: '1h' as const };
const price = (t: Tariff, iso: string) => {
  const l = localInfo(new Date(iso));
  return importPriceAt(t, l.month, l.day, l.hour);
};

describe('Tarifwahl und Zeitfenster', () => {
  const t2025 = tariffOn(SEED_TARIFFS, '2025-06-14')!;
  const t2026 = tariffOn(SEED_TARIFFS, '2026-10-23')!;

  it('gültiger Tarif nach validFrom (lokales Datum)', () => {
    expect(tariffOn(SEED_TARIFFS, '2023-12-31')).toBeNull();
    expect(tariffOn(SEED_TARIFFS, '2024-12-31')!.validFrom).toBe('2024-01-01');
    expect(t2025.validFrom).toBe('2025-01-01');
    expect(tariffOn(SEED_TARIFFS, '2026-09-30')!.validFrom).toBe('2025-01-01');
    expect(t2026.validFrom).toBe('2026-10-01');
  });

  it('Nachttarif wie Node-RED: 22–6 täglich, Samstag ab 13 Uhr', () => {
    expect(price(t2025, '2025-06-11T10:00:00Z')).toEqual({ price: 31, window: null }); // Mi 12:00
    expect(price(t2025, '2025-06-11T20:30:00Z')).toEqual({ price: 26, window: 'Nacht' }); // Mi 22:30
    expect(price(t2025, '2025-06-12T03:45:00Z').price).toBe(26); // Do 05:45
    expect(price(t2025, '2025-06-12T04:00:00Z').price).toBe(31); // Do 06:00
    expect(price(t2025, '2025-06-14T11:00:00Z')).toEqual({ price: 26, window: 'Wochenende' }); // Sa 13:00
    expect(price(t2025, '2025-06-14T10:45:00Z').price).toBe(31); // Sa 12:45
    expect(price(t2025, '2025-06-15T10:00:00Z').price).toBe(31); // So 12:00 = Tag (wie Node-RED)
  });

  it('WiNAP nur Okt–Mär nachts, SNAP nur Apr–Sep 10–16 Uhr; Preise noch offen = null', () => {
    expect(price(t2026, '2026-10-23T21:00:00Z')).toEqual({ price: null, window: 'WiNAP' }); // 23:00 MESZ
    expect(price(t2026, '2026-10-23T10:00:00Z')).toEqual({ price: null, window: null });
    expect(price(t2026, '2027-06-01T09:00:00Z').window).toBe('SNAP'); // 11:00
    expect(price(t2026, '2027-06-01T20:30:00Z').window).toBeNull(); // 22:30 im Juni: kein WiNAP
  });

  it('Fenster über Mitternacht mit Wochentag gehört zum Starttag', () => {
    const t: Tariff = { ...t2026, importPrice: 30, windows: [{ name: 'Fr-Nacht', months: [], days: [5], from: 22, to: 6, price: 20 }] };
    expect(price(t, '2026-10-24T02:00:00Z').price).toBe(20); // Sa 04:00 → Fr-Nacht
    expect(price(t, '2026-10-25T02:00:00Z').price).toBe(30); // So 03:00 (Winterzeit) → kein Fr
  });
});

describe('Einspeise-Staffel', () => {
  const tiers = [{ upToKwh: 1000, price: 10 }, { upToKwh: 3000, price: 8 }, { upToKwh: null, price: 6 }];
  it('teilt eine Menge über Stufengrenzen', () => {
    expect(exportValue(tiers, 0, 100)).toBeCloseTo(10);
    expect(exportValue(tiers, 950, 100)).toBeCloseTo(50 * 0.1 + 50 * 0.08);
    expect(exportValue(tiers, 2500, 1000)).toBeCloseTo(500 * 0.08 + 500 * 0.06);
    expect(exportValue(tiers, 5000, 10)).toBeCloseTo(0.6);
  });
  it('fehlender Preis = null, nicht 0', () => {
    expect(exportValue([{ upToKwh: null, price: null }], 0, 5)).toBeNull();
    expect(exportValue([{ upToKwh: null, price: null }], 0, 0)).toBe(0);
  });
});

describe('computeCosts', () => {
  const flat: Tariff[] = [{ validFrom: '2025-01-01', name: 'flat', importPrice: 30, windows: [{ name: 'Nacht', months: [], days: [], from: 22, to: 6, price: 20 }], exportTiers: [{ upToKwh: null, price: 7 }] }];

  it('Bezug × Fensterpreis, Einspeisung × Tarif, Netzanteil je Verbraucher', () => {
    const ivs = [
      // 12:00: Haus 2 kWh (WP 1), 1 aus PV, 1 aus Netz → Netzanteil 50 %
      iv('2025-06-14T10:00:00Z', { pvRoof: 1, gridImport: 1, heatpump: 1 }),
      // 23:00: 1 kWh Netz, Auto lädt 1 kWh, Nachtpreis
      iv('2025-06-14T21:00:00Z', { gridImport: 1, wallbox: 1 }),
      // 13:00: 3 kWh PV, 2 eingespeist
      iv('2025-06-14T11:00:00Z', { pvRoof: 3, gridExport: 2 }),
    ];
    const c = computeCosts(ivs, flat, [new Date('2025-06-13T22:00:00Z')], meta);
    expect(c.totals.import).toEqual({ kwh: 2, eur: 0.5, missingKwh: 0 }); // 1×0,30 + 1×0,20
    expect(c.totals.export).toEqual({ kwh: 2, eur: 0.14, missingKwh: 0 });
    expect(c.totals.heatpump.kwh).toBeCloseTo(0.5);
    expect(c.totals.heatpump.eur).toBeCloseTo(0.15);
    expect(c.totals.wallbox.eur).toBeCloseTo(0.2);
    expect(c.totals.rest.eur).toBeCloseTo(0.15);
    // Verbraucher + PV/Akku-Anteil = Hausverbrauch
    const h = c.totals.heatpump.kwh + c.totals.wallbox.kwh + c.totals.rest.kwh + c.totals.saved.kwh;
    expect(h).toBeCloseTo(2 + 1 + 1);
    expect(c.avgImportPrice).toBe(25);
    expect(c.buckets.import[0]).toBeCloseTo(0.5);
  });

  it('fehlende Preise werden ausgewiesen, nicht als 0 € gerechnet', () => {
    const t = SEED_TARIFFS.filter((x) => x.validFrom === '2026-10-01');
    const c = computeCosts([iv('2026-10-23T10:00:00Z', { gridImport: 2, gridExport: 1, pvRoof: 1 })], t, [], { ...meta, date: '2026-10-23' });
    expect(c.totals.import).toEqual({ kwh: 2, eur: 0, missingKwh: 2 });
    expect(c.totals.export.eur).toBeCloseTo(0.07); // 7 ct bekannt
    expect(c.avgImportPrice).toBeNull();
    expect(c.totals.carport).toBe(0);
  });

  it('Staffel zählt ab exportBefore und beginnt am 1.1. neu', () => {
    const tiered: Tariff[] = [{ ...flat[0], exportTiers: [{ upToKwh: 10, price: 10 }, { upToKwh: null, price: 5 }] }];
    const ivs = [iv('2025-12-31T10:00:00Z', { pvRoof: 5, gridExport: 5 }), iv('2026-01-01T10:00:00Z', { pvRoof: 5, gridExport: 5 })];
    const c = computeCosts(ivs, tiered, [], meta, { exportBefore: 8 });
    // 2025: 2 kWh × 10 ct + 3 kWh × 5 ct = 0,35 €; 2026 neu: 5 × 10 ct = 0,50 €
    expect(c.totals.export.eur).toBeCloseTo(0.85);
  });

  it('Anlagenwert mit Intervallpreis (Nacht günstiger)', () => {
    // Akku entlädt 1 kWh tagsüber (30 ct) und 1 kWh nachts (20 ct), keine PV-Ladung im Zeitraum
    const ivs = [iv('2025-06-14T10:00:00Z', { batteryDischarge: 1 }), iv('2025-06-14T21:00:00Z', { batteryDischarge: 1 })];
    expect(computeCosts(ivs, flat, [], meta).totals.battery).toBeCloseTo(0.5);
  });
});

describe('Validierung + Store', () => {
  it('Startbestand ist gültig', () => expect(validateTariffs(SEED_TARIFFS)).toBeNull());
  it('lehnt kaputte Eingaben ab', () => {
    expect(validateTariffs([{ ...SEED_TARIFFS[0], validFrom: '2025-1-1' }])).toMatch(/YYYY/);
    expect(validateTariffs([SEED_TARIFFS[0], SEED_TARIFFS[0]])).toMatch(/doppelt/);
    expect(validateTariffs([{ ...SEED_TARIFFS[0], exportTiers: [{ upToKwh: 100, price: 7 }] }])).toMatch(/unbegrenzt/);
    expect(validateTariffs([{ ...SEED_TARIFFS[0], importPrice: -1 }])).toMatch(/Grundpreis/);
  });
  it('SQLite: seed bei leerer DB, replace ersetzt alles', () => {
    const s = openTariffStore(openDb(':memory:'), SEED_TARIFFS);
    expect(s.list().map((t) => t.validFrom)).toEqual(['2024-01-01', '2025-01-01', '2026-10-01']);
    const v = s.version();
    s.replace([{ ...SEED_TARIFFS[2], importPrice: 25 }]);
    expect(s.list()).toHaveLength(1);
    expect(s.list()[0].importPrice).toBe(25);
    expect(s.version()).toBe(v + 1);
  });
});
