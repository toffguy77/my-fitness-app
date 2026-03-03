'use client'

import { useState } from 'react'
import { ChevronDown, Droplets, Footprints, Dumbbell } from 'lucide-react'
import { cn } from '@/shared/utils/cn'
import { KBZHUProgress } from './KBZHUProgress'
import { AlertBadge } from './AlertBadge'
import type { DayDetail, FoodEntryView } from '../types'

const MEAL_LABELS: Record<string, string> = {
    breakfast: 'Завтрак',
    lunch: 'Обед',
    dinner: 'Ужин',
    snack: 'Перекус',
}

const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack']

function groupByMeal(entries: FoodEntryView[]): Record<string, FoodEntryView[]> {
    const grouped: Record<string, FoodEntryView[]> = {}
    for (const entry of entries) {
        const key = entry.meal_type
        if (!grouped[key]) grouped[key] = []
        grouped[key].push(entry)
    }
    return grouped
}

function formatDateRu(dateStr: string): string {
    const date = new Date(dateStr + 'T00:00:00')
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const diff = today.getTime() - date.getTime()
    const dayMs = 86400000

    if (diff < dayMs && diff >= 0) return 'Сегодня'
    if (diff < dayMs * 2 && diff >= dayMs) return 'Вчера'

    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
}

interface DaySectionProps {
    day: DayDetail
    defaultExpanded?: boolean
}

