// Einrichtung in der Explosionszeichnung: Küchenmöbel und Geräte als Quader (Weltkoordinaten wie floors.ts: x = Ost, y = Nord, z = oben in m).
// Nur Umrisse, ohne Verdeckung. Gezeichnet werden Oberseite und die beiden Seiten, die vom Blick aus Südwest sichtbar sind.
import type { FloorId, P3 } from './floors';

export interface FurnBox {
  id: string;
  floor: FloorId;
  kind: 'counter' | 'tall' | 'appliance'; // Arbeitsfläche · raumhoher Schrank · Gerät auf der Fläche
  device?: string; // Geräte-ID aus der App (Zustand später)
  x: readonly [number, number];
  y: readonly [number, number];
  z: readonly [number, number];
}

/** Fronten als flache Rechtecke an der Westseite (x = const) eines Quaders. */
export interface FurnPanel {
  floor: FloorId;
  pts: readonly P3[];
}

/**
 * Küche (Raum „kueche“, EG). Ostzeile von Süd nach Nord: Arbeitsfläche, Geschirrspüler unter der Arbeitsfläche.
 * Hochschränke (Kühlschrank, Backofen, Eckschrank) sind vorerst nicht gezeichnet.
 * Kurzer Schenkel an der Südseite mit Herd, Westinsel.
 * Maße: Arbeitsplatte 60 cm tief, 90 cm hoch; hohe Schränke 220 cm.
 */
export const KITCHEN_FURNITURE: readonly FurnBox[] = [
  // Ostzeile, von Nord nach Süd: Tür (Waschküche), Kühlschrank-Hochschrank, Geschirrspüler, L-Arbeitsfläche
  { id: 'schrank-kuehl', floor: 'eg', kind: 'tall', device: 'kuehlschrank', x: [11.4, 12.0], y: [4.6, 5.5], z: [0, 2.2] },
  { id: 'geschirrspueler', floor: 'eg', kind: 'counter', device: 'geschirrspueler', x: [11.4, 12.0], y: [3.7, 4.6], z: [0, 0.9] },
  { id: 'kueche-ost', floor: 'eg', kind: 'counter', x: [11.4, 12.0], y: [1.8, 3.7], z: [0, 0.9] },
  // Südschenkel mit Herd
  { id: 'kueche-sued', floor: 'eg', kind: 'counter', x: [9.5, 11.4], y: [1.8, 2.4], z: [0, 0.9] }, // verkürzt: Tür nach außen daneben
  { id: 'herd', floor: 'eg', kind: 'appliance', device: 'herd', x: [9.6, 10.3], y: [1.9, 2.3], z: [0.9, 0.93] },
  // Westzeile, von Süd nach Nord: Backofen-Hochschrank, Arbeitsfläche mit Kaffeemaschine, Hochschrank
  { id: 'schrank-backofen', floor: 'eg', kind: 'tall', device: 'backrohr', x: [8.6, 9.2], y: [3.3, 3.9], z: [0, 2.2] },
  { id: 'kueche-west', floor: 'eg', kind: 'counter', x: [8.6, 9.2], y: [3.9, 5.4], z: [0, 0.9] },
  { id: 'schrank-west-nord', floor: 'eg', kind: 'tall', x: [8.6, 9.2], y: [5.4, 6.4], z: [0, 2.2] },
  { id: 'kaffee', floor: 'eg', kind: 'appliance', device: 'coffeemachine', x: [8.75, 9.1], y: [4.1, 4.5], z: [0.9, 1.25] },
];

