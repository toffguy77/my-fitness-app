/**
 * One mapping from a failed request to something a person can read.
 *
 * Three stores — the food tracker, the dashboard and notifications — each
 * carried their own copy of this, identical apart from the dictionary prefix
 * and the noun in "not found". The copies had drifted: a 403 in the tracker
 * came back as "Произошла ошибка" and a 429 was unhandled everywhere except
 * the dashboard, so the same server answer read differently depending on which
 * screen the person happened to be on.
 *
 * The only genuine difference between them is what was not found, so that is
 * the only thing a caller passes.
 */

import { t } from '@/shared/i18n'
import { isApiError } from './apiErrors'

export type ApiErrorCode =
    | 'UNAUTHORIZED'
    | 'FORBIDDEN'
    | 'NOT_FOUND'
    | 'VALIDATION_ERROR'
    | 'TIMEOUT'
    | 'RATE_LIMITED'
    | 'NETWORK_ERROR'
    | 'SERVER_ERROR'
    | 'UNKNOWN'

export interface MappedApiError {
    code: ApiErrorCode
    message: string
    /** Whether trying the same request again could plausibly work. */
    retryable: boolean
}

function isOnline(): boolean {
    return typeof navigator === 'undefined' || navigator.onLine !== false
}

export function mapApiError(
    error: unknown,
    options: { notFound?: string } = {},
): MappedApiError {
    // Offline first: every status below assumes the request reached a server.
    if (!isOnline()) {
        return { code: 'NETWORK_ERROR', message: t('apiErrors.offline'), retryable: true }
    }

    // `ApiError` first, the legacy `response` shape second.
    //
    // `api-client` attaches `error.response = { status, data }` to the ApiError
    // it throws, for callers written against that shape, so reading only the
    // legacy shape worked — until an `ApiError` arrived from anywhere else. Then
    // every status below was skipped and a 403 came back as UNKNOWN, which is
    // what the store shows as "что-то пошло не так".
    const legacy = error as { response?: { status?: number; data?: { message?: string } }; message?: string }
    const body = isApiError(error)
        ? (error.data as { message?: string } | undefined)
        : legacy?.response?.data
    const status = isApiError(error) ? error.status : legacy?.response?.status
    // The client's own `ApiError.message` is "API request failed with status
    // 400" — no use to a reader, so it is not offered as the server's text.
    const serverMessage = body?.message || (isApiError(error) ? undefined : legacy?.message)

    switch (status) {
        case 401:
            return { code: 'UNAUTHORIZED', message: t('apiErrors.unauthorized'), retryable: false }
        case 403:
            return { code: 'FORBIDDEN', message: t('apiErrors.forbidden'), retryable: false }
        case 404:
            return {
                code: 'NOT_FOUND',
                message: options.notFound ?? t('apiErrors.notFound'),
                retryable: false,
            }
        case 400:
            // The server's own text is preferred here and nowhere else: a
            // validation failure is the one case where it says something
            // specific enough to act on.
            return {
                code: 'VALIDATION_ERROR',
                message: serverMessage || t('apiErrors.badRequest'),
                retryable: false,
            }
        case 408:
            return { code: 'TIMEOUT', message: t('apiErrors.timeout'), retryable: true }
        case 429:
            return { code: 'RATE_LIMITED', message: t('apiErrors.tooManyRequests'), retryable: true }
        case 500:
        case 502:
        case 503:
        case 504:
            return { code: 'SERVER_ERROR', message: t('apiErrors.unavailable'), retryable: true }
    }

    // A failure with no status at all: the request never completed.
    //
    // Both a TypeError and a matching message count. fetch rejects with a
    // TypeError whose text differs by browser — "Failed to fetch" in Chrome,
    // "NetworkError when attempting to fetch resource" in Firefox, and plain
    // "Load failed" in Safari, which matches neither word. Two of the three
    // copies of this mapping tested the message only, so a Safari user who
    // lost their connection was told something had gone wrong on the server.
    const text = (error as { message?: string })?.message ?? ''
    if (
        error instanceof TypeError ||
        text.includes('fetch') ||
        text.includes('network') ||
        text.includes('Load failed')
    ) {
        return { code: 'NETWORK_ERROR', message: t('apiErrors.network'), retryable: true }
    }

    return { code: 'UNKNOWN', message: t('apiErrors.unknown'), retryable: true }
}
