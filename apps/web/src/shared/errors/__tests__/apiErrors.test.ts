import { ApiError, NetworkError, isApiError, isNetworkError, messageFor } from '../apiErrors'

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
