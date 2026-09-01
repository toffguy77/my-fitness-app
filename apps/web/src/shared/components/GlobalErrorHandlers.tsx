'use client'

import { useEffect } from 'react'
import { reportError } from '../errors/reportError'

/**
 * Sends errors React never sees — thrown outside the render tree, and rejected
 * promises with no handler.
 *
 * Without this, a client-side failure was visible only to the user who hit it.
 * Reporting is throttled per fingerprint inside reportError, so a loop cannot
 * flood the log endpoint.
 */
export function GlobalErrorHandlers() {
    useEffect(() => {
        const onError = (event: ErrorEvent) => {
            const error = event.error instanceof Error ? event.error : new Error(event.message)
            reportError(error, {
                source: 'window.onerror',
                filename: event.filename,
                line: event.lineno,
            })
        }

        const onRejection = (event: PromiseRejectionEvent) => {
            const reason = event.reason
            const error = reason instanceof Error ? reason : new Error(String(reason))
            reportError(error, { source: 'unhandledrejection' })
        }

        window.addEventListener('error', onError)
        window.addEventListener('unhandledrejection', onRejection)
        return () => {
            window.removeEventListener('error', onError)
            window.removeEventListener('unhandledrejection', onRejection)
        }
    }, [])

    return null
}
