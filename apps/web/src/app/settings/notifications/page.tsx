'use client'

import { SettingsPageLayout } from '@/features/settings/components/SettingsPageLayout'
import { SettingsNotifications } from '@/features/settings/components/SettingsNotifications'
import { NotificationDeliverySettings } from '@/features/notifications/components/NotificationDeliverySettings'
import { t } from '@/shared/i18n'

export default function SettingsNotificationsPage() {
    return (
        <SettingsPageLayout title={t('settings.titles.notifications')}>
            {() => (
                <div className="space-y-6">
                    <NotificationDeliverySettings />
                    <SettingsNotifications />
                </div>
            )}
        </SettingsPageLayout>
    )
}
