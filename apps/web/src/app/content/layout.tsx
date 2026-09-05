'use client'

import { useMemo } from 'react'

import { DashboardLayout } from '@/features/dashboard/components/DashboardLayout'
import { useSession } from '@/shared/hooks/useSession'

export default function ContentLayout({ children }: { children: React.ReactNode }) {
    // Content is readable without an account; the difference is only whether it
    // is wrapped in the signed-in chrome. While the session is still being
    // restored the bare page is the safe answer — it is what a visitor sees,
    // and it does not flash navigation at somebody who has none.
    const session = useSession()

    const userName = useMemo(() => {
        if (typeof window === 'undefined') return ''
        try {
            const user = JSON.parse(localStorage.getItem('user') || '{}')
            return user.name || user.email || ''
        } catch {
            return ''
        }
    }, [])

    if (session !== 'authenticated') {
        return <>{children}</>
    }

    return (
        <DashboardLayout userName={userName} activeNavItem="content">
            {children}
        </DashboardLayout>
    )
}
