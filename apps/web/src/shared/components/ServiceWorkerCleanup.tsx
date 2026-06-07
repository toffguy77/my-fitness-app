'use client'

import { useEffect } from 'react'

const SW_CLEANUP_KEY = 'sw-cleanup-v3'

export function ServiceWorkerCleanup() {
    useEffect(() => {
        if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

        // When next-pwa's skipWaiting:true activates a new SW while the old
        // page is still open, the browser fires 'controllerchange'. At that
        // point the old JS bundles (with old server-action IDs) are stale, so
        // we reload immediately to pick up fresh chunks from the new SW.
        // existingController guard prevents a reload on the very first install
        // (no previous controller → not an update, just initial activation).
        const existingController = navigator.serviceWorker.controller
        let reloading = false
        const handleControllerChange = () => {
            if (existingController && !reloading) {
                reloading = true
                window.location.reload()
            }
        }
        navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange)

        // One-time nuclear cleanup: purge stale caches from old next-pwa
        // installations. Runs once per browser profile, then sets a flag.
        if (!localStorage.getItem(SW_CLEANUP_KEY)) {
            const cleanup = async () => {
                let didWork = false

                const registrations = await navigator.serviceWorker.getRegistrations()
                for (const reg of registrations) {
                    await reg.unregister()
                    didWork = true
                }

                if ('caches' in window) {
                    const names = await caches.keys()
                    for (const name of names) {
                        await caches.delete(name)
                        didWork = true
                    }
                }

                localStorage.setItem(SW_CLEANUP_KEY, Date.now().toString())

                if (didWork) {
                    window.location.reload()
                }
            }
            cleanup()
        }

        return () => {
            navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange)
        }
    }, [])

    return null
}
