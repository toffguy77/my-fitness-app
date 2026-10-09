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
import { Button } from '@/shared/components/ui/Button'

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

    // Предложение куратора — его голос, а не рекламный баннер: тёмная
    // поверхность `coach` и заголовок засечками, как у карточки куратора на
    // дашборде. Заявка — единственное главное действие блока.
    return (
        <section
            className={cn(
                'rounded-card bg-coach text-on-coach',
                compact ? 'p-[18px]' : 'p-5',
                className
            )}
            data-testid="curator-offer"
            aria-label={title}
        >
            <h2 className={cn('text-on-coach', compact ? 'type-title-3' : 'type-title-2')}>
                {title}
            </h2>
            <p className={cn('mt-1.5 text-on-coach-muted', compact ? 'text-sm' : 'text-[15px] leading-[22px]')}>{lead}</p>

            {expired && expiresAt && (
                <p className="mt-1.5 type-caption tabular-nums text-on-coach-muted">
                    {t('dashboard.curatorOffer.expiredOn', { date: expiresAt })}
                </p>
            )}

            {!compact && (
                <>
                    <ul className="mt-4 space-y-2.5 text-[15px] text-on-coach">
                        <li className="flex items-center gap-2.5">
                            <MessageCircle className="h-[18px] w-[18px] flex-shrink-0 text-on-coach-muted" strokeWidth={1.8} aria-hidden="true" />
                            {t('dashboard.curatorOffer.benefitChat')}
                        </li>
                        <li className="flex items-center gap-2.5">
                            <ClipboardList className="h-[18px] w-[18px] flex-shrink-0 text-on-coach-muted" strokeWidth={1.8} aria-hidden="true" />
                            {t('dashboard.curatorOffer.benefitPlan')}
                        </li>
                        <li className="flex items-center gap-2.5">
                            <FileText className="h-[18px] w-[18px] flex-shrink-0 text-on-coach-muted" strokeWidth={1.8} aria-hidden="true" />
                            {t('dashboard.curatorOffer.benefitReview')}
                        </li>
                    </ul>
                    <p className="mt-3 type-caption text-on-coach-muted">
                        {t('dashboard.curatorOffer.freeNote')}
                    </p>
                </>
            )}

            <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-2', compact ? 'mt-3' : 'mt-5')}>
                <Button
                    type="button"
                    onClick={handleRequest}
                    disabled={sending || sent}
                    // «Заявка отправлена — мы свяжемся с вами» длиннее узкой
                    // карточки: подпись переносится, а не выходит за край.
                    className="h-auto min-h-11 whitespace-normal py-2.5 text-center"
                >
                    {sent ? t('dashboard.curatorOffer.requested') : action}
                </Button>

                {/* Цена живёт на одной странице: повторённое число расходится, и
                    какое из двух обязательство — неизвестно. */}
                <Link
                    href="/pricing"
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-full text-[15px] font-semibold text-on-coach hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
                >
                    {t('dashboard.curatorOffer.pricing')}
                    <ArrowRight className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                </Link>
            </div>
        </section>
    )
}
