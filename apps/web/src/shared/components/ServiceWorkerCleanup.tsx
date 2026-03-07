'use client'

import { useEffect } from 'react'

const SW_CLEANUP_KEY = 'sw-cleanup-v1'

/**
 * One-time nuclear cleanup: unregisters ALL service workers and purges
 * ALL caches, then reloads so next-pwa can install a fresh SW with
 * correct NetworkOnly rules for API routes.
 *
 * Uses a localStorage flag so it only runs once per browser profile.
 */
export function ServiceWorkerCleanup() {
    useEffect(() => {
        if (typeof window === 'undefined') return
        if (localStorage.getItem(SW_CLEANUP_KEY)) return

        const cleanup = async () => {
            let didWork = false

            // Unregister all service workers
            if ('serviceWorker' in navigator) {
                const registrations = await navigator.serviceWorker.getRegistrations()
                for (const reg of registrations) {
                    await reg.unregister()
                    didWork = true
                }
            }

            // Delete all caches
            if ('caches' in window) {
                const names = await caches.keys()
                for (const name of names) {
                    await caches.delete(name)
                    didWork = true
                }
            }

            localStorage.setItem(SW_CLEANUP_KEY, Date.now().toString())

            if (didWork) {
                console.log('[SW-Cleanup] Unregistered old SWs and purged caches, reloading...')
                window.location.reload()
            }
        }

        cleanup()
    }, [])

    return null
}
