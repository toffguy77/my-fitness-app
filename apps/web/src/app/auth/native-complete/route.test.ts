/** @jest-environment node */
import { GET } from './route'

describe('/auth/native-complete', () => {
    it('asks to open the app and offers the web sign-in', async () => {
        const response = GET()
        const html = await response.text()
        expect(html).toContain('Откройте приложение Взвешено')
        expect(html).toContain('<a href="/auth">Войти на сайте</a>')
    })

    it('keeps the one-time code in the address to itself', () => {
        const response = GET()
        expect(response.headers.get('referrer-policy')).toBe('no-referrer')
        expect(response.headers.get('cache-control')).toBe('no-store')
        expect(response.headers.get('content-security-policy')).toContain("default-src 'none'")
        expect(response.headers.get('x-robots-tag')).toBe('noindex')
    })

    it('runs no scripts and loads nothing external', async () => {
        const html = await GET().text()
        expect(html).not.toMatch(/<script|<img|<link|https?:\/\//i)
    })
})
