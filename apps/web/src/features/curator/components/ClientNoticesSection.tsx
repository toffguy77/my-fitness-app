'use client'

/**
 * What the client has been told lately, and how it reached them.
 *
 * It answers a question a curator otherwise has to guess at: whether silence
 * means "they saw it and did not reply" or "they were never told". Those look
 * identical from the outside and call for opposite responses.
 */

import { useEffect, useState } from 'react'

import { curatorApi, type ClientNotice } from '../api/curatorApi'

import { t } from '@/shared/i18n'
const TYPE_LABELS: Record<string, string> = {
    trainer_feedback: t('curator.notices.trainer_feedback'),
    feedback_received: t('curator.notices.feedback_received'),
    plan_updated: t('curator.notices.plan_updated'),
    task_assigned: t('curator.notices.task_assigned'),
    task_overdue: t('curator.notices.task_overdue'),
    achievement: t('curator.notices.achievement'),
    reminder: t('curator.notices.reminder'),
    new_content: t('curator.notices.new_content'),
    general: t('curator.notices.general'),
}

/** How one channel's outcome reads. */
function deliveryLabel(channel: string, status: string): string | null {
    if (channel === 'app') return null // The list itself is the app delivery.
    if (channel !== 'email') return null
    switch (status) {
        case 'sent':
            return t('curator.notices.emailSent')
        case 'pending':
            return t('curator.notices.emailPending')
        case 'failed':
            return t('curator.notices.emailFailed')
        case 'skipped':
            return t('curator.notices.emailSkipped')
        default:
            return null
    }
}

function formatWhen(iso: string): string {
    return new Date(iso).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    })
}

export function ClientNoticesSection({ clientId }: { clientId: number }) {
    const [notices, setNotices] = useState<ClientNotice[] | null>(null)
    const [failed, setFailed] = useState(false)

    useEffect(() => {
        curatorApi
            .getClientNotices(clientId)
            .then(setNotices)
            .catch(() => setFailed(true))
    }, [clientId])

    if (failed) {
        return (
            <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
                <p className="text-sm text-gray-500">{t('curator.notices.loadFailed')}</p>
            </div>
        )
    }

    if (!notices) return null

    return (
        <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm" data-testid="client-notices">
            <p className="mb-3 text-sm font-medium text-gray-500">{t('curator.notices.heading')}</p>

            {notices.length === 0 ? (
                <p className="text-sm text-gray-500">{t('curator.notices.empty')}</p>
            ) : (
                <div className="space-y-0">
                    {notices.map((notice, index) => {
                        const marks = notice.deliveries
                            .map((d) => deliveryLabel(d.channel, d.status))
                            .filter(Boolean)

                        return (
                            <div
                                key={notice.id}
                                className={`py-3 ${
                                    index < notices.length - 1 ? 'border-b border-gray-100' : ''
                                }`}
                            >
                                <div className="flex items-baseline justify-between gap-3">
                                    <span className="text-gray-900">{notice.title}</span>
                                    <span className="shrink-0 text-xs text-gray-400">
                                        {formatWhen(notice.createdAt)}
                                    </span>
                                </div>
                                <p className="mt-0.5 text-xs text-gray-500">
                                    {TYPE_LABELS[notice.type] ?? notice.type}
                                    {' · '}
                                    {notice.readAt ? t('curator.notices.read') : t('curator.notices.unread')}
                                    {marks.length > 0 && ` · ${marks.join(', ')}`}
                                </p>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

ClientNoticesSection.displayName = 'ClientNoticesSection'
