'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CuratorLayout } from '@/features/curator'

export default function CuratorAppLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter()
    const [user, setUser] = useState<{ full_name?: string; avatar_url?: string; role?: string } | null>(null)
    const [checked, setChecked] = useState(false)

    useEffect(() => {
        const stored = localStorage.getItem('user')
        if (stored) {
            try {
                setUser(JSON.parse(stored))
            } catch {
                // invalid JSON
            }
        }
        setChecked(true)
    }, [])

    useEffect(() => {
        if (!checked) return
        if (!user) {
            router.push('/auth')
        } else if (user.role !== 'coordinator') {
            router.push('/dashboard')
        }
    }, [checked, user, router])

    if (!checked) return null

    if (!user || user.role !== 'coordinator') return null

    return (
        <CuratorLayout userName={user.full_name || ''} avatarUrl={user.avatar_url}>
            {children}
        </CuratorLayout>
    )
}
