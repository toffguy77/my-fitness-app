'use client'

import { useSyncExternalStore } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { cn } from '@/shared/utils/cn'
import { t } from '@/shared/i18n'
import {
    readThemePreference,
    saveThemePreference,
    subscribeThemePreference,
    type ThemePreference,
} from '@/shared/theme/theme'

const OPTIONS: { value: ThemePreference; icon: typeof Sun; label: string }[] = [
    { value: 'system', icon: Monitor, label: 'settings.appearance.system' },
    { value: 'light', icon: Sun, label: 'settings.appearance.light' },
    { value: 'dark', icon: Moon, label: 'settings.appearance.dark' },
]

/**
 * Переключатель темы: как в системе, светлая, тёмная.
 *
 * Тема меняется сразу, без перезагрузки: атрибут на <html> переключает роли
 * дизайн-системы. Значение читается из cookie, а не из состояния компонента —
 * так переключатель согласован с тем, что отдал сервер.
 */
export function SettingsAppearance({ className }: { className?: string }) {
    const current = useSyncExternalStore(subscribeThemePreference, () => readThemePreference(), () => 'system' as const)

    return (
        <section className={cn('flex flex-col gap-3', className)} aria-labelledby="appearance-title">
            <h2 id="appearance-title" className="type-overline text-fg-subtle">{t('settings.appearance.title')}</h2>
            <div
                role="radiogroup"
                aria-label={t('settings.appearance.aria')}
                className="grid grid-cols-3 gap-1 rounded-full border border-line bg-surface p-1"
            >
                {OPTIONS.map(({ value, icon: Icon, label }) => {
                    const selected = current === value
                    return (
                        <button
                            key={value}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => saveThemePreference(value)}
                            className={cn(
                                'flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-full px-2 text-sm font-semibold transition-colors',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                                selected ? 'bg-fg text-fg-inverse' : 'text-fg-muted hover:text-fg',
                            )}
                        >
                            <Icon className="h-4 w-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
                            <span className="truncate">{t(label)}</span>
                        </button>
                    )
                })}
            </div>
            <p className="type-caption text-fg-subtle">{t('settings.appearance.hint')}</p>
        </section>
    )
}
