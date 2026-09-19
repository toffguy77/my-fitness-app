import { ApiError, NetworkError, isApiError, isNetworkError, messageFor, messageForOr } from '../apiErrors'

describe('api error classification', () => {
    // Telling a user with working internet to "check the connection" because
    // the server returned 500 is the behaviour this replaces.
    it('separates a missing connection from a failing server', () => {
        expect(isNetworkError(new NetworkError())).toBe(true)
        expect(isNetworkError(new ApiError(500, {}))).toBe(false)
        expect(isApiError(new ApiError(500, {}))).toBe(true)
    })

    it('offers a connection message only for transport failures', () => {
        expect(messageFor(new NetworkError())).toMatch(/интернет-соединение/)
        expect(messageFor(new ApiError(500, {}))).not.toMatch(/интернет-соединение/)
        expect(messageFor(new ApiError(500, {}))).toMatch(/временно недоступен/)
    })

    it('maps client statuses to their own messages', () => {
        expect(messageFor(new ApiError(403, {}))).toMatch(/прав/)
        expect(messageFor(new ApiError(404, {}))).toMatch(/не найдены/)
        expect(messageFor(new ApiError(429, {}))).toMatch(/Слишком много/)
    })

    it('carries a server-supplied error id when present', () => {
        expect(new ApiError(500, {}, 'ABCD-2345').errorId).toBe('ABCD-2345')
    })
})

describe('messageForOr', () => {
    // The whole point of the code the server sends: the refusal it explained
    // is what the person reads, not the caller's stand-in sentence.
    it('prefers the reason the server gave over the caller’s fallback', () => {
        const refused = new ApiError(409, { code: 'token_expired', message: 'истёк' })

        expect(messageForOr(refused, 'Не удалось сохранить')).toBe('Срок действия ссылки истёк')
    })

    it('says the connection is gone rather than the caller’s fallback', () => {
        expect(messageForOr(new NetworkError(), 'Не удалось сохранить')).toMatch(/интернет-соединение/)
    })

    // Nothing was explained, so there is nothing to repeat: a bug in the
    // component, or a rejected promise carrying a bare Error.
    it('keeps the caller’s own sentence when nothing explained the failure', () => {
        expect(messageForOr(new Error('boom'), 'Не удалось сохранить')).toBe('Не удалось сохранить')
        expect(messageForOr(undefined, 'Не удалось сохранить')).toBe('Не удалось сохранить')
    })
})
