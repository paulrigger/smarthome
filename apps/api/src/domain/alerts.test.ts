import { describe, expect, it } from 'vitest';
import { INITIAL_ALERT_STATE, evaluateAlerts, inQuietHours, validatePushPrefs, DEFAULT_PUSH_PREFS, type AlertState, type LiveSnapshot } from '@smarthome/shared';

const MIN = 60_000;

function snap(o: { grid?: number | null; pv?: number; wallbox?: number | null; soc?: number | null; carSoc?: number | null; plugged?: boolean; wm?: number | null; oven?: number; coffee?: { w: number; wh?: number }; stale?: string[] } = {}): LiveSnapshot {
  return {
    ts: '',
    power: { pv: o.pv ?? 0, pvRoof: 0, pvCarport: 0, grid: o.grid === undefined ? 300 : o.grid, battery: 0, house: 0, heatpump: 0, wallbox: o.wallbox === undefined ? 0 : o.wallbox, rest: 0, solarThermal: 0 },
    battery: { soc: o.soc === undefined ? 50 : o.soc },
    heatpump: { cop: null, heatOutput: null, flowTemp: null, dhwTop: null, bufferTop: null },
    solarThermal: { collectorTemp: null },
    outdoorTemp: null,
    rooms: [],
    car: { soc: o.carSoc ?? null, range: null, home: true, plugged: o.plugged ?? false },
    appliances: [{ id: 'washingmachine', name: 'Wasch­maschine', power: o.wm === undefined ? 0 : o.wm }, { id: 'backrohr', name: 'Backrohr', power: o.oven ?? 0 }, { id: 'coffeemachine', name: 'Kaffee­maschine', power: o.coffee?.w ?? 0, energyWh: o.coffee?.wh ?? null }],
    stale: o.stale ?? [],
  };
}

/** Folge von Snapshots im Minutentakt durchspielen, alle Ereignisse sammeln. */
function run(steps: [number, LiveSnapshot | null][], hour = 12, state: AlertState = INITIAL_ALERT_STATE) {
  const events = [];
  let t = Date.UTC(2026, 10, 1, 10);
  for (const [n, s] of steps)
    for (let i = 0; i < n; i++) {
      const r = evaluateAlerts(state, s, t, hour);
      state = r.state;
      events.push(...r.events);
      t += MIN;
    }
  return { events, state };
}

