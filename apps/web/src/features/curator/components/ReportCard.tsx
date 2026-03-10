'use client'

import { useState } from 'react'
import { ChevronDown, MessageSquare } from 'lucide-react'
import { cn } from '@/shared/utils/cn'
import type { WeeklyReportView, RatingLevel } from '../types'
import { FeedbackForm } from './FeedbackForm'

function formatDateRu(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00')
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

const RATING_LABELS: Record<RatingLevel, string> = {
    excellent: 'Отлично',
    good: 'Хорошо',
    needs_improvement: 'Нужно улучшить',
}

const RATING_COLORS: Record<RatingLevel, string> = {
    excellent: 'text-green-600',
    good: 'text-yellow-600',
    needs_improvement: 'text-red-600',
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
        <div className="rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
            <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors"
            >
                <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-900">
                        {formatDateRu(report.week_start)} — {formatDateRu(report.week_end)}
                    </span>
                    <div className="flex items-center gap-2">
                        <span
                            className={cn(
                                'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                                report.has_feedback
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-yellow-100 text-yellow-800',
                            )}
                        >
                            {report.has_feedback ? 'Обратная связь дана' : 'Ожидает обратной связи'}
                        </span>
                        <ChevronDown
                            className={cn(
                                'h-4 w-4 text-gray-400 transition-transform',
                                expanded && 'rotate-180',
                            )}
                        />
                    </div>
                </div>
                <p className="text-xs text-gray-500 mt-1">Неделя {report.week_number}</p>
            </button>

            {expanded && (
                <div className="px-4 pb-4 border-t border-gray-100 space-y-3 pt-3">
                    {/* Summary data */}
                    {report.summary && Object.keys(report.summary).length > 0 && (
                        <div className="text-xs text-gray-600 space-y-1">
                            {Object.entries(report.summary).map(([key, value]) => (
                                <p key={key}>
                                    <span className="font-medium text-gray-700">{key}:</span>{' '}
                                    {String(value)}
                                </p>
                            ))}
                        </div>
                    )}

                    {/* Feedback display */}
                    {feedback ? (
                        <div className="space-y-2 rounded-lg bg-gray-50 p-3">
                            <h4 className="text-xs font-semibold text-gray-700">Обратная связь</h4>
                            {feedback.nutrition && (
                                <div className="text-xs">
                                    <span className="text-gray-500">Питание: </span>
                                    <span className={RATING_COLORS[feedback.nutrition.rating]}>
                                        {RATING_LABELS[feedback.nutrition.rating]}
                                    </span>
                                    {feedback.nutrition.comment && (
                                        <span className="text-gray-500"> — {feedback.nutrition.comment}</span>
                                    )}
                                </div>
                            )}
                            {feedback.activity && (
                                <div className="text-xs">
                                    <span className="text-gray-500">Активность: </span>
                                    <span className={RATING_COLORS[feedback.activity.rating]}>
                                        {RATING_LABELS[feedback.activity.rating]}
                                    </span>
                                    {feedback.activity.comment && (
                                        <span className="text-gray-500"> — {feedback.activity.comment}</span>
                                    )}
                                </div>
                            )}
                            {feedback.water && (
                                <div className="text-xs">
                                    <span className="text-gray-500">Вода: </span>
                                    <span className={RATING_COLORS[feedback.water.rating]}>
                                        {RATING_LABELS[feedback.water.rating]}
                                    </span>
                                    {feedback.water.comment && (
                                        <span className="text-gray-500"> — {feedback.water.comment}</span>
                                    )}
                                </div>
                            )}
                            <p className="text-xs text-gray-700 mt-2">{feedback.summary}</p>
                            {feedback.recommendations && (
                                <p className="text-xs text-gray-500 italic">{feedback.recommendations}</p>
                            )}
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setShowFeedbackForm(true)}
                            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
                        >
                            <MessageSquare className="h-4 w-4" />
                            Дать обратную связь
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
