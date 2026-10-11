/** @jest-environment node */
import { GET } from './route'

// Адрес с одноразовым кодом входа не должен уйти третьей стороне.
describe('/auth/app-complete', () => {
    it('loads nothing external and leaks no referrer', async () => {
        const response = GET()
        expect(response.headers.get('referrer-policy')).toBe('no-referrer')
        expect(response.headers.get('cache-control')).toBe('no-store')
        expect(response.headers.get('content-security-policy')).toContain("default-src 'none'")
        const html = await response.text()
        expect(html).not.toMatch(/<script|<img|<link|https?:\/\//i)
    })
})
