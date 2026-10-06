'use client'

/**
 * CuratorCard — куратор на дашборде клиента.
 *
 * Куратор — то, чем продукт отличается от бесплатного счётчика калорий, и до
 * этого блока он лежал в самом низу страницы, свёрнутый, а у новичка не
 * рисовался вовсе: отзыв на недельный отчёт без отчёта не существует.
 *
 * Состояния различаются намеренно и до конца:
 *   — куратор есть: имя, изображение, последнее сообщение, непрочитанные;
 *   — права на куратора нет: описание услуги и заявка. Это штатное состояние
 *     бесплатного пользователя, и предложение обратиться в поддержку здесь
 *     отправляло бы человека спрашивать о том, что должно быть написано на
 *     месте;
 *   — право есть, а куратор не назначен: так и сказано, плюс поддержка. Это
 *     дефект — человек заплатил и остался без куратора. Молчащая карточка
 *     спрятала бы его, как прятала прежде дефект назначения при регистрации;
 *   — ответ не получен: ошибка с повтором. «Куратора нет» — утверждение о
 *     учётной записи, и на упавшем запросе оно было бы ложью.
 */

import { memo } from 'react'
import Link from 'next/link'
import { MessageCircle, AlertCircle, UserX } from 'lucide-react'
import { Card, CardContent } from '@/shared/components/ui/Card'
import { cn } from '@/shared/utils/cn'
import { t } from '@/shared/i18n'
import { CuratorOffer } from '@/shared/components/CuratorOffer'
import type { CuratorAccessState, CuratorPresence } from '../types'

export interface CuratorCardProps {
    curator: CuratorPresence | null
    /**
     * Право на куратора. Отсутствие означает «ответ ещё не получен», а не
     * «права нет»: предложение купить на неизвестном состоянии было бы ложью.
     */
    access?: CuratorAccessState
    isLoading: boolean
    hasError: boolean
    onRetry: () => void
    className?: string
}

/** Инициалы имени — на случай, когда изображения нет. */
function initialsOf(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return '?'
    return parts.slice(0, 2).map((part) => part[0]!.toUpperCase()).join('')
}

/**
 * Аватар куратора.
 *
 * Изображения может не быть: способность `profile_avatars` отключаема, и тогда
 * `avatar_url` приходит пустым. Ссылка на несуществующее изображение дала бы
 * битую картинку, поэтому вместо неё инициалы.
 */
const CuratorAvatar = memo(function CuratorAvatar({
    name,
    avatarUrl,
}: {
    name: string
    avatarUrl?: string
}) {
    if (avatarUrl) {
        return (
            // eslint-disable-next-line @next/next/no-img-element -- адрес приходит из S3, домен заранее неизвестен
            <img
                src={avatarUrl}
                alt={name}
                className="h-12 w-12 flex-shrink-0 rounded-full object-cover"
            />
        )
    }

    return (
        <div
            className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary"
            aria-hidden="true"
            data-testid="curator-initials"
        >
            {initialsOf(name)}
        </div>
    )
})

export const CuratorCard = memo(function CuratorCard({
    curator,
    access,
    isLoading,
    hasError,
    onRetry,
    className,
}: CuratorCardProps) {
    if (isLoading) {
        return (
            <Card className={cn('w-full', className)} variant="bordered">
                <CardContent className="flex items-center gap-3 py-4" role="status">
                    <div className="h-12 w-12 flex-shrink-0 animate-pulse rounded-full bg-subtle" />
                    <div className="flex-1 space-y-2">
                        <div className="h-4 w-32 animate-pulse rounded bg-subtle" />
                        <div className="h-3 w-48 animate-pulse rounded bg-subtle" />
                    </div>
                    <span className="sr-only">{t('common.loading')}</span>
                </CardContent>
            </Card>
        )
    }

    if (hasError) {
        return (
            <Card className={cn('w-full', className)} variant="bordered" data-testid="curator-card-error">
                <CardContent className="flex items-center justify-between gap-3 py-4" role="status">
                    <span className="flex items-center gap-2 text-sm text-fg">
                        <AlertCircle className="h-4 w-4 flex-shrink-0 text-fg-subtle" aria-hidden="true" />
                        {t('dashboard.curatorCard.loadFailed')}
                    </span>
                    <button
                        type="button"
                        onClick={onRetry}
                        className="text-sm font-semibold text-primary underline hover:text-primary"
                    >
                        {t('dashboard.curatorCard.retry')}
                    </button>
                </CardContent>
            </Card>
        )
    }

    // Права нет — значит куратора не покупали или оплата кончилась. Предложение
    // стоит раньше проверки на наличие куратора: у того, чьё право кончилось,
    // куратор в ответе ещё есть, и без этой ветки он увидел бы обычную карточку
    // с переписки, в которую не может писать.
    if (access && !access.allowed) {
        return (
            <CuratorOffer
                place="dashboard"
                expired={access.expired}
                expiresAt={access.expires_at}
                compact
                className={cn('w-full', className)}
            />
        )
    }

    if (!curator) {
        return (
            <Card className={cn('w-full', className)} variant="bordered" data-testid="curator-card">
                <CardContent className="flex items-center gap-3 py-4">
                    <div
                        className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-subtle"
                        aria-hidden="true"
                    >
                        <UserX className="h-5 w-5 text-fg-subtle" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-fg">
                            {t('dashboard.curatorCard.notAssigned')}
                        </p>
                        <p className="text-xs text-fg-muted">
                            {t('dashboard.curatorCard.notAssignedHint')}
                        </p>
                    </div>
                </CardContent>
            </Card>
        )
    }

    const lastMessage = curator.last_message

    return (
        <Card className={cn('w-full', className)} variant="bordered" data-testid="curator-card">
            <CardContent className="p-0">
                <Link
                    href="/chat"
                    aria-label={t('dashboard.curatorCard.openChat')}
                    className="flex items-center gap-3 rounded-lg px-4 py-4 transition-colors hover:bg-canvas"
                >
                    <CuratorAvatar name={curator.name} avatarUrl={curator.avatar_url} />

                    <div className="min-w-0 flex-1">
                        {/* Подпись отдельной строкой, а не рядом с именем: на
                            узком экране она отнимала у имени половину ширины и
                            сама переносилась на две строки. */}
                        <p className="text-[11px] uppercase tracking-wide text-fg-subtle">
                            {t('dashboard.curatorCard.title')}
                        </p>
                        <p className="truncate text-sm font-semibold text-fg">
                            {curator.name}
                        </p>

                        {lastMessage ? (
                            <p className="truncate text-xs text-fg-muted">
                                {/* Кто написал — обязательно: «вы» и «куратор» в
                                    одной строке без пометки читаются наоборот. */}
                                {!lastMessage.from_curator && (
                                    <span className="font-medium text-fg-muted">
                                        {t('dashboard.curatorCard.youWrote')}{' '}
                                    </span>
                                )}
                                {lastMessage.text}
                            </p>
                        ) : (
                            <p className="truncate text-xs text-fg-muted">
                                {t('dashboard.curatorCard.noMessages')}
                            </p>
                        )}
                    </div>

                    {curator.unread_count > 0 && (
                        <span
                            className="flex h-6 min-w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-on-primary"
                            aria-label={t('dashboard.curatorCard.unread', { count: curator.unread_count })}
                        >
                            {curator.unread_count}
                        </span>
                    )}

                    <MessageCircle className="h-5 w-5 flex-shrink-0 text-fg-subtle" aria-hidden="true" />
                </Link>
            </CardContent>
        </Card>
    )
})
