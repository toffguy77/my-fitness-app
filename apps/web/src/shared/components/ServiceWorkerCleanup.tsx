'use client'

import { useEffect } from 'react'

/**
 * Purges any Service Worker caches that contain API responses.
 * This runs once on app load to ensure stale cached API data
 * from older SW versions doesn't override fresh network responses.
 */
export function ServiceWorkerCleanup() {
    useEffect(() => {
        if (typeof window === 'undefined' || !('caches' in window)) return

        caches.keys().then((names) => {
            for (const name of names) {
                // Workbox runtime caches that may hold API responses
                if (name.includes('runtime') || name.includes('api')) {
                    caches.open(name).then((cache) => {
                        cache.keys().then((requests) => {
                            for (const req of requests) {
                                if (req.url.includes('/backend-api/')) {
                                    cache.delete(req)
                                }
                            }
                        })
                    })
                }
            }
        })
    }, [])

    return null
}
