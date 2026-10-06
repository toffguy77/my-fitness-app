'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LanguageSelector, UnitSelector, TimezoneSelector, PhotoUploader } from '@/shared/components/settings'
import { SettingsPageLayout } from './SettingsPageLayout'
import toast from 'react-hot-toast'
import { t } from '@/shared/i18n'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import { fieldLabelClass } from '@/shared/components/forms/fieldStyles'

export function SettingsLocality() {
    return (
        <SettingsPageLayout title={t('settings.titles.profile')}>
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
    onSaveSettings: (settings: Record<string, unknown>) => Promise<void>
    onAvatarUpload: (file: File) => Promise<string>
    onAvatarDelete: () => Promise<void>
}) {
    const router = useRouter()
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
            toast.error(t('settings.heightRange'))
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
        }).catch(() => {})
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
        }).catch(() => {})
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
        }).catch(() => {})
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
        }).catch(() => {})
    }



    return (
        <div className="flex flex-col gap-8">
            {/* Avatar */}
            <PhotoUploader
                avatarUrl={profile?.avatar_url || undefined}
                userName={profile?.name || profile?.email}
                onUpload={onAvatarUpload}
                onRemove={onAvatarDelete}
            />

            <div className="flex flex-col gap-6">
                {/* Name. Кнопка «Сохранить» появляется у поля, когда есть что
                    сохранять, — второстепенной: главного действия у экрана нет,
                    остальные настройки сохраняются сразу. */}
                <div>
                    <label htmlFor="settings-name" className={fieldLabelClass}>
                        {t('settings.locality.name')}
                    </label>
                    <div className="flex gap-2">
                        <Input
                            id="settings-name"
                            type="text"
                            autoComplete="name"
                            value={name}
                            onChange={(e) => handleNameChange(e.target.value)}
                            placeholder={t('settings.locality.namePlaceholder')}
                        />
                        {nameChanged && (
                            <Button type="button" variant="secondary" size="lg" onClick={handleSaveName}>
                                {t('settings.save')}
                            </Button>
                        )}
                    </div>
                </div>

                {/* Height */}
                <div>
                    <label htmlFor="settings-height" className={fieldLabelClass}>
                        {t('settings.locality.height')}
                    </label>
                    <div className="flex gap-2">
                        <Input
                            id="settings-height"
                            type="number"
                            inputMode="decimal"
                            value={height}
                            onChange={(e) => handleHeightChange(e.target.value)}
                            placeholder="175"
                            min={50}
                            max={300}
                            step={0.1}
                        />
                        {heightChanged && (
                            <Button type="button" variant="secondary" size="lg" onClick={handleSaveHeight}>
                                {t('settings.save')}
                            </Button>
                        )}
                    </div>
                </div>

                {/* Language & Units & Timezone */}
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

            {/* Data export and account deletion live on their own page: both
                need explanation and confirmation, not a one-line dialog. */}
            <Button
                type="button"
                variant="ghost"
                size="lg"
                block
                onClick={() => router.push('/settings/privacy')}
                className="text-danger-fg hover:bg-danger-soft"
            >
                {t('settings.locality.deleteAccount')}
            </Button>
        </div>
    )
}

SettingsLocality.displayName = 'SettingsLocality'
