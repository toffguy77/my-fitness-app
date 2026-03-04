'use client'

import { AuthGuard } from '@/shared/components/AuthGuard'

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return <AuthGuard>{children}</AuthGuard>
}
