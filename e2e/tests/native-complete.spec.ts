import { createHash, randomBytes } from 'node:crypto'
import { test, expect } from '../fixtures/session'

/**
 * Возврат входа в iOS-приложение (ios-native-session).
 *
 * Вход через Яндекс, начатый приложением (client=ios и PKCE-вызов), кончается
 * не сессией в браузере, а переходом на /auth/native-complete?code=… —
 * universal link, который перехватывает приложение. Если приложения нет,
 * человек видит эту страницу: «Откройте приложение Взвешено» и вход на сайте.
 *
 * Приложение здесь изображает сам тест: шлёт verifier и pending_token на
 * нативные пути и проверяет, что сессия приходит в теле, а не в cookie.
 * Яндекс — заглушка scripts/oauth-stub.mjs, как в oauth-registration.spec.ts.
 */

test.use({ role: undefined })

function base64url(buffer: Buffer): string {
    return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

test.describe('Возврат входа в приложение', () => {
    test('без приложения страница просит открыть его и предлагает вход на сайте', async ({ page }) => {
        await page.goto('/auth/native-complete?code=whatever')
        await expect(page.getByRole('heading', { name: 'Откройте приложение Взвешено' })).toBeVisible({
            timeout: 15000,
        })
        await page.getByRole('link', { name: 'Войти на сайте' }).click()
        await expect(page).toHaveURL(/\/auth(\?|$)/)
    })

    test('вход через Яндекс из приложения отдаёт код, а сессию — только в теле', async ({
        page,
        context,
        baseURL,
    }) => {
        const verifier = base64url(randomBytes(32))
        const challenge = base64url(createHash('sha256').update(verifier).digest())
        const email = `e2e-native-${Date.now()}-${Math.floor(Math.random() * 100000)}@burcev.test`

        const refused = await context.request.get(`${baseURL}/api/v1/auth/oauth/yandex?client=ios`, {
            maxRedirects: 0,
        })
        expect(refused.status(), 'client=ios без app_challenge начал поток').toBe(400)

        const start = await context.request.get(
            `${baseURL}/api/v1/auth/oauth/yandex?client=ios&app_challenge=${challenge}`,
            { maxRedirects: 0 },
        )
        expect(start.status(), `старт: ${await start.text()}`).toBe(302)
        const authorize = new URL(start.headers()['location'])
        authorize.searchParams.set('login_hint', email)
        await page.goto(authorize.toString())

        await expect(page.getByRole('heading', { name: 'Откройте приложение Взвешено' })).toBeVisible({
            timeout: 15000,
        })
        const landed = new URL(page.url())
        expect(landed.pathname).toBe('/auth/native-complete')
        const code = landed.searchParams.get('code')
        expect(code, 'в адресе возврата нет кода').toBeTruthy()

        const cookies = await context.cookies()
        expect(cookies.find((c) => c.name === 'refresh_token'), 'колбэк поставил refresh-cookie').toBeUndefined()

        // Чужой verifier сжигает код.
        const stolen = await page.request.post(`${baseURL}/api/v1/auth/native/oauth/exchange`, {
            data: { code, code_verifier: base64url(randomBytes(32)) },
        })
        expect(stolen.status()).toBe(401)
        expect((await stolen.json()).code).toBe('token_invalid')

        // Новый код для настоящего обмена.
        const again = await context.request.get(
            `${baseURL}/api/v1/auth/oauth/yandex?client=ios&app_challenge=${challenge}`,
            { maxRedirects: 0 },
        )
        const authorizeAgain = new URL(again.headers()['location'])
        authorizeAgain.searchParams.set('login_hint', email)
        await page.goto(authorizeAgain.toString())
        await expect(page).toHaveURL(/\/auth\/native-complete\?code=/, { timeout: 15000 })
        const freshCode = new URL(page.url()).searchParams.get('code')

        const exchange = await page.request.post(`${baseURL}/api/v1/auth/native/oauth/exchange`, {
            data: { code: freshCode, code_verifier: verifier, device_name: 'iPhone 15' },
        })
        expect(exchange.status(), await exchange.text()).toBe(200)
        const pending = (await exchange.json()).data
        expect(pending.status).toBe('needs_consents')
        expect(pending.pending_token).toBeTruthy()

        const consents = await page.request.post(`${baseURL}/api/v1/auth/native/consents`, {
            data: {
                pending_token: pending.pending_token,
                device_name: 'iPhone 15',
                consents: { terms_of_service: true, privacy_policy: true, data_processing: true },
            },
        })
        expect(consents.status(), await consents.text()).toBe(200)
        expect(consents.headers()['set-cookie'] ?? '').not.toContain('refresh_token')
        const session = (await consents.json()).data
        expect(session.created).toBe(true)
        expect(session.access_token).toBeTruthy()
        expect(session.refresh_token).toBeTruthy()
        expect(session.refresh_expires_in).toBeGreaterThan(89 * 24 * 3600)
    })
})
