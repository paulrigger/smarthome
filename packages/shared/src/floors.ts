// Haus als Explosionszeichnung: Stockwerke mit Räumen (aus dem Einreichplan 2012, EG 04 01 / OG 03), rein + getestet.
import { MODEL_VIEW } from './flow';
// Koordinaten wie docs/model/build_model.py: x = Ost, y = Nord, z = oben (m), Ursprung SW-Ecke Hauptbaukörper EG.
// Projektion = Blick von Südwest wie haus-sw.svg (az −40°, el 28°), damit die Animation genau auf dem Linienmodell startet.

export type FloorId = 'eg' | 'og';
export type Pt = readonly [number, number];
export type P3 = readonly [number, number, number];

export interface RoomDef {
  id: string;
  name: string;
  floor: FloorId;
  poly: readonly Pt[];
  /** Geräte-IDs (Steckdosen/Miele) in diesem Raum */
  devices?: readonly string[];
  /** Raumklima aus LiveSnapshot.rooms (id) */
  climate?: string;
  /** Wärmespeicher steht hier */
  tank?: boolean;
}

/** Räume grob aus dem Plan; Geräte-Zuordnung = Annahme (Paul bestätigt). */
export const ROOMS: readonly RoomDef[] = [
  { id: 'werkstatt', name: 'Werkstatt', floor: 'eg', poly: [[0.3, 5.1], [5.5, 5.1], [5.7, 8.1], [0.3, 8.1]] },
  { id: 'holz', name: 'Holzlager', floor: 'eg', poly: [[5.7, 6.4], [8.5, 6.4], [8.5, 8.1], [5.7, 8.1]] },
  { id: 'keller', name: 'Keller', floor: 'eg', poly: [[8.8, 6.5], [11.8, 6.5], [11.8, 8.1], [8.8, 8.1]], devices: ['freezer'] },
  { id: 'trocken', name: 'Trockenraum', floor: 'eg', poly: [[8.8, 4.7], [11.8, 4.7], [11.8, 6.3], [8.8, 6.3]] },
  {
    id: 'kueche', name: 'Küche', floor: 'eg', poly: [[8.8, 1.9], [11.8, 1.9], [11.8, 4.5], [8.8, 4.5]],
    devices: ['coffeemachine', 'kuehlschrank', 'herd', 'backrohr', 'geschirrspueler'],
  },
  { id: 'wohnen', name: 'Wohnraum', floor: 'eg', poly: [[5.4, 6.2], [8.5, 6.2], [8.5, 0.1], [3.9, 0.1]], devices: ['router'], climate: 'Wohnzimmer' },
  { id: 'vorraum', name: 'Vorraum', floor: 'eg', poly: [[-1.5, 2.6], [4.3, 2.6], [4.7, 4.9], [-1.5, 4.9]] },
  { id: 'wc', name: 'WC', floor: 'eg', poly: [[2.2, 4.0], [3.7, 4.0], [3.7, 4.9], [2.2, 4.9]] },
  { id: 'biblio', name: 'Bibliothek', floor: 'eg', poly: [[0.3, 0.1], [3.9, 0.1], [4.3, 2.4], [0.3, 2.4]] },
  { id: 'wasch', name: 'Waschraum', floor: 'eg', poly: [[12.2, 3.5], [16.8, 3.5], [16.8, 8.1], [12.2, 8.1]], devices: ['washingmachine'], tank: true },
  { id: 'z1', name: 'Zimmer NW', floor: 'og', poly: [[0.1, 5.1], [5.0, 5.1], [5.1, 8.1], [0.1, 8.1]] },
  { id: 'bad', name: 'Bad', floor: 'og', poly: [[5.3, 5.3], [8.5, 5.3], [8.5, 8.1], [5.3, 8.1]] },
  { id: 'z2', name: 'Zimmer NO', floor: 'og', poly: [[8.7, 5.3], [11.8, 5.3], [11.8, 8.1], [8.7, 8.1]] },
  {
    id: 'galerie', name: 'Galerie', floor: 'og', climate: 'Gallerie',
    poly: [[1.6, 3.0], [4.7, 3.0], [4.0, 0.1], [8.5, 0.1], [8.5, 5.0], [1.6, 5.0]],
  },
  { id: 'z3', name: 'Zimmer SW', floor: 'og', poly: [[0.1, 0.1], [4.0, 0.1], [4.7, 3.0], [0.1, 3.0]] },
  { id: 'z4', name: 'Zimmer O', floor: 'og', poly: [[8.7, 2.0], [11.8, 2.0], [11.8, 5.1], [8.7, 5.1]] },
  { id: 'vorog', name: 'Vorraum', floor: 'og', poly: [[-1.7, 3.0], [1.6, 3.0], [1.6, 5.0], [-1.7, 5.0]] },
];

