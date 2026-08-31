import { logger } from '../utils/logger'
import { generateErrorId } from './errorId'

/**
 * Sends an error to the server exactly once per fingerprint per window.
 *
 * A component that throws on every render would otherwise flood our own log
 * endpoint — a self-inflicted denial of service. Repeats are counted, not sent.
 */
const REPORTS_PER_FINGERPRINT = 3
const WINDOW_MS = 60_000

interface Seen {
    count: number
    firstSeen: number
}

const seen = new Map<string, Seen>()

function fingerprint(error: Error): string {
    const firstFrame = (error.stack ?? '').split('\n')[1]?.trim() ?? ''
    return `${error.name}:${error.message}:${firstFrame}`
}

export interface ReportContext {
    /** Where the error surfaced: an error boundary, a route segment, a global handler. */
    source: string
    [key: string]: unknown
}

/** Reports an error and returns the id shown to the user. */
export function reportError(error: Error, context: ReportContext): string {
    const errorId = generateErrorId()
    const key = fingerprint(error)
    const now = Date.now()

    const previous = seen.get(key)
    if (previous && now - previous.firstSeen < WINDOW_MS) {
        previous.count += 1
        if (previous.count > REPORTS_PER_FINGERPRINT) {
            return errorId
        }
    } else {
        seen.set(key, { count: 1, firstSeen: now })
    }

    try {
        logger.error(error.message, error, {
            errorId,
            appVersion: process.env.NEXT_PUBLIC_APP_VERSION,
            path: typeof window !== 'undefined' ? window.location.pathname : undefined,
            repeatCount: seen.get(key)?.count ?? 1,
            ...context,
        })
    } catch {
        // Reporting must never be the reason a page fails to render.
    }

    return errorId
}

/** Test seam: forget throttling state between cases. */
export function resetErrorReporting(): void {
    seen.clear()
}
