import { describe, expect, it } from 'vitest';
import { LIFETIME_FROM, anchor, bounds, bucketStarts, energyStep, isCurrent, lifetimeYears, previousBucketStart, shift } from '@smarthome/shared';

const NOW = new Date('2026-10-28T12:00:00Z');

describe('Zeitraum Gesamt (je Jahr summiert)', () => {
  it('beginnt mit LIFETIME_FROM, endet mit dem laufenden Jahr, ist immer aktuell', () => {
    expect(anchor('all', '2025-06-15')).toBe(LIFETIME_FROM);
    expect(shift('all', LIFETIME_FROM, -1)).toBe(LIFETIME_FROM);
    const { from, end } = bounds('all', LIFETIME_FROM, 'Europe/Vienna', NOW);
    expect(from.toISOString()).toBe('2022-12-31T23:00:00.000Z');
    expect(end.toISOString()).toBe('2026-12-31T23:00:00.000Z');
    expect(isCurrent('all', LIFETIME_FROM, NOW)).toBe(true);
  });

  it('ein Balken je Jahr, Basis für Zählerdifferenz ist das Jahr davor', () => {
    expect(energyStep('all')).toBe('1y');
    const starts = bucketStarts('all', LIFETIME_FROM, '1y');
    expect(starts[0].toISOString()).toBe('2022-12-31T23:00:00.000Z');
    expect(starts[1].toISOString()).toBe('2023-12-31T23:00:00.000Z');
    expect(previousBucketStart('all', LIFETIME_FROM, '1y').toISOString()).toBe('2021-12-31T23:00:00.000Z');
    expect(lifetimeYears(NOW)).toEqual(['2023-01-01', '2024-01-01', '2025-01-01', '2026-01-01']);
  });
});
