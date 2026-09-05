'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

import { AdminLayout } from '@/features/admin'
import { useCurrentUser } from '@/shared/hooks/useCurrentUser'

/**
 * The administrative section.
 *
 * The role comes from the session, not from localStorage. Reading it out of
 * the cache meant that a session established by cookie alone — no cache yet —
 * looked like "not signed in", and every administrator was sent to the sign-in
 * page or to the client dashboard.
 */
export default function AdminAppLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter()
    const { user, state } = useCurrentUser()

    useEffect(() => {
        if (state === 'loading') return
        if (!user) {
            router.push('/auth')
        } else if (user.role !== 'super_admin') {
            router.push('/dashboard')
        }
    }, [state, user, router])

    // Nothing is rendered until it is known: showing the section to somebody
    // who turns out not to belong here, even for a frame, is worse than a
    // moment of blank.
    if (state === 'loading' || user?.role !== 'super_admin') return null

    return (
        <AdminLayout userName={user.full_name || user.name || ''} avatarUrl={user.avatar_url}>
            {children}
        </AdminLayout>
    )
}
