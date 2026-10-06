'use client'

import { useMemo } from 'react'
import { Dumbbell, Check, Minus } from 'lucide-react'
import { cn } from '@/shared/utils/cn'
import type { DayDetail } from '../types'

import { t } from '@/shared/i18n'
import { workoutTypeLabel } from '@/features/dashboard/utils/workoutTypeLabel'
interface WorkoutsSectionProps {
    days: DayDetail[]
}

export function WorkoutsSection({ days }: WorkoutsSectionProps) {
    const workoutData = useMemo(() =>
        [...days].reverse().map(d => ({
            date: d.date,
            label: new Date(d.date + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }),
            shortLabel: new Date(d.date + 'T00:00:00').toLocaleDateString('ru-RU', { weekday: 'short' }),
            workout: d.workout,
        })),
        [days]
    )

    const hasAnyWorkout = workoutData.some(d => d.workout?.completed)
    if (!hasAnyWorkout) return null

    const totalWorkouts = workoutData.filter(d => d.workout?.completed).length
    const totalDuration = workoutData.reduce((sum, d) =>
        sum + (d.workout?.completed ? (d.workout.duration || 0) : 0), 0
    )

    return (
        <section className="rounded-card border border-line bg-surface p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <Dumbbell className="h-5 w-5 text-fg-subtle" strokeWidth={1.8} aria-hidden="true" />
                    <h2 className="type-title-3 text-fg">{t('curator.workouts.heading')}</h2>
                </div>
                <span className="text-sm tabular-nums text-fg-muted">
                    {t('curator.workouts.countOfDays', { done: totalWorkouts, total: workoutData.length })}
                    {totalDuration > 0 && t('curator.workouts.totalDuration', { minutes: totalDuration })}
                </span>
            </div>

            {/* Weekly grid */}
            <div className="flex gap-1.5 mb-3">
                {workoutData.map((d) => {
                    const done = d.workout?.completed
                    return (
                        <div key={d.date} className="flex-1 text-center">
                            <div
                                className={cn(
                                    'mx-auto flex h-8 w-8 items-center justify-center rounded-tile text-xs',
                                    done
                                        ? 'bg-success-soft text-success-fg'
                                        : 'bg-subtle text-fg-subtle'
                                )}
                            >
                                {done ? <Check className="h-4 w-4" aria-hidden="true" /> : <Minus className="h-3 w-3" aria-hidden="true" />}
                            </div>
                            <p className="mt-1 text-[11px] leading-[14px] text-fg-subtle">{d.shortLabel}</p>
                        </div>
                    )
                })}
            </div>

            {/* Workout details list */}
            <div className="divide-y divide-line">
                {workoutData.filter(d => d.workout?.completed).map((d) => (
                    <div key={d.date} className="flex items-center justify-between gap-3 py-2 text-sm tabular-nums">
                        <span className="text-fg-muted">{d.label}</span>
                        <span className="font-medium text-fg">
                            {d.workout!.type ? workoutTypeLabel(d.workout!.type) : t('curator.workouts.fallbackType')}
                            {d.workout!.duration > 0 && t('curator.workouts.duration', { minutes: d.workout!.duration })}
                        </span>
                    </div>
                ))}
            </div>
        </section>
    )
}
