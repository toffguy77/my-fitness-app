'use client'

/**
 * Whether this browser has a session, and getting one back after a reload.
 *
 * The access token lives in memory and does not survive a reload; the refresh
 * token lives in a cookie script cannot read. So a freshly loaded page knows
 * nothing until it asks the server — which is what `restoreSession` does, once
 * per page load, shared by every component that needs the answer.
 *
 * This is why a page must not decide "no token, therefore signed out" any
 * more. It would be right for a quarter of a second and wrong for everybody.
 */

import { useEffect, useState } from 'react'

import { apiClient } from '@/shared/utils/api-client'
import { getToken, setToken, isAuthenticated, onSessionChange } from '@/shared/utils/token-storage'

export type SessionState = 'restoring' | 'authenticated' | 'anonymous'

/** One attempt per page load, shared: ten components must not ask ten times. */
let restoring: Promise<boolean> | null = null

/**
 * Mints an access token from whatever the browser holds.
 *
 * Resolves to false when there is no session — which is an ordinary answer
 * here, not a failure: most visitors to the sign-in page have none.
 */
export function restoreSession(): Promise<boolean> {
    if (getToken()) return Promise.resolve(true)
    if (restoring) return restoring

    restoring = apiClient
        .refreshSession()
        .then((token) => {
            setToken(token)
            return true
        })
        .catch(() => false)
        .finally(() => {
            // Cleared so a later sign-in is not answered from this attempt.
            restoring = null
        })

    return restoring
}

/** Forgets the in-flight attempt. For tests, and for signing out. */
export function resetSessionRestore(): void {
    restoring = null
}

/**
 * The session as this component should see it.
 *
 * `restoring` is a real state and has to be rendered as one — usually as the
 * screen's own loading state. Treating it as "anonymous" produces a redirect
 * to the sign-in page that undoes itself a moment later.
 */
export function useSession(): SessionState {
    const [state, setState] = useState<SessionState>(() =>
        isAuthenticated() ? 'authenticated' : 'restoring'
    )

    useEffect(() => {
        let cancelled = false
        const unsubscribe = onSessionChange((authenticated) => {
            if (!cancelled) setState(authenticated ? 'authenticated' : 'anonymous')
        })

        void restoreSession().then((ok) => {
            if (!cancelled) setState(ok ? 'authenticated' : 'anonymous')
        })

        return () => {
            cancelled = true
            unsubscribe()
        }
    }, [])

    return state
}
