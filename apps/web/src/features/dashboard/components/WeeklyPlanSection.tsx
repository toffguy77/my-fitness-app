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
 */

'use client'

import { CheckCircle, Calendar } from 'lucide-react'
import { useDashboardStore } from '../store/dashboardStore'
import type { WeeklyPlan } from '../types'

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
 * WeeklyPlanSection Component
 */
export function WeeklyPlanSection({ className = '' }: WeeklyPlanSectionProps) {
    const { weeklyPlan } = useDashboardStore()

    // Check if plan exists and is active
    const hasActivePlan = weeklyPlan && isPlanActive(weeklyPlan)

    return (
        <section
            className={`weekly-plan-section bg-white rounded-lg shadow-sm p-6 ${className}`}
            aria-labelledby="weekly-plan-heading"
        >
            <h2
                id="weekly-plan-heading"
                className="text-lg font-semibold text-gray-900 mb-4"
            >
                Недельная планка
            </h2>

            {hasActivePlan ? (
                <div className="space-y-4">
                    {/* Active indicator */}
                    <div className="flex items-center gap-2 text-green-600">
                        <CheckCircle className="w-5 h-5" aria-hidden="true" />
                        <span className="text-sm font-medium">Активна</span>
                    </div>

                    {/* Targets */}
                    <div className="space-y-3">
                        {/* Calorie target */}
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <span className="text-sm text-gray-600">Калории</span>
                            <span className="text-lg font-semibold text-gray-900">
                                {weeklyPlan.caloriesGoal} ккал
                            </span>
                        </div>

                        {/* Protein target */}
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <span className="text-sm text-gray-600">Белок</span>
                            <span className="text-lg font-semibold text-gray-900">
                                {weeklyPlan.proteinGoal} г
                            </span>
                        </div>

                        {/* Optional: Fat target */}
                        {weeklyPlan.fatGoal !== undefined && (
                            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                <span className="text-sm text-gray-600">Жиры</span>
                                <span className="text-lg font-semibold text-gray-900">
                                    {weeklyPlan.fatGoal} г
                                </span>
                            </div>
                        )}

                        {/* Optional: Carbs target */}
                        {weeklyPlan.carbsGoal !== undefined && (
                            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                <span className="text-sm text-gray-600">Углеводы</span>
                                <span className="text-lg font-semibold text-gray-900">
                                    {weeklyPlan.carbsGoal} г
                                </span>
                            </div>
                        )}

                        {/* Optional: Steps target */}
                        {weeklyPlan.stepsGoal !== undefined && (
                            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                <span className="text-sm text-gray-600">Шаги</span>
                                <span className="text-lg font-semibold text-gray-900">
                                    {weeklyPlan.stepsGoal.toLocaleString('ru-RU')}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Plan dates */}
                    <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <Calendar
                            className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5"
                            aria-hidden="true"
                        />
                        <div className="text-sm text-blue-800">
                            <p className="font-medium">Период действия</p>
                            <p>
                                {formatDate(weeklyPlan.startDate)} —{' '}
                                {formatDate(weeklyPlan.endDate)}
                            </p>
                        </div>
                    </div>
                </div>
            ) : (
                /* Placeholder when no active plan */
                <div className="flex flex-col items-center justify-center py-8 text-center">
                    <div className="w-16 h-16 mb-4 rounded-full bg-gray-100 flex items-center justify-center">
                        <Calendar className="w-8 h-8 text-gray-400" aria-hidden="true" />
                    </div>
                    <p className="text-gray-600 text-sm">
                        Скоро тут будет твоя планка
                    </p>
                    <p className="text-gray-500 text-xs mt-2">
                        Твой тренер назначит план питания
                    </p>
                </div>
            )}
        </section>
    )
}
