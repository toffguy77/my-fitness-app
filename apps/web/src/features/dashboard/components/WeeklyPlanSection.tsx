/**
 * WeeklyPlanSection Component
 *
 * Displays weekly nutrition plan assigned by coach with:
 * - Calorie and protein targets
 * - Plan start and end dates
 * - Active indicator
 * - Placeholder when no plan exists
 * - Handling of expired plans
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 *
 * Performance optimizations:
 * - React.memo to prevent unnecessary re-renders
 * - Memoized calculations for adherence
 */

'use client'

import { memo, useMemo } from 'react'
import { CheckCircle, Calendar } from 'lucide-react'
import { useDashboardStore } from '../store/dashboardStore'
import type { WeeklyPlan } from '../types'
import { AttentionIcon } from './AttentionBadge'

/**
 * Props for WeeklyPlanSection component
 */
export interface WeeklyPlanSectionProps {
    className?: string
}

/**
 * Helper: Check if plan is active (current date is within plan dates)
 */
function isPlanActive(plan: WeeklyPlan): boolean {
    const now = new Date()
    const start = new Date(plan.startDate)
    const end = new Date(plan.endDate)

    // Reset time parts for date-only comparison
    now.setHours(0, 0, 0, 0)
    start.setHours(0, 0, 0, 0)
    end.setHours(0, 0, 0, 0)

    return now >= start && now <= end && plan.isActive
}

/**
 * Helper: Format date for display
 */
function formatDate(date: Date): string {
    return new Intl.DateTimeFormat('ru-RU', {
        day: 'numeric',
        month: 'long',
    }).format(new Date(date))
}

/**
 * Helper: Calculate adherence percentage for a day
 */
function calculateDayAdherence(
    dailyMetrics: any,
    weeklyPlan: WeeklyPlan
): number {
    if (!dailyMetrics || !weeklyPlan) return 0

    const { nutrition, steps } = dailyMetrics
    const { caloriesGoal, proteinGoal, stepsGoal } = weeklyPlan

    let adherenceCount = 0
    let totalGoals = 2 // calories and protein are always present

    // Check calories (within 10% tolerance)
    if (
        nutrition.calories >= caloriesGoal * 0.9 &&
        nutrition.calories <= caloriesGoal * 1.1
    ) {
        adherenceCount++
    }

    // Check protein (within 10% tolerance)
    if (
        nutrition.protein >= proteinGoal * 0.9 &&
        nutrition.protein <= proteinGoal * 1.1
    ) {
        adherenceCount++
    }

    // Check steps if goal exists
    if (stepsGoal) {
        totalGoals++
        if (steps >= stepsGoal * 0.9) {
            adherenceCount++
        }
    }

    return (adherenceCount / totalGoals) * 100
}

/**
 * Helper: Check if adherence is low for 2+ consecutive days
 */
function hasLowAdherence(
    dailyData: Record<string, any> | undefined,
    weeklyPlan: WeeklyPlan
): boolean {
    // Return false if no daily data available
    if (!dailyData) return false

    const today = new Date()
    const dates: Date[] = []

    // Get last 7 days
    for (let i = 6; i >= 0; i--) {
        const date = new Date(today)
        date.setDate(today.getDate() - i)
        dates.push(date)
    }

    let consecutiveLowDays = 0

    for (const date of dates) {
        const dateStr = date.toISOString().split('T')[0]
        const metrics = dailyData[dateStr]

        if (!metrics) continue

        const adherence = calculateDayAdherence(metrics, weeklyPlan)

        if (adherence < 80) {
            consecutiveLowDays++
            if (consecutiveLowDays >= 2) {
                return true
            }
        } else {
            consecutiveLowDays = 0
        }
    }

    return false
}

/**
 * Helper: Check if date is today
 */
function isToday(date: Date): boolean {
    const today = new Date()
    return (
        date.getFullYear() === today.getFullYear() &&
        date.getMonth() === today.getMonth() &&
        date.getDate() === today.getDate()
    )
}

/**
 * WeeklyPlanSection Component
 * Wrapped with React.memo to prevent unnecessary re-renders
 */
