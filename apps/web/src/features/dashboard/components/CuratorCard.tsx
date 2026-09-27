'use client'

/**
 * CuratorCard — куратор на дашборде клиента.
 *
 * Куратор — то, чем продукт отличается от бесплатного счётчика калорий, и до
 * этого блока он лежал в самом низу страницы, свёрнутый, а у новичка не
 * рисовался вовсе: отзыв на недельный отчёт без отчёта не существует.
 *
 * Три состояния различаются намеренно и до конца:
 *   — куратор есть: имя, изображение, последнее сообщение, непрочитанные;
 *   — куратора нет: так и сказано. Молчащая карточка спрятала бы дефект, из-за
 *     которого путь регистрации, забывший назначить куратора, оставляет человека
 *     без него навсегда;
 *   — ответ не получен: ошибка с повтором. «Куратора нет» — утверждение о
 *     учётной записи, и на упавшем запросе оно было бы ложью.
 */

import { memo } from 'react'
import Link from 'next/link'
import { MessageCircle, AlertCircle, UserX } from 'lucide-react'
import { Card, CardContent } from '@/shared/components/ui/Card'
import { cn } from '@/shared/utils/cn'
import { t } from '@/shared/i18n'
import type { CuratorPresence } from '../types'

export interface CuratorCardProps {
    curator: CuratorPresence | null
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
            className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700"
            aria-hidden="true"
            data-testid="curator-initials"
        >
            {initialsOf(name)}
        </div>
    )
})

export const CuratorCard = memo(function CuratorCard({
    curator,
    isLoading,
    hasError,
    onRetry,
    className,
}: CuratorCardProps) {
    if (isLoading) {
        return (
            <Card className={cn('w-full', className)} variant="bordered">
                <CardContent className="flex items-center gap-3 py-4" role="status">
                    <div className="h-12 w-12 flex-shrink-0 animate-pulse rounded-full bg-gray-200" />
                    <div className="flex-1 space-y-2">
                        <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
                        <div className="h-3 w-48 animate-pulse rounded bg-gray-100" />
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
                    <span className="flex items-center gap-2 text-sm text-gray-700">
                        <AlertCircle className="h-4 w-4 flex-shrink-0 text-gray-400" aria-hidden="true" />
                        {t('dashboard.curatorCard.loadFailed')}
                    </span>
                    <button
                        type="button"
                        onClick={onRetry}
                        className="text-sm font-semibold text-blue-600 underline hover:text-blue-700"
                    >
                        {t('dashboard.curatorCard.retry')}
                    </button>
                </CardContent>
            </Card>
        )
    }

    if (!curator) {
        return (
            <Card className={cn('w-full', className)} variant="bordered" data-testid="curator-card">
                <CardContent className="flex items-center gap-3 py-4">
                    <div
                        className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-gray-100"
                        aria-hidden="true"
                    >
                        <UserX className="h-5 w-5 text-gray-400" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900">
                            {t('dashboard.curatorCard.notAssigned')}
                        </p>
                        <p className="text-xs text-gray-500">
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
                    className="flex items-center gap-3 rounded-lg px-4 py-4 transition-colors hover:bg-gray-50"
                >
                    <CuratorAvatar name={curator.name} avatarUrl={curator.avatar_url} />

                    <div className="min-w-0 flex-1">
                        {/* Подпись отдельной строкой, а не рядом с именем: на
                            узком экране она отнимала у имени половину ширины и
                            сама переносилась на две строки. */}
                        <p className="text-[11px] uppercase tracking-wide text-gray-400">
                            {t('dashboard.curatorCard.title')}
                        </p>
                        <p className="truncate text-sm font-semibold text-gray-900">
                            {curator.name}
                        </p>

                        {lastMessage ? (
                            <p className="truncate text-xs text-gray-600">
                                {/* Кто написал — обязательно: «вы» и «куратор» в
                                    одной строке без пометки читаются наоборот. */}
                                {!lastMessage.from_curator && (
                                    <span className="font-medium text-gray-500">
                                        {t('dashboard.curatorCard.youWrote')}{' '}
                                    </span>
                                )}
                                {lastMessage.text}
                            </p>
                        ) : (
                            <p className="truncate text-xs text-gray-500">
                                {t('dashboard.curatorCard.noMessages')}
                            </p>
                        )}
                    </div>

                    {curator.unread_count > 0 && (
                        <span
                            className="flex h-6 min-w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 px-1.5 text-xs font-semibold text-white"
                            aria-label={t('dashboard.curatorCard.unread', { count: curator.unread_count })}
                        >
                            {curator.unread_count}
                        </span>
                    )}

                    <MessageCircle className="h-5 w-5 flex-shrink-0 text-gray-300" aria-hidden="true" />
                </Link>
            </CardContent>
        </Card>
    )
})
