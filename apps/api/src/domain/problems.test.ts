import { describe, expect, it } from 'vitest';
import { problemFor, problemMap } from '@smarthome/shared';

describe('Störungen an Symbolen', () => {
  const map = problemMap([
    { id: 'smarti', mqtt: null, influx: { level: 'down' } },
    { id: 'MG5', mqtt: { level: 'late' }, influx: { level: 'ok' } },
    { id: 'wallbox', mqtt: { level: 'ok' }, influx: { level: 'ok' } },
    { id: 'lambda', mqtt: { level: 'ok' }, influx: { level: 'ok' } },
  ]);

  it('markiert down und late, ohne Störung kein Eintrag', () => {
    expect(problemFor('grid', map)).toBe('down');
    expect(problemFor('car', map)).toBe('late');
    expect(problemFor('heatpump', map)).toBeNull();
  });

  it('Auto nimmt die schlechtere Quelle von Auto und Wallbox', () => {
    expect(problemFor('car', problemMap([{ id: 'MG5', mqtt: { level: 'late' } }, { id: 'wallbox', influx: { level: 'down' } }]))).toBe('down');
  });

  it('Geräte-Schlüssel ohne Zuordnung nutzen die Geräte-ID selbst', () => {
    expect(problemFor('appliance.router', problemMap([{ id: 'appliance.router', influx: { level: 'down' } }]))).toBe('down');
  });
});
