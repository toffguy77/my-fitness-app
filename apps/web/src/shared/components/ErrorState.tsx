'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { Button } from '@/shared/components/ui/Button'

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
    retryLabel = 'Повторить',
    variant = 'page',
    showHomeLink = true,
    debugDetail,
}: ErrorStateProps) {
    const isPage = variant === 'page'

    // Спокойно, без красного: сбой — не вина человека. Заголовок засечками,
    // повтор — второстепенной кнопкой (терракота — для главного действия
    // экрана, а здесь его нет), путь домой — ссылкой.
    return (
        <div
            role="alert"
            className={
                isPage
                    ? 'flex min-h-[60vh] items-center justify-center px-screen-x'
                    : 'rounded-card border border-line bg-surface p-5'
            }
        >
            <div className={isPage ? 'w-full max-w-md text-center' : 'text-center'}>
                <h2 className={isPage ? 'type-title-2 text-fg' : 'type-title-3 text-fg'}>
                    {title}
                </h2>
                <p className="mt-2 text-sm text-fg-muted">{description}</p>

                {debugDetail && process.env.NODE_ENV !== 'production' && (
                    <pre className="mt-4 max-h-48 overflow-auto rounded-tile bg-subtle p-3 text-left text-xs text-fg">
                        {debugDetail}
                    </pre>
                )}

                <div className={isPage ? 'mt-6 flex flex-wrap items-center justify-center gap-3' : 'mt-4 flex flex-wrap items-center justify-center gap-3'}>
                    {onRetry && (
                        <Button type="button" variant="secondary" onClick={onRetry}>
                            {retryLabel}
                        </Button>
                    )}
                    {showHomeLink && (
                        <Link
                            href="/"
                            className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-primary hover:underline"
                        >
                            На главную
                        </Link>
                    )}
                </div>

                {errorId && (
                    <p className="mt-4 type-caption text-fg-subtle">
                        Код ошибки: <span className="font-mono tabular-nums">{errorId}</span>
                    </p>
                )}
            </div>
        </div>
    )
}
