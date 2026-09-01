'use client'

import { useSyncExternalStore } from 'react'

/**
 * Whether this browser holds a session, without an effect.
 *
 * The token lives in localStorage, which is an external store: reading it in an
 * effect and calling setState makes React render twice for something it could
 * have subscribed to. `null` means "not yet known" — on the server, and for the
 * hydrating render — so a screen that branches on it can render neither
 * alternative rather than flashing the wrong one.
 */
export function useSignedIn(): boolean | null {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

const TOKEN_KEY = 'auth_token'

function subscribe(onChange: () => void): () => void {
    // `storage` fires for other tabs; a sign-in or sign-out in this one
    // re-renders through the state that caused it.
    window.addEventListener('storage', onChange)
    return () => window.removeEventListener('storage', onChange)
}

function getSnapshot(): boolean {
    try {
        return Boolean(localStorage.getItem(TOKEN_KEY))
    } catch {
        // Private browsing can refuse storage entirely.
        return false
    }
}

function getServerSnapshot(): null {
    return null
}
