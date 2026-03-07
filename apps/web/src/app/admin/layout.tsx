'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AdminLayout } from '@/features/admin'

export default function AdminAppLayout({ children }: { children: React.ReactNode }) {
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
        } else if (user.role !== 'super_admin') {
            router.push('/dashboard')
        }
    }, [checked, user, router])

    if (!checked) return null

    if (!user || user.role !== 'super_admin') return null

    return (
        <AdminLayout userName={user.full_name || ''} avatarUrl={user.avatar_url}>
            {children}
        </AdminLayout>
    )
}
