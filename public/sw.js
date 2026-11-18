// Orbit service worker: shows push notifications and focuses the app on tap.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let msg = { title: 'Orbit', body: '', data: {} };
  try { msg = event.data.json(); } catch {}
  const sos = msg.data && msg.data.type === 'sos';
  event.waitUntil(self.registration.showNotification(msg.title, {
    body: msg.body,
    data: msg.data,
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: sos ? 'sos-' + (msg.data.sos_id || '') : undefined,
    requireInteraction: sos,
    vibrate: sos ? [600, 250, 600, 250, 600] : undefined,
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (all.length) {
      all[0].postMessage({ type: 'orbit-tap', data });
      return all[0].focus();
    }
    return self.clients.openWindow(self.registration.scope);
  })());
});
