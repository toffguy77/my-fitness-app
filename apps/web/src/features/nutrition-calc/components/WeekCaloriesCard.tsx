'use client'

import { useMemo } from 'react'
import { Card, CardTitle } from '@/shared/components/ui/Card'
import { WeekDots, weekSummary, type WeekDotsDay } from '@/shared/components/ui/WeekDots'
import { formatLocalDate } from '@/shared/utils/format'
import { cn } from '@/shared/utils/cn'
import { t } from '@/shared/i18n'
import type { TargetVsActual } from '../types'

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

/** Ответ истории приходит то датой, то меткой времени — нужен день. */
function dayOf(raw: string): Date | null {
    const [y, m, d] = String(raw).split(/[T ]/)[0].split('-').map(Number)
    const date = new Date(y, m - 1, d)
    return Number.isNaN(date.getTime()) ? null : date
}

/** Калории за неделю против нормы — точка на день. Пустой истории не рисует. */
export function toWeekDays(history: TargetVsActual[], today = new Date()): WeekDotsDay[] {
    const todayKey = formatLocalDate(today)
    return history.flatMap((entry) => {
        const date = dayOf(entry.date)
        if (!date) return []
        const key = formatLocalDate(date)
        const target = entry.target?.calories
        const actual = entry.actual?.calories
        return [{
            date: key,
            label: t(`weekdays.short.${WEEKDAY_KEYS[date.getDay()]}`),
            deviation: target && actual ? actual / target - 1 : null,
            isToday: key === todayKey,
        }]
    })
}

export interface WeekCaloriesCardProps {
    data: TargetVsActual[]
    className?: string
}

/**
 * «Неделя» на дашборде: сколько дней из недели калории легли в коридор нормы.
 * Заменяет линейный график «цель против факта» — тот же ответ без
 * необходимости сравнивать две линии.
 */
export function WeekCaloriesCard({ data, className }: WeekCaloriesCardProps) {
    const days = useMemo(() => toWeekDays(data), [data])
    if (days.length === 0) return null
    const { inside, total } = weekSummary(days)

    return (
        <Card className={cn('flex flex-col gap-3.5', className)} data-testid="week-calories">
            <div className="flex items-baseline justify-between gap-3">
                <CardTitle className="type-title-2">{t('dashboard.week.title')}</CardTitle>
                {total > 0 && (
                    <span className="text-[15px] font-semibold tabular-nums text-fg">
                        {t('ui.weekDots.summary', { inside, total })}{' '}
                        <span className="font-normal text-fg-muted">{t('ui.weekDots.inNorm')}</span>
                    </span>
                )}
            </div>
            <WeekDots days={days} />
        </Card>
    )
}
