'use client'

import { useMemo } from 'react'
import { DashboardLayout } from '@/features/dashboard/components/DashboardLayout'

export default function NotificationsLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const userName = useMemo(() => {
        if (typeof window === 'undefined') return ''
        try {
            const user = JSON.parse(localStorage.getItem('user') || '{}')
            return user.name || user.email || ''
        } catch { return '' }
    }, [])

    return (
        <DashboardLayout userName={userName}>
            {children}
        </DashboardLayout>
    )
}
