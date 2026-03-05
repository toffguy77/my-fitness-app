'use client'

import { useState, useEffect, useCallback } from 'react'
import { CATEGORY_LABELS, type ContentCategory } from '@/features/content/types'
import {
    getNotificationPreferences,
    updateNotificationPreferences,
} from '@/features/notifications/api/preferencesApi'
import toast from 'react-hot-toast'

function Toggle({
    checked,
    disabled,
    onChange,
}: {
    checked: boolean
    disabled?: boolean
    onChange: (value: boolean) => void
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ${
                checked ? 'bg-blue-600' : 'bg-gray-200'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
            <span
                className={`pointer-events-none inline-block h-4 w-4 translate-y-1 rounded-full bg-white shadow-sm transition-transform duration-200 ${
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
            .catch(() => {
                toast.error('Не удалось загрузить настройки')
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
            } catch {
                toast.error('Не удалось сохранить настройки')
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
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
            </div>
        )
    }

    const categories = Object.entries(CATEGORY_LABELS) as [ContentCategory, string][]

    return (
        <div className="space-y-6">
            {/* Do Not Disturb */}
            <div className="bg-white rounded-2xl shadow-sm p-4">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-gray-900 font-medium">Не беспокоить</p>
                        <p className="text-sm text-gray-500 mt-0.5">
                            Отключить все уведомления о контенте
                        </p>
                    </div>
                    <Toggle checked={muted} onChange={handleMutedToggle} />
                </div>
            </div>

            {/* Category toggles */}
            <div className="bg-white rounded-2xl shadow-sm p-4">
                <p className="text-sm font-medium text-gray-500 mb-3">Категории</p>
                <div className="space-y-0">
                    {categories.map(([key, label], index) => (
                        <div
                            key={key}
                            className={`flex items-center justify-between py-3 ${
                                index < categories.length - 1 ? 'border-b border-gray-100' : ''
                            }`}
                        >
                            <span className={`text-gray-900 ${muted ? 'opacity-50' : ''}`}>
                                {label}
                            </span>
                            <Toggle
                                checked={!mutedCategories.has(key)}
                                disabled={muted}
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
