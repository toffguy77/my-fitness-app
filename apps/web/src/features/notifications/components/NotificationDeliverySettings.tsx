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

import { PushSection } from './PushSection'
import {
    getDeliveryPreferences,
    updateDeliveryPreferences,
    TYPE_LABELS,
    type DeliveryPreferences,
    type TypeSetting,
} from '../api/deliveryApi'

import { t } from '@/shared/i18n'
import { Button } from '@/shared/components/ui/Button'
// Тот же переключатель, что во всех настройках: своя копия здесь расходилась
// с ним дорожкой, размером и цветом выключенного состояния.
import { Switch } from '@/shared/components/settings/Switch'
import { messageForOr } from '@/shared/errors/apiErrors'
const HOURS = Array.from({ length: 24 }, (_, hour) => hour)

function hourLabel(hour: number): string {
    return `${String(hour).padStart(2, '0')}:00`
}

export function NotificationDeliverySettings() {
    const [prefs, setPrefs] = useState<DeliveryPreferences | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        getDeliveryPreferences()
            .then(setPrefs)
            .catch((err) => toast.error(messageForOr(err, t('notifications.delivery.loadFailed'))))
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
        } catch (err) {
            // Переключатель уже сдвинулся (setPrefs выше): без причины экран
            // показывает состояние, которого на сервере нет.
            toast.error(messageForOr(err, t('notifications.delivery.saveFailed')))
        }
    }, [])

    if (loading) {
        return (
            <div className="flex justify-center py-12">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-primary" />
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
            <PushSection />

            <div className="rounded-card border border-line bg-surface p-5">
                <h2 className="mb-1 type-title-3 text-fg">{t('notifications.delivery.emailsHeading')}</h2>
                <div className="flex items-center justify-between py-3">
                    <div className="pr-4">
                        <p className="type-headline text-fg">{t('notifications.delivery.receiveEmails')}</p>
                        <p className="mt-0.5 text-sm text-fg-muted">
                            {t('notifications.delivery.emailsExplanation')}
                        </p>
                    </div>
                    <Switch
                        checked={!prefs.emailUnsubscribed}
                        label={t('notifications.delivery.receiveEmails')}
                        onChange={(enabled) => void save({ ...prefs, emailUnsubscribed: !enabled })}
                    />
                </div>
            </div>

            <div className="rounded-card border border-line bg-surface p-5">
                <div className="mb-3 flex items-center justify-between">
                    <h2 className="type-title-3 text-fg">{t('notifications.delivery.quietHeading')}</h2>
                    {prefs.quietHoursStart !== null && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setQuietHours(null, null)}
                            className="-mr-3 min-h-11 text-fg-muted"
                        >
                            {t('notifications.delivery.disable')}
                        </Button>
                    )}
                </div>
                <p className="mb-3 text-sm text-fg-muted">
                    {t('notifications.delivery.quietExplanation', { timezone: prefs.timezone })}
                </p>
                <div className="flex items-center gap-3">
                    <label htmlFor="quiet-start" className="sr-only">
                        {t('notifications.delivery.quietStart')}
                    </label>
                    <select
                        id="quiet-start"
                        value={prefs.quietHoursStart ?? 22}
                        onChange={(e) =>
                            setQuietHours(Number(e.target.value), prefs.quietHoursEnd ?? 8)
                        }
                        className="h-12 rounded-field border border-line bg-surface px-3 text-base text-fg tabular-nums focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-focus/30"
                    >
                        {HOURS.map((hour) => (
                            <option key={hour} value={hour}>
                                {hourLabel(hour)}
                            </option>
                        ))}
                    </select>
                    <span className="text-sm text-fg-muted">{t('notifications.delivery.until')}</span>
                    <label htmlFor="quiet-end" className="sr-only">
                        {t('notifications.delivery.quietEnd')}
                    </label>
                    <select
                        id="quiet-end"
                        value={prefs.quietHoursEnd ?? 8}
                        onChange={(e) =>
                            setQuietHours(prefs.quietHoursStart ?? 22, Number(e.target.value))
                        }
                        className="h-12 rounded-field border border-line bg-surface px-3 text-base text-fg tabular-nums focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-focus/30"
                    >
                        {HOURS.map((hour) => (
                            <option key={hour} value={hour}>
                                {hourLabel(hour)}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="rounded-card border border-line bg-surface p-5">
                <h2 className="mb-3 type-title-3 text-fg">{t('notifications.delivery.whatHeading')}</h2>
                <div className="mb-2 grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-4 text-xs font-medium text-fg-subtle">
                    <span />
                    <span className="w-12 text-center">{t('notifications.delivery.columnHere')}</span>
                    <span className="w-12 text-center">{t('notifications.delivery.columnEmail')}</span>
                    <span className="w-12 text-center">Push</span>
                </div>
                {prefs.types.map((setting, index) => (
                    <div
                        key={setting.type}
                        className={`grid min-h-14 grid-cols-[1fr_auto_auto_auto] items-center gap-x-4 py-3 ${
                            index < prefs.types.length - 1 ? 'border-b border-line' : ''
                        }`}
                    >
                        <span className="text-fg">
                            {TYPE_LABELS[setting.type] ?? setting.type}
                        </span>
                        <Switch
                            checked
                            disabled
                            label={t('notifications.delivery.inAppLabel', { type: TYPE_LABELS[setting.type] ?? setting.type })}
                            onChange={() => {}}
                        />
                        <Switch
                            checked={setting.email && !prefs.emailUnsubscribed}
                            disabled={prefs.emailUnsubscribed}
                            label={t('notifications.delivery.emailLabel', { type: TYPE_LABELS[setting.type] ?? setting.type })}
                            onChange={(enabled) => setChannel(setting.type, 'email', enabled)}
                        />
                        <Switch
                            checked={setting.push}
                            label={t('notifications.delivery.pushLabel', { type: TYPE_LABELS[setting.type] ?? setting.type })}
                            onChange={(enabled) => setChannel(setting.type, 'push', enabled)}
                        />
                    </div>
                ))}
                <p className="mt-3 text-xs text-fg-subtle">
                    {t('notifications.delivery.inAppNote')}
                </p>
            </div>
        </div>
    )
}

NotificationDeliverySettings.displayName = 'NotificationDeliverySettings'
