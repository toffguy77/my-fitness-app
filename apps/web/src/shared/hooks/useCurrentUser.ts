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

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'

import { apiClient } from '@/shared/utils/api-client'
import { setUser as cacheUser, getUser as cachedUser, onSessionChange } from '@/shared/utils/token-storage'

export interface CurrentUser {
    id: string
    email: string
    name?: string
    full_name?: string
    role: string
    avatar_url?: string
    /**
     * Whether the account can sign in with a password. Absent from the token
     * itself — a password can be set after the token was issued — so
     * /api/v1/auth/me answers it with a lookup. The account-deletion form
     * uses it to decide what to ask for instead of a password.
     */
    has_password?: boolean
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

/** Hydration flag: false while React hydrates server HTML, true afterwards. */
const subscribeNothing = () => () => {}
const afterHydration = () => true
const duringHydration = () => false

/** What the server said, once it has said it. */
type Settled = { user: CurrentUser | null; state: Exclude<CurrentUserState, 'loading'> }

export function useCurrentUser(): { user: CurrentUser | null; state: CurrentUserState } {
    // The server has no localStorage, so it renders every screen as "loading".
    // Painting the cache in the very first client render made that render
    // differ from the server HTML — React threw hydration error #418 on every
    // signed-in page opened after the first one, and rebuilt the whole tree.
    // The cache is read only once hydration is over: the same frame for a
    // client-side navigation, one frame later for a full page load.
    const hydrated = useSyncExternalStore(subscribeNothing, afterHydration, duringHydration)
    const cached = useMemo(() => (hydrated ? readCachedUser() : null), [hydrated])
    const [settled, setSettled] = useState<Settled | null>(null)

    useEffect(() => {
        let cancelled = false

        const unsubscribe = onSessionChange((authenticated) => {
            if (!authenticated && !cancelled) setSettled({ user: null, state: 'anonymous' })
        })

        void fetchCurrentUser().then((fetched) => {
            if (cancelled) return
            if (fetched) {
                setSettled({ user: fetched, state: 'ready' })
                return
            }
            // No answer. If a cached profile is all we have, keep showing it
            // rather than blanking a screen over one failed request; the api
            // client signs somebody out whose session has genuinely ended.
            setSettled((previous) => {
                if (previous) return previous
                const fallback = readCachedUser()
                return fallback ? { user: fallback, state: 'ready' } : { user: null, state: 'anonymous' }
            })
        })

        return () => {
            cancelled = true
            unsubscribe()
        }
    }, [])

    if (settled) return settled
    return cached ? { user: cached, state: 'ready' } : { user: null, state: 'loading' }
}
