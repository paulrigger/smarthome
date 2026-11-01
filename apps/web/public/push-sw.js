// Web Push im Service Worker (per workbox importScripts eingebunden, siehe vite.config.ts).
// iOS verlangt zu jeder Push-Nachricht eine sichtbare Mitteilung – daher immer showNotification.
self.addEventListener('push', (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch {
    d = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(d.title || 'Haus', {
      body: d.body || '',
      tag: d.tag,
      renotify: !!d.tag,
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      lang: 'de-AT',
      data: { url: d.url || '#/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '#/', self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          if ('navigate' in c) c.navigate(url).catch(() => {});
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
