'use client'

import { useEffect, useState, startTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CuratorLayout } from '@/features/curator'

type StoredUser = { full_name?: string; avatar_url?: string; role?: string }

export default function CuratorAppLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter()
    // undefined = not checked yet, null = checked but no user
    const [user, setUser] = useState<StoredUser | null | undefined>(undefined)

    useEffect(() => {
        let parsed: StoredUser | null = null
        const stored = localStorage.getItem('user')
        if (stored) {
            try {
                parsed = JSON.parse(stored)
            } catch {
                // invalid JSON
            }
        }
        if (!parsed) {
            router.push('/auth')
        } else if (parsed.role !== 'coordinator') {
            router.push('/dashboard')
        }
        startTransition(() => setUser(parsed))
    }, [router])

    if (user === undefined) return null

    if (!user || user.role !== 'coordinator') return null

    return (
        <CuratorLayout userName={user.full_name || ''} avatarUrl={user.avatar_url}>
            {children}
        </CuratorLayout>
    )
}
