/**
 * Establishing a session, wherever it came from.
 *
 * A password login and a sign-in through an external provider must end in the
 * same state — same storage, same landing page — or the two paths drift and
 * only one of them gets fixed.
 */

import { apiClient } from '@/shared/utils/api-client'
import type { AuthResponse } from '@/features/auth/types'

export function storeSession(response: AuthResponse): void {
    apiClient.setToken(response.token)
    // The refresh token is not stored: the server set it as an HttpOnly cookie
    // in the same response, where no script can read it.
    if (typeof window !== 'undefined') {
        localStorage.setItem('user', JSON.stringify(response.user))
    }
}

/** Where a freshly signed-in user belongs. */
export function destinationFor(user: AuthResponse['user']): string {
    if (user.role === 'super_admin') return '/admin'
    if (user.role === 'coordinator') return '/curator'
    if (!user.email_verified) return '/auth/verify-email'
    if (!user.onboarding_completed) return '/onboarding'
    return '/dashboard'
}
