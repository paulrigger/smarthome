import type { Tariff, TariffWindow } from './tariff';

// Startbestand der Tarif-DB (nur wenn leer). Quelle: Node-RED global "tarifs" + Angaben Paul (2026-10-23).
// Nachttarif bis 2026-09: täglich 22–6 Uhr und Samstag ab 13 Uhr (Node-RED-Logik "function 2").
const night = (price: number): TariffWindow[] => [
  { name: 'Nacht', months: [], days: [], from: 22, to: 6, price },
  { name: 'Wochenende', months: [], days: [6], from: 13, to: 24, price },
];

export const SEED_TARIFFS: Tariff[] = [
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
