'use client'

import { useEffect, useState } from 'react'
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
    const [userName, setUserName] = useState('')

    useEffect(() => {
        if (typeof window !== 'undefined' && !localStorage.getItem('auth_token')) {
            router.push('/auth')
        }
    }, [router])

    useEffect(() => {
        if (profile) {
            setUserName(profile.name || profile.email)
        } else {
            const userStr = typeof window !== 'undefined' ? localStorage.getItem('user') : null
            if (userStr) {
                try {
                    const user = JSON.parse(userStr)
                    setUserName(user.name || user.email || '')
                } catch {}
            }
        }
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
