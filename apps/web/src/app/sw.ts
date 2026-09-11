/// <reference lib="webworker" />

/**
 * The application's one service worker: caching and push in the same file.
 *
 * One, because a page can only be controlled by a single worker. Registering a
 * caching worker alongside the push worker at the same scope does not give two
 * workers — the second replaces the first, and push stops arriving with nothing
 * to show for it.
 *
 * This replaces next-pwa, which produced no worker at all here. It is a webpack
 * plugin, and this project builds with Turbopack, so its hook was never called;
 * building with `--webpack` to check made it run and then fail outright
 * ("assignWith is not defined" — the package is from 2022 and unmaintained).
 * The application had been calling itself installable and offline-capable the
 * whole time.
 */

import { defaultCache } from '@serwist/next/worker'
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { NetworkFirst, Serwist } from 'serwist'

declare global {
    interface WorkerGlobalScope extends SerwistGlobalConfig {
        __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
    }
}

declare const self: ServiceWorkerGlobalScope

// Экран «нет подключения» кэшируется вручную, а не предзагрузкой.
//
// Готовый механизм отката у Serwist ищет адрес именно в предзагрузке, а её
// преобразование путей для файла из public/ срезает расширение и оставляет
// несуществующий адрес. Откат ссылался бы на запись, которой нет: он был бы
// в коде и не срабатывал бы никогда — это и обнаружилось, когда кэш
// посмотрели в браузере, а не в сборке.
const OFFLINE_URL = '/offline.html'
const OFFLINE_CACHE = 'burcev-offline-v1'

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches
            .open(OFFLINE_CACHE)
            // cache: 'reload' — чтобы при обновлении воркера не подложился
            // старый экран из HTTP-кэша браузера.
            .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: 'reload' }))),
    )
})

const serveOfflinePage = {
    handlerDidError: async () => (await caches.open(OFFLINE_CACHE)).match(OFFLINE_URL),
}

const serwist = new Serwist({
    precacheEntries: self.__SW_MANIFEST,
    // Take over at once. The alternative — waiting for every tab to close —
    // leaves people on an old bundle for as long as they keep a tab open, and
    // server action ids do not survive a deploy.
    skipWaiting: true,
    clientsClaim: true,
    navigationPreload: true,
    runtimeCaching: [
        // Переходы — первым правилом, иначе их разберёт набор по умолчанию.
        //
        // Сначала сеть: страница всегда свежая, когда связь есть. Без связи
        // отдаётся последняя виденная, а если её нет — экран «нет
        // подключения» вместо страницы ошибки браузера. Именно на этом
        // держится очередь записей: приложение должно открываться без сети,
        // иначе записывать в очередь некуда.
        {
            matcher: ({ request }) => request.mode === 'navigate',
            handler: new NetworkFirst({
                cacheName: 'burcev-pages',
                plugins: [serveOfflinePage],
            }),
        },
        ...defaultCache,
    ],
})

serwist.addEventListeners()

// --- Push --------------------------------------------------------------------
//
// Moved here verbatim from public/push-sw.js, for the reason at the top: there
// can be only one worker.

self.addEventListener('push', (event: PushEvent) => {
    if (!event.data) return

    let payload: { title?: string; body?: string; tag?: string; url?: string }
    try {
        payload = event.data.json()
    } catch {
        // A push that is not ours, or a malformed one. Showing "undefined" to
        // somebody is worse than showing nothing.
        return
    }

    event.waitUntil(
        self.registration.showNotification(payload.title || 'BURCEV', {
            body: payload.body || '',
            icon: '/icon.svg',
            badge: '/icon.svg',
            // Same notification, same tag: a browser that receives it twice
            // shows one banner rather than two.
            tag: payload.tag,
            data: { url: payload.url || '/' },
        }),
    )
})

self.addEventListener('notificationclick', (event: NotificationEvent) => {
    event.notification.close()

    const target = (event.notification.data && event.notification.data.url) || '/'

    // Reuse a tab that is already open rather than piling up windows: somebody
    // who has the app open expects to be taken to the screen, not given a
    // second copy of the app.
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                // WindowClient always has both, but the typed union does not
                // narrow through an `in` check here; the cast keeps the runtime
                // guard and satisfies the compiler.
                const window = client as WindowClient
                return window.navigate(target).then((navigated) => navigated?.focus())
            }
            return self.clients.openWindow(target)
        }),
    )
})