export const WeeklyPlanSection = memo(function WeeklyPlanSection({ className = '' }: WeeklyPlanSectionProps) {
    const { weeklyPlan, dailyData } = useDashboardStore()

    // Check if plan exists and is active - memoized
    const hasActivePlan = useMemo(() =>
        weeklyPlan && isPlanActive(weeklyPlan),
        [weeklyPlan]
    )

    // Check for low adherence (only for current day) - memoized
    const showAttentionIndicator = useMemo(() => {
        const today = new Date()
        return hasActivePlan &&
            isToday(today) &&
            hasLowAdherence(dailyData, weeklyPlan!)
    }, [hasActivePlan, dailyData, weeklyPlan])

    return (
        <section
            className={`weekly-plan-section bg-white rounded-lg shadow-sm p-4 sm:p-5 md:p-6 ${className}`}
            aria-labelledby="weekly-plan-heading"
            aria-describedby={showAttentionIndicator ? "weekly-plan-attention-indicator" : undefined}
        >
            <div className="flex items-center justify-between mb-3 sm:mb-4">
                <h2
                    id="weekly-plan-heading"
                    className="text-base sm:text-lg font-semibold text-gray-900"
                >
                    Недельная планка
                </h2>
                {showAttentionIndicator && (
                    <AttentionIcon
                        urgency="high"
                        size="md"
                        ariaLabel="Низкая приверженность плану (менее 80% в течение 2+ дней)"
                        announceChanges={true}
                        indicatesId="weekly-plan-content"
                    />
                )}
            </div>

            {hasActivePlan && weeklyPlan ? (
                <div className="space-y-3 sm:space-y-4" role="region" aria-label="Активная недельная планка" id="weekly-plan-content">
                    {/* Active indicator */}
                    <div
                        className="flex items-center gap-2 text-green-600"
                        role="status"
                        aria-label="План активен"
                    >
                        <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
                        <span className="text-xs sm:text-sm font-medium">Активна</span>
                    </div>

                    {/* Targets */}
                    <div className="space-y-2 sm:space-y-3" role="list" aria-label="Целевые показатели">
                        {/* Calorie target */}
                        <div
                            className="flex items-center justify-between p-2.5 sm:p-3 bg-gray-50 rounded-lg"
                            role="listitem"
                            aria-label={`Цель по калориям: ${weeklyPlan.caloriesGoal} килокалорий в день`}
                        >
                            <span className="text-xs sm:text-sm text-gray-600">Калории</span>
                            <span className="text-base sm:text-lg font-semibold text-gray-900">
                                {weeklyPlan.caloriesGoal} ккал
                            </span>
                        </div>

                        {/* Protein target */}
                        <div
                            className="flex items-center justify-between p-2.5 sm:p-3 bg-gray-50 rounded-lg"
                            role="listitem"
                            aria-label={`Цель по белку: ${weeklyPlan.proteinGoal} грамм в день`}
                        >
                            <span className="text-xs sm:text-sm text-gray-600">Белок</span>
                            <span className="text-base sm:text-lg font-semibold text-gray-900">
                                {weeklyPlan.proteinGoal} г
                            </span>
                        </div>

                        {/* Optional: Fat target */}
                        {weeklyPlan.fatGoal !== undefined && (
                            <div
                                className="flex items-center justify-between p-2.5 sm:p-3 bg-gray-50 rounded-lg"
                                role="listitem"
                                aria-label={`Цель по жирам: ${weeklyPlan.fatGoal} грамм в день`}
                            >
                                <span className="text-xs sm:text-sm text-gray-600">Жиры</span>
                                <span className="text-base sm:text-lg font-semibold text-gray-900">
                                    {weeklyPlan.fatGoal} г
                                </span>
                            </div>
                        )}

                        {/* Optional: Carbs target */}
                        {weeklyPlan.carbsGoal !== undefined && (
                            <div
                                className="flex items-center justify-between p-2.5 sm:p-3 bg-gray-50 rounded-lg"
                                role="listitem"
                                aria-label={`Цель по углеводам: ${weeklyPlan.carbsGoal} грамм в день`}
                            >
                                <span className="text-xs sm:text-sm text-gray-600">Углеводы</span>
                                <span className="text-base sm:text-lg font-semibold text-gray-900">
                                    {weeklyPlan.carbsGoal} г
                                </span>
                            </div>
                        )}

                        {/* Optional: Steps target */}
                        {weeklyPlan.stepsGoal !== undefined && (
                            <div
                                className="flex items-center justify-between p-2.5 sm:p-3 bg-gray-50 rounded-lg"
                                role="listitem"
                                aria-label={`Цель по шагам: ${weeklyPlan.stepsGoal.toLocaleString('ru-RU')} шагов в день`}
                            >
                                <span className="text-xs sm:text-sm text-gray-600">Шаги</span>
                                <span className="text-base sm:text-lg font-semibold text-gray-900">
                                    {weeklyPlan.stepsGoal.toLocaleString('ru-RU')}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Plan dates */}
                    <div
                        className="flex items-start gap-2 p-2.5 sm:p-3 bg-blue-50 border border-blue-200 rounded-lg"
                        role="note"
                        aria-label={`Период действия плана: с ${formatDate(weeklyPlan.startDate)} по ${formatDate(weeklyPlan.endDate)}`}
                    >
                        <Calendar
                            className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 flex-shrink-0 mt-0.5"
                            aria-hidden="true"
                        />
                        <div className="text-xs sm:text-sm text-blue-800">
                            <p className="font-medium">Период действия</p>
                            <p className="break-words">
                                {formatDate(weeklyPlan.startDate)} —{' '}
                                {formatDate(weeklyPlan.endDate)}
                            </p>
                        </div>
                    </div>
                </div>
            ) : (
                /* Placeholder when no active plan */
                <div
                    className="flex flex-col items-center justify-center py-6 sm:py-8 text-center"
                    role="status"
                    aria-label="Недельная планка не назначена"
                >
                    <div className="w-12 h-12 sm:w-16 sm:h-16 mb-3 sm:mb-4 rounded-full bg-gray-100 flex items-center justify-center">
                        <Calendar className="w-6 h-6 sm:w-8 sm:h-8 text-gray-400" aria-hidden="true" />
                    </div>
                    <p className="text-gray-600 text-xs sm:text-sm">
                        Скоро тут будет твоя планка
                    </p>
                    <p className="text-gray-500 text-xs mt-1 sm:mt-2">
                        Твой тренер назначит план питания
                    </p>
                </div>
            )}
        </section>
    )
})
