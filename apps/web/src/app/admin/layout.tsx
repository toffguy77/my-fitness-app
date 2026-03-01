'use client'

import { useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { AdminLayout } from '@/features/admin'

function getStoredUser(): { full_name?: string; avatar_url?: string; role?: string } | null {
    if (typeof window === 'undefined') return null
    const stored = localStorage.getItem('user')
    if (!stored) return null
    try {
        return JSON.parse(stored)
    } catch {
        return null
    }
}

export default function AdminAppLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter()
    const user = useMemo(() => getStoredUser(), [])

    useEffect(() => {
        if (!user) {
            router.push('/auth')
        } else if (user.role !== 'super_admin') {
            router.push('/dashboard')
        }
    }, [user, router])

    if (!user || user.role !== 'super_admin') return null

    return (
        <AdminLayout userName={user.full_name || ''} avatarUrl={user.avatar_url}>
            {children}
        </AdminLayout>
    )
}
