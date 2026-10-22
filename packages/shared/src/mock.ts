// Plausible Fake-Daten für Entwicklung, Tests und Vorschau ohne Heimnetz.
import type { EnergySummary, LiveSnapshot, Period } from './index';
import { APPLIANCE_NAMES } from './names';

const r = (n: number, d = 0) => Math.round(n * 10 ** d) / 10 ** d;
const jitter = (amp: number) => (Math.random() - 0.5) * 2 * amp;

/** PV-Profil 0..1 nach Tageszeit (Oktober: ca. 7:30–18:00). */
function sun(date: Date): number {
  const h = date.getHours() + date.getMinutes() / 60;
  if (h < 7.5 || h > 18) return 0;
  return Math.sin(((h - 7.5) / 10.5) * Math.PI) ** 1.5;
}

export function mockLive(now = new Date()): LiveSnapshot {
  const s = sun(now);
  const pvRoof = r(6200 * s + (s ? jitter(150) : 0));
  const pvCarport = r(2400 * s + (s ? jitter(60) : 0));
  const pv = pvRoof + pvCarport;
  const heatpump = r(900 + jitter(250));
  const wallbox = s > 0.4 ? r(3600 + jitter(100)) : 0;
  const appliances = Object.entries(APPLIANCE_NAMES).map(([id, name]) => ({
    id,
    name,
    power:
      id === 'router' ? r(14 + jitter(2)) :
      id === 'kuehlschrank' ? r(Math.random() > 0.5 ? 85 : 0) :
      id === 'freezer' ? r(Math.random() > 0.6 ? 110 : 0) :
      id === 'coffeemachine' ? r(Math.random() > 0.9 ? 1250 : 3) :
      0,
  }));
  const rest = r(320 + appliances.reduce((a, b) => a + (b.power ?? 0), 0) + jitter(40));
  const house = heatpump + wallbox + rest;
  const surplus = pv - house;
  const battery = surplus > 0 ? -Math.min(surplus, 3000) : Math.min(-surplus, 2500);
  const grid = r(house - pv - battery);
  return {
    ts: now.toISOString(),
    power: { pv, pvRoof, pvCarport, grid, battery: r(battery), house: r(house), heatpump, wallbox, rest, solarThermal: r(1800 * s) },
    battery: { soc: r(55 + 35 * s) },
    heatpump: { cop: r(3.4 + jitter(0.3), 2), heatOutput: r(heatpump * 3.4), flowTemp: r(34 + jitter(1), 1), dhwTop: r(49 + jitter(0.5), 1), bufferTop: r(38 + jitter(0.5), 1) },
    solarThermal: { collectorTemp: r(12 + 45 * s, 1) },
    outdoorTemp: r(9 + 5 * s, 1),
    rooms: [
      { id: 'Wohnzimmer', name: 'Wohnzimmer', climate: { temp: 21.4, hum: 46, co2: 612 } },
      { id: 'Gallerie', name: 'Galerie', climate: { temp: 20.8, hum: 41, co2: 845 } },
    ],
    car: { soc: 64, range: 238, home: true, plugged: wallbox > 0 },
    appliances,
    stale: [],
  };
}

export function mockSummary(period: Period, now = new Date()): EnergySummary {
  const k = period === 'today' ? Math.max(0.2, (now.getHours() + now.getMinutes() / 60) / 24) : now.getDate();
  const pvRoof = r(18.4 * k, 2);
  const pvCarport = r(7.1 * k, 2);
  const pv = pvRoof + pvCarport;
  const heatpump = r(14.9 * k, 2);
  const wallbox = r(9.5 * k, 2);
  const rest = r(8.2 * k, 2);
  const house = heatpump + wallbox + rest;
  const batteryCharge = r(5.2 * k, 2);
  const batteryDischarge = r(4.6 * k, 2);
  const gridExport = r(4.3 * k, 2);
  const gridImport = r(house - pv + gridExport + batteryCharge - batteryDischarge, 2);
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  if (period === 'month') from.setDate(1);
  const appliances = Object.entries(APPLIANCE_NAMES).map(([id, name], i) => ({ id, name, kwh: r(((i * 37) % 11) * 0.12 * k + 0.05 * k, 2) }));
  return {
    period,
    from: from.toISOString(),
    to: now.toISOString(),
    energy: { pv, pvRoof, pvCarport, gridImport, gridExport, batteryCharge, batteryDischarge, house, heatpump, heatpumpHeat: r(heatpump * 3.3, 2), wallbox, rest, solarThermal: r(3.1 * k, 2) },
    appliances,
    kpi: {
      selfSufficiency: r((house - gridImport) / house, 3),
      selfConsumption: r((pv - gridExport) / pv, 3),
      cop: 3.3,
    },
    missing: [],
  };
}
