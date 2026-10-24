import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS, DEVICE_KEYS, deviceState, diffThresholds, hubLines, mergeThresholds, validateThresholds } from '@smarthome/shared';
import { openDb } from '../sources/db';
import { openSettingsStore } from '../sources/settingsStore';

describe('deviceState (Standardwerte aus Messdaten)', () => {
  it('Kaffeemaschine im Leerlauf (2–5 W) ist an, 0 W aus', () => {
    expect(deviceState('coffeemachine', 3)).toBe('on');
    expect(deviceState('coffeemachine', 0)).toBe('off');
  });
  it('Wallbox 6 W = Standby, 3,7 kW = an', () => {
    expect(deviceState('wallbox', 6)).toBe('standby');
    expect(deviceState('wallbox', 3700)).toBe('on');
  });
  it('Akku: Vorzeichen egal, BMS-Standby 30 W', () => {
    expect(deviceState('battery', -30)).toBe('standby');
    expect(deviceState('battery', 40)).toBe('standby');
    expect(deviceState('battery', -2000)).toBe('on');
    expect(deviceState('battery', 5)).toBe('off');
  });
  it('fehlende Daten = null (stale), nicht aus', () => {
    expect(deviceState('battery', null)).toBeNull();
    expect(deviceState('battery', undefined)).toBeNull();
    expect(deviceState('battery', NaN)).toBeNull();
  });
  it('eigene Schwellen überschreiben Defaults, unbekannter Key nutzt Fallback', () => {
    expect(deviceState('wallbox', 6, mergeThresholds({ wallbox: { off: 10, on: 50 } }))).toBe('off');
    expect(deviceState('unbekannt', 10)).toBe('standby'); // Fallback 5/20
  });
  it('jedes Gerät hat Standardwerte mit off ≤ on', () => {
    for (const k of DEVICE_KEYS) expect(DEFAULT_THRESHOLDS[k].off).toBeLessThanOrEqual(DEFAULT_THRESHOLDS[k].on);
  });
});

describe('Merge / Validierung / Speichern', () => {
  it('validiert Eingaben', () => {
    expect(validateThresholds(DEFAULT_THRESHOLDS)).toBeNull();
    expect(validateThresholds({ wallbox: { off: 60, on: 50 } })).toMatch(/nicht größer/);
    expect(validateThresholds({ toaster: { off: 1, on: 2 } })).toMatch(/Unbekannt/);
    expect(validateThresholds({ battery: { off: -1, on: 2 } })).toMatch(/0–100/);
    expect(validateThresholds([])).toMatch(/Objekt/);
  });
  it('gespeichert werden nur Abweichungen; Merge ergänzt Defaults', () => {
    const th = mergeThresholds({ battery: { off: 20, on: 100 } });
    expect(diffThresholds(th)).toEqual({ battery: { off: 20, on: 100 } });
    expect(th.wallbox).toEqual(DEFAULT_THRESHOLDS.wallbox);
    expect(mergeThresholds({ toaster: { off: 1, on: 2 } } as never)).toEqual(DEFAULT_THRESHOLDS);
  });
  it('SQLite settings: put/get Roundtrip', () => {
    const s = openSettingsStore(openDb(':memory:'));
    expect(s.get('thresholds')).toBeNull();
    s.put('thresholds', { battery: { off: 20, on: 100 } });
    s.put('thresholds', { wallbox: { off: 2, on: 40 } });
    expect(s.get('thresholds')).toEqual({ wallbox: { off: 2, on: 40 } });
  });
});

describe('hubLines mit geräteabhängigen Schwellen', () => {
  it('Akku 40 W nicht aktiv, Netz 40 W aktiv', () => {
    const l = hubLines({ battery: 40, grid: 40 }, { min: 2, max: 10, ref: 5000, threshold: { default: 20, byKey: { battery: 80 } } });
    expect(l.battery.active).toBe(false);
    expect(l.grid.active).toBe(true);
  });
});
