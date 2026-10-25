// Reine Geometrie/Bilanz für die Übersichts-Varianten "Energiefluss" (Sankey) und "Haus im Zentrum" (Hub).
import type { EnergyTotals } from './index';

export type SankeySource = 'pv' | 'battery' | 'grid';
export type SankeyTarget = 'export' | 'batteryCharge' | 'house';

/** Reihenfolge oben → unten; so gewählt, dass sich keine Bänder kreuzen. */
export const SANKEY_SOURCES: SankeySource[] = ['pv', 'battery', 'grid'];
export const SANKEY_TARGETS: SankeyTarget[] = ['export', 'batteryCharge', 'house'];

export interface SankeyFlow {
  from: SankeySource;
  to: SankeyTarget;
  kwh: number;
}

const pos = (x: number | null | undefined) => (x !== null && x !== undefined && Number.isFinite(x) && x > 0 ? x : 0);

/**
 * Energieflüsse im Zeitraum:
 *   PV→Einspeisung = Einspeisung, PV→Akku = Akkuladung, PV→Haus = PV − Einspeisung − Akkuladung,
 *   Netz→Haus = Bezug, Akku→Haus = Entladung.
 * Reicht die PV nicht für Einspeisung + Ladung (Zählerrauschen, Netzladung), kommt der Rest der Ladung aus dem Netz
 * (Netz→Akku) – so bleibt links = rechts und kein Band wird negativ.
 */
export function sankeyFlows(e: Pick<EnergyTotals, 'pv' | 'gridImport' | 'gridExport' | 'batteryCharge' | 'batteryDischarge'>): SankeyFlow[] {
  const pv = pos(e.pv);
  const exp = Math.min(pos(e.gridExport), pv);
  const chargePv = Math.min(pos(e.batteryCharge), pv - exp);
  const chargeGrid = Math.min(pos(e.batteryCharge) - chargePv, pos(e.gridImport));
  const flows: SankeyFlow[] = [
    { from: 'pv', to: 'export', kwh: exp },
    { from: 'pv', to: 'batteryCharge', kwh: chargePv },
    { from: 'pv', to: 'house', kwh: pv - exp - chargePv },
    { from: 'battery', to: 'house', kwh: pos(e.batteryDischarge) },
    { from: 'grid', to: 'batteryCharge', kwh: chargeGrid },
    { from: 'grid', to: 'house', kwh: pos(e.gridImport) - chargeGrid },
  ];
  return flows;
}

export interface SankeyNode<K extends string> {
  id: K;
  kwh: number;
  y: number; // Oberkante des Balkens
  h: number; // Balkenhöhe ∝ Energie
  slotY: number; // Bereich für Beschriftung/Tippen (≥ minSlot)
  slotH: number;
}

export interface SankeyBand {
  from: SankeySource;
  to: SankeyTarget;
  kwh: number;
  y0: number; // Oberkante links
  y1: number; // Oberkante rechts
  h: number;
}

export interface SankeyLayout {
  sources: SankeyNode<SankeySource>[];
  targets: SankeyNode<SankeyTarget>[];
  bands: SankeyBand[];
  scale: number; // px je kWh
  total: number;
}

export interface SankeyOpts {
  height: number;
  gap: number;
  /** Mindesthöhe je Knoten-Slot (Beschriftung + Touch-Ziel), optional je Knoten. */
  minSlot: number | Partial<Record<SankeySource | SankeyTarget, number>>;
  defaultSlot?: number;
}

function stack<K extends string>(ids: K[], kwh: Record<K, number>, scale: number, opts: SankeyOpts): SankeyNode<K>[] {
  let y = 0;
  return ids.map((id) => {
    const h = kwh[id] * scale;
    const min = typeof opts.minSlot === 'number' ? opts.minSlot : ((opts.minSlot as Record<string, number | undefined>)[id] ?? opts.defaultSlot ?? 0);
    const slotH = Math.max(h, min);
    const node = { id, kwh: kwh[id], slotY: y, slotH, y: y + (slotH - h) / 2, h };
    y += slotH + opts.gap;
    return node;
  });
}

const used = <K extends string>(nodes: SankeyNode<K>[], gap: number) =>
  nodes.reduce((a, n) => a + n.slotH, 0) + gap * (nodes.length - 1);

