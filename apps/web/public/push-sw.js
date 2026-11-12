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

// Tippen: offenes Fenster → fokussieren und Ziel per Nachricht an die App (main.tsx); kein Fenster → öffnen.
// client.navigate() nur als zusätzlicher Versuch (iOS unzuverlässig, die App liest den Hash beim Start selbst).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '#/', self.registration.scope).href;
  event.waitUntil(
    (async () => {
      const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const c = list.find((w) => 'focus' in w);
      if (!c) return self.clients.openWindow(url);
      await c.focus();
      c.postMessage({ type: 'navigate', url });
      if ('navigate' in c) c.navigate(url).catch(() => {});
    })(),
  );
});
