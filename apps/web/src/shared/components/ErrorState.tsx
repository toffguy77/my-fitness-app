'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { CloudAlert } from 'lucide-react'
import { buttonBase, buttonSizes, buttonVariants, Button } from '@/shared/components/ui/Button'
import { t } from '@/shared/i18n'
import { cn } from '@/shared/utils/cn'

interface ErrorStateProps {
    title?: string
    description?: ReactNode
    /** Shown to the user and present in the log entry, so support can find it. */
    errorId?: string
    onRetry?: () => void
    retryLabel?: string
    /** Full-screen for a route-level failure, compact for a single widget. */
    variant?: 'page' | 'inline'
    showHomeLink?: boolean
    /** Developer detail, rendered only outside production. */
    debugDetail?: string
}

export function ErrorState({
    title = 'Что-то пошло не так',
    description = 'Мы уже знаем о проблеме. Попробуйте повторить — обычно это помогает.',
    errorId,
    onRetry,
    retryLabel = t('common.retry'),
    variant = 'page',
    showHomeLink = true,
    debugDetail,
}: ErrorStateProps) {
    const isPage = variant === 'page'

    // Спокойное пустое состояние, без красного: сбой — не вина человека.
    // Значок в нейтральном круге, заголовок засечками, пояснение приглушённым.
    //
    // На экране ошибки маршрута повтор — единственное, что здесь можно
    // сделать, поэтому он главный (терракота), а путь домой — контуром рядом.
    // Во встроенном варианте блок — часть живой страницы со своим главным
    // действием, и повтор там второстепенный.
    return (
        <div
            role="alert"
            className={
                isPage
                    ? 'flex min-h-[60vh] items-center justify-center bg-canvas px-screen-x py-10'
                    : 'rounded-card border border-line bg-surface p-5'
            }
        >
            <div className={isPage ? 'flex w-full max-w-md flex-col items-center text-center' : 'flex flex-col items-center text-center'}>
                <span
                    className={cn(
                        'flex items-center justify-center rounded-full bg-subtle text-fg-muted',
                        isPage ? 'mb-5 h-16 w-16' : 'mb-3 h-11 w-11',
                    )}
                    aria-hidden="true"
                >
                    <CloudAlert className={isPage ? 'h-7 w-7' : 'h-5 w-5'} strokeWidth={1.8} />
                </span>

                <h2 className={isPage ? 'type-title-2 text-fg' : 'type-title-3 text-fg'}>
                    {title}
                </h2>
                <p className={cn('mt-2 text-fg-muted', isPage ? 'type-body' : 'text-sm')}>{description}</p>

                {debugDetail && process.env.NODE_ENV !== 'production' && (
                    <pre className="mt-4 max-h-48 w-full overflow-auto rounded-tile bg-subtle p-3 text-left text-xs text-fg">
                        {debugDetail}
                    </pre>
                )}

                {(onRetry || showHomeLink) && (
                    <div
                        className={
                            isPage
                                ? 'mt-6 flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-center sm:gap-3'
                                : 'mt-4 flex flex-wrap items-center justify-center gap-3'
                        }
                    >
                        {onRetry && (
                            <Button
                                type="button"
                                variant={isPage ? 'primary' : 'secondary'}
                                size={isPage ? 'lg' : 'md'}
                                onClick={onRetry}
                            >
                                {retryLabel}
                            </Button>
                        )}
                        {showHomeLink && (
                            <Link
                                href="/"
                                className={cn(
                                    buttonBase,
                                    // Без повтора дом — единственное действие и
                                    // главное; рядом с повтором — второстепенное.
                                    onRetry ? buttonVariants.secondary : buttonVariants.primary,
                                    isPage ? buttonSizes.lg : buttonSizes.md,
                                )}
                            >
                                На главную
                            </Link>
                        )}
                    </div>
                )}

                {errorId && (
                    <p className="mt-4 type-caption text-fg-subtle">
                        Код ошибки: <span className="font-mono tabular-nums">{errorId}</span>
                    </p>
                )}
            </div>
        </div>
    )
}
