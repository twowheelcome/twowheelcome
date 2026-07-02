/* twowheelcome web push service worker.
   Deliberately minimal: ONLY push + notificationclick. No `fetch` handler and no caching, so
   it can never serve stale assets or interfere with the app — it just enables web push. */

// Take control quickly so notificationclick can navigate already-open windows.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch (_e) { data = {} }
  const title = data.title || 'twowheelcome'
  const options = {
    body: data.body || '',
    icon: '/logo192.png',
    badge: '/logo192.png',
    tag: data.tag || undefined,
    data: { url: data.url || '/' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const rel = (event.notification.data && event.notification.data.url) || '/'
  // Absolute same-origin URL so navigate()/openWindow() resolve reliably.
  const target = new URL(rel, self.location.origin).href
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    // Reuse an existing app window: navigate it to the deep link, then focus.
    for (const c of wins) {
      if (c.url && new URL(c.url).origin === self.location.origin) {
        try { if ('navigate' in c) await c.navigate(target) } catch (_e) { /* not controlled yet */ }
        return c.focus()
      }
    }
    // No window open → open one at the deep link.
    if (self.clients.openWindow) return self.clients.openWindow(target)
  })())
})
