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

function Toggle({
    checked,
    disabled,
    label,
    onChange,
}: {
    checked: boolean
    disabled?: boolean
    /** What this switch is. A switch with no name is unusable by anyone
     *  reading the page with a screen reader — and unaddressable in a test. */
    label: string
    onChange: (value: boolean) => void
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ${
                checked ? 'bg-primary' : 'bg-subtle'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
            <span
                className={`pointer-events-none inline-block h-4 w-4 translate-y-1 rounded-full bg-surface shadow-sm transition-transform duration-200 ${
                    checked ? 'translate-x-6' : 'translate-x-1'
                }`}
            />
        </button>
    )
}

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
            <div className="flex justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
        )
    }

    const categories = Object.entries(CATEGORY_LABELS) as [ContentCategory, string][]

    return (
        <div className="space-y-6">
            {/* Do Not Disturb */}
            <div className="bg-surface rounded-2xl shadow-sm p-4">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-fg font-medium">{t('settings.notifications.doNotDisturb')}</p>
                        <p className="text-sm text-fg-muted mt-0.5">
                            {t('settings.notifications.doNotDisturbHint')}
                        </p>
                    </div>
                    <Toggle checked={muted} label={t('settings.notifications.doNotDisturb')} onChange={handleMutedToggle} />
                </div>
            </div>

            {/* Category toggles */}
            <div className="bg-surface rounded-2xl shadow-sm p-4">
                <p className="text-sm font-medium text-fg-muted mb-3">{t('settings.notifications.categories')}</p>
                <div className="space-y-0">
                    {categories.map(([key, label], index) => (
                        <div
                            key={key}
                            className={`flex items-center justify-between py-3 ${
                                index < categories.length - 1 ? 'border-b border-line' : ''
                            }`}
                        >
                            <span className={`text-fg ${muted ? 'opacity-50' : ''}`}>
                                {label}
                            </span>
                            <Toggle
                                checked={!mutedCategories.has(key)}
                                disabled={muted}
                                label={t('settings.notifications.categorySwitch', { category: label })}
                                onChange={(enabled) => handleCategoryToggle(key, enabled)}
                            />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

SettingsNotifications.displayName = 'SettingsNotifications'