/**
 * Knoten links/rechts stapeln, Balken ∝ kWh. Skala so, dass die höhere Seite (inkl. Mindest-Slots) genau passt.
 * Bänder: links in Reihenfolge der Ziele, rechts in Reihenfolge der Quellen gestapelt.
 */
export function sankeyLayout(flows: SankeyFlow[], opts: SankeyOpts): SankeyLayout {
  const src = Object.fromEntries(SANKEY_SOURCES.map((k) => [k, 0])) as Record<SankeySource, number>;
  const tgt = Object.fromEntries(SANKEY_TARGETS.map((k) => [k, 0])) as Record<SankeyTarget, number>;
  for (const f of flows) {
    src[f.from] += f.kwh;
    tgt[f.to] += f.kwh;
  }
  const total = Object.values(src).reduce((a, b) => a + b, 0);

  // Skala per Bisektion: größte, bei der beide Seiten in height passen
  let lo = 0, hi = total > 0 ? opts.height / total : 0;
  for (let i = 0; i < 40 && total > 0; i++) {
    const mid = (lo + hi) / 2;
    const fits = Math.max(used(stack(SANKEY_SOURCES, src, mid, opts), opts.gap), used(stack(SANKEY_TARGETS, tgt, mid, opts), opts.gap)) <= opts.height;
    if (fits) lo = mid;
    else hi = mid;
  }
  const scale = lo;
  const sources = stack(SANKEY_SOURCES, src, scale, opts);
  const targets = stack(SANKEY_TARGETS, tgt, scale, opts);

  const outY = Object.fromEntries(sources.map((n) => [n.id, n.y])) as Record<SankeySource, number>;
  const inY = Object.fromEntries(targets.map((n) => [n.id, n.y])) as Record<SankeyTarget, number>;
  const bands: SankeyBand[] = [];
  const order = (f: SankeyFlow) => SANKEY_SOURCES.indexOf(f.from) * 10 + SANKEY_TARGETS.indexOf(f.to);
  for (const f of [...flows].sort((a, b) => order(a) - order(b))) {
    if (f.kwh <= 0) continue;
    const h = f.kwh * scale;
    bands.push({ ...f, h, y0: outY[f.from], y1: inY[f.to] });
    outY[f.from] += h;
    inY[f.to] += h;
  }
  return { sources, targets, bands, scale, total };
}

/** Bandform als geschlossener Pfad (kubische Kurven) von x0 nach x1. */
export function bandPath(b: Pick<SankeyBand, 'y0' | 'y1' | 'h'>, x0: number, x1: number): string {
  const m = (x0 + x1) / 2;
  const f = (n: number) => +n.toFixed(2);
  return `M${f(x0)} ${f(b.y0)} C${f(m)} ${f(b.y0)} ${f(m)} ${f(b.y1)} ${f(x1)} ${f(b.y1)} L${f(x1)} ${f(b.y1 + b.h)} C${f(m)} ${f(b.y1 + b.h)} ${f(m)} ${f(b.y0 + b.h)} ${f(x0)} ${f(b.y0 + b.h)} Z`;
}

// ------------------------------------------------------------------ Hub

export interface HubLine {
  value: number | null; // W bzw. kWh, Vorzeichen = Richtung; null = keine aktuellen Daten
  width: number;
  active: boolean; // sichtbar fließend (nicht stale, über Schwelle)
  stale: boolean;
}

export interface HubOpts {
  min: number; // Breite bei 0 / stale
  max: number; // Breite bei ref
  /** Bezugsgröße: mindestens dieser Wert entspricht max (verhindert, dass 30 W wie 8 kW aussehen). */
  ref: number;
  /** ab hier "aktiv"; je Key (geräteabhängig, z. B. Akku-Standby) mit Zahl als Default für fehlende Keys */
  threshold: number | { default: number; byKey: Partial<Record<string, number>> };
}

/** Liniendicke ∝ |Wert| relativ zum größten Wert (mind. ref). Live: W, sonst kWh. */
export function hubLines<K extends string>(values: Record<K, number | null | undefined>, o: HubOpts): Record<K, HubLine> {
  const vals = Object.values(values) as (number | null | undefined)[];
  const big = Math.max(o.ref, ...vals.map((v) => (v === null || v === undefined || !Number.isFinite(v) ? 0 : Math.abs(v))));
  const out = {} as Record<K, HubLine>;
  for (const k of Object.keys(values) as K[]) {
    const v = values[k];
    if (v === null || v === undefined || !Number.isFinite(v)) {
      out[k] = { value: null, width: o.min, active: false, stale: true };
      continue;
    }
    const share = Math.min(1, Math.abs(v) / big);
    const thr = typeof o.threshold === 'number' ? o.threshold : (o.threshold.byKey[k] ?? o.threshold.default);
    out[k] = { value: v, width: o.min + (o.max - o.min) * share, active: Math.abs(v) >= thr, stale: false };
  }
  return out;
}