/** Fronten und Bedienteile (Rechtecke an der Westseite der Schränke, x = 11.4 bzw. 8.6) */
const fx = 11.4, bx = 8.6;
export const KITCHEN_PANELS: readonly FurnPanel[] = [
  // Geschirrspüler: Front unter der Arbeitsplatte
  { floor: 'eg', pts: [[fx, 3.75, 0.12], [fx, 4.55, 0.12], [fx, 4.55, 0.84], [fx, 3.75, 0.84]] },
  // Kühlschrank: Front, Trennlinie Kühl-/Gefrierteil bei 1,45 m
  { floor: 'eg', pts: [[fx, 4.65, 0.05], [fx, 5.45, 0.05], [fx, 5.45, 2.15], [fx, 4.65, 2.15]] },
  { floor: 'eg', pts: [[fx, 4.65, 1.45], [fx, 5.45, 1.45]] },
  // Backofen: Tür auf Höhe 0,6–1,5 m
  { floor: 'eg', pts: [[bx, 3.4, 0.6], [bx, 3.8, 0.6], [bx, 3.8, 1.5], [bx, 3.4, 1.5]] },
];

/** Alle Kanten eines Quaders als Linienzüge (Oberseite, Westseite, Südseite) in Weltkoordinaten */
export function furnBoxLines(b: FurnBox): P3[][] {
  const [x0, x1] = b.x, [y0, y1] = b.y, [z0, z1] = b.z;
  const top: P3[] = [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, z1]];
  const west: P3[] = [[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [x0, y0, z0]];
  const south: P3[] = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y0, z0]];
  return b.kind === 'appliance' ? [top] : [top, west, south];
}

export const furnitureOn = (floor: FloorId) => KITCHEN_FURNITURE.filter((b) => b.floor === floor);
export const panelsOn = (floor: FloorId) => KITCHEN_PANELS.filter((p) => p.floor === floor);

/** Türen: Öffnung in der Wand (siehe WALLS in floors.ts) + Türblatt und Schwenkbogen im Grundriss. */
export interface DoorDef {
  id: string;
  floor: FloorId;
  hinge: readonly [number, number]; // Scharnierpunkt an der Wand
  width: number; // m
  wall: 'x' | 'y'; // Wand verläuft entlang der x- bzw. y-Achse
  swing: 1 | -1; // Richtung in den Raum: +1 = zu höheren, −1 = zu niedrigeren Koordinaten (senkrecht zur Wand)
}

export const DOORS: readonly DoorDef[] = [
  // Küche → Waschküche (weiße Tür neben dem Kühlschrank): Ostwand bei x = 12, Scharnier am Südende (y 5,5), Blatt schwingt nach Osten
  { id: 'tuer-kueche-wasch', floor: 'eg', hinge: [12, 5.5], width: 0.8, wall: 'x', swing: 1 },
  // Küche → außen (Südwand, y = 1.8): Scharnier an der SW-Ecke, Blatt schwingt in die Küche (+y)
  { id: 'tuer-kueche-aussen', floor: 'eg', hinge: [8.56, 1.8], width: 0.8, wall: 'y', swing: 1 },
];

/** Türblatt (geöffnet, 90°) und Schwenkbogen als Linienzüge in Weltkoordinaten (z = 0). Das Blatt startet geschlossen
 *  entlang der Wand (Scharnier bis zum Ende der Öffnung) und schwenkt in die Richtung `swing`. */
export function doorLines(d: DoorDef): P3[][] {
  const [hx, hy] = d.hinge, w = d.width;
  const closed = d.wall === 'x' ? Math.PI / 2 : 0; // Öffnung liegt in +y (bei x-Wand) bzw. +x (bei y-Wand)
  const open = d.wall === 'x' ? (d.swing < 0 ? Math.PI : 0) : (d.swing > 0 ? Math.PI / 2 : -Math.PI / 2);
  const at = (a: number): P3 => [hx + w * Math.cos(a), hy + w * Math.sin(a), 0];
  const arc: P3[] = [];
  for (let k = 0; k <= 12; k++) arc.push(at(closed + (open - closed) * (k / 12)));
  return [[[hx, hy, 0], at(open)], arc];
}
export const doorsOn = (floor: FloorId) => DOORS.filter((d) => d.floor === floor);
