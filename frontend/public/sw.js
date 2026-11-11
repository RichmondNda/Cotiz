// Service worker de Cotiz (lot 4.2) : notifications Web Push seulement, aucun cache hors ligne.
// Le message arrive chiffré du worker (canal push) : { title, body, url, tag }. Clic : ouvre l'écran d'action dans un
// onglet Cotiz déjà ouvert s'il y en a un, sinon dans un nouvel onglet. Aucune donnée n'est gardée ici.

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let message = {}
  try {
    message = event.data ? event.data.json() : {}
  }
  catch {
    message = {}
  }
  const titre = typeof message.title === 'string' && message.title ? message.title : 'Cotiz'
  // Seule une route de Cotiz est ouverte au clic (même origine).
  const url = typeof message.url === 'string' && message.url.startsWith('/') && !message.url.startsWith('//') ? message.url : '/'
  event.waitUntil(
    self.registration.showNotification(titre, {
      body: typeof message.body === 'string' ? message.body : '',
      tag: typeof message.tag === 'string' ? message.tag : undefined,
      icon: '/cotiz-mark.svg',
      badge: '/cotiz-mark.svg',
      lang: 'fr',
      data: { url },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const cible = new URL(event.notification.data?.url ?? '/', self.location.origin).href
  event.waitUntil((async () => {
    const onglets = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const onglet of onglets) {
      if (new URL(onglet.url).origin === self.location.origin && 'focus' in onglet) {
        await onglet.focus()
        if ('navigate' in onglet) await onglet.navigate(cible)
        return
      }
    }
    await self.clients.openWindow(cible)
  })())
})