/** Dauer eines Flusspunkt-Zyklus (s): schneller bei mehr Leistung, wie in der Hausgrafik. */
export function flowDuration(w: number): number {
  const x = Math.log10(Math.max(50, Math.abs(w)));
  return Math.max(0.5, 3.2 - (x - 1.7) * 1.1);
}

// ------------------------------------------------------------------ Hausmodell (Darstellung "Hausmodell")
// Vorlage: docs/mockups/gen_e.py (Mockup E). Grafik 358 × 575, Modell haus-sw.svg (viewBox 1248 × 1138) mittig, Maßstab 0,168.

export const MODEL_VIEW = { w: 358, h: 515, vbW: 1248, vbH: 1138, scale: 0.168, x: (358 - 1248 * 0.168) / 2, y: 170 } as const;

/** Ankerpunkte im Modell (viewBox-Koordinaten), erzeugt mit docs/model/anchors.py (Stand 2026-10-25). */
export const MODEL_ANCHORS_RAW: Record<string, readonly [number, number]> = {
  pvRoof: [670.9, 353.4],
  solar: [1039.1, 187.1],
  pvCarport: [598.8, 836.1],
  heatpump: [162.1, 567.6],
  wallbox: [391.4, 900.2],
  battery: [900.8, 989.6],
  tank: [943.3, 542.6],
  gridW: [234.6, 482.9],
  houseW: [351.4, 570.2],
  // Netzanschluss frei gewählt (Paul): unten an der Carport-Front, zwischen Akku und Auto → kurze Kurve ohne Kreuzung
  gridS: [689.5, 1071.4],
};

export type ModelNodeKey = 'pvCarport' | 'battery' | 'pvRoof' | 'grid' | 'house' | 'wallbox' | 'heatpump' | 'tank' | 'solar';

export interface ModelNodeGeom {
  id: ModelNodeKey;
  anchor?: keyof typeof MODEL_ANCHORS_RAW; // ohne Anker: keine Linie zum Haus (Speicher)
  x: number;
  y: number;
  r: number;
  c1: readonly [number, number]; // Bézier-Kontrollpunkte Knoten → Anker
  c2: readonly [number, number];
  label: 'top' | 'bottom' | 'right'; // Beschriftung über/unter/rechts neben dem Knoten
  align: 'start' | 'middle' | 'end'; // linke/rechte Spalte bündig zum Rand
}

/**
 * Knoten im Uhrzeigersinn (Vorgabe Paul, 2026-10-25): Wärmepumpe (links), Speicher, Solarthermie, PV Dach, PV Carport,
 * Akku, Netz, Auto, Haushalt – ungefähr gleichmäßig auf einer Ellipse ums Haus (Mitte 179|268, 150 × 158, je ~40°,
 * leicht verschoben, damit die Werte-Texte frei bleiben).
 * Kurven kreuzungsfrei (Test in flow.test.ts): PV Dach schwingt rechts um den Solarthermie-Anker.
 * Speicher ohne Linie zum Haus (nur Ketten zu WP und Solarthermie). Radius 20 wie die Haus-Grafik (EnergyFlow).
 */
