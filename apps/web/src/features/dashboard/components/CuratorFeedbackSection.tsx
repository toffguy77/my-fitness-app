/**
 * CuratorFeedbackSection Component
 *
 * Displays the latest curator feedback on a weekly report.
 * Features:
 * - Category ratings as colored badges
 * - Summary text
 * - Recommendations (if any)
 * - Collapsible (collapsed by default)
 *
 * Only renders when a reportId is provided.
 */

'use client'

import { useState, useEffect, memo } from 'react'
import { ChevronDown, MessageSquare } from 'lucide-react'
import { cn } from '@/shared/utils/cn'
import { dashboardApi } from '../api/dashboardApi'
import type { CuratorFeedback, RatingLevel } from '../types'
import { t } from '@/shared/i18n'

/**
 * Props for CuratorFeedbackSection component
 */
export interface CuratorFeedbackSectionProps {
    reportId?: string
    className?: string
}

/**
 * Get label and color for rating level
 */
function getRatingBadge(rating: RatingLevel): { label: string; className: string } {
    switch (rating) {
        // Оценка — роль состояния, не бренд. «Нужно улучшить» — не ошибка,
        // а «мимо нормы», поэтому warning, а не danger.
        case 'excellent':
            return { label: t('dashboard.feedback.excellent'), className: 'bg-success-soft text-success-fg' }
        case 'good':
            return { label: t('dashboard.feedback.good'), className: 'bg-info-soft text-info-fg' }
        case 'needs_improvement':
            return { label: t('dashboard.feedback.needsWork'), className: 'bg-warning-soft text-warning-fg' }
    }
}

/**
 * Get display name for feedback category
 */
function getCategoryName(category: string): string {
    switch (category) {
        case 'nutrition':
            return t('dashboard.feedback.nutrition')
        case 'activity':
            return t('dashboard.feedback.activity')
        case 'water':
            return t('dashboard.feedback.water')
        default:
            return category
    }
}

/**
 * CuratorFeedbackSection Component
 */
export const CuratorFeedbackSection = memo(function CuratorFeedbackSection({
    reportId,
    className,
}: CuratorFeedbackSectionProps) {
    const [feedback, setFeedback] = useState<CuratorFeedback | null>(null)
    const [loading, setLoading] = useState(false)
    const [expanded, setExpanded] = useState(false)

    useEffect(() => {
        if (!reportId) return

        let cancelled = false

        dashboardApi
            .getReportFeedback(reportId)
            .then((data) => {
                if (!cancelled) {
                    setFeedback(data)
                    setLoading(false)
                }
            })
            .catch(() => {
                if (!cancelled) setLoading(false)
            })

        return () => {
            cancelled = true
        }
    }, [reportId])

    // Don't render if no reportId or no feedback
    if (!reportId) return null
    if (loading) return null
    if (!feedback) return null

    const categories = (['nutrition', 'activity', 'water'] as const).filter(
        (cat) => feedback[cat]
    )

    // Отзыв куратора — голос человека, поэтому тёмная поверхность `coach`,
    // итог недели — цитатой засечками, как в карточке куратора.
    return (
        <section
            className={cn('rounded-card bg-coach p-5 text-on-coach', className)}
            aria-labelledby="curator-feedback-heading"
        >
            {/* Header — clickable to toggle */}
            <button
                type="button"
                onClick={() => setExpanded((prev) => !prev)}
                className="-m-2 flex min-h-11 w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-tile p-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                aria-expanded={expanded}
                aria-controls="curator-feedback-content"
            >
                <span className="flex items-center gap-2.5">
                    <MessageSquare
                        className="h-5 w-5 flex-shrink-0 text-on-coach-muted"
                        strokeWidth={1.8}
                        aria-hidden="true"
                    />
                    <h2
                        id="curator-feedback-heading"
                        className="type-title-3 text-on-coach"
                    >
                        {t('dashboard.feedback.title')}
                    </h2>
                </span>
                <ChevronDown
                    className={cn(
                        'h-5 w-5 flex-shrink-0 text-on-coach-muted transition-transform duration-200 ease-standard',
                        expanded && 'rotate-180'
                    )}
                    strokeWidth={1.8}
                    aria-hidden="true"
                />
            </button>

            {/* Collapsible content */}
            {expanded && (
                <div
                    id="curator-feedback-content"
                    className="mt-4 space-y-4"
                >
                    {/* Category ratings */}
                    {categories.length > 0 && (
                        <div className="flex flex-wrap gap-x-4 gap-y-2" role="list" aria-label={t('dashboard.feedback.ratingsAria')}>
                            {categories.map((cat) => {
                                const rating = feedback[cat]!
                                const badge = getRatingBadge(rating.rating)
                                return (
                                    <div
                                        key={cat}
                                        role="listitem"
                                        className="flex items-center gap-1.5"
                                    >
                                        <span className="type-caption text-on-coach-muted">
                                            {getCategoryName(cat)}:
                                        </span>
                                        <span
                                            className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', badge.className)}
                                        >
                                            {badge.label}
                                        </span>
                                    </div>
                                )
                            })}
                        </div>
                    )}

                    {/* Summary — слова куратора цитатой */}
                    <p className="type-quote text-on-coach">{feedback.summary}</p>

                    {/* Recommendations */}
                    {feedback.recommendations && (
                        <div className="rounded-tile bg-white/10 p-3">
                            <p className="mb-1 type-overline text-on-coach-muted">
                                {t('dashboard.feedback.recommendations')}
                            </p>
                            <p className="text-[15px] leading-[22px] text-on-coach">
                                {feedback.recommendations}
                            </p>
                        </div>
                    )}
                </div>
            )}
        </section>
    )
})
