import { describe, expect, it } from 'vitest';
import { parseDetail } from '@smarthome/shared';
import { readFileSync } from 'node:fs';

describe('Deep-Links aus Push-Mitteilungen', () => {
  it('Knoten und Geräte werden erkannt, unbekannte Ziele nicht', () => {
    expect(parseDetail('?detail=node:battery')).toEqual({ kind: 'node', id: 'battery' });
    expect(parseDetail('?detail=appliance:backrohr')).toEqual({ kind: 'appliance', id: 'backrohr' });
    expect(parseDetail('?detail=node:pv')).toBeNull(); // „pv“ ist kein Knoten
    expect(parseDetail('?detail=node:evil<script>')).toBeNull();
    expect(parseDetail('')).toBeNull();
  });

  it('jede Push-Mitteilung hat ein Ziel außer der Startseite', () => {
    const src = readFileSync(new URL('../../../../packages/shared/src/alerts.ts', import.meta.url), 'utf8');
    expect(src.includes("url: '#/'")).toBe(false);
    for (const m of src.matchAll(/detail=node:([A-Za-z]+)/g)) expect(parseDetail(`?detail=node:${m[1]}`)).not.toBeNull();
  });
});
