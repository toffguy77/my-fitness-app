'use client'

import { Users, Target, MessageSquare, CheckSquare } from 'lucide-react'
import { cn } from '@/shared/utils/cn'
import type { AnalyticsSummary } from '../types'

import { t } from '@/shared/i18n'
interface AnalyticsSummaryCardsProps {
    analytics: AnalyticsSummary
}

function getKbzhuColor(percent: number): string {
    if (percent >= 90 && percent <= 110) return 'text-green-600'
    if (percent >= 70 && percent < 90) return 'text-yellow-600'
    return 'text-red-600'
}

export function AnalyticsSummaryCards({ analytics }: AnalyticsSummaryCardsProps) {
    return (
        <div className="grid grid-cols-2 gap-3">
            {/* Active clients */}
            <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
                <div className="flex items-center gap-2 mb-2">
                    <Users className="h-4 w-4 text-blue-500" />
                    <span className="text-xs text-gray-500">{t('curator.analytics.activeClients')}</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{analytics.total_clients}</p>
                {analytics.attention_clients > 0 ? (
                    <p className="text-xs text-red-600 mt-1">
                        {t('curator.analytics.needAttention', { count: analytics.attention_clients })}
                    </p>
                ) : (
                    <p className="text-xs text-gray-400 mt-1">{t('curator.analytics.allFine')}</p>
                )}
            </div>

            {/* KBZHU completion */}
            <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
                <div className="flex items-center gap-2 mb-2">
                    <Target className="h-4 w-4 text-blue-500" />
                    <span className="text-xs text-gray-500">{t('curator.analytics.macrosDone')}</span>
                </div>
                <p className={cn('text-2xl font-bold', getKbzhuColor(analytics.avg_kbzhu_percent))}>
                    {analytics.avg_kbzhu_percent}%
                </p>
                <p className="text-xs text-gray-400 mt-1">{t('curator.analytics.averagePerClient')}</p>
            </div>

            {/* Messages */}
            <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
                <div className="flex items-center gap-2 mb-2">
                    <MessageSquare className="h-4 w-4 text-blue-500" />
                    <span className="text-xs text-gray-500">{t('curator.analytics.messages')}</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{analytics.total_unread}</p>
                <p className="text-xs text-gray-400 mt-1">
                    {t('curator.analytics.fromClients', { count: analytics.clients_waiting })}
                </p>
            </div>

            {/* Tasks */}
            <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
                <div className="flex items-center gap-2 mb-2">
                    <CheckSquare className="h-4 w-4 text-blue-500" />
                    <span className="text-xs text-gray-500">{t('curator.analytics.tasks')}</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{analytics.active_tasks}</p>
                <div className="flex flex-wrap gap-x-2 mt-1">
                    {analytics.overdue_tasks > 0 && (
                        <span className="text-xs text-red-600">
                            {t('curator.analytics.overdue', { count: analytics.overdue_tasks })}
                        </span>
                    )}
                    <span className="text-xs text-green-600">
                        {t('curator.analytics.today', { count: analytics.completed_today })}
                    </span>
                </div>
            </div>
        </div>
    )
}
