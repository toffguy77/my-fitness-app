'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'

import { CuratorLayout } from '@/features/curator'
import { useCurrentUser } from '@/shared/hooks/useCurrentUser'

/**
 * Routes within the curator section that the backend also opens to
 * `super_admin` (RequireRole("coordinator", "super_admin") in
 * internal/router/leads.go and support.go). Everywhere else under
 * `/curator` — clients, analytics, content — stays coordinator-only on both
 * sides (RequireRole("coordinator") in internal/router/curator.go), so
 * widening this gate for the whole section would land a super-admin on a
 * screen the backend then answers with 403 on every request.
 */
const ADMIN_ACCESSIBLE_PREFIXES = ['/curator/leads', '/curator/support']

function isAdminAccessible(pathname: string | null): boolean {
    if (!pathname) return false
    return ADMIN_ACCESSIBLE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

/**
 * The curator section.
 *
 * The role comes from the session, not from localStorage. Reading it out of
 * the cache meant that a session established by cookie alone — no cache yet —
 * looked like "not signed in", and every curator was sent to the sign-in page or
 * to the client dashboard.
 */
export default function CuratorAppLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter()
    const pathname = usePathname()
    const { user, state } = useCurrentUser()

    const roleAllowed = !!user && (user.role === 'coordinator' || (user.role === 'super_admin' && isAdminAccessible(pathname)))

    useEffect(() => {
        if (state === 'loading') return
        if (!user) {
            router.push('/auth')
        } else if (!roleAllowed) {
            router.push('/dashboard')
        }
    }, [state, user, roleAllowed, router])

    // Nothing is rendered until it is known: showing the section to somebody
    // who turns out not to belong here, even for a frame, is worse than a
    // moment of blank.
    if (state === 'loading' || !roleAllowed) return null

    return (
        <CuratorLayout userName={user.full_name || user.name || ''} avatarUrl={user.avatar_url}>
            {children}
        </CuratorLayout>
    )
}
