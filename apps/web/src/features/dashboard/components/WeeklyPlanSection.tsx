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
import { formatLocalDate } from '@/shared/utils/format'
import { CheckCircle, Calendar } from 'lucide-react'
import { Card, CardTitle } from '@/shared/components/ui/Card'
import { cn } from '@/shared/utils/cn'
import { useDashboardStore } from '../store/dashboardStore'
import type { DailyMetrics, WeeklyPlan } from '../types'
import { AttentionIcon } from './AttentionBadge'
import { t } from '@/shared/i18n'

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
    dailyMetrics: DailyMetrics | undefined,
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
    dailyData: Record<string, DailyMetrics> | undefined,
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
        const dateStr = formatLocalDate(date)
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
        <Card
            className={cn('weekly-plan-section', className)}
            aria-labelledby="weekly-plan-heading"
            aria-describedby={showAttentionIndicator ? "weekly-plan-attention-indicator" : undefined}
        >
            <div className="flex items-center justify-between mb-4">
                <CardTitle
                    id="weekly-plan-heading"
                    className="type-title-2 text-fg"
                >
                    {t('dashboard.weeklyPlan.title')}
                </CardTitle>
                {showAttentionIndicator && (
                    <AttentionIcon
                        urgency="high"
                        size="md"
                        ariaLabel={t('dashboard.weeklyPlan.lowAdherence')}
                        announceChanges={true}
                        indicatesId="weekly-plan-content"
                    />
                )}
            </div>

            {hasActivePlan && weeklyPlan ? (
                <div className="space-y-4" role="region" aria-label={t('dashboard.weeklyPlan.activeRegion')} id="weekly-plan-content">
                    {/* Active indicator */}
                    <div
                        className="flex items-center gap-2 text-success-fg"
                        role="status"
                        aria-label={t('dashboard.weeklyPlan.activeAria')}
                    >
                        <CheckCircle className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                        <span className="text-sm font-medium">{t('dashboard.weeklyPlan.active')}</span>
                    </div>

                    {/* Targets */}
                    <div className="divide-y divide-line border-y border-line" role="list" aria-label={t('dashboard.weeklyPlan.goalsAria')}>
                        {/* Calorie target */}
                        <div
                            className="flex min-h-12 items-center justify-between gap-3 py-2.5"
                            role="listitem"
                            aria-label={t('dashboard.weeklyPlan.caloriesAria', { value: weeklyPlan.caloriesGoal })}
                        >
                            <span className="text-[15px] text-fg-muted">{t('dashboard.weeklyPlan.calories')}</span>
                            <span className="type-headline text-fg tabular-nums">
                                {t('dashboard.weeklyPlan.caloriesValue', { value: weeklyPlan.caloriesGoal })}
                            </span>
                        </div>

                        {/* Protein target */}
                        <div
                            className="flex min-h-12 items-center justify-between gap-3 py-2.5"
                            role="listitem"
                            aria-label={t('dashboard.weeklyPlan.proteinAria', { value: weeklyPlan.proteinGoal })}
                        >
                            <span className="text-[15px] text-fg-muted">{t('dashboard.weeklyPlan.protein')}</span>
                            <span className="type-headline text-fg tabular-nums">
                                {weeklyPlan.proteinGoal} {t('units.gram')}
                            </span>
                        </div>

                        {/* Optional: Fat target */}
                        {weeklyPlan.fatGoal !== undefined && (
                            <div
                                className="flex min-h-12 items-center justify-between gap-3 py-2.5"
                                role="listitem"
                                aria-label={t('dashboard.weeklyPlan.fatAria', { value: weeklyPlan.fatGoal })}
                            >
                                <span className="text-[15px] text-fg-muted">{t('dashboard.weeklyPlan.fat')}</span>
                                <span className="type-headline text-fg tabular-nums">
                                    {weeklyPlan.fatGoal} {t('units.gram')}
                                </span>
                            </div>
                        )}

                        {/* Optional: Carbs target */}
                        {weeklyPlan.carbsGoal !== undefined && (
                            <div
                                className="flex min-h-12 items-center justify-between gap-3 py-2.5"
                                role="listitem"
                                aria-label={t('dashboard.weeklyPlan.carbsAria', { value: weeklyPlan.carbsGoal })}
                            >
                                <span className="text-[15px] text-fg-muted">{t('dashboard.weeklyPlan.carbs')}</span>
                                <span className="type-headline text-fg tabular-nums">
                                    {weeklyPlan.carbsGoal} {t('units.gram')}
                                </span>
                            </div>
                        )}

                        {/* Optional: Steps target */}
                        {weeklyPlan.stepsGoal !== undefined && (
                            <div
                                className="flex min-h-12 items-center justify-between gap-3 py-2.5"
                                role="listitem"
                                aria-label={t('dashboard.weeklyPlan.stepsAria', { value: weeklyPlan.stepsGoal.toLocaleString('ru-RU') })}
                            >
                                <span className="text-[15px] text-fg-muted">{t('dashboard.weeklyPlan.steps')}</span>
                                <span className="type-headline text-fg tabular-nums">
                                    {weeklyPlan.stepsGoal.toLocaleString('ru-RU')}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Curator comment */}
                    {weeklyPlan.comment && (
                        // Комментарий — голос куратора: тёмная поверхность и цитата
                        // засечками, как в карточке куратора.
                        <div
                            className="rounded-tile bg-coach p-4 text-on-coach"
                            role="note"
                            aria-label={t('dashboard.weeklyPlan.commentAria')}
                        >
                            <p className="mb-1.5 type-overline text-on-coach-muted">{t('dashboard.weeklyPlan.comment')}</p>
                            <p className="type-quote text-on-coach">{weeklyPlan.comment}</p>
                        </div>
                    )}

                    {/* Plan dates */}
                    <div
                        className="flex items-start gap-2 text-fg-muted"
                        role="note"
                        aria-label={t('dashboard.weeklyPlan.periodAria', { start: formatDate(weeklyPlan.startDate), end: formatDate(weeklyPlan.endDate) })}
                    >
                        <Calendar
                            className="mt-0.5 h-4 w-4 flex-shrink-0"
                            strokeWidth={1.8}
                            aria-hidden="true"
                        />
                        <div className="text-sm">
                            <p className="font-medium text-fg">{t('dashboard.weeklyPlan.period')}</p>
                            <p className="break-words tabular-nums">
                                {formatDate(weeklyPlan.startDate)} —{' '}
                                {formatDate(weeklyPlan.endDate)}
                            </p>
                        </div>
                    </div>
                </div>
            ) : (
                /* Placeholder when no active plan */
                <div
                    className="flex flex-col items-center justify-center py-6 text-center"
                    role="status"
                    aria-label={t('dashboard.weeklyPlan.emptyAria')}
                >
                    <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-subtle" aria-hidden="true">
                        <Calendar className="h-6 w-6 text-fg-subtle" strokeWidth={1.8} />
                    </div>
                    <p className="type-title-3 text-fg">
                        {t('dashboard.weeklyPlan.emptyTitle')}
                    </p>
                    <p className="mt-1 text-sm text-fg-muted">
                        {t('dashboard.weeklyPlan.emptyHint')}
                    </p>
                </div>
            )}
        </Card>
    )
})
