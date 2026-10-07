'use client'

import { useState, useEffect, useCallback } from 'react'
import { CATEGORY_LABELS, type ContentCategory } from '@/features/content/types'
import {
    getNotificationPreferences,
    updateNotificationPreferences,
} from '@/features/notifications/api/preferencesApi'
import toast from 'react-hot-toast'
import { t } from '@/shared/i18n'
import { messageForOr } from '@/shared/errors/apiErrors'
import { Switch } from '@/shared/components/settings/Switch'
import { SettingsCard, SettingsRow, SettingsSection } from './SettingsSection'

export function SettingsNotifications() {
    const [muted, setMuted] = useState(false)
    const [mutedCategories, setMutedCategories] = useState<Set<string>>(new Set())
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        getNotificationPreferences()
            .then((prefs) => {
                setMuted(prefs.muted)
                setMutedCategories(new Set(prefs.mutedCategories))
            })
            .catch((err) => {
                toast.error(messageForOr(err, t('settings.notifications.loadFailed')))
            })
            .finally(() => setLoading(false))
    }, [])

    const save = useCallback(
        async (newMuted: boolean, newMutedCategories: Set<string>) => {
            try {
                await updateNotificationPreferences({
                    muted: newMuted,
                    mutedCategories: Array.from(newMutedCategories),
                })
            } catch (err) {
                // Переключатель уже сдвинулся: если сервер отказал, человек
                // должен прочитать почему, иначе экран показывает состояние,
                // которого на сервере нет.
                toast.error(messageForOr(err, t('settings.notifications.saveFailed')))
            }
        },
        []
    )

    const handleMutedToggle = useCallback(
        (value: boolean) => {
            setMuted(value)
            void save(value, mutedCategories)
        },
        [mutedCategories, save]
    )

    const handleCategoryToggle = useCallback(
        (category: string, enabled: boolean) => {
            setMutedCategories((prev) => {
                const next = new Set(prev)
                if (enabled) {
                    next.delete(category)
                } else {
                    next.add(category)
                }
                void save(muted, next)
                return next
            })
        },
        [muted, save]
    )

    if (loading) {
        return (
            <div className="flex justify-center py-12" role="status">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-primary" aria-hidden="true" />
                <span className="sr-only">{t('settings.loading')}</span>
            </div>
        )
    }

    const categories = Object.entries(CATEGORY_LABELS) as [ContentCategory, string][]

    return (
        <div className="flex flex-col gap-6">
            {/* Do Not Disturb */}
            <SettingsCard>
                <SettingsRow>
                    <div className="min-w-0">
                        <p className="type-headline text-fg">{t('settings.notifications.doNotDisturb')}</p>
                        <p className="mt-0.5 text-sm text-fg-muted">
                            {t('settings.notifications.doNotDisturbHint')}
                        </p>
                    </div>
                    <Switch checked={muted} label={t('settings.notifications.doNotDisturb')} onChange={handleMutedToggle} />
                </SettingsRow>
            </SettingsCard>

            {/* Category toggles */}
            <SettingsSection title={t('settings.notifications.categories')}>
                <SettingsCard>
                    {categories.map(([key, label]) => (
                        <SettingsRow key={key}>
                            <span className={muted ? 'text-base text-fg-subtle' : 'text-base text-fg'}>
                                {label}
                            </span>
                            <Switch
                                checked={!mutedCategories.has(key)}
                                disabled={muted}
                                label={t('settings.notifications.categorySwitch', { category: label })}
                                onChange={(enabled) => handleCategoryToggle(key, enabled)}
                            />
                        </SettingsRow>
                    ))}
                </SettingsCard>
            </SettingsSection>
        </div>
    )
}

SettingsNotifications.displayName = 'SettingsNotifications'
