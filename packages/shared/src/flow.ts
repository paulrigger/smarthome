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
  threshold: number; // ab hier "aktiv"
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
    out[k] = { value: v, width: o.min + (o.max - o.min) * share, active: Math.abs(v) >= o.threshold, stale: false };
  }
  return out;
}

/** Dauer eines Flusspunkt-Zyklus (s): schneller bei mehr Leistung, wie in der Hausgrafik. */
export function flowDuration(w: number): number {
  const x = Math.log10(Math.max(50, Math.abs(w)));
  return Math.max(0.5, 3.2 - (x - 1.7) * 1.1);
}
