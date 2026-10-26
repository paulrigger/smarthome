import type { Tariff, TariffWindow } from './tariff';

// Startbestand der Tarif-DB. Quelle: vkw-Rechnungen 11/2023–09/2026 (Google Drive, ausgewertet 2026-10-26).
// Preise = Gesamtpreis brutto (Energie inkl. Öko+-Aufpreis − Sonderrabatt + Netznutzung + Netzverlust + Abgaben, × 1,2 USt),
// Stromkostenzuschüsse Land (3 ct) und Bund (Ø des Zeitraums laut Rechnung, USt-frei) bis 03/2025 abgezogen.
// Fixkosten = Grundpreis Energie + Netz-Grundpreis + Messentgelte (Bezug + PV-Zähler) + EAG-Pauschale/-Beitrag, brutto.
// TagNacht: HT So–Fr 6–22, Sa 6–13; NT So–Fr 22–6, Sa ab 13 Uhr (Rechnung 2024).
// Einspeisung vkw: Staffel 3.500 kWh je Kalenderjahr (2024: 302 + 3.198 kWh in Stufe 1). Ein Teil der Erzeugung geht an
// die Energiegemeinschaft (EEG, eigene Abrechnung, nicht enthalten) – hier wird alles mit dem vkw-Tarif bewertet.
const night = (price: number): TariffWindow[] => [
  { name: 'Nacht', months: [], days: [], from: 22, to: 6, price },
  { name: 'Wochenende', months: [], days: [6], from: 13, to: 24, price },
];
const SNAP: TariffWindow = { name: 'SNAP', months: [4, 5, 6, 7, 8, 9], days: [], from: 10, to: 16, price: 16.18 };
const tiers = (first: number, rest: number) => [{ upToKwh: 3500, price: first }, { upToKwh: null, price: rest }];

export const SEED_TARIFFS: Tariff[] = [
  {
    validFrom: '2023-11-29', name: 'TagNacht 2023', importPrice: 20.48, windows: night(15.82), exportTiers: tiers(15, 13), fixedPerYear: 128.88,
    note: 'Rechnung 36558132: Tag 19,4 / Nacht 17,25 − 3 ct Rabatt, Netz HT 3,73 / NT 1,99; Zuschuss Land 3 ct + Bund Ø 1,5 ct.',
  },
  {
    validFrom: '2024-01-01', name: 'TagNacht Öko+ Q1/2024', importPrice: 20.66, windows: night(15.4), exportTiers: tiers(15, 13), fixedPerYear: 128.88,
    note: 'Rechnung 36558132: Rabatt 4,5 ct, Netz HT 4,78 / NT 2,55; Zuschuss Land 3 ct + Bund Ø 1,8 ct. Einspeisung 9 + 6 ct Bonus, ab 3.500 kWh 7 + 6 ct.',
  },
  {
    validFrom: '2024-04-01', name: 'TagNacht Öko+ Q2/2024', importPrice: 16.33, windows: night(11.07), exportTiers: tiers(15, 13), fixedPerYear: 128.88,
    note: 'Rechnung 30484284: Rabatt 5 ct; Zuschuss Land 3 ct + Bund 3,7 ct.',
  },
  {
    validFrom: '2024-07-01', name: 'TagNacht Öko+ H2/2024', importPrice: 17.14, windows: night(11.88), exportTiers: tiers(15, 13), fixedPerYear: 128.88,
    note: 'Rechnungen 30484284, 36888041: Rabatt 6,5 ct; Zuschuss Land 3 ct + Bund Ø 1,1 ct. vkw zählte die Einspeise-Staffel ab Vertragswechsel 2.8.2024 neu.',
  },
  {
    validFrom: '2025-01-01', name: 'TagNacht Öko+ Q1/2025', importPrice: 21.46, windows: night(17.59), exportTiers: tiers(10, 8), fixedPerYear: 171.74,
    note: 'Rechnung 36971674: Rabatt 6,5 ct, Netz HT 5,5 / NT 4,43, Elektrizitätsabgabe 1,5 ct, EAG wieder fällig; Zuschuss Land 3 ct. Einspeisung 9 + 1 ct Bonus, ab 3.500 kWh 7 + 1 ct.',
  },
  {
    validFrom: '2025-04-01', name: 'TagNacht Öko+ 2025', importPrice: 23.5, windows: night(19.63), exportTiers: tiers(10, 8), fixedPerYear: 171.74,
    note: 'Rechnungen 37002098–37296314: Rabatt 7,3 ct, kein Zuschuss mehr.',
  },
  {
    validFrom: '2026-01-01', name: 'TagNacht Öko+ Q1/2026', importPrice: 21.14, windows: night(17.84), exportTiers: tiers(9, 7), fixedPerYear: 177.86,
    note: 'Rechnung 37437715: Netz HT 5,2 / NT 4,6, Elektrizitätsabgabe 0,1 ct. Einspeisung 9 ct, ab 3.500 kWh 7 ct (kein Bonus).',
  },
  {
    validFrom: '2026-04-01', name: 'Strom Duo + SNAP', importPrice: 18.57, windows: [SNAP], exportTiers: tiers(9, 7), fixedPerYear: 181.46,
    note: 'Rechnungen 37491056–37769944: Eintarif 12,2 − 2,8 ct, Netz 4,96 ct; SNAP Apr–Sep 10–16 Uhr: 11,2 − 2,8 ct, Netz 3,97 ct.',
  },
  {
    validFrom: '2026-10-01', name: 'Strom Duo + WiNAP', importPrice: 18.57,
    windows: [{ name: 'WiNAP', months: [10, 11, 12, 1, 2, 3], days: [], from: 22, to: 6, price: 17.38 }, SNAP],
    exportTiers: tiers(9, 7), fixedPerYear: 181.46,
    note: 'WiNAP-Preis angenommen (Netz wie SNAP 3,97 ct, Energie Eintarif) – mit der Oktober-Rechnung prüfen.',
  },
];

/** Früherer Startbestand (Node-RED-Werte). Steht er unverändert in der DB, wird er durch SEED_TARIFFS ersetzt. */
export const LEGACY_SEED_TARIFFS: Tariff[] = [
  {
    validFrom: '2024-01-01',
    name: 'Tag/Nacht 2024',
    importPrice: 13.68,
    windows: night(11.1),
    exportTiers: [{ upToKwh: null, price: 15 }],
    note: 'Aus Node-RED. Einspeise-Staffel 15/13/11 ct – Grenzen unbekannt, nur Stufe 1 hinterlegt.',
  },
  {
    validFrom: '2025-01-01',
    name: 'Tag/Nacht 2025',
    importPrice: 31,
    windows: night(26),
    exportTiers: [{ upToKwh: null, price: 10 }],
    note: 'Aus Node-RED. Einspeise-Staffel 10/8/6 ct (Node-RED: 0,8/0,6 = Tippfehler) – Grenzen unbekannt, nur Stufe 1 hinterlegt.',
  },
  {
    validFrom: '2026-10-01',
    name: 'Einheitspreis + SNAP/WiNAP',
    importPrice: null,
    windows: [
      { name: 'WiNAP', months: [10, 11, 12, 1, 2, 3], days: [], from: 22, to: 6, price: null },
      { name: 'SNAP', months: [4, 5, 6, 7, 8, 9], days: [], from: 10, to: 16, price: null },
    ],
    exportTiers: [{ upToKwh: null, price: 7 }],
    note: 'Preise noch eintragen (24/7 gleicher Arbeitspreis, SNAP 1.4.–30.9. 10–16 Uhr, WiNAP 1.10.–31.3. 22–6 Uhr).',
  },
];
