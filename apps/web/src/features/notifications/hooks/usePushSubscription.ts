'use client'

/**
 * Subscribing this browser to push, and knowing whether it can be.
 *
 * The permission prompt is deliberately not fired from here on mount. A prompt
 * shown before somebody knows what the product does is the fastest way to a
 * permanent "no" — the browser remembers a refusal, and there is no second
 * chance to ask.
 */

import { useCallback, useEffect, useState } from 'react'

import { getPushKey, subscribeToPush, unsubscribeFromPush } from '../api/deliveryApi'

export type PushState =
    /** Still working out what this browser can do. */
    | 'unknown'
    /** This browser has no push at all, or the server has no keys. */
    | 'unsupported'
    /** Supported, not asked yet. */
    | 'available'
    /** Subscribed and working. */
    | 'subscribed'
    /** Refused. The browser will not ask again; only its settings can undo it. */
    | 'denied'
    /**
     * iOS shows push only to a site installed on the home screen. Asking in
     * Safari would fail with no explanation, so we explain instead.
     */
    | 'needs-install'

/** Turns the base64url VAPID key into the bytes the browser API wants. */
function keyToBytes(base64: string): Uint8Array<ArrayBuffer> {
    const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
        .replace(/-/g, '+')
        .replace(/_/g, '/')
    const raw = atob(padded)
    const bytes = new Uint8Array(new ArrayBuffer(raw.length))
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
    return bytes
}

/** Base64url, the shape the server stores subscription keys in. */
function bytesToKey(buffer: ArrayBuffer | null): string {
    if (!buffer) return ''
    return btoa(String.fromCharCode(...new Uint8Array(buffer)))
}

/** Whether this is an iOS browser outside an installed app. */
function needsHomeScreenInstall(): boolean {
    if (typeof navigator === 'undefined') return false
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    if (!iOS) return false
    const standalone =
        window.matchMedia?.('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true
    return !standalone
}

export function usePushSubscription() {
    const [state, setState] = useState<PushState>('unknown')
    const [busy, setBusy] = useState(false)

    useEffect(() => {
        let cancelled = false

        async function detect() {
            if (typeof window === 'undefined') return

            if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
                if (needsHomeScreenInstall()) {
                    if (!cancelled) setState('needs-install')
                    return
                }
                if (!cancelled) setState('unsupported')
                return
            }

            if (Notification.permission === 'denied') {
                if (!cancelled) setState('denied')
                return
            }

            try {
                const registration = await navigator.serviceWorker.ready
                const existing = await registration.pushManager.getSubscription()
                if (cancelled) return
                setState(existing ? 'subscribed' : 'available')
            } catch {
                if (!cancelled) setState('unsupported')
            }
        }

        void detect()
        return () => {
            cancelled = true
        }
    }, [])

    /** Asks for permission and registers this browser. Call it from a click. */
    const enable = useCallback(async (): Promise<boolean> => {
        setBusy(true)
        try {
            const permission = await Notification.requestPermission()
            if (permission !== 'granted') {
                setState(permission === 'denied' ? 'denied' : 'available')
                return false
            }

            const publicKey = await getPushKey()
            const registration = await navigator.serviceWorker.ready
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: keyToBytes(publicKey),
            })

            await subscribeToPush({
                endpoint: subscription.endpoint,
                p256dh: bytesToKey(subscription.getKey('p256dh')),
                auth: bytesToKey(subscription.getKey('auth')),
            })

            setState('subscribed')
            return true
        } catch {
            setState('available')
            return false
        } finally {
            setBusy(false)
        }
    }, [])

    const disable = useCallback(async (): Promise<void> => {
        setBusy(true)
        try {
            const registration = await navigator.serviceWorker.ready
            const subscription = await registration.pushManager.getSubscription()
            if (subscription) {
                // The server first: a browser that has forgotten its
                // subscription cannot tell us to stop addressing it.
                await unsubscribeFromPush(subscription.endpoint)
                await subscription.unsubscribe()
            }
            setState('available')
        } catch {
            // Leave the state alone: we no longer know what it is.
        } finally {
            setBusy(false)
        }
    }, [])

    return { state, busy, enable, disable }
}
