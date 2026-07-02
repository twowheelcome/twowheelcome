/* twowheelcome web push service worker.
   Deliberately minimal: ONLY push + notificationclick. No `fetch` handler and no caching, so
   it can never serve stale assets or interfere with the app — it just enables web push. */

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
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of wins) {
      if ('focus' in c) {
        try { if ('navigate' in c) await c.navigate(url) } catch (_e) { /* cross-origin/no-op */ }
        return c.focus()
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(url)
  })())
})
