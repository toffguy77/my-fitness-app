/**
 * Заголовки безопасности, которые ставит промежуточный слой.
 *
 * Проверка появилась вместе с HSTS: без него первый переход по ссылке на
 * http успевал уйти в сеть открытым — вместе с cookie сессии, если она уже
 * была. Заголовок ставится только по https: по http браузер его игнорирует,
 * а на стенде разработки он сделал бы localhost недоступным по http на год
 * вперёд, включая чужие проекты на том же адресе.
 */
import { applySecurityHeaders } from '../middleware'

function headersFor(secure: boolean): Headers {
    const headers = new Headers()
    applySecurityHeaders(headers, secure)
    return headers
}

describe('заголовки безопасности', () => {
    it('по https ставит HSTS на год и на поддомены', () => {
        const value = headersFor(true).get('Strict-Transport-Security')

        expect(value).toBe('max-age=31536000; includeSubDomains')
    })

    it('по http не ставит HSTS: браузер его там игнорирует, а стенд бы сломал', () => {
        expect(headersFor(false).get('Strict-Transport-Security')).toBeNull()
    })

    it('прочие заголовки на месте в обоих случаях', () => {
        for (const secure of [true, false]) {
            const h = headersFor(secure)
            expect(h.get('X-Content-Type-Options')).toBe('nosniff')
            expect(h.get('X-Frame-Options')).toBe('DENY')
            expect(h.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
        }
    })
})
