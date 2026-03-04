'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LanguageSelector, UnitSelector, TimezoneSelector, PhotoUploader } from '@/shared/components/settings'
import { SettingsPageLayout } from './SettingsPageLayout'
import { clearAuth } from '@/shared/utils/token-storage'
import toast from 'react-hot-toast'

export function SettingsLocality() {
    return (
        <SettingsPageLayout title="Настройки профиля">
            {({ profile, saveName, saveSettings, handleAvatarUpload, handleAvatarDelete }) => (
                <ProfileSettingsForm
                    profile={profile}
                    onSaveName={saveName}
                    onSaveSettings={saveSettings}
                    onAvatarUpload={handleAvatarUpload}
                    onAvatarDelete={handleAvatarDelete}
                />
            )}
        </SettingsPageLayout>
    )
}

function ProfileSettingsForm({
    profile,
    onSaveName,
    onSaveSettings,
    onAvatarUpload,
    onAvatarDelete,
}: {
    profile: { name: string; email: string; avatar_url: string; settings: { language: string; units: string; timezone: string; telegram_username: string; instagram_username: string; apple_health_enabled: boolean; height?: number | null } } | null
    onSaveName: (name: string) => void
    onSaveSettings: (settings: Record<string, unknown>) => void
    onAvatarUpload: (file: File) => Promise<string>
    onAvatarDelete: () => Promise<void>
}) {
    const [name, setName] = useState(profile?.name || '')
    const [nameChanged, setNameChanged] = useState(false)
    const [height, setHeight] = useState<string>(profile?.settings.height != null ? String(profile.settings.height) : '')
    const [heightChanged, setHeightChanged] = useState(false)

    function handleNameChange(value: string) {
        setName(value)
        setNameChanged(value !== (profile?.name || ''))
    }

    function handleSaveName() {
        if (!nameChanged) return
        onSaveName(name)
        setNameChanged(false)
    }

    function handleHeightChange(value: string) {
        setHeight(value)
        const original = profile?.settings.height != null ? String(profile.settings.height) : ''
        setHeightChanged(value !== original)
    }

    function handleSaveHeight() {
        if (!heightChanged || !profile) return
        const parsed = height === '' ? null : parseFloat(height)
        if (parsed !== null && (isNaN(parsed) || parsed < 50 || parsed > 300)) {
            toast.error('Рост должен быть от 50 до 300 см')
            return
        }
        onSaveSettings({
            language: profile.settings.language,
            units: profile.settings.units,
            timezone: profile.settings.timezone,
            telegram_username: profile.settings.telegram_username,
            instagram_username: profile.settings.instagram_username,
            apple_health_enabled: profile.settings.apple_health_enabled,
            height: parsed,
        })
        setHeightChanged(false)
    }

    function handleLanguageChange(language: 'ru' | 'en') {
        if (!profile) return
        onSaveSettings({
            language,
            units: profile.settings.units,
            timezone: profile.settings.timezone,
            telegram_username: profile.settings.telegram_username,
            instagram_username: profile.settings.instagram_username,
            apple_health_enabled: profile.settings.apple_health_enabled,
        })
    }

    function handleUnitsChange(units: 'metric' | 'imperial') {
        if (!profile) return
        onSaveSettings({
            language: profile.settings.language,
            units,
            timezone: profile.settings.timezone,
            telegram_username: profile.settings.telegram_username,
            instagram_username: profile.settings.instagram_username,
            apple_health_enabled: profile.settings.apple_health_enabled,
        })
    }

    function handleTimezoneChange(timezone: string) {
        if (!profile) return
        onSaveSettings({
            language: profile.settings.language,
            units: profile.settings.units,
            timezone,
            telegram_username: profile.settings.telegram_username,
            instagram_username: profile.settings.instagram_username,
            apple_health_enabled: profile.settings.apple_health_enabled,
        })
    }

    const router = useRouter()

    function handleLogout() {
        clearAuth()
        router.push('/auth')
    }

    function handleDeleteAccount() {
        if (window.confirm('Вы уверены?')) {
            toast('Функция в разработке')
        }
    }

    return (
        <>
            {/* Avatar */}
            <div className="mb-8">
                <PhotoUploader
                    avatarUrl={profile?.avatar_url || undefined}
                    userName={profile?.name || profile?.email}
                    onUpload={onAvatarUpload}
                    onRemove={onAvatarDelete}
                />
            </div>

            {/* Name */}
            <div className="mb-8">
                <h3 className="mb-3 text-sm font-bold text-gray-900">Имя</h3>
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => handleNameChange(e.target.value)}
                        placeholder="Ваше имя"
                        className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
                    />
                    {nameChanged && (
                        <button
                            onClick={handleSaveName}
                            className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                        >
                            Сохранить
                        </button>
                    )}
                </div>
            </div>

            {/* Height */}
            <div className="mb-8">
                <h3 className="mb-3 text-sm font-bold text-gray-900">Рост (см)</h3>
                <div className="flex gap-2">
                    <input
                        type="number"
                        value={height}
                        onChange={(e) => handleHeightChange(e.target.value)}
                        placeholder="175"
                        min={50}
                        max={300}
                        step={0.1}
                        className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
                    />
                    {heightChanged && (
                        <button
                            onClick={handleSaveHeight}
                            className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                        >
                            Сохранить
                        </button>
                    )}
                </div>
            </div>

            {/* Language & Units & Timezone */}
            <div className="flex flex-col gap-8">
                <LanguageSelector
                    value={(profile?.settings.language as 'ru' | 'en') || 'ru'}
                    onChange={handleLanguageChange}
                />
                <UnitSelector
                    value={(profile?.settings.units as 'metric' | 'imperial') || 'metric'}
                    onChange={handleUnitsChange}
                />
                <TimezoneSelector
                    value={profile?.settings.timezone || 'Europe/Moscow'}
                    onChange={handleTimezoneChange}
                />
            </div>

            {/* Account actions */}
            <div className="mt-12 space-y-3">
                <button
                    onClick={handleLogout}
                    className="w-full rounded-lg border border-gray-300 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                    Выйти из аккаунта
                </button>
                <button
                    onClick={handleDeleteAccount}
                    className="w-full rounded-lg border border-red-200 py-3 text-sm font-medium text-red-500 transition-colors hover:bg-red-50"
                >
                    Удалить аккаунт
                </button>
            </div>
        </>
    )
}

SettingsLocality.displayName = 'SettingsLocality'