export function DaySection({ day, defaultExpanded = false }: DaySectionProps) {
    const [expanded, setExpanded] = useState(defaultExpanded)

    const kbzhu = day.kbzhu
    const plan = day.plan
    const mealGroups = groupByMeal(day.food_entries)
    const hasPlan = plan !== null

    return (
        <section className="rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
            {/* Collapsed header — always visible */}
            <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors"
            >
                <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-gray-900">
                        {formatDateRu(day.date)}
                    </span>
                    <ChevronDown
                        className={cn(
                            'h-4 w-4 text-gray-400 transition-transform',
                            expanded && 'rotate-180'
                        )}
                    />
                </div>

                {/* KBZHU one-liner */}
                {kbzhu && (
                    <p className="text-xs text-gray-600">
                        {hasPlan ? (
                            <>
                                {Math.round(kbzhu.calories)}/{Math.round(plan!.calories)} ккал
                                {' | Б '}{Math.round(kbzhu.protein)}/{Math.round(plan!.protein)}
                                {' | Ж '}{Math.round(kbzhu.fat)}/{Math.round(plan!.fat)}
                                {' | У '}{Math.round(kbzhu.carbs)}/{Math.round(plan!.carbs)}
                            </>
                        ) : (
                            <>
                                {Math.round(kbzhu.calories)} ккал
                                {' | Б '}{Math.round(kbzhu.protein)}
                                {' | Ж '}{Math.round(kbzhu.fat)}
                                {' | У '}{Math.round(kbzhu.carbs)}
                            </>
                        )}
                    </p>
                )}

                {/* Alerts inline */}
                {day.alerts.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                        {day.alerts.map((alert, idx) => (
                            <AlertBadge key={idx} level={alert.level} message={alert.message} />
                        ))}
                    </div>
                )}

                {/* Water / Steps / Workout summary */}
                <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-gray-500">
                    {day.water && (
                        <span className="flex items-center gap-1">
                            <Droplets className="h-3 w-3" />
                            {day.water.glasses}/{day.water.goal}
                        </span>
                    )}
                    {day.steps > 0 && (
                        <span className="flex items-center gap-1">
                            <Footprints className="h-3 w-3" />
                            {day.steps.toLocaleString('ru-RU')}
                        </span>
                    )}
                    {day.workout && day.workout.completed && (
                        <span className="flex items-center gap-1">
                            <Dumbbell className="h-3 w-3" />
                            {day.workout.type || 'Тренировка'}
                            {day.workout.duration > 0 && ` ${day.workout.duration} мин`}
                        </span>
                    )}
                </div>
            </button>

            {/* Expanded content */}
            {expanded && (
                <div className="px-4 pb-4 border-t border-gray-100">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                        {/* Left column: KBZHU progress + metrics */}
                        <div className="space-y-3">
                            {hasPlan && kbzhu ? (
                                <div className="space-y-2">
                                    <h3 className="text-xs font-semibold text-gray-700">КБЖУ</h3>
                                    <KBZHUProgress label="Калории" value={kbzhu.calories} target={plan!.calories} compact />
                                    <KBZHUProgress label="Белки" value={kbzhu.protein} target={plan!.protein} compact />
                                    <KBZHUProgress label="Жиры" value={kbzhu.fat} target={plan!.fat} compact />
                                    <KBZHUProgress label="Углеводы" value={kbzhu.carbs} target={plan!.carbs} compact />
                                </div>
                            ) : kbzhu ? (
                                <div>
                                    <h3 className="text-xs font-semibold text-gray-700 mb-1">КБЖУ</h3>
                                    <p className="text-xs text-gray-600">
                                        Ккал: {Math.round(kbzhu.calories)} | Б: {Math.round(kbzhu.protein)} | Ж: {Math.round(kbzhu.fat)} | У: {Math.round(kbzhu.carbs)}
                                    </p>
                                    <p className="text-xs text-gray-400 mt-0.5">План не задан</p>
                                </div>
                            ) : null}

                            {/* Water */}
                            {day.water && (
                                <div className="flex items-center gap-2 text-xs text-gray-600">
                                    <Droplets className="h-3.5 w-3.5 text-blue-500" />
                                    <span>Вода: {day.water.glasses}/{day.water.goal} стаканов ({day.water.glasses * day.water.glass_size} мл)</span>
                                </div>
                            )}

                            {/* Steps */}
                            {day.steps > 0 && (
                                <div className="flex items-center gap-2 text-xs text-gray-600">
                                    <Footprints className="h-3.5 w-3.5 text-green-500" />
                                    <span>Шаги: {day.steps.toLocaleString('ru-RU')}</span>
                                </div>
                            )}

                            {/* Workout */}
                            {day.workout && day.workout.completed && (
                                <div className="flex items-center gap-2 text-xs text-gray-600">
                                    <Dumbbell className="h-3.5 w-3.5 text-orange-500" />
                                    <span>
                                        {day.workout.type || 'Тренировка'}
                                        {day.workout.duration > 0 && `: ${day.workout.duration} мин`}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Right column: Food entries by meal */}
                        <div className="space-y-3">
                            <h3 className="text-xs font-semibold text-gray-700">Приёмы пищи</h3>
                            {day.food_entries.length === 0 ? (
                                <p className="text-xs text-gray-400">Нет записей</p>
                            ) : (
                                MEAL_ORDER.map((mealType) => {
                                    const entries = mealGroups[mealType]
                                    if (!entries || entries.length === 0) return null
                                    return (
                                        <div key={mealType}>
                                            <h4 className="text-xs font-medium text-gray-600 mb-1">
                                                {MEAL_LABELS[mealType] || mealType}
                                            </h4>
                                            <div className="space-y-1">
                                                {entries.map((entry) => (
                                                    <div key={entry.id} className="text-xs">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-gray-900">{entry.food_name}</span>
                                                            <span className="text-gray-400">{entry.weight} г</span>
                                                        </div>
                                                        <p className="text-gray-500">
                                                            {Math.round(entry.calories)} ккал | Б {Math.round(entry.protein)} | Ж {Math.round(entry.fat)} | У {Math.round(entry.carbs)}
                                                        </p>
                                                        {entry.created_by != null && (
                                                            <span className="text-blue-600 font-medium">Добавлено куратором</span>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    </div>
                </div>
            )}
        </section>
    )
}
