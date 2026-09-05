'use client'

/**
 * Which events reach a person outside the application, and when.
 *
 * The application column is shown and fixed: the notification list is the
 * record of what happened, not a way of interrupting anybody, and a switch that
 * could empty it would leave events with nowhere to go.
 */

import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'

import {
    getDeliveryPreferences,
    updateDeliveryPreferences,
    TYPE_LABELS,
    type DeliveryPreferences,
    type TypeSetting,
} from '../api/deliveryApi'

const HOURS = Array.from({ length: 24 }, (_, hour) => hour)

function hourLabel(hour: number): string {
    return `${String(hour).padStart(2, '0')}:00`
}

function Toggle({
    checked,
    disabled,
    label,
    onChange,
}: {
    checked: boolean
    disabled?: boolean
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
            className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
                checked ? 'bg-blue-600' : 'bg-gray-200'
            } ${disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
        >
            <span
                className={`pointer-events-none inline-block h-4 w-4 translate-y-1 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                    checked ? 'translate-x-6' : 'translate-x-1'
                }`}
            />
        </button>
    )
}

export function NotificationDeliverySettings() {
    const [prefs, setPrefs] = useState<DeliveryPreferences | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        getDeliveryPreferences()
            .then(setPrefs)
            .catch(() => toast.error('Не удалось загрузить настройки доставки'))
            .finally(() => setLoading(false))
    }, [])

    const save = useCallback(async (next: DeliveryPreferences) => {
        setPrefs(next)
        try {
            await updateDeliveryPreferences({
                types: next.types,
                quietHoursStart: next.quietHoursStart,
                quietHoursEnd: next.quietHoursEnd,
                emailUnsubscribed: next.emailUnsubscribed,
            })
        } catch {
            toast.error('Не удалось сохранить настройки доставки')
        }
    }, [])

    if (loading) {
        return (
            <div className="flex justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
            </div>
        )
    }

    if (!prefs) return null

    const setChannel = (type: string, channel: 'email' | 'push', enabled: boolean) => {
        void save({
            ...prefs,
            types: prefs.types.map((setting: TypeSetting) =>
                setting.type === type ? { ...setting, [channel]: enabled } : setting
            ),
        })
    }

    const setQuietHours = (start: number | null, end: number | null) => {
        // Both or neither: an interval with one end is not an interval.
        void save({ ...prefs, quietHoursStart: start, quietHoursEnd: end })
    }

    return (
        <div className="space-y-6" data-testid="delivery-settings">
            <div className="rounded-2xl bg-white p-4 shadow-sm">
                <p className="mb-1 text-sm font-medium text-gray-500">Письма</p>
                <div className="flex items-center justify-between py-3">
                    <div className="pr-4">
                        <p className="font-medium text-gray-900">Получать письма</p>
                        <p className="mt-0.5 text-sm text-gray-500">
                            Одно письмо обо всём, что вы не прочитали в приложении, — не по письму
                            на событие.
                        </p>
                    </div>
                    <Toggle
                        checked={!prefs.emailUnsubscribed}
                        label="Получать письма"
                        onChange={(enabled) => void save({ ...prefs, emailUnsubscribed: !enabled })}
                    />
                </div>
            </div>

            <div className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-500">Тихое время</p>
                    {prefs.quietHoursStart !== null && (
                        <button
                            type="button"
                            onClick={() => setQuietHours(null, null)}
                            className="text-sm text-gray-500 hover:text-gray-900"
                        >
                            Выключить
                        </button>
                    )}
                </div>
                <p className="mb-3 text-sm text-gray-500">
                    В эти часы письма не уходят — они ждут утра, а не пропадают. Время вашего
                    часового пояса ({prefs.timezone}).
                </p>
                <div className="flex items-center gap-3">
                    <label htmlFor="quiet-start" className="sr-only">
                        Начало тихого времени
                    </label>
                    <select
                        id="quiet-start"
                        value={prefs.quietHoursStart ?? 22}
                        onChange={(e) =>
                            setQuietHours(Number(e.target.value), prefs.quietHoursEnd ?? 8)
                        }
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                    >
                        {HOURS.map((hour) => (
                            <option key={hour} value={hour}>
                                {hourLabel(hour)}
                            </option>
                        ))}
                    </select>
                    <span className="text-sm text-gray-500">до</span>
                    <label htmlFor="quiet-end" className="sr-only">
                        Конец тихого времени
                    </label>
                    <select
                        id="quiet-end"
                        value={prefs.quietHoursEnd ?? 8}
                        onChange={(e) =>
                            setQuietHours(prefs.quietHoursStart ?? 22, Number(e.target.value))
                        }
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                    >
                        {HOURS.map((hour) => (
                            <option key={hour} value={hour}>
                                {hourLabel(hour)}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="rounded-2xl bg-white p-4 shadow-sm">
                <p className="mb-3 text-sm font-medium text-gray-500">О чём сообщать</p>
                <div className="mb-2 grid grid-cols-[1fr_auto_auto] items-center gap-x-4 text-xs text-gray-400">
                    <span />
                    <span className="w-11 text-center">Здесь</span>
                    <span className="w-11 text-center">Письмом</span>
                </div>
                {prefs.types.map((setting, index) => (
                    <div
                        key={setting.type}
                        className={`grid grid-cols-[1fr_auto_auto] items-center gap-x-4 py-3 ${
                            index < prefs.types.length - 1 ? 'border-b border-gray-100' : ''
                        }`}
                    >
                        <span className="text-gray-900">
                            {TYPE_LABELS[setting.type] ?? setting.type}
                        </span>
                        <Toggle
                            checked
                            disabled
                            label={`${TYPE_LABELS[setting.type] ?? setting.type} в приложении`}
                            onChange={() => {}}
                        />
                        <Toggle
                            checked={setting.email && !prefs.emailUnsubscribed}
                            disabled={prefs.emailUnsubscribed}
                            label={`${TYPE_LABELS[setting.type] ?? setting.type} письмом`}
                            onChange={(enabled) => setChannel(setting.type, 'email', enabled)}
                        />
                    </div>
                ))}
                <p className="mt-3 text-xs text-gray-400">
                    В приложении уведомление остаётся всегда — это список того, что произошло.
                </p>
            </div>
        </div>
    )
}

NotificationDeliverySettings.displayName = 'NotificationDeliverySettings'
