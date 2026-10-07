'use client'

import { useSyncExternalStore } from 'react'
import { cn } from '@/shared/utils/cn'
import { t } from '@/shared/i18n'

export interface DashboardGreetingProps {
    /** Полное имя или почта — в приветствии только первое слово имени. */
    name?: string
    className?: string
}

type Part = 'morning' | 'day' | 'evening' | 'night'

const noSubscribe = () => () => {}

export function partOfDay(hour: number): Part {
    if (hour >= 5 && hour < 12) return 'morning'
    if (hour >= 12 && hour < 17) return 'day'
    if (hour >= 17 && hour < 23) return 'evening'
    return 'night'
}

/** Имя для обращения: первое слово, и не почта. */
export function firstName(name?: string): string | null {
    const first = name?.trim().split(/\s+/)[0]
    if (!first || first.includes('@')) return null
    return first
}

/**
 * Заголовок дашборда: дата и приветствие по времени суток, засечками.
 *
 * Время берётся из браузера после монтирования: на сервере часовой пояс
 * человека неизвестен, и «доброе утро» в полночь по Москве было бы
 * расхождением между сервером и клиентом.
 */
export function DashboardGreeting({ name, className }: DashboardGreetingProps) {
    // Час — снимок на момент отрисовки: обновлять приветствие по минутам незачем.
    const hour = useSyncExternalStore(noSubscribe, () => new Date().getHours(), () => null)
    const now = hour === null ? null : new Date()

    const greeting = hour === null ? null : t(`dashboard.greeting.${partOfDay(hour)}`)
    const who = firstName(name)
    const date = now?.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })

    return (
        <header className={cn('flex flex-col gap-1', className)} data-testid="dashboard-greeting">
            <p className="min-h-5 text-sm text-fg-muted first-letter:uppercase">{date}</p>
            <h1 className="type-title-1 min-h-9 text-fg">
                {greeting && (who ? t('dashboard.greeting.withName', { greeting, name: who }) : greeting)}
            </h1>
        </header>
    )
}
