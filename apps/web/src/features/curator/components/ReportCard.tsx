'use client'

import { useState } from 'react'
import { ChevronDown, MessageSquare } from 'lucide-react'
import { cn } from '@/shared/utils/cn'
import { Button } from '@/shared/components/ui/Button'
import type { WeeklyReportView, RatingLevel } from '../types'
import { FeedbackForm } from './FeedbackForm'

import { t } from '@/shared/i18n'
function formatDateRu(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00')
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

const RATING_LABELS: Record<RatingLevel, string> = {
    excellent: t('curator.feedback.excellent'),
    good: t('curator.feedback.good'),
    needs_improvement: t('curator.feedback.needsImprovement'),
}

const RATING_COLORS: Record<RatingLevel, string> = {
    excellent: 'text-success-fg',
    good: 'text-warning-fg',
    needs_improvement: 'text-danger-fg',
}

interface ReportCardProps {
    report: WeeklyReportView
    clientId: number
    onFeedbackSaved: () => void
}

export function ReportCard({ report, clientId, onFeedbackSaved }: ReportCardProps) {
    const [expanded, setExpanded] = useState(false)
    const [showFeedbackForm, setShowFeedbackForm] = useState(false)

    const feedback = report.curator_feedback

    return (
        <div className="overflow-hidden rounded-card border border-line bg-surface">
            <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                aria-expanded={expanded}
                className="min-h-14 w-full px-4 py-3 text-left transition-colors hover:bg-subtle/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
            >
                <div className="flex items-center justify-between gap-3">
                    <span className="type-headline tabular-nums text-fg">
                        {formatDateRu(report.week_start)} — {formatDateRu(report.week_end)}
                    </span>
                    <div className="flex items-center gap-2">
                        <span
                            className={cn(
                                'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                                report.has_feedback
                                    ? 'bg-success-soft text-success-fg'
                                    : 'bg-warning-soft text-warning-fg',
                            )}
                        >
                            {report.has_feedback ? t('curator.feedback.given') : t('curator.feedback.awaiting')}
                        </span>
                        <ChevronDown
                            className={cn(
                                'h-4 w-4 text-fg-subtle transition-transform',
                                expanded && 'rotate-180',
                            )}
                            aria-hidden="true"
                        />
                    </div>
                </div>
                <p className="mt-0.5 text-sm tabular-nums text-fg-muted">{t('curator.feedback.week', { week: report.week_number })}</p>
            </button>

            {expanded && (
                <div className="space-y-3 border-t border-line px-4 pb-4 pt-3">
                    {/* Summary data */}
                    {report.summary && Object.keys(report.summary).length > 0 && (
                        <div className="space-y-1 text-sm tabular-nums text-fg-muted">
                            {Object.entries(report.summary).map(([key, value]) => (
                                <p key={key}>
                                    <span className="font-medium text-fg">{key}:</span>{' '}
                                    {String(value)}
                                </p>
                            ))}
                        </div>
                    )}

                    {/* Feedback display */}
                    {feedback ? (
                        <div className="space-y-2 rounded-tile bg-subtle p-4">
                            <h4 className="type-overline text-fg-subtle">{t('curator.feedback.heading')}</h4>
                            {feedback.nutrition && (
                                <div className="text-sm">
                                    <span className="text-fg-muted">{t('curator.feedback.nutritionLabel')}</span>
                                    <span className={cn('font-medium', RATING_COLORS[feedback.nutrition.rating])}>
                                        {RATING_LABELS[feedback.nutrition.rating]}
                                    </span>
                                    {feedback.nutrition.comment && (
                                        <span className="text-fg-muted"> — {feedback.nutrition.comment}</span>
                                    )}
                                </div>
                            )}
                            {feedback.activity && (
                                <div className="text-sm">
                                    <span className="text-fg-muted">{t('curator.feedback.activityLabel')}</span>
                                    <span className={cn('font-medium', RATING_COLORS[feedback.activity.rating])}>
                                        {RATING_LABELS[feedback.activity.rating]}
                                    </span>
                                    {feedback.activity.comment && (
                                        <span className="text-fg-muted"> — {feedback.activity.comment}</span>
                                    )}
                                </div>
                            )}
                            {feedback.water && (
                                <div className="text-sm">
                                    <span className="text-fg-muted">{t('curator.feedback.waterLabel')}</span>
                                    <span className={cn('font-medium', RATING_COLORS[feedback.water.rating])}>
                                        {RATING_LABELS[feedback.water.rating]}
                                    </span>
                                    {feedback.water.comment && (
                                        <span className="text-fg-muted"> — {feedback.water.comment}</span>
                                    )}
                                </div>
                            )}
                            <p className="type-quote pt-1 text-fg">{feedback.summary}</p>
                            {feedback.recommendations && (
                                <p className="text-sm text-fg-muted">{feedback.recommendations}</p>
                            )}
                        </div>
                    ) : (
                        <Button type="button" variant="secondary" onClick={() => setShowFeedbackForm(true)}>
                            <MessageSquare className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                            {t('curator.feedback.give')}
                        </Button>
                    )}
                </div>
            )}

            {showFeedbackForm && (
                <FeedbackForm
                    clientId={clientId}
                    reportId={report.id}
                    onClose={() => setShowFeedbackForm(false)}
                    onSaved={() => {
                        setShowFeedbackForm(false)
                        onFeedbackSaved()
                    }}
                />
            )}
        </div>
    )
}
