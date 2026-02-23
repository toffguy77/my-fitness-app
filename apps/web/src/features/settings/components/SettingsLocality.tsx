'use client'

import { LanguageSelector, UnitSelector } from '@/shared/components/settings'
import { SettingsPageLayout } from './SettingsPageLayout'
import toast from 'react-hot-toast'

export function SettingsLocality() {
    return (
        <SettingsPageLayout title="Настройки профиля">
            {({ profile, saveSettings }) => {
                function handleLanguageChange(language: 'ru' | 'en') {
                    if (!profile) return
                    saveSettings({
                        language,
                        units: profile.settings.units,
                        telegram_username: profile.settings.telegram_username,
                        instagram_username: profile.settings.instagram_username,
                        apple_health_enabled: profile.settings.apple_health_enabled,
                    })
                }

                function handleUnitsChange(units: 'metric' | 'imperial') {
                    if (!profile) return
                    saveSettings({
                        language: profile.settings.language,
                        units,
                        telegram_username: profile.settings.telegram_username,
                        instagram_username: profile.settings.instagram_username,
                        apple_health_enabled: profile.settings.apple_health_enabled,
                    })
                }

                function handleDeleteAccount() {
                    if (window.confirm('Вы уверены?')) {
                        toast('Функция в разработке')
                    }
                }

                return (
                    <>
                        <div className="flex flex-col gap-8">
                            <LanguageSelector
                                value={(profile?.settings.language as 'ru' | 'en') || 'ru'}
                                onChange={handleLanguageChange}
                            />
                            <UnitSelector
                                value={(profile?.settings.units as 'metric' | 'imperial') || 'metric'}
                                onChange={handleUnitsChange}
                            />
                        </div>

                        <div className="mt-12">
                            <button
                                onClick={handleDeleteAccount}
                                className="text-sm text-red-500 transition-colors hover:text-red-600"
                            >
                                Удалить аккаунт
                            </button>
                        </div>
                    </>
                )
            }}
        </SettingsPageLayout>
    )
}

SettingsLocality.displayName = 'SettingsLocality'
