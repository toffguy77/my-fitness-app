'use client'

/**
 * Who is signed in, according to the server.
 *
 * The copy in localStorage is a cache for the first paint, not a credential
 * and not the authority on anything — least of all a role. A session
 * established by cookie alone has no cache: after signing in through an
 * external provider, on a device whose storage was cleared, or anywhere the
 * session outlives the storage. Screens that read the role out of that cache
 * sent curators and administrators to the client dashboard, and treated an
 * empty cache as "not signed in".
 *
 * So: the cache paints the first frame, the server settles it. One request per
 * page load, shared by every component that asks.
 */

import { useEffect, useState } from 'react'

import { apiClient } from '@/shared/utils/api-client'
import { setUser as cacheUser, getUser as cachedUser, onSessionChange } from '@/shared/utils/token-storage'

export interface CurrentUser {
    id: string
    email: string
    name?: string
    full_name?: string
    role: string
    avatar_url?: string
}

export type CurrentUserState = 'loading' | 'ready' | 'anonymous'

/** One request per page load, shared: four components must not ask four times. */
let inFlight: Promise<CurrentUser | null> | null = null

/** Reads the cached profile. Null on the server and when it is cold or corrupt. */
export function readCachedUser(): CurrentUser | null {
    const cached = cachedUser()
    if (!cached || typeof cached !== 'object' || !('role' in cached)) return null
    return cached as unknown as CurrentUser
}

/** Asks the server who this is, and refreshes the cache with the answer. */
export function fetchCurrentUser(): Promise<CurrentUser | null> {
    if (inFlight) return inFlight

    inFlight = apiClient
        .get<{ user: CurrentUser }>('/api/v1/auth/me')
        .then(({ user }) => {
            cacheUser(user)
            return user
        })
        .catch(() => null)
        .finally(() => {
            inFlight = null
        })

    return inFlight
}

/** Forgets the shared request. For tests, and after signing out. */
export function resetCurrentUser(): void {
    inFlight = null
}

export function useCurrentUser(): { user: CurrentUser | null; state: CurrentUserState } {
    const [user, setUser] = useState<CurrentUser | null>(() => readCachedUser())
    const [state, setState] = useState<CurrentUserState>(() =>
        readCachedUser() ? 'ready' : 'loading'
    )

    useEffect(() => {
        let cancelled = false

        const unsubscribe = onSessionChange((authenticated) => {
            if (!authenticated && !cancelled) {
                setUser(null)
                setState('anonymous')
            }
        })

        void fetchCurrentUser().then((fetched) => {
            if (cancelled) return
            if (fetched) {
                setUser(fetched)
                setState('ready')
                return
            }
            // No answer. If a cached profile is all we have, keep showing it
            // rather than blanking a screen over one failed request; the api
            // client signs somebody out whose session has genuinely ended.
            setState((previous) => (readCachedUser() ? 'ready' : previous === 'loading' ? 'anonymous' : previous))
        })

        return () => {
            cancelled = true
            unsubscribe()
        }
    }, [])

    return { user, state }
}
