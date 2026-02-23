'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { SocialAccountsForm } from '@/shared/components/settings'
import { useSettings } from '../hooks/useSettings'

export function SettingsSocial() {
    const router = useRouter()
    const { profile, isLoading, saveSettings } = useSettings()

    const [telegram, setTelegram] = useState('')
    const [instagram, setInstagram] = useState('')

    useEffect(() => {
        if (typeof window !== 'undefined' && !localStorage.getItem('auth_token')) {
            router.push('/auth')
        }
    }, [router])

    useEffect(() => {
        if (profile) {
            setTelegram(profile.settings.telegram_username || '')
            setInstagram(profile.settings.instagram_username || '')
        }
    }, [profile])

    function handleSave() {
        saveSettings({
            telegram_username: telegram,
            instagram_username: instagram,
        })
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
                <h1 className="mb-8 text-2xl font-bold text-gray-900">Аккаунты социальных сетей</h1>

                {/* Social form */}
                <SocialAccountsForm
                    telegram={telegram}
                    instagram={instagram}
                    onTelegramChange={setTelegram}
                    onInstagramChange={setInstagram}
                />

                {/* Save button */}
                <button
                    onClick={handleSave}
                    className="mt-8 w-full rounded-xl bg-violet-500 py-3 text-white transition-colors hover:bg-violet-600"
                >
                    Сохранить
                </button>
            </div>
        </div>
    )
}

SettingsSocial.displayName = 'SettingsSocial'
