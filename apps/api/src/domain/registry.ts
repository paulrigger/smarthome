// Welche Influx-Serien die App liest und wie sie umgerechnet werden.
// Quelle: e-ink/device_registry.py. Faktoren/Vorzeichen gegen pi-status-Inventur prüfen!
//
// factor: Rohwert * factor -> Zieleinheit (W, kWh, °C, %, ...)

export interface SeriesDef {
  key: string; // stabiler Name in der App
  measurement: string;
  device: string;
  field: string;
  factor: number;
}

const s = (key: string, measurement: string, device: string, field: string, factor = 1): SeriesDef => ({
  key, measurement, device, field, factor,
});

export const APPLIANCE_IDS = [
  'coffeemachine', 'freezer', 'backrohr', 'geschirrspueler', 'router', 'kuehlschrank', 'herd', 'washingmachine',
] as const;

/** Momentanwerte (letzter Wert). */
export const LIVE_SERIES: SeriesDef[] = [
  s('grid.power', 'powersensor', 'smarti', 'power'), // + Bezug / − Einspeisung
  s('pvRoof.power', 'powersensor', 'house_pv', 'power', -1),
  s('pvCarport.power', 'powersensor', 'carportpv', 'power'),
  s('wallbox.power', 'powersensor', 'wallbox', 'power'),
  s('battery.power', 'battery', 'huaweibattery', 'powerFromBattery'), // + Entladung
  s('battery.soc', 'battery', 'huaweibattery', 'soc'),
  s('heatpump.power', 'WP', 'lambda', 'HPFIpowerconsuption'),
  s('heatpump.heat', 'WP', 'lambda', 'HPQpheating', 1000), // kW -> W
  s('heatpump.cop', 'WP', 'lambda', 'HPCOP'),
  s('heatpump.flowTemp', 'WP', 'lambda', 'HPTempflow'),
  s('heatpump.dhwTop', 'WP', 'lambda', 'WarmwasserOben'),
  s('heatpump.bufferTop', 'WP', 'lambda', 'BoilerOben'),
  s('outdoor.temp', 'WP', 'lambda', 'ActualAmbienTemp'),
  s('solarThermal.power', 'Systa', 'systadata', 'solarPowerActual', 1000), // kW -> W (Integral passt zu solarGainTotal)
  s('solarThermal.collectorTemp', 'Systa', 'systadata', 'collectorTempActual'),
  s('Wohnzimmer.temp', 'climatesensor', 'Wohnzimmer', 'Temp'),
  s('Wohnzimmer.hum', 'climatesensor', 'Wohnzimmer', 'Hum'),
  s('Wohnzimmer.co2', 'climatesensor', 'Wohnzimmer', 'Co2'),
  s('Gallerie.temp', 'climatesensor', 'Gallerie', 'Temp'),
  s('Gallerie.hum', 'climatesensor', 'Gallerie', 'Hum'),
  s('Gallerie.co2', 'climatesensor', 'Gallerie', 'Co2'),
  s('car.soc', 'car', 'MG5', 'soc'),
  s('car.range', 'car', 'MG5', 'range'),
  s('car.home', 'car', 'MG5', 'isHome'),
  s('car.plugged', 'car', 'MG5', 'chargerConnectedBoolean'),
  ...APPLIANCE_IDS.map((id) => s(`appliance.${id}.power`, 'powersensor', id, 'power')),
];

/** Zählerstände – Energie im Zeitraum = last − first. Zieleinheit kWh. */
export const COUNTER_SERIES: SeriesDef[] = [
  s('gridImport', 'powersensor', 'smarti', 'total'),
  s('gridExport', 'powersensor', 'smarti', 'total_returned'),
  s('pvRoof', 'powersensor', 'house_pv', 'total_returned', 0.001),
  s('pvCarport', 'powersensor', 'carportpv', 'total_returned'),
  s('wallbox', 'powersensor', 'wallbox', 'total', 0.001),
  s('batteryCharge', 'battery', 'huaweibattery', 'total_charged'),
  s('batteryDischarge', 'battery', 'huaweibattery', 'total_discharged'),
  s('heatpump', 'WP', 'lambda', 'WPElconsTotal', 0.001),
  s('heatpumpHeat', 'WP', 'lambda', 'WPQprodTotal', 0.001),
  s('solarThermal', 'Systa', 'systadata', 'solarGainTotal'),
  ...APPLIANCE_IDS.map((id) => s(`appliance.${id}`, 'powersensor', id, 'total', 0.001)),
];

/** Live-Werte älter als das gelten als veraltet (nur Leistungen).
 *  Inventur 2026-10: huaweibattery/carportpv schreiben nur alle 5–30 min. */
export const STALE_AFTER_MS = 35 * 60 * 1000;
