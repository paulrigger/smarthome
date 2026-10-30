import { useEffect, useState } from 'react';
import type { Allocation, AssetInfo, CostResult, EnergySummary, LiveSnapshot, Period, SeriesData, SeriesKind, Tariff, Thresholds, YieldResult } from '@smarthome/shared';
import { DEFAULT_THRESHOLDS, SEED_TARIFFS,mockAllocation, mockAssets, mockCosts, mockLive, mockSeries, mockSummary, mockYield } from '@smarthome/shared';
import type { View } from './view';

/** Vorschau ohne Backend: Build mit VITE_MOCK=1 oder URL-Parameter ?mock */
export const MOCK = import.meta.env.VITE_MOCK === '1' || new URLSearchParams(location.search).has('mock');

/** fetch mit Login-Erkennung: 401 → Login-Maske anzeigen. */
export function api(input: string, init?: RequestInit): Promise<Response> {
  return fetch(input, { credentials: 'same-origin', ...init }).then((r) => {
    if (r.status === 401) window.dispatchEvent(new Event('auth-required'));
    return r;
  });
}

export type Conn = 'connecting' | 'live' | 'offline';

export function useLive(): { data: LiveSnapshot | null; conn: Conn } {
  const [data, setData] = useState<LiveSnapshot | null>(null);
  const [conn, setConn] = useState<Conn>('connecting');

  useEffect(() => {
    if (MOCK) {
      setData(mockLive());
      setConn('live');
      const t = setInterval(() => setData(mockLive()), 5000);
      return () => clearInterval(t);
    }
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    let lastEvent = 0; // letzter Live-Stand (Stream oder Abfrage)

    const got = (d: LiveSnapshot) => {
      if (cancelled) return;
      lastEvent = Date.now();
      setData(d);
      setConn('live');
    };
    // Einzelabfrage: Startwert und Rückfallweg, wenn der Stream hängt (Mobilnetz, iOS nach dem Aufwachen)
    const poll = () =>
      api('api/live')
        .then((r) => (r.ok ? r.json() : null))
        // Service-Worker liefert offline den letzten Stand aus dem Cache → anzeigen, aber nicht als "live" werten
        .then((d: LiveSnapshot | null) => d && (Date.now() - Date.parse(d.ts) < 60_000 ? got(d) : !cancelled && setData((x) => x ?? d)))
        .catch(() => undefined);

    const open = () => {
      clearTimeout(retry);
      es?.close();
      es = new EventSource('api/stream');
      es.addEventListener('live', (e) => got(JSON.parse((e as MessageEvent).data)));
      es.onerror = () => {
        es?.close();
        if (!cancelled) retry = setTimeout(open, 5000);
      };
    };
    poll();
    open();

    // Watchdog: Stream sendet alle 5 s. Ohne Daten seit 15 s neu verbinden (tote Verbindung bleibt sonst "OPEN"),
    // dazwischen per Abfrage aktualisieren; "Offline" erst, wenn auch die Abfrage 30 s lang nichts liefert.
    const watch = setInterval(() => {
      const age = Date.now() - lastEvent;
      if (age > 15_000) {
        poll();
        open();
      }
      if (age > 30_000) setConn('offline');
    }, 5_000);

    // iOS pausiert Hintergrund-Tabs: beim Zurückkommen sofort abfragen und Stream neu aufbauen
    const onVis = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastEvent > 8_000) {
        poll();
        open();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      clearTimeout(retry);
      clearInterval(watch);
      es?.close();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  return { data, conn };
}

/** view null = nichts laden (z. B. Vergleich aus). */
export function useSummary(view: View | null): EnergySummary | null {
  const { period, date, isCurrent } = view ?? { period: null, date: null, isCurrent: false };
  const [data, setData] = useState<EnergySummary | null>(null);
  useEffect(() => {
    setData(null);
    if (!period || !date) return;
    let cancelled = false;
    const load = () => {
      if (MOCK) return setData(mockSummary(period, date));
      api(`api/summary?period=${period}&date=${date}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => !cancelled && d && setData(d))
        .catch(() => undefined);
    };
    load();
    // Nur laufende Zeiträume aktualisieren
    const t = isCurrent ? setInterval(load, period === 'day' ? 60_000 : 300_000) : undefined;
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [period, date, isCurrent]);
  return data;
}

export function useSeries(kind: SeriesKind, keys: string[], view: View): { data: SeriesData | null; error: boolean } {
  const { period, date, isCurrent } = view;
  const k = keys.join(',');
  const [data, setData] = useState<SeriesData | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!k) return;
    let cancelled = false;
    const load = () => {
      if (MOCK) return setData(mockSeries(kind, k.split(','), period, date));
      api(`api/series?kind=${kind}&keys=${encodeURIComponent(k)}&period=${period}&date=${date}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
        .then((d) => {
          if (!cancelled) { setData(d); setError(false); }
        })
        .catch(() => !cancelled && setError(true));
    };
    setData(null);
    load();
    const t = isCurrent ? setInterval(load, 5 * 60_000) : undefined;
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [kind, k, period, date, isCurrent]);
  return { data, error };
}

/** Herkunft (PV/Akku/Netz) von WP- und Wallbox-Strom im Zeitraum. */
export function useAllocation(view: View): { data: Allocation | null; error: boolean } {
  const { period, date, isCurrent } = view;
  const [data, setData] = useState<Allocation | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      if (MOCK) return setData(mockAllocation(period, date));
      api(`api/allocation?period=${period}&date=${date}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
        .then((d) => {
          if (!cancelled) { setData(d); setError(false); }
        })
        .catch(() => !cancelled && setError(true));
    };
    setData(null);
    setError(false);
    load();
    const t = isCurrent ? setInterval(load, period === 'day' ? 120_000 : 600_000) : undefined;
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [period, date, isCurrent]);
  return { data, error };
}

/** Ertrag je Anlage (Rangfolge Dach → Carport → Akku) im Zeitraum. */
export function useYield(view: View): YieldResult | null {
  const { period, date, isCurrent } = view;
  const [data, setData] = useState<YieldResult | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      if (MOCK) return setData(mockYield(period, date));
      fetchYield(period, date).then((d) => !cancelled && d && setData(d));
    };
    setData(null);
    load();
    const t = isCurrent ? setInterval(load, period === 'day' ? 120_000 : 600_000) : undefined;
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [period, date, isCurrent]);
  return data;
}

const fetchYield = (period: Period, date: string): Promise<YieldResult | null> =>
  api(`api/yield?period=${period}&date=${date}`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);

/** Inbetriebnahme je Anlage (erster Datenpunkt). */
export function useAssets(): AssetInfo | null {
  const [data, setData] = useState<AssetInfo | null>(null);
  useEffect(() => {
    if (MOCK) return setData(mockAssets());
    api('api/assets')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setData(d))
      .catch(() => setData({ carport: null, battery: null }));
  }, []);
  return data;
}

/** Monatswerte über mehrere Jahre (ein Jahres-Request je Jahr). */
export function useYears(fromYear: number | null): YieldResult[] | null {
  const [data, setData] = useState<YieldResult[] | null>(null);
  useEffect(() => {
    if (fromYear === null) return;
    let cancelled = false;
    const now = new Date().getFullYear();
    const years = Array.from({ length: Math.max(1, now - fromYear + 1) }, (_, i) => `${fromYear + i}-01-01`);
    setData(null);
    Promise.all(years.map((d) => (MOCK ? Promise.resolve(mockYield('year', d)) : fetchYield('year', d)))).then((r) => {
      if (!cancelled) setData(r.filter((x): x is YieldResult => !!x));
    });
    return () => {
      cancelled = true;
    };
  }, [fromYear]);
  return data;
}

// ------------------------------------------------------------------ Tarife + Kosten

let mockTariffs: Tariff[] = SEED_TARIFFS;

const fetchCosts = (period: Period, date: string): Promise<CostResult | null> =>
  MOCK
    ? Promise.resolve(mockCosts(period, date, mockTariffs))
    : api(`api/costs?period=${period}&date=${date}`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);

/** Kosten/Erlöse im Zeitraum, je Intervall mit dem gültigen Tarif. */
export function useCosts(view: View): CostResult | null {
  const { period, date, isCurrent } = view;
  const [data, setData] = useState<CostResult | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = () => fetchCosts(period, date).then((d) => !cancelled && d && setData(d));
    setData(null);
    load();
    const t = isCurrent ? setInterval(load, period === 'day' ? 120_000 : 600_000) : undefined;
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [period, date, isCurrent]);
  return data;
}

/** Kosten-Jahre ab fromYear (Monatswerte, für die Amortisation). */
export function useCostYears(fromYear: number | null): CostResult[] | null {
  const [data, setData] = useState<CostResult[] | null>(null);
  useEffect(() => {
    if (fromYear === null) return;
    let cancelled = false;
    const now = new Date().getFullYear();
    const years = Array.from({ length: Math.max(1, now - fromYear + 1) }, (_, i) => `${fromYear + i}-01-01`);
    setData(null);
    Promise.all(years.map((d) => fetchCosts('year', d))).then((r) => {
      if (!cancelled) setData(r.filter((x): x is CostResult => !!x));
    });
    return () => {
      cancelled = true;
    };
  }, [fromYear]);
  return data;
}

/** Tarifliste laden und speichern. save liefert eine Fehlermeldung oder null. */
export function useTariffs(): { list: Tariff[] | null; save: (l: Tariff[]) => Promise<string | null> } {
  const [list, setList] = useState<Tariff[] | null>(null);
  useEffect(() => {
    if (MOCK) return setList(mockTariffs);
    api('api/tariffs')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setList(d))
      .catch(() => undefined);
  }, []);
  const save = async (l: Tariff[]): Promise<string | null> => {
    if (MOCK) {
      mockTariffs = l;
      setList(l);
      return null;
    }
    try {
      const r = await api('api/tariffs', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(l) });
      const d = await r.json();
      if (!r.ok) return d?.error ?? `Fehler ${r.status}`;
      setList(d);
      return null;
    } catch {
      return 'Keine Verbindung zum Server';
    }
  };
  return { list, save };
}

// ------------------------------------------------------------------ Schwellen aus / Standby / an

let thCache: Thresholds = DEFAULT_THRESHOLDS;
let thLoaded = false;
const thListeners = new Set<(t: Thresholds) => void>();
const setThresholds = (t: Thresholds) => {
  thCache = t;
  thListeners.forEach((fn) => fn(t));
};

/** Schwellen je Gerät (vom Pi, einmal geladen, gemeinsam für alle Komponenten); bis dahin Standardwerte. */
export function useThresholds(): { th: Thresholds; save: (t: Thresholds) => Promise<string | null> } {
  const [th, setTh] = useState(thCache);
  useEffect(() => {
    thListeners.add(setTh);
    if (!thLoaded && !MOCK) {
      thLoaded = true;
      api('api/thresholds')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setThresholds(d))
        .catch(() => (thLoaded = false));
    }
    return () => void thListeners.delete(setTh);
  }, []);
  const save = async (t: Thresholds): Promise<string | null> => {
    if (MOCK) return (setThresholds(t), null);
    try {
      const r = await api('api/thresholds', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(t) });
      const d = await r.json();
      if (!r.ok) return d?.error ?? `Fehler ${r.status}`;
      setThresholds(d);
      return null;
    } catch {
      return 'Keine Verbindung zum Server';
    }
  };
  return { th, save };
}

export function useMedia(q: string): boolean {
  const [m, setM] = useState(() => matchMedia(q).matches);
  useEffect(() => {
    const mq = matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
}
