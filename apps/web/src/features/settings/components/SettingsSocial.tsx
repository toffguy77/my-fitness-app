'use client'

import { useState } from 'react'
import { SocialAccountsForm } from '@/shared/components/settings'
import { SettingsPageLayout } from './SettingsPageLayout'
import { t } from '@/shared/i18n'
import { Button } from '@/shared/components/ui/Button'

export function SettingsSocial() {
    return (
        <SettingsPageLayout title={t('settings.titles.social')}>
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
            // Молчим намеренно: onSave — это saveSettings из useSettings, он уже
            // показал причину отказа и пробросил ошибку только для того, чтобы
            // здесь сняли состояние «сохраняем». Второй тост повторил бы ту же
            // фразу.
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="flex flex-col gap-8">
            <SocialAccountsForm
                telegram={telegram}
                instagram={instagram}
                onTelegramChange={setTelegram}
                onInstagramChange={setInstagram}
            />

            <Button type="button" size="lg" block onClick={handleSave} disabled={saving}>
                {saving ? t('settings.checking') : t('settings.save')}
            </Button>
        </div>
    )
}

SettingsSocial.displayName = 'SettingsSocial'