export const FLOOR_NAMES: Record<FloorId, string> = { eg: 'Erdgeschoss', og: 'Obergeschoss' };

const BODY: Pt[] = [[0, 0], [12, 0], [12, 8.2], [0, 8.2]];
const ANNEX: Pt[] = [[-1.7, 0], [0, 0], [0, 5.4], [-1.7, 5.4]];
const ZUBAU: Pt[] = [[12, 3.3], [17, 3.3], [17, 8.2], [12, 8.2]];
const OUTLINE: Record<FloorId, Pt[][]> = { eg: [BODY, ANNEX, ZUBAU], og: [BODY, ANNEX] };

const ROOF_X = [-2.4, 14.0] as const;
const ROOF_Y = [-1.9, 9.1] as const;
const RIDGE_Y = 3.6;
const EAVE_Z = 5.3;
const RIDGE_Z = 6.9;
const ROOF_T = 0.25;
const OG_Z = 2.75; // Fußboden OG
const SLAB = 0.25;
const ZUBAU_Z = 3.0;
const CUT = 0.9; // Wandhöhe in der Explosionszeichnung

const roofTop = (y: number) =>
  y <= RIDGE_Y
    ? EAVE_Z + ((RIDGE_Z - EAVE_Z) * (y - ROOF_Y[0])) / (RIDGE_Y - ROOF_Y[0])
    : EAVE_Z + ((RIDGE_Z - EAVE_Z) * (ROOF_Y[1] - y)) / (ROOF_Y[1] - RIDGE_Y);
const roofBottom = (y: number) => roofTop(y) - ROOF_T;

/** Kamera von haus-sw.svg (build_model.render, az −40°, el 28°) und Abbildung Meter → viewBox-Pixel des Modells. */
export const MODEL_CAMERA = {
  r: [0.766044, -0.642788, 0] as P3,
  u: [0.301771, 0.359636, 0.882948] as P3,
  w: [-0.567548, -0.676377, 0.469472] as P3,
  /** viewBox x = (p·r − mnx)·sk + pad, y = (mxy − p·u)·sk + pad */
  mnx: -7.68787,
  mxy: 12.1771,
  sk: 61.11911,
  pad: 24,
} as const;

const dot = (p: P3, a: P3) => p[0] * a[0] + p[1] * a[1] + p[2] * a[2];

/** Bildschirm-Kamera: X = ox + (p·r)·scale, Y = oy − (p·u)·scale */
export interface Cam {
  scale: number;
  ox: number;
  oy: number;
}

/** Kamera, die genau auf das Linienmodell passt (rect = Bildschirm-Rechteck des Modell-SVG, vb = viewBox-Größe). */
export function modelCam(rect: { left: number; top: number; width: number; height: number }, vb: { w: number; h: number }): Cam {
  const C = MODEL_CAMERA;
  const kx = rect.width / vb.w;
  const ky = rect.height / vb.h;
  return { scale: C.sk * kx, ox: rect.left + (C.pad - C.mnx * C.sk) * kx, oy: rect.top + (C.mxy * C.sk + C.pad) * ky };
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const lerpCam = (a: Cam, b: Cam, t: number): Cam => ({ scale: lerp(a.scale, b.scale, t), ox: lerp(a.ox, b.ox, t), oy: lerp(a.oy, b.oy, t) });
export const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export type FaceKind = 'slab' | 'slabSide' | 'room' | 'wall' | 'roof' | 'roofSide' | 'pv' | 'cell';
export type Group = 'eg' | 'og' | 'roof';
export interface Face {
  pts: P3[];
  kind: FaceKind;
  group: Group;
  room?: string;
  /** Linie statt Fläche (Zellraster) */
  line?: boolean;
}

export interface SceneState {
  /** 0 = Haus geschlossen, 1 = Explosion */
  e: number;
  /** angetipptes Stockwerk und Fortschritt 0..1 (andere fliegen weg) */
  focus?: FloorId | null;
  f?: number;
}

/** Höhenversatz je Gruppe (m) */
export function groupLift(g: Group, s: SceneState): number {
  const e = s.e;
  const f = s.focus ? s.f ?? 0 : 0;
  const base = g === 'og' ? 7.2 * e : g === 'roof' ? 14.5 * e : 0;
  if (!s.focus) return base;
  if (g === s.focus) return base;
  // nicht gewählte Stockwerke + Dach fliegen aus dem Bild (unter dem gewählten nach unten, darüber nach oben)
  const below = s.focus === 'og' && g === 'eg';
  return base + (below ? -28 : 28) * f;
}

/** Wände eines Polygons; Oberkante als Funktion (über den First gesplittet, damit Giebel stimmen). */
function walls(poly: readonly Pt[], z0: number, top: (x: number, y: number) => number, group: Group, room?: string): Face[] {
  const out: Face[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const pts: P3[] = [[a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], top(b[0], b[1])]];
    if ((a[1] - RIDGE_Y) * (b[1] - RIDGE_Y) < 0) {
      const t = (RIDGE_Y - a[1]) / (b[1] - a[1]);
      const x = a[0] + (b[0] - a[0]) * t;
      pts.push([x, RIDGE_Y, top(x, RIDGE_Y)]);
    }
    pts.push([a[0], a[1], top(a[0], a[1])]);
    out.push({ pts, kind: 'wall', group, room });
  }
  return out;
}

