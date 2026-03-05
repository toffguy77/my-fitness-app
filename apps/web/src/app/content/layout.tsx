'use client'

import { useMemo } from 'react'
import { isAuthenticated } from '@/shared/utils/token-storage'
import { DashboardLayout } from '@/features/dashboard/components/DashboardLayout'

export default function ContentLayout({ children }: { children: React.ReactNode }) {
    const isAuthed = useMemo(() => {
        if (typeof window === 'undefined') return false
        return isAuthenticated()
    }, [])

    const userName = useMemo(() => {
        if (typeof window === 'undefined') return ''
        try {
            const user = JSON.parse(localStorage.getItem('user') || '{}')
            return user.name || user.email || ''
        } catch { return '' }
    }, [])

    if (!isAuthed) {
        return <>{children}</>
    }

    return (
        <DashboardLayout userName={userName} activeNavItem="content">
            {children}
        </DashboardLayout>
    )
}
