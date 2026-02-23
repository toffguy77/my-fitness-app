'use client'

import { useState, useEffect } from 'react'
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
    onSave: (settings: { telegram_username: string; instagram_username: string }) => void;
}) {
    const [telegram, setTelegram] = useState('')
    const [instagram, setInstagram] = useState('')

    useEffect(() => {
        if (profile) {
            setTelegram(profile.settings.telegram_username || '')
            setInstagram(profile.settings.instagram_username || '')
        }
    }, [profile])

    function handleSave() {
        onSave({
            telegram_username: telegram,
            instagram_username: instagram,
        })
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
                className="mt-8 w-full rounded-xl bg-violet-500 py-3 text-white transition-colors hover:bg-violet-600"
            >
                Сохранить
            </button>
        </>
    )
}

SettingsSocial.displayName = 'SettingsSocial'
