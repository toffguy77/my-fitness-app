'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'

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

    return (
        <div
            role="alert"
            className={
                isPage
                    ? 'flex min-h-[60vh] items-center justify-center px-4'
                    : 'rounded-lg border border-gray-200 bg-white p-6'
            }
        >
            <div className={isPage ? 'w-full max-w-md text-center' : 'text-center'}>
                <h2 className={isPage ? 'text-xl font-semibold text-gray-900' : 'text-base font-medium text-gray-900'}>
                    {title}
                </h2>
                <p className="mt-2 text-sm text-gray-600">{description}</p>

                {debugDetail && process.env.NODE_ENV !== 'production' && (
                    <pre className="mt-4 max-h-48 overflow-auto rounded bg-gray-100 p-3 text-left text-xs text-gray-700">
                        {debugDetail}
                    </pre>
                )}

                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                    {onRetry && (
                        <button
                            type="button"
                            onClick={onRetry}
                            className="rounded-md bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
                        >
                            {retryLabel}
                        </button>
                    )}
                    {showHomeLink && (
                        <Link href="/" className="text-sm text-blue-600 hover:underline">
                            На главную
                        </Link>
                    )}
                </div>

                {errorId && (
                    <p className="mt-4 text-xs text-gray-400">
                        Код ошибки: <span className="font-mono">{errorId}</span>
                    </p>
                )}
            </div>
        </div>
    )
}
