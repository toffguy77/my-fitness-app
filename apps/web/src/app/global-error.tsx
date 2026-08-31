'use client'

import { useEffect, useState } from 'react'
import { reportError } from '@/shared/errors/reportError'

/**
 * Last line of defence: an error in the root layout. Next.js replaces the whole
 * document here, so this file must render its own <html> and cannot rely on any
 * provider, style or component from the tree that just failed.
 */
export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    const [errorId, setErrorId] = useState<string>('')

    useEffect(() => {
        setErrorId(reportError(error, { source: 'global-error', digest: error.digest }))
    }, [error])

    return (
        <html lang="ru">
            <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#f9fafb' }}>
                <div
                    role="alert"
                    style={{
                        minHeight: '100vh',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '1rem',
                    }}
                >
                    <div style={{ maxWidth: '28rem', textAlign: 'center' }}>
                        <h1 style={{ fontSize: '1.25rem', color: '#111827' }}>Приложение не смогло загрузиться</h1>
                        <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#4b5563' }}>
                            Произошла ошибка, из-за которой страница не открылась. Попробуйте ещё раз.
                        </p>
                        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                            <button
                                type="button"
                                onClick={reset}
                                style={{
                                    background: '#2563eb',
                                    color: '#fff',
                                    border: 0,
                                    borderRadius: '0.375rem',
                                    padding: '0.5rem 1rem',
                                    cursor: 'pointer',
                                }}
                            >
                                Повторить
                            </button>
                            <a href="/" style={{ color: '#2563eb', fontSize: '0.875rem', alignSelf: 'center' }}>
                                На главную
                            </a>
                        </div>
                        {errorId && (
                            <p style={{ marginTop: '1rem', fontSize: '0.75rem', color: '#9ca3af' }}>
                                Код ошибки: <span style={{ fontFamily: 'monospace' }}>{errorId}</span>
                            </p>
                        )}
                    </div>
                </div>
            </body>
        </html>
    )
}
