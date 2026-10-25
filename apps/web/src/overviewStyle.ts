// Darstellung der Übersicht, pro Gerät (localStorage) wie die Farbpalette.

export type OverviewStyle = 'house' | 'sankey' | 'hub' | 'model';

export const OVERVIEW_STYLES: { id: OverviewStyle; name: string; note: string }[] = [
  { id: 'house', name: 'Haus', note: 'Gebäudeschnitt mit Dach, Speicher und Leitungen.' },
  { id: 'sankey', name: 'Energiefluss', note: 'Woher der Strom kommt und wohin er geht – Bänder ∝ Energie im Zeitraum.' },
  { id: 'hub', name: 'Haus im Zentrum', note: 'Haus in der Mitte, alle Anlagen ringsum, Linien ∝ Leistung bzw. Energie.' },
  { id: 'model', name: 'Hausmodell', note: 'Linienmodell von Haus und Carport, Flüsse zu den Anlagen am Modell; PV- und Wärme-Kette.' },
];

export const DEFAULT_OVERVIEW_STYLE: OverviewStyle = 'house';
const KEY = 'overviewStyle';

export function loadOverviewStyle(): OverviewStyle {
  try {
    const v = localStorage.getItem(KEY);
    return OVERVIEW_STYLES.some((s) => s.id === v) ? (v as OverviewStyle) : DEFAULT_OVERVIEW_STYLE;
  } catch {
    return DEFAULT_OVERVIEW_STYLE;
  }
}

export function saveOverviewStyle(s: OverviewStyle) {
  try {
    localStorage.setItem(KEY, s);
  } catch {
    /* privat-Modus */
  }
}
