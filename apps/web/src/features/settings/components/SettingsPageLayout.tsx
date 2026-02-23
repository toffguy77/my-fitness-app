'use client'

import { useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { DashboardLayout } from '@/features/dashboard/components/DashboardLayout'
import { useSettings } from '../hooks/useSettings'
import { ArrowLeft } from 'lucide-react'

interface SettingsPageLayoutProps {
    title: string
    children: (props: ReturnType<typeof useSettings>) => React.ReactNode
}

export function SettingsPageLayout({ title, children }: SettingsPageLayoutProps) {
    const router = useRouter()
    const settingsHook = useSettings()
    const { profile, isLoading } = settingsHook

    useEffect(() => {
        if (typeof window !== 'undefined' && !localStorage.getItem('auth_token')) {
            router.push('/auth')
        }
    }, [router])

    const userName = useMemo(() => {
        if (profile) {
            return profile.name || profile.email
        }
        if (typeof window !== 'undefined') {
            const userStr = localStorage.getItem('user')
            if (userStr) {
                try {
                    const user = JSON.parse(userStr)
                    return user.name || user.email || ''
                } catch { /* ignore */ }
            }
        }
        return ''
    }, [profile])

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
            </div>
        )
    }

    return (
        <DashboardLayout
            userName={userName}
            avatarUrl={profile?.avatar_url || undefined}
        >
            <div className="w-full max-w-md mx-auto px-4 py-6">
                {/* Back to profile */}
                <Link
                    href="/profile"
                    className="mb-6 inline-flex items-center gap-1 text-sm text-gray-500 transition-colors hover:text-gray-700"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Профиль
                </Link>

                {/* Page title */}
                <h1 className="mb-8 text-2xl font-bold text-gray-900">{title}</h1>

                {/* Page content */}
                {children(settingsHook)}
            </div>
        </DashboardLayout>
    )
}

SettingsPageLayout.displayName = 'SettingsPageLayout'
