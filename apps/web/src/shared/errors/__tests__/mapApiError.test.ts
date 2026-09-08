import { mapApiError } from '../mapApiError'

describe('mapApiError', () => {
    const online = (value: boolean) =>
        Object.defineProperty(navigator, 'onLine', { value, configurable: true })

    beforeEach(() => online(true))

    it('reports being offline before looking at any status', () => {
        online(false)
        expect(mapApiError({ response: { status: 500 } }).code).toBe('NETWORK_ERROR')
    })

    it.each([
        [401, 'UNAUTHORIZED'],
        [403, 'FORBIDDEN'],
        [404, 'NOT_FOUND'],
        [400, 'VALIDATION_ERROR'],
        [408, 'TIMEOUT'],
        [429, 'RATE_LIMITED'],
        [500, 'SERVER_ERROR'],
        [502, 'SERVER_ERROR'],
        [503, 'SERVER_ERROR'],
        [504, 'SERVER_ERROR'],
    ])('maps %i to %s', (status, code) => {
        expect(mapApiError({ response: { status } }).code).toBe(code)
    })

    it('lets the caller name what was not found', () => {
        expect(mapApiError({ response: { status: 404 } }, { notFound: 'Запись не найдена' }).message)
            .toBe('Запись не найдена')
    })

    it('prefers the server’s own text for a validation failure', () => {
        expect(mapApiError({ response: { status: 400, data: { message: 'Вес больше 500 кг' } } }).message)
            .toBe('Вес больше 500 кг')
    })

    // fetch rejects with a TypeError whose wording differs by browser. Safari
    // says only "Load failed", which two of the three copies of this mapping
    // did not match — a Safari user who lost their connection was told the
    // server had a problem.
    it.each([
        ['Failed to fetch'],
        ['NetworkError when attempting to fetch resource'],
        ['Load failed'],
    ])('treats a fetch rejection as a network error: %s', (message) => {
        expect(mapApiError(new TypeError(message)).code).toBe('NETWORK_ERROR')
    })

    it('does not claim to know what an unrecognised failure was', () => {
        expect(mapApiError(new Error('что-то пошло не так')).code).toBe('UNKNOWN')
    })

    it('says which failures are worth retrying', () => {
        expect(mapApiError({ response: { status: 503 } }).retryable).toBe(true)
        expect(mapApiError({ response: { status: 403 } }).retryable).toBe(false)
    })
})
