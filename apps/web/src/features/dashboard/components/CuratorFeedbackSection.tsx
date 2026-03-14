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
import { ChevronDown, ChevronUp, MessageSquare } from 'lucide-react'
import { dashboardApi } from '../api/dashboardApi'
import type { CuratorFeedback, RatingLevel } from '../types'

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
        case 'excellent':
            return { label: 'Отлично', className: 'bg-green-100 text-green-800' }
        case 'good':
            return { label: 'Хорошо', className: 'bg-yellow-100 text-yellow-800' }
        case 'needs_improvement':
            return { label: 'Нужно улучшить', className: 'bg-red-100 text-red-800' }
    }
}

/**
 * Get display name for feedback category
 */
function getCategoryName(category: string): string {
    switch (category) {
        case 'nutrition':
            return 'Питание'
        case 'activity':
            return 'Активность'
        case 'water':
            return 'Вода'
        default:
            return category
    }
}

/**
 * CuratorFeedbackSection Component
 */
export const CuratorFeedbackSection = memo(function CuratorFeedbackSection({
    reportId,
    className = '',
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

    return (
        <section
            className={`bg-white rounded-lg shadow-sm p-4 sm:p-5 md:p-6 ${className}`}
            aria-labelledby="curator-feedback-heading"
        >
            {/* Header — clickable to toggle */}
            <button
                type="button"
                onClick={() => setExpanded((prev) => !prev)}
                className="w-full flex items-center justify-between"
                aria-expanded={expanded}
                aria-controls="curator-feedback-content"
            >
                <div className="flex items-center gap-2">
                    <MessageSquare
                        className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600"
                        aria-hidden="true"
                    />
                    <h2
                        id="curator-feedback-heading"
                        className="text-base sm:text-lg font-semibold text-gray-900"
                    >
                        Обратная связь куратора
                    </h2>
                </div>
                {expanded ? (
                    <ChevronUp className="w-5 h-5 text-gray-400" aria-hidden="true" />
                ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400" aria-hidden="true" />
                )}
            </button>

            {/* Collapsible content */}
            {expanded && (
                <div
                    id="curator-feedback-content"
                    className="mt-3 sm:mt-4 space-y-3 sm:space-y-4"
                >
                    {/* Category ratings */}
                    {categories.length > 0 && (
                        <div className="flex flex-wrap gap-2" role="list" aria-label="Оценки по категориям">
                            {categories.map((cat) => {
                                const rating = feedback[cat]!
                                const badge = getRatingBadge(rating.rating)
                                return (
                                    <div
                                        key={cat}
                                        role="listitem"
                                        className="flex items-center gap-1.5"
                                    >
                                        <span className="text-xs text-gray-600">
                                            {getCategoryName(cat)}:
                                        </span>
                                        <span
                                            className={`text-xs font-medium px-2 py-0.5 rounded-full ${badge.className}`}
                                        >
                                            {badge.label}
                                        </span>
                                    </div>
                                )
                            })}
                        </div>
                    )}

                    {/* Summary */}
                    <div>
                        <p className="text-sm text-gray-700">{feedback.summary}</p>
                    </div>

                    {/* Recommendations */}
                    {feedback.recommendations && (
                        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                            <p className="text-xs font-medium text-blue-800 mb-1">
                                Рекомендации
                            </p>
                            <p className="text-sm text-blue-700">
                                {feedback.recommendations}
                            </p>
                        </div>
                    )}
                </div>
            )}
        </section>
    )
})
