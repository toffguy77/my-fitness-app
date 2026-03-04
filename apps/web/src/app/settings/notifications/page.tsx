import { SettingsPageLayout } from '@/features/settings/components/SettingsPageLayout'
import { SettingsNotifications } from '@/features/settings/components/SettingsNotifications'

export default function SettingsNotificationsPage() {
    return (
        <SettingsPageLayout title="Уведомления">
            {() => <SettingsNotifications />}
        </SettingsPageLayout>
    )
}
