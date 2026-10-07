'use client'

import { Users, Target, MessageSquare, CheckSquare } from 'lucide-react'
import { cn } from '@/shared/utils/cn'
import type { AnalyticsSummary } from '../types'

import { t } from '@/shared/i18n'
interface AnalyticsSummaryCardsProps {
    analytics: AnalyticsSummary
}

function getKbzhuColor(percent: number): string {
    if (percent >= 90 && percent <= 110) return 'text-success-fg'
    if (percent >= 70 && percent < 90) return 'text-warning-fg'
    return 'text-danger-fg'
}

export function AnalyticsSummaryCards({ analytics }: AnalyticsSummaryCardsProps) {
    return (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {/* Active clients */}
            <div className="rounded-card border border-line bg-surface p-4">
                <div className="flex items-center gap-2 mb-2">
                    <Users className="h-4 w-4 text-fg-subtle" strokeWidth={1.8} aria-hidden="true" />
                    <span className="text-[13px] text-fg-muted">{t('curator.analytics.activeClients')}</span>
                </div>
                <p className="type-num-l tabular-nums text-fg">{analytics.total_clients}</p>
                {analytics.attention_clients > 0 ? (
                    <p className="text-[13px] text-danger-fg mt-1">
                        {t('curator.analytics.needAttention', { count: analytics.attention_clients })}
                    </p>
                ) : (
                    <p className="text-[13px] text-fg-subtle mt-1">{t('curator.analytics.allFine')}</p>
                )}
            </div>

            {/* KBZHU completion */}
            <div className="rounded-card border border-line bg-surface p-4">
                <div className="flex items-center gap-2 mb-2">
                    <Target className="h-4 w-4 text-fg-subtle" strokeWidth={1.8} aria-hidden="true" />
                    <span className="text-[13px] text-fg-muted">{t('curator.analytics.macrosDone')}</span>
                </div>
                <p className={cn('type-num-l tabular-nums', getKbzhuColor(analytics.avg_kbzhu_percent))}>
                    {analytics.avg_kbzhu_percent}%
                </p>
                <p className="text-[13px] text-fg-subtle mt-1">{t('curator.analytics.averagePerClient')}</p>
            </div>

            {/* Messages */}
            <div className="rounded-card border border-line bg-surface p-4">
                <div className="flex items-center gap-2 mb-2">
                    <MessageSquare className="h-4 w-4 text-fg-subtle" strokeWidth={1.8} aria-hidden="true" />
                    <span className="text-[13px] text-fg-muted">{t('curator.analytics.messages')}</span>
                </div>
                <p className="type-num-l tabular-nums text-fg">{analytics.total_unread}</p>
                <p className="text-[13px] text-fg-subtle mt-1">
                    {t('curator.analytics.fromClients', { count: analytics.clients_waiting })}
                </p>
            </div>

            {/* Tasks */}
            <div className="rounded-card border border-line bg-surface p-4">
                <div className="flex items-center gap-2 mb-2">
                    <CheckSquare className="h-4 w-4 text-fg-subtle" strokeWidth={1.8} aria-hidden="true" />
                    <span className="text-[13px] text-fg-muted">{t('curator.analytics.tasks')}</span>
                </div>
                <p className="type-num-l tabular-nums text-fg">{analytics.active_tasks}</p>
                <div className="flex flex-wrap gap-x-2 mt-1">
                    {analytics.overdue_tasks > 0 && (
                        <span className="text-[13px] text-danger-fg">
                            {t('curator.analytics.overdue', { count: analytics.overdue_tasks })}
                        </span>
                    )}
                    <span className="text-[13px] text-success-fg">
                        {t('curator.analytics.today', { count: analytics.completed_today })}
                    </span>
                </div>
            </div>
        </div>
    )
}
