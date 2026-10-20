'use client'

import { AppleHealthStatus } from '@/shared/components/settings'
import { SettingsPageLayout } from './SettingsPageLayout'
import { t } from '@/shared/i18n'

/**
 * Состояние Apple Здоровья. Только чтение: признак apple_health_enabled
 * ставит и снимает приложение на iPhone (healthkit-sync).
 */
export function SettingsAppleHealth() {
    return (
        <SettingsPageLayout title={t('settings.appleHealth.title')}>
            {({ profile }) => (
                <AppleHealthStatus connected={profile?.settings.apple_health_enabled === true} />
            )}
        </SettingsPageLayout>
    )
}

SettingsAppleHealth.displayName = 'SettingsAppleHealth'
