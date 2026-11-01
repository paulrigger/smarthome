// Web Push im Browser: Abo anlegen/ändern/löschen. Auf dem iPhone nur in der Home-Bildschirm-App (iOS ≥ 16.4).
import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_PUSH_PREFS, type PushPrefs } from '@smarthome/shared';
import { MOCK, api } from './data';

export type PushSupport = 'ok' | 'ios-browser' | 'unsupported' | 'denied';

export function pushSupport(): PushSupport {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  if (ios && !standalone) return 'ios-browser';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return 'ok';
}

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? `HTTP ${r.status}`);
  return j as T;
}

async function currentSub(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export interface PushLogEntry {
  ts: string;
  category: string;
  title: string;
  body: string;
  sent: number;
}

/** Zustand dieses Geräts: abonniert?, Einstellungen, letzte Mitteilungen. */
export function usePush() {
  const [support] = useState(pushSupport);
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [prefs, setPrefs] = useState<PushPrefs>(DEFAULT_PUSH_PREFS);
  const [log, setLog] = useState<PushLogEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (MOCK) return setSubscribed(false);
    try {
      const info = await (await api('api/push')).json();
      setLog(info.log ?? []);
      const sub = await currentSub();
      if (!sub) return setSubscribed(false);
      const st = await post<{ subscribed: boolean; prefs: PushPrefs }>('api/push/status', { endpoint: sub.endpoint });
      setSubscribed(st.subscribed);
      setPrefs(st.prefs);
    } catch (e) {
      setError((e as Error).message);
      setSubscribed(false);
    }
  }, []);
  useEffect(() => void refresh(), [refresh]);

  const guard = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /** Muss direkt aus einem Tippen kommen (iOS fragt sonst nicht nach der Erlaubnis). */
  const enable = (p: PushPrefs = prefs) =>
    guard(async () => {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') throw new Error('Mitteilungen nicht erlaubt – in den iOS-Einstellungen unter „Mitteilungen → Haus“ freigeben.');
      const reg = await navigator.serviceWorker.ready;
      const { publicKey } = await (await api('api/push')).json();
      let sub = await reg.pushManager.getSubscription();
      if (sub && sub.options.applicationServerKey) {
        const cur = btoa(String.fromCharCode(...new Uint8Array(sub.options.applicationServerKey))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        if (cur !== publicKey) {
          await sub.unsubscribe();
          sub = null;
        }
      }
      sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
      await post('api/push/subscribe', { subscription: sub.toJSON(), prefs: p });
      setPrefs(p);
      setSubscribed(true);
    });

  const save = (p: PushPrefs) =>
    guard(async () => {
      setPrefs(p);
      const sub = await currentSub();
      if (sub) await post('api/push/subscribe', { subscription: sub.toJSON(), prefs: p });
    });

  const disable = () =>
    guard(async () => {
      const sub = await currentSub();
      if (sub) {
        await post('api/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
        await sub.unsubscribe();
      }
      setSubscribed(false);
    });

  const test = () =>
    guard(async () => {
      const sub = await currentSub();
      if (!sub) throw new Error('nicht abonniert');
      await post('api/push/test', { endpoint: sub.endpoint });
    });

  return { support, subscribed, prefs, log, busy, error, enable, save, disable, test, refresh };
}
