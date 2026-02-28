'use client'

import { useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { CuratorLayout } from '@/features/curator'

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

export default function CuratorAppLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter()
    const user = useMemo(() => getStoredUser(), [])

    useEffect(() => {
        if (!user) {
            router.push('/auth')
        } else if (user.role !== 'coordinator') {
            router.push('/dashboard')
        }
    }, [user, router])

    if (!user || user.role !== 'coordinator') return null

    return (
        <CuratorLayout userName={user.full_name || ''} avatarUrl={user.avatar_url}>
            {children}
        </CuratorLayout>
    )
}
