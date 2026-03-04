'use client'

import { AppleHealthToggle } from '@/shared/components/settings'
import { SettingsPageLayout } from './SettingsPageLayout'

export function SettingsAppleHealth() {
    return (
        <SettingsPageLayout title="Apple Health">
            {({ profile, saveSettings }) => (
                <AppleHealthToggle
                    enabled={profile?.settings.apple_health_enabled || false}
                    onChange={(enabled) => { saveSettings({ apple_health_enabled: enabled }).catch(() => {}) }}
                />
            )}
        </SettingsPageLayout>
    )
}

SettingsAppleHealth.displayName = 'SettingsAppleHealth'
