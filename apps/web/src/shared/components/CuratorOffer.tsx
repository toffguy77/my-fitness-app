'use client'

/**
 * CuratorOffer — предложение купить работу с куратором.
 *
 * Стоит там, где человек её ищет: на месте переписки и на карточке куратора.
 * Отключённая кнопка читалась бы как поломка и ничего не продавала бы, поэтому
 * вход остаётся живым, а различает состояния этот компонент.
 *
 * Два состояния различаются до конца. Тому, у кого куратора никогда не было,
 * нужно предложение купить; тому, у кого право кончилось, — предложение продлить
 * и ссылка на прежнюю переписку, потому что читать её можно всегда.
 *
 * Показ и переход к заявке записываются событиями: без них решение о цене и о
 * составе платной части принимается на глаз — сколько людей вообще хочет
 * куратора, неизвестно.
 */

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { MessageCircle, ClipboardList, FileText, ArrowRight } from 'lucide-react'
import toast from 'react-hot-toast'
import { messageForOr } from '@/shared/errors/apiErrors'
import { curatorAccessApi } from '@/shared/api/curatorAccess'
import { track } from '@/shared/analytics'
import { EVENTS } from '@/shared/analytics/events'
import { t } from '@/shared/i18n'
import { cn } from '@/shared/utils/cn'

/** Где показано предложение. Значение уходит и в событие, и в заявку. */
export type CuratorOfferPlace = 'chat' | 'dashboard'

const CAPTURE_SOURCE: Record<CuratorOfferPlace, string> = {
    chat: 'curator_offer_chat',
    dashboard: 'curator_offer_dashboard',
}

export interface CuratorOfferProps {
    place: CuratorOfferPlace
    /** Право кончилось, а не отсутствовало с самого начала. */
    expired?: boolean
    /** Последний день действия прежнего права, ГГГГ-ММ-ДД. */
    expiresAt?: string
    /** Компактный вид — для карточки на дашборде. */
    compact?: boolean
    className?: string
}

export function CuratorOffer({
    place,
    expired = false,
    expiresAt,
    compact = false,
    className,
}: CuratorOfferProps) {
    const [sending, setSending] = useState(false)
    const [sent, setSent] = useState(false)

    // Показ записывается один раз за появление: перерисовка — не второй показ.
    const shownRef = useRef(false)
    useEffect(() => {
        if (shownRef.current) return
        shownRef.current = true
        track(EVENTS.curatorOfferShown, { place })
    }, [place])

    const handleRequest = async () => {
        track(EVENTS.curatorOfferClicked, { place })
        setSending(true)
        try {
            await curatorAccessApi.requestCurator(CAPTURE_SOURCE[place])
            setSent(true)
            toast.success(t('dashboard.curatorOffer.requested'))
        } catch (err) {
            toast.error(messageForOr(err, t('dashboard.curatorOffer.requestFailed')))
        } finally {
            setSending(false)
        }
    }

    const title = expired
        ? t('dashboard.curatorOffer.expiredTitle')
        : t('dashboard.curatorOffer.title')
    const lead = expired
        ? t('dashboard.curatorOffer.expiredLead')
        : t('dashboard.curatorOffer.lead')
    const action = expired
        ? t('dashboard.curatorOffer.actionRenew')
        : t('dashboard.curatorOffer.action')

    return (
        <section
            className={cn(
                'rounded-xl border border-gray-100 bg-white shadow-sm',
                compact ? 'p-4' : 'p-6',
                className
            )}
            data-testid="curator-offer"
            aria-label={title}
        >
            <h2 className={cn('font-semibold text-gray-900', compact ? 'text-sm' : 'text-lg')}>
                {title}
            </h2>
            <p className={cn('mt-1 text-gray-600', compact ? 'text-xs' : 'text-sm')}>{lead}</p>

            {expired && expiresAt && (
                <p className="mt-1 text-xs text-gray-400">
                    {t('dashboard.curatorOffer.expiredOn', { date: expiresAt })}
                </p>
            )}

            {!compact && (
                <>
                    <ul className="mt-4 space-y-2 text-sm text-gray-700">
                        <li className="flex items-center gap-2">
                            <MessageCircle className="h-4 w-4 flex-shrink-0 text-gray-400" aria-hidden="true" />
                            {t('dashboard.curatorOffer.benefitChat')}
                        </li>
                        <li className="flex items-center gap-2">
                            <ClipboardList className="h-4 w-4 flex-shrink-0 text-gray-400" aria-hidden="true" />
                            {t('dashboard.curatorOffer.benefitPlan')}
                        </li>
                        <li className="flex items-center gap-2">
                            <FileText className="h-4 w-4 flex-shrink-0 text-gray-400" aria-hidden="true" />
                            {t('dashboard.curatorOffer.benefitReview')}
                        </li>
                    </ul>
                    <p className="mt-3 text-xs text-gray-500">
                        {t('dashboard.curatorOffer.freeNote')}
                    </p>
                </>
            )}

            <div className={cn('flex flex-wrap items-center gap-3', compact ? 'mt-3' : 'mt-5')}>
                <button
                    type="button"
                    onClick={handleRequest}
                    disabled={sending || sent}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                    {sent ? t('dashboard.curatorOffer.requested') : action}
                </button>

                {/* Цена живёт на одной странице: повторённое число расходится, и
                    какое из двух обязательство — неизвестно. */}
                <Link
                    href="/pricing"
                    className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
                >
                    {t('dashboard.curatorOffer.pricing')}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
            </div>
        </section>
    )
}
