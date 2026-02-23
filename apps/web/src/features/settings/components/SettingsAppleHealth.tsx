'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AppleHealthToggle } from '@/shared/components/settings'
import { useSettings } from '../hooks/useSettings'

export function SettingsAppleHealth() {
    const router = useRouter()
    const { profile, isLoading, saveSettings } = useSettings()

    useEffect(() => {
        if (typeof window !== 'undefined' && !localStorage.getItem('auth_token')) {
            router.push('/auth')
        }
    }, [router])

    function handleToggle(enabled: boolean) {
        saveSettings({ apple_health_enabled: enabled })
    }

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gray-50">
                <div className="mx-auto max-w-md px-4 pb-8 pt-12">
                    <div className="flex items-center justify-center py-20">
                        <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-500 border-t-transparent" />
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="mx-auto max-w-md px-4 pb-8 pt-12">
                {/* Back button */}
                <button
                    onClick={() => router.back()}
                    className="mb-6 flex items-center gap-1 text-sm text-gray-600"
                >
                    <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                    </svg>
                    Назад
                </button>

                {/* Header */}
                <h1 className="mb-8 text-2xl font-bold text-gray-900">Apple Health</h1>

                {/* Apple Health toggle */}
                <AppleHealthToggle
                    enabled={profile?.settings.apple_health_enabled || false}
                    onChange={handleToggle}
                />
            </div>
        </div>
    )
}

SettingsAppleHealth.displayName = 'SettingsAppleHealth'
