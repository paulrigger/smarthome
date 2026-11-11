import { useMemo } from 'react';
import { APPLIANCE_NAMES, type EnergySummary, type SeriesData } from '@smarthome/shared';
import { useSeries } from '../data';
import type { View } from '../view';
import { DayCurve, type SeriesSpec } from './Charts';

/** Tagesverlauf auf der Übersicht: PV-Linie über dem Verbrauch, gestapelt nach Verbrauchern (nur Zeitraum „Tag“). */
const BASE = ['pv.power', 'heatpump.power', 'wallbox.power', 'unmeasured.power', 'battery.soc', 'gridImport.power', 'batteryDischarge.power'];
const APPS = Object.keys(APPLIANCE_NAMES);
const TOP = 3;
const clean = (s: string) => s.replace(/­/g, '');
const shade = (a: number) => `color-mix(in srgb, var(--text) ${Math.round(a * 100)}%, var(--surface))`;

export function DayFlow({ view, summary }: { view: View; summary: EnergySummary | null }) {
  const day = view.period === 'day';
  const a = useSeries('gauge', day ? BASE : [], view);
  const b = useSeries('gauge', day ? APPS.map((id) => `appliance.${id}.power`) : [], view);

  // größte Geräte des Tages einzeln, Rest als „Weitere Geräte“
  const top = useMemo(() => {
    const kwh = new Map(summary?.appliances.map((x) => [x.id, x.kwh ?? 0]) ?? []);
    return [...APPS].sort((p, q) => (kwh.get(q) ?? 0) - (kwh.get(p) ?? 0)).slice(0, TOP);
  }, [summary]);

  const data = useMemo<SeriesData | null>(() => {
    if (!a.data || !b.data) return null;
    const n = a.data.t.length;
    const others = Array.from({ length: n }, (_, i) => {
      const xs = APPS.filter((id) => !top.includes(id)).map((id) => b.data!.values[`appliance.${id}.power`]?.[i] ?? null);
      return xs.every((v) => v === null) ? null : xs.reduce<number>((s, v) => s + Math.max(0, v ?? 0), 0);
    });
    return { ...a.data, values: { ...a.data.values, ...b.data.values, 'others.power': others } };
  }, [a.data, b.data, top]);

  const stack = useMemo<SeriesSpec[]>(
    () => [
      { key: 'heatpump.power', label: 'Wärmepumpe', color: 'var(--c-heat)' },
      { key: 'wallbox.power', label: 'Auto', color: 'var(--c-car)' },
      ...top.map((id, i) => ({ key: `appliance.${id}.power`, label: clean(APPLIANCE_NAMES[id]), color: shade(0.8 - i * 0.18) })),
      { key: 'others.power', label: 'Weitere Geräte', color: shade(0.28) },
      { key: 'unmeasured.power', label: 'Rest', color: 'color-mix(in srgb, var(--muted) 55%, var(--surface))' },
    ],
    [top],
  );

  if (!day) return null;
  return (
    <section className="dayflow">
      <DayCurve
        data={data}
        stack={stack}
        pvKey="pv.power"
        socKey="battery.soc"
        coverKeys={{ grid: 'gridImport.power', battery: 'batteryDischarge.power' }}
        title="Tagesverlauf"
        height={210}
      />
    </section>
  );
}
