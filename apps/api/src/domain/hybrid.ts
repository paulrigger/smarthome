// Huawei SUN2000 (Carport) ist ein Hybrid-Wechselrichter, der Akku (LUNA2000) hängt DC-seitig dran und lädt nur aus PV.
// Der Zähler carportpv.total_returned (Reg. 32106) misst die AC-Ausgabe des Wechselrichters, nicht die PV:
//  - nachts zählt er die Akku-Entladung mit (≈ 88 % davon, Rest Wandlungsverlust),
//  - PV, die per DC direkt in den Akku geht, fehlt.
// Korrektur je Intervall (Befund 2026-10-24, Nachtwerte 20.–22.10.: AC ≈ 0,83–0,90 × Entladung):
//   Akku → Haus (AC)  = η · Entladung
//   PV Carport (DC)   = AC-Ausgabe + Ladung − η · Entladung   (≥ 0: reicht die AC-Ausgabe nicht, Entladung(AC) = AC + Ladung)
// Damit gilt die AC-Bilanz exakt: Haus = PV Dach + AC-Ausgabe + Bezug − Einspeisung.
// Die Live-Leistung (Reg. 32064, DC-Eingang) ist bereits echte PV und wird nicht korrigiert.

export const HYBRID_ETA = 0.88;

export interface HybridIn {
  pvCarport: number; // AC-Ausgabe laut Zähler (kWh)
  batteryCharge: number;
  batteryDischarge: number; // DC laut Akku-Zähler
}

export function correctHybrid(v: HybridIn): HybridIn {
  // Zeigt der Zähler weniger AC als η · Entladung (Wirkungsgrad schlechter, Zähler hängt nach), geht nur das
  // Gemessene ans Haus statt PV Carport ins Negative zu kappen – sonst entstünde je Intervall Energie,
  // die in der Zeitraumsumme fehlt (Diagramm ≠ Tabelle).
  const disAc = Math.min(v.batteryDischarge * HYBRID_ETA, Math.max(0, v.pvCarport + v.batteryCharge));
  return {
    pvCarport: v.pvCarport + v.batteryCharge - disAc,
    batteryCharge: v.batteryCharge,
    batteryDischarge: disAc,
  };
}
