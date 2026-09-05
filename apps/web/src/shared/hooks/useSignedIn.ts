'use client'

import { useSession } from './useSession'

/**
 * Whether this browser holds a session, for a screen that has to choose
 * between two audiences.
 *
 * `null` means "not yet known" — during the server render, and while the
 * session is being minted from the cookie — so a screen that branches on it
 * can render neither alternative rather than flashing the wrong one. That
 * matters here: showing the guest wizard to somebody who has already
 * registered invites them to redo work they have done.
 *
 * It used to read `localStorage`, which was possible when the token lived
 * there. It does not any more.
 */
export function useSignedIn(): boolean | null {
    const session = useSession()
    if (session === 'restoring') return null
    return session === 'authenticated'
}
