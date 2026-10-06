'use client'

import { useState } from 'react'
import { ChevronDown, Droplets } from 'lucide-react'
import { cn } from '@/shared/utils/cn'
import { KBZHUProgress } from './KBZHUProgress'
import { AlertBadge } from './AlertBadge'
import type { DayDetail, FoodEntryView } from '../types'

import { t } from '@/shared/i18n'
const MEAL_LABELS: Record<string, string> = {
    breakfast: t('meals.breakfast'),
    lunch: t('meals.lunch'),
    dinner: t('meals.dinner'),
    snack: t('meals.snack'),
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

    if (diff < dayMs && diff >= 0) return t('curator.day.today')
    if (diff < dayMs * 2 && diff >= dayMs) return t('curator.day.yesterday')

    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Returns Tailwind text color class based on percentage of target */
function deviationColor(value: number, target: number): string {
    if (target <= 0) return 'text-fg-muted'
    const pct = (value / target) * 100
    if (pct >= 80 && pct <= 120) return 'text-success-fg'
    if ((pct >= 50 && pct < 80) || (pct > 120 && pct <= 150)) return 'text-warning-fg'
    return 'text-danger-fg'
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
        <section className="rounded-xl bg-surface shadow-sm border border-line overflow-hidden">
            {/* Collapsed header — always visible */}
            <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="w-full text-left px-4 py-3 hover:bg-canvas transition-colors"
            >
                <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-fg">
                        {formatDateRu(day.date)}
                    </span>
                    <ChevronDown
                        className={cn(
                            'h-4 w-4 text-fg-subtle transition-transform',
                            expanded && 'rotate-180'
                        )}
                    />
                </div>

                {/* KBZHU one-liner with color coding */}
                {kbzhu && (
                    <p className="text-xs">
                        {hasPlan ? (
                            <>
                                <span className={deviationColor(kbzhu.calories, plan!.calories)}>
                                    {t('curator.day.caloriesOfPlan', { current: Math.round(kbzhu.calories), goal: Math.round(plan!.calories) })}
                                </span>
                                <span className="text-fg-subtle">{' | '}</span>
                                <span className={deviationColor(kbzhu.protein, plan!.protein)}>
                                    {t('curator.day.macroOfPlan', { macro: t('macros.proteinShort'), current: Math.round(kbzhu.protein), goal: Math.round(plan!.protein) })}
                                </span>
                                <span className="text-fg-subtle">{' | '}</span>
                                <span className={deviationColor(kbzhu.fat, plan!.fat)}>
                                    {t('curator.day.macroOfPlan', { macro: t('macros.fatShort'), current: Math.round(kbzhu.fat), goal: Math.round(plan!.fat) })}
                                </span>
                                <span className="text-fg-subtle">{' | '}</span>
                                <span className={deviationColor(kbzhu.carbs, plan!.carbs)}>
                                    {t('curator.day.macroOfPlan', { macro: t('macros.carbsShort'), current: Math.round(kbzhu.carbs), goal: Math.round(plan!.carbs) })}
                                </span>
                            </>
                        ) : (
                            <span className="text-fg-muted">
                                {t('curator.day.caloriesOnly', { calories: Math.round(kbzhu.calories) })}
                                {' | '}{t('macros.proteinShort')}{' '}{Math.round(kbzhu.protein)}
                                {' | '}{t('macros.fatShort')}{' '}{Math.round(kbzhu.fat)}
                                {' | '}{t('macros.carbsShort')}{' '}{Math.round(kbzhu.carbs)}
                            </span>
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

                {/* Water summary only (steps & workouts moved to separate sections) */}
                {day.water && (
                    <div className="flex items-center gap-1 mt-1.5 text-xs text-fg-muted">
                        <Droplets className="h-3 w-3" />
                        <span>{t('curator.day.glasses', { glasses: day.water.glasses, goal: day.water.goal })}</span>
                    </div>
                )}
            </button>

            {/* Expanded content */}
            {expanded && (
                <div className="px-4 pb-4 border-t border-line">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                        {/* Left column: KBZHU progress + water */}
                        <div className="space-y-3">
                            {hasPlan && kbzhu ? (
                                <div className="space-y-2">
                                    <h3 className="text-xs font-semibold text-fg">{t('curator.day.macrosHeading')}</h3>
                                    <KBZHUProgress label={t('curator.day.caloriesLabel')} value={kbzhu.calories} target={plan!.calories} compact />
                                    <KBZHUProgress label={t('macros.protein')} value={kbzhu.protein} target={plan!.protein} compact />
                                    <KBZHUProgress label={t('macros.fat')} value={kbzhu.fat} target={plan!.fat} compact />
                                    <KBZHUProgress label={t('macros.carbs')} value={kbzhu.carbs} target={plan!.carbs} compact />
                                </div>
                            ) : kbzhu ? (
                                <div>
                                    <h3 className="text-xs font-semibold text-fg mb-1">{t('curator.day.macrosHeading')}</h3>
                                    <p className="text-xs text-fg-muted">
                                        {t('curator.day.macrosInline', { calories: Math.round(kbzhu.calories), protein: Math.round(kbzhu.protein), fat: Math.round(kbzhu.fat), carbs: Math.round(kbzhu.carbs) })}
                                    </p>
                                    <p className="text-xs text-fg-subtle mt-0.5">{t('curator.day.noPlan')}</p>
                                </div>
                            ) : null}

                            {/* Water detail */}
                            {day.water && (
                                <div className="flex items-center gap-2 text-xs text-fg-muted">
                                    <Droplets className="h-3.5 w-3.5 text-primary" />
                                    <span>{t('curator.day.waterLine', { glasses: day.water.glasses, goal: day.water.goal, volume: day.water.glasses * day.water.glass_size })}</span>
                                </div>
                            )}
                        </div>

                        {/* Right column: Food entries by meal */}
                        <div className="space-y-3">
                            <h3 className="text-xs font-semibold text-fg">{t('curator.day.meals')}</h3>
                            {day.food_entries.length === 0 ? (
                                <p className="text-xs text-fg-subtle">{t('curator.day.noEntries')}</p>
                            ) : (
                                MEAL_ORDER.map((mealType) => {
                                    const entries = mealGroups[mealType]
                                    if (!entries || entries.length === 0) return null
                                    return (
                                        <div key={mealType}>
                                            <h4 className="text-xs font-medium text-fg-muted mb-1">
                                                {MEAL_LABELS[mealType] || mealType}
                                            </h4>
                                            <div className="space-y-1">
                                                {entries.map((entry) => (
                                                    <div key={entry.id} className="text-xs">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-fg">{entry.food_name}</span>
                                                            <span className="text-fg-subtle">{t('curator.day.entryWeight', { weight: entry.weight })}</span>
                                                        </div>
                                                        <p className="text-fg-muted">
                                                            {t('curator.day.entryMacros', { calories: Math.round(entry.calories), protein: Math.round(entry.protein), fat: Math.round(entry.fat), carbs: Math.round(entry.carbs) })}
                                                        </p>
                                                        {entry.created_by != null && (
                                                            <span className="text-primary font-medium">{t('curator.day.addedByCurator')}</span>
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
