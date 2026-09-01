import { messageForCode } from '@/shared/i18n'

/**
 * Distinguishes "the request never reached the server" from "the server
 * answered with a failure".
 *
 * `fetch` rejects with a TypeError when the network is unavailable, and
 * resolves normally for a 500. Treating both the same way is why a working
 * connection to a broken server used to tell the user to check their internet.
 */

export class NetworkError extends Error {
    readonly kind = 'network' as const

    constructor(cause?: unknown) {
        super('Не удалось связаться с сервером')
        this.name = 'NetworkError'
        this.cause = cause
    }
}

export class ApiError extends Error {
    readonly kind = 'api' as const
    readonly status: number
    readonly data: unknown
    /** Present when the server supplied one; shown to the user for support. */
    readonly errorId?: string

    constructor(status: number, data: unknown, errorId?: string) {
        super(`API request failed with status ${status}`)
        this.name = 'ApiError'
        this.status = status
        this.data = data
        this.errorId = errorId
    }
}

export function isNetworkError(error: unknown): error is NetworkError {
    return error instanceof NetworkError
}

export function isApiError(error: unknown): error is ApiError {
    return error instanceof ApiError
}

/** Message to show the user, chosen by failure kind rather than by guesswork. */
export function messageFor(error: unknown): string {
    if (isNetworkError(error)) {
        return 'Нет связи с сервером. Проверьте интернет-соединение и попробуйте снова.'
    }
    if (isApiError(error)) {
        // The code first: the server names what happened, and this side decides
        // how to say it. Falling back to the server's own sentence keeps the
        // handlers that have not been migrated working.
        const body = error.data as { code?: string; message?: string } | undefined
        if (body?.code) {
            const translated = messageForCode(body.code)
            if (translated) return translated

            // A code this client does not know is a dictionary that has fallen
            // behind the API — worth seeing in the logs rather than silently
            // becoming "something went wrong".
            console.warn(`[i18n] no message for error code "${body.code}"`)
            if (body.message) return body.message
        }
        if (error.status >= 500) {
            return 'Сервис временно недоступен. Мы уже разбираемся — попробуйте через минуту.'
        }
        if (error.status === 429) {
            return 'Слишком много запросов. Подождите немного и попробуйте снова.'
        }
        if (error.status === 403) {
            return 'Недостаточно прав для этого действия.'
        }
        if (error.status === 404) {
            return 'Запрошенные данные не найдены.'
        }
    }
    return 'Что-то пошло не так. Попробуйте повторить.'
}
