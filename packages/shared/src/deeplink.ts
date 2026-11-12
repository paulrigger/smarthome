// Deep-Links aus Push-Mitteilungen: #/?detail=node:<id> bzw. #/?detail=appliance:<id> öffnet auf der Übersicht das Popup.
// Ziel-URLs stehen in alerts.ts (url-Feld). Rein, getestet in apps/api/src/domain/deeplink.test.ts.

/** Knoten, die im Hausmodell antippbar sind (EnergyFlow/FlowModel) */
export const DETAIL_NODES = ['pvRoof', 'pvCarport', 'solarThermal', 'battery', 'grid', 'heatpump', 'car', 'house', 'carport'] as const;

export type Detail = { kind: 'node'; id: string } | { kind: 'appliance'; id: string };

/** Parst die Query eines Hash-Links („?detail=…“). Unbekannte Ziele ergeben null. */
export function parseDetail(search: string): Detail | null {
  const v = new URLSearchParams(search.replace(/^\?/, '')).get('detail');
  if (!v) return null;
  const [kind, id] = v.split(':');
  if (kind === 'node' && (DETAIL_NODES as readonly string[]).includes(id)) return { kind: 'node', id };
  if (kind === 'appliance' && /^[a-z]+$/.test(id ?? '')) return { kind: 'appliance', id };
  return null;
}
