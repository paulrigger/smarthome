import { useEffect, useState } from 'react';
import type { EnergySummary, LiveSnapshot, Period } from '@smarthome/shared';
import { mockLive, mockSummary } from '@smarthome/shared';

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

export function useSummary(period: Period): EnergySummary | null {
  const [data, setData] = useState<EnergySummary | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      if (MOCK) return setData(mockSummary(period));
      fetch(`api/summary?period=${period}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => !cancelled && d && setData(d))
        .catch(() => undefined);
    };
    setData(null);
    load();
    const t = setInterval(load, period === 'today' ? 60_000 : 300_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [period]);
  return data;
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
