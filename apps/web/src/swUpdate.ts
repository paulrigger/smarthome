// Neue App-Version erkennen (Service Worker im Modus „prompt“) und per Banner neu laden – wie in der zemmat-go-App.
// iOS-Home-Bildschirm-Apps suchen selten selbst nach Updates → beim Zurückholen in den Vordergrund und alle 30 min prüfen.
import { useSyncExternalStore } from 'react';

let ready = false;
let apply: ((reload?: boolean) => Promise<void>) | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function installSwUpdate() {
  import('virtual:pwa-register')
    .then(({ registerSW }) => {
      apply = registerSW({
        immediate: true,
        onNeedRefresh() {
          ready = true;
          emit();
        },
        onRegisteredSW(_url, reg) {
          if (!reg) return;
          const check = () => {
            if (navigator.onLine !== false) reg.update().catch(() => undefined);
          };
          setInterval(check, 30 * 60_000);
          document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
        },
      });
    })
    .catch(() => undefined);
}

/** true, sobald eine neue Version geladen ist und auf „Neu laden“ wartet */
export const useUpdateReady = () =>
  useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => ready,
  );

export async function reloadToUpdate() {
  if (apply) await apply(true); // neuen SW aktivieren, Seite lädt neu
  setTimeout(() => location.reload(), 1500); // Sicherheitsnetz, falls controllerchange ausbleibt
}

/** Banner später erneut zeigen (bis zum nächsten Update-Check) */
export function dismissUpdate() {
  ready = false;
  emit();
}
