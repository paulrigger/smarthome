// Gemeinsame Nutzung mit dem Hüsle (Nachbarhaus): Anteile der Wärmepumpe und des Autos, und Gaspreise für den Gastherme-Vergleich. Rein, getestet.
// Wärme: kein Zähler mehr für das Hüsle → Schätzung 22 % (Heizbedarf 2000 zu 7000 kWh/a, Tabelle „Energie Lustenau“, Konstanten).
// Auto: Anteil Martina & Thomas an den gefahrenen km laut Fahrtenbuch (Summen 2025 + 2026: 77 %).

export const HUESLE = { heatShare: 0.22, carShare: 0.77 } as const;

/** Gaspreis brutto (ct/kWh, Energie + Netz + Abgaben, inkl. 20 % USt) ab dem Datum. Quellen: VKW-Mitteilungen 2020/2022, Schlussabrechnung 2023, Blatt Konstanten. */
const GAS_CT: { from: string; ct: number }[] = [
  { from: '2020-03-01', ct: 5.36 }, // 2,90 ct netto (Feb 2020) + Netz 0,96 + Abgabe 0,59, ×1,2 – Jahre 2020/21 nicht belegt
  { from: '2022-01-01', ct: 4.87 }, // 2,51 ct netto bis 30.04.2022 + 0,96 + 0,5861, ×1,2
  { from: '2022-05-01', ct: 6.36 }, // 3,75 ct netto + 0,96 + 0,5861, ×1,2
  { from: '2023-04-01', ct: 13.93 }, // Schlussabrechnung 2023: 10,80 − 1,00 Rabatt + Netz 1,07 + CO₂ 0,5745 + Erdgasabgabe 0,1036 + Speicher 0,059, ×1,2
];

/** Gaspreis (ct/kWh brutto) zu einem Zeitpunkt; null vor dem ersten bekannten Preis. Nach dem letzten bekannten Preis bleibt er gültig. */
export function gasCtAt(ms: number): number | null {
  let ct: number | null = null;
  for (const g of GAS_CT) if (Date.parse(`${g.from}T00:00:00Z`) <= ms) ct = g.ct;
  return ct;
}
