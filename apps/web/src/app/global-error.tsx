'use client'

import { useEffect, useMemo, type CSSProperties } from 'react'
import { generateErrorId } from '@/shared/errors/errorId'
import { reportError } from '@/shared/errors/reportError'
import { values } from '@burcev/design-tokens'

// global-error заменяет весь документ, и globals.css здесь может не загрузиться:
// цвета берутся развёрнутыми значениями светлой темы, а не CSS-переменными.
const ui = values.light

// Кнопка-таблетка дизайн-системы (Button size="lg"): 48 px высоты — цель
// нажатия, которой не нужны стили страницы.
const pill: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '3rem',
    padding: '0 1.5rem',
    borderRadius: '9999px',
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'pointer',
    boxSizing: 'border-box',
}

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
    // A new id for a new error: the dependency is the error's identity, not
    // anything the callback reads, which is why the rule calls it unnecessary.
    // A second failure inside the same boundary is a separate incident and gets
    // its own id to report.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `error` is the key, deliberately
    const errorId = useMemo(() => generateErrorId(), [error])

    useEffect(() => {
        reportError(error, { source: 'global-error', errorId, digest: error.digest })
    }, [error, errorId])

    return (
        <html lang="ru">
            <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: ui['color.bg.canvas'] }}>
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
                        <h1 style={{ fontSize: '1.25rem', color: ui['color.fg.default'] }}>Приложение не смогло загрузиться</h1>
                        <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: ui['color.fg.muted'] }}>
                            Произошла ошибка, из-за которой страница не открылась. Попробуйте ещё раз.
                        </p>
                        <div style={{ marginTop: '1.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'center' }}>
                            <button
                                type="button"
                                onClick={reset}
                                style={{ ...pill, background: ui['color.primary.default'], color: ui['color.primary.fg'], border: 0 }}
                            >
                                Повторить
                            </button>
                            {/* eslint-disable-next-line @next/next/no-html-link-for-pages --
                                global-error replaces the entire document, including the router,
                                so navigation here must be a plain full-page load. */}
                            <a
                                href="/"
                                style={{ ...pill, color: ui['color.fg.default'], border: `1.5px solid ${ui['color.line.strong']}`, textDecoration: 'none' }}
                            >
                                На главную
                            </a>
                        </div>
                        {errorId && (
                            <p style={{ marginTop: '1rem', fontSize: '0.75rem', color: ui['color.fg.subtle'] }}>
                                Код ошибки: <span style={{ fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums' }}>{errorId}</span>
                            </p>
                        )}
                    </div>
                </div>
            </body>
        </html>
    )
}
