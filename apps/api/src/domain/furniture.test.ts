import { describe, expect, it } from 'vitest';
import { DOORS, KITCHEN_FURNITURE, ROOMS, WALLS, doorLines } from '@smarthome/shared';

describe('Küche (Einrichtung im Erdgeschoss)', () => {
  const kitchen = ROOMS.find((r) => r.id === 'kueche')!;
  const xs = kitchen.poly.map((p) => p[0]), ys = kitchen.poly.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];

  it('alle Möbel und Geräte liegen innerhalb des Küchenraums', () => {
    for (const b of KITCHEN_FURNITURE) {
      expect(b.x[0]).toBeGreaterThanOrEqual(minX);
      expect(b.x[1]).toBeLessThanOrEqual(maxX);
      expect(b.y[0]).toBeGreaterThanOrEqual(minY);
      expect(b.y[1]).toBeLessThanOrEqual(maxY);
      expect(b.x[0]).toBeLessThan(b.x[1]);
      expect(b.y[0]).toBeLessThan(b.y[1]);
    }
  });

  it('gezeichnete Geräte gehören zur Küche', () => {
    for (const b of KITCHEN_FURNITURE) if (b.device) expect(kitchen.devices).toContain(b.device);
  });
});

describe('Türen', () => {
  it('Öffnung der Tür Küche–Waschküche ist in der Ostwand ausgespart', () => {
    const wallsX12 = WALLS.eg.filter(([a, b]) => a[0] === 12 && b[0] === 12);
    // der Wandabschnitt, der die Tür-Mitte (y 5,9) enthält, darf nicht existieren
    expect(wallsX12.some(([a, b]) => Math.min(a[1], b[1]) <= 5.9 && Math.max(a[1], b[1]) >= 5.9)).toBe(false);
    expect(wallsX12.length).toBe(2);
  });

  it('Türblatt schwingt in die Waschküche, Bogen beginnt an der geschlossenen Stellung', () => {
    const d = DOORS[0];
    const [leaf, arc] = doorLines(d);
    expect(leaf[1][0]).toBeCloseTo(d.hinge[0] + d.width, 6); // geöffnet Richtung Waschküche (+x)
    expect(arc[0][1]).toBeCloseTo(d.hinge[1] + d.width, 6); // geschlossen: Blatt liegt an der Wand (+y)
  });
});
