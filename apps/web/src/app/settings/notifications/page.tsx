'use client'

import { SettingsPageLayout } from '@/features/settings/components/SettingsPageLayout'
import { SettingsNotifications } from '@/features/settings/components/SettingsNotifications'
import { SettingsTelegram } from '@/features/settings/components/SettingsTelegram'
import { NotificationDeliverySettings } from '@/features/notifications/components/NotificationDeliverySettings'
import { t } from '@/shared/i18n'

export default function SettingsNotificationsPage() {
    return (
        <SettingsPageLayout title={t('settings.titles.notifications')}>
            {() => (
                <div className="flex flex-col gap-8">
                    <NotificationDeliverySettings />
                    <SettingsTelegram />
                    <SettingsNotifications />
                </div>
            )}
        </SettingsPageLayout>
    )
}