describe('alerts', () => {
  it('PV-Überschuss erst nach 10 min, dann erst nach Pause wieder', () => {
    const { events } = run([[9, snap({ grid: -2500, pv: 5000 })]]);
    expect(events).toHaveLength(0);
    const r = run([[12, snap({ grid: -2500, pv: 5000, soc: 98 })], [5, snap({ grid: 500 })], [12, snap({ grid: -2500 })]]);
    expect(r.events.map((e) => e.category)).toEqual(['surplus']);
    expect(r.events[0].body).toContain('Einspeisung 2,5 kW');
    expect(r.events[0].body).toContain('Akku 98 %');
    // nach 30 min Pause + 3 h Abkühlung erneut
    const r2 = run([[12, snap({ grid: -2500 })], [200, snap({ grid: 500 })], [12, snap({ grid: -2500 })]]);
    expect(r2.events.filter((e) => e.category === 'surplus')).toHaveLength(2);
  });

  it('Überschuss-Hinweis aufs angesteckte, nicht ladende Auto', () => {
    const r = run([[11, snap({ grid: -3000, plugged: true, wallbox: 3 })]]);
    expect(r.events[0].body).toContain('Auto ist angesteckt');
  });

  it('Auto: Laden beendet mit kWh und Ladestand', () => {
    const r = run([[60, snap({ wallbox: 11000, carSoc: 70 })], [2, snap({ wallbox: 5, carSoc: 80 })]]);
    expect(r.events).toHaveLength(0); // erst nach 3 min aus
    const r2 = run([[60, snap({ wallbox: 11000 })], [4, snap({ wallbox: 5, carSoc: 80 })]]);
    expect(r2.events).toHaveLength(1);
    expect(r2.events[0].title).toBe('Auto: Laden beendet bei 80 %');
    expect(r2.events[0].body).toMatch(/^10,8 kWh in 59 min/);
  });

  it('Akku voll/leer mit Hysterese', () => {
    const r = run([[1, snap({ soc: 99 })], [1, snap({ soc: 95 })], [1, snap({ soc: 100 })], [1, snap({ soc: 85 })], [1, snap({ soc: 99 })], [1, snap({ soc: 8 })], [1, snap({ soc: 12 })], [1, snap({ soc: 9 })]]);
    expect(r.events.map((e) => e.title)).toEqual(['Akku voll', 'Akku voll', 'Akku leer']);
  });

  it('Waschmaschine fertig nach Pause, kurze Läufe ignoriert', () => {
    const r = run([[50, snap({ wm: 400 })], [3, snap({ wm: 2 })], [10, snap({ wm: 300 })], [9, snap({ wm: 1 })]]);
    expect(r.events).toHaveLength(1);
    expect(r.events[0].title).toBe('Waschmaschine fertig');
    expect(r.events[0].body).toMatch(/^Lief 1:02 h/);
    expect(run([[10, snap({ wm: 400 })], [9, snap({ wm: 1 })]]).events).toHaveLength(0);
  });

  it('Störungen: einmal melden, Wiederkehr melden, PV nachts nicht', () => {
    const r = run([[5, snap({ stale: ['grid.power'] })], [1, snap()]]);
    expect(r.events.map((e) => e.title)).toEqual(['Smart Meter: keine Daten', 'Smart Meter: wieder da']);
    expect(run([[5, snap({ stale: ['pvCarport.power'] })]], 22).events).toHaveLength(0);
    const off = run([[15, null], [1, snap()]]);
    expect(off.events.map((e) => e.title)).toEqual(['Keine Live-Daten', 'Live-Daten wieder da']);
  });

  it('Datenhaltung: InfluxDB weg bzw. speichert nichts mehr', () => {
    let state = INITIAL_ALERT_STATE;
    const t0 = Date.UTC(2026, 10, 1, 10);
    const step = (min: number, store: { ok: boolean; lastWrite: number | null; error?: string }) => {
      const r = evaluateAlerts(state, snap(), t0 + min * MIN, 12, undefined, undefined, store);
      state = r.state;
      return r.events.map((e) => e.title);
    };
    expect(step(0, { ok: false, lastWrite: null, error: 'ECONNREFUSED' })).toEqual([]);
    expect(step(12, { ok: false, lastWrite: null })).toEqual(['InfluxDB nicht erreichbar']);
    expect(step(14, { ok: false, lastWrite: null })).toEqual([]);
    // erreichbar, aber jüngster Wert 25 min alt (Platte weg, Schreiben scheitert)
    expect(step(16, { ok: true, lastWrite: t0 - 9 * MIN })).toEqual(['InfluxDB wieder erreichbar', 'InfluxDB speichert keine Daten']);
    expect(step(18, { ok: true, lastWrite: t0 - 9 * MIN })).toEqual([]);
    expect(step(20, { ok: true, lastWrite: t0 + 19 * MIN })).toEqual(['InfluxDB speichert wieder']);
    // ohne Store-Prüfung in diesem Schritt: nichts
    expect(evaluateAlerts(state, snap(), t0 + 60 * MIN, 12).events).toEqual([]);
  });

  it('Backrohr: vorgeheizt beim ersten Abfall, einmal je Einschalten', () => {
    const r = run([[12, snap({ oven: 2800 })], [2, snap({ oven: 5 })], [3, snap({ oven: 2800 })], [3, snap({ oven: 5 })]]);
    expect(r.events.map((e) => e.title)).toEqual(['Backrohr ist vorgeheizt']);
    expect(r.events[0].body).toBe('Aufgeheizt in 11 min.');
    // kurzer Spike (< 3 min) zählt nicht; nach 20 min aus meldet das nächste Einschalten wieder
    expect(run([[2, snap({ oven: 2800 })], [3, snap({ oven: 5 })]]).events).toHaveLength(0);
    const again = run([[10, snap({ oven: 2800 })], [2, snap({ oven: 5 })], [25, snap({ oven: 0 })], [10, snap({ oven: 2800 })], [2, snap({ oven: 5 })]]);
    expect(again.events.filter((e) => e.tag === 'oven')).toHaveLength(2);
  });

  it('Kaffeemaschine: Wasser leer, wenn eingeschaltet ohne Nachheizen', () => {
    // normal: alle 8 min ein Heizstoß, den der Zähler zeigt (Leistung beim Abtasten aber wieder 3 W)
    let wh = 1000;
    const steps: [number, LiveSnapshot][] = [];
    for (let i = 0; i < 60; i++) {
      if (i % 8 === 0) wh += 6; // ~6 Wh je Stoß
      steps.push([1, snap({ coffee: { w: 3, wh } })]);
    }
    expect(run(steps).events.filter((e) => e.tag === 'coffee-water')).toHaveLength(0);
    // leer: Steckdose an (3 W), Zähler steht → nach 20 min eine Meldung
    const empty = run([[1, snap({ coffee: { w: 1200, wh: 1000 } })], [30, snap({ coffee: { w: 3, wh: 1001 } })]]);
    expect(empty.events.map((e) => e.title)).toEqual(['Kaffeemaschine: Wasser leer?']);
    // ausgeschaltet: keine Meldung
    expect(run([[30, snap({ coffee: { w: 0, wh: 1000 } })]]).events).toHaveLength(0);
  });

  it('Ruhezeit und Validierung', () => {
    expect(inQuietHours({ from: 22, to: 7 }, 23)).toBe(true);
    expect(inQuietHours({ from: 22, to: 7 }, 6)).toBe(true);
    expect(inQuietHours({ from: 22, to: 7 }, 7)).toBe(false);
    expect(inQuietHours({ from: 13, to: 14 }, 13)).toBe(true);
    expect(inQuietHours(null, 3)).toBe(false);
    expect(validatePushPrefs(DEFAULT_PUSH_PREFS)).toBeNull();
    expect(validatePushPrefs({ categories: { surplus: true } })).not.toBeNull();
  });
});
