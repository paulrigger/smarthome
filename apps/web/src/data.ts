import { useEffect, useState } from 'react';
import type { EnergySummary, LiveSnapshot, SeriesData, SeriesKind } from '@smarthome/shared';
import { mockLive, mockSeries, mockSummary } from '@smarthome/shared';
import type { View } from './view';

/** Vorschau ohne Backend: Build mit VITE_MOCK=1 oder URL-Parameter ?mock */
export const MOCK = import.meta.env.VITE_MOCK === '1' || new URLSearchParams(location.search).has('mock');

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

    // Sofort letzten Stand holen (auch aus Service-Worker-Cache), dann Stream
    fetch('api/live')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => !cancelled && d && setData(d))
      .catch(() => undefined);

    const open = () => {
      es = new EventSource('api/stream');
      es.addEventListener('live', (e) => {
        setData(JSON.parse((e as MessageEvent).data));
        setConn('live');
      });
      es.onerror = () => {
        setConn('offline');
        es?.close();
        if (!cancelled) retry = setTimeout(open, 5000);
      };
    };
    open();

    // iOS pausiert Hintergrund-Tabs: beim Zurückkommen neu verbinden
    const onVis = () => {
      if (document.visibilityState === 'visible' && es?.readyState !== EventSource.OPEN) {
        clearTimeout(retry);
        es?.close();
        open();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      clearTimeout(retry);
      es?.close();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  return { data, conn };
}

export function useSummary(view: View): EnergySummary | null {
  const { period, date, isCurrent } = view;
  const [data, setData] = useState<EnergySummary | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      if (MOCK) return setData(mockSummary(period, date));
      fetch(`api/summary?period=${period}&date=${date}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => !cancelled && d && setData(d))
        .catch(() => undefined);
    };
    setData(null);
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
      fetch(`api/series?kind=${kind}&keys=${encodeURIComponent(k)}&period=${period}&date=${date}`)
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
