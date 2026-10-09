'use client'

import { SettingsPageLayout } from '@/features/settings/components/SettingsPageLayout'
import { SettingsPrivacy } from '@/features/settings/components/SettingsPrivacy'
import { t } from '@/shared/i18n'

/**
 * Экран стоял без каркаса: ни оболочки раздела, ни заголовка, ни пути назад —
 * единственный из настроек. Теперь он в той же раме, что и остальные.
 */
export default function SettingsPrivacyPage() {
    return (
        <SettingsPageLayout title={t('settings.titles.privacy')}>
            {() => <SettingsPrivacy />}
        </SettingsPageLayout>
    )
}
