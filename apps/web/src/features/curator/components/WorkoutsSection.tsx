'use client'

import { useMemo } from 'react'
import { Dumbbell, Check, Minus } from 'lucide-react'
import { cn } from '@/shared/utils/cn'
import type { DayDetail } from '../types'

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
        <section className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <Dumbbell className="h-4 w-4 text-orange-500" />
                    <h2 className="text-sm font-semibold text-gray-900">Тренировки</h2>
                </div>
                <span className="text-xs text-gray-500">
                    {totalWorkouts} из {workoutData.length} дней
                    {totalDuration > 0 && ` · ${totalDuration} мин`}
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
                                    'mx-auto flex h-8 w-8 items-center justify-center rounded-lg text-xs',
                                    done
                                        ? 'bg-orange-100 text-orange-600'
                                        : 'bg-gray-50 text-gray-300'
                                )}
                            >
                                {done ? <Check className="h-4 w-4" /> : <Minus className="h-3 w-3" />}
                            </div>
                            <p className="text-[10px] text-gray-400 mt-1">{d.shortLabel}</p>
                        </div>
                    )
                })}
            </div>

            {/* Workout details list */}
            <div className="space-y-1.5">
                {workoutData.filter(d => d.workout?.completed).map((d) => (
                    <div key={d.date} className="flex items-center justify-between text-xs">
                        <span className="text-gray-600">{d.label}</span>
                        <span className="text-gray-900 font-medium">
                            {d.workout!.type || 'Тренировка'}
                            {d.workout!.duration > 0 && ` · ${d.workout!.duration} мин`}
                        </span>
                    </div>
                ))}
            </div>
        </section>
    )
}
