'use client'

import { useState } from 'react'
import { ChevronDown, MessageSquare } from 'lucide-react'
import { cn } from '@/shared/utils/cn'
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
        <div className="rounded-xl bg-surface shadow-sm border border-line overflow-hidden">
            <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="w-full text-left px-4 py-3 hover:bg-canvas transition-colors"
            >
                <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-fg">
                        {formatDateRu(report.week_start)} — {formatDateRu(report.week_end)}
                    </span>
                    <div className="flex items-center gap-2">
                        <span
                            className={cn(
                                'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
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
                        />
                    </div>
                </div>
                <p className="text-xs text-fg-muted mt-1">{t('curator.feedback.week', { week: report.week_number })}</p>
            </button>

            {expanded && (
                <div className="px-4 pb-4 border-t border-line space-y-3 pt-3">
                    {/* Summary data */}
                    {report.summary && Object.keys(report.summary).length > 0 && (
                        <div className="text-xs text-fg-muted space-y-1">
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
                        <div className="space-y-2 rounded-lg bg-canvas p-3">
                            <h4 className="text-xs font-semibold text-fg">{t('curator.feedback.heading')}</h4>
                            {feedback.nutrition && (
                                <div className="text-xs">
                                    <span className="text-fg-muted">{t('curator.feedback.nutritionLabel')}</span>
                                    <span className={RATING_COLORS[feedback.nutrition.rating]}>
                                        {RATING_LABELS[feedback.nutrition.rating]}
                                    </span>
                                    {feedback.nutrition.comment && (
                                        <span className="text-fg-muted"> — {feedback.nutrition.comment}</span>
                                    )}
                                </div>
                            )}
                            {feedback.activity && (
                                <div className="text-xs">
                                    <span className="text-fg-muted">{t('curator.feedback.activityLabel')}</span>
                                    <span className={RATING_COLORS[feedback.activity.rating]}>
                                        {RATING_LABELS[feedback.activity.rating]}
                                    </span>
                                    {feedback.activity.comment && (
                                        <span className="text-fg-muted"> — {feedback.activity.comment}</span>
                                    )}
                                </div>
                            )}
                            {feedback.water && (
                                <div className="text-xs">
                                    <span className="text-fg-muted">{t('curator.feedback.waterLabel')}</span>
                                    <span className={RATING_COLORS[feedback.water.rating]}>
                                        {RATING_LABELS[feedback.water.rating]}
                                    </span>
                                    {feedback.water.comment && (
                                        <span className="text-fg-muted"> — {feedback.water.comment}</span>
                                    )}
                                </div>
                            )}
                            <p className="text-xs text-fg mt-2">{feedback.summary}</p>
                            {feedback.recommendations && (
                                <p className="text-xs text-fg-muted italic">{feedback.recommendations}</p>
                            )}
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setShowFeedbackForm(true)}
                            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover transition-colors"
                        >
                            <MessageSquare className="h-4 w-4" />
                            {t('curator.feedback.give')}
                        </button>
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
