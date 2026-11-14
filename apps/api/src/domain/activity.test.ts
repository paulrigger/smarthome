import { describe, expect, it } from 'vitest';
import { planActivities, type ActivityState, type ApplianceRun, type LiveSnapshot } from '@smarthome/shared';
import { parseMiele } from '../sources/miele';

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 6, 10);

function snap(wm: { power?: number | null; run?: ApplianceRun | null }, gs: { power?: number | null } = {}): LiveSnapshot {
  return {
    ts: '', stale: [], rooms: [], outdoorTemp: null,
    power: { pv: 0, pvRoof: 0, pvCarport: 0, grid: 0, battery: 0, house: 0, heatpump: 0, wallbox: 0, rest: 0, solarThermal: 0 },
    battery: { soc: 50 }, heatpump: { cop: null, heatOutput: null, flowTemp: null, dhwTop: null, bufferTop: null },
    solarThermal: { collectorTemp: null }, car: { soc: null, range: null, home: null, plugged: null },
    appliances: [
      { id: 'washingmachine', name: 'Wasch­maschine', power: wm.power ?? 0, run: wm.run ?? null },
      { id: 'geschirrspueler', name: 'Geschirr­spüler', power: gs.power ?? 0 },
    ],
  };
}

const MIELE = {
  '000123456789': {
    ident: { type: { value_raw: 1, value_localized: 'Waschmaschine' } },
    state: {
      ProgramID: { value_raw: 1, value_localized: 'Baumwolle' },
      status: { value_raw: 5, value_localized: 'In Betrieb' },
      programPhase: { value_raw: 260, value_localized: 'Hauptwäsche' },
      remainingTime: [1, 25],
      elapsedTime: [0, 40],
    },
  },
  dryer: { ident: { type: { value_raw: 2 } }, state: { status: { value_raw: 1 } } },
};

describe('Miele', () => {
  it('parst Restzeit, Programm und Phase', () => {
    const r = parseMiele(MIELE, T0);
    expect(Object.keys(r)).toEqual(['washingmachine']);
    expect(r.washingmachine).toMatchObject({ running: true, program: 'Baumwolle', phase: 'Hauptwäsche', remainingMin: 85, elapsedMin: 40 });
    expect(r.washingmachine.endsAt).toBe(new Date(T0 + 85 * MIN).toISOString());
    const off = parseMiele({ x: { ident: { type: { value_raw: 1 } }, state: { status: { value_raw: 7, value_localized: 'Ende' }, remainingTime: [0, 0] } } }, T0);
    expect(off.washingmachine).toMatchObject({ running: false, remainingMin: null, endsAt: null });
  });
});

describe('Live-Aktivitäten', () => {
  it('Miele: Start, nur bei > 5 min Abweichung Update, Ende', () => {
    let st: ActivityState = {};
    const step = (min: number, s: LiveSnapshot) => {
      const r = planActivities(st, s, T0 + min * MIN);
      st = r.state;
      return r.commands;
    };
    const run = (remaining: number): ApplianceRun => ({ source: 'miele', running: true, status: 'In Betrieb', program: 'Baumwolle', phase: 'Spülen', remainingMin: remaining, elapsedMin: 40, endsAt: new Date(T0 + remaining * MIN).toISOString() });
    const c1 = step(0, snap({ run: run(85) }));
    expect(c1).toMatchObject([{ kind: 'start', id: 'washingmachine', title: 'Baumwolle · Spülen', estimated: false }]);
    expect(step(1, snap({ run: run(87) }))).toEqual([]); // 2 min Abweichung → nichts
    expect(step(2, snap({ run: run(95) }))).toMatchObject([{ kind: 'update' }]);
    expect(step(90, snap({ run: { ...run(0), running: false, endsAt: null } }))).toMatchObject([{ kind: 'end', name: 'Waschmaschine' }]);
  });

  it('Schätzung aus Leistung: Start nach 3 min, Verlängerung, Ende nach Pause', () => {
    let st: ActivityState = {};
    const cmds: string[] = [];
    let t = T0;
    const run = (n: number, gsPower: number) => {
      for (let i = 0; i < n; i++) {
        const r = planActivities(st, snap({}, { power: gsPower }), t);
        st = r.state;
        cmds.push(...r.commands.map((c) => c.kind));
        t += MIN;
      }
    };
    run(2, 1500);
    expect(cmds).toEqual([]);
    run(200, 1500); // länger als 120 min geschätzt
    expect(cmds[0]).toBe('start');
    expect(cmds).toContain('update');
    run(25, 1);
    expect(cmds.at(-1)).toBe('end');
  });
});
