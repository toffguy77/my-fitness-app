/**
 * Push handling, imported into the generated service worker.
 *
 * It lives in its own file because next-pwa builds sw.js from workbox on every
 * build; anything written into that file would be overwritten. `importScripts`
 * in next.config.ts pulls this in.
 */

self.addEventListener('push', (event) => {
    if (!event.data) return

    let payload
    try {
        payload = event.data.json()
    } catch {
        // A push that is not ours, or a malformed one. Showing "undefined" to
        // somebody is worse than showing nothing.
        return
    }

    const title = payload.title || 'BURCEV'
    event.waitUntil(
        self.registration.showNotification(title, {
            body: payload.body || '',
            icon: '/icon.svg',
            badge: '/icon.svg',
            // Same notification, same tag: a browser that receives it twice
            // shows one banner rather than two.
            tag: payload.tag,
            data: { url: payload.url || '/' },
        })
    )
})

self.addEventListener('notificationclick', (event) => {
    event.notification.close()

    const target = (event.notification.data && event.notification.data.url) || '/'

    // Reuse a tab that is already open rather than piling up windows: somebody
    // who has the app open expects to be taken to the screen, not given a
    // second copy of the app.
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if ('focus' in client) {
                    if ('navigate' in client) {
                        return client.navigate(target).then((navigated) => navigated && navigated.focus())
                    }
                    return client.focus()
                }
            }
            return self.clients.openWindow(target)
        })
    )
})
