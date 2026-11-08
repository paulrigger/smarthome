import { describe, expect, it } from 'vitest';
import { HOUSE_HULL, MODEL_CAMERA, ROOMS, fitCam, houseScene, modelCam, project, roomCenter } from '@smarthome/shared';

describe('floors (Explosionszeichnung)', () => {
  it('Kamera trifft das Linienmodell: SW-Ecke EG landet auf derselben viewBox-Position wie in build_model.render', () => {
    const cam = modelCam({ left: 0, top: 0, width: 1248, height: 1138 }, { w: 1248, h: 1138 });
    const [x, y] = project([0, 0, 0], cam);
    expect(x).toBeCloseTo((0 - MODEL_CAMERA.mnx) * MODEL_CAMERA.sk + MODEL_CAMERA.pad, 3);
    expect(y).toBeCloseTo(MODEL_CAMERA.mxy * MODEL_CAMERA.sk + MODEL_CAMERA.pad, 3);
  });

  it('Explosion passt in den Rahmen, Stockwerke liegen übereinander, Hülle umschließt das Haus', () => {
    const box = { x: 10, y: 60, w: 370, h: 740 };
    const faces = houseScene({ e: 1 });
    const cam = fitCam(faces, box);
    for (const f of faces)
      for (const p of f.pts) {
        const [x, y] = project(p, cam);
        expect(x).toBeGreaterThanOrEqual(box.x - 0.5);
        expect(x).toBeLessThanOrEqual(box.x + box.w + 0.5);
        expect(y).toBeGreaterThanOrEqual(box.y - 0.5);
        expect(y).toBeLessThanOrEqual(box.y + box.h + 0.5);
      }
    const z = (g: string) => Math.min(...faces.filter((f) => f.group === g).flatMap((f) => f.pts.map((p) => p[2])));
    expect(z('og')).toBeGreaterThan(z('eg') + 3);
    expect(faces.some((f) => f.group === 'roof')).toBe(false); // Dach in der Explosion weg
    expect(HOUSE_HULL.length).toBeGreaterThan(4);
  });

  it('Räume: Mittelpunkt im Raum, jede Geräte-ID nur einmal', () => {
    for (const r of ROOMS) {
      const [cx, cy] = roomCenter(r);
      const xs = r.poly.map((p) => p[0]), ys = r.poly.map((p) => p[1]);
      expect(cx).toBeGreaterThan(Math.min(...xs));
      expect(cx).toBeLessThan(Math.max(...xs));
      expect(cy).toBeGreaterThan(Math.min(...ys));
      expect(cy).toBeLessThan(Math.max(...ys));
    }
    const ids = ROOMS.flatMap((r) => r.devices ?? []);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