export const MODEL_NODES: ModelNodeGeom[] = [
  { id: 'heatpump', anchor: 'heatpump', x: 29, y: 268, r: 20, c1: [60, 267], c2: [85, 266], label: 'bottom', align: 'start' },
  { id: 'tank', x: 63, y: 165, r: 20, c1: [63, 165], c2: [63, 165], label: 'right', align: 'start' },
  { id: 'solar', anchor: 'solar', x: 140, y: 112, r: 20, c1: [195, 112], c2: [240, 160], label: 'top', align: 'middle' },
  { id: 'pvRoof', anchor: 'pvRoof', x: 230, y: 118, r: 20, c1: [290, 150], c2: [275, 240], label: 'top', align: 'middle' },
  { id: 'pvCarport', anchor: 'pvCarport', x: 320, y: 213, r: 20, c1: [280, 230], c2: [210, 300], label: 'top', align: 'end' },
  { id: 'battery', anchor: 'battery', x: 320, y: 323, r: 20, c1: [285, 330], c2: [250, 336], label: 'bottom', align: 'end' },
  { id: 'grid', anchor: 'gridS', x: 254, y: 407, r: 20, c1: [235, 390], c2: [205, 360], label: 'bottom', align: 'middle' },
  { id: 'wallbox', anchor: 'wallbox', x: 153, y: 426, r: 20, c1: [150, 390], c2: [142, 350], label: 'bottom', align: 'middle' },
  { id: 'house', anchor: 'houseW', x: 75, y: 398, r: 20, c1: [105, 370], c2: [125, 305], label: 'bottom', align: 'start' },
];

/**
 * Ketten zwischen benachbarten Knoten: Wärmepumpe → Speicher (Warmwasseranschluss), Solarthermie → Speicher,
 * Carport → Akku (DC, Akku lädt nur daraus). bend = Versatz des Kontrollpunkts von der Mitte (nach außen).
 */
export const MODEL_CHAINS: { from: ModelNodeKey; to: ModelNodeKey; bend: readonly [number, number]; heat: boolean }[] = [
  { from: 'heatpump', to: 'tank', bend: [-14, 0], heat: true },
  { from: 'solar', to: 'tank', bend: [-8, -14], heat: true },
  { from: 'pvCarport', to: 'battery', bend: [16, 0], heat: false },
];

const f1 = (n: number) => +n.toFixed(1);

/** Punkt auf dem Kreisrand (Radius + 2) in Richtung Ziel. */
export function edgePoint(nx: number, ny: number, r: number, tx: number, ty: number): [number, number] {
  const d = Math.hypot(tx - nx, ty - ny) || 1;
  return [nx + ((tx - nx) / d) * (r + 2), ny + ((ty - ny) / d) * (r + 2)];
}

/** Ankerpunkt in Grafik-Koordinaten. */
export function modelAnchor(key: keyof typeof MODEL_ANCHORS_RAW): [number, number] {
  const [ax, ay] = MODEL_ANCHORS_RAW[key];
  return [f1(MODEL_VIEW.x + ax * MODEL_VIEW.scale), f1(MODEL_VIEW.y + ay * MODEL_VIEW.scale)];
}

export interface ModelGeometry {
  /** Knoten → Anker (kubische Bézierkurve), Richtung Knoten → Modell; nur Knoten mit Anker */
  links: Partial<Record<ModelNodeKey, { d: string; anchor: [number, number] }>>;
  /** Knoten → Knoten (quadratisch, mit Durchhang), Richtung from → to */
  chains: { from: ModelNodeKey; to: ModelNodeKey; heat: boolean; d: string }[];
}

/** Alle Kurven der Darstellung "Hausmodell" (rein, deterministisch). */
export function modelLinks(nodes: ModelNodeGeom[] = MODEL_NODES, chains = MODEL_CHAINS): ModelGeometry {
  const links = {} as ModelGeometry['links'];
  for (const n of nodes) {
    if (!n.anchor) continue;
    const [ax, ay] = modelAnchor(n.anchor);
    const [sx, sy] = edgePoint(n.x, n.y, n.r, n.c1[0], n.c1[1]);
    links[n.id] = { d: `M${f1(sx)} ${f1(sy)} C${n.c1[0]} ${n.c1[1]} ${n.c2[0]} ${n.c2[1]} ${ax} ${ay}`, anchor: [ax, ay] };
  }
  const pos = new Map(nodes.map((n) => [n.id, n]));
  const out = chains.map((c) => {
    const a = pos.get(c.from)!, b = pos.get(c.to)!;
    const mx = (a.x + b.x) / 2 + c.bend[0], my = (a.y + b.y) / 2 + c.bend[1];
    const [sx, sy] = edgePoint(a.x, a.y, a.r, mx, my);
    const [ex, ey] = edgePoint(b.x, b.y, b.r, mx, my);
    return { from: c.from, to: c.to, heat: c.heat, d: `M${f1(sx)} ${f1(sy)} Q${f1(mx)} ${f1(my)} ${f1(ex)} ${f1(ey)}` };
  });
  return { links, chains: out };
}
