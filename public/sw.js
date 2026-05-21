// Precache manifest (injected by VitePWA at build time)
self.__WB_MANIFEST

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', () => self.clients.claim())

self.addEventListener('push', (event) => {
  let data = { title: 'SY.CORE', body: '', icon: '/icons/pwa-192x192.png', badge: '/icons/pwa-192x192.png' }
  try {
    const payload = event.data?.json()
    if (payload) data = { ...data, ...payload }
  } catch {
    data.body = event.data?.text() || ''
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.badge,
      tag: data.tag || 'sy-core-push',
      renotify: true,
      vibrate: [200, 100, 200],
      ...(data.actions ? { actions: data.actions } : {}),
      ...(data.data ? { data: data.data } : {}),
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const urlToOpen = event.notification.data?.url || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      const existing = windowClients.find((c) => c.url === urlToOpen && 'focus' in c)
      return existing ? existing.focus() : clients.openWindow(urlToOpen)
    })
  )
})