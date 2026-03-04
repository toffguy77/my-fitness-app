'use client'

import { useState } from 'react'
import { SocialAccountsForm } from '@/shared/components/settings'
import { SettingsPageLayout } from './SettingsPageLayout'

export function SettingsSocial() {
    return (
        <SettingsPageLayout title="Аккаунты социальных сетей">
            {({ profile, saveSettings }) => (
                <SocialForm profile={profile} onSave={saveSettings} />
            )}
        </SettingsPageLayout>
    )
}

function SocialForm({ profile, onSave }: {
    profile: { settings: { telegram_username: string; instagram_username: string } } | null;
    onSave: (settings: { telegram_username: string; instagram_username: string }) => Promise<void>;
}) {
    const [telegram, setTelegram] = useState(profile?.settings.telegram_username || '')
    const [instagram, setInstagram] = useState(profile?.settings.instagram_username || '')
    const [saving, setSaving] = useState(false)

    async function handleSave() {
        setSaving(true)
        try {
            await onSave({
                telegram_username: telegram,
                instagram_username: instagram,
            })
        } catch {
            // Error already shown via toast in useSettings
        } finally {
            setSaving(false)
        }
    }

    return (
        <>
            <SocialAccountsForm
                telegram={telegram}
                instagram={instagram}
                onTelegramChange={setTelegram}
                onInstagramChange={setInstagram}
            />

            <button
                onClick={handleSave}
                disabled={saving}
                className="mt-8 w-full rounded-lg bg-blue-600 py-3 text-white font-medium transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
                {saving ? 'Проверяем...' : 'Сохранить'}
            </button>
        </>
    )
}

SettingsSocial.displayName = 'SettingsSocial'