/** Alle Flächen eines Zustands, Reihenfolge = Malreihenfolge (Painter: EG, OG, Dach; je Gruppe nach Tiefe). */
export function houseScene(s: SceneState): Face[] {
  const e = s.e;
  const out: Face[] = [];
  for (const fl of ['eg', 'og'] as FloorId[]) {
    const lift = groupLift(fl, s);
    const z0 = (fl === 'eg' ? 0 : OG_Z) + lift;
    const full = (x: number, y: number) =>
      fl === 'og' ? roofBottom(y) + lift : (x >= 11.99 && y >= 3.29 ? ZUBAU_Z : OG_Z - SLAB) + lift;
    const top = (x: number, y: number) => lerp(full(x, y), z0 + CUT, e);
    const flat: Face[] = [];
    const deep: Face[] = [];
    for (const poly of OUTLINE[fl]) {
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        flat.push({ pts: [[a[0], a[1], z0 - SLAB], [b[0], b[1], z0 - SLAB], [b[0], b[1], z0], [a[0], a[1], z0]], kind: 'slabSide', group: fl });
      }
    }
    for (const poly of OUTLINE[fl]) flat.push({ pts: poly.map(([x, y]) => [x, y, z0] as P3), kind: 'slab', group: fl });
    for (const r of ROOMS.filter((r) => r.floor === fl)) {
      flat.push({ pts: r.poly.map(([x, y]) => [x, y, z0 + 0.01] as P3), kind: 'room', group: fl, room: r.id });
      deep.push(...walls(r.poly, z0, top, fl, r.id));
    }
    // Außenhülle nur am geschlossenen Haus (schrumpft beim Auseinanderfahren auf null, die Raumwände bleiben)
    const shell = (x: number, y: number) => lerp(full(x, y), z0, Math.min(1, e * 1.6));
    if (e < 0.62) for (const poly of OUTLINE[fl]) deep.push(...walls(poly, z0, shell, fl));
    // Flachdach Zubau gehört zur OG-Ebene und blendet beim Auseinanderfahren aus
    if (fl === 'og' && e < 1) {
      const zz = ZUBAU_Z + lift;
      deep.push({ pts: ZUBAU.map(([x, y]) => [x, y, zz + 0.15] as P3), kind: 'roof', group: 'og', room: '__zubauRoof' });
    }
    deep.sort((a, b) => depth(a) - depth(b));
    // Unterseiten: Seitenflächen nach Tiefe, damit die vordere Kante zuletzt kommt
    flat.sort((a, b) => order(a) - order(b) || depth(a) - depth(b));
    out.push(...flat, ...deep);
  }
  out.push(...roof(groupLift('roof', s)));
  return out;
}

const KIND_ORDER: Partial<Record<FaceKind, number>> = { slabSide: 0, slab: 1, room: 2 };
const order = (f: Face) => KIND_ORDER[f.kind] ?? 3;
export const depth = (f: Face) => f.pts.reduce((s, p) => s + dot(p, MODEL_CAMERA.w), 0) / f.pts.length;

function roof(lift: number): Face[] {
  const z = (y: number) => roofTop(y) + lift;
  const zb = (y: number) => roofBottom(y) + lift;
  const [x0, x1] = ROOF_X;
  const [ys, yn] = ROOF_Y;
  const g: Group = 'roof';
  const f: Face[] = [
    // Traufkante Süd (vorne) und Giebelränder
    { pts: [[x0, ys, zb(ys)], [x1, ys, zb(ys)], [x1, ys, z(ys)], [x0, ys, z(ys)]], kind: 'roofSide', group: g },
    { pts: [[x0, ys, zb(ys)], [x0, RIDGE_Y, zb(RIDGE_Y)], [x0, yn, zb(yn)], [x0, yn, z(yn)], [x0, RIDGE_Y, z(RIDGE_Y)], [x0, ys, z(ys)]], kind: 'roofSide', group: g },
    { pts: [[x0, RIDGE_Y, z(RIDGE_Y)], [x1, RIDGE_Y, z(RIDGE_Y)], [x1, yn, z(yn)], [x0, yn, z(yn)]], kind: 'roof', group: g },
    { pts: [[x0, ys, z(ys)], [x1, ys, z(ys)], [x1, RIDGE_Y, z(RIDGE_Y)], [x0, RIDGE_Y, z(RIDGE_Y)]], kind: 'roof', group: g },
  ];
  const on = (x: number, y: number): P3 => [x, y, z(y) + 0.05];
  // PV Dach (8 × 3 Module) und Kollektoren
  const pv = { x: [-0.3, 8.7], y: [-1.8, 2.9], cols: 8, rows: 3 };
  const mw = (pv.x[1] - pv.x[0]) / pv.cols;
  const mh = (pv.y[1] - pv.y[0]) / pv.rows;
  for (let c = 0; c < pv.cols; c++)
    for (let r = 0; r < pv.rows; r++) {
      const a0 = pv.x[0] + c * mw + 0.03, a1 = pv.x[0] + (c + 1) * mw - 0.03;
      const b0 = pv.y[0] + r * mh + 0.03, b1 = pv.y[0] + (r + 1) * mh - 0.03;
      f.push({ pts: [on(a0, b0), on(a1, b0), on(a1, b1), on(a0, b1)], kind: 'pv', group: g });
    }
  for (const [y0, y1] of [[1.0, 3.2], [-1.4, 0.85]]) {
    f.push({ pts: [on(11.4, y0), on(13.4, y0), on(13.4, y1), on(11.4, y1)], kind: 'pv', group: g });
    for (let t = 1; t < 10; t++) {
      const x = 11.4 + (2 * t) / 10;
      f.push({ pts: [on(x, y0 + 0.1), on(x, y1 - 0.1)], kind: 'cell', group: g, line: true });
    }
  }
  return f;
}

/** Projektion in Bildschirmkoordinaten. */
export const project = (p: P3, c: Cam): [number, number] => [c.ox + dot(p, MODEL_CAMERA.r) * c.scale, c.oy - dot(p, MODEL_CAMERA.u) * c.scale];

/** Kamera, die die Flächen (nur gewählte Gruppen) in den Rahmen einpasst. */
export function fitCam(faces: Face[], box: { x: number; y: number; w: number; h: number }, groups?: Group[]): Cam {
  let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
  for (const f of faces) {
    if (groups && !groups.includes(f.group)) continue;
    for (const p of f.pts) {
      const x = dot(p, MODEL_CAMERA.r);
      const y = -dot(p, MODEL_CAMERA.u);
      mnx = Math.min(mnx, x); mxx = Math.max(mxx, x); mny = Math.min(mny, y); mxy = Math.max(mxy, y);
    }
  }
  const scale = Math.min(box.w / (mxx - mnx), box.h / (mxy - mny));
  return { scale, ox: box.x + (box.w - (mxx - mnx) * scale) / 2 - mnx * scale, oy: box.y + (box.h - (mxy - mny) * scale) / 2 - mny * scale };
}

/** Raummittelpunkt (für Beschriftung) */
export function roomCenter(r: RoomDef): Pt {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < r.poly.length; i++) {
    const [x0, y0] = r.poly[i];
    const [x1, y1] = r.poly[(i + 1) % r.poly.length];
    const k = x0 * y1 - x1 * y0;
    a += k; cx += (x0 + x1) * k; cy += (y0 + y1) * k;
  }
  return [cx / (3 * a), cy / (3 * a)];
}

/** Bodenhöhe eines Stockwerks im Zustand (für Beschriftungen) */
export const floorZ = (fl: FloorId, s: SceneState) => (fl === 'eg' ? 0 : OG_Z) + groupLift(fl, s);

/** Umriss (konvexe Hülle) von Hauptbau, Anbau, Zubau und Dach in FlowModel-Koordinaten – Tippfläche „Haus öffnen“. */
export const HOUSE_HULL: [number, number][] = (() => {
  const cam = modelCam({ left: MODEL_VIEW.x, top: MODEL_VIEW.y, width: MODEL_VIEW.vbW * MODEL_VIEW.scale, height: MODEL_VIEW.vbH * MODEL_VIEW.scale }, { w: MODEL_VIEW.vbW, h: MODEL_VIEW.vbH });
  const pts: P3[] = [
    ...[...BODY, ...ANNEX].map(([x, y]) => [x, y, 0] as P3),
    ...ZUBAU.flatMap(([x, y]) => [[x, y, 0], [x, y, ZUBAU_Z]] as P3[]),
    ...[ROOF_Y[0], RIDGE_Y, ROOF_Y[1]].flatMap((y) => ROOF_X.map((x) => [x, y, roofTop(y)] as P3)),
  ];
  const q = pts.map((p) => project(p, cam)).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: [number, number][]) => {
    const h: [number, number][] = [];
    for (const p of list) {
      while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop();
      h.push(p);
    }
    return h.slice(0, -1);
  };
  return [...half(q), ...half([...q].reverse())].map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
})();
